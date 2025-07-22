import { pool } from './db/pool.js';

async function checkSiglas() {
  try {
    console.log('=== VERIFICAR SISTEMA DE SIGLAS ===');
    
    // Buscar tablas relacionadas con siglas o reemplazos
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE '%sigla%'
    `);
    console.log('Tablas con siglas:', tables.rows);
    
    // Buscar cualquier tabla que pueda tener mapeo de equipos
    const allTables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE '%equipo%'
    `);
    console.log('Tablas con equipos:', allTables.rows);
    
    // Verificar si hay alguna función o mecanismo de reemplazo
    console.log('\n=== VERIFICAR DATOS ORIGINALES EN FIXTURES ===');
    const fixturesOrig = await pool.query(`
      SELECT fixture_id, equipo_local, equipo_visita, ronda
      FROM sudamericana_fixtures 
      WHERE ronda = 'Semifinales'
      ORDER BY fixture_id
    `);
    console.log('Fixtures originales:', fixturesOrig.rows);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkSiglas();
