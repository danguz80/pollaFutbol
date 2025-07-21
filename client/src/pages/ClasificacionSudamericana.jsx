import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSudamericanaCellStyle } from '../utils/sudamericanaRankingStyle';
import { getFotoPerfilUrl } from '../utils/fotoPerfil';
import { getFixtureVirtual, calcularAvanceEliminatoria } from '../utils/sudamericanaEliminatoria';
import SudamericanaSubMenu from "../components/SudamericanaSubMenu";

const API_BASE_URL = import.meta.env.VITE_API_URL;
const ROUNDS = [
  "Knockout Round Play-offs",
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinales",
  "Final"
];

export default function ClasificacionSudamericana() {
  const [selectedRound, setSelectedRound] = useState(ROUNDS[0]);
  const [selectedMatch, setSelectedMatch] = useState(""); // Nuevo estado para filtro por partido
  const [clasificacion, setClasificacion] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [fixture, setFixture] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // Usar el nuevo endpoint que incluye partidos y clasificados
    fetch(`${API_BASE_URL}/api/sudamericana/clasificacion-completa`)
      .then(res => res.json())
      .then(data => {
        setClasificacion(data);
        setLoading(false);
      });
    // Fetch ranking acumulado Sudamericana
    fetch(`${API_BASE_URL}/api/sudamericana/ranking`)
      .then(res => res.json())
      .then(data => setRanking(data));
    // CORREGIDA: Cambiar de /api/jornadas/sudamericana/fixture a /api/sudamericana/fixture
    // fetch(`${API_BASE_URL}/api/jornadas/sudamericana/fixture`)
    fetch(`${API_BASE_URL}/api/sudamericana/fixture`)
      .then(res => res.json())
      .then(data => setFixture(data));
  }, [selectedRound]);

  // Utilidad para mostrar nombre de usuario si existe, si no, usuario_id
  const getNombreUsuario = (jug) => jug.nombre_usuario || jug.usuario_id;

  // Función para obtener lista única de partidos de la ronda seleccionada
  const getMatchesForRound = () => {
    if (!fixture || fixture.length === 0) return [];
    
    // FIX: Solo usar fixture para evitar duplicados
    const matchesSet = new Set();
    fixture
      .filter(f => f.ronda === selectedRound)
      .forEach(f => {
        const matchKey = `${f.equipo_local} vs ${f.equipo_visita}`;
        matchesSet.add(matchKey);
      });
    
    return Array.from(matchesSet).sort();
  };

  const availableMatches = getMatchesForRound();

  return (
    <div className="container mt-4">
      <SudamericanaSubMenu />
      <h2 className="mb-4">Clasificación Sudamericana</h2>
      {/* Link interno para ir directo a la tabla acumulada */}
      <div className="mb-3 d-flex flex-wrap gap-2 justify-content-center">
        <a href="#ranking-acumulado-sud" className="btn btn-outline-primary btn-sm">Ir a Ranking Acumulado</a>
      </div>
      <div className="mb-3 text-center">
        <div className="d-flex flex-wrap justify-content-center gap-3 align-items-center">
          <div>
            <label className="me-2 fw-bold">Filtrar por ronda:</label>
            <select
              className="form-select d-inline-block w-auto"
              value={selectedRound}
              onChange={e => {
                setSelectedRound(e.target.value);
                setSelectedMatch(""); // Resetear filtro de partido al cambiar ronda
              }}
            >
              {ROUNDS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="me-2 fw-bold">Filtrar por partido:</label>
            <select
              className="form-select d-inline-block w-auto"
              value={selectedMatch}
              onChange={e => setSelectedMatch(e.target.value)}
            >
              <option value="">Todos los partidos</option>
              {availableMatches.map(match => (
                <option key={match} value={match}>{match}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="text-center">Cargando...</div>
      ) : (
        <>
          {clasificacion.length === 0 ? (
            <div className="text-center">No hay pronósticos disponibles.</div>
          ) : (
            clasificacion.map((jug, jugIdx) => {
              // Calcular avance virtual del usuario para mostrar clasificados calculados
              const detalleElim = jug.partidos.detalle.filter(p => ROUNDS.includes(p.partido.ronda));
              const pronos = {};
              const pens = {};
              detalleElim.forEach(p => {
                pronos[p.fixture_id] = {
                  local: p.pron.goles_local !== null ? Number(p.pron.goles_local) : "",
                  visita: p.pron.goles_visita !== null ? Number(p.pron.goles_visita) : ""
                };
                if (p.pron.penales_local !== null || p.pron.penales_visita !== null) {
                  if (!pens[p.fixture_id]) pens[p.fixture_id] = {};
                  if (p.pron.penales_local !== null) pens[p.fixture_id].local = p.pron.penales_local;
                  if (p.pron.penales_visita !== null) pens[p.fixture_id].visitante = p.pron.penales_visita;
                }
              });
              const avanceVirtual = calcularAvanceEliminatoria(fixture, pronos, pens);
              
              return (
                <div key={jug.usuario_id} className="mb-5">
                  {/* Separador entre jugadores */}
                  {jugIdx > 0 && <hr style={{ border: '3px solid black', margin: '2rem 0' }} />}
                  
                  {/* Header del jugador */}
                  <div className="mb-3 p-3" style={{ background: '#f0f8ff', borderRadius: '8px' }}>
                    <h4 className="mb-2 text-center">{getNombreUsuario(jug)}</h4>
                    <div className="text-center">
                      <strong>Puntaje Total: {jug.total}</strong> | 
                      Partidos: {jug.partidos.total} | 
                      Clasificados: {jug.clasificados.total}
                    </div>
                  </div>

                  {/* TABLA DE PARTIDOS */}
                  <div className="mb-4">
                    <h5 className="mb-2">
                      📊 Partidos - {selectedRound}
                      {selectedMatch && (
                        <small className="d-block text-muted mt-1">
                          Filtrado por: {selectedMatch}
                        </small>
                      )}
                    </h5>
                    <div className="table-responsive">
                      <table className="table table-bordered table-striped text-center">
                        <thead>
                          <tr>
                            <th>Ronda</th>
                            <th>Partido Pronosticado</th>
                            <th>Cruce Real</th>
                            <th>Pronóstico</th>
                            <th>Resultado Real</th>
                            <th>Bonus</th>
                            <th>Puntos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const partidosVirtual = getFixtureVirtual(fixture, pronos, pens, selectedRound);
                            const mapFixtureIdToEquipos = {};
                            partidosVirtual.forEach(p => {
                              mapFixtureIdToEquipos[p.fixture_id] = {
                                equipo_local: p.equipo_local,
                                equipo_visita: p.equipo_visita
                              };
                            });
                            
                            const detalleRonda = jug.partidos.detalle.filter(d => d.partido.ronda === selectedRound);
                            if (detalleRonda.length === 0) {
                              return <tr><td colSpan={7}>No hay pronósticos para esta ronda.</td></tr>;
                            }
                            
                            // Aplicar filtro por partido específico si está seleccionado
                            let partidosFiltrados = detalleRonda;
                            if (selectedMatch) {
                              partidosFiltrados = detalleRonda.filter(d => {
                                const equipos = mapFixtureIdToEquipos[d.fixture_id] || { 
                                  equipo_local: d.partido.equipo_local, 
                                  equipo_visita: d.partido.equipo_visita 
                                };
                                const matchKey = `${equipos.equipo_local} vs ${equipos.equipo_visita}`;
                                return matchKey === selectedMatch;
                              });
                            }
                            
                            if (partidosFiltrados.length === 0) {
                              return <tr><td colSpan={7}>No hay pronósticos para este partido en la ronda seleccionada.</td></tr>;
                            }
                            
                            const partidosOrdenados = partidosFiltrados.sort((a, b) => a.fixture_id - b.fixture_id);
                            const totalPartidos = partidosOrdenados.length;
                            let totalPuntosPartidos = 0;
                            
                            const rows = partidosOrdenados.map((d, index) => {
                              const equipos = mapFixtureIdToEquipos[d.fixture_id] || { 
                                equipo_local: d.partido.equipo_local, 
                                equipo_visita: d.partido.equipo_visita 
                              };
                              const tieneResultado = d.real.goles_local !== null && d.real.goles_visita !== null;
                              const puntosPartido = tieneResultado ? d.pts : 0;
                              totalPuntosPartidos += puntosPartido;
                              
                              return (
                                <tr key={d.fixture_id}>
                                  {index === 0 && (
                                    <td rowSpan={totalPartidos} className="align-middle fw-bold">
                                      {selectedRound}
                                    </td>
                                  )}
                                  <td>{equipos.equipo_local} vs {equipos.equipo_visita}</td>
                                  <td>
                                    <div className={`small ${d.cruceCoincide ? 'text-success' : 'text-danger'}`}>
                                      {d.cruceReal || '--'}
                                      {!d.cruceCoincide && (
                                        <div className="badge bg-danger ms-1">No coincide</div>
                                      )}
                                    </div>
                                  </td>
                                  <td>{d.pron.goles_local} - {d.pron.goles_visita}</td>
                                  <td>{
                                    tieneResultado
                                      ? `${d.real.goles_local} - ${d.real.goles_visita}`
                                      : "--"
                                  }</td>
                                  <td>{d.partido.bonus || 1}</td>
                                  <td className="fw-bold">
                                    {puntosPartido > 0 ? (
                                      <span className="text-success">{puntosPartido}</span>
                                    ) : (
                                      <span className="text-muted">
                                        0
                                        {d.motivoSinPuntos && (
                                          <small className="d-block text-danger">
                                            {d.motivoSinPuntos}
                                          </small>
                                        )}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            });
                            
                            // Agregar fila de total para partidos
                            rows.push(
                              <tr key="total-partidos" className="table-primary">
                                <td colSpan={6} className="text-end fw-bold">
                                  Total {selectedMatch ? 'Partido Filtrado' : `Partidos ${selectedRound}`}:
                                </td>
                                <td className="fw-bold text-primary">
                                  {totalPuntosPartidos}
                                </td>
                              </tr>
                            );
                            
                            return rows;
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* FIX: Ocultar tabla de clasificados cuando se filtra por partido específico */}
                  {!selectedMatch && (
                    <div className="mb-4">
                      <h5 className="mb-2">🏆 Clasificados - {selectedRound}</h5>
                      <div className="table-responsive">
                        <table className="table table-bordered table-sm text-center">
                          <thead>
                            <tr>
                              <th>Ronda</th>
                              <th>Mis Clasificados</th>
                              <th>Clasificados Reales</th>
                              <th>Puntos</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                            // Obtener datos solo para la ronda seleccionada
                            const rowBase = jug.clasificados.detalle.find(row => row && row.ronda === selectedRound);
                            
                            // Aplicar la misma lógica que en MisPronosticosSud
                            let misClasificados;
                            const rondasEliminatorias = ['Octavos de Final', 'Cuartos de Final', 'Semifinales', 'Final'];
                            if (rondasEliminatorias.includes(selectedRound)) {
                              if (selectedRound === 'Final') {
                                const semifinalesData = avanceVirtual && avanceVirtual['Semifinales'] ? avanceVirtual['Semifinales'] : [];
                                const equiposEnFinal = semifinalesData.map(x => x.ganador).filter(Boolean);
                                
                                if (equiposEnFinal.length >= 2 && avanceVirtual && avanceVirtual[selectedRound] && avanceVirtual[selectedRound].length > 0) {
                                  const ganadorFinal = avanceVirtual[selectedRound][0].ganador;
                                  const perdedorFinal = equiposEnFinal.find(eq => eq !== ganadorFinal);
                                  misClasificados = [ganadorFinal, perdedorFinal].filter(Boolean);
                                } else {
                                  misClasificados = equiposEnFinal.length >= 2 
                                    ? equiposEnFinal 
                                    : (rowBase && Array.isArray(rowBase.misClasificados) ? rowBase.misClasificados : []);
                                }
                              } else {
                                misClasificados = avanceVirtual && avanceVirtual[selectedRound] 
                                  ? avanceVirtual[selectedRound].map(x => x.ganador).filter(Boolean) 
                                  : (rowBase && Array.isArray(rowBase.misClasificados) ? rowBase.misClasificados : []);
                              }
                            } else {
                              misClasificados = rowBase && Array.isArray(rowBase.misClasificados)
                                ? rowBase.misClasificados
                                : (avanceVirtual && avanceVirtual[selectedRound] ? avanceVirtual[selectedRound].map(x => x.ganador).filter(Boolean) : []);
                            }
                            
                            const clasificadosReales = rowBase && Array.isArray(rowBase.clasificadosReales) ? rowBase.clasificadosReales : [];
                            
                            if (misClasificados.length === 0 && clasificadosReales.length === 0) {
                              return <tr><td colSpan={4}>No hay clasificados para esta ronda.</td></tr>;
                            }
                            
                            // Calcular puntos y alineamiento (misma lógica que MisPronosticosSud)
                            const puntosPorRonda = {
                              'Knockout Round Play-offs': 2,
                              'Octavos de Final': 3,
                              'Cuartos de Final': 3,
                              'Semifinales': 5,
                              'Final': { campeon: 15, subcampeon: 10 }
                            };
                            
                            const aciertos = [];
                            const noAciertos = [];
                            let totalPuntos = 0;
                            
                            if (selectedRound === 'Final') {
                              const campeon = misClasificados[0] || '';
                              const subcampeon = misClasificados[1] || '';
                              const campeonReal = clasificadosReales[0] || '';
                              const subcampeonReal = clasificadosReales[1] || '';
                              
                              if (campeon && campeonReal && campeon === campeonReal) {
                                aciertos.push({ 
                                  miClasificado: campeon, 
                                  clasificadoReal: campeonReal, 
                                  puntos: 15, 
                                  tipo: 'Campeón' 
                                });
                                totalPuntos += 15;
                              } else if (campeon) {
                                noAciertos.push({ 
                                  miClasificado: campeon, 
                                  clasificadoReal: campeonReal || '', 
                                  puntos: 0, 
                                  tipo: 'Campeón' 
                                });
                              }
                              
                              if (subcampeon && subcampeonReal && subcampeon === subcampeonReal) {
                                aciertos.push({ 
                                  miClasificado: subcampeon, 
                                  clasificadoReal: subcampeonReal, 
                                  puntos: 10, 
                                  tipo: 'Subcampeón' 
                                });
                                totalPuntos += 10;
                              } else if (subcampeon) {
                                noAciertos.push({ 
                                  miClasificado: subcampeon, 
                                  clasificadoReal: subcampeonReal || '', 
                                  puntos: 0, 
                                  tipo: 'Subcampeón' 
                                });
                              }
                            } else {
                              const puntajePorAcierto = puntosPorRonda[selectedRound] || 0;
                              const realesUsados = new Set();
                              
                              misClasificados.forEach(miEquipo => {
                                if (miEquipo && clasificadosReales.includes(miEquipo) && !realesUsados.has(miEquipo)) {
                                  aciertos.push({ 
                                    miClasificado: miEquipo, 
                                    clasificadoReal: miEquipo, 
                                    puntos: puntajePorAcierto 
                                  });
                                  realesUsados.add(miEquipo);
                                  totalPuntos += puntajePorAcierto;
                                }
                              });
                              
                              misClasificados.forEach(miEquipo => {
                                if (miEquipo && !clasificadosReales.includes(miEquipo)) {
                                  noAciertos.push({ 
                                    miClasificado: miEquipo, 
                                    clasificadoReal: '', 
                                    puntos: 0 
                                  });
                                }
                              });
                              
                              clasificadosReales.forEach(realEquipo => {
                                if (realEquipo && !misClasificados.includes(realEquipo)) {
                                  noAciertos.push({ 
                                    miClasificado: '', 
                                    clasificadoReal: realEquipo, 
                                    puntos: 0 
                                  });
                                }
                              });
                            }
                            
                            const filas = [...aciertos, ...noAciertos];
                            const totalFilas = filas.length;
                            
                            if (totalFilas === 0) {
                              return <tr><td colSpan={4}>No hay clasificados para esta ronda.</td></tr>;
                            }
                            
                            const rows = filas.map((fila, index) => (
                              <tr key={index} className={fila.puntos > 0 ? 'table-success' : ''}>
                                {index === 0 && (
                                  <td rowSpan={totalFilas} className="align-middle fw-bold">
                                    {selectedRound}
                                  </td>
                                )}
                                <td>
                                  {fila.miClasificado}
                                  {fila.tipo && <small className="d-block text-muted">({fila.tipo})</small>}
                                </td>
                                <td>
                                  {fila.clasificadoReal}
                                  {fila.tipo && <small className="d-block text-muted">({fila.tipo})</small>}
                                </td>
                                <td className="fw-bold">
                                  {fila.puntos > 0 ? (
                                    <span className="text-success">{fila.puntos}</span>
                                  ) : (
                                    <span className="text-muted">0</span>
                                  )}
                                </td>
                              </tr>
                            ));
                            
                            rows.push(
                              <tr key="total" className="table-primary">
                                <td colSpan={3} className="text-end fw-bold">
                                  Total {selectedRound}:
                                </td>
                                <td className="fw-bold text-primary">
                                  {totalPuntos}
                                </td>
                              </tr>
                            );
                            
                            return rows;
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  )}
                </div>
              );
            })
          )}
        </>
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
