import { useEffect, useState } from "react";
import CuentaRegresiva from "./CuentaRegresiva";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function CuentaRegresivaMundial() {
  const [proximaJornada, setProximaJornada] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');

    fetch(`${API_BASE_URL}/api/mundial/jornadas`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
      .then(res => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then(jornadas => {
        const jornadaConCierre = jornadas.find(j => !j.cerrada && j.fecha_cierre);
        if (jornadaConCierre) setProximaJornada(jornadaConCierre);
      })
      .catch(err => {
        console.warn('Error obteniendo jornadas Mundial:', err);
        setProximaJornada(null);
      });
  }, []);

  if (!proximaJornada || !proximaJornada.fecha_cierre) return null;

  return (
    <CuentaRegresiva
      fechaCierre={proximaJornada.fecha_cierre}
      numeroJornada={`Jornada ${proximaJornada.numero}`}
      competencia="Mundial 2026"
    />
  );
}
