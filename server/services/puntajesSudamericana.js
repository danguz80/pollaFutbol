// Servicio de cálculo de puntajes para Sudamericana
// Requiere: fixture, pronosticosUsuario, resultadosOficiales

/**
 * Calcula los puntajes de un usuario para la Sudamericana de eliminación directa.
 * @param {Array} fixture - Array de partidos (con bonus, ronda, equipos, etc)
 * @param {Array} pronosticos - Array de pronósticos del usuario (por fixture_id)
 * @param {Array} resultados - Array de resultados oficiales (por fixture_id)
 * @returns {Object} Puntaje total y detalle por partido
 */
function calcularPuntajesSudamericana(fixture, pronosticos, resultados, usuarioId = null) {
  // Configuración de puntajes por ronda
  const reglas = {
    'Knockout Round Play-offs': { signo: 1, dif: 3, exacto: 5, clasificado: 2 },
    'Octavos de Final':         { signo: 1, dif: 3, exacto: 5, clasificado: 3 },
    'Cuartos de Final':         { signo: 2, dif: 4, exacto: 6, clasificado: 3 },
    'Semifinales':              { signo: 2, dif: 4, exacto: 6, clasificado: 5 },
    'Final':                    { signo: 4, dif: 7, exacto: 10, campeon: 15, subcampeon: 8 }
  };

  // Indexar resultados y pronósticos por fixture_id
  const resMap = Object.fromEntries(resultados.map(r => [r.fixture_id, r]));
  const proMap = Object.fromEntries(pronosticos.map(p => [p.fixture_id, p]));

  let total = 0;
  const detalle = [];

  for (const partido of fixture) {
    const regla = reglas[partido.ronda];
    if (!regla) continue;
    const pron = proMap[partido.fixture_id];
    const real = resMap[partido.fixture_id];
    if (!pron || !real) continue;
    let pts = 0;
    let tipo = '';
    // Bonus
    const bonus = partido.bonus ? Number(partido.bonus) : 1;
    // Signo
    const signoPron = Math.sign(pron.goles_local - pron.goles_visita);
    const signoReal = Math.sign(real.goles_local - real.goles_visita);
    if (signoPron === signoReal) {
      pts += regla.signo * bonus;
      tipo += 'S';
    }
    // Diferencia de gol
    if ((pron.goles_local - pron.goles_visita) === (real.goles_local - real.goles_visita)) {
      pts += regla.dif * bonus;
      tipo += 'D';
    }
    // Marcador exacto
    if (pron.goles_local === real.goles_local && pron.goles_visita === real.goles_visita) {
      pts += regla.exacto * bonus;
      tipo += 'E';
    }
    // Clasificado (excepto final)
    if (partido.ronda !== 'Final' && regla.clasificado) {
      if (pron.ganador && real.ganador && pron.ganador === real.ganador) {
        pts += regla.clasificado;
        tipo += 'C';
      }
    }
    // Final: campeón y subcampeón
    if (partido.ronda === 'Final') {
      if (pron.ganador && real.ganador && pron.ganador === real.ganador) {
        pts += regla.campeon;
        tipo += 'F';
      }
      // Subcampeón: el perdedor
      const perdedorPron = pron.ganador === partido.equipo_local ? partido.equipo_visita : partido.equipo_local;
      const perdedorReal = real.ganador === partido.equipo_local ? partido.equipo_visita : partido.equipo_local;
      if (perdedorPron && perdedorReal && perdedorPron === perdedorReal) {
        pts += regla.subcampeon;
        tipo += 'S';
      }
    }
    detalle.push({ fixture_id: partido.fixture_id, ronda: partido.ronda, pts, tipo, partido, pron, real });
    total += pts;
    // LOG DETALLADO POR PARTIDO
    console.log(`[PUNTAJE][${usuarioId ?? 'usuario'}][${partido.ronda}] fixture_id=${partido.fixture_id} ${partido.equipo_local} vs ${partido.equipo_visita} | pron:`, pron, '| real:', real, '| pts:', pts, '| tipo:', tipo);
  }
  console.log(`[PUNTAJE][${usuarioId ?? 'usuario'}] TOTAL:`, total);
  return { total, detalle };
}

export { calcularPuntajesSudamericana };
