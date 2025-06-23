import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Campeonato() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState(null);

  useEffect(() => {
    // Intentar obtener el usuario desde localStorage
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("usuario");

    if (token && userData) {
      try {
        setUsuario(JSON.parse(userData));
      } catch (err) {
        console.error("Error al parsear usuario", err);
      }
    }
  }, []);

  if (!usuario) {
    // VISITA
    return (
      <div className="container text-center mt-5">
        <h2>🏆 Campeonato Nacional</h2>
        <p>Para participar, debes estar registrado.</p>
        <div className="d-flex justify-content-center gap-3">
          <button className="btn btn-primary" onClick={() => navigate("/register")}>
            Registrarse
          </button>
          <button className="btn btn-outline-primary" onClick={() => navigate("/login")}>
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  if (usuario.rol === "jugador") {
    // JUGADOR
    return (
      <div className="container mt-5">
        <h2>🎮 Bienvenido, {usuario.nombre}</h2>
        <p>Aquí puedes ingresar tus pronósticos y ver tus resultados.</p>
        {/* Agrega navegación a jornadas, tabla, etc. */}
        <div className="d-flex flex-column gap-2 mt-3">
          <button className="btn btn-success" onClick={() => navigate("/jornada/1")}>
            Ver Jornada Actual
          </button>
          <button className="btn btn-info" onClick={() => navigate("/clasificacion")}>
            Ver Clasificación General
          </button>
        </div>
      </div>
    );
  }

  if (usuario.rol === "admin") {
    // ADMIN
    return (
      <div className="container mt-5">
        <h2>👑 Panel de Administrador</h2>
        <p>Accede a herramientas administrativas del campeonato.</p>
        <div className="d-flex flex-column gap-2 mt-3">
          <button className="btn btn-warning" onClick={() => navigate("/admin")}>
            Panel Admin
          </button>
          <button className="btn btn-info" onClick={() => navigate("/clasificacion")}>
            Ver Clasificación
          </button>
        </div>
      </div>
    );
  }

  return null;
}
