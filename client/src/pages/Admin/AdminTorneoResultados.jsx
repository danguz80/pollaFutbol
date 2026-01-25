import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AccesosDirectos from "../../components/AccesosDirectos";

const API_BASE_URL = import.meta.env.VITE_API_URL;

// Mapeo de logos
const LOGOS_EQUIPOS = {
  'Audax Italiano': '/logos_torneo_nacional/audax.png',
  'Unión La Calera': '/logos_torneo_nacional/calera.png',
  'Cobresal': '/logos_torneo_nacional/cobresal.png',
  'Colo-Colo': '/logos_torneo_nacional/colo-colo.png',
  'Deportes Iquique': '/logos_torneo_nacional/iquique.png',
  'Coquimbo Unido': '/logos_torneo_nacional/coquimbo.png',
  'Everton': '/logos_torneo_nacional/everton.png',
  'Huachipato': '/logos_torneo_nacional/huachipato.png',
  'Deportes La Serena': '/logos_torneo_nacional/laserena.png',
  'Deportes Limache': '/logos_torneo_nacional/limache.webp',
  'Deportes Concepción': '/logos_torneo_nacional/concepcion.png',
  'U. de Concepción': '/logos_torneo_nacional/udeconce.png',
  "O'Higgins": '/logos_torneo_nacional/ohiggins.webp',
  'Palestino': '/logos_torneo_nacional/palestino.png',
  'U. Católica': '/logos_torneo_nacional/uc.png',
  'U. de Chile': '/logos_torneo_nacional/udechile.png',
  'Unión Española': '/logos_torneo_nacional/union-espanola.png',
  'Ñublense': '/logos_torneo_nacional/ñublense.png'
};

const getLogoEquipo = (nombreEquipo) => {
  // Normalizar apóstrofes: \u2019 (tipográfico) → ' (normal)
  const nombreNormalizado = nombreEquipo?.replace(/[\u2018\u2019]/g, "'");
  return LOGOS_EQUIPOS[nombreNormalizado] || null;
};

export default function AdminTorneoResultados() {
  const navigate = useNavigate();
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState("");
  const [partidos, setPartidos] = useState([]);
  const [jornadaCerrada, setJornadaCerrada] = useState(false);
  const [jornadaId, setJornadaId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [modalType, setModalType] = useState("success"); // success, warning, error

  // Obtener jornadas al montar
  useEffect(() => {
    const cargarJornadas = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/jornadas`);
        const data = await res.json();
        setJornadas(data);
        
        // Buscar la última jornada que tenga pronósticos
        const jornadasConPronosticos = data.filter(j => j.numero !== 999);
        
        // Consultar cuál es la última jornada con pronósticos
        for (let i = jornadasConPronosticos.length - 1; i >= 0; i--) {
          const jornada = jornadasConPronosticos[i];
          try {
            const resPronosticos = await fetch(`${API_BASE_URL}/api/pronosticos/jornada/${jornada.numero}`);
            const pronosticos = await resPronosticos.json();
            if (pronosticos && pronosticos.length > 0) {
              setJornadaSeleccionada(String(jornada.numero));
              break;
            }
          } catch (err) {
            console.error(`Error verificando pronósticos jornada ${jornada.numero}:`, err);
          }
        }
        
        // Si no hay ninguna con pronósticos, seleccionar la última jornada
        if (!jornadaSeleccionada && jornadasConPronosticos.length > 0) {
          setJornadaSeleccionada(String(jornadasConPronosticos[jornadasConPronosticos.length - 1].numero));
        }
      } catch (err) {
        console.error("Error al cargar jornadas:", err);
      }
    };
    
    cargarJornadas();
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

  const fetchJornadaInfo = async (numero) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/jornadas/${numero}`);
      const data = await res.json();
      setJornadaCerrada(!!data.cerrada);
      setJornadaId(data.id);
    } catch (err) {
      setJornadaCerrada(false);
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
      const res = await fetch(`${API_BASE_URL}/api/jornadas/${jornadaSeleccionada}/partidos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partidos }),
      });
      const data = await res.json();
      alert(data.mensaje || "✅ Resultados guardados en la base de datos");
      fetchPartidos(jornadaSeleccionada);
    } catch (error) {
      console.error("Error al guardar resultados:", error);
      alert("❌ Error al guardar resultados");
    }
  };

  const calcularPuntajes = async () => {
    if (!jornadaSeleccionada) return;
    if (!confirm("¿Calcular puntajes de esta jornada y generar PDF con resultados completos?\n\nEl PDF incluirá: pronósticos, resultados reales, puntos, rankings y ganadores. Se enviará automáticamente por email.")) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/api/pronosticos/calcular/${jornadaSeleccionada}`, {
        method: "POST"
      });
      const data = await res.json();
      
      console.log('📊 Respuesta del servidor:', data);
      
      // Mostrar modal en lugar de alert
      if (data.pdfGenerado) {
        setModalType("success");
        setModalMessage(`✅ Puntajes calculados correctamente\n\n📧 PDF enviado por email con:\n• Pronósticos\n• Resultados reales\n• Puntos por jugador\n• Ranking de la jornada\n• Ranking acumulado\n• Ganadores\n\n📊 ${data.actualizados} pronósticos actualizados`);
      } else {
        setModalType("warning");
        setModalMessage(`⚠️ ${data.mensaje}\n\n📊 ${data.actualizados} pronósticos actualizados`);
      }
      setShowModal(true);
    } catch (error) {
      console.error("Error al calcular puntajes:", error);
      setModalType("error");
      setModalMessage("❌ Error al calcular puntajes\n\n" + (error.message || "Error desconocido"));
      setShowModal(true);
    }
  };

  const generarAzar = () => {
    const partidosAzar = partidos.map(p => ({
      ...p,
      golesLocal: Math.floor(Math.random() * 5), // 0 a 4
      golesVisita: Math.floor(Math.random() * 5)  // 0 a 4
    }));
    setPartidos(partidosAzar);
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
      const res = await fetch(`${API_BASE_URL}/api/pronosticos/generar-pdf/${jornadaSeleccionada}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
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
        body: JSON.stringify({ cerrada: !jornadaCerrada })
      });
      const data = await res.json();
      setJornadaCerrada(!!data.jornada?.cerrada);
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

  return (
    <div className="container mt-4">
      <AccesosDirectos />
      
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>📊 Resultados y Jornadas - Torneo Nacional</h2>
        <button 
          className="btn btn-secondary"
          onClick={() => navigate('/admin/torneo-nacional')}
        >
          ← Volver
        </button>
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
            {jornadas
              .filter(j => j.numero !== 999)
              .map((j) => (
                <option key={j.id} value={j.numero}>
                  Jornada {j.numero} {j.cerrada ? "🔒" : "🔓"}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Botón cerrar/abrir jornada */}
      {jornadaSeleccionada && (
        <div className="card mb-4">
          <div className="card-header">
            <h5>Estado de la Jornada</h5>
          </div>
          <div className="card-body">
            <div className="d-flex align-items-center gap-3">
              <button
                className={`btn btn-lg ${jornadaCerrada ? "btn-danger" : "btn-success"}`}
                onClick={toggleCierreJornada}
              >
                {jornadaCerrada ? "🔓 Abrir Jornada" : "🔒 Cerrar Jornada"}
              </button>
              <div className="alert alert-info mb-0 flex-grow-1">
                <strong>Estado actual:</strong> {jornadaCerrada ? "Cerrada (Los jugadores no pueden modificar pronósticos)" : "Abierta (Los jugadores pueden ingresar pronósticos)"}
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
                    <th>Bonus</th>
                  </tr>
                </thead>
                <tbody>
                  {partidos.map((p) => (
                    <tr key={p.id}>
                      <td className="fw-bold">
                        <div className="d-flex align-items-center gap-2">
                          {getLogoEquipo(p.local) && (
                            <img 
                              src={getLogoEquipo(p.local)} 
                              alt={p.local}
                              style={{ width: '28px', height: '28px', objectFit: 'contain' }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          )}
                          <span>{p.local}</span>
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
                        <div className="d-flex align-items-center gap-2 justify-content-end">
                          <span>{p.visita}</span>
                          {getLogoEquipo(p.visita) && (
                            <img 
                              src={getLogoEquipo(p.visita)} 
                              alt={p.visita}
                              style={{ width: '28px', height: '28px', objectFit: 'contain' }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          )}
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
                <button className="btn btn-warning btn-lg" onClick={generarPDFTestigo}>
                  📄 PDF Testigo
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
                    const maxJornada = Math.max(...jornadas.filter(j => j.numero !== 999).map(j => j.numero));
                    if (jornadaActual < maxJornada) {
                      setJornadaSeleccionada(String(jornadaActual + 1));
                    }
                  }}
                  disabled={Number(jornadaSeleccionada) >= Math.max(...jornadas.filter(j => j.numero !== 999).map(j => j.numero))}
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
          <p className="mb-0">Podrás ingresar resultados reales, cerrar/abrir la jornada y calcular puntajes</p>
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
