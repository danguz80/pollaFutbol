import express from "express";
import { pool } from "../db/pool.js";

const router = express.Router();

/**
 * GET /api/hero-partidos-bonus
 * Devuelve todos los partidos con bonus >= 2 de jornadas activas y no cerradas
 * de todas las competencias (Torneo Nacional, Libertadores, Sudamericana, Mundial)
 * 
 * Query params opcionales:
 * - competencia: 'torneo_nacional', 'libertadores', 'sudamericana', 'mundial' (filtrar por una sola)
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
        ORDER BY j.numero ASC, p.bonus DESC, p.fecha ASC
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
        ORDER BY lj.numero ASC, lp.bonus DESC, lp.fecha ASC
      `);
      
      partidos.push(...libertadoresResult.rows);
    }

    // 3. SUDAMERICANA - Partidos con bonus >= 2 de jornadas activas y no cerradas
    if (!competencia || competencia === 'sudamericana') {
      try {
        const sudamericanaResult = await pool.query(`
          SELECT 
            'sudamericana' as competencia,
            'Copa Sudamericana 2025' as nombre_competencia,
            sj.numero as jornada_numero,
            sj.nombre as jornada_nombre,
            sp.id,
            sp.nombre_local as local,
            sp.nombre_visita as visita,
            sp.fecha,
            sp.bonus,
            sj.id as jornada_id
          FROM sudamericana_partidos sp
          INNER JOIN sudamericana_jornadas sj ON sp.jornada_id = sj.id
          WHERE sj.activa = true 
            AND sj.cerrada = false 
            AND sp.bonus >= 2
          ORDER BY sj.numero ASC, sp.bonus DESC, sp.fecha ASC
        `);
        
        partidos.push(...sudamericanaResult.rows);
      } catch (sudErr) {
        console.error('Error obteniendo partidos hero de Sudamericana:', sudErr);
        // Continuar sin error si Sudamericana no está disponible
      }
    }

    // 4. MUNDIAL - Partidos con bonus >= 2 de jornadas activas y no cerradas
    if (!competencia || competencia === 'mundial') {
      try {
        const mundialResult = await pool.query(`
          SELECT 
            'mundial' as competencia,
            'Mundial 2026' as nombre_competencia,
            mj.numero as jornada_numero,
            mj.nombre as jornada_nombre,
            mp.id,
            mp.equipo_local as local,
            mp.equipo_visitante as visita,
            mp.fecha,
            mp.bonus,
            mj.id as jornada_id
          FROM mundial_partidos mp
          INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
          WHERE mj.activa = true 
            AND mj.cerrada = false 
            AND mp.bonus >= 2
          ORDER BY mj.numero ASC, mp.bonus DESC, mp.fecha ASC
        `);
        
        partidos.push(...mundialResult.rows);
      } catch (mundialErr) {
        console.error('Error obteniendo partidos hero del Mundial:', mundialErr);
        // Continuar sin error si Mundial no está disponible
      }
    }

    // Ordenar todos los partidos: primero por competencia (Mundial al final), luego por jornada, bonus y fecha
    partidos.sort((a, b) => {
      // Primero por prioridad de competencia (menor número = mayor prioridad)
      const prioridadCompetencia = {
        'torneo_nacional': 1,
        'libertadores': 2,
        'sudamericana': 3,
        'mundial': 4  // Mundial al final
      };
      
      const prioA = prioridadCompetencia[a.competencia] || 99;
      const prioB = prioridadCompetencia[b.competencia] || 99;
      
      if (prioA !== prioB) {
        return prioA - prioB;
      }
      
      // Luego por número de jornada (menor a mayor - más próximas primero)
      if (a.jornada_numero !== b.jornada_numero) {
        return a.jornada_numero - b.jornada_numero;
      }
      // Luego por bonus (mayor a menor)
      if (b.bonus !== a.bonus) return b.bonus - a.bonus;
      // Finalmente por fecha (más cercano primero)
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
