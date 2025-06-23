// components/JornadaSelector.jsx
import { useEffect, useState } from "react";

export default function JornadaSelector({ onSelect }) {
  const [jornadas, setJornadas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchJornadas() {
      try {
        const res = await fetch("http://localhost:3001/api/jornadas");
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
