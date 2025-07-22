// Servicio de cálculo de puntajes para Sudamericana
// Requiere: fixture, pronosticosUsuario, resultadosOficiales

/**
 * Calcula los puntajes de un usuario para la Sudamericana de eliminación directa.
 * @param {Array} fixture - Array de partidos (con bonus, ronda, equipos, etc)
 * @param {Array} pronosticos - Array de pronósticos del usuario (por fixture_id)
 * @param {Array} resultados - Array de resultados oficiales (por fixture_id)
 * @param {number} usuarioId - ID del usuario (opcional, para logs)
 * @param {Object} mapeoSiglas - Mapeo opcional de siglas a nombres reales
 * @returns {Object} Puntaje total y detalle por partido
 */
function calcularPuntajesSudamericana(fixture, pronosticos, resultados, usuarioId = null, mapeoSiglas = null) {
  
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
    const cruceCoincide = verificarCruceCoincidente(pron, real, mapeoSiglas);
    
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
 * @param {Object} mapeoSiglas - Mapeo opcional de siglas a nombres reales
 * @returns {boolean} true si el cruce coincide, false si no
 */
function verificarCruceCoincidente(pronostico, resultado, mapeoSiglas = null) {
  if (!pronostico || !resultado) return false;
  
  // Debug específico para semifinales
  if (pronostico.equipo_local?.includes('Independiente') || pronostico.equipo_visita?.includes('Independiente') ||
      resultado.equipo_local?.includes('Independiente') || resultado.equipo_visita?.includes('Independiente')) {
    
    // Si los equipos son completamente diferentes, mostrar error
    if (!resultado.equipo_local?.includes('Independiente') && !resultado.equipo_visita?.includes('Independiente') &&
        !resultado.equipo_local?.includes('Fluminense') && !resultado.equipo_visita?.includes('Fluminense')) {
      
    }
  }
  
  // SOLUCIÓN UNIVERSAL: Función para verificar si un texto contiene siglas
  const esSigla = (texto) => {
    if (!texto) return false;
    // Detectar patrones de siglas: WC1, WC2, WS1, WS2, WP1-WP8, WO1-WO8, etc.
    return /^W[CPSO]\d+$|^W[CPSO]\.\w+$/.test(texto.trim());
  };
  
  // Si alguno de los equipos en resultado es una sigla, necesitamos mapeo
  const resultadoTieneSiglas = esSigla(resultado.equipo_local) || esSigla(resultado.equipo_visita);
  
  if (resultadoTieneSiglas && mapeoSiglas) {
    console.log('🔄 DETECTADAS SIGLAS EN RESULTADO - aplicando mapeo universal');
    console.log('   Resultado original:', resultado.equipo_local, 'vs', resultado.equipo_visita);
    
    // Función para convertir sigla a nombre real
    const convertirSigla = (texto) => {
      const converted = mapeoSiglas[texto] || texto;
      console.log(`   ${texto} -> ${converted}`);
      return converted;
    };
    
    // Convertir equipos del resultado usando mapeo
    const resultadoConNombres = {
      equipo_local: convertirSigla(resultado.equipo_local),
      equipo_visita: convertirSigla(resultado.equipo_visita)
    };
    
    console.log('🔄 RESULTADO CONVERTIDO:', resultadoConNombres.equipo_local, 'vs', resultadoConNombres.equipo_visita);
    
    // Ahora comparar pronóstico vs resultado convertido
    const pronEquipos = [pronostico.equipo_local, pronostico.equipo_visita].sort();
    const realEquipos = [resultadoConNombres.equipo_local, resultadoConNombres.equipo_visita].sort();
    
    const coincide = JSON.stringify(pronEquipos) === JSON.stringify(realEquipos);
    if (coincide) {
      console.log('✅ MATCH UNIVERSAL CON MAPEO DE SIGLAS');
      return true;
    }
  }
  
  // Normalizar nombres para comparación (remover acentos, espacios extra, etc.)
  const normalizar = (str) => {
    if (!str) return '';
    return str.toString().trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .replace(/[^\w\s]/g, '') // Remover signos de puntuación
      .replace(/\s+/g, ' ') // Normalizar espacios
      .trim();
  };
  
  const pronLocal = normalizar(pronostico.equipo_local);
  const pronVisita = normalizar(pronostico.equipo_visita);
  const realLocal = normalizar(resultado.equipo_local);
  const realVisita = normalizar(resultado.equipo_visita);
  
  // Verificar coincidencia directa
  const coincidenDirecto = (pronLocal === realLocal && pronVisita === realVisita);
  
  // Verificar coincidencia invertida
  const coincidenInvertido = (pronLocal === realVisita && pronVisita === realLocal);
  
  // Verificar coincidencia parcial (contiene)
  const localCoincide = pronLocal.includes(realLocal) || realLocal.includes(pronLocal) || 
                       pronLocal === realLocal;
  const visitaCoincide = pronVisita.includes(realVisita) || realVisita.includes(pronVisita) || 
                        pronVisita === realVisita;
  
  const localCoincideInv = pronLocal.includes(realVisita) || realVisita.includes(pronLocal) || 
                          pronLocal === realVisita;
  const visitaCoincideInv = pronVisita.includes(realLocal) || realLocal.includes(pronVisita) || 
                           pronVisita === realLocal;
  
  const coincidenParcialDirecto = localCoincide && visitaCoincide;
  const coincidenParcialInvertido = localCoincideInv && visitaCoincideInv;
  
  const resultado_final = coincidenDirecto || coincidenInvertido || coincidenParcialDirecto || coincidenParcialInvertido;
  
  // SOLUCIÓN DEFINITIVA: Si no hay coincidencia exacta, verificar equipos individuales
  // Esto soluciona el problema de fixture_ids que no existen en sudamericana_fixtures (como semifinales)
  if (!resultado_final) {
    
    // Verificar si los equipos del pronóstico están presentes en el resultado (en cualquier orden)
    const equiposPronostico = [normalizar(pronostico.equipo_local), normalizar(pronostico.equipo_visita)];
    const equiposResultado = [normalizar(resultado.equipo_local), normalizar(resultado.equipo_visita)];
    
    // Buscar coincidencias parciales (includes) para cada equipo
    const equipo1Coincide = equiposResultado.some(eqRes => 
      equiposPronostico.some(eqPron => 
        eqPron.includes(eqRes) || eqRes.includes(eqPron) || eqPron === eqRes
      )
    );
    
    const equipo2Coincide = equiposPronostico.every(eqPron => 
      equiposResultado.some(eqRes => 
        eqPron.includes(eqRes) || eqRes.includes(eqPron) || eqPron === eqRes
      )
    );
    
    if (equipo1Coincide && equipo2Coincide) {
      return true;
    }
    
  }
  
  return resultado_final;
}

export { calcularPuntajesSudamericana };
