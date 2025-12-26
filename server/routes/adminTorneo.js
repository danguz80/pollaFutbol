import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// GET - Verificar si existe respaldo para el año actual
router.get('/verificar-respaldo-torneo', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const anioActual = new Date().getFullYear();
    
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM rankings_historicos
      WHERE anio = $1 AND competencia = 'Torneo Nacional'
    `, [anioActual]);

    const existe = parseInt(result.rows[0].count) > 0;

    res.json({ 
      existe,
      anio: anioActual,
      registros: parseInt(result.rows[0].count)
    });
  } catch (error) {
    console.error('Error verificando respaldo:', error);
    res.status(500).json({ error: 'Error verificando respaldo' });
  }
});

// GET - Obtener estadísticas del torneo actual
router.get('/estadisticas-torneo', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const [jornadas, partidos, pronosticos, ganadores] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM jornadas'),
      pool.query('SELECT COUNT(*) as count FROM partidos'),
      pool.query('SELECT COUNT(*) as count FROM pronosticos'),
      pool.query('SELECT COUNT(*) as count FROM ganadores_jornada')
    ]);

    res.json({
      jornadas: parseInt(jornadas.rows[0].count),
      partidos: parseInt(partidos.rows[0].count),
      pronosticos: parseInt(pronosticos.rows[0].count),
      ganadores: parseInt(ganadores.rows[0].count)
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// DELETE - Eliminar todos los datos del torneo nacional (después de respaldo)
router.delete('/eliminar-datos-torneo', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const anioActual = new Date().getFullYear();

    console.log('💾 Creando respaldo automático de ganadores...');

    // PASO 1: CREAR RESPALDO AUTOMÁTICO DE GANADORES ANTES DE ELIMINAR
    // Respaldar ganadores de jornadas del Torneo Nacional
    const ganadoresJornadasNacional = await client.query(`
      SELECT
        $1 as anio,
        'Torneo Nacional' as competencia,
        'estandar' as tipo,
        j.numero::text as categoria,
        u.id as usuario_id,
        NULL as nombre_manual,
        ROW_NUMBER() OVER (PARTITION BY j.numero ORDER BY u.nombre) as posicion,
        0 as puntos
      FROM ganadores_jornada gj
      JOIN jornadas j ON gj.jornada_id = j.id
      JOIN usuarios u ON gj.jugador_id = u.id
    `, [anioActual]);

    // Insertar ganadores de jornada en rankings históricos
    for (const ganador of ganadoresJornadasNacional.rows) {
      await client.query(`
        INSERT INTO rankings_historicos 
          (anio, competencia, tipo, categoria, usuario_id, nombre_manual, posicion, puntos)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (anio, competencia, categoria, usuario_id, nombre_manual, posicion)
        DO UPDATE SET 
          puntos = EXCLUDED.puntos,
          actualizado_en = CURRENT_TIMESTAMP
      `, [ganador.anio, ganador.competencia, ganador.tipo, ganador.categoria, 
          ganador.usuario_id, ganador.nombre_manual, ganador.posicion, ganador.puntos]);
    }

    console.log(`✅ Respaldados ${ganadoresJornadasNacional.rows.length} ganadores de jornada`);

    // Respaldar ranking acumulado (Top 3)
    const rankingAcumulado = await client.query(`
      SELECT * FROM (
        SELECT 
          $1 as anio,
          'Torneo Nacional' as competencia,
          'mayor' as tipo,
          NULL as categoria,
          u.id as usuario_id,
          NULL as nombre_manual,
          ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(p.puntos), 0) DESC, u.nombre) as posicion,
          COALESCE(SUM(p.puntos), 0) as puntos
        FROM usuarios u
        LEFT JOIN pronosticos p ON u.id = p.usuario_id
        LEFT JOIN jornadas j ON p.jornada_id = j.id
        WHERE j.cerrada = true
        GROUP BY u.id
        HAVING COALESCE(SUM(p.puntos), 0) > 0
        ORDER BY puntos DESC, u.nombre
        LIMIT 3
      ) ranking
    `, [anioActual]);

    for (const ganador of rankingAcumulado.rows) {
      await client.query(`
        INSERT INTO rankings_historicos 
          (anio, competencia, tipo, categoria, usuario_id, nombre_manual, posicion, puntos)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (anio, competencia, tipo, categoria, usuario_id, nombre_manual, posicion)
        DO UPDATE SET 
          puntos = EXCLUDED.puntos,
          actualizado_en = CURRENT_TIMESTAMP
      `, [ganador.anio, ganador.competencia, ganador.tipo, ganador.categoria, 
          ganador.usuario_id, ganador.nombre_manual, ganador.posicion, ganador.puntos]);
    }

    console.log(`✅ Respaldados ${rankingAcumulado.rows.length} ganadores del ranking acumulado`);

    // PASO 2: AHORA SÍ ELIMINAR LOS DATOS
    console.log('🗑️ Iniciando eliminación de datos del Torneo Nacional...');

    // Verificar qué tablas existen
    const tablasExistentes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('pronosticos', 'ganadores_jornada', 'predicciones_final', 'partidos', 'jornadas')
    `);
    
    const tablas = new Set(tablasExistentes.rows.map(r => r.table_name));

    // 1. Eliminar pronósticos (depende de partidos y jornadas)
    let pronosticosResult = { rowCount: 0 };
    if (tablas.has('pronosticos')) {
      pronosticosResult = await client.query('DELETE FROM pronosticos RETURNING id');
      console.log(`✅ Eliminados ${pronosticosResult.rowCount} pronósticos`);
    }

    // 2. Eliminar ganadores de jornada
    let ganadoresResult = { rowCount: 0 };
    if (tablas.has('ganadores_jornada')) {
      ganadoresResult = await client.query('DELETE FROM ganadores_jornada RETURNING id');
      console.log(`✅ Eliminados ${ganadoresResult.rowCount} ganadores de jornada`);
    }

    // 3. Eliminar predicciones de cuadro final
    let prediccionesResult = { rowCount: 0 };
    if (tablas.has('predicciones_final')) {
      prediccionesResult = await client.query('DELETE FROM predicciones_final RETURNING id');
      console.log(`✅ Eliminadas ${prediccionesResult.rowCount} predicciones finales`);
    } else {
      console.log('⚠️ Tabla predicciones_final no existe');
    }

    // 4. Eliminar partidos
    let partidosResult = { rowCount: 0 };
    if (tablas.has('partidos')) {
      partidosResult = await client.query('DELETE FROM partidos RETURNING id');
      console.log(`✅ Eliminados ${partidosResult.rowCount} partidos`);
    }

    // 5. Eliminar jornadas
    let jornadasResult = { rowCount: 0 };
    if (tablas.has('jornadas')) {
      jornadasResult = await client.query('DELETE FROM jornadas RETURNING id');
      console.log(`✅ Eliminadas ${jornadasResult.rowCount} jornadas`);
    }

    await client.query('COMMIT');

    const mensaje = `Datos del Torneo Nacional eliminados exitosamente:\n\n` +
      `- Jornadas: ${jornadasResult.rowCount}\n` +
      `- Partidos: ${partidosResult.rowCount}\n` +
      `- Pronósticos: ${pronosticosResult.rowCount}\n` +
      `- Ganadores: ${ganadoresResult.rowCount}\n` +
      `- Predicciones finales: ${prediccionesResult.rowCount}\n\n` +
      `Los datos históricos se mantienen en Rankings Históricos.`;

    console.log('✅ Eliminación completada exitosamente');

    res.json({ 
      success: true,
      mensaje,
      eliminados: {
        jornadas: jornadasResult.rowCount,
        partidos: partidosResult.rowCount,
        pronosticos: pronosticosResult.rowCount,
        ganadores: ganadoresResult.rowCount,
        predicciones: prediccionesResult.rowCount
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error eliminando datos:', error);
    res.status(500).json({ 
      error: 'Error eliminando datos del torneo',
      detalles: error.message 
    });
  } finally {
    client.release();
  }
});

export default router;
