import express from "express";
import { pool } from "../db/pool.js";

const router = express.Router();

/**
 * GET /api/hero-partidos-bonus
 * Devuelve todos los partidos con bonus >= 2 de jornadas activas y no cerradas
 * de todas las competencias (Torneo Nacional, Libertadores, Sudamericana)
 * 
 * Query params opcionales:
 * - competencia: 'torneo_nacional', 'libertadores', 'sudamericana' (filtrar por una sola)
 */
router.get("/", async (req, res) => {
  try {
    const { competencia } = req.query;
    const partidos = [];

    // 1. TORNEO NACIONAL - Partidos con bonus >= 2 de jornadas activas y no cerradas
    if (!competencia || competencia === 'torneo_nacional') {
      const torneoResult = await pool.query(`
        SELECT 
          'torneo_nacional' as competencia,
          'Torneo Nacional' as nombre_competencia,
          j.numero as jornada_numero,
          'Jornada ' || j.numero as jornada_nombre,
          p.id,
          p.nombre_local as local,
          p.nombre_visita as visita,
          p.fecha,
          p.bonus,
          j.id as jornada_id
        FROM partidos p
        INNER JOIN jornadas j ON p.jornada_id = j.id
        WHERE j.cerrada = false 
          AND p.bonus >= 2
        ORDER BY p.fecha ASC, p.bonus DESC
      `);
      
      partidos.push(...torneoResult.rows);
    }

    // 2. LIBERTADORES - Partidos con bonus >= 2 de jornadas activas y no cerradas
    if (!competencia || competencia === 'libertadores') {
      const libertadoresResult = await pool.query(`
        SELECT 
          'libertadores' as competencia,
          'Copa Libertadores 2026' as nombre_competencia,
          lj.numero as jornada_numero,
          lj.nombre as jornada_nombre,
          lp.id,
          lp.nombre_local as local,
          lp.nombre_visita as visita,
          lp.fecha,
          lp.bonus,
          lj.id as jornada_id
        FROM libertadores_partidos lp
        INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
        WHERE lj.activa = true 
          AND lj.cerrada = false 
          AND lp.bonus >= 2
        ORDER BY lp.fecha ASC, lp.bonus DESC
      `);
      
      partidos.push(...libertadoresResult.rows);
    }

    // 3. SUDAMERICANA - Partidos con bonus >= 2 de rondas activas
    if (!competencia || competencia === 'sudamericana') {
      // Nota: La estructura de Sudamericana puede ser diferente según tu implementación
      // Ajusta según la estructura de tu tabla sudamericana_fixtures o similar
      try {
        const sudamericanaResult = await pool.query(`
          SELECT 
            'sudamericana' as competencia,
            'Copa Sudamericana 2025' as nombre_competencia,
            sf.ronda as jornada_numero,
            sf.ronda as jornada_nombre,
            sf.fixture_id as id,
            sf.equipo_local as local,
            sf.equipo_visita as visita,
            sf.fecha,
            COALESCE(sf.bonus, 1) as bonus
          FROM sudamericana_fixtures sf
          WHERE sf.clasificado = false 
            AND COALESCE(sf.bonus, 1) >= 2
          ORDER BY sf.fecha ASC, COALESCE(sf.bonus, 1) DESC
        `);
        
        partidos.push(...sudamericanaResult.rows);
      } catch (sudErr) {
        // Sudamericana no está configurada aún - continuar sin error
      }
    }

    // Ordenar todos los partidos por fecha y bonus
    partidos.sort((a, b) => {
      // Primero por bonus (mayor a menor)
      if (b.bonus !== a.bonus) return b.bonus - a.bonus;
      // Luego por fecha (más cercano primero)
      return new Date(a.fecha) - new Date(b.fecha);
    });

    res.json({
      total: partidos.length,
      partidos
    });

  } catch (error) {
    console.error('❌ Error obteniendo partidos hero con bonus:', error);
    res.status(500).json({ 
      error: 'Error obteniendo partidos destacados',
      details: error.message 
    });
  }
});

export default router;
