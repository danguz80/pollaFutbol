import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfigurarCuentaRegresiva from "../components/ConfigurarCuentaRegresiva";
import CuentaRegresiva from "../components/CuentaRegresiva";
import CuentaRegresivaGlobal from "../components/CuentaRegresivaGlobal";

const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;

export default function Campeonato() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState(null);
  const [ultimoGanador, setUltimoGanador] = useState(null);
  const [ultimaJornada, setUltimaJornada] = useState(null);
  const [proximaJornada, setProximaJornada] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [reload, setReload] = useState(0);

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

  // Obtener último ganador de la última jornada cerrada
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas`)
      .then(res => res.json())
      .then(jornadas => {
        const cerradas = jornadas.filter(j => j.cerrada && Array.isArray(j.ganadores) && j.ganadores.length > 0);
        if (cerradas.length > 0) {
          const ultima = cerradas[cerradas.length - 1];
          setUltimaJornada(ultima.numero);
          setUltimoGanador(ultima.ganadores);
        }
      });
  }, []);

  // Obtener próxima jornada abierta
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/jornadas/proxima-abierta`)
      .then(res => res.json())
      .then(setProximaJornada)
      .catch(() => setProximaJornada(null));
  }, [reload]);

  // Handler para configurar cuenta regresiva
  const handleConfigurarCuenta = async ({ fechaHora }) => {
    setLoadingConfig(true);
    const fechaISO = fechaHora.toISOString();
    await fetch(`${API_BASE_URL}/api/jornadas/proxima/fecha-cierre`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fecha_cierre: fechaISO })
    });
    setLoadingConfig(false);
    setReload(r => r + 1);
  };

  // Handler para cerrar jornada automáticamente
  const cerrarJornada = async () => {
    if (!proximaJornada) return;
    await fetch(`${API_BASE_URL}/api/jornadas/${proximaJornada.id}/cerrar`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cerrada: true })
    });
    setReload(r => r + 1);
  };

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
    <div className="d-flex flex-wrap gap-2 justify-content-center my-4 sticky-top bg-white py-2 shadow-sm" style={{ zIndex: 1020 }}>
      <button className="btn btn-info" onClick={() => navigate("/clasificacion")}>Clasificación</button>
      <button className="btn btn-success" onClick={() => navigate("/jornada/1")}>Ingresar Pronósticos</button>
      <button className="btn btn-primary" onClick={() => navigate("/mis-pronosticos")}>Mis Pronósticos</button>
      <button className="btn btn-warning" onClick={() => navigate("/cuadro-final")}>Cuadro Final</button>
      <button className="btn btn-danger" onClick={() => navigate("/ganadores-jornada")}>Ganadores</button>
    </div>
  );

  if (usuario.rol === "jugador") {
    // JUGADOR
    return (
      <div className="container mt-5">
        <h2>🎮 Bienvenido, {usuario.nombre}</h2>
        <p>Aquí puedes ingresar tus pronósticos y ver tus resultados.</p>
        {subMenu}
        {ultimoGanador && (
          <div className="alert alert-success text-center mb-4" style={{ fontWeight: 'bold', fontSize: '1.1em' }}>
            Último ganador{ultimoGanador.length > 1 ? 'es' : ''}: {ultimoGanador.join(', ')} en la Jornada {ultimaJornada}
          </div>
        )}
        <CuentaRegresivaGlobal />
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
        {proximaJornada && proximaJornada.fecha_cierre && (
          <CuentaRegresiva
            fechaCierre={proximaJornada.fecha_cierre}
            numeroJornada={proximaJornada.numero}
            onCero={cerrarJornada}
          />
        )}
        <ConfigurarCuentaRegresiva onConfigurar={handleConfigurarCuenta} loading={loadingConfig} />
        <div className="d-flex flex-column gap-2 mt-3">
          <button className="btn btn-warning" onClick={() => navigate("/admin")}>Panel Admin</button>
        </div>
      </div>
    );
  }

  return null;
}
