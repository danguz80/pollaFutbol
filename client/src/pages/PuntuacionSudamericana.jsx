import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import NavegacionSudamericana from '../components/NavegacionSudamericana';

const API_URL = import.meta.env.VITE_API_URL;

export default function PuntuacionSudamericana() {
  const navigate = useNavigate();
  const [reglas, setReglas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    verificarAdmin();
    cargarReglas();
  }, []);

  const verificarAdmin = () => {
    try {
      const usuarioStr = localStorage.getItem('usuario');
      if (usuarioStr) {
        const usuario = JSON.parse(usuarioStr);
        setEsAdmin(usuario.rol === 'admin');
        console.log('Rol del usuario:', usuario.rol);
      }
    } catch (error) {
      console.error('Error verificando rol:', error);
      setEsAdmin(false);
    }
  };

  const cargarReglas = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/sudamericana-puntuacion/reglas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReglas(response.data);
    } catch (error) {
      console.error('Error cargando reglas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePuntosChange = (id, nuevoPuntos) => {
    setReglas(reglas.map(regla => 
      regla.id === id ? { ...regla, puntos: parseInt(nuevoPuntos) || 0 } : regla
    ));
  };

  const guardarCambios = async () => {
    try {
      setGuardando(true);
      const token = localStorage.getItem('token');
      
      await axios.put(
        `${API_URL}/api/sudamericana-puntuacion/reglas`,
        { reglas: reglas.map(r => ({ id: r.id, puntos: r.puntos })) },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setModoEdicion(false);
      alert('Puntuación actualizada exitosamente');
    } catch (error) {
      console.error('Error guardando cambios:', error);
      alert('Error al guardar los cambios');
    } finally {
      setGuardando(false);
    }
  };

  const cancelarEdicion = () => {
    setModoEdicion(false);
    cargarReglas(); // Recargar para descartar cambios
  };

  const agruparPorFase = () => {
    const grupos = {};
    reglas.forEach(regla => {
      if (!grupos[regla.fase]) {
        grupos[regla.fase] = [];
      }
      grupos[regla.fase].push(regla);
    });
    return grupos;
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

  const gruposPorFase = agruparPorFase();
  const ordenFases = ['FASE DE GRUPOS', 'CLASIFICACIÓN', 'PLAY-OFFS', 'OCTAVOS', 'CUARTOS', 'SEMIFINALES', 'FINAL', 'CAMPEÓN'];

  return (
    <div className="container mt-4 mb-5">
      <div className="text-center mb-4">
        <h1 className="display-6 fw-bold text-primary">🏆 Sistema de Puntuación - Sudamericana</h1>
        <p className="text-muted">Conoce cómo se asignan los puntos en cada fase del torneo</p>
      </div>

      {/* Botonera Principal */}
      <NavegacionSudamericana />

      {/* Botones de Edición (Solo Admin) */}
      {esAdmin && (
        <div className="mb-4 text-center">
          {!modoEdicion ? (
            <button 
              className="btn btn-outline-primary"
              onClick={() => setModoEdicion(true)}
            >
              ✏️ Editar Puntuación
            </button>
          ) : (
            <div className="d-flex gap-2 justify-content-center">
              <button 
                className="btn btn-success"
                onClick={guardarCambios}
                disabled={guardando}
              >
                {guardando ? 'Guardando...' : '💾 Guardar Cambios'}
              </button>
              <button 
                className="btn btn-secondary"
                onClick={cancelarEdicion}
                disabled={guardando}
              >
                ❌ Cancelar
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tablas de Puntuación */}
      <div className="row g-4">
        {ordenFases.map(fase => {
          const reglasGrupo = gruposPorFase[fase] || [];
          if (reglasGrupo.length === 0) return null;

          return (
            <div key={fase} className="col-12 col-lg-6">
              <div className="card shadow-sm h-100">
                <div className="card-header bg-primary text-white">
                  <h5 className="mb-0 fw-bold">{fase}</h5>
                </div>
                <div className="card-body p-0">
                  <table className="table table-striped mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Concepto</th>
                        <th style={{ width: '100px' }} className="text-center">Puntos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reglasGrupo.map(regla => (
                        <tr key={regla.id}>
                          <td>{regla.concepto}</td>
                          <td className="text-center">
                            {modoEdicion ? (
                              <input
                                type="number"
                                className="form-control form-control-sm text-center"
                                value={regla.puntos}
                                onChange={(e) => handlePuntosChange(regla.id, e.target.value)}
                                min="0"
                                style={{ width: '80px', margin: '0 auto' }}
                              />
                            ) : (
                              <span className="badge bg-warning text-dark fs-6 fw-bold">
                                {regla.puntos}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Información adicional */}
      <div className="card mt-4">
        <div className="card-body">
          <h5 className="card-title">ℹ️ Información Importante</h5>
          <ul className="mb-0">
            <li><strong>Signo 1X2:</strong> Acertar si gana local (1), empate (X) o gana visitante (2)</li>
            <li><strong>Diferencia de goles:</strong> Acertar la diferencia de goles del resultado</li>
            <li><strong>Resultado exacto:</strong> Acertar el marcador exacto del partido</li>
            <li><strong>Posición exacta:</strong> Acertar la posición final de un equipo en su grupo</li>
            <li className="text-danger fw-bold">Los puntos <strong>NO son acumulativos</strong>: solo se otorga la puntuación más alta. Si aciertas el resultado exacto (5 pts), solo obtienes 5 puntos, no se suman los puntos de diferencia ni signo.</li>
          </ul>
        </div>
      </div>

      {/* Botón Volver */}
      <div className="text-center mt-4">
        <button 
          className="btn btn-outline-secondary btn-lg"
          onClick={() => navigate('/sudamericana')}
        >
          ← Volver a Sudamericana
        </button>
      </div>
    </div>
  );
}
