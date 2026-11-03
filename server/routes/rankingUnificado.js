import express from 'express';
import { pool } from '../db/pool.js';

const router = express.Router();

// GET /api/ranking-unificado/actual - Ranking combinado de las 4 competencias
// (Torneo Nacional, Copa Libertadores, Copa Sudamericana, Mundial de Clubes).
// Cada columna replica exactamente la fórmula que ya usa el ranking acumulado
// propio de esa competencia (pronosticos.puntos + puntos_clasificacion +
// campeón/subcampeón cuando corresponda), sin tope de jornada: es un total
// corriente, así que sumar jornadas aún no calculadas (puntos = 0) no cambia
// el resultado.
router.get('/actual', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.nombre,
        u.foto_perfil,
        u.activo_torneo_nacional,
        u.activo_libertadores,
        u.activo_sudamericana,
        u.activo_mundial,
        COALESCE(nacional.total, 0) as puntos_nacional,
        COALESCE(libertadores.total, 0) as puntos_libertadores,
        COALESCE(sudamericana.total, 0) as puntos_sudamericana,
        COALESCE(mundial.total, 0) as puntos_mundial,
        COALESCE(nacional.total, 0)
          + COALESCE(libertadores.total, 0)
          + COALESCE(sudamericana.total, 0)
          + COALESCE(mundial.total, 0) as puntos_totales
      FROM usuarios u
      LEFT JOIN (
        SELECT p.usuario_id, SUM(p.puntos) as total
        FROM pronosticos p
        GROUP BY p.usuario_id
      ) nacional ON nacional.usuario_id = u.id
      LEFT JOIN (
        SELECT usuario_id, SUM(total) as total FROM (
          SELECT lp.usuario_id, SUM(lp.puntos) as total
          FROM libertadores_pronosticos lp
          GROUP BY lp.usuario_id
          UNION ALL
          SELECT lpc.usuario_id, SUM(lpc.puntos) as total
          FROM libertadores_puntos_clasificacion lpc
          GROUP BY lpc.usuario_id
          UNION ALL
          SELECT usuario_id, COALESCE(puntos_campeon, 0) + COALESCE(puntos_subcampeon, 0) as total
          FROM libertadores_predicciones_campeon
        ) sub
        GROUP BY usuario_id
      ) libertadores ON libertadores.usuario_id = u.id
      LEFT JOIN (
        SELECT usuario_id, SUM(total) as total FROM (
          SELECT sp.usuario_id, SUM(sp.puntos) as total
          FROM sudamericana_pronosticos sp
          GROUP BY sp.usuario_id
          UNION ALL
          SELECT spc.usuario_id, SUM(spc.puntos) as total
          FROM sudamericana_puntos_clasificacion spc
          GROUP BY spc.usuario_id
        ) sub
        GROUP BY usuario_id
      ) sudamericana ON sudamericana.usuario_id = u.id
      LEFT JOIN (
        SELECT usuario_id, SUM(total) as total FROM (
          SELECT mp.usuario_id, SUM(mp.puntos) as total
          FROM mundial_pronosticos mp
          GROUP BY mp.usuario_id
          UNION ALL
          SELECT mpc.usuario_id, SUM(mpc.puntos) as total
          FROM mundial_puntos_clasificacion mpc
          GROUP BY mpc.usuario_id
          UNION ALL
          SELECT usuario_id, COALESCE(puntos, 0) as total
          FROM mundial_predicciones_campeon
        ) sub
        GROUP BY usuario_id
      ) mundial ON mundial.usuario_id = u.id
      WHERE u.rol != 'admin'
        AND (u.activo_torneo_nacional = true
          OR u.activo_libertadores = true
          OR u.activo_sudamericana = true
          OR u.activo_mundial = true)
      ORDER BY puntos_totales DESC, u.nombre ASC
    `);

    const ranking = result.rows.map(row => {
      const puntosTotales = parseInt(row.puntos_totales) || 0;
      // "Competencias jugadas" = en las que el usuario está activo, no solo las
      // que ya tienen puntos > 0 (si está activo pero aún va en 0, igual cuenta
      // como una competencia jugada para el promedio).
      const competenciasJugadas = [
        row.activo_torneo_nacional,
        row.activo_libertadores,
        row.activo_sudamericana,
        row.activo_mundial
      ].filter(Boolean).length;

      return {
        id: row.id,
        nombre: row.nombre,
        foto_perfil: row.foto_perfil,
        puntos_nacional: parseInt(row.puntos_nacional) || 0,
        puntos_libertadores: parseInt(row.puntos_libertadores) || 0,
        puntos_sudamericana: parseInt(row.puntos_sudamericana) || 0,
        puntos_mundial: parseInt(row.puntos_mundial) || 0,
        puntos_totales: puntosTotales,
        competencias_jugadas: competenciasJugadas,
        promedio: competenciasJugadas > 0
          ? Math.round((puntosTotales / competenciasJugadas) * 100) / 100
          : 0
      };
    });

    res.json({ ranking });
  } catch (error) {
    console.error('Error obteniendo ranking unificado:', error);
    res.status(500).json({ error: 'Error obteniendo ranking unificado' });
  }
});

export default router;
