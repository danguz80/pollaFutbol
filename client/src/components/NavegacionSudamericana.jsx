import { useNavigate, useLocation } from 'react-router-dom';

export default function NavegacionSudamericana() {
  const navigate = useNavigate();
  const location = useLocation();

  const botones = [
    {
      ruta: '/sudamericana/estadisticas',
      icono: '📊',
      texto: 'Estadísticas',
      color: 'danger'
    },
    {
      ruta: '/sudamericana/clasificacion',
      icono: '📋',
      texto: 'Clasificación',
      color: 'primary'
    },
    {
      ruta: '/sudamericana/puntuacion',
      icono: '🏆',
      texto: 'Puntuación',
      color: 'warning'
    },
    {
      ruta: '/sudamericana/ganadores-jornada',
      icono: '⭐',
      texto: 'Ganadores',
      color: 'success'
    },
    {
      ruta: '/simulador-sudamericana',
      icono: '🎮',
      texto: 'Simulador',
      color: 'info'
    },
    {
      ruta: '/resumen-jornada-sudamericana',
      icono: '📊',
      texto: 'Resumen',
      color: 'secondary'
    }
  ];

  return (
    <div className="mb-4 text-center d-flex gap-3 justify-content-center flex-wrap">
      {botones.map((boton) => (
        <button
          key={boton.ruta}
          className={`btn btn-${boton.color} btn-lg px-4`}
          onClick={() => navigate(boton.ruta)}
          disabled={location.pathname === boton.ruta}
        >
          {boton.icono} {boton.texto}
        </button>
      ))}
    </div>
  );
}
