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
      
      // Ordenar pronósticos dentro de cada grupo
      Object.values(grupos).forEach(grupo => {
        grupo.pronosticos.sort((a, b) => {
          // Para jornadas 7-10, ordenar por cruce (equipos) y luego IDA antes de VUELTA
          if (a.jornada.numero >= 7 && a.jornada.numero <= 10) {
            // Para J10: FINAL siempre al final
            if (grupo.jornada === 10) {
              const esFinalA = a.partido.tipo_partido === 'FINAL';
              const esFinalB = b.partido.tipo_partido === 'FINAL';
              
              if (esFinalA && !esFinalB) return 1;  // A es FINAL, va al final
              if (!esFinalA && esFinalB) return -1; // B es FINAL, va al final
              
              // Si ninguno es FINAL, ordenar por cruce
              if (!esFinalA && !esFinalB) {
                const getClaveEquipos = (p) => {
                  return [p.partido.local.nombre, p.partido.visita.nombre].sort().join('-');
                };
                const claveA = getClaveEquipos(a);
                const claveB = getClaveEquipos(b);
                
                if (claveA !== claveB) {
                  return claveA.localeCompare(claveB);
                }
                
                // Mismo cruce: IDA antes de VUELTA
                const ordenTipo = { 'IDA': 1, 'VUELTA': 2 };
                return (ordenTipo[a.partido.tipo_partido] || 999) - (ordenTipo[b.partido.tipo_partido] || 999);
              }
              
              return 0; // Ambos son FINAL (no debería pasar)
            }
            
            // Para otras jornadas (7, 8, 9): ordenar por cruce normal
            const getClaveEquipos = (p) => {
              return [p.partido.local.nombre, p.partido.visita.nombre].sort().join('-');
            };
            const claveA = getClaveEquipos(a);
            const claveB = getClaveEquipos(b);
            
            if (claveA !== claveB) {
              return claveA.localeCompare(claveB);
            }
            
            // Mismo cruce: IDA antes de VUELTA
            const ordenTipo = { 'IDA': 1, 'VUELTA': 2, 'FINAL': 3 };
            return (ordenTipo[a.partido.tipo_partido] || 999) - (ordenTipo[b.partido.tipo_partido] || 999);
          }
          
          // Para otras jornadas, ordenar por fecha de partido
          return new Date(a.partido.fecha) - new Date(b.partido.fecha);
        });
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
                      <>
                        <tr key={pronostico.id} className={getResultadoClase(pronostico)}>
                          <td className="fw-bold">{pronostico.usuario.nombre}</td>
                          <td className="text-center">
                            <span className="badge bg-primary">
                              Jornada {pronostico.jornada.numero}
                            </span>
                          </td>
                          <td className="text-center">
                            {pronostico.jornada.numero >= 7 && pronostico.jornada.numero <= 10 && pronostico.partido.tipo_partido ? (
                              <span className={`badge ${
                                pronostico.partido.tipo_partido === 'IDA' ? 'bg-info' : 
                                pronostico.partido.tipo_partido === 'FINAL' ? 'bg-warning text-dark' : 
                                'bg-success'
                              }`}>
                                {pronostico.partido.tipo_partido}
                              </span>
                            ) : pronostico.partido.grupo ? (
                              <span className="badge bg-info">Grupo {pronostico.partido.grupo}</span>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td>
                            <div className="d-flex flex-column align-items-center">
                              <div className="d-flex justify-content-center align-items-center gap-2 w-100">
                                <small className="fw-bold text-end" style={{flex: 1}}>
                                  {formatearNombreEquipo(pronostico.partido.local.nombre, pronostico.partido.local.pais)}
                                </small>
                                <span className="text-muted">vs</span>
                                <small className="fw-bold text-start" style={{flex: 1}}>
                                  {formatearNombreEquipo(pronostico.partido.visita.nombre, pronostico.partido.visita.pais)}
                                </small>
                              </div>
                              {/* Si es FINAL en J10, mostrar equipos pronosticados debajo */}
                              {pronostico.partido.tipo_partido === 'FINAL' && pronostico.equipos_pronosticados_final && (
                                <div className="text-primary small mt-1 text-center" style={{fontSize: '0.75rem'}}>
                                  Pronosticado: {pronostico.equipos_pronosticados_final.equipo_local} vs {pronostico.equipos_pronosticados_final.equipo_visita}
                                  {' '}
                                  {pronostico.equipos_pronosticados_final.equipo_local === pronostico.partido.local.nombre && 
                                   pronostico.equipos_pronosticados_final.equipo_visita === pronostico.partido.visita.nombre 
                                   ? <span className="text-success">✓ Coincide</span>
                                   : <span className="text-danger">✗ No coincide</span>}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="text-center fw-bold fs-5">
                            {/* Para FINAL en J10, mostrar pronóstico virtual */}
                            {pronostico.partido.tipo_partido === 'FINAL' && pronostico.equipos_pronosticados_final ? (
                              <>
                                {pronostico.equipos_pronosticados_final.goles_local} - {pronostico.equipos_pronosticados_final.goles_visita}
                                {pronostico.equipos_pronosticados_final.penales_local !== null && 
                                 pronostico.equipos_pronosticados_final.penales_visita !== null && (
                                  <div className="text-muted small">
                                    Pen: {pronostico.equipos_pronosticados_final.penales_local} - {pronostico.equipos_pronosticados_final.penales_visita}
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                {pronostico.pronostico.local} - {pronostico.pronostico.visita}
                                {pronostico.partido.tipo_partido === 'VUELTA' && 
                                 pronostico.pronostico.penales_local !== null && 
                                 pronostico.pronostico.penales_visita !== null && (
                                  <div className="text-muted small">
                                    Pen: {pronostico.pronostico.penales_local} - {pronostico.pronostico.penales_visita}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td className="text-center fw-bold fs-5">
                            {pronostico.partido.resultado.local !== null && pronostico.partido.resultado.visita !== null ? (
                              <>
                                {pronostico.partido.resultado.local} - {pronostico.partido.resultado.visita}
                                {pronostico.partido.tipo_partido === 'VUELTA' && 
                                 pronostico.partido.resultado.penales_local !== null && 
                                 pronostico.partido.resultado.penales_visita !== null && (
                                  <div className="text-muted small">
                                    Pen: {pronostico.partido.resultado.penales_local} - {pronostico.partido.resultado.penales_visita}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-muted">Pendiente</span>
                            )}
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
                        
                        {/* Fila de "Equipo que avanza" - Solo en jornadas 8+ y solo en partidos de VUELTA */}
                        {(() => {
                          const jornada = pronostico.jornada.numero;
                          // Usar el campo tipo_partido del backend para detectar si es VUELTA
                          const esPartidoVuelta = pronostico.partido.tipo_partido === 'VUELTA';
                          
                          return esPartidoVuelta && pronostico.equipo_pronosticado_avanza && (
                            <tr className={pronostico.puntos_clasificacion > 0 ? 'table-success' : pronostico.partido.resultado.local !== null ? 'table-danger' : 'table-secondary'}>
                              <td colSpan="4">
                                <div className="fw-bold mb-2 text-center">⚡ Equipo que avanza</div>
                                {(jornada === 8 || jornada === 9 || jornada === 10) && pronostico.partido_ida && (
                                  <div className="d-flex justify-content-between small">
                                    {/* PRONÓSTICO (Izquierda) */}
                                    <div className="text-start" style={{flex: 1}}>
                                      <div className="text-primary fw-bold mb-2">Pronosticado</div>
                                      <div className="mb-1">
                                        <strong>IDA:</strong> {pronostico.partido_ida.nombre_local} {pronostico.partido_ida.pronostico_ida_local !== null && pronostico.partido_ida.pronostico_ida_local !== undefined ? pronostico.partido_ida.pronostico_ida_local : '?'} - {pronostico.partido_ida.pronostico_ida_visita !== null && pronostico.partido_ida.pronostico_ida_visita !== undefined ? pronostico.partido_ida.pronostico_ida_visita : '?'} {pronostico.partido_ida.nombre_visita}
                                      </div>
                                      <div>
                                        <strong>Global:</strong> {pronostico.partido.local.nombre} {
                                          (pronostico.pronostico.local || 0) + (pronostico.partido_ida.pronostico_ida_visita || 0)
                                        } - {
                                          (pronostico.pronostico.visita || 0) + (pronostico.partido_ida.pronostico_ida_local || 0)
                                        } {pronostico.partido.visita.nombre}
                                      </div>
                                    </div>
                                    
                                    {/* REAL (Derecha) */}
                                    {pronostico.partido.resultado.local !== null && (
                                      <div className="text-end text-muted" style={{flex: 1}}>
                                        <div className="text-success fw-bold mb-2">Real</div>
                                        <div className="mb-1">
                                          <strong>IDA:</strong> {pronostico.partido_ida.nombre_local} {pronostico.partido_ida.resultado_ida_local !== null ? pronostico.partido_ida.resultado_ida_local : '?'} - {pronostico.partido_ida.resultado_ida_visita !== null ? pronostico.partido_ida.resultado_ida_visita : '?'} {pronostico.partido_ida.nombre_visita}
                                        </div>
                                        <div>
                                          <strong>Global:</strong> {pronostico.partido.local.nombre} {
                                            pronostico.partido.resultado.local + (pronostico.partido_ida.resultado_ida_visita || 0)
                                          } {
                                            pronostico.partido.resultado.penales_local !== null ? `(${pronostico.partido.resultado.penales_local} pen)` : ''
                                          } - {
                                            pronostico.partido.resultado.visita + (pronostico.partido_ida.resultado_ida_local || 0)
                                          } {
                                            pronostico.partido.resultado.penales_visita !== null ? `(${pronostico.partido.resultado.penales_visita} pen)` : ''
                                          } {pronostico.partido.visita.nombre}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="text-center fw-bold">
                                {pronostico.equipo_pronosticado_avanza}
                              </td>
                              <td className="text-center">
                                {pronostico.partido.resultado.local !== null ? (
                                  <div className="fw-bold text-success">
                                    {pronostico.equipo_real_avanza || '?'}
                                  </div>
                                ) : (
                                  <span className="text-muted">Pendiente</span>
                                )}
                              </td>
                              <td className="text-center fw-bold">
                                {pronostico.puntos_clasificacion !== null && pronostico.puntos_clasificacion !== undefined ? (
                                  pronostico.puntos_clasificacion > 0 ? (
                                    <span className="badge bg-success fs-6">
                                      +{pronostico.puntos_clasificacion} pts
                                    </span>
                                  ) : (
                                    <span className="badge bg-secondary">0 pts</span>
                                  )
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })()}
                      </>
                    ))}
                    
                    {/* Fila de "Cuadro Final" - Solo para Jornada 10 */}
                    {grupo.jornada === 10 && (() => {
                      // Buscar el partido FINAL y obtener equipos pronosticados
                      const partidoFinal = grupo.pronosticos.find(p => p.partido.tipo_partido === 'FINAL');
                      if (!partidoFinal || !partidoFinal.equipos_pronosticados_final) return null;
                      
                      const { campeon: pronosticadoCampeon, subcampeon: pronosticadoSubcampeon } = partidoFinal.equipos_pronosticados_final;
                      
                      // Determinar campeón y subcampeón REALES
                      let realCampeon = null;
                      let realSubcampeon = null;
                      if (partidoFinal.partido.resultado.local !== null && partidoFinal.partido.resultado.visita !== null) {
                        // Determinar ganador por marcador
                        let golesLocal = partidoFinal.partido.resultado.local;
                        let golesVisita = partidoFinal.partido.resultado.visita;
                        
                        if (golesLocal > golesVisita) {
                          realCampeon = partidoFinal.partido.local.nombre;
                          realSubcampeon = partidoFinal.partido.visita.nombre;
                        } else if (golesLocal < golesVisita) {
                          realCampeon = partidoFinal.partido.visita.nombre;
                          realSubcampeon = partidoFinal.partido.local.nombre;
                        } else {
                          // Empate, revisar penales
                          if (partidoFinal.partido.resultado.penales_local !== null && partidoFinal.partido.resultado.penales_visita !== null) {
                            if (partidoFinal.partido.resultado.penales_local > partidoFinal.partido.resultado.penales_visita) {
                              realCampeon = partidoFinal.partido.local.nombre;
                              realSubcampeon = partidoFinal.partido.visita.nombre;
                            } else {
                              realCampeon = partidoFinal.partido.visita.nombre;
                              realSubcampeon = partidoFinal.partido.local.nombre;
                            }
                          }
                        }
                      }
                      
                      // Verificar si coinciden
                      const coincideCampeon = pronosticadoCampeon === realCampeon;
                      const coincideSubcampeon = pronosticadoSubcampeon === realSubcampeon;
                      const ambosCoinciden = coincideCampeon && coincideSubcampeon;
                      
                      return (
                        <tr className="table-warning fw-bold">
                          <td colSpan="2" className="text-center">
                            <strong>🏆 Cuadro Final</strong>
                          </td>
                          <td colSpan="2" className="text-center text-primary">
                            <div><strong>Campeón:</strong> {pronosticadoCampeon}</div>
                            <div><strong>Subcampeón:</strong> {pronosticadoSubcampeon}</div>
                          </td>
                          <td colSpan="2" className="text-center">
                            {realCampeon ? (
                              <>
                                <div className={coincideCampeon ? 'text-success' : 'text-danger'}>
                                  <strong>Campeón:</strong> {realCampeon} {coincideCampeon ? '✓' : '✗'}
                                </div>
                                <div className={coincideSubcampeon ? 'text-success' : 'text-danger'}>
                                  <strong>Subcampeón:</strong> {realSubcampeon} {coincideSubcampeon ? '✓' : '✗'}
                                </div>
                              </>
                            ) : (
                              <span className="text-muted">Pendiente</span>
                            )}
                          </td>
                          <td className="text-center">
                            {realCampeon && ambosCoinciden ? (
                              <span className="badge bg-success fs-6">Coincide ✓</span>
                            ) : realCampeon ? (
                              <span className="badge bg-danger fs-6">No coincide ✗</span>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })()}
                    
                    {/* Fila de total */}
                    <tr className="table-info fw-bold">
                      <td colSpan="6" className="text-end">TOTAL {grupo.jugador} - Jornada {grupo.jornada}:</td>
                      <td className="text-center">
                        <span className="badge bg-dark fs-5">
                          {(() => {
                            // Sumar puntos de partidos
                            const puntosPartidos = grupo.pronosticos.reduce((sum, p) => sum + (p.puntos || 0), 0);
                            
                            // Para puntos de clasificación, solo contar una vez por cruce (en partidos de VUELTA)
                            const puntosClasificacion = grupo.pronosticos
                              .filter((p, index) => {
                                const jornada = p.jornada.numero;
                                // Jornada 8: todos son VUELTA
                                if (jornada === 8) return true;
                                // Jornada 9: solo los de índice impar son VUELTA
                                if (jornada === 9) return index % 2 === 1;
                                // Jornada 10: índices 1, 3 son VUELTA, 4 es FINAL
                                if (jornada === 10) return index === 1 || index === 3 || index === 4;
                                return false;
                              })
                              .reduce((sum, p) => sum + (p.puntos_clasificacion || 0), 0);
                            
                            return puntosPartidos + puntosClasificacion;
                          })()} pts
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
