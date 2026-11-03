import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;
const isMobile = window.innerWidth <= 480;

const fotoUrl = (foto) => {
  if (!foto) return null;
  return foto.startsWith('/') ? foto : `/perfil/${foto}`;
};

const headerStyle = {
  background: '#444',
  color: '#aaa',
  fontWeight: 700,
  fontSize: isMobile ? '1.1em' : '1.3em',
  letterSpacing: 1,
  textAlign: 'center',
  borderRadius: 6,
  padding: isMobile ? 7 : 10,
  marginBottom: 0
};

export default function RankingVergonzoso() {
  const navigate = useNavigate();
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function cargarRanking() {
      try {
        setLoading(true);
        const response = await axios.get(`${API_URL}/api/ranking-unificado/vergonzosa`);
        setRanking(response.data.ranking || []);
        setError('');
      } catch (err) {
        console.error('Error cargando ranking de la vergüenza:', err);
        setError('No se pudo cargar el ranking de la vergüenza');
      } finally {
        setLoading(false);
      }
    }
    cargarRanking();
  }, []);

  return (
    <div className="container mt-4 mb-5">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-secondary" onClick={() => navigate('/')}>
          ← Volver al Home
        </button>
      </div>

      <h1 className="text-center mb-1" style={{ color: '#666' }}>Ranking de la Vergüenza</h1>
      <p className="text-center text-muted mb-4">
        Jugadores activos que no han ganado ninguna jornada en Torneo Nacional, Copa Libertadores,
        Copa Sudamericana ni Mundial de Clubes
      </p>

      {loading ? (
        <div className="text-center my-5">
          <div className="spinner-border text-secondary" role="status" />
        </div>
      ) : error ? (
        <div className="alert alert-danger text-center">{error}</div>
      ) : ranking.length === 0 ? (
        <p className="text-center text-muted" style={{ fontStyle: 'italic', marginTop: 20 }}>
          ¡Todos los participantes activos han ganado al menos una jornada en alguna competencia! 🎉
        </p>
      ) : (
        <div style={{ maxWidth: 470, margin: '0 auto' }}>
          <h4 className="mt-3 text-center" style={headerStyle}>Tabla de la Deshonra y la Vergüenza</h4>
          <table className="table table-bordered text-center">
            <thead>
              <tr style={{ background: '#666', color: '#ddd', fontWeight: 'bold', fontSize: isMobile ? '1.13em' : '1.25em' }}>
                <th>Participante</th>
                <th>Jornadas Ganadas</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((jugador) => {
                const foto = fotoUrl(jugador.foto_perfil);
                return (
                  <tr key={jugador.id} style={{ background: '#f8f8f8' }}>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {foto && (
                          <img
                            src={foto}
                            alt={jugador.nombre}
                            style={{
                              width: isMobile ? '44px' : '60px',
                              height: isMobile ? '44px' : '60px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              marginRight: '8px',
                              border: '2px solid #ddd',
                              objectPosition: 'center 30%',
                              filter: 'grayscale(100%)'
                            }}
                          />
                        )}
                        {jugador.nombre}
                      </span>
                    </td>
                    <td style={{ fontWeight: 'bold', fontSize: isMobile ? '1.1em' : '1.2em', color: '#999' }}>
                      0
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
