import { pool } from './db/pool.js';

async function getEquipos() {
  try {
    const result = await pool.query('SELECT nombre, grupo, pais FROM mundial_equipos ORDER BY grupo, nombre');
    console.log(JSON.stringify(result.rows, null, 2));
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

getEquipos();
