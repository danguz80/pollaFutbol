import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_URL;

// Helper para obtener headers con autorización
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

// Agrupa partidos por sigla de cruce (clasificado), o por equipos involucrados si no existe o es inconsistente
function agruparPorSigla(partidos) {
  const grupos = {};
  for (const p of partidos) {
    // Si hay clasificado y es string, úsalo; si no, agrupa por equipos ordenados
    let key = p.clasificado;
    if (!key || typeof key !== 'string' || key.trim() === '') {
      // Crea una clave única para el cruce, sin importar el orden local/visita
      const equipos = [p.equipo_local, p.equipo_visita].sort();
      key = equipos.join(' vs ');
    }
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(p);
  }
  // Ordenar partidos dentro de cada grupo por fecha
  Object.values(grupos).forEach(arr => arr.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)));
  // Retornar un array de [sigla, partidos] ordenado por sigla ascendente
  return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
}

export default function AdminPanelSudamericana() {
  const navigate = useNavigate();
  const [rondas, setRondas] = useState([]);
  const [rondaSeleccionada, setRondaSeleccionada] = useState("");
  const [partidos, setPartidos] = useState([]);
  const [partidosOriginales, setPartidosOriginales] = useState([]); // Para mantener los datos originales
  const [penales, setPenales] = useState({}); // Estado para penales
  const [edicionCerrada, setEdicionCerrada] = useState(false); // Estado global de edición

  // Obtener rondas Sudamericana al montar y estado global de edición
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas/sudamericana/rondas`, {
      headers: getAuthHeaders()
    })
      .then((res) => res.json())
      .then((data) => setRondas(data))
      .catch((err) => console.error("Error al cargar rondas Sudamericana:", err));
    fetchEstadoEdicion();
  }, []);

  // Cargar partidos al seleccionar ronda
  useEffect(() => {
    if (!rondaSeleccionada) return;
    fetchPartidos(rondaSeleccionada);
  }, [rondaSeleccionada]);

  // Obtener estado global de edición de pronósticos
  const fetchEstadoEdicion = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/jornadas/sudamericana/config`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      setEdicionCerrada(!!data.edicion_cerrada);
    } catch (err) {
      setEdicionCerrada(false);
    }
  };

  const fetchPartidos = async (ronda) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/jornadas/sudamericana/fixture/${encodeURIComponent(ronda)}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      
      // Guardar partidos originales
      setPartidosOriginales(data);
      
      // Obtener equipos reales que han avanzado
      const equiposReales = await obtenerEquiposReales();
      
      // Reemplazar siglas por equipos reales
      const partidosConEquiposReales = data.map(p => ({
        id: p.fixture_id,
        fixture_id: p.fixture_id,
        equipo_local: equiposReales[p.equipo_local] || p.equipo_local,
        equipo_visita: equiposReales[p.equipo_visita] || p.equipo_visita,
        equipo_local_original: p.equipo_local, // Mantener sigla original
        equipo_visita_original: p.equipo_visita, // Mantener sigla original
        goles_local: p.goles_local ?? "",
        goles_visita: p.goles_visita ?? "",
        penales_local: p.penales_local ?? "",
        penales_visita: p.penales_visita ?? "",
        clasificado: p.clasificado,
        fecha: p.fecha,
        bonus: p.bonus ?? 1,
      }));
      
      setPartidos(partidosConEquiposReales);
      
      // Cargar penales en estado separado - siempre cargar para todos los partidos
      const penalesState = {};
      partidosConEquiposReales.forEach(p => {
        // Siempre inicializar el estado de penales para cada partido
        penalesState[p.fixture_id] = {
          local: p.penales_local || "",
          visitante: p.penales_visita || ""
        };
      });
      
      setPenales(penalesState);
    } catch (err) {
      console.error("Error al cargar partidos Sudamericana:", err);
    }
  };

  // Función para obtener los equipos reales que han avanzado
  const obtenerEquiposReales = async () => {
    try {
      // Obtener todos los partidos para calcular avances
      const allFixturesRes = await fetch(`${API_BASE_URL}/api/jornadas/sudamericana/fixture`);
      const allFixtures = await allFixturesRes.json();
      
      // Calcular avances basándose en resultados reales
      const equiposReales = calcularAvancesReales(allFixtures);
      
      return equiposReales;
    } catch (err) {
      console.error("Error al obtener equipos reales:", err);
      return {};
    }
  };

  // Función para calcular qué equipos han avanzado según los resultados reales
  const calcularAvancesReales = (fixtures) => {
    const equiposReales = {};
    
    // Primero, crear un mapeo simple: toda sigla -> equipo real basado en resultados
    for (const partido of fixtures) {
      // Si hay resultados, los equipos ya son reales (no siglas)
      if ((partido.goles_local !== null && partido.goles_visita !== null) || 
          (partido.penales_local !== null && partido.penales_visita !== null)) {
        // Si el equipo parece ser una sigla (contiene números o es muy corto), lo ignoramos
        // Si no, significa que ya es un equipo real
        if (!esSigla(partido.equipo_local)) {
          equiposReales[partido.equipo_local] = partido.equipo_local;
        }
        if (!esSigla(partido.equipo_visita)) {
          equiposReales[partido.equipo_visita] = partido.equipo_visita;
        }
      }
    }

    // Ahora hacer el cálculo de avances basado en resultados
    const ROUNDS = [
      "Knockout Round Play-offs",
      "Octavos de Final", 
      "Cuartos de Final",
      "Semifinales",
      "Final"
    ];

    // Agrupar partidos por ronda
    const rondas = {};
    for (const partido of fixtures) {
      if (!rondas[partido.ronda]) rondas[partido.ronda] = {};
      const sigla = partido.clasificado || [partido.equipo_local, partido.equipo_visita].sort().join(' vs ');
      if (!rondas[partido.ronda][sigla]) rondas[partido.ronda][sigla] = [];
      rondas[partido.ronda][sigla].push({ ...partido });
    }

    let siglaGanadorMap = {};

    // Procesar ronda por ronda para propagar ganadores
    for (let i = 0; i < ROUNDS.length; i++) {
      const ronda = ROUNDS[i];
      const cruces = rondas[ronda] || {};

      for (const [sigla, partidos] of Object.entries(cruces)) {
        // Propagar ganadores de rondas anteriores
        for (const partido of partidos) {
          if (siglaGanadorMap[partido.equipo_local]) {
            partido.equipo_local = siglaGanadorMap[partido.equipo_local];
          }
          if (siglaGanadorMap[partido.equipo_visita]) {
            partido.equipo_visita = siglaGanadorMap[partido.equipo_visita];
          }
        }

        // Solo calcular ganador si hay resultados
        const tieneResultados = partidos.some(p => 
          p.goles_local !== null && p.goles_visita !== null
        );

        if (!tieneResultados) continue;

        let eqA = partidos[0].equipo_local;
        let eqB = partidos[0].equipo_visita;
        let gA = 0, gB = 0;

        // Calcular goles según el número de partidos en el cruce
        if (partidos.length === 2) {
          // Ida y vuelta: sumar goles cruzados
          const p1 = partidos[0], p2 = partidos[1];
          gA = Number(p1.goles_local ?? 0) + Number(p2.goles_visita ?? 0);
          gB = Number(p1.goles_visita ?? 0) + Number(p2.goles_local ?? 0);
        } else {
          // Partido único (Final)
          const p = partidos[0];
          gA = Number(p.goles_local ?? 0);
          gB = Number(p.goles_visita ?? 0);
        }

        // Determinar ganador
        let ganador = null;
        
        if (gA > gB) {
          ganador = eqA;
        } else if (gB > gA) {
          ganador = eqB;
        } else {
          // Empate: usar penales del partido de vuelta o único
          let partidoConPenales = partidos.length === 2 ? partidos[1] : partidos[0];
          const penLocal = Number(partidoConPenales.penales_local ?? 0);
          const penVisitante = Number(partidoConPenales.penales_visita ?? 0);
          
          const equipoLocal = partidoConPenales.equipo_local;
          const equipoVisitante = partidoConPenales.equipo_visita;
          
          if (penLocal > penVisitante) {
            ganador = equipoLocal;
          } else if (penVisitante > penLocal) {
            ganador = equipoVisitante;
          }
        }

        // Actualizar mapeo para próximas rondas y para siglas específicas
        if (ganador) {
          siglaGanadorMap[sigla] = ganador;
          
          // Mapear todas las siglas que aparezcan en partidos futuros
          for (const futurePartido of fixtures) {
            if (futurePartido.equipo_local === sigla) {
              equiposReales[sigla] = ganador;
            }
            if (futurePartido.equipo_visita === sigla) {
              equiposReales[sigla] = ganador;
            }
          }
        }
      }
    }

    return equiposReales;
  };

  // Función auxiliar para detectar si es una sigla
  const esSigla = (texto) => {
    if (!texto) return false;
    // Detectar patrones de siglas como WC1, WS1, WO.A, etc.
    return /^W[A-Z][0-9A-Z]*\.?[A-Z0-9]*$/.test(texto) || texto.length <= 3;
  };

  const handleCambiarGoles = (id, campo, valor) => {
    setPartidos(partidos.map(p =>
      p.id === id ? { ...p, [campo]: valor } : p
    ));
  };

  const handleCambiarPenales = (fixtureId, posicion, valor) => {
    setPenales(prev => ({
      ...prev,
      [fixtureId]: {
        ...prev[fixtureId],
        [posicion]: valor
      }
    }));
  };

  const handleCambiarBonus = (id, valor) => {
    setPartidos(partidos.map(p =>
      p.id === id ? { ...p, bonus: Number(valor) } : p
    ));
  };

  // PATCH para guardar goles, penales y bonus
  const guardarResultados = async () => {
    if (!rondaSeleccionada) return;
    try {
      const token = localStorage.getItem("token");
      
      // Combinar goles, penales y bonus en un solo objeto por partido
      const partidosConPenales = partidos.map(p => ({
        id: p.id,
        golesLocal: p.goles_local,
        golesVisita: p.goles_visita,
        bonus: p.bonus,
        penalesLocal: penales[p.fixture_id]?.local ?? "",
        penalesVisita: penales[p.fixture_id]?.visitante ?? ""
      }));
      
      const res = await fetch(`${API_BASE_URL}/api/jornadas/sudamericana/fixture/${encodeURIComponent(rondaSeleccionada)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ partidos: partidosConPenales }),
      });
      const data = await res.json();
      alert(data.mensaje || "Resultados guardados en la base de datos");
      fetchPartidos(rondaSeleccionada);
    } catch (error) {
      console.error("Error al guardar resultados Sudamericana:", error);
      alert("❌ Error al guardar resultados");
    }
  };

  // PATCH para actualizar desde API
  const actualizarDesdeAPI = async () => {
    if (!rondaSeleccionada) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/jornadas/sudamericana/${rondaSeleccionada}/resultados`, {
        method: "PATCH"
      });
      const data = await res.json();
      alert(`✅ ${data.mensaje}: ${data.actualizados ?? ""} partidos actualizados.`);
      fetchPartidos(rondaSeleccionada);
    } catch (error) {
      alert("❌ Error al actualizar desde la API");
      console.error(error);
    }
  };

  // POST para calcular puntajes de la jornada seleccionada
  const calcularPuntajes = async () => {
    if (!rondaSeleccionada) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/sudamericana/pronosticos/calcular/${rondaSeleccionada}`, {
        method: "POST"
      });
      const data = await res.json();
      alert(`✅ Puntajes recalculados: ${data.actualizados ?? ""} pronósticos actualizados`);
    } catch (error) {
      alert("❌ Error al recalcular puntajes");
      console.error(error);
    }
  };

  // PATCH cerrar/abrir edición de pronósticos (global)
  const toggleCierreEdicion = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/jornadas/sudamericana/cerrar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cerrada: !edicionCerrada })
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Error ${res.status}: ${errorText}`);
      }
      const data = await res.json();
      setEdicionCerrada(!!data.edicion_cerrada);
      if (data.edicion_cerrada) {
        alert("🔒 Edición de pronósticos cerrada para toda la Sudamericana");
      } else {
        alert("🔓 Edición de pronósticos abierta para toda la Sudamericana");
      }
    } catch (error) {
      alert("❌ Error al cerrar/abrir la edición de pronósticos: " + error.message);
    }
  };

  // Función para calcular global y empate en un cruce
  function getGlobalYEmpate(partidos) {
    if (partidos.length === 1) {
      // PARTIDO ÚNICO (como la Final)
      const p = partidos[0];
      const eqA = p.equipo_local;
      const eqB = p.equipo_visita;
      const totalA = Number(p.goles_local ?? 0);
      const totalB = Number(p.goles_visita ?? 0);
      
      return { eqA, eqB, totalA, totalB, empate: totalA === totalB };
    } else if (partidos.length === 2) {
      // IDA Y VUELTA
      const p1 = partidos[0], p2 = partidos[1];
      const eqA = p1.equipo_local;
      const eqB = p1.equipo_visita;
      
      // eqA: local en ida + visitante en vuelta
      // eqB: visitante en ida + local en vuelta
      const totalA = Number(p1.goles_local ?? 0) + Number(p2.goles_visita ?? 0);
      const totalB = Number(p1.goles_visita ?? 0) + Number(p2.goles_local ?? 0);
      
      return { eqA, eqB, totalA, totalB, empate: totalA === totalB };
    } else {
      return { empate: false };
    }
  }

  return (
    <div className="container mt-4">
      <h2>⚙️ Panel de Administración Sudamericana</h2>
      <div className="mb-3 d-flex gap-2">
        <button onClick={() => navigate("/admin/usuarios-sudamericana")}
          className="btn btn-success">
          ✅ Activar usuarios Sudamericana
        </button>
      </div>

      {/* Botón cerrar/abrir edición de pronósticos (global) */}
      <div className="mb-3">
        <button
          className={`btn ${edicionCerrada ? "btn-danger" : "btn-outline-success"}`}
          onClick={toggleCierreEdicion}
        >
          {edicionCerrada ? "🔓 Abrir edición de pronósticos (toda la Sudamericana)" : "🔒 Cerrar edición de pronósticos (toda la Sudamericana)"}
        </button>
      </div>

      {/* Selector de ronda */}
      <div className="mb-3">
        <label className="form-label">Selecciona Ronda:</label>
        <select
          className="form-select"
          value={rondaSeleccionada}
          onChange={(e) => {
            setRondaSeleccionada(e.target.value);
          }}
        >
          <option value="">-- Selecciona --</option>
          {rondas.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Fixture agrupado por cruces */}
      {partidos.length > 0 && (
        <>
          <h5 className="mt-4">Fixture de la Ronda - {rondaSeleccionada}</h5>
          {agruparPorSigla(partidos).map(([sigla, partidosCruce]) => {
            // Calcular global y empate para este cruce
            const { eqA, eqB, totalA, totalB, empate } = getGlobalYEmpate(partidosCruce);
            // Obtener fixture_id del partido de vuelta (más alto) para penales
            const fixtureIdVuelta = partidosCruce.length === 2 ? 
              Math.max(...partidosCruce.map(p => Number(p.fixture_id))) : 
              partidosCruce[0].fixture_id;
            
            return (
              <div key={sigla} className="mb-4 border p-3 rounded">
                <h6 className="mb-3">
                  Cruce {sigla}
                  {partidosCruce.some(p => p.equipo_local_original !== p.equipo_local || p.equipo_visita_original !== p.equipo_visita) && (
                    <small className="text-muted ms-2">(Equipos calculados automáticamente)</small>
                  )}
                </h6>
                <table className="table table-bordered text-center mb-2">
                  <thead className="table-secondary">
                    <tr>
                      <th>Fecha</th>
                      <th>Local</th>
                      <th>Marcador</th>
                      <th>Visita</th>
                      <th>Bonus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partidosCruce.map(partido => (
                      <tr key={partido.fixture_id}>
                        <td>{new Date(partido.fecha).toLocaleDateString()}</td>
                        <td>
                          <div>
                            <strong>{partido.equipo_local}</strong>
                            {partido.equipo_local_original !== partido.equipo_local && (
                              <small className="text-muted d-block">({partido.equipo_local_original})</small>
                            )}
                          </div>
                        </td>
                        <td className="d-flex justify-content-center align-items-center gap-2">
                          <input
                            type="number"
                            className="form-control text-end"
                            style={{ width: "60px" }}
                            value={partido.goles_local ?? ""}
                            onChange={(e) => handleCambiarGoles(partido.id, "goles_local", e.target.value)}
                          />
                          <span>-</span>
                          <input
                            type="number"
                            className="form-control text-start"
                            style={{ width: "60px" }}
                            value={partido.goles_visita ?? ""}
                            onChange={(e) => handleCambiarGoles(partido.id, "goles_visita", e.target.value)}
                          />
                        </td>
                        <td>
                          <div>
                            <strong>{partido.equipo_visita}</strong>
                            {partido.equipo_visita_original !== partido.equipo_visita && (
                              <small className="text-muted d-block">({partido.equipo_visita_original})</small>
                            )}
                          </div>
                        </td>
                        <td>
                          <select
                            className="form-select"
                            style={{ width: "80px" }}
                            value={partido.bonus ?? 1}
                            onChange={e => handleCambiarBonus(partido.id, e.target.value)}
                          >
                            <option value={1}>x1</option>
                            <option value={2}>x2</option>
                            <option value={3}>x3</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* Mostrar global del cruce */}
                <div className="mb-2">
                  <strong>Global:</strong> {eqA} {totalA ?? "-"} - {totalB ?? "-"} {eqB}
                  {empate && (
                    <span className="ms-3 text-danger">⚽ Empate global, definir por penales:</span>
                  )}
                </div>
                
                {/* Inputs de penales si hay empate */}
                {empate && (
                  <div className="mb-2 d-flex align-items-center gap-2">
                    <span>{eqA} penales: </span>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      style={{ width: "60px" }}
                      value={(() => {
                        const valor = partidosCruce.length === 2 ? 
                          penales[fixtureIdVuelta]?.visitante ?? "" : 
                          penales[fixtureIdVuelta]?.local ?? "";
                        return valor;
                      })()}
                      onChange={e => handleCambiarPenales(fixtureIdVuelta, 
                        partidosCruce.length === 2 ? "visitante" : "local", 
                        e.target.value)}
                    />
                    <span className="mx-2">-</span>
                    <span>{eqB} penales: </span>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      style={{ width: "60px" }}
                      value={(() => {
                        const valor = partidosCruce.length === 2 ? 
                          penales[fixtureIdVuelta]?.local ?? "" : 
                          penales[fixtureIdVuelta]?.visitante ?? "";
                        return valor;
                      })()}
                      onChange={e => handleCambiarPenales(fixtureIdVuelta, 
                        partidosCruce.length === 2 ? "local" : "visitante", 
                        e.target.value)}
                    />
                  </div>
                )}
              </div>
            );
          })}

          <div className="d-flex justify-content-between mt-3 gap-2">
            <button className="btn btn-warning" onClick={actualizarDesdeAPI}>
              🔄 Actualizar Resultados desde API
            </button>
            <button className="btn btn-primary" onClick={calcularPuntajes}>
              🧮 Calcular Puntaje Jornada
            </button>
            <button className="btn btn-success" onClick={guardarResultados}>
              ✅ Guardar Resultados Manuales
            </button>
          </div>
        </>
      )}

      {/* Sección para configurar cierre automático de edición de pronósticos */}
      <div className="mt-5 p-3 border rounded bg-light">
        <h5>⏰ Configurar cierre automático de edición de pronósticos</h5>
        <ConfigurarCierreAutomaticoSudamericana
          API_BASE_URL={API_BASE_URL}
          edicionCerrada={edicionCerrada}
          setEdicionCerrada={setEdicionCerrada}
        />
      </div>
    </div>
  );
}

// Componente para configurar y mostrar cuenta regresiva de cierre automático
function ConfigurarCierreAutomaticoSudamericana({ API_BASE_URL, edicionCerrada, setEdicionCerrada }) {
  const [fechaCierre, setFechaCierre] = useState("");
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const [now, setNow] = useState(Date.now());

  // Traer fecha/hora de cierre actual al montar
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas/sudamericana/fecha-cierre`)
      .then(res => res.json())
      .then(data => {
        if (data.fecha_cierre) setFechaCierre(data.fecha_cierre.slice(0, 16)); // formato yyyy-MM-ddTHH:mm
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Actualizar reloj cada segundo
  useEffect(() => {
    if (!fechaCierre) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [fechaCierre]);

  // Calcular tiempo restante
  let tiempoRestante = null;
  let cerradoPorFecha = false;
  if (fechaCierre) {
    const cierreMs = new Date(fechaCierre).getTime();
    const diff = cierreMs - now;
    if (diff <= 0) {
      tiempoRestante = "00:00:00";
      cerradoPorFecha = true;
    } else {
      const horas = Math.floor(diff / 3600000);
      const minutos = Math.floor((diff % 3600000) / 60000);
      const segundos = Math.floor((diff % 60000) / 1000);
      tiempoRestante = `${horas.toString().padStart(2, "0")}:${minutos.toString().padStart(2, "0")}:${segundos.toString().padStart(2, "0")}`;
    }
  }

  // Cerrar edición automáticamente si llega a 0
  useEffect(() => {
    if (cerradoPorFecha && !edicionCerrada) {
      fetch(`${API_BASE_URL}/api/jornadas/sudamericana/cerrar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cerrada: true })
      })
        .then(res => res.json())
        .then(() => setEdicionCerrada(true));
    }
  }, [cerradoPorFecha, edicionCerrada, API_BASE_URL, setEdicionCerrada]);

  // Guardar nueva fecha/hora de cierre
  const handleGuardarFecha = async () => {
    setMensaje("");
    if (!fechaCierre) {
      setMensaje("Debes ingresar una fecha y hora válida");
      return;
    }
    setLoading(true);
    const res = await fetch(`${API_BASE_URL}/api/jornadas/sudamericana/fecha-cierre`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha_cierre: fechaCierre })
    });
    const data = await res.json();
    setLoading(false);
    if (data.ok) setMensaje("Fecha/hora de cierre guardada correctamente");
    else setMensaje("Error al guardar la fecha/hora de cierre");
  };

  return (
    <div>
      <div className="mb-2">
        <label className="form-label">Fecha y hora de cierre (zona servidor):</label>
        <input
          type="datetime-local"
          className="form-control w-auto d-inline-block ms-2"
          value={fechaCierre}
          onChange={e => setFechaCierre(e.target.value)}
          disabled={loading}
        />
        <button className="btn btn-primary ms-2" onClick={handleGuardarFecha} disabled={loading}>
          Guardar fecha/hora
        </button>
      </div>
      {fechaCierre && (
        <div className="mb-2">
          <strong>Cuenta regresiva:</strong> <span className="fs-5 text-danger">{tiempoRestante}</span>
          {cerradoPorFecha && <span className="ms-2 text-success">Edición cerrada automáticamente</span>}
        </div>
      )}
      {mensaje && <div className="alert alert-info mt-2">{mensaje}</div>}
    </div>
  );
}
