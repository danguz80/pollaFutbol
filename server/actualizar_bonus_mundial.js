import { pool } from './db/pool.js';

(async () => {
  try {
    // Actualizar algunos partidos de la jornada 1 a bonus x2
    const result = await pool.query(`
      UPDATE mundial_partidos 
      SET bonus = 2 
      WHERE id IN (5, 6, 12)
      RETURNING id, equipo_local, equipo_visitante, bonus
    `);
    
    console.log('✅ Partidos actualizados a bonus x2:');
    result.rows.forEach(p => {
      console.log(`   Partido ${p.id}: ${p.equipo_local} vs ${p.equipo_visitante} - Bonus: x${p.bonus}`);
    });

    // Actualizar algunos partidos de la jornada 1 a bonus x3
    const result2 = await pool.query(`
      UPDATE mundial_partidos 
      SET bonus = 3 
      WHERE id IN (13, 14)
      RETURNING id, equipo_local, equipo_visitante, bonus
    `);
    
    console.log('\n✅ Partidos actualizados a bonus x3:');
    result2.rows.forEach(p => {
      console.log(`   Partido ${p.id}: ${p.equipo_local} vs ${p.equipo_visitante} - Bonus: x${p.bonus}`);
    });

    await pool.end();
    console.log('\n✅ Actualización completada!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
