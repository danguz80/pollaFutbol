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
  console.log('[DEPURACION][Diccionario siglas->nombre real]:', dic);
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
  // Avance ronda por ronda
  let avance = {};
  for (let i = 0; i < ROUNDS.length; i++) {
    const ronda = ROUNDS[i];
    const partidos = rondas[ronda] || [];
    for (const partido of partidos) {
      // Reemplazar siglas por nombre real si ya existe
      if (dicSiglas[partido.equipo_local]) partido.equipo_local = dicSiglas[partido.equipo_local];
      if (dicSiglas[partido.equipo_visita]) partido.equipo_visita = dicSiglas[partido.equipo_visita];
      let eqA = partido.equipo_local;
      let eqB = partido.equipo_visita;
      let gA = partido.goles_local;
      let gB = partido.goles_visita;
      if ((gA === null || gB === null) && pronosMap[partido.fixture_id]) {
        gA = pronosMap[partido.fixture_id].goles_local;
        gB = pronosMap[partido.fixture_id].goles_visita;
      }
      let ganador = null;
      if (gA > gB) ganador = eqA;
      else if (gB > gA) ganador = eqB;
      else {
        let penA = partido.penales_local;
        let penB = partido.penales_visita;
        if ((penA === null || penB === null) && pronosMap[partido.fixture_id]) {
          penA = pronosMap[partido.fixture_id].penales_local;
          penB = pronosMap[partido.fixture_id].penales_visita;
        }
        console.log(`PARTIDO ${partido.fixture_id}: Empate en goles (${gA}-${gB}), penales: ${penA} vs ${penB}`);
        if (penA !== null && penB !== null && Number(penA) > Number(penB)) ganador = eqA;
        else if (penA !== null && penB !== null && Number(penB) > Number(penA)) ganador = eqB;
        console.log(`GANADOR POR PENALES: ${ganador}`);
      }
      // Mapear sigla de cruce a ganador para la siguiente ronda
      if (partido.clasificado && ganador) {
        dicSiglas[partido.clasificado] = ganador;
      }
      // Para semifinales/final: mapear WS1, WS2, etc.
      if (ronda === "Semifinales" && partido.clasificado && ganador) {
        dicSiglas[partido.clasificado] = ganador;
      }
      if (ronda === "Final" && partido.clasificado && ganador) {
        dicSiglas[partido.clasificado] = ganador;
      }
    }
  }
  // Log de depuración para ver el avance final
  console.log('[DEPURACION][Avance siglas->nombre real]:', dicSiglas);
  return dicSiglas;
}
