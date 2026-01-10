import { pool } from '../db/pool.js';

// Función auxiliar para calcular tabla OFICIAL de un grupo (desde resultados reales)
export async function calcularTablaOficial(grupo, jornadasNumeros) {
  const equipos = {};
  
  // Obtener todos los partidos del grupo en jornadas 1-6
  // Usar nombre_local y nombre_visita ya que equipo_local_id puede ser NULL
  const result = await pool.query(
    `SELECT p.*, j.numero as jornada_numero
     FROM sudamericana_partidos p
     JOIN sudamericana_jornadas j ON p.jornada_id = j.id
     WHERE j.numero = ANY($1)
       AND EXISTS (
         SELECT 1 FROM sudamericana_equipos el 
         WHERE el.nombre = p.nombre_local AND el.grupo = $2
       )
       AND EXISTS (
         SELECT 1 FROM sudamericana_equipos ev 
         WHERE ev.nombre = p.nombre_visita AND ev.grupo = $2
       )
     ORDER BY j.numero`,
    [jornadasNumeros, grupo]
  );

  // Inicializar equipos
  result.rows.forEach(partido => {
    if (!equipos[partido.nombre_local]) {
      equipos[partido.nombre_local] = {
        nombre: partido.nombre_local,
        puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0
      };
    }
    if (!equipos[partido.nombre_visita]) {
      equipos[partido.nombre_visita] = {
        nombre: partido.nombre_visita,
        puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0
      };
    }

    // Procesar solo si hay resultado
    if (partido.goles_local !== null && partido.goles_visita !== null) {
      equipos[partido.nombre_local].pj++;
      equipos[partido.nombre_visita].pj++;
      equipos[partido.nombre_local].gf += partido.goles_local;
      equipos[partido.nombre_local].gc += partido.goles_visita;
      equipos[partido.nombre_visita].gf += partido.goles_visita;
      equipos[partido.nombre_visita].gc += partido.goles_local;

      if (partido.goles_local > partido.goles_visita) {
        equipos[partido.nombre_local].puntos += 3;
        equipos[partido.nombre_local].pg++;
        equipos[partido.nombre_visita].pp++;
      } else if (partido.goles_local < partido.goles_visita) {
        equipos[partido.nombre_visita].puntos += 3;
        equipos[partido.nombre_visita].pg++;
        equipos[partido.nombre_local].pp++;
      } else {
        equipos[partido.nombre_local].puntos++;
        equipos[partido.nombre_visita].puntos++;
        equipos[partido.nombre_local].pe++;
        equipos[partido.nombre_visita].pe++;
      }
    }
  });

  // Calcular diferencia de goles
  Object.values(equipos).forEach(e => {
    e.dif = e.gf - e.gc;
  });

  // Ordenar con criterios de desempate oficiales SUDAMERICANA (diferente a Libertadores)
  const tabla = Object.values(equipos).sort((a, b) => {
    // 1. Mayor cantidad de puntos
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    
    // 2. Mayor diferencia de goles (SUDAMERICANA NO USA ENFRENTAMIENTO DIRECTO)
    if (b.dif !== a.dif) return b.dif - a.dif;
    
    // 3. Mayor cantidad de goles a favor
    if (b.gf !== a.gf) return b.gf - a.gf;
    
    // 4. Mayor cantidad de goles como visitante (no implementado)
    // 5. Ranking Conmebol (usamos alfabético como placeholder)
    return a.nombre.localeCompare(b.nombre);
  });

  return tabla;
}

// Función auxiliar para calcular tabla de un usuario en un grupo
export async function calcularTablaUsuario(usuarioId, grupo, jornadas) {
  const client = await pool.connect();
  
  try {
    // Obtener equipos del grupo
    const equiposResult = await client.query(`
      SELECT id, nombre FROM sudamericana_equipos WHERE grupo = $1
    `, [grupo]);
    
    const equipos = {};
    equiposResult.rows.forEach(e => {
      equipos[e.nombre] = {
        nombre: e.nombre,
        puntos: 0,
        pj: 0,
        pg: 0,
        pe: 0,
        pp: 0,
        gf: 0,
        gc: 0,
        dif: 0
      };
    });

    // Obtener pronósticos del usuario para este grupo en las jornadas especificadas
    const pronosticosResult = await client.query(`
      SELECT p.nombre_local, p.nombre_visita, lp.goles_local, lp.goles_visita
      FROM sudamericana_pronosticos lp
      JOIN sudamericana_partidos p ON lp.partido_id = p.id
      JOIN sudamericana_jornadas j ON p.jornada_id = j.id
      WHERE lp.usuario_id = $1
        AND j.numero = ANY($2)
        AND EXISTS (
          SELECT 1 FROM sudamericana_equipos el 
          WHERE el.nombre = p.nombre_local AND el.grupo = $3
        )
        AND EXISTS (
          SELECT 1 FROM sudamericana_equipos ev 
          WHERE ev.nombre = p.nombre_visita AND ev.grupo = $3
        )
    `, [usuarioId, jornadas, grupo]);

    // Procesar pronósticos
    pronosticosResult.rows.forEach(pronostico => {
      const local = pronostico.nombre_local;
      const visita = pronostico.nombre_visita;
      const golesLocal = pronostico.goles_local;
      const golesVisita = pronostico.goles_visita;

      if (golesLocal === null || golesVisita === null) return;

      if (!equipos[local] || !equipos[visita]) return;

      equipos[local].pj++;
      equipos[visita].pj++;
      equipos[local].gf += golesLocal;
      equipos[local].gc += golesVisita;
      equipos[visita].gf += golesVisita;
      equipos[visita].gc += golesLocal;

      if (golesLocal > golesVisita) {
        equipos[local].puntos += 3;
        equipos[local].pg++;
        equipos[visita].pp++;
      } else if (golesLocal < golesVisita) {
        equipos[visita].puntos += 3;
        equipos[visita].pg++;
        equipos[local].pp++;
      } else {
        equipos[local].puntos++;
        equipos[visita].puntos++;
        equipos[local].pe++;
        equipos[visita].pe++;
      }
    });

    // Calcular diferencia de goles
    Object.values(equipos).forEach(e => {
      e.dif = e.gf - e.gc;
    });

    // Ordenar con criterios similares
    const tabla = Object.values(equipos).sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      if (b.dif !== a.dif) return b.dif - a.dif;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.nombre.localeCompare(b.nombre);
    });

    return tabla;
  } finally {
    client.release();
  }
}
