import { useEffect, useState } from "react";

function UsuariosPendientes() {
  const [usuarios, setUsuarios] = useState([]);

  const fetchUsuarios = async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:3001/api/usuarios/pendientes", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setUsuarios(data);
  };

  const activarUsuario = async (id) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`http://localhost:3001/api/admin/activar-usuario/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      alert("✅ Usuario activado");
      fetchUsuarios(); // refrescar
    } else {
      alert("❌ Error al activar");
    }
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  return (
    <div className="container mt-4">
      <h2>Usuarios Pendientes de Activación</h2>
      {usuarios.length === 0 ? (
        <p>No hay usuarios pendientes.</p>
      ) : (
        <table className="table table-striped mt-3">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.nombre}</td>
                <td>{u.email}</td>
                <td>
                  <button className="btn btn-success btn-sm" onClick={() => activarUsuario(u.id)}>
                    Activar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default UsuariosPendientes;
