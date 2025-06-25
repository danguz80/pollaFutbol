import { useEffect, useState } from "react";

// Accede a la variable de entorno
const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;

export default function Clasificacion() {
  const [jornadas, setJornadas] = useState([]);
  const [jornadaActual, setJornadaActual] = useState("");
  const [detallePuntos, setDetallePuntos] = useState([]);
  const [rankingJornada, setRankingJornada] = useState([]);
  const [rankingAcumulado, setRankingAcumulado] = useState([]);

  // Cargar jornadas y definir por defecto la última
  useEffect(() => {
    // Usar la variable de entorno para la URL del backend
    fetch(`${API_BASE_URL}/api/jornadas`) // Asumo que tienes un endpoint para obtener jornadas
      .then(res => res.json())
      .then(jornadas => {
        setJornadas(jornadas);
        if (jornadas.length && !jornadaActual) {
          setJornadaActual(jornadas[jornadas.length - 1].numero);
        }
      });
    // eslint-disable-next-line
  }, []);

  // Cargar datos según jornada
  useEffect(() => {
    if (!jornadaActual) return;
    // Usar la variable de entorno para todas las llamadas al backend
    fetch(`${API_BASE_URL}/api/pronosticos/jornada/${jornadaActual}`)
      .then(res => res.json())
      .then(setDetallePuntos);

    fetch(`${API_BASE_URL}/api/pronosticos/ranking/jornada/${jornadaActual}`)
      .then(res => res.json())
      .then(setRankingJornada);

    fetch(`${API_BASE_URL}/api/pronosticos/ranking/general`)
      .then(res => res.json())
      .then(setRankingAcumulado);
  }, [jornadaActual]);

  // Estilos de ranking
  function getJornadaCellStyle(i) {
    if (i === 0) return { background: "#ab402e", color: "white", fontWeight: "bold", fontSize: "1.25em", textAlign: "center" };
    if (i === 1) return { background: "#33b849", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    if (i === 2) return { background: "#569600", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    return { textAlign: "center" };
  }
  function getAcumuladoCellStyle(i) {
    if (i === 0) return { background: "#ffbe56", color: "white", fontWeight: "bold", fontSize: "1.25em", textAlign: "center" };
    if (i === 1) return { background: "#396366", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    if (i === 2) return { background: "#44777b", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    return { textAlign: "center" };
  }

  // -------------------- TABLA DETALLE UNIFICADO ---------------------
  function filasDetalleUnificado(array) {
    // Agrupar por jugador
    const agrupados = {};
    array.forEach(p => {
      if (!agrupados[p.usuario]) agrupados[p.usuario] = [];
      agrupados[p.usuario].push(p);
    });
    // Ordenar jugadores alfabéticamente
    const jugadores = Object.keys(agrupados).sort();
    const filas = [];
    jugadores.forEach((usuario, userIdx) => {
      const bloque = agrupados[usuario];
      let total = 0;
      bloque.forEach((p, idx) => {
        total += p.puntos || 0;
        filas.push(
          <tr key={`${usuario}-${idx}`} className="text-center">
            <td>{usuario}</td>
            <td>{p.nombre_local} vs {p.nombre_visita}</td>
            <td>
              {(p.real_local !== null && p.real_visita !== null && p.real_local !== undefined && p.real_visita !== undefined)
                ? `${p.real_local} - ${p.real_visita}`
                : "Pendiente"}
            </td>
            <td>
              {(p.goles_local !== null && p.goles_visita !== null && p.goles_local !== undefined && p.goles_visita !== undefined)
                ? `${p.goles_local} - ${p.goles_visita}`
                : "-"}
            </td>
            <td>{p.bonus ? `x${p.bonus}` : "x1"}</td>
            <td>{p.puntos ?? 0}</td>
          </tr>
        );
      });
      // Total por jugador
      filas.push(
        <tr key={`total-${usuario}`} className="text-center" style={{ fontWeight: "bold", background: "#fff6d6" }}>
          <td colSpan={5} className="text-end">Total {usuario}:</td>
          <td>{total}</td>
        </tr>
      );
      // Fila negra divisoria entre jugadores
      if (userIdx < jugadores.length - 1) {
        filas.push(
          <tr key={`sep-${usuario}`}>
            <td colSpan={6} style={{ background: "#222", color: "white", height: 8, padding: 0 }}></td>
          </tr>
        );
      }
    });
    return filas;
  }

  return (
    <div id="top" className="container mt-4">
      <h2 className="text-center">🎖️ Clasificación</h2>

      {/* --- SELECTOR DE JORNADA --- */}
      <div className="mb-4 text-center">
        <label className="form-label fw-bold">Selecciona Jornada:</label>
        <select
          className="form-select text-center"
          style={{ maxWidth: 300, display: "inline-block" }}
          value={jornadaActual}
          onChange={e => setJornadaActual(e.target.value)}
        >
          <option value="">-- Selecciona jornada --</option>
          {jornadas.map(j => (
            <option key={j.numero} value={j.numero}>Jornada {j.numero}</option>
          ))}
        </select>
      </div>

      {/* Menú de accesos directos */}
      <div className="mb-3 d-flex flex-wrap gap-2 justify-content-center">
        <a href="#detalle-jornada" className="btn btn-outline-primary btn-sm">Detalle de Pronósticos</a>
        <a href="#ranking-jornada" className="btn btn-outline-primary btn-sm">Ranking Jornada</a>
        <a href="#ranking-acumulado" className="btn btn-outline-primary btn-sm">Ranking Acumulado</a>
      </div>

      {/* 1. Detalle de pronósticos por jugador */}
      <div id="detalle-pronosticos" className="mt-5">
        <h4 className="text-center">📝 Detalle de Todos los Pronósticos (Jornada {jornadaActual})</h4>
        <table className="table table-bordered table-sm text-center">
          <thead className="table-secondary text-center">
            <tr>
              <th className="text-center">Jugador</th>
              <th className="text-center">Partido</th>
              <th className="text-center">Resultado real</th>
              <th className="text-center">Mi resultado</th>
              <th className="text-center">Bonus</th>
              <th className="text-center">Puntos</th>
            </tr>
          </thead>
          <tbody>
            {filasDetalleUnificado(detallePuntos)}
          </tbody>
        </table>
        <a href="#top" className="btn btn-link">Volver arriba</a>
      </div>


      {/* 2. Ranking por jornada */}
      <div id="ranking-jornada" className="mt-5">
        <h4 className="text-center">🏆 Ranking Jornada {jornadaActual}</h4>
        <table className="table table-bordered text-center" style={{ marginBottom: "2rem" }}>
          <thead>
            <tr>
              <th style={{ background: "#305496", color: "white", textAlign: "center" }}>Posición</th>
              <th style={{ background: "#305496", color: "white", textAlign: "center" }}>Jugador</th>
              <th style={{ background: "#305496", color: "white", textAlign: "center" }}>Puntaje</th>
            </tr>
          </thead>
          <tbody>
            {rankingJornada.map((p, i) => (
              <tr key={i} className="text-center">
                <td style={getJornadaCellStyle(i)}>{i + 1}</td>
                <td style={getJornadaCellStyle(i)}>{p.usuario}</td>
                <td style={getJornadaCellStyle(i)}>{p.puntaje_jornada ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <a href="#top" className="btn btn-link">Volver arriba</a>
      </div>

      {/* 3. Ranking acumulado */}
      <div id="ranking-acumulado" className="mt-5">
        <h4 className="text-center">📊 Ranking Acumulado</h4>
        <table className="table table-bordered text-center" style={{ marginBottom: "2rem" }}>
          <thead>
            <tr>
              <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Posición</th>
              <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Jugador</th>
              <th style={{ background: "#4c929c", color: "white", textAlign: "center" }}>Puntaje Total</th>
            </tr>
          </thead>
          <tbody>
            {rankingAcumulado.map((p, i) => (
              <tr key={i} className="text-center">
                <td style={getAcumuladoCellStyle(i)}>{i + 1}</td>
                <td style={getAcumuladoCellStyle(i)}>{p.usuario}</td>
                <td style={getAcumuladoCellStyle(i)}>{p.puntaje_total ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <a href="#top" className="btn btn-link">Volver arriba</a>
      </div>
    </div>
  );
}
