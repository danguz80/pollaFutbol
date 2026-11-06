import { useState, useEffect, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

const fotoUrl = (foto) => {
  if (!foto) return null;
  return foto.startsWith('/') ? foto : `/perfil/${foto}`;
};

const medalla = (posicion) => {
  if (posicion === 1) return '🥇';
  if (posicion === 2) return '🥈';
  if (posicion === 3) return '🥉';
  return null;
};

// Secciones del torneo: a qué grupo pertenece cada partido de fase de
// grupos, y qué puesto define cada uno de los 3 partidos de fase final.
const SECCIONES = [
  { ids: [1, 2, 3], color: '#d32f2f', titulo: 'Grupo 1' },
  { ids: [4, 5, 6], color: '#28a745', titulo: 'Grupo 2' },
  { ids: [7], color: '#b8860b', titulo: 'La Gran Final — Define 1° y 2° lugar' },
  { ids: [8], color: '#0d6efd', titulo: '3er y 4to Puesto' },
  { ids: [9], color: '#444', titulo: 'Partido de la Vergüenza — Define 5to y 6to lugar' }
];
const seccionDePartido = id => SECCIONES.find(s => s.ids.includes(id));

// Enfrentamientos fijos de cada grupo (todos contra todos) — igual que en
// PronosticoCopaGinoPerez.jsx — para calcular, a partir del propio
// pronóstico de grupos de un usuario, contra qué equipos pronosticó en la
// fase final (su propio bracket virtual), sin esperar a los resultados reales.
const PARTIDOS_GRUPO = {
  1: [{ id: 1, ordenLocal: 2, ordenVisita: 3 }, { id: 2, ordenLocal: 1, ordenVisita: 3 }, { id: 3, ordenLocal: 1, ordenVisita: 2 }],
  2: [{ id: 4, ordenLocal: 2, ordenVisita: 3 }, { id: 5, ordenLocal: 1, ordenVisita: 3 }, { id: 6, ordenLocal: 1, ordenVisita: 2 }]
};

function calcularStandingsGrupo(equiposGrupo, partidosGrupo) {
  const stats = {};
  equiposGrupo.forEach(e => { stats[e.id] = { equipo_id: e.id, nombre: e.nombre, orden: e.orden, puntos: 0, dg: 0, gf: 0 }; });
  const headToHead = {};
  partidosGrupo.forEach(p => {
    if (p.goles_local == null || p.goles_visita == null) return;
    const localId = p.equipo_local_id, visitaId = p.equipo_visita_id;
    if (!stats[localId] || !stats[visitaId]) return;
    stats[localId].gf += p.goles_local;
    stats[visitaId].gf += p.goles_visita;
    stats[localId].dg += (p.goles_local - p.goles_visita);
    stats[visitaId].dg += (p.goles_visita - p.goles_local);
    let ganador = 'draw';
    if (p.goles_local > p.goles_visita) { stats[localId].puntos += 3; ganador = localId; }
    else if (p.goles_visita > p.goles_local) { stats[visitaId].puntos += 3; ganador = visitaId; }
    else { stats[localId].puntos += 1; stats[visitaId].puntos += 1; }
    headToHead[[localId, visitaId].sort((a, b) => a - b).join('-')] = ganador;
  });
  const arr = Object.values(stats);
  arr.sort((a, b) => {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    if (b.dg !== a.dg) return b.dg - a.dg;
    if (b.gf !== a.gf) return b.gf - a.gf;
    const h2h = headToHead[[a.equipo_id, b.equipo_id].sort((x, y) => x - y).join('-')];
    if (h2h && h2h !== 'draw') return h2h === a.equipo_id ? -1 : 1;
    return a.orden - b.orden;
  });
  return arr;
}

export default function ClasificacionCopaGinoPerez() {
  const navigate = useNavigate();
  const usuarioLogueado = JSON.parse(localStorage.getItem('usuario') || 'null');
  const esAdmin = usuarioLogueado?.rol === 'admin';
  const [ranking, setRanking] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [cerrado, setCerrado] = useState(false);
  const [bonusConfig, setBonusConfig] = useState(null);
  const [miPronostico, setMiPronostico] = useState(null);
  const [todosPronosticos, setTodosPronosticos] = useState(null);
  const [participantes, setParticipantes] = useState([]);
  const [noParticipantes, setNoParticipantes] = useState([]);
  const [reglas, setReglas] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    try {
      setLoading(true);
      const [rankingRes, partidosRes, equiposRes, configRes, reglasRes] = await Promise.all([
        axios.get(`${API_URL}/api/copa-gino-perez/estadisticas`),
        axios.get(`${API_URL}/api/copa-gino-perez/partidos`),
        axios.get(`${API_URL}/api/copa-gino-perez/equipos`),
        axios.get(`${API_URL}/api/copa-gino-perez/config`),
        axios.get(`${API_URL}/api/copa-gino-perez/puntuacion/reglas`)
      ]);
      setRanking(rankingRes.data.ranking || []);
      setPartidos(partidosRes.data);
      setEquipos(equiposRes.data);
      setCerrado(configRes.data.cerrado);
      setBonusConfig(configRes.data);
      const reglasObj = {};
      (reglasRes.data || []).forEach(r => {
        if (!reglasObj[r.fase]) reglasObj[r.fase] = {};
        reglasObj[r.fase][r.concepto] = r.puntos;
      });
      setReglas(reglasObj);

      const token = localStorage.getItem('token');
      if (configRes.data.cerrado || esAdmin) {
        try {
          const todosRes = await axios.get(`${API_URL}/api/copa-gino-perez/pronosticos-todos`,
            token ? { headers: { Authorization: `Bearer ${token}` } } : {});
          setTodosPronosticos(todosRes.data.usuarios || []);
        } catch (err) {
          console.error('Error cargando pronósticos de todos:', err);
        }
      }
      if (!configRes.data.cerrado && token) {
        try {
          const miRes = await axios.get(`${API_URL}/api/copa-gino-perez/pronostico`, { headers: { Authorization: `Bearer ${token}` } });
          setMiPronostico(miRes.data);
        } catch (err) {
          console.error('Error cargando mi pronóstico:', err);
        }
      }
      if (!configRes.data.cerrado) {
        try {
          const partRes = await axios.get(`${API_URL}/api/copa-gino-perez/participantes`);
          setParticipantes(partRes.data.filter(u => u.enviado));
          setNoParticipantes(partRes.data.filter(u => !u.enviado));
        } catch (err) {
          console.error('Error cargando participantes:', err);
        }
      }
    } catch (err) {
      console.error('Error cargando clasificación:', err);
      setError('No se pudo cargar la clasificación');
    } finally {
      setLoading(false);
    }
  };

  const nombrePartido = (p) => `${p.equipo_local_nombre || p.descripcion_local} vs ${p.equipo_visita_nombre || p.descripcion_visita}`;

  // El partido con bonus es una configuración global fijada por el admin
  // (no una elección de cada usuario), así que aplica igual a todas las filas.
  const infoBonus = (partidoId) => {
    if (!bonusConfig) return { esBonus: false };
    if (bonusConfig.bonus_grupo1_partido === partidoId || bonusConfig.bonus_grupo2_partido === partidoId) {
      return { esBonus: true, multiplicador: 2 };
    }
    if (bonusConfig.bonus_final_partido === partidoId) {
      return { esBonus: true, multiplicador: bonusConfig.bonus_final_multiplicador || 2 };
    }
    return { esBonus: false };
  };
  const partidosPorId = useMemo(() => {
    const m = {};
    partidos.forEach(p => { m[p.id] = p; });
    return m;
  }, [partidos]);

  // A partir de cualquier set de 6 pronósticos de grupo (propios o de otro
  // usuario), aplicados a los 3 enfrentamientos FIJOS de cada grupo, calcula
  // la tabla de posiciones "virtual" de cada grupo según ese pronóstico.
  const calcularStandingsVirtuales = (prediccionesPorPartido) => {
    if (!prediccionesPorPartido || equipos.length !== 6) return null;
    // Si el usuario no pronosticó NINGÚN partido de grupos, no hay bracket
    // virtual real que mostrar — devolver null en vez de caer en el
    // desempate por "orden" original de la lista de equipos (que podría
    // coincidir por casualidad con la tabla real y hacer parecer que
    // acertó una posición que nunca pronosticó).
    const tienePredicciones = [1, 2, 3, 4, 5, 6].some(id => prediccionesPorPartido[id]);
    if (!tienePredicciones) return null;
    const calcularGrupo = grupoNum => {
      const equiposGrupo = equipos.filter(e => e.grupo === grupoNum);
      const partidosFijos = PARTIDOS_GRUPO[grupoNum].map(pf => {
        const local = equiposGrupo.find(e => e.orden === pf.ordenLocal);
        const visita = equiposGrupo.find(e => e.orden === pf.ordenVisita);
        const pred = prediccionesPorPartido[pf.id];
        return {
          equipo_local_id: local?.id, equipo_visita_id: visita?.id,
          goles_local: pred?.goles_local, goles_visita: pred?.goles_visita
        };
      });
      return calcularStandingsGrupo(equiposGrupo, partidosFijos);
    };
    return { g1: calcularGrupo(1), g2: calcularGrupo(2) };
  };

  // Para los 3 partidos de fase final: contra qué equipos reales pronosticó
  // cada uno según su bracket virtual — no la descripción genérica
  // ("1° Grupo 1 vs 1° Grupo 2").
  const calcularEtiquetasFinal = (prediccionesPorPartido) => {
    const standings = calcularStandingsVirtuales(prediccionesPorPartido);
    if (!standings) return {};
    const nombre = (standingsG, idx) => standingsG[idx]?.nombre;
    return {
      7: nombre(standings.g1, 0) && nombre(standings.g2, 0) ? `${nombre(standings.g1, 0)} vs ${nombre(standings.g2, 0)}` : null,
      8: nombre(standings.g1, 1) && nombre(standings.g2, 1) ? `${nombre(standings.g1, 1)} vs ${nombre(standings.g2, 1)}` : null,
      9: nombre(standings.g1, 2) && nombre(standings.g2, 2) ? `${nombre(standings.g1, 2)} vs ${nombre(standings.g2, 2)}` : null
    };
  };

  // Ganador "virtual" de un partido de fase final según el marcador
  // pronosticado, aplicado sobre los equipos de SU PROPIO bracket virtual
  // (no sobre los equipos del cruce real) — igual convención que usa el
  // backend en recalcularTodo: si predijo empate, se asume como ganador al
  // equipo "local" de su bracket.
  const ganadorVirtual = (pred, equipoVirtualLocalId, equipoVirtualVisitaId) => {
    if (!pred || pred.goles_local == null || pred.goles_visita == null) return null;
    if (pred.goles_local > pred.goles_visita) return equipoVirtualLocalId;
    if (pred.goles_visita > pred.goles_local) return equipoVirtualVisitaId;
    return equipoVirtualLocalId;
  };

  const nombreEquipo = (id) => equipos.find(e => e.id === id)?.nombre;

  // Tablas REALES de cada grupo (en base a los resultados reales ya
  // cargados) y resolución real de las 6 posiciones finales (campeón a
  // último), replicando en el cliente la misma lógica que usa el backend.
  const standingsRealG1 = useMemo(() =>
    calcularStandingsGrupo(equipos.filter(e => e.grupo === 1), [1, 2, 3].map(id => partidosPorId[id]).filter(Boolean)),
    [equipos, partidosPorId]);
  const standingsRealG2 = useMemo(() =>
    calcularStandingsGrupo(equipos.filter(e => e.grupo === 2), [4, 5, 6].map(id => partidosPorId[id]).filter(Boolean)),
    [equipos, partidosPorId]);
  const gruposCompletos = useMemo(() => [1, 2, 3, 4, 5, 6].every(id => partidosPorId[id]?.jugado), [partidosPorId]);

  const posicionesRealesIds = useMemo(() => {
    const p7 = partidosPorId[7], p8 = partidosPorId[8], p9 = partidosPorId[9];
    if (!p7 || !p8 || !p9) return {};
    const determinarGanadorReal = p => {
      if (p.goles_local == null || p.goles_visita == null) return null;
      if (p.goles_local > p.goles_visita) return p.equipo_local_id;
      if (p.goles_visita > p.goles_local) return p.equipo_visita_id;
      return p.ganador_id || null;
    };
    const gan7 = determinarGanadorReal(p7), gan8 = determinarGanadorReal(p8), gan9 = determinarGanadorReal(p9);
    if (!gan7 || !gan8 || !gan9) return {};
    return {
      1: gan7, 2: gan7 === p7.equipo_local_id ? p7.equipo_visita_id : p7.equipo_local_id,
      3: gan8, 4: gan8 === p8.equipo_local_id ? p8.equipo_visita_id : p8.equipo_local_id,
      5: gan9, 6: gan9 === p9.equipo_local_id ? p9.equipo_visita_id : p9.equipo_local_id
    };
  }, [partidosPorId]);
  const finalCompleto = Object.keys(posicionesRealesIds).length === 6;

  // Detalle completo de un jugador: tabla de los 9 partidos (resultado real
  // vs su pronóstico, bono y puntos) + tabla de posiciones (virtual vs real)
  // con los puntos de la página Puntuación — igual que en Torneo Nacional /
  // Copa Libertadores.
  const renderBloqueJugador = (key, nombre, fotoPerfil, prediccionesPorPartido) => {
    const etiquetasFinal = calcularEtiquetasFinal(prediccionesPorPartido);
    const standingsVirt = calcularStandingsVirtuales(prediccionesPorPartido);

    let totalPartidos = 0;
    const filasPartidos = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id, idx, arr) => {
      const partido = partidosPorId[id];
      const pred = prediccionesPorPartido[id];
      const bonus = infoBonus(id);
      const puntos = pred?.puntos ?? 0;
      totalPartidos += puntos;
      const esFinal = id >= 7;
      const nombrePartidoReal = partido ? nombrePartido(partido) : `Partido ${id}`;
      const etiquetaVirtual = esFinal ? etiquetasFinal[id] : null;
      const noCoincide = esFinal && etiquetaVirtual && partido?.equipo_local_id && etiquetaVirtual !== nombrePartidoReal;
      const seccion = seccionDePartido(id);
      const esInicioSeccion = idx === 0 || seccionDePartido(arr[idx - 1]) !== seccion;
      return { id, seccion, esInicioSeccion, esFinal, partido, pred, bonus, puntos,
        etiqueta: esFinal ? (etiquetaVirtual || 'Pendiente (falta tu pronóstico de grupos)') : nombrePartidoReal,
        nombrePartidoReal, noCoincide };
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
        const puntos = gruposCompletos ? (coincide ? (reglas.posiciones_grupo?.[conceptos[idx]] ?? 0) : 0) : null;
        return { key: `g${grupoNum}-${idx}`, etiqueta: `Grupo ${grupoNum} — ${etiquetasPos[idx]}`, virtual, real, puntos };
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
        filasPosFinal.push({ key: etiquetaGan, etiqueta: etiquetaGan, virtual: ganVirtualNombre, real: null, puntos: null });
        filasPosFinal.push({ key: etiquetaPerd, etiqueta: etiquetaPerd, virtual: perdVirtualNombre, real: null, puntos: null });
        return;
      }
      const ganReal = posicionesRealesIds[slotGan];
      const perdReal = posicionesRealesIds[slotPerd];
      filasPosFinal.push({
        key: etiquetaGan, etiqueta: etiquetaGan,
        virtual: ganVirtualNombre,
        real: ganReal ? nombreEquipo(ganReal) : null,
        puntos: ganVirtualId && ganReal ? (ganVirtualId === ganReal ? (reglas.posiciones_finales?.[conceptoGan] ?? 0) : 0) : null
      });
      filasPosFinal.push({
        key: etiquetaPerd, etiqueta: etiquetaPerd,
        virtual: perdVirtualNombre,
        real: perdReal ? nombreEquipo(perdReal) : null,
        puntos: perdVirtualId && perdReal ? (perdVirtualId === perdReal ? (reglas.posiciones_finales?.[conceptoPerd] ?? 0) : 0) : null
      });
    };
    agregarPosFinal('🏆 Campeón', '🥈 Subcampeón', prediccionesPorPartido[7], 0, 'campeon', 'subcampeon', 1, 2);
    agregarPosFinal('🥉 3er lugar', '4to lugar', prediccionesPorPartido[8], 1, '3er_lugar', '4to_lugar', 3, 4);
    agregarPosFinal('5to lugar', '🙈 Último lugar', prediccionesPorPartido[9], 2, '5to_lugar', 'ultimo', 5, 6);

    const totalPosiciones = [...filasPosGrupo, ...filasPosFinal].reduce((sum, f) => sum + (f.puntos || 0), 0);

    return (
      <div key={key} className="card mb-4">
        <div className="card-header bg-dark text-white text-center d-flex align-items-center justify-content-center gap-2">
          {fotoUrl(fotoPerfil) && (
            <img src={fotoUrl(fotoPerfil)} alt={nombre} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
          )}
          <span>{nombre}</span>
        </div>
        <div className="card-body">
          <h6 className="text-center text-muted">Partidos (resultado real vs pronóstico)</h6>
          <table className="table table-sm align-middle mb-4">
            <thead className="table-secondary">
              <tr>
                <th>Partido</th>
                <th className="text-center">Resultado real</th>
                <th className="text-center">Su resultado</th>
                <th className="text-center">Bonus</th>
                <th className="text-center">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {filasPartidos.map(f => (
                <Fragment key={f.id}>
                  {f.esInicioSeccion && (
                    <tr>
                      <td colSpan={5} style={{ background: f.seccion.color, color: '#fff', fontWeight: 700, textAlign: 'center' }}>
                        {f.seccion.titulo}
                      </td>
                    </tr>
                  )}
                  <tr className={f.pred ? (f.puntos > 0 ? 'table-success' : 'table-danger') : ''}>
                    <td>
                      {f.etiqueta}
                      {f.noCoincide && (
                        <div className="small text-danger">No es el cruce real ({f.nombrePartidoReal}) — 0 pts</div>
                      )}
                    </td>
                    <td className="text-center">
                      {f.partido?.jugado
                        ? (f.esFinal ? `${f.nombrePartidoReal}: ${f.partido.goles_local} - ${f.partido.goles_visita}` : `${f.partido.goles_local} - ${f.partido.goles_visita}`)
                        : (f.esFinal && f.partido?.equipo_local_id ? `${f.nombrePartidoReal} — pendiente` : 'Pendiente')}
                    </td>
                    <td className="text-center fw-bold">
                      {f.pred ? `${f.pred.goles_local} - ${f.pred.goles_visita}` : '—'}
                    </td>
                    <td className="text-center">{f.bonus.esBonus ? `x${f.bonus.multiplicador}` : 'x1'}</td>
                    <td className="text-center fw-bold">{f.pred ? f.puntos : '—'}</td>
                  </tr>
                </Fragment>
              ))}
              <tr className="fw-bold" style={{ background: '#fff6d6' }}>
                <td colSpan={4} className="text-end">Total puntos por partidos:</td>
                <td className="text-center">{totalPartidos}</td>
              </tr>
            </tbody>
          </table>

          <h6 className="text-center text-muted">Posiciones: pronóstico virtual vs real</h6>
          <table className="table table-sm align-middle mb-0">
            <thead className="table-secondary">
              <tr>
                <th>Posición</th>
                <th className="text-center">Pronóstico (virtual)</th>
                <th className="text-center">Real</th>
                <th className="text-center">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {[{ titulo: 'Posiciones de Grupo', filas: filasPosGrupo }, { titulo: 'Posiciones Finales', filas: filasPosFinal }].map(bloque => (
                <Fragment key={bloque.titulo}>
                  <tr>
                    <td colSpan={4} style={{ background: '#444', color: '#fff', fontWeight: 700, textAlign: 'center' }}>
                      {bloque.titulo}
                    </td>
                  </tr>
                  {bloque.filas.map(f => (
                    <tr key={f.key} className={f.puntos == null ? '' : f.puntos > 0 ? 'table-success' : 'table-danger'}>
                      <td>{f.etiqueta}</td>
                      <td className="text-center">{f.virtual || '—'}</td>
                      <td className="text-center">{f.real || 'Pendiente'}</td>
                      <td className="text-center fw-bold">{f.puntos == null ? '—' : f.puntos}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className="fw-bold" style={{ background: '#fff6d6' }}>
                <td colSpan={3} className="text-end">Total puntos por posiciones:</td>
                <td className="text-center">{totalPosiciones}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (loading) return <div className="text-center mt-4">Cargando...</div>;

  return (
    <div className="container mt-4 mb-5">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-secondary" onClick={() => navigate('/copa-gino-perez')}>
          ← Volver a Copa Gino Pérez
        </button>
      </div>

      <h1 className="text-center mb-4">📊 Clasificación Copa Gino Pérez</h1>

      {!cerrado && (participantes.length > 0 || noParticipantes.length > 0) && (
        <div className="mb-4">
          {participantes.length > 0 && (
            <div className="card mb-3">
              <div className="card-header bg-primary text-white">
                <h5 className="mb-0">✅ Participantes que ya entregaron su pronóstico ({participantes.length})</h5>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  {participantes.map(p => (
                    <div key={p.id} className="col-6 col-md-4 col-lg-3">
                      <div className="card h-100 shadow-sm">
                        <div className="card-body text-center p-2">
                          {fotoUrl(p.foto_perfil) ? (
                            <img
                              src={fotoUrl(p.foto_perfil)}
                              alt={p.nombre}
                              className="rounded-circle mb-2"
                              style={{ width: 60, height: 60, objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              className="rounded-circle bg-secondary d-flex align-items-center justify-content-center mb-2 mx-auto"
                              style={{ width: 60, height: 60 }}
                            >
                              <span className="text-white fs-4">{(p.nombre || 'U').charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <p className="mb-0 small fw-bold">{p.nombre || 'Usuario'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {noParticipantes.length > 0 && (
            <div className="card">
              <div className="card-header bg-warning text-dark">
                <h5 className="mb-0">⏳ Participantes que AÚN NO han entregado su pronóstico ({noParticipantes.length})</h5>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  {noParticipantes.map(p => (
                    <div key={p.id} className="col-6 col-md-4 col-lg-3">
                      <div className="card h-100 shadow-sm border-warning">
                        <div className="card-body text-center p-2">
                          {fotoUrl(p.foto_perfil) ? (
                            <img
                              src={fotoUrl(p.foto_perfil)}
                              alt={p.nombre}
                              className="rounded-circle mb-2 opacity-50"
                              style={{ width: 60, height: 60, objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              className="rounded-circle bg-warning d-flex align-items-center justify-content-center mb-2 mx-auto opacity-50"
                              style={{ width: 60, height: 60 }}
                            >
                              <span className="text-dark fs-4">{(p.nombre || 'U').charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <p className="mb-0 small fw-bold text-muted">{p.nombre || 'Usuario'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!cerrado && !esAdmin && miPronostico?.pronosticos?.length > 0 && (
        <div className="mb-4">
          <p className="text-muted small text-center">
            Mientras los pronósticos no estén cerrados, solo vos podés ver el detalle del tuyo. Cuando el
            admin los cierre, se mostrará acá el de todos los jugadores.
          </p>
          {(() => {
            const prediccionesPorPartido = {};
            miPronostico.pronosticos.forEach(p => { prediccionesPorPartido[p.partido_id] = p; });
            return renderBloqueJugador('mi-pronostico', usuarioLogueado?.nombre || 'Mi pronóstico', usuarioLogueado?.foto_perfil, prediccionesPorPartido);
          })()}
        </div>
      )}

      {(cerrado || esAdmin) && todosPronosticos && todosPronosticos.length > 0 && (
        <div className="mb-4">
          <h4 className="text-center" style={{ background: '#111', color: '#fff', padding: 8, borderRadius: 6 }}>
            Pronósticos de Todos
            {!cerrado && esAdmin && <span className="badge bg-warning text-dark ms-2">vista admin — todavía no cerrado</span>}
          </h4>
          {todosPronosticos.map(u => renderBloqueJugador(u.id, u.nombre, u.foto_perfil, u.pronosticos || {}))}
        </div>
      )}

      {error ? (
        <div className="alert alert-danger text-center">{error}</div>
      ) : ranking.length === 0 ? (
        <p className="text-center text-muted">Todavía no hay pronósticos registrados.</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead className="table-dark">
              <tr>
                <th className="text-center" style={{ width: 70 }}>#</th>
                <th>Jugador</th>
                <th className="text-center">Puntos Partidos</th>
                <th className="text-center">Posiciones de Grupo</th>
                <th className="text-center">Posiciones Finales</th>
                <th className="text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((j, idx) => {
                const posicion = idx + 1;
                const foto = fotoUrl(j.foto_perfil);
                return (
                  <tr key={j.id} className={posicion <= 3 ? 'table-warning' : ''}>
                    <td className="text-center fw-bold">{medalla(posicion) || posicion}</td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        {foto && (
                          <img src={foto} alt={j.nombre} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid #ddd' }} />
                        )}
                        <span className="fw-bold">{j.nombre}</span>
                      </div>
                    </td>
                    <td className="text-center">{j.puntos_partidos}</td>
                    <td className="text-center">{j.puntos_posiciones_grupos}</td>
                    <td className="text-center">{j.puntos_posiciones_finales}</td>
                    <td className="text-center">
                      <span className="badge bg-primary fs-6">{j.puntos_totales} pts</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
