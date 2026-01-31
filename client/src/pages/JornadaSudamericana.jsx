import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import NavegacionSudamericana from '../components/NavegacionSudamericana';
import TablasPosicionesSudamericana from '../components/TablasPosicionesSudamericana';
import { LogoEquipo } from '../utils/sudamericanaLogos.jsx';

const API_URL = import.meta.env.VITE_API_URL;

function useAuth() {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuario"));
    return usuario;
  } catch {
    return null;
  }
}

export default function JornadaSudamericana() {
  const usuario = useAuth();
  const navigate = useNavigate();
  const { numero } = useParams();

  const [jornada, setJornada] = useState(null);
  const [partidos, setPartidos] = useState([]);
  const [pronosticos, setPronosticos] = useState({});
  const [estadisticas, setEstadisticas] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Estados para jornada 10 (semifinales y final)
  const [equiposFinalistasPronosticados, setEquiposFinalistasPronosticados] = useState([]);
  const [partidoFinal, setPartidoFinal] = useState(null);
  const [pronosticoFinal, setPronosticoFinal] = useState({ goles_local: '', goles_visita: '', penales_local: '', penales_visita: '' });
  const [mostrarCalcularFinalistas, setMostrarCalcularFinalistas] = useState(false);

  useEffect(() => {
    if (!usuario) {
      navigate("/login");
      return;
    }
    
    cargarDatos();
  }, [numero]);

  const cargarDatos = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Cargar jornada y partidos
      const jornadaRes = await axios.get(`${API_URL}/api/sudamericana/jornadas/${numero}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // La API devuelve la jornada con los partidos incluidos
      const { partidos, ...jornadaData } = jornadaRes.data;
      setJornada(jornadaData);
      setPartidos(partidos || []);
      
      // Cargar estadísticas solo para jornadas de fase de grupos (1-6)
      if (Number(numero) <= 6) {
        try {
          const estadisticasRes = await axios.get(`${API_URL}/api/sudamericana-estadisticas/estadisticas`);
          setEstadisticas(estadisticasRes.data);
        } catch (error) {
          console.log('No se pudieron cargar estadísticas');
        }
      }
      
      // Cargar pronósticos del usuario
      if (usuario?.id) {
        try {
          const pronosticosRes = await axios.get(
            `${API_URL}/api/sudamericana/pronosticos/jornada/${numero}/usuario/${usuario.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          const pronosticosMap = {};
          let pronosticoFinalData = null;
          
          pronosticosRes.data.forEach(p => {
            pronosticosMap[p.partido_id] = {
              goles_local: p.goles_local,
              goles_visita: p.goles_visita,
              penales_local: p.penales_local,
              penales_visita: p.penales_visita
            };
            
            // Si es jornada 10 y es el último partido (la final), guardarlo en pronosticoFinalData
            if (Number(numero) === 10 && partidos.length > 0) {
              const ultimoPartidoId = partidos[partidos.length - 1]?.id;
              if (p.partido_id === ultimoPartidoId) {
                pronosticoFinalData = {
                  goles_local: p.goles_local,
                  goles_visita: p.goles_visita,
                  penales_local: p.penales_local,
                  penales_visita: p.penales_visita
                };
              }
            }
          });
          
          setPronosticos(pronosticosMap);
          
          // Si hay pronóstico de la final, setearlo
          if (pronosticoFinalData) {
            setPronosticoFinal(pronosticoFinalData);
          }
        } catch (error) {
          console.log('No hay pronósticos previos');
        }
      }
      
    } catch (error) {
      console.error('Error cargando datos:', error);
      setMensaje('Error al cargar la jornada');
    } finally {
      setLoading(false);
    }
  };

  // Calcular finalistas basados en pronósticos del usuario (solo jornada 10)
  useEffect(() => {
    if (Number(numero) !== 10) {
      setEquiposFinalistasPronosticados([]);
      setPartidoFinal(null);
      setMostrarCalcularFinalistas(false);
      return;
    }
    
    if (partidos.length === 0) {
      return;
    }

    const partidosSemifinal = partidos.slice(0, 4);
    
    if (partidosSemifinal.length < 4) {
      return;
    }

    if (partidos.length < 5) {
      setEquiposFinalistasPronosticados([]);
      setPartidoFinal(null);
      return;
    }

    // Verificar si hay pronósticos guardados
    const hayPronosticos = partidosSemifinal.some(p => 
      pronosticos[p.id] && 
      (pronosticos[p.id].goles_local !== undefined || pronosticos[p.id].goles_visita !== undefined)
    );

    if (hayPronosticos) {
      setMostrarCalcularFinalistas(true);
    }

    // Verificar que todos los pronósticos de semifinal estén completos para calcular
    const todosPronosticosCompletos = partidosSemifinal.every(p => 
      pronosticos[p.id] && 
      pronosticos[p.id].goles_local !== undefined &&
      pronosticos[p.id].goles_visita !== undefined
    );

    if (!todosPronosticosCompletos) {
      return;
    }

    // Calcular ganadores basados en PRONÓSTICOS del usuario
    const ganadores = [];
    const partidosIda = [partidosSemifinal[0], partidosSemifinal[2]];
    const partidosVuelta = [partidosSemifinal[1], partidosSemifinal[3]];
    
    partidosIda.forEach((ida, index) => {
      const vuelta = partidosVuelta[index];
      
      const golesIdaLocal = Number(pronosticos[ida.id]?.goles_local ?? 0);
      const golesIdaVisita = Number(pronosticos[ida.id]?.goles_visita ?? 0);
      const golesVueltaLocal = Number(pronosticos[vuelta.id]?.goles_local ?? 0);
      const golesVueltaVisita = Number(pronosticos[vuelta.id]?.goles_visita ?? 0);
      
      const penalesVueltaLocal = Number(pronosticos[vuelta.id]?.penales_local ?? 0);
      const penalesVueltaVisita = Number(pronosticos[vuelta.id]?.penales_visita ?? 0);
      
      const golesEquipoLocal = golesIdaLocal + golesVueltaVisita;
      const golesEquipoVisita = golesIdaVisita + golesVueltaLocal;
      
      let ganador = null;
      
      if (golesEquipoLocal > golesEquipoVisita) {
        ganador = ida.nombre_local;
      } else if (golesEquipoVisita > golesEquipoLocal) {
        ganador = ida.nombre_visita;
      } else {
        if (penalesVueltaLocal > 0 || penalesVueltaVisita > 0) {
          ganador = penalesVueltaLocal > penalesVueltaVisita ? vuelta.nombre_local : vuelta.nombre_visita;
        } else {
          ganador = ida.nombre_local;
        }
      }
      
      if (ganador) {
        ganadores.push(ganador);
      }
    });
    
    const partidoFinalEncontrado = partidos[partidos.length - 1];
    
    setEquiposFinalistasPronosticados(ganadores);
    setPartidoFinal(partidoFinalEncontrado);
  }, [numero, partidos, pronosticos]);

  const handleChange = (partidoId, campo, valor) => {
    setPronosticos(prev => ({
      ...prev,
      [partidoId]: {
        ...prev[partidoId],
        [campo]: valor
      }
    }));
  };

  // Manejar cambios en pronóstico de final (jornada 10)
  const handleChangeFinal = (campo, valor) => {
    setPronosticoFinal(prev => ({
      ...prev,
      [campo]: valor
    }));
  };

  // Calcular si hay empate global en un partido de VUELTA
  const calcularEmpateGlobal = (partidoVuelta) => {
    if (!partidoVuelta.tipo_partido || partidoVuelta.tipo_partido !== 'VUELTA') return false;
    
    const pronosticoVuelta = pronosticos[partidoVuelta.id];
    if (!pronosticoVuelta || pronosticoVuelta.goles_local === "" || pronosticoVuelta.goles_visita === "" ||
        pronosticoVuelta.goles_local === undefined || pronosticoVuelta.goles_visita === undefined) {
      return false;
    }

    // Buscar partido IDA (equipos invertidos)
    const partidoIda = partidos.find(p => 
      p.tipo_partido === 'IDA' && 
      p.nombre_local === partidoVuelta.nombre_visita && 
      p.nombre_visita === partidoVuelta.nombre_local
    );

    if (!partidoIda) return false;
    
    const pronosticoIda = pronosticos[partidoIda.id];
    if (!pronosticoIda || pronosticoIda.goles_local === "" || pronosticoIda.goles_visita === "" ||
        pronosticoIda.goles_local === undefined || pronosticoIda.goles_visita === undefined) {
      return false;
    }

    // Calcular marcador global
    const golesLocalGlobal = Number(pronosticoIda.goles_visita) + Number(pronosticoVuelta.goles_local);
    const golesVisitaGlobal = Number(pronosticoIda.goles_local) + Number(pronosticoVuelta.goles_visita);

    return golesLocalGlobal === golesVisitaGlobal;
  };

  const generarAleatorioTodos = () => {
    const nuevosPronosticos = {};
    partidos.forEach(partido => {
      nuevosPronosticos[partido.id] = {
        goles_local: Math.floor(Math.random() * 4),
        goles_visita: Math.floor(Math.random() * 4),
      };
    });
    setPronosticos(nuevosPronosticos);
  };

  const generarAzarFaseGruposCompleta = async () => {
    if (!confirm('¿Estás seguro de completar TODAS las jornadas de fase de grupos (1-6) con resultados aleatorios?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      
      // Iterar sobre jornadas 1 a 6
      for (let jornadaNum = 1; jornadaNum <= 6; jornadaNum++) {
        // Obtener jornada para el ID
        const responseJornada = await axios.get(
          `${API_URL}/api/sudamericana/jornadas`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const jornadaActual = responseJornada.data.find(j => j.numero === jornadaNum);
        
        if (!jornadaActual) continue;

        // Obtener partidos de la jornada
        const responsePartidos = await axios.get(
          `${API_URL}/api/sudamericana/jornadas/${jornadaNum}/partidos`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const partidosJornada = responsePartidos.data;
        
        // Enviar pronósticos uno por uno
        for (const partido of partidosJornada) {
          await axios.post(
            `${API_URL}/api/sudamericana/pronosticos`,
            {
              partido_id: partido.id,
              jornada_id: jornadaActual.id,
              goles_local: Math.floor(Math.random() * 5),
              goles_visita: Math.floor(Math.random() * 5)
            },
            { 
              headers: { 
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
              } 
            }
          );
        }
      }

      alert('✅ Se completaron todas las jornadas de fase de grupos (1-6) con resultados aleatorios');
      
      // Recargar la jornada actual
      cargarDatos();
    } catch (error) {
      console.error('Error al generar azar fase grupos completa:', error);
      alert('❌ Error al completar fase de grupos: ' + (error.response?.data?.error || error.message));
    }
  };

  const resetearTodos = () => {
    const nuevosPronosticos = {};
    partidos.forEach(partido => {
      nuevosPronosticos[partido.id] = {
        goles_local: 0,
        goles_visita: 0,
      };
    });
    setPronosticos(nuevosPronosticos);
  };

  const guardarPronosticos = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const pronosticosArray = Object.entries(pronosticos).map(([partidoId, datos]) => ({
        partido_id: parseInt(partidoId),
        goles_local: datos.goles_local !== undefined ? parseInt(datos.goles_local) : null,
        goles_visita: datos.goles_visita !== undefined ? parseInt(datos.goles_visita) : null,
        penales_local: datos.penales_local !== undefined ? parseInt(datos.penales_local) : null,
        penales_visita: datos.penales_visita !== undefined ? parseInt(datos.penales_visita) : null
      }));

      // Si es jornada 10, incluir el pronóstico de la final
      if (Number(numero) === 10 && partidoFinal && pronosticoFinal) {
        // Verificar si el pronóstico de la final tiene datos
        if (pronosticoFinal.goles_local !== undefined || pronosticoFinal.goles_visita !== undefined) {
          pronosticosArray.push({
            partido_id: partidoFinal.id,
            goles_local: pronosticoFinal.goles_local !== undefined ? parseInt(pronosticoFinal.goles_local) : null,
            goles_visita: pronosticoFinal.goles_visita !== undefined ? parseInt(pronosticoFinal.goles_visita) : null,
            penales_local: pronosticoFinal.penales_local !== undefined ? parseInt(pronosticoFinal.penales_local) : null,
            penales_visita: pronosticoFinal.penales_visita !== undefined ? parseInt(pronosticoFinal.penales_visita) : null
          });
        }
      }

      await axios.post(
        `${API_URL}/api/sudamericana/pronosticos/guardar`,
        {
          usuario_id: usuario.id,
          jornada_numero: parseInt(numero),
          pronosticos: pronosticosArray
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMensaje('✅ Pronósticos guardados exitosamente');
      setTimeout(() => setMensaje(''), 3000);
      
    } catch (error) {
      console.error('Error guardando pronósticos:', error);
      const errorMsg = error.response?.data?.error || '❌ Error al guardar pronósticos';
      setMensaje(errorMsg);
      setTimeout(() => setMensaje(''), 5000);
    }
  };

  const getSubtitulo = (numero) => {
    if (numero <= 6) return 'Fase de Grupos';
    if (numero === 7) return 'Play-Offs IDA/VUELTA';
    if (numero === 8) return 'Octavos de Final IDA/VUELTA';
    if (numero === 9) return 'Cuartos de Final IDA/VUELTA';
    if (numero === 10) return 'Semifinales IDA/VUELTA + Final + Cuadro Final';
    return '';
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

  if (!jornada) {
    return (
      <div className="container text-center mt-5">
        <div className="alert alert-danger">Jornada no encontrada</div>
        <button className="btn btn-primary" onClick={() => navigate("/sudamericana")}>
          Volver a Sudamericana
        </button>
      </div>
    );
  }

  return (
    <div className="container mt-4 mb-5">
      <div className="text-center mb-4">
        <h1 className="display-6 fw-bold text-success">🟢 Copa Sudamericana 2026</h1>
        
        <h2 className="h4 mb-1">Jornada {numero}</h2>
        <p className="text-muted small mb-3">{getSubtitulo(Number(numero))}</p>
      </div>
        
      {/* Botonera de navegación */}
      <NavegacionSudamericana />
        
      <div className="text-center">
        {!jornada.activa && !jornada.cerrada && (
          <div className="alert alert-warning mt-3">
            ⚠️ Esta jornada aún no está activa. No puedes ingresar pronósticos hasta que el administrador la active.
          </div>
        )}
        
        {jornada.cerrada && (
          <div className="alert alert-warning mt-3">
            🔒 Esta jornada está cerrada. No puedes modificar los pronósticos.
          </div>
        )}
      </div>

      {partidos.length === 0 ? (
        <div className="alert alert-info text-center">
          No hay partidos configurados para esta jornada
        </div>
      ) : (
        <>
          <div className="row">
            {/* Columna de partidos - centrada para J7-J10, 2/3 para J1-J6 */}
            <div className={`col-12 ${Number(numero) <= 6 ? 'col-lg-8' : 'col-lg-10 offset-lg-1'}`}>
              <h5 className="fw-bold mb-3">🎯 Tus Pronósticos</h5>
              <div className="row g-3 mb-4">
                {partidos
                  .filter((_, index) => Number(numero) !== 10 || index < 4) // En J10 solo mostrar semifinales
                  .map((partido) => (
                  <div key={partido.id} className="col-12 col-md-6">
                    <div className="card shadow-sm">
                      <div className="card-body">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <div className="d-flex flex-column">
                            <h6 className="mb-0 text-muted">
                              {new Date(partido.fecha).toLocaleDateString('es-CL')} - {new Date(partido.fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                            </h6>
                            {Number(numero) >= 7 && Number(numero) <= 10 && partido.tipo_partido && (
                              <span className={`badge mt-1 ${partido.tipo_partido === 'IDA' ? 'bg-info' : partido.tipo_partido === 'FINAL' ? 'bg-warning text-dark' : 'bg-success'}`}>
                                {partido.tipo_partido}
                              </span>
                            )}
                          </div>
                          {partido.bonus > 1 && (
                            <span className="badge bg-warning text-dark">⭐ Bonus x{partido.bonus}</span>
                          )}
                        </div>

                        {(partido.grupo_local || partido.grupo_visita) && Number(numero) < 7 && (
                          <div className="text-center mb-2">
                            <span className="badge bg-success" style={{ fontSize: '0.7rem' }}>
                              GRUPO {partido.grupo_local || partido.grupo_visita}
                            </span>
                          </div>
                        )}

                        <div className="row align-items-center text-center">
                          <div className="col-5">
                            <div className="d-flex align-items-center justify-content-center mb-2">
                              <LogoEquipo nombre={partido.nombre_local} />
                              <p className="fw-bold mb-0">
                                {partido.nombre_local}
                                {partido.pais_local && <span className="text-muted ms-1">({partido.pais_local})</span>}
                              </p>
                            </div>
                            <input
                              type="number"
                              min="0"
                              className="form-control form-control-lg text-center fw-bold"
                              style={{ MozAppearance: 'textfield' }}
                              value={pronosticos[partido.id]?.goles_local ?? ""}
                              onChange={(e) => handleChange(partido.id, "goles_local", e.target.value)}
                              disabled={jornada.cerrada}
                              placeholder="0"
                            />
                          </div>

                          <div className="col-2">
                            <p className="fw-bold text-muted fs-3">VS</p>
                          </div>

                          <div className="col-5">
                            <div className="d-flex align-items-center justify-content-center mb-2">
                              <LogoEquipo nombre={partido.nombre_visita} />
                              <p className="fw-bold mb-0">
                                {partido.nombre_visita}
                                {partido.pais_visita && <span className="text-muted ms-1">({partido.pais_visita})</span>}
                              </p>
                            </div>
                            <input
                              type="number"
                              min="0"
                              className="form-control form-control-lg text-center fw-bold"
                              style={{ MozAppearance: 'textfield' }}
                              value={pronosticos[partido.id]?.goles_visita ?? ""}
                              onChange={(e) => handleChange(partido.id, "goles_visita", e.target.value)}
                              disabled={jornada.cerrada}
                              placeholder="0"
                            />
                          </div>
                        </div>

                        {/* Inputs de penales - Solo si es VUELTA y hay empate global */}
                        {!jornada.cerrada && partido.tipo_partido === 'VUELTA' && calcularEmpateGlobal(partido) && (
                          <div className="mt-3 p-3 border border-warning rounded bg-light">
                            <div className="text-center mb-2">
                              <small className="text-danger fw-bold">⚠️ Empate global - Definir por penales</small>
                            </div>
                            <div className="row align-items-center text-center">
                              <div className="col-5">
                                <label className="form-label small mb-1">Penales {partido.nombre_local}</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="10"
                                  className="form-control text-center border-warning"
                                  value={pronosticos[partido.id]?.penales_local ?? ""}
                                  onChange={(e) => handleChange(partido.id, "penales_local", e.target.value)}
                                  placeholder="0"
                                />
                              </div>
                              <div className="col-2">
                                <span className="fw-bold text-warning">PEN</span>
                              </div>
                              <div className="col-5">
                                <label className="form-label small mb-1">Penales {partido.nombre_visita}</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="10"
                                  className="form-control text-center border-warning"
                                  value={pronosticos[partido.id]?.penales_visita ?? ""}
                                  onChange={(e) => handleChange(partido.id, "penales_visita", e.target.value)}
                                  placeholder="0"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {jornada.cerrada && (
                          <div className="mt-3 pt-3 border-top">
                            <div className="row">
                              <div className="col-6">
                                <small className="text-muted">Resultado:</small>
                                <p className="mb-0 fw-bold">
                                  {partido.goles_local !== null && partido.goles_visita !== null
                                    ? `${partido.goles_local} - ${partido.goles_visita}`
                                    : '-'}
                                </p>
                              </div>
                              <div className="col-6 text-end">
                                <small className="text-muted">Puntos:</small>
                                <p className="mb-0">
                                  <span className={`badge ${pronosticos[partido.id]?.puntos > 0 ? 'bg-success' : 'bg-secondary'}`}>
                                    {pronosticos[partido.id]?.puntos || 0} pts
                                  </span>
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sección especial para Jornada 10 - Finalistas y Final */}
              {Number(numero) === 10 && equiposFinalistasPronosticados.length === 2 && (
                <>
                  <div className="alert alert-success mb-4">
                    <h5 className="fw-bold mb-3">🎯 Tus Finalistas Pronosticados</h5>
                    <p className="small mb-3">Basado en tus pronósticos de semifinales</p>
                    <div className="row g-3">
                      {equiposFinalistasPronosticados.map((equipo, index) => (
                        <div key={index} className="col-6 text-center">
                          <span className="badge bg-success mb-2">Finalista {index + 1}</span>
                          <div className="mb-2">
                            <LogoEquipo nombre={equipo} />
                          </div>
                          <p className="fw-bold fs-4 mb-0">{equipo}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card de Partido Final */}
                  <div className="card border-warning border-3 shadow mb-4">
                    <div className="card-header bg-warning bg-opacity-25 text-center">
                      <h5 className="fw-bold mb-0">🏆 FINAL</h5>
                    </div>
                    <div className="card-body">
                      <p className="fw-bold fs-4 text-center mb-4">
                        {equiposFinalistasPronosticados[0]} <span className="text-muted">vs</span> {equiposFinalistasPronosticados[1]}
                      </p>

                      <div className="row g-3 align-items-center text-center">
                        <div className="col-5">
                          <div className="mb-2">
                            <LogoEquipo nombre={equiposFinalistasPronosticados[0]} />
                          </div>
                          <label className="form-label fw-bold">{equiposFinalistasPronosticados[0]}</label>
                          <input
                            type="number"
                            className="form-control form-control-lg text-center fw-bold"
                            style={{ MozAppearance: 'textfield' }}
                            placeholder="0"
                            value={pronosticoFinal.goles_local ?? ""}
                            onChange={(e) => handleChangeFinal("goles_local", e.target.value)}
                            disabled={jornada.cerrada}
                            min="0"
                          />
                        </div>
                        <div className="col-2">
                          <p className="fw-bold text-muted fs-3 mb-0">VS</p>
                        </div>
                        <div className="col-5">
                          <div className="mb-2">
                            <LogoEquipo nombre={equiposFinalistasPronosticados[1]} />
                          </div>
                          <label className="form-label fw-bold">{equiposFinalistasPronosticados[1]}</label>
                          <input
                            type="number"
                            className="form-control form-control-lg text-center fw-bold"
                            style={{ MozAppearance: 'textfield' }}
                            placeholder="0"
                            value={pronosticoFinal.goles_visita ?? ""}
                            onChange={(e) => handleChangeFinal("goles_visita", e.target.value)}
                            disabled={jornada.cerrada}
                            min="0"
                          />
                        </div>
                      </div>

                      {/* Mostrar inputs de penales si hay empate */}
                      {pronosticoFinal.goles_local !== "" && 
                       pronosticoFinal.goles_visita !== "" && 
                       Number(pronosticoFinal.goles_local) === Number(pronosticoFinal.goles_visita) && (
                        <div className="mt-4 p-3 border border-warning rounded bg-light">
                          <div className="text-center mb-3">
                            <small className="text-danger fw-bold">⚠️ Empate - Definir por penales</small>
                          </div>
                          <div className="row align-items-center text-center">
                            <div className="col-5">
                              <label className="form-label small mb-1">Penales {equiposFinalistasPronosticados[0]}</label>
                              <input
                                type="number"
                                min="0"
                                max="10"
                                className="form-control text-center border-warning"
                                value={pronosticoFinal.penales_local ?? ""}
                                onChange={(e) => handleChangeFinal("penales_local", e.target.value)}
                                placeholder="0"
                              />
                            </div>
                            <div className="col-2">
                              <span className="fw-bold text-warning">PEN</span>
                            </div>
                            <div className="col-5">
                              <label className="form-label small mb-1">Penales {equiposFinalistasPronosticados[1]}</label>
                              <input
                                type="number"
                                min="0"
                                max="10"
                                className="form-control text-center border-warning"
                                value={pronosticoFinal.penales_visita ?? ""}
                                onChange={(e) => handleChangeFinal("penales_visita", e.target.value)}
                                placeholder="0"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {Number(numero) === 10 && mostrarCalcularFinalistas && equiposFinalistasPronosticados.length === 0 && (
                <div className="alert alert-info">
                  <h6 className="fw-bold">📊 Paso siguiente:</h6>
                  <p className="mb-2">Ya guardaste tus pronósticos de semifinales. Completa todos los pronósticos y luego haz clic en el botón de abajo para ver quiénes serán tus finalistas.</p>
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      console.log('🔄 Forzando recálculo de finalistas...');
                      setPronosticos(prev => ({...prev}));
                    }}
                  >
                    🔄 Calcular Finalistas
                  </button>
                </div>
              )}
            </div>

            {/* Columna de estadísticas - 1/3 del ancho - Solo en fase de grupos */}
            {Number(numero) <= 6 && Object.keys(estadisticas).length > 0 && (
              <div className="col-12 col-lg-4">
                <TablasPosicionesSudamericana estadisticas={estadisticas} colorTema="success" />
              </div>
            )}
          </div>

          {!jornada.cerrada && jornada.activa && (
            <div className="text-center d-flex gap-3 justify-content-center flex-wrap">
              {Number(numero) <= 6 && (
                <button className="btn btn-outline-warning btn-lg px-4" onClick={generarAzarFaseGruposCompleta}>
                  🎲✨ Azar Fase Grupos Completa
                </button>
              )}
              <button className="btn btn-outline-info btn-lg px-4" onClick={generarAleatorioTodos}>
                🎲 Azar Jornada {numero}
              </button>
              <button className="btn btn-outline-secondary btn-lg px-4" onClick={resetearTodos}>
                🔄 Resetear
              </button>
              <button className="btn btn-success btn-lg px-5" onClick={guardarPronosticos}>
                💾 Guardar Pronósticos
              </button>
              <button
                className="btn btn-outline-secondary btn-lg"
                onClick={() => navigate(`/sudamericana/jornada/${Number(numero) - 1}`)}
                disabled={Number(numero) <= 1}
              >
                ← Anterior
              </button>
              <button
                className="btn btn-outline-secondary btn-lg"
                onClick={() => navigate(`/sudamericana/jornada/${Number(numero) + 1}`)}
                disabled={Number(numero) >= 10}
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}

      {mensaje && (
        <div className={`alert ${mensaje.includes('✅') ? 'alert-success' : 'alert-danger'} text-center mt-4`}>
          {mensaje}
        </div>
      )}

      <div className="text-center mt-4">
        <button className="btn btn-outline-secondary" onClick={() => navigate("/sudamericana")}>
          ← Volver a Sudamericana
        </button>
      </div>
    </div>
  );
}
