import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import FireworksEffect from '../components/FireworksEffect';
import NavegacionSudamericana from '../components/NavegacionSudamericana';
import { getLogoEquipo } from '../utils/sudamericanaLogos';

const API_URL = import.meta.env.VITE_API_URL;

export default function ClasificacionSudamericana() {
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
  
  // Ganadores de jornada
  const [ganadores, setGanadores] = useState(null);
  const [mostrarGanadores, setMostrarGanadores] = useState(false);
  const [calculandoGanadores, setCalculandoGanadores] = useState(false);
  
  // Ganadores acumulado
  const [ganadoresAcumulado, setGanadoresAcumulado] = useState(null);
  const [mostrarGanadoresAcumulado, setMostrarGanadoresAcumulado] = useState(false);
  const [calculandoGanadoresAcumulado, setCalculandoGanadoresAcumulado] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [modalType, setModalType] = useState("success");

  useEffect(() => {
    // Verificar si es admin
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    setEsAdmin(usuario.rol === 'admin');
    
    cargarDatosIniciales();
  }, []);

  useEffect(() => {
    // Solo cargar pronósticos si ya tenemos las jornadas cargadas
    if (jornadas.length > 0) {
      cargarPronosticos();
      // Cargar rankings siempre que haya jornadas
      if (filtroJornada && filtroJornada !== '') {
        cargarRankings();
        cargarGanadoresJornada(parseInt(filtroJornada));
      }
    }
    // Cargar ganadores acumulado siempre (no depende de filtro)
    cargarGanadoresAcumulado();
  }, [filtroNombre, filtroPartido, filtroJornada, jornadas.length]);

  // Resetear filtro de partido cuando cambia la jornada
  useEffect(() => {
    setFiltroPartido('');
  }, [filtroJornada]);

  // Recargar rankings cuando cambia el modo de visualización
  useEffect(() => {
    cargarRankings();
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
        axios.get(`${API_URL}/api/sudamericana-clasificacion/partidos`, { headers }),
        axios.get(`${API_URL}/api/sudamericana-clasificacion/jornadas`, { headers }),
        axios.get(`${API_URL}/api/sudamericana-clasificacion/jugadores`, { headers })
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
        `${API_URL}/api/sudamericana-clasificacion/pronosticos?${params.toString()}`,
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

  const cargarRankings = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Usar backend para todas las jornadas
      if (mostrarActual) {
        const actualRes = await axios.get(
          `${API_URL}/api/sudamericana-rankings/actual`,
          { headers }
        );
        setJornadaActual(actualRes.data.jornada);
        setRankingAcumulado(actualRes.data.ranking);
        
        const jornadaRes = await axios.get(
          `${API_URL}/api/sudamericana-rankings/jornada/${actualRes.data.jornada}`,
          { headers }
        );
        setRankingJornada(jornadaRes.data);
      } else {
        const jornadaNum = filtroJornada || 1;
        const [jornadaRes, acumuladoRes] = await Promise.all([
          axios.get(`${API_URL}/api/sudamericana-rankings/jornada/${jornadaNum}`, { headers }),
          axios.get(`${API_URL}/api/sudamericana-rankings/acumulado/${jornadaNum}`, { headers })
        ]);
        setRankingJornada(jornadaRes.data);
        setRankingAcumulado(acumuladoRes.data);
      }
    } catch (error) {
      console.error('Error cargando rankings:', error);
    }
  };

  const limpiarFiltros = () => {
    setFiltroNombre('');
    setFiltroPartido('');
    setFiltroJornada('');
  };

  const calcularPuntos = async () => {
    const mensaje = filtroJornada 
      ? `¿Calcular puntajes de la jornada ${filtroJornada}?`
      : "¿Calcular puntajes de todas las jornadas de Sudamericana?";
    
    if (!confirm(mensaje)) return;
    
    try {
      setCalculando(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/sudamericana-calcular/puntos`, {
        method: "POST",
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jornadaNumero: filtroJornada || null })
      });
      const data = await res.json();
      
      alert(data.mensaje || "✅ Puntajes calculados correctamente");
      
      // Recargar pronósticos
      cargarPronosticos();
    } catch (error) {
      console.error("Error al calcular puntajes:", error);
      alert("❌ Error al calcular puntajes");
    } finally {
      setCalculando(false);
    }
  };

  const calcularGanadoresJornada = async () => {
    if (!filtroJornada) {
      alert('Por favor selecciona una jornada primero');
      return;
    }

    if (!confirm(`¿Calcular los ganadores de la jornada ${filtroJornada}?\n\nEsto determinará los jugadores con mayor puntaje en esta jornada y se añadirá a las notificaciones.`)) {
      return;
    }

    try {
      setCalculandoGanadores(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const response = await axios.post(
        `${API_URL}/api/sudamericana-ganadores-jornada/${filtroJornada}`,
        {},
        { headers }
      );

      setGanadores(response.data);
      setMostrarGanadores(true);
      
      // Mostrar modal con resultado
      const pdfInfo = response.data.pdfGenerado 
        ? '\n\n📧 PDF enviado por email con:\n• Ganadores destacados con fotos\n• Ranking de la jornada\n• Ranking acumulado\n• Todos los pronósticos y resultados' 
        : '';
      
      setModalType("success");
      setModalMessage(`✅ ${response.data.mensaje}\n\n🔔 Notificación añadida para todos los usuarios\n• Ganadores de la jornada ${filtroJornada}\n• Visible en la página de inicio${pdfInfo}`);
      setShowModal(true);
      
      // Recargar rankings
      cargarRankings();
    } catch (error) {
      console.error('Error calculando ganadores:', error);
      setModalType("error");
      setModalMessage("❌ Error al calcular los ganadores\n\n" + (error.response?.data?.error || error.message || "Error desconocido"));
      setShowModal(true);
    } finally {
      setCalculandoGanadores(false);
    }
  };

  const cargarGanadoresJornada = async (jornadaNumero) => {
    try {
      const response = await axios.get(
        `${API_URL}/api/sudamericana-ganadores-jornada/${jornadaNumero}`
      );

      if (response.data.ganadores && response.data.ganadores.length > 0) {
        setGanadores(response.data);
      } else {
        setGanadores(null);
      }
    } catch (error) {
      console.error('Error cargando ganadores:', error);
      setGanadores(null);
    }
  };

  const calcularGanadoresAcumulado = async () => {
    if (!confirm('¿Calcular el/los CAMPEÓN/CAMPEONES del ranking acumulado (TODAS LAS JORNADAS)?\n\nSe añadirá una notificación para todos los usuarios.')) {
      return;
    }

    try {
      setCalculandoGanadoresAcumulado(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const response = await axios.post(
        `${API_URL}/api/sudamericana-ganadores-jornada/acumulado`,
        {},
        { headers }
      );

      setGanadoresAcumulado(response.data);
      setMostrarGanadoresAcumulado(true);
      
      // Mostrar modal con resultado
      setModalType("success");
      setModalMessage(`✅ ${response.data.mensaje}\n\n🔔 Notificación añadida para todos los usuarios\n• Campeón del ranking acumulado\n• Visible en la página de inicio`);
      setShowModal(true);
      
      // Recargar rankings
      cargarRankings();
    } catch (error) {
      console.error('Error calculando ganadores acumulado:', error);
      setModalType("error");
      setModalMessage('❌ Error al calcular el campeón del ranking acumulado\n\n' + (error.response?.data?.error || error.message || "Error desconocido"));
      setShowModal(true);
    } finally {
      setCalculandoGanadoresAcumulado(false);
    }
  };

  const cargarGanadoresAcumulado = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/api/sudamericana-ganadores-jornada/acumulado`
      );

      if (response.data.ganadores && response.data.ganadores.length > 0) {
        setGanadoresAcumulado(response.data);
      } else {
        setGanadoresAcumulado(null);
      }
    } catch (error) {
      console.error('Error cargando ganadores acumulado:', error);
      setGanadoresAcumulado(null);
    }
  };

  const getResultadoClase = (pronostico) => {
    if (!pronostico || !pronostico.partido || !pronostico.partido.resultado) {
      return 'table-secondary';
    }
    
    const { partido, puntos } = pronostico;
    
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
            usuario_id: p.usuario.id,
            jugador: p.usuario.nombre,
            foto_perfil: p.usuario.foto_perfil,
            jornada: p.jornada.numero,
            pronosticos: []
          };
        }
        grupos[key].pronosticos.push(p);
      });
      
      // Ordenar pronósticos dentro de cada grupo
      Object.values(grupos).forEach(grupo => {
        grupo.pronosticos.sort((a, b) => {
          // Para otras jornadas, ordenar por fecha de partido
          return new Date(a.partido.fecha) - new Date(b.partido.fecha);
        });
        
        // CALCULAR Y GUARDAR EL PUNTAJE TOTAL DEL GRUPO
        grupo.puntaje_total = grupo.pronosticos.reduce((sum, p) => sum + (p.puntos || 0), 0);
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
        <h1 className="display-5 fw-bold">📋 Clasificación - Pronósticos Sudamericana</h1>
        <p className="text-muted">Visualiza todos los pronósticos entregados por los jugadores</p>
      </div>

      {/* Botonera Principal */}
      <NavegacionSudamericana />

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
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Botones de acciones */}
          <div className="text-center mt-3">
            <button 
              className="btn btn-outline-secondary"
              onClick={limpiarFiltros}
            >
              🔄 Limpiar Filtros
            </button>
            
            {/* Botón Calcular Ganadores - Solo admin con jornada seleccionada */}
            {esAdmin && (
              <>
                {/* Botón Calcular Ganadores Jornada - Solo si hay jornada seleccionada */}
                {filtroJornada && (
                  <button
                    className="btn btn-success ms-2"
                    onClick={calcularGanadoresJornada}
                    disabled={calculandoGanadores}
                  >
                    {calculandoGanadores ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Calculando...
                      </>
                    ) : (
                      <>🏆 Calcular Ganadores Jornada</>
                    )}
                  </button>
                )}
                
                {/* Botón Ganador Ranking Acumulado - Siempre disponible */}
                <button
                  className="btn btn-warning text-dark fw-bold ms-2"
                  onClick={calcularGanadoresAcumulado}
                  disabled={calculandoGanadoresAcumulado}
                >
                  {calculandoGanadoresAcumulado ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Calculando...
                    </>
                  ) : (
                    <>👑 Ganador Ranking Acumulado</>
                  )}
                </button>
              </>
            )}
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
          <div className="spinner-border text-success" role="status">
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
              <thead className="table-success">
                <tr>
                  <th className="text-center" style={{ width: '150px' }}>Jugador</th>
                  <th className="text-center" style={{ width: '100px' }}>Jornada</th>
                  <th className="text-center" style={{ width: '80px' }}>Grupo</th>
                  <th className="text-center">Partido</th>
                  <th className="text-center" style={{ width: '100px' }}>Pronóstico</th>
                  <th className="text-center" style={{ width: '100px' }}>Resultado</th>
                  <th className="text-center" style={{ width: '60px' }}>Bonus</th>
                  <th className="text-center" style={{ width: '80px' }}>Puntos</th>
                </tr>
              </thead>
              <tbody>
                {agruparPronosticos().map((grupo, grupoIndex) => (
                  <React.Fragment key={`grupo-${grupo.usuario_id}-${grupoIndex}`}>
                    {/* Encabezado para cada grupo de usuario */}
                    {grupoIndex > 0 && (
                      <tr className="table-success">
                        <th className="text-center" style={{ width: '150px' }}>Jugador</th>
                        <th className="text-center" style={{ width: '100px' }}>Jornada</th>
                        <th className="text-center" style={{ width: '80px' }}>Grupo</th>
                        <th className="text-center">Partido</th>
                        <th className="text-center" style={{ width: '100px' }}>Pronóstico</th>
                        <th className="text-center" style={{ width: '100px' }}>Resultado</th>
                        <th className="text-center" style={{ width: '60px' }}>Bonus</th>
                        <th className="text-center" style={{ width: '80px' }}>Puntos</th>
                      </tr>
                    )}
                    {grupo.pronosticos.map((pronostico, index) => (
                      <tr key={pronostico.id} className={getResultadoClase(pronostico)}>
                        <td className="fw-bold">
                          <div className="d-flex align-items-center gap-2">
                            <img
                              src={grupo.foto_perfil || '/perfil/default.png'}
                              alt={pronostico.usuario?.nombre || 'Usuario'}
                              className="rounded-circle"
                              style={{ width: '40px', height: '40px', objectFit: 'cover' }}
                              onError={(e) => {
                                e.target.src = '/perfil/default.png';
                              }}
                            />
                            <span>{pronostico.usuario?.nombre || '-'}</span>
                          </div>
                        </td>
                        <td className="text-center">
                          <span className="badge bg-success">
                            Jornada {pronostico.jornada?.numero || '-'}
                          </span>
                        </td>
                        <td className="text-center">
                          {pronostico.partido?.grupo ? (
                            <span className="badge bg-info">Grupo {pronostico.partido.grupo}</span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td>
                          <div className="d-flex flex-column align-items-center">
                            <div className="d-flex justify-content-center align-items-center gap-2 w-100">
                              <div className="d-flex align-items-center justify-content-end gap-2" style={{flex: 1}}>
                                <small className="fw-bold text-end">
                                  {formatearNombreEquipo(pronostico.partido?.local?.nombre, pronostico.partido?.local?.pais)}
                                </small>
                                {pronostico.partido?.local?.nombre && getLogoEquipo(pronostico.partido.local.nombre) && (
                                  <img 
                                    src={getLogoEquipo(pronostico.partido.local.nombre)} 
                                    alt={pronostico.partido.local.nombre}
                                    style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                                    onError={(e) => e.target.style.display = 'none'}
                                  />
                                )}
                              </div>
                              <span className="text-muted">vs</span>
                              <div className="d-flex align-items-center justify-content-start gap-2" style={{flex: 1}}>
                                {pronostico.partido?.visita?.nombre && getLogoEquipo(pronostico.partido.visita.nombre) && (
                                  <img 
                                    src={getLogoEquipo(pronostico.partido.visita.nombre)} 
                                    alt={pronostico.partido.visita.nombre}
                                    style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                                    onError={(e) => e.target.style.display = 'none'}
                                  />
                                )}
                                <small className="fw-bold text-start">
                                  {formatearNombreEquipo(pronostico.partido?.visita?.nombre, pronostico.partido?.visita?.pais)}
                                </small>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="text-center fw-bold fs-5">
                          {pronostico.pronostico?.local !== undefined && pronostico.pronostico?.visita !== undefined ? (
                            <>{pronostico.pronostico.local} - {pronostico.pronostico.visita}</>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td className="text-center fw-bold fs-5">
                          {pronostico.partido?.resultado?.local !== null && pronostico.partido?.resultado?.visita !== null ? (
                            <>
                              {pronostico.partido.resultado.local} - {pronostico.partido.resultado.visita}
                            </>
                          ) : (
                            <span className="text-muted">Pendiente</span>
                          )}
                        </td>
                        <td className="text-center fw-bold">
                          <span className={pronostico.partido?.bonus && pronostico.partido.bonus > 1 ? "badge bg-info text-white" : "text-muted"}>
                            x{pronostico.partido?.bonus || 1}
                          </span>
                        </td>
                        <td className="text-center fw-bold">
                          {pronostico.puntos !== null && pronostico.puntos !== undefined ? (
                            <span className="badge bg-warning text-dark fs-6">
                              {pronostico.puntos} pts
                            </span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    
                    {/* FILA TOTAL */}
                    <tr className="table-dark fw-bold">
                      <td colSpan="7" className="text-end">TOTAL {grupo.jugador} - Jornada {grupo.jornada}:</td>
                      <td className="text-center">
                        <span className="badge bg-dark fs-5">
                          {grupo.puntaje_total || 0} pts
                        </span>
                      </td>
                    </tr>
                    {/* Separador entre grupos */}
                    {grupoIndex < agruparPronosticos().length - 1 && (
                      <tr style={{ height: '30px', backgroundColor: '#e9ecef' }}>
                        <td colSpan="8" className="p-0 text-center align-middle">
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
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Rankings - SIEMPRE MOSTRAR si hay jornada seleccionada */}
      {filtroJornada && (
        <div className="mt-5">
          <hr className="my-5" />
          
          {/* Ranking de Jornada */}
          <div id="ranking-jornada" className="card shadow-sm mb-4">
            <div className="card-header bg-success text-white">
              <h4 className="mb-0">🏆 Ranking Jornada {mostrarActual ? jornadaActual : filtroJornada}</h4>
            </div>
            <div className="card-body">
              {rankingJornada.length > 0 ? (
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
            ) : (
              <div className="alert alert-info text-center">
                No hay datos de ranking para esta jornada aún
              </div>
            )}
            </div>
          </div>

          {/* Ranking Acumulado */}
          <div id="ranking-acumulado" className="card shadow-sm mb-4">
            <div className="card-header bg-info text-white">
              <h4 className="mb-0">📊 Ranking Acumulado {mostrarActual ? `(Hasta Jornada ${jornadaActual})` : `(Hasta Jornada ${filtroJornada})`}</h4>
            </div>
            <div className="card-body">
              {rankingAcumulado.length > 0 ? (
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
            ) : (
              <div className="alert alert-info text-center">
                No hay datos de ranking acumulado aún
              </div>
            )}
            </div>
          </div>

          {/* Botones de navegación de jornadas */}
          <div className="text-center mb-3 d-flex gap-2 justify-content-center align-items-center">
            <button 
              className="btn btn-outline-secondary"
              onClick={() => {
                const jornadaActualNum = parseInt(filtroJornada);
                const jornadaAnterior = jornadas.find(j => j.numero === jornadaActualNum - 1);
                if (jornadaAnterior) setFiltroJornada(jornadaAnterior.numero.toString());
              }}
              disabled={!filtroJornada || parseInt(filtroJornada) === jornadas[0]?.numero}
            >
              ← Anterior
            </button>
            <span className="mx-2 fw-bold">
              {filtroJornada ? `Jornada ${filtroJornada}` : 'Todas las jornadas'}
            </span>
            <button 
              className="btn btn-outline-secondary"
              onClick={() => {
                const jornadaActualNum = parseInt(filtroJornada);
                const jornadaSiguiente = jornadas.find(j => j.numero === jornadaActualNum + 1);
                if (jornadaSiguiente) setFiltroJornada(jornadaSiguiente.numero.toString());
              }}
              disabled={!filtroJornada || parseInt(filtroJornada) === jornadas[jornadas.length - 1]?.numero}
            >
              Siguiente →
            </button>
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
              className={`btn ${!mostrarActual ? 'btn-info' : 'btn-outline-info'} btn-lg px-4`}
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
          onClick={() => navigate('/sudamericana')}
        >
          ← Volver a Sudamericana
        </button>
      </div>

      {/* Modal de Ganadores con Confeti */}
      {mostrarGanadores && ganadores && (
        <>
          <FireworksEffect />
          <div 
            className="modal show d-block" 
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => setMostrarGanadores(false)}
          >
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header bg-warning text-dark">
                  <h5 className="modal-title">
                    🏆 {ganadores.ganadores.length === 1 ? 'Ganador' : 'Ganadores'} de la Jornada {ganadores.jornadaNumero} - Copa Sudamericana
                  </h5>
                  <button 
                    type="button" 
                    className="btn-close" 
                    onClick={() => setMostrarGanadores(false)}
                  ></button>
                </div>
                <div className="modal-body text-center py-4">
                  <div className="mb-4">
                    <h2 className="text-warning">🎉 ¡Felicitaciones! 🎉</h2>
                  </div>
                  {ganadores.ganadores.map((ganador, index) => (
                    <div key={index} className="alert alert-success mb-3 d-flex flex-column align-items-center">
                      {ganador.foto_perfil && (
                        <img
                          src={ganador.foto_perfil.startsWith('/') ? ganador.foto_perfil : `/perfil/${ganador.foto_perfil}`}
                          alt={ganador.nombre}
                          style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '3px solid #28a745',
                            marginBottom: '15px'
                          }}
                        />
                      )}
                      <h4 className="mb-0">
                        🏆 {ganador.nombre}
                      </h4>
                      <p className="mb-0 fs-5 fw-bold text-success">
                        {ganador.puntaje} puntos
                      </p>
                    </div>
                  ))}
                  <p className="text-muted mt-3">
                    {ganadores.mensaje}
                  </p>
                </div>
                <div className="modal-footer">
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    onClick={() => setMostrarGanadores(false)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de Ganadores Acumulado con Confeti Intenso */}
      {mostrarGanadoresAcumulado && ganadoresAcumulado && (
        <>
          <FireworksEffect />
          <FireworksEffect />
          <FireworksEffect />
          <div 
            className="modal show d-block" 
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000 }}
            onClick={() => setMostrarGanadoresAcumulado(false)}
          >
            <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content border-5 border-warning">
                <div className="modal-header bg-gradient" style={{ background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)' }}>
                  <h3 className="modal-title text-dark fw-bold w-100 text-center">
                    👑 {ganadoresAcumulado.ganadores.length === 1 ? 'CAMPEÓN' : 'CAMPEONES'} COPA SUDAMERICANA 👑
                  </h3>
                  <button 
                    type="button" 
                    className="btn-close" 
                    onClick={() => setMostrarGanadoresAcumulado(false)}
                  ></button>
                </div>
                <div className="modal-body text-center py-5" style={{ background: 'linear-gradient(to bottom, #fff 0%, #fffaf0 100%)' }}>
                  <div className="mb-5">
                    <h1 className="display-3 mb-3">🎊 🎉 🎊</h1>
                    <h2 className="text-warning fw-bold" style={{ fontSize: '2.5rem', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}>
                      ¡FELICITACIONES!
                    </h2>
                  </div>
                  {ganadoresAcumulado.ganadores.map((ganador, index) => (
                    <div key={index} className="alert alert-warning mb-4 border-3 border-warning shadow-lg" style={{ backgroundColor: '#FFF8DC' }}>
                      <h1 className="mb-3" style={{ fontSize: '3rem' }}>👑</h1>
                      {ganador.foto_perfil && (
                        <img
                          src={ganador.foto_perfil}
                          alt={ganador.nombre}
                          className="rounded-circle mb-3"
                          style={{ width: '120px', height: '120px', objectFit: 'cover', border: '4px solid #FFD700' }}
                          onError={(e) => { e.target.src = '/perfil/default.png'; }}
                        />
                      )}
                      <h2 className="mb-2 fw-bold text-dark" style={{ fontSize: '2rem' }}>
                        {ganador.nombre.toUpperCase()}
                      </h2>
                      <p className="mb-0 fw-bold text-warning" style={{ fontSize: '1.8rem' }}>
                        {ganador.puntaje} PUNTOS
                      </p>
                    </div>
                  ))}
                  <p className="text-muted mt-4 fs-5">
                    {ganadoresAcumulado.mensaje}
                  </p>
                </div>
                <div className="modal-footer justify-content-center">
                  <button 
                    type="button" 
                    className="btn btn-warning btn-lg fw-bold px-5" 
                    onClick={() => setMostrarGanadoresAcumulado(false)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de confirmación para cálculo de ganadores */}
      {showModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content border-3 shadow-lg">
              <div className={`modal-header ${
                modalType === 'success' ? 'bg-success text-white' : 
                modalType === 'warning' ? 'bg-warning text-dark' : 
                'bg-danger text-white'
              }`}>
                <h5 className="modal-title fw-bold">
                  {modalType === 'success' ? '✅ Éxito' : modalType === 'warning' ? '⚠️ Advertencia' : '❌ Error'}
                </h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => setShowModal(false)}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body">
                <div style={{ whiteSpace: 'pre-line' }}>
                  {modalMessage}
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className={`btn ${
                    modalType === 'success' ? 'btn-success' : 
                    modalType === 'warning' ? 'btn-warning' : 
                    'btn-danger'
                  }`}
                  onClick={() => setShowModal(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
