import { useState, useEffect } from 'react';
import FireworksEffect from './FireworksEffect';

const ModalNotificacionGanador = ({ notificacion, show, onClose }) => {
  if (!notificacion || !show) return null;

  const { ganadores, mensaje, tipo, jornada_numero, competencia } = notificacion;
  
  // Validar que ganadores existe y es válido antes de parsearlo
  if (!ganadores) return null;
  
  const ganadoresArray = typeof ganadores === 'string' ? JSON.parse(ganadores) : ganadores;
  
  // Validar que ganadoresArray es un array válido
  if (!Array.isArray(ganadoresArray) || ganadoresArray.length === 0) return null;

  const getTituloCompetencia = () => {
    if (competencia === 'libertadores') return 'Copa Libertadores';
    if (competencia === 'sudamericana') return 'Copa Sudamericana';
    if (competencia === 'chile') return 'Campeonato Nacional';
    return competencia;
  };

  const getTitulo = () => {
    if (tipo === 'acumulado') {
      return `🏆 ${ganadoresArray.length === 1 ? 'Campeón' : 'Campeones'} del Ranking Acumulado`;
    }
    return `🏆 ${ganadoresArray.length === 1 ? 'Ganador' : 'Ganadores'} de la Jornada ${jornada_numero}`;
  };

  const esAcumulado = tipo === 'acumulado';

  return (
    <>
      <FireworksEffect intensity={esAcumulado ? 'high' : 'normal'} />
      <div 
        className="modal show d-block" 
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      >
        <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
          <div className="modal-content">
            <div className={`modal-header ${esAcumulado ? 'bg-success text-white' : 'bg-warning text-dark'}`}>
              <h5 className="modal-title">
                {getTitulo()}
              </h5>
              <button 
                type="button" 
                className="btn-close" 
                onClick={onClose}
              ></button>
            </div>
            <div className="modal-body text-center py-4">
              <div className="mb-4">
                <h2 className={esAcumulado ? 'text-success' : 'text-warning'}>
                  🎉 ¡Felicitaciones! 🎉
                </h2>
                {esAcumulado && (
                  <p className="text-muted mb-0">
                    <strong>{getTituloCompetencia()}</strong>
                  </p>
                )}
              </div>
              {ganadoresArray.map((ganador, index) => (
                <div key={index} className={`alert ${esAcumulado ? 'alert-success' : 'alert-success'} mb-3 d-flex flex-column align-items-center`}>
                  {ganador.foto_perfil && (
                    <img
                      src={ganador.foto_perfil.startsWith('/') ? ganador.foto_perfil : `/perfil/${ganador.foto_perfil}`}
                      alt={ganador.nombre}
                      style={{
                        width: esAcumulado ? '120px' : '80px',
                        height: esAcumulado ? '120px' : '80px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: esAcumulado ? '4px solid #ffd700' : '3px solid #28a745',
                        marginBottom: '15px'
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  )}
                  <h4 className="mb-0">
                    {esAcumulado ? '👑' : '🏆'} {ganador.nombre}
                  </h4>
                  <p className={`mb-0 fs-5 fw-bold ${esAcumulado ? 'text-success' : 'text-success'}`}>
                    {ganador.puntaje} puntos
                  </p>
                </div>
              ))}
              <p className="text-muted mt-3">
                {mensaje}
              </p>
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={onClose}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ModalNotificacionGanador;
