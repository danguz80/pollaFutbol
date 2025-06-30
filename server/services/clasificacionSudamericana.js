import { pool } from '../db/pool.js';

// Lógica para determinar y actualizar los clasificados de cada cruce de Playoffs y avanzar todas las rondas
export const definirClasificadosPlayoffs = async () => {
  // Definir el orden de las rondas de eliminación directa
  const rondas = [
    { actual: 'Knockout Round Play-offs', siguiente: 'Octavos de Final' },
    { actual: 'Octavos de Final', siguiente: 'Cuartos de Final' },
    { actual: 'Cuartos de Final', siguiente: 'Semifinales' },
    { actual: 'Semifinales', siguiente: 'Final' }
  ];

  for (const ronda of rondas) {
    // 1. Obtener todos los cruces de la ronda actual agrupados por sigla
    const { rows: cruces } = await pool.query(`
      SELECT clasificado, array_agg(fixture_id ORDER BY fecha) as fixtures
      FROM sudamericana_fixtures
      WHERE ronda = $1
      GROUP BY clasificado
      ORDER BY clasificado
    `, [ronda.actual]);

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

      // 3. En la ronda siguiente, reemplazar la sigla por el club y eliminar la otra sigla si queda
      if (ganador) {
        // Reemplaza la sigla por el club
        await pool.query(
          `UPDATE sudamericana_fixtures
           SET equipo_local = REPLACE(equipo_local, $1, $2),
               equipo_visita = REPLACE(equipo_visita, $1, $2)
           WHERE ronda = $3 AND (equipo_local LIKE '%' || $1 || '%' OR equipo_visita LIKE '%' || $1 || '%')`,
          [cruce.clasificado, ganador, ronda.siguiente]
        );
        // Elimina cualquier sigla que quede (WO., WC., WS., WPO) si ya no es el club
        await pool.query(
          `UPDATE sudamericana_fixtures
           SET equipo_local = REGEXP_REPLACE(equipo_local, '(WO\\.[A-H]|WC[1-4]|WS[1-2]|WPO[1-8])', '', 'g'),
               equipo_visita = REGEXP_REPLACE(equipo_visita, '(WO\\.[A-H]|WC[1-4]|WS[1-2]|WPO[1-8])', '', 'g')
           WHERE ronda = $1`,
          [ronda.siguiente]
        );
      }
    }
  }
};
