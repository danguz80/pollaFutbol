import { pool } from '../db/pool.js';

// Lógica para determinar y actualizar los clasificados de cada cruce de Playoffs y avanzar todas las rondas
export const definirClasificadosPlayoffs = async () => {
  const rondas = [
    { actual: 'Knockout Round Play-offs', siguiente: 'Octavos de Final' },
    { actual: 'Octavos de Final', siguiente: 'Cuartos de Final' },
    { actual: 'Cuartos de Final', siguiente: 'Semifinales' },
    { actual: 'Semifinales', siguiente: 'Final' }
  ];

  // Asegurar que no haya NULL en equipo_local ni equipo_visita antes de avanzar cruces
  await pool.query(`UPDATE sudamericana_fixtures SET equipo_local = 'Por definir' WHERE equipo_local IS NULL OR equipo_local = ''`);
  await pool.query(`UPDATE sudamericana_fixtures SET equipo_visita = 'Por definir' WHERE equipo_visita IS NULL OR equipo_visita = ''`);

  // --- FIX: nunca pasar undefined ni null a la base de datos ---
  // Limpiar todos los partidos antes de avanzar cruces
  const { rows: fixtures } = await pool.query('SELECT fixture_id, equipo_local, equipo_visita, clasificado FROM sudamericana_fixtures');
  for (const f of fixtures) {
    let nuevoLocal = (typeof f.equipo_local === 'undefined' || f.equipo_local === null || f.equipo_local === '' || f.equipo_local === 'null') ? (f.clasificado || 'Por definir') : f.equipo_local;
    let nuevoVisita = (typeof f.equipo_visita === 'undefined' || f.equipo_visita === null || f.equipo_visita === '' || f.equipo_visita === 'null') ? (f.clasificado || 'Por definir') : f.equipo_visita;
    await pool.query(
      `UPDATE sudamericana_fixtures SET equipo_local = $1, equipo_visita = $2 WHERE fixture_id = $3`,
      [nuevoLocal, nuevoVisita, f.fixture_id]
    );
  }

  // 1. Construir un diccionario de sigla => club clasificado para cada ronda
  let clasificados = {};
  for (const ronda of rondas) {
    // Obtener ganadores de la ronda actual
    const { rows: cruces } = await pool.query(`
      SELECT clasificado, array_agg(fixture_id ORDER BY fecha) as fixtures
      FROM sudamericana_fixtures
      WHERE ronda = $1
      GROUP BY clasificado
      ORDER BY clasificado
    `, [ronda.actual]);

    for (const cruce of cruces) {
      const [fixtureId1, fixtureId2] = cruce.fixtures;
      const { rows: partidos } = await pool.query(
        `SELECT 
           sf.equipo_local, sf.equipo_visita, sf.fixture_id,
           COALESCE(ps.goles_local, sf.goles_local) as goles_local,
           COALESCE(ps.goles_visita, sf.goles_visita) as goles_visita,
           COALESCE(ps.penales_local, sf.penales_local) as penales_local,
           COALESCE(ps.penales_visita, sf.penales_visita) as penales_visita
         FROM sudamericana_fixtures sf
         LEFT JOIN pronosticos_sudamericana ps ON sf.fixture_id = ps.fixture_id AND ps.usuario_id = 3
         WHERE sf.fixture_id IN ($1, $2)
         ORDER BY sf.fecha`,
        [fixtureId1, fixtureId2]
      );

      if (partidos.length === 2) {
        // IDA Y VUELTA: cálculo cruzado correcto
        const ida = partidos[0];
        const vuelta = partidos[1];
        
        // Equipo A es el local en ida
        const equipoA = ida.equipo_local;
        const equipoB = ida.equipo_visita;
        
        // Calcular goles globales con lógica cruzada
        const golesA = (ida.goles_local || 0) + (vuelta.goles_visita || 0);
        const golesB = (ida.goles_visita || 0) + (vuelta.goles_local || 0);
        
        let ganador = null;
        if (golesA > golesB) {
          ganador = equipoA;
        } else if (golesB > golesA) {
          ganador = equipoB;
        } else {
          // Empate: usar penales del partido de vuelta
          const penalesA = vuelta.penales_local || 0;
          const penalesB = vuelta.penales_visita || 0;
          if (penalesA > penalesB) {
            ganador = equipoA;
          } else if (penalesB > penalesA) {
            ganador = equipoB;
          }
        }
        
        if (ganador) clasificados[cruce.clasificado] = ganador;
      } else if (partidos.length === 1) {
        // PARTIDO ÚNICO (como Final): lógica simple
        const partido = partidos[0];
        const equipoA = partido.equipo_local;
        const equipoB = partido.equipo_visita;
        const golesA = partido.goles_local || 0;
        const golesB = partido.goles_visita || 0;
        
        let ganador = null;
        if (golesA > golesB) {
          ganador = equipoA;
        } else if (golesB > golesA) {
          ganador = equipoB;
        } else {
          // Empate: usar penales
          const penalesA = partido.penales_local || 0;
          const penalesB = partido.penales_visita || 0;
          if (penalesA > penalesB) {
            ganador = equipoA;
          } else if (penalesB > penalesA) {
            ganador = equipoB;
          }
        }
        
        if (ganador) clasificados[cruce.clasificado] = ganador;
      }
    }

    // 2. Avanzar cruces en la ronda siguiente
    const { rows: partidosSiguiente } = await pool.query(
      `SELECT fixture_id, equipo_local, equipo_visita FROM sudamericana_fixtures WHERE ronda = $1`,
      [ronda.siguiente]
    );
    for (const partido of partidosSiguiente) {
      let nuevoLocal = partido.equipo_local;
      let nuevoVisita = partido.equipo_visita;
      const originalLocal = partido.equipo_local;
      const originalVisita = partido.equipo_visita;
      // Reemplazar siglas por club si ya está definido
      for (const sigla in clasificados) {
        if (nuevoLocal && nuevoLocal.includes(sigla)) {
          nuevoLocal = nuevoLocal.replace(sigla, clasificados[sigla]);
        }
        if (nuevoVisita && nuevoVisita.includes(sigla)) {
          nuevoVisita = nuevoVisita.replace(sigla, clasificados[sigla]);
        }
      }
      // Si después de reemplazar queda vacío, null o solo barras, dejar la sigla original (nunca null ni string vacío)
      if (!nuevoLocal || nuevoLocal.replace(/\s|\//g, '') === '') nuevoLocal = originalLocal || 'Por definir';
      if (!nuevoVisita || nuevoVisita.replace(/\s|\//g, '') === '') nuevoVisita = originalVisita || 'Por definir';
      await pool.query(
        `UPDATE sudamericana_fixtures SET equipo_local = $1, equipo_visita = $2 WHERE fixture_id = $3`,
        [nuevoLocal, nuevoVisita, partido.fixture_id]
      );
    }
  }
};

// ELIMINAR LÓGICA REDUNDANTE Y SIMPLIFICAR AVANCE DE CRUCES
// Nueva función: avanzar equipos ganadores a la siguiente ronda
export const avanzarGanadoresSudamericana = async () => {
  // Definir el orden de las rondas
  const rondas = [
    'Knockout Round Play-offs',
    'Octavos de Final',
    'Cuartos de Final',
    'Semifinales',
    'Final'
  ];
  for (let i = 0; i < rondas.length - 1; i++) {
    const rondaActual = rondas[i];
    const rondaSiguiente = rondas[i + 1];
    // 1. Obtener todos los partidos de la ronda actual
    const { rows: partidos } = await pool.query(
      `SELECT fixture_id, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, clasificado
       FROM sudamericana_fixtures WHERE ronda = $1 ORDER BY fecha ASC`,
      [rondaActual]
    );
    // 2. Para cada partido, determinar el ganador (por goles o penales)
    for (const partido of partidos) {
      let ganadorSigla = null;
      let ganadorNombre = null;
      if (partido.goles_local > partido.goles_visita) {
        ganadorSigla = partido.clasificado || partido.equipo_local;
        ganadorNombre = partido.equipo_local;
      } else if (partido.goles_visita > partido.goles_local) {
        ganadorSigla = partido.clasificado || partido.equipo_visita;
        ganadorNombre = partido.equipo_visita;
      } else if (partido.goles_local !== null && partido.goles_visita !== null) {
        // Empate: definir por penales
        if ((partido.penales_local || 0) > (partido.penales_visita || 0)) {
          ganadorSigla = partido.clasificado || partido.equipo_local;
          ganadorNombre = partido.equipo_local;
        } else if ((partido.penales_visita || 0) > (partido.penales_local || 0)) {
          ganadorSigla = partido.clasificado || partido.equipo_visita;
          ganadorNombre = partido.equipo_visita;
        }
      }
      if (!ganadorSigla || !ganadorNombre) continue;
      // 3. Avanzar el ganador a la siguiente ronda (reemplazar sigla por nombre real)
      await pool.query(
        `UPDATE sudamericana_fixtures
         SET equipo_local = CASE WHEN equipo_local = $1 THEN $2 ELSE equipo_local END,
             equipo_visita = CASE WHEN equipo_visita = $1 THEN $2 ELSE equipo_visita END
         WHERE ronda = $3 AND (equipo_local = $1 OR equipo_visita = $1)`,
        [ganadorSigla, ganadorNombre, rondaSiguiente]
      );
    }
  }
};
