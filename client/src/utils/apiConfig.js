// Configuración centralizada de la API
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || 'https://pollafutbol.onrender.com',
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

// API Config cargada silenciosamente
