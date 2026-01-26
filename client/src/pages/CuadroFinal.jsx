import React, { useState, useEffect } from "react";
import AccesosDirectos from "../components/AccesosDirectos";
import CuentaRegresivaGlobal from "../components/CuentaRegresivaGlobal";
import useAuth from "../hooks/UseAuth";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function CuadroFinal() {
  const user = useAuth();
  
  const [predicciones, setPredicciones] = useState({
    campeon: "",      // 1° lugar
    subcampeon: "",  // 2° lugar
    tercero: "",     // 3° lugar
    cuarto: "",      // 4° lugar
    quinto: "",      // 5° lugar
    sexto: "",       // 6° lugar
    quinceto: "",    // 15° lugar - Desciende
    dieciseisavo: "", // 16° lugar - Desciende
    copa_chile: "",  // Campeón Copa Chile
    copa_liga: "",   // Campeón Copa de la Liga
    goleador: ""     // Goleador del torneo
  });

  const [equiposDisponibles, setEquiposDisponibles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [jornadaCerrada, setJornadaCerrada] = useState(false);
  const [todosLosPronosticos, setTodosLosPronosticos] = useState([]);

  const equipos = [
    "Colo Colo", "Universidad de Chile", "Universidad Católica", "Palestino",
    "Cobresal", "Everton", "Audax Italiano", "Deportes Iquique",
    "Ñublense", "Huachipato", "Unión La Calera", "Coquimbo Unido",
    "Unión Española", "La Serena", "Deportes Limache", "O'Higgins"
  ];

  const equiposPrimeraB = [
    "Santiago Morning", "Deportes Recoleta", "Deportes Santa Cruz",
    "Rangers", "San Luis", "Deportes Temuco", "Magallanes",
    "Deportes Concepción", "Santiago Wanderers", "Cobreloa",
    "Antofagasta", "Fernández Vial", "Provincial Osorno",
    "Deportes Copiapó", "San Marcos de Arica", "Deportes Melipilla"
  ];

  const goleadores = [
    "Sebastián Sáez (Unión La Calera)",
    "Diego Coelho (Cobresal)",
    "Daniel Castro (Deportes Limache)",
    "Lucas Di Yorio (Universidad de Chile)",
    "Rodrigo Contreras (Universidad de Chile)",
    "Javier Correa (Colo Colo)",
    "Lionel Altamirano (Huachipato)",
    "Leonardo Valencia (Audax Italiano)",
    "Fernando Zampedri (Universidad Católica)"
  ];

  useEffect(() => {
    if (!user) {
      return;
    }
    
    // Solo permitir acceso si está explícitamente en true
    if (user.activo_torneo_nacional !== true) {
      console.log('🚫 Usuario sin acceso a Torneo Nacional:', user);
      alert("⚠️ No tienes acceso para ingresar pronósticos en el Torneo Nacional. Contacta al administrador.");
      window.location.href = "/";
      return;
    }
    
    cargarPredicciones();
    verificarEstadoJornada();
  }, [user]);

  // Verificar si la jornada 999 (Cuadro Final) está cerrada
  const verificarEstadoJornada = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/jornadas`);
      if (response.ok) {
        const jornadas = await response.json();
        const jornadaCuadroFinal = jornadas.find(j => j.numero === 999);
        const estaCerrada = jornadaCuadroFinal?.cerrada === true;
        setJornadaCerrada(estaCerrada);
        
        // Si está cerrada, cargar todos los pronósticos para mostrar
        if (estaCerrada) {
          cargarTodosLosPronosticos();
        }
      }
    } catch (error) {
      console.error("Error verificando estado de jornada:", error);
    }
  };

  // Cargar todos los pronósticos cuando esté cerrado
  const cargarTodosLosPronosticos = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/predicciones-finales/todos`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setTodosLosPronosticos(data);
      }
    } catch (error) {
      console.error("Error cargando todos los pronósticos:", error);
    }
  };

  useEffect(() => {
    // Actualizar equipos disponibles cuando cambian las predicciones
    const equiposSeleccionados = Object.values(predicciones).filter(
      (equipo, index) => index < 10 && equipo !== ""
    );
    setEquiposDisponibles(equipos.filter(equipo => !equiposSeleccionados.includes(equipo)));
  }, [predicciones]);

  const cargarPredicciones = async () => {
    if (!user?.id) return;
    
    const token = localStorage.getItem("token");
    if (!token) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/predicciones-finales/${user.id}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setPredicciones({
            campeon: data.campeon || "",
            subcampeon: data.subcampeon || "",
            tercero: data.tercero || "",
            cuarto: data.cuarto || "",
            quinto: data.quinto || "",
            sexto: data.sexto || "",
            quinceto: data.quinceto || "",
            dieciseisavo: data.dieciseisavo || "",
            copa_chile: data.copa_chile || "",
            copa_liga: data.copa_liga || "",
            goleador: data.goleador || ""
          });
        }
      } else if (response.status === 404) {
        // No hay predicciones guardadas, esto es normal para nuevos usuarios
        console.log("No hay predicciones guardadas para este usuario");
      } else {
        console.error("Error cargando predicciones:", response.status);
      }
    } catch (error) {
      console.error("Error cargando predicciones:", error);
    }
  };

  const handleChange = (field, value) => {
    setPredicciones(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getEquiposParaCampo = (campo) => {
    // Los campeones de copas pueden repetirse con posiciones de tabla
    const camposPosiciones = ['campeon', 'subcampeon', 'tercero', 'cuarto', 'quinto', 'sexto', 'quinceto', 'dieciseisavo'];
    const camposCopas = ['copa_chile', 'copa_liga'];
    
    let equiposSeleccionados = [];
    
    if (camposPosiciones.includes(campo)) {
      // Si es una posición de tabla, excluir solo otras posiciones (no las copas)
      equiposSeleccionados = Object.entries(predicciones)
        .filter(([key, value]) => key !== campo && camposPosiciones.includes(key) && value !== "")
        .map(([key, value]) => value);
    } else if (camposCopas.includes(campo)) {
      // Si es una copa, NO excluir nada (pueden repetirse con posiciones y entre ellas)
      equiposSeleccionados = [];
    }
    
    return equipos.filter(equipo => !equiposSeleccionados.includes(equipo));
  };

  const guardarPredicciones = async () => {
    if (!user?.id) {
      setMessage("Debes estar logueado para guardar predicciones");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("No se encontró token de autenticación. Por favor, inicia sesión nuevamente.");
      return;
    }

    // Validar que todos los campos estén llenos
    const camposVacios = Object.entries(predicciones).filter(([key, value]) => value === "");
    if (camposVacios.length > 0) {
      setMessage("Debes completar todos los campos");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/predicciones-finales`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          jugador_id: user.id,
          ...predicciones
        })
      });

      if (response.ok) {
        setMessage("Predicciones guardadas exitosamente");
      } else {
        const errorData = await response.text();
        console.error("Error response:", errorData);
        if (response.status === 403) {
          setMessage("Error de autenticación. Por favor, inicia sesión nuevamente.");
        } else {
          setMessage(`Error al guardar predicciones: ${response.status}`);
        }
      }
    } catch (error) {
      console.error("Error:", error);
      setMessage("Error al guardar predicciones");
    } finally {
      setLoading(false);
    }
  };

  const limpiarDatos = () => {
    if (confirm("¿Estás seguro de que quieres limpiar todos los datos? Esta acción no se puede deshacer.")) {
      setPredicciones({
        campeon: "",
        subcampeon: "",
        tercero: "",
        cuarto: "",
        quinto: "",
        sexto: "",
        quinceto: "",
        dieciseisavo: "",
        copa_chile: "",
        copa_liga: "",
        goleador: ""
      });
      setMessage("Datos limpiados exitosamente");
    }
  };

  return (
    <div className="container mt-4">
      <AccesosDirectos />
      <CuentaRegresivaGlobal />
      <h2 className="text-center mb-4">🏆 Predicciones Cuadro Final</h2>
      
      {/* Tabla de Puntajes */}
      <div className="card mb-4">
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">📊 Tabla de Puntajes</h5>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-bordered table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Posición</th>
                  <th>Puntos</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>🥇 1° Lugar (Campeón)</strong></td>
                  <td className="text-center"><span className="badge bg-success">15 pts</span></td>
                </tr>
                <tr>
                  <td><strong>🥈 2° Lugar</strong></td>
                  <td className="text-center"><span className="badge bg-info">10 pts</span></td>
                </tr>
                <tr>
                  <td><strong>⚽ Goleador</strong></td>
                  <td className="text-center"><span className="badge bg-warning text-dark">6 pts</span></td>
                </tr>
                <tr>
                  <td>🥉 3° Lugar</td>
                  <td className="text-center"><span className="badge bg-secondary">5 pts</span></td>
                </tr>
                <tr>
                  <td>4° Lugar</td>
                  <td className="text-center"><span className="badge bg-secondary">5 pts</span></td>
                </tr>
                <tr>
                  <td>5° Lugar</td>
                  <td className="text-center"><span className="badge bg-secondary">5 pts</span></td>
                </tr>
                <tr>
                  <td>6° Lugar</td>
                  <td className="text-center"><span className="badge bg-secondary">5 pts</span></td>
                </tr>
                <tr>
                  <td>🔻 15° Lugar (Desciende)</td>
                  <td className="text-center"><span className="badge bg-secondary">5 pts</span></td>
                </tr>
                <tr>
                  <td>🔻 16° Lugar (Desciende)</td>
                  <td className="text-center"><span className="badge bg-secondary">5 pts</span></td>
                </tr>
                <tr>
                  <td>🏆 Campeón Copa Chile</td>
                  <td className="text-center"><span className="badge bg-secondary">5 pts</span></td>
                </tr>
                <tr>
                  <td>🏆 Campeón Copa de la Liga</td>
                  <td className="text-center"><span className="badge bg-secondary">5 pts</span></td>
                </tr>
              </tbody>
              <tfoot className="table-light">
                <tr>
                  <td><strong>Total Máximo</strong></td>
                  <td className="text-center"><strong>66 puntos</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
      
      {jornadaCerrada && (
        <div className="alert alert-info text-center mb-4">
          <strong>📋 Cuadro Final Cerrado</strong><br />
          Visualiza todos los pronósticos realizados por los participantes.
        </div>
      )}
      
      {message && (
        <div className={`alert ${message.includes("exitosamente") ? "alert-success" : "alert-danger"} text-center`}>
          {message}
        </div>
      )}

      {jornadaCerrada ? (
        // Vista de solo lectura con todos los pronósticos
        <div className="row">
          {todosLosPronosticos.map((pronostico, index) => (
            <div key={index} className="col-md-6 col-lg-4 mb-4">
              <div className="card">
                <div className="card-header bg-primary text-white text-center">
                  <div className="d-flex align-items-center justify-content-center">
                    {pronostico.foto_perfil && (
                      <img 
                        src={`/perfil/${pronostico.foto_perfil}`} 
                        alt={pronostico.jugador_nombre}
                        className="rounded-circle me-2"
                        style={{width: '30px', height: '30px', objectFit: 'cover'}}
                      />
                    )}
                    <strong>{pronostico.jugador_nombre}</strong>
                  </div>
                </div>
                <div className="card-body">
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <tbody>
                        <tr><td className="fw-bold">🥇 1° Lugar:</td><td>{pronostico.campeon}</td></tr>
                        <tr><td className="fw-bold">🥈 2° Lugar:</td><td>{pronostico.subcampeon}</td></tr>
                        <tr><td className="fw-bold">🥉 3° Lugar:</td><td>{pronostico.tercero}</td></tr>
                        <tr><td className="fw-bold">4️⃣ 4° Lugar:</td><td>{pronostico.cuarto}</td></tr>
                        <tr><td className="fw-bold">5️⃣ 5° Lugar:</td><td>{pronostico.quinto}</td></tr>
                        <tr><td className="fw-bold">6️⃣ 6° Lugar:</td><td>{pronostico.sexto}</td></tr>
                        <tr><td className="fw-bold">🔻 15° (Desciende):</td><td>{pronostico.quinceto}</td></tr>
                        <tr><td className="fw-bold">🔻 16° (Desciende):</td><td>{pronostico.dieciseisavo}</td></tr>
                        <tr><td className="fw-bold">🏆 Campeón Copa Chile:</td><td>{pronostico.copa_chile}</td></tr>
                        <tr><td className="fw-bold">🏆 Campeón Copa Liga:</td><td>{pronostico.copa_liga}</td></tr>
                        <tr><td className="fw-bold">⚽ Goleador:</td><td>{pronostico.goleador}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Vista de edición (formulario original)
        <>
      
      <div className="table-responsive">
        <table className="table table-bordered align-middle text-center">
          <thead className="table-dark">
            <tr>
              <th colSpan="6" style={{backgroundColor: "#0066cc"}}>TABLA DE POSICIONES</th>
              <th colSpan="2" style={{backgroundColor: "#dc3545"}}>DESCIENDEN</th>
              <th colSpan="2" style={{backgroundColor: "#28a745"}}>COPAS</th>
              <th style={{backgroundColor: "#ffc107", color: "#000"}}>GOLEADOR</th>
            </tr>
            <tr>
              <th>1° LUGAR<br/>🥇</th>
              <th>2° LUGAR<br/>🥈</th>
              <th>3° LUGAR<br/>🥉</th>
              <th>4° LUGAR</th>
              <th>5° LUGAR</th>
              <th>6° LUGAR</th>
              <th>15° LUGAR<br/>🔻</th>
              <th>16° LUGAR<br/>🔻</th>
              <th>COPA<br/>CHILE<br/>🏆</th>
              <th>COPA<br/>LIGA<br/>🏆</th>
              <th>⚽</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.campeon}
                  onChange={(e) => handleChange('campeon', e.target.value)}
                  disabled={jornadaCerrada}
                >
                  <option value="">Seleccionar...</option>
                  {predicciones.campeon && <option value={predicciones.campeon}>{predicciones.campeon}</option>}
                  {getEquiposParaCampo('campeon').map(equipo => (
                    <option key={equipo} value={equipo}>{equipo}</option>
                  ))}
                </select>
              </td>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.subcampeon}
                  onChange={(e) => handleChange('subcampeon', e.target.value)}
                  disabled={jornadaCerrada}
                >
                  <option value="">Seleccionar...</option>
                  {predicciones.subcampeon && <option value={predicciones.subcampeon}>{predicciones.subcampeon}</option>}
                  {getEquiposParaCampo('subcampeon').map(equipo => (
                    <option key={equipo} value={equipo}>{equipo}</option>
                  ))}
                </select>
              </td>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.tercero}
                  onChange={(e) => handleChange('tercero', e.target.value)}
                  disabled={jornadaCerrada}
                >
                  <option value="">Seleccionar...</option>
                  {predicciones.tercero && <option value={predicciones.tercero}>{predicciones.tercero}</option>}
                  {getEquiposParaCampo('tercero').map(equipo => (
                    <option key={equipo} value={equipo}>{equipo}</option>
                  ))}
                </select>
              </td>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.cuarto}
                  onChange={(e) => handleChange('cuarto', e.target.value)}
                  disabled={jornadaCerrada}
                >
                  <option value="">Seleccionar...</option>
                  {predicciones.cuarto && <option value={predicciones.cuarto}>{predicciones.cuarto}</option>}
                  {getEquiposParaCampo('cuarto').map(equipo => (
                    <option key={equipo} value={equipo}>{equipo}</option>
                  ))}
                </select>
              </td>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.quinto}
                  onChange={(e) => handleChange('quinto', e.target.value)}
                  disabled={jornadaCerrada}
                >
                  <option value="">Seleccionar...</option>
                  {predicciones.quinto && <option value={predicciones.quinto}>{predicciones.quinto}</option>}
                  {getEquiposParaCampo('quinto').map(equipo => (
                    <option key={equipo} value={equipo}>{equipo}</option>
                  ))}
                </select>
              </td>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.sexto}
                  onChange={(e) => handleChange('sexto', e.target.value)}
                  disabled={jornadaCerrada}
                >
                  <option value="">Seleccionar...</option>
                  {predicciones.sexto && <option value={predicciones.sexto}>{predicciones.sexto}</option>}
                  {getEquiposParaCampo('sexto').map(equipo => (
                    <option key={equipo} value={equipo}>{equipo}</option>
                  ))}
                </select>
              </td>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.quinceto}
                  onChange={(e) => handleChange('quinceto', e.target.value)}
                  disabled={jornadaCerrada}
                >
                  <option value="">Seleccionar...</option>
                  {predicciones.quinceto && <option value={predicciones.quinceto}>{predicciones.quinceto}</option>}
                  {getEquiposParaCampo('quinceto').map(equipo => (
                    <option key={equipo} value={equipo}>{equipo}</option>
                  ))}
                </select>
              </td>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.dieciseisavo}
                  onChange={(e) => handleChange('dieciseisavo', e.target.value)}
                  disabled={jornadaCerrada}
                >
                  <option value="">Seleccionar...</option>
                  {predicciones.dieciseisavo && <option value={predicciones.dieciseisavo}>{predicciones.dieciseisavo}</option>}
                  {getEquiposParaCampo('dieciseisavo').map(equipo => (
                    <option key={equipo} value={equipo}>{equipo}</option>
                  ))}
                </select>
              </td>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.copa_chile}
                  onChange={(e) => handleChange('copa_chile', e.target.value)}
                  disabled={jornadaCerrada}
                >
                  <option value="">Seleccionar...</option>
                  {predicciones.copa_chile && <option value={predicciones.copa_chile}>{predicciones.copa_chile}</option>}
                  {getEquiposParaCampo('copa_chile').map(equipo => (
                    <option key={equipo} value={equipo}>{equipo}</option>
                  ))}
                </select>
              </td>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.copa_liga}
                  onChange={(e) => handleChange('copa_liga', e.target.value)}
                  disabled={jornadaCerrada}
                >
                  <option value="">Seleccionar...</option>
                  {predicciones.copa_liga && <option value={predicciones.copa_liga}>{predicciones.copa_liga}</option>}
                  {getEquiposParaCampo('copa_liga').map(equipo => (
                    <option key={equipo} value={equipo}>{equipo}</option>
                  ))}
                </select>
              </td>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.goleador}
                  onChange={(e) => handleChange('goleador', e.target.value)}
                  disabled={jornadaCerrada}
                >
                  <option value="">Seleccionar...</option>
                  {goleadores.map(goleador => (
                    <option key={goleador} value={goleador}>{goleador}</option>
                  ))}
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="text-center mt-4">
        <button 
          className="btn btn-success btn-lg me-3"
          onClick={guardarPredicciones}
          disabled={loading || jornadaCerrada}
        >
          {loading ? "Guardando..." : jornadaCerrada ? "Cuadro Final Cerrado" : "Guardar Pronósticos"}
        </button>
        
        <button 
          className="btn btn-outline-danger btn-lg"
          onClick={limpiarDatos}
          disabled={loading || jornadaCerrada}
        >
          Limpiar Datos
        </button>
      </div>
        </>
      )}
    </div>
  );
}
