import { useEffect, useState } from "react";
import CuentaRegresiva from "./CuentaRegresiva";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function CuentaRegresivaCopaGinoPerez() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/copa-gino-perez/config`)
      .then(res => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then(data => setConfig(data))
      .catch(err => {
        console.warn('Error obteniendo config de Copa Gino Pérez:', err);
        setConfig(null);
      });
  }, []);

  if (!config || config.cerrado || !config.fecha_cierre) return null;

  return (
    <CuentaRegresiva
      fechaCierre={config.fecha_cierre}
      numeroJornada="el pronóstico"
      competencia="Copa Gino Pérez"
    />
  );
}
