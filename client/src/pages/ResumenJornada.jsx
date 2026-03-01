import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import AccesosDirectos from "../components/AccesosDirectos";

// Registrar componentes de Chart.js
ChartJS.register(ArcElement, Tooltip, Legend);

const API_BASE_URL = import.meta.env.VITE_API_URL;

// Mapeo de logos (mismo que Jornada.jsx)
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

const getLogoEquipo = (nombreEquipo) => {
  const nombreNormalizado = nombreEquipo?.replace(/[\u2018\u2019]/g, "'");
  return LOGOS_EQUIPOS[nombreNormalizado] || null;
};

// Colores para el gráfico
const COLORES_GRAFICO = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
  '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40',
  '#36A2EB', '#FFCE56', '#9966FF', '#FF6384', '#4BC0C0'
];

function useAuth() {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuario"));
    return usuario;
  } catch {
    return null;
  }
}

export default function ResumenJornada() {
  const usuario = useAuth();
  const navigate = useNavigate();
  
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState(1);
  const [resumenData, setResumenData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Verificar acceso
  useEffect(() => {
    if (!usuario) {
      navigate("/login");
      return;
    }
    if (usuario.activo_torneo_nacional !== true) {
      alert("⚠️ No tienes acceso al Torneo Nacional.");
      navigate("/");
      return;
    }
  }, []);

  // Cargar jornadas disponibles
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas`)
      .then((res) => res.json())
      .then(setJornadas)
      .catch((err) => console.error("Error al cargar jornadas", err));
  }, []);

  // Cargar resumen cuando cambia la jornada seleccionada
  useEffect(() => {
    if (jornadaSeleccionada) {
      cargarResumen(jornadaSeleccionada);
    }
  }, [jornadaSeleccionada]);

  const cargarResumen = async (numeroJornada) => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/pronosticos/resumen/jornada/${numeroJornada}`);
      setResumenData(response.data);
    } catch (error) {
      console.error('Error cargando resumen:', error);
      alert('Error al cargar el resumen de la jornada');
    } finally {
      setLoading(false);
    }
  };

  const generarDatosGrafico = (grupos) => {
    return {
      labels: grupos.map(g => g.resultado),
      datasets: [{
        data: grupos.map(g => g.cantidad),
        backgroundColor: COLORES_GRAFICO.slice(0, grupos.length),
        borderColor: '#fff',
        borderWidth: 2
      }]
    };
  };

  const opcionesGrafico = {
    plugins: {
      legend: {
        position: 'right',
        labels: {
          font: {
            size: 12
          },
          padding: 15
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const porcentaje = ((value / total) * 100).toFixed(1);
            return `${label}: ${value} (${porcentaje}%)`;
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
      <h2 className="text-center mb-4">📊 Resumen de Jornada - Torneo Nacional</h2>
      
      <AccesosDirectos />

      {/* Selector de Jornada */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col-md-3">
              <label className="form-label fw-bold">Seleccionar Jornada:</label>
            </div>
            <div className="col-md-4">
              <select 
                className="form-select" 
                value={jornadaSeleccionada}
                onChange={(e) => setJornadaSeleccionada(parseInt(e.target.value))}
              >
                {jornadas.map(j => (
                  <option key={j.id} value={j.numero}>
                    Jornada {j.numero} {j.cerrada ? '(Cerrada)' : '(Abierta)'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Mostrar resumen */}
      {resumenData && resumenData.partidos && resumenData.partidos.length > 0 ? (
        <div className="row g-4">
          {resumenData.partidos.map((partido, index) => (
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
                    {/* Gráfico de Torta */}
                    <div className="col-md-4">
                      <h6 className="text-center mb-3">Distribución de Pronósticos</h6>
                      <div style={{ maxWidth: '300px', margin: '0 auto' }}>
                        <Pie data={generarDatosGrafico(partido.grupos)} options={opcionesGrafico} />
                      </div>
                    </div>

                    {/* Tabla de Pronósticos Agrupados */}
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
                                            onError={(e) => { 
                                              e.target.style.display = 'none';
                                              e.target.nextSibling.style.display = 'inline-flex';
                                            }}
                                          />
                                        ) : null}
                                        {!usr.foto_perfil && (
                                          <div 
                                            style={{ 
                                              width: '24px', 
                                              height: '24px', 
                                              borderRadius: '50%', 
                                              backgroundColor: '#007bff',
                                              color: 'white',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              fontSize: '0.7rem',
                                              fontWeight: 'bold'
                                            }}
                                          >
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
      ) : (
        <div className="alert alert-info text-center">
          No hay pronósticos disponibles para esta jornada aún.
        </div>
      )}
    </div>
  );
}
