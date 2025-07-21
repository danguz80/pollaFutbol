import { pool } from './db/pool.js';

async function debugCentralCordoba() {
  try {
    console.log('🔍 Investigando problema de Central Córdoba...\n');
    
    // 1. Buscar en sudamericana_fixtures (cruces reales)
    console.log('📊 CRUCES REALES (sudamericana_fixtures):');
    const fixtures = await pool.query(`
      SELECT DISTINCT equipo_local, equipo_visita, equipo_clasificado_real
      FROM sudamericana_fixtures 
      WHERE equipo_local ILIKE '%central%' 
         OR equipo_visita ILIKE '%central%'
         OR equipo_clasificado_real ILIKE '%central%'
      ORDER BY equipo_local, equipo_visita;
    `);
    fixtures.rows.forEach(row => {
      console.log(`  Local: "${row.equipo_local}" | Visita: "${row.equipo_visita}" | Real: "${row.equipo_clasificado_real}"`);
    });
    
    // 2. Buscar en pronosticos_sudamericana (pronósticos usuarios)
    console.log('\n🎯 PRONÓSTICOS USUARIOS (pronosticos_sudamericana):');
    const pronosticos = await pool.query(`
      SELECT DISTINCT equipo_pronosticado, COUNT(*) as cantidad
      FROM pronosticos_sudamericana 
      WHERE equipo_pronosticado ILIKE '%central%'
      GROUP BY equipo_pronosticado
      ORDER BY cantidad DESC;
    `);
    pronosticos.rows.forEach(row => {
      console.log(`  Pronosticado: "${row.equipo_pronosticado}" (${row.cantidad} veces)`);
    });
    
    // 3. Buscar diferencias exactas
    console.log('\n⚠️  ANÁLISIS DE DIFERENCIAS:');
    const realNames = fixtures.rows
      .flatMap(row => [row.equipo_local, row.equipo_visita, row.equipo_clasificado_real])
      .filter(name => name && name.toLowerCase().includes('central'))
      .filter((name, index, arr) => arr.indexOf(name) === index);
    
    const pronosticadosNames = pronosticos.rows.map(row => row.equipo_pronosticado);
    
    console.log('  Nombres en cruces reales:', realNames);
    console.log('  Nombres en pronósticos:', pronosticadosNames);
    
    // 4. Verificar comparación actual
    console.log('\n🔄 COMPARACIONES DIRECTAS:');
    realNames.forEach(realName => {
      pronosticadosNames.forEach(pronosticado => {
        const match = realName === pronosticado;
        const similarMatch = realName.toLowerCase().includes('central') && pronosticado.toLowerCase().includes('central');
        console.log(`  "${realName}" === "${pronosticado}" → ${match} (similar: ${similarMatch})`);
      });
    });
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Stack:', err.stack);
  } finally {
    await pool.end();
    process.exit();
  }
}

debugCentralCordoba();
