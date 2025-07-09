import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;

export default function AdminPanelSudamericana() {
  const navigate = useNavigate();
  const [rondas, setRondas] = useState([]);
  const [rondaSeleccionada, setRondaSeleccionada] = useState("");
  const [partidos, setPartidos] = useState([]);
  const [edicionCerrada, setEdicionCerrada] = useState(false); // Estado global de edición

  // Obtener rondas Sudamericana al montar y estado global de edición
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas/sudamericana/rondas`)
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
      const res = await fetch(`${API_BASE_URL}/api/jornadas/sudamericana/estado-edicion`);
      const data = await res.json();
      setEdicionCerrada(!!data.cerrada);
    } catch (err) {
      setEdicionCerrada(false);
    }
  };

  const fetchPartidos = async (ronda) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sudamericana/fixture/${encodeURIComponent(ronda)}`);
      const data = await res.json();
      const partidosConGoles = data.map(p => ({
        id: p.fixture_id,
        local: p.equipo_local,
        visita: p.equipo_visita,
        golesLocal: p.goles_local ?? "",
        golesVisita: p.goles_visita ?? "",
        bonus: p.bonus ?? 1,
      }));
      setPartidos(partidosConGoles);
    } catch (err) {
      console.error("Error al cargar partidos Sudamericana:", err);
    }
  };

  const handleCambiarGoles = (id, campo, valor) => {
    setPartidos(partidos.map(p =>
      p.id === id ? { ...p, [campo]: valor } : p
    ));
  };

  const handleCambiarBonus = (id, valor) => {
    setPartidos(partidos.map(p =>
      p.id === id ? { ...p, bonus: Number(valor) } : p
    ));
  };

  // PATCH para guardar goles y bonus
  const guardarResultados = async () => {
    if (!rondaSeleccionada) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/sudamericana/fixture/${encodeURIComponent(rondaSeleccionada)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partidos }),
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
      console.log('Estado actual edicionCerrada:', edicionCerrada);
      console.log('Enviando cerrada:', !edicionCerrada);
      
      const res = await fetch(`${API_BASE_URL}/api/jornadas/sudamericana/cerrar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cerrada: !edicionCerrada })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Error del servidor:', errorText);
        throw new Error(`Error ${res.status}: ${errorText}`);
      }
      
      const data = await res.json();
      console.log('Respuesta del servidor:', data);
      
      setEdicionCerrada(!!data.cerrada);
      if (data.cerrada) {
        alert("🔒 Edición de pronósticos cerrada para toda la Sudamericana");
      } else {
        alert("🔓 Edición de pronósticos abierta para toda la Sudamericana");
      }
    } catch (error) {
      console.error('Error completo:', error);
      alert("❌ Error al cerrar/abrir la edición de pronósticos: " + error.message);
    }
  };

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
          onChange={(e) => setRondaSeleccionada(e.target.value)}
        >
          <option value="">-- Selecciona --</option>
          {rondas.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Tabla de resultados Sudamericana */}
      {partidos.length > 0 && (
        <>
          <h5 className="mt-4">Fixture de la Ronda</h5>
          <table className="table table-bordered text-center align-middle">
            <thead className="table-secondary">
              <tr>
                <th>Local</th>
                <th>Marcador</th>
                <th>Visita</th>
                <th>Bonus</th>
              </tr>
            </thead>
            <tbody>
              {partidos.map((p) => (
                <tr key={p.id}>
                  <td>{p.local}</td>
                  <td className="d-flex justify-content-center align-items-center gap-2">
                    <input
                      type="number"
                      className="form-control text-end"
                      style={{ width: "60px" }}
                      value={p.golesLocal ?? ""}
                      onChange={(e) => handleCambiarGoles(p.id, "golesLocal", e.target.value)}
                    />
                    <span>-</span>
                    <input
                      type="number"
                      className="form-control text-start"
                      style={{ width: "60px" }}
                      value={p.golesVisita ?? ""}
                      onChange={(e) => handleCambiarGoles(p.id, "golesVisita", e.target.value)}
                    />
                  </td>
                  <td>{p.visita}</td>
                  <td>
                    <select
                      className="form-select"
                      style={{ width: "80px" }}
                      value={p.bonus ?? 1}
                      onChange={e => handleCambiarBonus(p.id, e.target.value)}
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
