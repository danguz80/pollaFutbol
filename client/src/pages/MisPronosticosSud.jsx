import { useEffect, useState } from "react";
import useAuth from "../hooks/UseAuth";
import { useNavigate } from "react-router-dom";
import { getFixtureVirtual } from '../utils/sudamericanaEliminatoria';

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
  const [fixture, setFixture] = useState([]);
  const [pronosticos, setPronosticos] = useState({});
  const [penales, setPenales] = useState({});

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

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas/sudamericana/fixture`)
      .then(res => res.json())
      .then(data => setFixture(data));
  }, []);

  useEffect(() => {
    if (!usuario || !usuario.id) return;
    fetch(`${API_BASE_URL}/api/sudamericana/pronosticos-elim/${usuario.id}`)
      .then(res => res.json())
      .then(data => {
        const pronos = {};
        const pens = {};
        data.forEach(p => {
          pronos[p.fixture_id] = {
            local: p.goles_local !== null ? Number(p.goles_local) : "",
            visita: p.goles_visita !== null ? Number(p.goles_visita) : ""
          };
          const sigla = p.clasificado || null;
          if (sigla) {
            if (!pens[sigla]) pens[sigla] = {};
            if (p.penales_local !== null) pens[sigla][p.equipo_local] = p.penales_local;
            if (p.penales_visita !== null) pens[sigla][p.equipo_visita] = p.penales_visita;
          }
        });
        setPronosticos(pronos);
        setPenales(pens);
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

  // Obtener partidos virtuales con nombres propagados
  const partidosVirtual = getFixtureVirtual(fixture, pronosticos, penales, selectedRound);
  // Mapear por fixture_id para reemplazo rápido
  const mapFixtureIdToEquipos = {};
  partidosVirtual.forEach(p => {
    mapFixtureIdToEquipos[p.fixture_id] = {
      equipo_local: p.equipo_local,
      equipo_visita: p.equipo_visita
    };
  });

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
            ) : detalleFiltrado.map((d, i) => {
              const equipos = mapFixtureIdToEquipos[d.fixture_id] || { equipo_local: d.partido.equipo_local, equipo_visita: d.partido.equipo_visita };
              return (
                <tr key={d.fixture_id || i}>
                  <td>{d.partido.ronda}</td>
                  <td>{equipos.equipo_local} vs {equipos.equipo_visita}</td>
                  <td>{d.pron.goles_local} - {d.pron.goles_visita}</td>
                  <td>{
                    d.real.goles_local !== null && d.real.goles_visita !== null
                      ? `${d.real.goles_local} - ${d.real.goles_visita}`
                      : "--"
                  }</td>
                  <td>{d.partido.bonus || 1}</td>
                  <td><strong>{d.real.goles_local !== null && d.real.goles_visita !== null ? d.pts : 0}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
