import { pool } from './db/pool.js';

async function setupSudamericanaConfig() {
  try {
    console.log('🔧 Configurando tabla sudamericana_config...');
    
    // Crear tabla si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_config (
        id SERIAL PRIMARY KEY,
        edicion_cerrada BOOLEAN DEFAULT FALSE,
        fecha_cierre TIMESTAMP
      )
    `);
    
    // Verificar si existe la fila de configuración
    const existingConfig = await pool.query('SELECT * FROM sudamericana_config WHERE id = 1');
    
    if (existingConfig.rows.length === 0) {
      // Insertar configuración por defecto
      await pool.query(`
        INSERT INTO sudamericana_config (id, edicion_cerrada, fecha_cierre) 
        VALUES (1, FALSE, NULL)
      `);
      console.log('✅ Configuración inicial creada');
    } else {
      console.log('✅ Configuración ya existe:', existingConfig.rows[0]);
    }
    
    // Mostrar estado final
    const finalConfig = await pool.query('SELECT * FROM sudamericana_config');
    console.log('Estado final de sudamericana_config:', finalConfig.rows);
    
  } catch (err) {
    console.error('❌ Error configurando sudamericana_config:', err);
  } finally {
    process.exit();
  }
}

setupSudamericanaConfig();
