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

    // Verificar que existe respaldo
    const anioActual = new Date().getFullYear();
    const respaldo = await client.query(`
      SELECT COUNT(*) as count
      FROM rankings_historicos
      WHERE anio = $1 AND competencia = 'Torneo Nacional'
    `, [anioActual]);

    if (parseInt(respaldo.rows[0].count) === 0) {
      throw new Error('No existe respaldo. Primero crea un respaldo de los ganadores.');
    }

    console.log('🗑️ Iniciando eliminación de datos del Torneo Nacional...');

    // 1. Eliminar pronósticos (depende de partidos y jornadas)
    const pronosticosResult = await client.query('DELETE FROM pronosticos RETURNING id');
    console.log(`✅ Eliminados ${pronosticosResult.rowCount} pronósticos`);

    // 2. Eliminar ganadores de jornada
    const ganadoresResult = await client.query('DELETE FROM ganadores_jornada RETURNING id');
    console.log(`✅ Eliminados ${ganadoresResult.rowCount} ganadores de jornada`);

    // 3. Eliminar predicciones de cuadro final (si existe la tabla)
    let prediccionesResult = { rowCount: 0 };
    try {
      prediccionesResult = await client.query('DELETE FROM predicciones_final RETURNING id');
      console.log(`✅ Eliminadas ${prediccionesResult.rowCount} predicciones finales`);
    } catch (error) {
      if (error.code === '42P01') {
        console.log('⚠️ Tabla predicciones_final no existe, continuando...');
      } else {
        throw error;
      }
    }

    // 4. Eliminar partidos
    const partidosResult = await client.query('DELETE FROM partidos RETURNING id');
    console.log(`✅ Eliminados ${partidosResult.rowCount} partidos`);

    // 5. Eliminar jornadas
    const jornadasResult = await client.query('DELETE FROM jornadas RETURNING id');
    console.log(`✅ Eliminadas ${jornadasResult.rowCount} jornadas`);

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
