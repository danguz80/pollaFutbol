import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AccesosDirectos from "../../components/AccesosDirectos";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function AdminLibertadoresResultados() {
  const navigate = useNavigate();
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState("");
  const [partidos, setPartidos] = useState([]);
  const [jornadaCerrada, setJornadaCerrada] = useState(false);
  const [jornadaActiva, setJornadaActiva] = useState(false);
  const [jornadaId, setJornadaId] = useState(null);

  // Obtener jornadas al montar
  useEffect(() => {
    const cargarJornadas = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/api/libertadores/jornadas`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setJornadas(data);
        
        // Seleccionar última jornada por defecto
        if (data.length > 0) {
          setJornadaSeleccionada(String(data[data.length - 1].numero));
        }
      } catch (err) {
        console.error("Error al cargar jornadas:", err);
      }
    };
    
    cargarJornadas();
  }, []);

  // Cargar partidos y estado al seleccionar jornada
  useEffect(() => {
    if (!jornadaSeleccionada) return;
    fetchPartidos(jornadaSeleccionada);
    fetchJornadaInfo(jornadaSeleccionada);
  }, [jornadaSeleccionada]);

  const fetchPartidos = async (numero) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/libertadores/jornadas/${numero}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      const partidosConGoles = (data.partidos || []).map(p => ({
        id: p.id,
        local: p.nombre_local,
        visita: p.nombre_visita,
        golesLocal: p.goles_local ?? "",
        golesVisita: p.goles_visita ?? "",
        penalesLocal: p.penales_local ?? "",
        penalesVisita: p.penales_visita ?? "",
        bonus: p.bonus ?? 1,
      }));
      setPartidos(partidosConGoles);
    } catch (err) {
      console.error("Error al cargar partidos:", err);
    }
  };

  const fetchJornadaInfo = async (numero) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/libertadores/jornadas/${numero}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setJornadaCerrada(!!data.cerrada);
      setJornadaActiva(!!data.activa);
      setJornadaId(data.id);
    } catch (err) {
      setJornadaCerrada(false);
      setJornadaActiva(false);
      setJornadaId(null);
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

  const guardarResultados = async () => {
    if (!jornadaSeleccionada) return;
    try {
      const token = localStorage.getItem('token');
      
      // Adaptar formato para el backend de Libertadores
      const partidosParaGuardar = partidos.map(p => ({
        id: p.id,
        goles_local: p.golesLocal === "" ? null : Number(p.golesLocal),
        goles_visita: p.golesVisita === "" ? null : Number(p.golesVisita),
        penales_local: p.penalesLocal === "" ? null : Number(p.penalesLocal),
        penales_visita: p.penalesVisita === "" ? null : Number(p.penalesVisita),
        bonus: p.bonus
      }));

      const res = await fetch(`${API_BASE_URL}/api/libertadores/jornadas/${jornadaSeleccionada}/resultados`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ partidos: partidosParaGuardar }),
      });
      
      const data = await res.json();
      alert(data.mensaje || "✅ Resultados guardados en la base de datos");
      fetchPartidos(jornadaSeleccionada);
    } catch (error) {
      console.error("Error al guardar resultados:", error);
      alert("❌ Error al guardar resultados: " + (error.message || "Error desconocido"));
    }
  };

  const calcularPuntajes = async () => {
    if (!jornadaSeleccionada) return;
    if (!confirm("¿Calcular puntajes de todos los pronósticos de esta jornada?")) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/libertadores-calcular/puntos`, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      alert(data.mensaje || "✅ Puntajes calculados correctamente");
    } catch (error) {
      console.error("Error al calcular puntajes:", error);
      alert("❌ Error al calcular puntajes");
    }
  };

  const generarAzar = () => {
    const partidosAzar = partidos.map(p => ({
      ...p,
      golesLocal: Math.floor(Math.random() * 4), // 0 a 3
      golesVisita: Math.floor(Math.random() * 4)  // 0 a 3
    }));
    setPartidos(partidosAzar);
  };

  const toggleCierreJornada = async () => {
    if (!jornadaSeleccionada) return;
    try {
      const token = localStorage.getItem('token');
      const jornada = jornadas.find(j => String(j.numero) === String(jornadaSeleccionada));
      if (!jornada) {
        alert("No se encontró la jornada");
        return;
      }
      
      const res = await fetch(`${API_BASE_URL}/api/libertadores/jornadas/${jornada.id}/estado`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ cerrada: !jornadaCerrada })
      });
      
      const data = await res.json();
      setJornadaCerrada(!!data.jornada?.cerrada);
      
      if (data.jornada?.cerrada) {
        alert("🔒 Jornada cerrada");
      } else {
        alert("🔓 Jornada abierta");
      }
      
      // Recargar info de la jornada
      fetchJornadaInfo(jornadaSeleccionada);
    } catch (error) {
      alert("❌ Error al cerrar/abrir la jornada");
      console.error(error);
    }
  };

  const toggleActivarJornada = async () => {
    if (!jornadaSeleccionada) return;
    try {
      const token = localStorage.getItem('token');
      const jornada = jornadas.find(j => String(j.numero) === String(jornadaSeleccionada));
      if (!jornada) {
        alert("No se encontró la jornada");
        return;
      }
      
      const res = await fetch(`${API_BASE_URL}/api/libertadores/jornadas/${jornadaSeleccionada}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ activa: !jornadaActiva })
      });
      
      const data = await res.json();
      setJornadaActiva(!!data.jornada?.activa);
      
      if (data.jornada?.activa) {
        alert("✅ Jornada activada (visible para jugadores)");
      } else {
        alert("❌ Jornada desactivada (oculta para jugadores)");
      }
      
      // Recargar info de la jornada
      fetchJornadaInfo(jornadaSeleccionada);
    } catch (error) {
      alert("❌ Error al activar/desactivar la jornada");
      console.error(error);
    }
  };

  const jornadasOrdenadas = [...jornadas].sort((a, b) => a.numero - b.numero);

  return (
    <div className="container mt-4">
      <AccesosDirectos />
      
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>📊 Resultados y Jornadas - Copa Libertadores</h2>
        <div className="d-flex gap-2">
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/admin/libertadores/fixture')}
          >
            📋 Generar Fixture
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/admin/libertadores/gestion')}
          >
            ← Volver
          </button>
        </div>
      </div>

      {/* Selector de Jornada */}
      <div className="card mb-4">
        <div className="card-header">
          <h5>Seleccionar Jornada</h5>
        </div>
        <div className="card-body">
          <select
            className="form-select"
            value={jornadaSeleccionada}
            onChange={(e) => setJornadaSeleccionada(e.target.value)}
          >
            <option value="">-- Seleccione una jornada --</option>
            {jornadasOrdenadas.map((j) => (
              <option key={j.id} value={j.numero}>
                Jornada {j.numero} - {j.nombre} {j.cerrada ? "🔒" : "🔓"} {j.activa ? "✅" : "❌"}
              </option>
            ))}
          </select>
          <small className="text-muted d-block mt-2">
            🔒 = Cerrada (no se pueden modificar pronósticos) | 🔓 = Abierta | ✅ = Activa (visible) | ❌ = Oculta
          </small>
        </div>
      </div>

      {/* Botones de estado de jornada */}
      {jornadaSeleccionada && (
        <div className="card mb-4">
          <div className="card-header">
            <h5>Estado de la Jornada</h5>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6">
                <div className="d-flex flex-column gap-2">
                  <button
                    className={`btn btn-lg ${jornadaCerrada ? "btn-danger" : "btn-success"}`}
                    onClick={toggleCierreJornada}
                  >
                    {jornadaCerrada ? "🔓 Abrir Jornada" : "🔒 Cerrar Jornada"}
                  </button>
                  <small className="text-muted">
                    {jornadaCerrada ? "Cerrada: Los jugadores no pueden modificar pronósticos" : "Abierta: Los jugadores pueden ingresar pronósticos"}
                  </small>
                </div>
              </div>
              <div className="col-md-6">
                <div className="d-flex flex-column gap-2">
                  <button
                    className={`btn btn-lg ${jornadaActiva ? "btn-info" : "btn-warning"}`}
                    onClick={toggleActivarJornada}
                  >
                    {jornadaActiva ? "❌ Desactivar (Ocultar)" : "✅ Activar (Mostrar)"}
                  </button>
                  <small className="text-muted">
                    {jornadaActiva ? "Activa: Visible para todos los jugadores" : "Inactiva: Oculta para los jugadores"}
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de resultados */}
      {partidos.length > 0 && (
        <>
          <div className="card mb-4">
            <div className="card-header">
              <h5>⚽ Ingresar Resultados Reales</h5>
            </div>
            <div className="card-body">
              <table className="table table-bordered text-center align-middle">
                <thead className="table-dark">
                  <tr>
                    <th>Local</th>
                    <th>Marcador</th>
                    <th>Visita</th>
                    <th>Penales</th>
                    <th>Bonus</th>
                  </tr>
                </thead>
                <tbody>
                  {partidos.map((p) => (
                    <tr key={p.id}>
                      <td className="fw-bold">{p.local}</td>
                      <td>
                        <div className="d-flex justify-content-center align-items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            className="form-control text-center fw-bold"
                            style={{ width: "70px" }}
                            value={p.golesLocal ?? ""}
                            onChange={(e) => handleCambiarGoles(p.id, "golesLocal", e.target.value)}
                          />
                          <span className="fw-bold">-</span>
                          <input
                            type="number"
                            min="0"
                            className="form-control text-center fw-bold"
                            style={{ width: "70px" }}
                            value={p.golesVisita ?? ""}
                            onChange={(e) => handleCambiarGoles(p.id, "golesVisita", e.target.value)}
                          />
                        </div>
                      </td>
                      <td className="fw-bold">{p.visita}</td>
                      <td>
                        <div className="d-flex justify-content-center align-items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            className="form-control text-center"
                            style={{ width: "60px" }}
                            placeholder="P"
                            value={p.penalesLocal ?? ""}
                            onChange={(e) => handleCambiarGoles(p.id, "penalesLocal", e.target.value)}
                          />
                          <span>-</span>
                          <input
                            type="number"
                            min="0"
                            className="form-control text-center"
                            style={{ width: "60px" }}
                            placeholder="P"
                            value={p.penalesVisita ?? ""}
                            onChange={(e) => handleCambiarGoles(p.id, "penalesVisita", e.target.value)}
                          />
                        </div>
                      </td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          style={{ width: "80px" }}
                          value={p.bonus}
                          onChange={(e) => handleCambiarBonus(p.id, e.target.value)}
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

              <div className="d-flex gap-2 justify-content-center flex-wrap">
                <button className="btn btn-outline-info btn-lg" onClick={generarAzar}>
                  🎲 Azar
                </button>
                <button className="btn btn-primary btn-lg" onClick={guardarResultados}>
                  💾 Guardar Resultados
                </button>
                <button className="btn btn-success btn-lg" onClick={calcularPuntajes}>
                  🧮 Calcular Puntajes
                </button>
                <button
                  className="btn btn-outline-secondary btn-lg"
                  onClick={() => {
                    const jornadaActual = Number(jornadaSeleccionada);
                    if (jornadaActual > 1) {
                      setJornadaSeleccionada(String(jornadaActual - 1));
                    }
                  }}
                  disabled={Number(jornadaSeleccionada) <= 1}
                >
                  ← Anterior
                </button>
                <button
                  className="btn btn-outline-secondary btn-lg"
                  onClick={() => {
                    const jornadaActual = Number(jornadaSeleccionada);
                    const maxJornada = Math.max(...jornadas.map(j => j.numero));
                    if (jornadaActual < maxJornada) {
                      setJornadaSeleccionada(String(jornadaActual + 1));
                    }
                  }}
                  disabled={Number(jornadaSeleccionada) >= Math.max(...jornadas.map(j => j.numero))}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {!jornadaSeleccionada && (
        <div className="alert alert-info text-center">
          <h5>Selecciona una jornada para comenzar</h5>
          <p className="mb-0">Podrás ingresar resultados reales, cerrar/abrir la jornada, activar/desactivar y calcular puntajes</p>
        </div>
      )}
    </div>
  );
}
