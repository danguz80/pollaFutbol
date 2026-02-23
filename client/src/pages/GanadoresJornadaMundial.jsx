import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import NavegacionMundial from '../components/NavegacionMundial';

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

export default function GanadoresJornadaMundial() {
  const navigate = useNavigate();
  const [ganadoresPorJornada, setGanadoresPorJornada] = useState({});
  const [jugadores, setJugadores] = useState([]);
  const [fotoPerfilMap, setFotoPerfilMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [ganadoresAcumulado, setGanadoresAcumulado] = useState([]);
  const [jornada7Cerrada, setJornada7Cerrada] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };

        // Obtener jornadas
        const jornadasRes = await fetch(`${API_BASE_URL}/api/mundial/jornadas`, { headers });
        const jornadasData = await jornadasRes.json();

        // Verificar si la jornada 7 está cerrada
        const jornada7 = jornadasData.find(j => j.numero === 7);
        if (jornada7 && jornada7.cerrada) {
          setJornada7Cerrada(true);
        }

        // Obtener ganadores del acumulado para excluirlos de la tabla de vergüenza
        const acumuladoRes = await fetch(`${API_BASE_URL}/api/mundial-ganadores-jornada/acumulado`, { headers });
        const acumuladoData = await acumuladoRes.json();
        if (acumuladoData.ganadores) {
          setGanadoresAcumulado(acumuladoData.ganadores.map(g => g.nombre));
        }

        // Obtener usuarios
        const usuariosRes = await fetch(`${API_BASE_URL}/api/usuarios`, { headers });
        const usuariosData = await usuariosRes.json();
        const map = {};
        usuariosData.forEach(u => { 
          map[u.nombre] = u.foto_perfil;
        });
        setFotoPerfilMap(map);
        
        // Filtrar usuarios sin admin
        const jugadoresSinAdmin = usuariosData
          .filter(u => u.rol !== 'admin')
          .map(u => u.nombre);
        setJugadores(jugadoresSinAdmin);

        // Obtener ganadores de cada jornada cerrada
        const ganadoresPorJornadaTemp = {};
        for (const jornada of jornadasData.filter(j => j.cerrada)) {
          try {
            const ganadoresRes = await fetch(
              `${API_BASE_URL}/api/mundial-ganadores-jornada/${jornada.numero}`,
              { headers }
            );
            const ganadoresData = await ganadoresRes.json();
            if (ganadoresData.ganadores && Array.isArray(ganadoresData.ganadores) && ganadoresData.ganadores.length > 0) {
              ganadoresPorJornadaTemp[jornada.numero] = ganadoresData.ganadores.map(g => g.nombre);
            }
          } catch (error) {
            console.error(`Error obteniendo ganadores de jornada ${jornada.numero}:`, error);
          }
        }

        setGanadoresPorJornada(ganadoresPorJornadaTemp);
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
  const jornadasConGanadores = Object.entries(ganadoresPorJornada)
    .map(([numero, ganadores]) => ({ numero: parseInt(numero), ganadores }))
    .sort((a, b) => a.numero - b.numero);

  // --- Encabezados estilos ---
  const headerStyle = {
    background: '#0d6efd',
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
  const tablaGanadores = (
    <div style={{ maxWidth: 500, margin: '0 auto', marginBottom: 40 }}>
      <h4 className="text-center mt-4 mb-2" style={headerStyle}>Ganadores por Jornada</h4>
      <table className="table table-bordered text-center" style={{ fontSize: '1.1rem' }}>
        <thead>
          <tr style={{ background: '#0d6efd', color: '#fff', fontWeight: 'bold', fontSize: isMobile ? '0.9em' : '1.1em' }}>
            <th style={{ width: 80 }}>Jornada</th>
            <th>Ganador(es)</th>
          </tr>
        </thead>
        <tbody>
          {jornadasConGanadores.map(j => (
            <tr key={j.numero}>
              <td style={{ fontWeight: 600 }}>Jornada {j.numero}</td>
              <td>
                {j.ganadores
                  .filter(g => jugadores.includes(g))
                  .map((g, idx, arr) => (
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
                    {idx < arr.length - 1 && <span>, </span>}
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
  const totales = {};
  jugadores.forEach(j => {
    totales[j] = jornadasConGanadores.reduce(
      (acc, jornada) => acc + (jornada.ganadores?.includes(j) ? 1 : 0),
      0
    );
  });

  const ranking = Object.entries(totales)
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total);

  function getPosiciones(rankingArr) {
    let posiciones = [];
    let realPos = 1;
    let prevTotal = null;
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

  function getRankingGanadoresCellStyle(posicion) {
    if (posicion === 1) return { background: "#0d6efd", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    if (posicion === 2) return { background: "#4aba72", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    if (posicion === 3) return { background: "#f27c21", color: "white", fontWeight: "bold", fontSize: "1.15em", textAlign: "center" };
    return { textAlign: "center", fontWeight: "normal" };
  }

  // --- Render ---
  return (
    <div className="container mt-4">
      <div className="text-center mb-4">
        <h1 className="display-5 fw-bold" style={{ color: '#0d6efd' }}>🌍 Mundial 2026</h1>
        <p className="text-muted">Ganadores por Jornada</p>
      </div>

      {/* Navegación Mundial */}
      <NavegacionMundial />

      <div className="mb-3 text-center">
        <button 
          className="btn btn-outline-primary"
          onClick={() => navigate('/mundial')}
        >
          ← Volver al Mundial
        </button>
      </div>

      <h2 className="text-center" style={headerStyle}>GANADORES POR JORNADA</h2>
      {tablaGanadores}
      
      <h4 className="mt-5 text-center" style={headerStyle}>Ranking de Ganadores</h4>
      <div style={{ maxWidth: 470, margin: "0 auto" }}>
        <table className="table table-bordered text-center ganadores-jornada-tbl" style={{ fontSize: '1.1rem' }}>
          <thead>
            <tr style={{ background: "#0d6efd", color: "#fff", fontWeight: "bold", fontSize: isMobile ? '1.13em' : '1.25em' }}>
              <th>Posición</th>
              <th>Participante</th>
              <th>Jornadas Ganadas</th>
            </tr>
          </thead>
          <tbody>
            {ranking
              .filter(jugador => jugador.total > 0)
              .map((jugador, idx) => (
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
                <td style={{...getRankingGanadoresCellStyle(posiciones[idx]), fontWeight: 'bold', fontSize: isMobile ? '1.1em' : '1.2em'}}>
                  {jugador.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabla de la Deshonra y la Vergüenza - Solo se muestra después de cerrada la jornada 7 */}
      {jornada7Cerrada && (
        <>
          <h4 className="mt-5 text-center" style={{...headerStyle, background: '#444', color: '#aaa'}}>
            Tabla de la Deshonra y la Vergüenza
          </h4>
          <div style={{ maxWidth: 470, margin: "0 auto", marginBottom: 40 }}>
            <table className="table table-bordered text-center" style={{ fontSize: '1.1rem' }}>
              <thead>
                <tr style={{ background: "#666", color: "#ddd", fontWeight: "bold", fontSize: isMobile ? '1.13em' : '1.25em' }}>
                  <th>Participante</th>
                  <th>Jornadas Ganadas</th>
                </tr>
              </thead>
              <tbody>
                {ranking
                  .filter(jugador => 
                    jugador.total === 0 && 
                    !ganadoresAcumulado.includes(jugador.nombre)
                  )
                  .sort((a, b) => a.nombre.localeCompare(b.nombre))
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
            {ranking.filter(j => j.total === 0 && !ganadoresAcumulado.includes(j.nombre)).length === 0 && (
              <p className="text-center text-muted" style={{ fontStyle: 'italic', marginTop: 20 }}>
                ¡Todos los participantes han ganado al menos una jornada! 🎉
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
