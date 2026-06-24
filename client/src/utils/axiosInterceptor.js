import axios from 'axios';

// Contador de fallos consecutivos de autenticación
let authFailureCount = 0;
let authFailureTimer = null;

const registrarFalloAuth = () => {
  authFailureCount++;

  // Reiniciar el contador después de 30 segundos sin fallos
  clearTimeout(authFailureTimer);
  authFailureTimer = setTimeout(() => {
    authFailureCount = 0;
  }, 30000);

  // Solo cerrar sesión si hay 3 fallos consecutivos
  if (authFailureCount >= 3) {
    authFailureCount = 0;
    handleAuthError();
  }
};

// ===== INTERCEPTOR PARA AXIOS =====
axios.interceptors.response.use(
  (response) => {
    // Respuesta exitosa: reiniciar contador de fallos
    authFailureCount = 0;
    return response;
  },
  
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      const errorMessage = error.response.data?.error || '';
      
      if (
        errorMessage.includes('Token') || 
        errorMessage.includes('token') ||
        errorMessage.includes('expirado') ||
        errorMessage.includes('inválido')
      ) {
        registrarFalloAuth();
      }
    }
    
    return Promise.reject(error);
  }
);

// ===== INTERCEPTOR PARA FETCH =====
const originalFetch = window.fetch;

window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  
  if (response.status === 401 || response.status === 403) {
    try {
      const clonedResponse = response.clone();
      const data = await clonedResponse.json();
      const errorMessage = data?.error || '';
      
      if (
        errorMessage.includes('Token') || 
        errorMessage.includes('token') ||
        errorMessage.includes('expirado') ||
        errorMessage.includes('inválido')
      ) {
        registrarFalloAuth();
      }
    } catch (e) {
      // Si no puede parsear JSON, ignorar
    }
  } else if (response.status >= 200 && response.status < 300) {
    // Respuesta exitosa: reiniciar contador de fallos
    authFailureCount = 0;
  }
  
  return response;
};

// Función centralizada para manejar errores de autenticación
function handleAuthError() {
  if (window.isRedirectingToLogin) return;
  window.isRedirectingToLogin = true;
  
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  
  alert('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
  
  window.location.href = '/login';
}

export default axios;
