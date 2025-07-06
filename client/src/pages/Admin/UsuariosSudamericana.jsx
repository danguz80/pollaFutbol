import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_RENDER_BACKEND_URL;

export default function UsuariosSudamericana() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const fetchUsuarios = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/usuarios/admin`, {
        credentials: "include"
      });
      const data = await res.json();
      setUsuarios(data);
    } catch (err) {
      setUsuarios([]);
    }
    setLoading(false);
  };

  const handleToggle = async (id, activo) => {
    try {
      await fetch(`${API_BASE_URL}/api/usuarios/${id}/sudamericana`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !activo }),
        credentials: "include"
      });
      setUsuarios(usuarios.map(u => u.id === id ? { ...u, activo_sudamericana: !activo } : u));
    } catch (err) {
      alert("Error al actualizar usuario");
    }
  };

  return (
    <div className="container mt-4">
      <h2>👥 Activar/Desactivar Usuarios Sudamericana</h2>
      <button className="btn btn-secondary mb-3" onClick={() => navigate(-1)}>
        ← Volver al panel Sudamericana
      </button>
      {loading ? (
        <div>Cargando usuarios...</div>
      ) : (
        <table className="table table-bordered">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Activo Sudamericana</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id}>
                <td>{u.nombre}</td>
                <td>{u.email}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!u.activo_sudamericana}
                    onChange={() => handleToggle(u.id, u.activo_sudamericana)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
