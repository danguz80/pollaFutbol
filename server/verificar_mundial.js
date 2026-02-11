import { pool } from './db/pool.js';

async function verificarMundial() {
  try {
    console.log('🔍 Verificando datos del Mundial 2026...\n');

    // Verificar jornadas
    const jornadas = await pool.query('SELECT * FROM mundial_jornadas ORDER BY numero');
    console.log(`✅ Jornadas encontradas: ${jornadas.rows.length}`);
    jornadas.rows.forEach(j => {
      console.log(`   J${j.numero}: ${j.nombre} - Activa: ${j.activa}, Cerrada: ${j.cerrada}`);
    });

    // Verificar equipos
    const equipos = await pool.query('SELECT * FROM mundial_equipos ORDER BY grupo, nombre');
    console.log(`\n✅ Equipos encontrados: ${equipos.rows.length}`);
    if (equipos.rows.length > 0) {
      const grupos = {};
      equipos.rows.forEach(e => {
        if (!grupos[e.grupo]) grupos[e.grupo] = [];
        grupos[e.grupo].push(e.nombre);
      });
      Object.entries(grupos).forEach(([grupo, equipos]) => {
        console.log(`   Grupo ${grupo}: ${equipos.length} equipos`);
      });
    }

    // Verificar partidos por jornada
    const partidos = await pool.query(`
      SELECT j.numero, j.nombre, COUNT(p.id) as total_partidos
      FROM mundial_jornadas j
      LEFT JOIN mundial_partidos p ON p.jornada_id = j.id
      GROUP BY j.id, j.numero, j.nombre
      ORDER BY j.numero
    `);
    console.log(`\n✅ Partidos por jornada:`);
    partidos.rows.forEach(p => {
      console.log(`   J${p.numero}: ${p.total_partidos} partidos`);
    });

    // Verificar pronósticos
    const pronosticos = await pool.query('SELECT COUNT(*) as total FROM mundial_pronosticos');
    console.log(`\n✅ Pronósticos totales: ${pronosticos.rows[0].total}`);

    console.log('\n✅ Verificación completada');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error verificando datos:', error);
    process.exit(1);
  }
}

verificarMundial();
