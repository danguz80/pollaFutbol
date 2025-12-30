import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// Accede a la variable de entorno
const API_BASE_URL = import.meta.env.VITE_API_URL;

const equipos = [
  "Colo Colo", "Universidad de Chile", "Universidad Católica", "Palestino",
  "Cobresal", "Everton", "Audax Italiano", "Deportes Iquique",
  "Ñublense", "Huachipato", "Unión La Calera", "Coquimbo Unido",
  "Unión Española", "La Serena", "Deportes Limache", "O'Higgins"
];

const goleadores = [
  "Sebastián Sáez (Unión La Calera)",
  "Diego Coelho (Cobresal)",
  "Daniel Castro (Deportes Limache)",
  "Lucas Di Yorio (Universidad de Chile)",
  "Rodrigo Contreras (Universidad de Chile)",
  "Javier Correa (Colo Colo)",
  "Lionel Altamirano (Huachipato)",
  "Leonardo Valencia (Audax Italiano)",
  "Fernando Zampedri (Universidad Católica)"
];

export default function AdminPanel() {
  const navigate = useNavigate();
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState("");
  const [partidos, setPartidos] = useState([]);
  const [jornadaCerrada, setJornadaCerrada] = useState(false); // <--- CORREGIDO
  const [fechaCierre, setFechaCierre] = useState(""); // Fecha y hora de cierre automático
  const [jornadaId, setJornadaId] = useState(null);
  
  // Estados para Cuadro Final
  const [prediccionesReales, setPrediccionesReales] = useState({
    campeon: "",
    subcampeon: "",
    tercero: "",
    chile_4_lib: "",
    cuarto: "",
    quinto: "",
    sexto: "",
    septimo: "",
    quinceto: "",
    dieciseisavo: "",
    goleador: ""
  });
  const [prediccionesUsuarios, setPrediccionesUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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
    
    if (jornadaSeleccionada === "999") {
      cargarDatosCuadroFinal();
    } else {
      fetchPartidos(jornadaSeleccionada);
      fetchJornadaInfo(jornadaSeleccionada);
    }
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
      setJornadaId(data.id);
      // Convertir fecha_cierre a formato datetime-local (yyyy-MM-ddTHH:mm)
      if (data.fecha_cierre) {
        const fecha = new Date(data.fecha_cierre);
        const fechaLocal = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setFechaCierre(fechaLocal);
      } else {
        setFechaCierre("");
      }
    } catch (err) {
      setJornadaCerrada(false); // <--- CORREGIDO
      setFechaCierre("");
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
    if (!confirm("¿Calcular puntajes de esta jornada y generar PDF con resultados completos?\n\nEl PDF incluirá: pronósticos, resultados reales, puntos, rankings y ganadores. Se enviará automáticamente por email.")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/pronosticos/calcular/${jornadaSeleccionada}`, {
        method: "POST"
      });
      const data = await res.json();
      alert(data.mensaje || `✅ Puntajes recalculados: ${data.actualizados ?? ""} pronósticos actualizados`);
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

  // Toggle Cuadro Final
  const toggleCuadroFinal = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/cuadro-final/toggle`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ ${data.message}`);
        // Recargar jornadas para actualizar el estado
        const resJornadas = await fetch(`${API_BASE_URL}/api/jornadas`);
        const jornadasActualizadas = await resJornadas.json();
        setJornadas(jornadasActualizadas);
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      alert("❌ Error al cambiar estado del Cuadro Final");
      console.error(error);
    }
  };

  // Actualizar fecha de cierre automático
  const actualizarFechaCierre = async () => {
    if (!jornadaId || !fechaCierre) {
      alert("❌ Selecciona una jornada y una fecha válida");
      return;
    }
    try {
      const fechaISO = new Date(fechaCierre).toISOString();
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/jornadas/${jornadaId}/fecha-cierre`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ fecha_cierre: fechaISO })
      });
      
      if (res.ok) {
        alert("✅ Fecha de cierre actualizada");
      } else {
        alert("❌ Error al actualizar fecha de cierre");
      }
    } catch (error) {
      alert("❌ Error al actualizar fecha de cierre");
      console.error(error);
    }
  };

  // Enviar mensaje por email manualmente
  const enviarNotificacionEmail = async () => {
    if (!jornadaSeleccionada || jornadaSeleccionada === "999") {
      alert("❌ Selecciona una jornada válida");
      return;
    }

    const confirmacion = confirm(`¿Enviar email con los pronósticos de la Jornada ${jornadaSeleccionada}?`);
    if (!confirmacion) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/whatsapp/enviar-jornada`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ numeroJornada: parseInt(jornadaSeleccionada) })
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        alert(`✅ ${data.mensaje}`);
      } else {
        alert(`❌ Error: ${data.error || 'No se pudo enviar el email'}`);
      }
    } catch (error) {
      alert("❌ Error al enviar email");
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

  // ===== FUNCIONES CUADRO FINAL =====
  
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

  const handleChangeCuadroFinal = (field, value) => {
    setPrediccionesReales(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getEquiposParaCampo = (campo) => {
    const equiposSeleccionados = Object.entries(prediccionesReales)
      .filter(([key, value]) => key !== campo && key !== 'goleador' && value !== "")
      .map(([key, value]) => value);
    
    return equipos.filter(equipo => !equiposSeleccionados.includes(equipo));
  };

  const guardarPrediccionesReales = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("No se encontró token de autenticación");
      return;
    }

    setLoading(true);
    try {
      console.log("Enviando predicciones reales:", prediccionesReales);
      console.log("API_BASE_URL:", API_BASE_URL);
      
      const response = await fetch(`${API_BASE_URL}/api/prediccion-final-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          jugador_id: 1, // Admin ID
          ...prediccionesReales
        })
      });

      console.log("Response status:", response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log("Response data:", data);
        setMessage("✅ Predicciones reales guardadas exitosamente");
        alert("✅ Predicciones reales guardadas exitosamente");
      } else {
        const errorData = await response.json();
        console.error("Error response:", errorData);
        setMessage(`❌ Error al guardar predicciones reales: ${errorData.error || 'Error desconocido'}`);
        alert(`❌ Error al guardar predicciones reales: ${errorData.error || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessage("Error al guardar predicciones reales");
    } finally {
      setLoading(false);
    }
  };

  const limpiarDatosCuadroFinal = () => {
    if (confirm("¿Estás seguro de que quieres limpiar todos los datos?")) {
      setPrediccionesReales({
        campeon: "",
        subcampeon: "",
        tercero: "",
        chile_4_lib: "",
        cuarto: "",
        quinto: "",
        sexto: "",
        septimo: "",
        quinceto: "",
        dieciseisavo: "",
        goleador: ""
      });
      setMessage("✅ Datos limpiados exitosamente");
      alert("✅ Datos limpiados exitosamente");
    }
  };

  const calcularPuntos = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("No se encontró token de autenticación");
      return;
    }

    if (Object.values(prediccionesReales).some(value => value === "")) {
      setMessage("❌ Debes completar todas las predicciones reales antes de calcular puntos");
      alert("❌ Debes completar todas las predicciones reales antes de calcular puntos");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/predicciones-finales/calcular-puntos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(prediccionesReales)
      });

      if (response.ok) {
        const data = await response.json();
        setMessage(`✅ Puntos calculados exitosamente para ${data.usuariosActualizados} usuarios`);
        alert(`✅ Puntos calculados exitosamente para ${data.usuariosActualizados} usuarios`);
        cargarDatosCuadroFinal(); // Recargar datos
      } else {
        const errorData = await response.json();
        setMessage(`❌ Error al calcular puntos: ${errorData.message || 'Error desconocido'}`);
        alert(`❌ Error al calcular puntos: ${errorData.message || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessage("❌ Error de conexión al calcular puntos");
      alert("❌ Error de conexión al calcular puntos");
    } finally {
      setLoading(false);
    }
  };

  const actualizarGanadoresCuadroFinal = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("No se encontró token de autenticación");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/predicciones-finales/actualizar-ganadores`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMessage(`✅ Ganadores actualizados: ${data.ganadores.join(', ')}`);
        alert(`✅ Ganadores del Cuadro Final actualizados:\n${data.ganadores.join(', ')}\nPuntaje: ${data.puntajeMaximo} puntos`);
      } else {
        const errorData = await response.json();
        setMessage(`❌ Error: ${errorData.message || 'Error desconocido'}`);
        alert(`❌ Error: ${errorData.message || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessage("❌ Error de conexión");
      alert("❌ Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const sumarARanking = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("No se encontró token de autenticación");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/predicciones-finales/sumar-ranking`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMessage(`✅ Puntos sumados al ranking para ${data.usuariosActualizados} usuarios`);
        alert(`✅ Puntos sumados al ranking para ${data.usuariosActualizados} usuarios`);
      } else {
        const errorData = await response.json();
        setMessage(`❌ Error al sumar puntos al ranking: ${errorData.message || 'Error desconocido'}`);
        alert(`❌ Error al sumar puntos al ranking: ${errorData.message || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessage("❌ Error de conexión al sumar puntos al ranking");
      alert("❌ Error de conexión al sumar puntos al ranking");
    } finally {
      setLoading(false);
    }
  };

  const calcularAciertos = (prediccionUsuario) => {
    const aciertos = {};
    let puntosTotales = 0;

    // Verificar aciertos
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

  return (
    <div className="container mt-4">
      <h2>⚙️ Panel de Administración</h2>
      <div className="mb-3 d-flex gap-2">
        <button onClick={() => navigate("/admin/torneo-nacional")} className="btn btn-primary">
          ⚽ Torneo Nacional
        </button>
        <button onClick={() => navigate("/admin/libertadores")} className="btn btn-warning">
          🏆 Copa Libertadores 2026
        </button>
      </div>

      {/* Fecha de cierre automático */}
      {jornadaSeleccionada && jornadaSeleccionada !== "999" && (
        <div className="mb-3 p-3 border rounded bg-light">
          <h6>⏰ Cierre Automático</h6>
          <div className="d-flex gap-2 align-items-center">
            <label className="form-label mb-0">Fecha y hora de cierre:</label>
            <input
              type="datetime-local"
              className="form-control w-auto"
              value={fechaCierre}
              onChange={(e) => setFechaCierre(e.target.value)}
            />
            <button className="btn btn-primary" onClick={actualizarFechaCierre}>
              💾 Guardar
            </button>
          </div>
          {fechaCierre && (
            <small className="text-muted">
              La jornada se cerrará automáticamente en esta fecha y se enviará un email
            </small>
          )}
        </div>
      )}

      {/* Botón cerrar/abrir jornada */}
      {jornadaSeleccionada && (
        <div className="mb-3">
          {jornadaSeleccionada === "999" ? (
            <button
              className={`btn ${jornadas.find(j => j.numero === 999)?.cerrada ? "btn-danger" : "btn-outline-success"}`}
              onClick={toggleCuadroFinal}
            >
              {jornadas.find(j => j.numero === 999)?.cerrada 
                ? "🔓 Abrir Cuadro Final" 
                : "🔒 Cerrar Cuadro Final"}
            </button>
          ) : (
            <button
              className={`btn ${jornadaCerrada ? "btn-danger" : "btn-outline-success"}`}
              onClick={toggleCierreJornada}
            >
              {jornadaCerrada ? "🔓 Abrir Jornada" : "🔒 Cerrar Jornada"}
            </button>
          )}
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

          <div className="d-flex justify-content-between mt-3 gap-2 flex-wrap">
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
            <button className="btn btn-info" onClick={enviarNotificacionEmail}>
              📧 Enviar Email
            </button>
          </div>
        </>
      )}

      {/* CUADRO FINAL */}
      {jornadaSeleccionada === "999" && (
        <div className="row mt-4">
          <div className="col-12">
            <h4>Gestión del Cuadro Final</h4>
            
            {/* Área de mensajes */}
            {message && (
              <div className={`alert ${message.includes('✅') ? 'alert-success' : message.includes('❌') ? 'alert-danger' : 'alert-info'} alert-dismissible fade show`} role="alert">
                {message}
                <button type="button" className="btn-close" onClick={() => setMessage('')} aria-label="Close"></button>
              </div>
            )}
            
            {/* Formulario de Predicciones Reales */}
            <div className="card mb-4">
              <div className="card-header">
                <h5>Predicciones Reales (Admin)</h5>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6 col-lg-4 mb-3">
                    <label htmlFor="campeon" className="form-label">
                      <strong>Campeón (15 pts)</strong>
                    </label>
                    <select
                      id="campeon"
                      className="form-select"
                      value={prediccionesReales.campeon}
                      onChange={(e) => handleChangeCuadroFinal("campeon", e.target.value)}
                    >
                      <option value="">Selecciona equipo</option>
                      {getEquiposParaCampo("campeon").map((equipo) => (
                        <option key={equipo} value={equipo}>
                          {equipo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6 col-lg-4 mb-3">
                    <label htmlFor="subcampeon" className="form-label">
                      <strong>Sub-Campeón (10 pts)</strong>
                    </label>
                    <select
                      id="subcampeon"
                      className="form-select"
                      value={prediccionesReales.subcampeon}
                      onChange={(e) => handleChangeCuadroFinal("subcampeon", e.target.value)}
                    >
                      <option value="">Selecciona equipo</option>
                      {getEquiposParaCampo("subcampeon").map((equipo) => (
                        <option key={equipo} value={equipo}>
                          {equipo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6 col-lg-4 mb-3">
                    <label htmlFor="tercero" className="form-label">
                      <strong>3º Lugar (5 pts)</strong>
                    </label>
                    <select
                      id="tercero"
                      className="form-select"
                      value={prediccionesReales.tercero}
                      onChange={(e) => handleChangeCuadroFinal("tercero", e.target.value)}
                    >
                      <option value="">Selecciona equipo</option>
                      {getEquiposParaCampo("tercero").map((equipo) => (
                        <option key={equipo} value={equipo}>
                          {equipo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6 col-lg-4 mb-3">
                    <label htmlFor="chile_4_lib" className="form-label">
                      <strong>Chile 4 (Libertadores) (5 pts)</strong>
                    </label>
                    <select
                      id="chile_4_lib"
                      className="form-select"
                      value={prediccionesReales.chile_4_lib}
                      onChange={(e) => handleChangeCuadroFinal("chile_4_lib", e.target.value)}
                    >
                      <option value="">Selecciona equipo</option>
                      {getEquiposParaCampo("chile_4_lib").map((equipo) => (
                        <option key={equipo} value={equipo}>
                          {equipo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6 col-lg-4 mb-3">
                    <label htmlFor="cuarto" className="form-label">
                      <strong>4º Lugar (5 pts)</strong>
                    </label>
                    <select
                      id="cuarto"
                      className="form-select"
                      value={prediccionesReales.cuarto}
                      onChange={(e) => handleChangeCuadroFinal("cuarto", e.target.value)}
                    >
                      <option value="">Selecciona equipo</option>
                      {getEquiposParaCampo("cuarto").map((equipo) => (
                        <option key={equipo} value={equipo}>
                          {equipo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6 col-lg-4 mb-3">
                    <label htmlFor="quinto" className="form-label">
                      <strong>5º Lugar (5 pts)</strong>
                    </label>
                    <select
                      id="quinto"
                      className="form-select"
                      value={prediccionesReales.quinto}
                      onChange={(e) => handleChangeCuadroFinal("quinto", e.target.value)}
                    >
                      <option value="">Selecciona equipo</option>
                      {getEquiposParaCampo("quinto").map((equipo) => (
                        <option key={equipo} value={equipo}>
                          {equipo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6 col-lg-4 mb-3">
                    <label htmlFor="sexto" className="form-label">
                      <strong>6º Lugar (5 pts)</strong>
                    </label>
                    <select
                      id="sexto"
                      className="form-select"
                      value={prediccionesReales.sexto}
                      onChange={(e) => handleChangeCuadroFinal("sexto", e.target.value)}
                    >
                      <option value="">Selecciona equipo</option>
                      {getEquiposParaCampo("sexto").map((equipo) => (
                        <option key={equipo} value={equipo}>
                          {equipo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6 col-lg-4 mb-3">
                    <label htmlFor="septimo" className="form-label">
                      <strong>7º Lugar (5 pts)</strong>
                    </label>
                    <select
                      id="septimo"
                      className="form-select"
                      value={prediccionesReales.septimo}
                      onChange={(e) => handleChangeCuadroFinal("septimo", e.target.value)}
                    >
                      <option value="">Selecciona equipo</option>
                      {getEquiposParaCampo("septimo").map((equipo) => (
                        <option key={equipo} value={equipo}>
                          {equipo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6 col-lg-4 mb-3">
                    <label htmlFor="quinceto" className="form-label">
                      <strong>15º Lugar (5 pts)</strong>
                    </label>
                    <select
                      id="quinceto"
                      className="form-select"
                      value={prediccionesReales.quinceto}
                      onChange={(e) => handleChangeCuadroFinal("quinceto", e.target.value)}
                    >
                      <option value="">Selecciona equipo</option>
                      {getEquiposParaCampo("quinceto").map((equipo) => (
                        <option key={equipo} value={equipo}>
                          {equipo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6 col-lg-4 mb-3">
                    <label htmlFor="dieciseisavo" className="form-label">
                      <strong>16º Lugar (5 pts)</strong>
                    </label>
                    <select
                      id="dieciseisavo"
                      className="form-select"
                      value={prediccionesReales.dieciseisavo}
                      onChange={(e) => handleChangeCuadroFinal("dieciseisavo", e.target.value)}
                    >
                      <option value="">Selecciona equipo</option>
                      {getEquiposParaCampo("dieciseisavo").map((equipo) => (
                        <option key={equipo} value={equipo}>
                          {equipo}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6 col-lg-4 mb-3">
                    <label htmlFor="goleador" className="form-label">
                      <strong>Goleador (6 pts)</strong>
                    </label>
                    <select
                      id="goleador"
                      className="form-select"
                      value={prediccionesReales.goleador}
                      onChange={(e) => handleChangeCuadroFinal("goleador", e.target.value)}
                    >
                      <option value="">Selecciona goleador</option>
                      {goleadores.map((goleador) => (
                        <option key={goleador} value={goleador}>
                          {goleador}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    className="btn btn-primary me-2"
                    onClick={guardarPrediccionesReales}
                    disabled={loading}
                  >
                    {loading ? "Guardando..." : "Guardar Predicciones Reales"}
                  </button>
                  <button
                    className="btn btn-warning me-2"
                    onClick={limpiarDatosCuadroFinal}
                  >
                    Limpiar Datos
                  </button>
                  <button
                    className="btn btn-success me-2"
                    onClick={calcularPuntos}
                    disabled={loading}
                  >
                    {loading ? "Calculando..." : "Calcular Puntos"}
                  </button>
                  <button
                    className="btn btn-warning me-2"
                    onClick={actualizarGanadoresCuadroFinal}
                    disabled={loading}
                  >
                    {loading ? "Actualizando..." : "Actualizar Ganadores"}
                  </button>
                  <button
                    className="btn btn-info"
                    onClick={sumarARanking}
                    disabled={loading}
                  >
                    {loading ? "Sumando..." : "Sumar a Ranking"}
                  </button>
                </div>
              </div>
            </div>

            {/* Predicciones de Usuarios */}
            {prediccionesUsuarios.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h5>Predicciones de Usuarios</h5>
                </div>
                <div className="card-body">
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Usuario</th>
                          <th>Campeón</th>
                          <th>Sub-Campeón</th>
                          <th>3º Lugar</th>
                          <th>Chile 4</th>
                          <th>4º Lugar</th>
                          <th>5º Lugar</th>
                          <th>6º Lugar</th>
                          <th>7º Lugar</th>
                          <th>15º Lugar</th>
                          <th>16º Lugar</th>
                          <th>Goleador</th>
                          <th>Puntos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prediccionesUsuarios.map((prediccion) => {
                          const { aciertos, puntosTotales } = calcularAciertos(prediccion);
                          return (
                            <tr key={prediccion.jugador_id}>
                              <td><strong>{prediccion.nombre}</strong></td>
                              <td className={aciertos.campeon ? "bg-success text-white" : ""}>
                                {prediccion.campeon} {aciertos.campeon && `(${aciertos.campeon} pts)`}
                              </td>
                              <td className={aciertos.subcampeon ? "bg-success text-white" : ""}>
                                {prediccion.subcampeon} {aciertos.subcampeon && `(${aciertos.subcampeon} pts)`}
                              </td>
                              <td className={aciertos.tercero ? "bg-success text-white" : ""}>
                                {prediccion.tercero} {aciertos.tercero && `(${aciertos.tercero} pts)`}
                              </td>
                              <td className={aciertos.chile_4_lib ? "bg-success text-white" : ""}>
                                {prediccion.chile_4_lib} {aciertos.chile_4_lib && `(${aciertos.chile_4_lib} pts)`}
                              </td>
                              <td className={aciertos.cuarto ? "bg-success text-white" : ""}>
                                {prediccion.cuarto} {aciertos.cuarto && `(${aciertos.cuarto} pts)`}
                              </td>
                              <td className={aciertos.quinto ? "bg-success text-white" : ""}>
                                {prediccion.quinto} {aciertos.quinto && `(${aciertos.quinto} pts)`}
                              </td>
                              <td className={aciertos.sexto ? "bg-success text-white" : ""}>
                                {prediccion.sexto} {aciertos.sexto && `(${aciertos.sexto} pts)`}
                              </td>
                              <td className={aciertos.septimo ? "bg-success text-white" : ""}>
                                {prediccion.septimo} {aciertos.septimo && `(${aciertos.septimo} pts)`}
                              </td>
                              <td className={aciertos.quinceto ? "bg-success text-white" : ""}>
                                {prediccion.quinceto} {aciertos.quinceto && `(${aciertos.quinceto} pts)`}
                              </td>
                              <td className={aciertos.dieciseisavo ? "bg-success text-white" : ""}>
                                {prediccion.dieciseisavo} {aciertos.dieciseisavo && `(${aciertos.dieciseisavo} pts)`}
                              </td>
                              <td className={aciertos.goleador ? "bg-success text-white" : ""}>
                                {prediccion.goleador} {aciertos.goleador && `(${aciertos.goleador} pts)`}
                              </td>
                              <td><strong className="text-primary">{puntosTotales}</strong></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
