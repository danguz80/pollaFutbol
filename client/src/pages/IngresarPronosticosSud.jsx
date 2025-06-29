import { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;
const ROUNDS = [
  "Knockout Round Play-offs",
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinales",
  "Final"
];

// Agrupa partidos por sigla de cruce (clasificado)
function agruparPorSigla(partidos) {
  const grupos = {};
  for (const p of partidos) {
    if (!grupos[p.clasificado]) grupos[p.clasificado] = [];
    grupos[p.clasificado].push(p);
  }
  return grupos;
}

export default function IngresarPronosticosSud() {
  const [fixture, setFixture] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState(ROUNDS[0]);
  const [pronosticos, setPronosticos] = useState({});
  const [penales, setPenales] = useState({});
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas/sudamericana/fixture`)
      .then(res => res.json())
      .then(data => {
        setFixture(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const partidosFiltrados = fixture.filter(p => p.ronda === selectedRound);
  const grupos = agruparPorSigla(partidosFiltrados);

  // Calcula el global y si hay empate
  function getGlobalYEmpate(partidos) {
    if (partidos.length !== 2) return { empate: false };
    const g1 = Number(pronosticos[partidos[0].fixture_id]?.local ?? partidos[0].goles_local ?? 0);
    const g2 = Number(pronosticos[partidos[0].fixture_id]?.visita ?? partidos[0].goles_visita ?? 0);
    const g3 = Number(pronosticos[partidos[1].fixture_id]?.local ?? partidos[1].goles_local ?? 0);
    const g4 = Number(pronosticos[partidos[1].fixture_id]?.visita ?? partidos[1].goles_visita ?? 0);
    const eqA = partidos[0].equipo_local;
    const eqB = partidos[0].equipo_visita;
    const totalA = g1 + g4;
    const totalB = g2 + g3;
    return { eqA, eqB, totalA, totalB, empate: totalA === totalB };
  }

  const handleInput = (fixtureId, equipo, value) => {
    setPronosticos(prev => ({
      ...prev,
      [fixtureId]: {
        ...prev[fixtureId],
        [equipo]: value
      }
    }));
  };

  const handlePenalInput = (sigla, equipo, value) => {
    setPenales(prev => ({
      ...prev,
      [sigla]: {
        ...prev[sigla],
        [equipo]: value
      }
    }));
  };

  // Guardar pronósticos y penales
  const handleGuardar = async () => {
    setMensaje("");
    const payload = { pronosticos, penales };
    const res = await fetch(`${API_BASE_URL}/api/jornadas/sudamericana/guardar-pronosticos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) setMensaje("Pronósticos guardados correctamente");
    else setMensaje("Error al guardar");
  };

  // Avanzar cruces (llama al backend)
  const handleAvanzarCruces = async () => {
    setMensaje("");
    const res = await fetch(`${API_BASE_URL}/api/jornadas/sudamericana/actualizar-clasificados`, { method: "POST" });
    const data = await res.json();
    if (data.ok) setMensaje("Cruces avanzados correctamente");
    else setMensaje("Error al avanzar cruces");
  };

  return (
    <div className="container mt-4">
      <h2 className="mb-4">Ingresar Pronósticos - Copa Sudamericana</h2>
      <div className="mb-3">
        <label className="me-2">Selecciona la ronda:</label>
        <select
          className="form-select d-inline-block w-auto"
          value={selectedRound}
          onChange={e => setSelectedRound(e.target.value)}
        >
          {ROUNDS.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      {mensaje && <div className="alert alert-info">{mensaje}</div>}
      {loading ? (
        <div>Cargando fixture...</div>
      ) : (
        <>
        {Object.entries(grupos).map(([sigla, partidos]) => {
          const { eqA, eqB, totalA, totalB, empate } = getGlobalYEmpate(partidos);
          return (
            <div key={sigla} className="mb-4 border p-2 rounded">
              <h5 className="mb-2">Cruce {sigla}</h5>
              <table className="table table-bordered text-center mb-2">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Local</th>
                    <th></th>
                    <th>Visita</th>
                  </tr>
                </thead>
                <tbody>
                  {partidos.map(partido => (
                    <tr key={partido.fixture_id}>
                      <td>{new Date(partido.fecha).toLocaleString()}</td>
                      <td>{partido.equipo_local}</td>
                      <td style={{ minWidth: 80 }}>
                        <input
                          type="number"
                          min="0"
                          className="form-control d-inline-block w-25 mx-1"
                          style={{ width: 45, display: 'inline-block' }}
                          value={pronosticos[partido.fixture_id]?.local || partido.goles_local || ""}
                          onChange={e => handleInput(partido.fixture_id, "local", e.target.value)}
                        />
                        <span> - </span>
                        <input
                          type="number"
                          min="0"
                          className="form-control d-inline-block w-25 mx-1"
                          style={{ width: 45, display: 'inline-block' }}
                          value={pronosticos[partido.fixture_id]?.visita || partido.goles_visita || ""}
                          onChange={e => handleInput(partido.fixture_id, "visita", e.target.value)}
                        />
                      </td>
                      <td>{partido.equipo_visita}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mb-2">
                <strong>Global:</strong> {eqA} {totalA ?? "-"} - {totalB ?? "-"} {eqB}
                {empate && (
                  <span className="ms-3 text-danger">Empate global, definir por penales:</span>
                )}
              </div>
              {empate && (
                <div className="mb-2">
                  <span>{eqA} penales: </span>
                  <input
                    type="number"
                    min="0"
                    className="form-control d-inline-block w-25 mx-1"
                    style={{ width: 45, display: 'inline-block' }}
                    value={penales[sigla]?.[eqA] || ""}
                    onChange={e => handlePenalInput(sigla, eqA, e.target.value)}
                  />
                  <span className="mx-2">-</span>
                  <span>{eqB} penales: </span>
                  <input
                    type="number"
                    min="0"
                    className="form-control d-inline-block w-25 mx-1"
                    style={{ width: 45, display: 'inline-block' }}
                    value={penales[sigla]?.[eqB] || ""}
                    onChange={e => handlePenalInput(sigla, eqB, e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}
        <button className="btn btn-primary me-2" onClick={handleGuardar}>Guardar pronósticos</button>
        <button className="btn btn-success" onClick={handleAvanzarCruces}>Avanzar cruces</button>
        </>
      )}
    </div>
  );
}
