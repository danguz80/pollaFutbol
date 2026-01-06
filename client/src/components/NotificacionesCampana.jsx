import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './NotificacionesCampana.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const NotificacionesCampana = () => {
  const [mostrarDropdown, setMostrarDropdown] = useState(false);
  const [notificaciones, setNotificaciones] = useState([]);
  const [contador, setContador] = useState(0);
  const [cargando, setCargando] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setMostrarDropdown(false);
      }
    };

    if (mostrarDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mostrarDropdown]);

  // Cargar contador de notificaciones al montar
  useEffect(() => {
    const token = localStorage.getItem('token');
    
    // Solo cargar si hay usuario autenticado
    if (!token) {
      setContador(0);
      return;
    }
    
    cargarContador();
    
    // Recargar cada 10 segundos (más frecuente para detectar cambios)
    const interval = setInterval(() => {
      // Verificar token antes de cada llamada
      const currentToken = localStorage.getItem('token');
      if (currentToken) {
        cargarContador();
      }
    }, 10000);
    
    // Escuchar evento de notificación leída
    const handleNotificacionLeida = () => {
      cargarContador();
    };
    
    // Escuchar evento de nueva notificación creada
    const handleNuevaNotificacion = () => {
      cargarContador();
      if (mostrarDropdown) {
        cargarNotificaciones();
      }
    };
    
    window.addEventListener('notificacionLeida', handleNotificacionLeida);
    window.addEventListener('userLoggedIn', handleNotificacionLeida);
    window.addEventListener('nuevaNotificacion', handleNuevaNotificacion);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('notificacionLeida', handleNotificacionLeida);
      window.removeEventListener('userLoggedIn', handleNotificacionLeida);
      window.removeEventListener('nuevaNotificacion', handleNuevaNotificacion);
    };
  }, [mostrarDropdown]);

  const cargarContador = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setContador(0);
        return;
      }

      const response = await fetch(`${API_URL}/api/notificaciones/contador`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setContador(data.contador || 0);
      } else if (response.status === 403 || response.status === 401) {
        // Token inválido o expirado, limpiar
        setContador(0);
      }
    } catch (error) {
      // Error de red o servidor, no mostrar en consola
      setContador(0);
    }
  };

  const cargarNotificaciones = async () => {
    try {
      setCargando(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setNotificaciones([]);
        return;
      }

      // Cargar TODAS las notificaciones (leídas y no leídas) para el dropdown
      const response = await fetch(`${API_URL}/api/notificaciones/todas?limit=20`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const notifs = data.notificaciones || [];
        setNotificaciones(notifs);
      } else if (response.status === 403 || response.status === 401) {
        setNotificaciones([]);
      } else {
        setNotificaciones([]);
      }
    } catch (error) {
      // Error de red, no mostrar en consola
      setNotificaciones([]);
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
        // Actualizar el estado local
        setNotificaciones(prev => 
          prev.map(n => 
            n.id === notificacionId ? { ...n, leida: true } : n
          )
        );
        
        // Actualizar contador
        await cargarContador();
      }
    } catch (error) {
      console.error('❌ Error marcando notificación:', error);
    }
  };

  const handleClickNotificacion = async (notificacion) => {
    // Marcar como leída
    if (!notificacion.leida) {
      await marcarComoLeida(notificacion.id);
    }

    // Navegar a la URL si existe
    if (notificacion.url) {
      setMostrarDropdown(false);
      navigate(notificacion.url);
    }
  };

  const toggleDropdown = () => {
    if (!mostrarDropdown) {
      cargarNotificaciones();
    }
    setMostrarDropdown(!mostrarDropdown);
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
    const ahora = new Date();
    const diffMs = ahora - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHoras = Math.floor(diffMs / 3600000);
    const diffDias = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHoras < 24) return `Hace ${diffHoras}h`;
    if (diffDias === 1) return 'Ayer';
    if (diffDias < 7) return `Hace ${diffDias} días`;
    
    return date.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="notificaciones-campana" ref={dropdownRef}>
      <button 
        className="btn-campana" 
        onClick={toggleDropdown}
        aria-label="Notificaciones"
      >
        <span className="icono-campana">🔔</span>
        {contador > 0 && (
          <span className="badge-contador">{contador > 9 ? '9+' : contador}</span>
        )}
      </button>

      {mostrarDropdown && (
        <div className="dropdown-notificaciones">
          <div className="dropdown-header">
            <div className="d-flex justify-content-between align-items-center w-100">
              <h6 className="m-0">Notificaciones</h6>
              <div className="d-flex gap-2 align-items-center">
                <button 
                  className="btn btn-sm btn-light"
                  onClick={(e) => {
                    e.stopPropagation();
                    cargarContador();
                    cargarNotificaciones();
                  }}
                  title="Recargar notificaciones"
                >
                  🔄
                </button>
                {contador > 0 && (
                  <span className="badge bg-danger">{contador} nuevas</span>
                )}
                {notificaciones.length > 0 && (
                  <span className="badge bg-secondary">{notificaciones.length} total</span>
                )}
              </div>
            </div>
          </div>

          <div className="dropdown-body">
            {cargando ? (
              <div className="notificacion-item text-center">
                <div className="spinner-border spinner-border-sm" role="status">
                  <span className="visually-hidden">Cargando...</span>
                </div>
              </div>
            ) : notificaciones.length === 0 ? (
              <div className="notificacion-item text-center text-muted">
                No hay notificaciones
              </div>
            ) : (
              notificaciones.map(notif => (
                <div 
                  key={notif.id}
                  className={`notificacion-item ${!notif.leida ? 'no-leida' : ''}`}
                  onClick={() => handleClickNotificacion(notif)}
                >
                  <div className="notificacion-icono">
                    {notif.icono || obtenerIcono(notif.tipo_notificacion)}
                  </div>
                  <div className="notificacion-contenido">
                    <p className="notificacion-mensaje">{notif.mensaje}</p>
                    <small className="notificacion-fecha">
                      {formatearFecha(notif.fecha_calculo)}
                    </small>
                  </div>
                  {!notif.leida && (
                    <div className="punto-no-leido"></div>
                  )}
                </div>
              ))
            )}
          </div>

          {notificaciones.length > 0 && (
            <div className="dropdown-footer">
              <button 
                className="btn btn-link btn-sm w-100"
                onClick={() => {
                  setMostrarDropdown(false);
                  navigate('/notificaciones');
                }}
              >
                Ver todas las notificaciones
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificacionesCampana;
