import { useEffect, useState } from "react";

export default function CuentaRegresiva({ fechaCierre, numeroJornada, onCero }) {
  const [tiempo, setTiempo] = useState({ dias: 0, horas: 0, minutos: 0, segundos: 0 });
  const [finalizado, setFinalizado] = useState(false);

  useEffect(() => {
    if (!fechaCierre) return;
    
    // Verificar inicialmente si ya expiró
    const ahora = new Date();
    const cierre = new Date(fechaCierre);
    const diffInicial = cierre - ahora;
    
    if (diffInicial <= 0) {
      setFinalizado(true);
      return;
    }
    
    const interval = setInterval(() => {
      const ahora = new Date();
      const cierre = new Date(fechaCierre);
      const diff = cierre - ahora;
      if (diff <= 0) {
        setFinalizado(true);
        setTiempo({ dias: 0, horas: 0, minutos: 0, segundos: 0 });
        clearInterval(interval);
        if (onCero) onCero();
        return;
      }
      const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
      const horas = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutos = Math.floor((diff / (1000 * 60)) % 60);
      const segundos = Math.floor((diff / 1000) % 60);
      setTiempo({ dias, horas, minutos, segundos });
    }, 1000);
    return () => clearInterval(interval);
  }, [fechaCierre, onCero]);

  if (!fechaCierre) return null;
  
  // Si la jornada ya expiró, no mostrar nada (la jornada debería estar cerrada)
  if (finalizado) {
    return null;
  }

  // Formatear fecha SIN conversión de zona horaria
  // (el admin ya ajusta manualmente la hora al guardar)
  const fecha = new Date(fechaCierre);
  const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  
  const diaSemana = diasSemana[fecha.getUTCDay()];
  const dia = fecha.getUTCDate();
  const mes = meses[fecha.getUTCMonth()];
  const año = fecha.getUTCFullYear();
  const hora = String(fecha.getUTCHours()).padStart(2, '0');
  const minutos = String(fecha.getUTCMinutes()).padStart(2, '0');
  
  const fechaCierreReal = `${diaSemana}, ${dia} de ${mes} de ${año}, ${hora}:${minutos}`;

  return (
    <div className="alert alert-info text-center" style={{ fontWeight: 'bold', fontSize: '1.1em' }}>
      <div>Tiempo restante antes de cerrar {numeroJornada || 'la jornada'} de Torneo Nacional:</div>
      <div className="mt-2" style={{ fontSize: '1.2em', color: '#0d6efd' }}>
        {tiempo.dias}d {tiempo.horas}h {tiempo.minutos}m {tiempo.segundos}s
      </div>
      <div className="mt-2" style={{ fontSize: '0.9em', fontWeight: 'normal' }}>
        📅 {fechaCierreReal}
      </div>
    </div>
  );
}
