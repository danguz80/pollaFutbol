import { useEffect, useState } from "react";
import CuentaRegresiva from "./CuentaRegresiva";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function CuentaRegresivaGlobal() {
  const [proximaJornada, setProximaJornada] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas/proxima-abierta`)
      .then(res => {
        if (!res.ok) {
          // Si es 404, es normal (no hay jornadas abiertas)
          if (res.status === 404) {
            return null;
          }
          throw new Error(`Error ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (data) {
          setProximaJornada(data);
        }
      })
      .catch(err => {
        // Solo loguear si no es un 404
        if (err.message !== 'Error 404') {
          console.warn('Error obteniendo próxima jornada:', err);
        }
        setProximaJornada(null);
      });
  }, []);

  if (!proximaJornada || !proximaJornada.fecha_cierre) return null;

  return (
    <CuentaRegresiva
      fechaCierre={proximaJornada.fecha_cierre}
      numeroJornada={`Jornada ${proximaJornada.numero}`}
    />
  );
}
