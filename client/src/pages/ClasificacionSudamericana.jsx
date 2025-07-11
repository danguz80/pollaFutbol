import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSudamericanaCellStyle } from '../utils/sudamericanaRankingStyle';
import { getFotoPerfilUrl } from '../utils/fotoPerfil';
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

export default function ClasificacionSudamericana() {
  const [selectedRound, setSelectedRound] = useState(ROUNDS[0]);
  const [clasificacion, setClasificacion] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [fixture, setFixture] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // Cambiar: pedir todos los pronósticos de eliminación directa, no solo los de la ronda seleccionada
    fetch(`${API_BASE_URL}/api/sudamericana/clasificacion`)
      .then(res => res.json())
      .then(data => {
        setClasificacion(data);
        setLoading(false);
      });
    // Fetch ranking acumulado Sudamericana
    fetch(`${API_BASE_URL}/api/sudamericana/ranking`)
      .then(res => res.json())
      .then(data => setRanking(data));
    fetch(`${API_BASE_URL}/api/jornadas/sudamericana/fixture`)
      .then(res => res.json())
      .then(data => setFixture(data));
  }, [selectedRound]);

  // Utilidad para mostrar nombre de usuario si existe, si no, usuario_id
  const getNombreUsuario = (jug) => jug.nombre_usuario || jug.usuario_id;

  return (
    <div className="container mt-4">
      <SudamericanaSubMenu />
      <h2 className="mb-4">Clasificación Sudamericana</h2>
      {/* Link interno para ir directo a la tabla acumulada */}
      <div className="mb-3 d-flex flex-wrap gap-2 justify-content-center">
        <a href="#ranking-acumulado-sud" className="btn btn-outline-primary btn-sm">Ir a Ranking Acumulado</a>
      </div>
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
                clasificacion.map((jug, idx) => {
                  // Tomar todos los pronósticos de eliminación directa de este usuario
                  const detalleElim = jug.detalle.filter(p => ROUNDS.includes(p.partido.ronda));
                  // Usar todos los pronósticos para propagar cruces
                  const pronos = {};
                  const pens = {};
                  detalleElim.forEach(p => {
                    pronos[p.fixture_id] = {
                      local: p.pron.goles_local !== null ? Number(p.pron.goles_local) : "",
                      visita: p.pron.goles_visita !== null ? Number(p.pron.goles_visita) : ""
                    };
                    // Cargar penales usando nueva estructura por fixture_id
                    if (p.pron.penales_local !== null || p.pron.penales_visita !== null) {
                      if (!pens[p.fixture_id]) pens[p.fixture_id] = {};
                      if (p.pron.penales_local !== null) pens[p.fixture_id].local = p.pron.penales_local;
                      if (p.pron.penales_visita !== null) pens[p.fixture_id].visitante = p.pron.penales_visita;
                    }
                  });
                  // Construir el fixture virtual de la ronda seleccionada
                  const partidosVirtual = getFixtureVirtual(fixture, pronos, pens, selectedRound);
                  // Mapear por fixture_id para reemplazo rápido
                  const mapFixtureIdToEquipos = {};
                  partidosVirtual.forEach(p => {
                    mapFixtureIdToEquipos[p.fixture_id] = {
                      equipo_local: p.equipo_local,
                      equipo_visita: p.equipo_visita
                    };
                  });
                  // Renderizar SOLO los partidos de la ronda seleccionada
                  const detalleRonda = jug.detalle.filter(d => d.partido.ronda === selectedRound);
                  return [
                    ...detalleRonda
                      .sort((a, b) => a.fixture_id - b.fixture_id)
                      .map((d, i) => {
                        const equipos = mapFixtureIdToEquipos[d.fixture_id] || { equipo_local: d.partido.equipo_local, equipo_visita: d.partido.equipo_visita };
                        return (
                          <tr key={d.fixture_id + '-' + jug.usuario_id}>
                            <td rowSpan={detalleRonda.length} style={i === 0 ? { verticalAlign: 'middle', fontWeight: 'bold', background: '#f0f8ff' } : { display: 'none' }}>{getNombreUsuario(jug)}</td>
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
                      }),
                    <tr key={jug.usuario_id + '-total'} style={{ borderTop: '3px solid black', background: '#e6f7ff' }}>
                      <td colSpan={6} className="text-end fw-bold">Total jugador</td>
                      <td className="fw-bold text-primary">{jug.total}</td>
                    </tr>
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      )}
      {/* Tabla de ranking acumulado Sudamericana al final */}
      <div id="ranking-acumulado-sud" className="mt-5">
        <h4 className="text-center">📊 Ranking Acumulado Sudamericana</h4>
        <div className="table-responsive">
          <table className="table table-bordered text-center" style={{ marginBottom: "2rem" }}>
            <thead>
              <tr>
                <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Posición</th>
                <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Jugador</th>
                <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Puntaje Total</th>
                <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Puntos Fase de Grupos</th>
                <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Puntos Eliminación directa</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((p, i) => (
                <tr key={p.usuario_id} className="text-center">
                  <td style={getSudamericanaCellStyle(i)}>{i + 1}</td>
                  <td style={getSudamericanaCellStyle(i)}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {p.foto_perfil && (
                        <img
                          src={getFotoPerfilUrl(p.foto_perfil)}
                          alt={`Foto de ${p.nombre_usuario}`}
                          style={{
                            width: '60px',
                            height: '60px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            marginRight: '10px',
                            border: '2px solid #ddd',
                            objectPosition: 'center 30%'
                          }}
                        />
                      )}
                      {p.nombre_usuario}
                    </span>
                  </td>
                  <td style={getSudamericanaCellStyle(i)}>{p.total ?? 0}</td>
                  <td style={getSudamericanaCellStyle(i)}>{p.base ?? 0}</td>
                  <td style={getSudamericanaCellStyle(i)}>{p.puntos_sudamericana ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <a href="#top" className="btn btn-link">Volver arriba</a>
      </div>
    </div>
  );
}
