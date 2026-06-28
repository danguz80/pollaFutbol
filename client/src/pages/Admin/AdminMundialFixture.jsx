import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getMundialLogoPorNombre } from '../../utils/mundialLogos';

const API_URL = import.meta.env.VITE_API_URL;

export default function AdminMundialFixture() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Fase de grupos (sin cambios)
  const [textFaseGrupos, setTextFaseGrupos] = useState('');

  // Equipos del Mundial para selects
  const [equipos, setEquipos] = useState([]);

  // Partidos ya cargados por jornada eliminatoria
  const [existentes, setExistentes] = useState({ 4: [], 5: [], 6: [], 7: [] });

  // Filas del formulario de nuevos cruces por jornada
  const [nuevos, setNuevos] = useState({
    4: [{ local: '', visitante: '', bonus: 1 }],
    5: [{ local: '', visitante: '', bonus: 1 }],
    6: [{ local: '', visitante: '', bonus: 1 }],
    7: [{ local: '', visitante: '', bonus: 2 }],
  });
  const [saving, setSaving] = useState({});

  useEffect(() => {
    cargarEquiposYPartidos();
  }, []);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 6000);
  };

  // ==================== FASE DE GRUPOS ====================
  const procesarFaseGrupos = async () => {
    if (!textFaseGrupos.trim()) {
      showMessage('danger', 'Por favor ingresa el texto con los partidos de fase de grupos');
      return;
    }

    setLoading(true);
    try {
      const lineas = textFaseGrupos.split('\n');
      const jornadasPartidos = { 1: [], 2: [], 3: [] };
      const equiposMap = new Map();
      let jornadaActual = null;

      lineas.forEach(linea => {
        const lineaTrim = linea.trim();
        
        // Detectar jornada
        const matchFecha = lineaTrim.match(/(?:Jornada|Fecha|J)\s*(\d+)/i);
        
        if (matchFecha) {
          const num = parseInt(matchFecha[1]);
          if (num >= 1 && num <= 3) {
            jornadaActual = num;
            console.log(`Detectada Jornada ${num}`);
          }
        }

        if (!jornadaActual) return;

        // Detectar líneas con formato: Equipo (PAÍS) vs Equipo (PAÍS) — Grupo X
        let matchPartidoPais = lineaTrim.match(/^(.+?)\s*\(([A-Z]{3})\)\s+vs\s+(.+?)\s*\(([A-Z]{3})\)\s*[—–-]?\s*Grupo\s+([A-L])/i);
        // Formato sin siglas: Equipo vs Equipo - Grupo X
        let matchPartidoSimple = !matchPartidoPais && lineaTrim.match(/^(.+?)\s+vs\s+(.+?)\s*[—–-]\s*Grupo\s+([A-L])/i);

        if (matchPartidoPais) {
          const local = matchPartidoPais[1].trim();
          const paisLocal = matchPartidoPais[2].trim();
          const visita = matchPartidoPais[3].trim();
          const paisVisita = matchPartidoPais[4].trim();
          const grupo = matchPartidoPais[5].toUpperCase();
          
          if (local.length > 2 && visita.length > 2) {
            if (!equiposMap.has(local)) {
              equiposMap.set(local, { pais: paisLocal, grupo });
            }
            if (!equiposMap.has(visita)) {
              equiposMap.set(visita, { pais: paisVisita, grupo });
            }
            jornadasPartidos[jornadaActual].push({
              equipo_local: local,
              equipo_visitante: visita,
              fecha: new Date().toISOString(),
              bonus: 1,
              grupo: grupo
            });
            console.log(`J${jornadaActual}: ${local} vs ${visita} - Grupo ${grupo}`);
          }
        } else if (matchPartidoSimple) {
          const local = matchPartidoSimple[1].trim();
          const visita = matchPartidoSimple[2].trim();
          const grupo = matchPartidoSimple[3].toUpperCase();

          if (local.length > 2 && visita.length > 2) {
            if (!equiposMap.has(local)) {
              equiposMap.set(local, { pais: '', grupo });
            }
            if (!equiposMap.has(visita)) {
              equiposMap.set(visita, { pais: '', grupo });
            }
            jornadasPartidos[jornadaActual].push({
              equipo_local: local,
              equipo_visitante: visita,
              fecha: new Date().toISOString(),
              bonus: 1,
              grupo: grupo
            });
            console.log(`J${jornadaActual}: ${local} vs ${visita} - Grupo ${grupo}`);
          }
        }
      });

      const totalPartidos = Object.values(jornadasPartidos).reduce((sum, arr) => sum + arr.length, 0);
      const totalEquipos = equiposMap.size;
      
      if (totalPartidos === 0) {
        showMessage('danger', 'No se pudieron extraer partidos. Verifica el formato del texto.');
        return;
      }

      const confirmar = window.confirm(
        `Se detectaron:\n` +
        `- ${totalEquipos} equipos únicos\n` +
        `- ${totalPartidos} partidos:\n` +
        Object.entries(jornadasPartidos)
          .filter(([_, partidos]) => partidos.length > 0)
          .map(([j, partidos]) => `  Jornada ${j}: ${partidos.length} partidos`)
          .join('\n') +
        '\n\n¿Deseas crear equipos y partidos?'
      );

      if (!confirmar) {
        setLoading(false);
        return;
      }

      const token = localStorage.getItem('token');

      // 1. Crear equipos
      const equiposArray = Array.from(equiposMap.entries()).map(([nombre, data]) => ({
        nombre,
        pais: data.pais,
        grupo: data.grupo
      }));

      await axios.post(
        `${API_URL}/api/mundial/equipos`,
        { equipos: equiposArray },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // 2. Crear partidos por jornada
      let partidosCreados = 0;

      for (let j = 1; j <= 3; j++) {
        if (jornadasPartidos[j].length > 0) {
          await axios.post(
            `${API_URL}/api/mundial/jornadas/${j}/fixture`,
            { partidos: jornadasPartidos[j] },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          partidosCreados += jornadasPartidos[j].length;
        }
      }

      showMessage('success', `✅ Fase de grupos generada: ${equiposArray.length} equipos, ${partidosCreados} partidos`);
      alert(`✅ Fase de Grupos generada exitosamente\n\n📊 Resumen:\n- ${equiposArray.length} equipos creados\n- ${partidosCreados} partidos generados\n- Jornadas: J1, J2, J3`);
      setTextFaseGrupos('');
      // Recargar equipos por si se crearon nuevos
      cargarEquiposYPartidos();
      
    } catch (error) {
      console.error('Error procesando fase de grupos:', error);
      showMessage('danger', `Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ==================== CARGA DE EQUIPOS Y PARTIDOS ELIMINATORIOS ====================
  const cargarEquiposYPartidos = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      const [equiposRes, j4, j5, j6, j7] = await Promise.all([
        axios.get(`${API_URL}/api/mundial/equipos`),
        axios.get(`${API_URL}/api/mundial/jornadas/4/partidos`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/mundial/jornadas/5/partidos`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/mundial/jornadas/6/partidos`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/mundial/jornadas/7/partidos`, { headers }).catch(() => ({ data: [] })),
      ]);
      setEquipos(equiposRes.data);
      setExistentes({ 4: j4.data, 5: j5.data, 6: j6.data, 7: j7.data });
    } catch (err) {
      console.error('Error cargando datos iniciales:', err);
    }
  };

  const recargarJornada = async (jornada) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/mundial/jornadas/${jornada}/partidos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setExistentes(prev => ({ ...prev, [jornada]: res.data }));
    } catch (err) {
      console.error('Error recargando jornada:', err);
    }
  };

  const getEquiposPorGrupo = () => {
    const porGrupo = {};
    equipos.forEach(e => {
      const g = e.grupo || 'Sin grupo';
      if (!porGrupo[g]) porGrupo[g] = [];
      porGrupo[g].push(e);
    });
    return porGrupo;
  };

  const agregarFila = (jornada) => {
    setNuevos(prev => ({
      ...prev,
      [jornada]: [...prev[jornada], { local: '', visitante: '', bonus: jornada === 7 ? 2 : 1 }]
    }));
  };

  const eliminarFilaForm = (jornada, idx) => {
    setNuevos(prev => ({
      ...prev,
      [jornada]: prev[jornada].filter((_, i) => i !== idx)
    }));
  };

  const actualizarFila = (jornada, idx, field, value) => {
    setNuevos(prev => {
      const filas = [...prev[jornada]];
      filas[idx] = { ...filas[idx], [field]: value };
      return { ...prev, [jornada]: filas };
    });
  };

  const guardarNuevosCruces = async (jornada) => {
    const filas = nuevos[jornada].filter(f => f.local && f.visitante);
    if (filas.length === 0) {
      showMessage('danger', 'Completa al menos un cruce (local y visitante)');
      return;
    }
    const duplicado = filas.find(f => f.local === f.visitante);
    if (duplicado) {
      showMessage('danger', `❌ "${duplicado.local}" no puede jugar contra sí mismo`);
      return;
    }
    setSaving(prev => ({ ...prev, [jornada]: true }));
    try {
      const token = localStorage.getItem('token');
      const partidos = filas.map(f => ({
        equipo_local: f.local,
        equipo_visitante: f.visitante,
        fecha: new Date().toISOString(),
        bonus: f.bonus,
      }));
      await axios.post(
        `${API_URL}/api/mundial/jornadas/${jornada}/fixture-append`,
        { partidos },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      showMessage('success', `✅ ${filas.length} cruce(s) agregado(s) a la Jornada ${jornada}`);
      await recargarJornada(jornada);
      setNuevos(prev => ({
        ...prev,
        [jornada]: [{ local: '', visitante: '', bonus: jornada === 7 ? 2 : 1 }]
      }));
    } catch (err) {
      showMessage('danger', `Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setSaving(prev => ({ ...prev, [jornada]: false }));
    }
  };

  const borrarPartido = async (partidoId, jornada) => {
    if (!confirm('¿Eliminar este partido? Solo es posible si nadie ha ingresado pronósticos.')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/mundial/partidos/${partidoId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await recargarJornada(jornada);
      showMessage('success', '✅ Partido eliminado correctamente');
    } catch (err) {
      showMessage('danger', err.response?.data?.error || 'Error eliminando partido');
    }
  };

  // ==================== RENDER REUTILIZABLE FASE ELIMINATORIA ====================
  const renderFaseEliminatoria = ({ jornada, titulo, colorHeader, colorBtn, maxPartidos }) => {
    const partidos = existentes[jornada] || [];
    const filas = nuevos[jornada] || [];
    const equiposPorGrupo = getEquiposPorGrupo();
    const isSaving = saving[jornada];
    const filasValidas = filas.filter(f => f.local && f.visitante).length;

    const SelectEquipo = ({ value, onChange, placeholder }) => (
      <select
        className="form-select"
        style={{ maxWidth: '240px' }}
        value={value}
        onChange={onChange}
      >
        <option value="">{placeholder}</option>
        {Object.entries(equiposPorGrupo)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([grupo, equips]) => (
            <optgroup key={grupo} label={`Grupo ${grupo}`}>
              {equips.map(e => (
                <option key={e.nombre} value={e.nombre}>{e.nombre}</option>
              ))}
            </optgroup>
          ))}
      </select>
    );

    return (
      <div className="card mb-4">
        <div className={`card-header ${colorHeader}`}>
          <div className="d-flex align-items-center justify-content-between">
            <h5 className="mb-0">{titulo}</h5>
            <span className="badge bg-light text-dark fs-6">{partidos.length} / {maxPartidos} cruces</span>
          </div>
        </div>
        <div className="card-body">

          {/* Cruces ya cargados */}
          {partidos.length > 0 && (
            <div className="mb-4">
              <h6 className="fw-bold text-muted mb-2">✅ Cruces cargados ({partidos.length}):</h6>
              <div className="table-responsive">
                <table className="table table-sm table-bordered align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="text-center" style={{ width: '32px' }}>#</th>
                      <th>Local</th>
                      <th className="text-center" style={{ width: '30px' }}>vs</th>
                      <th>Visitante</th>
                      <th className="text-center" style={{ width: '56px' }}>Bonus</th>
                      <th className="text-center" style={{ width: '80px' }}>Pronóst.</th>
                      <th className="text-center" style={{ width: '70px' }}>Borrar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partidos.map((p, idx) => (
                      <tr key={p.id}>
                        <td className="text-center text-muted small">{idx + 1}</td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <img src={getMundialLogoPorNombre(p.equipo_local)} alt="" style={{ width: '22px', height: '22px', objectFit: 'contain' }} onError={e => e.target.style.display = 'none'} />
                            <span className="fw-semibold">{p.equipo_local}</span>
                          </div>
                        </td>
                        <td className="text-center text-muted small">vs</td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <img src={getMundialLogoPorNombre(p.equipo_visitante)} alt="" style={{ width: '22px', height: '22px', objectFit: 'contain' }} onError={e => e.target.style.display = 'none'} />
                            <span className="fw-semibold">{p.equipo_visitante}</span>
                          </div>
                        </td>
                        <td className="text-center">
                          <span className={`badge ${p.bonus >= 2 ? 'bg-warning text-dark' : 'bg-secondary'}`}>x{p.bonus}</span>
                        </td>
                        <td className="text-center">
                          {p.pronosticos_count > 0
                            ? <span className="badge bg-success">{p.pronosticos_count} 👤</span>
                            : <span className="text-muted small">—</span>}
                        </td>
                        <td className="text-center">
                          <button
                            className="btn btn-outline-danger btn-sm py-0 px-1"
                            onClick={() => borrarPartido(p.id, jornada)}
                            disabled={p.pronosticos_count > 0}
                            title={p.pronosticos_count > 0 ? 'No se puede borrar: tiene pronósticos' : 'Eliminar partido'}
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Formulario de agregar nuevos cruces */}
          {partidos.length < maxPartidos ? (
            <>
              <h6 className="fw-bold text-muted mb-3">
                ➕ Agregar nuevos cruces ({maxPartidos - partidos.length} restantes):
              </h6>
              <div className="d-flex flex-column gap-3 mb-3">
                {filas.map((fila, idx) => (
                  <div key={idx} className="d-flex align-items-center gap-2 flex-wrap">
                    <span className="fw-bold text-muted" style={{ minWidth: '28px' }}>{partidos.length + idx + 1}.</span>
                    <SelectEquipo
                      value={fila.local}
                      onChange={e => actualizarFila(jornada, idx, 'local', e.target.value)}
                      placeholder="— Local —"
                    />
                    <span className="fw-bold text-muted">vs</span>
                    <SelectEquipo
                      value={fila.visitante}
                      onChange={e => actualizarFila(jornada, idx, 'visitante', e.target.value)}
                      placeholder="— Visitante —"
                    />
                    <select
                      className="form-select"
                      style={{ width: '80px' }}
                      value={fila.bonus}
                      onChange={e => actualizarFila(jornada, idx, 'bonus', Number(e.target.value))}
                    >
                      <option value={1}>x1</option>
                      <option value={2}>x2</option>
                      <option value={3}>x3</option>
                    </select>
                    {filas.length > 1 && (
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => eliminarFilaForm(jornada, idx)}
                        title="Quitar fila"
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
              <div className="d-flex gap-2 flex-wrap align-items-center">
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => agregarFila(jornada)}
                  disabled={partidos.length + filas.length >= maxPartidos}
                >
                  + Agregar fila
                </button>
                <button
                  className={`btn ${colorBtn}`}
                  onClick={() => guardarNuevosCruces(jornada)}
                  disabled={isSaving || filasValidas === 0}
                >
                  {isSaving
                    ? <><span className="spinner-border spinner-border-sm me-1"></span>Guardando...</>
                    : `💾 Guardar ${filasValidas > 0 ? filasValidas + ' cruce(s)' : '...'}`}
                </button>
              </div>
              {partidos.length === 0 && (
                <p className="text-muted small mt-2">
                  💡 Puedes guardar de a pocos. Los pronósticos que los usuarios ya ingresaron no se borran al agregar más cruces.
                </p>
              )}
            </>
          ) : (
            <div className="alert alert-success mb-0">
              ✅ Los {maxPartidos} cruces están completos.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="container mt-4">
      {/* Header */}
      <div className="mb-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2>🌍 Generador de Fixture - Mundial 2026</h2>
          <div className="d-flex gap-2">
            <button 
              className="btn btn-success"
              onClick={() => navigate('/admin/mundial/resultados')}
            >
              📊 Resultados y Jornadas
            </button>
            <button 
              className="btn btn-warning"
              onClick={() => navigate('/admin/mundial/gestion')}
            >
              🔧 Gestión y Respaldo
            </button>
            <button 
              className="btn btn-secondary"
              onClick={() => navigate('/admin/mundial')}
            >
              ← Volver
            </button>
          </div>
        </div>

        {/* Botones del Home del Mundial - Centrados */}
        <div className="d-flex flex-wrap justify-content-center gap-2">
          <button className="btn btn-info" onClick={() => navigate('/mundial/estadisticas')}>
            📊 Estadísticas
          </button>
          <button className="btn btn-info" onClick={() => navigate('/mundial/clasificacion')}>
            📋 Clasificación
          </button>
          <button className="btn btn-info" onClick={() => navigate('/mundial/puntuacion')}>
            📈 Puntuación
          </button>
          <button className="btn btn-info" onClick={() => navigate('/mundial/ganadores-jornada')}>
            👑 Ganadores
          </button>
        </div>
      </div>

      {/* Mensajes */}
      {message.text && (
        <div className={`alert alert-${message.type} alert-dismissible fade show`} role="alert">
          {message.text}
          <button type="button" className="btn-close" onClick={() => setMessage({ type: '', text: '' })}></button>
        </div>
      )}

      {/* ==================== SECCIÓN 1: FASE DE GRUPOS ==================== */}
      <div className="card mb-4">
        <div className="card-header bg-primary text-white">
          <h5 className="mb-0">📄 Fase de Grupos (Jornadas 1-3)</h5>
        </div>
        <div className="card-body">
          <p className="text-muted">
            Copia y pega el texto con los partidos de fase de grupos. Formato esperado:
            <br />
            <code>Jornada 1</code> (o <code>Fecha 1</code>)
            <br />
            <code>Equipo Local (PAÍS) vs Equipo Visitante (PAÍS) — Grupo A</code>
          </p>
          <div className="mb-3">
            <label className="form-label">Texto de Fase de Grupos:</label>
            <textarea
              className="form-control font-monospace"
              rows="15"
              placeholder="Ejemplo:&#10;Jornada 1&#10;México (MEX) vs Uruguay (URU) — Grupo A&#10;Argentina (ARG) vs Brasil (BRA) — Grupo B&#10;..."
              value={textFaseGrupos}
              onChange={(e) => setTextFaseGrupos(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={procesarFaseGrupos}
            disabled={loading || !textFaseGrupos.trim()}
          >
            {loading ? '⏳ Procesando...' : '🚀 Generar Fase de Grupos'}
          </button>
        </div>
      </div>

      {/* ==================== SECCIÓN 2: 16VOS (incremental con selects) ==================== */}
      {renderFaseEliminatoria({
        jornada: 4,
        titulo: '⚽ 16vos de Final (Jornada 4)',
        colorHeader: 'bg-info text-white',
        colorBtn: 'btn-info',
        maxPartidos: 16,
      })}

      {/* ==================== SECCIÓN 3: OCTAVOS ==================== */}
      {renderFaseEliminatoria({
        jornada: 5,
        titulo: '🏅 Octavos de Final (Jornada 5)',
        colorHeader: 'bg-success text-white',
        colorBtn: 'btn-success',
        maxPartidos: 8,
      })}

      {/* ==================== SECCIÓN 4: CUARTOS ==================== */}
      {renderFaseEliminatoria({
        jornada: 6,
        titulo: '🏆 Cuartos de Final (Jornada 6)',
        colorHeader: 'bg-warning text-dark',
        colorBtn: 'btn-warning',
        maxPartidos: 4,
      })}

      {/* ==================== SECCIÓN 5: FINALES ==================== */}
      {renderFaseEliminatoria({
        jornada: 7,
        titulo: '🥇 Semifinales, 3er lugar y Final (Jornada 7)',
        colorHeader: 'bg-danger text-white',
        colorBtn: 'btn-danger',
        maxPartidos: 4,
      })}

      {/* Información */}
      <div className="alert alert-info">
        <h6>ℹ️ Información Importante:</h6>
        <ul className="mb-0">
          <li><strong>Fase de Grupos:</strong> texto con formato "Equipo (PAÍS) vs Equipo (PAÍS) — Grupo X"</li>
          <li><strong>Fases eliminatorias (J4-J7):</strong> usa los selects para elegir equipos — los nombres serán exactamente los mismos que en la BD, garantizando los escudos.</li>
          <li>Puedes guardar cruces <strong>de a poco</strong>. Los pronósticos ya ingresados no se borran al agregar nuevos partidos.</li>
          <li>Solo se puede eliminar un partido si <strong>ningún jugador ha ingresado pronósticos</strong> para él.</li>
          <li>Los bonus se pueden ajustar desde la sección <strong>Resultados y Jornadas</strong>.</li>
        </ul>
      </div>
    </div>
  );
}
