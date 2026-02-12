import { pool } from './db/pool.js';

(async () => {
  try {
    console.log('\n📋 Estado actual de bonus en partidos de Jornada 1:\n');
    
    const result = await pool.query(`
      SELECT 
        id, equipo_local, equipo_visitante, bonus,
        resultado_local, resultado_visitante
      FROM mundial_partidos 
      WHERE jornada_id = (SELECT id FROM mundial_jornadas WHERE numero = 1)
      ORDER BY id
    `);

    if (result.rows.length === 0) {
      console.log('❌ No hay partidos en la Jornada 1');
    } else {
      console.log('ID  | Partido                              | Bonus | Resultado');
      console.log('----+--------------------------------------+-------+----------');
      
      result.rows.forEach(p => {
        const partido = `${p.equipo_local} vs ${p.equipo_visitante}`.padEnd(36);
        const resultado = p.resultado_local !== null && p.resultado_visitante !== null 
          ? `${p.resultado_local}-${p.resultado_visitante}` 
          : '-';
        console.log(`${String(p.id).padStart(3)} | ${partido} | x${p.bonus}    | ${resultado}`);
      });

      // Mostrar resumen
      const bonusCount = {
        1: result.rows.filter(p => p.bonus === 1).length,
        2: result.rows.filter(p => p.bonus === 2).length,
        3: result.rows.filter(p => p.bonus === 3).length
      };

      console.log('\n📊 Resumen:');
      console.log(`   Partidos x1: ${bonusCount[1]}`);
      console.log(`   Partidos x2: ${bonusCount[2]} (borde amarillo)`);
      console.log(`   Partidos x3: ${bonusCount[3]} (borde rojo)`);
      console.log(`   Total: ${result.rows.length}`);
    }

    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
