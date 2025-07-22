import { pool } from './db/pool.js';

async function migrateCierreAutomatico() {
  try {
    await pool.query('ALTER TABLE sudamericana_config ADD COLUMN IF NOT EXISTS cierre_automatico_ejecutado BOOLEAN DEFAULT FALSE');
    console.log('✅ Columna cierre_automatico_ejecutado agregada exitosamente');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

migrateCierreAutomatico();
