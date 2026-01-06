import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// GET - Verificar si existe respaldo para el año/temporada especificado
router.get('/verificar-respaldo-sudamericana', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const temporada = parseInt(req.query.temporada) || new Date().getFullYear();
    
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM rankings_historicos
      WHERE anio = $1 AND competencia = 'Copa Sudamericana'
    `, [temporada]);

    const existe = parseInt(result.rows[0].count) > 0;

    res.json({ 
      existe,
      anio: temporada,
      registros: parseInt(result.rows[0].count)
    });
  } catch (error) {
    console.error('Error verificando respaldo Sudamericana:', error);
    res.status(500).json({ error: 'Error verificando respaldo' });
  }
});

// GET - Obtener estadísticas de Sudamericana actual
router.get('/estadisticas-sudamericana', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const [jornadas, partidos, pronosticos, equipos] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM sudamericana_jornadas'),
      pool.query('SELECT COUNT(*) as count FROM sudamericana_partidos'),
      pool.query('SELECT COUNT(*) as count FROM sudamericana_pronosticos'),
      pool.query('SELECT COUNT(*) as count FROM sudamericana_equipos')
    ]);

    res.json({
      jornadas: parseInt(jornadas.rows[0].count),
      partidos: parseInt(partidos.rows[0].count),
      pronosticos: parseInt(pronosticos.rows[0].count),
      equipos: parseInt(equipos.rows[0].count)
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas Sudamericana:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// DELETE - Eliminar todos los datos de Sudamericana (requiere respaldo previo)
router.delete('/eliminar-datos-sudamericana', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const temporada = parseInt(req.query.temporada) || new Date().getFullYear();

    console.log(`🗑️ Iniciando eliminación de datos de Copa Sudamericana (temporada ${temporada})...`);

    // Verificar qué tablas existen
    const tablasExistentes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'sudamericana_pronosticos',
        'sudamericana_puntos_clasificacion',
        'sudamericana_partidos',
        'sudamericana_jornadas',
        'sudamericana_equipos'
      )
    `);
    
    const tablas = new Set(tablasExistentes.rows.map(r => r.table_name));

    // 1. Eliminar pronósticos (depende de partidos y jornadas)
    let pronosticosResult = { rowCount: 0 };
    if (tablas.has('sudamericana_pronosticos')) {
      pronosticosResult = await client.query('DELETE FROM sudamericana_pronosticos RETURNING id');
      console.log(`✅ Eliminados ${pronosticosResult.rowCount} pronósticos`);
    }

    // 2. Eliminar puntos clasificación
    let puntosClasifResult = { rowCount: 0 };
    if (tablas.has('sudamericana_puntos_clasificacion')) {
      puntosClasifResult = await client.query('DELETE FROM sudamericana_puntos_clasificacion RETURNING id');
      console.log(`✅ Eliminados ${puntosClasifResult.rowCount} puntos de clasificación`);
    }

    // 3. Eliminar partidos
    let partidosResult = { rowCount: 0 };
    if (tablas.has('sudamericana_partidos')) {
      partidosResult = await client.query('DELETE FROM sudamericana_partidos RETURNING id');
      console.log(`✅ Eliminados ${partidosResult.rowCount} partidos`);
    }

    // 4. Eliminar equipos
    let equiposResult = { rowCount: 0 };
    if (tablas.has('sudamericana_equipos')) {
      equiposResult = await client.query('DELETE FROM sudamericana_equipos RETURNING id');
      console.log(`✅ Eliminados ${equiposResult.rowCount} equipos`);
    }

    // 5. Resetear jornadas (NO eliminar, solo resetear estado)
    let jornadasResult = { rowCount: 0 };
    if (tablas.has('sudamericana_jornadas')) {
      jornadasResult = await client.query(`
        UPDATE sudamericana_jornadas 
        SET cerrada = false, activa = false
        WHERE numero >= 1
        RETURNING id
      `);
      console.log(`✅ Reseteadas ${jornadasResult.rowCount} jornadas`);
    }

    await client.query('COMMIT');

    console.log(`✅ Eliminación completada exitosamente`);

    res.json({ 
      mensaje: 'Datos de Copa Sudamericana eliminados exitosamente',
      pronosticosEliminados: pronosticosResult.rowCount,
      puntosClasificacionEliminados: puntosClasifResult.rowCount,
      partidosEliminados: partidosResult.rowCount,
      equiposEliminados: equiposResult.rowCount,
      jornadasReseteadas: jornadasResult.rowCount,
      temporada
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error eliminando datos de Sudamericana:', error);
    res.status(500).json({ error: 'Error eliminando datos' });
  } finally {
    client.release();
  }
});

// POST - Crear respaldo de ganadores en rankings históricos
router.post('/crear-respaldo-sudamericana', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const temporada = parseInt(req.body.temporada) || new Date().getFullYear();

    console.log(`💾 Creando respaldo de Copa Sudamericana ${temporada}...`);

    // Verificar si ya existe respaldo
    const existeRespaldo = await client.query(`
      SELECT COUNT(*) as count
      FROM rankings_historicos
      WHERE anio = $1 AND competencia = 'Copa Sudamericana'
    `, [temporada]);

    if (parseInt(existeRespaldo.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Ya existe un respaldo para Copa Sudamericana ${temporada}. Elimínalo primero si deseas crear uno nuevo.` 
      });
    }

    // Obtener el ranking acumulado final (J10)
    const rankingFinal = await client.query(`
      SELECT 
        u.id as usuario_id,
        u.nombre,
        u.foto_perfil,
        COALESCE(SUM(p.puntos), 0) + COALESCE(SUM(pc.puntos), 0) as puntaje_total
      FROM usuarios u
      LEFT JOIN sudamericana_pronosticos p ON p.usuario_id = u.id
      LEFT JOIN sudamericana_puntos_clasificacion pc ON pc.usuario_id = u.id
      WHERE u.activo = true
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntaje_total DESC
    `);

    if (rankingFinal.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No hay datos de ranking para respaldar' });
    }

    // Guardar en rankings_historicos
    let insertados = 0;
    for (const [index, jugador] of rankingFinal.rows.entries()) {
      await client.query(`
        INSERT INTO rankings_historicos 
        (usuario_id, nombre_usuario, foto_perfil, competencia, anio, posicion, puntaje)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        jugador.usuario_id,
        jugador.nombre,
        jugador.foto_perfil,
        'Copa Sudamericana',
        temporada,
        index + 1,
        parseInt(jugador.puntaje_total)
      ]);
      insertados++;
    }

    await client.query('COMMIT');

    console.log(`✅ Respaldo creado: ${insertados} registros guardados`);

    res.json({ 
      mensaje: `Respaldo de Copa Sudamericana ${temporada} creado exitosamente`,
      registrosGuardados: insertados,
      ganador: rankingFinal.rows[0]?.nombre || 'N/A',
      puntajeGanador: parseInt(rankingFinal.rows[0]?.puntaje_total || 0)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando respaldo de Sudamericana:', error);
    res.status(500).json({ error: 'Error creando respaldo' });
  } finally {
    client.release();
  }
});

export default router;
