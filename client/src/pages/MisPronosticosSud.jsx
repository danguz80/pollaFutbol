import { useEffect, useState } from "react";
import useAuth from "../hooks/UseAuth";
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

export default function MisPronosticosSud() {
  const usuario = useAuth();
  const [puntaje, setPuntaje] = useState(null);
  const [selectedRound, setSelectedRound] = useState(ROUNDS[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!usuario || !usuario.id) return;
    setLoading(true);
    fetch(`${API_BASE_URL}/api/sudamericana/puntajes/${usuario.id}`)
      .then(res => res.json())
      .then(data => {
        setPuntaje(data);
        setLoading(false);
      });
  }, [usuario]);

  if (!usuario) return <div className="alert alert-warning mt-4">Debes iniciar sesión para ver tus pronósticos.</div>;
  if (loading) return <div className="text-center mt-4">Cargando...</div>;
  if (!puntaje) return <div className="alert alert-info mt-4">No hay puntaje disponible.</div>;

  // Filtrar por ronda y agrupar por fixture_id ascendente
  let detalleFiltrado = puntaje.detalle.filter(p => p.partido.ronda === selectedRound);
  detalleFiltrado = detalleFiltrado.sort((a, b) => a.fixture_id - b.fixture_id);

  // Calcular puntaje total solo de partidos con resultado real
  const puntajeTotal = detalleFiltrado.reduce((acc, d) => (
    d.real.goles_local !== null && d.real.goles_visita !== null ? acc + d.pts : acc
  ), 0);

  return (
    <div className="container mt-4">
      <SudamericanaSubMenu />
      <h2 className="mb-4 text-center">Mis Pronósticos Sudamericana</h2>
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
      <div className="mb-3 text-end fw-bold">Puntaje total: <span className="text-primary">{puntajeTotal}</span></div>
      <div className="table-responsive">
        <table className="table table-bordered table-striped text-center">
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
            {detalleFiltrado.length === 0 ? (
              <tr><td colSpan={6}>No hay pronósticos para esta ronda.</td></tr>
            ) : detalleFiltrado.map((d, i) => (
              <tr key={d.fixture_id || i}>
                <td>{d.partido.ronda}</td>
                <td>{d.partido.equipo_local} vs {d.partido.equipo_visita}</td>
                <td>{d.pron.goles_local} - {d.pron.goles_visita}</td>
                <td>{
                  d.real.goles_local !== null && d.real.goles_visita !== null
                    ? `${d.real.goles_local} - ${d.real.goles_visita}`
                    : "--"
                }</td>
                <td>{d.partido.bonus || 1}</td>
                <td><strong>{d.real.goles_local !== null && d.real.goles_visita !== null ? d.pts : 0}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
