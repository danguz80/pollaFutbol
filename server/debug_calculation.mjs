import { pool } from './db/pool.js';
import { calcularAvanceSiglas } from './utils/sudamericanaSiglas.js';

async function debugCalculation() {
  try {
    // Obtener todos los fixtures
    const fixturesResult = await pool.query('SELECT * FROM sudamericana_fixtures ORDER BY fixture_id');
    
    // Obtener pronósticos del usuario ID 2
    const pronosticosResult = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = 2');
    
    console.log('🔍 Debugging específico para WO.E y WO.G:');
    
    // Buscar partidos WO.E específicamente
    const partidosWOE = fixturesResult.rows.filter(f => f.clasificado === 'WO.E');
    console.log('\n📋 Partidos que clasifican a WO.E:');
    partidosWOE.forEach(p => {
      const pronostico = pronosticosResult.rows.find(pr => pr.fixture_id === p.fixture_id);
      console.log(`ID: ${p.fixture_id} | ${p.equipo_local} vs ${p.equipo_visita} | Ronda: ${p.ronda}`);
      if (pronostico) {
        console.log(`  Pronóstico: ${pronostico.goles_local}-${pronostico.goles_visita}`);
        // Calcular ganador manual
        if (pronostico.goles_local > pronostico.goles_visita) {
          console.log(`  Ganador individual: ${p.equipo_local}`);
        } else if (pronostico.goles_visita > pronostico.goles_local) {
          console.log(`  Ganador individual: ${p.equipo_visita}`);
        } else {
          console.log(`  Empate individual`);
        }
      }
    });
    
    // Buscar partidos WO.G específicamente
    const partidosWOG = fixturesResult.rows.filter(f => f.clasificado === 'WO.G');
    console.log('\n📋 Partidos que clasifican a WO.G:');
    partidosWOG.forEach(p => {
      const pronostico = pronosticosResult.rows.find(pr => pr.fixture_id === p.fixture_id);
      console.log(`ID: ${p.fixture_id} | ${p.equipo_local} vs ${p.equipo_visita} | Ronda: ${p.ronda}`);
      if (pronostico) {
        console.log(`  Pronóstico: ${pronostico.goles_local}-${pronostico.goles_visita}`);
        // Calcular ganador manual
        if (pronostico.goles_local > pronostico.goles_visita) {
          console.log(`  Ganador individual: ${p.equipo_local}`);
        } else if (pronostico.goles_visita > pronostico.goles_local) {
          console.log(`  Ganador individual: ${p.equipo_visita}`);
        } else {
          console.log(`  Empate individual`);
        }
      }
    });
    
    // Calcular manualmente para WO.E
    console.log('\n🧮 Cálculo manual para WO.E (Cienciano vs WP04):');
    const woePartidos = partidosWOE.filter(p => p.ronda === 'Octavos de Final');
    if (woePartidos.length === 2) {
      const pron1 = pronosticosResult.rows.find(pr => pr.fixture_id === woePartidos[0].fixture_id);
      const pron2 = pronosticosResult.rows.find(pr => pr.fixture_id === woePartidos[1].fixture_id);
      
      let ciencianoGoles = 0;
      let wp04Goles = 0;
      
      // Primer partido: Cienciano vs WP04 (1-0)
      if (woePartidos[0].equipo_local === 'Cienciano') {
        ciencianoGoles += pron1.goles_local;
        wp04Goles += pron1.goles_visita;
      } else {
        ciencianoGoles += pron1.goles_visita;
        wp04Goles += pron1.goles_local;
      }
      
      // Segundo partido: WP04 vs Cienciano (1-1)
      if (woePartidos[1].equipo_local === 'WP04') {
        wp04Goles += pron2.goles_local;
        ciencianoGoles += pron2.goles_visita;
      } else {
        wp04Goles += pron2.goles_visita;
        ciencianoGoles += pron2.goles_local;
      }
      
      console.log(`Total: Cienciano ${ciencianoGoles} - ${wp04Goles} WP04`);
      if (ciencianoGoles > wp04Goles) {
        console.log('Ganador manual: Cienciano');
      } else if (wp04Goles > ciencianoGoles) {
        console.log('Ganador manual: WP04');
      } else {
        console.log('Empate en goles totales');
      }
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugCalculation();
