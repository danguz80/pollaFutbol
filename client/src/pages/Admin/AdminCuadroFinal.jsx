import { useState, useEffect } from 'react';
import AccesosDirectos from '../../components/AccesosDirectos';

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function AdminCuadroFinal() {
  const [prediccionesReales, setPrediccionesReales] = useState({
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
  
  const [prediccionesUsuarios, setPrediccionesUsuarios] = useState([]);
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
    cargarDatosCuadroFinal();
  }, []);

  const cargarDatosCuadroFinal = async () => {
    try {
      // Cargar predicciones reales del admin
      const resReales = await fetch(`${API_BASE_URL}/api/prediccion-final-admin`);
      if (resReales.ok) {
        const datosReales = await resReales.json();
        if (datosReales) {
          setPrediccionesReales(datosReales);
        }
      }

      // Cargar todas las predicciones de usuarios
      const resUsuarios = await fetch(`${API_BASE_URL}/api/predicciones-finales`);
      if (resUsuarios.ok) {
        const datosUsuarios = await resUsuarios.json();
        setPrediccionesUsuarios(datosUsuarios);
      }
    } catch (error) {
      console.error("Error cargando datos cuadro final:", error);
    }
  };

  const handleChangeCuadroFinal = (field, value) => {
    setPrediccionesReales(prev => ({
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
      equiposSeleccionados = Object.entries(prediccionesReales)
        .filter(([key, value]) => key !== campo && camposPosiciones.includes(key) && value !== "")
        .map(([key, value]) => value);
    } else if (camposCopas.includes(campo)) {
      // Si es una copa, NO excluir nada (pueden repetirse con posiciones y entre ellas)
      equiposSeleccionados = [];
    }
    
    return equipos.filter(equipo => !equiposSeleccionados.includes(equipo));
  };

  const guardarPrediccionesReales = async () => {
    setLoading(true);
    setMessage("");
    
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/prediccion-final-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(prediccionesReales)
      });

      if (response.ok) {
        const data = await response.json();
        setMessage("✅ Predicciones reales guardadas exitosamente");
        alert("✅ Predicciones reales guardadas exitosamente");
      } else {
        const errorData = await response.json();
        setMessage(`❌ Error al guardar predicciones reales: ${errorData.error || 'Error desconocido'}`);
        alert(`❌ Error al guardar predicciones reales: ${errorData.error || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessage("❌ Error al guardar predicciones reales");
      alert("❌ Error al guardar predicciones reales");
    } finally {
      setLoading(false);
    }
  };

  const limpiarDatosCuadroFinal = () => {
    if (confirm("¿Estás seguro de que quieres limpiar todos los datos?")) {
      setPrediccionesReales({
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
      setMessage("✅ Datos limpiados exitosamente");
      alert("✅ Datos limpiados exitosamente");
    }
  };

  const calcularPuntosCuadroFinal = async () => {
    if (!confirm("¿Calcular puntos del Cuadro Final para todos los usuarios?")) {
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/predicciones-finales/calcular-puntos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(prediccionesReales)
      });

      if (response.ok) {
        const data = await response.json();
        setMessage(`✅ Puntos calculados: ${data.usuariosActualizados} usuarios actualizados`);
        alert(`✅ Puntos calculados: ${data.usuariosActualizados} usuarios actualizados`);
        cargarDatosCuadroFinal(); // Recargar datos
      } else {
        setMessage("❌ Error al calcular puntos");
        alert("❌ Error al calcular puntos");
      }
    } catch (error) {
      console.error("Error:", error);
      setMessage("❌ Error al calcular puntos");
      alert("❌ Error al calcular puntos");
    } finally {
      setLoading(false);
    }
  };

  const calcularAciertos = (prediccionUsuario) => {
    const aciertos = {};
    let puntosTotales = 0;

    if (prediccionUsuario.campeon === prediccionesReales.campeon && prediccionesReales.campeon) {
      aciertos.campeon = 15;
      puntosTotales += 15;
    }
    if (prediccionUsuario.subcampeon === prediccionesReales.subcampeon && prediccionesReales.subcampeon) {
      aciertos.subcampeon = 10;
      puntosTotales += 10;
    }
    if (prediccionUsuario.tercero === prediccionesReales.tercero && prediccionesReales.tercero) {
      aciertos.tercero = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.cuarto === prediccionesReales.cuarto && prediccionesReales.cuarto) {
      aciertos.cuarto = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.quinto === prediccionesReales.quinto && prediccionesReales.quinto) {
      aciertos.quinto = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.sexto === prediccionesReales.sexto && prediccionesReales.sexto) {
      aciertos.sexto = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.quinceto === prediccionesReales.quinceto && prediccionesReales.quinceto) {
      aciertos.quinceto = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.dieciseisavo === prediccionesReales.dieciseisavo && prediccionesReales.dieciseisavo) {
      aciertos.dieciseisavo = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.copa_chile === prediccionesReales.copa_chile && prediccionesReales.copa_chile) {
      aciertos.copa_chile = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.copa_liga === prediccionesReales.copa_liga && prediccionesReales.copa_liga) {
      aciertos.copa_liga = 5;
      puntosTotales += 5;
    }
    if (prediccionUsuario.goleador === prediccionesReales.goleador && prediccionesReales.goleador) {
      aciertos.goleador = 6;
      puntosTotales += 6;
    }

    return { aciertos, puntosTotales };
  };

  return (
    <div className="container mt-4">
      <AccesosDirectos />
      
      <h2 className="text-center mb-4">🏆 Admin - Cuadro Final Torneo Nacional</h2>

      {message && (
        <div className={`alert ${message.includes('✅') ? 'alert-success' : 'alert-danger'} alert-dismissible fade show`} role="alert">
          {message}
          <button type="button" className="btn-close" onClick={() => setMessage('')} aria-label="Close"></button>
        </div>
      )}

      {/* Formulario de Predicciones Reales */}
      <div className="card mb-4">
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">📋 Resultados Reales del Campeonato</h5>
        </div>
        <div className="card-body">
          <div className="row">
            <div className="col-md-6 col-lg-4 mb-3">
              <label htmlFor="campeon" className="form-label">
                <strong>🥇 1° Lugar (15 pts)</strong>
              </label>
              <select
                id="campeon"
                className="form-select"
                value={prediccionesReales.campeon}
                onChange={(e) => handleChangeCuadroFinal("campeon", e.target.value)}
              >
                <option value="">Selecciona equipo</option>
                {getEquiposParaCampo("campeon").map((equipo) => (
                  <option key={equipo} value={equipo}>
                    {equipo}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6 col-lg-4 mb-3">
              <label htmlFor="subcampeon" className="form-label">
                <strong>🥈 2° Lugar (10 pts)</strong>
              </label>
              <select
                id="subcampeon"
                className="form-select"
                value={prediccionesReales.subcampeon}
                onChange={(e) => handleChangeCuadroFinal("subcampeon", e.target.value)}
              >
                <option value="">Selecciona equipo</option>
                {getEquiposParaCampo("subcampeon").map((equipo) => (
                  <option key={equipo} value={equipo}>
                    {equipo}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6 col-lg-4 mb-3">
              <label htmlFor="tercero" className="form-label">
                <strong>🥉 3° Lugar (5 pts)</strong>
              </label>
              <select
                id="tercero"
                className="form-select"
                value={prediccionesReales.tercero}
                onChange={(e) => handleChangeCuadroFinal("tercero", e.target.value)}
              >
                <option value="">Selecciona equipo</option>
                {getEquiposParaCampo("tercero").map((equipo) => (
                  <option key={equipo} value={equipo}>
                    {equipo}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6 col-lg-4 mb-3">
              <label htmlFor="cuarto" className="form-label">
                <strong>4° Lugar (5 pts)</strong>
              </label>
              <select
                id="cuarto"
                className="form-select"
                value={prediccionesReales.cuarto}
                onChange={(e) => handleChangeCuadroFinal("cuarto", e.target.value)}
              >
                <option value="">Selecciona equipo</option>
                {getEquiposParaCampo("cuarto").map((equipo) => (
                  <option key={equipo} value={equipo}>
                    {equipo}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6 col-lg-4 mb-3">
              <label htmlFor="quinto" className="form-label">
                <strong>5° Lugar (5 pts)</strong>
              </label>
              <select
                id="quinto"
                className="form-select"
                value={prediccionesReales.quinto}
                onChange={(e) => handleChangeCuadroFinal("quinto", e.target.value)}
              >
                <option value="">Selecciona equipo</option>
                {getEquiposParaCampo("quinto").map((equipo) => (
                  <option key={equipo} value={equipo}>
                    {equipo}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6 col-lg-4 mb-3">
              <label htmlFor="sexto" className="form-label">
                <strong>6° Lugar (5 pts)</strong>
              </label>
              <select
                id="sexto"
                className="form-select"
                value={prediccionesReales.sexto}
                onChange={(e) => handleChangeCuadroFinal("sexto", e.target.value)}
              >
                <option value="">Selecciona equipo</option>
                {getEquiposParaCampo("sexto").map((equipo) => (
                  <option key={equipo} value={equipo}>
                    {equipo}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6 col-lg-4 mb-3">
              <label htmlFor="quinceto" className="form-label">
                <strong>🔻 15° Lugar (5 pts)</strong>
              </label>
              <select
                id="quinceto"
                className="form-select"
                value={prediccionesReales.quinceto}
                onChange={(e) => handleChangeCuadroFinal("quinceto", e.target.value)}
              >
                <option value="">Selecciona equipo</option>
                {getEquiposParaCampo("quinceto").map((equipo) => (
                  <option key={equipo} value={equipo}>
                    {equipo}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6 col-lg-4 mb-3">
              <label htmlFor="dieciseisavo" className="form-label">
                <strong>🔻 16° Lugar (5 pts)</strong>
              </label>
              <select
                id="dieciseisavo"
                className="form-select"
                value={prediccionesReales.dieciseisavo}
                onChange={(e) => handleChangeCuadroFinal("dieciseisavo", e.target.value)}
              >
                <option value="">Selecciona equipo</option>
                {getEquiposParaCampo("dieciseisavo").map((equipo) => (
                  <option key={equipo} value={equipo}>
                    {equipo}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6 col-lg-4 mb-3">
              <label htmlFor="copa_chile" className="form-label">
                <strong>🏆 Campeón Copa Chile (5 pts)</strong>
              </label>
              <select
                id="copa_chile"
                className="form-select"
                value={prediccionesReales.copa_chile}
                onChange={(e) => handleChangeCuadroFinal("copa_chile", e.target.value)}
              >
                <option value="">Selecciona equipo</option>
                {getEquiposParaCampo("copa_chile").map((equipo) => (
                  <option key={equipo} value={equipo}>
                    {equipo}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6 col-lg-4 mb-3">
              <label htmlFor="copa_liga" className="form-label">
                <strong>🏆 Campeón Copa de la Liga (5 pts)</strong>
              </label>
              <select
                id="copa_liga"
                className="form-select"
                value={prediccionesReales.copa_liga}
                onChange={(e) => handleChangeCuadroFinal("copa_liga", e.target.value)}
              >
                <option value="">Selecciona equipo</option>
                {getEquiposParaCampo("copa_liga").map((equipo) => (
                  <option key={equipo} value={equipo}>
                    {equipo}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6 col-lg-4 mb-3">
              <label htmlFor="goleador" className="form-label">
                <strong>⚽ Goleador (6 pts)</strong>
              </label>
              <select
                id="goleador"
                className="form-select"
                value={prediccionesReales.goleador}
                onChange={(e) => handleChangeCuadroFinal("goleador", e.target.value)}
              >
                <option value="">Selecciona goleador</option>
                {goleadores.map((goleador) => (
                  <option key={goleador} value={goleador}>
                    {goleador}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <button
              className="btn btn-success me-2"
              onClick={guardarPrediccionesReales}
              disabled={loading}
            >
              {loading ? "Guardando..." : "💾 Guardar Resultados Reales"}
            </button>
            <button
              className="btn btn-warning me-2"
              onClick={calcularPuntosCuadroFinal}
              disabled={loading}
            >
              📊 Calcular Puntos
            </button>
            <button
              className="btn btn-danger"
              onClick={limpiarDatosCuadroFinal}
              disabled={loading}
            >
              🗑️ Limpiar Datos
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de Predicciones de Usuarios */}
      {prediccionesUsuarios.length > 0 && (
        <div className="card">
          <div className="card-header bg-info text-white">
            <h5 className="mb-0">👥 Predicciones de Usuarios ({prediccionesUsuarios.length})</h5>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-sm table-bordered table-hover">
                <thead className="table-dark">
                  <tr className="text-center">
                    <th>Usuario</th>
                    <th>1°<br/><small>(15)</small></th>
                    <th>2°<br/><small>(10)</small></th>
                    <th>3°<br/><small>(5)</small></th>
                    <th>4°<br/><small>(5)</small></th>
                    <th>5°<br/><small>(5)</small></th>
                    <th>6°<br/><small>(5)</small></th>
                    <th>15°<br/><small>(5)</small></th>
                    <th>16°<br/><small>(5)</small></th>
                    <th>Copa CH<br/><small>(5)</small></th>
                    <th>Copa Liga<br/><small>(5)</small></th>
                    <th>Gol.<br/><small>(6)</small></th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {prediccionesUsuarios.map((prediccion) => {
                    const { aciertos, puntosTotales } = calcularAciertos(prediccion);
                    return (
                      <tr key={prediccion.jugador_id} className="text-center">
                        <td className="text-start">
                          <strong>{prediccion.nombre}</strong>
                        </td>
                        <td className={aciertos.campeon ? "bg-success text-white" : ""}>
                          {prediccion.campeon || "-"}
                        </td>
                        <td className={aciertos.subcampeon ? "bg-success text-white" : ""}>
                          {prediccion.subcampeon || "-"}
                        </td>
                        <td className={aciertos.tercero ? "bg-success text-white" : ""}>
                          {prediccion.tercero || "-"}
                        </td>
                        <td className={aciertos.cuarto ? "bg-success text-white" : ""}>
                          {prediccion.cuarto || "-"}
                        </td>
                        <td className={aciertos.quinto ? "bg-success text-white" : ""}>
                          {prediccion.quinto || "-"}
                        </td>
                        <td className={aciertos.sexto ? "bg-success text-white" : ""}>
                          {prediccion.sexto || "-"}
                        </td>
                        <td className={aciertos.quinceto ? "bg-success text-white" : ""}>
                          {prediccion.quinceto || "-"}
                        </td>
                        <td className={aciertos.dieciseisavo ? "bg-success text-white" : ""}>
                          {prediccion.dieciseisavo || "-"}
                        </td>
                        <td className={aciertos.copa_chile ? "bg-success text-white" : ""}>
                          {prediccion.copa_chile || "-"}
                        </td>
                        <td className={aciertos.copa_liga ? "bg-success text-white" : ""}>
                          {prediccion.copa_liga || "-"}
                        </td>
                        <td className={aciertos.goleador ? "bg-success text-white" : ""}>
                          {prediccion.goleador || "-"}
                        </td>
                        <td className="fw-bold">{puntosTotales}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
