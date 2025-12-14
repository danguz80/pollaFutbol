import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL;

function useAuth() {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuario"));
    return usuario;
  } catch {
    return null;
  }
}

export default function JornadaLibertadores() {
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
  const [pronosticoFinal, setPronosticoFinal] = useState({ 
    goles_local: '', 
    goles_visita: '', 
    penales_local: '', 
    penales_visita: '' 
  });
  const [mostrarCalcularFinalistas, setMostrarCalcularFinalistas] = useState(false);

  useEffect(() => {
    if (!usuario) {
      navigate("/login");
      return;
    }
    cargarDatos();
  }, [numero]);

  // Calcular finalistas basados en pronósticos del usuario (solo jornada 10)
  useEffect(() => {
    console.log('🔍 useEffect ejecutándose - Jornada:', numero, 'Partidos:', partidos.length);
    
    if (Number(numero) !== 10) {
      setEquiposFinalistasPronosticados([]);
      setPartidoFinal(null);
      setMostrarCalcularFinalistas(false);
      return;
    }
    
    if (partidos.length === 0) {
      console.log('⚠️ Esperando que carguen los partidos...');
      return;
    }

    console.log('🔍 Calculando finalistas - Partidos:', partidos.length);
    console.log('🔍 Pronósticos actuales:', pronosticos);

    const partidosSemifinal = partidos.slice(0, 4);
    
    if (partidosSemifinal.length < 4) {
      console.log('⚠️ No hay suficientes partidos de semifinal');
      return;
    }

    if (partidos.length < 5) {
      console.log('⚠️ No hay partido de final creado todavía');
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
      console.log('✅ Hay pronósticos guardados, verificando si están completos...');
      setMostrarCalcularFinalistas(true);
    }

    // Verificar que todos los pronósticos de semifinal estén completos para calcular
    const todosPronosticosCompletos = partidosSemifinal.every(p => 
      pronosticos[p.id] && 
      pronosticos[p.id].goles_local !== undefined && 
      pronosticos[p.id].goles_visita !== undefined
    );

    if (!todosPronosticosCompletos) {
      console.log('⚠️ No todos los pronósticos están completos, esperando...');
      return;
    }

    // Calcular ganadores basados en PRONÓSTICOS del usuario
    const ganadores = [];
    const partidosIda = [partidosSemifinal[0], partidosSemifinal[2]];
    const partidosVuelta = [partidosSemifinal[1], partidosSemifinal[3]];
    
    partidosIda.forEach((ida, index) => {
      const vuelta = partidosVuelta[index];
      
      console.log(`\n🏟️ Semifinal ${index + 1}:`);
      console.log(`  IDA: ${ida.nombre_local} vs ${ida.nombre_visita}`);
      console.log(`  VUELTA: ${vuelta.nombre_local} vs ${vuelta.nombre_visita}`);
      
      const golesIdaLocal = Number(pronosticos[ida.id]?.goles_local ?? 0);
      const golesIdaVisita = Number(pronosticos[ida.id]?.goles_visita ?? 0);
      const golesVueltaLocal = Number(pronosticos[vuelta.id]?.goles_local ?? 0);
      const golesVueltaVisita = Number(pronosticos[vuelta.id]?.goles_visita ?? 0);
      
      console.log(`  Pronóstico IDA: ${golesIdaLocal}-${golesIdaVisita}`);
      console.log(`  Pronóstico VUELTA: ${golesVueltaLocal}-${golesVueltaVisita}`);
      
      const penalesVueltaLocal = Number(pronosticos[vuelta.id]?.penales_local ?? 0);
      const penalesVueltaVisita = Number(pronosticos[vuelta.id]?.penales_visita ?? 0);
      
      const golesEquipoLocal = golesIdaLocal + golesVueltaVisita;
      const golesEquipoVisita = golesIdaVisita + golesVueltaLocal;
      
      console.log(`  Marcador global: ${ida.nombre_local} ${golesEquipoLocal} - ${golesEquipoVisita} ${ida.nombre_visita}`);
      
      let ganador = null;
      
      if (golesEquipoLocal > golesEquipoVisita) {
        ganador = ida.nombre_local;
      } else if (golesEquipoVisita > golesEquipoLocal) {
        ganador = ida.nombre_visita;
      } else {
        if (penalesVueltaLocal > 0 || penalesVueltaVisita > 0) {
          ganador = penalesVueltaLocal > penalesVueltaVisita ? vuelta.nombre_local : vuelta.nombre_visita;
          console.log(`  Definido por penales: ${penalesVueltaLocal}-${penalesVueltaVisita}`);
        } else {
          ganador = ida.nombre_local;
          console.log(`  ⚠️ Empate sin penales - ganador por defecto: ${ganador}`);
        }
      }
      
      console.log(`  ✅ Ganador: ${ganador}`);
      
      if (ganador) {
        ganadores.push(ganador);
      }
    });
    
    console.log('\n🎯 Finalistas calculados:', ganadores);
    
    const partidoFinalEncontrado = partidos[partidos.length - 1];
    console.log('🏆 Partido final encontrado:', partidoFinalEncontrado);
    
    setEquiposFinalistasPronosticados(ganadores);
    setPartidoFinal(partidoFinalEncontrado);
  }, [numero, partidos, pronosticos]);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      // Cargar jornada y partidos
      const jornadaRes = await axios.get(`${API_URL}/api/libertadores/jornadas/${numero}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setJornada(jornadaRes.data);
      setPartidos(jornadaRes.data.partidos || []);

      // Cargar pronósticos guardados
      const pronosticosRes = await axios.get(`${API_URL}/api/libertadores-pronosticos/jornada/${numero}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const map = {};
      pronosticosRes.data.forEach((pr, index) => {
        map[pr.partido_id] = {
          goles_local: pr.goles_local,
          goles_visita: pr.goles_visita,
          penales_local: pr.penales_local,
          penales_visita: pr.penales_visita
        };
        
        // Para jornada 10, si es el quinto pronóstico (la final), cargar en pronosticoFinal
        if (Number(numero) === 10 && index === 4) {
          setPronosticoFinal({
            goles_local: pr.goles_local ?? '',
            goles_visita: pr.goles_visita ?? '',
            penales_local: pr.penales_local ?? '',
            penales_visita: pr.penales_visita ?? ''
          });
        }
      });
      setPronosticos(map);

      // Cargar estadísticas (solo para fase de grupos)
      if (Number(numero) <= 6) {
        const estadisticasRes = await axios.get(`${API_URL}/api/libertadores-estadisticas/estadisticas`);
        setEstadisticas(estadisticasRes.data);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      setMensaje("❌ Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (partidoId, campo, valor) => {
    setPronosticos((prev) => ({
      ...prev,
      [partidoId]: {
        ...prev[partidoId],
        [campo]: valor === "" ? "" : Number(valor),
      },
    }));
  };

  const handleChangeFinal = (campo, valor) => {
    setPronosticoFinal(prev => ({
      ...prev,
      [campo]: valor
    }));
  };

  const borrarPronosticosJornada10 = async () => {
    if (!window.confirm('¿Estás seguro de que quieres borrar TODOS los pronósticos de esta jornada?')) {
      return;
    }
    
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      
      // Borrar todos los pronósticos de esta jornada
      await axios.delete(
        `${API_URL}/api/libertadores-pronosticos/jornada/${numero}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Resetear estados
      setPronosticos({});
      setPronosticoFinal({ goles_local: '', goles_visita: '', penales_local: '', penales_visita: '' });
      setEquiposFinalistasPronosticados([]);
      setMostrarCalcularFinalistas(false);
      setMensaje('✅ Pronósticos borrados correctamente');
      setTimeout(() => setMensaje(''), 3000);
    } catch (error) {
      console.error('Error borrando pronósticos:', error);
      setMensaje('❌ Error al borrar pronósticos');
    } finally {
      setLoading(false);
    }
  };

  const generarAleatorioTodos = () => {
    const nuevosPronosticos = {};
    partidos.forEach(partido => {
      nuevosPronosticos[partido.id] = {
        goles_local: Math.floor(Math.random() * 5), // 0 a 4
        goles_visita: Math.floor(Math.random() * 5), // 0 a 4
      };
    });
    setPronosticos(nuevosPronosticos);
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

  const handleEnviar = async () => {
    if (!jornada || jornada.cerrada) return;

    try {
      setMensaje("");
      const token = localStorage.getItem("token");

      // Para jornada 10, validar pronósticos de semifinales
      if (Number(numero) === 10) {
        const partidosSemifinal = partidos.filter((p, index) => index < 4);
        const todosSemifinalesCompletos = partidosSemifinal.every(p => 
          pronosticos[p.id]?.goles_local !== undefined && 
          pronosticos[p.id]?.goles_visita !== undefined
        );
        
        if (!todosSemifinalesCompletos) {
          setMensaje("❌ Debes completar todos los pronósticos de semifinales");
          return;
        }
        
        // Si ya hay finalistas calculados, validar que también se complete la final
        if (equiposFinalistasPronosticados.length === 2 && !pronosticoFinal.goles_local && pronosticoFinal.goles_local !== 0) {
          setMensaje("❌ Debes completar el pronóstico de la final");
          return;
        }
      }

      const respuestas = await Promise.all(
        partidos
          .filter((partido, index) => {
            // En jornada 10, solo guardar semifinales si no hay finalistas calculados
            if (Number(numero) === 10) {
              return index < 4 || equiposFinalistasPronosticados.length === 2;
            }
            return true;
          })
          .map((partido, index) => {
            // Para jornada 10, si es la final (último partido), usar pronosticoFinal
            const esLaFinal = Number(numero) === 10 && equiposFinalistasPronosticados.length === 2 && partidos.indexOf(partido) === partidos.length - 1;
            
            return axios.post(`${API_URL}/api/libertadores-pronosticos`, {
              partido_id: partido.id,
              jornada_id: jornada.id,
              goles_local: esLaFinal ? Number(pronosticoFinal.goles_local ?? 0) : Number(pronosticos[partido.id]?.goles_local ?? 0),
              goles_visita: esLaFinal ? Number(pronosticoFinal.goles_visita ?? 0) : Number(pronosticos[partido.id]?.goles_visita ?? 0),
              penales_local: esLaFinal && pronosticoFinal.penales_local ? Number(pronosticoFinal.penales_local) : null,
              penales_visita: esLaFinal && pronosticoFinal.penales_visita ? Number(pronosticoFinal.penales_visita) : null
            }, {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            });
          })
      );

      const todosOk = respuestas.every((r) => r.status === 200);
      
      if (todosOk) {
        if (Number(numero) === 10 && equiposFinalistasPronosticados.length === 0) {
          setMensaje("✅ Semifinales guardadas. Ahora calcula tus finalistas.");
        } else {
          setMensaje("✅ Pronósticos guardados correctamente");
        }
        setTimeout(() => setMensaje(""), 3000);
      } else {
        setMensaje("❌ Error al guardar algunos pronósticos");
      }
    } catch (err) {
      console.error('Error enviando pronósticos:', err);
      setMensaje("❌ Error al enviar pronósticos: " + (err.response?.data?.error || err.message));
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

  if (loading) {
    return (
      <div className="container text-center mt-5">
        <div className="spinner-border text-danger" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  if (!jornada) {
    return (
      <div className="container text-center mt-5">
        <div className="alert alert-danger">Jornada no encontrada</div>
        <button className="btn btn-primary" onClick={() => navigate("/libertadores")}>
          Volver a Libertadores
        </button>
      </div>
    );
  }

  return (
    <div className="container mt-4 mb-5">
      <div className="text-center mb-4">
        <h1 className="display-6 fw-bold text-danger">🔴 Copa Libertadores 2026</h1>
        
        <h2 className="h4 mb-1">Jornada {numero}</h2>
        <p className="text-muted small mb-3">{getSubtitulo(Number(numero))}</p>
        
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
            {/* Columna de partidos - 2/3 del ancho con 2 columnas internas */}
            <div className="col-12 col-lg-8">
              <h5 className="fw-bold mb-3">🎯 Tus Pronósticos</h5>
              <div className="row g-3 mb-4">
                {partidos
                  .filter((p, index) => Number(numero) !== 10 || index < 4) // En J10 solo mostrar semifinales
                  .map((partido) => (
                  <div key={partido.id} className="col-12 col-md-6">
                    <div className="card shadow-sm">
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h6 className="mb-0 text-muted">
                        {new Date(partido.fecha).toLocaleDateString('es-CL')} - {new Date(partido.fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </h6>
                      {partido.bonus > 1 && (
                        <span className="badge bg-warning text-dark">⭐ Bonus x{partido.bonus}</span>
                      )}
                    </div>

                    {(partido.grupo_local || partido.grupo_visita) && (
                      <div className="text-center mb-2">
                        <span className="badge bg-primary" style={{ fontSize: '0.7rem' }}>
                          GRUPO {partido.grupo_local || partido.grupo_visita}
                        </span>
                      </div>
                    )}

                    <div className="row align-items-center text-center">
                      <div className="col-5">
                        <p className="fw-bold mb-2">
                          {partido.nombre_local}
                          {partido.pais_local && <span className="text-muted ms-1">({partido.pais_local})</span>}
                        </p>
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
                        <p className="fw-bold mb-2">
                          {partido.nombre_visita}
                          {partido.pais_visita && <span className="text-muted ms-1">({partido.pais_visita})</span>}
                        </p>
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

                    {/* Mostrar inputs de penales en VUELTA de semifinales (J10) si hay empate */}
                    {Number(numero) === 10 && (() => {
                      // Detectar si es partido de VUELTA (índices 1 y 3)
                      const partidoIndex = partidos.findIndex(p => p.id === partido.id);
                      const esVuelta = partidoIndex === 1 || partidoIndex === 3;
                      
                      if (!esVuelta) return null;
                      
                      // Buscar partido de IDA
                      const partidoIda = partidos.find(p => 
                        p.nombre_local === partido.nombre_visita && 
                        p.nombre_visita === partido.nombre_local
                      );
                      
                      if (!partidoIda) return null;
                      
                      // Calcular marcador global
                      const golesIdaLocal = Number(pronosticos[partidoIda.id]?.goles_local ?? 0);
                      const golesIdaVisita = Number(pronosticos[partidoIda.id]?.goles_visita ?? 0);
                      const golesVueltaLocal = Number(pronosticos[partido.id]?.goles_local ?? 0);
                      const golesVueltaVisita = Number(pronosticos[partido.id]?.goles_visita ?? 0);
                      
                      const golesEquipoA = golesIdaLocal + golesVueltaVisita;
                      const golesEquipoB = golesIdaVisita + golesVueltaLocal;
                      
                      const hayEmpate = golesEquipoA === golesEquipoB && 
                                       (golesIdaLocal > 0 || golesIdaVisita > 0 || golesVueltaLocal > 0 || golesVueltaVisita > 0);
                      
                      if (!hayEmpate) return null;
                      
                      return (
                        <div className="mt-3">
                          <div className="alert alert-warning py-2 mb-2">
                            <small className="fw-bold">⚠️ Empate en marcador global: {partidoIda.nombre_local} {golesEquipoA} - {golesEquipoB} {partidoIda.nombre_visita}</small>
                          </div>
                          <div className="row g-2">
                            <div className="col-6">
                              <label className="form-label small fw-bold">Penales {partido.nombre_local}</label>
                              <input
                                type="number"
                                min="0"
                                className="form-control form-control-sm text-center border-danger"
                                value={pronosticos[partido.id]?.penales_local ?? ""}
                                onChange={(e) => handleChange(partido.id, "penales_local", e.target.value)}
                                disabled={jornada.cerrada}
                                placeholder="0"
                              />
                            </div>
                            <div className="col-6">
                              <label className="form-label small fw-bold">Penales {partido.nombre_visita}</label>
                              <input
                                type="number"
                                min="0"
                                className="form-control form-control-sm text-center border-danger"
                                value={pronosticos[partido.id]?.penales_visita ?? ""}
                                onChange={(e) => handleChange(partido.id, "penales_visita", e.target.value)}
                                disabled={jornada.cerrada}
                                placeholder="0"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {partido.goles_local !== null && partido.goles_visita !== null && (
                      <div className="text-center mt-3">
                        <span className="badge bg-success">
                          Resultado: {partido.goles_local} - {partido.goles_visita}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                  </div>
                ))}
              </div>

              {/* Sección especial para Jornada 10 - Botón Calcular y Finalistas */}
              {Number(numero) === 10 && partidos.length === 5 && mostrarCalcularFinalistas && equiposFinalistasPronosticados.length === 0 && (
                <div className="alert alert-info mt-4">
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

              {Number(numero) === 10 && equiposFinalistasPronosticados.length === 2 && (
                <>
                  <div className="card bg-success bg-opacity-10 border-success mt-4 mb-3">
                    <div className="card-body">
                      <h5 className="fw-bold text-success mb-3">🎯 Tus Finalistas Pronosticados</h5>
                      <p className="small text-muted">Basado en tus pronósticos de semifinales</p>
                      <div className="d-flex justify-content-center gap-4 flex-wrap">
                        {equiposFinalistasPronosticados.map((equipo, index) => (
                          <div key={index} className="text-center">
                            <div className="badge bg-success mb-2">Finalista {index + 1}</div>
                            <p className="fw-bold fs-5 mb-0">{equipo}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="card border-warning border-3 mt-3 mb-3">
                    <div className="card-body">
                      <h5 className="fw-bold text-warning mb-3 text-center">🏆 Tu Partido Final</h5>
                      <p className="fw-bold fs-5 text-center mb-4">
                        {equiposFinalistasPronosticados[0]} <span className="text-muted">vs</span> {equiposFinalistasPronosticados[1]}
                      </p>

                      <div className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label fw-bold">{equiposFinalistasPronosticados[0]} - Goles</label>
                          <input
                            type="number"
                            className="form-control"
                            placeholder="Goles"
                            value={pronosticoFinal.goles_local ?? ""}
                            onChange={(e) => handleChangeFinal("goles_local", e.target.value)}
                            disabled={jornada && jornada.cerrada}
                            min="0"
                          />
                        </div>
                        <div className="col-md-6">
                          <label className="form-label fw-bold">{equiposFinalistasPronosticados[1]} - Goles</label>
                          <input
                            type="number"
                            className="form-control"
                            placeholder="Goles"
                            value={pronosticoFinal.goles_visita ?? ""}
                            onChange={(e) => handleChangeFinal("goles_visita", e.target.value)}
                            disabled={jornada && jornada.cerrada}
                            min="0"
                          />
                        </div>
                      </div>

                      {pronosticoFinal.goles_local !== "" && 
                       pronosticoFinal.goles_visita !== "" && 
                       Number(pronosticoFinal.goles_local) === Number(pronosticoFinal.goles_visita) && (
                        <div className="mt-3">
                          <div className="alert alert-warning mb-3">
                            <strong>⚠️ Empate detectado</strong> - Debes ingresar el resultado de los penales
                          </div>
                          <div className="row g-3">
                            <div className="col-md-6">
                              <label className="form-label fw-bold">Penales {equiposFinalistasPronosticados[0]}</label>
                              <input
                                type="number"
                                className="form-control border-danger"
                                placeholder="Penales"
                                value={pronosticoFinal.penales_local ?? ""}
                                onChange={(e) => handleChangeFinal("penales_local", e.target.value)}
                                disabled={jornada && jornada.cerrada}
                                min="0"
                              />
                            </div>
                            <div className="col-md-6">
                              <label className="form-label fw-bold">Penales {equiposFinalistasPronosticados[1]}</label>
                              <input
                                type="number"
                                className="form-control border-danger"
                                placeholder="Penales"
                                value={pronosticoFinal.penales_visita ?? ""}
                                onChange={(e) => handleChangeFinal("penales_visita", e.target.value)}
                                disabled={jornada && jornada.cerrada}
                                min="0"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Columna de estadísticas - 1/3 del ancho - Solo en fase de grupos */}
            {Number(numero) <= 6 && Object.keys(estadisticas).length > 0 && (
              <div className="col-12 col-lg-4">
                <div style={{ position: 'sticky', top: '80px' }}>
                  <h5 className="fw-bold mb-3">📊 Tabla de Posiciones</h5>
                  <div className="d-flex flex-column gap-3" style={{ maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
                  {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(grupo => {
                    const equiposGrupo = estadisticas[grupo] || [];
                    if (equiposGrupo.length === 0) return null;
                    
                    return (
                      <div key={grupo} className="card shadow-sm">
                        <div className="card-header bg-danger text-white py-2">
                          <h6 className="mb-0 fw-bold">GRUPO {grupo}</h6>
                        </div>
                        <div className="card-body p-0">
                          <table className="table table-sm table-hover mb-0" style={{ fontSize: '0.8rem' }}>
                            <thead className="table-light">
                              <tr>
                                <th className="text-center" style={{ width: '25px' }}>#</th>
                                <th>Equipo</th>
                                <th className="text-center" style={{ width: '30px' }}>PJ</th>
                                <th className="text-center" style={{ width: '30px' }}>DIF</th>
                                <th className="text-center fw-bold" style={{ width: '30px' }}>PTS</th>
                              </tr>
                            </thead>
                            <tbody>
                              {equiposGrupo.map((equipo, index) => (
                                <tr key={equipo.nombre} className={index < 2 ? 'table-success' : ''}>
                                  <td className="text-center fw-bold">{equipo.posicion}</td>
                                  <td className="small">
                                    {equipo.nombre.length > 15 ? equipo.nombre.substring(0, 15) + '...' : equipo.nombre}
                                  </td>
                                  <td className="text-center">{equipo.pj}</td>
                                  <td className="text-center">{equipo.dif > 0 ? '+' : ''}{equipo.dif}</td>
                                  <td className="text-center fw-bold">{equipo.pts}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {!jornada.cerrada && (
            <div className="text-center d-flex gap-3 justify-content-center flex-wrap">
              <button className="btn btn-outline-info btn-lg px-4" onClick={generarAleatorioTodos}>
                🎲 Azar
              </button>
              <button className="btn btn-outline-secondary btn-lg px-4" onClick={resetearTodos}>
                🔄 Resetear
              </button>
              {Number(numero) === 10 && (
                <button className="btn btn-outline-danger btn-lg px-4" onClick={borrarPronosticosJornada10}>
                  🗑️ Borrar Todo
                </button>
              )}
              <button className="btn btn-danger btn-lg px-5" onClick={handleEnviar}>
                💾 Guardar Pronósticos
              </button>
              <button
                className="btn btn-outline-secondary btn-lg"
                onClick={() => navigate(`/libertadores/jornada/${Number(numero) - 1}`)}
                disabled={Number(numero) <= 1}
              >
                ← Anterior
              </button>
              <button
                className="btn btn-outline-secondary btn-lg"
                onClick={() => navigate(`/libertadores/jornada/${Number(numero) + 1}`)}
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
        <button className="btn btn-outline-secondary" onClick={() => navigate("/libertadores")}>
          ← Volver a Libertadores
        </button>
      </div>
    </div>
  );
}
