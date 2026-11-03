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

export default function RankingUnificado() {
  const navigate = useNavigate();
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modo, setModo] = useState('total'); // 'total' | 'promedio'

  useEffect(() => {
    cargarRanking();
  }, []);

  const cargarRanking = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/ranking-unificado/actual`);
      setRanking(response.data.ranking || []);
      setError('');
    } catch (err) {
      console.error('Error cargando ranking unificado:', err);
      setError('No se pudo cargar el ranking unificado');
    } finally {
      setLoading(false);
    }
  };

  const rankingOrdenado = useMemo(() => {
    const copia = [...ranking];
    if (modo === 'promedio') {
      copia.sort((a, b) => b.promedio - a.promedio || b.puntos_totales - a.puntos_totales || a.nombre.localeCompare(b.nombre, 'es'));
    } else {
      copia.sort((a, b) => b.puntos_totales - a.puntos_totales || a.nombre.localeCompare(b.nombre, 'es'));
    }
    return copia;
  }, [ranking, modo]);

  return (
    <div className="container mt-4 mb-5">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-secondary" onClick={() => navigate('/')}>
          ← Volver al Home
        </button>
      </div>

      <h1 className="text-center mb-1">🏆 Ranking Unificado</h1>
      <p className="text-center text-muted mb-3">
        Suma de puntos de Torneo Nacional, Copa Libertadores, Copa Sudamericana y Mundial de Clubes
      </p>

      <div className="d-flex justify-content-center mb-4">
        <div className="btn-group" role="group" aria-label="Modo de ranking">
          <button
            type="button"
            className={`btn ${modo === 'total' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setModo('total')}
          >
            Por Puntaje Total
          </button>
          <button
            type="button"
            className={`btn ${modo === 'promedio' ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setModo('promedio')}
          >
            Por Promedio
          </button>
        </div>
      </div>

      {modo === 'promedio' && (
        <p className="text-center text-muted small mb-4">
          Promedio = puntos totales ÷ cantidad de competencias en las que el jugador participa
          (quien juega una sola competencia divide entre 1, quien juega dos divide entre 2, y así).
        </p>
      )}

      {loading ? (
        <div className="text-center my-5">
          <div className="spinner-border text-primary" role="status" />
        </div>
      ) : error ? (
        <div className="alert alert-danger text-center">{error}</div>
      ) : ranking.length === 0 ? (
        <div className="alert alert-info text-center">Todavía no hay puntos registrados en ninguna competencia.</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover align-middle">
            <thead className="table-dark">
              <tr>
                <th className="text-center" style={{ width: '70px' }}>#</th>
                <th>Jugador</th>
                <th className="text-center">🏆 Nacional</th>
                <th className="text-center">🔴 Libertadores</th>
                <th className="text-center">🟢 Sudamericana</th>
                <th className="text-center">🌍 Mundial</th>
                <th className="text-center">Competencias</th>
                <th className={`text-center ${modo === 'total' ? 'bg-primary' : ''}`}>Total</th>
                <th className={`text-center ${modo === 'promedio' ? 'bg-primary' : ''}`}>Promedio</th>
              </tr>
            </thead>
            <tbody>
              {rankingOrdenado.map((jugador, idx) => {
                const posicion = idx + 1;
                const foto = fotoUrl(jugador.foto_perfil);
                return (
                  <tr key={jugador.id} className={posicion <= 3 ? 'table-warning' : ''}>
                    <td className="text-center fw-bold">
                      {medalla(posicion) || posicion}
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        {foto && (
                          <img
                            src={foto}
                            alt={jugador.nombre}
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: '2px solid #ddd'
                            }}
                          />
                        )}
                        <span className="fw-bold">{jugador.nombre}</span>
                      </div>
                    </td>
                    <td className="text-center">{jugador.puntos_nacional}</td>
                    <td className="text-center">{jugador.puntos_libertadores}</td>
                    <td className="text-center">{jugador.puntos_sudamericana}</td>
                    <td className="text-center">{jugador.puntos_mundial}</td>
                    <td className="text-center text-muted">{jugador.competencias_jugadas}</td>
                    <td className="text-center">
                      <span className={`badge fs-6 ${modo === 'total' ? 'bg-primary' : 'bg-secondary'}`}>
                        {jugador.puntos_totales} pts
                      </span>
                    </td>
                    <td className="text-center">
                      <span className={`badge fs-6 ${modo === 'promedio' ? 'bg-primary' : 'bg-secondary'}`}>
                        {jugador.promedio.toFixed(2)}
                      </span>
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
