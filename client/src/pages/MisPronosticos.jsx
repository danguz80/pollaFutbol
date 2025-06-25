import React, { useEffect, useState } from "react";

// Accede a la variable de entorno
const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;

export default function MisPronosticos() {
  const [pronosticos, setPronosticos] = useState([]);
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState("");
  const [loading, setLoading] = useState(true);
  const [sinToken, setSinToken] = useState(false);

  // Cargar jornadas disponibles (NO necesita token)
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas`)
      .then(res => res.json())
      .then(data => {
        setJornadas(data);
        if (data.length) setJornadaSeleccionada(data[data.length - 1].numero);
      });
  }, []);

  // Cargar pronósticos propios SOLO si hay token
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setSinToken(true);
      setLoading(false);
      return;
    }

    fetch(`${API_BASE_URL}/api/pronosticos/mis`, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(data => {
        setPronosticos(data);
        setLoading(false);
      }).catch(() => {
        setPronosticos([]);
        setLoading(false);
      });
  }, []); // Si quieres recargar si cambia token, pon [localStorage.getItem("token")]

  if (loading) return <div className="text-center mt-4">Cargando...</div>;
  if (sinToken) return <div className="alert alert-warning text-center mt-4">Debes iniciar sesión para ver tus pronósticos.</div>;

  // Eliminar duplicados: solo último pronóstico por partido y jornada
  const pronosticosUnicos = [];
  const seen = new Set();
  for (let i = pronosticos.length - 1; i >= 0; i--) {
    const p = pronosticos[i];
    const key = `${p.jornada}|${p.nombre_local}|${p.nombre_visita}`;
    if (!seen.has(key)) {
      pronosticosUnicos.unshift(p);
      seen.add(key);
    }
  }

  // Filtrar por jornada seleccionada, o mostrar todos si vacío
  const pronosticosFiltrados = jornadaSeleccionada
    ? pronosticosUnicos.filter(p => `${p.jornada}` === `${jornadaSeleccionada}`)
    : pronosticosUnicos;

  // Agrupar por jornada
  const jornadasAgrupadas = {};
  pronosticosFiltrados.forEach(p => {
    if (!jornadasAgrupadas[p.jornada]) jornadasAgrupadas[p.jornada] = [];
    jornadasAgrupadas[p.jornada].push(p);
  });

  return (
    <div className="container mt-4">
      <h2 className="mb-4 text-center">📊 Mis Pronósticos y Puntajes</h2>

      {/* --- Selector de jornadas --- */}
      <div className="mb-4 text-center">
        <label className="form-label fw-bold">Filtrar por Jornada:&nbsp;</label>
        <select
          className="form-select text-center"
          style={{ maxWidth: 300, display: "inline-block" }}
          value={jornadaSeleccionada}
          onChange={e => setJornadaSeleccionada(e.target.value)}
        >
          <option value="">Todas las jornadas</option>
          {jornadas.map(j => (
            <option key={j.numero} value={j.numero}>
              Jornada {j.numero}
            </option>
          ))}
        </select>
      </div>

      <table className="table table-bordered table-striped mt-3">
        <thead>
          <tr>
            <th>Jornada</th>
            <th>Partido</th>
            <th>Mi Pronóstico</th>
            <th>Resultado Real</th>
            <th>Bonus</th>
            <th>Puntos</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(jornadasAgrupadas).length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center">No hay pronósticos para esta jornada.</td>
            </tr>
          ) : (
            Object.entries(jornadasAgrupadas).map(([jornada, pronos]) => {
              const totalJornada = pronos.reduce((acc, cur) => acc + (cur.puntos || 0), 0);
              return (
                <React.Fragment key={jornada}>
                  {pronos.map((p, idx) => (
                    <tr key={idx}>
                      <td>{p.jornada}</td>
                      <td>{p.nombre_local} vs {p.nombre_visita}</td>
                      <td>
                        {(p.goles_local !== null && p.goles_visita !== null && p.goles_local !== undefined && p.goles_visita !== undefined)
                          ? `${p.goles_local} - ${p.goles_visita}`
                          : "-"}
                      </td>
                      <td>
                        {(p.real_local !== null && p.real_visita !== null && p.real_local !== undefined && p.real_visita !== undefined)
                          ? `${p.real_local} - ${p.real_visita}`
                          : "Pendiente"}
                      </td>
                      <td>
                        {p.bonus !== undefined && p.bonus !== null ? `x${p.bonus}` : "x1"}
                      </td>
                      <td>{p.puntos ?? 0}</td>
                    </tr>
                  ))}
                  <tr
                    style={{
                      background: "#ffe680",
                      fontWeight: "bold",
                      borderTop: "3px solid #aaa"
                    }}
                  >
                    <td colSpan={5} className="text-end">
                      Total Jornada {jornada}:
                    </td>
                    <td>{totalJornada}</td>
                  </tr>
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
