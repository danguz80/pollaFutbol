import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import NavegacionMundial from "../components/NavegacionMundial";
import { getMundialLogoPorNombre } from "../utils/mundialLogos";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function SimuladorMundial() {
  const navigate = useNavigate();
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState("");
  const [partidos, setPartidos] = useState([]);
  const [pronosticos, setPronosticos] = useState([]);
  const [rankingJornada, setRankingJornada] = useState([]);
  const [rankingAcumulado, setRankingAcumulado] = useState([]);

  const [resultadosSimulados, setResultadosSimulados] = useState({});
  const [rankingJornadaSimulado, setRankingJornadaSimulado] = useState([]);
  const [rankingAcumuladoSimulado, setRankingAcumuladoSimulado] = useState([]);

  useEffect(() => {
    const cargarJornadas = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/api/mundial/jornadas`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setJornadas(data);
      } catch (err) {
        console.error("Error cargando jornadas:", err);
      }
    };
    cargarJornadas();
  }, []);

  useEffect(() => {
    if (!jornadaSeleccionada) return;
    cargarDatosJornada();
  }, [jornadaSeleccionada]);

  const cargarDatosJornada = async () => {
    try {
      const token = localStorage.getItem("token");

      // Cargar todos los partidos y filtrar por jornada
      const resPartidos = await fetch(`${API_BASE_URL}/api/mundial/partidos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const todosPartidos = await resPartidos.json();
      const dataPartidos = todosPartidos.filter(p => p.jornada_numero === Number(jornadaSeleccionada));
      setPartidos(dataPartidos);

      const resultados = {};
      dataPartidos.forEach(p => {
        if (p.resultado_local !== null && p.resultado_visitante !== null) {
          resultados[p.id] = { golesLocal: p.resultado_local, golesVisita: p.resultado_visitante, esReal: true };
        } else {
          resultados[p.id] = { golesLocal: "", golesVisita: "", esReal: false };
        }
      });
      setResultadosSimulados(resultados);

      // Cargar pronósticos de todos los usuarios
      const resPronosticos = await fetch(
        `${API_BASE_URL}/api/mundial/pronosticos-todos/jornada/${jornadaSeleccionada}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const dataPronosticos = await resPronosticos.json();
      setPronosticos(dataPronosticos);

      // Ranking jornada real
      const resRankingJornada = await fetch(
        `${API_BASE_URL}/api/mundial-rankings/jornada/${jornadaSeleccionada}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const dataRankingJornada = await resRankingJornada.json();
      setRankingJornada(dataRankingJornada);
      setRankingJornadaSimulado(dataRankingJornada);

      // Ranking acumulado real
      const resRankingAcumulado = await fetch(
        `${API_BASE_URL}/api/mundial-rankings/acumulado/${jornadaSeleccionada}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
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

  const getFase = (jornadaNum) => {
    const n = Number(jornadaNum);
    if (n >= 1 && n <= 3) return 'FASE DE GRUPOS';
    if (n === 4) return '16VOS';
    if (n === 5) return 'OCTAVOS';
    if (n === 6) return 'CUARTOS';
    if (n === 7) return 'SEMIFINALES';
    return 'FASE DE GRUPOS';
  };

  const getPuntosReglas = (fase) => {
    // Mundial usa mismas reglas: 5 exacto, 3 diferencia, 1 signo
    return { exacto: 5, diferencia: 3, signo: 1 };
  };

  const calcularPuntos = (pronostico, partido, resultado) => {
    if (resultado.golesLocal === "" || resultado.golesVisita === "") return 0;

    const golesLocalReal = resultado.golesLocal;
    const golesVisitaReal = resultado.golesVisita;
    const golesLocalPron = pronostico.goles_local;
    const golesVisitaPron = pronostico.goles_visita;
    const bonus = partido.bonus || 1;

    if (golesLocalPron === golesLocalReal && golesVisitaPron === golesVisitaReal) {
      return 5 * bonus;
    }
    const difReal = golesLocalReal - golesVisitaReal;
    const difPron = golesLocalPron - golesVisitaPron;
    if (Math.abs(difPron) === Math.abs(difReal) && Math.sign(difPron) === Math.sign(difReal)) {
      return 3 * bonus;
    }
    if (Math.sign(difPron) === Math.sign(difReal)) {
      return 1 * bonus;
    }
    return 0;
  };

  const simularRankings = () => {
    const hayResultados = Object.values(resultadosSimulados).some(
      r => r.golesLocal !== "" && r.golesVisita !== ""
    );

    if (!hayResultados) {
      setRankingJornadaSimulado(rankingJornada);
      setRankingAcumuladoSimulado(rankingAcumulado);
      return;
    }

    const fotosMap = {};
    rankingAcumulado.forEach(j => { fotosMap[j.nombre] = j.foto_perfil; });

    const puntosJornada = {};
    pronosticos.forEach(pron => {
      const partido = partidos.find(p => p.id === pron.partido_id);
      if (!partido) return;
      const resultado = resultadosSimulados[partido.id];
      const puntos = calcularPuntos(pron, partido, resultado);
      const nombre = pron.usuario;
      if (!puntosJornada[nombre]) {
        puntosJornada[nombre] = {
          nombre,
          foto_perfil: pron.usuario_foto_perfil || fotosMap[nombre] || null,
          puntos_jornada: 0
        };
      }
      puntosJornada[nombre].puntos_jornada += puntos;
    });

    const nuevoRankingJornada = Object.values(puntosJornada)
      .sort((a, b) => b.puntos_jornada - a.puntos_jornada);
    setRankingJornadaSimulado(nuevoRankingJornada);

    const nuevoRankingAcumulado = rankingAcumulado.map(jugador => {
      const puntosRealesJornada = rankingJornada.find(j => j.nombre === jugador.nombre)?.puntos_jornada || 0;
      const puntosSimuladosJornada = puntosJornada[jugador.nombre]?.puntos_jornada || 0;
      return {
        ...jugador,
        puntos_acumulados: jugador.puntos_acumulados - puntosRealesJornada + puntosSimuladosJornada
      };
    }).sort((a, b) => b.puntos_acumulados - a.puntos_acumulados);
    setRankingAcumuladoSimulado(nuevoRankingAcumulado);
  };

  useEffect(() => {
    if (partidos.length > 0 && pronosticos.length > 0) {
      simularRankings();
    }
  }, [resultadosSimulados]);

  const limpiarSimulacion = () => {
    const resultados = {};
    partidos.forEach(p => {
      if (p.resultado_local !== null && p.resultado_visitante !== null) {
        resultados[p.id] = { golesLocal: p.resultado_local, golesVisita: p.resultado_visitante, esReal: true };
      } else {
        resultados[p.id] = { golesLocal: "", golesVisita: "", esReal: false };
      }
    });
    setResultadosSimulados(resultados);
    setRankingJornadaSimulado(rankingJornada);
    setRankingAcumuladoSimulado(rankingAcumulado);
  };

  const jornadasOrdenadas = [...jornadas].sort((a, b) => a.numero - b.numero);

  return (
    <div className="container mt-4">
      <NavegacionMundial />

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>🎮 Simulador de Resultados - Mundial 2026</h2>
        <button className="btn btn-secondary" onClick={() => navigate("/mundial")}>
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
            {jornadasOrdenadas.map((j) => (
              <option key={j.id} value={j.numero}>
                Jornada {j.numero} - {j.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Partidos y resultados simulados */}
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
                    const esReal = resultado?.esReal;
                    return (
                      <tr key={partido.id}>
                        <td className="text-end">
                          <div className="d-flex align-items-center justify-content-end gap-2">
                            <span>{partido.equipo_local} {partido.pais_local ? `(${partido.pais_local})` : ''}</span>
                            <img
                              src={getMundialLogoPorNombre(partido.equipo_local)}
                              alt={partido.equipo_local}
                              style={{ width: "25px", height: "25px", objectFit: "contain" }}
                              onError={(e) => { e.target.style.display = "none"; }}
                            />
                          </div>
                        </td>
                        <td className="text-center" style={{ width: "120px" }}>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            className="form-control form-control-sm text-center"
                            value={resultado?.golesLocal ?? ""}
                            onChange={(e) => handleResultadoChange(partido.id, "golesLocal", e.target.value)}
                            disabled={esReal}
                            style={esReal ? { backgroundColor: "#e9ecef", fontWeight: "bold" } : {}}
                            title={esReal ? "Resultado real - No modificable" : ""}
                          />
                        </td>
                        <td className="text-center" style={{ width: "120px" }}>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            className="form-control form-control-sm text-center"
                            value={resultado?.golesVisita ?? ""}
                            onChange={(e) => handleResultadoChange(partido.id, "golesVisita", e.target.value)}
                            disabled={esReal}
                            style={esReal ? { backgroundColor: "#e9ecef", fontWeight: "bold" } : {}}
                            title={esReal ? "Resultado real - No modificable" : ""}
                          />
                        </td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <img
                              src={getMundialLogoPorNombre(partido.equipo_visitante)}
                              alt={partido.equipo_visitante}
                              style={{ width: "25px", height: "25px", objectFit: "contain" }}
                              onError={(e) => { e.target.style.display = "none"; }}
                            />
                            <span>{partido.equipo_visitante} {partido.pais_visita ? `(${partido.pais_visita})` : ''}</span>
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
              <div className="card-header bg-danger text-white">
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
                        <tr key={jugador.nombre}>
                          <td>{index + 1}</td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              {jugador.foto_perfil && (
                                <img
                                  src={jugador.foto_perfil}
                                  alt={jugador.nombre}
                                  style={{ width: "30px", height: "30px", borderRadius: "50%", objectFit: "cover" }}
                                  onError={(e) => { e.target.style.display = "none"; }}
                                />
                              )}
                              <span>{jugador.nombre}</span>
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
                        <tr key={jugador.nombre}>
                          <td>{index + 1}</td>
                          <td>
                            <div className="d-flex align-items-center gap-2">
                              {jugador.foto_perfil && (
                                <img
                                  src={jugador.foto_perfil}
                                  alt={jugador.nombre}
                                  style={{ width: "30px", height: "30px", borderRadius: "50%", objectFit: "cover" }}
                                  onError={(e) => { e.target.style.display = "none"; }}
                                />
                              )}
                              <span>{jugador.nombre}</span>
                            </div>
                          </td>
                          <td className="text-end">
                            <strong>{jugador.puntos_acumulados ?? 0}</strong>
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

      {jornadaSeleccionada && partidos.length === 0 && (
        <div className="alert alert-info text-center">
          No hay partidos en esta jornada aún.
        </div>
      )}
    </div>
  );
}
