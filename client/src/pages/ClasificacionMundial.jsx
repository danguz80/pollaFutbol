import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getMundialLogoPorNombre } from '../utils/mundialLogos';
import NavegacionMundial from '../components/NavegacionMundial';
import FireworksEffect from '../components/FireworksEffect';

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
  
  // Rankings
  const [rankingJornada, setRankingJornada] = useState([]);
  const [rankingAcumulado, setRankingAcumulado] = useState([]);
  
  // Ganadores y modal
  const [ganadores, setGanadores] = useState(null);
  const [mostrarGanadores, setMostrarGanadores] = useState(false);
  const [calculandoGanadores, setCalculandoGanadores] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [modalType, setModalType] = useState("success");
  
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
    cargarRankings();
    if (filtroJornada) {
      cargarGanadoresJornada(filtroJornada);
    }
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

  const cargarRankings = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Cargar ranking de la jornada seleccionada
      if (filtroJornada) {
        const rankingJornadaRes = await axios.get(
          `${API_URL}/api/mundial-rankings/jornada/${filtroJornada}`,
          { headers }
        );
        // La respuesta es un array directamente con puntos_jornada
        setRankingJornada(rankingJornadaRes.data || []);
      }
      
      // Cargar ranking acumulado
      const rankingAcumuladoRes = await axios.get(
        `${API_URL}/api/mundial-rankings/actual`,
        { headers }
      );
      // La respuesta es { jornada: X, ranking: [...] } con puntos_acumulados
      setRankingAcumulado(rankingAcumuladoRes.data.ranking || []);
    } catch (error) {
      console.error('Error cargando rankings:', error);
    }
  };

  // Cargar ganadores de la jornada
  const cargarGanadoresJornada = async (jornadaNumero) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/mundial-ganadores-jornada/${jornadaNumero}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.ganadores && Array.isArray(response.data.ganadores) && response.data.ganadores.length > 0) {
        // Agregar puntaje a cada ganador para consistencia con calcular
        const ganadoresConPuntaje = response.data.ganadores.map(g => ({
          ...g,
          puntaje: g.puntos // El backend devuelve "puntos", pero el modal espera "puntaje"
        }));
        setGanadores({
          ...response.data,
          ganadores: ganadoresConPuntaje,
          mensaje: `Ganadores de la Jornada ${jornadaNumero} - Mundial 2026`
        });
      } else {
        setGanadores(null);
      }
    } catch (error) {
      console.error('Error cargando ganadores:', error);
      setGanadores(null);
    }
  };

  // Calcular ganadores de la jornada
  const calcularGanadoresJornada = async () => {
    if (!filtroJornada) {
      alert('Por favor selecciona una jornada primero');
      return;
    }

    if (!confirm(`¿Calcular los ganadores de la jornada ${filtroJornada} del Mundial y generar PDF con resultados?\n\nEl PDF incluirá: pronósticos, resultados reales, puntos, rankings y ganadores. Se enviará automáticamente por email.`)) {
      return;
    }

    try {
      setCalculandoGanadores(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const response = await axios.post(
        `${API_URL}/api/mundial-ganadores-jornada/${filtroJornada}`,
        {},
        { headers }
      );

      // Formatear ganadores para el modal
      if (response.data.ganadores && Array.isArray(response.data.ganadores)) {
        const ganadoresFormateados = response.data.ganadores.map(g => ({
          ...g,
          puntaje: g.puntaje || g.puntos
        }));
        setGanadores({
          ...response.data,
          ganadores: ganadoresFormateados
        });
        setMostrarGanadores(true);
      }
      
      // Recargar rankings
      await cargarRankings();
      
      // Mostrar mensaje con información del PDF en modal
      if (response.data.pdfGenerado) {
        setModalType("success");
        setModalMessage(
          `✅ ${response.data.mensaje}\n\n` +
          `📧 PDF enviado por email con:\n` +
          `• Ganadores de la jornada\n` +
          `• Ranking de la jornada\n` +
          `• Ranking acumulado\n` +
          `• Pronósticos y resultados\n` +
          `• Puntos por usuario`
        );
      } else {
        setModalType("warning");
        setModalMessage(
          `✅ ${response.data.mensaje}` +
          (response.data.pdfError ? `\n\n⚠️ Error en PDF: ${response.data.pdfError}` : '')
        );
      }
      setShowModal(true);
      
    } catch (error) {
      console.error('Error calculando ganadores:', error);
      setModalType("error");
      setModalMessage('❌ Error al calcular los ganadores\n\n' + (error.response?.data?.error || error.message));
      setShowModal(true);
    } finally {
      setCalculandoGanadores(false);
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

  // Estilos de ranking
  const getJornadaCellStyle = (i) => {
    if (i === 0) return { background: "#ab402e", color: "white", fontWeight: "bold", fontSize: "1.25em", textAlign: "center" };
    if (i === 1) return { background: "#33b849", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    if (i === 2) return { background: "#569600", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    return { textAlign: "center" };
  };

  const getAcumuladoCellStyle = (i) => {
    if (i === 0) return { background: "#ffbe56", color: "white", fontWeight: "bold", fontSize: "1.25em", textAlign: "center" };
    if (i === 1) return { background: "#396366", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    if (i === 2) return { background: "#44777b", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    return { textAlign: "center" };
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
    <div className="container mt-4 mb-5" id="top">
      <div className="text-center mb-4">
        <h1 className="display-5 fw-bold">📋 Clasificación Mundial 2026</h1>
        <p className="lead text-muted">Rankings y pronósticos del Mundial</p>
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

      {/* Botones de navegación rápida */}
      <div className="card mb-4 shadow-sm">
        <div className="card-body">
          <h5 className="card-title text-center mb-3">🔗 Accesos Directos</h5>
          <div className="d-flex flex-wrap justify-content-center gap-2">
            <a href="#detalle-pronosticos" className="btn btn-outline-primary">
              📋 Detalle de Pronósticos
            </a>
            <a href="#ranking-jornada" className="btn btn-outline-success">
              🏆 Ranking Jornada
            </a>
            <a href="#ranking-acumulado" className="btn btn-outline-info">
              📊 Ranking Acumulado
            </a>
          </div>
        </div>
      </div>

      {/* Mostrar ganadores guardados si existen (sin modal) */}
      {ganadores && Array.isArray(ganadores.ganadores) && ganadores.ganadores.length > 0 && !mostrarGanadores && (
        <div className="alert alert-info text-center mb-4 shadow-sm">
          <h5 className="mb-3">
            🏆 {ganadores.ganadores.length === 1 ? 'Ganador' : 'Ganadores'} de la Jornada {filtroJornada}
          </h5>
          <div className="d-flex justify-content-center gap-3 flex-wrap">
            {ganadores.ganadores.map((ganador, index) => (
              <div key={index} className="text-center">
                {ganador.foto_perfil && (
                  <img
                    src={ganador.foto_perfil}
                    alt={ganador.nombre}
                    className="rounded-circle mb-2"
                    style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                    onError={(e) => { e.target.src = '/perfil/default.png'; }}
                  />
                )}
                <p className="mb-0 fw-bold">{ganador.nombre}</p>
                <span className="badge bg-warning text-dark">{ganador.puntaje} puntos</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div id="detalle-pronosticos" className="text-center mb-3 mt-5">
        <h3 className="fw-bold">📋 Detalle de Pronósticos</h3>
        <p className="text-muted">Filtra y consulta los pronósticos de cada partido</p>
      </div>
      
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
              
              {/* Botón volver arriba después de cada tabla */}
              <div className="text-center mt-3">
                <a href="#top" className="btn btn-outline-secondary btn-sm">
                  ⬆️ Volver arriba
                </a>
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="alert alert-warning text-center">
          <strong>⚠️ Sin datos:</strong> No hay pronósticos con los filtros seleccionados.
        </div>
      )}

      {/* Rankings al final */}
      <div className="mt-5">
        {/* Botón Calcular Ganadores (solo para admin) */}
        {esAdmin && filtroJornada && (
          <div className="text-center mb-4">
            <button
              className="btn btn-warning btn-lg"
              onClick={calcularGanadoresJornada}
              disabled={calculandoGanadores}
            >
              {calculandoGanadores ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Calculando...
                </>
              ) : (
                <>🏆 Calcular Ganadores Jornada {filtroJornada}</>
              )}
            </button>
          </div>
        )}

        {/* Ranking por Jornada */}
        <div id="ranking-jornada" className="mb-5">
          <h4 className="text-center mb-3">🏆 Ranking Jornada {filtroJornada || '1'}</h4>
          <div className="table-responsive">
            <table className="table table-bordered text-center">
              <thead>
                <tr>
                  <th style={{ background: "#305496", color: "white", textAlign: "center" }}>Posición</th>
                  <th style={{ background: "#305496", color: "white", textAlign: "center" }}>Jugador</th>
                  <th style={{ background: "#305496", color: "white", textAlign: "center" }}>Puntaje</th>
                </tr>
              </thead>
              <tbody>
                {rankingJornada && rankingJornada.length > 0 ? (
                  rankingJornada.map((p, i) => (
                    <tr key={i} className="text-center">
                      <td style={getJornadaCellStyle(i)}>{i + 1}</td>
                      <td style={getJornadaCellStyle(i)}>
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {p.foto_perfil && (
                            <img
                              src={p.foto_perfil.startsWith('/') ? p.foto_perfil : `/perfil/${p.foto_perfil}`}
                              alt={`Foto de ${p.nombre}`}
                              style={{
                                width: '60px',
                                height: '60px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                marginRight: '10px',
                                border: '2px solid #ddd',
                                objectPosition: 'center 30%'
                              }}
                              onError={(e) => { e.target.src = '/perfil/default.png'; }}
                            />
                          )}
                          {p.nombre}
                        </span>
                      </td>
                      <td style={getJornadaCellStyle(i)}>{p.puntos_jornada || 0}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="text-center text-muted py-3">
                      No hay datos de ranking para esta jornada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="text-center mt-3">
            <a href="#top" className="btn btn-outline-primary">
              ⬆️ Volver arriba
            </a>
          </div>
        </div>

        {/* Ranking Acumulado */}
        <div id="ranking-acumulado" className="mb-4">
          <h4 className="text-center mb-3">📊 Ranking Acumulado</h4>
          <div className="table-responsive">
            <table className="table table-bordered text-center">
              <thead>
                <tr>
                  <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Posición</th>
                  <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Jugador</th>
                  <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Puntaje Total</th>
                </tr>
              </thead>
              <tbody>
                {rankingAcumulado && rankingAcumulado.length > 0 ? (
                  rankingAcumulado.map((p, i) => (
                    <tr key={i} className="text-center">
                      <td style={getAcumuladoCellStyle(i)}>{i + 1}</td>
                      <td style={getAcumuladoCellStyle(i)}>
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {p.foto_perfil && (
                            <img
                              src={p.foto_perfil.startsWith('/') ? p.foto_perfil : `/perfil/${p.foto_perfil}`}
                              alt={`Foto de ${p.nombre}`}
                              style={{
                                width: '60px',
                                height: '60px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                marginRight: '10px',
                                border: '2px solid #ddd',
                                objectPosition: 'center 30%'
                              }}
                              onError={(e) => { e.target.src = '/perfil/default.png'; }}
                            />
                          )}
                          {p.nombre}
                        </span>
                      </td>
                      <td style={getAcumuladoCellStyle(i)}>{p.puntos_acumulados || 0}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="text-center text-muted py-3">
                      No hay datos de ranking acumulado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="text-center mt-3">
            <a href="#top" className="btn btn-outline-info">
              ⬆️ Volver arriba
            </a>
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
      </div>

      {/* Mostrar Ganadores de la Jornada */}
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
                    🏆 {ganadores.ganadores && Array.isArray(ganadores.ganadores) && ganadores.ganadores.length === 1 ? 'Ganador' : 'Ganadores'} de la Jornada {filtroJornada}
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
                    <div key={index} className="alert alert-success mb-3">
                      {ganador.foto_perfil && (
                        <img
                          src={ganador.foto_perfil}
                          alt={ganador.nombre}
                          className="rounded-circle mb-2"
                          style={{ width: '80px', height: '80px', objectFit: 'cover' }}
                          onError={(e) => { e.target.src = '/perfil/default.png'; }}
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

      {/* Modal de Confirmación */}
      {showModal && (
        <div 
          className="modal fade show" 
          style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowModal(false)}
        >
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className={`modal-header ${
                modalType === 'success' ? 'bg-success text-white' :
                modalType === 'warning' ? 'bg-warning text-dark' :
                'bg-danger text-white'
              }`}>
                <h5 className="modal-title">
                  {modalType === 'success' ? '✅ Operación Exitosa' :
                   modalType === 'warning' ? '⚠️ Advertencia' :
                   '❌ Error'}
                </h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => setShowModal(false)}
                  style={{ filter: modalType === 'warning' ? 'none' : 'invert(1)' }}
                ></button>
              </div>
              <div className="modal-body">
                <div style={{ whiteSpace: 'pre-line', fontSize: '16px' }}>
                  {modalMessage}
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className={`btn btn-lg ${
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
