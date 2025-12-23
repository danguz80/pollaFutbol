import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

// GET /api/libertadores-rankings/jornada/:numero - Ranking de una jornada específica
router.get('/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;
    const jornadaNum = parseInt(numero);

    // Obtener todos los pronósticos de la jornada agrupados por usuario
    const pronosticosResult = await pool.query(`
      SELECT 
        u.id as usuario_id,
        u.nombre,
        u.foto_perfil,
        lp.puntos,
        lpc.puntos as puntos_clasificacion,
        p.id as partido_id,
        p.nombre_local,
        p.nombre_visita
      FROM usuarios u
      INNER JOIN libertadores_pronosticos lp ON u.id = lp.usuario_id
      INNER JOIN libertadores_partidos p ON lp.partido_id = p.id
      INNER JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
      LEFT JOIN libertadores_puntos_clasificacion lpc ON lp.usuario_id = lpc.usuario_id 
        AND lp.partido_id = lpc.partido_id
        AND lj.numero = lpc.jornada_numero
      WHERE lj.numero = $1
      ORDER BY u.id, p.id
    `, [jornadaNum]);

    // Agrupar por usuario y SUMAR TODO (partidos + clasificación)
    const ranking = {};
    pronosticosResult.rows.forEach((row) => {
      if (!ranking[row.usuario_id]) {
        ranking[row.usuario_id] = {
          id: row.usuario_id,
          nombre: row.nombre,
          foto_perfil: row.foto_perfil,
          puntosPartidos: 0,
          puntosClasificacion: 0
        };
      }
      
      // Sumar TODO: puntos de partido
      ranking[row.usuario_id].puntosPartidos += row.puntos || 0;
      
      // Sumar TODO: puntos de clasificación
      ranking[row.usuario_id].puntosClasificacion += row.puntos_clasificacion || 0;
    });

    // Formatear resultado y ordenar
    const rankingArray = Object.values(ranking)
      .map(j => ({
        id: j.id,
        nombre: j.nombre,
        foto_perfil: j.foto_perfil,
        puntos_jornada: j.puntosPartidos + j.puntosClasificacion
      }))
      .sort((a, b) => {
        if (b.puntos_jornada !== a.puntos_jornada) {
          return b.puntos_jornada - a.puntos_jornada;
        }
        return a.nombre.localeCompare(b.nombre);
      });

    res.json(rankingArray);
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
        COALESCE(puntos_partidos.total, 0) + 
        COALESCE(puntos_clasificacion.total, 0) + 
        COALESCE(puntos_campeon.campeon, 0) + 
        COALESCE(puntos_campeon.subcampeon, 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN (
        SELECT lp.usuario_id, SUM(lp.puntos) as total
        FROM libertadores_pronosticos lp
        INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
        WHERE lj.numero <= $1
        GROUP BY lp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      LEFT JOIN (
        SELECT lpc.usuario_id, SUM(lpc.puntos) as total
        FROM libertadores_puntos_clasificacion lpc
        WHERE lpc.jornada_numero <= $1
        GROUP BY lpc.usuario_id
      ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
      LEFT JOIN (
        SELECT usuario_id, puntos_campeon as campeon, puntos_subcampeon as subcampeon
        FROM libertadores_predicciones_campeon
      ) puntos_campeon ON u.id = puntos_campeon.usuario_id
      WHERE puntos_partidos.total IS NOT NULL 
         OR puntos_clasificacion.total IS NOT NULL 
         OR puntos_campeon.campeon IS NOT NULL
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
        COALESCE(puntos_partidos.total, 0) + 
        COALESCE(puntos_clasificacion.total, 0) + 
        COALESCE(puntos_campeon.campeon, 0) + 
        COALESCE(puntos_campeon.subcampeon, 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN (
        SELECT lp.usuario_id, SUM(lp.puntos) as total
        FROM libertadores_pronosticos lp
        INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
        WHERE lj.numero <= $1
        GROUP BY lp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      LEFT JOIN (
        SELECT lpc.usuario_id, SUM(lpc.puntos) as total
        FROM libertadores_puntos_clasificacion lpc
        WHERE lpc.jornada_numero <= $1
        GROUP BY lpc.usuario_id
      ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
      LEFT JOIN (
        SELECT usuario_id, puntos_campeon as campeon, puntos_subcampeon as subcampeon
        FROM libertadores_predicciones_campeon
      ) puntos_campeon ON u.id = puntos_campeon.usuario_id
      WHERE puntos_partidos.total IS NOT NULL 
         OR puntos_clasificacion.total IS NOT NULL 
         OR puntos_campeon.campeon IS NOT NULL
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
