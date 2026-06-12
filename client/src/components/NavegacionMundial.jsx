import { useNavigate, useLocation } from 'react-router-dom';

export default function NavegacionMundial() {
  const navigate = useNavigate();
  const location = useLocation();

  const botones = [
    {
      ruta: '/mundial/estadisticas',
      icono: '📊',
      texto: 'Estadísticas',
      color: 'danger'
    },
    {
      ruta: '/mundial/clasificacion',
      icono: '📋',
      texto: 'Clasificación',
      color: 'primary'
    },
    {
      ruta: '/mundial/puntuacion',
      icono: '🏆',
      texto: 'Puntuación',
      color: 'warning'
    },
    {
      ruta: '/mundial/ganadores-jornada',
      icono: '⭐',
      texto: 'Ganadores',
      color: 'success'
    },
    {
      ruta: '/mundial/simulador',
      icono: '🎮',
      texto: 'Simulador',
      color: 'info'
    },
    {
      ruta: '/mundial/resumen',
      icono: '📋',
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
