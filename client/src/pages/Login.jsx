import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildApiUrl } from "../utils/apiConfig.js";


function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError("");

    try {
      // Usar la configuración centralizada de API
      const res = await fetch(buildApiUrl('/api/auth/login'), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Error al iniciar sesión");

      // Guardar token y datos del usuario (simplificado; luego usaremos context)
      localStorage.setItem("token", data.token);
      localStorage.setItem("usuario", JSON.stringify(data.usuario));

      // Disparar evento personalizado para notificar que el usuario inició sesión
      window.dispatchEvent(new Event('userLoggedIn'));

      alert("✅ Bienvenido " + data.usuario.nombre);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="container mt-4">
      <h2>Iniciar Sesión</h2>
      {error && <div className="alert alert-danger">{error}</div>}
      <form onSubmit={handleSubmit} className="mt-3">
        <div className="mb-3">
          <label className="form-label">Correo electrónico</label>
          <input
            type="email"
            name="email"
            className="form-control"
            value={form.email}
            onChange={handleChange}
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Contraseña</label>
          <input
            type="password"
            name="password"
            className="form-control"
            value={form.password}
            onChange={handleChange}
            required
          />
        </div>
        <button className="btn btn-success w-100" type="submit">
          Iniciar Sesión
        </button>
      </form>
    </div>
  );
}

export default Login;
