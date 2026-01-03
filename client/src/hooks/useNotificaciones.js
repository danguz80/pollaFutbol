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
      console.log('🔔 Cargando notificaciones pendientes...');
      cargarNotificacionesPendientes();
    }
    
    // Escuchar evento de login para recargar notificaciones
    const handleLogin = () => {
      console.log('🔔 Login detectado, recargando notificaciones...');
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
      console.log('📢 Mostrando notificación:', siguiente);
      setNotificacionActual(siguiente);
      setMostrandoModal(true);
    }
  }, [notificacionesPendientes, mostrandoModal]);

  const cargarNotificacionesPendientes = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('❌ No hay token, no se pueden cargar notificaciones');
        return;
      }

      console.log('📡 Consultando API de notificaciones...');
      const response = await axios.get(`${API_URL}/api/notificaciones/pendientes`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log(`✅ ${response.data.length} notificaciones pendientes encontradas`, response.data);
      setNotificacionesPendientes(response.data);
    } catch (error) {
      console.error('❌ Error cargando notificaciones:', error);
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
