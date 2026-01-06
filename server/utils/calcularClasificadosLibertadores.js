import { pool } from '../db/pool.js';

// Función auxiliar para calcular tabla OFICIAL de un grupo (desde resultados reales)
export async function calcularTablaOficial(grupo, jornadasNumeros) {
  const equipos = {};
  const enfrentamientos = {}; // Para guardar resultados directos entre equipos
  
  // Obtener todos los partidos del grupo en jornadas 1-6
  // Usar nombre_local y nombre_visita ya que equipo_local_id puede ser NULL
  const result = await pool.query(
    `SELECT p.*, j.numero as jornada_numero
     FROM libertadores_partidos p
     JOIN libertadores_jornadas j ON p.jornada_id = j.id
     WHERE j.numero = ANY($1)
       AND EXISTS (
         SELECT 1 FROM libertadores_equipos el 
         WHERE el.nombre = p.nombre_local AND el.grupo = $2
       )
       AND EXISTS (
         SELECT 1 FROM libertadores_equipos ev 
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
      enfrentamientos[partido.nombre_local] = {};
    }
    if (!equipos[partido.nombre_visita]) {
      equipos[partido.nombre_visita] = {
        nombre: partido.nombre_visita,
        puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0
      };
      enfrentamientos[partido.nombre_visita] = {};
    }

    // Procesar solo si hay resultado
    if (partido.goles_local !== null && partido.goles_visita !== null) {
      // Guardar resultado del enfrentamiento directo
      if (!enfrentamientos[partido.nombre_local][partido.nombre_visita]) {
        enfrentamientos[partido.nombre_local][partido.nombre_visita] = {
          gf: 0, gc: 0, puntos: 0
        };
      }
      if (!enfrentamientos[partido.nombre_visita][partido.nombre_local]) {
        enfrentamientos[partido.nombre_visita][partido.nombre_local] = {
          gf: 0, gc: 0, puntos: 0
        };
      }
      
      enfrentamientos[partido.nombre_local][partido.nombre_visita].gf += partido.goles_local;
      enfrentamientos[partido.nombre_local][partido.nombre_visita].gc += partido.goles_visita;
      enfrentamientos[partido.nombre_visita][partido.nombre_local].gf += partido.goles_visita;
      enfrentamientos[partido.nombre_visita][partido.nombre_local].gc += partido.goles_local;
      
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
        enfrentamientos[partido.nombre_local][partido.nombre_visita].puntos += 3;
      } else if (partido.goles_local < partido.goles_visita) {
        equipos[partido.nombre_visita].puntos += 3;
        equipos[partido.nombre_visita].pg++;
        equipos[partido.nombre_local].pp++;
        enfrentamientos[partido.nombre_visita][partido.nombre_local].puntos += 3;
      } else {
        equipos[partido.nombre_local].puntos++;
        equipos[partido.nombre_visita].puntos++;
        equipos[partido.nombre_local].pe++;
        equipos[partido.nombre_visita].pe++;
        enfrentamientos[partido.nombre_local][partido.nombre_visita].puntos += 1;
        enfrentamientos[partido.nombre_visita][partido.nombre_local].puntos += 1;
      }
    }
  });

  // Calcular diferencia de goles
  Object.values(equipos).forEach(e => {
    e.dif = e.gf - e.gc;
  });

  // Ordenar con criterios de desempate oficiales
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
      SELECT id, nombre FROM libertadores_equipos WHERE grupo = $1
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
    
    // Obtener pronósticos del usuario en jornadas de fase de grupos (J1-J6)
    const pronosticosResult = await client.query(`
      SELECT 
        p.goles_local,
        p.goles_visita,
        pa.nombre_local,
        pa.nombre_visita
      FROM libertadores_pronosticos p
      INNER JOIN libertadores_partidos pa ON p.partido_id = pa.id
      INNER JOIN libertadores_jornadas j ON pa.jornada_id = j.id
      WHERE p.usuario_id = $1
        AND j.numero = ANY($2)
        AND pa.nombre_local IN (SELECT nombre FROM libertadores_equipos WHERE grupo = $3)
        AND pa.nombre_visita IN (SELECT nombre FROM libertadores_equipos WHERE grupo = $3)
    `, [usuarioId, jornadas, grupo]);
    
    // Procesar cada pronóstico
    pronosticosResult.rows.forEach(pron => {
      const local = equipos[pron.nombre_local];
      const visita = equipos[pron.nombre_visita];
      
      if (!local || !visita) return;
      
      local.pj++;
      visita.pj++;
      local.gf += pron.goles_local;
      local.gc += pron.goles_visita;
      visita.gf += pron.goles_visita;
      visita.gc += pron.goles_local;
      
      if (pron.goles_local > pron.goles_visita) {
        // Gana local
        local.puntos += 3;
        local.pg++;
        visita.pp++;
      } else if (pron.goles_local < pron.goles_visita) {
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
