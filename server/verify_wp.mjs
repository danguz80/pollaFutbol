import { pool } from './db/pool.js';

async function verifyWP() {
  try {
    console.log('🔍 Verificando cálculo de WP04 y WP06 en Knockout Round Play-offs:');
    
    // Obtener partidos que clasifican a WP04 y WP06
    const playoffs = await pool.query(`
      SELECT fixture_id, equipo_local, equipo_visita, clasificado, ronda
      FROM sudamericana_fixtures 
      WHERE clasificado IN ('WP04', 'WP06') AND ronda = 'Knockout Round Play-offs'
      ORDER BY fixture_id
    `);
    
    console.log('Partidos que clasifican a WP04 y WP06:');
    playoffs.rows.forEach(row => {
      console.log(`${row.fixture_id}: ${row.equipo_local} vs ${row.equipo_visita} | Clasificado: ${row.clasificado}`);
    });
    
    // Obtener pronósticos del usuario 2 para estos partidos
    const pronosticos = await pool.query(`
      SELECT p.fixture_id, p.goles_local, p.goles_visita, p.penales_local, p.penales_visita,
             f.equipo_local, f.equipo_visita, f.clasificado
      FROM pronosticos_sudamericana p
      JOIN sudamericana_fixtures f ON p.fixture_id = f.fixture_id
      WHERE p.usuario_id = 2 AND f.clasificado IN ('WP04', 'WP06') AND f.ronda = 'Knockout Round Play-offs'
      ORDER BY p.fixture_id
    `);
    
    console.log('\nPronósticos del usuario 2 para WP04 y WP06:');
    pronosticos.rows.forEach(row => {
      console.log(`${row.fixture_id}: ${row.equipo_local} vs ${row.equipo_visita} | ${row.goles_local}-${row.goles_visita} | Clasificado: ${row.clasificado}`);
      
      // Determinar ganador
      let ganador = 'Empate';
      if (row.goles_local > row.goles_visita) {
        ganador = row.equipo_local;
      } else if (row.goles_visita > row.goles_local) {
        ganador = row.equipo_visita;
      } else if (row.penales_local !== null && row.penales_visita !== null) {
        if (row.penales_local > row.penales_visita) {
          ganador = row.equipo_local;
        } else if (row.penales_visita > row.penales_local) {
          ganador = row.equipo_visita;
        }
      }
      console.log(`  Ganador: ${ganador}`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifyWP();
