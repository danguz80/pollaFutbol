import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export default function ClasificacionLibertadores() {
  const navigate = useNavigate();
  const [pronosticos, setPronosticos] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [filtroNombre, setFiltroNombre] = useState('');
  const [filtroPartido, setFiltroPartido] = useState('');
  const [filtroJornada, setFiltroJornada] = useState('');
  
  // Datos para los selectores
  const [partidos, setPartidos] = useState([]);
  const [jornadas, setJornadas] = useState([]);
  const [jugadores, setJugadores] = useState([]);

  useEffect(() => {
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
      const headers = { Authorization: `Bearer ${token}` };

      // Cargar partidos, jornadas y jugadores en paralelo
      const [partidosRes, jornadasRes, jugadoresRes] = await Promise.all([
        axios.get(`${API_URL}/api/libertadores-clasificacion/partidos`, { headers }),
        axios.get(`${API_URL}/api/libertadores-clasificacion/jornadas`, { headers }),
        axios.get(`${API_URL}/api/libertadores-clasificacion/jugadores`, { headers })
      ]);

      setPartidos(partidosRes.data);
      setJornadas(jornadasRes.data);
      setJugadores(jugadoresRes.data);
    } catch (error) {
      console.error('Error cargando datos iniciales:', error);
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
        `${API_URL}/api/libertadores-clasificacion/pronosticos?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setPronosticos(response.data);
    } catch (error) {
      console.error('Error cargando pronósticos:', error);
    } finally {
      setLoading(false);
    }
  };

  const limpiarFiltros = () => {
    setFiltroNombre('');
    setFiltroPartido('');
    setFiltroJornada('');
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

  const formatearNombreEquipo = (nombre, pais) => {
    if (!nombre) return '-';
    return pais ? `${nombre} (${pais})` : nombre;
  };

  return (
    <div className="container mt-4">
      <div className="text-center mb-4">
        <h1 className="display-5 fw-bold">📋 Clasificación - Pronósticos Libertadores</h1>
        <p className="text-muted">Visualiza todos los pronósticos entregados por los jugadores</p>
      </div>

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
          disabled
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
                  <option key={jornada.id} value={jornada.numero}>
                    {jornada.nombre}
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
                  .filter(partido => !filtroJornada || partido.jornada_numero === parseInt(filtroJornada))
                  .map(partido => (
                  <option key={partido.id} value={partido.id}>
                    {formatearNombreEquipo(partido.nombre_local, partido.pais_local)} vs{' '}
                    {formatearNombreEquipo(partido.nombre_visita, partido.pais_visita)}
                    {partido.grupo && ` - Grupo ${partido.grupo}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Botón Limpiar */}
          <div className="text-center mt-3">
            <button 
              className="btn btn-outline-secondary"
              onClick={limpiarFiltros}
            >
              🔄 Limpiar Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Resultados */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
        </div>
      ) : pronosticos.length === 0 ? (
        <div className="alert alert-info text-center">
          No se encontraron pronósticos con los filtros aplicados
        </div>
      ) : (
        <>
          <div className="alert alert-info d-flex justify-content-between align-items-center">
            <span>Total de pronósticos: <strong>{pronosticos.length}</strong></span>
            <div>
              <span className="badge bg-success me-2">✓ Acertado</span>
              <span className="badge bg-danger me-2">✗ Fallado</span>
              <span className="badge bg-secondary">⏳ Pendiente</span>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table table-bordered table-hover">
              <thead className="table-dark">
                <tr>
                  <th style={{ width: '150px' }}>Jugador</th>
                  <th style={{ width: '100px' }}>Jornada</th>
                  <th style={{ width: '80px' }}>Grupo</th>
                  <th>Partido</th>
                  <th style={{ width: '100px' }}>Pronóstico</th>
                  <th style={{ width: '100px' }}>Resultado</th>
                  <th style={{ width: '80px' }}>Puntos</th>
                </tr>
              </thead>
              <tbody>
                {pronosticos.map((pronostico) => (
                  <tr key={pronostico.id} className={getResultadoClase(pronostico)}>
                    <td className="fw-bold">{pronostico.usuario.nombre}</td>
                    <td className="text-center">
                      <span className="badge bg-primary">
                        Jornada {pronostico.jornada.numero}
                      </span>
                    </td>
                    <td className="text-center">
                      {pronostico.partido.grupo ? (
                        <span className="badge bg-info">Grupo {pronostico.partido.grupo}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>
                      <div className="d-flex flex-column">
                        <small className="fw-bold">
                          {formatearNombreEquipo(pronostico.partido.local.nombre, pronostico.partido.local.pais)}
                        </small>
                        <small className="fw-bold">
                          {formatearNombreEquipo(pronostico.partido.visita.nombre, pronostico.partido.visita.pais)}
                        </small>
                      </div>
                    </td>
                    <td className="text-center fw-bold fs-5">
                      {pronostico.pronostico.local} - {pronostico.pronostico.visita}
                    </td>
                    <td className="text-center fw-bold fs-5">
                      {pronostico.partido.resultado.local !== null && pronostico.partido.resultado.visita !== null
                        ? `${pronostico.partido.resultado.local} - ${pronostico.partido.resultado.visita}`
                        : <span className="text-muted">Pendiente</span>
                      }
                    </td>
                    <td className="text-center fw-bold">
                      {pronostico.puntos !== null ? (
                        <span className="badge bg-warning text-dark fs-6">
                          {pronostico.puntos} pts
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Botón Volver */}
      <div className="text-center mt-4 mb-4">
        <button 
          className="btn btn-outline-secondary btn-lg"
          onClick={() => navigate('/libertadores')}
        >
          ← Volver a Libertadores
        </button>
      </div>
    </div>
  );
}
