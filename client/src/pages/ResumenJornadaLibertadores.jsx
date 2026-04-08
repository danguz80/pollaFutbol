import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import NavegacionLibertadores from "../components/NavegacionLibertadores";
import { getLogoEquipo } from "../utils/libertadoresLogos.jsx";

ChartJS.register(ArcElement, Tooltip, Legend);

const API_BASE_URL = import.meta.env.VITE_API_URL;

const COLORES_GRAFICO = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
  '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40',
  '#36A2EB', '#FFCE56', '#9966FF', '#FF6384', '#4BC0C0'
];

function useAuth() {
  try {
    return JSON.parse(localStorage.getItem("usuario"));
  } catch {
    return null;
  }
}

export default function ResumenJornadaLibertadores() {
  const usuario = useAuth();
  const navigate = useNavigate();

  const [jornadas, setJornadas] = useState([]);
  const [jornadasCerradas, setJornadasCerradas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState(null);
  const [resumenData, setResumenData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!usuario) {
      navigate("/login");
      return;
    }
    if (usuario.activo_libertadores !== true) {
      alert("⚠️ No tienes acceso a Copa Libertadores.");
      navigate("/");
      return;
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`${API_BASE_URL}/api/libertadores/jornadas`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then(data => {
        setJornadas(data);
        const cerradas = data.filter(j => j.cerrada === true);
        setJornadasCerradas(cerradas);
        if (cerradas.length > 0) {
          setJornadaSeleccionada(cerradas[cerradas.length - 1].numero);
        }
      })
      .catch((err) => console.error("Error al cargar jornadas", err));
  }, []);

  useEffect(() => {
    if (jornadaSeleccionada) {
      const jornada = jornadas.find(j => j.numero === jornadaSeleccionada);
      if (jornada && jornada.cerrada) {
        cargarResumen(jornadaSeleccionada);
      } else {
        setResumenData(null);
      }
    }
  }, [jornadaSeleccionada, jornadas]);

  const cargarResumen = async (numeroJornada) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${API_BASE_URL}/api/libertadores-pronosticos/resumen/jornada/${numeroJornada}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setResumenData(response.data);
    } catch (error) {
      console.error('Error cargando resumen:', error);
      alert('Error al cargar el resumen de la jornada');
    } finally {
      setLoading(false);
    }
  };

  const generarDatosGrafico = (grupos) => ({
    labels: grupos.map(g => g.resultado),
    datasets: [{
      data: grupos.map(g => g.cantidad),
      backgroundColor: COLORES_GRAFICO.slice(0, grupos.length),
      borderColor: '#fff',
      borderWidth: 2
    }]
  });

  const opcionesGrafico = {
    plugins: {
      legend: { position: 'right', labels: { font: { size: 12 }, padding: 15 } },
      tooltip: {
        callbacks: {
          label: function(context) {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const porcentaje = ((context.parsed / total) * 100).toFixed(1);
            return `${context.label}: ${context.parsed} (${porcentaje}%)`;
          }
        }
      }
    },
    maintainAspectRatio: true,
    responsive: true
  };

  if (loading) {
    return (
      <div className="container mt-5">
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid mt-4 px-4">
      <h2 className="text-center mb-4">📊 Resumen de Jornada - Copa Libertadores</h2>

      <NavegacionLibertadores />

      {/* Selector de Jornada */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col-md-3">
              <label className="form-label fw-bold">Seleccionar Jornada:</label>
            </div>
            <div className="col-md-4">
              {jornadasCerradas.length > 0 ? (
                <select
                  className="form-select"
                  value={jornadaSeleccionada || ''}
                  onChange={(e) => setJornadaSeleccionada(parseInt(e.target.value))}
                >
                  {jornadasCerradas.map(j => (
                    <option key={j.id} value={j.numero}>
                      Jornada {j.numero}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="alert alert-warning mb-0">
                  No hay jornadas cerradas disponibles aún.
                </div>
              )}
            </div>
            <div className="col-md-5">
              <small className="text-muted">
                ℹ️ Solo puedes ver el resumen de jornadas cerradas
              </small>
            </div>
          </div>
        </div>
      </div>

      {/* Mostrar resumen */}
      {jornadasCerradas.length === 0 ? (
        <div className="alert alert-info text-center">
          <h5>📊 Resumen de Jornada</h5>
          <p className="mb-0">El resumen estará disponible una vez que se cierre la primera jornada.</p>
        </div>
      ) : resumenData && resumenData.partidos && resumenData.partidos.length > 0 ? (
        <div className="row g-4">
          {resumenData.partidos.map((partido) => (
            <div key={partido.partido_id} className="col-12">
              <div className="card shadow-sm">
                <div className="card-header bg-primary text-white">
                  <div className="d-flex align-items-center justify-content-between">
                    <h5 className="mb-0">
                      <img
                        src={getLogoEquipo(partido.nombre_local)}
                        alt={partido.nombre_local}
                        style={{ width: '30px', height: '30px', objectFit: 'contain', marginRight: '10px' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      {partido.nombre_local} vs {partido.nombre_visita}
                      <img
                        src={getLogoEquipo(partido.nombre_visita)}
                        alt={partido.nombre_visita}
                        style={{ width: '30px', height: '30px', objectFit: 'contain', marginLeft: '10px' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </h5>
                    <span className="badge bg-light text-dark">
                      {partido.total_pronosticos} pronósticos
                    </span>
                  </div>
                </div>

                <div className="card-body">
                  <div className="row">
                    <div className="col-md-4">
                      <h6 className="text-center mb-3">Distribución de Pronósticos</h6>
                      <div style={{ maxWidth: '300px', margin: '0 auto' }}>
                        <Pie data={generarDatosGrafico(partido.grupos)} options={opcionesGrafico} />
                      </div>
                    </div>

                    <div className="col-md-8">
                      <h6 className="mb-3">Detalle de Pronósticos</h6>
                      <div className="table-responsive">
                        <table className="table table-hover table-sm">
                          <thead className="table-light">
                            <tr>
                              <th className="text-center" style={{ width: '80px' }}>Cantidad</th>
                              <th className="text-center" style={{ width: '100px' }}>Pronóstico</th>
                              <th>Jugadores</th>
                              <th className="text-center" style={{ width: '80px' }}>%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {partido.grupos.map((grupo, idx) => (
                              <tr key={idx}>
                                <td className="text-center align-middle">
                                  <span className="badge bg-primary fs-6">{grupo.cantidad}</span>
                                </td>
                                <td className="text-center align-middle">
                                  <div className="d-flex align-items-center justify-content-center gap-2">
                                    <img
                                      src={getLogoEquipo(partido.nombre_local)}
                                      alt={partido.nombre_local}
                                      style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                                      onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                    <div className="d-flex align-items-center gap-1">
                                      <span className="fw-bold text-primary" style={{ fontSize: '1.2rem', minWidth: '25px', textAlign: 'center' }}>
                                        {grupo.goles_local}
                                      </span>
                                      <span style={{ fontSize: '1rem', color: '#666', fontWeight: 'bold' }}>-</span>
                                      <span className="fw-bold text-primary" style={{ fontSize: '1.2rem', minWidth: '25px', textAlign: 'center' }}>
                                        {grupo.goles_visita}
                                      </span>
                                    </div>
                                    <img
                                      src={getLogoEquipo(partido.nombre_visita)}
                                      alt={partido.nombre_visita}
                                      style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                                      onError={(e) => { e.target.style.display = 'none'; }}
                                    />
                                  </div>
                                </td>
                                <td className="align-middle">
                                  <div className="d-flex flex-wrap gap-2">
                                    {grupo.usuarios.map((usr) => (
                                      <div
                                        key={usr.id}
                                        className="d-flex align-items-center gap-1 bg-light rounded px-2 py-1"
                                        style={{ fontSize: '0.85rem' }}
                                      >
                                        {usr.foto_perfil ? (
                                          <img
                                            src={usr.foto_perfil}
                                            alt={usr.nombre}
                                            style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                                            onError={(e) => { e.target.style.display = 'none'; }}
                                          />
                                        ) : (
                                          <div style={{
                                            width: '24px', height: '24px', borderRadius: '50%',
                                            backgroundColor: '#007bff', color: 'white',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.7rem', fontWeight: 'bold'
                                          }}>
                                            {usr.nombre.charAt(0).toUpperCase()}
                                          </div>
                                        )}
                                        <span>{usr.nombre}</span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                                <td className="text-center align-middle">
                                  <span className="badge bg-success">{grupo.porcentaje}%</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : jornadaSeleccionada ? (
        <div className="alert alert-info text-center">
          No hay pronósticos disponibles para esta jornada aún.
        </div>
      ) : null}
    </div>
  );
}
