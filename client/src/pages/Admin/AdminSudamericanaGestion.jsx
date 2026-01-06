import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export default function AdminSudamericanaGestion() {
  const navigate = useNavigate();
  const [loadingRespaldo, setLoadingRespaldo] = useState(false);
  const [loadingEliminar, setLoadingEliminar] = useState(false);
  const [respaldoExiste, setRespaldoExiste] = useState(false);
  const [estadisticas, setEstadisticas] = useState(null);
  const [temporada, setTemporada] = useState(2026); // Temporada actual

  useEffect(() => {
    verificarRespaldo();
    cargarEstadisticas();
  }, []);

  const verificarRespaldo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/admin/verificar-respaldo-sudamericana?temporada=${temporada}`,
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
      const response = await axios.get(
        `${API_URL}/api/admin/estadisticas-sudamericana`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEstadisticas(response.data);
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  };

  const crearRespaldo = async () => {
    if (!confirm(`¿Crear respaldo de ganadores de Copa Sudamericana ${temporada} en Rankings Históricos?`)) {
      return;
    }

    try {
      setLoadingRespaldo(true);
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/rankings-historicos/actualizar?temporada=${temporada}&competencia=sudamericana`,
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
      `⚠️ ADVERTENCIA: Esta acción eliminará todos los datos de Copa Sudamericana.\n\n` +
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
        `${API_URL}/api/admin/eliminar-datos-sudamericana?temporada=${temporada}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      alert(`✅ Datos eliminados exitosamente\n\n${response.data.mensaje}\n\nLos ganadores fueron guardados en Rankings Históricos - Temporada ${temporada}`);
      cargarEstadisticas();
      verificarRespaldo();
    } catch (error) {
      console.error('Error eliminando datos:', error);
      alert(`❌ Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoadingEliminar(false);
    }
  };

  return (
    <div className="container mt-4">
      {/* Botonera Principal Sudamericana */}
      <div className="mb-4 text-center d-flex gap-3 justify-content-center flex-wrap">
        <button 
          className="btn btn-danger btn-lg px-4"
          onClick={() => navigate('/sudamericana/estadisticas')}
        >
          📊 Estadísticas
        </button>
        <button 
          className="btn btn-primary btn-lg px-4"
          onClick={() => navigate('/sudamericana/clasificacion')}
        >
          📋 Clasificación
        </button>
        <button 
          className="btn btn-warning btn-lg px-4"
          onClick={() => navigate('/sudamericana/puntuacion')}
        >
          🏆 Puntuación
        </button>
        <button 
          className="btn btn-success btn-lg px-4"
          onClick={() => navigate('/sudamericana/ganadores-jornada')}
        >
          ⭐ Ganadores de Jornadas
        </button>
      </div>
      
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>🔴 Administración Copa Sudamericana</h2>
        <div className="d-flex gap-2">
          <button 
            className="btn btn-success"
            onClick={() => navigate('/admin/sudamericana/resultados')}
          >
            📊 Resultados y Jornadas
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/admin/sudamericana/fixture')}
          >
            📋 Generar Fixture
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/admin')}
          >
            ← Volver
          </button>
        </div>
      </div>

      {/* Estado del respaldo */}
      <div className="card mb-4">
        <div className="card-header">
          <h5>🗓️ Temporada de la Copa</h5>
        </div>
        <div className="card-body">
          <div className="d-flex align-items-center gap-3">
            <label className="fw-bold">Seleccionar Temporada:</label>
            <select 
              className="form-select w-auto"
              value={temporada}
              onChange={(e) => {
                setTemporada(parseInt(e.target.value));
                setTimeout(verificarRespaldo, 100);
              }}
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
              <option value={2028}>2028</option>
            </select>
            <span className="text-muted">
              Esta temporada se usará para respaldar los ganadores en Rankings Históricos
            </span>
          </div>
        </div>
      </div>

      <div className={`alert ${respaldoExiste ? 'alert-success' : 'alert-warning'} mb-4`}>
        <h5 className="alert-heading">
          {respaldoExiste ? `✅ Respaldo Existente (Temporada ${temporada})` : `⚠️ Sin Respaldo para Temporada ${temporada}`}
        </h5>
        <p className="mb-0">
          {respaldoExiste 
            ? `Los ganadores de la temporada ${temporada} están respaldados en Rankings Históricos. Puedes eliminar los datos de forma segura.`
            : `No existe un respaldo para la temporada ${temporada}. Debes crear uno antes de eliminar datos.`}
        </p>
      </div>

      {/* Estadísticas actuales */}
      {estadisticas && (
        <div className="card mb-4">
          <div className="card-header">
            <h5>📊 Datos Actuales de Sudamericana</h5>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-2">
                <div className="text-center p-3 bg-light rounded">
                  <h3 className="mb-0">{estadisticas.jornadas}</h3>
                  <small className="text-muted">Jornadas</small>
                </div>
              </div>
              <div className="col-md-2">
                <div className="text-center p-3 bg-light rounded">
                  <h3 className="mb-0">{estadisticas.partidos}</h3>
                  <small className="text-muted">Partidos</small>
                </div>
              </div>
              <div className="col-md-2">
                <div className="text-center p-3 bg-light rounded">
                  <h3 className="mb-0">{estadisticas.equipos}</h3>
                  <small className="text-muted">Equipos</small>
                </div>
              </div>
              <div className="col-md-2">
                <div className="text-center p-3 bg-light rounded">
                  <h3 className="mb-0">{estadisticas.pronosticos}</h3>
                  <small className="text-muted">Pronósticos</small>
                </div>
              </div>
              <div className="col-md-2">
                <div className="text-center p-3 bg-light rounded">
                  <h3 className="mb-0">{estadisticas.ganadores}</h3>
                  <small className="text-muted">Ganadores</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Botones de acción */}
      <div className="card">
        <div className="card-header">
          <h5>🔧 Acciones Administrativas</h5>
        </div>
        <div className="card-body">
          <div className="d-grid gap-3">
            {/* Botón crear respaldo */}
            <div>
              <button
                className="btn btn-primary btn-lg w-100"
                onClick={crearRespaldo}
                disabled={loadingRespaldo || loadingEliminar}
              >
                {loadingRespaldo ? '⏳ Procesando...' : '💾 Crear Respaldo de Ganadores'}
              </button>
              <small className="text-muted d-block mt-2">
                Guarda los ganadores actuales en Rankings Históricos antes de eliminar datos
              </small>
            </div>

            {/* Botón eliminar datos */}
            <div>
              <button
                className="btn btn-danger btn-lg w-100"
                onClick={eliminarDatos}
                disabled={loadingRespaldo || loadingEliminar || !respaldoExiste}
              >
                {loadingEliminar ? '⏳ Eliminando...' : '🗑️ Eliminar Datos de Sudamericana'}
              </button>
              <small className="text-muted d-block mt-2">
                Elimina todos los datos de Sudamericana para preparar el nuevo año.
                {!respaldoExiste && ' (Requiere respaldo previo)'}
              </small>
            </div>
          </div>
        </div>
      </div>

      {/* Información adicional */}
      <div className="alert alert-info mt-4">
        <h6>ℹ️ Información Importante</h6>
        <ul className="mb-0">
          <li>El respaldo guarda los ganadores en la tabla Rankings Históricos</li>
          <li>Los datos eliminados NO se pueden recuperar</li>
          <li>Los Rankings Históricos NO se verán afectados</li>
          <li>Después de eliminar, puedes generar el fixture del nuevo año</li>
        </ul>
      </div>
    </div>
  );
}
