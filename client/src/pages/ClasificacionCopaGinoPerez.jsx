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

const ETIQUETAS_PARTIDO = {
  1: 'P1 G1', 2: 'P2 G1', 3: 'P3 G1',
  4: 'P4 G2', 5: 'P5 G2', 6: 'P6 G2',
  7: 'Final', 8: '3°/4°', 9: 'Vergüenza'
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    try {
      setLoading(true);
      const [rankingRes, partidosRes, equiposRes, configRes] = await Promise.all([
        axios.get(`${API_URL}/api/copa-gino-perez/estadisticas`),
        axios.get(`${API_URL}/api/copa-gino-perez/partidos`),
        axios.get(`${API_URL}/api/copa-gino-perez/equipos`),
        axios.get(`${API_URL}/api/copa-gino-perez/config`)
      ]);
      setRanking(rankingRes.data.ranking || []);
      setPartidos(partidosRes.data);
      setEquipos(equiposRes.data);
      setCerrado(configRes.data.cerrado);
      setBonusConfig(configRes.data);

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

  // Para los 3 partidos de fase final: a partir de cualquier set de 6
  // pronósticos de grupo (propios o de otro usuario), calcula contra qué
  // equipos reales pronosticó cada partido de fase final (su bracket
  // virtual) — no la descripción genérica ("1° Grupo 1 vs 1° Grupo 2").
  const calcularEtiquetasFinal = (prediccionesPorPartido) => {
    if (!prediccionesPorPartido || equipos.length !== 6) return {};
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

    const standingsG1 = calcularGrupo(1);
    const standingsG2 = calcularGrupo(2);
    const nombre = (standings, idx) => standings[idx]?.nombre;

    return {
      7: nombre(standingsG1, 0) && nombre(standingsG2, 0) ? `${nombre(standingsG1, 0)} vs ${nombre(standingsG2, 0)}` : null,
      8: nombre(standingsG1, 1) && nombre(standingsG2, 1) ? `${nombre(standingsG1, 1)} vs ${nombre(standingsG2, 1)}` : null,
      9: nombre(standingsG1, 2) && nombre(standingsG2, 2) ? `${nombre(standingsG1, 2)} vs ${nombre(standingsG2, 2)}` : null
    };
  };

  const etiquetasFinalPorPronostico = useMemo(() => {
    if (!miPronostico?.pronosticos?.length) return {};
    const prediccionesPorPartido = {};
    miPronostico.pronosticos.forEach(p => { prediccionesPorPartido[p.partido_id] = p; });
    return calcularEtiquetasFinal(prediccionesPorPartido);
  }, [miPronostico, equipos]);

  // Lo mismo, pero para cada usuario de la tabla "Pronósticos de Todos":
  // el bracket virtual de fase final según los propios pronósticos de
  // grupo de ESE usuario (no los del usuario logueado).
  const etiquetasFinalPorUsuario = useMemo(() => {
    if (!todosPronosticos) return {};
    const map = {};
    todosPronosticos.forEach(u => { map[u.id] = calcularEtiquetasFinal(u.pronosticos || {}); });
    return map;
  }, [todosPronosticos, equipos]);

  if (loading) return <div className="text-center mt-4">Cargando...</div>;

  return (
    <div className="container mt-4 mb-5">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-secondary" onClick={() => navigate('/copa-gino-perez')}>
          ← Volver a Copa Gino Pérez
        </button>
      </div>

      <h1 className="text-center mb-4">📊 Clasificación Copa Gino Pérez</h1>

      {!cerrado && !esAdmin && miPronostico?.pronosticos?.length > 0 && (
        <div className="card mb-4">
          <div className="card-header bg-dark text-white text-center">Mi Pronóstico</div>
          <div className="card-body">
            <p className="text-muted small text-center">
              Mientras los pronósticos no estén cerrados, solo vos podés ver el tuyo. Cuando el admin los
              cierre, se mostrarán acá los de todos los jugadores.
            </p>
            <table className="table table-sm align-middle mb-0">
              <tbody>
                {[...miPronostico.pronosticos].sort((a, b) => a.partido_id - b.partido_id).map((p, idx, arr) => {
                  const partido = partidosPorId[p.partido_id];
                  const bonus = infoBonus(p.partido_id);
                  const etiquetaFinal = etiquetasFinalPorPronostico[p.partido_id];
                  const seccion = seccionDePartido(p.partido_id);
                  const esInicioSeccion = idx === 0 || seccionDePartido(arr[idx - 1].partido_id) !== seccion;
                  return (
                    <Fragment key={p.partido_id}>
                      {esInicioSeccion && (
                        <tr>
                          <td colSpan={3} style={{ background: seccion.color, color: '#fff', fontWeight: 700, textAlign: 'center' }}>
                            {seccion.titulo}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td>{etiquetaFinal || (partido ? nombrePartido(partido) : `Partido ${p.partido_id}`)}</td>
                        <td className="text-end fw-bold" style={{ whiteSpace: 'nowrap', width: 70 }}>
                          {p.goles_local} - {p.goles_visita}
                        </td>
                        <td style={{ width: 50 }}>
                          {bonus.esBonus && <span className="badge bg-warning text-dark">x{bonus.multiplicador}</span>}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(cerrado || esAdmin) && todosPronosticos && todosPronosticos.length > 0 && (
        <div className="mb-4">
          <h4 className="text-center" style={{ background: '#111', color: '#fff', padding: 8, borderRadius: 6 }}>
            Pronósticos de Todos
            {!cerrado && esAdmin && <span className="badge bg-warning text-dark ms-2">vista admin — todavía no cerrado</span>}
          </h4>
          <div className="table-responsive">
            <table className="table table-bordered table-sm text-center align-middle">
              <thead>
                <tr>
                  <th className="table-dark" style={{ border: 'none' }}></th>
                  {SECCIONES.map(seccion => (
                    <th key={seccion.titulo} colSpan={seccion.ids.length}
                      style={{ background: seccion.color, color: '#fff', textAlign: 'center' }}
                      title={seccion.titulo}>
                      {seccion.titulo}
                    </th>
                  ))}
                </tr>
                <tr className="table-dark">
                  <th>Jugador</th>
                  {[1,2,3,4,5,6,7,8,9].map(id => {
                    const partido = partidosPorId[id];
                    const esGrupo = id <= 6;
                    return (
                      <th key={id} style={{ fontSize: '0.72rem', minWidth: 85, whiteSpace: 'normal' }}
                        title={partido ? nombrePartido(partido) : ''}>
                        {esGrupo && partido
                          ? <>{partido.equipo_local_nombre}<br />vs<br />{partido.equipo_visita_nombre}</>
                          : ETIQUETAS_PARTIDO[id]}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {todosPronosticos.map(u => (
                  <tr key={u.id}>
                    <td className="text-start">
                      <div className="d-flex align-items-center gap-2">
                        {fotoUrl(u.foto_perfil) && (
                          <img src={fotoUrl(u.foto_perfil)} alt={u.nombre} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                        )}
                        <span>{u.nombre}</span>
                      </div>
                    </td>
                    {[1,2,3,4,5,6,7,8,9].map(id => {
                      const pred = u.pronosticos[id];
                      const bonus = infoBonus(id);
                      const etiqueta = id >= 7 && pred ? etiquetasFinalPorUsuario[u.id]?.[id] : null;
                      return (
                        <td key={id} className={bonus.esBonus ? 'table-warning fw-bold' : ''}>
                          {etiqueta && (
                            <div className="text-muted" style={{ fontSize: '0.68rem', lineHeight: 1.1 }}>{etiqueta}</div>
                          )}
                          {pred ? `${pred.goles_local}-${pred.goles_visita}` : '—'}
                          {bonus.esBonus && ` (x${bonus.multiplicador})`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
