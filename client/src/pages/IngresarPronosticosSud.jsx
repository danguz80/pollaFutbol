import { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;
const ROUNDS = [
  "Knockout Round Play-offs",
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinales",
  "Final"
];

export default function IngresarPronosticosSud() {
  const [fixture, setFixture] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState(ROUNDS[0]);
  const [pronosticos, setPronosticos] = useState({});

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

  const handleInput = (fixtureId, equipo, value) => {
    setPronosticos(prev => ({
      ...prev,
      [fixtureId]: {
        ...prev[fixtureId],
        [equipo]: value
      }
    }));
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
      {loading ? (
        <div>Cargando fixture...</div>
      ) : (
        <table className="table table-bordered text-center">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Local</th>
              <th></th>
              <th>Visita</th>
              <th>Ronda</th>
            </tr>
          </thead>
          <tbody>
            {partidosFiltrados.map(partido => (
              <tr key={partido.fixture_id}>
                <td>{new Date(partido.fecha).toLocaleString()}</td>
                <td>{partido.equipo_local}</td>
                <td style={{ minWidth: 80 }}>
                  <input
                    type="number"
                    min="0"
                    className="form-control d-inline-block w-25 mx-1"
                    style={{ width: 45, display: 'inline-block' }}
                    value={pronosticos[partido.fixture_id]?.local || ""}
                    onChange={e => handleInput(partido.fixture_id, "local", e.target.value)}
                  />
                  <span> - </span>
                  <input
                    type="number"
                    min="0"
                    className="form-control d-inline-block w-25 mx-1"
                    style={{ width: 45, display: 'inline-block' }}
                    value={pronosticos[partido.fixture_id]?.visita || ""}
                    onChange={e => handleInput(partido.fixture_id, "visita", e.target.value)}
                  />
                </td>
                <td>{partido.equipo_visita}</td>
                <td>{partido.ronda}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
