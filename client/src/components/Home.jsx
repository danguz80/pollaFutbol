import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import CuentaRegresivaGlobal from "./CuentaRegresivaGlobal";

const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;

export default function Home() {
    const navigate = useNavigate();
    const [rankingCampeonato, setRankingCampeonato] = useState([]);
    const [rankingSudamericana, setRankingSudamericana] = useState([]);
    const [fotoPerfilMap, setFotoPerfilMap] = useState({});
    const [proximaJornadaSud, setProximaJornadaSud] = useState(null);

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
            fetch(`${API_BASE_URL}/api/sudamericanaRanking`)
                .then(res => res.json())
                .then(data => {
                    setRankingSudamericana(data);
                    // Mapear fotos de ranking sudamericana
                    setFotoPerfilMap(prev => {
                        const map = { ...prev };
                        data.forEach(u => { map[u.usuario] = u.foto_perfil; });
                        return map;
                    });
                });

            // Próxima jornada Sudamericana (para cuenta regresiva)
            fetch(`${API_BASE_URL}/api/jornadas/sudamericana/proxima-abierta`)
                .then(res => res.json())
                .then(setProximaJornadaSud)
                .catch(() => setProximaJornadaSud(null));
        }
    }, [usuario]);

    // Componente de cuenta regresiva sudamericana
    const CuentaRegresivaSudamericana = ({ fechaCierre, numeroJornada }) => {
        const [tiempoRestante, setTiempoRestante] = useState('');

        useEffect(() => {
            const calcularTiempo = () => {
                const ahora = new Date().getTime();
                const cierre = new Date(fechaCierre).getTime();
                const diferencia = cierre - ahora;

                if (diferencia > 0) {
                    const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
                    const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
                    const segundos = Math.floor((diferencia % (1000 * 60)) / 1000);
                    setTiempoRestante(`${dias}d ${horas}h ${minutos}m ${segundos}s`);
                } else {
                    setTiempoRestante('¡Tiempo agotado!');
                }
            };

            calcularTiempo();
            const intervalo = setInterval(calcularTiempo, 1000);
            return () => clearInterval(intervalo);
        }, [fechaCierre]);

        return (
            <div className="alert alert-info text-center mb-4">
                <h5>⏰ Cuenta Regresiva Sudamericana - Jornada {numeroJornada}</h5>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{tiempoRestante}</div>
            </div>
        );
    };

    // Componente de Top 3
    const Top3Component = ({ title, ranking, emoji }) => {
        const top3 = ranking.slice(0, 3);
        
        if (top3.length === 0) return null;

        return (
            <div className="mb-4">
                <h4 className="text-center">{emoji} {title}</h4>
                <div className="d-flex justify-content-center gap-4 flex-wrap">
                    {top3.map((p, idx) => (
                        <div key={p.usuario_id || p.usuario} className="text-center" style={{ minWidth: 120 }}>
                            {fotoPerfilMap[p.usuario] && (
                                <img
                                    src={fotoPerfilMap[p.usuario].startsWith('/') ? fotoPerfilMap[p.usuario] : `/perfil/${fotoPerfilMap[p.usuario]}`}
                                    alt={`Foto de ${p.usuario}`}
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
                            <div style={{ fontWeight: 'bold', fontSize: '1.1em', marginTop: 6 }}>{p.usuario}</div>
                            <div style={{ color: '#888' }}>{p.puntaje_total || p.puntaje} pts</div>
                            <div style={{ fontSize: '1.2em', color: '#f7c948', fontWeight: 'bold' }}>{idx + 1}°</div>
                        </div>
                    ))}
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

                    {/* Cuenta Regresiva Sudamericana */}
                    {proximaJornadaSud && proximaJornadaSud.fecha_cierre && (
                        <CuentaRegresivaSudamericana 
                            fechaCierre={proximaJornadaSud.fecha_cierre}
                            numeroJornada={proximaJornadaSud.numero}
                        />
                    )}

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
