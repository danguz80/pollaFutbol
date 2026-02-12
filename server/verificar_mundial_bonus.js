import { pool } from './db/pool.js';

(async () => {
  try {
    // Verificar jornadas activas del Mundial
    const jornadas = await pool.query(`
      SELECT numero, nombre, activa, cerrada
      FROM mundial_jornadas
      ORDER BY numero
    `);
    
    console.log('\n=== JORNADAS DEL MUNDIAL ===');
    jornadas.rows.forEach(j => {
      console.log(`Jornada ${j.numero}: ${j.nombre} - Activa: ${j.activa}, Cerrada: ${j.cerrada}`);
    });

    // Verificar partidos con bonus
    const partidos = await pool.query(`
      SELECT 
        mj.numero, mj.nombre, mj.activa, mj.cerrada,
        mp.id, mp.equipo_local, mp.equipo_visitante, mp.bonus
      FROM mundial_partidos mp
      INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
      WHERE mj.activa = true AND mj.cerrada = false
      ORDER BY mp.bonus DESC
      LIMIT 10
    `);
    
    console.log('\n=== PARTIDOS EN JORNADAS ACTIVAS ===');
    if (partidos.rows.length === 0) {
      console.log('❌ No hay partidos en jornadas activas y no cerradas');
    } else {
      partidos.rows.forEach(p => {
        console.log(`Partido ${p.id}: ${p.equipo_local} vs ${p.equipo_visitante} - Bonus: x${p.bonus}`);
      });
    }

    // Verificar partidos con bonus >= 2
    const partidosBonus = await pool.query(`
      SELECT 
        mj.numero, mj.nombre, mj.activa, mj.cerrada,
        mp.id, mp.equipo_local, mp.equipo_visitante, mp.bonus
      FROM mundial_partidos mp
      INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
      WHERE mj.activa = true AND mj.cerrada = false AND mp.bonus >= 2
      ORDER BY mp.bonus DESC
    `);
    
    console.log('\n=== PARTIDOS CON BONUS >= 2 ===');
    if (partidosBonus.rows.length === 0) {
      console.log('❌ No hay partidos con bonus >= 2 en jornadas activas');
    } else {
      partidosBonus.rows.forEach(p => {
        console.log(`Partido ${p.id}: ${p.equipo_local} vs ${p.equipo_visitante} - Bonus: x${p.bonus}`);
      });
    }

    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
