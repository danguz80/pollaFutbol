import { pool } from './db/pool.js';

async function checkTable() {
  try {
    // Verificar si la tabla existe
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'sudamericana_config'
      );
    `);
    console.log('¿Tabla existe?:', tableExists.rows[0].exists);
    
    // Intentar ver su estructura
    if (tableExists.rows[0].exists) {
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'sudamericana_config';
      `);
      console.log('Columnas:', columns.rows);
      
      // Ver datos actuales
      const data = await pool.query('SELECT * FROM sudamericana_config;');
      console.log('Datos actuales:', data.rows);
    }
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
  } finally {
    process.exit();
  }
}

checkTable();
