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
