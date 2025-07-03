import { useEffect, useState } from "react";
import useAuth from "../hooks/UseAuth";

const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;
const ROUNDS = [
  "Knockout Round Play-offs",
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinales",
  "Final"
];

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
  detalleFiltrado = detalleFiltrado
    .filter(d => d.real.goles_local !== null && d.real.goles_visita !== null) // solo partidos con resultado real
    .sort((a, b) => a.fixture_id - b.fixture_id);

  return (
    <div className="container mt-4">
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
      <div className="mb-3 text-end fw-bold">Puntaje total: <span className="text-primary">{puntaje.total}</span></div>
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
                <td>{d.pron.goles_local} - {d.pron.goles_visita} {d.pron.ganador ? `(Avanza: ${d.pron.ganador})` : ""}</td>
                <td>{d.real.goles_local} - {d.real.goles_visita} {d.real.ganador ? `(Avanza: ${d.real.ganador})` : ""}</td>
                <td>{d.partido.bonus || 1}</td>
                <td><strong>{d.pts}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
