import React, { useEffect, useState } from "react";
import AccesosDirectos from "../components/AccesosDirectos";
import CuentaRegresivaGlobal from "../components/CuentaRegresivaGlobal";

const isMobile = window.innerWidth <= 480;
// Estrella decorativa (al lado del nombre)
const Star = () => (
  <span style={{
    color: '#f7c948',
    marginLeft: 6,
    fontSize: isMobile ? '1.5em' : '2em',
    verticalAlign: 'middle',
    display: 'inline-flex',
    alignItems: 'center',
    position: 'relative',
    top: '2px'
  }}>
    <svg width={isMobile ? 20 : 28} height={isMobile ? 20 : 28} viewBox="0 0 20 20" fill="currentColor" style={{ display: 'block' }}>
      <polygon points="10,1 12.5,7.5 19,7.5 13.5,12 15.5,18.5 10,14.5 4.5,18.5 6.5,12 1,7.5 7.5,7.5" />
    </svg>
  </span>
);
// Estrella con número centrado (para ranking)
const StarWithNumber = ({ number }) => (
  <span style={{
    display: 'inline-block',
    position: 'relative',
    width: isMobile ? 28 : 38,
    height: isMobile ? 28 : 38,
    verticalAlign: 'middle',
    margin: '0 2px'
  }}>
    <svg width={isMobile ? 28 : 38} height={isMobile ? 28 : 38} viewBox="0 0 20 20" fill="#f7c948" style={{ display: 'block' }}>
      <polygon points="10,1 12.5,7.5 19,7.5 13.5,12 15.5,18.5 10,14.5 4.5,18.5 6.5,12 1,7.5 7.5,7.5" />
    </svg>
    <span style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -55%)',
      fontWeight: 700,
      color: '#222',
      fontSize: isMobile ? '1em' : '1.25em',
      pointerEvents: 'none',
      userSelect: 'none',
      lineHeight: 1
    }}>{number}</span>
  </span>
);

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function GanadoresJornada() {
  const [jornadas, setJornadas] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  const [fotoPerfilMap, setFotoPerfilMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const jornadasRes = await fetch(`${API_BASE_URL}/api/jornadas`);
        const jornadasData = await jornadasRes.json();
        // Relacionar nombre de usuario con foto_perfil
        const jugadoresRes = await fetch(`${API_BASE_URL}/api/usuarios`);
        const jugadoresData = await jugadoresRes.json();
        const map = {};
        jugadoresData.forEach(j => { map[j.nombre] = j.foto_perfil; });
        setFotoPerfilMap(map);
        setJugadores(jugadoresData.map(j => j.nombre));
        setJornadas(jornadasData);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div className="text-center mt-4">Cargando...</div>;

  // --- Tabla de ganadores por jornada ---
  const jornadasConGanadores = jornadas
    .filter(j => Array.isArray(j.ganadores) && j.ganadores.length > 0)
    .sort((a, b) => a.numero - b.numero);

  // --- Encabezados estilos ---
  const headerStyle = {
    background: '#111',
    color: '#fff',
    fontWeight: 700,
    fontSize: isMobile ? '1.1em' : '1.3em',
    letterSpacing: 1,
    textAlign: 'center',
    borderRadius: 6,
    padding: isMobile ? 7 : 10,
    marginBottom: 0
  };

  // Tabla: Jornada | Ganador(es)
  // Solo jornadas con ganadores
  const tablaGanadores = (
    <div style={{ maxWidth: 500, margin: '0 auto', marginBottom: 40 }}>
      <h4 className="text-center mt-4 mb-2" style={headerStyle}>Ganadores por Jornada</h4>
      <table className="table table-bordered text-center">
        <thead>
          <tr style={{ background: '#3ab0c8', color: '#222', fontWeight: 'bold', fontSize: isMobile ? '0.9em' : '1.1em' }}>
            <th style={{ width: 80 }}>Jornada</th>
            <th>Ganador(es)</th>
          </tr>
        </thead>
        <tbody>
          {jornadasConGanadores.map(j => (
            <tr key={j.numero}>
              <td style={{ fontWeight: 600 }}>{j.numero}</td>
              <td>
                {j.ganadores.map((g, idx) => (
                  <span key={g} style={{ marginRight: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center' }}>
                    {fotoPerfilMap[g] && (
                      <img
                        src={fotoPerfilMap[g].startsWith('/') ? fotoPerfilMap[g] : `/perfil/${fotoPerfilMap[g]}`}
                        alt={`Foto de ${g}`}
                        style={{
                          width: isMobile ? '44px' : '60px',
                          height: isMobile ? '44px' : '60px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          marginRight: '8px',
                          border: '2px solid #ddd',
                          objectPosition: 'center 30%'
                        }}
                      />
                    )}
                    {g}
                    <Star />
                    {idx < j.ganadores.length - 1 && <span>, </span>}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // --- Ranking de ganadores ---
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

  // --- Render ---
  return (
    <div className="container mt-4">
      <AccesosDirectos />
      <CuentaRegresivaGlobal />
      <h2 className="text-center" style={headerStyle}>GANADORES POR JORNADA</h2>
      {tablaGanadores}
      <h4 className="mt-5 text-center" style={headerStyle}>Ranking de Ganadores</h4>
      <div style={{ maxWidth: 470, margin: "0 auto" }}>
        <table className="table table-bordered text-center ganadores-jornada-tbl">
          <thead>
            <tr style={{ background: "#55c0cf", color: "#404040", fontWeight: "bold", fontSize: isMobile ? '1.13em' : '1.25em' }}>
              <th>Posición</th>
              <th>Participante</th>
              <th>Jornadas Ganadas</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((jugador, idx) => (
              <tr key={jugador.nombre}>
                <td style={{...getRankingGanadoresCellStyle(posiciones[idx]), fontSize: isMobile ? '1.1em' : undefined}}>{posiciones[idx]}°</td>
                <td style={{...getRankingGanadoresCellStyle(posiciones[idx]), fontSize: isMobile ? '1.1em' : undefined}}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {fotoPerfilMap[jugador.nombre] && (
                      <img
                        src={fotoPerfilMap[jugador.nombre].startsWith('/') ? fotoPerfilMap[jugador.nombre] : `/perfil/${fotoPerfilMap[jugador.nombre]}`}
                        alt={`Foto de ${jugador.nombre}`}
                        style={{
                          width: isMobile ? '44px' : '60px',
                          height: isMobile ? '44px' : '60px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          marginRight: '8px',
                          border: '2px solid #ddd',
                          objectPosition: 'center 30%'
                        }}
                      />
                    )}
                    {jugador.nombre}
                  </span>
                </td>
                <td style={{...getRankingGanadoresCellStyle(posiciones[idx]), fontSize: isMobile ? '1.1em' : undefined}}>
                  <StarWithNumber number={jugador.total} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabla de la Deshonra y la Vergüenza */}
      <h4 className="mt-5 text-center" style={{...headerStyle, background: '#444', color: '#aaa'}}>
        Tabla de la Deshonra y la Vergüenza
      </h4>
      <div style={{ maxWidth: 470, margin: "0 auto", marginBottom: 40 }}>
        <table className="table table-bordered text-center">
          <thead>
            <tr style={{ background: "#666", color: "#ddd", fontWeight: "bold", fontSize: isMobile ? '1.13em' : '1.25em' }}>
              <th>Participante</th>
              <th>Jornadas Ganadas</th>
            </tr>
          </thead>
          <tbody>
            {ranking
              .filter(jugador => jugador.total === 0)
              .map((jugador) => (
                <tr key={jugador.nombre} style={{ background: '#f8f8f8' }}>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {fotoPerfilMap[jugador.nombre] && (
                        <img
                          src={fotoPerfilMap[jugador.nombre].startsWith('/') ? fotoPerfilMap[jugador.nombre] : `/perfil/${fotoPerfilMap[jugador.nombre]}`}
                          alt={`Foto de ${jugador.nombre}`}
                          style={{
                            width: isMobile ? '44px' : '60px',
                            height: isMobile ? '44px' : '60px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            marginRight: '8px',
                            border: '2px solid #ddd',
                            objectPosition: 'center 30%',
                            filter: 'grayscale(100%)'
                          }}
                        />
                      )}
                      {jugador.nombre}
                    </span>
                  </td>
                  <td style={{ fontWeight: 'bold', fontSize: isMobile ? '1.1em' : '1.2em', color: '#999' }}>
                    0
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {ranking.filter(j => j.total === 0).length === 0 && (
          <p className="text-center text-muted" style={{ fontStyle: 'italic', marginTop: 20 }}>
            ¡Todos los participantes han ganado al menos una jornada! 🎉
          </p>
        )}
      </div>
    </div>
  );
}
