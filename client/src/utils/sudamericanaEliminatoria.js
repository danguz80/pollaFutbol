// Utilidades para avance de cruces Sudamericana (copiado de IngresarPronosticosSud.jsx)
export const ROUNDS = [
  "Knockout Round Play-offs",
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinales",
  "Final"
];

export function agruparPorSigla(partidos) {
  const grupos = {};
  for (const p of partidos) {
    let key = p.clasificado;
    if (!key || typeof key !== 'string' || key.trim() === '') {
      const equipos = [p.equipo_local, p.equipo_visita].sort();
      key = equipos.join(' vs ');
    }
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(p);
  }
  Object.values(grupos).forEach(arr => arr.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)));
  return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
}

export function calcularAvanceEliminatoria(fixture, pronosticos, penales) {
  // Usar la misma lógica que getFixtureVirtual que SÍ funciona correctamente
  const rondas = {};
  
  // Agrupar partidos por ronda y por sigla (cruce)
  for (const partido of fixture) {
    if (!rondas[partido.ronda]) rondas[partido.ronda] = {};
    const sigla = partido.clasificado || [partido.equipo_local, partido.equipo_visita].sort().join(' vs ');
    if (!rondas[partido.ronda][sigla]) rondas[partido.ronda][sigla] = [];
    rondas[partido.ronda][sigla].push({ ...partido });
  }

  let siglaGanadorMap = {};
  const avance = {};

  // Procesar ronda por ronda para propagar ganadores
  for (let i = 0; i < ROUNDS.length; i++) {
    const ronda = ROUNDS[i];
    avance[ronda] = [];
    const cruces = rondas[ronda] || {};

    for (const [sigla, partidos] of Object.entries(cruces)) {
      // Propagar ganadores de rondas anteriores
      for (const partido of partidos) {
        if (siglaGanadorMap[partido.equipo_local]) {
          partido.equipo_local = siglaGanadorMap[partido.equipo_local];
        }
        if (siglaGanadorMap[partido.equipo_visita]) {
          partido.equipo_visita = siglaGanadorMap[partido.equipo_visita];
        }
      }

      let eqA = partidos[0].equipo_local;
      let eqB = partidos[0].equipo_visita;
      let gA = 0, gB = 0;

      // Calcular goles según el número de partidos en el cruce
      if (partidos.length === 2) {
        // Ida y vuelta: sumar goles cruzados
        const p1 = partidos[0], p2 = partidos[1];
        gA = Number(pronosticos[p1.fixture_id]?.local ?? p1.goles_local ?? 0) + 
             Number(pronosticos[p2.fixture_id]?.visita ?? p2.goles_visita ?? 0);
        gB = Number(pronosticos[p1.fixture_id]?.visita ?? p1.goles_visita ?? 0) + 
             Number(pronosticos[p2.fixture_id]?.local ?? p2.goles_local ?? 0);
      } else {
        // Partido único (Final)
        const p = partidos[0];
        gA = Number(pronosticos[p.fixture_id]?.local ?? p.goles_local ?? 0);
        gB = Number(pronosticos[p.fixture_id]?.visita ?? p.goles_visita ?? 0);
      }

      // Determinar ganador
      let ganador = null;
      if (gA > gB) {
        ganador = eqA;
      } else if (gB > gA) {
        ganador = eqB;
      } else {
        // Empate: usar penales del partido de vuelta o único
        let partidoConPenales = partidos.length === 2 ? partidos[1] : partidos[0];
        const penLocal = Number(penales[partidoConPenales.fixture_id]?.local ?? 0);
        const penVisitante = Number(penales[partidoConPenales.fixture_id]?.visitante ?? 0);
        
        // CORREGIDO: Mapear correctamente quién juega de local/visitante en el partido de penales
        const equipoLocal = partidoConPenales.equipo_local;
        const equipoVisitante = partidoConPenales.equipo_visita;
        
        if (penLocal > penVisitante) {
          ganador = equipoLocal; // El que juega de local en ese partido gana
        } else if (penVisitante > penLocal) {
          ganador = equipoVisitante; // El que juega de visitante en ese partido gana
        }
        // Si siguen empatados, ganador queda null
      }

      // Solo agregar UN resultado por cruce
      avance[ronda].push({ 
        sigla, 
        eqA, 
        eqB, 
        gA, 
        gB, 
        ganador 
      });

      // Actualizar mapeo para próximas rondas
      if (sigla && ganador) {
        siglaGanadorMap[sigla] = ganador;
      }
    }
  }

  return avance;
}

// Devuelve partidos de la ronda seleccionada con equipos propagados
// NUEVA VERSION que usa estructura de penales por fixture_id
export function getFixtureVirtual(fixture, pronosticos, penales, selectedRound) {
  const rondas = {};
  for (const partido of fixture) {
    if (!rondas[partido.ronda]) rondas[partido.ronda] = {};
    const sigla = partido.clasificado || [partido.equipo_local, partido.equipo_visita].sort().join(' vs ');
    if (!rondas[partido.ronda][sigla]) rondas[partido.ronda][sigla] = [];
    rondas[partido.ronda][sigla].push({ ...partido });
  }
  let siglaGanadorMap = {};
  for (let i = 0; i < ROUNDS.length; i++) {
    const ronda = ROUNDS[i];
    const cruces = rondas[ronda] || {};
    for (const [sigla, partidos] of Object.entries(cruces)) {
      for (const partido of partidos) {
        if (siglaGanadorMap[partido.equipo_local]) partido.equipo_local = siglaGanadorMap[partido.equipo_local];
        if (siglaGanadorMap[partido.equipo_visita]) partido.equipo_visita = siglaGanadorMap[partido.equipo_visita];
      }
      let eqA = partidos[0].equipo_local;
      let eqB = partidos[0].equipo_visita;
      let gA = 0, gB = 0;
      if (partidos.length === 2) {
        const p1 = partidos[0], p2 = partidos[1];
        gA = Number(pronosticos[p1.fixture_id]?.local ?? p1.goles_local ?? 0) + Number(pronosticos[p2.fixture_id]?.visita ?? p2.goles_visita ?? 0);
        gB = Number(pronosticos[p1.fixture_id]?.visita ?? p1.goles_visita ?? 0) + Number(pronosticos[p2.fixture_id]?.local ?? p2.goles_local ?? 0);
      } else {
        const p = partidos[0];
        gA = Number(pronosticos[p.fixture_id]?.local ?? p.goles_local ?? 0);
        gB = Number(pronosticos[p.fixture_id]?.visita ?? p.goles_visita ?? 0);
      }
      let ganador = null;
      if (gA > gB) ganador = eqA;
      else if (gB > gA) ganador = eqB;
      else {
        // Usar nueva estructura de penales por fixture_id
        // Para cruces de ida y vuelta, usar el partido de vuelta (fixture_id más alto)
        let partidoConPenales = partidos.length === 2 ? partidos[1] : partidos[0];
        const penLocal = Number(penales[partidoConPenales.fixture_id]?.local ?? 0);
        const penVisitante = Number(penales[partidoConPenales.fixture_id]?.visitante ?? 0);
        
        // CORREGIDO: Mapear correctamente quién juega de local/visitante en el partido de penales
        const equipoLocal = partidoConPenales.equipo_local;
        const equipoVisitante = partidoConPenales.equipo_visita;
        
        if (penLocal > penVisitante) {
          ganador = equipoLocal; // El que juega de local en ese partido gana
        } else if (penVisitante > penLocal) {
          ganador = equipoVisitante; // El que juega de visitante en ese partido gana
        } else {
          ganador = null;
        }
      }
      if (sigla && ganador) siglaGanadorMap[sigla] = ganador;
    }
  }
  const partidosRonda = [];
  const crucesRonda = rondas[selectedRound] || {};
  for (const [sigla, partidos] of Object.entries(crucesRonda)) {
    for (const partido of partidos) {
      let eqA = siglaGanadorMap[partido.equipo_local] || partido.equipo_local;
      let eqB = siglaGanadorMap[partido.equipo_visita] || partido.equipo_visita;
      partidosRonda.push({ ...partido, equipo_local: eqA, equipo_visita: eqB });
    }
  }
  return partidosRonda;
}

// Función antigua mantenida para compatibilidad (usa estructura de penales por sigla+equipo)
export function getFixtureVirtualOld(fixture, pronosticos, penales, selectedRound) {
  const rondas = {};
  for (const partido of fixture) {
    if (!rondas[partido.ronda]) rondas[partido.ronda] = {};
    const sigla = partido.clasificado || [partido.equipo_local, partido.equipo_visita].sort().join(' vs ');
    if (!rondas[partido.ronda][sigla]) rondas[partido.ronda][sigla] = [];
    rondas[partido.ronda][sigla].push({ ...partido });
  }
  let siglaGanadorMap = {};
  for (let i = 0; i < ROUNDS.length; i++) {
    const ronda = ROUNDS[i];
    const cruces = rondas[ronda] || {};
    for (const [sigla, partidos] of Object.entries(cruces)) {
      for (const partido of partidos) {
        if (siglaGanadorMap[partido.equipo_local]) partido.equipo_local = siglaGanadorMap[partido.equipo_local];
        if (siglaGanadorMap[partido.equipo_visita]) partido.equipo_visita = siglaGanadorMap[partido.equipo_visita];
      }
      let eqA = partidos[0].equipo_local;
      let eqB = partidos[0].equipo_visita;
      let gA = 0, gB = 0;
      if (partidos.length === 2) {
        const p1 = partidos[0], p2 = partidos[1];
        gA = Number(pronosticos[p1.fixture_id]?.local ?? p1.goles_local ?? 0) + Number(pronosticos[p2.fixture_id]?.visita ?? p2.goles_visita ?? 0);
        gB = Number(pronosticos[p1.fixture_id]?.visita ?? p1.goles_visita ?? 0) + Number(pronosticos[p2.fixture_id]?.local ?? p2.goles_local ?? 0);
      } else {
        const p = partidos[0];
        gA = Number(pronosticos[p.fixture_id]?.local ?? p.goles_local ?? 0);
        gB = Number(pronosticos[p.fixture_id]?.visita ?? p.goles_visita ?? 0);
      }
      let ganador = null;
      if (gA > gB) ganador = eqA;
      else if (gB > gA) ganador = eqB;
      else {
        const penA = Number(penales[sigla]?.[eqA] ?? 0);
        const penB = Number(penales[sigla]?.[eqB] ?? 0);
        if (penA > penB) ganador = eqA;
        else if (penB > penA) ganador = eqB;
        else ganador = null;
      }
      if (sigla && ganador) siglaGanadorMap[sigla] = ganador;
    }
  }
  const partidosRonda = [];
  const crucesRonda = rondas[selectedRound] || {};
  for (const [sigla, partidos] of Object.entries(crucesRonda)) {
    for (const partido of partidos) {
      let eqA = siglaGanadorMap[partido.equipo_local] || partido.equipo_local;
      let eqB = siglaGanadorMap[partido.equipo_visita] || partido.equipo_visita;
      partidosRonda.push({ ...partido, equipo_local: eqA, equipo_visita: eqB });
    }
  }
  return partidosRonda;
}
