import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// GET - Verificar si existe respaldo para el año/temporada especificado
router.get('/verificar-respaldo-torneo', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const temporada = parseInt(req.query.temporada) || new Date().getFullYear();
    
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM rankings_historicos
      WHERE anio = $1 AND competencia = 'Torneo Nacional'
    `, [temporada]);

    const existe = parseInt(result.rows[0].count) > 0;

    res.json({ 
      existe,
      anio: temporada,
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

// DELETE - Eliminar todos los datos del torneo nacional (requiere respaldo previo)
router.delete('/eliminar-datos-torneo', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const temporada = parseInt(req.query.temporada) || new Date().getFullYear();

    console.log(`🗑️ Iniciando eliminación de datos del Torneo Nacional (temporada ${temporada})...`);

    // Verificar qué tablas existen
    const tablasExistentes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('pronosticos', 'ganadores_jornada', 'ganadores_acumulado', 'predicciones_final', 'partidos', 'jornadas')
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

    // 3. Eliminar ganadores acumulados (TOP 3)
    let ganadoresAcumuladoResult = { rowCount: 0 };
    if (tablas.has('ganadores_acumulado')) {
      ganadoresAcumuladoResult = await client.query('DELETE FROM ganadores_acumulado RETURNING id');
      console.log(`✅ Eliminados ${ganadoresAcumuladoResult.rowCount} ganadores acumulados`);
    }

    // 4. Eliminar predicciones de cuadro final
    let prediccionesResult = { rowCount: 0 };
    if (tablas.has('predicciones_final')) {
      prediccionesResult = await client.query('DELETE FROM predicciones_final RETURNING id');
      console.log(`✅ Eliminadas ${prediccionesResult.rowCount} predicciones finales`);
    } else {
      console.log('⚠️ Tabla predicciones_final no existe');
    }

    // 5. Eliminar partidos
    let partidosResult = { rowCount: 0 };
    if (tablas.has('partidos')) {
      partidosResult = await client.query('DELETE FROM partidos RETURNING id');
      console.log(`✅ Eliminados ${partidosResult.rowCount} partidos`);
    }

    // 6. Eliminar jornadas
    let jornadasResult = { rowCount: 0 };
    if (tablas.has('jornadas')) {
      jornadasResult = await client.query('DELETE FROM jornadas RETURNING id');
      console.log(`✅ Eliminadas ${jornadasResult.rowCount} jornadas`);
    }

    await client.query('COMMIT');

    const mensaje = `Datos del Torneo Nacional (temporada ${temporada}) eliminados exitosamente:\n\n` +
      `- Jornadas: ${jornadasResult.rowCount}\n` +
      `- Partidos: ${partidosResult.rowCount}\n` +
      `- Pronósticos: ${pronosticosResult.rowCount}\n` +
      `- Ganadores de jornada: ${ganadoresResult.rowCount}\n` +
      `- Ganadores acumulados: ${ganadoresAcumuladoResult.rowCount}\n` +
      `- Predicciones finales: ${prediccionesResult.rowCount}`;

    console.log('✅ Eliminación completada exitosamente');

    res.json({ 
      success: true,
      mensaje,
      eliminados: {
        jornadas: jornadasResult.rowCount,
        partidos: partidosResult.rowCount,
        pronosticos: pronosticosResult.rowCount,
        ganadores_jornada: ganadoresResult.rowCount,
        ganadores_acumulado: ganadoresAcumuladoResult.rowCount,
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
