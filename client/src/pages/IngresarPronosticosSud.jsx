import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../hooks/UseAuth";
import SudamericanaSubMenu from "../components/SudamericanaSubMenu";

const API_BASE_URL = import.meta.env.VITE_API_URL;
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

// Función para cargar clasificados existentes desde la base de datos
async function cargarClasificadosExistentes(usuarioId, token) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sudamericana/clasificados/${usuarioId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.ok) {
      const data = await response.json();
      // Ahora el backend nos devuelve el diccionario de siglas ya calculado
      return {
        clasificados_por_ronda: data.clasificados_por_ronda,
        diccionario_siglas: data.diccionario_siglas
      };
    }
  } catch (error) {
    console.error('Error cargando clasificados existentes:', error);
  }
  return null;
}

// Utilidad: calcula los equipos que avanzan ronda a ronda según los pronósticos del usuario
function calcularAvanceEliminatoria(fixture, pronosticos, penales) {
  // Agrupar partidos por ronda y por sigla (cruce)
  const rondas = {};
  for (const partido of fixture) {
    if (!rondas[partido.ronda]) rondas[partido.ronda] = {};
    const sigla = partido.clasificado || [partido.equipo_local, partido.equipo_visita].sort().join(' vs ');
    if (!rondas[partido.ronda][sigla]) rondas[partido.ronda][sigla] = [];
    rondas[partido.ronda][sigla].push({ ...partido });
  }

  let siglaGanadorMap = {};
  const avance = {};

  // Procesar ronda por ronda para propagar ganadores
  for (let i = 0; i < ROUNDS.length; i++) {
    const ronda = ROUNDS[i];
    avance[ronda] = [];
    const cruces = rondas[ronda] || {};

    for (const [sigla, partidos] of Object.entries(cruces)) {
      // Crear copias de los partidos para no modificar la estructura original
      const partidosCopia = partidos.map(partido => ({ ...partido }));
      
      // Propagar ganadores de rondas anteriores
      for (const partido of partidosCopia) {
        if (siglaGanadorMap[partido.equipo_local]) {
          partido.equipo_local = siglaGanadorMap[partido.equipo_local];
        }
        if (siglaGanadorMap[partido.equipo_visita]) {
          partido.equipo_visita = siglaGanadorMap[partido.equipo_visita];
        }
      }

      let eqA = partidosCopia[0].equipo_local;
      let eqB = partidosCopia[0].equipo_visita;
      let gA = 0, gB = 0;

      // Calcular goles según el número de partidos en el cruce
      if (partidosCopia.length === 2) {
        // Ida y vuelta: sumar goles cruzados
        const p1 = partidosCopia[0], p2 = partidosCopia[1];
        // SOLO usar pronósticos del usuario, NO resultados oficiales
        gA = Number(pronosticos[p1.fixture_id]?.local ?? 0) + 
             Number(pronosticos[p2.fixture_id]?.visita ?? 0);
        gB = Number(pronosticos[p1.fixture_id]?.visita ?? 0) + 
             Number(pronosticos[p2.fixture_id]?.local ?? 0);
      } else {
        // Partido único (Final)
        const p = partidosCopia[0];
        // SOLO usar pronósticos del usuario, NO resultados oficiales
        gA = Number(pronosticos[p.fixture_id]?.local ?? 0);
        gB = Number(pronosticos[p.fixture_id]?.visita ?? 0);
      }

      // Determinar ganador
      let ganador = null;
      
      if (gA > gB) {
        ganador = eqA;
      } else if (gB > gA) {
        ganador = eqB;
      } else {
        // Empate: usar penales del partido de vuelta o único
        let partidoConPenales = partidosCopia.length === 2 ? partidosCopia[1] : partidosCopia[0];
        const penLocal = Number(penales[partidoConPenales.fixture_id]?.local ?? 0);
        const penVisitante = Number(penales[partidoConPenales.fixture_id]?.visitante ?? 0);
        
        // CORREGIDO: Mapear correctamente quién juega de local/visitante en el partido de penales
        const equipoLocal = partidoConPenales.equipo_local;
        const equipoVisitante = partidoConPenales.equipo_visita;
        
        if (penLocal > penVisitante) {
          ganador = equipoLocal; // El que juega de local en ese partido gana
        } else if (penVisitante > penLocal) {
          ganador = equipoVisitante; // El que juega de visitante en ese partido gana
        }
        // Si siguen empatados, ganador queda null
      }

      // Solo agregar UN resultado por cruce
      avance[ronda].push({ 
        sigla, 
        eqA, 
        eqB, 
        gA, 
        gB, 
        ganador 
      });

      // Actualizar mapeo para próximas rondas
      if (sigla && ganador) {
        siglaGanadorMap[sigla] = ganador;
      }
    }
  }

  return avance;
}

export default function IngresarPronosticosSud() {
  const [fixture, setFixture] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState(ROUNDS[0]);
  const [pronosticos, setPronosticos] = useState({});
  const [penales, setPenales] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [edicionCerrada, setEdicionCerrada] = useState(false);
  const [clasificadosExistentes, setClasificadosExistentes] = useState(null);
  const usuario = useAuth();

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas/sudamericana/fixture`)
      .then(res => res.json())
      .then(data => {
        setFixture(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // Consultar si la edición está cerrada
    fetch(`${API_BASE_URL}/api/jornadas/sudamericana/config`)
      .then(res => res.json())
      .then(data => setEdicionCerrada(!!data.edicion_cerrada));
  }, []);

  // Cargar pronósticos guardados del usuario
  useEffect(() => {
    if (!usuario || !usuario.id || fixture.length === 0) return;
    const token = localStorage.getItem("token");
    if (!token) {
      console.error("No hay token de autenticación");
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
        // Mapear a formato { fixture_id: { local, visita }, ... }
        const pronos = {};
        const pens = {};
        
        data.forEach(p => {
          pronos[p.fixture_id] = {
            local: p.goles_local !== null ? Number(p.goles_local) : "",
            visita: p.goles_visita !== null ? Number(p.goles_visita) : ""
          };
          // Mapear penales usando local/visitante como claves estándar
          if (p.penales_local !== null || p.penales_visita !== null) {
            pens[p.fixture_id] = {
              local: p.penales_local,
              visitante: p.penales_visita
            };
          }
        });
        setPronosticos(pronos);
        setPenales(pens);
        
        // Cargar clasificados existentes desde la base de datos
        cargarClasificadosExistentes(usuario.id, token)
          .then(clasificados => {
            if (clasificados) {
              setClasificadosExistentes(clasificados);
            }
          })
          .catch(error => {
            console.error("Error cargando clasificados existentes:", error);
          });
      })
      .catch(error => {
        console.error("Error cargando pronósticos:", error);
        setMensaje(error.message || "Error al cargar pronósticos");
      });
  }, [usuario, fixture]); // Agregado fixture como dependencia

  // Calcula el global y si hay empate
  function getGlobalYEmpate(partidos) {
    if (partidos.length === 1) {
      // PARTIDO ÚNICO (como la Final)
      const p = partidos[0];
      const eqA = p.equipo_local;
      const eqB = p.equipo_visita;
      const totalA = Number(pronosticos[p.fixture_id]?.local ?? p.goles_local ?? 0);
      const totalB = Number(pronosticos[p.fixture_id]?.visita ?? p.goles_visita ?? 0);
      
      return { eqA, eqB, totalA, totalB, empate: totalA === totalB };
    } else if (partidos.length === 2) {
      // IDA Y VUELTA
      const p1 = partidos[0], p2 = partidos[1];
      const eqA = p1.equipo_local;
      const eqB = p1.equipo_visita;
      
      // Usar la misma lógica que calcularAvanceEliminatoria:
      // eqA: local en ida + visitante en vuelta
      // eqB: visitante en ida + local en vuelta
      const totalA = Number(pronosticos[p1.fixture_id]?.local ?? p1.goles_local ?? 0) + 
                     Number(pronosticos[p2.fixture_id]?.visita ?? p2.goles_visita ?? 0);
      const totalB = Number(pronosticos[p1.fixture_id]?.visita ?? p1.goles_visita ?? 0) + 
                     Number(pronosticos[p2.fixture_id]?.local ?? p2.goles_local ?? 0);
      
      return { eqA, eqB, totalA, totalB, empate: totalA === totalB };
    } else {
      return { empate: false };
    }
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

  const handlePenalInput = (fixtureId, posicion, value) => {
    setPenales(prev => {
      const newPenales = {
        ...prev,
        [fixtureId]: {
          ...prev[fixtureId],
          [posicion]: value
        }
      };
      return newPenales;
    });
  };

  // Guardar pronósticos y penales SOLO en la tabla por usuario
  const handleGuardar = async () => {
    try {
      setMensaje("");
      if (!usuario || !usuario.id) {
        setMensaje("Debes iniciar sesión para guardar tus pronósticos");
        return;
      }
    
    // Usar los partidos virtuales para obtener los nombres correctos mostrados en UI
    const partidosVirtual = getFixtureVirtual(fixture, pronosticos, penales);
    const partidosRonda = partidosVirtual.filter(p => p.ronda === selectedRound);
    
    const pronosticosArray = partidosRonda.map(partido => {
      const goles = pronosticos[partido.fixture_id] || {};
      const ronda = partido.ronda || "Desconocida";
      // Usar los nombres reales que se muestran en la UI (ya procesados por getFixtureVirtual)
      const equipo_local = partido.equipo_local || "Desconocido";
      const equipo_visita = partido.equipo_visita || "Desconocido";
      const sigla = partido.clasificado || [partido.equipo_local, partido.equipo_visita].sort().join(' vs ');
      
      // Determinar si es el partido de vuelta (fixture_id más alto del cruce)
      const partidosDelCruce = partidosRonda.filter(p => {
        const siglaComparar = p.clasificado || [p.equipo_local, p.equipo_visita].sort().join(' vs ');
        return siglaComparar === sigla;
      });
      const fixtureIds = partidosDelCruce.map(p => Number(p.fixture_id));
      const maxFixtureId = Math.max(...fixtureIds);
      const esPartidoDeVuelta = partidosDelCruce.length === 2 ? 
        Number(partido.fixture_id) === maxFixtureId : 
        true; // Si solo hay un partido, siempre guardar penales
      
      // Calcular ganador si hay goles
      let ganador = null;
      const local = goles.local !== undefined ? goles.local : (partido.goles_local !== null && partido.goles_local !== undefined ? partido.goles_local : "");
      const visita = goles.visita !== undefined ? goles.visita : (partido.goles_visita !== null && partido.goles_visita !== undefined ? partido.goles_visita : "");
      
      if (local !== "" && visita !== "") {
        if (Number(local) > Number(visita)) ganador = equipo_local;
        else if (Number(visita) > Number(local)) ganador = equipo_visita;
        else {
          // Empate: definir por penales si existen
          const penalesData = penales[maxFixtureId];
          
          if (penalesData && penalesData.local !== null && penalesData.visitante !== null) {
            // Encontrar el partido donde se definieron los penales para mapear correctamente
            const partidoConPenales = partidosDelCruce.find(p => Number(p.fixture_id) === maxFixtureId);
            
            if (partidoConPenales) {
              const equipoLocalEnPenales = partidoConPenales.equipo_local;
              const equipoVisitanteEnPenales = partidoConPenales.equipo_visita;
              const penalesLocal = Number(penalesData.local);
              const penalesVisitante = Number(penalesData.visitante);
              
              // Determinar ganador según qué equipo anotó más penales
              let ganadorPorPenales;
              if (penalesLocal > penalesVisitante) {
                ganadorPorPenales = equipoLocalEnPenales;
              } else if (penalesVisitante > penalesLocal) {
                ganadorPorPenales = equipoVisitanteEnPenales;
              }
              
              // Asignar ganador si uno de los equipos del partido actual es el ganador por penales
              if (ganadorPorPenales === equipo_local) {
                ganador = equipo_local;
              } else if (ganadorPorPenales === equipo_visita) {
                ganador = equipo_visita;
              }
            }
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
        // Guardar penales usando el fixture_id del partido de vuelta para este cruce
        penales_local: penales[maxFixtureId]?.local ?? null,
        penales_visita: penales[maxFixtureId]?.visitante ?? null
      };
    });
    
    // Debug: mostrar qué penales se están enviando
    const penalesEnviados = pronosticosArray.filter(p => p.penales_local !== null || p.penales_visita !== null);
    
    const payload = { usuario_id: usuario.id, pronosticos: pronosticosArray };
    const token = localStorage.getItem("token");
    if (!token) {
      setMensaje("Error: No hay token de autenticación");
      return;
    }
    
    const res = await fetch(`${API_BASE_URL}/api/sudamericana/guardar-pronosticos-elim`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    
    const data = await res.json();
    if (res.ok && data.ok) {
      // Guardar TODOS los clasificados de una vez en la base de datos
      const avance = calcularAvanceEliminatoria(fixture, pronosticos, penales);
      
      const clasificadosPorRonda = {};
      
      for (const ronda of Object.keys(avance)) {
        if (ronda === 'Final') {
          // Para la Final: guardar campeón y subcampeón
          const finalResult = avance[ronda][0]; // Solo hay un partido en la Final
          if (finalResult && finalResult.ganador) {
            const campeon = finalResult.ganador;
            const subcampeon = finalResult.ganador === finalResult.eqA ? finalResult.eqB : finalResult.eqA;
            clasificadosPorRonda[ronda] = [campeon, subcampeon]; // [Campeón, Subcampeón]
          }
        } else {
          // Para otras rondas: solo ganadores
          const ganadores = avance[ronda].map(x => x.ganador).filter(Boolean);
          if (ganadores.length > 0) {
            clasificadosPorRonda[ronda] = ganadores;
          }
        }
      }
      
      // Una sola llamada con todos los clasificados
      if (Object.keys(clasificadosPorRonda).length > 0) {
        await fetch(`${API_BASE_URL}/api/sudamericana/guardar-clasificados`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            clasificadosPorRonda
          })
        });
      }
      
      alert("✅ Pronósticos guardados y cruces actualizados automáticamente para todos los usuarios.");
      
      // Recargar clasificados existentes desde la base de datos
      const clasificadosActualizados = await cargarClasificadosExistentes(usuario.id, token);
      if (clasificadosActualizados) {
        setClasificadosExistentes(clasificadosActualizados);
      }
    } else {
      if (res.status === 403) {
        alert("❌ " + (data.error || "No tienes autorización para realizar pronósticos de Sudamericana"));
      } else {
        alert("❌ " + (data.error || "Error al guardar"));
      }
    }
    } catch (error) {
      console.error("Error en handleGuardar:", error);
      setMensaje("Error al guardar: " + error.message);
    }
  };

  // Avanzar cruces (llama al backend y refresca el fixture)
  // Usar clasificados existentes si están disponibles, si no calcular desde pronósticos
  let avance;
  if (clasificadosExistentes && clasificadosExistentes.clasificados_por_ronda) {
    // Convertir clasificadosExistentes a formato compatible con la lógica de guardado
    avance = {};
    for (const [ronda, equipos] of Object.entries(clasificadosExistentes.clasificados_por_ronda)) {
      if (ronda === 'Final' && equipos.length >= 2) {
        // Para Final: simular estructura con campeón como ganador
        avance[ronda] = [{
          ganador: equipos[0], // Campeón
          eqA: equipos[0],     // Campeón
          eqB: equipos[1]      // Subcampeón
        }];
      } else {
        // Para otras rondas: cada equipo es un ganador
        avance[ronda] = equipos.map(equipo => ({ ganador: equipo }));
      }
    }
  } else {
    avance = calcularAvanceEliminatoria(fixture, pronosticos, penales);
  }

  // --- FIXTURE VIRTUAL DEL USUARIO: genera partidos con equipos propagados según sus pronósticos ---
  function getFixtureVirtual(fixture, pronosticos, penales) {
    console.log("🔍 getFixtureVirtual - clasificadosExistentes:", clasificadosExistentes);
    console.log("🔍 getFixtureVirtual - selectedRound:", selectedRound);
    
    // SIEMPRE debe haber datos en la BD, no calcular
    if (!clasificadosExistentes || !clasificadosExistentes.diccionario_siglas) {
      console.error("❌ No hay clasificadosExistentes o diccionario_siglas");
      return []; // Retornar vacío si no hay datos de BD
    }
    
    const siglaGanadorMap = clasificadosExistentes.diccionario_siglas;
    console.log("🔍 diccionario_siglas:", siglaGanadorMap);
    console.log("🔍 Claves disponibles en siglaGanadorMap:", Object.keys(siglaGanadorMap));
    
    // Generar fixture virtual usando el diccionario exacto del backend
    const partidosRonda = [];
    const partidosDeRonda = fixture.filter(p => p.ronda === selectedRound);
    console.log("🔍 partidosDeRonda para", selectedRound, ":", partidosDeRonda);
    
    // Log de los primeros 2 partidos para debug
    if (partidosDeRonda.length > 0) {
      console.log("🔍 Primer partido:", {
        equipo_local: partidosDeRonda[0].equipo_local,
        equipo_visita: partidosDeRonda[0].equipo_visita,
        ronda: partidosDeRonda[0].ronda
      });
    }
    
    for (const partido of partidosDeRonda) {
      let eqA = partido.equipo_local;
      let eqB = partido.equipo_visita;
      
      console.log(`🔍 Partido original: ${eqA} vs ${eqB}`);
      console.log(`🔍 ¿eqA (${eqA}) está en siglaGanadorMap?`, eqA in siglaGanadorMap);
      console.log(`🔍 ¿eqB (${eqB}) está en siglaGanadorMap?`, eqB in siglaGanadorMap);
      
      // Reemplazar siglas por nombres reales usando el diccionario del backend
      if (siglaGanadorMap[eqA]) {
        console.log(`🔍 Reemplazando sigla ${eqA} por ${siglaGanadorMap[eqA]}`);
        eqA = siglaGanadorMap[eqA];
      }
      if (siglaGanadorMap[eqB]) {
        console.log(`🔍 Reemplazando sigla ${eqB} por ${siglaGanadorMap[eqB]}`);
        eqB = siglaGanadorMap[eqB];
      }
      
      console.log(`🔍 Partido final: ${eqA} vs ${eqB}`);
      partidosRonda.push({ ...partido, equipo_local: eqA, equipo_visita: eqB });
    }
    
    console.log("🔍 partidosRonda resultado:", partidosRonda);
    return partidosRonda;
  }
  const partidosVirtual = getFixtureVirtual(fixture, pronosticos, penales);
  const grupos = agruparPorSigla(partidosVirtual);

  return (
    <div className="container mt-4">
      <SudamericanaSubMenu />
      <h2 className="mb-4">🔧 Ingresar Pronósticos - Copa Sudamericana 🔧</h2>
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
      {edicionCerrada && <div className="alert alert-warning">La edición de pronósticos está cerrada.</div>}
      {mensaje && <div className="alert alert-info">{mensaje}</div>}
      {loading ? (
        <div>Cargando fixture...</div>
      ) : (
        <>
        {grupos.map(([sigla, partidos]) => {
          // Calcular global y empate para este cruce
          const { eqA, eqB, totalA, totalB, empate } = getGlobalYEmpate(partidos);
          // Obtener fixture_id del partido de vuelta (más alto)
          const fixtureIdVuelta = partidos.length === 2 ? 
            Math.max(...partidos.map(p => Number(p.fixture_id))) : 
            partidos[0].fixture_id;
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
                          value={pronosticos[partido.fixture_id]?.local ?? partido.goles_local ?? ""}
                          onChange={e => handleInput(partido.fixture_id, "local", e.target.value)}
                          disabled={edicionCerrada}
                        />
                        <span> - </span>
                        <input
                          type="number"
                          min="0"
                          className="form-control d-inline-block w-25 mx-1"
                          style={{ width: 45, display: 'inline-block' }}
                          value={pronosticos[partido.fixture_id]?.visita ?? partido.goles_visita ?? ""}
                          onChange={e => handleInput(partido.fixture_id, "visita", e.target.value)}
                          disabled={edicionCerrada}
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
                    value={penales[fixtureIdVuelta]?.visitante ?? ""}
                    onChange={e => handlePenalInput(fixtureIdVuelta, "visitante", e.target.value)}
                    disabled={edicionCerrada}
                  />
                  <span className="mx-2">-</span>
                  <span>{eqB} penales: </span>
                  <input
                    type="number"
                    min="0"
                    className="form-control d-inline-block w-25 mx-1"
                    style={{ width: 45, display: 'inline-block' }}
                    value={penales[fixtureIdVuelta]?.local ?? ""}
                    onChange={e => handlePenalInput(fixtureIdVuelta, "local", e.target.value)}
                    disabled={edicionCerrada}
                  />
                </div>
              )}
            </div>
          );
        })}
        <button className="btn btn-primary" onClick={handleGuardar} disabled={edicionCerrada}>Guardar pronósticos y actualizar cruces</button>
        </>
      )}
    </div>
  );
}
