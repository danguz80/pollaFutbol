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

export default function JornadaMundial() {
  const usuario = useAuth();
  const navigate = useNavigate();
  const { numero } = useParams();

  const [jornada, setJornada] = useState(null);
  const [partidos, setPartidos] = useState([]);
  const [pronosticos, setPronosticos] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!usuario) {
      navigate("/login");
      return;
    }
    cargarDatos();
  }, [numero]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Cargar jornada
      const jornadaResponse = await axios.get(
        `${API_URL}/api/mundial/jornadas`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const jornadaActual = jornadaResponse.data.find(j => j.numero === Number(numero));
      setJornada(jornadaActual);

      // Cargar partidos de esta jornada
      const partidosResponse = await axios.get(
        `${API_URL}/api/mundial/partidos`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const partidosJornada = partidosResponse.data.filter(
        p => p.jornada_numero === Number(numero)
      );
      setPartidos(partidosJornada);

      // Cargar pronósticos del usuario para esta jornada
      try {
        const pronosticosResponse = await axios.get(
          `${API_URL}/api/mundial/pronosticos/${numero}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        const pronosticosMap = {};
        pronosticosResponse.data.forEach(p => {
          pronosticosMap[p.partido_id] = {
            goles_local: p.resultado_local,
            goles_visita: p.resultado_visitante,
          };
        });
        setPronosticos(pronosticosMap);
      } catch (error) {
        console.log("No hay pronósticos previos");
      }

    } catch (error) {
      console.error("Error cargando datos:", error);
      setMensaje("Error cargando datos de la jornada");
    } finally {
      setLoading(false);
    }
  };

  const handlePronosticoChange = (partidoId, campo, valor) => {
    setPronosticos(prev => ({
      ...prev,
      [partidoId]: {
        ...prev[partidoId],
        [campo]: valor === "" ? "" : Number(valor)
      }
    }));
  };

  const guardarPronosticos = async () => {
    if (!jornada?.activa) {
      alert("⚠️ Esta jornada no está disponible para ingresar pronósticos");
      return;
    }

    if (jornada?.cerrada) {
      alert("⚠️ Esta jornada ya está cerrada, no se pueden modificar pronósticos");
      return;
    }

    const pronosticosArray = partidos.map(partido => {
      const pronostico = pronosticos[partido.id] || {};
      return {
        partido_id: partido.id,
        resultado_local: pronostico.goles_local ?? 0,
        resultado_visitante: pronostico.goles_visita ?? 0
      };
    });

    // Validar que todos los partidos tengan pronósticos
    const hayVacios = pronosticosArray.some(
      p => p.resultado_local === "" || p.resultado_visitante === "" ||
           p.resultado_local === undefined || p.resultado_visitante === undefined
    );

    if (hayVacios) {
      alert("⚠️ Debes completar todos los pronósticos antes de guardar");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API_URL}/api/mundial/pronosticos/${numero}`,
        { pronosticos: pronosticosArray },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMensaje("✅ Pronósticos guardados exitosamente");
      setTimeout(() => setMensaje(""), 3000);
    } catch (error) {
      console.error("Error guardando pronósticos:", error);
      alert(`❌ Error: ${error.response?.data?.error || error.message}`);
    }
  };

  const getSubtitulo = (numero) => {
    if (numero <= 3) return 'Fase de Grupos';
    if (numero === 4) return '16vos de Final';
    if (numero === 5) return 'Octavos de Final';
    if (numero === 6) return 'Cuartos de Final';
    if (numero === 7) return 'Semifinales y Final';
    return '';
  };

  if (loading) {
    return (
      <div className="container text-center mt-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  if (!jornada) {
    return (
      <div className="container mt-4">
        <div className="alert alert-danger">
          <h4>❌ Jornada no encontrada</h4>
          <button className="btn btn-primary mt-2" onClick={() => navigate("/mundial")}>
            Volver al Mundial
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4 mb-5">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">🌍 {jornada.nombre}</h2>
          <p className="text-muted mb-0">{getSubtitulo(Number(numero))}</p>
        </div>
        <button 
          className="btn btn-secondary"
          onClick={() => navigate("/mundial")}
        >
          ← Volver
        </button>
      </div>

      {/* Estado de la Jornada */}
      <div className="card mb-4">
        <div className={`card-header ${jornada.cerrada ? 'bg-danger' : jornada.activa ? 'bg-success' : 'bg-warning'} text-white`}>
          <h5 className="mb-0">
            {jornada.cerrada ? '🔒 Jornada Cerrada' : jornada.activa ? '✅ Jornada Abierta' : '⏸️ Jornada Inactiva'}
          </h5>
        </div>
        <div className="card-body">
          {jornada.cerrada ? (
            <p className="mb-0">Esta jornada ya está cerrada. Puedes ver los resultados pero no modificar pronósticos.</p>
          ) : jornada.activa ? (
            <p className="mb-0">Puedes ingresar tus pronósticos. Recuerda guardarlos antes del cierre.</p>
          ) : (
            <p className="mb-0">Esta jornada aún no está disponible para ingresar pronósticos.</p>
          )}
        </div>
      </div>

      {/* Mensaje de confirmación */}
      {mensaje && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          {mensaje}
          <button type="button" className="btn-close" onClick={() => setMensaje("")}></button>
        </div>
      )}

      {/* Partidos */}
      {partidos.length === 0 ? (
        <div className="alert alert-info">
          <h5>📋 No hay partidos programados</h5>
          <p className="mb-0">El fixture de esta jornada aún no ha sido creado por el administrador.</p>
        </div>
      ) : (
        <>
          <div className="card shadow-sm mb-4">
            <div className="card-header bg-info text-white">
              <h5 className="mb-0">⚽ Partidos de la Jornada</h5>
            </div>
            <div className="card-body">
              <div className="table-responsive">
                <table className="table table-hover align-middle">
                  <thead className="table-dark">
                    <tr>
                      <th className="text-center" style={{ width: '5%' }}>#</th>
                      <th style={{ width: '30%' }}>Equipo Local</th>
                      <th className="text-center" style={{ width: '15%' }}>Pronóstico</th>
                      <th style={{ width: '30%' }}>Equipo Visitante</th>
                      {jornada.cerrada && <th className="text-center" style={{ width: '10%' }}>Resultado</th>}
                      {jornada.cerrada && <th className="text-center" style={{ width: '10%' }}>Puntos</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {partidos.map((partido, index) => {
                      const pronostico = pronosticos[partido.id] || {};
                      const puedeEditar = jornada.activa && !jornada.cerrada;
                      
                      return (
                        <tr key={partido.id}>
                          <td className="text-center fw-bold">{index + 1}</td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <span className="fw-bold">{partido.equipo_local}</span>
                              {partido.pais_local && (
                                <span className="badge bg-secondary">{partido.pais_local}</span>
                              )}
                              {partido.grupo && (
                                <span className="badge bg-primary">Grupo {partido.grupo}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="d-flex justify-content-center align-items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                className="form-control form-control-sm text-center"
                                style={{ width: '60px' }}
                                value={pronostico.goles_local ?? ""}
                                onChange={(e) => handlePronosticoChange(partido.id, 'goles_local', e.target.value)}
                                disabled={!puedeEditar}
                              />
                              <span className="fw-bold">-</span>
                              <input
                                type="number"
                                min="0"
                                className="form-control form-control-sm text-center"
                                style={{ width: '60px' }}
                                value={pronostico.goles_visita ?? ""}
                                onChange={(e) => handlePronosticoChange(partido.id, 'goles_visita', e.target.value)}
                                disabled={!puedeEditar}
                              />
                            </div>
                          </td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              <span className="fw-bold">{partido.equipo_visitante}</span>
                              {partido.pais_visita && (
                                <span className="badge bg-secondary">{partido.pais_visita}</span>
                              )}
                            </div>
                          </td>
                          {jornada.cerrada && (
                            <>
                              <td className="text-center">
                                {partido.resultado_local !== null && partido.resultado_visitante !== null ? (
                                  <span className="badge bg-dark fs-6">
                                    {partido.resultado_local} - {partido.resultado_visitante}
                                  </span>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td className="text-center">
                                {pronostico.puntos !== undefined ? (
                                  <span className={`badge ${pronostico.puntos > 0 ? 'bg-success' : 'bg-danger'} fs-6`}>
                                    {pronostico.puntos}
                                  </span>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {jornada.activa && !jornada.cerrada && (
                <div className="d-grid gap-2 mt-4">
                  <button
                    className="btn btn-success btn-lg"
                    onClick={guardarPronosticos}
                  >
                    💾 Guardar Pronósticos
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Información adicional */}
          <div className="alert alert-info">
            <h6 className="alert-heading">ℹ️ Información:</h6>
            <ul className="mb-0">
              <li><strong>Bonus de la jornada:</strong> Los partidos pueden tener multiplicadores de puntos</li>
              <li>Completa todos los pronósticos antes de guardar</li>
              <li>Puedes modificar tus pronósticos mientras la jornada esté abierta</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
