import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import CuentaRegresivaGlobal from "./CuentaRegresivaGlobal";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function Home() {
    const navigate = useNavigate();
    const [rankingCampeonato, setRankingCampeonato] = useState([]);
    const [rankingSudamericana, setRankingSudamericana] = useState([]);
    const [fotoPerfilMap, setFotoPerfilMap] = useState({});

    // Chequeo rápido si hay usuario logueado en localStorage
    let usuario = null;
    try {
        usuario = JSON.parse(localStorage.getItem("usuario"));
    } catch {
        usuario = null;
    }

    useEffect(() => {
        if (usuario) {
            // Ranking Campeonato
            fetch(`${API_BASE_URL}/api/pronosticos/ranking/general`)
                .then(res => res.json())
                .then(data => {
                    setRankingCampeonato(data);
                    // Mapear fotos de ranking campeonato
                    setFotoPerfilMap(prev => {
                        const map = { ...prev };
                        data.forEach(u => { map[u.usuario] = u.foto_perfil; });
                        return map;
                    });
                });

            // Ranking Sudamericana
            fetch(`${API_BASE_URL}/api/sudamericana/ranking`)
                .then(res => res.json())
                .then(data => {
                    setRankingSudamericana(data);
                    // Mapear fotos de ranking sudamericana
                    setFotoPerfilMap(prev => {
                        const map = { ...prev };
                        data.forEach(u => { map[u.nombre_usuario] = u.foto_perfil; });
                        return map;
                    });
                })
                .catch(err => {
                    console.error('Error al cargar ranking sudamericana:', err);
                    setRankingSudamericana([]);
                });
        }
    }, [usuario]);

    // Componente de Top 3
    const Top3Component = ({ title, ranking, emoji }) => {
        const top3 = ranking.slice(0, 3);
        
        if (top3.length === 0) return null;

        return (
            <div className="mb-4">
                <h4 className="text-center">{emoji} {title}</h4>
                <div className="d-flex justify-content-center gap-4 flex-wrap">
                    {top3.map((p, idx) => {
                        // Manejar diferentes estructuras de datos
                        const usuario = p.usuario || p.nombre_usuario;
                        const puntaje = p.puntaje_total || p.puntaje || p.total;
                        const key = p.usuario_id || p.id || usuario;
                        
                        return (
                            <div key={key} className="text-center" style={{ minWidth: 120 }}>
                                {fotoPerfilMap[usuario] && (
                                    <img
                                        src={fotoPerfilMap[usuario].startsWith('/') ? fotoPerfilMap[usuario] : `/perfil/${fotoPerfilMap[usuario]}`}
                                        alt={`Foto de ${usuario}`}
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
                                <div style={{ fontWeight: 'bold', fontSize: '1.1em', marginTop: 6 }}>{usuario}</div>
                                <div style={{ color: '#888' }}>{puntaje} pts</div>
                                <div style={{ fontSize: '1.2em', color: '#f7c948', fontWeight: 'bold' }}>{idx + 1}°</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="container text-center mt-5">
            <h1 className="mb-4">🏠 Home - Bienvenido a Polla de Torneos</h1>

            {/* Submenú */}
            <div className="d-flex flex-column flex-md-row justify-content-center align-items-center gap-3 mb-4">
                <button
                    className="btn btn-primary px-4 py-2"
                    onClick={() => navigate("/campeonato")}
                >
                    Campeonato Nacional
                </button>

                <button
                    className="btn btn-danger px-4 py-2"
                    onClick={() => navigate("/libertadores")}
                >
                    Copa Libertadores
                </button>

                <button
                    className="btn btn-success px-4 py-2"
                    onClick={() => navigate("/sudamericana")}
                >
                    Copa Sudamericana
                </button>
            </div>

            {usuario && (
                <>
                    {/* Cuenta Regresiva Campeonato */}
                    <CuentaRegresivaGlobal />

                    {/* Top 3 Ranking Campeonato */}
                    <Top3Component 
                        title="Top 3 Ranking Campeonato" 
                        ranking={rankingCampeonato} 
                        emoji="🏆"
                    />

                    {/* Top 3 Ranking Sudamericana */}
                    <Top3Component 
                        title="Top 3 Ranking Sudamericana" 
                        ranking={rankingSudamericana} 
                        emoji="🥇"
                    />

                    {/* Botón cambiar contraseña */}
                    <button
                        className="btn btn-warning mt-4"
                        onClick={() => navigate("/cambiar-password")}
                    >
                        Cambiar Contraseña
                    </button>
                </>
            )}

            {/* Si no hay usuario logueado, mostrar opciones de registro/login */}
            {!usuario && (
                <div className="mt-4">
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
            )}
        </div>
    );
}
