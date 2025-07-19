import { pool } from './db/pool.js';

// Verificar qué hay en la tabla pronosticos_sudamericana
pool.query(`
  SELECT 
    usuario_id, 
    fixture_id, 
    ronda, 
    equipo_local, 
    equipo_visita, 
    ganador,
    goles_local,
    goles_visita,
    penales_local,
    penales_visita
  FROM pronosticos_sudamericana 
  ORDER BY usuario_id, fixture_id 
  LIMIT 20
`)
  .then(r => { 
    console.log('Pronósticos en BD:');
    console.table(r.rows);
    
    // Contar por usuario
    return pool.query(`
      SELECT usuario_id, COUNT(*) as total_pronosticos
      FROM pronosticos_sudamericana 
      GROUP BY usuario_id
      ORDER BY usuario_id
    `);
  })
  .then(r => {
    console.log('\nResumen por usuario:');
    console.table(r.rows);
    process.exit(); 
  })
  .catch(e => { 
    console.error('Error:', e.message); 
    process.exit(); 
  });
