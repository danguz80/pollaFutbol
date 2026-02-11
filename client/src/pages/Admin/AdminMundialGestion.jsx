import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export default function AdminMundialGestion() {
  const navigate = useNavigate();
  const [loadingRespaldo, setLoadingRespaldo] = useState(false);
  const [loadingEliminar, setLoadingEliminar] = useState(false);
  const [respaldoExiste, setRespaldoExiste] = useState(false);
  const [estadisticas, setEstadisticas] = useState(null);
  const [temporada, setTemporada] = useState(2026);

  useEffect(() => {
    verificarRespaldo();
    cargarEstadisticas();
  }, []);

  const verificarRespaldo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/admin/verificar-respaldo-mundial?temporada=${temporada}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRespaldoExiste(response.data.existe);
    } catch (error) {
      console.error('Error verificando respaldo:', error);
    }
  };

  const cargarEstadisticas = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Cargar estadísticas básicas
      const jornadasRes = await axios.get(`${API_URL}/api/mundial/jornadas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const equiposRes = await axios.get(`${API_URL}/api/mundial/equipos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const partidosRes = await axios.get(`${API_URL}/api/mundial/partidos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setEstadisticas({
        totalJornadas: jornadasRes.data.length,
        totalEquipos: equiposRes.data.length,
        totalPartidos: partidosRes.data.length,
        jornadasActivas: jornadasRes.data.filter(j => j.activa).length,
        jornadasCerradas: jornadasRes.data.filter(j => j.cerrada).length
      });
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  };

  const crearRespaldo = async () => {
    if (!confirm(`¿Crear respaldo de ganadores del Mundial ${temporada} en Rankings Históricos?`)) {
      return;
    }

    try {
      setLoadingRespaldo(true);
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/rankings-historicos/actualizar?temporada=${temporada}&competencia=mundial`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      alert(`✅ Respaldo creado exitosamente para temporada ${temporada}\n\n${response.data.mensaje}\n\nTotal guardados: ${response.data.total}`);
      verificarRespaldo();
    } catch (error) {
      console.error('Error creando respaldo:', error);
      alert(`❌ Error creando respaldo: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoadingRespaldo(false);
    }
  };

  const eliminarDatos = async () => {
    if (!respaldoExiste) {
      alert(`⚠️ Primero debes crear un respaldo de los ganadores para la temporada ${temporada}`);
      return;
    }

    const confirmacion = window.prompt(
      `⚠️ ADVERTENCIA: Esta acción eliminará todos los datos del Mundial 2026.\n\n` +
      `Los ganadores se guardarán en Rankings Históricos bajo la temporada ${temporada}.\n\n` +
      'Se eliminarán:\n' +
      '- Todas las jornadas\n' +
      '- Todos los partidos\n' +
      '- Todos los equipos\n' +
      '- Todos los pronósticos\n' +
      '- Todos los ganadores de jornada\n' +
      '- Ganadores del ranking acumulado\n' +
      '- Puntos de clasificación\n' +
      '- Predicciones de campeón\n\n' +
      'Los datos históricos se mantendrán en Rankings Históricos.\n\n' +
      'Para confirmar, escribe: ELIMINAR'
    );

    if (confirmacion !== 'ELIMINAR') {
      alert('Operación cancelada');
      return;
    }

    try {
      setLoadingEliminar(true);
      const token = localStorage.getItem('token');
      const response = await axios.delete(
        `${API_URL}/api/admin/eliminar-datos-mundial`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert(`✅ Datos del Mundial eliminados exitosamente\n\n${response.data.mensaje}\n\nPuedes comenzar una nueva temporada del Mundial.`);
      cargarEstadisticas();
      verificarRespaldo();
    } catch (error) {
      console.error('Error eliminando datos:', error);
      alert(`❌ Error eliminando datos: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoadingEliminar(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>🔧 Gestión y Respaldo - Mundial 2026</h2>
        <div className="d-flex gap-2">
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/admin/mundial')}
          >
            ⚙️ Generador de Fixture
          </button>
          <button 
            className="btn btn-success"
            onClick={() => navigate('/admin/mundial/resultados')}
          >
            📊 Resultados
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/admin')}
          >
            ← Volver
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      {estadisticas && (
        <div className="card mb-4">
          <div className="card-header">
            <h5>📊 Estadísticas del Mundial</h5>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-4 mb-3">
                <div className="p-3 bg-light rounded text-center">
                  <h3 className="text-primary mb-0">{estadisticas.totalJornadas}</h3>
                  <small className="text-muted">Jornadas Totales</small>
                </div>
              </div>
              <div className="col-md-4 mb-3">
                <div className="p-3 bg-light rounded text-center">
                  <h3 className="text-success mb-0">{estadisticas.jornadasActivas}</h3>
                  <small className="text-muted">Jornadas Activas</small>
                </div>
              </div>
              <div className="col-md-4 mb-3">
                <div className="p-3 bg-light rounded text-center">
                  <h3 className="text-danger mb-0">{estadisticas.jornadasCerradas}</h3>
                  <small className="text-muted">Jornadas Cerradas</small>
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <div className="p-3 bg-light rounded text-center">
                  <h3 className="text-info mb-0">{estadisticas.totalEquipos}</h3>
                  <small className="text-muted">Equipos Totales</small>
                </div>
              </div>
              <div className="col-md-6 mb-3">
                <div className="p-3 bg-light rounded text-center">
                  <h3 className="text-warning mb-0">{estadisticas.totalPartidos}</h3>
                  <small className="text-muted">Partidos Totales</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Respaldo y Eliminación */}
      <div className="row">
        <div className="col-md-6">
          <div className="card mb-4">
            <div className="card-header bg-warning">
              <h5 className="mb-0">💾 Crear Respaldo</h5>
            </div>
            <div className="card-body">
              <p>
                Guarda los ganadores actuales del Mundial en Rankings Históricos 
                antes de eliminar los datos de la competencia.
              </p>
              <div className="mb-3">
                <label className="form-label">Temporada:</label>
                <input
                  type="number"
                  className="form-control"
                  value={temporada}
                  onChange={(e) => setTemporada(Number(e.target.value))}
                  min="2026"
                  max="2030"
                />
              </div>
              {respaldoExiste && (
                <div className="alert alert-success">
                  ✅ Ya existe un respaldo para la temporada {temporada}
                </div>
              )}
              <button
                className="btn btn-warning w-100"
                onClick={crearRespaldo}
                disabled={loadingRespaldo}
              >
                {loadingRespaldo ? '⏳ Creando respaldo...' : '💾 Crear Respaldo'}
              </button>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card mb-4">
            <div className="card-header bg-danger text-white">
              <h5 className="mb-0">🗑️ Eliminar Todos los Datos</h5>
            </div>
            <div className="card-body">
              <p className="text-danger fw-bold">
                ⚠️ ACCIÓN IRREVERSIBLE
              </p>
              <p>
                Elimina TODOS los datos del Mundial 2026 (jornadas, partidos, equipos, pronósticos).
                Los ganadores deben estar respaldados en Rankings Históricos.
              </p>
              {!respaldoExiste && (
                <div className="alert alert-warning">
                  ⚠️ Debes crear un respaldo antes de eliminar
                </div>
              )}
              <button
                className="btn btn-danger w-100"
                onClick={eliminarDatos}
                disabled={loadingEliminar || !respaldoExiste}
              >
                {loadingEliminar ? '⏳ Eliminando...' : '🗑️ Eliminar Todos los Datos'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Información adicional */}
      <div className="card">
        <div className="card-header">
          <h5>ℹ️ Información Importante</h5>
        </div>
        <div className="card-body">
          <ul>
            <li><strong>Respaldo:</strong> Crea una copia de los ganadores en Rankings Históricos antes de eliminar datos</li>
            <li><strong>Temporada:</strong> Identifica el año del Mundial para los rankings históricos</li>
            <li><strong>Eliminación:</strong> Borra todos los datos del Mundial actual para comenzar una nueva temporada</li>
            <li><strong>Seguridad:</strong> No se puede eliminar sin haber creado un respaldo primero</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
