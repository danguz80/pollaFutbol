import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AccesosDirectos from '../../components/AccesosDirectos';

const API_URL = import.meta.env.VITE_API_URL;

const CRITERIOS_DESEMPATE = [
  'Mayor cantidad de goles marcados en calidad de visita.',
  'Menor cantidad de tarjetas rojas recibidas.',
  'Menor cantidad de tarjetas amarillas recibidas.',
  'Sorteo.'
];

export default function AdminTorneoNacional() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [respaldoExiste, setRespaldoExiste] = useState(false);
  const [estadisticas, setEstadisticas] = useState(null);
  const [temporada, setTemporada] = useState(2026); // Temporada actual del torneo
  const [equiposEmpatados, setEquiposEmpatados] = useState([]); // ← aquí deberías setear los equipos empatados detectados
  const [criterioSeleccionado, setCriterioSeleccionado] = useState(CRITERIOS_DESEMPATE[0]);
  const [detalle, setDetalle] = useState('');
  const [aplicandoDesempate, setAplicandoDesempate] = useState(false);
  const [ordenEquipos, setOrdenEquipos] = useState([]);

  useEffect(() => {
    verificarRespaldo();
    cargarEstadisticas();
    cargarEmpatesPendientes();
  }, []);

  const cargarEmpatesPendientes = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/estadisticas-nacional/empates-pendientes`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const empates = response.data.equiposEmpatados || [];
      setEquiposEmpatados(empates);
      setOrdenEquipos(empates); // Inicializar orden con el orden actual
    } catch (error) {
      console.error('Error cargando empates pendientes:', error);
      setEquiposEmpatados([]);
      setOrdenEquipos([]);
    }
  };

  const verificarRespaldo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/admin/verificar-respaldo-torneo?temporada=${temporada}`,
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
        `${API_URL}/api/admin/estadisticas-torneo`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEstadisticas(response.data);
    } catch (error) {
      console.error('Error cargando estadísticas:', error);
    }
  };

  const crearRespaldo = async () => {
    if (!confirm(`¿Crear respaldo de ganadores del Torneo Nacional ${temporada} en Rankings Históricos?`)) {
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/rankings-historicos/actualizar?temporada=${temporada}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      alert(`✅ Respaldo creado exitosamente para temporada ${temporada}\n\n${response.data.mensaje}\n\nTotal guardados: ${response.data.total}`);
      verificarRespaldo();
    } catch (error) {
      console.error('Error creando respaldo:', error);
      alert(`❌ Error creando respaldo: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const eliminarDatos = async () => {
    if (!respaldoExiste) {
      alert(`⚠️ Primero debes crear un respaldo de los ganadores para la temporada ${temporada}`);
      return;
    }

    const confirmacion = window.prompt(
      `⚠️ ADVERTENCIA: Esta acción eliminará todos los datos del Torneo Nacional.\n\n` +
      `Los ganadores se guardarán en Rankings Históricos bajo la temporada ${temporada}.\n\n` +
      'Se eliminarán:\n' +
      '- Todas las jornadas\n' +
      '- Todos los partidos\n' +
      '- Todos los pronósticos\n' +
      '- Todos los ganadores de jornada\n' +
      '- Ganadores del ranking acumulado\n\n' +
      'Los datos históricos se mantendrán en Rankings Históricos.\n\n' +
      'Para confirmar, escribe: ELIMINAR'
    );

    if (confirmacion !== 'ELIMINAR') {
      alert('Operación cancelada');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.delete(
        `${API_URL}/api/admin/eliminar-datos-torneo?temporada=${temporada}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      alert(`✅ Datos eliminados exitosamente\n\n${response.data.mensaje}\n\nLos ganadores fueron guardados en Rankings Históricos - Temporada ${temporada}`);
      cargarEstadisticas();
      verificarRespaldo();
    } catch (error) {
      console.error('Error eliminando datos:', error);
      alert(`❌ Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const aplicarDesempate = async () => {
    if (equiposEmpatados.length === 0) {
      alert('No hay equipos empatados para aplicar desempate.');
      return;
    }
    if (ordenEquipos.length !== equiposEmpatados.length) {
      alert('⚠️ Debes definir el orden de todos los equipos empatados.');
      return;
    }
    setAplicandoDesempate(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/api/desempate-torneo/aplicar`,
        {
          temporada,
          equipos: equiposEmpatados.sort().join(','), // Orden original (alfabético)
          criterio: criterioSeleccionado,
          detalle,
          orden: ordenEquipos.join(',') // Orden final después del desempate
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('✅ Criterio de desempate aplicado correctamente.');
      setDetalle('');
      await cargarEmpatesPendientes(); // Recargar lista de empates
    } catch (error) {
      alert('❌ Error aplicando desempate: ' + (error.response?.data?.error || error.message));
    } finally {
      setAplicandoDesempate(false);
    }
  };

  const moverEquipoArriba = (index) => {
    if (index === 0) return;
    const nuevoOrden = [...ordenEquipos];
    [nuevoOrden[index - 1], nuevoOrden[index]] = [nuevoOrden[index], nuevoOrden[index - 1]];
    setOrdenEquipos(nuevoOrden);
  };

  const moverEquipoAbajo = (index) => {
    if (index === ordenEquipos.length - 1) return;
    const nuevoOrden = [...ordenEquipos];
    [nuevoOrden[index], nuevoOrden[index + 1]] = [nuevoOrden[index + 1], nuevoOrden[index]];
    setOrdenEquipos(nuevoOrden);
  };

  return (
    <div className="container mt-4">
      <AccesosDirectos />
      
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>⚽ Administración Torneo Nacional</h2>
        <div className="d-flex gap-2">
          <button 
            className="btn btn-success"
            onClick={() => navigate('/admin/torneo-nacional/resultados')}
          >
            📊 Resultados y Jornadas
          </button>
          <button 
            className="btn btn-warning"
            onClick={() => navigate('/admin/torneo-nacional/cuadro-final')}
          >
            🏆 Cuadro Final
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/admin/torneo-nacional/fixture')}
          >
            📋 Importar Fixture
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
          <h5>🗓️ Temporada del Torneo</h5>
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
            <h5>📊 Datos Actuales del Torneo</h5>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-3">
                <div className="text-center p-3 bg-light rounded">
                  <h3 className="mb-0">{estadisticas.jornadas}</h3>
                  <small className="text-muted">Jornadas</small>
                </div>
              </div>
              <div className="col-md-3">
                <div className="text-center p-3 bg-light rounded">
                  <h3 className="mb-0">{estadisticas.partidos}</h3>
                  <small className="text-muted">Partidos</small>
                </div>
              </div>
              <div className="col-md-3">
                <div className="text-center p-3 bg-light rounded">
                  <h3 className="mb-0">{estadisticas.pronosticos}</h3>
                  <small className="text-muted">Pronósticos</small>
                </div>
              </div>
              <div className="col-md-3">
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
                disabled={loading}
              >
                {loading ? '⏳ Procesando...' : '💾 Crear Respaldo de Ganadores'}
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
                disabled={loading || !respaldoExiste}
              >
                {loading ? '⏳ Eliminando...' : '🗑️ Eliminar Datos del Torneo'}
              </button>
              <small className="text-muted d-block mt-2">
                Elimina todos los datos del torneo actual para preparar el nuevo año.
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
          <li>Después de eliminar, puedes importar el fixture del nuevo año</li>
        </ul>
      </div>

      {/* Sección de desempate si hay equipos empatados */}
      {equiposEmpatados.length > 0 && (
        <div className="alert alert-warning mb-4">
          <h5>⚠️ Desempate requerido</h5>
          <p className="mb-3">
            Los siguientes equipos están empatados en los primeros 4 criterios automáticos (puntos, diferencia de goles, partidos ganados, goles a favor).
          </p>
          
          <div className="mb-3">
            <label className="fw-bold">Selecciona el criterio a aplicar:</label>
            <select
              className="form-select mt-1"
              value={criterioSeleccionado}
              onChange={e => setCriterioSeleccionado(e.target.value)}
            >
              {CRITERIOS_DESEMPATE.map((criterio, idx) => (
                <option key={idx} value={criterio}>{criterio}</option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="fw-bold">Ordena los equipos según el criterio seleccionado:</label>
            <p className="small text-muted mb-2">Usa las flechas para ordenar del primero al último en la tabla</p>
            <div className="list-group">
              {ordenEquipos.map((equipo, index) => (
                <div key={equipo} className="list-group-item d-flex justify-content-between align-items-center">
                  <span>
                    <strong>{index + 1}.</strong> {equipo}
                  </span>
                  <div>
                    <button
                      className="btn btn-sm btn-outline-primary me-1"
                      onClick={() => moverEquipoArriba(index)}
                      disabled={index === 0}
                      title="Mover arriba"
                    >
                      ↑
                    </button>
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => moverEquipoAbajo(index)}
                      disabled={index === ordenEquipos.length - 1}
                      title="Mover abajo"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <label>Detalle adicional (opcional):</label>
            <input
              className="form-control"
              value={detalle}
              onChange={e => setDetalle(e.target.value)}
              placeholder="Ej: goles de visita: Limache 3, Católica 2"
            />
          </div>

          <button
            className="btn btn-success"
            onClick={aplicarDesempate}
            disabled={aplicandoDesempate}
          >
            {aplicandoDesempate ? 'Aplicando...' : 'Aplicar criterio de desempate'}
          </button>
        </div>
      )}
    </div>
  );
}
