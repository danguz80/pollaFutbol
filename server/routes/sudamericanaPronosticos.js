import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

// GET - Obtener pronósticos de un usuario para una jornada específica
router.get('/jornada/:jornadaNumero/usuario/:usuarioId', verifyToken, async (req, res) => {
  try {
    const { jornadaNumero, usuarioId } = req.params;

    const result = await pool.query(`
      SELECT 
        p.id,
        p.partido_id,
        p.goles_local,
        p.goles_visita,
        p.puntos
      FROM sudamericana_pronosticos p
      INNER JOIN sudamericana_partidos pa ON pa.id = p.partido_id
      INNER JOIN sudamericana_jornadas j ON j.id = pa.jornada_id
      WHERE p.usuario_id = $1 AND j.numero = $2
    `, [usuarioId, jornadaNumero]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo pronósticos:', error);
    res.status(500).json({ error: 'Error obteniendo pronósticos' });
  }
});

// POST - Guardar un pronóstico individual
router.post('/', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { partido_id, jornada_id, goles_local, goles_visita } = req.body;

    // Verificar si el usuario está activo en Sudamericana
    const usuarioCheck = await pool.query(
      'SELECT activo_sudamericana FROM usuarios WHERE id = $1',
      [usuario_id]
    );
    
    if (usuarioCheck.rowCount === 0 || usuarioCheck.rows[0].activo_sudamericana !== true) {
      console.log('🚫 Usuario sin acceso a Sudamericana:', usuario_id);
      return res.status(403).json({ 
        error: '❌ No puedes guardar pronósticos porque no estás activo en la Copa Sudamericana. Contacta al administrador para activar tu acceso.' 
      });
    }

    // Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      'SELECT cerrada FROM sudamericana_jornadas WHERE id = $1',
      [jornada_id]
    );

    if (jornadaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: 'Esta jornada está cerrada' });
    }

    // Verificar si ya existe el pronóstico
    const existeResult = await pool.query(
      'SELECT id FROM sudamericana_pronosticos WHERE usuario_id = $1 AND partido_id = $2',
      [usuario_id, partido_id]
    );

    if (existeResult.rows.length > 0) {
      // Actualizar
      await pool.query(
        `UPDATE sudamericana_pronosticos 
         SET goles_local = $1, goles_visita = $2
         WHERE usuario_id = $3 AND partido_id = $4`,
        [goles_local, goles_visita, usuario_id, partido_id]
      );
    } else {
      // Insertar
      await pool.query(
        `INSERT INTO sudamericana_pronosticos 
         (usuario_id, partido_id, goles_local, goles_visita, puntos)
         VALUES ($1, $2, $3, $4, 0)`,
        [usuario_id, partido_id, goles_local, goles_visita]
      );
    }

    res.json({ mensaje: 'Pronóstico guardado exitosamente' });
  } catch (error) {
    console.error('Error guardando pronóstico:', error);
    res.status(500).json({ error: 'Error guardando pronóstico' });
  }
});

// POST - Guardar pronósticos de un usuario para una jornada
router.post('/guardar', verifyToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { usuario_id, jornada_numero, pronosticos } = req.body;

    if (!usuario_id || !jornada_numero || !Array.isArray(pronosticos)) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    // Verificar si el usuario está activo en Sudamericana
    const usuarioCheck = await client.query(
      'SELECT activo_sudamericana FROM usuarios WHERE id = $1',
      [usuario_id]
    );
    
    if (usuarioCheck.rowCount === 0 || usuarioCheck.rows[0].activo_sudamericana !== true) {
      console.log('🚫 Usuario sin acceso a Sudamericana:', usuario_id);
      return res.status(403).json({ 
        error: '❌ No puedes guardar pronósticos porque no estás activo en la Copa Sudamericana. Contacta al administrador para activar tu acceso.' 
      });
    }

    await client.query('BEGIN');

    // Obtener el ID de la jornada
    const jornadaResult = await client.query(
      'SELECT id, cerrada FROM sudamericana_jornadas WHERE numero = $1',
      [jornada_numero]
    );

    if (jornadaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    const { id: jornada_id, cerrada } = jornadaResult.rows[0];

    if (cerrada) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'La jornada está cerrada' });
    }

    // Guardar/actualizar cada pronóstico
    for (const pronostico of pronosticos) {
      const { partido_id, goles_local, goles_visita } = pronostico;

      if (!partido_id) continue;

      // Verificar si ya existe un pronóstico
      const existeResult = await client.query(
        'SELECT id FROM sudamericana_pronosticos WHERE usuario_id = $1 AND partido_id = $2',
        [usuario_id, partido_id]
      );

      if (existeResult.rows.length > 0) {
        // Actualizar
        await client.query(
          `UPDATE sudamericana_pronosticos 
           SET goles_local = $1, goles_visita = $2
           WHERE usuario_id = $3 AND partido_id = $4`,
          [goles_local, goles_visita, usuario_id, partido_id]
        );
      } else {
        // Insertar
        await client.query(
          `INSERT INTO sudamericana_pronosticos 
           (usuario_id, partido_id, goles_local, goles_visita, puntos)
           VALUES ($1, $2, $3, $4, 0)`,
          [usuario_id, partido_id, goles_local, goles_visita]
        );
      }
    }

    await client.query('COMMIT');

    res.json({ mensaje: 'Pronósticos guardados exitosamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error guardando pronósticos:', error);
    res.status(500).json({ error: 'Error guardando pronósticos' });
  } finally {
    client.release();
  }
});

export default router;
