import { pool } from './db/pool.js';

async function addCierreAutomaticoColumn() {
  try {
    console.log('Agregando columna cierre_automatico_ejecutado...');
    
    // Agregar la nueva columna si no existe
    await pool.query(`
      ALTER TABLE sudamericana_config 
      ADD COLUMN IF NOT EXISTS cierre_automatico_ejecutado BOOLEAN DEFAULT FALSE
    `);
    
    console.log('✅ Columna agregada exitosamente');
    
    // Verificar el estado actual
    const result = await pool.query('SELECT * FROM sudamericana_config WHERE id = 1');
    console.log('Estado actual:', result.rows);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    process.exit();
  }
}

addCierreAutomaticoColumn();
