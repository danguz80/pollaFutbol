import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function AdminNotificaciones() {
  const navigate = useNavigate();
  const [notificaciones, setNotificaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seleccionadas, setSeleccionadas] = useState(new Set());
  const [filtroCompetencia, setFiltroCompetencia] = useState("todas");
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);

  useEffect(() => {
    cargarNotificaciones();
  }, []);

  const cargarNotificaciones = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      
      const response = await fetch(`${API_BASE_URL}/api/notificaciones/admin?limit=200`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Error al cargar notificaciones");
      }

      const data = await response.json();
      setNotificaciones(data.notificaciones);
      setError("");
    } catch (err) {
      console.error("Error:", err);
      setError("Error al cargar las notificaciones");
    } finally {
      setLoading(false);
    }
  };

  const toggleSeleccion = (id) => {
    const nuevasSeleccionadas = new Set(seleccionadas);
    if (nuevasSeleccionadas.has(id)) {
      nuevasSeleccionadas.delete(id);
    } else {
      nuevasSeleccionadas.add(id);
    }
    setSeleccionadas(nuevasSeleccionadas);
  };

  const seleccionarTodas = () => {
    const notificacionesFiltradas = notificaciones.filter(
      (n) => filtroCompetencia === "todas" || n.competencia === filtroCompetencia
    );
    const todasIds = new Set(notificacionesFiltradas.map((n) => n.id));
    setSeleccionadas(todasIds);
  };

  const deseleccionarTodas = () => {
    setSeleccionadas(new Set());
  };

  const eliminarNotificacion = async (id) => {
    if (!confirm("¿Estás seguro de eliminar esta notificación?")) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/notificaciones/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Error al eliminar notificación");
      }

      // Actualizar la lista local
      setNotificaciones(notificaciones.filter((n) => n.id !== id));
      alert("Notificación eliminada exitosamente");
    } catch (err) {
      console.error("Error:", err);
      alert("Error al eliminar la notificación");
    }
  };

  const eliminarSeleccionadas = async () => {
    if (seleccionadas.size === 0) {
      alert("No hay notificaciones seleccionadas");
      return;
    }

    setMostrarConfirmacion(true);
  };

  const confirmarEliminacion = async () => {
    try {
      const token = localStorage.getItem("token");
      const ids = Array.from(seleccionadas);

      const response = await fetch(`${API_BASE_URL}/api/notificaciones/eliminar-multiples`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        throw new Error("Error al eliminar notificaciones");
      }

      const data = await response.json();

      // Actualizar la lista local
      setNotificaciones(notificaciones.filter((n) => !seleccionadas.has(n.id)));
      setSeleccionadas(new Set());
      setMostrarConfirmacion(false);
      alert(`${data.eliminadas} notificaciones eliminadas exitosamente`);
    } catch (err) {
      console.error("Error:", err);
      alert("Error al eliminar las notificaciones");
    }
  };

  const formatearFecha = (fecha) => {
    return new Date(fecha).toLocaleString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getIconoCompetencia = (competencia) => {
    const iconos = {
      libertadores: "🏆",
      sudamericana: "🥉",
      mundial: "🌍",
      torneo_nacional: "🇨🇱",
      nacional: "🇨🇱",
    };
    return iconos[competencia] || "📢";
  };

  const getColorCompetencia = (competencia) => {
    const colores = {
      libertadores: "warning",
      sudamericana: "info",
      mundial: "success",
      torneo_nacional: "primary",
      nacional: "primary",
    };
    return colores[competencia] || "secondary";
  };

  const notificacionesFiltradas = notificaciones.filter(
    (n) => filtroCompetencia === "todas" || n.competencia === filtroCompetencia
  );

  const competencias = [...new Set(notificaciones.map((n) => n.competencia))];

  if (loading) {
    return (
      <div className="container mt-5">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>
          <i className="bi bi-bell-fill me-2"></i>
          Gestión de Notificaciones
        </h2>
        <button className="btn btn-secondary" onClick={() => navigate("/admin")}>
          <i className="bi bi-arrow-left me-2"></i>
          Volver al Admin
        </button>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {/* Controles */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <label className="form-label">
                <strong>Filtrar por Competencia</strong>
              </label>
              <select
                className="form-select"
                value={filtroCompetencia}
                onChange={(e) => {
                  setFiltroCompetencia(e.target.value);
                  setSeleccionadas(new Set());
                }}
              >
                <option value="todas">Todas las Competencias</option>
                {competencias.map((comp) => (
                  <option key={comp} value={comp}>
                    {getIconoCompetencia(comp)} {comp.replace(/_/g, " ").toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-8">
              <div className="btn-group me-2" role="group">
                <button className="btn btn-outline-primary" onClick={seleccionarTodas}>
                  <i className="bi bi-check-all me-1"></i>
                  Seleccionar Todas ({notificacionesFiltradas.length})
                </button>
                <button className="btn btn-outline-secondary" onClick={deseleccionarTodas}>
                  <i className="bi bi-x-circle me-1"></i>
                  Deseleccionar
                </button>
              </div>
              <button
                className="btn btn-danger"
                onClick={eliminarSeleccionadas}
                disabled={seleccionadas.size === 0}
              >
                <i className="bi bi-trash me-1"></i>
                Eliminar Seleccionadas ({seleccionadas.size})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="row mb-4">
        <div className="col-md-3">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">Total</h5>
              <h2 className="text-primary">{notificaciones.length}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">Filtradas</h5>
              <h2 className="text-info">{notificacionesFiltradas.length}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">Seleccionadas</h5>
              <h2 className="text-warning">{seleccionadas.size}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card text-center">
            <div className="card-body">
              <h5 className="card-title">Competencias</h5>
              <h2 className="text-success">{competencias.length}</h2>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de notificaciones */}
      <div className="card">
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-hover table-striped">
              <thead className="table-dark">
                <tr>
                  <th style={{ width: "50px" }}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={
                        seleccionadas.size === notificacionesFiltradas.length &&
                        notificacionesFiltradas.length > 0
                      }
                      onChange={() => {
                        if (seleccionadas.size === notificacionesFiltradas.length) {
                          deseleccionarTodas();
                        } else {
                          seleccionarTodas();
                        }
                      }}
                    />
                  </th>
                  <th>ID</th>
                  <th>Competencia</th>
                  <th>Tipo</th>
                  <th>Mensaje</th>
                  <th>Jornada</th>
                  <th>Lecturas</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {notificacionesFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center text-muted py-4">
                      No hay notificaciones para mostrar
                    </td>
                  </tr>
                ) : (
                  notificacionesFiltradas.map((notif) => (
                    <tr key={notif.id}>
                      <td>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={seleccionadas.has(notif.id)}
                          onChange={() => toggleSeleccion(notif.id)}
                        />
                      </td>
                      <td>
                        <small className="text-muted">{notif.id}</small>
                      </td>
                      <td>
                        <span className={`badge bg-${getColorCompetencia(notif.competencia)}`}>
                          {getIconoCompetencia(notif.competencia)}{" "}
                          {notif.competencia.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td>
                        <small>{notif.tipo_notificacion || notif.tipo || "N/A"}</small>
                      </td>
                      <td>
                        <div style={{ maxWidth: "300px" }}>
                          <small>{notif.mensaje}</small>
                          {notif.url && (
                            <div className="mt-1">
                              <a
                                href={notif.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-decoration-none small"
                              >
                                <i className="bi bi-link-45deg"></i> Ver enlace
                              </a>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        {notif.jornada_numero ? (
                          <span className="badge bg-secondary">J{notif.jornada_numero}</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <span className="badge bg-info">{notif.lecturas || 0} lecturas</span>
                      </td>
                      <td>
                        <small className="text-muted">{formatearFecha(notif.fecha_calculo)}</small>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => eliminarNotificacion(notif.id)}
                          title="Eliminar"
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de confirmación */}
      {mostrarConfirmacion && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  Confirmar Eliminación
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setMostrarConfirmacion(false)}
                ></button>
              </div>
              <div className="modal-body">
                <p className="mb-3">
                  ¿Estás seguro de que deseas eliminar <strong>{seleccionadas.size}</strong>{" "}
                  notificaciones?
                </p>
                <div className="alert alert-warning mb-0">
                  <i className="bi bi-info-circle me-2"></i>
                  Esta acción no se puede deshacer. Se eliminarán tanto las notificaciones como
                  todas sus lecturas asociadas.
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setMostrarConfirmacion(false)}
                >
                  Cancelar
                </button>
                <button type="button" className="btn btn-danger" onClick={confirmarEliminacion}>
                  <i className="bi bi-trash me-2"></i>
                  Eliminar {seleccionadas.size} Notificaciones
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
