import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

// Endpoint para obtener los clasificados oficiales de la J6
router.get('/clasificados-oficiales', verifyToken, async (req, res) => {
  try {
    // Obtener todos los partidos de las jornadas 1-6 con sus resultados
    const partidosQuery = `
      SELECT 
        p.id,
        el.grupo,
        p.nombre_local,
        p.nombre_visita,
        p.goles_local,
        p.goles_visita
      FROM sudamericana_partidos p
      INNER JOIN sudamericana_jornadas j ON p.jornada_id = j.id
      LEFT JOIN sudamericana_equipos el ON p.nombre_local = el.nombre
      WHERE j.numero IN (1, 2, 3, 4, 5, 6)
        AND p.goles_local IS NOT NULL
        AND p.goles_visita IS NOT NULL
        AND el.grupo IS NOT NULL
      ORDER BY el.grupo, j.numero
    `;
    
    const partidosRes = await pool.query(partidosQuery);
    
    // Calcular tabla oficial para cada grupo
    const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const clasificados = [];
    
    for (const grupo of grupos) {
      // Calcular tabla del grupo
      const tabla = calcularTablaOficial(partidosRes.rows, grupo);
      
      // Los clasificados son el 1ero y 2do de cada grupo
      if (tabla.length >= 1) {
        clasificados.push({
          grupo: grupo,
          equipo_nombre: tabla[0].nombre,
          posicion: 1,
          fase: 'OCTAVOS'
        });
      }
      
      if (tabla.length >= 2) {
        clasificados.push({
          grupo: grupo,
          equipo_nombre: tabla[1].nombre,
          posicion: 2,
          fase: 'PLAYOFFS'
        });
      }
    }
    
    res.json(clasificados);
  } catch (error) {
    console.error('Error obteniendo clasificados oficiales:', error);
    res.status(500).json({ error: 'Error al obtener clasificados' });
  }
});

// Función auxiliar para calcular tabla oficial de un grupo
function calcularTablaOficial(partidos, grupoLetra) {
  // Filtrar partidos del grupo
  const partidosGrupo = partidos.filter(p => p.grupo === grupoLetra);
  
  // Inicializar equipos
  const equipos = {};
  
  partidosGrupo.forEach(p => {
    if (!equipos[p.nombre_local]) {
      equipos[p.nombre_local] = {
        nombre: p.nombre_local,
        puntos: 0,
        pj: 0,
        pg: 0,
        pe: 0,
        pp: 0,
        gf: 0,
        gc: 0,
        dif: 0
      };
    }
    if (!equipos[p.nombre_visita]) {
      equipos[p.nombre_visita] = {
        nombre: p.nombre_visita,
        puntos: 0,
        pj: 0,
        pg: 0,
        pe: 0,
        pp: 0,
        gf: 0,
        gc: 0,
        dif: 0
      };
    }
    
    // Procesar resultado
    equipos[p.nombre_local].pj++;
    equipos[p.nombre_visita].pj++;
    equipos[p.nombre_local].gf += p.goles_local;
    equipos[p.nombre_local].gc += p.goles_visita;
    equipos[p.nombre_visita].gf += p.goles_visita;
    equipos[p.nombre_visita].gc += p.goles_local;
    
    if (p.goles_local > p.goles_visita) {
      equipos[p.nombre_local].puntos += 3;
      equipos[p.nombre_local].pg++;
      equipos[p.nombre_visita].pp++;
    } else if (p.goles_local < p.goles_visita) {
      equipos[p.nombre_visita].puntos += 3;
      equipos[p.nombre_visita].pg++;
      equipos[p.nombre_local].pp++;
    } else {
      equipos[p.nombre_local].puntos++;
      equipos[p.nombre_visita].puntos++;
      equipos[p.nombre_local].pe++;
      equipos[p.nombre_visita].pe++;
    }
  });
  
  // Calcular diferencia de goles
  Object.values(equipos).forEach(e => {
    e.dif = e.gf - e.gc;
  });
  
  // Ordenar: puntos DESC, dif DESC, gf DESC, nombre ASC
  return Object.values(equipos).sort((a, b) => {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    if (b.dif !== a.dif) return b.dif - a.dif;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.nombre.localeCompare(b.nombre);
  });
}

export default router;
