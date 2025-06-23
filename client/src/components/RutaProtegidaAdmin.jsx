// components/RutaProtegidaAdmin.jsx
import { Navigate } from "react-router-dom";

function RutaProtegidaAdmin({ children }) {
  const user = JSON.parse(localStorage.getItem("usuario"));
  const token = localStorage.getItem("token");

  if (!token || !user || user.rol !== "admin") {
    return <Navigate to="/" />;
  }

  return children;
}

export default RutaProtegidaAdmin;
