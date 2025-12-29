import express from 'express';
import { pool } from '../db/pool.js';

const router = express.Router();

// GET: Obtener tabla de posiciones
router.get('/tabla-posiciones', async (req, res) => {
  try {
    // Consulta para calcular estadísticas de cada equipo
    const query = `
      WITH equipos_locales AS (
        SELECT 
          nombre_local as equipo,
          COUNT(*) as partidos_local,
          SUM(CASE WHEN goles_local > goles_visita THEN 1 ELSE 0 END) as ganados_local,
          SUM(CASE WHEN goles_local = goles_visita THEN 1 ELSE 0 END) as empatados_local,
          SUM(CASE WHEN goles_local < goles_visita THEN 1 ELSE 0 END) as perdidos_local,
          COALESCE(SUM(goles_local), 0) as gf_local,
          COALESCE(SUM(goles_visita), 0) as gc_local
        FROM partidos
        WHERE goles_local IS NOT NULL AND goles_visita IS NOT NULL
        GROUP BY nombre_local
      ),
      equipos_visitas AS (
        SELECT 
          nombre_visita as equipo,
          COUNT(*) as partidos_visita,
          SUM(CASE WHEN goles_visita > goles_local THEN 1 ELSE 0 END) as ganados_visita,
          SUM(CASE WHEN goles_visita = goles_local THEN 1 ELSE 0 END) as empatados_visita,
          SUM(CASE WHEN goles_visita < goles_local THEN 1 ELSE 0 END) as perdidos_visita,
          COALESCE(SUM(goles_visita), 0) as gf_visita,
          COALESCE(SUM(goles_local), 0) as gc_visita
        FROM partidos
        WHERE goles_local IS NOT NULL AND goles_visita IS NOT NULL
        GROUP BY nombre_visita
      ),
      todos_equipos AS (
        SELECT DISTINCT nombre_local as equipo FROM partidos
        UNION
        SELECT DISTINCT nombre_visita as equipo FROM partidos
      )
      SELECT 
        te.equipo,
        COALESCE(el.partidos_local, 0) + COALESCE(ev.partidos_visita, 0) as partidos_jugados,
        COALESCE(el.ganados_local, 0) + COALESCE(ev.ganados_visita, 0) as ganados,
        COALESCE(el.empatados_local, 0) + COALESCE(ev.empatados_visita, 0) as empatados,
        COALESCE(el.perdidos_local, 0) + COALESCE(ev.perdidos_visita, 0) as perdidos,
        COALESCE(el.gf_local, 0) + COALESCE(ev.gf_visita, 0) as goles_favor,
        COALESCE(el.gc_local, 0) + COALESCE(ev.gc_visita, 0) as goles_contra,
        (COALESCE(el.ganados_local, 0) + COALESCE(ev.ganados_visita, 0)) * 3 + 
        (COALESCE(el.empatados_local, 0) + COALESCE(ev.empatados_visita, 0)) as puntos,
        (COALESCE(el.gf_local, 0) + COALESCE(ev.gf_visita, 0) - COALESCE(el.gc_local, 0) - COALESCE(ev.gc_visita, 0)) as diferencia_goles
      FROM todos_equipos te
      LEFT JOIN equipos_locales el ON te.equipo = el.equipo
      LEFT JOIN equipos_visitas ev ON te.equipo = ev.equipo
      ORDER BY 
        puntos DESC,                    -- 1) Mayor cantidad de puntos
        diferencia_goles DESC,          -- 2) Mayor diferencia de goles
        ganados DESC,                   -- 3) Mayor cantidad de partidos ganados
        goles_favor DESC,               -- 4) Mayor cantidad de goles marcados
        equipo ASC                      -- Alfabético como último recurso
    `;

    const result = await pool.query(query);

    // Detectar empates que requieren criterios adicionales (5-8)
    const equiposEmpatados = [];
    for (let i = 0; i < result.rows.length - 1; i++) {
      const actual = result.rows[i];
      const siguiente = result.rows[i + 1];
      
      if (actual.puntos === siguiente.puntos &&
          actual.diferencia_goles === siguiente.diferencia_goles &&
          actual.ganados === siguiente.ganados &&
          actual.goles_favor === siguiente.goles_favor) {
        
        if (!equiposEmpatados.includes(actual.equipo)) {
          equiposEmpatados.push(actual.equipo);
        }
        if (!equiposEmpatados.includes(siguiente.equipo)) {
          equiposEmpatados.push(siguiente.equipo);
        }
      }
    }

    res.json({
      tabla: result.rows,
      empates_pendientes: equiposEmpatados.length > 0 ? equiposEmpatados : null
    });

  } catch (error) {
    console.error('Error obteniendo tabla de posiciones:', error);
    res.status(500).json({ 
      error: 'Error obteniendo tabla de posiciones',
      details: error.message 
    });
  }
});

// GET: Obtener historial de últimos 5 partidos de cada equipo
router.get('/ultimos-partidos', async (req, res) => {
  try {
    // Obtener todos los equipos
    const equiposQuery = `
      SELECT DISTINCT equipo FROM (
        SELECT nombre_local as equipo FROM partidos
        UNION
        SELECT nombre_visita as equipo FROM partidos
      ) equipos
      ORDER BY equipo
    `;
    
    const equiposResult = await pool.query(equiposQuery);
    const equipos = equiposResult.rows.map(row => row.equipo);
    
    // Para cada equipo, obtener sus últimos 5 partidos
    const historiales = await Promise.all(
      equipos.map(async (equipo) => {
        const query = `
          SELECT 
            id,
            fecha,
            nombre_local,
            nombre_visita,
            goles_local,
            goles_visita,
            CASE 
              WHEN nombre_local = $1 AND goles_local > goles_visita THEN 'V'
              WHEN nombre_visita = $1 AND goles_visita > goles_local THEN 'V'
              WHEN goles_local = goles_visita THEN 'E'
              ELSE 'D'
            END as resultado
          FROM partidos
          WHERE (nombre_local = $1 OR nombre_visita = $1)
            AND goles_local IS NOT NULL 
            AND goles_visita IS NOT NULL
          ORDER BY COALESCE(fecha, '1900-01-01'::timestamp) DESC, id DESC
          LIMIT 5
        `;
        
        const result = await pool.query(query, [equipo]);
        
        return {
          equipo,
          ultimos_partidos: result.rows.map(p => p.resultado)
        };
      })
    );
    
    res.json(historiales);
    
  } catch (error) {
    console.error('Error obteniendo historial de partidos:', error);
    res.status(500).json({ 
      error: 'Error obteniendo historial de partidos',
      details: error.message 
    });
  }
});

export default router;
