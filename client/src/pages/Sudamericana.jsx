import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import NavegacionSudamericana from '../components/NavegacionSudamericana';
import HeroSection from '../components/HeroSection';

const API_URL = import.meta.env.VITE_API_URL;

export default function Sudamericana() {
  const navigate = useNavigate();
  const [jornadas, setJornadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState([]);
  const [ultimosGanadores, setUltimosGanadores] = useState(null);
  const [fotoPerfilMap, setFotoPerfilMap] = useState({});

  useEffect(() => {
    cargarJornadas();
    cargarRanking();
    cargarUltimosGanadores();
  }, []);

  const cargarJornadas = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/sudamericana/jornadas`, {
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
      const response = await axios.get(`${API_URL}/api/sudamericana-puntuacion/ranking-acumulado`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const rankingData = response.data || [];
      const top3 = rankingData.slice(0, 3);
      setRanking(top3);

      // Mapear fotos de perfil
      const fotosMap = {};
      top3.forEach(jugador => {
        if (jugador.foto_perfil) {
          fotosMap[jugador.usuario_id] = jugador.foto_perfil;
        }
      });
      setFotoPerfilMap(fotosMap);
    } catch (error) {
      console.error('Error cargando ranking:', error);
    }
  };

  const cargarUltimosGanadores = async () => {
    try {
      const token = localStorage.getItem('token');
      const jornadasResponse = await axios.get(`${API_URL}/api/sudamericana/jornadas`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const jornadaCerrada = jornadasResponse.data
        .filter(j => j.cerrada)
        .sort((a, b) => b.numero - a.numero)[0];

      if (jornadaCerrada) {
        const ganadoresResponse = await axios.get(
          `${API_URL}/api/sudamericana-ganadores-jornada/${jornadaCerrada.numero}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (ganadoresResponse.data.ganadores && Array.isArray(ganadoresResponse.data.ganadores) && ganadoresResponse.data.ganadores.length > 0) {
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
    if (numero === 7) return 'Play-Offs Ida/Vuelta';
    if (numero === 8) return 'Octavos de Final Ida/Vuelta';
    if (numero === 9) return 'Cuartos de Final Ida/Vuelta';
    if (numero === 10) return 'Semifinales Ida/Vuelta + Final + Cuadro Final';
    return '';
  };

  const getEstadoJornada = (jornada) => {
    if (jornada.cerrada) return { texto: 'Cerrada', clase: 'danger' };
    if (jornada.activa) return { texto: 'Abierta', clase: 'success' };
    return { texto: 'Disponible', clase: 'info' };
  };

  if (loading) {
    return (
      <div className="container text-center mt-5">
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="text-center mb-4">
        <h1 className="display-5 fw-bold">🟢 Copa Sudamericana 2026</h1>
        <p className="text-muted">La segunda competición más importante de clubes de Sudamérica</p>
      </div>

      {/* Botonera Principal */}
      <NavegacionSudamericana />

      {/* Hero Section con partidos destacados de Sudamericana */}
      <HeroSection competencia="sudamericana" />

      {/* Banner de Últimos Ganadores */}
      {ultimosGanadores && (
        <div className="alert alert-success text-center mb-4 py-3">
          <div className="d-flex flex-column flex-md-row justify-content-center align-items-center gap-3">
            <h5 className="mb-0 d-flex align-items-center gap-3 flex-wrap justify-content-center">
              <span>🏆 Últimos ganadores en la Jornada {ultimosGanadores.jornada}:</span>
              {ultimosGanadores.ganadores.map((ganador, index) => (
                <span key={index} className="d-inline-flex align-items-center gap-2 bg-white px-3 py-2 rounded shadow-sm">
                  <img
                    src={ganador.foto_perfil || '/perfil/default.png'}
                    alt={ganador.nombre}
                    className="rounded-circle"
                    style={{ width: '40px', height: '40px', objectFit: 'cover', border: '2px solid #28a745' }}
                    onError={(e) => { e.target.src = '/perfil/default.png'; }}
                  />
                  <strong className="text-dark">{ganador.nombre}</strong>
                </span>
              ))}
            </h5>
          </div>
        </div>
      )}

      {/* Top 3 Ranking General - Solo si hay puntos */}
      {ranking.length > 0 && ranking[0]?.puntos_acumulados > 0 && (
        <div className="card mb-4 shadow">
          <div className="card-header bg-success text-white text-center">
            <h4 className="mb-0">🏆 Top 3 Ranking General</h4>
          </div>
          <div className="card-body">
            <div className="row text-center">
              {ranking.map((jugador, index) => (
                <div key={jugador.usuario_id} className="col-12 col-md-4 mb-3">
                  <div className={`p-3 rounded ${index === 0 ? 'bg-success bg-opacity-25' : index === 1 ? 'bg-secondary bg-opacity-25' : 'bg-success bg-opacity-10'}`}>
                    <div className="mb-2">
                      {fotoPerfilMap[jugador.usuario_id] ? (
                        <img
                          src={fotoPerfilMap[jugador.usuario_id].startsWith('/') ? fotoPerfilMap[jugador.usuario_id] : `/perfil/${fotoPerfilMap[jugador.usuario_id]}`}
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
                    <p className="mb-0 fw-bold text-success">{jugador.puntos_acumulados || 0} puntos</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sección de Ingreso de Pronósticos */}
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-success text-white">
          <h4 className="mb-0">⚽ Ingreso de Pronósticos</h4>
        </div>
        <div className="card-body">
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
                        className="btn btn-success w-100 mt-2"
                        onClick={() => navigate(`/sudamericana/jornada/${jornada.numero}`)}
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
            <div className="alert alert-info text-center">
              <h5>📋 No hay jornadas disponibles</h5>
              <p className="mb-0">Las jornadas de la Copa Sudamericana se habilitarán próximamente.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
