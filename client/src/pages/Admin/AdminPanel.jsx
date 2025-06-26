import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// Accede a la variable de entorno
const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;

export default function AdminPanel() {
  const navigate = useNavigate();
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState("");
  const [partidos, setPartidos] = useState([]);
  const [jornadaCerrada, setJornadaCerrada] = useState(false); // <--- CORREGIDO

  // Obtener jornadas al montar
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas`)
      .then((res) => res.json())
      .then((data) => setJornadas(data))
      .catch((err) => console.error("Error al cargar jornadas:", err));
  }, []);

  // Cargar partidos y estado cerrada al seleccionar jornada
  useEffect(() => {
    if (!jornadaSeleccionada) return;
    fetchPartidos(jornadaSeleccionada);
    fetchJornadaInfo(jornadaSeleccionada);
  }, [jornadaSeleccionada]);

  const fetchPartidos = async (numero) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/jornadas/${numero}/partidos`);
      const data = await res.json();
      const partidosConGoles = data.map(p => ({
        id: p.id,
        local: p.local,
        visita: p.visita,
        golesLocal: p.goles_local ?? "",
        golesVisita: p.goles_visita ?? "",
        bonus: p.bonus ?? 1,
      }));
      setPartidos(partidosConGoles);
    } catch (err) {
      console.error("Error al cargar partidos:", err);
    }
  };

  // Traer info si está cerrada la jornada
  const fetchJornadaInfo = async (numero) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/jornadas/${numero}`);
      const data = await res.json();
      setJornadaCerrada(!!data.cerrada); // <--- CORREGIDO
    } catch (err) {
      setJornadaCerrada(false); // <--- CORREGIDO
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
    if (!jornadaSeleccionada) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/jornadas/${jornadaSeleccionada}/partidos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partidos }),
      });
      const data = await res.json();
      alert(data.mensaje || "Resultados guardados en la base de datos");
      fetchPartidos(jornadaSeleccionada);
    } catch (error) {
      console.error("Error al guardar resultados:", error);
      alert("❌ Error al guardar resultados");
    }
  };

  // PATCH para actualizar desde API
  const actualizarDesdeAPI = async () => {
    if (!jornadaSeleccionada) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/jornadas/${jornadaSeleccionada}/resultados`, {
        method: "PATCH"
      });
      const data = await res.json();
      alert(`✅ ${data.mensaje}: ${data.actualizados ?? ""} partidos actualizados.`);
      fetchPartidos(jornadaSeleccionada);
    } catch (error) {
      alert("❌ Error al actualizar desde la API");
      console.error(error);
    }
  };

  // POST para calcular puntajes de la jornada seleccionada
  const calcularPuntajes = async () => {
    if (!jornadaSeleccionada) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/pronosticos/calcular/${jornadaSeleccionada}`, {
        method: "POST"
      });
      const data = await res.json();
      alert(`✅ Puntajes recalculados: ${data.actualizados ?? ""} pronósticos actualizados`);
    } catch (error) {
      alert("❌ Error al recalcular puntajes");
      console.error(error);
    }
  };

  // PATCH para actualizar resultados + puntajes
  const actualizarResultadosYPuntajes = async () => {
    if (!jornadaSeleccionada) return;
    try {
      const res1 = await fetch(`${API_BASE_URL}/api/jornadas/${jornadaSeleccionada}/resultados`, {
        method: "PATCH"
      });
      const data1 = await res1.json();

      const res2 = await fetch(`${API_BASE_URL}/api/pronosticos/calcular/${jornadaSeleccionada}`, {
        method: "POST"
      });
      const data2 = await res2.json();

      alert(
        `✅ Resultados actualizados: ${data1.actualizados ?? ""}\n` +
        `✅ Puntajes recalculados: ${data2.actualizados ?? ""} pronósticos actualizados`
      );
      fetchPartidos(jornadaSeleccionada);
    } catch (error) {
      alert("❌ Error al actualizar resultados y puntajes");
      console.error(error);
    }
  };

  // PATCH cerrar/abrir jornada
  const toggleCierreJornada = async () => {
    if (!jornadaSeleccionada) return;
    try {
      const jornada = jornadas.find(j => String(j.numero) === String(jornadaSeleccionada));
      if (!jornada) {
        alert("No se encontró la jornada");
        return;
      }
      const res = await fetch(`${API_BASE_URL}/api/jornadas/${jornada.id}/cerrar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cerrada: !jornadaCerrada }) // <--- CORREGIDO
      });
      const data = await res.json();
      setJornadaCerrada(!!data.jornada?.cerrada); // <--- CORREGIDO
      if (data.jornada?.cerrada) {
        alert("🔒 Jornada cerrada");
      } else {
        alert("🔓 Jornada abierta");
      }
    } catch (error) {
      alert("❌ Error al cerrar/abrir la jornada");
      console.error(error);
    }
  };

  // PATCH actualizar ganadores
  const actualizarGanadores = async () => {
    if (!jornadaSeleccionada) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/jornadas/${jornadaSeleccionada}/ganadores`, {
        method: "PATCH"
      });
      const data = await res.json();
      if (res.ok) {
        alert("✅ Ganadores recalculados y guardados correctamente");
      } else {
        alert(data.error || "❌ Error al actualizar ganadores");
      }
    } catch (error) {
      alert("❌ Error de conexión al actualizar ganadores");
      console.error(error);
    }
  };

  return (
    <div className="container mt-4">
      <h2>⚙️ Panel de Administración</h2>
      <div className="mb-3 d-flex gap-2">
        <button onClick={() => navigate("/admin/usuarios")} className="btn btn-success">
          ✅ Activar usuarios registrados
        </button>
        <button onClick={() => navigate("/admin/chile-fixtures")} className="btn btn-outline-secondary">
          📅 Ver Partidos Liga Chilena
        </button>
      </div>

      {/* Selector de jornada */}
      <div className="mb-3">
        <label className="form-label">Selecciona Jornada:</label>
        <select
          className="form-select"
          value={jornadaSeleccionada}
          onChange={(e) => setJornadaSeleccionada(e.target.value)}
        >
          <option value="">-- Selecciona --</option>
          {jornadas.map((j) => (
            <option key={j.id} value={j.numero}>
              Jornada {j.numero}
            </option>
          ))}
        </select>
      </div>

      {/* Botón cerrar/abrir jornada */}
      {jornadaSeleccionada && (
        <div className="mb-3">
          <button
            className={`btn ${jornadaCerrada ? "btn-danger" : "btn-outline-success"}`}
            onClick={toggleCierreJornada}
          >
            {jornadaCerrada ? "🔓 Abrir Jornada" : "🔒 Cerrar Jornada"}
          </button>
        </div>
      )}

      {/* Tabla de resultados */}
      {partidos.length > 0 && (
        <>
          <h5 className="mt-4">Resultados de Partidos</h5>
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
            <button className="btn btn-dark" onClick={actualizarGanadores}>
              🏆 Actualizar Ganadores de la Jornada
            </button>
          </div>
        </>
      )}
    </div>
  );
}
