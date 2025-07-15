import { pool } from './db/pool.js';

(async () => {
  try {
    console.log('🔧 Activando usuarios para Sudamericana...');
    
    // Activar todos los usuarios para sudamericana
    const updateRes = await pool.query('UPDATE usuarios SET activo_sudamericana = true WHERE activo_sudamericana = false OR activo_sudamericana IS NULL');
    console.log(`✅ ${updateRes.rowCount} usuarios activados para Sudamericana`);
    
    // Verificar usuarios
    console.log('\n📋 Estado actual de usuarios:');
    const usersRes = await pool.query('SELECT id, nombre, activo_sudamericana FROM usuarios ORDER BY id');
    usersRes.rows.forEach(u => {
      console.log(`ID: ${u.id}, Nombre: ${u.nombre}, Activo Sudamericana: ${u.activo_sudamericana}`);
    });
    
    // Verificar fixture con penales
    console.log('\n🏆 Verificando partidos con penales:');
    const penalesRes = await pool.query('SELECT fixture_id, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, ronda FROM sudamericana_fixtures WHERE penales_local IS NOT NULL OR penales_visita IS NOT NULL');
    console.log(`Partidos con penales: ${penalesRes.rows.length}`);
    penalesRes.rows.forEach(p => {
      console.log(`${p.equipo_local} ${p.goles_local} (${p.penales_local || 0}) - ${p.goles_visita} (${p.penales_visita || 0}) ${p.equipo_visita} [${p.ronda}]`);
    });
    
    // Verificar estructura de sudamericana_fixtures para confirmar campos de penales
    console.log('\n📊 Estructura de sudamericana_fixtures:');
    const columnsRes = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sudamericana_fixtures' ORDER BY ordinal_position");
    columnsRes.rows.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();
