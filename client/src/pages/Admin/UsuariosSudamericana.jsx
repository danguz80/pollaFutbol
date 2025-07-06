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
      const res = await fetch(`${API_BASE_URL}/api/usuarios/lista`);
      if (res.ok) {
        const data = await res.json();
        setUsuarios(Array.isArray(data) ? data : []);
      } else {
        console.error('Error status:', res.status);
        setUsuarios([]);
      }
    } catch (err) {
      console.error('Error:', err);
      setUsuarios([]);
    }
    setLoading(false);
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
        <div>
          <p>Total usuarios: {usuarios.length}</p>
          <table className="table table-bordered">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Habilitar/Deshabilitar</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre}</td>
                  <td>{u.activo_sudamericana ? '✅ Habilitado' : '❌ Deshabilitado'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
