import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

// GET /api/libertadores-rankings/jornada/:numero - Ranking de una jornada específica
router.get('/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const { numero } = req.params;
    const jornadaNum = parseInt(numero);

    // Incluir clasificación para todas las jornadas
    const incluirClasificacion = true;

    // Calcular puntos de jornada con subqueries para evitar duplicación
    const query = jornadaNum === 10 
      ? `
        SELECT 
          u.id,
          u.nombre,
          u.foto_perfil,
          COALESCE(puntos_partidos.total, 0) + 
          ${incluirClasificacion ? 'COALESCE(puntos_clasificacion.total, 0) +' : ''}
          COALESCE(puntos_campeon.campeon, 0) + 
          COALESCE(puntos_campeon.subcampeon, 0) +
          COALESCE(puntos_final.puntos, 0) as puntos_jornada
        FROM usuarios u
        LEFT JOIN (
          SELECT lp.usuario_id, SUM(lp.puntos) as total
          FROM libertadores_pronosticos lp
          INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
          WHERE lj.numero = $1
          GROUP BY lp.usuario_id
        ) puntos_partidos ON u.id = puntos_partidos.usuario_id
        ${incluirClasificacion ? `
        LEFT JOIN (
          SELECT usuario_id, SUM(puntos) as total
          FROM libertadores_puntos_clasificacion
          WHERE jornada_numero = $1
          GROUP BY usuario_id
        ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
        ` : ''}
        LEFT JOIN (
          SELECT usuario_id, puntos_campeon as campeon, puntos_subcampeon as subcampeon
          FROM libertadores_predicciones_campeon
        ) puntos_campeon ON u.id = puntos_campeon.usuario_id
        LEFT JOIN (
          SELECT 
            lpfv.usuario_id,
            CASE
              WHEN lpfv.goles_local = lp.goles_local AND lpfv.goles_visita = lp.goles_visita 
                THEN 10 * COALESCE(lp.bonus, 1)
              WHEN ABS(lpfv.goles_local - lpfv.goles_visita) = ABS(lp.goles_local - lp.goles_visita)
                   AND SIGN(lpfv.goles_local - lpfv.goles_visita) = SIGN(lp.goles_local - lp.goles_visita)
                THEN 7 * COALESCE(lp.bonus, 1)
              WHEN SIGN(lpfv.goles_local - lpfv.goles_visita) = SIGN(lp.goles_local - lp.goles_visita)
                THEN 4 * COALESCE(lp.bonus, 1)
              ELSE 0
            END as puntos
          FROM libertadores_pronosticos_final_virtual lpfv
          INNER JOIN libertadores_jornadas lj ON lpfv.jornada_id = lj.id
          INNER JOIN libertadores_partidos lp ON lp.id = 456
          WHERE lj.numero = 10 
            AND lpfv.equipo_local = lp.nombre_local 
            AND lpfv.equipo_visita = lp.nombre_visita
            AND lp.goles_local IS NOT NULL 
            AND lp.goles_visita IS NOT NULL
        ) puntos_final ON u.id = puntos_final.usuario_id
        WHERE puntos_partidos.total IS NOT NULL 
           OR puntos_clasificacion.total IS NOT NULL 
           OR puntos_campeon.campeon IS NOT NULL
           OR puntos_final.puntos IS NOT NULL
        ORDER BY puntos_jornada DESC, u.nombre ASC
      `
      : `
        SELECT 
          u.id,
          u.nombre,
          u.foto_perfil,
          ${jornadaNum === 6 || jornadaNum === 8
            ? 'COALESCE(puntos_partidos.total, 0) as puntos_jornada' 
            : 'COALESCE(puntos_partidos.total, 0) + COALESCE(puntos_clasificacion.total, 0) as puntos_jornada'}
        FROM usuarios u
        LEFT JOIN (
          SELECT lp.usuario_id, SUM(lp.puntos) as total
          FROM libertadores_pronosticos lp
          INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
          WHERE lj.numero = $1
          GROUP BY lp.usuario_id
        ) puntos_partidos ON u.id = puntos_partidos.usuario_id
        ${jornadaNum === 6 || jornadaNum === 8 ? '' : `
        LEFT JOIN (
          SELECT usuario_id, SUM(puntos) as total
          FROM libertadores_puntos_clasificacion
          WHERE jornada_numero = $1
          GROUP BY usuario_id
        ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
        `}
        WHERE puntos_partidos.total IS NOT NULL ${jornadaNum === 6 || jornadaNum === 8 ? '' : 'OR puntos_clasificacion.total IS NOT NULL'}
        ORDER BY puntos_jornada DESC, u.nombre ASC
      `;

    const result = await pool.query(query, [jornadaNum]);
    
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
    const jornadaNum = parseInt(numero);

    // Incluir todos los puntos de clasificación
    const filtroClasificacion = '';

    // Solo incluir puntos de campeón/subcampeón si la jornada es 10 o posterior
    const query = jornadaNum >= 10
      ? `
        SELECT 
          u.id,
          u.nombre,
          u.foto_perfil,
          COALESCE(puntos_partidos.total, 0) + 
          COALESCE(puntos_clasificacion.total, 0) + 
          COALESCE(puntos_campeon.campeon, 0) + 
          COALESCE(puntos_campeon.subcampeon, 0) +
          COALESCE(puntos_final.puntos, 0) as puntos_acumulados
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
          WHERE lpc.jornada_numero <= $1 ${filtroClasificacion}
          GROUP BY lpc.usuario_id
        ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
        LEFT JOIN (
          SELECT usuario_id, puntos_campeon as campeon, puntos_subcampeon as subcampeon
          FROM libertadores_predicciones_campeon
        ) puntos_campeon ON u.id = puntos_campeon.usuario_id
        LEFT JOIN (
          SELECT 
            lpfv.usuario_id,
            CASE
              WHEN lpfv.goles_local = lp.goles_local AND lpfv.goles_visita = lp.goles_visita 
                THEN 10 * COALESCE(lp.bonus, 1)
              WHEN ABS(lpfv.goles_local - lpfv.goles_visita) = ABS(lp.goles_local - lp.goles_visita)
                   AND SIGN(lpfv.goles_local - lpfv.goles_visita) = SIGN(lp.goles_local - lp.goles_visita)
                THEN 7 * COALESCE(lp.bonus, 1)
              WHEN SIGN(lpfv.goles_local - lpfv.goles_visita) = SIGN(lp.goles_local - lp.goles_visita)
                THEN 4 * COALESCE(lp.bonus, 1)
              ELSE 0
            END as puntos
          FROM libertadores_pronosticos_final_virtual lpfv
          INNER JOIN libertadores_jornadas lj ON lpfv.jornada_id = lj.id
          INNER JOIN libertadores_partidos lp ON lp.id = 456
          WHERE lj.numero = 10 
            AND lpfv.equipo_local = lp.nombre_local 
            AND lpfv.equipo_visita = lp.nombre_visita
            AND lp.goles_local IS NOT NULL 
            AND lp.goles_visita IS NOT NULL
        ) puntos_final ON u.id = puntos_final.usuario_id
        WHERE puntos_partidos.total IS NOT NULL 
           OR puntos_clasificacion.total IS NOT NULL 
           OR puntos_campeon.campeon IS NOT NULL
           OR puntos_final.puntos IS NOT NULL
        ORDER BY puntos_acumulados DESC, u.nombre ASC
      `
      : `
        SELECT 
          u.id,
          u.nombre,
          u.foto_perfil,
          COALESCE(puntos_partidos.total, 0) + 
          COALESCE(puntos_clasificacion.total, 0) as puntos_acumulados
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
          WHERE lpc.jornada_numero <= $1 ${filtroClasificacion}
          GROUP BY lpc.usuario_id
        ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
        WHERE puntos_partidos.total IS NOT NULL 
           OR puntos_clasificacion.total IS NOT NULL
        ORDER BY puntos_acumulados DESC, u.nombre ASC
      `;

    const result = await pool.query(query, [jornadaNum]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ranking acumulado:', error);
    res.status(500).json({ error: 'Error obteniendo ranking acumulado' });
  }
});

// GET /api/libertadores-rankings/actual - Ranking acumulado de la jornada actual (última con puntos)
router.get('/actual', async (req, res) => {
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
      WHERE u.rol != 'admin'
        AND (puntos_partidos.total IS NOT NULL 
         OR puntos_clasificacion.total IS NOT NULL 
         OR puntos_campeon.campeon IS NOT NULL)
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
