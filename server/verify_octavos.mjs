import { pool } from './db/pool.js';

async function verifyOctavos() {
  try {
    console.log('🔍 Verificando estructura real de Octavos de Final:');
    
    const octavos = await pool.query(`
      SELECT fixture_id, equipo_local, equipo_visita, clasificado, ronda
      FROM sudamericana_fixtures 
      WHERE ronda = 'Octavos de Final'
      ORDER BY fixture_id
    `);
    
    console.log('Todos los partidos de Octavos de Final:');
    octavos.rows.forEach(row => {
      console.log(`${row.fixture_id}: ${row.equipo_local} vs ${row.equipo_visita} | Clasificado: ${row.clasificado}`);
    });
    
    // Buscar partidos donde aparece Cienciano
    console.log('\n🔍 Partidos donde aparece Cienciano:');
    const cienciano = octavos.rows.filter(row => 
      row.equipo_local.includes('Cienciano') || row.equipo_visita.includes('Cienciano')
    );
    
    cienciano.forEach(row => {
      console.log(`${row.fixture_id}: ${row.equipo_local} vs ${row.equipo_visita} | Clasificado: ${row.clasificado}`);
    });
    
    // Buscar partidos donde aparece Vasco
    console.log('\n🔍 Partidos donde aparece Vasco:');
    const vasco = octavos.rows.filter(row => 
      row.equipo_local.includes('Vasco') || row.equipo_visita.includes('Vasco')
    );
    
    vasco.forEach(row => {
      console.log(`${row.fixture_id}: ${row.equipo_local} vs ${row.equipo_visita} | Clasificado: ${row.clasificado}`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifyOctavos();
