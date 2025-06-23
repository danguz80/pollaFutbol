import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="container text-center mt-5">
      <h1 className="mb-4">🏟️ Página Principal – Campeonato Itaú</h1>

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
    </div>
  );
}
