import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export default function ClasificacionLibertadores() {
  const navigate = useNavigate();
  const [pronosticos, setPronosticos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [jornadaAbierta, setJornadaAbierta] = useState(false);
  const [participantes, setParticipantes] = useState([]);
  
  // Rankings
  const [rankingJornada, setRankingJornada] = useState([]);
  const [rankingAcumulado, setRankingAcumulado] = useState([]);
  const [mostrarActual, setMostrarActual] = useState(false);
  const [jornadaActual, setJornadaActual] = useState(null);
  
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
    if (filtroJornada) {
      cargarRankings();
    }
  }, [filtroNombre, filtroPartido, filtroJornada]);

  // Resetear filtro de partido cuando cambia la jornada
  useEffect(() => {
    setFiltroPartido('');
  }, [filtroJornada]);

  // Recargar rankings cuando cambia el modo de visualización
  useEffect(() => {
    if (filtroJornada) {
      cargarRankings();
    }
  }, [mostrarActual]);

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
        axios.get(`${API_URL}/api/libertadores-clasificacion/partidos`, { headers }),
        axios.get(`${API_URL}/api/libertadores-clasificacion/jornadas`, { headers }),
        axios.get(`${API_URL}/api/libertadores-clasificacion/jugadores`, { headers })
      ]);

      setPartidos(partidosRes.data);
      setJornadas(jornadasRes.data);
      setJugadores(jugadoresRes.data);
      
      console.log('Jornadas cargadas:', jornadasRes.data.length);
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
        `${API_URL}/api/libertadores-clasificacion/pronosticos?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Verificar si la jornada seleccionada está abierta (no cerrada)
      const jornadaSeleccionada = jornadas.find(j => j.numero === parseInt(filtroJornada));
      const estaAbierta = jornadaSeleccionada && !jornadaSeleccionada.cerrada;
      setJornadaAbierta(estaAbierta);

      // Si no es admin y la jornada está abierta, solo mostrar participantes
      if (!esAdmin && estaAbierta) {
        // Extraer usuarios únicos que tienen pronósticos
        const usuariosUnicos = [];
        const idsVistos = new Set();
        
        response.data.forEach(p => {
          if (!idsVistos.has(p.usuario.id)) {
            idsVistos.add(p.usuario.id);
            usuariosUnicos.push({
              id: p.usuario.id,
              nombre: p.usuario.nombre,
              foto_perfil: p.usuario.foto_perfil
            });
          }
        });
        
        setParticipantes(usuariosUnicos);
        setPronosticos([]);
      } else {
        // Si es admin o la jornada está cerrada, mostrar pronósticos normalmente
        if (!esAdmin) {
          const pronosticosFiltrados = response.data.filter(p => p.jornada.cerrada === true);
          setPronosticos(pronosticosFiltrados);
        } else {
          setPronosticos(response.data);
        }
        setParticipantes([]);
      }
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

  const calcularPuntos = async () => {
    if (!window.confirm('¿Estás seguro de calcular los puntos? Esto actualizará todos los pronósticos que tengan resultado real.')) {
      return;
    }

    try {
      setCalculando(true);
      const token = localStorage.getItem('token');
      
      const response = await axios.post(
        `${API_URL}/api/libertadores-calcular/puntos`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert(`✅ Puntos calculados exitosamente\n\n` +
        `Total de pronósticos: ${response.data.total_pronosticos}\n` +
        `Pronósticos con puntos: ${response.data.pronosticos_con_puntos}\n` +
        `Puntos totales asignados: ${response.data.puntos_totales_asignados}`);
      
      // Recargar pronósticos y rankings
      cargarPronosticos();
      cargarRankings();
    } catch (error) {
      console.error('Error calculando puntos:', error);
      alert('❌ Error al calcular los puntos');
    } finally {
      setCalculando(false);
    }
  };

  const cargarRankings = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      if (mostrarActual) {
        // Cargar ranking actual
        const actualRes = await axios.get(
          `${API_URL}/api/libertadores-rankings/actual`,
          { headers }
        );
        setJornadaActual(actualRes.data.jornada);
        setRankingAcumulado(actualRes.data.ranking);
        
        // Cargar ranking de esa jornada
        const jornadaRes = await axios.get(
          `${API_URL}/api/libertadores-rankings/jornada/${actualRes.data.jornada}`,
          { headers }
        );
        setRankingJornada(jornadaRes.data);
      } else {
        // Cargar ranking de jornada seleccionada
        const jornadaNum = filtroJornada || 1;
        const [jornadaRes, acumuladoRes] = await Promise.all([
          axios.get(`${API_URL}/api/libertadores-rankings/jornada/${jornadaNum}`, { headers }),
          axios.get(`${API_URL}/api/libertadores-rankings/acumulado/${jornadaNum}`, { headers })
        ]);
        setRankingJornada(jornadaRes.data);
        setRankingAcumulado(acumuladoRes.data);
      }
    } catch (error) {
      console.error('Error cargando rankings:', error);
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

  const formatearNombreEquipo = (nombre, pais) => {
    if (!nombre) return '-';
    return pais ? `${nombre} (${pais})` : nombre;
  };

  // Agrupar pronósticos por jornada y jugador
  const agruparPronosticos = () => {
    if (filtroJornada) {
      // Si hay jornada seleccionada, agrupar solo por jugador
      const grupos = {};
      pronosticos.forEach(p => {
        const key = `${p.usuario.id}`;
        if (!grupos[key]) {
          grupos[key] = {
            jugador: p.usuario.nombre,
            jornada: p.jornada.numero,
            pronosticos: []
          };
        }
        grupos[key].pronosticos.push(p);
      });
      return Object.values(grupos);
    } else {
      // Si no hay jornada, agrupar por jornada y jugador
      const grupos = {};
      pronosticos.forEach(p => {
        const key = `${p.jornada.numero}-${p.usuario.id}`;
        if (!grupos[key]) {
          grupos[key] = {
            jugador: p.usuario.nombre,
            jornada: p.jornada.numero,
            pronosticos: []
          };
        }
        grupos[key].pronosticos.push(p);
      });
      return Object.values(grupos).sort((a, b) => {
        if (a.jornada !== b.jornada) return b.jornada - a.jornada;
        return a.jugador.localeCompare(b.jugador);
      });
    }
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

      {/* Botón Calcular Puntos (Solo Admin) */}
      {esAdmin && (
        <div className="mb-4 text-center">
          <button 
            className="btn btn-success btn-lg px-5"
            onClick={calcularPuntos}
            disabled={calculando}
          >
            {calculando ? '⏳ Calculando...' : '🧮 Calcular Puntos'}
          </button>
          <p className="text-muted mt-2 mb-0">
            <small>Esto comparará todos los pronósticos con los resultados reales y asignará puntos según el sistema de puntuación</small>
          </p>
        </div>
      )}

      {/* Mensaje informativo para usuarios */}
      {!esAdmin && (
        <div className="alert alert-info mb-4">
          <strong>ℹ️ Información:</strong> Solo puedes ver los pronósticos de las jornadas cerradas.
        </div>
      )}

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
                    {jornada.nombre} {jornada.cerrada ? '🔒 Cerrada' : '🔓 Abierta'}
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

          {/* Botones de acceso directo a Rankings */}
          <div className="d-flex justify-content-center gap-2 mt-3">
            <button
              className="btn btn-primary"
              onClick={() => document.getElementById('ranking-jornada')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              🏆 Ir a Ranking Jornada
            </button>
            <button
              className="btn btn-success"
              onClick={() => document.getElementById('ranking-acumulado')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              📊 Ir a Ranking Acumulado
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
      ) : !esAdmin && jornadaAbierta && participantes.length > 0 ? (
        /* Mostrar solo participantes si la jornada está abierta */
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-warning text-dark">
            <h5 className="mb-0">⏳ Jornada Abierta - Participantes que han subido pronósticos</h5>
          </div>
          <div className="card-body">
            <p className="text-muted mb-4">
              Esta jornada aún está abierta. Los pronósticos se revelarán cuando la jornada se cierre.
            </p>
            <div className="row g-3">
              {participantes.map((participante) => (
                <div key={participante.id} className="col-6 col-sm-4 col-md-3 col-lg-2">
                  <div className="card h-100 text-center">
                    <div className="card-body p-3">
                      <img
                        src={participante.foto_perfil || '/perfil/default.png'}
                        alt={participante.nombre}
                        className="rounded-circle mb-2"
                        style={{ width: '80px', height: '80px', objectFit: 'cover' }}
                        onError={(e) => {
                          e.target.src = '/perfil/default.png';
                        }}
                      />
                      <p className="mb-0 small fw-bold">{participante.nombre}</p>
                      <span className="badge bg-success mt-1">✓ Pronóstico enviado</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-4">
              <p className="text-muted mb-0">
                <strong>{participantes.length}</strong> {participantes.length === 1 ? 'participante ha' : 'participantes han'} enviado sus pronósticos
              </p>
            </div>
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
                {agruparPronosticos().map((grupo, grupoIndex) => (
                  <>
                    {grupo.pronosticos.map((pronostico, index) => (
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
                    {/* Fila de total */}
                    <tr className="table-info fw-bold">
                      <td colSpan="6" className="text-end">TOTAL {grupo.jugador} - Jornada {grupo.jornada}:</td>
                      <td className="text-center">
                        <span className="badge bg-dark fs-5">
                          {grupo.pronosticos.reduce((sum, p) => sum + (p.puntos || 0), 0)} pts
                        </span>
                      </td>
                    </tr>
                    {/* Separador entre grupos */}
                    {grupoIndex < agruparPronosticos().length - 1 && (
                      <tr style={{ height: '30px', backgroundColor: '#e9ecef' }}>
                        <td colSpan="7" className="p-0 text-center align-middle">
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                          >
                            ⬆️ Ir arriba
                          </button>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Rankings */}
      {rankingJornada.length > 0 && (
        <div className="mt-5">
          <hr className="my-5" />
          
          {/* Ranking de Jornada */}
          <div id="ranking-jornada" className="card shadow-sm mb-4">
            <div className="card-header bg-primary text-white">
              <h4 className="mb-0">🏆 Ranking Jornada {mostrarActual ? jornadaActual : filtroJornada}</h4>
            </div>
            <div className="card-body">
              <div className="row g-3">
                {rankingJornada.map((jugador, index) => {
                  let bgClass = '';
                  let textClass = 'text-dark';
                  let positionIcon = '';
                  
                  if (index === 0) {
                    bgClass = 'bg-warning';
                    positionIcon = '🥇';
                  } else if (index === 1) {
                    bgClass = 'bg-secondary';
                    textClass = 'text-white';
                    positionIcon = '🥈';
                  } else if (index === 2) {
                    bgClass = 'bg-danger';
                    textClass = 'text-white';
                    positionIcon = '🥉';
                  }
                  
                  return (
                    <div key={jugador.id} className="col-12 col-md-6 col-lg-4">
                      <div className={`card h-100 ${bgClass} ${textClass}`}>
                        <div className="card-body d-flex align-items-center">
                          <div className="me-3">
                            <span className="fs-3 fw-bold">{positionIcon || `${index + 1}º`}</span>
                          </div>
                          <div className="me-3">
                            <img
                              src={jugador.foto_perfil || '/perfil/default.png'}
                              alt={jugador.nombre}
                              className="rounded-circle"
                              style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                              onError={(e) => {
                                e.target.src = '/perfil/default.png';
                              }}
                            />
                          </div>
                          <div className="flex-grow-1">
                            <h5 className="mb-1">{jugador.nombre}</h5>
                            <p className="mb-0 fs-4 fw-bold">{jugador.puntos_jornada} pts</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Ranking Acumulado */}
          <div id="ranking-acumulado" className="card shadow-sm mb-4">
            <div className="card-header bg-success text-white">
              <h4 className="mb-0">📊 Ranking Acumulado {mostrarActual ? `(Hasta Jornada ${jornadaActual})` : `(Hasta Jornada ${filtroJornada})`}</h4>
            </div>
            <div className="card-body">
              <div className="row g-3">
                {rankingAcumulado.map((jugador, index) => {
                  let bgClass = '';
                  let textClass = 'text-dark';
                  let positionIcon = '';
                  
                  if (index === 0) {
                    bgClass = 'bg-warning';
                    positionIcon = '🥇';
                  } else if (index === 1) {
                    bgClass = 'bg-secondary';
                    textClass = 'text-white';
                    positionIcon = '🥈';
                  } else if (index === 2) {
                    bgClass = 'bg-danger';
                    textClass = 'text-white';
                    positionIcon = '🥉';
                  }
                  
                  return (
                    <div key={jugador.id} className="col-12 col-md-6 col-lg-4">
                      <div className={`card h-100 ${bgClass} ${textClass}`}>
                        <div className="card-body d-flex align-items-center">
                          <div className="me-3">
                            <span className="fs-3 fw-bold">{positionIcon || `${index + 1}º`}</span>
                          </div>
                          <div className="me-3">
                            <img
                              src={jugador.foto_perfil || '/perfil/default.png'}
                              alt={jugador.nombre}
                              className="rounded-circle"
                              style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                              onError={(e) => {
                                e.target.src = '/perfil/default.png';
                              }}
                            />
                          </div>
                          <div className="flex-grow-1">
                            <h5 className="mb-1">{jugador.nombre}</h5>
                            <p className="mb-0 fs-4 fw-bold">{jugador.puntos_acumulados} pts</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Botones de control de ranking */}
          <div className="text-center mb-4 d-flex gap-3 justify-content-center flex-wrap">
            <button 
              className={`btn ${mostrarActual ? 'btn-success' : 'btn-outline-success'} btn-lg px-4`}
              onClick={() => setMostrarActual(true)}
            >
              📈 Mostrar Ranking Actual
            </button>
            <button 
              className={`btn ${!mostrarActual ? 'btn-primary' : 'btn-outline-primary'} btn-lg px-4`}
              onClick={() => setMostrarActual(false)}
            >
              🔍 Mostrar Ranking de Jornada Seleccionada
            </button>
          </div>
        </div>
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
