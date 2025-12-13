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

export default function JornadaLibertadores() {
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
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      // Cargar jornada y partidos
      const jornadaRes = await axios.get(`${API_URL}/api/libertadores/jornadas/${numero}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setJornada(jornadaRes.data);
      setPartidos(jornadaRes.data.partidos || []);

      // Cargar pronósticos guardados
      const pronosticosRes = await axios.get(`${API_URL}/api/libertadores-pronosticos/jornada/${numero}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const map = {};
      pronosticosRes.data.forEach(pr => {
        map[pr.partido_id] = {
          goles_local: pr.goles_local,
          goles_visita: pr.goles_visita
        };
      });
      setPronosticos(map);
    } catch (error) {
      console.error('Error cargando datos:', error);
      setMensaje("❌ Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (partidoId, campo, valor) => {
    setPronosticos((prev) => ({
      ...prev,
      [partidoId]: {
        ...prev[partidoId],
        [campo]: valor === "" ? "" : Number(valor),
      },
    }));
  };

  const generarAleatorioTodos = () => {
    const nuevosPronosticos = {};
    partidos.forEach(partido => {
      nuevosPronosticos[partido.id] = {
        goles_local: Math.floor(Math.random() * 5), // 0 a 4
        goles_visita: Math.floor(Math.random() * 5), // 0 a 4
      };
    });
    setPronosticos(nuevosPronosticos);
  };

  const resetearTodos = () => {
    const nuevosPronosticos = {};
    partidos.forEach(partido => {
      nuevosPronosticos[partido.id] = {
        goles_local: 0,
        goles_visita: 0,
      };
    });
    setPronosticos(nuevosPronosticos);
  };

  const handleEnviar = async () => {
    if (!jornada || jornada.cerrada) return;

    try {
      setMensaje("");
      const token = localStorage.getItem("token");

      const respuestas = await Promise.all(
        partidos.map((partido) =>
          axios.post(`${API_URL}/api/libertadores-pronosticos`, {
            partido_id: partido.id,
            jornada_id: jornada.id,
            goles_local: Number(pronosticos[partido.id]?.goles_local ?? 0),
            goles_visita: Number(pronosticos[partido.id]?.goles_visita ?? 0),
          }, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          })
        )
      );

      const todosOk = respuestas.every((r) => r.status === 200);
      setMensaje(todosOk ? "✅ Pronósticos guardados correctamente" : "❌ Error al guardar algunos pronósticos");
      
      if (todosOk) {
        setTimeout(() => setMensaje(""), 3000);
      }
    } catch (err) {
      console.error('Error enviando pronósticos:', err);
      setMensaje("❌ Error al enviar pronósticos: " + (err.response?.data?.error || err.message));
    }
  };

  const getSubtitulo = (numero) => {
    if (numero <= 6) return 'Fase de Grupos';
    if (numero === 7) return 'Octavos de Final IDA';
    if (numero === 8) return 'Octavos de Final VUELTA';
    if (numero === 9) return 'Cuartos de Final IDA/VUELTA';
    if (numero === 10) return 'Semifinales IDA/VUELTA + Final + Cuadro Final';
    return '';
  };

  if (loading) {
    return (
      <div className="container text-center mt-5">
        <div className="spinner-border text-danger" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  if (!jornada) {
    return (
      <div className="container text-center mt-5">
        <div className="alert alert-danger">Jornada no encontrada</div>
        <button className="btn btn-primary" onClick={() => navigate("/libertadores")}>
          Volver a Libertadores
        </button>
      </div>
    );
  }

  return (
    <div className="container mt-4 mb-5">
      <div className="text-center mb-4">
        <h1 className="display-6 fw-bold text-danger">🔴 Copa Libertadores 2026</h1>
        
        <h2 className="h4 mb-1">Jornada {numero}</h2>
        <p className="text-muted small mb-3">{getSubtitulo(Number(numero))}</p>
        
        {jornada.cerrada && (
          <div className="alert alert-warning mt-3">
            🔒 Esta jornada está cerrada. No puedes modificar los pronósticos.
          </div>
        )}
      </div>

      {mensaje && (
        <div className={`alert ${mensaje.includes('✅') ? 'alert-success' : 'alert-danger'} text-center`}>
          {mensaje}
        </div>
      )}

      {partidos.length === 0 ? (
        <div className="alert alert-info text-center">
          No hay partidos configurados para esta jornada
        </div>
      ) : (
        <>
          <div className="row g-3 mb-4">
            {partidos.map((partido) => (
              <div key={partido.id} className="col-12 col-md-6">
                <div className="card shadow-sm">
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h6 className="mb-0 text-muted">
                        {new Date(partido.fecha).toLocaleDateString('es-CL')} - {new Date(partido.fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </h6>
                      {partido.bonus > 1 && (
                        <span className="badge bg-warning text-dark">⭐ Bonus x{partido.bonus}</span>
                      )}
                    </div>

                    {(partido.grupo_local || partido.grupo_visita) && (
                      <div className="text-center mb-2">
                        <span className="badge bg-primary" style={{ fontSize: '0.7rem' }}>
                          GRUPO {partido.grupo_local || partido.grupo_visita}
                        </span>
                      </div>
                    )}

                    <div className="row align-items-center text-center">
                      <div className="col-5">
                        <p className="fw-bold mb-2">
                          {partido.nombre_local}
                          {partido.pais_local && <span className="text-muted ms-1">({partido.pais_local})</span>}
                        </p>
                        <input
                          type="number"
                          min="0"
                          className="form-control form-control-lg text-center fw-bold"
                          style={{ MozAppearance: 'textfield' }}
                          value={pronosticos[partido.id]?.goles_local ?? ""}
                          onChange={(e) => handleChange(partido.id, "goles_local", e.target.value)}
                          disabled={jornada.cerrada}
                          placeholder="0"
                        />
                      </div>

                      <div className="col-2">
                        <p className="fw-bold text-muted fs-3">VS</p>
                      </div>

                      <div className="col-5">
                        <p className="fw-bold mb-2">
                          {partido.nombre_visita}
                          {partido.pais_visita && <span className="text-muted ms-1">({partido.pais_visita})</span>}
                        </p>
                        <input
                          type="number"
                          min="0"
                          className="form-control form-control-lg text-center fw-bold"
                          style={{ MozAppearance: 'textfield' }}
                          value={pronosticos[partido.id]?.goles_visita ?? ""}
                          onChange={(e) => handleChange(partido.id, "goles_visita", e.target.value)}
                          disabled={jornada.cerrada}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {partido.goles_local !== null && partido.goles_visita !== null && (
                      <div className="text-center mt-3">
                        <span className="badge bg-success">
                          Resultado: {partido.goles_local} - {partido.goles_visita}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!jornada.cerrada && (
            <div className="text-center d-flex gap-3 justify-content-center flex-wrap">
              <button className="btn btn-outline-info btn-lg px-4" onClick={generarAleatorioTodos}>
                🎲 Azar
              </button>
              <button className="btn btn-outline-secondary btn-lg px-4" onClick={resetearTodos}>
                🔄 Resetear
              </button>
              <button className="btn btn-danger btn-lg px-5" onClick={handleEnviar}>
                💾 Guardar Pronósticos
              </button>
              <button
                className="btn btn-outline-secondary btn-lg"
                onClick={() => navigate(`/libertadores/jornada/${Number(numero) - 1}`)}
                disabled={Number(numero) <= 1}
              >
                ← Anterior
              </button>
              <button
                className="btn btn-outline-secondary btn-lg"
                onClick={() => navigate(`/libertadores/jornada/${Number(numero) + 1}`)}
                disabled={Number(numero) >= 10}
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}

      <div className="text-center mt-4">
        <button className="btn btn-outline-secondary" onClick={() => navigate("/libertadores")}>
          ← Volver a Libertadores
        </button>
      </div>
    </div>
  );
}
