import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export default function AdminMundial() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState(null);

  useEffect(() => {
    cargarJornadas();
  }, []);

  const cargarJornadas = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/mundial/jornadas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJornadas(response.data);
    } catch (error) {
      console.error('Error cargando jornadas:', error);
      showMessage('danger', 'Error cargando jornadas');
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const toggleJornada = async (numero) => {
    if (!window.confirm('¿Deseas cambiar el estado de esta jornada?')) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/mundial/jornadas/${numero}/toggle`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showMessage('success', 'Estado de jornada actualizado');
      cargarJornadas();
    } catch (error) {
      console.error('Error:', error);
      showMessage('danger', 'Error actualizando jornada');
    } finally {
      setLoading(false);
    }
  };

  const cerrarJornada = async (numero) => {
    if (!window.confirm('¿Estás seguro de cerrar esta jornada? Los pronósticos ya no podrán modificarse.')) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/mundial/jornadas/${numero}/cerrar`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showMessage('success', 'Jornada cerrada exitosamente');
      cargarJornadas();
    } catch (error) {
      console.error('Error:', error);
      showMessage('danger', 'Error cerrando jornada');
    } finally {
      setLoading(false);
    }
  };

  const abrirJornada = async (numero) => {
    if (!window.confirm('¿Deseas abrir esta jornada nuevamente?')) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/mundial/jornadas/${numero}/abrir`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showMessage('success', 'Jornada abierta exitosamente');
      cargarJornadas();
    } catch (error) {
      console.error('Error:', error);
      showMessage('danger', 'Error abriendo jornada');
    } finally {
      setLoading(false);
    }
  };

  const eliminarFixture = async (numero) => {
    if (!window.confirm('¿Estás seguro de eliminar el fixture de esta jornada? Se eliminarán todos los partidos y pronósticos.')) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API_URL}/api/mundial/jornadas/${numero}/fixture`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showMessage('success', 'Fixture eliminado exitosamente');
      cargarJornadas();
    } catch (error) {
      console.error('Error:', error);
      showMessage('danger', 'Error eliminando fixture');
    } finally {
      setLoading(false);
    }
  };

  const getEstadoBadge = (jornada) => {
    if (jornada.cerrada) {
      return <span className="badge bg-danger">Cerrada</span>;
    } else if (jornada.activa) {
      return <span className="badge bg-success">Abierta</span>;
    } else {
      return <span className="badge bg-secondary">Inactiva</span>;
    }
  };

  const getSubtitulo = (numero) => {
    if (numero <= 3) return 'Fase de Grupos';
    if (numero === 4) return '16vos de Final (16 partidos)';
    if (numero === 5) return 'Octavos de Final (8 partidos)';
    if (numero === 6) return 'Cuartos de Final (4 partidos)';
    if (numero === 7) return 'Semifinales, 3er Lugar y Final (5 partidos)';
    return '';
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>🌍 Admin Mundial 2026</h1>
        <button 
          className="btn btn-secondary"
          onClick={() => navigate('/')}
        >
          ← Volver al Home
        </button>
      </div>

      {message.text && (
        <div className={`alert alert-${message.type} alert-dismissible fade show`} role="alert">
          {message.text}
          <button type="button" className="btn-close" onClick={() => setMessage({ type: '', text: '' })}></button>
        </div>
      )}

      {/* Navegación */}
      <div className="card mb-4">
        <div className="card-header bg-info text-white">
          <h5 className="mb-0">📋 Gestión del Mundial</h5>
        </div>
        <div className="card-body">
          <div className="d-flex flex-wrap gap-2">
            <button 
              className="btn btn-primary"
              onClick={() => navigate('/admin/mundial/fixture')}
            >
              ⚙️ Gestionar Fixtures
            </button>
            <button 
              className="btn btn-warning"
              onClick={() => navigate('/admin/mundial/resultados')}
            >
              ⚽ Ingresar Resultados y Calcular
            </button>
            <button 
              className="btn btn-success"
              onClick={() => navigate('/admin/mundial/gestion')}
            >
              🔧 Gestión y Respaldo
            </button>
          </div>
          
          {/* Botones del Home del Mundial - Centrados */}
          <div className="d-flex flex-wrap justify-content-center gap-2 mt-3">
            <button className="btn btn-info" onClick={() => navigate('/mundial/estadisticas')}>
              📊 Estadísticas
            </button>
            <button className="btn btn-info" onClick={() => navigate('/mundial/clasificacion')}>
              📋 Clasificación
            </button>
            <button className="btn btn-info" onClick={() => navigate('/mundial/puntuacion')}>
              📈 Puntuación
            </button>
            <button className="btn btn-info" onClick={() => navigate('/mundial/ganadores-jornada')}>
              👑 Ganadores
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Jornadas */}
      <div className="card">
        <div className="card-header bg-dark text-white">
          <h5 className="mb-0">🗓️ Jornadas del Mundial 2026</h5>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Cargando...</span>
              </div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Jornada</th>
                    <th>Nombre</th>
                    <th>Fase</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {jornadas.map(jornada => (
                    <tr key={jornada.id}>
                      <td className="fw-bold">J{jornada.numero}</td>
                      <td>{jornada.nombre}</td>
                      <td className="text-muted small">{getSubtitulo(jornada.numero)}</td>
                      <td>{getEstadoBadge(jornada)}</td>
                      <td>
                        <div className="btn-group btn-group-sm" role="group">
                          {!jornada.cerrada && (
                            <button
                              className="btn btn-outline-primary"
                              onClick={() => toggleJornada(jornada.numero)}
                              title="Activar/Desactivar"
                            >
                              {jornada.activa ? '🔒' : '🔓'}
                            </button>
                          )}
                          
                          {jornada.cerrada ? (
                            <button
                              className="btn btn-outline-success"
                              onClick={() => abrirJornada(jornada.numero)}
                              title="Abrir jornada"
                            >
                              🔓 Abrir
                            </button>
                          ) : (
                            <button
                              className="btn btn-outline-danger"
                              onClick={() => cerrarJornada(jornada.numero)}
                              title="Cerrar jornada"
                            >
                              🔒 Cerrar
                            </button>
                          )}

                          <button
                            className="btn btn-outline-danger"
                            onClick={() => eliminarFixture(jornada.numero)}
                            title="Eliminar fixture"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Información */}
      <div className="alert alert-info mt-4">
        <h6 className="alert-heading">📝 Instrucciones:</h6>
        <ul className="mb-0">
          <li><strong>🔓 Activar/Desactivar:</strong> Permite abrir/cerrar pronósticos para una jornada</li>
          <li><strong>🔒 Cerrar:</strong> Cierra definitivamente la jornada (ya no se pueden hacer pronósticos)</li>
          <li><strong>🗑️ Eliminar:</strong> Elimina todo el fixture de la jornada (partidos y pronósticos)</li>
          <li><strong>⚙️ Gestionar Fixtures:</strong> Ir a la página de creación/edición de partidos</li>
          <li><strong>⚽ Ingresar Resultados:</strong> Actualizar los resultados de los partidos</li>
          <li><strong>📊 Calcular Puntos:</strong> Calcular puntos de los usuarios según sus pronósticos</li>
        </ul>
      </div>
    </div>
  );
}
