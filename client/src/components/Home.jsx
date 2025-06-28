import { useNavigate } from "react-router-dom";

export default function Home() {
    const navigate = useNavigate();

    // Chequeo rápido si hay usuario logueado en localStorage
    let usuario = null;
    try {
        usuario = JSON.parse(localStorage.getItem("usuario"));
    } catch {
        usuario = null;
    }

    return (
        <div className="container text-center mt-5">
            <h1 className="mb-4">🏠 Home - Bienvenido a Polla de Torneos</h1>

            <div className="d-flex flex-column flex-md-row justify-content-center align-items-center gap-3">
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

            {/* Mostrar el botón SOLO si hay usuario logueado */}
            {usuario && (
                <button
                    className="btn btn-warning mt-4"
                    onClick={() => navigate("/cambiar-password")}
                >
                    Cambiar Contraseña
                </button>
            )}

        </div>
    );
}
