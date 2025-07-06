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

  const toggleUsuarioSudamericana = async (userId, nuevoEstado) => {
    try {
      // Aquí iría la llamada al backend para actualizar el estado
      // Por ahora solo actualizamos el estado local
      setUsuarios(prev => 
        prev.map(u => 
          u.id === userId 
            ? { ...u, activo_sudamericana: nuevoEstado }
            : u
        )
      );
    } catch (err) {
      console.error('Error al actualizar usuario:', err);
    }
  };

  return (
    <div className="container mt-4">
      <style>{`
        .switch {
          position: relative;
          display: inline-block;
          width: 60px;
          height: 34px;
        }
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #ccc;
          transition: .4s;
          border-radius: 34px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 26px;
          width: 26px;
          left: 4px;
          bottom: 4px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }
        input:checked + .slider {
          background-color: #2196F3;
        }
        input:checked + .slider:before {
          transform: translateX(26px);
        }
      `}</style>
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
              {usuarios.map((u, index) => (
                <tr key={index}>
                  <td>{u.nombre}</td>
                  <td>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={u.activo_sudamericana || false}
                        onChange={(e) => toggleUsuarioSudamericana(u.id, e.target.checked)}
                      />
                      <span className="slider"></span>
                    </label>
                    <span className="ms-2">
                      {u.activo_sudamericana ? '✅ Habilitado' : '❌ Deshabilitado'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
