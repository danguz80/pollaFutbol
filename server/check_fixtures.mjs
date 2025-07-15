import { pool } from './db/pool.js';
import { calcularAvanceSiglas } from './utils/sudamericanaSiglas.js';

async function checkPronosticos() {
  try {
    // Obtener todos los fixtures
    const fixturesResult = await pool.query('SELECT * FROM sudamericana_fixtures ORDER BY fixture_id');
    
    // Obtener pronósticos del usuario ID 2
    const pronosticosResult = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = 2');
    
    console.log('🔍 Testing calcularAvanceSiglas para usuario ID 2:');
    console.log('\n📊 Fixtures data length:', fixturesResult.rows.length);
    console.log('📊 Pronósticos data length:', pronosticosResult.rows.length);

    // Aplicar la función calcularAvanceSiglas
    const diccionarioSiglas = calcularAvanceSiglas(fixturesResult.rows, pronosticosResult.rows);

    console.log('\n🎯 Diccionario de siglas calculado:');
    console.log(diccionarioSiglas);

    console.log('\n🔍 Verificando siglas específicas:');
    console.log('WO.E (debería ser Cienciano):', diccionarioSiglas['WO.E']);
    console.log('WO.G (debería ser Vasco DA Gama):', diccionarioSiglas['WO.G']);

    console.log('\n📋 Pronósticos del usuario ID 2 para partidos WO.E y WO.G:');
    const octavosPronosticos = pronosticosResult.rows.filter(p => {
      const fixture = fixturesResult.rows.find(f => f.fixture_id === p.fixture_id);
      return fixture && fixture.ronda === 'Octavos de Final' && 
             (fixture.clasificado === 'WO.E' || fixture.clasificado === 'WO.G');
    });

    console.log(`Encontrados ${octavosPronosticos.length} pronósticos para WO.E y WO.G`);

    for (const pron of octavosPronosticos) {
      const fixture = fixturesResult.rows.find(f => f.fixture_id === pron.fixture_id);
      console.log(`Partido ID ${pron.fixture_id}: ${fixture.equipo_local} vs ${fixture.equipo_visita}`);
      console.log(`  Clasificado: ${fixture.clasificado}`);
      console.log(`  Pronóstico: ${pron.goles_local}-${pron.goles_visita}`);
      console.log(`  Penales: ${pron.penales_local}-${pron.penales_visita}`);
      
      // Determinar ganador según pronóstico
      let ganador = 'Empate';
      if (pron.goles_local > pron.goles_visita) {
        ganador = fixture.equipo_local;
      } else if (pron.goles_visita > pron.goles_local) {
        ganador = fixture.equipo_visita;
      } else if (pron.penales_local !== null && pron.penales_visita !== null) {
        if (pron.penales_local > pron.penales_visita) {
          ganador = fixture.equipo_local;
        } else if (pron.penales_visita > pron.penales_local) {
          ganador = fixture.equipo_visita;
        }
      }
      console.log(`  Ganador según pronóstico: ${ganador}`);
      console.log('---');
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkPronosticos();
