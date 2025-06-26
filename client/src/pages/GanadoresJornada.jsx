import React, { useEffect, useState } from "react";

const isMobile = window.innerWidth <= 480;

// Accede a la variable de entorno
const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;

// Íconos:
const Xroja = () => (
  <span style={{ color: "red", fontSize: isMobile ? "1.05em" : "1.7em" }}>✖️</span>
);
const VistoVerde = () => (
  <span style={{ color: "green", fontSize: isMobile ? "1.05em" : "1.7em" }}>✅</span>
);

export default function GanadoresJornada() {
  const [jornadas, setJornadas] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const jornadasRes = await fetch(`${API_BASE_URL}/api/jornadas`);
        const jornadasData = await jornadasRes.json();
        const jugadoresRes = await fetch(`${API_BASE_URL}/api/usuarios`);
        const jugadoresData = await jugadoresRes.json();
        setJornadas(jornadasData);
        setJugadores(jugadoresData.map(j => j.nombre));
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="text-center mt-4">Cargando...</div>;

  const jornadasConGanadores = jornadas
    .filter(j => Array.isArray(j.ganadores) && j.ganadores.length > 0)
    .sort((a, b) => a.numero - b.numero);

  const ganadoresPorJornada = {};
  jornadasConGanadores.forEach(j => {
    ganadoresPorJornada[j.numero] = j.ganadores || [];
  });

  const totales = {};
  jugadores.forEach(j => {
    totales[j] = jornadasConGanadores.reduce(
      (acc, jornada) => acc + (ganadoresPorJornada[jornada.numero]?.includes(j) ? 1 : 0),
      0
    );
  });

  const ranking = Object.entries(totales)
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total);

  function getPosiciones(rankingArr) {
    let posiciones = [];
    let pos = 1;
    let prevTotal = null;
    let realPos = 1;
    rankingArr.forEach((jug, i) => {
      if (prevTotal !== null && jug.total < prevTotal) {
        realPos = i + 1;
      }
      posiciones.push(realPos);
      prevTotal = jug.total;
    });
    return posiciones;
  }
  const posiciones = getPosiciones(ranking);

  const maxGanados = Math.max(...Object.values(totales));
  const esLider = jugador => totales[jugador] === maxGanados && maxGanados > 0;

  function getRankingGanadoresCellStyle(posicion) {
    if (posicion === 1) return { background: "#fc5858", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    if (posicion === 2) return { background: "#4aba72", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    if (posicion === 3) return { background: "#f27c21", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    return { textAlign: "center", fontWeight: "normal" };
  }

  return (
    <div className="container mt-4">
      <h2
        className="text-center ganadores-header"
        style={{
          background: "#000",
          color: "#fff",
          padding: 8,
          borderRadius: 6,
          marginBottom: 0
        }}
      >
        GANADORES POR JORNADA
      </h2>

      <div style={{ overflowX: "auto", marginTop: 0 }}>
        <table
          className="table table-bordered text-center"
          style={{
            minWidth: isMobile ? 400 : 900,
            maxWidth: "100%",
            fontSize: isMobile ? "0.86em" : "1em"
          }}
        >
          <thead>
            <tr
              style={{
                background: "#3ab0c8",
                color: "#222",
                fontWeight: "bold",
                fontSize: isMobile ? "1em" : "1.25em"
              }}
            >
              <th style={{ padding: isMobile ? "5px" : "12px" }}>Participantes</th>
              {jornadasConGanadores.map(j => (
                <th key={j.numero} style={{ padding: isMobile ? "5px" : "12px" }}>{`J${j.numero}`}</th>
              ))}
              <th style={{ padding: isMobile ? "5px" : "12px" }}>Totales</th>
            </tr>
          </thead>
          <tbody>
            {jugadores.map((jugador, idx) => (
              <tr key={jugador} style={{ background: idx % 2 === 0 ? "#fff" : "#f6f6f6" }}>
                <td style={{ fontWeight: "bold", padding: isMobile ? "6px 3px" : "9px 8px", fontSize: isMobile ? "0.93em" : undefined }}>
                  {jugador}
                </td>
                {jornadasConGanadores.map(j =>
                  <td key={j.numero} style={{ fontSize: isMobile ? "1em" : "1.4em", padding: isMobile ? "4px" : "8px" }}>
                    {ganadoresPorJornada[j.numero]?.includes(jugador) ? <VistoVerde /> : <Xroja />}
                  </td>
                )}
                <td style={{
                  fontWeight: "bold",
                  background: esLider(jugador) ? "#fc5858" : "white",
                  color: esLider(jugador) ? "white" : "black",
                  fontSize: isMobile ? "1em" : "1.2em",
                  textAlign: "center",
                  padding: isMobile ? "6px 3px" : "9px 8px"
                }}>
                  {totales[jugador]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabla resumen de ganadores */}
      <h4 className="mt-5 text-center" style={{ fontSize: "1.09em" }}>Tabla de Ganadores</h4>
      <div style={{ maxWidth: 470, margin: "0 auto" }}>
        <table className="table table-bordered text-center ganadores-jornada-tbl">
          <thead>
            <tr style={{
              background: "#55c0cf",
              color: "#404040",
              fontWeight: "bold",
              fontSize: "1.13em"
            }}>
              <th>Posición</th>
              <th>Participantes</th>
              <th>Totales</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((jugador, idx) => (
              <tr key={jugador.nombre}>
                <td style={getRankingGanadoresCellStyle(posiciones[idx])}>{posiciones[idx]}°</td>
                <td style={getRankingGanadoresCellStyle(posiciones[idx])}>{jugador.nombre}</td>
                <td style={getRankingGanadoresCellStyle(posiciones[idx])}>{jugador.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
