import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// GET - Verificar si existe respaldo para el año/temporada especificado
router.get('/verificar-respaldo-mundial', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const temporada = parseInt(req.query.temporada) || new Date().getFullYear();
    
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM rankings_historicos
      WHERE anio = $1 AND competencia = 'Mundial'
    `, [temporada]);

    const existe = parseInt(result.rows[0].count) > 0;

    res.json({ 
      existe,
      anio: temporada,
      registros: parseInt(result.rows[0].count)
    });
  } catch (error) {
    console.error('Error verificando respaldo Mundial:', error);
    res.status(500).json({ error: 'Error verificando respaldo' });
  }
});

// GET - Obtener estadísticas de Mundial actual
router.get('/estadisticas-mundial', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const [jornadas, partidos, pronosticos, ganadores, equipos] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM mundial_jornadas'),
      pool.query('SELECT COUNT(*) as count FROM mundial_partidos'),
      pool.query('SELECT COUNT(*) as count FROM mundial_pronosticos'),
      pool.query('SELECT COUNT(*) as count FROM mundial_ganadores_jornada'),
      pool.query('SELECT COUNT(*) as count FROM mundial_equipos')
    ]);

    res.json({
      jornadas: parseInt(jornadas.rows[0].count),
      partidos: parseInt(partidos.rows[0].count),
      pronosticos: parseInt(pronosticos.rows[0].count),
      ganadores: parseInt(ganadores.rows[0].count),
      equipos: parseInt(equipos.rows[0].count)
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas Mundial:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// DELETE - Eliminar todos los datos de Mundial (requiere respaldo previo)
router.delete('/eliminar-datos-mundial', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const temporada = parseInt(req.query.temporada) || new Date().getFullYear();

    console.log(`🗑️ Iniciando eliminación de datos de Mundial (temporada ${temporada})...`);

    // Verificar qué tablas existen
    const tablasExistentes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'mundial_pronosticos',
        'mundial_ganadores_jornada', 
        'mundial_ganadores_acumulado',
        'mundial_puntos_clasificacion',
        'mundial_predicciones_campeon',
        'mundial_pronosticos_final_virtual',
        'mundial_partidos',
        'mundial_jornadas',
        'mundial_equipos'
      )
    `);
    
    const tablas = new Set(tablasExistentes.rows.map(r => r.table_name));

    // 1. Eliminar pronósticos
    let pronosticosResult = { rowCount: 0 };
    if (tablas.has('mundial_pronosticos')) {
      pronosticosResult = await client.query('DELETE FROM mundial_pronosticos RETURNING id');
      console.log(`✅ Eliminados ${pronosticosResult.rowCount} pronósticos`);
    }

    // 2. Eliminar ganadores de jornada
    let ganadoresResult = { rowCount: 0 };
    if (tablas.has('mundial_ganadores_jornada')) {
      ganadoresResult = await client.query('DELETE FROM mundial_ganadores_jornada RETURNING id');
      console.log(`✅ Eliminados ${ganadoresResult.rowCount} ganadores de jornada`);
    }

    // 3. Eliminar ganadores acumulados
    let ganadoresAcumResult = { rowCount: 0 };
    if (tablas.has('mundial_ganadores_acumulado')) {
      ganadoresAcumResult = await client.query('DELETE FROM mundial_ganadores_acumulado RETURNING id');
      console.log(`✅ Eliminados ${ganadoresAcumResult.rowCount} ganadores acumulados`);
    }

    // 4. Eliminar puntos de clasificación
    let puntosResult = { rowCount: 0 };
    if (tablas.has('mundial_puntos_clasificacion')) {
      puntosResult = await client.query('DELETE FROM mundial_puntos_clasificacion RETURNING id');
      console.log(`✅ Eliminados ${puntosResult.rowCount} puntos de clasificación`);
    }

    // 5. Eliminar predicciones de campeón
    let prediccionesResult = { rowCount: 0 };
    if (tablas.has('mundial_predicciones_campeon')) {
      prediccionesResult = await client.query('DELETE FROM mundial_predicciones_campeon RETURNING id');
      console.log(`✅ Eliminadas ${prediccionesResult.rowCount} predicciones de campeón`);
    }

    // 6. Eliminar pronósticos final virtual
    let pronosticosFinalResult = { rowCount: 0 };
    if (tablas.has('mundial_pronosticos_final_virtual')) {
      pronosticosFinalResult = await client.query('DELETE FROM mundial_pronosticos_final_virtual RETURNING id');
      console.log(`✅ Eliminados ${pronosticosFinalResult.rowCount} pronósticos de final virtual`);
    }

    // 7. Eliminar partidos
    let partidosResult = { rowCount: 0 };
    if (tablas.has('mundial_partidos')) {
      partidosResult = await client.query('DELETE FROM mundial_partidos RETURNING id');
      console.log(`✅ Eliminados ${partidosResult.rowCount} partidos`);
    }

    // 8. Eliminar jornadas
    let jornadasResult = { rowCount: 0 };
    if (tablas.has('mundial_jornadas')) {
      jornadasResult = await client.query('DELETE FROM mundial_jornadas RETURNING id');
      console.log(`✅ Eliminadas ${jornadasResult.rowCount} jornadas`);
    }

    // 9. Eliminar equipos
    let equiposResult = { rowCount: 0 };
    if (tablas.has('mundial_equipos')) {
      equiposResult = await client.query('DELETE FROM mundial_equipos RETURNING id');
      console.log(`✅ Eliminados ${equiposResult.rowCount} equipos`);
    }

    await client.query('COMMIT');

    const resumen = {
      mensaje: 'Datos del Mundial eliminados exitosamente',
      eliminados: {
        pronosticos: pronosticosResult.rowCount,
        ganadores_jornada: ganadoresResult.rowCount,
        ganadores_acumulado: ganadoresAcumResult.rowCount,
        puntos_clasificacion: puntosResult.rowCount,
        predicciones_campeon: prediccionesResult.rowCount,
        pronosticos_final_virtual: pronosticosFinalResult.rowCount,
        partidos: partidosResult.rowCount,
        jornadas: jornadasResult.rowCount,
        equipos: equiposResult.rowCount
      }
    };

    console.log('✅ Eliminación completada:', resumen);
    res.json(resumen);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error eliminando datos de Mundial:', error);
    res.status(500).json({ 
      error: 'Error eliminando datos de Mundial',
      details: error.message
    });
  } finally {
    client.release();
  }
});

export default router;
