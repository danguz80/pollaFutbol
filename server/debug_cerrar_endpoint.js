import { pool } from './db/pool.js';

async function debugCerrarEndpoint() {
  try {
    console.log('🔍 Debugging endpoint /cerrar...');
    
    // 1. Verificar estructura actual de la tabla
    console.log('\n1. Estructura actual de sudamericana_config:');
    const structure = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'sudamericana_config'
      ORDER BY ordinal_position;
    `);
    console.log(structure.rows);
    
    // 2. Ver datos actuales
    console.log('\n2. Datos actuales:');
    const currentData = await pool.query('SELECT * FROM sudamericana_config;');
    console.log(currentData.rows);
    
    // 3. Probar el CREATE TABLE IF NOT EXISTS
    console.log('\n3. Probando CREATE TABLE IF NOT EXISTS...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_config (
        id INTEGER PRIMARY KEY,
        edicion_cerrada BOOLEAN DEFAULT FALSE,
        fecha_cierre TIMESTAMP
      )
    `);
    console.log('✅ CREATE TABLE IF NOT EXISTS ejecutado correctamente');
    
    // 4. Probar el INSERT ... ON CONFLICT
    console.log('\n4. Probando INSERT ... ON CONFLICT...');
    const insertResult = await pool.query(`
      INSERT INTO sudamericana_config (id, edicion_cerrada, fecha_cierre) 
      VALUES (1, FALSE, NULL) 
      ON CONFLICT (id) DO NOTHING
      RETURNING *
    `);
    console.log('Resultado INSERT:', insertResult.rows);
    
    // 5. Probar el UPDATE
    console.log('\n5. Probando UPDATE...');
    const updateResult = await pool.query(`
      UPDATE sudamericana_config 
      SET edicion_cerrada = $1 
      WHERE id = 1
      RETURNING edicion_cerrada
    `, [false]);
    console.log('Resultado UPDATE:', updateResult.rows);
    
  } catch (err) {
    console.error('❌ Error en debug:', err);
    console.error('Mensaje:', err.message);
    console.error('Stack:', err.stack);
  } finally {
    process.exit();
  }
}

debugCerrarEndpoint();
