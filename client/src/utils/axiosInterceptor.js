import axios from 'axios';

// ===== INTERCEPTOR PARA AXIOS =====
axios.interceptors.response.use(
  // Si la respuesta es exitosa, simplemente la retorna
  (response) => response,
  
  // Si hay un error, interceptarlo
  (error) => {
    // Si el error es 401 (Unauthorized) o 403 (Forbidden) por token expirado
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      const errorMessage = error.response.data?.error || '';
      
      // Detectar si es error de token
      if (
        errorMessage.includes('Token') || 
        errorMessage.includes('token') ||
        errorMessage.includes('expirado') ||
        errorMessage.includes('inválido')
      ) {
        handleAuthError();
      }
    }
    
    // Rechazar la promesa para que el error pueda ser manejado donde se hizo la petición
    return Promise.reject(error);
  }
);

// ===== INTERCEPTOR PARA FETCH =====
// Guardar el fetch original
const originalFetch = window.fetch;

// Sobreescribir fetch con manejo automático de errores de autenticación
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  
  // Si es 401 o 403, verificar si es error de token
  if (response.status === 401 || response.status === 403) {
    try {
      // Clonar la respuesta para poder leerla sin consumirla
      const clonedResponse = response.clone();
      const data = await clonedResponse.json();
      const errorMessage = data?.error || '';
      
      if (
        errorMessage.includes('Token') || 
        errorMessage.includes('token') ||
        errorMessage.includes('expirado') ||
        errorMessage.includes('inválido')
      ) {
        handleAuthError();
      }
    } catch (e) {
      // Si no puede parsear JSON, ignorar
    }
  }
  
  return response;
};

// Función centralizada para manejar errores de autenticación
function handleAuthError() {
  // Evitar múltiples redirecciones simultáneas
  if (window.isRedirectingToLogin) return;
  window.isRedirectingToLogin = true;
  
  // Limpiar sesión del usuario
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  
  // Notificar al usuario
  alert('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
  
  // Redirigir al login
  window.location.href = '/login';
}

// Exportar axios configurado (opcional, por si quieres importarlo en lugar del axios global)
export default axios;
