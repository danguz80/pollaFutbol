import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import JornadaSelector from "../components/JornadaSelector";
import AccesosDirectos from "../components/AccesosDirectos";
import CuentaRegresivaGlobal from "../components/CuentaRegresivaGlobal";

// Accede a la variable de entorno
const API_BASE_URL = import.meta.env.VITE_API_URL;

// Mapeo de nombres de equipos a logos (nombres exactos como están en la BD)
const LOGOS_EQUIPOS = {
  'Audax Italiano': '/logos_torneo_nacional/audax.png',
  'Unión La Calera': '/logos_torneo_nacional/calera.png',
  'Cobresal': '/logos_torneo_nacional/cobresal.png',
  'Colo-Colo': '/logos_torneo_nacional/colo-colo.png',
  'Deportes Iquique': '/logos_torneo_nacional/iquique.png',
  'Coquimbo Unido': '/logos_torneo_nacional/coquimbo.png',
  'Everton': '/logos_torneo_nacional/everton.png',
  'Huachipato': '/logos_torneo_nacional/huachipato.png',
  'Deportes La Serena': '/logos_torneo_nacional/laserena.png',
  'Deportes Limache': '/logos_torneo_nacional/limache.webp',
  'Deportes Concepción': '/logos_torneo_nacional/concepcion.png',
  'U. de Concepción': '/logos_torneo_nacional/udeconce.png',
  "O'Higgins": '/logos_torneo_nacional/ohiggins.webp',
  'Palestino': '/logos_torneo_nacional/palestino.png',
  'U. Católica': '/logos_torneo_nacional/uc.png',
  'U. de Chile': '/logos_torneo_nacional/udechile.png',
  'Unión Española': '/logos_torneo_nacional/union-espanola.png',
  'Ñublense': '/logos_torneo_nacional/ñublense.png'
};

// Función para obtener el logo de un equipo
const getLogoEquipo = (nombreEquipo) => {
  // Normalizar apóstrofes: \u2019 (tipográfico) → ' (normal)
  const nombreNormalizado = nombreEquipo?.replace(/[\u2018\u2019]/g, "'");
  return LOGOS_EQUIPOS[nombreNormalizado] || null;
};

// Hook local para obtener usuario desde localStorage
function useAuth() {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuario"));
    return usuario;
  } catch {
    return null;
  }
}

export default function Jornada() {
  const usuario = useAuth();
  const navigate = useNavigate();
  const { id } = useParams(); // Obtener número de jornada de la URL

  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState(null); // el número de la jornada
  const [jornadaIdSeleccionada, setJornadaIdSeleccionada] = useState(null); // el ID real de la jornada
  const [partidos, setPartidos] = useState([]);
  const [pronosticos, setPronosticos] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [cerrada, setCerrada] = useState(false); // Estado de cierre
  const [loading, setLoading] = useState(false);
  
  // Estados para jornada 10 (semifinales y final)
  const [equiposFinalistasPronosticados, setEquiposFinalistasPronosticados] = useState([]);
  const [partidoFinal, setPartidoFinal] = useState(null);
  const [pronosticoFinal, setPronosticoFinal] = useState({ goles_local: '', goles_visita: '', penales_local: '', penales_visita: '' });
  const [mostrarCalcularFinalistas, setMostrarCalcularFinalistas] = useState(false);

  // Si no hay usuario autenticado, redirigir al login
  // Si el usuario no está activo en Torneo Nacional, redirigir al home
  useEffect(() => {
    if (!usuario) {
      navigate("/login");
      return;
    }
    
    console.log('👤 Usuario actual:', usuario);
    console.log('🏆 activo_torneo_nacional:', usuario.activo_torneo_nacional);
    
    // Solo permitir acceso si está explícitamente en true
    if (usuario.activo_torneo_nacional !== true) {
      console.log('🚫 Usuario sin acceso a Torneo Nacional');
      alert("⚠️ No tienes acceso para ingresar pronósticos en el Torneo Nacional.\n\nPor favor CIERRA SESIÓN y vuelve a INICIAR SESIÓN para actualizar tus permisos.");
      navigate("/");
      return;
    }
  }, []); // Ejecutar solo una vez al montar

  // Cargar jornadas disponibles
  useEffect(() => {
    // Usar la variable de entorno para la URL del backend
    fetch(`${API_BASE_URL}/api/jornadas`)
      .then((res) => res.json())
      .then(setJornadas)
      .catch((err) => console.error("Error al cargar jornadas", err));
  }, []);

  // Si viene número de jornada en la URL, seleccionarla automáticamente
  useEffect(() => {
    if (id && jornadas.length > 0) {
      const numeroJornada = parseInt(id, 10);
      setJornadaSeleccionada(numeroJornada);
    }
  }, [id, jornadas]);

  // Cuando cambia jornadaSeleccionada, obtenemos el id real y los datos
  useEffect(() => {
    if (!jornadaSeleccionada) return;
    setLoading(true);

    // Buscar el id real en jornadas
    const jornadaObj = jornadas.find(j => String(j.numero) === String(jornadaSeleccionada));
    setJornadaIdSeleccionada(jornadaObj ? jornadaObj.id : null);

    // 1. Cargar partidos
    // Usar la variable de entorno para la URL del backend
    fetch(`${API_BASE_URL}/api/jornadas/${jornadaSeleccionada}/partidos`)
      .then((res) => res.json())
      .then(setPartidos)
      .catch((err) => {
        setPartidos([]);
        console.error("Error al cargar partidos", err);
      });

    // 2. Cargar pronósticos guardados
    const token = localStorage.getItem("token");
    // Usar la variable de entorno para la URL del backend
    fetch(`${API_BASE_URL}/api/pronosticos/${jornadaSeleccionada}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(pronosticosDb => {
        const map = {};
        pronosticosDb.forEach(pr => {
          map[pr.partido_id] = {
            goles_local: pr.goles_local,
            goles_visita: pr.goles_visita,
            penales_local: pr.penales_local,
            penales_visita: pr.penales_visita
          };
        });
        setPronosticos(map);
        
        // Para jornada 10, cargar el pronóstico de la final si existe
        if (jornadaSeleccionada === 10 && pronosticosDb.length === 5) {
          const pronosticoFinalDb = pronosticosDb[4]; // El quinto pronóstico es la final
          if (pronosticoFinalDb) {
            setPronosticoFinal({
              goles_local: pronosticoFinalDb.goles_local ?? '',
              goles_visita: pronosticoFinalDb.goles_visita ?? '',
              penales_local: pronosticoFinalDb.penales_local ?? '',
              penales_visita: pronosticoFinalDb.penales_visita ?? ''
            });
          }
        }
        
        setLoading(false);
      })
      .catch(() => {
        setPronosticos({});
        setLoading(false);
      });

    // 3. Cargar si está cerrada
    // Usar la variable de entorno para la URL del backend
    fetch(`${API_BASE_URL}/api/jornadas/${jornadaSeleccionada}`)
      .then(res => res.json())
      .then(j => setCerrada(!!j.cerrada))
      .catch(() => setCerrada(false));
  }, [jornadaSeleccionada, jornadas]);

  // Calcular finalistas basados en pronósticos del usuario (solo jornada 10)
  useEffect(() => {
    console.log('🔍 useEffect ejecutándose - Jornada:', jornadaSeleccionada, 'Partidos:', partidos.length);
    
    if (jornadaSeleccionada !== 10) {
      setEquiposFinalistasPronosticados([]);
      setPartidoFinal(null);
      setMostrarCalcularFinalistas(false);
      return;
    }
    
    if (partidos.length === 0) {
      console.log('⚠️ Esperando que carguen los partidos...');
      return;
    }

    console.log('🔍 Calculando finalistas - Partidos:', partidos.length);
    console.log('🔍 Pronósticos actuales:', pronosticos);

    // Identificar partidos de semifinal vs final
    // Ahora el partido final siempre existe (creado automáticamente por el backend)
    const partidosSemifinal = partidos.slice(0, 4); // Primeros 4 son semifinales
    
    if (partidosSemifinal.length < 4) {
      console.log('⚠️ No hay suficientes partidos de semifinal');
      return;
    }

    if (partidos.length < 5) {
      console.log('⚠️ No hay partido de final creado todavía');
      setEquiposFinalistasPronosticados([]);
      setPartidoFinal(null);
      return;
    }

    // Verificar si hay pronósticos guardados
    const hayPronosticos = partidosSemifinal.some(p => 
      pronosticos[p.id] && 
      (pronosticos[p.id].goles_local !== undefined || pronosticos[p.id].goles_visita !== undefined)
    );

    if (hayPronosticos) {
      console.log('✅ Hay pronósticos guardados, verificando si están completos...');
      setMostrarCalcularFinalistas(true);
    }

    // Verificar que todos los pronósticos de semifinal estén completos para calcular
    const todosPronosticosCompletos = partidosSemifinal.every(p => 
      pronosticos[p.id] && 
      pronosticos[p.id].goles_local !== undefined && 
      pronosticos[p.id].goles_visita !== undefined
    );

    if (!todosPronosticosCompletos) {
      console.log('⚠️ No todos los pronósticos están completos, esperando...');
      return;
    }

    // Calcular ganadores basados en PRONÓSTICOS del usuario
    const ganadores = [];
    
    // Separar IDA y VUELTA
    const partidosIda = [partidosSemifinal[0], partidosSemifinal[2]];
    const partidosVuelta = [partidosSemifinal[1], partidosSemifinal[3]];
    
    partidosIda.forEach((ida, index) => {
      const vuelta = partidosVuelta[index];
      
      console.log(`\n🏟️ Semifinal ${index + 1}:`);
      console.log(`  IDA: ${ida.local} vs ${ida.visita}`);
      console.log(`  VUELTA: ${vuelta.local} vs ${vuelta.visita}`);
      
      // Obtener pronósticos o valores por defecto
      const golesIdaLocal = Number(pronosticos[ida.id]?.goles_local ?? 0);
      const golesIdaVisita = Number(pronosticos[ida.id]?.goles_visita ?? 0);
      const golesVueltaLocal = Number(pronosticos[vuelta.id]?.goles_local ?? 0);
      const golesVueltaVisita = Number(pronosticos[vuelta.id]?.goles_visita ?? 0);
      
      console.log(`  Pronóstico IDA: ${golesIdaLocal}-${golesIdaVisita}`);
      console.log(`  Pronóstico VUELTA: ${golesVueltaLocal}-${golesVueltaVisita}`);
      
      // Penales si existen
      const penalesVueltaLocal = Number(pronosticos[vuelta.id]?.penales_local ?? 0);
      const penalesVueltaVisita = Number(pronosticos[vuelta.id]?.penales_visita ?? 0);
      
      // Calcular marcador global
      const golesEquipoLocal = golesIdaLocal + golesVueltaVisita;
      const golesEquipoVisita = golesIdaVisita + golesVueltaLocal;
      
      console.log(`  Marcador global: ${ida.local} ${golesEquipoLocal} - ${golesEquipoVisita} ${ida.visita}`);
      
      let ganador = null;
      
      if (golesEquipoLocal > golesEquipoVisita) {
        ganador = ida.local;
      } else if (golesEquipoVisita > golesEquipoLocal) {
        ganador = ida.visita;
      } else {
        // Empate - revisar penales
        if (penalesVueltaLocal > 0 || penalesVueltaVisita > 0) {
          ganador = penalesVueltaLocal > penalesVueltaVisita ? vuelta.local : vuelta.visita;
          console.log(`  Definido por penales: ${penalesVueltaLocal}-${penalesVueltaVisita}`);
        } else {
          // Si no hay penales, poner al equipo local por defecto
          ganador = ida.local;
          console.log(`  ⚠️ Empate sin penales - ganador por defecto: ${ganador}`);
        }
      }
      
      console.log(`  ✅ Ganador: ${ganador}`);
      
      if (ganador) {
        ganadores.push(ganador);
      }
    });
    
    console.log('\n🎯 Finalistas calculados:', ganadores);
    
    // Buscar el partido de la final (siempre el último partido)
    const partidoFinalEncontrado = partidos[partidos.length - 1];
    console.log('🏆 Partido final encontrado:', partidoFinalEncontrado);
    
    setEquiposFinalistasPronosticados(ganadores);
    setPartidoFinal(partidoFinalEncontrado);
  }, [jornadaSeleccionada, partidos, pronosticos]);

  const handleChange = (partidoId, campo, valor) => {
    setPronosticos((prev) => ({
      ...prev,
      [partidoId]: {
        ...prev[partidoId],
        [campo]: valor,
      },
    }));
  };

  const handleChangeFinal = (campo, valor) => {
    setPronosticoFinal(prev => ({
      ...prev,
      [campo]: valor
    }));
  };

  const generarAleatorioTodos = () => {
    const nuevosPronosticos = {};
    partidos.forEach(partido => {
      nuevosPronosticos[partido.id] = {
        goles_local: Math.floor(Math.random() * 5), // 0 a 4
        goles_visita: Math.floor(Math.random() * 5), // 0 a 4
      };
    });
    setPronosticos(nuevosPronosticos);
  };

  const generarAzarTodasJornadas = async () => {
    if (!confirm('¿Completar con pronósticos aleatorios TODAS las jornadas vacías (1-30)?\n\n✅ Solo se rellenarán las jornadas que NO tengan pronósticos.')) {
      return;
    }

    try {
      setMensaje("⏳ Generando pronósticos aleatorios...");
      const token = localStorage.getItem("token");
      let jornadasCompletadas = 0;
      let jornadasOmitidas = 0;
      
      // Iterar sobre todas las jornadas (1 a 30)
      for (let numeroJornada = 1; numeroJornada <= 30; numeroJornada++) {
        // Obtener el ID de la jornada
        const jornadaObj = jornadas.find(j => j.numero === numeroJornada);
        if (!jornadaObj) {
          console.warn(`⚠️ No se encontró jornada ${numeroJornada}`);
          continue;
        }

        // Verificar si ya tiene pronósticos
        const responsePronosticosExistentes = await fetch(`${API_BASE_URL}/api/pronosticos/${numeroJornada}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const pronosticosExistentes = await responsePronosticosExistentes.json();
        
        if (pronosticosExistentes && pronosticosExistentes.length > 0) {
          console.log(`⏭️ Jornada ${numeroJornada} ya tiene pronósticos, omitiendo...`);
          jornadasOmitidas++;
          continue;
        }

        // Cargar partidos de esta jornada
        const responsePartidos = await fetch(`${API_BASE_URL}/api/jornadas/${numeroJornada}/partidos`);
        const partidosJornada = await responsePartidos.json();
        
        if (!partidosJornada || partidosJornada.length === 0) {
          console.warn(`⚠️ No hay partidos en jornada ${numeroJornada}`);
          continue;
        }

        // Generar y guardar pronósticos individualmente para cada partido
        for (const partido of partidosJornada) {
          const response = await fetch(`${API_BASE_URL}/api/pronosticos`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              partido_id: partido.id,
              jornada_id: jornadaObj.id,
              goles_local: Math.floor(Math.random() * 5),
              goles_visita: Math.floor(Math.random() * 5)
            }),
          });

          if (!response.ok) {
            console.error(`❌ Error al guardar partido ${partido.id} de jornada ${numeroJornada}`);
          }
        }

        jornadasCompletadas++;
        console.log(`✅ Jornada ${numeroJornada} completada`);
      }

      setMensaje(`✅ Completadas ${jornadasCompletadas} jornadas con pronósticos aleatorios${jornadasOmitidas > 0 ? ` (${jornadasOmitidas} omitidas por tener pronósticos previos)` : ''}`);
      
      // Recargar pronósticos de la jornada actual
      if (jornadaSeleccionada) {
        const responsePronosticos = await fetch(`${API_BASE_URL}/api/pronosticos/${jornadaSeleccionada}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const pronosticosDb = await responsePronosticos.json();
        const map = {};
        pronosticosDb.forEach(pr => {
          map[pr.partido_id] = {
            goles_local: pr.goles_local,
            goles_visita: pr.goles_visita,
          };
        });
        setPronosticos(map);
      }
    } catch (error) {
      console.error('Error al generar azar todas las jornadas:', error);
      setMensaje("❌ Error al generar pronósticos aleatorios");
    }
  };

  const resetearTodos = () => {
    const nuevosPronosticos = {};
    partidos.forEach(partido => {
      nuevosPronosticos[partido.id] = {
        goles_local: 0,
        goles_visita: 0,
      };
    });
    setPronosticos(nuevosPronosticos);
  };

  const handleEnviar = async () => {
    if (cerrada) return; // Seguridad extra
    try {
      setMensaje("");
      const token = localStorage.getItem("token");

      // Usamos jornadaIdSeleccionada
      if (!jornadaIdSeleccionada) {
        setMensaje("❌ Error interno: no se pudo determinar el ID de la jornada");
        return;
      }

      // Para jornada 10, validar que se hayan pronosticado las semifinales y la final
      if (jornadaSeleccionada === 10) {
        const partidosSemifinal = partidos.filter((p, index) => index < 4);
        const todosSemifinalesCompletos = partidosSemifinal.every(p => 
          pronosticos[p.id]?.goles_local !== undefined && 
          pronosticos[p.id]?.goles_visita !== undefined
        );
        
        if (!todosSemifinalesCompletos) {
          setMensaje("❌ Debes completar todos los pronósticos de semifinales");
          return;
        }
        
        if (!pronosticoFinal.goles_local && pronosticoFinal.goles_local !== 0) {
          setMensaje("❌ Debes completar el pronóstico de la final");
          return;
        }
      }

      const respuestas = await Promise.all(
        partidos
          .filter((partido, index) => {
            // En jornada 10, solo guardar semifinales si no hay finalistas calculados
            // O guardar todo si ya hay finalistas
            if (jornadaSeleccionada === 10) {
              return index < 4 || equiposFinalistasPronosticados.length === 2;
            }
            return true;
          })
          .map((partido, index) => {
          // Para jornada 10, si es la final (último partido), usar pronosticoFinal
          const esLaFinal = jornadaSeleccionada === 10 && equiposFinalistasPronosticados.length === 2 && partidos.indexOf(partido) === partidos.length - 1;
          
          return fetch(`${API_BASE_URL}/api/pronosticos`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              partido_id: partido.id,
              jornada_id: jornadaIdSeleccionada,
              goles_local: esLaFinal ? Number(pronosticoFinal.goles_local ?? 0) : Number(pronosticos[partido.id]?.goles_local ?? 0),
              goles_visita: esLaFinal ? Number(pronosticoFinal.goles_visita ?? 0) : Number(pronosticos[partido.id]?.goles_visita ?? 0),
              penales_local: esLaFinal && pronosticoFinal.penales_local ? Number(pronosticoFinal.penales_local) : null,
              penales_visita: esLaFinal && pronosticoFinal.penales_visita ? Number(pronosticoFinal.penales_visita) : null
            }),
          });
        })
      );
      const todosOk = respuestas.every((r) => r.ok);
      
      if (todosOk) {
        if (jornadaSeleccionada === 10 && equiposFinalistasPronosticados.length === 0) {
          setMensaje("✅ Semifinales guardadas. Ahora calcula tus finalistas.");
        } else {
          setMensaje("✅ Pronósticos guardados correctamente");
        }
      } else {
        setMensaje("❌ Error al guardar algunos pronósticos");
      }
    } catch (err) {
      setMensaje("❌ Error al enviar pronósticos");
    }
  };

  if (!usuario) return <p className="text-center mt-5">Cargando...</p>;

  return (
    <div className="container mt-4">
      <h2>📅 Ingresar Pronósticos</h2>
      <AccesosDirectos />
      <CuentaRegresivaGlobal />
      <JornadaSelector
        jornadas={jornadas}
        onSelect={setJornadaSeleccionada}
      />

      {jornadaSeleccionada && (
        <>
          <h5 className="mt-4 mb-3">Jornada {jornadaSeleccionada}</h5>

          {cerrada && (
            <div className="alert alert-danger mb-3">
              <strong>Esta jornada está cerrada.</strong> Ya no puedes modificar tus pronósticos.
            </div>
          )}

          {loading ? (
            <div className="text-center">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Cargando...</span>
              </div>
              <p className="mt-2">Cargando partidos...</p>
            </div>
          ) : (
            <>
              <div className="row g-3">
                {partidos
                  .filter((p, index) => jornadaSeleccionada !== 10 || index < 4) // En J10 solo mostrar semifinales
                  .map((p) => {
                    const esBonus2 = p.bonus === 2;
                    const esBonus3 = p.bonus === 3;
                    const tieneBonus = esBonus2 || esBonus3;
                    
                    return (
                      <div key={p.id} className="col-12">
                        <div 
                          className={`card shadow-sm h-100 ${esBonus2 ? 'border-warning border-3' : ''} ${esBonus3 ? 'border-danger border-3' : ''}`}
                          style={esBonus2 ? { backgroundColor: '#fff9e6' } : esBonus3 ? { backgroundColor: '#ffe6e6' } : {}}
                        >
                          <div className="card-body">
                            {/* Badge de Bonus */}
                            {esBonus2 && (
                              <div className="text-center mb-3">
                                <span className="badge bg-warning text-dark fs-5 px-4 py-2">
                                  ⚡ PARTIDO BONUS x2 ⚡
                                </span>
                              </div>
                            )}
                            {esBonus3 && (
                              <div className="text-center mb-3">
                                <span className="badge bg-danger text-white fs-5 px-4 py-2">
                                  🔥 PARTIDO BONUS x3 🔥
                                </span>
                              </div>
                            )}
                            
                            <div className="row align-items-center text-center">
                            <div className="col-5">
                              {getLogoEquipo(p.local) && (
                                <img 
                                  src={getLogoEquipo(p.local)} 
                                  alt={p.local}
                                  className="mb-2"
                                  style={{ width: '60px', height: '60px', objectFit: 'contain' }}
                                />
                              )}
                              <p className="fw-bold mb-2 fs-5">{p.local}</p>
                              <input
                                type="number"
                                min="0"
                                className="form-control form-control-lg text-center fw-bold"
                                style={{ MozAppearance: 'textfield' }}
                                value={pronosticos[p.id]?.goles_local ?? ""}
                                onChange={(e) => handleChange(p.id, "goles_local", e.target.value)}
                                disabled={cerrada}
                                placeholder="0"
                              />
                            </div>

                            <div className="col-2">
                              <p className="fw-bold text-muted fs-3 mb-0">VS</p>
                            </div>

                            <div className="col-5">
                              {getLogoEquipo(p.visita) && (
                                <img 
                                  src={getLogoEquipo(p.visita)} 
                                  alt={p.visita}
                                  className="mb-2"
                                  style={{ width: '60px', height: '60px', objectFit: 'contain' }}
                                />
                              )}
                              <p className="fw-bold mb-2 fs-5">{p.visita}</p>
                              <input
                                type="number"
                                min="0"
                                className="form-control form-control-lg text-center fw-bold"
                                style={{ MozAppearance: 'textfield' }}
                                value={pronosticos[p.id]?.goles_visita ?? ""}
                                onChange={(e) => handleChange(p.id, "goles_visita", e.target.value)}
                                disabled={cerrada}
                                placeholder="0"
                              />
                            </div>
                          </div>

                          {/* Mostrar resultado si existe */}
                          {p.goles_local !== null && p.goles_visita !== null && (
                            <div className="text-center mt-3">
                              <span className="badge bg-success fs-6">
                                Resultado: {p.goles_local} - {p.goles_visita}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sección especial para Jornada 10 - Botón Calcular y Finalistas */}
              {jornadaSeleccionada === 10 && partidos.length === 5 && mostrarCalcularFinalistas && equiposFinalistasPronosticados.length === 0 && (
                <div className="alert alert-info mt-4">
                  <h6 className="fw-bold">📊 Paso siguiente:</h6>
                  <p className="mb-2">Ya guardaste tus pronósticos de semifinales. Completa todos los pronósticos y luego haz clic en el botón de abajo para ver quiénes serán tus finalistas.</p>
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      console.log('🔄 Forzando recálculo de finalistas...');
                      // Forzar recálculo actualizando el estado
                      setPronosticos(prev => ({...prev}));
                    }}
                  >
                    🔄 Calcular Finalistas
                  </button>
                </div>
              )}

              {jornadaSeleccionada === 10 && equiposFinalistasPronosticados.length === 2 && (
                <>
                  <div className="alert alert-success mt-4 mb-3">
                    <h5 className="fw-bold mb-3">🎯 Tus Finalistas Pronosticados</h5>
                    <p className="small mb-3">Basado en tus pronósticos de semifinales</p>
                    <div className="row g-3">
                      {equiposFinalistasPronosticados.map((equipo, index) => (
                        <div key={index} className="col-6 text-center">
                          <span className="badge bg-success mb-2">Finalista {index + 1}</span>
                          {getLogoEquipo(equipo) && (
                            <div>
                              <img 
                                src={getLogoEquipo(equipo)} 
                                alt={equipo}
                                style={{ width: '80px', height: '80px', objectFit: 'contain' }}
                              />
                            </div>
                          )}
                          <p className="fw-bold fs-4 mb-0">{equipo}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card de Partido Final */}
                  <div className="card border-warning border-3 shadow">
                    <div className="card-header bg-warning bg-opacity-25 text-center">
                      <h5 className="fw-bold mb-0">🏆 PARTIDO FINAL</h5>
                    </div>
                    <div className="card-body">
                      <p className="fw-bold fs-4 text-center mb-4">
                        {equiposFinalistasPronosticados[0]} <span className="text-muted">vs</span> {equiposFinalistasPronosticados[1]}
                      </p>

                      <div className="row g-3 align-items-center text-center">
                        <div className="col-5">
                          {getLogoEquipo(equiposFinalistasPronosticados[0]) && (
                            <img 
                              src={getLogoEquipo(equiposFinalistasPronosticados[0])} 
                              alt={equiposFinalistasPronosticados[0]}
                              className="mb-2"
                              style={{ width: '60px', height: '60px', objectFit: 'contain' }}
                            />
                          )}
                          <label className="form-label fw-bold">{equiposFinalistasPronosticados[0]}</label>
                          <input
                            type="number"
                            className="form-control form-control-lg text-center fw-bold"
                            style={{ MozAppearance: 'textfield' }}
                            placeholder="0"
                            value={pronosticoFinal.goles_local ?? ""}
                            onChange={(e) => handleChangeFinal("goles_local", e.target.value)}
                            disabled={cerrada}
                            min="0"
                          />
                        </div>
                        <div className="col-2">
                          <p className="fw-bold text-muted fs-3 mb-0">VS</p>
                        </div>
                        <div className="col-5">
                          {getLogoEquipo(equiposFinalistasPronosticados[1]) && (
                            <img 
                              src={getLogoEquipo(equiposFinalistasPronosticados[1])} 
                              alt={equiposFinalistasPronosticados[1]}
                              className="mb-2"
                              style={{ width: '60px', height: '60px', objectFit: 'contain' }}
                            />
                          )}
                          <label className="form-label fw-bold">{equiposFinalistasPronosticados[1]}</label>
                          <input
                            type="number"
                            className="form-control form-control-lg text-center fw-bold"
                            style={{ MozAppearance: 'textfield' }}
                            placeholder="0"
                            value={pronosticoFinal.goles_visita ?? ""}
                            onChange={(e) => handleChangeFinal("goles_visita", e.target.value)}
                            disabled={cerrada}
                            min="0"
                          />
                        </div>
                      </div>

                      {/* Mostrar inputs de penales si hay empate */}
                      {pronosticoFinal.goles_local !== "" && 
                       pronosticoFinal.goles_visita !== "" && 
                       Number(pronosticoFinal.goles_local) === Number(pronosticoFinal.goles_visita) && (
                        <div className="mt-4">
                          <div className="alert alert-warning py-2 mb-3">
                            <small className="fw-bold">⚠️ Empate detectado - Debes ingresar el resultado de los penales</small>
                          </div>
                          <div className="row g-3">
                            <div className="col-6">
                              <label className="form-label small fw-bold">Penales {equiposFinalistasPronosticados[0]}</label>
                              <input
                                type="number"
                                min="0"
                                className="form-control form-control-sm text-center border-danger"
                                placeholder="0"
                                value={pronosticoFinal.penales_local ?? ""}
                                onChange={(e) => handleChangeFinal("penales_local", e.target.value)}
                                disabled={cerrada}
                              />
                            </div>
                            <div className="col-6">
                              <label className="form-label small fw-bold">Penales {equiposFinalistasPronosticados[1]}</label>
                              <input
                                type="number"
                                min="0"
                                className="form-control form-control-sm text-center border-danger"
                                placeholder="0"
                                value={pronosticoFinal.penales_visita ?? ""}
                                onChange={(e) => handleChangeFinal("penales_visita", e.target.value)}
                                disabled={cerrada}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {partidos.length > 0 && !cerrada && (
            <div className="text-center d-flex gap-3 justify-content-center flex-wrap mt-4">
              <button className="btn btn-outline-warning btn-lg px-4" onClick={generarAzarTodasJornadas}>
                🎲✨ Azar 30 Jornadas
              </button>
              <button className="btn btn-outline-info btn-lg px-4" onClick={generarAleatorioTodos}>
                🎲 Azar Jornada {jornadaSeleccionada}
              </button>
              <button className="btn btn-outline-secondary btn-lg px-4" onClick={resetearTodos}>
                🔄 Resetear
              </button>
              <button className="btn btn-danger btn-lg px-5" onClick={handleEnviar}>
                💾 Guardar Pronósticos
              </button>
              <button
                className="btn btn-outline-secondary btn-lg"
                onClick={() => {
                  const jornadaActual = Number(jornadaSeleccionada);
                  setJornadaSeleccionada(String(jornadaActual - 1));
                }}
                disabled={Number(jornadaSeleccionada) <= 1}
              >
                ← Anterior
              </button>
              <button
                className="btn btn-outline-secondary btn-lg"
                onClick={() => {
                  const jornadaActual = Number(jornadaSeleccionada);
                  setJornadaSeleccionada(String(jornadaActual + 1));
                }}
                disabled={Number(jornadaSeleccionada) >= jornadas.length}
              >
                Siguiente →
              </button>
            </div>
          )}
          
          {partidos.length > 0 && cerrada && (
            <div className="mt-4">
              <button
                className="btn btn-secondary btn-lg w-100 fw-bold"
                disabled
              >
                🔒 Jornada Cerrada
              </button>
            </div>
          )}
          
          {mensaje && (
            <div className={`alert ${mensaje.includes('❌') ? 'alert-danger' : mensaje.includes('✅') ? 'alert-success' : 'alert-info'} mt-3 text-center fw-bold`}>
              {mensaje}
            </div>
          )}
        </>
      )}
    </div>
  );
}
