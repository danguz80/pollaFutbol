import { pool } from '../db/pool.js';

async function buscarGerson() {
  try {
    const result = await pool.query(
      "SELECT id, nombre FROM usuarios WHERE nombre ILIKE '%gerson%'"
    );
    console.log('Usuarios encontrados:', result.rows);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

buscarGerson();
