import { useEffect, useState } from "react";

export default function CuentaRegresiva({ fechaCierre, numeroJornada, onCero }) {
  const [tiempo, setTiempo] = useState({ dias: 0, horas: 0, minutos: 0, segundos: 0 });
  const [finalizado, setFinalizado] = useState(false);

  useEffect(() => {
    if (!fechaCierre) return;
    const interval = setInterval(() => {
      // Usar horario local del navegador, que debería estar configurado en Chile
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
  if (finalizado) {
    // MODIFICADO: Solo mostrar que el tiempo terminó, el servidor maneja el cierre real
    return <div className="alert alert-warning text-center">⏰ Tiempo de cuenta regresiva finalizado</div>;
  }

  return (
    <div className="alert alert-info text-center" style={{ fontWeight: 'bold', fontSize: '1.1em' }}>
      Tiempo restante antes de cerrar {numeroJornada}: {tiempo.dias}d {tiempo.horas}h {tiempo.minutos}m {tiempo.segundos}s
    </div>
  );
}
