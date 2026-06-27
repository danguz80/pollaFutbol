import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getMundialLogoPorNombre } from '../utils/mundialLogos';
import NavegacionMundial from '../components/NavegacionMundial';

const API_URL = import.meta.env.VITE_API_URL;

function useAuth() {
  try {
    const usuario = JSON.parse(localStorage.getItem("usuario"));
    return usuario;
  } catch {
    return null;
  }
}

export default function EstadisticasMundial() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState([]);
  const [tablasUsuario, setTablasUsuario] = useState({});
  const [tablasOficiales, setTablasOficiales] = useState({});

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [tablasUsuarioRes, tablasOficialesRes] = await Promise.all([
        axios.get(`${API_URL}/api/mundial-clasificados/todas-tablas-usuario`, { headers }),
        axios.get(`${API_URL}/api/mundial-clasificados/todas-tablas-oficiales`, { headers })
      ]);

      setTablasUsuario(tablasUsuarioRes.data);
      setTablasOficiales(tablasOficialesRes.data);

      const gruposUnicos = Object.keys(tablasOficialesRes.data).sort();
      setGrupos(gruposUnicos);
    } catch (error) {
      console.error('Error cargando datos:', error);
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const renderTabla = (tabla, tipo) => {
    if (!tabla || tabla.length === 0) {
      return (
        <div className="p-3 text-center text-muted fst-italic">
          {tipo === 'oficial' ? 'Sin resultados aún' : 'Sin pronósticos para este grupo'}
        </div>
      );
    }
    return (
      <div className="table-responsive">
        <table className="table table-sm table-hover mb-0" style={{ fontSize: '0.88rem' }}>
          <thead className="table-light">
            <tr>
              <th className="text-center" style={{ width: '28px' }}>#</th>
              <th>Equipo</th>
              <th className="text-center" style={{ width: '32px' }}>PJ</th>
              <th className="text-center" style={{ width: '32px' }}>PG</th>
              <th className="text-center" style={{ width: '32px' }}>PE</th>
              <th className="text-center" style={{ width: '32px' }}>PP</th>
              <th className="text-center" style={{ width: '32px' }}>GF</th>
              <th className="text-center" style={{ width: '32px' }}>GC</th>
              <th className="text-center" style={{ width: '36px' }}>DIF</th>
              <th className="text-center" style={{ width: '36px' }}><strong>PTS</strong></th>
            </tr>
          </thead>
          <tbody>
            {tabla.map((equipo, idx) => {
              const clasifica = idx < 2;
              let rowClass = '';
              if (clasifica && tipo === 'oficial') rowClass = 'table-success';
              else if (clasifica && tipo === 'usuario') rowClass = 'table-primary';
              return (
                <tr key={equipo.nombre} className={rowClass}>
                  <td className="text-center fw-bold">{idx + 1}</td>
                  <td>
                    <div className="d-flex align-items-center gap-1">
                      <img
                        src={getMundialLogoPorNombre(equipo.nombre)}
                        alt={equipo.nombre}
                        style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <span className="fw-semibold text-truncate" style={{ maxWidth: '110px' }}>{equipo.nombre}</span>
                    </div>
                  </td>
                  <td className="text-center">{equipo.pj}</td>
                  <td className="text-center">{equipo.pg}</td>
                  <td className="text-center">{equipo.pe}</td>
                  <td className="text-center">{equipo.pp}</td>
                  <td className="text-center">{equipo.gf}</td>
                  <td className="text-center">{equipo.gc}</td>
                  <td className="text-center">{equipo.dif > 0 ? '+' : ''}{equipo.dif}</td>
                  <td className="text-center"><strong>{equipo.puntos}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="container mt-5">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
          <p className="mt-3">Cargando estadísticas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4 mb-5">
      <div className="text-center mb-4">
        <h1 className="display-5 fw-bold">📊 Estadísticas — Mundial 2026</h1>
        <p className="lead text-muted">Tablas de grupos reales vs. tus pronósticos</p>
      </div>

      <NavegacionMundial />

      <div className="alert alert-info mb-4">
        <strong>ℹ️ Cómo leer las tablas:</strong><br />
        • <span className="badge bg-success">Verde</span> = Clasifican a 16vos de Final (tabla real)<br />
        • <span className="badge bg-primary">Azul</span> = Clasifican según tus pronósticos<br />
        • Cada equipo en el top 2 que aciertes suma <strong>2 puntos extra</strong> al acumulado.
      </div>

      {grupos.length === 0 ? (
        <div className="alert alert-warning text-center">
          <strong>⚠️ Sin datos:</strong> Aún no hay partidos registrados en la fase de grupos.
        </div>
      ) : (
        <div className="row g-4">
          {grupos.map(letra => {
            const tablaOficial = tablasOficiales[letra] || [];
            const tablaUsuario = tablasUsuario[letra] || [];
            return (
              <div key={letra} className="col-12">
                <div className="card shadow-sm">
                  <div className="card-header text-center fw-bold fs-5">
                    ⚽ Grupo {letra}
                  </div>
                  <div className="card-body p-0">
                    <div className="row g-0">
                      {/* Tabla oficial */}
                      <div className="col-12 col-md-6 border-end">
                        <div className="px-2 pt-2 pb-1 bg-success bg-opacity-10 border-bottom">
                          <h6 className="text-center mb-0 fw-bold text-success">🌍 Tabla Real</h6>
                        </div>
                        {renderTabla(tablaOficial, 'oficial')}
                      </div>
                      {/* Tabla usuario */}
                      <div className="col-12 col-md-6">
                        <div className="px-2 pt-2 pb-1 bg-primary bg-opacity-10 border-bottom">
                          <h6 className="text-center mb-0 fw-bold text-primary">👤 Mis Pronósticos</h6>
                        </div>
                        {renderTabla(tablaUsuario, 'usuario')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="d-flex justify-content-center mt-4">
        <button className="btn btn-secondary btn-lg" onClick={() => navigate('/mundial')}>
          ← Volver al Mundial
        </button>
      </div>
    </div>
  );
}
