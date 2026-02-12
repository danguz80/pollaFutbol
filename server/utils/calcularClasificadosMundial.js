import { pool } from '../db/pool.js';

// Función auxiliar para calcular tabla OFICIAL de un grupo (desde resultados reales)
export async function calcularTablaOficial(grupo, jornadasNumeros) {
  const equipos = {};
  const enfrentamientos = {}; // Para guardar resultados directos entre equipos
  
  // Obtener todos los partidos del grupo en las jornadas especificadas (típicamente J1-J3 para fase de grupos)
  const result = await pool.query(
    `SELECT p.*, j.numero as jornada_numero
     FROM mundial_partidos p
     JOIN mundial_jornadas j ON p.jornada_id = j.id
     WHERE j.numero = ANY($1)
       AND p.grupo = $2
     ORDER BY j.numero`,
    [jornadasNumeros, grupo]
  );

  // Inicializar equipos
  result.rows.forEach(partido => {
    if (!equipos[partido.equipo_local]) {
      equipos[partido.equipo_local] = {
        nombre: partido.equipo_local,
        puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0
      };
      enfrentamientos[partido.equipo_local] = {};
    }
    if (!equipos[partido.equipo_visitante]) {
      equipos[partido.equipo_visitante] = {
        nombre: partido.equipo_visitante,
        puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0
      };
      enfrentamientos[partido.equipo_visitante] = {};
    }

    // Procesar solo si hay resultado
    if (partido.resultado_local !== null && partido.resultado_visitante !== null) {
      // Guardar resultado del enfrentamiento directo
      if (!enfrentamientos[partido.equipo_local][partido.equipo_visitante]) {
        enfrentamientos[partido.equipo_local][partido.equipo_visitante] = {
          gf: 0, gc: 0, puntos: 0
        };
      }
      if (!enfrentamientos[partido.equipo_visitante][partido.equipo_local]) {
        enfrentamientos[partido.equipo_visitante][partido.equipo_local] = {
          gf: 0, gc: 0, puntos: 0
        };
      }
      
      enfrentamientos[partido.equipo_local][partido.equipo_visitante].gf += partido.resultado_local;
      enfrentamientos[partido.equipo_local][partido.equipo_visitante].gc += partido.resultado_visitante;
      enfrentamientos[partido.equipo_visitante][partido.equipo_local].gf += partido.resultado_visitante;
      enfrentamientos[partido.equipo_visitante][partido.equipo_local].gc += partido.resultado_local;
      
      equipos[partido.equipo_local].pj++;
      equipos[partido.equipo_visitante].pj++;
      equipos[partido.equipo_local].gf += partido.resultado_local;
      equipos[partido.equipo_local].gc += partido.resultado_visitante;
      equipos[partido.equipo_visitante].gf += partido.resultado_visitante;
      equipos[partido.equipo_visitante].gc += partido.resultado_local;

      if (partido.resultado_local > partido.resultado_visitante) {
        equipos[partido.equipo_local].puntos += 3;
        equipos[partido.equipo_local].pg++;
        equipos[partido.equipo_visitante].pp++;
        enfrentamientos[partido.equipo_local][partido.equipo_visitante].puntos += 3;
      } else if (partido.resultado_local < partido.resultado_visitante) {
        equipos[partido.equipo_visitante].puntos += 3;
        equipos[partido.equipo_visitante].pg++;
        equipos[partido.equipo_local].pp++;
        enfrentamientos[partido.equipo_visitante][partido.equipo_local].puntos += 3;
      } else {
        equipos[partido.equipo_local].puntos++;
        equipos[partido.equipo_visitante].puntos++;
        equipos[partido.equipo_local].pe++;
        equipos[partido.equipo_visitante].pe++;
        enfrentamientos[partido.equipo_local][partido.equipo_visitante].puntos += 1;
        enfrentamientos[partido.equipo_visitante][partido.equipo_local].puntos += 1;
      }
    }
  });

  // Calcular diferencia de goles
  Object.values(equipos).forEach(e => {
    e.dif = e.gf - e.gc;
  });

  // Ordenar con criterios de desempate oficiales de FIFA
  const tabla = Object.values(equipos).sort((a, b) => {
    // 1. Mayor cantidad de puntos
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    
    // 2. Resultado del enfrentamiento directo (solo si ambos tienen mismo puntaje)
    if (enfrentamientos[a.nombre] && enfrentamientos[a.nombre][b.nombre]) {
      const puntosDirectoA = enfrentamientos[a.nombre][b.nombre].puntos;
      const puntosDirectoB = enfrentamientos[b.nombre][a.nombre].puntos;
      
      if (puntosDirectoA !== puntosDirectoB) {
        return puntosDirectoB - puntosDirectoA; // Mayor puntos en enfrentamiento directo
      }
      
      // Si empatan en puntos directos, usar diferencia de goles en enfrentamiento directo
      const difDirectoA = enfrentamientos[a.nombre][b.nombre].gf - enfrentamientos[a.nombre][b.nombre].gc;
      const difDirectoB = enfrentamientos[b.nombre][a.nombre].gf - enfrentamientos[b.nombre][a.nombre].gc;
      
      if (difDirectoA !== difDirectoB) {
        return difDirectoB - difDirectoA;
      }
    }
    
    // 3. Mayor diferencia de goles
    if (b.dif !== a.dif) return b.dif - a.dif;
    
    // 4. Mayor cantidad de goles a favor
    if (b.gf !== a.gf) return b.gf - a.gf;
    
    // 5. Alfabético (último recurso)
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
      SELECT DISTINCT equipo_local as nombre FROM mundial_partidos WHERE grupo = $1
      UNION
      SELECT DISTINCT equipo_visitante as nombre FROM mundial_partidos WHERE grupo = $1
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
    
    // Obtener pronósticos del usuario en jornadas de fase de grupos
    const pronosticosResult = await client.query(`
      SELECT 
        p.resultado_local,
        p.resultado_visitante,
        pa.equipo_local,
        pa.equipo_visitante
      FROM mundial_pronosticos p
      INNER JOIN mundial_partidos pa ON p.partido_id = pa.id
      INNER JOIN mundial_jornadas j ON pa.jornada_id = j.id
      WHERE p.usuario_id = $1
        AND j.numero = ANY($2)
        AND pa.grupo = $3
    `, [usuarioId, jornadas, grupo]);
    
    // Procesar cada pronóstico
    pronosticosResult.rows.forEach(pron => {
      const local = equipos[pron.equipo_local];
      const visita = equipos[pron.equipo_visitante];
      
      if (!local || !visita) return;
      
      local.pj++;
      visita.pj++;
      local.gf += pron.resultado_local;
      local.gc += pron.resultado_visitante;
      visita.gf += pron.resultado_visitante;
      visita.gc += pron.resultado_local;
      
      if (pron.resultado_local > pron.resultado_visitante) {
        // Gana local
        local.puntos += 3;
        local.pg++;
        visita.pp++;
      } else if (pron.resultado_local < pron.resultado_visitante) {
        // Gana visita
        visita.puntos += 3;
        visita.pg++;
        local.pp++;
      } else {
        // Empate
        local.puntos += 1;
        visita.puntos += 1;
        local.pe++;
        visita.pe++;
      }
    });
    
    // Calcular diferencia de goles
    Object.values(equipos).forEach(e => {
      e.dif = e.gf - e.gc;
    });
    
    // Ordenar igual que tabla oficial
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
