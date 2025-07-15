import { pool } from './db/pool.js';

async function checkWP() {
  try {
    // Verificar qué equipos son WP04 y WP06
    console.log('🔍 Verificando mapeo de WP04 y WP06:');
    const result = await pool.query(`
      SELECT equipo_local, equipo_visita, clasificado, ronda
      FROM sudamericana_fixtures 
      WHERE (equipo_local = 'WP04' OR equipo_visita = 'WP04' OR equipo_local = 'WP06' OR equipo_visita = 'WP06')
      AND ronda = 'Knockout Round Play-offs'
      ORDER BY fixture_id
    `);
    
    result.rows.forEach(row => {
      console.log(`${row.equipo_local} vs ${row.equipo_visita} | Clasificado: ${row.clasificado}`);
    });
    
    // Verificar todos los pronósticos del usuario 2 
    console.log('\n🔍 Todos los pronósticos del usuario 2:');
    const allPron = await pool.query(`
      SELECT p.fixture_id, p.goles_local, p.goles_visita, f.equipo_local, f.equipo_visita, f.ronda, f.clasificado
      FROM pronosticos_sudamericana p
      JOIN sudamericana_fixtures f ON p.fixture_id = f.fixture_id
      WHERE p.usuario_id = 2 AND f.ronda = 'Knockout Round Play-offs'
      ORDER BY p.fixture_id
    `);
    
    allPron.rows.forEach(row => {
      if ((row.equipo_local === 'WP04' || row.equipo_visita === 'WP04') || (row.equipo_local === 'WP06' || row.equipo_visita === 'WP06')) {
        console.log(`${row.equipo_local} vs ${row.equipo_visita} | ${row.goles_local}-${row.goles_visita} | Clasificado: ${row.clasificado}`);
      }
    });
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkWP();
