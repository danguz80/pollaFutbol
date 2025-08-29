import { useEffect, useState } from "react";
import FireworksEffect from "../components/FireworksEffect";
import AccesosDirectos from "../components/AccesosDirectos";
import CuentaRegresivaGlobal from "../components/CuentaRegresivaGlobal";

// Accede a la variable de entorno
const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function Clasificacion() {
  const [jornadas, setJornadas] = useState([]);
  const [jornadaActual, setJornadaActual] = useState("");
  const [selectedMatch, setSelectedMatch] = useState(""); // Nuevo estado para filtro por partido
  const [selectedUser, setSelectedUser] = useState(""); // Nuevo estado para filtro por usuario
  const [detallePuntos, setDetallePuntos] = useState([]);
  const [rankingJornada, setRankingJornada] = useState([]);
  const [rankingAcumulado, setRankingAcumulado] = useState([]);
  const [jornadaCerrada, setJornadaCerrada] = useState(false);
  const [ganadoresJornada, setGanadoresJornada] = useState([]);
  const [showFireworks, setShowFireworks] = useState(false);
  
  // Estados para Cuadro Final
  const [prediccionesReales, setPrediccionesReales] = useState({});
  const [prediccionesUsuarios, setPrediccionesUsuarios] = useState([]);
  const [cuadroFinalCerrado, setCuadroFinalCerrado] = useState(false);

  // Cargar jornadas y definir por defecto la última
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas`)
      .then(res => res.json())
      .then(jornadas => {
        setJornadas(jornadas);
        if (jornadas.length && !jornadaActual) {
          setJornadaActual(jornadas[jornadas.length - 1].numero);
        }
      });
  }, []);

  // Actualizar si la jornada está cerrada cuando cambia la jornada actual o la lista de jornadas
  useEffect(() => {
    if (!jornadaActual || !jornadas.length) {
      setJornadaCerrada(false);
      return;
    }
    const jornadaSel = jornadas.find(j => String(j.numero) === String(jornadaActual));
    setJornadaCerrada(jornadaSel?.cerrada === true);
  }, [jornadaActual, jornadas]);

  // Cargar datos según jornada solo si está cerrada
  useEffect(() => {
    if (!jornadaActual || !jornadaCerrada) return;
    fetch(`${API_BASE_URL}/api/pronosticos/jornada/${jornadaActual}`)
      .then(res => res.json())
      .then(setDetallePuntos);

    fetch(`${API_BASE_URL}/api/pronosticos/ranking/jornada/${jornadaActual}`)
      .then(res => res.json())
      .then(setRankingJornada);

    fetch(`${API_BASE_URL}/api/pronosticos/ranking/general`)
      .then(res => res.json())
      .then(setRankingAcumulado);
  }, [jornadaActual, jornadaCerrada]);

  // Obtener ganadores de la jornada seleccionada si está cerrada y hay puntajes
  useEffect(() => {
    if (!jornadaActual || !jornadaCerrada) {
      setGanadoresJornada([]);
      setShowFireworks(false);
      return;
    }
    // Buscar la jornada seleccionada en el array de jornadas
    const jornadaSel = jornadas.find(j => String(j.numero) === String(jornadaActual));
    if (jornadaSel && Array.isArray(jornadaSel.ganadores) && jornadaSel.ganadores.length > 0) {
      setGanadoresJornada(jornadaSel.ganadores);
      setShowFireworks(true);
    } else {
      setGanadoresJornada([]);
      setShowFireworks(false);
    }
  }, [jornadaActual, jornadaCerrada, jornadas]);

  // Verificar estado del Cuadro Final
  useEffect(() => {
    if (jornadaActual === "999") {
      // Verificar si hay una jornada especial "999" en el array
      const cuadroFinalJornada = jornadas.find(j => j.numero === 999);
      setCuadroFinalCerrado(cuadroFinalJornada?.cerrada === true);
      
      // Cargar datos del Cuadro Final si está cerrado
      if (cuadroFinalJornada?.cerrada === true) {
        cargarDatosCuadroFinal();
      }
    }
  }, [jornadaActual, jornadas]);

  // Función para cargar datos del Cuadro Final
  const cargarDatosCuadroFinal = async () => {
    try {
      // Cargar predicciones reales del admin
      const resReales = await fetch(`${API_BASE_URL}/api/prediccion-final-admin`);
      if (resReales.ok) {
        const datosReales = await resReales.json();
        if (datosReales) {
          setPrediccionesReales(datosReales);
        }
      }

      // Cargar todas las predicciones de usuarios
      const resUsuarios = await fetch(`${API_BASE_URL}/api/predicciones-finales`);
      if (resUsuarios.ok) {
        const datosUsuarios = await resUsuarios.json();
        setPrediccionesUsuarios(datosUsuarios);
      }
    } catch (error) {
      console.error("Error cargando datos cuadro final:", error);
    }
  };

  // Función para calcular aciertos (igual que en AdminPanel)
  const calcularAciertos = (prediccionUsuario) => {
    const aciertos = {};
    let puntosTotales = 0;

    if (prediccionUsuario.campeon === prediccionesReales.campeon && prediccionesReales.campeon) {
      aciertos.campeon = 15;
      puntosTotales += 15;
    }
    if (prediccionUsuario.subcampeon === prediccionesReales.subcampeon && prediccionesReales.subcampeon) {
      aciertos.subcampeon = 10;
      puntosTotales += 10;
    }
    if (prediccionUsuario.tercero === prediccionesReales.tercero && prediccionesReales.tercero) {
      aciertos.tercero = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.chile_4_lib === prediccionesReales.chile_4_lib && prediccionesReales.chile_4_lib) {
      aciertos.chile_4_lib = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.cuarto === prediccionesReales.cuarto && prediccionesReales.cuarto) {
      aciertos.cuarto = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.quinto === prediccionesReales.quinto && prediccionesReales.quinto) {
      aciertos.quinto = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.sexto === prediccionesReales.sexto && prediccionesReales.sexto) {
      aciertos.sexto = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.septimo === prediccionesReales.septimo && prediccionesReales.septimo) {
      aciertos.septimo = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.quinceto === prediccionesReales.quinceto && prediccionesReales.quinceto) {
      aciertos.quinceto = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.dieciseisavo === prediccionesReales.dieciseisavo && prediccionesReales.dieciseisavo) {
      aciertos.dieciseisavo = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.goleador === prediccionesReales.goleador && prediccionesReales.goleador) {
      aciertos.goleador = 6;
      puntosTotales += 6;
    }

    return { aciertos, puntosTotales };
  };

  // Función para obtener lista única de partidos de la jornada seleccionada
  const getMatchesForJornada = () => {
    if (!detallePuntos || detallePuntos.length === 0) return [];
    
    const matchesSet = new Set();
    detallePuntos.forEach(p => {
      const matchKey = `${p.nombre_local} vs ${p.nombre_visita}`;
      matchesSet.add(matchKey);
    });
    
    return Array.from(matchesSet).sort();
  };

  // Función para obtener lista única de usuarios de la jornada seleccionada
  const getUsersForJornada = () => {
    if (!detallePuntos || detallePuntos.length === 0) return [];
    
    const usersSet = new Set();
    detallePuntos.forEach(p => {
      usersSet.add(p.usuario);
    });
    
    return Array.from(usersSet).sort();
  };

  const availableMatches = getMatchesForJornada();
  const availableUsers = getUsersForJornada();

  // Estilos de ranking
  function getJornadaCellStyle(i) {
    if (i === 0) return { background: "#ab402e", color: "white", fontWeight: "bold", fontSize: "1.25em", textAlign: "center" };
    if (i === 1) return { background: "#33b849", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    if (i === 2) return { background: "#569600", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    return { textAlign: "center" };
  }
  function getAcumuladoCellStyle(i) {
    if (i === 0) return { background: "#ffbe56", color: "white", fontWeight: "bold", fontSize: "1.25em", textAlign: "center" };
    if (i === 1) return { background: "#396366", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    if (i === 2) return { background: "#44777b", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    return { textAlign: "center" };
  }

  // -------------------- TABLA DETALLE UNIFICADO ---------------------
  function filasDetalleUnificado(array) {
    // Aplicar filtros
    let arrayFiltrado = array;
    
    // Filtro por partido específico
    if (selectedMatch) {
      arrayFiltrado = arrayFiltrado.filter(p => {
        const matchKey = `${p.nombre_local} vs ${p.nombre_visita}`;
        return matchKey === selectedMatch;
      });
    }
    
    // Filtro por usuario específico
    if (selectedUser) {
      arrayFiltrado = arrayFiltrado.filter(p => p.usuario === selectedUser);
    }

    // Agrupar por jugador
    const agrupados = {};
    arrayFiltrado.forEach(p => {
      if (!agrupados[p.usuario]) agrupados[p.usuario] = [];
      agrupados[p.usuario].push(p);
    });
    
    // Si no hay datos después del filtro
    if (Object.keys(agrupados).length === 0) {
      return [
        <tr key="no-data">
          <td colSpan={6} className="text-center text-muted">
            {selectedMatch 
              ? `No hay pronósticos para el partido: ${selectedMatch}` 
              : selectedUser
              ? `No hay pronósticos para el usuario: ${selectedUser}`
              : "No hay datos disponibles"}
          </td>
        </tr>
      ];
    }
    
    // Ordenar jugadores alfabéticamente
    const jugadores = Object.keys(agrupados).sort();
    const filas = [];
    jugadores.forEach((usuario, userIdx) => {
      const bloque = agrupados[usuario];
      let total = 0;
      bloque.forEach((p, idx) => {
        total += p.puntos || 0;
        filas.push(
          <tr key={`${usuario}-${idx}`} className="text-center">
            <td>{usuario}</td>
            <td>{p.nombre_local} vs {p.nombre_visita}</td>
            <td>
              {(p.real_local !== null && p.real_visita !== null && p.real_local !== undefined && p.real_visita !== undefined)
                ? `${p.real_local} - ${p.real_visita}`
                : "Pendiente"}
            </td>
            <td>
              {(p.goles_local !== null && p.goles_visita !== null && p.goles_local !== undefined && p.goles_visita !== undefined)
                ? `${p.goles_local} - ${p.goles_visita}`
                : "-"}
            </td>
            <td>{p.bonus ? `x${p.bonus}` : "x1"}</td>
            <td>{p.puntos ?? 0}</td>
          </tr>
        );
      });
      // Total por jugador
      filas.push(
        <tr key={`total-${usuario}`} className="text-center" style={{ fontWeight: "bold", background: "#fff6d6" }}>
          <td colSpan={5} className="text-end">
            Total {usuario} {(selectedMatch || selectedUser) ? '(filtrado)' : ''}:
          </td>
          <td>{total}</td>
        </tr>
      );
      // Fila negra divisoria entre jugadores
      if (userIdx < jugadores.length - 1) {
        filas.push(
          <tr key={`sep-${usuario}`}>
            <td colSpan={6} style={{ background: "#222", color: "white", height: 8, padding: 0 }}></td>
          </tr>
        );
      }
    });
    return filas;
  }

  return (
    <div id="top" className="container mt-4">
      <h2 className="text-center">🎖️ Clasificación</h2>

      {/* Menú de accesos directos */}
      <AccesosDirectos />
      <CuentaRegresivaGlobal />

      {/* Menú de accesos directos internos de la página */}
      <div className="mb-3 d-flex flex-wrap gap-2 justify-content-center">
        <a href="#detalle-pronosticos" className="btn btn-outline-primary btn-sm">Detalle de Pronósticos</a>
        <a href="#ranking-jornada" className="btn btn-outline-primary btn-sm">Ranking Jornada</a>
        <a href="#ranking-acumulado" className="btn btn-outline-primary btn-sm">Ranking Acumulado</a>
      </div>

      {/* --- SELECTOR DE JORNADA --- */}
      <div className="mb-4 text-center">
        <div className="d-flex flex-wrap justify-content-center gap-3 align-items-center">
          <div>
            <label className="form-label fw-bold">Selecciona Jornada:</label>
            <select
              className="form-select text-center"
              style={{ maxWidth: 300, display: "inline-block" }}
              value={jornadaActual}
              onChange={e => {
                setJornadaActual(e.target.value);
                setSelectedMatch(""); // Resetear filtro de partido al cambiar jornada
                setSelectedUser(""); // Resetear filtro de usuario al cambiar jornada
              }}
            >
              <option value="">-- Selecciona jornada --</option>
              {jornadas.map(j => {
                if (j.numero === 25) {
                  return [
                    <option key={j.numero} value={j.numero}>Jornada {j.numero}</option>,
                    <option key="999" value="999">Cuadro Final</option>
                  ];
                }
                return <option key={j.numero} value={j.numero}>Jornada {j.numero}</option>;
              }).flat()}
            </select>
          </div>
          
          {jornadaCerrada && availableMatches.length > 0 && (
            <div>
              <label className="form-label fw-bold">Filtrar por partido:</label>
              <select
                className="form-select text-center"
                style={{ maxWidth: 350, display: "inline-block" }}
                value={selectedMatch}
                onChange={e => {
                  setSelectedMatch(e.target.value);
                  setSelectedUser(""); // Limpiar filtro de usuario al cambiar partido
                }}
              >
                <option value="">Todos los partidos</option>
                {availableMatches.map(match => (
                  <option key={match} value={match}>{match}</option>
                ))}
              </select>
            </div>
          )}
          
          {jornadaCerrada && availableUsers.length > 0 && (
            <div>
              <label className="form-label fw-bold">Filtrar por usuario:</label>
              <select
                className="form-select text-center"
                style={{ maxWidth: 300, display: "inline-block" }}
                value={selectedUser}
                onChange={e => {
                  setSelectedUser(e.target.value);
                  setSelectedMatch(""); // Limpiar filtro de partido al cambiar usuario
                }}
              >
                <option value="">Todos los usuarios</option>
                {availableUsers.map(user => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 1. Detalle de pronósticos por jugador */}
      <div id="detalle-pronosticos" className="mt-5">
        <h4 className="text-center">
          📝 Detalle de Todos los Pronósticos (Jornada {jornadaActual})
          {(selectedMatch || selectedUser) && (
            <small className="d-block text-muted mt-1">
              {selectedMatch && `Filtrado por partido: ${selectedMatch}`}
              {selectedMatch && selectedUser && " • "}
              {selectedUser && `Filtrado por usuario: ${selectedUser}`}
            </small>
          )}
        </h4>
        {!jornadaCerrada ? (
          <div className="alert alert-warning text-center">Esperando el cierre de jornada para mostrar resultados</div>
        ) : (
          <table className="table table-bordered table-sm text-center">
            <thead className="table-secondary text-center">
              <tr>
                <th className="text-center">Jugador</th>
                <th className="text-center">Partido</th>
                <th className="text-center">Resultado real</th>
                <th className="text-center">Mi resultado</th>
                <th className="text-center">Bonus</th>
                <th className="text-center">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {filasDetalleUnificado(detallePuntos)}
            </tbody>
          </table>
        )}
        <a href="#top" className="btn btn-link">Volver arriba</a>
      </div>

      {/* Ganador de la jornada */}
      {jornadaCerrada && ganadoresJornada.length > 0 && (
        <div className="ganador-jornada-container" style={{ position: 'relative', margin: '2rem 0' }}>
          <h3 className="text-center" style={{ color: '#e67e22', fontWeight: 'bold', position: 'relative', zIndex: 2 }}>
            Ganador{ganadoresJornada.length > 1 ? 'es' : ''} de la Jornada {jornadaActual}: {ganadoresJornada.join(', ')} ¡Felicitaciones!
          </h3>
          {showFireworks && <FireworksEffect targetSelector=".ganador-jornada-container" />}
        </div>
      )}

      {/* CUADRO FINAL */}
      {jornadaActual === "999" && (
        <div className="mt-5">
          <h3 className="text-center mb-4">🏆 Cuadro Final del Campeonato</h3>
          
          {!cuadroFinalCerrado ? (
            <div className="alert alert-info text-center">
              <h5>⏳ Cuadro Final en Proceso</h5>
              <p>Los resultados del Cuadro Final se mostrarán una vez que el administrador cierre esta etapa.</p>
            </div>
          ) : (
            <>
              {/* Tabla de Predicciones Reales - Fija */}
              {Object.keys(prediccionesReales).length > 0 && (
                <div className="card mb-4" style={{ position: 'sticky', top: '10px', zIndex: 1000 }}>
                  <div className="card-header bg-primary text-white">
                    <h5 className="mb-0">📋 Resultados Oficiales del Campeonato</h5>
                  </div>
                  <div className="card-body bg-light">
                    <div className="row text-center">
                      <div className="col-md-2 col-6 mb-2">
                        <strong>🥇 Campeón</strong><br />
                        <span className="badge bg-warning text-dark">{prediccionesReales.campeon || "-"}</span>
                      </div>
                      <div className="col-md-2 col-6 mb-2">
                        <strong>🥈 Sub-Campeón</strong><br />
                        <span className="badge bg-secondary">{prediccionesReales.subcampeon || "-"}</span>
                      </div>
                      <div className="col-md-2 col-6 mb-2">
                        <strong>🥉 3º Lugar</strong><br />
                        <span className="badge bg-info">{prediccionesReales.tercero || "-"}</span>
                      </div>
                      <div className="col-md-2 col-6 mb-2">
                        <strong>🇨🇱 Chile 4</strong><br />
                        <span className="badge bg-danger">{prediccionesReales.chile_4_lib || "-"}</span>
                      </div>
                      <div className="col-md-2 col-6 mb-2">
                        <strong>4º Lugar</strong><br />
                        <span className="badge bg-dark">{prediccionesReales.cuarto || "-"}</span>
                      </div>
                      <div className="col-md-2 col-6 mb-2">
                        <strong>5º Lugar</strong><br />
                        <span className="badge bg-dark">{prediccionesReales.quinto || "-"}</span>
                      </div>
                      <div className="col-md-2 col-6 mb-2">
                        <strong>6º Lugar</strong><br />
                        <span className="badge bg-dark">{prediccionesReales.sexto || "-"}</span>
                      </div>
                      <div className="col-md-2 col-6 mb-2">
                        <strong>7º Lugar</strong><br />
                        <span className="badge bg-dark">{prediccionesReales.septimo || "-"}</span>
                      </div>
                      <div className="col-md-2 col-6 mb-2">
                        <strong>15º Lugar</strong><br />
                        <span className="badge bg-danger">{prediccionesReales.quinceto || "-"}</span>
                      </div>
                      <div className="col-md-2 col-6 mb-2">
                        <strong>16º Lugar</strong><br />
                        <span className="badge bg-danger">{prediccionesReales.dieciseisavo || "-"}</span>
                      </div>
                      <div className="col-md-4 col-12 mb-2">
                        <strong>⚽ Goleador</strong><br />
                        <span className="badge bg-success">{prediccionesReales.goleador || "-"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabla de Predicciones de Usuarios */}
              {prediccionesUsuarios.length > 0 && (
                <div className="card">
                  <div className="card-header bg-info text-white">
                    <h5 className="mb-0">📊 Predicciones de Todos los Usuarios</h5>
                  </div>
                  <div className="card-body">
                    <div className="table-responsive">
                      <table className="table table-sm table-bordered">
                        <thead className="table-dark">
                          <tr className="text-center">
                            <th>Usuario</th>
                            <th>Campeón<br /><small>(15 pts)</small></th>
                            <th>Sub-Campeón<br /><small>(10 pts)</small></th>
                            <th>3º Lugar<br /><small>(5 pts)</small></th>
                            <th>Chile 4<br /><small>(5 pts)</small></th>
                            <th>4º Lugar<br /><small>(5 pts)</small></th>
                            <th>5º Lugar<br /><small>(5 pts)</small></th>
                            <th>6º Lugar<br /><small>(5 pts)</small></th>
                            <th>7º Lugar<br /><small>(5 pts)</small></th>
                            <th>15º Lugar<br /><small>(5 pts)</small></th>
                            <th>16º Lugar<br /><small>(5 pts)</small></th>
                            <th>Goleador<br /><small>(6 pts)</small></th>
                            <th>Total Puntos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prediccionesUsuarios.map((prediccion) => {
                            const { aciertos, puntosTotales } = calcularAciertos(prediccion);
                            return (
                              <tr key={prediccion.jugador_id} className="text-center">
                                <td className="text-start">
                                  <strong>{prediccion.nombre}</strong>
                                </td>
                                <td className={aciertos.campeon ? "bg-success text-white" : ""}>
                                  {prediccion.campeon}
                                  {aciertos.campeon && (
                                    <div style={{ fontSize: '0.75em', marginTop: '2px' }}>
                                      +{aciertos.campeon} pts
                                    </div>
                                  )}
                                </td>
                                <td className={aciertos.subcampeon ? "bg-success text-white" : ""}>
                                  {prediccion.subcampeon}
                                  {aciertos.subcampeon && (
                                    <div style={{ fontSize: '0.75em', marginTop: '2px' }}>
                                      +{aciertos.subcampeon} pts
                                    </div>
                                  )}
                                </td>
                                <td className={aciertos.tercero ? "bg-success text-white" : ""}>
                                  {prediccion.tercero}
                                  {aciertos.tercero && (
                                    <div style={{ fontSize: '0.75em', marginTop: '2px' }}>
                                      +{aciertos.tercero} pts
                                    </div>
                                  )}
                                </td>
                                <td className={aciertos.chile_4_lib ? "bg-success text-white" : ""}>
                                  {prediccion.chile_4_lib}
                                  {aciertos.chile_4_lib && (
                                    <div style={{ fontSize: '0.75em', marginTop: '2px' }}>
                                      +{aciertos.chile_4_lib} pts
                                    </div>
                                  )}
                                </td>
                                <td className={aciertos.cuarto ? "bg-success text-white" : ""}>
                                  {prediccion.cuarto}
                                  {aciertos.cuarto && (
                                    <div style={{ fontSize: '0.75em', marginTop: '2px' }}>
                                      +{aciertos.cuarto} pts
                                    </div>
                                  )}
                                </td>
                                <td className={aciertos.quinto ? "bg-success text-white" : ""}>
                                  {prediccion.quinto}
                                  {aciertos.quinto && (
                                    <div style={{ fontSize: '0.75em', marginTop: '2px' }}>
                                      +{aciertos.quinto} pts
                                    </div>
                                  )}
                                </td>
                                <td className={aciertos.sexto ? "bg-success text-white" : ""}>
                                  {prediccion.sexto}
                                  {aciertos.sexto && (
                                    <div style={{ fontSize: '0.75em', marginTop: '2px' }}>
                                      +{aciertos.sexto} pts
                                    </div>
                                  )}
                                </td>
                                <td className={aciertos.septimo ? "bg-success text-white" : ""}>
                                  {prediccion.septimo}
                                  {aciertos.septimo && (
                                    <div style={{ fontSize: '0.75em', marginTop: '2px' }}>
                                      +{aciertos.septimo} pts
                                    </div>
                                  )}
                                </td>
                                <td className={aciertos.quinceto ? "bg-success text-white" : ""}>
                                  {prediccion.quinceto}
                                  {aciertos.quinceto && (
                                    <div style={{ fontSize: '0.75em', marginTop: '2px' }}>
                                      +{aciertos.quinceto} pts
                                    </div>
                                  )}
                                </td>
                                <td className={aciertos.dieciseisavo ? "bg-success text-white" : ""}>
                                  {prediccion.dieciseisavo}
                                  {aciertos.dieciseisavo && (
                                    <div style={{ fontSize: '0.75em', marginTop: '2px' }}>
                                      +{aciertos.dieciseisavo} pts
                                    </div>
                                  )}
                                </td>
                                <td className={aciertos.goleador ? "bg-success text-white" : ""}>
                                  {prediccion.goleador}
                                  {aciertos.goleador && (
                                    <div style={{ fontSize: '0.75em', marginTop: '2px' }}>
                                      +{aciertos.goleador} pts
                                    </div>
                                  )}
                                </td>
                                <td className="table-warning">
                                  <strong style={{ fontSize: '1.1em', color: '#d63384' }}>
                                    {puntosTotales} pts
                                  </strong>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          
          <div className="text-center mt-4">
            <a href="#top" className="btn btn-outline-primary">Volver arriba</a>
          </div>
        </div>
      )}

      {/* Las secciones normales solo se muestran si NO es cuadro-final */}
      {jornadaActual !== "999" && (
        <>
          {/* 2. Ranking por jornada */}
          <div id="ranking-jornada" className="mt-5">
            <h4 className="text-center">🏆 Ranking Jornada {jornadaActual}</h4>
        <table className="table table-bordered text-center" style={{ marginBottom: "2rem" }}>
          <thead>
            <tr>
              <th style={{ background: "#305496", color: "white", textAlign: "center" }}>Posición</th>
              <th style={{ background: "#305496", color: "white", textAlign: "center" }}>Jugador</th>
              <th style={{ background: "#305496", color: "white", textAlign: "center" }}>Puntaje</th>
            </tr>
          </thead>
          <tbody>
            {rankingJornada.map((p, i) => {
              return (
                <tr key={i} className="text-center">
                  <td style={getJornadaCellStyle(i)}>{i + 1}</td>
                  <td style={getJornadaCellStyle(i)}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {p.foto_perfil && (
                        <img
                          src={p.foto_perfil.startsWith('/') ? p.foto_perfil : `/perfil/${p.foto_perfil}`}
                          alt={`Foto de ${p.usuario}`}
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            marginRight: '10px',
                            border: '2px solid #ddd',
                            objectPosition: 'center 30%'
                          }}
                        />
                      )}
                      {p.usuario}
                    </span>
                  </td>
                  <td style={getJornadaCellStyle(i)}>{p.puntaje_jornada ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <a href="#top" className="btn btn-link">Volver arriba</a>
      </div>

      {/* 3. Ranking acumulado */}
      <div id="ranking-acumulado" className="mt-5">
        <h4 className="text-center">📊 Ranking Acumulado</h4>
        <table className="table table-bordered text-center" style={{ marginBottom: "2rem" }}>
          <thead>
            <tr>
              <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Posición</th>
              <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Jugador</th>
              <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Puntaje Total</th>
            </tr>
          </thead>
          <tbody>
            {rankingAcumulado.map((p, i) => (
              <tr key={i} className="text-center">
                <td style={getAcumuladoCellStyle(i)}>{i + 1}</td>
                <td style={getAcumuladoCellStyle(i)}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {p.foto_perfil && (
                      <img
                        src={p.foto_perfil.startsWith('/') ? p.foto_perfil : `/perfil/${p.foto_perfil}`}
                        alt={`Foto de ${p.usuario}`}
                        style={{
                          width: '60px',
                          height: '60px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          marginRight: '10px',
                          border: '2px solid #ddd',
                          objectPosition: 'center 30%'
                        }}
                      />
                    )}
                    {p.usuario}
                  </span>
                </td>
                <td style={getAcumuladoCellStyle(i)}>{p.puntaje_total ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <a href="#top" className="btn btn-link">Volver arriba</a>
      </div>
        </>
      )}
    </div>
  );
}
