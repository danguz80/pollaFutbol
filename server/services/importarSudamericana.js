import fetch from 'node-fetch';
import { pool } from '../db/pool.js';

export async function importarFixtureSudamericana() {
  const url = 'https://api-football-v1.p.rapidapi.com/v3/fixtures?league=11&season=2025&from=2025-07-14&to=2025-12-31';
  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-key': 'd6d937a953mshf9a52b698359131p1f6c25jsndc7deda0a6f7',
      'x-rapidapi-host': 'api-football-v1.p.rapidapi.com'
    }
  };

  try {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!data.response) throw new Error('No se recibieron partidos');
    let insertados = 0;
    const detalles = [];
    for (const fixture of data.response) {
      // Normalizar nombre de ronda para Playoffs
      let ronda = fixture.league.round;
      if (ronda === 'Knockout Round Play-offs') {
        ronda = 'Playoffs';
      }
      const res = await pool.query(
        `INSERT INTO sudamericana_fixtures (fixture_id, fecha, equipo_local, equipo_visita, goles_local, goles_visita, status, ronda)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (fixture_id) DO NOTHING`,
        [
          fixture.fixture.id,
          fixture.fixture.date,
          fixture.teams.home.name,
          fixture.teams.away.name,
          fixture.goals.home,
          fixture.goals.away,
          fixture.fixture.status.short,
          ronda
        ]
      );
      if (res.rowCount > 0) insertados++;
      detalles.push({
        fixture_id: fixture.fixture.id,
        fecha: fixture.fixture.date,
        local: fixture.teams.home.name,
        visita: fixture.teams.away.name,
        ronda: fixture.league.round
      });
    }
    return { ok: true, total: data.response.length, insertados, detalles };
  } catch (error) {
    console.error(error);
    return { ok: false, error: error.message };
  }
}
