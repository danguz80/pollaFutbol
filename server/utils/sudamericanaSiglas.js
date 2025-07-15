// Utilidad mejorada para reemplazar siglas por nombres reales en Sudamericana
// Solo mapea siglas (WP, WO, etc) => nombre real
function esSigla(str) {
  return typeof str === 'string' && /^W[OP][0-9]+|WO\.[A-Z]$/.test(str);
}

export function construirDiccionarioSiglas(fixture) {
  const dic = {};
  for (const f of fixture) {
    // Si equipo_local es sigla y clasificado es nombre real
    if (esSigla(f.equipo_local) && f.clasificado && !esSigla(f.clasificado)) {
      dic[f.equipo_local] = f.clasificado;
    }
    // Si equipo_visita es sigla y clasificado es nombre real
    if (esSigla(f.equipo_visita) && f.clasificado && !esSigla(f.clasificado)) {
      dic[f.equipo_visita] = f.clasificado;
    }
    // Si clasificado es sigla y equipo_local es nombre real
    if (f.clasificado && esSigla(f.clasificado) && f.equipo_local && !esSigla(f.equipo_local)) {
      dic[f.clasificado] = f.equipo_local;
    }
    // Si clasificado es sigla y equipo_visita es nombre real
    if (f.clasificado && esSigla(f.clasificado) && f.equipo_visita && !esSigla(f.equipo_visita)) {
      dic[f.clasificado] = f.equipo_visita;
    }
  }
  return dic;
}

export function reemplazarSiglasPorNombres(arr, dicSiglas) {
  if (!arr || !Array.isArray(arr) || !dicSiglas) return arr;
  return arr.map(item => ({
    ...item,
    equipo_local: dicSiglas[item.equipo_local] || item.equipo_local,
    equipo_visita: dicSiglas[item.equipo_visita] || item.equipo_visita
  }));
}

// Calcula avance de cruces Sudamericana usando fixture y pronosticos (como en el frontend, propagando ganadores a todas las rondas)
// Devuelve un diccionario sigla => nombre real, usando resultados oficiales si existen, si no, usa pronóstico
export function calcularAvanceSiglas(fixture, pronosticos = []) {
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
  
  // Función helper para calcular ganador de ida y vuelta
  function calcularGanadorIdaVuelta(partidosCruce, pronosMap) {
    if (partidosCruce.length !== 2) return null;
    
    // Obtener equipos reales desde los datos originales (sin sustituciones)
    const partido1 = partidosCruce[0];
    const partido2 = partidosCruce[1];
    
    const equipo1 = partido1.equipo_local;
    const equipo2 = partido1.equipo_visita;
    
    let totalGoles1 = 0;
    let totalGoles2 = 0;
    
    for (const partido of partidosCruce) {
      const pron = pronosMap[partido.fixture_id];
      if (!pron) continue;
      
      const gA = pron.goles_local;
      const gB = pron.goles_visita;
      
      if (gA !== null && gB !== null) {
        // Verificar qué equipo es local en este partido
        if (partido.equipo_local === equipo1 || (partido.equipo_local.includes && equipo1.includes && partido.equipo_local.includes(equipo1.split(' ')[0]))) {
          totalGoles1 += parseInt(gA);
          totalGoles2 += parseInt(gB);
        } else {
          totalGoles1 += parseInt(gB);
          totalGoles2 += parseInt(gA);
        }
      }
    }
    
    if (totalGoles1 > totalGoles2) return equipo1;
    if (totalGoles2 > totalGoles1) return equipo2;
    
    // Empate, revisar penales
    const ultimoPartido = partidosCruce[1];
    const pronUltimo = pronosMap[ultimoPartido.fixture_id];
    if (pronUltimo && pronUltimo.penales_local !== null && pronUltimo.penales_visita !== null) {
      if (pronUltimo.penales_local > pronUltimo.penales_visita) {
        return ultimoPartido.equipo_local;
      } else if (pronUltimo.penales_visita > pronUltimo.penales_local) {
        return ultimoPartido.equipo_visita;
      }
    }
    
    return null;
  }
  
  // Procesar ronda por ronda
  for (let i = 0; i < ROUNDS.length; i++) {
    const ronda = ROUNDS[i];
    const partidos = rondas[ronda] || [];
    
    // Agrupar partidos por clasificado (ida y vuelta)
    const cruces = {};
    for (const partido of partidos) {
      if (!cruces[partido.clasificado]) {
        cruces[partido.clasificado] = [];
      }
      cruces[partido.clasificado].push(partido);
    }
    
    // Procesar cada cruce
    for (const [siglaClasificado, partidosCruce] of Object.entries(cruces)) {
      if (partidosCruce.length === 0) continue;
      
      // Para rondas posteriores a playoffs, reemplazar siglas ya conocidas
      if (i > 0) {
        for (const partido of partidosCruce) {
          if (dicSiglas[partido.equipo_local]) partido.equipo_local = dicSiglas[partido.equipo_local];
          if (dicSiglas[partido.equipo_visita]) partido.equipo_visita = dicSiglas[partido.equipo_visita];
        }
      }
      
      let ganador = null;
      
      if (partidosCruce.length === 1) {
        // Un solo partido
        const partido = partidosCruce[0];
        const pron = pronosMap[partido.fixture_id];
        if (pron) {
          if (pron.goles_local > pron.goles_visita) {
            ganador = partido.equipo_local;
          } else if (pron.goles_visita > pron.goles_local) {
            ganador = partido.equipo_visita;
          } else if (pron.penales_local !== null && pron.penales_visita !== null) {
            if (pron.penales_local > pron.penales_visita) {
              ganador = partido.equipo_local;
            } else if (pron.penales_visita > pron.penales_local) {
              ganador = partido.equipo_visita;
            }
          }
        }
      } else if (partidosCruce.length === 2) {
        // Ida y vuelta
        ganador = calcularGanadorIdaVuelta(partidosCruce, pronosMap);
      }
      
      // Asignar ganador a la sigla clasificatoria
      if (ganador && siglaClasificado) {
        dicSiglas[siglaClasificado] = ganador;
      }
    }
  }
  
  return dicSiglas;
}
