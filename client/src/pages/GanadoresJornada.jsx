import React, { useEffect, useState } from "react";

// Iconos
const Xroja = () => <span style={{ color: "red", fontSize: "1.7em" }}>✖️</span>;
const VistoVerde = () => <span style={{ color: "green", fontSize: "1.7em" }}>✅</span>;

export default function GanadoresJornada() {
  const [jornadas, setJornadas] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      const jornadasRes = await fetch("http://localhost:3001/api/jornadas");
      const jornadasData = await jornadasRes.json();
      const jugadoresRes = await fetch("http://localhost:3001/api/usuarios");
      const jugadoresData = await jugadoresRes.json();
      setJornadas(jornadasData);
      setJugadores(jugadoresData.map(j => j.nombre));
      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) return <div className="text-center mt-4">Cargando...</div>;

  // Jornadas solo con ganadores
  const jornadasConGanadores = jornadas
    .filter(j => Array.isArray(j.ganadores) && j.ganadores.length > 0)
    .sort((a, b) => a.numero - b.numero);

  // Diccionario de ganadores por jornada
  const ganadoresPorJornada = {};
  jornadasConGanadores.forEach(j => {
    ganadoresPorJornada[j.numero] = j.ganadores || [];
  });

  // Calcular totales
  const totales = {};
  jugadores.forEach(j => {
    totales[j] = jornadasConGanadores.reduce(
      (acc, jornada) => acc + (ganadoresPorJornada[jornada.numero]?.includes(j) ? 1 : 0),
      0
    );
  });

  // Ranking y posiciones
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

  // Función para saber si es líder (máximo de ganados)
  const maxGanados = Math.max(...Object.values(totales));
  const esLider = jugador => totales[jugador] === maxGanados && maxGanados > 0;

  // ---- ESTILO DEL RANKING DE GANADORES ----
  function getRankingGanadoresCellStyle(posicion) {
    if (posicion === 1) return { background: "#fc5858", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    if (posicion === 2) return { background: "#4aba72", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    if (posicion === 3) return { background: "#f27c21", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    return { textAlign: "center", fontWeight: "normal" };
  }

  return (
    <div className="container mt-4">
      <h2 className="text-center" style={{
        background: "#000",
        color: "#fff",
        padding: 8,
        borderRadius: 6,
        marginBottom: 0
      }}>
        GANADORES POR JORNADA
      </h2>

      <div style={{ overflowX: "auto", marginTop: 0 }}>
        <table className="table table-bordered text-center" style={{ minWidth: 900 }}>
          <thead>
            <tr style={{
              background: "#3ab0c8",
              color: "#222",
              fontWeight: "bold",
              fontSize: "1.25em"
            }}>
              <th>Participantes</th>
              {jornadasConGanadores.map(j => (
                <th key={j.numero}>{`J${j.numero}`}</th>
              ))}
              <th>Totales</th>
            </tr>
          </thead>
          <tbody>
            {jugadores.map((jugador, idx) => (
              <tr key={jugador} style={{ background: idx % 2 === 0 ? "#fff" : "#f6f6f6" }}>
                <td style={{ fontWeight: "bold" }}>{jugador}</td>
                {jornadasConGanadores.map(j =>
                  <td key={j.numero} style={{ fontSize: "1.4em" }}>
                    {ganadoresPorJornada[j.numero]?.includes(jugador) ? <VistoVerde /> : <Xroja />}
                  </td>
                )}
                {/* 🔴 Totales: si es líder, fondo rojo, sino blanco */}
                <td style={{
                  fontWeight: "bold",
                  background: esLider(jugador) ? "#fc5858" : "white",
                  color: esLider(jugador) ? "white" : "black",
                  fontSize: "1.2em",
                  textAlign: "center"
                }}>
                  {totales[jugador]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabla resumen de ganadores */}
      <h4 className="mt-5 text-center">Tabla de Ganadores</h4>
      <div style={{ maxWidth: 470, margin: "0 auto" }}>
        <table className="table table-bordered text-center">
          <thead>
            <tr style={{
              background: "#55c0cf", // 💠 tu color solicitado
              color: "#404040",
              fontWeight: "bold",
              fontSize: "1.15em"
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
