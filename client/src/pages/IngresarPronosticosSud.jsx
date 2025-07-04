import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../hooks/UseAuth";

const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;
const ROUNDS = [
  "Knockout Round Play-offs",
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinales",
  "Final"
];

// Agrupa partidos por sigla de cruce (clasificado), o por equipos involucrados si no existe o es inconsistente
function agruparPorSigla(partidos) {
  const grupos = {};
  for (const p of partidos) {
    // Si hay clasificado y es string, úsalo; si no, agrupa por equipos ordenados
    let key = p.clasificado;
    if (!key || typeof key !== 'string' || key.trim() === '') {
      // Crea una clave única para el cruce, sin importar el orden local/visita
      const equipos = [p.equipo_local, p.equipo_visita].sort();
      key = equipos.join(' vs ');
    }
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(p);
  }
  // Ordenar partidos dentro de cada grupo por fecha
  Object.values(grupos).forEach(arr => arr.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)));
  // Retornar un array de [sigla, partidos] ordenado por sigla ascendente
  return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
}

// Utilidad: calcula los equipos que avanzan ronda a ronda según los pronósticos del usuario
function calcularAvanceEliminatoria(fixture, pronosticos, penales) {
  // Agrupa partidos por ronda y por sigla de cruce
  const rondas = {};
  for (const partido of fixture) {
    if (!rondas[partido.ronda]) rondas[partido.ronda] = {};
    const sigla = partido.clasificado || [partido.equipo_local, partido.equipo_visita].sort().join(' vs ');
    if (!rondas[partido.ronda][sigla]) rondas[partido.ronda][sigla] = [];
    rondas[partido.ronda][sigla].push({...partido});
  }
  // Propagar ganadores a la siguiente ronda reemplazando siglas por nombre
  const avance = {};
  let siglaGanadorMap = {}; // sigla => nombre ganador
  for (let i = 0; i < ROUNDS.length; i++) {
    const ronda = ROUNDS[i];
    avance[ronda] = [];
    const cruces = rondas[ronda] || {};
    for (const [sigla, partidos] of Object.entries(cruces)) {
      // Determina equipos (reemplaza si corresponde)
      let eqA = partidos[0].equipo_local;
      let eqB = partidos[0].equipo_visita;
      if (siglaGanadorMap[eqA]) eqA = siglaGanadorMap[eqA];
      if (siglaGanadorMap[eqB]) eqB = siglaGanadorMap[eqB];
      // Goles ida y vuelta (usa pronóstico si existe, si no, goles reales, si no, 0)
      let gA = 0, gB = 0;
      if (partidos.length === 2) {
        const p1 = partidos[0], p2 = partidos[1];
        gA = Number(pronosticos[p1.fixture_id]?.local ?? p1.goles_local ?? 0) + Number(pronosticos[p2.fixture_id]?.visita ?? p2.goles_visita ?? 0);
        gB = Number(pronosticos[p1.fixture_id]?.visita ?? p1.goles_visita ?? 0) + Number(pronosticos[p2.fixture_id]?.local ?? p2.goles_local ?? 0);
      } else {
        // Partido único
        const p = partidos[0];
        gA = Number(pronosticos[p.fixture_id]?.local ?? p.goles_local ?? 0);
        gB = Number(pronosticos[p.fixture_id]?.visita ?? p.goles_visita ?? 0);
      }
      let ganador = null;
      if (gA > gB) ganador = eqA;
      else if (gB > gA) ganador = eqB;
      else {
        // Empate: define por penales si existen
        const penA = Number(penales[sigla]?.[eqA] ?? 0);
        const penB = Number(penales[sigla]?.[eqB] ?? 0);
        if (penA > penB) ganador = eqA;
        else if (penB > penA) ganador = eqB;
        else ganador = null; // No definido
      }
      avance[ronda].push({ sigla, eqA, eqB, gA, gB, ganador });
      // Si hay sigla (clasificado) y ganador, propagar para la siguiente ronda
      if (sigla && ganador) {
        siglaGanadorMap[sigla] = ganador;
      }
    }
    // Antes de la siguiente ronda, reemplazar en los partidos las siglas por el nombre del ganador
    if (i + 1 < ROUNDS.length) {
      const siguiente = ROUNDS[i + 1];
      if (rondas[siguiente]) {
        for (const [sigla, partidos] of Object.entries(rondas[siguiente])) {
          for (const partido of partidos) {
            if (siglaGanadorMap[partido.equipo_local]) partido.equipo_local = siglaGanadorMap[partido.equipo_local];
            if (siglaGanadorMap[partido.equipo_visita]) partido.equipo_visita = siglaGanadorMap[partido.equipo_visita];
          }
        }
      }
    }
  }
  return avance;
}

function SudamericanaSubMenu() {
  const navigate = useNavigate();
  return (
    <div className="d-flex flex-wrap gap-2 justify-content-center my-4 sticky-top bg-white py-2 shadow-sm" style={{ zIndex: 1020 }}>
      <button className="btn btn-info" onClick={() => navigate("/clasificacion-sudamericana")}>Clasificación</button>
      <button className="btn btn-success" onClick={() => navigate("/ingresar-pronosticos-sud")}>Ingresar Pronósticos</button>
      <button className="btn btn-primary" onClick={() => navigate("/mis-pronosticos-sud")}>Mis Pronósticos</button>
    </div>
  );
}

export default function IngresarPronosticosSud() {
  const [fixture, setFixture] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState(ROUNDS[0]);
  const [pronosticos, setPronosticos] = useState({});
  const [penales, setPenales] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [avanceUsuario, setAvanceUsuario] = useState(null);
  const usuario = useAuth();

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas/sudamericana/fixture`)
      .then(res => res.json())
      .then(data => {
        setFixture(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Cargar pronósticos guardados del usuario
  useEffect(() => {
    if (!usuario || !usuario.id) return;
    fetch(`${API_BASE_URL}/api/sudamericana/pronosticos-elim/${usuario.id}`)
      .then(res => res.json())
      .then(data => {
        // Mapear a formato { fixture_id: { local, visita }, ... }
        const pronos = {};
        const pens = {};
        data.forEach(p => {
          pronos[p.fixture_id] = {
            local: p.goles_local !== null ? Number(p.goles_local) : "",
            visita: p.goles_visita !== null ? Number(p.goles_visita) : ""
          };
          // Penales por sigla de cruce
          const sigla = p.clasificado || null;
          if (sigla) {
            if (!pens[sigla]) pens[sigla] = {};
            if (p.penales_local !== null) pens[sigla][p.equipo_local] = p.penales_local;
            if (p.penales_visita !== null) pens[sigla][p.equipo_visita] = p.penales_visita;
          }
        });
        setPronosticos(pronos);
        setPenales(pens);
      });
  }, [usuario]);

  const partidosFiltrados = fixture.filter(p => p.ronda === selectedRound);
  const grupos = agruparPorSigla(partidosFiltrados);

  // Calcula el global y si hay empate
  function getGlobalYEmpate(partidos) {
    if (partidos.length !== 2) return { empate: false };
    const g1 = Number(pronosticos[partidos[0].fixture_id]?.local ?? partidos[0].goles_local ?? 0);
    const g2 = Number(pronosticos[partidos[0].fixture_id]?.visita ?? partidos[0].goles_visita ?? 0);
    const g3 = Number(pronosticos[partidos[1].fixture_id]?.local ?? partidos[1].goles_local ?? 0);
    const g4 = Number(pronosticos[partidos[1].fixture_id]?.visita ?? partidos[1].goles_visita ?? 0);
    const eqA = partidos[0].equipo_local;
    const eqB = partidos[0].equipo_visita;
    const totalA = g1 + g4;
    const totalB = g2 + g3;
    return { eqA, eqB, totalA, totalB, empate: totalA === totalB };
  }

  const handleInput = (fixtureId, equipo, value) => {
    setPronosticos(prev => ({
      ...prev,
      [fixtureId]: {
        ...prev[fixtureId],
        [equipo]: value
      }
    }));
  };

  const handlePenalInput = (sigla, equipo, value) => {
    setPenales(prev => ({
      ...prev,
      [sigla]: {
        ...prev[sigla],
        [equipo]: value
      }
    }));
  };

  // Guardar pronósticos y penales SOLO en la tabla por usuario
  const handleGuardar = async () => {
    setMensaje("");
    if (!usuario || !usuario.id) {
      setMensaje("Debes iniciar sesión para guardar tus pronósticos");
      return;
    }
    // Tomar todos los partidos de la ronda seleccionada
    const partidosRonda = fixture.filter(p => p.ronda === selectedRound);
    const pronosticosArray = partidosRonda.map(partido => {
      const goles = pronosticos[partido.fixture_id] || {};
      const ronda = partido.ronda || "Desconocida";
      const equipo_local = partido.equipo_local || "Desconocido";
      const equipo_visita = partido.equipo_visita || "Desconocido";
      const sigla = partido.clasificado || null;
      // Calcular ganador si hay goles
      let ganador = null;
      const local = goles.local !== undefined ? goles.local : (partido.goles_local !== null && partido.goles_local !== undefined ? partido.goles_local : "");
      const visita = goles.visita !== undefined ? goles.visita : (partido.goles_visita !== null && partido.goles_visita !== undefined ? partido.goles_visita : "");
      if (local !== "" && visita !== "") {
        if (Number(local) > Number(visita)) ganador = equipo_local;
        else if (Number(visita) > Number(local)) ganador = equipo_visita;
        else {
          // Empate: definir por penales si existen
          const penA = penales[sigla]?.[equipo_local] ?? null;
          const penB = penales[sigla]?.[equipo_visita] ?? null;
          if (penA !== null && penB !== null) {
            if (Number(penA) > Number(penB)) ganador = equipo_local;
            else if (Number(penB) > Number(penA)) ganador = equipo_visita;
          }
        }
      }
      return {
        usuario_id: usuario.id,
        fixture_id: Number(partido.fixture_id),
        ronda,
        equipo_local,
        equipo_visita,
        ganador,
        goles_local: local === "" ? null : local,
        goles_visita: visita === "" ? null : visita,
        penales_local: penales[sigla]?.[equipo_local] ?? null,
        penales_visita: penales[sigla]?.[equipo_visita] ?? null
      };
    });
    console.log("Pronósticos a enviar:", pronosticosArray);
    const payload = { usuario_id: usuario.id, pronosticos: pronosticosArray };
    const res = await fetch(`${API_BASE_URL}/api/sudamericana/guardar-pronosticos-elim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) {
      setMensaje("Pronósticos guardados correctamente. Avance de cruces actualizado solo para ti.");
      // Recalcular avance SOLO para el usuario
      setAvanceUsuario(calcularAvanceEliminatoria(fixture, pronosticos, penales));
    } else setMensaje("Error al guardar");
  };

  // Avanzar cruces (llama al backend y refresca el fixture)
  const handleAvanzarCruces = async () => {
    setMensaje("");
    const res = await fetch(`${API_BASE_URL}/api/jornadas/sudamericana/actualizar-clasificados`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      setMensaje("Cruces avanzados correctamente");
      // Refresca el fixture para ver los equipos actualizados
      setLoading(true);
      fetch(`${API_BASE_URL}/api/jornadas/sudamericana/fixture`)
        .then(res => res.json())
        .then(data => {
          setFixture(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setMensaje("Error al avanzar cruces");
    }
  };

  // Ejemplo: calcular avance de cruces según pronósticos del usuario
  const avance = avanceUsuario || calcularAvanceEliminatoria(fixture, pronosticos, penales);

  return (
    <div className="container mt-4">
      <SudamericanaSubMenu />
      <h2 className="mb-4">Ingresar Pronósticos - Copa Sudamericana</h2>
      <div className="mb-3">
        <label className="me-2">Selecciona la ronda:</label>
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
      {mensaje && <div className="alert alert-info">{mensaje}</div>}
      {loading ? (
        <div>Cargando fixture...</div>
      ) : (
        <>
        {grupos.map(([sigla, partidos]) => {
          const { eqA, eqB, totalA, totalB, empate } = getGlobalYEmpate(partidos);
          return (
            <div key={sigla} className="mb-4 border p-2 rounded">
              <h5 className="mb-2">Cruce {sigla}</h5>
              <table className="table table-bordered text-center mb-2">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Local</th>
                    <th></th>
                    <th>Visita</th>
                  </tr>
                </thead>
                <tbody>
                  {partidos.map(partido => (
                    <tr key={partido.fixture_id}>
                      <td>{new Date(partido.fecha).toLocaleString()}</td>
                      <td>{partido.equipo_local}</td>
                      <td style={{ minWidth: 80 }}>
                        <input
                          type="number"
                          min="0"
                          className="form-control d-inline-block w-25 mx-1"
                          style={{ width: 45, display: 'inline-block' }}
                          value={pronosticos[partido.fixture_id]?.local !== undefined ? pronosticos[partido.fixture_id]?.local : (partido.goles_local !== null && partido.goles_local !== undefined ? partido.goles_local : "")}
                          onChange={e => handleInput(partido.fixture_id, "local", e.target.value === "" ? "" : Number(e.target.value))}
/>
                        <span> - </span>
                        <input
                          type="number"
                          min="0"
                          className="form-control d-inline-block w-25 mx-1"
                          style={{ width: 45, display: 'inline-block' }}
                          value={pronosticos[partido.fixture_id]?.visita !== undefined ? pronosticos[partido.fixture_id]?.visita : (partido.goles_visita !== null && partido.goles_visita !== undefined ? partido.goles_visita : "")}
                          onChange={e => handleInput(partido.fixture_id, "visita", e.target.value === "" ? "" : Number(e.target.value))}
/>
                      </td>
                      <td>{partido.equipo_visita}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mb-2">
                <strong>Global:</strong> {eqA} {totalA ?? "-"} - {totalB ?? "-"} {eqB}
                {empate && (
                  <span className="ms-3 text-danger">Empate global, definir por penales:</span>
                )}
              </div>
              {empate && (
                <div className="mb-2">
                  <span>{eqA} penales: </span>
                  <input
                    type="number"
                    min="0"
                    className="form-control d-inline-block w-25 mx-1"
                    style={{ width: 45, display: 'inline-block' }}
                    value={penales[sigla]?.[eqA] || ""}
                    onChange={e => handlePenalInput(sigla, eqA, e.target.value)}
                  />
                  <span className="mx-2">-</span>
                  <span>{eqB} penales: </span>
                  <input
                    type="number"
                    min="0"
                    className="form-control d-inline-block w-25 mx-1"
                    style={{ width: 45, display: 'inline-block' }}
                    value={penales[sigla]?.[eqB] || ""}
                    onChange={e => handlePenalInput(sigla, eqB, e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}
        <button className="btn btn-primary me-2" onClick={handleGuardar}>Guardar pronósticos</button>
        {/* Solo mostrar botón Avanzar cruces si el usuario es admin */}
        {usuario?.rol === 'admin' && (
          <button className="btn btn-success" onClick={handleAvanzarCruces}>Avanzar cruces</button>
        )}
        <div className="mt-4">
          <h3>Avance de Cruces</h3>
          {ROUNDS.map(ronda => (
            <div key={ronda} className="mb-3">
              <h4>{ronda}</h4>
              <ul>
                {avance[ronda]?.map(cruce => (
                  <li key={cruce.sigla}>
                    {cruce.eqA} ({cruce.gA}) vs {cruce.eqB} ({cruce.gB})
                    {cruce.ganador && (
                      <span className="ms-2 text-success">→ Avanza: <strong>{cruce.ganador}</strong></span>
                    )}
                    {!cruce.ganador && <span className="ms-2 text-warning">(Sin definir)</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
