import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function AdminMundialResultados() {
  const navigate = useNavigate();
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState("");
  const [partidos, setPartidos] = useState([]);
  const [jornadaCerrada, setJornadaCerrada] = useState(false);
  const [jornadaActiva, setJornadaActiva] = useState(false);
  const [jornadaId, setJornadaId] = useState(null);

  const jornadasOrdenadas = jornadas.sort((a, b) => a.numero - b.numero);

  useEffect(() => {
    cargarJornadas();
  }, []);

  useEffect(() => {
    if (!jornadaSeleccionada) return;
    fetchPartidos(jornadaSeleccionada);
    fetchJornadaInfo(jornadaSeleccionada);
  }, [jornadaSeleccionada]);

  const cargarJornadas = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/mundial/jornadas`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setJornadas(data);
      
      if (data.length > 0) {
        setJornadaSeleccionada(String(data[0].numero));
      }
    } catch (err) {
      console.error("Error al cargar jornadas:", err);
    }
  };

  const fetchPartidos = async (numero) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/mundial/partidos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      const partidosJornada = data.filter(p => p.jornada_numero === Number(numero));
      
      const partidosConGoles = partidosJornada.map(p => ({
        id: p.id,
        local: p.equipo_local,
        visita: p.equipo_visitante,
        golesLocal: p.resultado_local ?? "",
        golesVisita: p.resultado_visitante ?? "",
        bonus: p.bonus ?? 1,
        jornadaId: p.jornada_id,
        grupo: p.grupo,
        paisLocal: p.pais_local,
        paisVisita: p.pais_visita
      }));
      setPartidos(partidosConGoles);
    } catch (err) {
      console.error("Error al cargar partidos:", err);
    }
  };

  const fetchJornadaInfo = async (numero) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/mundial/jornadas`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const jornada = data.find(j => j.numero === Number(numero));
      
      setJornadaCerrada(!!jornada?.cerrada);
      setJornadaActiva(!!jornada?.activa);
      setJornadaId(jornada?.id);
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
      
      const partidosParaGuardar = partidos.map(p => ({
        id: p.id,
        resultado_local: p.golesLocal === "" ? null : Number(p.golesLocal),
        resultado_visitante: p.golesVisita === "" ? null : Number(p.golesVisita),
        bonus: p.bonus
      }));

      // Guardar resultados y bonus
      for (const partido of partidosParaGuardar) {
        await fetch(`${API_BASE_URL}/api/mundial/partidos/${partido.id}`, {
          method: "PATCH",
          headers: { 
            "Content-Type": "application/json",
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ 
            resultado_local: partido.resultado_local, 
            resultado_visitante: partido.resultado_visitante 
          }),
        });
      }
      
      const partidosConResultado = partidosParaGuardar.filter(p => p.resultado_local !== null && p.resultado_visitante !== null).length;
      const bonusModificados = partidosParaGuardar.filter(p => p.bonus !== 1).length;
      
      alert(`✅ Resultados guardados exitosamente\n\n📊 Resumen Jornada ${jornadaSeleccionada}:\n- ${partidosConResultado} de ${partidosParaGuardar.length} partidos con resultado\n- ${bonusModificados} partidos con bonus modificado\n\n💾 Datos guardados en la base de datos`);
      fetchPartidos(jornadaSeleccionada);
    } catch (error) {
      console.error("Error al guardar resultados:", error);
      alert("❌ Error al guardar resultados: " + (error.message || "Error desconocido"));
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

      const endpoint = jornada.cerrada 
        ? `${API_BASE_URL}/api/mundial/jornadas/${jornadaSeleccionada}/abrir`
        : `${API_BASE_URL}/api/mundial/jornadas/${jornadaSeleccionada}/cerrar`;

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        alert(jornada.cerrada ? "✅ Jornada abierta" : "✅ Jornada cerrada");
        await cargarJornadas();
        await fetchJornadaInfo(jornadaSeleccionada);
      } else {
        alert("❌ Error al cambiar estado de jornada");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("❌ Error al cambiar estado de jornada");
    }
  };

  const toggleActivarJornada = async () => {
    if (!jornadaSeleccionada) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/mundial/jornadas/${jornadaSeleccionada}/toggle`, {
        method: "PATCH",
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        alert(jornadaActiva ? "✅ Jornada desactivada (oculta)" : "✅ Jornada activada (visible)");
        await cargarJornadas();
        await fetchJornadaInfo(jornadaSeleccionada);
      } else {
        alert("❌ Error al cambiar visibilidad");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("❌ Error al cambiar visibilidad");
    }
  };

  const generarAzar = () => {
    const partidosAzar = partidos.map(p => ({
      ...p,
      golesLocal: Math.floor(Math.random() * 4),
      golesVisita: Math.floor(Math.random() * 4)
    }));
    setPartidos(partidosAzar);
  };

  const getSubtitulo = (numero) => {
    if (numero <= 3) return 'Fase de Grupos';
    if (numero === 4) return '16vos de Final';
    if (numero === 5) return 'Octavos de Final';
    if (numero === 6) return 'Cuartos de Final';
    if (numero === 7) return 'Semifinales y Final';
    return '';
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>⚽ Resultados y Jornadas - Mundial 2026</h2>
        <div className="d-flex gap-2">
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/admin/mundial')}
          >
            ⚙️ Generador de Fixture
          </button>
          <button 
            className="btn btn-warning"
            onClick={() => navigate('/admin/mundial/gestion')}
          >
            🔧 Gestión
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/admin')}
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
              <div className="table-responsive">
                <table className="table table-bordered text-center align-middle">
                  <thead className="table-dark">
                    <tr>
                      <th style={{ width: '5%' }}>#</th>
                      <th style={{ width: '30%' }}>Equipo Local</th>
                      <th style={{ width: '15%' }}>Resultado</th>
                      <th style={{ width: '30%' }}>Equipo Visitante</th>
                      <th style={{ width: '10%' }}>Bonus</th>
                      <th style={{ width: '10%' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partidos.map((partido, index) => (
                      <tr key={partido.id}>
                        <td className="fw-bold">{index + 1}</td>
                        <td className="text-start">
                          <div className="d-flex flex-column">
                            <span className="fw-bold">{partido.local}</span>
                            <div className="d-flex gap-1">
                              {partido.paisLocal && <span className="badge bg-secondary">{partido.paisLocal}</span>}
                              {partido.grupo && <span className="badge bg-primary">Grupo {partido.grupo}</span>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="d-flex justify-content-center align-items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              className="form-control form-control-sm text-center"
                              style={{ width: "60px" }}
                              value={partido.golesLocal}
                              onChange={(e) => handleCambiarGoles(partido.id, "golesLocal", e.target.value)}
                            />
                            <span className="fw-bold">-</span>
                            <input
                              type="number"
                              min="0"
                              className="form-control form-control-sm text-center"
                              style={{ width: "60px" }}
                              value={partido.golesVisita}
                              onChange={(e) => handleCambiarGoles(partido.id, "golesVisita", e.target.value)}
                            />
                          </div>
                        </td>
                        <td className="text-start">
                          <div className="d-flex flex-column">
                            <span className="fw-bold">{partido.visita}</span>
                            {partido.paisVisita && <span className="badge bg-secondary">{partido.paisVisita}</span>}
                          </div>
                        </td>
                        <td>
                          <select
                            className="form-select form-select-sm"
                            value={partido.bonus}
                            onChange={(e) => handleCambiarBonus(partido.id, e.target.value)}
                          >
                            <option value="1">x1</option>
                            <option value="2">x2</option>
                            <option value="3">x3</option>
                            <option value="5">x5</option>
                          </select>
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleCambiarGoles(partido.id, "golesLocal", "")}
                            title="Limpiar"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="d-flex justify-content-between mt-3">
                <button className="btn btn-warning" onClick={generarAzar}>
                  🎲 Generar Al Azar
                </button>
                <button className="btn btn-success btn-lg" onClick={guardarResultados}>
                  💾 Guardar Resultados
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {partidos.length === 0 && jornadaSeleccionada && (
        <div className="alert alert-info">
          <h5>📋 No hay partidos en esta jornada</h5>
          <p className="mb-0">El fixture aún no ha sido creado para esta jornada.</p>
        </div>
      )}
    </div>
  );
}
