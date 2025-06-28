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
        <h2>🏆 Campeonato Itaú</h2>
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

  // Submenú para todos los usuarios logueados
  const subMenu = (
    <div className="d-flex flex-wrap gap-2 justify-content-center my-4">
      <button className="btn btn-info" onClick={() => navigate("/clasificacion")}>
        Clasificación
      </button>
      <button className="btn btn-success" onClick={() => navigate("/jornada/1")}>
        Ingresar Pronósticos
      </button>
      <button className="btn btn-primary" onClick={() => navigate("/mis-pronosticos")}>
        Mis Pronósticos
      </button>
      <button className="btn btn-warning" onClick={() => navigate("/cuadro-final")}>
        Cuadro Final
      </button>
      <button className="btn btn-danger" onClick={() => navigate("/ganadores-jornada")}>
        Ganadores
      </button>
    </div>
  );

  if (usuario.rol === "jugador") {
    // JUGADOR
    return (
      <div className="container mt-5">
        <h2>🎮 Bienvenido, {usuario.nombre}</h2>
        <p>Aquí puedes ingresar tus pronósticos y ver tus resultados.</p>
        {subMenu}
      </div>
    );
  }

  if (usuario.rol === "admin") {
    // ADMIN
    return (
      <div className="container mt-5">
        <h2>👑 Panel de Administrador</h2>
        <p>Accede a herramientas administrativas del campeonato.</p>
        {subMenu}
        <div className="d-flex flex-column gap-2 mt-3">
          <button className="btn btn-warning" onClick={() => navigate("/admin")}>
            Panel Admin
          </button>
        </div>
      </div>
    );
  }

  return null;
}
