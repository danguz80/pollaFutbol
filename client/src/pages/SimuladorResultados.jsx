import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AccesosDirectos from "../components/AccesosDirectos";

const API_BASE_URL = import.meta.env.VITE_API_URL;

// Función para obtener logo del equipo
const getLogoEquipo = (nombreEquipo) => {
  const nombreNormalizado = nombreEquipo?.replace(/[\u2018\u2019]/g, "'");
  const logos = {
    'Audax Italiano': '/logos_torneo_nacional/audax.png',
    'Colo-Colo': '/logos_torneo_nacional/colo-colo.png',
    'Cobresal': '/logos_torneo_nacional/cobresal.png',
    'Coquimbo Unido': '/logos_torneo_nacional/coquimbo.png',
    'Deportes Iquique': '/logos_torneo_nacional/iquique.png',
    'Deportes La Serena': '/logos_torneo_nacional/laserena.png',
    'Deportes Limache': '/logos_torneo_nacional/limache.webp',
    'Deportes Concepción': '/logos_torneo_nacional/concepcion.png',
    'U. de Concepción': '/logos_torneo_nacional/udeconce.png',
    'Everton': '/logos_torneo_nacional/everton.png',
    'Huachipato': '/logos_torneo_nacional/huachipato.png',
    'Ñublense': '/logos_torneo_nacional/ñublense.png',
    "O'Higgins": '/logos_torneo_nacional/ohiggins.webp',
    'Palestino': '/logos_torneo_nacional/palestino.png',
    'U. Católica': '/logos_torneo_nacional/uc.png',
    'U. de Chile': '/logos_torneo_nacional/udechile.png',
    'U. Española': '/logos_torneo_nacional/union-espanola.png',
    'Unión Española': '/logos_torneo_nacional/union-espanola.png',
    'Unión La Calera': '/logos_torneo_nacional/calera.png',
    'Universidad de Concepción': '/logos_torneo_nacional/udeconce.png'
  };
  return logos[nombreNormalizado] || null;
};

export default function SimuladorResultados() {
  const navigate = useNavigate();
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState("");
  const [partidos, setPartidos] = useState([]);
  const [pronosticos, setPronosticos] = useState([]);
  const [rankingJornada, setRankingJornada] = useState([]);
  const [rankingAcumulado, setRankingAcumulado] = useState([]);
  
  // Estados simulados
  const [resultadosSimulados, setResultadosSimulados] = useState({});
  const [rankingJornadaSimulado, setRankingJornadaSimulado] = useState([]);
  const [rankingAcumuladoSimulado, setRankingAcumuladoSimulado] = useState([]);

  // Cargar jornadas al montar
  useEffect(() => {
    const cargarJornadas = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/jornadas`);
        const data = await res.json();
        const jornadasValidas = data.filter(j => j.numero !== 999);
        setJornadas(jornadasValidas);
      } catch (err) {
        console.error("Error cargando jornadas:", err);
      }
    };
    cargarJornadas();
  }, []);

  // Cargar datos cuando se selecciona una jornada
  useEffect(() => {
    if (!jornadaSeleccionada) return;
    cargarDatosJornada();
  }, [jornadaSeleccionada]);

  const cargarDatosJornada = async () => {
    try {
      // Cargar partidos
      const resPartidos = await fetch(`${API_BASE_URL}/api/jornadas/${jornadaSeleccionada}/partidos`);
      const dataPartidos = await resPartidos.json();
      setPartidos(dataPartidos);
      
      // Inicializar resultados: usar resultados reales si existen, vacío si no
      const resultados = {};
      dataPartidos.forEach(p => {
        if (p.goles_local !== null && p.goles_visita !== null) {
          // Tiene resultado real - no modificable
          resultados[p.id] = { 
            golesLocal: p.goles_local, 
            golesVisita: p.goles_visita,
            esReal: true // Marca para deshabilitar input
          };
        } else {
          // Sin resultado - modificable
          resultados[p.id] = { 
            golesLocal: "", 
            golesVisita: "",
            esReal: false 
          };
        }
      });
      setResultadosSimulados(resultados);

      // Cargar pronósticos de todos los usuarios para esta jornada
      const resPronosticos = await fetch(`${API_BASE_URL}/api/pronosticos/jornada/${jornadaSeleccionada}`);
      const dataPronosticos = await resPronosticos.json();
      setPronosticos(dataPronosticos);

      // Cargar ranking de jornada actual (REAL de la BD)
      const resRankingJornada = await fetch(`${API_BASE_URL}/api/pronosticos/ranking/jornada/${jornadaSeleccionada}`);
      const dataRankingJornada = await resRankingJornada.json();
      setRankingJornada(dataRankingJornada);
      setRankingJornadaSimulado(dataRankingJornada);

      // Cargar ranking acumulado (REAL hasta jornada seleccionada)
      const resRankingAcumulado = await fetch(`${API_BASE_URL}/api/pronosticos/ranking/acumulado-hasta/${jornadaSeleccionada}`);
      const dataRankingAcumulado = await resRankingAcumulado.json();
      setRankingAcumulado(dataRankingAcumulado);
      setRankingAcumuladoSimulado(dataRankingAcumulado);
    } catch (err) {
      console.error("Error cargando datos:", err);
    }
  };

  const handleResultadoChange = (partidoId, campo, valor) => {
    setResultadosSimulados(prev => ({
      ...prev,
      [partidoId]: {
        ...prev[partidoId],
        [campo]: valor === "" ? "" : parseInt(valor)
      }
    }));
  };

  const calcularPuntos = (pronostico, partido, resultado) => {
    if (resultado.golesLocal === "" || resultado.golesVisita === "") return 0;

    const golesLocalReal = resultado.golesLocal;
    const golesVisitaReal = resultado.golesVisita;
    const golesLocalPronostico = pronostico.goles_local;
    const golesVisitaPronostico = pronostico.goles_visita;

    // Resultado exacto
    if (golesLocalPronostico === golesLocalReal && golesVisitaPronostico === golesVisitaReal) {
      return 5 * (partido.bonus || 1);
    }

    // Diferencia de goles exacta
    const difReal = golesLocalReal - golesVisitaReal;
    const difPronostico = golesLocalPronostico - golesVisitaPronostico;
    
    if (difReal === difPronostico) {
      return 3 * (partido.bonus || 1);
    }

    // Solo resultado (ganador o empate)
    const resultadoReal = difReal > 0 ? 'local' : difReal < 0 ? 'visita' : 'empate';
    const resultadoPronostico = difPronostico > 0 ? 'local' : difPronostico < 0 ? 'visita' : 'empate';
    
    if (resultadoReal === resultadoPronostico) {
      return 1 * (partido.bonus || 1);
    }

    return 0;
  };

  const simularRankings = () => {
    // Verificar que haya al menos un resultado ingresado
    const hayResultados = Object.values(resultadosSimulados).some(
      r => r.golesLocal !== "" && r.golesVisita !== ""
    );

    if (!hayResultados) {
      setRankingJornadaSimulado(rankingJornada);
      setRankingAcumuladoSimulado(rankingAcumulado);
      return;
    }

    // Crear mapa de fotos desde ranking acumulado (tiene todos los jugadores)
    const fotosMap = {};
    rankingAcumulado.forEach(j => {
      fotosMap[j.usuario] = j.foto_perfil;
    });

    // Calcular puntos de la jornada simulada
    const puntosJornada = {};
    
    pronosticos.forEach(pron => {
      const partido = partidos.find(p => p.id === pron.partido_id);
      if (!partido) return;

      const resultado = resultadosSimulados[partido.id];
      const puntos = calcularPuntos(pron, partido, resultado);

      const nombreUsuario = pron.usuario; // nombre del jugador
      
      if (!puntosJornada[nombreUsuario]) {
        puntosJornada[nombreUsuario] = {
          usuario: nombreUsuario,
          nombre: nombreUsuario,
          foto_perfil: pron.usuario_foto_perfil || fotosMap[nombreUsuario] || null,
          puntos_jornada: 0
        };
      }
      puntosJornada[nombreUsuario].puntos_jornada += puntos;
    });

    // Ranking de jornada simulado
    const nuevoRankingJornada = Object.values(puntosJornada)
      .sort((a, b) => b.puntos_jornada - a.puntos_jornada);
    setRankingJornadaSimulado(nuevoRankingJornada);

    // Ranking acumulado simulado
    // Los puntos del ranking acumulado YA incluyen esta jornada si tiene resultados reales
    // Entonces: puntosActuales - puntosRealesJornada + puntosSimuladosJornada
    const nuevoRankingAcumulado = rankingAcumulado.map(jugador => {
      const puntosRealesJornada = rankingJornada.find(j => j.usuario === jugador.usuario)?.puntos_jornada || 0;
      const puntosSimuladosJornada = puntosJornada[jugador.usuario]?.puntos_jornada || 0;
      
      return {
        ...jugador,
        puntaje_total: jugador.puntaje_total - puntosRealesJornada + puntosSimuladosJornada
      };
    }).sort((a, b) => b.puntaje_total - a.puntaje_total);
    
    setRankingAcumuladoSimulado(nuevoRankingAcumulado);
  };

  // Recalcular cuando cambien los resultados
  useEffect(() => {
    if (partidos.length > 0 && pronosticos.length > 0) {
      simularRankings();
    }
  }, [resultadosSimulados]);

  const limpiarSimulacion = () => {
    // Restaurar valores originales: mantener resultados reales, limpiar simulados
    const resultados = {};
    partidos.forEach(p => {
      if (p.goles_local !== null && p.goles_visita !== null) {
        // Mantener resultado real
        resultados[p.id] = { 
          golesLocal: p.goles_local, 
          golesVisita: p.goles_visita,
          esReal: true 
        };
      } else {
        // Limpiar simulado
        resultados[p.id] = { 
          golesLocal: "", 
          golesVisita: "",
          esReal: false 
        };
      }
    });
    setResultadosSimulados(resultados);
    // Restaurar rankings originales
    setRankingJornadaSimulado(rankingJornada);
    setRankingAcumuladoSimulado(rankingAcumulado);
  };

  return (
    <div className="container mt-4">
      <AccesosDirectos />
      
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>🎮 Simulador de Resultados - Torneo Nacional</h2>
        <button className="btn btn-secondary" onClick={() => navigate('/campeonato')}>
          ← Volver
        </button>
      </div>

      <div className="alert alert-info">
        <strong>ℹ️ Simulador:</strong> Prueba diferentes resultados y ve cómo cambiarían los rankings. 
        Los datos NO se guardan en la base de datos. Al recargar la página se borra todo.
      </div>

      {/* Selector de Jornada */}
      <div className="card mb-4">
        <div className="card-header">
          <h5>Seleccionar Jornada</h5>
        </div>
        <div className="card-body">
          <select
            className="form-select"
            value={jornadaSeleccionada}
            onChange={(e) => setJornadaSeleccionada(e.target.value)}
          >
            <option value="">-- Seleccione una jornada --</option>
            {jornadas.map((j) => (
              <option key={j.id} value={j.numero}>
                Jornada {j.numero}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Partidos y Resultados Simulados */}
      {jornadaSeleccionada && partidos.length > 0 && (
        <div className="card mb-4">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h5>⚽ Resultados Simulados - Jornada {jornadaSeleccionada}</h5>
            <button className="btn btn-sm btn-warning" onClick={limpiarSimulacion}>
              🗑️ Limpiar Todo
            </button>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-bordered">
                <thead className="table-dark">
                  <tr className="text-center">
                    <th>Local</th>
                    <th>Goles Local</th>
                    <th>Goles Visita</th>
                    <th>Visita</th>
                  </tr>
                </thead>
                <tbody>
                  {partidos.map((partido) => {
                    const resultado = resultadosSimulados[partido.id];
                    const esResultadoReal = resultado?.esReal;
                    
                    return (
                      <tr key={partido.id}>
                        <td className="text-end">
                          <div className="d-flex align-items-center justify-content-end gap-2">
                            <span>{partido.local}</span>
                            <img 
                              src={getLogoEquipo(partido.local)} 
                              alt={partido.local}
                              style={{width: '25px', height: '25px', objectFit: 'contain'}}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          </div>
                        </td>
                        <td className="text-center" style={{ width: '120px' }}>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            className="form-control form-control-sm text-center"
                            value={resultado?.golesLocal ?? ""}
                            onChange={(e) => handleResultadoChange(partido.id, 'golesLocal', e.target.value)}
                            disabled={esResultadoReal}
                            style={esResultadoReal ? { backgroundColor: '#e9ecef', fontWeight: 'bold' } : {}}
                            title={esResultadoReal ? 'Resultado real - No modificable' : ''}
                          />
                        </td>
                        <td className="text-center" style={{ width: '120px' }}>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            className="form-control form-control-sm text-center"
                            value={resultado?.golesVisita ?? ""}
                            onChange={(e) => handleResultadoChange(partido.id, 'golesVisita', e.target.value)}
                            disabled={esResultadoReal}
                            style={esResultadoReal ? { backgroundColor: '#e9ecef', fontWeight: 'bold' } : {}}
                            title={esResultadoReal ? 'Resultado real - No modificable' : ''}
                          />
                        </td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <img 
                              src={getLogoEquipo(partido.visita)} 
                              alt={partido.visita}
                              style={{width: '25px', height: '25px', objectFit: 'contain'}}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <span>{partido.visita}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Rankings Simulados */}
      {jornadaSeleccionada && rankingJornadaSimulado.length > 0 && (
        <div className="row">
          <div className="col-md-6 mb-4">
            <div className="card">
              <div className="card-header bg-primary text-white">
                <h5>🏆 Ranking Jornada {jornadaSeleccionada} (Simulado)</h5>
              </div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-sm table-striped">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Jugador</th>
                        <th className="text-end">Puntos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingJornadaSimulado.map((jugador, index) => (
                        <tr key={jugador.usuario}>
                          <td>{index + 1}</td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              {jugador.foto_perfil && (
                                <img 
                                  src={jugador.foto_perfil} 
                                  alt={jugador.nombre}
                                  style={{
                                    width: '30px',
                                    height: '30px',
                                    borderRadius: '50%',
                                    objectFit: 'cover'
                                  }}
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              )}
                              <span>{jugador.nombre || jugador.usuario}</span>
                            </div>
                          </td>
                          <td className="text-end">
                            <strong>{jugador.puntos_jornada ?? 0}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div className="col-md-6 mb-4">
            <div className="card">
              <div className="card-header bg-success text-white">
                <h5>📊 Ranking Acumulado (Simulado)</h5>
              </div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-sm table-striped">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Jugador</th>
                        <th className="text-end">Puntos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingAcumuladoSimulado.map((jugador, index) => (
                        <tr key={jugador.usuario}>
                          <td>{index + 1}</td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              {jugador.foto_perfil && (
                                <img 
                                  src={jugador.foto_perfil} 
                                  alt={jugador.nombre}
                                  style={{
                                    width: '30px',
                                    height: '30px',
                                    borderRadius: '50%',
                                    objectFit: 'cover'
                                  }}
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              )}
                              <span>{jugador.nombre || jugador.usuario}</span>
                            </div>
                          </td>
                          <td className="text-end">
                            <strong>{jugador.puntaje_total ?? 0}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
