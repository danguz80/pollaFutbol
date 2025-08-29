import React, { useState, useEffect } from "react";
import AccesosDirectos from "../components/AccesosDirectos";
import CuentaRegresivaGlobal from "../components/CuentaRegresivaGlobal";
import useAuth from "../hooks/UseAuth";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function CuadroFinal() {
  const user = useAuth();
  
  const [predicciones, setPredicciones] = useState({
    campeon: "",
    subcampeon: "",
    tercero: "",
    chile_4_lib: "",
    cuarto: "",
    quinto: "",
    sexto: "",
    septimo: "",
    quinceto: "",
    dieciseisavo: "",
    goleador: ""
  });

  const [equiposDisponibles, setEquiposDisponibles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const equipos = [
    "Colo Colo", "Universidad de Chile", "Universidad Católica", "Palestino",
    "Cobresal", "Everton", "Audax Italiano", "Deportes Iquique",
    "Ñublense", "Huachipato", "Unión La Calera", "Coquimbo Unido",
    "Unión Española", "La Serena", "Deportes Limache", "O'Higgins"
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
    cargarPredicciones();
  }, [user]);

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
            chile_4_lib: data.chile_4_lib || "",
            cuarto: data.cuarto || "",
            quinto: data.quinto || "",
            sexto: data.sexto || "",
            septimo: data.septimo || "",
            quinceto: data.quinceto || "",
            dieciseisavo: data.dieciseisavo || "",
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
    const equiposSeleccionados = Object.entries(predicciones)
      .filter(([key, value]) => key !== campo && key !== 'goleador' && value !== "")
      .map(([key, value]) => value);
    
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
        chile_4_lib: "",
        cuarto: "",
        quinto: "",
        sexto: "",
        septimo: "",
        quinceto: "",
        dieciseisavo: "",
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
      
      {message && (
        <div className={`alert ${message.includes("exitosamente") ? "alert-success" : "alert-danger"} text-center`}>
          {message}
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-bordered align-middle text-center">
          <thead className="table-dark">
            <tr>
              <th colSpan="4" style={{backgroundColor: "#28a745"}}>COPA LIBERTADORES</th>
              <th colSpan="4" style={{backgroundColor: "#17a2b8"}}>COPA SUDAMERICANA</th>
              <th colSpan="2" style={{backgroundColor: "#dc3545"}}>PRIMERA B</th>
              <th style={{backgroundColor: "#ffc107", color: "#000"}}>Goleador</th>
            </tr>
            <tr>
              <th>CAMPEÓN<br/>Chile 1</th>
              <th>SUB CAMPEÓN<br/>Chile 2</th>
              <th>TERCERO<br/>Chile 3</th>
              <th>CHILE 4<br/>Copa Chile</th>
              <th>CUARTO<br/>Chile 1</th>
              <th>QUINTO<br/>Chile 2</th>
              <th>SEXTO<br/>Chile 3</th>
              <th>SÉPTIMO<br/>Chile 4</th>
              <th>15vo</th>
              <th>16vo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.campeon}
                  onChange={(e) => handleChange('campeon', e.target.value)}
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
                  value={predicciones.chile_4_lib}
                  onChange={(e) => handleChange('chile_4_lib', e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {predicciones.chile_4_lib && <option value={predicciones.chile_4_lib}>{predicciones.chile_4_lib}</option>}
                  {getEquiposParaCampo('chile_4_lib').map(equipo => (
                    <option key={equipo} value={equipo}>{equipo}</option>
                  ))}
                </select>
              </td>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.cuarto}
                  onChange={(e) => handleChange('cuarto', e.target.value)}
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
                  value={predicciones.septimo}
                  onChange={(e) => handleChange('septimo', e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {predicciones.septimo && <option value={predicciones.septimo}>{predicciones.septimo}</option>}
                  {getEquiposParaCampo('septimo').map(equipo => (
                    <option key={equipo} value={equipo}>{equipo}</option>
                  ))}
                </select>
              </td>
              <td>
                <select 
                  className="form-select"
                  value={predicciones.quinceto}
                  onChange={(e) => handleChange('quinceto', e.target.value)}
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
                  value={predicciones.goleador}
                  onChange={(e) => handleChange('goleador', e.target.value)}
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
          disabled={loading}
        >
          {loading ? "Guardando..." : "Guardar Pronósticos"}
        </button>
        
        <button 
          className="btn btn-outline-danger btn-lg"
          onClick={limpiarDatos}
          disabled={loading}
        >
          Limpiar Datos
        </button>
      </div>
    </div>
  );
}
