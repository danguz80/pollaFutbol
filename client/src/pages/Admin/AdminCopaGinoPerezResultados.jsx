import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

const FASES = {
  grupos: 'Fase de grupos',
  final: 'Final (1° y 2° lugar)',
  tercer_puesto: '3er y 4to puesto',
  verguenza: 'Partido de la vergüenza (5to y 6to lugar)'
};

export default function AdminCopaGinoPerezResultados() {
  const navigate = useNavigate();
  const [partidos, setPartidos] = useState([]);
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
      const res = await axios.get(`${API_URL}/api/copa-gino-perez/partidos`);
      setPartidos(res.data);
      const nuevoForm = {};
      res.data.forEach(p => {
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
