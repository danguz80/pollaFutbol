import { pool } from './db/pool.js';

pool.query('SELECT id, nombre, email, rol FROM usuarios WHERE rol = \'admin\' LIMIT 5')
  .then(r => { console.log('Usuarios admin:', r.rows); process.exit(); })
  .catch(e => { console.error('Error:', e.message); process.exit(); });
