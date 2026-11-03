import { useState, useEffect } from 'react';
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

export default function EstadisticasCopaGinoPerez() {
  const navigate = useNavigate();
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/copa-gino-perez/estadisticas`);
      setRanking(res.data.ranking || []);
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
      setError('No se pudieron cargar las estadísticas');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center mt-4">Cargando...</div>;

  return (
    <div className="container mt-4 mb-5">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-secondary" onClick={() => navigate('/copa-gino-perez')}>
          ← Volver a Copa Gino Pérez
        </button>
      </div>

      <h1 className="text-center mb-4">📈 Estadísticas Copa Gino Pérez</h1>
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
