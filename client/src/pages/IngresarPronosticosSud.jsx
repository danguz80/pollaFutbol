import { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;

export default function IngresarPronosticosSud() {
  const [fixture, setFixture] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/sudamericana/fixture`)
      .then(res => res.json())
      .then(data => {
        setFixture(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="container mt-4">
      <h2 className="mb-4">Ingresar Pronósticos - Copa Sudamericana</h2>
      {loading ? (
        <div>Cargando fixture...</div>
      ) : (
        <table className="table table-bordered text-center">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Local</th>
              <th>Visita</th>
              <th>Ronda</th>
            </tr>
          </thead>
          <tbody>
            {fixture.map(partido => (
              <tr key={partido.fixture_id}>
                <td>{new Date(partido.fecha).toLocaleString()}</td>
                <td>{partido.equipo_local}</td>
                <td>{partido.equipo_visita}</td>
                <td>{partido.ronda}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
