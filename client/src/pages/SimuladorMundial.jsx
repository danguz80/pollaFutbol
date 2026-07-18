import React, { useState, useEffect } from "react";
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
  const [rankingClasifSimulado, setRankingClasifSimulado] = useState([]);
  const [reglasMap, setReglasMap] = useState({});
  const [reglasRaw, setReglasRaw] = useState([]);
  const [bracketsVirtuales, setBracketsVirtuales] = useState([]);

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

    const cargarReglas = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE_URL}/api/mundial-puntuacion/reglas`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setReglasRaw(data);
        // Construir mapa { fase: { exacto, diferencia, signo } }
        const map = {};
        data.forEach(r => {
          if (!map[r.fase]) map[r.fase] = { exacto: 5, diferencia: 3, signo: 1 };
          if (r.concepto.includes('exacto')) map[r.fase].exacto = r.puntos;
          else if (r.concepto.toLowerCase().includes('diferencia')) map[r.fase].diferencia = r.puntos;
          else if (r.concepto.toLowerCase().includes('signo')) map[r.fase].signo = r.puntos;
        });
        setReglasMap(map);
      } catch (err) {
        console.error("Error cargando reglas de puntuación:", err);
      }
    };

    cargarJornadas();
    cargarReglas();
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

      // Para J7: cargar brackets virtuales de todos los usuarios
      if (Number(jornadaSeleccionada) === 7) {
        try {
          const resBrackets = await fetch(`${API_BASE_URL}/api/mundial/brackets-virtuales-todos`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const dataBrackets = await resBrackets.json();
          setBracketsVirtuales(dataBrackets);
        } catch (err) {
          console.error("Error cargando brackets virtuales:", err);
        }
      } else {
        setBracketsVirtuales([]);
      }
    } catch (err) {
      console.error("Error cargando datos:", err);
    }
  };

  const handleResultadoChange = (partidoId, campo, valor) => {
    setResultadosSimulados(prev => ({
      ...prev,
      [partidoId]: {
        ...prev[partidoId],
        [campo]: campo === 'quienAvanza' ? valor : (valor === "" ? "" : parseInt(valor))
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
    return reglasMap[fase] || { exacto: 5, diferencia: 3, signo: 1 };
  };

  const calcularPuntos = (pronostico, partido, resultado, reglasDinamicas) => {
    if (resultado.golesLocal === "" || resultado.golesVisita === "") return 0;

    const golesLocalReal = resultado.golesLocal;
    const golesVisitaReal = resultado.golesVisita;
    const golesLocalPron = pronostico.goles_local;
    const golesVisitaPron = pronostico.goles_visita;
    const bonus = partido.bonus || 1;

    // Determinar fase: si el partido es final usar 'FINAL', si es 3er lugar usar 'SEMIFINALES'
    let fase = getFase(jornadaSeleccionada);
    if (partido.subtipo === 'final') fase = 'FINAL';
    else if (partido.subtipo === 'tercero_lugar') fase = 'SEMIFINALES';

    const mapa = reglasDinamicas || reglasMap;
    const reglas = mapa[fase] || { exacto: 5, diferencia: 3, signo: 1 };

    if (golesLocalPron === golesLocalReal && golesVisitaPron === golesVisitaReal) {
      return reglas.exacto * bonus;
    }
    const difReal = golesLocalReal - golesVisitaReal;
    const difPron = golesLocalPron - golesVisitaPron;
    if (Math.abs(difPron) === Math.abs(difReal) && Math.sign(difPron) === Math.sign(difReal)) {
      return reglas.diferencia * bonus;
    }
    if (Math.sign(difPron) === Math.sign(difReal)) {
      return reglas.signo * bonus;
    }
    return 0;
  };

  // Puntos de clasificación por jornada (quién avanza) leídos dinámicamente
  const getPuntosClasifAvance = (jornadaNum, reglasRawArr) => {
    const mapa = {
      4: 'octavos', 5: 'cuartos', 6: 'semifinales', 7: 'la final'
    };
    const keyword = mapa[Number(jornadaNum)];
    if (!keyword) return 0;
    const regla = reglasRawArr.find(r =>
      r.fase === 'CLASIFICACIÓN' && r.concepto.toLowerCase().includes(keyword)
    );
    return regla ? regla.puntos : 2;
  };

  // Determina qué equipo avanzaría según resultado simulado (con quienAvanza para empates)
  const getAvanzado = (partido, resultado) => {
    const l = Number(resultado.golesLocal);
    const v = Number(resultado.golesVisita);
    if (l > v) return partido.equipo_local;
    if (v > l) return partido.equipo_visitante;
    return resultado.quienAvanza || null;
  };

  // Determina qué equipo predijo el usuario que avanzaría
  const getPredAvanzado = (pron, partido) => {
    const l = Number(pron.goles_local);
    const v = Number(pron.goles_visita);
    if (l > v) return partido.equipo_local;
    if (v > l) return partido.equipo_visitante;
    return pron.quien_avanza || null; // empate → usa quien_avanza
  };

  // Calcula puntos de clasificación (avance) para jornadas de eliminación directa
  const calcularClasificacion = (reglasRawArr) => {
    const jornada = Number(jornadaSeleccionada);
    if (jornada < 4) return {}; // solo fases de eliminación

    const ptsAvance = getPuntosClasifAvance(jornada, reglasRawArr);
    const puntosClasif = {}; // { nombre: pts }

    // Para J7 además calculamos cuadro final
    const finalPartido = partidos.find(p => p.subtipo === 'final');
    const terceroPartido = partidos.find(p => p.subtipo === 'tercero_lugar');
    const resultadoFinal = finalPartido ? resultadosSimulados[finalPartido.id] : null;
    const resultadoTercero = terceroPartido ? resultadosSimulados[terceroPartido.id] : null;

    // Puntos cuadro final desde reglas
    const ptsFinalista = reglasRawArr.find(r => r.fase === 'CLASIFICACIÓN' && r.concepto.toLowerCase().includes('la final'))?.puntos || 5;
    const ptsCampeon = reglasRawArr.find(r => r.fase === 'CAMPEÓN' && r.concepto.toLowerCase().includes('campeón'))?.puntos || 20;
    const ptsSubcampeon = reglasRawArr.find(r => r.fase === 'CAMPEÓN' && r.concepto.toLowerCase().includes('subcampeón'))?.puntos || 10;
    const ptsTercero = reglasRawArr.find(r => r.fase === 'CAMPEÓN' && r.concepto.toLowerCase().includes('tercer'))?.puntos || 5;
    const ptsCuarto = reglasRawArr.find(r => r.fase === 'CAMPEÓN' && r.concepto.toLowerCase().includes('cuarto'))?.puntos || 3;

    // Real equipo avanzado por partido (semis y demás)
    const semiPartidos = partidos.filter(p => !p.subtipo || p.subtipo === 'semifinal');

    pronosticos.forEach(pron => {
      const partido = partidos.find(p => p.id === pron.partido_id);
      if (!partido) return;
      const resultado = resultadosSimulados[partido.id];
      if (!resultado || resultado.golesLocal === '' || resultado.golesVisita === '') return;

      const nombre = pron.usuario;
      if (!puntosClasif[nombre]) puntosClasif[nombre] = { nombre, foto_perfil: pron.usuario_foto_perfil, pts_avance: 0, pts_cuadro: 0 };

      // Puntos por acertar quién avanza (J4-J7 semis)
      const esPartidoDeAvance = !partido.subtipo || partido.subtipo === 'semifinal';
      if (esPartidoDeAvance) {
        const avanzadoReal = getAvanzado(partido, resultado);
        const predAvanzado = getPredAvanzado(pron, partido);
        if (avanzadoReal && predAvanzado && avanzadoReal === predAvanzado) {
          puntosClasif[nombre].pts_avance += ptsAvance;
        }
      }
    });

    // Para J7: cuadro final desde brackets virtuales
    if (jornada === 7 && finalPartido && terceroPartido) {
      const rfLocal = resultadoFinal?.golesLocal;
      const rfVisita = resultadoFinal?.golesVisita;
      const rt3Local = resultadoTercero?.golesLocal;
      const rt3Visita = resultadoTercero?.golesVisita;

      const realFinalTeams = new Set([finalPartido.equipo_local, finalPartido.equipo_visitante]);
      const realTerceroTeams = new Set([terceroPartido.equipo_local, terceroPartido.equipo_visitante]);

      let realCampeon = null, realSubcampeon = null, realTercero = null, realCuarto = null;
      if (rfLocal !== '' && rfLocal !== undefined && rfVisita !== '' && rfVisita !== undefined) {
        const lf = Number(rfLocal), vf = Number(rfVisita);
        if (lf > vf) { realCampeon = finalPartido.equipo_local; realSubcampeon = finalPartido.equipo_visitante; }
        else if (vf > lf) { realCampeon = finalPartido.equipo_visitante; realSubcampeon = finalPartido.equipo_local; }
        else if (resultadoFinal?.quienAvanza) {
          realCampeon = resultadoFinal.quienAvanza;
          realSubcampeon = resultadoFinal.quienAvanza === finalPartido.equipo_local ? finalPartido.equipo_visitante : finalPartido.equipo_local;
        }
      }
      if (rt3Local !== '' && rt3Local !== undefined && rt3Visita !== '' && rt3Visita !== undefined) {
        const l3 = Number(rt3Local), v3 = Number(rt3Visita);
        if (l3 > v3) { realTercero = terceroPartido.equipo_local; realCuarto = terceroPartido.equipo_visitante; }
        else if (v3 > l3) { realTercero = terceroPartido.equipo_visitante; realCuarto = terceroPartido.equipo_local; }
        else if (resultadoTercero?.quienAvanza) {
          realTercero = resultadoTercero.quienAvanza;
          realCuarto = resultadoTercero.quienAvanza === terceroPartido.equipo_local ? terceroPartido.equipo_visitante : terceroPartido.equipo_local;
        }
      }

      bracketsVirtuales.forEach(({ nombre, bracket }) => {
        if (!puntosClasif[nombre]) puntosClasif[nombre] = { nombre, foto_perfil: null, pts_avance: 0, pts_cuadro: 0 };

        const b1 = bracket[1], b2 = bracket[2], b3 = bracket[3], b4 = bracket[4];

        // Puntos cuadro final desde brackets virtuales
        const finalOK = b1 && b2 && realFinalTeams.has(b1) && realFinalTeams.has(b2);
        if (finalOK) {
          // Pts por predecir ambos finalistas correctamente
          puntosClasif[nombre].pts_cuadro += ptsFinalista * 2;

          // Pts campeón/subcampeón: validar resultado predicho del partido Final
          const pronFinal = pronosticos.find(p => p.partido_id === finalPartido.id && p.usuario === nombre);
          if (pronFinal && realCampeon) {
            const lp = Number(pronFinal.goles_local), vp = Number(pronFinal.goles_visita);
            let predCampeon;
            if (lp > vp) predCampeon = finalPartido.equipo_local;
            else if (vp > lp) predCampeon = finalPartido.equipo_visitante;
            else predCampeon = pronFinal.quien_avanza || null; // empate: requiere quien_avanza explícito

            if (predCampeon && predCampeon === realCampeon) puntosClasif[nombre].pts_cuadro += ptsCampeon;
            if (predCampeon) {
              const predSub = predCampeon === finalPartido.equipo_local ? finalPartido.equipo_visitante : finalPartido.equipo_local;
              if (realSubcampeon && predSub === realSubcampeon) puntosClasif[nombre].pts_cuadro += ptsSubcampeon;
            }
          }
        }

        const terceroOK = b3 && b4 && realTerceroTeams.has(b3) && realTerceroTeams.has(b4);
        if (terceroOK) {
          // Pts 3er/4to lugar: validar resultado predicho del partido 3er Lugar
          const pronTercero = pronosticos.find(p => p.partido_id === terceroPartido.id && p.usuario === nombre);
          if (pronTercero && realTercero) {
            const lp = Number(pronTercero.goles_local), vp = Number(pronTercero.goles_visita);
            let predTercero;
            if (lp > vp) predTercero = terceroPartido.equipo_local;
            else if (vp > lp) predTercero = terceroPartido.equipo_visitante;
            else predTercero = pronTercero.quien_avanza || null;

            if (predTercero && predTercero === realTercero) puntosClasif[nombre].pts_cuadro += ptsTercero;
            if (predTercero) {
              const predCuarto = predTercero === terceroPartido.equipo_local ? terceroPartido.equipo_visitante : terceroPartido.equipo_local;
              if (realCuarto && predCuarto === realCuarto) puntosClasif[nombre].pts_cuadro += ptsCuarto;
            }
          }
        }
      });
    }

    return puntosClasif;
  };

  const simularRankings = (reglasDinamicas, reglasRawArr) => {
    const hayResultados = Object.values(resultadosSimulados).some(
      r => r.golesLocal !== "" && r.golesVisita !== ""
    );

    if (!hayResultados) {
      setRankingJornadaSimulado(rankingJornada);
      setRankingAcumuladoSimulado(rankingAcumulado);
      setRankingClasifSimulado([]);
      return;
    }

    const fotosMap = {};
    rankingAcumulado.forEach(j => { fotosMap[j.nombre] = j.foto_perfil; });

    const puntosJornada = {};
    pronosticos.forEach(pron => {
      const partido = partidos.find(p => p.id === pron.partido_id);
      if (!partido) return;
      const resultado = resultadosSimulados[partido.id];
      if (!resultado) return;
      const puntos = calcularPuntos(pron, partido, resultado, reglasDinamicas);
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

    // Calcular puntos de clasificación
    const jornada = Number(jornadaSeleccionada);
    let puntosClasif = {};
    if (jornada >= 4) {
      puntosClasif = calcularClasificacion(reglasRawArr || []);
      const rankingClasif = Object.values(puntosClasif)
        .map(u => ({ ...u, pts_total: u.pts_avance + u.pts_cuadro }))
        .filter(u => u.pts_total > 0)
        .sort((a, b) => b.pts_total - a.pts_total);
      setRankingClasifSimulado(rankingClasif);
    } else {
      setRankingClasifSimulado([]);
    }

    const nuevoRankingAcumulado = rankingAcumulado.map(jugador => {
      const puntosRealesJornada = rankingJornada.find(j => j.nombre === jugador.nombre)?.puntos_jornada || 0;
      const puntosSimuladosJornada = puntosJornada[jugador.nombre]?.puntos_jornada || 0;
      const puntosClasifSimulados = (puntosClasif[jugador.nombre]?.pts_avance || 0) + (puntosClasif[jugador.nombre]?.pts_cuadro || 0);
      return {
        ...jugador,
        puntos_acumulados: jugador.puntos_acumulados - puntosRealesJornada + puntosSimuladosJornada + puntosClasifSimulados
      };
    }).sort((a, b) => b.puntos_acumulados - a.puntos_acumulados);
    setRankingAcumuladoSimulado(nuevoRankingAcumulado);
  };

  useEffect(() => {
    if (partidos.length > 0 && pronosticos.length > 0) {
      simularRankings(reglasMap, reglasRaw);
    }
  }, [resultadosSimulados, reglasMap, reglasRaw, bracketsVirtuales]);

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
    setRankingClasifSimulado([]);
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
                    const esEliminacion = Number(jornadaSeleccionada) >= 4;
                    const esEmpate = resultado?.golesLocal !== "" && resultado?.golesVisita !== "" &&
                      Number(resultado?.golesLocal) === Number(resultado?.golesVisita);
                    const mostrarQuienAvanza = esEliminacion && esEmpate && !esReal;
                    return (
                      <React.Fragment key={partido.id}>
                      <tr>
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
                      {mostrarQuienAvanza && (
                        <tr style={{ background: '#fff8e1' }}>
                          <td colSpan="4" className="text-center py-2">
                            <small className="text-muted me-2">⚽ Empate — ¿Quién avanza?</small>
                            <div className="btn-group btn-group-sm">
                              <button
                                className={`btn ${resultado?.quienAvanza === partido.equipo_local ? 'btn-warning' : 'btn-outline-secondary'}`}
                                onClick={() => handleResultadoChange(partido.id, 'quienAvanza', partido.equipo_local)}
                              >
                                {partido.equipo_local}
                              </button>
                              <button
                                className={`btn ${!resultado?.quienAvanza ? 'btn-secondary' : 'btn-outline-secondary'} btn-sm`}
                                onClick={() => handleResultadoChange(partido.id, 'quienAvanza', '')}
                                title="Sin definir"
                              >
                                ?
                              </button>
                              <button
                                className={`btn ${resultado?.quienAvanza === partido.equipo_visitante ? 'btn-warning' : 'btn-outline-secondary'}`}
                                onClick={() => handleResultadoChange(partido.id, 'quienAvanza', partido.equipo_visitante)}
                              >
                                {partido.equipo_visitante}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
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
        <>
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

          {/* Tabla de Clasificación (solo J4-J7) */}
          {Number(jornadaSeleccionada) >= 4 && (
            <div className="row">
              <div className="col-12 mb-4">
                <div className="card">
                  <div className="card-header text-white" style={{ background: 'linear-gradient(135deg,#7b2d8b,#b44fc7)' }}>
                    <h5 className="mb-0">
                      🔮 Puntos por Clasificación (Simulado)
                      {Number(jornadaSeleccionada) === 7 && <span className="ms-2 badge bg-warning text-dark">+ Cuadro Final</span>}
                    </h5>
                    <small className="opacity-75">
                      {Number(jornadaSeleccionada) === 7
                        ? 'Pts por equipo que avanza a Final + Campeón/Subcampeón/3er/4to lugar'
                        : 'Pts por acertar qué equipo avanza en cada partido'}
                    </small>
                  </div>
                  <div className="card-body">
                    {rankingClasifSimulado.length === 0 ? (
                      <p className="text-muted text-center mb-0">Sin puntos de clasificación aún — ingresa resultados con un ganador claro.</p>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-sm table-striped">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Jugador</th>
                              <th className="text-end">Pts Avance</th>
                              {Number(jornadaSeleccionada) === 7 && <th className="text-end">Pts Cuadro Final</th>}
                              <th className="text-end">Total Clasif.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rankingClasifSimulado.map((jugador, index) => (
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
                                <td className="text-end">{jugador.pts_avance}</td>
                                {Number(jornadaSeleccionada) === 7 && <td className="text-end">{jugador.pts_cuadro}</td>}
                                <td className="text-end"><strong>{jugador.pts_total}</strong></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {jornadaSeleccionada && partidos.length === 0 && (
        <div className="alert alert-info text-center">
          No hay partidos en esta jornada aún.
        </div>
      )}
    </div>
  );
}
