// Servicio de cálculo de puntajes para Sudamericana
// Requiere: fixture, pronosticosUsuario, resultadosOficiales

/**
 * Calcula los puntajes de un usuario para la Sudamericana de eliminación directa.
 * @param {Array} fixture - Array de partidos (con bonus, ronda, equipos, etc)
 * @param {Array} pronosticos - Array de pronósticos del usuario (por fixture_id)
 * @param {Array} resultados - Array de resultados oficiales (por fixture_id)
 * @param {number} usuarioId - ID del usuario (opcional, para logs)
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
    
    // Verificar si el cruce pronosticado coincide con el cruce real
    const cruceCoincide = verificarCruceCoincidente(pron, real);
    
    let pts = 0;
    let tipo = '';
    let motivoSinPuntos = '';
    
    // Bonus
    const bonus = partido.bonus ? Number(partido.bonus) : 1;
    
    if (real.goles_local !== null && real.goles_visita !== null) {
      if (!cruceCoincide) {
        // Si el cruce no coincide, puntos = 0
        pts = 0;
        tipo = 'X'; // Marca especial para cruce no coincidente
        motivoSinPuntos = 'Cruce no coincide';
      } else {
        let puntajes = [];
        // Signo
        const signoPron = Math.sign(pron.goles_local - pron.goles_visita);
        const signoReal = Math.sign(real.goles_local - real.goles_visita);
        if (signoPron === signoReal) {
          puntajes.push({ pts: regla.signo * bonus, tipo: 'S' });
        }
        // Diferencia de gol
        if ((pron.goles_local - pron.goles_visita) === (real.goles_local - real.goles_visita)) {
          puntajes.push({ pts: regla.dif * bonus, tipo: 'D' });
        }
        // Marcador exacto
        if (pron.goles_local === real.goles_local && pron.goles_visita === real.goles_visita) {
          puntajes.push({ pts: regla.exacto * bonus, tipo: 'E' });
        }
        // Clasificado (excepto final)
        if (partido.ronda !== 'Final' && regla.clasificado) {
          if (pron.ganador && real.ganador && pron.ganador === real.ganador) {
            puntajes.push({ pts: regla.clasificado, tipo: 'C' });
          }
        }
        // Final: campeón y subcampeón
        if (partido.ronda === 'Final') {
          if (pron.ganador && real.ganador && pron.ganador === real.ganador) {
            puntajes.push({ pts: regla.campeon, tipo: 'F' });
          }
          // Subcampeón: el perdedor
          const perdedorPron = pron.ganador === partido.equipo_local ? partido.equipo_visita : partido.equipo_local;
          const perdedorReal = real.ganador === partido.equipo_local ? partido.equipo_visita : partido.equipo_local;
          if (perdedorPron && perdedorReal && perdedorPron === perdedorReal) {
            puntajes.push({ pts: regla.subcampeon, tipo: 'S' });
          }
        }
        // Solo asignar el mayor puntaje obtenido
        if (puntajes.length > 0) {
          const max = puntajes.reduce((a, b) => (a.pts > b.pts ? a : b));
          pts = max.pts;
          tipo = max.tipo;
        }
      }
    }
    
    detalle.push({ 
      fixture_id: partido.fixture_id, 
      ronda: partido.ronda, 
      pts, 
      tipo, 
      partido, 
      pron, 
      real,
      cruceCoincide,
      motivoSinPuntos: motivoSinPuntos || null
    });
    total += pts;
  }
  return { total, detalle };
}

/**
 * Verifica si el cruce pronosticado coincide con el cruce real
 * @param {Object} pronostico - Pronóstico del usuario con equipos
 * @param {Object} resultado - Resultado real con equipos
 * @returns {boolean} true si el cruce coincide, false si no
 */
function verificarCruceCoincidente(pronostico, resultado) {
  if (!pronostico || !resultado) return false;
  
  // Normalizar nombres para comparación (remover acentos, espacios extra, etc.)
  const normalizar = (str) => {
    if (!str) return '';
    return str.toString().trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  };
  
  const pronLocal = normalizar(pronostico.equipo_local);
  const pronVisita = normalizar(pronostico.equipo_visita);
  const realLocal = normalizar(resultado.equipo_local);
  const realVisita = normalizar(resultado.equipo_visita);
  
  // Verificar si los equipos coinciden exactamente (local-local, visita-visita)
  const coincidenDirecto = (pronLocal === realLocal && pronVisita === realVisita);
  
  // Verificar si los equipos coinciden invertidos (local-visita, visita-local)
  const coincidenInvertido = (pronLocal === realVisita && pronVisita === realLocal);
  
  // NUEVO: Verificar si hay siglas - en ese caso, considerar como coincidente
  // porque el sistema de siglas ya debería haber resuelto esto correctamente
  const esSigla = (texto) => {
    if (!texto) return false;
    return /^W[A-Z][0-9A-Z]*\.?[A-Z0-9]*$/.test(texto) || texto.length <= 3;
  };
  
  const pronTieneSiglas = esSigla(pronLocal) || esSigla(pronVisita);
  const realTieneSiglas = esSigla(realLocal) || esSigla(realVisita);
  
  // DEBUG: Si hay siglas, significa que el sistema de reemplazo no funcionó correctamente
  // En lugar de retornar true automáticamente, vamos a ser más estrictos
  if (pronTieneSiglas || realTieneSiglas) {
    // Solo coinciden si ambos tienen exactamente las mismas siglas
    return coincidenDirecto || coincidenInvertido;
  }
  
  return coincidenDirecto || coincidenInvertido;
}

export { calcularPuntajesSudamericana };
