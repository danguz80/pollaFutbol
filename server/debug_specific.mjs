import { pool } from './db/pool.js';

// Copia de la función calcularAvanceSiglas con debugging
function calcularAvanceSiglasDebug(fixture, pronosticos = []) {
  const ROUNDS = [
    "Knockout Round Play-offs",
    "Octavos de Final", 
    "Cuartos de Final",
    "Semifinales",
    "Final"
  ];
  
  // Indexar partidos por ronda
  const rondas = {};
  for (const partido of fixture) {
    if (!rondas[partido.ronda]) rondas[partido.ronda] = [];
    rondas[partido.ronda].push({ ...partido });
  }
  
  // Indexar pronosticos por fixture_id
  const pronosMap = {};
  for (const p of pronosticos) {
    pronosMap[p.fixture_id] = p;
  }
  
  // Diccionario de avance de siglas
  let dicSiglas = {};
  
  // Procesar ronda por ronda
  for (let i = 0; i < ROUNDS.length; i++) {
    const ronda = ROUNDS[i];
    const partidos = rondas[ronda] || [];
    
    // Solo procesar Octavos de Final para debugging
    if (ronda !== "Octavos de Final") continue;
    
    console.log(`\n🔄 Procesando ronda: ${ronda}`);
    
    // Agrupar partidos por clasificado (ida y vuelta)
    const cruces = {};
    for (const partido of partidos) {
      if (!cruces[partido.clasificado]) {
        cruces[partido.clasificado] = [];
      }
      cruces[partido.clasificado].push(partido);
    }
    
    // Solo procesar WO.E y WO.G
    for (const [siglaClasificado, partidosCruce] of Object.entries(cruces)) {
      if (siglaClasificado !== 'WO.E' && siglaClasificado !== 'WO.G') continue;
      
      console.log(`\n⚽ Procesando cruce ${siglaClasificado}:`);
      console.log(`  Partidos en cruce: ${partidosCruce.length}`);
      
      if (partidosCruce.length === 0) continue;
      
      // Reemplazar siglas por nombres reales ya conocidos
      for (const partido of partidosCruce) {
        if (dicSiglas[partido.equipo_local]) partido.equipo_local = dicSiglas[partido.equipo_local];
        if (dicSiglas[partido.equipo_visita]) partido.equipo_visita = dicSiglas[partido.equipo_visita];
      }
      
      let ganador = null;
      
      if (partidosCruce.length === 2) {
        // Ida y vuelta
        const partido1 = partidosCruce[0];
        const partido2 = partidosCruce[1];
        
        console.log(`  Partido 1: ${partido1.equipo_local} vs ${partido1.equipo_visita} (ID: ${partido1.fixture_id})`);
        console.log(`  Partido 2: ${partido2.equipo_local} vs ${partido2.equipo_visita} (ID: ${partido2.fixture_id})`);
        
        // Sumar goles totales considerando los equipos
        let totalGolesEquipo1 = 0;
        let totalGolesEquipo2 = 0;
        let equipo1 = null;
        let equipo2 = null;
        
        // Procesar cada partido
        for (const [idx, partido] of partidosCruce.entries()) {
          let gA = partido.goles_local;
          let gB = partido.goles_visita;
          
          if ((gA === null || gB === null) && pronosMap[partido.fixture_id]) {
            gA = pronosMap[partido.fixture_id].goles_local;
            gB = pronosMap[partido.fixture_id].goles_visita;
          }
          
          console.log(`    Partido ${idx + 1}: ${partido.equipo_local} ${gA}-${gB} ${partido.equipo_visita}`);
          
          if (gA !== null && gB !== null) {
            if (!equipo1) {
              // Primer partido define los equipos
              equipo1 = partido.equipo_local;
              equipo2 = partido.equipo_visita;
              totalGolesEquipo1 = parseInt(gA);
              totalGolesEquipo2 = parseInt(gB);
              console.log(`    Definiendo equipos: ${equipo1} vs ${equipo2}`);
            } else {
              // Segundo partido - los equipos están invertidos
              if (partido.equipo_local === equipo1) {
                totalGolesEquipo1 += parseInt(gA);
                totalGolesEquipo2 += parseInt(gB);
                console.log(`    Sumando directo: ${equipo1} +${gA}, ${equipo2} +${gB}`);
              } else {
                totalGolesEquipo1 += parseInt(gB);
                totalGolesEquipo2 += parseInt(gA);
                console.log(`    Sumando invertido: ${equipo1} +${gB}, ${equipo2} +${gA}`);
              }
            }
          }
        }
        
        console.log(`    Total final: ${equipo1} ${totalGolesEquipo1} - ${totalGolesEquipo2} ${equipo2}`);
        
        if (equipo1 && equipo2) {
          if (totalGolesEquipo1 > totalGolesEquipo2) {
            ganador = equipo1;
          } else if (totalGolesEquipo2 > totalGolesEquipo1) {
            ganador = equipo2;
          } else {
            console.log(`    Empate, revisando penales...`);
          }
        }
      }
      
      console.log(`    Ganador calculado: ${ganador}`);
      
      // Asignar ganador a la sigla clasificatoria
      if (ganador && siglaClasificado) {
        dicSiglas[siglaClasificado] = ganador;
        console.log(`    Asignando ${siglaClasificado} = ${ganador}`);
      }
    }
  }
  
  return dicSiglas;
}

async function debugSpecific() {
  try {
    // Obtener todos los fixtures
    const fixturesResult = await pool.query('SELECT * FROM sudamericana_fixtures ORDER BY fixture_id');
    
    // Obtener pronósticos del usuario ID 2
    const pronosticosResult = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = 2');
    
    console.log('🔍 Debugging específico de calcularAvanceSiglas:');
    
    // Primero construir diccionario base
    const diccionarioBase = {};
    
    // Obtener WP mappings de Knockout Round Play-offs
    const koPartidos = fixturesResult.rows.filter(f => f.ronda === 'Knockout Round Play-offs');
    for (const partido of koPartidos) {
      const pronostico = pronosticosResult.rows.find(p => p.fixture_id === partido.fixture_id);
      if (pronostico) {
        let ganador = null;
        if (pronostico.goles_local > pronostico.goles_visita) {
          ganador = partido.equipo_local;
        } else if (pronostico.goles_visita > pronostico.goles_local) {
          ganador = partido.equipo_visita;
        }
        if (ganador && partido.clasificado) {
          diccionarioBase[partido.clasificado] = ganador;
        }
      }
    }
    
    console.log('Diccionario base WP:', diccionarioBase);
    
    const resultado = calcularAvanceSiglasDebug(fixturesResult.rows, pronosticosResult.rows);
    
    console.log('\n🎯 Resultado final:');
    console.log('WO.E:', resultado['WO.E']);
    console.log('WO.G:', resultado['WO.G']);
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugSpecific();
