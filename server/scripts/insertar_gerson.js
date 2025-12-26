import { pool } from '../db/pool.js';

async function insertarGerson() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Jornada 12: Gerson González
    const usuario12 = await client.query(
      'SELECT id FROM usuarios WHERE nombre = $1',
      ['Gerson González']
    );
    
    if (usuario12.rows.length > 0) {
      await client.query(`
        INSERT INTO rankings_historicos 
          (anio, competencia, tipo, categoria, usuario_id, nombre_manual, posicion, puntos)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (anio, competencia, categoria, usuario_id, nombre_manual, posicion)
        DO NOTHING
      `, [2025, 'Torneo Nacional', 'estandar', '12', usuario12.rows[0].id, null, 2, 0]);
      
      console.log('✅ Jornada 12: Gerson González insertado');
    }
    
    // Jornada 20: Gerson González
    if (usuario12.rows.length > 0) {
      await client.query(`
        INSERT INTO rankings_historicos 
          (anio, competencia, tipo, categoria, usuario_id, nombre_manual, posicion, puntos)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (anio, competencia, categoria, usuario_id, nombre_manual, posicion)
        DO NOTHING
      `, [2025, 'Torneo Nacional', 'estandar', '20', usuario12.rows[0].id, null, 2, 0]);
      
      console.log('✅ Jornada 20: Gerson González insertado');
    }
    
    await client.query('COMMIT');
    console.log('🎉 Completado');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

insertarGerson();
