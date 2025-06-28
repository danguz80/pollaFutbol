import { useNavigate } from "react-router-dom";

export default function AccesosDirectos() {
  const navigate = useNavigate();
  return (
    <div className="d-flex flex-wrap gap-2 justify-content-center my-4 sticky-top bg-white py-2 shadow-sm" style={{ zIndex: 1020 }}>
      <button className="btn btn-info" onClick={() => navigate("/clasificacion")}>Clasificación</button>
      <button className="btn btn-success" onClick={() => navigate("/jornada/1")}>Ingresar Pronósticos</button>
      <button className="btn btn-primary" onClick={() => navigate("/mis-pronosticos")}>Mis Pronósticos</button>
      <button className="btn btn-warning" onClick={() => navigate("/cuadro-final")}>Cuadro Final</button>
      <button className="btn btn-danger" onClick={() => navigate("/ganadores-jornada")}>Ganadores</button>
    </div>
  );
}
