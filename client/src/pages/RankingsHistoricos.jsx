import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_CONFIG, buildApiUrl } from '../utils/apiConfig';
import './RankingsHistoricos.css';

function RankingsHistoricos() {
  const navigate = useNavigate();
  const [rankings, setRankings] = useState({ 2024: { mayor: [], estandar: [] }, 2025: { mayor: [], estandar: [] } });
  const [torneoNacional2025, setTorneoNacional2025] = useState({ jornadas: [], cuadroFinal: [], rankingAcumulado: [] });
  const [usuarios, setUsuarios] = useState([]);
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);

  // Estados para formulario de edición
  const [formData, setFormData] = useState({
    anio: 2024,
    competencia: '',
    tipo: 'mayor',
    categoria: null,
    usuario_id: null,
    nombre_manual: '',
    posicion: 1,
    puntos: 0
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      // Decodificar token para obtener usuario
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUsuario(payload);

      // Cargar rankings
      const resRankings = await fetch(buildApiUrl('/api/rankings-historicos'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const dataRankings = await resRankings.json();
      setRankings(dataRankings);

      // Cargar ganadores del Torneo Nacional 2025 automáticamente
      const resTorneo = await fetch(buildApiUrl('/api/rankings-historicos/torneo-nacional-2025'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const dataTorneo = await resTorneo.json();
      setTorneoNacional2025(dataTorneo);

      // Cargar usuarios activos (para admin)
      if (payload.rol === 'admin') {
        const resUsuarios = await fetch(buildApiUrl('/api/usuarios/lista'), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const dataUsuarios = await resUsuarios.json();
        setUsuarios(dataUsuarios);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error al cargar datos:', err);
      setLoading(false);
    }
  };

  const guardarRanking = async (e) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(buildApiUrl('/api/rankings-historicos'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        alert('Ranking guardado exitosamente');
        cargarDatos();
        setFormData({
          anio: 2024,
          competencia: '',
          tipo: 'mayor',
          categoria: null,
          usuario_id: null,
          nombre_manual: '',
          posicion: 1,
          puntos: 0
        });
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (err) {
      console.error('Error al guardar ranking:', err);
      alert('Error al guardar ranking');
    }
  };

  const eliminarRanking = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este ranking?')) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(buildApiUrl(`/api/rankings-historicos/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        alert('Ranking eliminado');
        cargarDatos();
      }
    } catch (err) {
      console.error('Error al eliminar:', err);
    }
  };

  const agruparPorCompetencia = (rankings) => {
    const agrupado = {};
    rankings.forEach(r => {
      if (!agrupado[r.competencia]) {
        agrupado[r.competencia] = [];
      }
      agrupado[r.competencia].push(r);
    });
    return agrupado;
  };

  const agruparPorCategoria = (rankings) => {
    const agrupado = {};
    rankings.forEach(r => {
      const cat = r.categoria || 'General';
      if (!agrupado[cat]) {
        agrupado[cat] = [];
      }
      agrupado[cat].push(r);
    });
    return agrupado;
  };

  if (loading) return <div className="loading">Cargando rankings históricos...</div>;

  return (
    <div className="rankings-historicos">
      <h1>🏆 Rankings Históricos</h1>

      {/* Formulario de Edición (Solo Admin) */}
      {usuario?.rol === 'admin' && (
        <div className="admin-panel">
          <button 
            className="btn-toggle-edit"
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? '❌ Cancelar Edición' : '✏️ Modo Edición'}
          </button>

          {editMode && (
            <form onSubmit={guardarRanking} className="form-ranking">
              <h3>Agregar/Editar Ranking</h3>
              
              <div className="form-row">
                <label>
                  Año:
                  <select value={formData.anio} onChange={(e) => setFormData({...formData, anio: parseInt(e.target.value)})}>
                    <option value={2024}>2024</option>
                    <option value={2025}>2025</option>
                  </select>
                </label>

                <label>
                  Tipo:
                  <select value={formData.tipo} onChange={(e) => setFormData({...formData, tipo: e.target.value})}>
                    <option value="mayor">Cuadro de Honor Mayor</option>
                    <option value="estandar">Cuadro de Honor Estándar</option>
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label>
                  Competencia:
                  <select 
                    value={formData.competencia} 
                    onChange={(e) => setFormData({...formData, competencia: e.target.value})}
                    required
                  >
                    <option value="">Seleccionar...</option>
                    <option value="Copa América">Copa América</option>
                    <option value="Eurocopa">Eurocopa</option>
                    <option value="Copa Libertadores">Copa Libertadores</option>
                    <option value="Copa Sudamericana">Copa Sudamericana</option>
                    <option value="Torneo Nacional">Torneo Nacional</option>
                  </select>
                </label>

                {formData.tipo === 'estandar' && (
                  <label>
                    Categoría (Jornada):
                    <select value={formData.categoria || ''} onChange={(e) => setFormData({...formData, categoria: e.target.value})}>
                      <option value="">General</option>
                      {Array.from({length: 20}, (_, i) => i + 11).map(j => (
                        <option key={j} value={`J${j}`}>Jornada {j}</option>
                      ))}
                      <option value="Cuadro Final">Cuadro Final</option>
                    </select>
                  </label>
                )}
              </div>

              <div className="form-row">
                {formData.anio === 2024 && ['Copa América', 'Eurocopa'].includes(formData.competencia) ? (
                  <label>
                    Nombre (Manual):
                    <input 
                      type="text" 
                      value={formData.nombre_manual}
                      onChange={(e) => setFormData({...formData, nombre_manual: e.target.value, usuario_id: null})}
                      required
                      placeholder="Escribir nombre..."
                    />
                  </label>
                ) : (
                  <label>
                    Usuario:
                    <select 
                      value={formData.usuario_id || ''} 
                      onChange={(e) => setFormData({...formData, usuario_id: e.target.value ? parseInt(e.target.value) : null, nombre_manual: ''})}
                      required
                    >
                      <option value="">Seleccionar usuario...</option>
                      {usuarios.map(u => (
                        <option key={u.id} value={u.id}>{u.nombre}</option>
                      ))}
                    </select>
                  </label>
                )}

                {formData.tipo === 'mayor' && (
                  <label>
                    Posición:
                    <select value={formData.posicion} onChange={(e) => setFormData({...formData, posicion: parseInt(e.target.value)})}>
                      <option value={1}>1° Lugar 🥇</option>
                      <option value={2}>2° Lugar 🥈</option>
                      <option value={3}>3° Lugar 🥉</option>
                    </select>
                  </label>
                )}

                <label>
                  Puntos:
                  <input 
                    type="number" 
                    value={formData.puntos}
                    onChange={(e) => setFormData({...formData, puntos: parseInt(e.target.value)})}
                    min="0"
                  />
                </label>
              </div>

              <button type="submit" className="btn-guardar">💾 Guardar Ranking</button>
            </form>
          )}
        </div>
      )}

      {/* Año 2024 */}
      <section className="anio-section">
        <h2>📅 Año 2024</h2>
        
        {/* Cuadro de Honor Mayor 2024 */}
        <div className="cuadro-honor mayor">
          <h3>🏅 Cuadro de Honor Mayor</h3>
          {Object.entries(agruparPorCompetencia(rankings[2024]?.mayor || [])).map(([comp, items]) => (
            <div key={comp} className="competencia-card">
              <h4>{comp}</h4>
              <div className="podio">
                {[1, 2, 3].map(pos => {
                  const ganador = items.find(i => i.posicion === pos);
                  return (
                    <div key={pos} className={`podio-item pos-${pos}`}>
                      <div className="medalla">
                        {pos === 1 ? '🥇' : pos === 2 ? '🥈' : '🥉'}
                      </div>
                      {ganador ? (
                        <div className="podio-contenido">
                          <div className="nombre">{ganador.usuario_nombre || ganador.nombre_manual}</div>
                          <div className="puntos">{ganador.puntos ? `${ganador.puntos} pts` : '-'}</div>
                          {usuario?.rol === 'admin' && (
                            <button onClick={() => eliminarRanking(ganador.id)} className="btn-delete">🗑️</button>
                          )}
                        </div>
                      ) : (
                        <div className="vacio">-</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Año 2025 */}
      <section className="anio-section">
        <h2>📅 Año 2025</h2>
        
        {/* Cuadro de Honor Mayor 2025 */}
        <div className="cuadro-honor mayor">
          <h3>🏅 Cuadro de Honor Mayor</h3>
          
          {/* Torneo Nacional - Ranking Acumulado (automático desde BD) */}
          {torneoNacional2025?.rankingAcumulado?.length > 0 && (
            <div className="competencia-card">
              <h4>Torneo Nacional - Ranking Acumulado</h4>
              <div className="podio">
                {[1, 2, 3].map(pos => {
                  const ganador = torneoNacional2025.rankingAcumulado[pos - 1];
                  return (
                    <div key={pos} className={`podio-item pos-${pos}`}>
                      <div className="medalla">
                        {pos === 1 ? '🥇' : pos === 2 ? '🥈' : '🥉'}
                      </div>
                      {ganador ? (
                        <div className="podio-contenido">
                          {ganador.foto_perfil && <img src={ganador.foto_perfil} alt={ganador.nombre} className="foto-perfil" />}
                          <div className="nombre">{ganador.nombre}</div>
                          <div className="puntos">{ganador.puntos ? `${ganador.puntos} pts` : '-'}</div>
                        </div>
                      ) : (
                        <div className="vacio">-</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Otras competencias (Copa Libertadores, Sudamericana) - desde rankings_historicos */}
          {Object.entries(agruparPorCompetencia(rankings[2025]?.mayor || [])).map(([comp, items]) => (
            <div key={comp} className="competencia-card">
              <h4>{comp}</h4>
              <div className="podio">
                {[1, 2, 3].map(pos => {
                  const ganador = items.find(i => i.posicion === pos);
                  return (
                    <div key={pos} className={`podio-item pos-${pos}`}>
                      <div className="medalla">
                        {pos === 1 ? '🥇' : pos === 2 ? '🥈' : '🥉'}
                      </div>
                      {ganador ? (
                        <div className="podio-contenido">
                          {ganador.foto_perfil && <img src={ganador.foto_perfil} alt={ganador.usuario_nombre} className="foto-perfil" />}
                          <div className="nombre">{ganador.usuario_nombre}</div>
                          <div className="puntos">{ganador.puntos ? `${ganador.puntos} pts` : '-'}</div>
                          {usuario?.rol === 'admin' && (
                            <button onClick={() => eliminarRanking(ganador.id)} className="btn-delete">🗑️</button>
                          )}
                        </div>
                      ) : (
                        <div className="vacio">-</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Cuadro de Honor Estándar 2025 */}
        <div className="cuadro-honor estandar">
          <h3>⭐ Cuadro de Honor Estándar</h3>
          <p className="subtitle">Ganadores por Jornada - Torneo Nacional 2025</p>
          
          <div className="jornadas-grid">
            {/* Jornadas 11 a 30 */}
            {Array.from({length: 20}, (_, i) => i + 11).map(jornadaNum => {
              const ganadoresJornada = torneoNacional2025.jornadas.filter(g => g.jornada_numero === jornadaNum);
              return (
                <div key={`J${jornadaNum}`} className="jornada-card">
                  <h5>Jornada {jornadaNum}</h5>
                  <div className="ganadores-list">
                    {ganadoresJornada.length > 0 ? (
                      ganadoresJornada.map(ganador => (
                        <div key={ganador.usuario_id} className="ganador-item">
                          {ganador.foto_perfil && <img src={ganador.foto_perfil} alt={ganador.nombre} />}
                          <span>{ganador.nombre}</span>
                        </div>
                      ))
                    ) : (
                      <div className="sin-ganadores">Sin ganadores</div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Cuadro Final */}
            <div className="jornada-card cuadro-final-card">
              <h5>🏆 Cuadro Final</h5>
              <div className="ganadores-list">
                {torneoNacional2025.cuadroFinal.length > 0 ? (
                  torneoNacional2025.cuadroFinal.map(ganador => (
                    <div key={ganador.usuario_id} className="ganador-item">
                      {ganador.foto_perfil && <img src={ganador.foto_perfil} alt={ganador.nombre} />}
                      <span>{ganador.nombre}</span>
                    </div>
                  ))
                ) : (
                  <div className="sin-ganadores">Sin ganadores</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default RankingsHistoricos;
