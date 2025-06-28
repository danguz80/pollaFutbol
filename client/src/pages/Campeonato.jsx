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
  const [rankingGeneral, setRankingGeneral] = useState([]);
  const [fotoPerfilMap, setFotoPerfilMap] = useState({});
  const [ganadoresRanking, setGanadoresRanking] = useState([]);

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

  // Ranking general y fotos
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/pronosticos/ranking/general`)
      .then(res => res.json())
      .then(data => setRankingGeneral(data));
    // Obtener jugadores ganadores (Ganador true)
    fetch(`${API_BASE_URL}/api/usuarios`)
      .then(res => res.json())
      .then(data => {
        const ganadores = data.filter(j => j.ganador === true);
        setGanadoresRanking(ganadores);
        // Mapear fotos
        const map = {};
        data.forEach(j => { map[j.nombre] = j.foto_perfil; });
        setFotoPerfilMap(map);
      });
  }, []);

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

  // --- Mostrar solo ganadores con su foto y estrella ---
  const resumenGanadores = (
    ganadoresRanking.length > 0 && (
      <div className="mb-4">
        <h4 className="text-center">⭐ Ganadores</h4>
        <div className="d-flex justify-content-center gap-4 flex-wrap">
          {ganadoresRanking.map(g => (
            <div key={g.nombre} className="text-center" style={{ minWidth: 120 }}>
              {fotoPerfilMap[g.nombre] && (
                <img
                  src={fotoPerfilMap[g.nombre].startsWith('/') ? fotoPerfilMap[g.nombre] : `/perfil/${fotoPerfilMap[g.nombre]}`}
                  alt={`Foto de ${g.nombre}`}
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid #ddd',
                    objectPosition: 'center 30%'
                  }}
                />
              )}
              <div style={{ fontWeight: 'bold', fontSize: '1.1em', marginTop: 6 }}>{g.nombre}</div>
              <div><span style={{ display: 'inline-block', marginTop: 2, color: '#f7c948', fontSize: '1.5em' }}>⭐</span></div>
            </div>
          ))}
        </div>
      </div>
    )
  );

  if (usuario.rol === "jugador") {
    // JUGADOR
    return (
      <div className="container mt-5">
        {subMenu}
        {ultimoGanador && (
          <div className="alert alert-success text-center mb-4" style={{ fontWeight: 'bold', fontSize: '1.1em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            {ultimoGanador.filter((nombre, idx, arr) => arr.indexOf(nombre) === idx).map(nombre => (
              fotoPerfilMap[nombre] && (
                <img
                  key={nombre}
                  src={fotoPerfilMap[nombre].startsWith('/') ? fotoPerfilMap[nombre] : `/perfil/${fotoPerfilMap[nombre]}`}
                  alt={`Foto de ${nombre}`}
                  style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #ddd', objectPosition: 'center 30%' }}
                />
              )
            ))}
            <span>
              Último ganador{ultimoGanador.length > 1 ? 'es' : ''}: {ultimoGanador.filter((nombre, idx, arr) => arr.indexOf(nombre) === idx).join(', ')} en la Jornada {ultimaJornada}
            </span>
          </div>
        )}
        {/* Solo ganadores con su foto y estrella */}
        {resumenGanadores}
        {/* Cuenta regresiva global */}
        <CuentaRegresivaGlobal />
      </div>
    );
  }

  if (usuario.rol === "admin") {
    // ADMIN
    return (
      <div className="container mt-5">
        {subMenu}
        {ultimoGanador && (
          <div className="alert alert-success text-center mb-4" style={{ fontWeight: 'bold', fontSize: '1.1em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            {ultimoGanador.map(nombre => (
              fotoPerfilMap[nombre] && (
                <img
                  key={nombre}
                  src={fotoPerfilMap[nombre].startsWith('/') ? fotoPerfilMap[nombre] : `/perfil/${fotoPerfilMap[nombre]}`}
                  alt={`Foto de ${nombre}`}
                  style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #ddd', objectPosition: 'center 30%' }}
                />
              )
            ))}
            Último ganador{ultimoGanador.length > 1 ? 'es' : ''}: {ultimoGanador.join(', ')} en la Jornada {ultimaJornada}
          </div>
        )}
        {/* Top 3 Ranking General */}
        {resumenRanking}
        {/* Solo ganadores con su foto y estrella */}
        {resumenGanadores}
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
