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
