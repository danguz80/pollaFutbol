import { useState, useEffect, useMemo } from 'react';
import FireworksEffect from './FireworksEffect';

const FG_CONFETTI = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  left: `${(i * 41 + 7) % 100}%`,
  color: ['#1a5bc4','#4488ff','#ffd700','#00bfff','#0d3b8e','#87cefa','#ffffff','#4fc3f7'][i % 8],
  delay: `${((i * 0.13) % 2.8).toFixed(2)}s`,
  duration: `${(2.2 + (i % 10) * 0.18).toFixed(2)}s`,
  size: `${6 + (i % 7)}px`,
  isCircle: i % 3 === 0,
}));

const ModalNotificacionGanador = ({ notificacion, show, onClose }) => {
  if (!notificacion || !show) return null;

  const { ganadores, mensaje, tipo, tipo_notificacion, jornada_numero, competencia, icono } = notificacion;
  
  // Determinar si es una notificación de ganadores o informativa
  const esNotificacionGanadores = ganadores && ganadores !== null;
  
  // Si es notificación de ganadores, parsear y validar
  let ganadoresArray = [];
  if (esNotificacionGanadores) {
    ganadoresArray = typeof ganadores === 'string' ? JSON.parse(ganadores) : ganadores;
    // Validar que ganadoresArray es un array válido
    if (!Array.isArray(ganadoresArray) || ganadoresArray.length === 0) {
      // Si no es válido, tratar como notificación informativa
      ganadoresArray = [];
    }
  }
  
  const esGanadores = ganadoresArray.length > 0;

  const getTituloCompetencia = () => {
    if (competencia === 'libertadores') return 'Copa Libertadores';
    if (competencia === 'sudamericana') return 'Copa Sudamericana';
    if (competencia === 'mundial') return 'Mundial';
    if (competencia === 'torneo_nacional' || competencia === 'chile') return 'Campeonato Nacional';
    return competencia;
  };

  const getTitulo = () => {
    // Notificaciones informativas
    if (tipo_notificacion === 'resultados_agregados') {
      return `📊 Resultados Agregados`;
    }
    if (tipo_notificacion === 'fecha_cierre_actualizada') {
      return `⏰ Fecha de Cierre Actualizada`;
    }
    if (tipo_notificacion === 'fixture_creado') {
      return `📅 Nuevo Fixture Creado`;
    }
    
    // Notificaciones de ganadores
    if (tipo === 'acumulado') {
      return `🏆 ${ganadoresArray.length === 1 ? 'Campeón' : 'Campeones'} del Ranking Acumulado`;
    }
    return `🏆 ${ganadoresArray.length === 1 ? 'Ganador' : 'Ganadores'} de la Jornada ${jornada_numero}`;
  };

  const esAcumulado = tipo === 'acumulado';
  const esFaseGrupos = tipo_notificacion === 'ganador_fase_grupos';
  
  // Determinar si mostrar fuegos artificiales (solo para ganadores)
  const mostrarFuegos = esGanadores && !esFaseGrupos;

  // RENDER PARA GANADOR FASE DE GRUPOS — modal azul con confeti
  if (esFaseGrupos && ganadoresArray.length > 0) {
    const g = ganadoresArray[0];
    return (
      <div className="modal show d-block" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,10,0.78)', zIndex: 1060 }} onClick={onClose}>
        <style>{`@keyframes fgCnf{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(650px) rotate(540deg);opacity:0}}`}</style>
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1061 }}>
          {FG_CONFETTI.map(p => (
            <div key={p.id} style={{ position: 'absolute', left: p.left, top: '-20px', width: p.size, height: p.size, backgroundColor: p.color, borderRadius: p.isCircle ? '50%' : '2px', animation: `fgCnf ${p.duration} ${p.delay} ease-in both infinite` }} />
          ))}
        </div>
        <div className="modal-dialog modal-dialog-centered" style={{ position: 'relative', zIndex: 1062 }} onClick={e => e.stopPropagation()}>
          <div className="modal-content" style={{ border: '3px solid #1a5bc4', overflow: 'hidden' }}>
            <div className="modal-header" style={{ background: '#0d3b8e' }}>
              <h4 className="modal-title w-100 text-center fw-bold text-white">🌟 GANADOR FASE DE GRUPOS 🌟</h4>
              <button type="button" className="btn-close btn-close-white" onClick={onClose} />
            </div>
            <div className="modal-body text-center py-5" style={{ background: 'linear-gradient(160deg,#e8f0fe 0%,#fff 55%,#dff0ff 100%)' }}>
              <div className="mb-4">
                {g.foto_perfil ? (
                  <img
                    src={g.foto_perfil.startsWith('/') ? g.foto_perfil : `/perfil/${g.foto_perfil}`}
                    alt={g.nombre}
                    className="rounded-circle shadow-lg"
                    style={{ width: '130px', height: '130px', objectFit: 'cover', border: '5px solid #ffd700' }}
                    onError={e => { e.target.src = '/perfil/default.png'; }}
                  />
                ) : (
                  <div className="rounded-circle d-inline-flex align-items-center justify-content-center shadow-lg"
                    style={{ width: '130px', height: '130px', background: '#0d3b8e', fontSize: '3rem', color: 'white', border: '5px solid #ffd700' }}>
                    {g.nombre.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <h3 className="fw-bold mb-1" style={{ color: '#0d3b8e' }}>{g.nombre}</h3>
              <p className="text-muted mb-3">Mejor acumulado en la Fase de Grupos (J1 + J2 + J3)</p>
              <span className="badge fs-5 px-4 py-2 shadow" style={{ background: '#0d3b8e', color: 'white' }}>⭐ {g.puntaje} puntos</span>
              <p className="mt-4 fw-bold fs-5 text-success">🏆 ¡Felicitaciones!</p>
            </div>
            <div className="modal-footer justify-content-center" style={{ background: '#0d3b8e' }}>
              <button className="btn btn-light btn-lg px-5" onClick={onClose}>Cerrar</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // RENDER PARA NOTIFICACIONES INFORMATIVAS (sin ganadores)
  if (!esGanadores) {
    return (
      <div 
        className="modal show d-block" 
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      >
        <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
          <div className="modal-content">
            <div className="modal-header bg-info text-white">
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
                <h1 style={{ fontSize: '4rem' }}>{icono || '📢'}</h1>
              </div>
              <p className="fs-5 mb-3">{mensaje}</p>
              {getTituloCompetencia() && (
                <p className="text-muted mb-0">
                  <strong>{getTituloCompetencia()}</strong>
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={onClose}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // RENDER PARA NOTIFICACIONES DE GANADORES
  return (
    <>
      {mostrarFuegos && <FireworksEffect intensity={esAcumulado ? 'high' : 'normal'} />}
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
