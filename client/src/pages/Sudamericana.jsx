import { useNavigate } from "react-router-dom";
import useAuth from "../hooks/UseAuth";

function SudamericanaSubMenu() {
  const navigate = useNavigate();
  const usuario = useAuth();
  const isAdmin = usuario?.rol === "admin";
  return (
    <div className="d-flex flex-wrap gap-2 justify-content-center my-4 sticky-top bg-white py-2 shadow-sm" style={{ zIndex: 1020 }}>
      <button className="btn btn-info" onClick={() => navigate("/clasificacion-sudamericana")}>Clasificación</button>
      <button className="btn btn-success" onClick={() => navigate("/ingresar-pronosticos-sud")}>Ingresar Pronósticos</button>
      <button className="btn btn-primary" onClick={() => navigate("/mis-pronosticos-sud")}>Mis Pronósticos</button>
      {isAdmin && (
        <button className="btn btn-dark" onClick={() => navigate("/admin/sudamericana")}>⚙️ Panel Admin Sudamericana</button>
      )}
    </div>
  );
}

export default function Sudamericana() {
  return (
    <div className="container mt-4">
      <h2 className="text-2xl p-4">🌎 Copa Sudamericana</h2>
      <SudamericanaSubMenu />
      {/* Aquí irá el fixture y contenido futuro */}
    </div>
  );
}
