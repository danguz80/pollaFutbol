import { useNavigate } from "react-router-dom";
import useAuth from "../hooks/UseAuth";

export default function SudamericanaSubMenu() {
  const navigate = useNavigate();
  const usuario = useAuth();
  const isAdmin = usuario?.rol === "admin";
  
  return (
    <div className="d-flex flex-wrap gap-2 justify-content-center my-4 sticky-top bg-white py-2 shadow-sm" style={{ zIndex: 1020 }}>
      <button className="btn btn-info" onClick={() => navigate("/clasificacion-sudamericana")}>📊 Clasificación</button>
      
      {/* Solo mostrar botones de pronósticos si NO es admin */}
      {!isAdmin && (
        <>
          <button className="btn btn-success" onClick={() => navigate("/ingresar-pronosticos-sud")}>✏️ Ingresar Pronósticos</button>
        </>
      )}
      
      {/* Solo mostrar panel admin si ES admin */}
      {isAdmin && (
        <button className="btn btn-dark" onClick={() => navigate("/admin/sudamericana")}>⚙️ Panel Admin Sudamericana</button>
      )}
    </div>
  );
}
