import { useNavigate } from "react-router-dom";

export default function Sudamericana() {
  const navigate = useNavigate();
  // Submenú Sudamericana (links vacíos)
  const subMenu = (
    <div className="d-flex flex-wrap gap-2 justify-content-center my-4 sticky-top bg-white py-2 shadow-sm" style={{ zIndex: 1020 }}>
      <button className="btn btn-info" onClick={() => {}}>Fixture</button>
      <button className="btn btn-success" onClick={() => {}}>Pronósticos</button>
      <button className="btn btn-primary" onClick={() => {}}>Ranking</button>
      <button className="btn btn-warning" onClick={() => {}}>Estadísticas</button>
      <button className="btn btn-danger" onClick={() => {}}>Ganadores</button>
    </div>
  );

  return (
    <div className="container mt-4">
      <h2 className="text-2xl p-4">🌎 Copa Sudamericana</h2>
      {subMenu}
      {/* Aquí irá el fixture y contenido futuro */}
    </div>
  );
}
