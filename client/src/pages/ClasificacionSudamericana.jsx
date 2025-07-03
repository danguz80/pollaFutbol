import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;
const ROUNDS = [
  "Knockout Round Play-offs",
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinales",
  "Final"
];

function SudamericanaSubMenu() {
  const navigate = useNavigate();
  return (
    <div className="d-flex flex-wrap gap-2 justify-content-center my-4 sticky-top bg-white py-2 shadow-sm" style={{ zIndex: 1020 }}>
      <button className="btn btn-info" onClick={() => navigate("/clasificacion-sudamericana")}>Clasificación</button>
      <button className="btn btn-success" onClick={() => navigate("/ingresar-pronosticos-sud")}>Ingresar Pronósticos</button>
      <button className="btn btn-primary" onClick={() => navigate("/mis-pronosticos-sud")}>Mis Pronósticos</button>
    </div>
  );
}

export default function ClasificacionSudamericana() {
  const [selectedRound, setSelectedRound] = useState(ROUNDS[0]);
  const [clasificacion, setClasificacion] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/sudamericana/clasificacion/${encodeURIComponent(selectedRound)}`)
      .then(res => res.json())
      .then(data => {
        setClasificacion(data);
        setLoading(false);
      });
  }, [selectedRound]);

  return (
    <div className="container mt-4">
      <SudamericanaSubMenu />
      <h2 className="mb-4">Clasificación Sudamericana</h2>
      <div className="mb-3 text-center">
        <label className="me-2 fw-bold">Filtrar por ronda:</label>
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
        <div className="text-center">Cargando...</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-bordered table-striped text-center">
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Jornada</th>
                <th>Partido</th>
                <th>Pronóstico</th>
                <th>Resultado Real</th>
                <th>Bonus</th>
                <th>Puntos</th>
              </tr>
            </thead>
            <tbody>
              {clasificacion.length === 0 ? (
                <tr><td colSpan={7}>No hay pronósticos para esta ronda.</td></tr>
              ) : (
                clasificacion.map((jug, idx) => [
                  ...jug.detalle
                    .filter(d => d.real.goles_local !== null && d.real.goles_visita !== null)
                    .sort((a, b) => a.fixture_id - b.fixture_id)
                    .map((d, i) => (
                      <tr key={d.fixture_id + '-' + jug.usuario_id}>
                        <td rowSpan={jug.detalle.length} style={i === 0 ? { verticalAlign: 'middle', fontWeight: 'bold', background: '#f0f8ff' } : { display: 'none' }}>{jug.usuario_id}</td>
                        <td>{d.partido.ronda}</td>
                        <td>{d.partido.equipo_local} vs {d.partido.equipo_visita}</td>
                        <td>{d.pron.goles_local} - {d.pron.goles_visita} {d.pron.ganador ? `(Avanza: ${d.pron.ganador})` : ""}</td>
                        <td>{d.real.goles_local} - {d.real.goles_visita} {d.real.ganador ? `(Avanza: ${d.real.ganador})` : ""}</td>
                        <td>{d.partido.bonus || 1}</td>
                        <td><strong>{d.pts}</strong></td>
                      </tr>
                    )),
                  <tr key={jug.usuario_id + '-total'} style={{ borderTop: '3px solid black', background: '#e6f7ff' }}>
                    <td colSpan={6} className="text-end fw-bold">Total jugador</td>
                    <td className="fw-bold text-primary">{jug.total}</td>
                  </tr>
                ])
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
