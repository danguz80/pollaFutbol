import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getMundialLogo } from '../utils/mundialLogos';
import NavegacionMundial from '../components/NavegacionMundial';

const API_URL = import.meta.env.VITE_API_URL;

function useAuth() {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuario"));
    return usuario;
  } catch {
    return null;
  }
}

export default function EstadisticasMundial() {
  const navigate = useNavigate();
  const usuario = useAuth();
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState([]);
  const [tablasUsuario, setTablasUsuario] = useState({});
  const [tablasOficiales, setTablasOficiales] = useState({});
  const [clasificadosOficiales, setClasificadosOficiales] = useState([]);
  const [mostrarOficial, setMostrarOficial] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Cargar grupos disponibles
      const gruposRes = await axios.get(`${API_URL}/api/mundial/grupos`, { headers });
      setGrupos(gruposRes.data);

      // Cargar tablas del usuario
      const tablasUsuarioRes = await axios.get(
        `${API_URL}/api/mundial-clasificados/todas-tablas-usuario`,
        { headers }
      );
      setTablasUsuario(tablasUsuarioRes.data);

      // Cargar clasificados oficiales
      const clasificadosRes = await axios.get(
        `${API_URL}/api/mundial-clasificados/clasificados-oficiales`,
        { headers }
      );
      setClasificadosOficiales(clasificadosRes.data);

      // Calcular tablas oficiales para cada grupo
      const tablasOfic = {};
      for (const grupo of gruposRes.data) {
        try {
          tablasOfic[grupo.letra] = [];
        } catch (error) {
          console.error(`Error calculando tabla oficial grupo ${grupo.letra}:`, error);
        }
      }
      setTablasOficiales(tablasOfic);

    } catch (error) {
      console.error('Error cargando datos:', error);
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.error('Token inválido o expirado, redirigiendo a login');
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const obtenerPosicionColor = (posicion) => {
    if (posicion === 1 || posicion === 2) {
      return 'table-success'; // Clasifican directamente
    }
    return '';
  };

  const esClasificadoOficial = (equipo, grupo) => {
    return clasificadosOficiales.some(
      c => c.equipo_nombre === equipo && c.grupo === grupo
    );
  };

  if (loading) {
    return (
      <div className="container mt-5">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
          <p className="mt-3">Cargando estadísticas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4 mb-5">
      <div className="text-center mb-4">
        <h1 className="display-5 fw-bold">📊 Estadísticas - Mundial 2026</h1>
        <p className="lead text-muted">Tus tablas de grupos vs realidad</p>
      </div>

      {/* Navegación Mundial */}
      <NavegacionMundial />

      {/* Botón para alternar vista */}
      <div className="d-flex justify-content-center mb-4">
        <button
          className="btn btn-lg btn-outline-primary"
          onClick={() => setMostrarOficial(!mostrarOficial)}
        >
          {mostrarOficial ? '👤 Ver mis pronósticos' : '⚽ Ver resultados oficiales'}
        </button>
      </div>

      {/* Nota informativa */}
      <div className="alert alert-info">
        <strong>ℹ️ Cómo funciona:</strong><br />
        • <strong>Verde</strong>: Equipos en posiciones de clasificación (1° y 2° pasan a 16vos de Final)<br />
        • Las tablas se calculan según tus pronósticos de la fase de grupos (J1-J3)<br />
        • Cada equipo que aciertes en los primeros 2 lugares suma 2 puntos extra
      </div>

      {/* Vista según el toggle */}
      <div className="row g-4">
        {mostrarOficial ? (
          <div className="col-12">
            <div className="alert alert-warning text-center">
              <strong>🚧 Próximamente:</strong> Las tablas oficiales se mostrarán aquí una vez que se jueguen los partidos de la fase de grupos.
            </div>
          </div>
        ) : (
          // Mostrar tablas del usuario
          Object.keys(tablasUsuario).length > 0 ? (
            Object.entries(tablasUsuario).map(([letra, tabla]) => (
              <div key={letra} className="col-lg-6 col-md-12">
                <div className="card shadow-sm h-100">
                  <div className="card-header bg-primary text-white">
                    <h5 className="mb-0 text-center">
                      <strong>Grupo {letra}</strong>
                    </h5>
                  </div>
                  <div className="card-body p-0">
                    {tabla.length > 0 ? (
                      <div className="table-responsive">
                        <table className="table table-hover mb-0">
                          <thead className="table-light">
                            <tr>
                              <th className="text-center" style={{ width: '40px' }}>#</th>
                              <th>Equipo</th>
                              <th className="text-center" style={{ width: '50px' }}>PJ</th>
                              <th className="text-center" style={{ width: '50px' }}>PG</th>
                              <th className="text-center" style={{ width: '50px' }}>PE</th>
                              <th className="text-center" style={{ width: '50px' }}>PP</th>
                              <th className="text-center" style={{ width: '50px' }}>GF</th>
                              <th className="text-center" style={{ width: '50px' }}>GC</th>
                              <th className="text-center" style={{ width: '50px' }}>DIF</th>
                              <th className="text-center" style={{ width: '50px' }}><strong>PTS</strong></th>
                            </tr>
                          </thead>
                          <tbody>
                            {tabla.map((equipo, index) => {
                              const posicion = index + 1;
                              const esClasificado = esClasificadoOficial(equipo.nombre, letra);
                              return (
                                <tr 
                                  key={equipo.nombre} 
                                  className={obtenerPosicionColor(posicion)}
                                >
                                  <td className="text-center fw-bold">{posicion}</td>
                                  <td>
                                    <div className="d-flex align-items-center gap-2">
                                      {getMundialLogo(equipo.nombre) && (
                                        <img 
                                          src={getMundialLogo(equipo.nombre)} 
                                          alt={equipo.nombre}
                                          style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                                          onError={(e) => e.target.style.display = 'none'}
                                        />
                                      )}
                                      <span className="fw-semibold">{equipo.nombre}</span>
                                      {esClasificado && posicion <= 2 && (
                                        <span className="badge bg-success">✓</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="text-center">{equipo.pj}</td>
                                  <td className="text-center">{equipo.pg}</td>
                                  <td className="text-center">{equipo.pe}</td>
                                  <td className="text-center">{equipo.pp}</td>
                                  <td className="text-center">{equipo.gf}</td>
                                  <td className="text-center">{equipo.gc}</td>
                                  <td className="text-center">{equipo.dif > 0 ? '+' : ''}{equipo.dif}</td>
                                  <td className="text-center">
                                    <strong>{equipo.puntos}</strong>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-4 text-center text-muted">
                        <p>Aún no has hecho pronósticos para este grupo</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-12">
              <div className="alert alert-warning text-center">
                <strong>⚠️ Sin pronósticos:</strong> Aún no has realizado pronósticos para la fase de grupos.
              </div>
            </div>
          )
        )}
      </div>

      {/* Botón de regreso */}
      <div className="d-flex justify-content-center mt-4">
        <button
          className="btn btn-secondary btn-lg"
          onClick={() => navigate('/mundial')}
        >
          ← Volver al Mundial
        </button>
      </div>
    </div>
  );
}
