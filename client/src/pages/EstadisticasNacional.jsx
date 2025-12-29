import { useEffect, useState } from "react";
import axios from "axios";
import LastMatchsNacional from "../components/LastMatchsNacional";
import AccesosDirectos from "../components/AccesosDirectos";

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
  "O'Higgins": '/logos_torneo_nacional/ohiggins.webp',
  'Palestino': '/logos_torneo_nacional/palestino.png',
  'U. Católica': '/logos_torneo_nacional/uc.png',
  'U. de Chile': '/logos_torneo_nacional/udechile.png',
  'Unión Española': '/logos_torneo_nacional/union-espanola.png',
  'Ñublense': '/logos_torneo_nacional/ñublense.png'
};

const getLogoEquipo = (nombreEquipo) => {
  return LOGOS_EQUIPOS[nombreEquipo] || null;
};

export default function Estadisticas() {
  const [estadisticas, setEstadisticas] = useState([]);
  const [empatesPendientes, setEmpatesPendientes] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarEstadisticas();
  }, []);

  const cargarEstadisticas = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/estadisticas-nacional/tabla-posiciones`);
      
      // Manejar nueva estructura de respuesta
      if (response.data.tabla) {
        setEstadisticas(response.data.tabla);
        setEmpatesPendientes(response.data.empates_pendientes);
      } else {
        // Compatibilidad con respuesta antigua
        setEstadisticas(response.data);
      }
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    } finally {
      setLoading(false);
    }
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
      <h2 className="text-center mb-4">📊 Estadísticas - Torneo Nacional</h2>
      
      {/* Accesos Directos */}
      <AccesosDirectos />
      
      <div className="row g-4">
        {/* Tabla de Posiciones - Lado Izquierdo */}
        <div className="col-lg-6">
          <div className="card shadow-sm">
            <div className="card-header bg-primary text-white">
              <h5 className="mb-0">Tabla de Posiciones</h5>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover table-striped mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="text-center" style={{ width: '50px' }}>Pos</th>
                      <th style={{ minWidth: '180px' }}>Equipo</th>
                      <th className="text-center" title="Partidos Jugados">PJ</th>
                      <th className="text-center" title="Partidos Ganados">PG</th>
                      <th className="text-center" title="Partidos Empatados">PE</th>
                      <th className="text-center" title="Partidos Perdidos">PP</th>
                      <th className="text-center" title="Goles a Favor">GF</th>
                      <th className="text-center" title="Goles en Contra">GC</th>
                      <th className="text-center" title="Diferencia de Goles">DIF</th>
                      <th className="text-center fw-bold" title="Puntos">PTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estadisticas.map((equipo, index) => {
                      const logo = getLogoEquipo(equipo.equipo);
                      const diferencia = equipo.goles_favor - equipo.goles_contra;
                      
                      return (
                        <tr key={equipo.equipo}>
                          <td className="text-center align-middle fw-bold">{index + 1}</td>
                          <td className="align-middle">
                            <div className="d-flex align-items-center gap-2">
                              {logo && (
                                <img
                                  src={logo}
                                  alt={equipo.equipo}
                                  style={{ width: '28px', height: '28px', objectFit: 'contain' }}
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              )}
                              <span className="fw-semibold" style={{ fontSize: '0.9rem' }}>{equipo.equipo}</span>
                            </div>
                          </td>
                          <td className="text-center align-middle">{equipo.partidos_jugados}</td>
                          <td className="text-center align-middle text-success fw-semibold">{equipo.ganados}</td>
                          <td className="text-center align-middle text-warning fw-semibold">{equipo.empatados}</td>
                          <td className="text-center align-middle text-danger fw-semibold">{equipo.perdidos}</td>
                          <td className="text-center align-middle">{equipo.goles_favor}</td>
                          <td className="text-center align-middle">{equipo.goles_contra}</td>
                          <td className={`text-center align-middle fw-semibold ${diferencia > 0 ? 'text-success' : diferencia < 0 ? 'text-danger' : ''}`}>
                            {diferencia > 0 ? '+' : ''}{diferencia}
                          </td>
                          <td className="text-center align-middle">
                            <span className="badge bg-primary fs-6 px-3 py-2">{equipo.puntos}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          {empatesPendientes && empatesPendientes.length > 0 && (
            <div className="alert alert-warning mt-3" role="alert">
              <strong>⚠️ Desempate requerido:</strong> Los siguientes equipos necesitan aplicar criterios de desempate adicionales (5-8): <strong>{empatesPendientes.join(', ')}</strong>
            </div>
          )}
          
          <div className="alert alert-info mt-3">
            <small>
              <strong>Sistema de puntos:</strong> Victoria = 3 pts | Empate = 1 pt | Derrota = 0 pts
            </small>
          </div>
          
          <div className="card mt-3">
            <div className="card-header bg-secondary text-white">
              <h6 className="mb-0">📋 Criterios de Desempate</h6>
            </div>
            <div className="card-body">
              <small>
                <p className="mb-2">El orden de clasificación de los equipos en la tabla de posiciones del Campeonato se determinará de la siguiente manera:</p>
                <ol className="mb-0" style={{ paddingLeft: '20px' }}>
                  <li><strong>Mayor cantidad de puntos obtenidos.</strong></li>
                  <li><strong>Mayor diferencia entre los goles marcados y recibidos.</strong></li>
                  <li><strong>Mayor cantidad de partidos ganados.</strong></li>
                  <li><strong>Mayor cantidad de goles marcados.</strong></li>
                  <li>Mayor cantidad de goles marcados en calidad de visita.</li>
                  <li>Menor cantidad de tarjetas rojas recibidas.</li>
                  <li>Menor cantidad de tarjetas amarillas recibidas.</li>
                  <li>Sorteo.</li>
                </ol>
                <p className="mt-2 mb-0 text-muted fst-italic">
                  <strong>Nota:</strong> Los criterios 1-4 se aplican automáticamente. Si persiste el empate, se requerirán los criterios 5-8.
                </p>
              </small>
            </div>
          </div>
        </div>

        {/* Historial de Últimos Partidos - Lado Derecho */}
        <div className="col-lg-6">
          <LastMatchsNacional ordenEquipos={estadisticas.map(e => e.equipo)} />
        </div>
      </div>
    </div>
  );
}
