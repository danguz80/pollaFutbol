import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import NavegacionLibertadores from '../components/NavegacionLibertadores';
import { LogoEquipo } from '../utils/libertadoresLogos.jsx';

const API_URL = import.meta.env.VITE_API_URL;

export default function EstadisticasLibertadores() {
  const navigate = useNavigate();
  const [estadisticas, setEstadisticas] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarEstadisticas();
  }, []);

  const cargarEstadisticas = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/libertadores-estadisticas/estadisticas`);
      setEstadisticas(response.data);
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mt-5 text-center">
        <div className="spinner-border text-danger" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4 mb-5">
      <div className="text-center mb-4">
        <h1 className="display-6 fw-bold text-danger">📊 Estadísticas Copa Libertadores</h1>
        <p className="text-muted">Tablas de Posiciones - Fase de Grupos</p>
      </div>

      {/* Botonera Principal */}
      <NavegacionLibertadores />

      {/* Botón volver */}
      <div className="mb-4">
        <button 
          className="btn btn-outline-secondary" 
          onClick={() => navigate('/libertadores')}
        >
          ← Volver a Libertadores
        </button>
      </div>

      {/* Tablas de posiciones por grupo */}
      <div className="row g-4">
        {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(grupo => {
          const equiposGrupo = estadisticas[grupo] || [];
          
          return (
            <div key={grupo} className="col-12 col-lg-6">
              <div className="card shadow">
                <div className="card-header bg-danger text-white">
                  <h5 className="mb-0 fw-bold">GRUPO {grupo}</h5>
                </div>
                <div className="card-body p-0">
                  {equiposGrupo.length === 0 ? (
                    <div className="p-4 text-center text-muted">
                      No hay datos disponibles
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover table-sm mb-0">
                        <thead className="table-light">
                          <tr>
                            <th className="text-center" style={{ width: '50px' }}>#</th>
                            <th>Equipo</th>
                            <th className="text-center" style={{ width: '50px' }}>PJ</th>
                            <th className="text-center" style={{ width: '50px' }}>PG</th>
                            <th className="text-center" style={{ width: '50px' }}>PE</th>
                            <th className="text-center" style={{ width: '50px' }}>PP</th>
                            <th className="text-center" style={{ width: '50px' }}>GF</th>
                            <th className="text-center" style={{ width: '50px' }}>GC</th>
                            <th className="text-center" style={{ width: '50px' }}>DIF</th>
                            <th className="text-center fw-bold" style={{ width: '50px' }}>PTS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {equiposGrupo.map((equipo, index) => {
                            // Resaltar primeros 2 lugares (clasifican)
                            const esClasificado = index < 2;
                            
                            return (
                              <tr 
                                key={equipo.nombre}
                                className={esClasificado ? 'table-success' : ''}
                              >
                                <td className="text-center fw-bold">{equipo.posicion}</td>
                                <td>
                                  <div className="d-flex align-items-center">
                                    <LogoEquipo nombre={equipo.nombre} style={{ width: '24px', height: '24px', marginRight: '8px' }} />
                                    <span>
                                      {equipo.nombre}
                                      {equipo.pais && (
                                        <span className="text-muted small ms-1">({equipo.pais})</span>
                                      )}
                                    </span>
                                  </div>
                                </td>
                                <td className="text-center">{equipo.pj}</td>
                                <td className="text-center">{equipo.pg}</td>
                                <td className="text-center">{equipo.pe}</td>
                                <td className="text-center">{equipo.pp}</td>
                                <td className="text-center">{equipo.gf}</td>
                                <td className="text-center">{equipo.gc}</td>
                                <td className="text-center">{equipo.dif > 0 ? '+' : ''}{equipo.dif}</td>
                                <td className="text-center fw-bold">{equipo.pts}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="mt-4">
        <div className="card">
          <div className="card-body">
            <h6 className="fw-bold mb-3">Leyenda:</h6>
            <div className="row g-3">
              <div className="col-12 col-md-6">
                <div className="d-flex align-items-center gap-2">
                  <div style={{ width: '20px', height: '20px' }} className="bg-success rounded"></div>
                  <span className="small">Clasificados a Octavos de Final</span>
                </div>
              </div>
              <div className="col-12 col-md-6">
                <p className="small mb-0">
                  <strong>PJ:</strong> Partidos Jugados | 
                  <strong> PG:</strong> Ganados | 
                  <strong> PE:</strong> Empatados | 
                  <strong> PP:</strong> Perdidos
                </p>
                <p className="small mb-0">
                  <strong>GF:</strong> Goles a Favor | 
                  <strong> GC:</strong> Goles en Contra | 
                  <strong> DIF:</strong> Diferencia | 
                  <strong> PTS:</strong> Puntos
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Criterios de desempate */}
      <div className="mt-3">
        <div className="card">
          <div className="card-body">
            <h6 className="fw-bold mb-2">Criterios de Desempate:</h6>
            <ol className="small mb-0">
              <li>Mayor cantidad de puntos</li>
              <li>Resultado del enfrentamiento directo</li>
              <li>Mayor diferencia de goles</li>
              <li>Mayor cantidad de goles a favor</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
