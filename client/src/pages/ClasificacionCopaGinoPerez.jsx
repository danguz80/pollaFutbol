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

export default function ClasificacionCopaGinoPerez() {
  const navigate = useNavigate();
  const [ranking, setRanking] = useState([]);
  const [partidos, setPartidos] = useState([]);
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
      const [rankingRes, partidosRes, configRes] = await Promise.all([
        axios.get(`${API_URL}/api/copa-gino-perez/estadisticas`),
        axios.get(`${API_URL}/api/copa-gino-perez/partidos`),
        axios.get(`${API_URL}/api/copa-gino-perez/config`)
      ]);
      setRanking(rankingRes.data.ranking || []);
      setPartidos(partidosRes.data);
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
                  return (
                    <tr key={p.partido_id}>
                      <td>{partido ? nombrePartido(partido) : `Partido ${p.partido_id}`}</td>
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
