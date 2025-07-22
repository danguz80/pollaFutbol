import { pool } from './db/pool.js';

async function checkTables() {
  try {
    console.log('=== PRONOSTICOS USUARIO ID 2 - SEMIFINALES ===');
    const pronosticos = await pool.query(`
      SELECT fixture_id, equipo_local, equipo_visita, goles_local, goles_visita, ganador 
      FROM pronosticos_sudamericana 
      WHERE usuario_id = 2 AND fixture_id IN (
        SELECT fixture_id FROM sudamericana_fixtures WHERE ronda = 'Semifinales'
      )
      ORDER BY fixture_id
    `);
    console.log('Pronósticos:', pronosticos.rows);
    
    console.log('\n=== FIXTURES SEMIFINALES ===');
    const fixtures = await pool.query(`
      SELECT fixture_id, equipo_local, equipo_visita, goles_local, goles_visita, clasificado, ronda
      FROM sudamericana_fixtures 
      WHERE ronda = 'Semifinales'
      ORDER BY fixture_id
    `);
    console.log('Fixtures:', fixtures.rows);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkTables();
