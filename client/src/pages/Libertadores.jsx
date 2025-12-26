import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export default function Libertadores() {
  const navigate = useNavigate();
  const [jornadas, setJornadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState([]);
  const [ganadores, setGanadores] = useState([]);
  const [ultimosGanadores, setUltimosGanadores] = useState(null);
  const [fotoPerfilMap, setFotoPerfilMap] = useState({});

  useEffect(() => {
    cargarJornadas();
    cargarRanking();
    cargarGanadores();
    cargarUltimosGanadores();
  }, []);

  const cargarJornadas = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/libertadores/jornadas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJornadas(response.data);
    } catch (error) {
      console.error('Error cargando jornadas:', error);
    } finally {
      setLoading(false);
    }
  };

  const cargarRanking = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/libertadores-rankings/actual`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // El endpoint devuelve { jornada, ranking }
      const rankingData = response.data.ranking || [];
      const top3 = rankingData.slice(0, 3);
      setRanking(top3);

      // Mapear fotos de perfil
      const fotosMap = {};
      top3.forEach(jugador => {
        if (jugador.foto_perfil) {
          fotosMap[jugador.id] = jugador.foto_perfil;
        }
      });
      setFotoPerfilMap(fotosMap);
    } catch (error) {
      console.error('Error cargando ranking:', error);
    }
  };

  const cargarGanadores = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/libertadores-ganadores-jornada/titulos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGanadores(response.data);
    } catch (error) {
      console.error('Error cargando ganadores:', error);
    }
  };

  const cargarUltimosGanadores = async () => {
    try {
      const token = localStorage.getItem('token');
      const jornadasResponse = await axios.get(`${API_URL}/api/libertadores/jornadas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Buscar la última jornada cerrada
      const jornadaCerrada = jornadasResponse.data
        .filter(j => j.cerrada)
        .sort((a, b) => b.numero - a.numero)[0];

      if (jornadaCerrada) {
        const ganadoresResponse = await axios.get(
          `${API_URL}/api/libertadores-ganadores-jornada/${jornadaCerrada.numero}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (ganadoresResponse.data.ganadores && ganadoresResponse.data.ganadores.length > 0) {
          setUltimosGanadores({
            jornada: jornadaCerrada.numero,
            ganadores: ganadoresResponse.data.ganadores
          });
        }
      }
    } catch (error) {
      console.error('Error cargando últimos ganadores:', error);
    }
  };

  const getSubtitulo = (numero) => {
    if (numero <= 6) return 'Fase de Grupos';
    if (numero === 7) return 'Octavos de Final IDA';
    if (numero === 8) return 'Octavos de Final VUELTA';
    if (numero === 9) return 'Cuartos de Final IDA/VUELTA';
    if (numero === 10) return 'Semifinales IDA/VUELTA + Final + Cuadro Final';
    return '';
  };

  const getEstadoJornada = (jornada) => {
    if (jornada.cerrada) return { texto: 'Cerrada', clase: 'danger' };
    if (jornada.activa) return { texto: 'Abierta', clase: 'success' };
    return { texto: 'Próximamente', clase: 'secondary' };
  };

  if (loading) {
    return (
      <div className="container text-center mt-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="text-center mb-4">
        <h1 className="display-5 fw-bold">🔴 Copa Libertadores 2026</h1>
        <p className="text-muted">La competición más importante de clubes de Sudamérica</p>
      </div>

      {/* Banner de Últimos Ganadores */}
      {ultimosGanadores && (
        <div className="alert alert-success text-center mb-4">
          <h5 className="mb-0">
            🏆 Últimos ganadores: {ultimosGanadores.ganadores.map(g => g.nombre).join(', ')} en la Jornada {ultimosGanadores.jornada}
          </h5>
        </div>
      )}

      {/* Top 3 Ranking General */}
      {ranking.length > 0 && (
        <div className="card mb-4 shadow">
          <div className="card-header bg-danger text-white text-center">
            <h4 className="mb-0">🏆 Top 3 Ranking General</h4>
          </div>
          <div className="card-body">
            <div className="row text-center">
              {ranking.map((jugador, index) => (
                <div key={jugador.id} className="col-12 col-md-4 mb-3">
                  <div className={`p-3 rounded ${index === 0 ? 'bg-warning bg-opacity-25' : index === 1 ? 'bg-secondary bg-opacity-25' : 'bg-warning bg-opacity-10'}`}>
                    <div className="mb-2">
                      {fotoPerfilMap[jugador.id] ? (
                        <img
                          src={fotoPerfilMap[jugador.id].startsWith('/') ? fotoPerfilMap[jugador.id] : `/perfil/${fotoPerfilMap[jugador.id]}`}
                          alt={jugador.nombre}
                          className="rounded-circle"
                          style={{ width: '80px', height: '80px', objectFit: 'cover' }}
                        />
                      ) : (
                        <div 
                          className="rounded-circle bg-secondary d-inline-flex align-items-center justify-content-center text-white"
                          style={{ width: '80px', height: '80px', fontSize: '2rem' }}
                        >
                          {jugador.nombre.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <h5 className="mb-1">{index + 1}° {jugador.nombre}</h5>
                    <p className="mb-0 fw-bold text-primary">{jugador.puntos_acumulados || 0} puntos</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ganadores por Títulos */}
      {ganadores.length > 0 && (
        <div className="card mb-4 shadow">
          <div className="card-header bg-primary text-white text-center">
            <h4 className="mb-0">👑 Ganadores</h4>
          </div>
          <div className="card-body">
            <div className="row">
              {ganadores.map((ganador) => (
                <div key={ganador.id} className="col-6 col-md-3 text-center mb-3">
                  <div className="p-2">
                    {ganador.foto_perfil ? (
                      <img
                        src={ganador.foto_perfil.startsWith('/') ? ganador.foto_perfil : `/perfil/${ganador.foto_perfil}`}
                        alt={ganador.nombre}
                        className="rounded-circle mb-2"
                        style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                      />
                    ) : (
                      <div 
                        className="rounded-circle bg-secondary d-inline-flex align-items-center justify-content-center text-white mb-2"
                        style={{ width: '60px', height: '60px', fontSize: '1.5rem' }}
                      >
                        {ganador.nombre.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <p className="mb-0 small fw-bold">{ganador.nombre}</p>
                    <div className="d-flex justify-content-center align-items-center gap-1 mt-1">
                      <span className="badge bg-warning text-dark fs-6">
                        ⭐ {ganador.titulos} {parseInt(ganador.titulos) === 1 ? 'título' : 'títulos'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Botonera Principal */}
      <div className="mb-4 text-center d-flex gap-3 justify-content-center flex-wrap">
        <button 
          className="btn btn-danger btn-lg px-4"
          onClick={() => navigate('/libertadores/estadisticas')}
        >
          📊 Estadísticas
        </button>
        <button 
          className="btn btn-primary btn-lg px-4"
          onClick={() => navigate('/libertadores/clasificacion')}
        >
          📋 Clasificación
        </button>
        <button 
          className="btn btn-warning btn-lg px-4"
          onClick={() => navigate('/libertadores/puntuacion')}
        >
          🏆 Puntuación
        </button>
      </div>

      <div className="row g-3">
        {jornadas.map((jornada) => {
          const estado = getEstadoJornada(jornada);
          return (
            <div key={jornada.id} className="col-12 col-md-6 col-lg-4">
              <div className="card h-100 shadow-sm hover-shadow">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <h5 className="card-title mb-0">{jornada.nombre}</h5>
                      <p className="text-muted small mb-0">{getSubtitulo(jornada.numero)}</p>
                    </div>
                    <span className={`badge bg-${estado.clase}`}>{estado.texto}</span>
                  </div>
                  
                  {jornada.fecha_inicio && (
                    <p className="text-muted small mb-2">
                      📅 {new Date(jornada.fecha_inicio).toLocaleDateString('es-CL')}
                    </p>
                  )}
                  
                  {jornada.descripcion && (
                    <p className="card-text small text-muted">{jornada.descripcion}</p>
                  )}
                  
                  <button
                    className="btn btn-primary w-100 mt-2"
                    onClick={() => navigate(`/libertadores/jornada/${jornada.numero}`)}
                    disabled={!jornada.activa && jornada.cerrada}
                  >
                    {jornada.activa ? '⚽ Ingresar Pronósticos' : jornada.cerrada ? '👁️ Ver Resultados' : '👁️ Ver Detalles'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {jornadas.length === 0 && (
        <div className="alert alert-info text-center mt-4">
          <h5>📋 No hay jornadas disponibles</h5>
          <p className="mb-0">Las jornadas de la Copa Libertadores se habilitarán próximamente.</p>
        </div>
      )}
    </div>
  );
}
