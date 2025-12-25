import { pool } from './pool.js';

async function createLibertadoresGanadoresJornadaTable() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Crear tabla para ganadores de jornada
    await client.query(`
      CREATE TABLE IF NOT EXISTS libertadores_ganadores_jornada (
        id SERIAL PRIMARY KEY,
        jornada_numero INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        puntaje INTEGER NOT NULL,
        fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(jornada_numero, usuario_id)
      )
    `);
    
    console.log('✅ Tabla libertadores_ganadores_jornada creada exitosamente');
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creando tabla libertadores_ganadores_jornada:', error);
    throw error;
  } finally {
    client.release();
  }
}

createLibertadoresGanadoresJornadaTable()
  .then(() => {
    console.log('Migración completada');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error en migración:', err);
    process.exit(1);
  });

export default createLibertadoresGanadoresJornadaTable;
