import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

// GET /api/libertadores-rankings/jornada/:numero - Ranking de una jornada específica
router.get('/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;

    const result = await pool.query(`
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(SUM(lp.puntos), 0) as puntos_jornada
      FROM usuarios u
      LEFT JOIN libertadores_pronosticos lp ON u.id = lp.usuario_id
      LEFT JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      WHERE lj.numero = $1 OR lj.numero IS NULL
      GROUP BY u.id, u.nombre, u.foto_perfil
      HAVING SUM(lp.puntos) IS NOT NULL
      ORDER BY puntos_jornada DESC, u.nombre ASC
    `, [parseInt(numero)]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ranking de jornada:', error);
    res.status(500).json({ error: 'Error obteniendo ranking de jornada' });
  }
});

// GET /api/libertadores-rankings/acumulado/:numero - Ranking acumulado hasta una jornada
router.get('/acumulado/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;

    const result = await pool.query(`
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(SUM(lp.puntos), 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN libertadores_pronosticos lp ON u.id = lp.usuario_id
      LEFT JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      WHERE lj.numero <= $1 OR lj.numero IS NULL
      GROUP BY u.id, u.nombre, u.foto_perfil
      HAVING SUM(lp.puntos) IS NOT NULL
      ORDER BY puntos_acumulados DESC, u.nombre ASC
    `, [parseInt(numero)]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ranking acumulado:', error);
    res.status(500).json({ error: 'Error obteniendo ranking acumulado' });
  }
});

// GET /api/libertadores-rankings/actual - Ranking acumulado de la jornada actual (última con puntos)
router.get('/actual', verifyToken, async (req, res) => {
  try {
    // Obtener la última jornada con puntos calculados
    const ultimaJornadaResult = await pool.query(`
      SELECT MAX(lj.numero) as ultima_jornada
      FROM libertadores_jornadas lj
      INNER JOIN libertadores_pronosticos lp ON lj.id = lp.jornada_id
      WHERE lp.puntos IS NOT NULL AND lp.puntos > 0
    `);

    const ultimaJornada = ultimaJornadaResult.rows[0]?.ultima_jornada || 1;

    const result = await pool.query(`
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(SUM(lp.puntos), 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN libertadores_pronosticos lp ON u.id = lp.usuario_id
      LEFT JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      WHERE lj.numero <= $1 OR lj.numero IS NULL
      GROUP BY u.id, u.nombre, u.foto_perfil
      HAVING SUM(lp.puntos) IS NOT NULL
      ORDER BY puntos_acumulados DESC, u.nombre ASC
    `, [ultimaJornada]);

    res.json({
      jornada: ultimaJornada,
      ranking: result.rows
    });
  } catch (error) {
    console.error('Error obteniendo ranking actual:', error);
    res.status(500).json({ error: 'Error obteniendo ranking actual' });
  }
});

export default router;
