// Configuración centralizada de la API
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || 'https://campeonato-itau-backend.onrender.com',
  ENDPOINTS: {
    AUTH: '/api/usuarios',
    SUDAMERICANA: '/api/sudamericana',
    ADMIN: '/api/admin',
    FIXTURES: '/api/fixtures',
    JORNADAS: '/api/jornadas',
    PRONOSTICOS: '/api/pronosticos'
  }
};

// Helper function para construir URLs completas
export const buildApiUrl = (endpoint) => {
  return `${API_CONFIG.BASE_URL}${endpoint}`;
};

// Log para debug en desarrollo
if (import.meta.env.DEV) {
  console.log('🔧 API Config:', {
    baseUrl: API_CONFIG.BASE_URL,
    env: import.meta.env.VITE_API_URL,
    mode: import.meta.env.MODE
  });
}
