// Utilidad mejorada para reemplazar siglas por nombres reales en Sudamericana
// Busca en el fixture todos los mapeos posibles de sigla => nombre real
export function construirDiccionarioSiglas(fixture) {
  const dic = {};
  for (const f of fixture) {
    // Si equipo_local es una sigla y clasificado tiene un nombre real, mapear
    if (f.clasificado && f.equipo_local && f.clasificado !== f.equipo_local && f.equipo_local.length > 2) {
      dic[f.equipo_local] = f.clasificado;
    }
    if (f.clasificado && f.equipo_visita && f.clasificado !== f.equipo_visita && f.equipo_visita.length > 2) {
      dic[f.equipo_visita] = f.clasificado;
    }
    // Si clasificado es una sigla y equipo_local tiene nombre real, mapear
    if (f.clasificado && f.equipo_local && f.clasificado.length > 2 && f.equipo_local.length > 2) {
      dic[f.clasificado] = f.equipo_local;
    }
    if (f.clasificado && f.equipo_visita && f.clasificado.length > 2 && f.equipo_visita.length > 2) {
      dic[f.clasificado] = f.equipo_visita;
    }
  }
  return dic;
}

// Utilidad para reemplazar siglas por nombres reales en Sudamericana
// Recibe: array de partidos/pronósticos, diccionario de sigla => nombre real
export function reemplazarSiglasPorNombres(arr, dicSiglas) {
  if (!arr || !Array.isArray(arr) || !dicSiglas) return arr;
  return arr.map(item => ({
    ...item,
    equipo_local: dicSiglas[item.equipo_local] || item.equipo_local,
    equipo_visita: dicSiglas[item.equipo_visita] || item.equipo_visita
  }));
}
