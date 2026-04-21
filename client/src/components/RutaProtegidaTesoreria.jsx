// components/RutaProtegidaTesoreria.jsx
import { Navigate } from "react-router-dom";

function RutaProtegidaTesoreria({ children }) {
  const user = JSON.parse(localStorage.getItem("usuario"));
  const token = localStorage.getItem("token");

  if (!token || !user || (user.rol !== "admin" && user.rol !== "tesorero")) {
    return <Navigate to="/" />;
  }

  return children;
}

export default RutaProtegidaTesoreria;
