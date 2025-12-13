import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import JornadaSelector from "../components/JornadaSelector";
import AccesosDirectos from "../components/AccesosDirectos";
import CuentaRegresivaGlobal from "../components/CuentaRegresivaGlobal";

// Accede a la variable de entorno
const API_BASE_URL = import.meta.env.VITE_API_URL;


// Hook local para obtener usuario desde localStorage
function useAuth() {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuario"));
    return usuario;
  } catch {
    return null;
  }
}

export default function Jornada() {
  const usuario = useAuth();
  const navigate = useNavigate();

  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState(null); // el número de la jornada
  const [jornadaIdSeleccionada, setJornadaIdSeleccionada] = useState(null); // el ID real de la jornada
  const [partidos, setPartidos] = useState([]);
  const [pronosticos, setPronosticos] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [cerrada, setCerrada] = useState(false); // Estado de cierre
  const [loading, setLoading] = useState(false);

  // Si no es jugador, fuera
  useEffect(() => {
    if (!usuario) return;
    if (usuario.rol !== "jugador") {
      navigate("/");
    }
  }, [usuario, navigate]);

  // Cargar jornadas disponibles
  useEffect(() => {
    // Usar la variable de entorno para la URL del backend
    fetch(`${API_BASE_URL}/api/jornadas`)
      .then((res) => res.json())
      .then(setJornadas)
      .catch((err) => console.error("Error al cargar jornadas", err));
  }, []);

  // Cuando cambia jornadaSeleccionada, obtenemos el id real y los datos
  useEffect(() => {
    if (!jornadaSeleccionada) return;
    setLoading(true);

    // Buscar el id real en jornadas
    const jornadaObj = jornadas.find(j => String(j.numero) === String(jornadaSeleccionada));
    setJornadaIdSeleccionada(jornadaObj ? jornadaObj.id : null);

    // 1. Cargar partidos
    // Usar la variable de entorno para la URL del backend
    fetch(`${API_BASE_URL}/api/jornadas/${jornadaSeleccionada}/partidos`)
      .then((res) => res.json())
      .then(setPartidos)
      .catch((err) => {
        setPartidos([]);
        console.error("Error al cargar partidos", err);
      });

    // 2. Cargar pronósticos guardados
    const token = localStorage.getItem("token");
    // Usar la variable de entorno para la URL del backend
    fetch(`${API_BASE_URL}/api/pronosticos/${jornadaSeleccionada}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(pronosticosDb => {
        const map = {};
        pronosticosDb.forEach(pr => {
          map[pr.partido_id] = {
            goles_local: pr.goles_local,
            goles_visita: pr.goles_visita
          };
        });
        setPronosticos(map);
        setLoading(false);
      })
      .catch(() => {
        setPronosticos({});
        setLoading(false);
      });

    // 3. Cargar si está cerrada
    // Usar la variable de entorno para la URL del backend
    fetch(`${API_BASE_URL}/api/jornadas/${jornadaSeleccionada}`)
      .then(res => res.json())
      .then(j => setCerrada(!!j.cerrada))
      .catch(() => setCerrada(false));
  }, [jornadaSeleccionada, jornadas]);

  const handleChange = (partidoId, campo, valor) => {
    setPronosticos((prev) => ({
      ...prev,
      [partidoId]: {
        ...prev[partidoId],
        [campo]: valor,
      },
    }));
  };

  const handleEnviar = async () => {
    if (cerrada) return; // Seguridad extra
    try {
      setMensaje("");
      const token = localStorage.getItem("token");

      // Usamos jornadaIdSeleccionada
      if (!jornadaIdSeleccionada) {
        setMensaje("❌ Error interno: no se pudo determinar el ID de la jornada");
        return;
      }

      const respuestas = await Promise.all(
        partidos.map((partido) =>
          // Usar la variable de entorno para la URL del backend
          fetch(`${API_BASE_URL}/api/pronosticos`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              partido_id: partido.id,
              jornada_id: jornadaIdSeleccionada,
              goles_local: Number(pronosticos[partido.id]?.goles_local ?? 0),
              goles_visita: Number(pronosticos[partido.id]?.goles_visita ?? 0),
            }),
          })
        )
      );
      const todosOk = respuestas.every((r) => r.ok);
      setMensaje(todosOk ? "✅ Pronósticos guardados correctamente" : "❌ Error al guardar algunos pronósticos");
    } catch (err) {
      setMensaje("❌ Error al enviar pronósticos");
    }
  };

  if (!usuario) return <p className="text-center mt-5">Cargando...</p>;

  return (
    <div className="container mt-4">
      <h2>📅 Ingresar Pronósticos</h2>
      <AccesosDirectos />
      <CuentaRegresivaGlobal />
      <JornadaSelector
        jornadas={jornadas}
        onSelect={setJornadaSeleccionada}
      />

      {jornadaSeleccionada && (
        <>
          <h5 className="mt-4 mb-3">Jornada {jornadaSeleccionada}</h5>

          {cerrada && (
            <div className="alert alert-danger mb-3">
              <strong>Esta jornada está cerrada.</strong> Ya no puedes modificar tus pronósticos.
            </div>
          )}

          {loading ? (
            <div className="text-center">Cargando partidos...</div>
          ) : (
            partidos.map((p) => (
              <div key={p.id} className="border p-3 mb-3 rounded">
                <strong>{p.local} vs {p.visita}</strong><br />
                <div className="row mt-2">
                  <div className="col">
                    <input
                      type="number"
                      className="form-control"
                      placeholder="Goles local"
                      value={pronosticos[p.id]?.goles_local ?? ""}
                      onChange={(e) => handleChange(p.id, "goles_local", e.target.value)}
                      disabled={cerrada}
                    />
                  </div>
                  <div className="col">
                    <input
                      type="number"
                      className="form-control"
                      placeholder="Goles visita"
                      value={pronosticos[p.id]?.goles_visita ?? ""}
                      onChange={(e) => handleChange(p.id, "goles_visita", e.target.value)}
                      disabled={cerrada}
                    />
                  </div>
                </div>
              </div>
            ))
          )}

          {mensaje && <div className="alert alert-info mt-3">{mensaje}</div>}

          {partidos.length > 0 && (
            <div className="d-flex gap-2 mt-3">
              <button
                className="btn btn-success flex-grow-1"
                onClick={handleEnviar}
                disabled={cerrada || loading}
              >
                Guardar Pronósticos
              </button>
              <button
                className="btn btn-outline-secondary"
                onClick={() => setJornadaSeleccionada(jornadaSeleccionada - 1)}
                disabled={jornadaSeleccionada <= 1}
              >
                ← Anterior
              </button>
              <button
                className="btn btn-outline-secondary"
                onClick={() => setJornadaSeleccionada(jornadaSeleccionada + 1)}
                disabled={jornadaSeleccionada >= Math.max(...jornadas.map(j => j.numero))}
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
