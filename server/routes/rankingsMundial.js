import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

// GET /api/mundial-rankings/actual - Ranking acumulado actual (todas las jornadas cerradas)
router.get('/actual', verifyToken, async (req, res) => {
  try {
    // Obtener la última jornada cerrada
    const jornadaActual = await pool.query(`
      SELECT numero 
      FROM mundial_jornadas 
      WHERE cerrada = true 
      ORDER BY numero DESC 
      LIMIT 1
    `);

    const jornadaNum = jornadaActual.rows.length > 0 ? jornadaActual.rows[0].numero : 0;

    if (jornadaNum === 0) {
      // No hay jornadas cerradas, devolver ranking vacío
      return res.json({ jornada: 0, ranking: [] });
    }

    // Calcular ranking acumulado
    const query = `
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(puntos_partidos.total, 0) + 
        COALESCE(puntos_clasificacion.total, 0) + 
        COALESCE(puntos_campeon.puntos, 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN (
        SELECT mp.usuario_id, SUM(mp.puntos) as total
        FROM mundial_pronosticos mp
        INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
        WHERE mj.numero <= $1
        GROUP BY mp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      LEFT JOIN (
        SELECT mpc.usuario_id, SUM(mpc.puntos) as total
        FROM mundial_puntos_clasificacion mpc
        GROUP BY mpc.usuario_id
      ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
      LEFT JOIN (
        SELECT usuario_id, puntos
        FROM mundial_predicciones_campeon
      ) puntos_campeon ON u.id = puntos_campeon.usuario_id
      WHERE puntos_partidos.total IS NOT NULL 
         OR puntos_clasificacion.total IS NOT NULL 
         OR puntos_campeon.puntos IS NOT NULL
      ORDER BY puntos_acumulados DESC, u.nombre ASC
    `;

    const result = await pool.query(query, [jornadaNum]);
    
    res.json({ jornada: jornadaNum, ranking: result.rows });
  } catch (error) {
    console.error('Error obteniendo ranking actual:', error);
    res.status(500).json({ error: 'Error obteniendo ranking actual' });
  }
});

// GET /api/mundial-rankings/jornada/:numero - Ranking de una jornada específica
router.get('/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;
    const jornadaNum = parseInt(numero);

    const query = `
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(puntos_partidos.total, 0) as puntos_jornada
      FROM usuarios u
      LEFT JOIN (
        SELECT mp.usuario_id, SUM(mp.puntos) as total
        FROM mundial_pronosticos mp
        INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
        WHERE mj.numero = $1
        GROUP BY mp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      WHERE puntos_partidos.total IS NOT NULL
      ORDER BY puntos_jornada DESC, u.nombre ASC
    `;

    const result = await pool.query(query, [jornadaNum]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ranking de jornada:', error);
    res.status(500).json({ error: 'Error obteniendo ranking de jornada' });
  }
});

// GET /api/mundial-rankings/acumulado/:numero - Ranking acumulado hasta una jornada
router.get('/acumulado/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;
    const jornadaNum = parseInt(numero);

    const query = `
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(puntos_partidos.total, 0) + 
        COALESCE(puntos_clasificacion.total, 0) + 
        COALESCE(puntos_campeon.puntos, 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN (
        SELECT mp.usuario_id, SUM(mp.puntos) as total
        FROM mundial_pronosticos mp
        INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
        WHERE mj.numero <= $1
        GROUP BY mp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      LEFT JOIN (
        SELECT mpc.usuario_id, SUM(mpc.puntos) as total
        FROM mundial_puntos_clasificacion mpc
        GROUP BY mpc.usuario_id
      ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
      LEFT JOIN (
        SELECT usuario_id, puntos
        FROM mundial_predicciones_campeon
      ) puntos_campeon ON u.id = puntos_campeon.usuario_id
      WHERE puntos_partidos.total IS NOT NULL 
         OR puntos_clasificacion.total IS NOT NULL 
         OR puntos_campeon.puntos IS NOT NULL
      ORDER BY puntos_acumulados DESC, u.nombre ASC
    `;

    const result = await pool.query(query, [jornadaNum]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ranking acumulado:', error);
    res.status(500).json({ error: 'Error obteniendo ranking acumulado' });
  }
});

export default router;
