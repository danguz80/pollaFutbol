import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

const FASE_LABELS = {
  grupos: 'Fase de grupos',
  final: 'Fase final (Final / 3er-4to / vergüenza)',
  posiciones_grupo: 'Acierto de posición en el grupo',
  posiciones_finales: 'Acierto de posiciones finales (1° a 6°)'
};

const CONCEPTO_LABELS = {
  resultado: 'Signo 1X2 (local, empate, visitante)',
  diferencia: 'Diferencia de goles',
  exacto: 'Resultado exacto',
  '1er_lugar': '1er lugar del grupo',
  '2do_lugar': '2do lugar del grupo',
  '3er_lugar': '3er lugar del grupo / 3er lugar final',
  campeon: 'Campeón',
  subcampeon: 'Subcampeón',
  '4to_lugar': '4to lugar final',
  '5to_lugar': '5to lugar final',
  ultimo: 'Último lugar (6to)'
};

export default function PuntuacionCopaGinoPerez() {
  const navigate = useNavigate();
  const [reglas, setReglas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
  const esAdmin = usuario?.rol === 'admin';

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/copa-gino-perez/puntuacion/reglas`);
      setReglas(res.data);
    } catch (err) {
      console.error('Error cargando reglas:', err);
    } finally {
      setLoading(false);
    }
  };

  const actualizarPuntos = (id, puntos) => {
    setReglas(prev => prev.map(r => r.id === id ? { ...r, puntos: Number(puntos) } : r));
  };

  const guardar = async () => {
    try {
      setGuardando(true);
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/copa-gino-perez/puntuacion/reglas`,
        { reglas: reglas.map(r => ({ id: r.id, puntos: r.puntos })) },
        { headers: { Authorization: `Bearer ${token}` } });
      setMensaje('✅ Reglas actualizadas y puntajes recalculados');
    } catch (err) {
      console.error('Error guardando reglas:', err);
      setMensaje('❌ Error guardando reglas');
    } finally {
      setGuardando(false);
    }
  };

  if (loading) return <div className="text-center mt-4">Cargando...</div>;

  const fases = [...new Set(reglas.map(r => r.fase))];

  return (
    <div className="container mt-4 mb-5">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-secondary" onClick={() => navigate('/copa-gino-perez')}>
          ← Volver a Copa Gino Pérez
        </button>
      </div>

      <h1 className="text-center mb-4">🧮 Puntuación Copa Gino Pérez</h1>
      {mensaje && <div className="alert alert-info text-center">{mensaje}</div>}

      {fases.map(fase => (
        <div key={fase} className="mb-4">
          <h4 style={{ background: '#111', color: '#fff', padding: 8, borderRadius: 6 }} className="text-center">
            {FASE_LABELS[fase] || fase}
          </h4>
          <table className="table table-bordered text-center">
            <thead className="table-dark">
              <tr>
                <th>Concepto</th>
                <th style={{ width: 120 }}>Puntos</th>
              </tr>
            </thead>
            <tbody>
              {reglas.filter(r => r.fase === fase).map(r => (
                <tr key={r.id}>
                  <td>{CONCEPTO_LABELS[r.concepto] || r.concepto}</td>
                  <td>
                    {esAdmin ? (
                      <input type="number" className="form-control form-control-sm text-center"
                        value={r.puntos} onChange={e => actualizarPuntos(r.id, e.target.value)} />
                    ) : r.puntos}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {esAdmin && (
        <div className="text-center">
          <button className="btn btn-primary" disabled={guardando} onClick={guardar}>
            {guardando ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      )}
    </div>
  );
}
