import { useState, useEffect, useMemo } from 'react';
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
  const [ranking, setRanking] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [cerrado, setCerrado] = useState(false);
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

      if (configRes.data.cerrado) {
        try {
          const todosRes = await axios.get(`${API_URL}/api/copa-gino-perez/pronosticos-todos`);
          setTodosPronosticos(todosRes.data.usuarios || []);
        } catch (err) {
          console.error('Error cargando pronósticos de todos:', err);
        }
      } else {
        const token = localStorage.getItem('token');
        if (token) {
          try {
            const miRes = await axios.get(`${API_URL}/api/copa-gino-perez/pronostico`, { headers: { Authorization: `Bearer ${token}` } });
            setMiPronostico(miRes.data);
          } catch (err) {
            console.error('Error cargando mi pronóstico:', err);
          }
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
  const partidosPorId = useMemo(() => {
    const m = {};
    partidos.forEach(p => { m[p.id] = p; });
    return m;
  }, [partidos]);

  // Para los 3 partidos de fase final: mostrar el enfrentamiento según el
  // propio pronóstico de grupos del usuario (su bracket virtual), no la
  // descripción genérica ("1° Grupo 1 vs 1° Grupo 2") — se compara contra
  // lo real recién cuando se juegan esos partidos.
  const etiquetasFinalPorPronostico = useMemo(() => {
    if (!miPronostico?.pronosticos?.length || equipos.length !== 6) return {};
    const prediccionesPorPartido = {};
    miPronostico.pronosticos.forEach(p => { prediccionesPorPartido[p.partido_id] = p; });

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
  }, [miPronostico, equipos]);

  if (loading) return <div className="text-center mt-4">Cargando...</div>;

  return (
    <div className="container mt-4 mb-5">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-secondary" onClick={() => navigate('/copa-gino-perez')}>
          ← Volver a Copa Gino Pérez
        </button>
      </div>

      <h1 className="text-center mb-4">📊 Clasificación Copa Gino Pérez</h1>

      {!cerrado && miPronostico?.pronosticos?.length > 0 && (
        <div className="card mb-4">
          <div className="card-header bg-dark text-white text-center">Mi Pronóstico</div>
          <div className="card-body">
            <p className="text-muted small text-center">
              Mientras los pronósticos no estén cerrados, solo vos podés ver el tuyo. Cuando el admin los
              cierre, se mostrarán acá los de todos los jugadores.
            </p>
            <table className="table table-sm align-middle mb-0">
              <tbody>
                {miPronostico.pronosticos.map(p => {
                  const partido = partidosPorId[p.partido_id];
                  const extra = miPronostico.extra;
                  const esBonusGrupo = extra && ((extra.bonus_grupo1_partido === p.partido_id) || (extra.bonus_grupo2_partido === p.partido_id));
                  const esBonusFinal = extra && extra.bonus_final_partido === p.partido_id;
                  const etiquetaFinal = etiquetasFinalPorPronostico[p.partido_id];
                  return (
                    <tr key={p.partido_id}>
                      <td>{etiquetaFinal || (partido ? nombrePartido(partido) : `Partido ${p.partido_id}`)}</td>
                      <td className="text-end fw-bold" style={{ whiteSpace: 'nowrap', width: 70 }}>
                        {p.goles_local} - {p.goles_visita}
                      </td>
                      <td style={{ width: 50 }}>
                        {esBonusGrupo && <span className="badge bg-warning text-dark">x2</span>}
                        {esBonusFinal && <span className="badge bg-warning text-dark">x{extra.bonus_final_multiplicador}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {cerrado && todosPronosticos && todosPronosticos.length > 0 && (
        <div className="mb-4">
          <h4 className="text-center" style={{ background: '#111', color: '#fff', padding: 8, borderRadius: 6 }}>
            Pronósticos de Todos
          </h4>
          <div className="table-responsive">
            <table className="table table-bordered table-sm text-center align-middle">
              <thead className="table-dark">
                <tr>
                  <th>Jugador</th>
                  {[1,2,3,4,5,6,7,8,9].map(id => (
                    <th key={id} title={partidosPorId[id] ? nombrePartido(partidosPorId[id]) : ''}>
                      {ETIQUETAS_PARTIDO[id]}
                    </th>
                  ))}
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
                      const esBonusGrupo = u.extra && ((u.extra.bonus_grupo1_partido === id) || (u.extra.bonus_grupo2_partido === id));
                      const esBonusFinal = u.extra && u.extra.bonus_final_partido === id;
                      return (
                        <td key={id} className={esBonusGrupo || esBonusFinal ? 'table-warning fw-bold' : ''}>
                          {pred ? `${pred.goles_local}-${pred.goles_visita}` : '—'}
                          {esBonusGrupo && ' (x2)'}
                          {esBonusFinal && ` (x${u.extra.bonus_final_multiplicador})`}
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
