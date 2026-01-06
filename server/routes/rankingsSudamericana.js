import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

// GET /api/sudamericana-rankings/jornada/:numero - Ranking de una jornada específica
router.get('/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;
    const jornadaNum = parseInt(numero);

    // Calcular puntos de jornada - INCLUIR TODOS LOS USUARIOS CON PRONÓSTICOS
    const query = `
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(puntos_partidos.total, 0) as puntos_jornada
      FROM usuarios u
      LEFT JOIN (
        SELECT sp.usuario_id, SUM(sp.puntos) as total
        FROM sudamericana_pronosticos sp
        INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
        INNER JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
        WHERE sj.numero = $1
        GROUP BY sp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      WHERE u.rol != 'admin'
        AND EXISTS (
          SELECT 1 FROM sudamericana_pronosticos sp2
          INNER JOIN sudamericana_partidos p2 ON sp2.partido_id = p2.id
          INNER JOIN sudamericana_jornadas sj2 ON p2.jornada_id = sj2.id
          WHERE sp2.usuario_id = u.id AND sj2.numero = $1
        )
      ORDER BY puntos_jornada DESC, u.nombre ASC
    `;

    const result = await pool.query(query, [jornadaNum]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ranking de jornada:', error);
    res.status(500).json({ error: 'Error obteniendo ranking de jornada' });
  }
});

// GET /api/sudamericana-rankings/acumulado/:numero - Ranking acumulado hasta una jornada
router.get('/acumulado/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;
    const jornadaNum = parseInt(numero);

    const query = `
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(puntos_partidos.total, 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN (
        SELECT sp.usuario_id, SUM(sp.puntos) as total
        FROM sudamericana_pronosticos sp
        INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
        INNER JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
        WHERE sj.numero <= $1
        GROUP BY sp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      WHERE u.rol != 'admin'
        AND EXISTS (
          SELECT 1 FROM sudamericana_pronosticos sp2
          INNER JOIN sudamericana_partidos p2 ON sp2.partido_id = p2.id
          INNER JOIN sudamericana_jornadas sj2 ON p2.jornada_id = sj2.id
          WHERE sp2.usuario_id = u.id AND sj2.numero <= $1
        )
      ORDER BY puntos_acumulados DESC, u.nombre ASC
    `;

    const result = await pool.query(query, [jornadaNum]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ranking acumulado:', error);
    res.status(500).json({ error: 'Error obteniendo ranking acumulado' });
  }
});

// GET /api/sudamericana-rankings/actual - Ranking acumulado de la jornada actual (última con puntos)
router.get('/actual', async (req, res) => {
  try {
    // Obtener la última jornada con puntos calculados
    const ultimaJornadaResult = await pool.query(`
      SELECT MAX(sj.numero) as ultima_jornada
      FROM sudamericana_jornadas sj
      INNER JOIN sudamericana_partidos p ON sj.id = p.jornada_id
      INNER JOIN sudamericana_pronosticos sp ON p.id = sp.partido_id
      WHERE sp.puntos IS NOT NULL AND sp.puntos > 0
    `);

    const ultimaJornada = ultimaJornadaResult.rows[0]?.ultima_jornada || 1;

    const result = await pool.query(`
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(puntos_partidos.total, 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN (
        SELECT sp.usuario_id, SUM(sp.puntos) as total
        FROM sudamericana_pronosticos sp
        INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
        INNER JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
        WHERE sj.numero <= $1
        GROUP BY sp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      WHERE u.rol != 'admin'
        AND puntos_partidos.total IS NOT NULL
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
