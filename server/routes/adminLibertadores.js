import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// GET - Verificar si existe respaldo para el año/temporada especificado
router.get('/verificar-respaldo-libertadores', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const temporada = parseInt(req.query.temporada) || new Date().getFullYear();
    
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM rankings_historicos
      WHERE anio = $1 AND competencia = 'Copa Libertadores'
    `, [temporada]);

    const existe = parseInt(result.rows[0].count) > 0;

    res.json({ 
      existe,
      anio: temporada,
      registros: parseInt(result.rows[0].count)
    });
  } catch (error) {
    console.error('Error verificando respaldo Libertadores:', error);
    res.status(500).json({ error: 'Error verificando respaldo' });
  }
});

// GET - Obtener estadísticas de Libertadores actual
router.get('/estadisticas-libertadores', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const [jornadas, partidos, pronosticos, ganadores, equipos] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM libertadores_jornadas'),
      pool.query('SELECT COUNT(*) as count FROM libertadores_partidos'),
      pool.query('SELECT COUNT(*) as count FROM libertadores_pronosticos'),
      pool.query('SELECT COUNT(*) as count FROM libertadores_ganadores_jornada'),
      pool.query('SELECT COUNT(*) as count FROM libertadores_equipos')
    ]);

    res.json({
      jornadas: parseInt(jornadas.rows[0].count),
      partidos: parseInt(partidos.rows[0].count),
      pronosticos: parseInt(pronosticos.rows[0].count),
      ganadores: parseInt(ganadores.rows[0].count),
      equipos: parseInt(equipos.rows[0].count)
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas Libertadores:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// DELETE - Eliminar todos los datos de Libertadores (requiere respaldo previo)
router.delete('/eliminar-datos-libertadores', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const temporada = parseInt(req.query.temporada) || new Date().getFullYear();

    console.log(`🗑️ Iniciando eliminación de datos de Copa Libertadores (temporada ${temporada})...`);

    // Verificar qué tablas existen
    const tablasExistentes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'libertadores_pronosticos',
        'libertadores_ganadores_jornada', 
        'libertadores_ganadores_acumulado',
        'libertadores_puntos_clasificacion',
        'libertadores_predicciones_campeon',
        'libertadores_partidos',
        'libertadores_jornadas',
        'libertadores_equipos'
      )
    `);
    
    const tablas = new Set(tablasExistentes.rows.map(r => r.table_name));

    // 1. Eliminar pronósticos (depende de partidos y jornadas)
    let pronosticosResult = { rowCount: 0 };
    if (tablas.has('libertadores_pronosticos')) {
      pronosticosResult = await client.query('DELETE FROM libertadores_pronosticos RETURNING id');
      console.log(`✅ Eliminados ${pronosticosResult.rowCount} pronósticos`);
    }

    // 2. Eliminar ganadores de jornada
    let ganadoresResult = { rowCount: 0 };
    if (tablas.has('libertadores_ganadores_jornada')) {
      ganadoresResult = await client.query('DELETE FROM libertadores_ganadores_jornada RETURNING id');
      console.log(`✅ Eliminados ${ganadoresResult.rowCount} ganadores de jornada`);
    }

    // 3. Eliminar ganadores acumulados
    let ganadoresAcumuladoResult = { rowCount: 0 };
    if (tablas.has('libertadores_ganadores_acumulado')) {
      ganadoresAcumuladoResult = await client.query('DELETE FROM libertadores_ganadores_acumulado RETURNING id');
      console.log(`✅ Eliminados ${ganadoresAcumuladoResult.rowCount} ganadores acumulados`);
    }

    // 4. Eliminar puntos de clasificación
    let puntosClasificacionResult = { rowCount: 0 };
    if (tablas.has('libertadores_puntos_clasificacion')) {
      puntosClasificacionResult = await client.query('DELETE FROM libertadores_puntos_clasificacion RETURNING id');
      console.log(`✅ Eliminados ${puntosClasificacionResult.rowCount} puntos de clasificación`);
    }

    // 5. Eliminar predicciones de campeón
    let prediccionesCampeonResult = { rowCount: 0 };
    if (tablas.has('libertadores_predicciones_campeon')) {
      prediccionesCampeonResult = await client.query('DELETE FROM libertadores_predicciones_campeon RETURNING id');
      console.log(`✅ Eliminadas ${prediccionesCampeonResult.rowCount} predicciones de campeón`);
    }

    // 6. Eliminar partidos
    let partidosResult = { rowCount: 0 };
    if (tablas.has('libertadores_partidos')) {
      partidosResult = await client.query('DELETE FROM libertadores_partidos RETURNING id');
      console.log(`✅ Eliminados ${partidosResult.rowCount} partidos`);
    }

    // 7. Eliminar jornadas
    let jornadasResult = { rowCount: 0 };
    if (tablas.has('libertadores_jornadas')) {
      jornadasResult = await client.query('DELETE FROM libertadores_jornadas RETURNING id');
      console.log(`✅ Eliminadas ${jornadasResult.rowCount} jornadas`);
    }

    // 8. Eliminar equipos
    let equiposResult = { rowCount: 0 };
    if (tablas.has('libertadores_equipos')) {
      equiposResult = await client.query('DELETE FROM libertadores_equipos RETURNING id');
      console.log(`✅ Eliminados ${equiposResult.rowCount} equipos`);
    }

    await client.query('COMMIT');

    const mensaje = `Datos de Copa Libertadores (temporada ${temporada}) eliminados exitosamente:\n\n` +
      `- Jornadas: ${jornadasResult.rowCount}\n` +
      `- Partidos: ${partidosResult.rowCount}\n` +
      `- Equipos: ${equiposResult.rowCount}\n` +
      `- Pronósticos: ${pronosticosResult.rowCount}\n` +
      `- Ganadores de jornada: ${ganadoresResult.rowCount}\n` +
      `- Ganadores acumulados: ${ganadoresAcumuladoResult.rowCount}\n` +
      `- Puntos clasificación: ${puntosClasificacionResult.rowCount}\n` +
      `- Predicciones campeón: ${prediccionesCampeonResult.rowCount}`;

    console.log('✅ Eliminación completada exitosamente');

    res.json({ 
      success: true,
      mensaje,
      eliminados: {
        jornadas: jornadasResult.rowCount,
        partidos: partidosResult.rowCount,
        equipos: equiposResult.rowCount,
        pronosticos: pronosticosResult.rowCount,
        ganadores_jornada: ganadoresResult.rowCount,
        ganadores_acumulado: ganadoresAcumuladoResult.rowCount,
        puntos_clasificacion: puntosClasificacionResult.rowCount,
        predicciones_campeon: prediccionesCampeonResult.rowCount
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error eliminando datos de Libertadores:', error);
    res.status(500).json({ 
      error: 'Error eliminando datos de Libertadores',
      detalles: error.message 
    });
  } finally {
    client.release();
  }
});

export default router;
