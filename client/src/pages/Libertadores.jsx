import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export default function Libertadores() {
  const navigate = useNavigate();
  const [jornadas, setJornadas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarJornadas();
  }, []);

  const cargarJornadas = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/libertadores/jornadas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setJornadas(response.data);
    } catch (error) {
      console.error('Error cargando jornadas:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSubtitulo = (numero) => {
    if (numero <= 6) return 'Fase de Grupos';
    if (numero === 7) return 'Octavos de Final IDA';
    if (numero === 8) return 'Octavos de Final VUELTA';
    if (numero === 9) return 'Cuartos de Final IDA/VUELTA';
    if (numero === 10) return 'Semifinales IDA/VUELTA + Final + Cuadro Final';
    return '';
  };

  const getEstadoJornada = (jornada) => {
    if (jornada.cerrada) return { texto: 'Cerrada', clase: 'danger' };
    if (jornada.activa) return { texto: 'Abierta', clase: 'success' };
    return { texto: 'Próximamente', clase: 'secondary' };
  };

  if (loading) {
    return (
      <div className="container text-center mt-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="text-center mb-4">
        <h1 className="display-5 fw-bold">🔴 Copa Libertadores 2026</h1>
        <p className="text-muted">La competición más importante de clubes de Sudamérica</p>
      </div>

      {/* Botón de Estadísticas */}
      <div className="mb-4 text-center">
        <button 
          className="btn btn-danger btn-lg px-4"
          onClick={() => navigate('/libertadores/estadisticas')}
        >
          📊 Ver Estadísticas y Tablas de Posiciones
        </button>
      </div>

      <div className="row g-3">
        {jornadas.map((jornada) => {
          const estado = getEstadoJornada(jornada);
          return (
            <div key={jornada.id} className="col-12 col-md-6 col-lg-4">
              <div className="card h-100 shadow-sm hover-shadow">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div>
                      <h5 className="card-title mb-0">{jornada.nombre}</h5>
                      <p className="text-muted small mb-0">{getSubtitulo(jornada.numero)}</p>
                    </div>
                    <span className={`badge bg-${estado.clase}`}>{estado.texto}</span>
                  </div>
                  
                  {jornada.fecha_inicio && (
                    <p className="text-muted small mb-2">
                      📅 {new Date(jornada.fecha_inicio).toLocaleDateString('es-CL')}
                    </p>
                  )}
                  
                  {jornada.descripcion && (
                    <p className="card-text small text-muted">{jornada.descripcion}</p>
                  )}
                  
                  <button
                    className="btn btn-primary w-100 mt-2"
                    onClick={() => navigate(`/libertadores/jornada/${jornada.numero}`)}
                    disabled={!jornada.activa && jornada.cerrada}
                  >
                    {jornada.activa ? '⚽ Ingresar Pronósticos' : jornada.cerrada ? '👁️ Ver Resultados' : '👁️ Ver Detalles'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {jornadas.length === 0 && (
        <div className="alert alert-info text-center mt-4">
          <h5>📋 No hay jornadas disponibles</h5>
          <p className="mb-0">Las jornadas de la Copa Libertadores se habilitarán próximamente.</p>
        </div>
      )}
    </div>
  );
}
