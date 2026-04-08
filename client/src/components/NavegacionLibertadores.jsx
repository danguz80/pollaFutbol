import { useNavigate, useLocation } from 'react-router-dom';

export default function NavegacionLibertadores() {
  const navigate = useNavigate();
  const location = useLocation();

  const botones = [
    {
      ruta: '/libertadores/estadisticas',
      icono: '📊',
      texto: 'Estadísticas',
      color: 'danger'
    },
    {
      ruta: '/libertadores/clasificacion',
      icono: '📋',
      texto: 'Clasificación',
      color: 'primary'
    },
    {
      ruta: '/libertadores/puntuacion',
      icono: '🏆',
      texto: 'Puntuación',
      color: 'warning'
    },
    {
      ruta: '/libertadores/ganadores-jornada',
      icono: '⭐',
      texto: 'Ganadores',
      color: 'success'
    },
    {
      ruta: '/simulador-libertadores',
      icono: '🎮',
      texto: 'Simulador',
      color: 'info'
    },
    {
      ruta: '/resumen-jornada-libertadores',
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
