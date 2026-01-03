import { useState, useEffect } from 'react';
import { Container, Card, Badge, Spinner, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import './TodasNotificaciones.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const TodasNotificaciones = () => {
  const [notificaciones, setNotificaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    cargarNotificaciones();
  }, []);

  const cargarNotificaciones = async () => {
    try {
      setCargando(true);
      setError(null);
      const token = localStorage.getItem('token');
      
      if (!token) {
        navigate('/login');
        return;
      }

      const response = await fetch(`${API_URL}/api/notificaciones/todas?limit=50`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setNotificaciones(data.notificaciones || []);
      } else if (response.status === 401) {
        navigate('/login');
      } else {
        setError('Error cargando notificaciones');
      }
    } catch (error) {
      console.error('Error:', error);
      setError('Error de conexión');
    } finally {
      setCargando(false);
    }
  };

  const marcarComoLeida = async (notificacionId) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_URL}/api/notificaciones/${notificacionId}/marcar-vista`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        // Actualizar estado local
        setNotificaciones(prev => 
          prev.map(n => 
            n.id === notificacionId ? { ...n, leida: true } : n
          )
        );
        
        // Disparar evento para actualizar otros componentes
        window.dispatchEvent(new Event('notificacionLeida'));
      }
    } catch (error) {
      console.error('Error marcando notificación:', error);
    }
  };

  const handleClickNotificacion = async (notificacion) => {
    // Marcar como leída si no lo está
    if (!notificacion.leida) {
      await marcarComoLeida(notificacion.id);
    }

    // Navegar a la URL si existe
    if (notificacion.url) {
      navigate(notificacion.url);
    }
  };

  const obtenerIcono = (tipoNotificacion) => {
    const iconos = {
      'ganador_jornada': '🏆',
      'ganador_acumulado': '👑',
      'resultados_agregados': '📊',
      'fixture_creado': '📅',
      'default': '🔔'
    };
    return iconos[tipoNotificacion] || iconos.default;
  };

  const formatearFecha = (fecha) => {
    const date = new Date(fecha);
    return date.toLocaleString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const obtenerTituloTipo = (tipoNotificacion) => {
    const titulos = {
      'ganador_jornada': 'Ganador de Jornada',
      'ganador_acumulado': 'Ganador Acumulado',
      'resultados_agregados': 'Resultados Agregados',
      'fixture_creado': 'Nuevo Fixture',
      'default': 'Notificación'
    };
    return titulos[tipoNotificacion] || titulos.default;
  };

  const noLeidas = notificaciones.filter(n => !n.leida).length;

  return (
    <Container className="py-4 todas-notificaciones-page">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">
          <span className="icono-titulo">🔔</span> Notificaciones
        </h2>
        {noLeidas > 0 && (
          <Badge bg="danger" className="badge-contador-header">
            {noLeidas} sin leer
          </Badge>
        )}
      </div>

      {cargando ? (
        <div className="text-center py-5">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Cargando...</span>
          </Spinner>
          <p className="mt-3 text-muted">Cargando notificaciones...</p>
        </div>
      ) : error ? (
        <Alert variant="danger">{error}</Alert>
      ) : notificaciones.length === 0 ? (
        <Card className="text-center py-5 notificacion-vacia">
          <Card.Body>
            <div className="icono-vacio">📭</div>
            <h4 className="mt-3">No hay notificaciones</h4>
            <p className="text-muted">Cuando recibas notificaciones aparecerán aquí</p>
          </Card.Body>
        </Card>
      ) : (
        <div className="notificaciones-lista">
          {notificaciones.map((notif) => (
            <Card 
              key={notif.id}
              className={`notificacion-card mb-3 ${!notif.leida ? 'no-leida' : ''}`}
              onClick={() => handleClickNotificacion(notif)}
            >
              <Card.Body className="d-flex">
                <div className="notificacion-icono-grande">
                  {notif.icono || obtenerIcono(notif.tipo_notificacion)}
                </div>
                <div className="notificacion-contenido-completo flex-grow-1">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h5 className="notificacion-titulo mb-1">
                      {obtenerTituloTipo(notif.tipo_notificacion)}
                    </h5>
                    {!notif.leida && (
                      <Badge bg="primary" className="badge-nuevo">Nuevo</Badge>
                    )}
                  </div>
                  <p className="notificacion-mensaje-completo mb-2">
                    {notif.mensaje}
                  </p>
                  <div className="d-flex justify-content-between align-items-center">
                    <small className="text-muted">
                      {formatearFecha(notif.fecha_calculo)}
                    </small>
                    {notif.competencia && (
                      <Badge bg="secondary" className="badge-competencia">
                        {notif.competencia.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </div>
              </Card.Body>
            </Card>
          ))}
        </div>
      )}
    </Container>
  );
};

export default TodasNotificaciones;
