import { pool } from './db/pool.js';

async function debugFixtureEndpoint() {
  try {
    console.log('=== DEBUG ENDPOINT /api/sudamericana/fixture/:ronda ===');
    
    // 1. Ver fixture original de la BD
    console.log('\\n1. FIXTURE ORIGINAL (sudamericana_fixtures):');
    const fixturesOriginales = await pool.query(`
      SELECT fixture_id, equipo_local, equipo_visita, goles_local, goles_visita, ronda 
      FROM sudamericana_fixtures 
      WHERE ronda = 'Knockout Round Play-offs' 
      AND fixture_id IN ('1377217', '1377218')
      ORDER BY fixture_id
    `);
    fixturesOriginales.rows.forEach(row => {
      console.log(`fixture_id: ${row.fixture_id} | ${row.equipo_local} ${row.goles_local || 'NULL'} vs ${row.goles_visita || 'NULL'} ${row.equipo_visita}`);
    });
    
    // 2. Ver pronósticos del usuario 3
    console.log('\\n2. PRONÓSTICOS USUARIO 3 (pronosticos_sudamericana):');
    const pronosticos = await pool.query(`
      SELECT fixture_id, equipo_local, equipo_visita, goles_local, goles_visita 
      FROM pronosticos_sudamericana 
      WHERE usuario_id = 3 
      AND fixture_id IN ('1377217', '1377218')
      ORDER BY fixture_id
    `);
    pronosticos.rows.forEach(row => {
      console.log(`fixture_id: ${row.fixture_id} | ${row.equipo_local} ${row.goles_local} vs ${row.goles_visita} ${row.equipo_visita}`);
    });
    
    // 3. Ver qué está devolviendo exactamente el cálculo del backend
    console.log('\\n3. SIMULANDO LÓGICA DEL BACKEND:');
    
    // Obtener todos los fixtures
    const todosFixtures = await pool.query("SELECT * FROM sudamericana_fixtures WHERE ronda = 'Knockout Round Play-offs'");
    console.log(`Total fixtures Knockout: ${todosFixtures.rows.length}`);
    
    // Obtener pronósticos del usuario 3
    const todosPronosticos = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = 3');
    console.log(`Total pronósticos usuario 3: ${todosPronosticos.rows.length}`);
    
    // Ver específicamente los fixtures 1377217 y 1377218
    const fixture1 = todosFixtures.rows.find(f => f.fixture_id == '1377217');
    const fixture2 = todosFixtures.rows.find(f => f.fixture_id == '1377218');
    
    console.log('\\n4. FIXTURES ESPECÍFICOS:');
    console.log('Fixture 1377217 (original):', {
      equipo_local: fixture1?.equipo_local,
      equipo_visita: fixture1?.equipo_visita,
      goles_local: fixture1?.goles_local,
      goles_visita: fixture1?.goles_visita
    });
    
    console.log('Fixture 1377218 (original):', {
      equipo_local: fixture2?.equipo_local,
      equipo_visita: fixture2?.equipo_visita,
      goles_local: fixture2?.goles_local,
      goles_visita: fixture2?.goles_visita
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit();
  }
}

debugFixtureEndpoint();
