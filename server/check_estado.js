import { pool } from './db/pool.js';

pool.query('SELECT * FROM sudamericana_config WHERE id = 1')
  .then(r => { 
    console.log('Estado actual en BD:', r.rows); 
    process.exit(); 
  })
  .catch(e => { 
    console.error('Error:', e.message); 
    process.exit(); 
  });
