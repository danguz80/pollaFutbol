import { pool } from './db/pool.js';

async function checkSpecificFixtures() {
  try {
    const result = await pool.query(`
      SELECT fixture_id, equipo_local, equipo_visita, clasificado 
      FROM sudamericana_fixtures 
      WHERE clasificado IN ('WO.E', 'WO.G') AND ronda = 'Octavos de Final'
    `);
    
    console.log('Partidos WO.E y WO.G en Octavos de Final:');
    result.rows.forEach(row => {
      console.log(`ID: ${row.fixture_id} | ${row.equipo_local} vs ${row.equipo_visita} | Clasificado: ${row.clasificado}`);
    });
    
    // También verificar los pronósticos del usuario 2 para estos partidos
    const pronosticos = await pool.query(`
      SELECT p.fixture_id, p.goles_local, p.goles_visita, p.penales_local, p.penales_visita
      FROM pronosticos_sudamericana p
      WHERE p.usuario_id = 2 AND p.fixture_id IN (
        SELECT fixture_id FROM sudamericana_fixtures 
        WHERE clasificado IN ('WO.E', 'WO.G') AND ronda = 'Octavos de Final'
      )
    `);
    
    console.log('\nPronósticos del usuario 2 para estos partidos:');
    pronosticos.rows.forEach(pron => {
      console.log(`ID: ${pron.fixture_id} | Pronóstico: ${pron.goles_local}-${pron.goles_visita} | Penales: ${pron.penales_local}-${pron.penales_visita}`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSpecificFixtures();
