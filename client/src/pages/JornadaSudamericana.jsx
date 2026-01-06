import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import NavegacionSudamericana from '../components/NavegacionSudamericana';
import TablasPosicionesSudamericana from '../components/TablasPosicionesSudamericana';
import { LogoEquipo } from '../utils/sudamericanaLogos.jsx';

const API_URL = import.meta.env.VITE_API_URL;

function useAuth() {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuario"));
    return usuario;
  } catch {
    return null;
  }
}

export default function JornadaSudamericana() {
  const usuario = useAuth();
  const navigate = useNavigate();
  const { numero } = useParams();

  const [jornada, setJornada] = useState(null);
  const [partidos, setPartidos] = useState([]);
  const [pronosticos, setPronosticos] = useState({});
  const [estadisticas, setEstadisticas] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!usuario) {
      navigate("/login");
      return;
    }
    
    cargarDatos();
  }, [numero]);

  const cargarDatos = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Cargar jornada y partidos
      const jornadaRes = await axios.get(`${API_URL}/api/sudamericana/jornadas/${numero}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // La API devuelve la jornada con los partidos incluidos
      const { partidos, ...jornadaData } = jornadaRes.data;
      setJornada(jornadaData);
      setPartidos(partidos || []);
      
      // Cargar estadísticas solo para jornadas de fase de grupos (1-6)
      if (Number(numero) <= 6) {
        try {
          const estadisticasRes = await axios.get(`${API_URL}/api/sudamericana-estadisticas/estadisticas`);
          setEstadisticas(estadisticasRes.data);
        } catch (error) {
          console.log('No se pudieron cargar estadísticas');
        }
      }
      
      // Cargar pronósticos del usuario
      if (usuario?.id) {
        try {
          const pronosticosRes = await axios.get(
            `${API_URL}/api/sudamericana/pronosticos/jornada/${numero}/usuario/${usuario.id}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          
          const pronosticosMap = {};
          pronosticosRes.data.forEach(p => {
            pronosticosMap[p.partido_id] = {
              goles_local: p.goles_local,
              goles_visita: p.goles_visita
            };
          });
          setPronosticos(pronosticosMap);
        } catch (error) {
          console.log('No hay pronósticos previos');
        }
      }
      
    } catch (error) {
      console.error('Error cargando datos:', error);
      setMensaje('Error al cargar la jornada');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (partidoId, campo, valor) => {
    setPronosticos(prev => ({
      ...prev,
      [partidoId]: {
        ...prev[partidoId],
        [campo]: valor
      }
    }));
  };

  const generarAleatorioTodos = () => {
    const nuevosPronosticos = {};
    partidos.forEach(partido => {
      nuevosPronosticos[partido.id] = {
        goles_local: Math.floor(Math.random() * 4),
        goles_visita: Math.floor(Math.random() * 4),
      };
    });
    setPronosticos(nuevosPronosticos);
  };

  const generarAzarFaseGruposCompleta = async () => {
    if (!confirm('¿Estás seguro de completar TODAS las jornadas de fase de grupos (1-6) con resultados aleatorios?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      
      // Iterar sobre jornadas 1 a 6
      for (let jornadaNum = 1; jornadaNum <= 6; jornadaNum++) {
        // Obtener jornada para el ID
        const responseJornada = await axios.get(
          `${API_URL}/api/sudamericana/jornadas`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const jornadaActual = responseJornada.data.find(j => j.numero === jornadaNum);
        
        if (!jornadaActual) continue;

        // Obtener partidos de la jornada
        const responsePartidos = await axios.get(
          `${API_URL}/api/sudamericana/jornadas/${jornadaNum}/partidos`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const partidosJornada = responsePartidos.data;
        
        // Enviar pronósticos uno por uno
        for (const partido of partidosJornada) {
          await axios.post(
            `${API_URL}/api/sudamericana/pronosticos`,
            {
              partido_id: partido.id,
              jornada_id: jornadaActual.id,
              goles_local: Math.floor(Math.random() * 5),
              goles_visita: Math.floor(Math.random() * 5)
            },
            { 
              headers: { 
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
              } 
            }
          );
        }
      }

      alert('✅ Se completaron todas las jornadas de fase de grupos (1-6) con resultados aleatorios');
      
      // Recargar la jornada actual
      cargarDatos();
    } catch (error) {
      console.error('Error al generar azar fase grupos completa:', error);
      alert('❌ Error al completar fase de grupos: ' + (error.response?.data?.error || error.message));
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

  const guardarPronosticos = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const pronosticosArray = Object.entries(pronosticos).map(([partidoId, datos]) => ({
        partido_id: parseInt(partidoId),
        goles_local: datos.goles_local !== undefined ? parseInt(datos.goles_local) : null,
        goles_visita: datos.goles_visita !== undefined ? parseInt(datos.goles_visita) : null
      }));

      await axios.post(
        `${API_URL}/api/sudamericana/pronosticos/guardar`,
        {
          usuario_id: usuario.id,
          jornada_numero: parseInt(numero),
          pronosticos: pronosticosArray
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMensaje('✅ Pronósticos guardados exitosamente');
      setTimeout(() => setMensaje(''), 3000);
      
    } catch (error) {
      console.error('Error guardando pronósticos:', error);
      const errorMsg = error.response?.data?.error || '❌ Error al guardar pronósticos';
      setMensaje(errorMsg);
      setTimeout(() => setMensaje(''), 5000);
    }
  };

  const getSubtitulo = (numero) => {
    if (numero <= 6) return 'Fase de Grupos';
    if (numero === 7) return 'Play-Offs IDA/VUELTA';
    if (numero === 8) return 'Octavos de Final IDA/VUELTA';
    if (numero === 9) return 'Cuartos de Final IDA/VUELTA';
    if (numero === 10) return 'Semifinales IDA/VUELTA + Final + Cuadro Final';
    return '';
  };

  if (loading) {
    return (
      <div className="container text-center mt-5">
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  if (!jornada) {
    return (
      <div className="container text-center mt-5">
        <div className="alert alert-danger">Jornada no encontrada</div>
        <button className="btn btn-primary" onClick={() => navigate("/sudamericana")}>
          Volver a Sudamericana
        </button>
      </div>
    );
  }

  return (
    <div className="container mt-4 mb-5">
      <div className="text-center mb-4">
        <h1 className="display-6 fw-bold text-success">🟢 Copa Sudamericana 2026</h1>
        
        <h2 className="h4 mb-1">Jornada {numero}</h2>
        <p className="text-muted small mb-3">{getSubtitulo(Number(numero))}</p>
      </div>
        
      {/* Botonera de navegación */}
      <NavegacionSudamericana />
        
      <div className="text-center">
        {!jornada.activa && !jornada.cerrada && (
          <div className="alert alert-warning mt-3">
            ⚠️ Esta jornada aún no está activa. No puedes ingresar pronósticos hasta que el administrador la active.
          </div>
        )}
        
        {jornada.cerrada && (
          <div className="alert alert-warning mt-3">
            🔒 Esta jornada está cerrada. No puedes modificar los pronósticos.
          </div>
        )}
      </div>

      {partidos.length === 0 ? (
        <div className="alert alert-info text-center">
          No hay partidos configurados para esta jornada
        </div>
      ) : (
        <>
          <div className="row">
            {/* Columna de partidos - centrada para J7-J10, 2/3 para J1-J6 */}
            <div className={`col-12 ${Number(numero) <= 6 ? 'col-lg-8' : 'col-lg-10 offset-lg-1'}`}>
              <h5 className="fw-bold mb-3">🎯 Tus Pronósticos</h5>
              <div className="row g-3 mb-4">
                {partidos.map((partido) => (
                  <div key={partido.id} className="col-12 col-md-6">
                    <div className="card shadow-sm">
                      <div className="card-body">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <div className="d-flex flex-column">
                            <h6 className="mb-0 text-muted">
                              {new Date(partido.fecha).toLocaleDateString('es-CL')} - {new Date(partido.fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                            </h6>
                            {Number(numero) >= 7 && Number(numero) <= 10 && partido.tipo_partido && (
                              <span className={`badge mt-1 ${partido.tipo_partido === 'IDA' ? 'bg-info' : partido.tipo_partido === 'FINAL' ? 'bg-warning text-dark' : 'bg-success'}`}>
                                {partido.tipo_partido}
                              </span>
                            )}
                          </div>
                          {partido.bonus > 1 && (
                            <span className="badge bg-warning text-dark">⭐ Bonus x{partido.bonus}</span>
                          )}
                        </div>

                        {(partido.grupo_local || partido.grupo_visita) && Number(numero) < 7 && (
                          <div className="text-center mb-2">
                            <span className="badge bg-success" style={{ fontSize: '0.7rem' }}>
                              GRUPO {partido.grupo_local || partido.grupo_visita}
                            </span>
                          </div>
                        )}

                        <div className="row align-items-center text-center">
                          <div className="col-5">
                            <div className="d-flex align-items-center justify-content-center mb-2">
                              <LogoEquipo nombre={partido.nombre_local} />
                              <p className="fw-bold mb-0">
                                {partido.nombre_local}
                                {partido.pais_local && <span className="text-muted ms-1">({partido.pais_local})</span>}
                              </p>
                            </div>
                            <input
                              type="number"
                              min="0"
                              className="form-control form-control-lg text-center fw-bold"
                              style={{ MozAppearance: 'textfield' }}
                              value={pronosticos[partido.id]?.goles_local ?? ""}
                              onChange={(e) => handleChange(partido.id, "goles_local", e.target.value)}
                              disabled={jornada.cerrada}
                              placeholder="0"
                            />
                          </div>

                          <div className="col-2">
                            <p className="fw-bold text-muted fs-3">VS</p>
                          </div>

                          <div className="col-5">
                            <div className="d-flex align-items-center justify-content-center mb-2">
                              <LogoEquipo nombre={partido.nombre_visita} />
                              <p className="fw-bold mb-0">
                                {partido.nombre_visita}
                                {partido.pais_visita && <span className="text-muted ms-1">({partido.pais_visita})</span>}
                              </p>
                            </div>
                            <input
                              type="number"
                              min="0"
                              className="form-control form-control-lg text-center fw-bold"
                              style={{ MozAppearance: 'textfield' }}
                              value={pronosticos[partido.id]?.goles_visita ?? ""}
                              onChange={(e) => handleChange(partido.id, "goles_visita", e.target.value)}
                              disabled={jornada.cerrada}
                              placeholder="0"
                            />
                          </div>
                        </div>

                        {jornada.cerrada && (
                          <div className="mt-3 pt-3 border-top">
                            <div className="row">
                              <div className="col-6">
                                <small className="text-muted">Resultado:</small>
                                <p className="mb-0 fw-bold">
                                  {partido.goles_local !== null && partido.goles_visita !== null
                                    ? `${partido.goles_local} - ${partido.goles_visita}`
                                    : '-'}
                                </p>
                              </div>
                              <div className="col-6 text-end">
                                <small className="text-muted">Puntos:</small>
                                <p className="mb-0">
                                  <span className={`badge ${pronosticos[partido.id]?.puntos > 0 ? 'bg-success' : 'bg-secondary'}`}>
                                    {pronosticos[partido.id]?.puntos || 0} pts
                                  </span>
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Columna de estadísticas - 1/3 del ancho - Solo en fase de grupos */}
            {Number(numero) <= 6 && Object.keys(estadisticas).length > 0 && (
              <div className="col-12 col-lg-4">
                <TablasPosicionesSudamericana estadisticas={estadisticas} colorTema="success" />
              </div>
            )}
          </div>

          {!jornada.cerrada && jornada.activa && (
            <div className="text-center d-flex gap-3 justify-content-center flex-wrap">
              {Number(numero) <= 6 && (
                <button className="btn btn-outline-warning btn-lg px-4" onClick={generarAzarFaseGruposCompleta}>
                  🎲✨ Azar Fase Grupos Completa
                </button>
              )}
              <button className="btn btn-outline-info btn-lg px-4" onClick={generarAleatorioTodos}>
                🎲 Azar Jornada {numero}
              </button>
              <button className="btn btn-outline-secondary btn-lg px-4" onClick={resetearTodos}>
                🔄 Resetear
              </button>
              <button className="btn btn-success btn-lg px-5" onClick={guardarPronosticos}>
                💾 Guardar Pronósticos
              </button>
              <button
                className="btn btn-outline-secondary btn-lg"
                onClick={() => navigate(`/sudamericana/jornada/${Number(numero) - 1}`)}
                disabled={Number(numero) <= 1}
              >
                ← Anterior
              </button>
              <button
                className="btn btn-outline-secondary btn-lg"
                onClick={() => navigate(`/sudamericana/jornada/${Number(numero) + 1}`)}
                disabled={Number(numero) >= 10}
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}

      {mensaje && (
        <div className={`alert ${mensaje.includes('✅') ? 'alert-success' : 'alert-danger'} text-center mt-4`}>
          {mensaje}
        </div>
      )}

      <div className="text-center mt-4">
        <button className="btn btn-outline-secondary" onClick={() => navigate("/sudamericana")}>
          ← Volver a Sudamericana
        </button>
      </div>
    </div>
  );
}
