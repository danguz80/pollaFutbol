import { useEffect, useState } from "react";
import useAuth from "../hooks/UseAuth";
import { useNavigate } from "react-router-dom";
import { getFixtureVirtual, calcularAvanceEliminatoria, ROUNDS } from '../utils/sudamericanaEliminatoria';
import SudamericanaSubMenu from "../components/SudamericanaSubMenu";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function MisPronosticosSud() {
  const usuario = useAuth();
  const [puntaje, setPuntaje] = useState(null);
  const [selectedRound, setSelectedRound] = useState(ROUNDS[0]);
  const [loading, setLoading] = useState(true);
  const [fixture, setFixture] = useState([]);
  const [pronosticos, setPronosticos] = useState({});
  const [penales, setPenales] = useState({});

  const cargarPuntajes = () => {
    if (!usuario || !usuario.id) return;
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    fetch(`${API_BASE_URL}/api/sudamericana/puntajes/${usuario.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error("No tienes autorización para consultar puntajes de Sudamericana");
          }
          throw new Error("Error al cargar puntajes");
        }
        return res.json();
      })
      .then(data => {
        setPuntaje(data);
        setLoading(false);
      })
      .catch(error => {
        setLoading(false);
      });
  };

  useEffect(() => {
    cargarPuntajes();
  }, [usuario]);

  useEffect(() => {
    // CORREGIDA: Cambiar de /api/jornadas/sudamericana/fixture a /api/sudamericana/fixture
    // fetch(`${API_BASE_URL}/api/jornadas/sudamericana/fixture`)
    fetch(`${API_BASE_URL}/api/sudamericana/fixture`)
      .then(res => res.json())
      .then(data => setFixture(data));
  }, []);

  useEffect(() => {
    if (!usuario || !usuario.id) return;
    const token = localStorage.getItem("token");
    if (!token) {
      return;
    }
    
    fetch(`${API_BASE_URL}/api/sudamericana/pronosticos-elim/${usuario.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error("No tienes autorización para consultar pronósticos de Sudamericana");
          }
          throw new Error("Error al cargar pronósticos");
        }
        return res.json();
      })
      .then(data => {
        const pronos = {};
        const pens = {};
        data.forEach(p => {
          pronos[p.fixture_id] = {
            local: p.goles_local !== null ? Number(p.goles_local) : "",
            visita: p.goles_visita !== null ? Number(p.goles_visita) : ""
          };
          // Nueva estructura de penales por fixture_id
          if (p.penales_local !== null || p.penales_visita !== null) {
            pens[p.fixture_id] = {
              local: p.penales_local !== null ? Number(p.penales_local) : 0,
              visitante: p.penales_visita !== null ? Number(p.penales_visita) : 0
            };
          }
        });
        setPronosticos(pronos);
        setPenales(pens);
      })
      .catch(error => {
        console.error("Error cargando pronósticos:", error);
      });
  }, [usuario]);

  if (!usuario) return <div className="alert alert-warning mt-4">Debes iniciar sesión para ver tus pronósticos.</div>;
  if (loading) return <div className="text-center mt-4">Cargando...</div>;

  if (!puntaje) return <div className="alert alert-info mt-4">No hay puntaje disponible.</div>;

  // === CLASIFICADOS: tabla resumen ===
  const clasif = puntaje.clasificados?.detalle || [];
  const totalClasif = puntaje.clasificados?.total || 0;
  const totalGeneral = puntaje.total || 0;

  // Calcular clasificados virtuales por ronda (según pronósticos de partidos)
  const avanceVirtual = calcularAvanceEliminatoria(fixture, pronosticos, penales);

  // Renderizar tabla de clasificados por ronda, mostrando cada clasificado en una fila separada
  let tablaClasificadosBody;
  try {
    tablaClasificadosBody = [];
    
    ROUNDS.forEach((ronda) => {
      const rowBase = Array.isArray(clasif) ? clasif.find(row => row && row.ronda === ronda) : undefined;
      
      // Para rondas eliminatorias (a partir de Octavos), usar clasificados calculados
      // Para rondas iniciales, usar pronósticos guardados con fallback a calculados
      let misClasificados;
      const rondasEliminatorias = ['Octavos de Final', 'Cuartos de Final', 'Semifinales', 'Final'];
      if (rondasEliminatorias.includes(ronda)) {
        if (ronda === 'Final') {
          // Para la Final, mostrar ambos equipos participantes (campeón y subcampeón)
          // Obtener los equipos que llegaron a la Final desde las Semifinales
          const semifinalesData = avanceVirtual && avanceVirtual['Semifinales'] 
            ? avanceVirtual['Semifinales'] 
            : [];
          const equiposEnFinal = semifinalesData.map(x => x.ganador).filter(Boolean);
          
          // Si tenemos los equipos de la Final, mostrar el ganador primero, luego el perdedor
          if (equiposEnFinal.length >= 2 && avanceVirtual && avanceVirtual[ronda] && avanceVirtual[ronda].length > 0) {
            const ganadorFinal = avanceVirtual[ronda][0].ganador;
            const perdedorFinal = equiposEnFinal.find(eq => eq !== ganadorFinal);
            misClasificados = [ganadorFinal, perdedorFinal].filter(Boolean);
          } else {
            // Fallback: usar equipos calculados o guardados
            misClasificados = equiposEnFinal.length >= 2 
              ? equiposEnFinal 
              : (rowBase && Array.isArray(rowBase.misClasificados) ? rowBase.misClasificados : []);
          }
        } else {
          // Para otras rondas eliminatorias, usar clasificados calculados automáticamente
          misClasificados = avanceVirtual && avanceVirtual[ronda] 
            ? avanceVirtual[ronda].map(x => x.ganador).filter(Boolean) 
            : (rowBase && Array.isArray(rowBase.misClasificados) ? rowBase.misClasificados : []);
        }
      } else {
        // Para rondas iniciales, usar pronósticos guardados con fallback a calculados
        misClasificados = rowBase && Array.isArray(rowBase.misClasificados)
          ? rowBase.misClasificados
          : (avanceVirtual && avanceVirtual[ronda] ? avanceVirtual[ronda].map(x => x.ganador).filter(Boolean) : []);
      }
      
      const clasificadosReales = rowBase && Array.isArray(rowBase.clasificadosReales)
        ? rowBase.clasificadosReales
        : [];
      const puntos = rowBase ? rowBase.puntos : '';
      
      if (!Array.isArray(misClasificados) || !Array.isArray(clasificadosReales)) return;
      if (misClasificados.length === 0 && clasificadosReales.length === 0) return;
      
      // Obtener la lista más larga para determinar cuántas filas necesitamos
      const maxLength = Math.max(misClasificados.length, clasificadosReales.length);
      
      // Crear una fila por cada clasificado
      for (let i = 0; i < maxLength; i++) {
        const miClasificado = misClasificados[i] || '';
        const clasificadoReal = clasificadosReales[i] || '';
        
        tablaClasificadosBody.push(
          <tr key={`${ronda}-${i}`}>
            <td>{i === 0 ? ronda : ''}</td>
            <td>{miClasificado}</td>
            <td>{clasificadoReal}</td>
            <td>{i === 0 ? <strong>{puntos}</strong> : ''}</td>
          </tr>
        );
      }
    });
    
    // Si no hay ningún clasificado, mostrar mensaje
    if (tablaClasificadosBody.length === 0) {
      tablaClasificadosBody.push(<tr key="no-data"><td colSpan={4}>No hay datos de clasificados.</td></tr>);
    }
  } catch (e) {
    tablaClasificadosBody = <tr><td colSpan={4} className="text-danger">Error al mostrar clasificados: {e.message}</td></tr>;
  }

  // Renderizado final
  // Calcular puntaje total de partidos para la ronda seleccionada
  const detalleRonda = puntaje.partidos?.detalle?.filter(d => d.partido.ronda === selectedRound) || [];
  const puntajeTotal = detalleRonda.reduce((acc, d) => acc + (d.pts || 0), 0);

  return (
    <div className="container mt-4">
      <SudamericanaSubMenu />
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">Mis Pronósticos Sudamericana</h2>
        <button 
          className="btn btn-outline-primary btn-sm" 
          onClick={cargarPuntajes}
          disabled={loading}
        >
          {loading ? 'Cargando...' : 'Actualizar datos'}
        </button>
      </div>

      {/* TOTAL GENERAL */}
      <div className="mb-3 text-end fw-bold">
        Puntaje total Sudamericana: <span className="text-success">{totalGeneral}</span>
      </div>

      {/* FILTRO POR RONDA */}
      <div className="mb-4 text-center">
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

      {/* TABLA PARTIDOS */}
      <div className="mb-4">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h5 className="mb-0">Partidos - {selectedRound}</h5>
          <span className="fw-bold text-primary">Puntos: {puntajeTotal}</span>
        </div>
        <div className="table-responsive">
          <table className="table table-bordered table-striped text-center">
            <thead>
              <tr>
                <th>Ronda</th>
                <th>Partido Pronosticado</th>
                <th>Cruce Real</th>
                <th>Mi Pronóstico</th>
                <th>Resultado Real</th>
                <th>Bonus</th>
                <th>Puntos</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Copia exacta de la lógica de ClasificacionSudamericana para 1 usuario
                const detalleElim = puntaje.partidos?.detalle?.filter(p => ROUNDS.includes(p.partido.ronda)) || [];
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
                const partidosVirtual = getFixtureVirtual(fixture, pronos, pens, selectedRound);
                const mapFixtureIdToEquipos = {};
                partidosVirtual.forEach(p => {
                  mapFixtureIdToEquipos[p.fixture_id] = {
                    equipo_local: p.equipo_local,
                    equipo_visita: p.equipo_visita
                  };
                });
                const detalleRonda = puntaje.partidos?.detalle?.filter(d => d.partido.ronda === selectedRound) || [];
                if (detalleRonda.length === 0) {
                  return <tr><td colSpan={7}>No hay pronósticos para esta ronda.</td></tr>;
                }
                
                const partidosOrdenados = detalleRonda.sort((a, b) => a.fixture_id - b.fixture_id);
                const totalPartidos = partidosOrdenados.length;
                let totalPuntosPartidos = 0;
                
                const rows = partidosOrdenados.map((d, index) => {
                  const equipos = mapFixtureIdToEquipos[d.fixture_id] || { equipo_local: d.partido.equipo_local, equipo_visita: d.partido.equipo_visita };
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
                      Total Partidos {selectedRound}:
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

      {/* TABLA CLASIFICADOS FILTRADA */}
      <div className="mb-4">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h5 className="mb-0">Clasificados - {selectedRound}</h5>
          <span className="fw-bold text-primary">
            Puntos: {(() => {
              const rowBase = Array.isArray(clasif) ? clasif.find(row => row && row.ronda === selectedRound) : undefined;
              return rowBase ? rowBase.puntos : 0;
            })()}
          </span>
        </div>
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
                const rowBase = Array.isArray(clasif) ? clasif.find(row => row && row.ronda === selectedRound) : undefined;
                
                // Aplicar la misma lógica que arriba para la ronda específica
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
                
                // Calcular puntos por equipo y alineamiento inteligente
                const puntosPorRonda = {
                  'Knockout Round Play-offs': 2,
                  'Octavos de Final': 3,
                  'Cuartos de Final': 3,
                  'Semifinales': 5,
                  'Final': { campeon: 15, subcampeon: 10 }
                };
                
                // Crear arreglos alineados: primero aciertos, luego no aciertos
                const aciertos = [];
                const noAciertos = [];
                let totalPuntos = 0;
                
                if (selectedRound === 'Final') {
                  // Para la Final: campeón y subcampeón
                  const campeon = misClasificados[0] || '';
                  const subcampeon = misClasificados[1] || '';
                  const campeonReal = clasificadosReales[0] || '';
                  const subcampeonReal = clasificadosReales[1] || '';
                  
                  // Acierto campeón
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
                  
                  // Acierto subcampeón
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
                  // Para otras rondas: buscar coincidencias
                  const puntajePorAcierto = puntosPorRonda[selectedRound] || 0;
                  const realesUsados = new Set();
                  
                  // Primero identificar aciertos
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
                  
                  // Luego agregar no aciertos de mis pronósticos
                  misClasificados.forEach(miEquipo => {
                    if (miEquipo && !clasificadosReales.includes(miEquipo)) {
                      noAciertos.push({ 
                        miClasificado: miEquipo, 
                        clasificadoReal: '', 
                        puntos: 0 
                      });
                    }
                  });
                  
                  // Finalmente agregar clasificados reales que no pronostiqué
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
                
                // Combinar aciertos y no aciertos
                const filas = [...aciertos, ...noAciertos];
                const totalFilas = filas.length;
                
                if (totalFilas === 0) {
                  return <tr><td colSpan={4}>No hay clasificados para esta ronda.</td></tr>;
                }
                
                // Generar filas de la tabla
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
                
                // Agregar fila de total
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

      {/* RESUMEN TOTAL DE CLASIFICADOS */}
      <div className="mb-4">
        <div className="alert alert-info">
          <strong>Resumen total: </strong> 
          {(() => {
            // Calcular total de puntos por partidos de todas las rondas
            const totalPuntosPartidos = puntaje.partidos?.total || 0;
            return (
              <>
                {totalPuntosPartidos} puntos por partidos | {totalClasif} puntos por clasificados | 
                <strong> Puntaje total Sudamericana: {totalGeneral}</strong>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
