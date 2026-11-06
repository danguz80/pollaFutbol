import { pool } from '../db/pool.js';

const GRUPOS = { 1: [1, 2, 3], 2: [4, 5, 6] };
const FINAL_PARTIDOS = [7, 8, 9];

// Áreas de trabajo de cada jugador (no tiene relación con los equipos del
// torneo) — mismo mapeo que ClasificacionCopaGinoPerez.jsx, para que el PDF
// final incluya la misma tabla de "Clasificación por Área". Identifica a
// cada jugador por su apellido (sin tildes, sin importar mayúsculas) dentro
// de su nombre completo.
const AREAS_EQUIPO = [
  { area: 'Cracking', apellidos: ['guzman', 'amestica', 'herrera', 'oyanedel', 'castillo'] },
  { area: 'H2', apellidos: ['silva', 'torrijo'] },
  { area: 'Coker', apellidos: ['abad'] },
  { area: 'Fraccionamiento', apellidos: ['slater', 'aguilera', 'titus'] }
];
const normalizarNombre = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const areaDeJugador = (nombre) => {
  const n = normalizarNombre(nombre);
  const encontrada = AREAS_EQUIPO.find(a => a.apellidos.some(ap => n.includes(ap)));
  return encontrada ? encontrada.area : 'Sin área asignada';
};

// Enfrentamientos fijos de cada grupo (todos-contra-todos): el partido que
// corresponde a cada posición de la lista (1°,2°,3°) dentro del grupo, sin
// importar en qué orden se jueguen en la realidad.
const EMPAREJAMIENTOS_GRUPO = [
  { ordenLocal: 2, ordenVisita: 3 },
  { ordenLocal: 1, ordenVisita: 3 },
  { ordenLocal: 1, ordenVisita: 2 }
];

// Se asegura de que los 6 partidos de fase de grupos tengan siempre los
// equipos fijos que les corresponden (idempotente y segura de llamar en
// cualquier momento): corrige datos sembrados por una versión anterior de
// la migración, sin tocar partidos ya jugados.
export async function asegurarEquiposGrupoFijos() {
  const equiposRes = await pool.query(`SELECT id, nombre, grupo, orden FROM copa_gino_perez_equipos`);
  const equipoId = (grupo, orden) => equiposRes.rows.find(e => e.grupo === grupo && e.orden === orden)?.id || null;

  for (const [grupoNum, ids] of Object.entries(GRUPOS)) {
    const grupo = Number(grupoNum);
    for (let idx = 0; idx < ids.length; idx++) {
      const partidoId = ids[idx];
      const { ordenLocal, ordenVisita } = EMPAREJAMIENTOS_GRUPO[idx];
      const localId = equipoId(grupo, ordenLocal);
      const visitaId = equipoId(grupo, ordenVisita);
      if (localId && visitaId) {
        await pool.query(
          `UPDATE copa_gino_perez_partidos SET equipo_local_id = $1, equipo_visita_id = $2 WHERE id = $3 AND jugado = false`,
          [localId, visitaId, partidoId]
        );
      }
    }
  }
}

// Puntaje de un partido: se otorga solo el tramo más alto que se cumpla
// (no son acumulativos), igual que en Libertadores/Sudamericana/Mundial.
export function calcularPuntosPartido(golLocalPred, golVisitaPred, golLocalReal, golVisitaReal, reglas) {
  if (golLocalReal == null || golVisitaReal == null) return 0;
  if (golLocalPred == null || golVisitaPred == null) return 0;

  if (golLocalPred === golLocalReal && golVisitaPred === golVisitaReal) {
    return reglas.exacto;
  }

  const diferenciaPred = golLocalPred - golVisitaPred;
  const diferenciaReal = golLocalReal - golVisitaReal;
  if (diferenciaPred === diferenciaReal) {
    return reglas.diferencia;
  }

  const signoPred = Math.sign(diferenciaPred);
  const signoReal = Math.sign(diferenciaReal);
  if (signoPred === signoReal) {
    return reglas.resultado;
  }

  return 0;
}

// Determina el ganador de un partido ya jugado. Si terminó en empate,
// requiere que el admin haya fijado explícitamente un ganador (desempate
// real, ej. penales), igual que en los demás torneos.
export function determinarGanador(partido) {
  if (partido.goles_local == null || partido.goles_visita == null) return null;
  if (partido.goles_local > partido.goles_visita) return partido.equipo_local_id;
  if (partido.goles_visita > partido.goles_local) return partido.equipo_visita_id;
  return partido.ganador_id || null;
}

// Calcula la tabla de un grupo de 3 equipos a partir de 3 partidos
// (equipo_local_id, equipo_visita_id, goles_local, goles_visita).
// Desempate: puntos > diferencia de gol > goles a favor > enfrentamiento
// directo (solo decide empates entre 2 equipos) > orden original de la lista.
export function calcularStandingsGrupo(equiposGrupo, partidosGrupo) {
  const stats = {};
  equiposGrupo.forEach(e => {
    stats[e.id] = { equipo_id: e.id, nombre: e.nombre, orden: e.orden, puntos: 0, dg: 0, gf: 0 };
  });

  const headToHead = {};
  partidosGrupo.forEach(p => {
    if (p.goles_local == null || p.goles_visita == null) return;
    const localId = p.equipo_local_id;
    const visitaId = p.equipo_visita_id;
    if (!stats[localId] || !stats[visitaId]) return;

    stats[localId].gf += p.goles_local;
    stats[visitaId].gf += p.goles_visita;
    stats[localId].dg += (p.goles_local - p.goles_visita);
    stats[visitaId].dg += (p.goles_visita - p.goles_local);

    let ganador = 'draw';
    if (p.goles_local > p.goles_visita) {
      stats[localId].puntos += 3;
      ganador = localId;
    } else if (p.goles_visita > p.goles_local) {
      stats[visitaId].puntos += 3;
      ganador = visitaId;
    } else {
      stats[localId].puntos += 1;
      stats[visitaId].puntos += 1;
    }
    const key = [localId, visitaId].sort((a, b) => a - b).join('-');
    headToHead[key] = ganador;
  });

  const arr = Object.values(stats);
  arr.sort((a, b) => {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    if (b.dg !== a.dg) return b.dg - a.dg;
    if (b.gf !== a.gf) return b.gf - a.gf;
    const key = [a.equipo_id, b.equipo_id].sort((x, y) => x - y).join('-');
    const h2h = headToHead[key];
    if (h2h && h2h !== 'draw') {
      return h2h === a.equipo_id ? -1 : 1;
    }
    return a.orden - b.orden;
  });

  return arr;
}

// Construye los 3 "partidos virtuales" de un grupo aplicando los propios
// pronósticos del usuario a los 3 enfrentamientos FIJOS del grupo (al ser
// todos-contra-todos, los 3 enfrentamientos de cada grupo son siempre los
// mismos, sin importar en qué orden se jueguen en la realidad) — así el
// bracket virtual se puede calcular desde el momento en que el usuario
// llena su pronóstico, sin esperar a que se jueguen partidos reales.
function construirPartidosVirtualesGrupo(partidosFijosGrupo, prediccionesPorPartido) {
  return partidosFijosGrupo
    .filter(p => prediccionesPorPartido[p.id])
    .map(p => ({
      equipo_local_id: p.equipo_local_id,
      equipo_visita_id: p.equipo_visita_id,
      goles_local: prediccionesPorPartido[p.id].goles_local,
      goles_visita: prediccionesPorPartido[p.id].goles_visita
    }));
}

async function obtenerReglas() {
  const result = await pool.query(`SELECT fase, concepto, puntos FROM copa_gino_perez_puntuacion`);
  const reglas = {};
  result.rows.forEach(r => {
    if (!reglas[r.fase]) reglas[r.fase] = {};
    reglas[r.fase][r.concepto] = r.puntos;
  });
  return reglas;
}

// Recalcula TODO el torneo desde cero (equipos resueltos, puntajes de
// pronósticos, puntos de posiciones) en base al estado actual de los
// resultados reales. Se llama cada vez que el admin guarda un resultado.
export async function recalcularTodo() {
  const reglas = await obtenerReglas();
  const reglasGrupos = reglas.grupos || { resultado: 1, diferencia: 3, exacto: 5 };
  const reglasFinal = reglas.final || { resultado: 3, diferencia: 5, exacto: 7 };
  const reglasPosGrupo = reglas.posiciones_grupo || { '1er_lugar': 5, '2do_lugar': 3, '3er_lugar': 3 };
  const reglasPosFinal = reglas.posiciones_finales || {
    campeon: 20, subcampeon: 15, '3er_lugar': 10, '4to_lugar': 10, '5to_lugar': 10, ultimo: 15
  };

  await asegurarEquiposGrupoFijos();

  const equiposRes = await pool.query(`SELECT id, nombre, grupo, orden FROM copa_gino_perez_equipos`);
  const equipos = equiposRes.rows;
  const equiposPorGrupo = {
    1: equipos.filter(e => e.grupo === 1),
    2: equipos.filter(e => e.grupo === 2)
  };

  let partidosRes = await pool.query(`SELECT * FROM copa_gino_perez_partidos ORDER BY id`);
  let partidos = partidosRes.rows;
  const partidoPorId = id => partidos.find(p => p.id === id);

  // El partido con bonus es una configuración GLOBAL que fija el admin (no
  // una elección de cada usuario): se aplica por igual a todos.
  const configRes = await pool.query(`
    SELECT bonus_grupo1_partido, bonus_grupo2_partido, bonus_final_partido, bonus_final_multiplicador
    FROM copa_gino_perez_config WHERE id = 1
  `);
  const configBonus = configRes.rows[0] || {};

  // 1) Puntaje de los 6 partidos de fase de grupos (a ciegas por partido,
  // sin importar qué equipos hayan terminado jugándolo en la realidad).
  const pronosticosRes = await pool.query(`SELECT * FROM copa_gino_perez_pronosticos`);
  const pronosticos = pronosticosRes.rows;

  for (const partidoNum of [1, 2, 3, 4, 5, 6]) {
    const real = partidoPorId(partidoNum);
    const predsDeEstePartido = pronosticos.filter(p => p.partido_id === partidoNum);
    for (const pred of predsDeEstePartido) {
      let multiplicador = 1;
      if ((partidoNum <= 3 && configBonus.bonus_grupo1_partido === partidoNum) ||
          (partidoNum >= 4 && configBonus.bonus_grupo2_partido === partidoNum)) {
        multiplicador = 2;
      }
      const base = real.jugado
        ? calcularPuntosPartido(pred.goles_local, pred.goles_visita, real.goles_local, real.goles_visita, reglasGrupos)
        : 0;
      await pool.query(
        `UPDATE copa_gino_perez_pronosticos SET puntos_base = $1, bonus_multiplicador = $2, puntos = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [base, multiplicador, base * multiplicador, pred.id]
      );
    }
  }

  const grupoCompleto = grupoNum => GRUPOS[grupoNum].every(id => partidoPorId(id).jugado);
  const g1Completo = grupoCompleto(1);
  const g2Completo = grupoCompleto(2);

  // Si algún grupo no está completo todavía, no se puede resolver fase final.
  if (!g1Completo || !g2Completo) {
    return { fase: 'grupos_en_curso' };
  }

  // 3) Tabla real de cada grupo y resolución de equipos de la fase final.
  const standingsRealG1 = calcularStandingsGrupo(equiposPorGrupo[1], GRUPOS[1].map(id => partidoPorId(id)));
  const standingsRealG2 = calcularStandingsGrupo(equiposPorGrupo[2], GRUPOS[2].map(id => partidoPorId(id)));

  await pool.query(`UPDATE copa_gino_perez_partidos SET equipo_local_id = $1, equipo_visita_id = $2 WHERE id = 7`,
    [standingsRealG1[0].equipo_id, standingsRealG2[0].equipo_id]);
  await pool.query(`UPDATE copa_gino_perez_partidos SET equipo_local_id = $1, equipo_visita_id = $2 WHERE id = 8`,
    [standingsRealG1[1].equipo_id, standingsRealG2[1].equipo_id]);
  await pool.query(`UPDATE copa_gino_perez_partidos SET equipo_local_id = $1, equipo_visita_id = $2 WHERE id = 9`,
    [standingsRealG1[2].equipo_id, standingsRealG2[2].equipo_id]);

  partidosRes = await pool.query(`SELECT * FROM copa_gino_perez_partidos ORDER BY id`);
  partidos = partidosRes.rows;

  // 4) Para cada usuario: tabla virtual de cada grupo (sus propios
  // pronósticos de los 6 partidos de grupo, aplicados a los 3 enfrentamientos
  // fijos de cada grupo), puntos de posiciones de grupo, y clasificados virtuales.
  const usuarioIds = [...new Set(pronosticos.map(p => p.usuario_id))];
  const virtualesPorUsuario = {};

  for (const usuarioId of usuarioIds) {
    const prediccionesUsuario = {};
    pronosticos.filter(p => p.usuario_id === usuarioId).forEach(p => { prediccionesUsuario[p.partido_id] = p; });

    const virtualesG1 = construirPartidosVirtualesGrupo(GRUPOS[1].map(id => partidoPorId(id)), prediccionesUsuario);
    const virtualesG2 = construirPartidosVirtualesGrupo(GRUPOS[2].map(id => partidoPorId(id)), prediccionesUsuario);

    const standingsVirtualG1 = calcularStandingsGrupo(equiposPorGrupo[1], virtualesG1);
    const standingsVirtualG2 = calcularStandingsGrupo(equiposPorGrupo[2], virtualesG2);
    virtualesPorUsuario[usuarioId] = { standingsVirtualG1, standingsVirtualG2 };

    let puntosPosicionesGrupos = 0;
    if (standingsVirtualG1[0].equipo_id === standingsRealG1[0].equipo_id) puntosPosicionesGrupos += reglasPosGrupo['1er_lugar'];
    if (standingsVirtualG1[1].equipo_id === standingsRealG1[1].equipo_id) puntosPosicionesGrupos += reglasPosGrupo['2do_lugar'];
    if (standingsVirtualG1[2].equipo_id === standingsRealG1[2].equipo_id) puntosPosicionesGrupos += reglasPosGrupo['3er_lugar'];
    if (standingsVirtualG2[0].equipo_id === standingsRealG2[0].equipo_id) puntosPosicionesGrupos += reglasPosGrupo['1er_lugar'];
    if (standingsVirtualG2[1].equipo_id === standingsRealG2[1].equipo_id) puntosPosicionesGrupos += reglasPosGrupo['2do_lugar'];
    if (standingsVirtualG2[2].equipo_id === standingsRealG2[2].equipo_id) puntosPosicionesGrupos += reglasPosGrupo['3er_lugar'];

    await pool.query(`
      INSERT INTO copa_gino_perez_predicciones_extra (usuario_id, puntos_posiciones_grupos, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (usuario_id) DO UPDATE SET puntos_posiciones_grupos = $2, updated_at = CURRENT_TIMESTAMP
    `, [usuarioId, puntosPosicionesGrupos]);
  }

  // 5) Puntaje de los 3 partidos de fase final (bracket virtual propio):
  // solo se puntúa si el enfrentamiento virtual del usuario coincide
  // exactamente con el enfrentamiento real; si no coincide, 0 puntos.
  const mapaFinal = {
    7: { virtualLocal: s => s.standingsVirtualG1[0], virtualVisita: s => s.standingsVirtualG2[0] },
    8: { virtualLocal: s => s.standingsVirtualG1[1], virtualVisita: s => s.standingsVirtualG2[1] },
    9: { virtualLocal: s => s.standingsVirtualG1[2], virtualVisita: s => s.standingsVirtualG2[2] }
  };

  for (const partidoNum of FINAL_PARTIDOS) {
    const real = partidoPorId(partidoNum);
    const predsDeEstePartido = pronosticos.filter(p => p.partido_id === partidoNum);
    for (const pred of predsDeEstePartido) {
      const virtual = virtualesPorUsuario[pred.usuario_id];
      const virtualLocalId = mapaFinal[partidoNum].virtualLocal(virtual).equipo_id;
      const virtualVisitaId = mapaFinal[partidoNum].virtualVisita(virtual).equipo_id;
      const coincide = virtualLocalId === real.equipo_local_id && virtualVisitaId === real.equipo_visita_id;

      let multiplicador = 1;
      if (configBonus.bonus_final_partido === partidoNum) {
        multiplicador = configBonus.bonus_final_multiplicador || 2;
      }

      const base = (coincide && real.jugado)
        ? calcularPuntosPartido(pred.goles_local, pred.goles_visita, real.goles_local, real.goles_visita, reglasFinal)
        : 0;

      await pool.query(
        `UPDATE copa_gino_perez_pronosticos SET puntos_base = $1, bonus_multiplicador = $2, puntos = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
        [base, multiplicador, base * multiplicador, pred.id]
      );
    }
  }

  const finalCompleto = FINAL_PARTIDOS.every(id => {
    const p = partidoPorId(id);
    return p.jugado && determinarGanador(p);
  });

  if (!finalCompleto) {
    return { fase: 'fase_final_en_curso' };
  }

  // 6) Posiciones finales reales (1° a 6°) y puntaje de acierto por usuario.
  const p7 = partidoPorId(7);
  const p8 = partidoPorId(8);
  const p9 = partidoPorId(9);
  const gan7 = determinarGanador(p7);
  const gan8 = determinarGanador(p8);
  const gan9 = determinarGanador(p9);
  const posicionesReales = {
    1: gan7,
    2: gan7 === p7.equipo_local_id ? p7.equipo_visita_id : p7.equipo_local_id,
    3: gan8,
    4: gan8 === p8.equipo_local_id ? p8.equipo_visita_id : p8.equipo_local_id,
    5: gan9,
    6: gan9 === p9.equipo_local_id ? p9.equipo_visita_id : p9.equipo_local_id
  };

  // Ganador "virtual" de un partido de fase final según el marcador que
  // predijo el usuario, aplicado sobre los equipos de SU PROPIO bracket
  // virtual (no sobre los equipos del cruce real): si predijo a su equipo
  // "local" (representante de su Grupo 1 virtual) con más goles, ese es su
  // campeón/ganador virtual; en caso de empate, se asume como ganador a ese
  // mismo equipo "local" de su bracket (desempate arbitrario y determinista).
  const ganadorVirtual = (pred, equipoVirtualLocalId, equipoVirtualVisitaId) => {
    if (pred.goles_local > pred.goles_visita) return equipoVirtualLocalId;
    if (pred.goles_visita > pred.goles_local) return equipoVirtualVisitaId;
    return equipoVirtualLocalId;
  };

  for (const usuarioId of usuarioIds) {
    const prediccionesUsuario = {};
    pronosticos.filter(p => p.usuario_id === usuarioId).forEach(p => { prediccionesUsuario[p.partido_id] = p; });
    const pred7 = prediccionesUsuario[7];
    const pred8 = prediccionesUsuario[8];
    const pred9 = prediccionesUsuario[9];
    const virtual = virtualesPorUsuario[usuarioId];

    let puntosPosicionesFinales = 0;
    if (pred7 && virtual) {
      const virtualLocal7 = virtual.standingsVirtualG1[0].equipo_id;
      const virtualVisita7 = virtual.standingsVirtualG2[0].equipo_id;
      const ganVirtual7 = ganadorVirtual(pred7, virtualLocal7, virtualVisita7);
      const perdVirtual7 = ganVirtual7 === virtualLocal7 ? virtualVisita7 : virtualLocal7;
      if (ganVirtual7 === posicionesReales[1]) puntosPosicionesFinales += reglasPosFinal.campeon;
      if (perdVirtual7 === posicionesReales[2]) puntosPosicionesFinales += reglasPosFinal.subcampeon;
    }
    if (pred8 && virtual) {
      const virtualLocal8 = virtual.standingsVirtualG1[1].equipo_id;
      const virtualVisita8 = virtual.standingsVirtualG2[1].equipo_id;
      const ganVirtual8 = ganadorVirtual(pred8, virtualLocal8, virtualVisita8);
      const perdVirtual8 = ganVirtual8 === virtualLocal8 ? virtualVisita8 : virtualLocal8;
      if (ganVirtual8 === posicionesReales[3]) puntosPosicionesFinales += reglasPosFinal['3er_lugar'];
      if (perdVirtual8 === posicionesReales[4]) puntosPosicionesFinales += reglasPosFinal['4to_lugar'];
    }
    if (pred9 && virtual) {
      const virtualLocal9 = virtual.standingsVirtualG1[2].equipo_id;
      const virtualVisita9 = virtual.standingsVirtualG2[2].equipo_id;
      const ganVirtual9 = ganadorVirtual(pred9, virtualLocal9, virtualVisita9);
      const perdVirtual9 = ganVirtual9 === virtualLocal9 ? virtualVisita9 : virtualLocal9;
      if (ganVirtual9 === posicionesReales[5]) puntosPosicionesFinales += reglasPosFinal['5to_lugar'];
      if (perdVirtual9 === posicionesReales[6]) puntosPosicionesFinales += reglasPosFinal.ultimo;
    }

    await pool.query(`
      INSERT INTO copa_gino_perez_predicciones_extra (usuario_id, puntos_posiciones_finales, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (usuario_id) DO UPDATE SET puntos_posiciones_finales = $2, updated_at = CURRENT_TIMESTAMP
    `, [usuarioId, puntosPosicionesFinales]);
  }

  return { fase: 'torneo_completo', posicionesReales };
}

// Cierre automático por fecha/hora (igual que "fecha_cierre" en los demás
// torneos): si el admin fijó una fecha de cierre y ya pasó, cierra los
// pronósticos solo. Se llama cada minuto desde server/index.js.
export async function cerrarPronosticosSiCorresponde() {
  const result = await pool.query(`
    SELECT cerrado, fecha_cierre FROM copa_gino_perez_config
    WHERE id = 1 AND cerrado = false AND fecha_cierre IS NOT NULL AND fecha_cierre <= NOW()
  `);
  if (result.rowCount === 0) return;

  await pool.query(`UPDATE copa_gino_perez_config SET cerrado = true, updated_at = CURRENT_TIMESTAMP WHERE id = 1`);
  console.log('🔒 Pronósticos de Copa Gino Pérez cerrados automáticamente (fecha_cierre alcanzada)');
}

// Arma el detalle completo del torneo (partidos, bonos y puntos de cada
// pronóstico, posiciones virtual-vs-real y ranking final) para cada jugador
// activo — usado por el PDF final. Replica, sobre datos reales de la BD, la
// misma lógica de "bracket virtual" que recalcularTodo() usa para puntuar
// (incluido el fix: un usuario sin ningún pronóstico de grupos no obtiene
// una tabla virtual fabricada por el desempate de orden original).
export async function obtenerDetalleCompletoTorneo() {
  const reglas = await obtenerReglas();
  const reglasPosGrupo = reglas.posiciones_grupo || { '1er_lugar': 5, '2do_lugar': 3, '3er_lugar': 3 };
  const reglasPosFinal = reglas.posiciones_finales || {
    campeon: 20, subcampeon: 15, '3er_lugar': 10, '4to_lugar': 10, '5to_lugar': 10, ultimo: 15
  };

  await asegurarEquiposGrupoFijos();

  const equiposRes = await pool.query(`SELECT id, nombre, grupo, orden FROM copa_gino_perez_equipos ORDER BY grupo, orden`);
  const equipos = equiposRes.rows;
  const equiposPorGrupo = { 1: equipos.filter(e => e.grupo === 1), 2: equipos.filter(e => e.grupo === 2) };
  const nombreEquipo = id => equipos.find(e => e.id === id)?.nombre || null;

  const partidosRes = await pool.query(`SELECT * FROM copa_gino_perez_partidos ORDER BY id`);
  const partidos = partidosRes.rows;
  const partidoPorId = id => partidos.find(p => p.id === id);
  const nombreLado = (p, lado) => {
    const id = lado === 'local' ? p.equipo_local_id : p.equipo_visita_id;
    return (id && nombreEquipo(id)) || (lado === 'local' ? p.descripcion_local : p.descripcion_visita);
  };
  const nombrePartidoTexto = p => `${nombreLado(p, 'local')} vs ${nombreLado(p, 'visita')}`;

  const configRes = await pool.query(`
    SELECT bonus_grupo1_partido, bonus_grupo2_partido, bonus_final_partido, bonus_final_multiplicador
    FROM copa_gino_perez_config WHERE id = 1
  `);
  const configBonus = configRes.rows[0] || {};
  const infoBonus = partidoId => {
    if (partidoId <= 3 && configBonus.bonus_grupo1_partido === partidoId) return { esBonus: true, multiplicador: 2 };
    if (partidoId >= 4 && partidoId <= 6 && configBonus.bonus_grupo2_partido === partidoId) return { esBonus: true, multiplicador: 2 };
    if (configBonus.bonus_final_partido === partidoId) return { esBonus: true, multiplicador: configBonus.bonus_final_multiplicador || 2 };
    return { esBonus: false, multiplicador: 1 };
  };

  const usuariosRes = await pool.query(`
    SELECT id, nombre FROM usuarios WHERE rol != 'admin' AND activo_copa_gino_perez = true ORDER BY nombre ASC
  `);
  const pronosticosRes = await pool.query(`SELECT * FROM copa_gino_perez_pronosticos`);
  const pronosticos = pronosticosRes.rows;
  const extraRes = await pool.query(`
    SELECT usuario_id, puntos_posiciones_grupos, puntos_posiciones_finales FROM copa_gino_perez_predicciones_extra
  `);
  const extraPorUsuario = {};
  extraRes.rows.forEach(e => { extraPorUsuario[e.usuario_id] = e; });

  const standingsRealG1 = calcularStandingsGrupo(equiposPorGrupo[1], GRUPOS[1].map(id => partidoPorId(id)));
  const standingsRealG2 = calcularStandingsGrupo(equiposPorGrupo[2], GRUPOS[2].map(id => partidoPorId(id)));
  const gruposCompletos = [...GRUPOS[1], ...GRUPOS[2]].every(id => partidoPorId(id).jugado);

  const p7 = partidoPorId(7), p8 = partidoPorId(8), p9 = partidoPorId(9);
  const finalCompleto = [p7, p8, p9].every(p => p.jugado && determinarGanador(p));
  let posicionesReales = {};
  if (finalCompleto) {
    const gan7 = determinarGanador(p7), gan8 = determinarGanador(p8), gan9 = determinarGanador(p9);
    posicionesReales = {
      1: gan7, 2: gan7 === p7.equipo_local_id ? p7.equipo_visita_id : p7.equipo_local_id,
      3: gan8, 4: gan8 === p8.equipo_local_id ? p8.equipo_visita_id : p8.equipo_local_id,
      5: gan9, 6: gan9 === p9.equipo_local_id ? p9.equipo_visita_id : p9.equipo_local_id
    };
  }

  const ganadorVirtual = (pred, equipoVirtualLocalId, equipoVirtualVisitaId) => {
    if (!pred || pred.goles_local == null || pred.goles_visita == null) return null;
    if (pred.goles_local > pred.goles_visita) return equipoVirtualLocalId;
    if (pred.goles_visita > pred.goles_local) return equipoVirtualVisitaId;
    return equipoVirtualLocalId;
  };

  const usuarios = usuariosRes.rows.map(u => {
    const predicciones = {};
    pronosticos.filter(p => p.usuario_id === u.id).forEach(p => { predicciones[p.partido_id] = p; });

    const tienePredGrupos = [...GRUPOS[1], ...GRUPOS[2]].some(id => predicciones[id]);
    let standingsVirt = null;
    if (tienePredGrupos) {
      const virtualesG1 = construirPartidosVirtualesGrupo(GRUPOS[1].map(id => partidoPorId(id)), predicciones);
      const virtualesG2 = construirPartidosVirtualesGrupo(GRUPOS[2].map(id => partidoPorId(id)), predicciones);
      standingsVirt = {
        g1: calcularStandingsGrupo(equiposPorGrupo[1], virtualesG1),
        g2: calcularStandingsGrupo(equiposPorGrupo[2], virtualesG2)
      };
    }
    const etiquetaFinalVirtual = idx => {
      if (!standingsVirt) return null;
      const n1 = standingsVirt.g1[idx]?.nombre, n2 = standingsVirt.g2[idx]?.nombre;
      return n1 && n2 ? `${n1} vs ${n2}` : null;
    };

    let totalPartidos = 0;
    const filasPartidos = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(id => {
      const partido = partidoPorId(id);
      const pred = predicciones[id];
      const bonus = infoBonus(id);
      const puntos = pred?.puntos ?? 0;
      if (pred) totalPartidos += puntos;
      const esFinal = id >= 7;
      const nombreReal = nombrePartidoTexto(partido);
      const etiquetaVirtual = esFinal ? etiquetaFinalVirtual(id - 7) : null;
      const noCoincide = esFinal && etiquetaVirtual && partido.equipo_local_id && etiquetaVirtual !== nombreReal;
      return {
        partido: esFinal
          ? (etiquetaVirtual || 'Pendiente (sin pronóstico de grupos)') + (noCoincide ? ` [no es el cruce real: ${nombreReal}]` : '')
          : nombreReal,
        resultadoReal: partido.jugado
          ? (esFinal ? `${nombreReal}: ${partido.goles_local}-${partido.goles_visita}` : `${partido.goles_local}-${partido.goles_visita}`)
          : (esFinal && partido.equipo_local_id ? `${nombreReal} — pendiente` : 'Pendiente'),
        suResultado: pred ? `${pred.goles_local}-${pred.goles_visita}` : '—',
        bonus: bonus.esBonus ? `x${bonus.multiplicador}` : 'x1',
        puntos: pred ? puntos : '—'
      };
    });

    const filasPosGrupo = [1, 2].flatMap(grupoNum => {
      const standingsVirtG = grupoNum === 1 ? standingsVirt?.g1 : standingsVirt?.g2;
      const standingsRealG = grupoNum === 1 ? standingsRealG1 : standingsRealG2;
      const etiquetasPos = ['1er lugar', '2do lugar', '3er lugar'];
      const conceptos = ['1er_lugar', '2do_lugar', '3er_lugar'];
      return [0, 1, 2].map(idx => {
        const virtual = standingsVirtG ? standingsVirtG[idx]?.nombre : null;
        const real = gruposCompletos ? standingsRealG[idx]?.nombre : null;
        const coincide = gruposCompletos && virtual && real && standingsVirtG[idx].equipo_id === standingsRealG[idx].equipo_id;
        const puntos = gruposCompletos ? (coincide ? (reglasPosGrupo[conceptos[idx]] ?? 0) : 0) : null;
        return { posicion: `Grupo ${grupoNum} — ${etiquetasPos[idx]}`, virtual, real, puntos };
      });
    });

    const filasPosFinal = [];
    const agregarPosFinal = (etiquetaGan, etiquetaPerd, pred, idx, conceptoGan, conceptoPerd, slotGan, slotPerd) => {
      const virtualLocal = standingsVirt?.g1?.[idx];
      const virtualVisita = standingsVirt?.g2?.[idx];
      const ganVirtualId = virtualLocal && virtualVisita ? ganadorVirtual(pred, virtualLocal.equipo_id, virtualVisita.equipo_id) : null;
      const perdVirtualId = ganVirtualId ? (ganVirtualId === virtualLocal.equipo_id ? virtualVisita.equipo_id : virtualLocal.equipo_id) : null;
      const ganVirtualNombre = ganVirtualId ? nombreEquipo(ganVirtualId) : null;
      const perdVirtualNombre = perdVirtualId ? nombreEquipo(perdVirtualId) : null;

      if (!finalCompleto) {
        filasPosFinal.push({ posicion: etiquetaGan, virtual: ganVirtualNombre, real: null, puntos: null });
        filasPosFinal.push({ posicion: etiquetaPerd, virtual: perdVirtualNombre, real: null, puntos: null });
        return;
      }
      const ganReal = posicionesReales[slotGan];
      const perdReal = posicionesReales[slotPerd];
      filasPosFinal.push({
        posicion: etiquetaGan, virtual: ganVirtualNombre,
        real: ganReal ? nombreEquipo(ganReal) : null,
        puntos: ganVirtualId && ganReal ? (ganVirtualId === ganReal ? (reglasPosFinal[conceptoGan] ?? 0) : 0) : null
      });
      filasPosFinal.push({
        posicion: etiquetaPerd, virtual: perdVirtualNombre,
        real: perdReal ? nombreEquipo(perdReal) : null,
        puntos: perdVirtualId && perdReal ? (perdVirtualId === perdReal ? (reglasPosFinal[conceptoPerd] ?? 0) : 0) : null
      });
    };
    agregarPosFinal('Campeón', 'Subcampeón', predicciones[7], 0, 'campeon', 'subcampeon', 1, 2);
    agregarPosFinal('3er lugar', '4to lugar', predicciones[8], 1, '3er_lugar', '4to_lugar', 3, 4);
    agregarPosFinal('5to lugar', 'Último lugar', predicciones[9], 2, '5to_lugar', 'ultimo', 5, 6);

    const extra = extraPorUsuario[u.id] || {};
    const totalPosiciones = (extra.puntos_posiciones_grupos || 0) + (extra.puntos_posiciones_finales || 0);
    const puntosTotal = totalPartidos + totalPosiciones;

    return {
      id: u.id, nombre: u.nombre,
      totalPartidos, totalPosiciones, puntosTotal,
      filasPartidos, filasPosGrupo, filasPosFinal
    };
  });

  const ranking = [...usuarios].sort((a, b) => b.puntosTotal - a.puntosTotal || a.nombre.localeCompare(b.nombre));

  // Clasificación por área: agrupa el ranking por área de trabajo y suma
  // los puntos totales de cada una.
  const gruposArea = {};
  ranking.forEach(u => {
    const area = areaDeJugador(u.nombre);
    if (!gruposArea[area]) gruposArea[area] = { area, jugadores: [], puntos: 0 };
    gruposArea[area].jugadores.push(u.nombre);
    gruposArea[area].puntos += u.puntosTotal;
  });
  const rankingPorArea = Object.values(gruposArea).sort((a, b) => b.puntos - a.puntos || a.area.localeCompare(b.area));

  return { standingsRealG1, standingsRealG2, gruposCompletos, finalCompleto, posicionesReales, usuarios, ranking, rankingPorArea };
}
