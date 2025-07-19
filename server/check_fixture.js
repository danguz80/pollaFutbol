import { pool } from './db/pool.js';

// Verificar fixture original de Sudamericana
pool.query(`
  SELECT 
    fixture_id,
    ronda, 
    equipo_local, 
    equipo_visita, 
    clasificado,
    goles_local,
    goles_visita,
    penales_local,
    penales_visita
  FROM sudamericana_fixtures 
  WHERE ronda IN ('Octavos de Final', 'Cuartos de Final')
  ORDER BY ronda, fixture_id
`)
  .then(r => { 
    console.log('Fixture original de Sudamericana:');
    console.table(r.rows);
    
    // Verificar clasificados existentes para usuario 2
    return pool.query(`
      SELECT * FROM sudamericana_clasificados 
      WHERE usuario_id = 2
      ORDER BY ronda, clasificado_id
    `);
  })
  .then(r => {
    console.log('\nClasificados existentes para usuario_id=2:');
    console.table(r.rows);
    process.exit(); 
  })
  .catch(e => { 
    console.error('Error:', e.message); 
    process.exit(); 
  });
