import { pool } from '../db/pool.js';

async function verificarDuplicados() {
  try {
    const result = await pool.query(`
      SELECT 
        anio, competencia, tipo, categoria, usuario_id, COUNT(*) as cantidad
      FROM rankings_historicos
      WHERE anio = 2025 
        AND competencia = 'Torneo Nacional'
        AND tipo = 'estandar'
      GROUP BY anio, competencia, tipo, categoria, usuario_id
      HAVING COUNT(*) > 1
      ORDER BY categoria::integer, usuario_id
    `);

    console.log('Duplicados encontrados:', result.rows.length);
    result.rows.forEach(row => {
      console.log(`- Jornada ${row.categoria}, Usuario ID ${row.usuario_id}: ${row.cantidad} registros`);
    });

    if (result.rows.length > 0) {
      console.log('\n🗑️ Eliminando duplicados...');
      
      // Eliminar duplicados manteniendo solo uno (el de menor id)
      await pool.query(`
        DELETE FROM rankings_historicos
        WHERE id IN (
          SELECT id
          FROM (
            SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY anio, competencia, tipo, categoria, usuario_id 
                ORDER BY id
              ) as rn
            FROM rankings_historicos
            WHERE anio = 2025 
              AND competencia = 'Torneo Nacional'
              AND tipo = 'estandar'
          ) t
          WHERE t.rn > 1
        )
      `);
      
      console.log('✅ Duplicados eliminados');
    } else {
      console.log('✅ No hay duplicados');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

verificarDuplicados();
