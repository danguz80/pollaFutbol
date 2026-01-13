import { pool } from './db/pool.js';

(async () => {
  try {
    // Verificar partidos
    const partidos = await pool.query(`
      SELECT id, nombre_local, nombre_visita, tipo_partido, penales_local, penales_visita, goles_local, goles_visita
      FROM sudamericana_partidos 
      WHERE jornada_id = (SELECT id FROM sudamericana_jornadas WHERE numero = 9)
      ORDER BY id
    `);
    
    console.log('📋 Partidos Jornada 9:');
    partidos.rows.forEach(p => {
      console.log(`  ID ${p.id}: ${p.nombre_local} vs ${p.nombre_visita}`);
      console.log(`     tipo: ${p.tipo_partido} | goles: ${p.goles_local}-${p.goles_visita} | pen: ${p.penales_local}-${p.penales_visita}`);
    });
    
    // Verificar pronósticos con penales
    console.log('\n📝 Pronósticos con penales en J9:');
    const pronosticos = await pool.query(`
      SELECT sp.id, u.nombre, p.nombre_local, p.nombre_visita, p.tipo_partido,
             sp.goles_local as pred_goles_l, sp.goles_visita as pred_goles_v,
             sp.penales_local as pred_pen_l, sp.penales_visita as pred_pen_v
      FROM sudamericana_pronosticos sp
      JOIN usuarios u ON sp.usuario_id = u.id
      JOIN sudamericana_partidos p ON sp.partido_id = p.id
      WHERE p.jornada_id = (SELECT id FROM sudamericana_jornadas WHERE numero = 9)
        AND p.tipo_partido = 'VUELTA'
      ORDER BY u.nombre, p.id
      LIMIT 5
    `);
    
    pronosticos.rows.forEach(p => {
      console.log(`  ${p.nombre}: ${p.nombre_local} vs ${p.nombre_visita}`);
      console.log(`     Pronóstico: ${p.pred_goles_l}-${p.pred_goles_v} | Penales: ${p.pred_pen_l}-${p.pred_pen_v}`);
    });
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
