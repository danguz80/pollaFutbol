import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { getMundialLogoPorNombre } from '../utils/mundialLogos';

const API_URL = import.meta.env.VITE_API_URL;

function useAuth() {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuario"));
    return usuario;
  } catch {
    return null;
  }
}

export default function JornadaMundial() {
  const usuario = useAuth();
  const navigate = useNavigate();
  const { numero } = useParams();

  const [jornada, setJornada] = useState(null);
  const [partidos, setPartidos] = useState([]);
  const [pronosticos, setPronosticos] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!usuario) {
      navigate("/login");
      return;
    }
    
    // Solo permitir acceso si está explícitamente en true
    if (usuario.activo_mundial !== true) {
      alert("⚠️ No tienes acceso para ingresar pronósticos en el Mundial 2026. Contacta al administrador.");
      navigate("/");
      return;
    }
    
    cargarDatos();
  }, [numero]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      
      // Cargar jornada
      const jornadaResponse = await axios.get(
        `${API_URL}/api/mundial/jornadas`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const jornadaActual = jornadaResponse.data.find(j => j.numero === Number(numero));
      setJornada(jornadaActual);

      // Cargar partidos de esta jornada
      const partidosResponse = await axios.get(
        `${API_URL}/api/mundial/partidos`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const partidosJornada = partidosResponse.data.filter(
        p => p.jornada_numero === Number(numero)
      );
      setPartidos(partidosJornada);

      // Cargar pronósticos del usuario para esta jornada
      try {
        const pronosticosResponse = await axios.get(
          `${API_URL}/api/mundial/pronosticos/${numero}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        const pronosticosMap = {};
        pronosticosResponse.data.forEach(p => {
          pronosticosMap[p.partido_id] = {
            goles_local: p.resultado_local,
            goles_visita: p.resultado_visitante,
          };
        });
        setPronosticos(pronosticosMap);
      } catch (error) {
        console.log("No hay pronósticos previos");
      }

    } catch (error) {
      console.error("Error cargando datos:", error);
      setMensaje("Error cargando datos de la jornada");
    } finally {
      setLoading(false);
    }
  };

  const handlePronosticoChange = (partidoId, campo, valor) => {
    setPronosticos(prev => ({
      ...prev,
      [partidoId]: {
        ...prev[partidoId],
        [campo]: valor === "" ? "" : Number(valor)
      }
    }));
  };

  const generarAleatorioTodos = () => {
    const nuevosPronosticos = {};
    partidos.forEach(partido => {
      nuevosPronosticos[partido.id] = {
        goles_local: Math.floor(Math.random() * 4), // 0 a 3
        goles_visita: Math.floor(Math.random() * 4), // 0 a 3
      };
    });
    setPronosticos(nuevosPronosticos);
  };

  const generarAzarFaseGruposCompleta = async () => {
    if (!confirm('¿Estás seguro de completar TODAS las jornadas de fase de grupos (1-3) con resultados aleatorios?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      
      // Iterar sobre jornadas 1 a 3 (fase de grupos del Mundial)
      for (let jornadaNum = 1; jornadaNum <= 3; jornadaNum++) {
        // Obtener partidos de la jornada
        const responsePartidos = await axios.get(
          `${API_URL}/api/mundial/partidos`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const todoPartidos = responsePartidos.data;
        const partidosJornada = todoPartidos.filter(p => p.jornada_numero === jornadaNum);
        
        if (partidosJornada.length === 0) continue;

        // Preparar pronósticos aleatorios
        const pronosticosArray = partidosJornada.map(partido => ({
          partido_id: partido.id,
          resultado_local: Math.floor(Math.random() * 4),
          resultado_visitante: Math.floor(Math.random() * 4)
        }));

        // Enviar pronósticos de esta jornada
        await axios.post(
          `${API_URL}/api/mundial/pronosticos/${jornadaNum}`,
          { pronosticos: pronosticosArray },
          { 
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            } 
          }
        );
      }

      alert('✅ Se completaron todas las jornadas de fase de grupos (1-3) con resultados aleatorios');
      
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
    if (!jornada?.activa) {
      alert("⚠️ Esta jornada no está disponible para ingresar pronósticos");
      return;
    }

    if (jornada?.cerrada) {
      alert("⚠️ Esta jornada ya está cerrada, no se pueden modificar pronósticos");
      return;
    }

    const pronosticosArray = partidos.map(partido => {
      const pronostico = pronosticos[partido.id] || {};
      return {
        partido_id: partido.id,
        resultado_local: pronostico.goles_local ?? 0,
        resultado_visitante: pronostico.goles_visita ?? 0
      };
    });

    // Validar que todos los partidos tengan pronósticos
    const hayVacios = pronosticosArray.some(
      p => p.resultado_local === "" || p.resultado_visitante === "" ||
           p.resultado_local === undefined || p.resultado_visitante === undefined
    );

    if (hayVacios) {
      alert("⚠️ Debes completar todos los pronósticos antes de guardar");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${API_URL}/api/mundial/pronosticos/${numero}`,
        { pronosticos: pronosticosArray },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMensaje("✅ Pronósticos guardados exitosamente");
      setTimeout(() => setMensaje(""), 3000);
    } catch (error) {
      console.error("Error guardando pronósticos:", error);
      alert(`❌ Error: ${error.response?.data?.error || error.message}`);
    }
  };

  const getSubtitulo = (numero) => {
    if (numero <= 3) return 'Fase de Grupos';
    if (numero === 4) return '16vos de Final';
    if (numero === 5) return 'Octavos de Final';
    if (numero === 6) return 'Cuartos de Final';
    if (numero === 7) return 'Semifinales y Final';
    return '';
  };

  if (loading) {
    return (
      <div className="container text-center mt-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  if (!jornada) {
    return (
      <div className="container mt-4">
        <div className="alert alert-danger">
          <h4>❌ Jornada no encontrada</h4>
          <button className="btn btn-primary mt-2" onClick={() => navigate("/mundial")}>
            Volver al Mundial
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4 mb-5">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">🌍 {jornada.nombre}</h2>
          <p className="text-muted mb-0">{getSubtitulo(Number(numero))}</p>
        </div>
        <button 
          className="btn btn-secondary"
          onClick={() => navigate("/mundial")}
        >
          ← Volver
        </button>
      </div>

      {/* Estado de la Jornada */}
      <div className="card mb-4">
        <div className={`card-header ${jornada.cerrada ? 'bg-danger' : jornada.activa ? 'bg-success' : 'bg-warning'} text-white`}>
          <h5 className="mb-0">
            {jornada.cerrada ? '🔒 Jornada Cerrada' : jornada.activa ? '✅ Jornada Abierta' : '⏸️ Jornada Inactiva'}
          </h5>
        </div>
        <div className="card-body">
          {jornada.cerrada ? (
            <p className="mb-0">Esta jornada ya está cerrada. Puedes ver los resultados pero no modificar pronósticos.</p>
          ) : jornada.activa ? (
            <p className="mb-0">Puedes ingresar tus pronósticos. Recuerda guardarlos antes del cierre.</p>
          ) : (
            <p className="mb-0">Esta jornada aún no está disponible para ingresar pronósticos.</p>
          )}
        </div>
      </div>

      {/* Mensaje de confirmación */}
      {mensaje && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          {mensaje}
          <button type="button" className="btn-close" onClick={() => setMensaje("")}></button>
        </div>
      )}

      {/* Partidos */}
      {partidos.length === 0 ? (
        <div className="alert alert-info">
          <h5>📋 No hay partidos programados</h5>
          <p className="mb-0">El fixture de esta jornada aún no ha sido creado por el administrador.</p>
        </div>
      ) : (
        <>
          <div className="row g-3">
            {partidos.map((partido, index) => {
              const pronostico = pronosticos[partido.id] || {};
              const puedeEditar = jornada.activa && !jornada.cerrada;
              
              const getBorderClass = (bonus) => {
                if (Number(bonus) === 2) return 'border-warning border-3';
                if (Number(bonus) === 3) return 'border-danger border-3';
                return '';
              };

              const getBonusBanner = (bonus) => {
                if (Number(bonus) === 2) {
                  return (
                    <div className="text-center py-2 fw-bold" style={{ 
                      backgroundColor: '#ffc107', 
                      color: '#000',
                      fontSize: '1.1rem',
                      borderTopLeftRadius: '0.375rem',
                      borderTopRightRadius: '0.375rem'
                    }}>
                      ⚡ PARTIDO BONUS x2 ⚡
                    </div>
                  );
                }
                if (Number(bonus) === 3) {
                  return (
                    <div className="text-center py-2 fw-bold" style={{ 
                      backgroundColor: '#dc3545', 
                      color: '#fff',
                      fontSize: '1.1rem',
                      borderTopLeftRadius: '0.375rem',
                      borderTopRightRadius: '0.375rem'
                    }}>
                      ⚡ PARTIDO BONUS x3 ⚡
                    </div>
                  );
                }
                return null;
              };

              return (
                <div key={partido.id} className="col-12 col-md-6 col-lg-4">
                  <div className={`card shadow-sm h-100 ${getBorderClass(partido.bonus)}`}>
                    {getBonusBanner(partido.bonus)}
                    <div className="card-header bg-info text-white text-center">
                      <small className="fw-bold">Partido {index + 1}</small>
                      {partido.grupo && (
                        <span className="badge bg-primary ms-2">Grupo {partido.grupo}</span>
                      )}
                    </div>
                    <div className="card-body">
                      <div className="row align-items-center text-center">
                        {/* Equipo Local */}
                        <div className="col-5">
                          <img 
                            src={getMundialLogoPorNombre(partido.equipo_local)} 
                            alt={partido.equipo_local}
                            className="mb-2"
                            style={{ width: '60px', height: '60px', objectFit: 'contain' }}
                            onError={(e) => e.target.style.display = 'none'}
                          />
                          <p className="fw-bold mb-2 small">{partido.equipo_local}</p>
                          <input
                            type="number"
                            min="0"
                            className="form-control form-control-lg text-center fw-bold"
                            style={{ MozAppearance: 'textfield' }}
                            value={pronostico.goles_local ?? ""}
                            onChange={(e) => handlePronosticoChange(partido.id, 'goles_local', e.target.value)}
                            disabled={!puedeEditar}
                            placeholder="0"
                          />
                        </div>

                        {/* VS */}
                        <div className="col-2">
                          <p className="fw-bold text-muted fs-3 mb-0">VS</p>
                        </div>

                        {/* Equipo Visitante */}
                        <div className="col-5">
                          <img 
                            src={getMundialLogoPorNombre(partido.equipo_visitante)} 
                            alt={partido.equipo_visitante}
                            className="mb-2"
                            style={{ width: '60px', height: '60px', objectFit: 'contain' }}
                            onError={(e) => e.target.style.display = 'none'}
                          />
                          <p className="fw-bold mb-2 small">{partido.equipo_visitante}</p>
                          <input
                            type="number"
                            min="0"
                            className="form-control form-control-lg text-center fw-bold"
                            style={{ MozAppearance: 'textfield' }}
                            value={pronostico.goles_visita ?? ""}
                            onChange={(e) => handlePronosticoChange(partido.id, 'goles_visita', e.target.value)}
                            disabled={!puedeEditar}
                            placeholder="0"
                          />
                        </div>
                      </div>

                      {/* Mostrar resultado si existe y jornada cerrada */}
                      {jornada.cerrada && partido.resultado_local !== null && partido.resultado_visitante !== null && (
                        <div className="text-center mt-3">
                          <span className="badge bg-success fs-6">
                            Resultado: {partido.resultado_local} - {partido.resultado_visitante}
                          </span>
                          {pronostico.puntos !== undefined && (
                            <span className={`badge ${pronostico.puntos > 0 ? 'bg-primary' : 'bg-secondary'} fs-6 ms-2`}>
                              {pronostico.puntos} pts
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {jornada.activa && !jornada.cerrada && (
            <div className="text-center d-flex gap-3 justify-content-center flex-wrap mt-4">
              {Number(numero) <= 3 && (
                <button className="btn btn-outline-warning btn-lg px-4" onClick={generarAzarFaseGruposCompleta}>
                  🎲✨ Azar Fase Grupos (3 Jornadas)
                </button>
              )}
              <button className="btn btn-outline-info btn-lg px-4" onClick={generarAleatorioTodos}>
                🎲 Azar Solo Jornada {numero}
              </button>
              <button className="btn btn-outline-secondary btn-lg px-4" onClick={resetearTodos}>
                🔄 Resetear
              </button>
              <button className="btn btn-primary btn-lg px-5" onClick={guardarPronosticos}>
                💾 Guardar Pronósticos
              </button>
              <button
                className="btn btn-outline-secondary btn-lg"
                onClick={() => navigate(`/mundial/jornada/${Number(numero) - 1}`)}
                disabled={Number(numero) <= 1}
              >
                ← Anterior
              </button>
              <button
                className="btn btn-outline-secondary btn-lg"
                onClick={() => navigate(`/mundial/jornada/${Number(numero) + 1}`)}
                disabled={Number(numero) >= 7}
              >
                Siguiente →
              </button>
            </div>
          )}

          {/* Información adicional */}
          <div className="alert alert-info">
            <h6 className="alert-heading">ℹ️ Información:</h6>
            <ul className="mb-0">
              <li><strong>Bonus de la jornada:</strong> Los partidos pueden tener multiplicadores de puntos</li>
              <li>Completa todos los pronósticos antes de guardar</li>
              <li>Puedes modificar tus pronósticos mientras la jornada esté abierta</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
