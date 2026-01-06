import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const useNotificaciones = () => {
  const [notificacionesPendientes, setNotificacionesPendientes] = useState([]);
  const [notificacionActual, setNotificacionActual] = useState(null);
  const [mostrandoModal, setMostrandoModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Obtener notificaciones pendientes al montar el componente y cuando cambia el token
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      cargarNotificacionesPendientes();
    }
    
    // Escuchar evento de login para recargar notificaciones
    const handleLogin = () => {
      cargarNotificacionesPendientes();
    };
    
    window.addEventListener('userLoggedIn', handleLogin);
    
    return () => {
      window.removeEventListener('userLoggedIn', handleLogin);
    };
  }, []);

  // Mostrar las notificaciones una por una
  useEffect(() => {
    if (notificacionesPendientes.length > 0 && !mostrandoModal) {
      const siguiente = notificacionesPendientes[0];
      setNotificacionActual(siguiente);
      setMostrandoModal(true);
    }
  }, [notificacionesPendientes, mostrandoModal]);

  const cargarNotificacionesPendientes = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        setNotificacionesPendientes([]);
        return;
      }

      const response = await axios.get(`${API_URL}/api/notificaciones/pendientes`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setNotificacionesPendientes(response.data);
    } catch (error) {
      // Si es error 401/403, el usuario no está autenticado
      if (error.response?.status === 401 || error.response?.status === 403) {
        setNotificacionesPendientes([]);
      }
      // No mostrar otros errores en consola
    } finally {
      setLoading(false);
    }
  };

  const marcarComoVista = async (notificacionId) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      await axios.post(
        `${API_URL}/api/notificaciones/${notificacionId}/marcar-vista`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Remover de la lista de pendientes
      setNotificacionesPendientes(prev => 
        prev.filter(n => n.id !== notificacionId)
      );
      
      // Cerrar modal y preparar para mostrar la siguiente
      setMostrandoModal(false);
      setNotificacionActual(null);
      
      // Disparar evento para que otros componentes actualicen sus contadores
      window.dispatchEvent(new Event('notificacionLeida'));
    } catch (error) {
      console.error('Error marcando notificación como vista:', error);
    }
  };

  const cerrarNotificacion = () => {
    if (notificacionActual) {
      marcarComoVista(notificacionActual.id);
    }
  };

  return {
    notificacionActual,
    mostrandoModal,
    cerrarNotificacion,
    loading,
    hayNotificaciones: notificacionesPendientes.length > 0
  };
};
