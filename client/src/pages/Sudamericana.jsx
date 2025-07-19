import { useNavigate } from "react-router-dom";
import SudamericanaSubMenu from "../components/SudamericanaSubMenu";

export default function Sudamericana() {
  return (
    <div className="container mt-4">
      <h2 className="text-2xl p-4">🌎 Copa Sudamericana</h2>
      <SudamericanaSubMenu />
      {/* Aquí irá el fixture y contenido futuro */}
    </div>
  );
}
