// components/JornadaSelector.jsx
import { useEffect, useState } from "react";

// Accede a la variable de entorno
const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;


export default function JornadaSelector({ onSelect }) {
  const [jornadas, setJornadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchJornadas() {
      try {
        // Usar la variable de entorno para la URL del backend
        const res = await fetch(`${API_BASE_URL}/api/jornadas`);
        const data = await res.json();
        setJornadas(data);
      } catch (err) {
        console.error("Error cargando jornadas:", err);
        setError("No se pudieron cargar las jornadas");
      } finally {
        setLoading(false);
      }
    }

    fetchJornadas();
  }, []);

  if (loading) return <p>Cargando jornadas...</p>;
  if (error) return <p className="text-danger">{error}</p>;

  return (
    <select className="form-select mt-3" onChange={(e) => onSelect(e.target.value)}>
      <option value="">-- Selecciona una jornada --</option>
      {jornadas.map((j) => (
        <option key={j.id} value={j.numero}>
          Jornada {j.numero}
        </option>
      ))}
    </select>
  );
}
