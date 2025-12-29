import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLogoEquipo } from '../utils/libertadoresLogos.jsx';

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function HeroSection({ competencia }) {
  const [partidos, setPartidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    cargarPartidos();
  }, [competencia]);

  // Carrusel automático cada 7 segundos
  useEffect(() => {
    if (partidos.length <= 1 || isPaused) return;

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % partidos.length);
    }, 7000);

    return () => clearInterval(interval);
  }, [partidos.length, isPaused, currentIndex]);

  const cargarPartidos = async () => {
    try {
      const url = competencia 
        ? `${API_BASE_URL}/api/hero-partidos-bonus?competencia=${competencia}`
        : `${API_BASE_URL}/api/hero-partidos-bonus`;
      
      const res = await fetch(url);
      const data = await res.json();
      setPartidos(data.partidos || []);
    } catch (error) {
      console.error('Error cargando partidos hero:', error);
      setPartidos([]);
    } finally {
      setLoading(false);
    }
  };

  const getCompetenciaColor = (comp) => {
    switch (comp) {
      case 'libertadores': return 'danger';
      case 'torneo_nacional': return 'primary';
      case 'sudamericana': return 'success';
      default: return 'secondary';
    }
  };

  const handleClickPartido = (partido) => {
    switch (partido.competencia) {
      case 'libertadores':
        navigate(`/libertadores/jornada/${partido.jornada_numero}`);
        break;
      case 'torneo_nacional':
        navigate(`/jornada/${partido.jornada_numero}`);
        break;
      case 'sudamericana':
        navigate('/sudamericana');
        break;
      default:
        break;
    }
  };

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + partidos.length) % partidos.length);
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % partidos.length);
  };

  const handleDotClick = (index) => {
    setCurrentIndex(index);
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  if (partidos.length === 0) {
    return null;
  }

  const currentPartido = partidos[currentIndex];
  const logoLocal = getLogoEquipo(currentPartido.local);
  const logoVisita = getLogoEquipo(currentPartido.visita);

  return (
    <div 
      className="hero-section-slider mb-4"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="slider-container position-relative" onClick={() => handleClickPartido(currentPartido)}>
        {/* Degradado de fondo */}
        <div className="slider-background"></div>
        
        {/* Contenido principal */}
        <div key={currentIndex} className="slider-content slide-in-right">
          {/* Badge superior */}
          <div className="top-badges">
            <span className={`badge badge-competencia bg-${getCompetenciaColor(currentPartido.competencia)}`}>
              {currentPartido.nombre_competencia}
            </span>
            <span className="badge badge-jornada bg-dark">
              {currentPartido.jornada_nombre}
            </span>
          </div>

          {/* Logos y VS */}
          <div className="teams-container">
            {/* Logo Equipo Local */}
            <div className="team-side">
              {logoLocal ? (
                <img 
                  src={logoLocal} 
                  alt={currentPartido.local}
                  className="team-logo team-logo-left"
                  onError={(e) => e.target.style.display = 'none'}
                />
              ) : (
                <div className="team-logo-placeholder">{currentPartido.local.charAt(0)}</div>
              )}
              <h3 className="team-name text-white">{currentPartido.local}</h3>
            </div>

            {/* VS y Bonus */}
            <div className="vs-section">
              <div className="vs-text">VS</div>
              <div className={`bonus-badge bonus-x${currentPartido.bonus}`}>
                <span className="bonus-star">⭐</span>
                <span className="bonus-text">BONUS x{currentPartido.bonus}</span>
              </div>
            </div>

            {/* Logo Equipo Visita */}
            <div className="team-side">
              {logoVisita ? (
                <img 
                  src={logoVisita} 
                  alt={currentPartido.visita}
                  className="team-logo team-logo-right"
                  onError={(e) => e.target.style.display = 'none'}
                />
              ) : (
                <div className="team-logo-placeholder">{currentPartido.visita.charAt(0)}</div>
              )}
              <h3 className="team-name text-white">{currentPartido.visita}</h3>
            </div>
          </div>

          {/* Call to action */}
          <button className="cta-button">
            🎯 INGRESAR PRONÓSTICO
          </button>
        </div>

        {/* Controles de navegación */}
        <button className="nav-arrow nav-arrow-left" onClick={(e) => { e.stopPropagation(); handlePrev(); }}>
          ‹
        </button>
        <button className="nav-arrow nav-arrow-right" onClick={(e) => { e.stopPropagation(); handleNext(); }}>
          ›
        </button>

        {/* Indicadores de puntos */}
        <div className="slider-dots">
          {partidos.map((_, index) => (
            <button
              key={index}
              className={`dot ${index === currentIndex ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); handleDotClick(index); }}
            />
          ))}
        </div>
      </div>

      <style>{`
        .hero-section-slider {
          width: 100%;
          margin: 0 auto 2rem;
        }

        .slider-container {
          height: 450px;
          border-radius: 20px;
          overflow: hidden;
          cursor: pointer;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          transition: transform 0.3s ease;
        }

        .slider-container:hover {
          transform: scale(1.02);
        }

        .slider-background {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
          background-size: 400% 400%;
          animation: gradientShift 15s ease infinite;
        }

        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        .slider-content {
          position: relative;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 2rem;
          z-index: 1;
        }

        .slide-in-right {
          animation: slideInRight 0.6s ease-out;
        }

        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .top-badges {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
        }

        .badge-competencia, .badge-jornada {
          font-size: 0.9rem;
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-weight: 600;
          text-transform: uppercase;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .teams-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex: 1;
          gap: 2rem;
        }

        .team-side {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .team-logo {
          width: 150px;
          height: 150px;
          object-fit: contain;
          filter: drop-shadow(0 8px 16px rgba(0,0,0,0.4));
          animation: float 3s ease-in-out infinite;
        }

        .team-logo-left {
          animation-delay: 0s;
        }

        .team-logo-right {
          animation-delay: 1.5s;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }

        .team-logo-placeholder {
          width: 150px;
          height: 150px;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 4rem;
          font-weight: bold;
          color: white;
          text-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }

        .team-name {
          font-size: 1.5rem;
          font-weight: 700;
          text-align: center;
          text-shadow: 0 2px 8px rgba(0,0,0,0.5);
          max-width: 200px;
        }

        .vs-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .vs-text {
          font-size: 3rem;
          font-weight: 900;
          color: white;
          text-shadow: 0 4px 12px rgba(0,0,0,0.5);
          letter-spacing: 0.1em;
        }

        .bonus-badge {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1rem 1.5rem;
          border-radius: 15px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
          animation: pulse 2s ease-in-out infinite;
        }

        .bonus-x2 {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }

        .bonus-x3 {
          background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 20px rgba(255,255,255,0.5); }
          50% { transform: scale(1.05); box-shadow: 0 0 30px rgba(255,255,255,0.8); }
        }

        .bonus-star {
          font-size: 2rem;
          animation: rotate 4s linear infinite;
        }

        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .bonus-text {
          font-size: 1.2rem;
          font-weight: 800;
          color: white;
          text-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }

        .cta-button {
          background: white;
          color: #667eea;
          border: none;
          padding: 1rem 2rem;
          border-radius: 50px;
          font-size: 1.1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          text-transform: uppercase;
        }

        .cta-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.3);
          background: #f5f5f5;
        }

        .nav-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(255,255,255,0.3);
          border: none;
          color: white;
          font-size: 3rem;
          width: 50px;
          height: 50px;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.3s ease;
          z-index: 10;
          backdrop-filter: blur(10px);
        }

        .nav-arrow:hover {
          background: rgba(255,255,255,0.5);
          transform: translateY(-50%) scale(1.1);
        }

        .nav-arrow-left {
          left: 1rem;
        }

        .nav-arrow-right {
          right: 1rem;
        }

        .slider-dots {
          position: absolute;
          bottom: 1rem;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 0.5rem;
          z-index: 10;
        }

        .dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: rgba(255,255,255,0.4);
          border: none;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .dot.active {
          background: white;
          width: 30px;
          border-radius: 6px;
        }

        @media (max-width: 768px) {
          .slider-container {
            height: 500px;
          }

          .teams-container {
            flex-direction: column;
            gap: 1rem;
          }

          .team-logo {
            width: 100px;
            height: 100px;
          }

          .team-name {
            font-size: 1.2rem;
          }

          .vs-text {
            font-size: 2rem;
          }

          .nav-arrow {
            width: 40px;
            height: 40px;
            font-size: 2rem;
          }
        }
      `}</style>
    </div>
  );
}
