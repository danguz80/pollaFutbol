import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavegacionLibertadores from "../../components/NavegacionLibertadores";
import { LogoEquipo } from "../../utils/libertadoresLogos.jsx";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function AdminLibertadoresResultados() {
  const navigate = useNavigate();
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState("");
  const [partidos, setPartidos] = useState([]);
  const [jornadaCerrada, setJornadaCerrada] = useState(false);
  const [jornadaActiva, setJornadaActiva] = useState(false);
  const [jornadaId, setJornadaId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [modalType, setModalType] = useState("success");
  const [fechaCierre, setFechaCierre] = useState("");

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
        tipoPartido: p.tipo_partido || null, // IDA, VUELTA, FINAL o null (fase grupos)
        jornadaId: p.jornada_id,
      }));
      setPartidos(partidosConGoles);
    } catch (err) {
      console.error("Error al cargar partidos:", err);
    }
  };

  // Función para calcular si hay empate global en un partido de VUELTA
  const calcularEmpateGlobal = (partidoVuelta) => {
    if (!partidoVuelta.tipoPartido || partidoVuelta.tipoPartido !== 'VUELTA') return false;
    if (partidoVuelta.golesLocal === "" || partidoVuelta.golesVisita === "") return false;

    // Buscar partido IDA (equipos invertidos)
    const partidoIda = partidos.find(p => 
      p.tipoPartido === 'IDA' && 
      p.local === partidoVuelta.visita && 
      p.visita === partidoVuelta.local
    );

    if (!partidoIda || partidoIda.golesLocal === "" || partidoIda.golesVisita === "") return false;

    // Calcular marcador global
    const golesLocalGlobal = Number(partidoIda.golesVisita) + Number(partidoVuelta.golesLocal);
    const golesVisitaGlobal = Number(partidoIda.golesLocal) + Number(partidoVuelta.golesVisita);

    return golesLocalGlobal === golesVisitaGlobal;
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
      
      if (data.fecha_cierre) {
        // Conversión UTC → hora local de Chile
        const fechaUTC = new Date(data.fecha_cierre);
        const año = fechaUTC.getFullYear();
        const mes = String(fechaUTC.getMonth() + 1).padStart(2, '0');
        const dia = String(fechaUTC.getDate()).padStart(2, '0');
        const hora = String(fechaUTC.getHours()).padStart(2, '0');
        const minutos = String(fechaUTC.getMinutes()).padStart(2, '0');
        const fechaLocal = `${año}-${mes}-${dia}T${hora}:${minutos}`;
        setFechaCierre(fechaLocal);
      } else {
        setFechaCierre("");
      }
    } catch (err) {
      setJornadaCerrada(false);
      setJornadaActiva(false);
      setJornadaId(null);
      setFechaCierre("");
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
      
      // Contar partidos con resultados
      const partidosConResultado = partidosParaGuardar.filter(p => p.goles_local !== null && p.goles_visita !== null).length;
      const bonusModificados = partidosParaGuardar.filter(p => p.bonus !== 1).length;
      
      alert(`✅ Resultados guardados exitosamente\n\n📊 Resumen Jornada ${jornadaSeleccionada}:\n- ${partidosConResultado} de ${partidosParaGuardar.length} partidos con resultado\n- ${bonusModificados} partidos con bonus modificado (x2 o x3)\n\n💾 Datos guardados en la base de datos`);
      fetchPartidos(jornadaSeleccionada);
    } catch (error) {
      console.error("Error al guardar resultados:", error);
      alert("❌ Error al guardar resultados: " + (error.message || "Error desconocido"));
    }
  };

  const calcularPuntajes = async () => {
    if (!jornadaSeleccionada) return;
    if (!confirm(`¿Calcular puntajes de la jornada ${jornadaSeleccionada} de Libertadores?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/libertadores-calcular/puntos`, {
        method: "POST",
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jornadaNumero: parseInt(jornadaSeleccionada) })
      });
      const data = await res.json();
      
      alert(data.mensaje || "✅ Puntajes calculados correctamente");
    } catch (error) {
      console.error("Error al calcular puntajes:", error);
      alert("❌ Error al calcular puntajes");
    }
  };

  const generarPDFTestigo = async () => {
    if (!jornadaSeleccionada) return;

    if (!confirm(`¿Generar PDF testigo con los pronósticos de la Jornada ${jornadaSeleccionada}?\n\nEl PDF se enviará automáticamente por email.`)) {
      return;
    }

    try {
      setModalMessage("⏳ Generando PDF testigo...");
      setModalType("success");
      setShowModal(true);

      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/libertadores-pronosticos/generar-pdf/${jornadaSeleccionada}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al generar PDF');
      }

      const data = await res.json();
      setModalType("success");
      setModalMessage(`✅ PDF testigo generado exitosamente\n\n📧 ${data.mensaje}\n\n📄 El PDF contiene todos los pronósticos de los participantes para la Jornada ${jornadaSeleccionada}`);
      setShowModal(true);
    } catch (error) {
      console.error("Error al generar PDF testigo:", error);
      setModalType("error");
      setModalMessage(`❌ Error al generar PDF testigo\n\n${error.message}`);
      setShowModal(true);
    }
  };

  const generarPDFCompleto = async () => {
    if (!jornadaSeleccionada) return;

    if (!confirm(`¿Generar PDF completo con resultados de la Jornada ${jornadaSeleccionada}?\n\nIncluirá: pronósticos, resultados reales, puntos, rankings y ganadores.\n\nEl PDF se enviará automáticamente por email.`)) {
      return;
    }

    try {
      setModalMessage("⏳ Generando PDF completo...");
      setModalType("success");
      setShowModal(true);

      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/libertadores-ganadores-jornada/${jornadaSeleccionada}/pdf-final`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al generar PDF');
      }

      const data = await res.json();
      setModalType("success");
      setModalMessage(`✅ PDF completo generado exitosamente\n\n📧 ${data.mensaje}\n\n📄 El PDF incluye:\n• Ganadores de la jornada\n• Ranking de jornada\n• Ranking acumulado\n• Pronósticos y resultados\n• Puntos por usuario`);
      setShowModal(true);
    } catch (error) {
      console.error("Error al generar PDF completo:", error);
      setModalType("error");
      setModalMessage(`❌ Error al generar PDF completo\n\n${error.message}`);
      setShowModal(true);
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

  const generarAzarFaseGruposCompleta = async () => {
    if (!confirm('¿Estás seguro de completar TODAS las jornadas de fase de grupos (1-6) con resultados aleatorios?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      
      // Iterar sobre jornadas 1 a 6
      for (let jornadaNum = 1; jornadaNum <= 6; jornadaNum++) {
        // Obtener partidos de la jornada
        const responsePartidos = await fetch(
          `${API_BASE_URL}/api/libertadores/jornadas/${jornadaNum}/partidos`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const partidosJornada = await responsePartidos.json();
        
        // Generar resultados aleatorios y guardarlos
        const resultados = partidosJornada.map(partido => ({
          id: partido.id,
          golesLocal: Math.floor(Math.random() * 4),
          golesVisita: Math.floor(Math.random() * 4)
        }));

        // Guardar resultados
        await fetch(`${API_BASE_URL}/api/libertadores/resultados`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ resultados })
        });
      }

      alert('✅ Se completaron todas las jornadas de fase de grupos (1-6) con resultados aleatorios');
      
      // Recargar la jornada actual
      if (jornadaSeleccionada) {
        cargarPartidos();
      }
    } catch (error) {
      console.error('Error al generar azar fase grupos completa:', error);
      alert('❌ Error al completar fase de grupos');
    }
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
      
      // Si se está cerrando la jornada, generar y enviar PDF primero
      if (!jornadaCerrada) {
        const confirmarCierre = confirm(
          `¿Cerrar la jornada ${jornadaSeleccionada}?\n\n` +
          `Se generará un PDF con todos los pronósticos y se enviará por email antes de cerrar.`
        );
        
        if (!confirmarCierre) return;
        
        // Generar y enviar PDF
        try {
          const pdfResponse = await fetch(
            `${API_BASE_URL}/api/libertadores-pronosticos/generar-pdf/${jornadaSeleccionada}`,
            {
              method: 'POST',
              headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          if (!pdfResponse.ok) {
            const errorData = await pdfResponse.json();
            throw new Error(errorData.error || 'Error al generar PDF');
          }
          
          const pdfData = await pdfResponse.json();
          console.log('PDF generado:', pdfData.mensaje);
        } catch (pdfError) {
          const continuar = confirm(
            `⚠️ Error al generar/enviar PDF: ${pdfError.message}\n\n` +
            `¿Deseas cerrar la jornada de todos modos?`
          );
          
          if (!continuar) return;
        }
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
        alert("🔒 Jornada cerrada exitosamente\n\n✉️ PDF testigo enviado por email");
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

  const configurarFechaCierre = async () => {
    if (!jornadaSeleccionada || !fechaCierre) {
      alert("⚠️ Debes seleccionar una fecha y hora");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      
      // Conversión: Chile (local) → UTC
      const fechaLocal = new Date(fechaCierre);
      const fechaUTCString = fechaLocal.toISOString();
      
      const res = await fetch(`${API_BASE_URL}/api/libertadores/jornadas/${jornadaSeleccionada}/cierre`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ fecha_cierre: fechaUTCString })
      });
      
      if (res.ok) {
        await fetchJornadaInfo(jornadaSeleccionada);
        
        const [fecha, hora] = fechaCierre.split('T');
        const [year, month, day] = fecha.split('-');
        
        setModalType("success");
        setModalMessage(`✅ Fecha configurada: ${day}/${month}/${year} a las ${hora} hrs (hora local Chile)\n\nLa jornada ${jornadaSeleccionada} de Libertadores se cerrará automáticamente a esa hora.\n\nEl sistema revisa cada minuto.`);
        setShowModal(true);
      } else {
        alert(`❌ Error al guardar`);
      }
    } catch (error) {
      alert("❌ Error al configurar");
    }
  };

  const eliminarFechaCierre = async () => {
    if (!jornadaSeleccionada) return;
    
    if (!confirm("¿Eliminar la fecha de cierre automático?")) return;

    try {
      const token = localStorage.getItem("token");
      
      const res = await fetch(`${API_BASE_URL}/api/libertadores/jornadas/${jornadaSeleccionada}/cierre`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ fecha_cierre: null })
      });
      
      if (res.ok) {
        setFechaCierre("");
        await fetchJornadaInfo(jornadaSeleccionada);
        
        setModalType("success");
        setModalMessage("✅ Fecha de cierre eliminada correctamente\n\nLa jornada ya no se cerrará automáticamente.");
        setShowModal(true);
      } else {
        alert("❌ Error al eliminar fecha de cierre");
      }
    } catch (error) {
      console.error("Error eliminando fecha de cierre:", error);
      alert("❌ Error al eliminar fecha de cierre");
    }
  };

  const jornadasOrdenadas = [...jornadas].sort((a, b) => a.numero - b.numero);

  return (
    <div className="container mt-4">
      <NavegacionLibertadores />
      
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

      {/* Cierre Automático de Jornada */}
      {jornadaSeleccionada && (
        <div className="card mb-4">
          <div className="card-header bg-warning text-dark">
            <h5>⏰ Cierre Automático de Jornada</h5>
          </div>
          <div className="card-body">
            <p className="text-muted">
              Configura una fecha y hora para que la jornada se cierre automáticamente. 
              El sistema revisará cada minuto y cerrará la jornada cuando llegue la fecha configurada.
            </p>
            
            <div className="row align-items-end">
              <div className="col-md-6">
                <label className="form-label fw-bold">Fecha y Hora de Cierre (Hora de Chile GMT-3)</label>
                <input
                  type="datetime-local"
                  className="form-control form-control-lg"
                  value={fechaCierre}
                  onChange={(e) => setFechaCierre(e.target.value)}
                />
                {fechaCierre && (
                  <div className="alert alert-success mt-2 mb-0">
                    <strong>✅ Configurado:</strong> Se cerrará el {fechaCierre.split('T')[0].split('-').reverse().join('/')} a las {fechaCierre.split('T')[1]} hrs (Chile GMT-3)
                    <br/>
                    <small className="text-muted">La jornada se cerrará automáticamente a esta hora, sin importar dónde estés ubicado.</small>
                  </div>
                )}
              </div>
              <div className="col-md-6">
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={configurarFechaCierre}
                    disabled={!fechaCierre}
                  >
                    💾 Guardar Fecha de Cierre
                  </button>
                  {fechaCierre && (
                    <button
                      className="btn btn-outline-danger btn-lg"
                      onClick={eliminarFechaCierre}
                    >
                      🗑️ Eliminar
                    </button>
                  )}
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
                    {partidos.some(p => p.tipoPartido === 'VUELTA' || p.tipoPartido === 'FINAL') && <th>Penales</th>}
                    <th>Bonus</th>
                  </tr>
                </thead>
                <tbody>
                  {partidos.map((p) => (
                    <tr key={p.id}>
                      <td className="fw-bold">
                        <div className="d-flex align-items-center">
                          <LogoEquipo nombre={p.local} style={{ width: '24px', height: '24px' }} />
                          {p.local}
                        </div>
                      </td>
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
                      <td className="fw-bold">
                        <div className="d-flex align-items-center">
                          <LogoEquipo nombre={p.visita} style={{ width: '24px', height: '24px' }} />
                          {p.visita}
                        </div>
                      </td>
                      {partidos.some(partido => partido.tipoPartido === 'VUELTA' || partido.tipoPartido === 'FINAL') && (
                        <td>
                          {(() => {
                            const esVuelta = p.tipoPartido === 'VUELTA';
                            const esFinal = p.tipoPartido === 'FINAL';
                            const hayEmpateGlobal = calcularEmpateGlobal(p);
                            
                            // Para VUELTA: solo mostrar inputs si hay empate global
                            if (esVuelta && hayEmpateGlobal) {
                              return (
                                <div className="d-flex flex-column gap-1">
                                  <small className="text-danger fw-bold">⚠️ Empate global</small>
                                  <div className="d-flex justify-content-center align-items-center gap-2">
                                    <input
                                      type="number"
                                      min="0"
                                      className="form-control text-center border-warning"
                                      style={{ width: "60px" }}
                                      placeholder="P"
                                      value={p.penalesLocal ?? ""}
                                      onChange={(e) => handleCambiarGoles(p.id, "penalesLocal", e.target.value)}
                                    />
                                    <span>-</span>
                                    <input
                                      type="number"
                                      min="0"
                                      className="form-control text-center border-warning"
                                      style={{ width: "60px" }}
                                      placeholder="P"
                                      value={p.penalesVisita ?? ""}
                                      onChange={(e) => handleCambiarGoles(p.id, "penalesVisita", e.target.value)}
                                    />
                                  </div>
                                </div>
                              );
                            }
                            
                            // Para FINAL: siempre mostrar inputs de penales (puede empatar 90 min)
                            if (esFinal) {
                              return (
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
                              );
                            }
                            
                            return <span className="text-muted">-</span>;
                          })()}
                        </td>
                      )}
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
                {Number(jornadaSeleccionada) <= 6 && (
                  <button className="btn btn-outline-warning btn-lg" onClick={generarAzarFaseGruposCompleta}>
                    🎲✨ Azar Fase Grupos Completa
                  </button>
                )}
                <button className="btn btn-outline-info btn-lg" onClick={generarAzar}>
                  🎲 Azar Solo Jornada {jornadaSeleccionada}
                </button>
                <button className="btn btn-warning btn-lg" onClick={generarPDFTestigo}>
                  📄 PDF Testigo
                </button>
                <button className="btn btn-info btn-lg" onClick={generarPDFCompleto}>
                  📊 PDF Final
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
