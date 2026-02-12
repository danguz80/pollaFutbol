import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getMundialLogoPorNombre } from '../utils/mundialLogos';
import NavegacionMundial from '../components/NavegacionMundial';

const API_URL = import.meta.env.VITE_API_URL;

function useAuth() {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuario"));
    return usuario;
  } catch {
    return null;
  }
}

export default function ClasificacionMundial() {
  const navigate = useNavigate();
  const usuario = useAuth();
  const [pronosticos, setPronosticos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [esAdmin, setEsAdmin] = useState(false);
  
  // Filtros
  const [filtroNombre, setFiltroNombre] = useState('');
  const [filtroPartido, setFiltroPartido] = useState('');
  const [filtroJornada, setFiltroJornada] = useState('1');
  
  // Datos para los selectores
  const [partidos, setPartidos] = useState([]);
  const [jornadas, setJornadas] = useState([]);
  const [jugadores, setJugadores] = useState([]);

  useEffect(() => {
    // Verificar si es admin
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    setEsAdmin(usuario.rol === 'admin');
    
    cargarDatosIniciales();
  }, []);

  useEffect(() => {
    cargarPronosticos();
  }, [filtroNombre, filtroPartido, filtroJornada]);

  // Resetear filtro de partido cuando cambia la jornada
  useEffect(() => {
    setFiltroPartido('');
  }, [filtroJornada]);

  const cargarDatosIniciales = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        console.error('No hay token, redirigiendo a login');
        navigate('/login');
        return;
      }
      
      const headers = { Authorization: `Bearer ${token}` };

      // Cargar partidos, jornadas y jugadores en paralelo
      const [partidosRes, jornadasRes, jugadoresRes] = await Promise.all([
        axios.get(`${API_URL}/api/mundial-clasificacion/partidos`, { headers }),
        axios.get(`${API_URL}/api/mundial-clasificacion/jornadas`, { headers }),
        axios.get(`${API_URL}/api/mundial-clasificacion/jugadores`, { headers })
      ]);

      setPartidos(partidosRes.data);
      setJornadas(jornadasRes.data);
      setJugadores(jugadoresRes.data);
    } catch (error) {
      console.error('Error cargando datos iniciales:', error);
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.error('Token inválido o expirado, redirigiendo a login');
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        navigate('/login');
      }
    }
  };

  const cargarPronosticos = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Construir query params
      const params = new URLSearchParams();
      if (filtroNombre) params.append('usuario_id', filtroNombre);
      if (filtroPartido) params.append('partido_id', filtroPartido);
      if (filtroJornada) params.append('jornada_numero', filtroJornada);

      const response = await axios.get(
        `${API_URL}/api/mundial-clasificacion/pronosticos?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setPronosticos(response.data);
    } catch (error) {
      console.error('Error cargando pronósticos:', error);
    } finally {
      setLoading(false);
    }
  };

  const getResultadoClase = (pronostico) => {
    const { partido, pronostico: pron, puntos } = pronostico;
    
    // Si no hay resultado aún
    if (partido.resultado.local === null || partido.resultado.visita === null) {
      return 'table-secondary';
    }

    // Si acertó
    if (puntos > 0) {
      return 'table-success';
    }

    // Si falló
    return 'table-danger';
  };

  const formatearNombreEquipo = (nombre) => {
    return nombre || '-';
  };

  // Agrupar pronósticos por jugador
  const agruparPronosticos = () => {
    const grupos = {};
    
    pronosticos.forEach(p => {
      const key = `${p.usuario.id}`;
      if (!grupos[key]) {
        grupos[key] = {
          usuario_id: p.usuario.id,
          jugador: p.usuario.nombre,
          foto_perfil: p.usuario.foto_perfil,
          jornada: parseInt(filtroJornada),
          pronosticos: []
        };
      }
      grupos[key].pronosticos.push(p);
    });
    
    // Calcular puntaje total para cada grupo y ordenar pronósticos
    Object.values(grupos).forEach(grupo => {
      grupo.puntosPartidos = grupo.pronosticos.reduce((sum, p) => sum + (p.puntos || 0), 0);
      
      // Ordenar pronósticos por fecha
      grupo.pronosticos.sort((a, b) => 
        new Date(a.partido.fecha) - new Date(b.partido.fecha)
      );
    });
    
    // Ordenar grupos por puntaje descendente
    return Object.values(grupos).sort((a, b) => b.puntosPartidos - a.puntosPartidos);
  };

  if (loading) {
    return (
      <div className="container mt-5">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
          <p className="mt-3">Cargando clasificación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4 mb-5">
      <div className="text-center mb-4">
        <h1 className="display-5 fw-bold">📋 Clasificación - Pronósticos Mundial</h1>
        <p className="lead text-muted">Todos los pronósticos y resultados</p>
      </div>

      {/* Navegación Mundial */}
      <NavegacionMundial />

      {/* Botón Volver */}
      <div className="mb-4 text-center">
        <button
          className="btn btn-secondary"
          onClick={() => navigate('/mundial')}
        >
          ← Volver al Mundial
        </button>
      </div>

      {/* Filtros */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h5 className="card-title mb-3">🔍 Filtros</h5>
          <div className="row g-3">
            {/* Filtro por Nombre */}
            <div className="col-12 col-md-4">
              <label className="form-label fw-bold">Por Jugador</label>
              <select
                className="form-select"
                value={filtroNombre}
                onChange={(e) => setFiltroNombre(e.target.value)}
              >
                <option value="">Todos los jugadores</option>
                {jugadores.map(jugador => (
                  <option key={jugador.id} value={jugador.id}>
                    {jugador.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro por Jornada */}
            <div className="col-12 col-md-4">
              <label className="form-label fw-bold">Por Jornada</label>
              <select
                className="form-select"
                value={filtroJornada}
                onChange={(e) => setFiltroJornada(e.target.value)}
              >
                <option value="">Todas las jornadas</option>
                {jornadas.map(jornada => (
                  <option key={jornada.numero} value={jornada.numero}>
                    Jornada {jornada.numero} - {jornada.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro por Partido */}
            <div className="col-12 col-md-4">
              <label className="form-label fw-bold">Por Partido</label>
              <select
                className="form-select"
                value={filtroPartido}
                onChange={(e) => setFiltroPartido(e.target.value)}
              >
                <option value="">Todos los partidos</option>
                {partidos
                  .filter(p => !filtroJornada || p.jornada_numero == filtroJornada)
                  .map(partido => (
                    <option key={partido.id} value={partido.id}>
                      {partido.equipo_local} vs {partido.equipo_visitante}
                      {partido.grupo && ` (Grupo ${partido.grupo})`}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Botón Limpiar Filtros */}
          {(filtroNombre || filtroPartido || filtroJornada) && (
            <div className="mt-3">
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => {
                  setFiltroNombre('');
                  setFiltroPartido('');
                  setFiltroJornada('1');
                }}
              >
                🔄 Limpiar Filtros
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabla de Pronósticos */}
      {pronosticos.length > 0 ? (
        <>
          {agruparPronosticos().map((grupo, grupoIndex) => (
            <div key={`grupo-${grupo.usuario_id}-${grupoIndex}`} className="mb-4">
              {/* Encabezado del Jugador */}
              <div className="d-flex align-items-center justify-content-center gap-3 mb-3 p-3 bg-light rounded">
                {grupo.foto_perfil && (
                  <img
                    src={grupo.foto_perfil}
                    alt={grupo.jugador}
                    className="rounded-circle"
                    style={{ width: '60px', height: '60px', objectFit: 'cover', border: '3px solid #0d6efd' }}
                    onError={(e) => { e.target.src = '/perfil/default.png'; }}
                  />
                )}
                <h4 className="mb-0">Jugador: {grupo.jugador}</h4>
              </div>

              {/* Tabla de pronósticos del jugador */}
              <div className="table-responsive">
                <table className="table table-bordered table-hover" style={{ fontSize: '1.1rem' }}>
                  <thead className="table-secondary">
                    <tr>
                      <th className="text-center">Partido</th>
                      <th className="text-center" style={{ width: '100px' }}>Resultado real</th>
                      <th className="text-center" style={{ width: '100px' }}>Mi resultado</th>
                      <th className="text-center" style={{ width: '80px' }}>Bonus</th>
                      <th className="text-center" style={{ width: '80px' }}>Puntos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.pronosticos.map((pronostico, index) => (
                      <tr key={`pronostico-${pronostico.id}-${index}`} className={getResultadoClase(pronostico)}>
                        <td>
                          <div className="d-flex align-items-center justify-content-center gap-3">
                            <div className="d-flex align-items-center gap-2">
                              <img 
                                src={getMundialLogoPorNombre(pronostico.partido.local.nombre)} 
                                alt={pronostico.partido.local.nombre}
                                style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                              <span>{formatearNombreEquipo(pronostico.partido.local.nombre)}</span>
                            </div>
                            <span className="text-muted">vs</span>
                            <div className="d-flex align-items-center gap-2">
                              <span>{formatearNombreEquipo(pronostico.partido.visita.nombre)}</span>
                              <img 
                                src={getMundialLogoPorNombre(pronostico.partido.visita.nombre)} 
                                alt={pronostico.partido.visita.nombre}
                                style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            </div>
                          </div>
                        </td>
                        
                        <td className="text-center">
                          {pronostico.partido.resultado.local !== null && pronostico.partido.resultado.visita !== null ? (
                            <span className="fw-bold">
                              {pronostico.partido.resultado.local} - {pronostico.partido.resultado.visita}
                            </span>
                          ) : (
                            <span className="text-muted">Pendiente</span>
                          )}
                        </td>
                        
                        <td className="text-center fw-bold">
                          {pronostico.pronostico.local} - {pronostico.pronostico.visita}
                        </td>
                        
                        <td className="text-center">
                          <span className={`badge ${pronostico.partido.bonus >= 2 ? 'bg-warning text-dark' : 'bg-secondary'}`}>
                            x{pronostico.partido.bonus}
                          </span>
                        </td>
                        
                        <td className="text-center">
                          <strong className={pronostico.puntos > 0 ? 'text-success' : 'text-danger'}>
                            {pronostico.puntos || 0}
                          </strong>
                        </td>
                      </tr>
                    ))}
                    
                    {/* Fila de totales */}
                    <tr className="table-dark fw-bold">
                      <td colSpan="4" className="text-end">Total {grupo.jugador} :</td>
                      <td className="text-center">{grupo.puntosPartidos}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="alert alert-warning text-center">
          <strong>⚠️ Sin datos:</strong> No hay pronósticos con los filtros seleccionados.
        </div>
      )}
    </div>
  );
}
