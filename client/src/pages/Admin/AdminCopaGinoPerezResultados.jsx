import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

// Convierte un timestamp ISO (como lo devuelve el backend) al formato que
// espera un <input type="datetime-local"> (hora local, sin zona horaria).
const fechaATextoLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const FASES = {
  grupos: 'Fase de grupos',
  final: 'Final (1° y 2° lugar)',
  tercer_puesto: '3er y 4to puesto',
  verguenza: 'Partido de la vergüenza (5to y 6to lugar)'
};

export default function AdminCopaGinoPerezResultados() {
  const navigate = useNavigate();
  const [partidos, setPartidos] = useState([]);
  const [clasificacion, setClasificacion] = useState(null);
  const [cerrado, setCerrado] = useState(false);
  const [cambiandoCierre, setCambiandoCierre] = useState(false);
  const [fechaCierre, setFechaCierre] = useState('');
  const [guardandoFecha, setGuardandoFecha] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarPartidos();
  }, []);

  const cargarPartidos = async () => {
    try {
      setLoading(true);
      const [partidosRes, clasificacionRes, configRes] = await Promise.all([
        axios.get(`${API_URL}/api/copa-gino-perez/partidos`),
        axios.get(`${API_URL}/api/copa-gino-perez/clasificacion`),
        axios.get(`${API_URL}/api/copa-gino-perez/config`)
      ]);
      setPartidos(partidosRes.data);
      setClasificacion(clasificacionRes.data);
      setCerrado(configRes.data.cerrado);
      setFechaCierre(fechaATextoLocal(configRes.data.fecha_cierre));
      const nuevoForm = {};
      partidosRes.data.forEach(p => {
        nuevoForm[p.id] = {
          goles_local: p.goles_local ?? '',
          goles_visita: p.goles_visita ?? '',
          ganador_id: p.ganador_id ?? ''
        };
      });
      setForm(nuevoForm);
    } catch (err) {
      console.error('Error cargando partidos:', err);
    } finally {
      setLoading(false);
    }
  };

  const cambiarCierre = async (nuevoCerrado) => {
    const confirmacion = nuevoCerrado
      ? '¿Cerrar los pronósticos? Los usuarios ya no podrán modificarlos y se mostrarán los pronósticos de todos en la página Clasificación.'
      : '¿Reabrir los pronósticos? Los usuarios podrán volver a modificarlos.';
    if (!confirm(confirmacion)) return;
    try {
      setCambiandoCierre(true);
      const token = localStorage.getItem('token');
      const res = await axios.patch(`${API_URL}/api/copa-gino-perez/admin/cerrar`,
        { cerrado: nuevoCerrado },
        { headers: { Authorization: `Bearer ${token}` } });
      setCerrado(res.data.cerrado);
      setMensaje(res.data.mensaje);
    } catch (err) {
      console.error('Error cambiando el cierre de pronósticos:', err);
      alert('❌ ' + (err.response?.data?.error || 'Error cambiando el cierre de pronósticos'));
    } finally {
      setCambiandoCierre(false);
    }
  };

  const guardarFechaCierre = async () => {
    try {
      setGuardandoFecha(true);
      const token = localStorage.getItem('token');
      const res = await axios.patch(`${API_URL}/api/copa-gino-perez/admin/fecha-cierre`,
        { fecha_cierre: fechaCierre || null },
        { headers: { Authorization: `Bearer ${token}` } });
      setMensaje(res.data.mensaje);
    } catch (err) {
      console.error('Error guardando fecha de cierre:', err);
      alert('❌ ' + (err.response?.data?.error || 'Error guardando la fecha de cierre'));
    } finally {
      setGuardandoFecha(false);
    }
  };

  const quitarFechaCierre = async () => {
    setFechaCierre('');
    try {
      setGuardandoFecha(true);
      const token = localStorage.getItem('token');
      const res = await axios.patch(`${API_URL}/api/copa-gino-perez/admin/fecha-cierre`,
        { fecha_cierre: null },
        { headers: { Authorization: `Bearer ${token}` } });
      setMensaje(res.data.mensaje);
    } catch (err) {
      console.error('Error quitando fecha de cierre:', err);
    } finally {
      setGuardandoFecha(false);
    }
  };

  const actualizarCampo = (partidoId, campo, valor) => {
    setForm(prev => ({ ...prev, [partidoId]: { ...prev[partidoId], [campo]: valor } }));
  };

  const requiereGanador = partidoId => [7, 8, 9].includes(partidoId);

  const guardarResultado = async (partido) => {
    const datos = form[partido.id];
    if (datos.goles_local === '' || datos.goles_visita === '') {
      alert('Completa el marcador de ambos equipos');
      return;
    }
    const golesLocal = parseInt(datos.goles_local);
    const golesVisita = parseInt(datos.goles_visita);
    const esEmpate = golesLocal === golesVisita;

    if (esEmpate && requiereGanador(partido.id) && !datos.ganador_id) {
      alert('Este partido necesita un ganador (ej. por penales) porque terminó empatado');
      return;
    }

    try {
      setGuardando(partido.id);
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/copa-gino-perez/admin/partidos/${partido.id}`, {
        goles_local: golesLocal,
        goles_visita: golesVisita,
        ganador_id: esEmpate ? parseInt(datos.ganador_id) : null
      }, { headers: { Authorization: `Bearer ${token}` } });
      setMensaje(`✅ Resultado del Partido ${partido.id} guardado y puntajes recalculados`);
      await cargarPartidos();
    } catch (err) {
      console.error('Error guardando resultado:', err);
      alert('❌ ' + (err.response?.data?.error || 'Error guardando resultado'));
    } finally {
      setGuardando(null);
    }
  };

  if (loading) return <div className="text-center mt-4">Cargando...</div>;

  return (
    <div className="container mt-4 mb-5">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-secondary" onClick={() => navigate('/copa-gino-perez')}>
          ← Volver a Copa Gino Pérez
        </button>
      </div>

      <h1 className="text-center mb-4">⚽ Admin: Resultados Copa Gino Pérez</h1>
      {mensaje && <div className="alert alert-success text-center">{mensaje}</div>}

      <div className="text-center mb-4">
        <span className={`badge ${cerrado ? 'bg-danger' : 'bg-success'} me-2`} style={{ fontSize: '1em' }}>
          {cerrado ? '🔒 Pronósticos cerrados' : '🔓 Pronósticos abiertos'}
        </span>
        <button
          className={`btn btn-sm ${cerrado ? 'btn-outline-success' : 'btn-outline-danger'}`}
          disabled={cambiandoCierre}
          onClick={() => cambiarCierre(!cerrado)}
        >
          {cambiandoCierre ? 'Guardando...' : cerrado ? 'Reabrir pronósticos' : 'Cerrar pronósticos'}
        </button>
        <p className="text-muted small mt-2 mb-0">
          Al cerrar, los usuarios ya no pueden editar su pronóstico y en la página Clasificación se
          muestran los pronósticos de todos (antes de cerrar, cada uno solo ve el propio).
        </p>

        <div className="d-flex flex-column align-items-center gap-2 mt-3" style={{ maxWidth: 360, margin: '0 auto' }}>
          <label className="form-label mb-0 fw-bold">Cierre automático (opcional)</label>
          <input type="datetime-local" className="form-control" value={fechaCierre}
            disabled={cerrado}
            onChange={e => setFechaCierre(e.target.value)} />
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-primary" disabled={cerrado || guardandoFecha || !fechaCierre}
              onClick={guardarFechaCierre}>
              {guardandoFecha ? 'Guardando...' : 'Programar cierre'}
            </button>
            <button className="btn btn-sm btn-outline-secondary" disabled={cerrado || guardandoFecha || !fechaCierre}
              onClick={quitarFechaCierre}>
              Quitar fecha
            </button>
          </div>
          <p className="text-muted small mb-0">
            Al llegar esa fecha/hora, los pronósticos se cierran solos (no hace falta que entres a cerrarlos a mano).
          </p>
        </div>
      </div>

      <p className="text-muted text-center small">
        Los 2 primeros de cada grupo avanzan a la Final, los 2 segundos al 3er/4to puesto
        y los 2 terceros al partido de la vergüenza. El orden se actualiza solo a medida
        que se van cargando los resultados reales de la fase de grupos.
      </p>

      {clasificacion && (
        <div className="row mb-4">
          {[1, 2].map(grupoNum => {
            const standings = grupoNum === 1 ? clasificacion.grupo1 : clasificacion.grupo2;
            return (
              <div key={grupoNum} className="col-md-6">
                <h5 className="text-center">Grupo {grupoNum}</h5>
                <table className="table table-sm table-bordered text-center">
                  <thead className="table-dark">
                    <tr><th>#</th><th>Equipo</th><th>Pts</th><th>DG</th><th>GF</th></tr>
                  </thead>
                  <tbody>
                    {standings.map((s, idx) => (
                      <tr key={s.equipo_id} className={idx === 0 ? 'table-success' : idx === 1 ? 'table-warning' : ''}>
                        <td>{idx + 1}°</td>
                        <td>{s.nombre}</td>
                        <td>{s.puntos}</td>
                        <td>{s.dg}</td>
                        <td>{s.gf}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {clasificacion?.posicionesFinales && (
        <div className="alert alert-dark text-center mb-4">
          🏆 1° {clasificacion.posicionesFinales[1]} · 🥈 2° {clasificacion.posicionesFinales[2]} ·
          3° {clasificacion.posicionesFinales[3]} · 4° {clasificacion.posicionesFinales[4]} ·
          5° {clasificacion.posicionesFinales[5]} · 🙈 6° {clasificacion.posicionesFinales[6]}
        </div>
      )}

      {partidos.map(p => {
        const datos = form[p.id] || {};
        const equiposListos = p.equipo_local_id && p.equipo_visita_id;
        return (
          <div key={p.id} className="card mb-3">
            <div className="card-header d-flex justify-content-between">
              <span>Partido {p.id} — {FASES[p.fase]}{p.grupo ? ` (Grupo ${p.grupo})` : ''}</span>
              {p.jugado && <span className="badge bg-success">Jugado</span>}
            </div>
            <div className="card-body">
              {!equiposListos ? (
                <p className="text-muted mb-0">
                  Todavía no se puede ingresar: {p.descripcion_local} vs {p.descripcion_visita}
                  {' '}(depende de un resultado anterior)
                </p>
              ) : (
                <div className="row align-items-center g-2">
                  <div className="col-md-4">
                    <strong>{p.equipo_local_nombre}</strong>
                  </div>
                  <div className="col-md-1">
                    <input type="number" min="0" className="form-control"
                      value={datos.goles_local}
                      onChange={e => actualizarCampo(p.id, 'goles_local', e.target.value)} />
                  </div>
                  <div className="col-md-1 text-center">vs</div>
                  <div className="col-md-1">
                    <input type="number" min="0" className="form-control"
                      value={datos.goles_visita}
                      onChange={e => actualizarCampo(p.id, 'goles_visita', e.target.value)} />
                  </div>
                  <div className="col-md-3">
                    <strong>{p.equipo_visita_nombre}</strong>
                  </div>
                  <div className="col-md-2">
                    <button className="btn btn-primary w-100" disabled={guardando === p.id}
                      onClick={() => guardarResultado(p)}>
                      {guardando === p.id ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                  {requiereGanador(p.id) && datos.goles_local !== '' && datos.goles_visita !== ''
                    && parseInt(datos.goles_local) === parseInt(datos.goles_visita) && (
                    <div className="col-12 mt-2">
                      <label className="form-label text-danger mb-1">
                        Empate: ¿quién ganó (ej. por penales)?
                      </label>
                      <select className="form-select" value={datos.ganador_id}
                        onChange={e => actualizarCampo(p.id, 'ganador_id', e.target.value)}>
                        <option value="">Selecciona el ganador...</option>
                        <option value={p.equipo_local_id}>{p.equipo_local_nombre}</option>
                        <option value={p.equipo_visita_id}>{p.equipo_visita_nombre}</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
