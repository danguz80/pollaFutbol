import { useNavigate } from 'react-router-dom';

export default function CopaGinoPerez() {
  const navigate = useNavigate();
  const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
  const esAdmin = usuario?.rol === 'admin';

  return (
    <div className="container mt-4 mb-5">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-secondary" onClick={() => navigate('/')}>
          ← Volver al Home
        </button>
      </div>

      <h1 className="text-center mb-1">⚽ Copa Gino Pérez</h1>
      <p className="text-center text-muted mb-4">
        Torneo local de 6 equipos en 2 grupos. Grupo 1: H2, Cokal (Coker), Resto del Mundo.
        Grupo 2: LQQ (Quintero), Los Chavos (Topping), Norte - Sur (Cracking).
      </p>

      <div className="d-flex flex-column flex-md-row justify-content-center align-items-center gap-3 mb-4">
        <button className="btn btn-dark px-4 py-2" onClick={() => navigate('/copa-gino-perez/pronostico')}>
          📝 Pronóstico
        </button>
        <button className="btn btn-secondary px-4 py-2" onClick={() => navigate('/copa-gino-perez/clasificacion')}>
          📊 Clasificación
        </button>
        <button className="btn btn-secondary px-4 py-2" onClick={() => navigate('/copa-gino-perez/puntuacion')}>
          🧮 Puntuación
        </button>
        <button className="btn btn-secondary px-4 py-2" onClick={() => navigate('/copa-gino-perez/estadisticas')}>
          📈 Estadísticas
        </button>
        {esAdmin && (
          <button className="btn btn-danger px-4 py-2" onClick={() => navigate('/admin/copa-gino-perez/resultados')}>
            🛠️ Admin: Resultados
          </button>
        )}
      </div>
    </div>
  );
}
