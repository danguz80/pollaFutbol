import { useEffect, useState } from "react";
import CuentaRegresiva from "./CuentaRegresiva";

const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;

export default function CuentaRegresivaGlobal() {
  const [proximaJornada, setProximaJornada] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas/proxima-abierta`)
      .then(res => res.json())
      .then(setProximaJornada)
      .catch(() => setProximaJornada(null));
  }, []);

  if (!proximaJornada || !proximaJornada.fecha_cierre) return null;

  return (
    <CuentaRegresiva
      fechaCierre={proximaJornada.fecha_cierre}
      numeroJornada={proximaJornada.numero}
    />
  );
}
