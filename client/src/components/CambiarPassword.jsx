import { useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function CambiarPassword() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState(""); // Nuevo campo
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje("");

    // Validación: que coincidan las contraseñas nuevas
    if (nueva !== repetir) {
      setMensaje("❌ Las contraseñas nuevas no coinciden.");
      return;
    }

    setLoading(true);
    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`${API_BASE_URL}/api/usuarios/cambiar-password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ actual, nueva })
      });
      const data = await res.json();
      if (res.ok) {
        setMensaje(data.mensaje || "Contraseña cambiada correctamente.");
        setActual("");
        setNueva("");
        setRepetir(""); // Limpiar también este campo
      } else {
        setMensaje(data.error || "Error al cambiar la contraseña.");
      }
    } catch {
      setMensaje("Error de conexión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="container mt-4" style={{maxWidth: 400}}>
      <h3>Cambiar contraseña</h3>
      <div className="mb-3">
        <label className="form-label">Contraseña actual</label>
        <input
          type="password"
          className="form-control"
          value={actual}
          onChange={e => setActual(e.target.value)}
          required
        />
      </div>
      <div className="mb-3">
        <label className="form-label">Nueva contraseña</label>
        <input
          type="password"
          className="form-control"
          value={nueva}
          onChange={e => setNueva(e.target.value)}
          required
          minLength={6}
        />
      </div>
      <div className="mb-3">
        <label className="form-label">Reingresa la nueva contraseña</label>
        <input
          type="password"
          className="form-control"
          value={repetir}
          onChange={e => setRepetir(e.target.value)}
          required
          minLength={6}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading}>
        Cambiar contraseña
      </button>
      {mensaje && <div className="alert alert-info mt-3">{mensaje}</div>}
    </form>
  );
}
