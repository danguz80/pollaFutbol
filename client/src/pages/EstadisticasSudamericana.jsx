import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import NavegacionSudamericana from '../components/NavegacionSudamericana';
import { LogoEquipo } from '../utils/sudamericanaLogos.jsx';
import { jwtDecode } from 'jwt-decode';

const API_URL = import.meta.env.VITE_API_URL;

export default function EstadisticasSudamericana() {
  const navigate = useNavigate();
  const [estadisticas, setEstadisticas] = useState({});
  const [tablasVirtuales, setTablasVirtuales] = useState({});
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const decoded = jwtDecode(token);
        setUsuario(decoded);
      } catch (error) {
        console.error('Error decodificando token:', error);
      }
    }
    cargarEstadisticas();
  }, []);

  const cargarEstadisticas = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Cargar tablas reales
      const responseReales = await axios.get(`${API_URL}/api/sudamericana-estadisticas/estadisticas`);
      setEstadisticas(responseReales.data);
      
      // Si hay usuario logueado, cargar sus pronósticos para calcular tablas virtuales
      if (token) {
        const decoded = jwtDecode(token);
        const responsePronosticos = await axios.get(
          `${API_URL}/api/sudamericana-clasificacion/pronosticos?usuario_id=${decoded.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        // Calcular tablas virtuales por grupo
        const tablasVirtualesCalculadas = calcularTablasVirtuales(responsePronosticos.data);
        setTablasVirtuales(tablasVirtualesCalculadas);
      }
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  const calcularTablasVirtuales = (pronosticos) => {
    const gruposLetras = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const tablas = {};
    
    gruposLetras.forEach(grupo => {
      // Filtrar pronósticos del grupo (jornadas 1-6, fase de grupos)
      const pronosticosGrupo = pronosticos.filter(p => 
        p.partido?.grupo === grupo && 
        p.jornada.numero <= 6 &&
        !p.esClasificado
      );
      
      // Inicializar equipos
      const equipos = {};
      pronosticosGrupo.forEach(p => {
        const local = p.partido.local.nombre;
        const visita = p.partido.visita.nombre;
        
        if (!equipos[local]) {
          equipos[local] = { nombre: local, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0, pts: 0 };
        }
        if (!equipos[visita]) {
          equipos[visita] = { nombre: visita, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0, pts: 0 };
        }
        
        // Procesar pronóstico
        if (p.pronostico?.local !== null && p.pronostico?.visita !== null) {
          equipos[local].pj++;
          equipos[visita].pj++;
          equipos[local].gf += p.pronostico.local;
          equipos[local].gc += p.pronostico.visita;
          equipos[visita].gf += p.pronostico.visita;
          equipos[visita].gc += p.pronostico.local;
          
          if (p.pronostico.local > p.pronostico.visita) {
            equipos[local].pts += 3;
            equipos[local].pg++;
            equipos[visita].pp++;
          } else if (p.pronostico.local < p.pronostico.visita) {
            equipos[visita].pts += 3;
            equipos[visita].pg++;
            equipos[local].pp++;
          } else {
            equipos[local].pts++;
            equipos[visita].pts++;
            equipos[local].pe++;
            equipos[visita].pe++;
          }
        }
      });
      
      // Calcular diferencia de goles
      Object.values(equipos).forEach(e => {
        e.dif = e.gf - e.gc;
      });
      
      // Ordenar y asignar posiciones
      const tablaOrdenada = Object.values(equipos).sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.dif !== a.dif) return b.dif - a.dif;
        if (b.gf !== a.gf) return b.gf - a.gf;
        return a.nombre.localeCompare(b.nombre);
      });
      
      tablaOrdenada.forEach((equipo, index) => {
        equipo.posicion = index + 1;
      });
      
      tablas[grupo] = tablaOrdenada;
    });
    
    return tablas;
  };

  if (loading) {
    return (
      <div className="container mt-5 text-center">
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4 mb-5">
      <div className="text-center mb-4">
        <h1 className="display-6 fw-bold text-success">📊 Estadísticas Copa Sudamericana</h1>
        <p className="text-muted">Tablas de Posiciones - Fase de Grupos</p>
      </div>

      {/* Botonera Principal */}
      <NavegacionSudamericana />

      {/* Botón volver */}
      <div className="mb-4">
        <button 
          className="btn btn-outline-secondary" 
          onClick={() => navigate('/sudamericana')}
        >
          ← Volver a Sudamericana
        </button>
      </div>

      {/* Título descriptivo */}
      {usuario && (
        <div className="alert alert-info mb-4">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-info-circle-fill"></i>
            <span>
              <strong>Vista comparativa:</strong> Izquierda = Tabla Real (resultados oficiales) | Derecha = Tu Tabla Virtual (según tus pronósticos)
            </span>
          </div>
        </div>
      )}

      {/* Tablas de posiciones por grupo */}
      <div className="row g-4">
        {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(grupo => {
          const equiposReales = estadisticas[grupo] || [];
          const equiposVirtuales = tablasVirtuales[grupo] || [];
          
          return (
            <div key={grupo} className="col-12">
              <div className="card shadow">
                <div className="card-header bg-success text-white text-center">
                  <h5 className="mb-0 fw-bold">GRUPO {grupo}</h5>
                </div>
                <div className="card-body p-0">
                  <div className="row g-0">
                    {/* Columna IZQUIERDA - Tabla Real */}
                    <div className={usuario ? "col-12 col-lg-6" : "col-12"}>
                      <div className="p-2">
                        <h6 className="text-center mb-3 fw-bold text-success">
                          📊 TABLA REAL
                        </h6>
                        {equiposReales.length === 0 ? (
                          <div className="p-4 text-center text-muted">
                            No hay datos disponibles
                          </div>
                        ) : (
                          <div className="table-responsive">
                            <table className="table table-hover table-sm mb-0">
                              <thead className="table-light">
                                <tr>
                                  <th className="text-center" style={{ width: '40px' }}>#</th>
                                  <th>Equipo</th>
                                  <th className="text-center" style={{ width: '40px' }}>PJ</th>
                                  <th className="text-center" style={{ width: '40px' }}>PG</th>
                                  <th className="text-center" style={{ width: '40px' }}>PE</th>
                                  <th className="text-center" style={{ width: '40px' }}>PP</th>
                                  <th className="text-center" style={{ width: '40px' }}>GF</th>
                                  <th className="text-center" style={{ width: '40px' }}>GC</th>
                                  <th className="text-center" style={{ width: '40px' }}>DIF</th>
                                  <th className="text-center fw-bold" style={{ width: '40px' }}>PTS</th>
                                </tr>
                              </thead>
                              <tbody>
                                {equiposReales.map((equipo, index) => {
                                  const esClasificado = index < 2;
                                  
                                  return (
                                    <tr 
                                      key={equipo.nombre}
                                      className={esClasificado ? 'table-success' : ''}
                                    >
                                      <td className="text-center fw-bold">{equipo.posicion}</td>
                                      <td>
                                        <div className="d-flex align-items-center">
                                          <LogoEquipo nombre={equipo.nombre} style={{ width: '20px', height: '20px', marginRight: '6px' }} />
                                          <span className="small">{equipo.nombre}</span>
                                        </div>
                                      </td>
                                      <td className="text-center small">{equipo.pj}</td>
                                      <td className="text-center small">{equipo.pg}</td>
                                      <td className="text-center small">{equipo.pe}</td>
                                      <td className="text-center small">{equipo.pp}</td>
                                      <td className="text-center small">{equipo.gf}</td>
                                      <td className="text-center small">{equipo.gc}</td>
                                      <td className="text-center small">{equipo.dif > 0 ? '+' : ''}{equipo.dif}</td>
                                      <td className="text-center fw-bold small">{equipo.pts}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Columna DERECHA - Tabla Virtual (solo si hay usuario logueado) */}
                    {usuario && (
                      <>
                        <div className="col-12 col-lg-6 border-start">
                          <div className="p-2">
                            <h6 className="text-center mb-3 fw-bold text-primary">
                              🎯 TU TABLA VIRTUAL
                            </h6>
                            {equiposVirtuales.length === 0 ? (
                              <div className="p-4 text-center text-muted">
                                <p className="mb-0">No tienes pronósticos para este grupo</p>
                              </div>
                            ) : (
                              <div className="table-responsive">
                                <table className="table table-hover table-sm mb-0">
                                  <thead className="table-light">
                                    <tr>
                                      <th className="text-center" style={{ width: '40px' }}>#</th>
                                      <th>Equipo</th>
                                      <th className="text-center" style={{ width: '40px' }}>PJ</th>
                                      <th className="text-center" style={{ width: '40px' }}>PG</th>
                                      <th className="text-center" style={{ width: '40px' }}>PE</th>
                                      <th className="text-center" style={{ width: '40px' }}>PP</th>
                                      <th className="text-center" style={{ width: '40px' }}>GF</th>
                                      <th className="text-center" style={{ width: '40px' }}>GC</th>
                                      <th className="text-center" style={{ width: '40px' }}>DIF</th>
                                      <th className="text-center fw-bold" style={{ width: '40px' }}>PTS</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {equiposVirtuales.map((equipo, index) => {
                                      const esClasificado = index < 2;
                                      
                                      return (
                                        <tr 
                                          key={equipo.nombre}
                                          className={esClasificado ? 'table-info' : ''}
                                        >
                                          <td className="text-center fw-bold">{equipo.posicion}</td>
                                          <td>
                                            <div className="d-flex align-items-center">
                                              <LogoEquipo nombre={equipo.nombre} style={{ width: '20px', height: '20px', marginRight: '6px' }} />
                                              <span className="small">{equipo.nombre}</span>
                                            </div>
                                          </td>
                                          <td className="text-center small">{equipo.pj}</td>
                                          <td className="text-center small">{equipo.pg}</td>
                                          <td className="text-center small">{equipo.pe}</td>
                                          <td className="text-center small">{equipo.pp}</td>
                                          <td className="text-center small">{equipo.gf}</td>
                                          <td className="text-center small">{equipo.gc}</td>
                                          <td className="text-center small">{equipo.dif > 0 ? '+' : ''}{equipo.dif}</td>
                                          <td className="text-center fw-bold small">{equipo.pts}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
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
                <div className="d-flex align-items-center gap-2 mb-2">
                  <div style={{ width: '20px', height: '20px' }} className="bg-success rounded"></div>
                  <span className="small">Clasificados a Play-Offs (Tabla Real)</span>
                </div>
                {usuario && (
                  <div className="d-flex align-items-center gap-2">
                    <div style={{ width: '20px', height: '20px' }} className="bg-info rounded"></div>
                    <span className="small">Clasificados en Tu Tabla Virtual</span>
                  </div>
                )}
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
