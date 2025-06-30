import { pool } from '../db/pool.js';

// Lógica para determinar y actualizar los clasificados de cada cruce de Playoffs y avanzar todas las rondas
export const definirClasificadosPlayoffs = async () => {
  const rondas = [
    { actual: 'Knockout Round Play-offs', siguiente: 'Octavos de Final' },
    { actual: 'Octavos de Final', siguiente: 'Cuartos de Final' },
    { actual: 'Cuartos de Final', siguiente: 'Semifinales' },
    { actual: 'Semifinales', siguiente: 'Final' }
  ];

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
        `SELECT equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita
         FROM sudamericana_fixtures
         WHERE fixture_id IN ($1, $2)
         ORDER BY fecha`,
        [fixtureId1, fixtureId2]
      );
      let equipos = {};
      for (const partido of partidos) {
        equipos[partido.equipo_local] = (equipos[partido.equipo_local] || 0) + (partido.goles_local || 0);
        equipos[partido.equipo_visita] = (equipos[partido.equipo_visita] || 0) + (partido.goles_visita || 0);
      }
      const [equipoA, equipoB] = Object.keys(equipos);
      const golesA = equipos[equipoA];
      const golesB = equipos[equipoB];
      let ganador = null;
      if (golesA > golesB) ganador = equipoA;
      else if (golesB > golesA) ganador = equipoB;
      else {
        let penalesA = 0, penalesB = 0;
        for (const partido of partidos) {
          penalesA += partido.penales_local || 0;
          penalesB += partido.penales_visita || 0;
        }
        if (penalesA > penalesB) ganador = equipoA;
        else if (penalesB > penalesA) ganador = equipoB;
      }
      if (ganador) clasificados[cruce.clasificado] = ganador;
    }

    // 2. Avanzar cruces en la ronda siguiente
    const { rows: partidosSiguiente } = await pool.query(
      `SELECT fixture_id, equipo_local, equipo_visita FROM sudamericana_fixtures WHERE ronda = $1`,
      [ronda.siguiente]
    );
    for (const partido of partidosSiguiente) {
      let nuevoLocal = partido.equipo_local;
      let nuevoVisita = partido.equipo_visita;
      // Reemplazar siglas por club si ya está definido
      for (const sigla in clasificados) {
        if (nuevoLocal && nuevoLocal.includes(sigla)) {
          nuevoLocal = nuevoLocal.replace(sigla, clasificados[sigla]);
        }
        if (nuevoVisita && nuevoVisita.includes(sigla)) {
          nuevoVisita = nuevoVisita.replace(sigla, clasificados[sigla]);
        }
      }
      // Limpiar barras y espacios sobrantes
      nuevoLocal = nuevoLocal.replace(/\s*\/\s*/g, '').replace(/^\s*\/|\/\s*$/g, '').trim();
      nuevoVisita = nuevoVisita.replace(/\s*\/\s*/g, '').replace(/^\s*\/|\/\s*$/g, '').trim();
      if (nuevoLocal === '') nuevoLocal = null;
      if (nuevoVisita === '') nuevoVisita = null;
      await pool.query(
        `UPDATE sudamericana_fixtures SET equipo_local = $1, equipo_visita = $2 WHERE fixture_id = $3`,
        [nuevoLocal, nuevoVisita, partido.fixture_id]
      );
    }
  }
};
