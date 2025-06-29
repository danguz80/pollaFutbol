import { pool } from '../db/pool.js';

// Lógica para determinar y actualizar los clasificados de cada cruce de Playoffs
definirClasificadosPlayoffs = async () => {
  // 1. Obtener todos los cruces de Playoffs agrupados por sigla
  const { rows: cruces } = await pool.query(`
    SELECT clasificado, array_agg(fixture_id ORDER BY fecha) as fixtures
    FROM sudamericana_fixtures
    WHERE ronda = 'Knockout Round Play-offs'
    GROUP BY clasificado
    ORDER BY clasificado
  `);

  for (const cruce of cruces) {
    const [fixtureId1, fixtureId2] = cruce.fixtures;
    // Obtener datos de ambos partidos
    const { rows: partidos } = await pool.query(
      `SELECT equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita
       FROM sudamericana_fixtures
       WHERE fixture_id IN ($1, $2)
       ORDER BY fecha`,
      [fixtureId1, fixtureId2]
    );

    // Sumar goles globales
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
      // Empate global, definir por penales
      let penalesA = 0, penalesB = 0;
      for (const partido of partidos) {
        penalesA += partido.penales_local || 0;
        penalesB += partido.penales_visita || 0;
      }
      if (penalesA > penalesB) ganador = equipoA;
      else if (penalesB > penalesA) ganador = equipoB;
      // Si sigue empate, puedes agregar lógica extra aquí
    }

    // 3. Actualizar la siguiente ronda (octavos, cuartos, etc) reemplazando la sigla por el nombre del clasificado
    if (ganador) {
      await pool.query(
        `UPDATE sudamericana_fixtures
         SET equipo_local = CASE WHEN equipo_local = $1 THEN $2 ELSE equipo_local END,
             equipo_visita = CASE WHEN equipo_visita = $1 THEN $2 ELSE equipo_visita END
         WHERE ronda IN ('Octavos de Final', 'Cuartos de Final', 'Semifinales', 'Final')`,
        [cruce.clasificado, ganador]
      );
    }
  }
};

export { definirClasificadosPlayoffs };
