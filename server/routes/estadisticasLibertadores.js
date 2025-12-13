import express from 'express';
import { pool } from '../db/pool.js';

const router = express.Router();

// Obtener estadísticas de todos los grupos
router.get('/estadisticas', async (req, res) => {
  try {
    // Obtener todos los equipos con su grupo
    const equiposResult = await pool.query(`
      SELECT id, nombre, grupo, pais
      FROM libertadores_equipos
      ORDER BY grupo, nombre
    `);
    
    // Obtener todos los partidos con resultados (solo fase de grupos)
    const partidosResult = await pool.query(`
      SELECT 
        p.nombre_local,
        p.nombre_visita,
        p.goles_local,
        p.goles_visita,
        el.grupo as grupo_local
      FROM libertadores_partidos p
      INNER JOIN libertadores_jornadas j ON p.jornada_id = j.id
      LEFT JOIN libertadores_equipos el ON el.nombre = p.nombre_local
      WHERE p.goles_local IS NOT NULL 
        AND p.goles_visita IS NOT NULL
        AND j.numero <= 6
      ORDER BY p.fecha
    `);

    const partidos = partidosResult.rows;
    const equipos = equiposResult.rows;

    // Inicializar estadísticas para cada equipo
    const estadisticas = {};
    equipos.forEach(equipo => {
      estadisticas[equipo.nombre] = {
        nombre: equipo.nombre,
        pais: equipo.pais || '',
        grupo: equipo.grupo,
        pj: 0,
        pg: 0,
        pe: 0,
        pp: 0,
        gf: 0,
        gc: 0,
        dif: 0,
        pts: 0,
        enfrentamientos: {} // Para el criterio 2: { nombreRival: 'ganado'|'perdido'|'empatado' }
      };
    });

    // Procesar cada partido
    partidos.forEach(partido => {
      const local = estadisticas[partido.nombre_local];
      const visita = estadisticas[partido.nombre_visita];
      
      if (!local || !visita) return; // Skip si no existe el equipo

      // Actualizar partidos jugados
      local.pj++;
      visita.pj++;

      // Actualizar goles
      local.gf += partido.goles_local;
      local.gc += partido.goles_visita;
      visita.gf += partido.goles_visita;
      visita.gc += partido.goles_local;

      // Determinar resultado
      if (partido.goles_local > partido.goles_visita) {
        // Local gana
        local.pg++;
        local.pts += 3;
        visita.pp++;
        local.enfrentamientos[partido.nombre_visita] = 'ganado';
        visita.enfrentamientos[partido.nombre_local] = 'perdido';
      } else if (partido.goles_local < partido.goles_visita) {
        // Visita gana
        visita.pg++;
        visita.pts += 3;
        local.pp++;
        visita.enfrentamientos[partido.nombre_local] = 'ganado';
        local.enfrentamientos[partido.nombre_visita] = 'perdido';
      } else {
        // Empate
        local.pe++;
        visita.pe++;
        local.pts += 1;
        visita.pts += 1;
        local.enfrentamientos[partido.nombre_visita] = 'empatado';
        visita.enfrentamientos[partido.nombre_local] = 'empatado';
      }

      // Actualizar diferencia de goles
      local.dif = local.gf - local.gc;
      visita.dif = visita.gf - visita.gc;
    });

    // Agrupar por grupos y ordenar
    const estadisticasPorGrupo = {};
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(grupo => {
      const equiposGrupo = Object.values(estadisticas).filter(e => e.grupo === grupo);
      
      // Ordenar según criterios
      equiposGrupo.sort((a, b) => {
        // 1. Mayor puntos
        if (b.pts !== a.pts) return b.pts - a.pts;
        
        // 2. Enfrentamiento directo
        if (a.enfrentamientos[b.nombre]) {
          if (a.enfrentamientos[b.nombre] === 'ganado') return -1;
          if (a.enfrentamientos[b.nombre] === 'perdido') return 1;
        }
        
        // 3. Mayor diferencia de goles
        if (b.dif !== a.dif) return b.dif - a.dif;
        
        // 4. Mayor goles a favor
        return b.gf - a.gf;
      });

      // Agregar posición
      equiposGrupo.forEach((equipo, index) => {
        equipo.posicion = index + 1;
      });

      estadisticasPorGrupo[grupo] = equiposGrupo;
    });

    res.json(estadisticasPorGrupo);
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

export default router;
