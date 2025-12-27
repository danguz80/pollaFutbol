import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function FixtureTorneoNacional() {
  const navigate = useNavigate();
  const [fixtureTexto, setFixtureTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleGenerarFixture = async () => {
    if (!fixtureTexto.trim()) {
      setMessage("❌ Debes pegar el texto del fixture");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setMessage("❌ No se encontró token de autenticación");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/jornadas/importar-fixture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ fixtureTexto })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`✅ ${data.message}\n📊 Jornadas creadas: ${data.jornadasCreadas}\n⚽ Partidos creados: ${data.partidosCreados}`);
        alert(`✅ Fixture importado exitosamente!\n\n📊 Jornadas: ${data.jornadasCreadas}\n⚽ Partidos: ${data.partidosCreados}`);
      } else {
        setMessage(`❌ Error: ${data.error || data.message}`);
        alert(`❌ Error: ${data.error || data.message}`);
      }
    } catch (error) {
      console.error("Error:", error);
      setMessage("❌ Error de conexión con el servidor");
      alert("❌ Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleLimpiar = () => {
    setFixtureTexto("");
    setMessage("");
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>📋 Importar Fixture Torneo Nacional</h2>
        <button 
          className="btn btn-secondary"
          onClick={() => navigate("/admin")}
        >
          ← Volver al Admin
        </button>
      </div>

      <div className="card">
        <div className="card-body">
          <h5 className="card-title">Instrucciones</h5>
          <p className="text-muted">
            Pega el texto del fixture completo (30 jornadas) en el campo de abajo. 
            El formato debe ser:
          </p>
          <pre className="bg-light p-3 rounded" style={{ fontSize: '0.9em' }}>
{`Jornada 1
Colo Colo vs Universidad de Chile
Universidad Católica vs Palestino
...

Jornada 2
...`}
          </pre>
          <p className="text-muted">
            El sistema identificará automáticamente las jornadas (1-30) y los partidos de cada una.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="fixtureTexto" className="form-label fw-bold">
          Texto del Fixture (30 jornadas):
        </label>
        <textarea
          id="fixtureTexto"
          className="form-control"
          rows={20}
          value={fixtureTexto}
          onChange={(e) => setFixtureTexto(e.target.value)}
          placeholder="Pega aquí el fixture completo..."
          style={{ fontFamily: 'monospace', fontSize: '0.95em' }}
        />
      </div>

      <div className="d-flex gap-3 mt-4">
        <button
          className="btn btn-success btn-lg"
          onClick={handleGenerarFixture}
          disabled={loading || !fixtureTexto.trim()}
        >
          {loading ? "⏳ Generando..." : "✅ Generar Fixture"}
        </button>
        <button
          className="btn btn-outline-secondary"
          onClick={handleLimpiar}
          disabled={loading}
        >
          🗑️ Limpiar
        </button>
      </div>

      {message && (
        <div className={`alert ${message.includes('✅') ? 'alert-success' : 'alert-danger'} mt-4`} style={{ whiteSpace: 'pre-line' }}>
          {message}
        </div>
      )}

      <div className="card mt-4 bg-light">
        <div className="card-body">
          <h6 className="fw-bold">⚠️ Importante:</h6>
          <ul className="mb-0">
            <li>Este proceso creará las jornadas y partidos en la base de datos</li>
            <li>Si ya existen jornadas, se actualizarán los partidos</li>
            <li>Verifica el formato antes de generar</li>
            <li>El proceso puede tardar unos segundos</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
