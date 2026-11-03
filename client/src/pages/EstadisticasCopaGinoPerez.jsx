import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

const FASES = {
  grupos: 'Fase de grupos',
  final: 'Final',
  tercer_puesto: '3er y 4to puesto',
  verguenza: 'Partido de la vergüenza'
};

function TablaGrupo({ titulo, standings }) {
  return (
    <div className="col-md-6 mb-4">
      <h4 className="text-center">{titulo}</h4>
      <table className="table table-bordered text-center">
        <thead className="table-dark">
          <tr>
            <th>#</th>
            <th>Equipo</th>
            <th>Pts</th>
            <th>DG</th>
            <th>GF</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, idx) => (
            <tr key={s.equipo_id} className={idx === 0 ? 'table-success' : ''}>
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
}

export default function EstadisticasCopaGinoPerez() {
  const navigate = useNavigate();
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/api/copa-gino-perez/clasificacion`);
      setDatos(res.data);
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
      setError('No se pudieron cargar las estadísticas');
    } finally {
      setLoading(false);
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

      <h1 className="text-center mb-4">📈 Estadísticas Copa Gino Pérez</h1>
      {error && <div className="alert alert-danger text-center">{error}</div>}

      {datos && (
        <>
          <div className="row">
            <TablaGrupo titulo="Grupo 1" standings={datos.grupo1} />
            <TablaGrupo titulo="Grupo 2" standings={datos.grupo2} />
          </div>

          <h4 className="text-center mt-3">Partidos</h4>
          <table className="table table-bordered text-center">
            <thead className="table-dark">
              <tr>
                <th>#</th>
                <th>Fase</th>
                <th>Local</th>
                <th>Marcador</th>
                <th>Visita</th>
              </tr>
            </thead>
            <tbody>
              {datos.partidos.map(p => (
                <tr key={p.id} className={p.jugado ? '' : 'table-light text-muted'}>
                  <td>{p.id}</td>
                  <td>{FASES[p.fase]}{p.grupo ? ` G${p.grupo}` : ''}</td>
                  <td>{p.equipo_local_nombre || p.descripcion_local}</td>
                  <td>{p.jugado ? `${p.goles_local} - ${p.goles_visita}` : 'Pendiente'}</td>
                  <td>{p.equipo_visita_nombre || p.descripcion_visita}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {datos.posicionesFinales && (
            <>
              <h4 className="text-center mt-4" style={{ color: '#d4af37' }}>🏆 Posiciones Finales</h4>
              <table className="table table-bordered text-center" style={{ maxWidth: 470, margin: '0 auto' }}>
                <tbody>
                  <tr><td>🥇 Campeón</td><td>{datos.posicionesFinales[1]}</td></tr>
                  <tr><td>🥈 Subcampeón</td><td>{datos.posicionesFinales[2]}</td></tr>
                  <tr><td>3er lugar</td><td>{datos.posicionesFinales[3]}</td></tr>
                  <tr><td>4to lugar</td><td>{datos.posicionesFinales[4]}</td></tr>
                  <tr><td>5to lugar</td><td>{datos.posicionesFinales[5]}</td></tr>
                  <tr><td>🙈 Último</td><td>{datos.posicionesFinales[6]}</td></tr>
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </div>
  );
}
