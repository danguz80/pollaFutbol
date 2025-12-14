import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import JornadaSelector from "../components/JornadaSelector";
import AccesosDirectos from "../components/AccesosDirectos";
import CuentaRegresivaGlobal from "../components/CuentaRegresivaGlobal";

// Accede a la variable de entorno
const API_BASE_URL = import.meta.env.VITE_API_URL;


// Hook local para obtener usuario desde localStorage
function useAuth() {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuario"));
    return usuario;
  } catch {
    return null;
  }
}

export default function Jornada() {
  const usuario = useAuth();
  const navigate = useNavigate();

  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState(null); // el número de la jornada
  const [jornadaIdSeleccionada, setJornadaIdSeleccionada] = useState(null); // el ID real de la jornada
  const [partidos, setPartidos] = useState([]);
  const [pronosticos, setPronosticos] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [cerrada, setCerrada] = useState(false); // Estado de cierre
  const [loading, setLoading] = useState(false);
  
  // Estados para jornada 10 (semifinales y final)
  const [equiposFinalistasPronosticados, setEquiposFinalistasPronosticados] = useState([]);
  const [partidoFinal, setPartidoFinal] = useState(null);
  const [pronosticoFinal, setPronosticoFinal] = useState({ goles_local: '', goles_visita: '', penales_local: '', penales_visita: '' });

  // Si no es jugador, fuera
  useEffect(() => {
    if (!usuario) return;
    if (usuario.rol !== "jugador") {
      navigate("/");
    }
  }, [usuario, navigate]);

  // Cargar jornadas disponibles
  useEffect(() => {
    // Usar la variable de entorno para la URL del backend
    fetch(`${API_BASE_URL}/api/jornadas`)
      .then((res) => res.json())
      .then(setJornadas)
      .catch((err) => console.error("Error al cargar jornadas", err));
  }, []);

  // Cuando cambia jornadaSeleccionada, obtenemos el id real y los datos
  useEffect(() => {
    if (!jornadaSeleccionada) return;
    setLoading(true);

    // Buscar el id real en jornadas
    const jornadaObj = jornadas.find(j => String(j.numero) === String(jornadaSeleccionada));
    setJornadaIdSeleccionada(jornadaObj ? jornadaObj.id : null);

    // 1. Cargar partidos
    // Usar la variable de entorno para la URL del backend
    fetch(`${API_BASE_URL}/api/jornadas/${jornadaSeleccionada}/partidos`)
      .then((res) => res.json())
      .then(setPartidos)
      .catch((err) => {
        setPartidos([]);
        console.error("Error al cargar partidos", err);
      });

    // 2. Cargar pronósticos guardados
    const token = localStorage.getItem("token");
    // Usar la variable de entorno para la URL del backend
    fetch(`${API_BASE_URL}/api/pronosticos/${jornadaSeleccionada}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(pronosticosDb => {
        const map = {};
        pronosticosDb.forEach(pr => {
          map[pr.partido_id] = {
            goles_local: pr.goles_local,
            goles_visita: pr.goles_visita,
            penales_local: pr.penales_local,
            penales_visita: pr.penales_visita
          };
        });
        setPronosticos(map);
        
        // Para jornada 10, cargar el pronóstico de la final si existe
        if (jornadaSeleccionada === 10 && pronosticosDb.length === 5) {
          const pronosticoFinalDb = pronosticosDb[4]; // El quinto pronóstico es la final
          if (pronosticoFinalDb) {
            setPronosticoFinal({
              goles_local: pronosticoFinalDb.goles_local ?? '',
              goles_visita: pronosticoFinalDb.goles_visita ?? '',
              penales_local: pronosticoFinalDb.penales_local ?? '',
              penales_visita: pronosticoFinalDb.penales_visita ?? ''
            });
          }
        }
        
        setLoading(false);
      })
      .catch(() => {
        setPronosticos({});
        setLoading(false);
      });

    // 3. Cargar si está cerrada
    // Usar la variable de entorno para la URL del backend
    fetch(`${API_BASE_URL}/api/jornadas/${jornadaSeleccionada}`)
      .then(res => res.json())
      .then(j => setCerrada(!!j.cerrada))
      .catch(() => setCerrada(false));
  }, [jornadaSeleccionada, jornadas]);

  // Calcular finalistas basados en pronósticos del usuario (solo jornada 10)
  useEffect(() => {
    if (jornadaSeleccionada !== 10 || partidos.length === 0) {
      setEquiposFinalistasPronosticados([]);
      setPartidoFinal(null);
      return;
    }

    console.log('🔍 Calculando finalistas - Partidos:', partidos.length);
    console.log('🔍 Pronósticos actuales:', pronosticos);

    // Identificar partidos de semifinal vs final
    // Ahora el partido final siempre existe (creado automáticamente por el backend)
    const partidosSemifinal = partidos.slice(0, 4); // Primeros 4 son semifinales
    
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

    // Verificar que haya al menos un pronóstico ingresado
    const hayPronosticos = partidosSemifinal.some(p => 
      pronosticos[p.id] && 
      (pronosticos[p.id].goles_local !== undefined || pronosticos[p.id].goles_visita !== undefined)
    );

    if (!hayPronosticos) {
      console.log('⚠️ No hay pronósticos ingresados todavía');
      setEquiposFinalistasPronosticados([]);
      setPartidoFinal(null);
      return;
    }

    // Calcular ganadores basados en PRONÓSTICOS del usuario
    const ganadores = [];
    
    // Separar IDA y VUELTA
    const partidosIda = [partidosSemifinal[0], partidosSemifinal[2]];
    const partidosVuelta = [partidosSemifinal[1], partidosSemifinal[3]];
    
    partidosIda.forEach((ida, index) => {
      const vuelta = partidosVuelta[index];
      
      console.log(`\n🏟️ Semifinal ${index + 1}:`);
      console.log(`  IDA: ${ida.local} vs ${ida.visita}`);
      console.log(`  VUELTA: ${vuelta.local} vs ${vuelta.visita}`);
      
      // Obtener pronósticos o valores por defecto
      const golesIdaLocal = Number(pronosticos[ida.id]?.goles_local ?? 0);
      const golesIdaVisita = Number(pronosticos[ida.id]?.goles_visita ?? 0);
      const golesVueltaLocal = Number(pronosticos[vuelta.id]?.goles_local ?? 0);
      const golesVueltaVisita = Number(pronosticos[vuelta.id]?.goles_visita ?? 0);
      
      console.log(`  Pronóstico IDA: ${golesIdaLocal}-${golesIdaVisita}`);
      console.log(`  Pronóstico VUELTA: ${golesVueltaLocal}-${golesVueltaVisita}`);
      
      // Penales si existen
      const penalesVueltaLocal = Number(pronosticos[vuelta.id]?.penales_local ?? 0);
      const penalesVueltaVisita = Number(pronosticos[vuelta.id]?.penales_visita ?? 0);
      
      // Calcular marcador global
      const golesEquipoLocal = golesIdaLocal + golesVueltaVisita;
      const golesEquipoVisita = golesIdaVisita + golesVueltaLocal;
      
      console.log(`  Marcador global: ${ida.local} ${golesEquipoLocal} - ${golesEquipoVisita} ${ida.visita}`);
      
      let ganador = null;
      
      if (golesEquipoLocal > golesEquipoVisita) {
        ganador = ida.local;
      } else if (golesEquipoVisita > golesEquipoLocal) {
        ganador = ida.visita;
      } else {
        // Empate - revisar penales
        if (penalesVueltaLocal > 0 || penalesVueltaVisita > 0) {
          ganador = penalesVueltaLocal > penalesVueltaVisita ? vuelta.local : vuelta.visita;
          console.log(`  Definido por penales: ${penalesVueltaLocal}-${penalesVueltaVisita}`);
        } else {
          // Si no hay penales, poner al equipo local por defecto
          ganador = ida.local;
          console.log(`  ⚠️ Empate sin penales - ganador por defecto: ${ganador}`);
        }
      }
      
      console.log(`  ✅ Ganador: ${ganador}`);
      
      if (ganador) {
        ganadores.push(ganador);
      }
    });
    
    console.log('\n🎯 Finalistas calculados:', ganadores);
    
    // Buscar el partido de la final (siempre el último partido)
    const partidoFinalEncontrado = partidos[partidos.length - 1];
    console.log('🏆 Partido final encontrado:', partidoFinalEncontrado);
    
    setEquiposFinalistasPronosticados(ganadores);
    setPartidoFinal(partidoFinalEncontrado);
  }, [jornadaSeleccionada, partidos, pronosticos]);

  const handleChange = (partidoId, campo, valor) => {
    setPronosticos((prev) => ({
      ...prev,
      [partidoId]: {
        ...prev[partidoId],
        [campo]: valor,
      },
    }));
  };

  const handleChangeFinal = (campo, valor) => {
    setPronosticoFinal(prev => ({
      ...prev,
      [campo]: valor
    }));
  };

  const handleEnviar = async () => {
    if (cerrada) return; // Seguridad extra
    try {
      setMensaje("");
      const token = localStorage.getItem("token");

      // Usamos jornadaIdSeleccionada
      if (!jornadaIdSeleccionada) {
        setMensaje("❌ Error interno: no se pudo determinar el ID de la jornada");
        return;
      }

      // Para jornada 10, validar que se hayan pronosticado las semifinales y la final
      if (jornadaSeleccionada === 10) {
        const partidosSemifinal = partidos.filter((p, index) => index < 4);
        const todosSemifinalesCompletos = partidosSemifinal.every(p => 
          pronosticos[p.id]?.goles_local !== undefined && 
          pronosticos[p.id]?.goles_visita !== undefined
        );
        
        if (!todosSemifinalesCompletos) {
          setMensaje("❌ Debes completar todos los pronósticos de semifinales");
          return;
        }
        
        if (!pronosticoFinal.goles_local && pronosticoFinal.goles_local !== 0) {
          setMensaje("❌ Debes completar el pronóstico de la final");
          return;
        }
      }

      const respuestas = await Promise.all(
        partidos.map((partido, index) => {
          // Para jornada 10, si es la final (index 4), usar pronosticoFinal
          const esLaFinal = jornadaSeleccionada === 10 && index === 4;
          
          return fetch(`${API_BASE_URL}/api/pronosticos`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              partido_id: partido.id,
              jornada_id: jornadaIdSeleccionada,
              goles_local: esLaFinal ? Number(pronosticoFinal.goles_local ?? 0) : Number(pronosticos[partido.id]?.goles_local ?? 0),
              goles_visita: esLaFinal ? Number(pronosticoFinal.goles_visita ?? 0) : Number(pronosticos[partido.id]?.goles_visita ?? 0),
              penales_local: esLaFinal && pronosticoFinal.penales_local ? Number(pronosticoFinal.penales_local) : null,
              penales_visita: esLaFinal && pronosticoFinal.penales_visita ? Number(pronosticoFinal.penales_visita) : null
            }),
          });
        })
      );
      const todosOk = respuestas.every((r) => r.ok);
      setMensaje(todosOk ? "✅ Pronósticos guardados correctamente" : "❌ Error al guardar algunos pronósticos");
    } catch (err) {
      setMensaje("❌ Error al enviar pronósticos");
    }
  };

  if (!usuario) return <p className="text-center mt-5">Cargando...</p>;

  return (
    <div className="container mt-4">
      <h2>📅 Ingresar Pronósticos</h2>
      <AccesosDirectos />
      <CuentaRegresivaGlobal />
      <JornadaSelector
        jornadas={jornadas}
        onSelect={setJornadaSeleccionada}
      />

      {jornadaSeleccionada && (
        <>
          <h5 className="mt-4 mb-3">Jornada {jornadaSeleccionada}</h5>

          {cerrada && (
            <div className="alert alert-danger mb-3">
              <strong>Esta jornada está cerrada.</strong> Ya no puedes modificar tus pronósticos.
            </div>
          )}

          {loading ? (
            <div className="text-center">Cargando partidos...</div>
          ) : (
            <>
              {partidos
                .filter((p, index) => jornadaSeleccionada !== 10 || index < 4) // En J10 solo mostrar semifinales
                .map((p) => (
                  <div key={p.id} className="border p-3 mb-3 rounded">
                    <strong>{p.local} vs {p.visita}</strong><br />
                    <div className="row mt-2">
                      <div className="col">
                        <input
                          type="number"
                          className="form-control"
                          placeholder="Goles local"
                          value={pronosticos[p.id]?.goles_local ?? ""}
                          onChange={(e) => handleChange(p.id, "goles_local", e.target.value)}
                          disabled={cerrada}
                        />
                      </div>
                      <div className="col">
                        <input
                          type="number"
                          className="form-control"
                          placeholder="Goles visita"
                          value={pronosticos[p.id]?.goles_visita ?? ""}
                          onChange={(e) => handleChange(p.id, "goles_visita", e.target.value)}
                          disabled={cerrada}
                        />
                      </div>
                    </div>
                  </div>
                ))}

              {/* Sección especial para Jornada 10 - Finalistas y Final */}
              {jornadaSeleccionada === 10 && equiposFinalistasPronosticados.length === 2 && (
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

                  {/* Card de Partido Final */}
                  <div className="card border-warning border-3 mt-3 mb-3">
                    <div className="card-body">
                      <h5 className="fw-bold text-warning mb-3 text-center">
                        🏆 Tu Partido Final
                      </h5>
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
                            disabled={cerrada}
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
                            disabled={cerrada}
                            min="0"
                          />
                        </div>
                      </div>

                      {/* Mostrar inputs de penales si hay empate */}
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
                                disabled={cerrada}
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
                                disabled={cerrada}
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
            </>
          )}

          {mensaje && <div className="alert alert-info mt-3">{mensaje}</div>}

          {partidos.length > 0 && (
            <div className="d-flex gap-2 mt-3">
              <button
                className="btn btn-success flex-grow-1"
                onClick={handleEnviar}
                disabled={cerrada || loading}
              >
                Guardar Pronósticos
              </button>
              <button
                className="btn btn-outline-secondary"
                onClick={() => setJornadaSeleccionada(jornadaSeleccionada - 1)}
                disabled={jornadaSeleccionada <= 1}
              >
                ← Anterior
              </button>
              <button
                className="btn btn-outline-secondary"
                onClick={() => setJornadaSeleccionada(jornadaSeleccionada + 1)}
                disabled={jornadaSeleccionada >= Math.max(...jornadas.map(j => j.numero))}
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
