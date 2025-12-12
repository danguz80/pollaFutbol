import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export default function AdminLibertadores() {
  const navigate = useNavigate();
  const [step, setStep] = useState('teams'); // 'teams', 'fixtures', 'finales'
  const [jornadaActual, setJornadaActual] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Estado para equipos
  const [equipos, setEquipos] = useState({
    A: ['', '', '', ''],
    B: ['', '', '', ''],
    C: ['', '', '', ''],
    D: ['', '', '', ''],
    E: ['', '', '', ''],
    F: ['', '', '', ''],
    G: ['', '', '', ''],
    H: ['', '', '', '']
  });

  // Estado para partidos de la jornada actual
  const [partidos, setPartidos] = useState([]);
  const [nuevoPartido, setNuevoPartido] = useState({
    equipo_local: '',
    equipo_visitante: '',
    fecha_hora: '',
    bonus: 1
  });
  const [editandoBonus, setEditandoBonus] = useState(null); // ID del partido siendo editado

  useEffect(() => {
    cargarEquipos();
    cargarJornada();
  }, [jornadaActual]);

  const cargarEquipos = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/libertadores/equipos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.length > 0) {
        const equiposPorGrupo = response.data.reduce((acc, equipo) => {
          if (!acc[equipo.grupo]) acc[equipo.grupo] = [];
          acc[equipo.grupo].push(equipo.nombre);
          return acc;
        }, {});
        
        // Completar con vacíos si faltan equipos
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(grupo => {
          if (!equiposPorGrupo[grupo]) {
            equiposPorGrupo[grupo] = ['', '', '', ''];
          } else {
            while (equiposPorGrupo[grupo].length < 4) {
              equiposPorGrupo[grupo].push('');
            }
          }
        });
        
        setEquipos(equiposPorGrupo);
      }
    } catch (error) {
      console.error('Error cargando equipos:', error);
    }
  };

  const cargarJornada = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/libertadores/jornadas/${jornadaActual}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPartidos(response.data.partidos || []);
    } catch (error) {
      console.error('Error cargando jornada:', error);
    }
  };

  const guardarEquipos = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    
    try {
      const token = localStorage.getItem('token');
      const equiposArray = [];
      
      Object.entries(equipos).forEach(([grupo, teams]) => {
        teams.forEach(nombre => {
          if (nombre.trim()) {
            equiposArray.push({ nombre: nombre.trim(), grupo });
          }
        });
      });

      await axios.post(
        `${API_URL}/api/libertadores/equipos`,
        { equipos: equiposArray },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMessage({ type: 'success', text: '✅ Equipos guardados exitosamente' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${error.response?.data?.error || error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const agregarPartido = async () => {
    if (!nuevoPartido.equipo_local || !nuevoPartido.equipo_visitante || !nuevoPartido.fecha_hora) {
      setMessage({ type: 'error', text: 'Completa todos los campos del partido' });
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/api/libertadores/jornadas/${jornadaActual}/partidos`,
        nuevoPartido,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMessage({ type: 'success', text: '✅ Partido agregado' });
      setNuevoPartido({ equipo_local: '', equipo_visitante: '', fecha_hora: '', bonus: 1 });
      cargarJornada();
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${error.response?.data?.error || error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const eliminarPartido = async (id) => {
    if (!confirm('¿Eliminar este partido?')) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/libertadores/partidos/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setMessage({ type: 'success', text: '✅ Partido eliminado' });
      cargarJornada();
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${error.response?.data?.error || error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const actualizarBonus = async (id, nuevoBonus) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/libertadores/partidos/${id}/bonus`,
        { bonus: nuevoBonus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setMessage({ type: 'success', text: '✅ Bonus actualizado' });
      setEditandoBonus(null);
      cargarJornada();
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${error.response?.data?.error || error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const cerrarJornada = async () => {
    if (!confirm(`¿Cerrar jornada ${jornadaActual}? Los usuarios ya no podrán ingresar pronósticos.`)) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/libertadores/jornadas/${jornadaActual}/cierre`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setMessage({ type: 'success', text: '✅ Jornada cerrada' });
      cargarJornada();
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${error.response?.data?.error || error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleEquipoChange = (grupo, index, value) => {
    setEquipos(prev => ({
      ...prev,
      [grupo]: prev[grupo].map((eq, i) => i === index ? value : eq)
    }));
  };

  const todosLosEquipos = Object.values(equipos).flat().filter(eq => eq.trim());

  // Obtener el grupo de un equipo
  const obtenerGrupoEquipo = (nombreEquipo) => {
    for (const [grupo, teams] of Object.entries(equipos)) {
      if (teams.includes(nombreEquipo)) {
        return grupo;
      }
    }
    return null;
  };

  // Obtener equipos que ya tienen partido en esta jornada
  const obtenerEquiposUsados = () => {
    const usados = new Set();
    partidos.forEach(partido => {
      usados.add(partido.nombre_local);
      usados.add(partido.nombre_visita);
    });
    return usados;
  };

  // Obtener equipos disponibles para ser local (excluyendo los que ya tienen partido)
  const obtenerEquiposDisponiblesLocal = () => {
    const equiposUsados = obtenerEquiposUsados();
    return todosLosEquipos.filter(eq => !equiposUsados.has(eq));
  };

  // Obtener equipos del mismo grupo excluyendo el equipo local y los ya usados en la jornada
  const obtenerRivalesDisponibles = () => {
    if (!nuevoPartido.equipo_local) return [];
    
    const grupoLocal = obtenerGrupoEquipo(nuevoPartido.equipo_local);
    if (!grupoLocal) return [];
    
    // Equipos del mismo grupo
    const equiposDelGrupo = equipos[grupoLocal].filter(eq => eq.trim() && eq !== nuevoPartido.equipo_local);
    
    // Equipos ya usados en partidos de esta jornada
    const equiposUsados = obtenerEquiposUsados();
    
    // Filtrar equipos disponibles
    return equiposDelGrupo.filter(eq => !equiposUsados.has(eq));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-2xl p-6">
          <h1 className="text-3xl font-bold text-blue-900 mb-6">
            ⚽ Admin Copa Libertadores 2026
          </h1>

          {/* Mensajes */}
          {message.text && (
            <div className={`p-4 mb-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          {/* Tabs de navegación */}
          <div className="flex gap-4 mb-6 border-b">
            <button
              onClick={() => setStep('teams')}
              className={`px-6 py-3 font-semibold transition-colors ${
                step === 'teams'
                  ? 'border-b-4 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              📋 Equipos (32)
            </button>
            <button
              onClick={() => setStep('fixtures')}
              className={`px-6 py-3 font-semibold transition-colors ${
                step === 'fixtures'
                  ? 'border-b-4 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              🏟️ Partidos
            </button>
            <button
              onClick={() => setStep('finales')}
              className={`px-6 py-3 font-semibold transition-colors ${
                step === 'finales'
                  ? 'border-b-4 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              🏆 Predicciones Finales
            </button>
          </div>

          {/* SECCIÓN: EQUIPOS */}
          {step === 'teams' && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(grupo => (
                  <div key={grupo} className="border rounded-lg p-4 bg-gray-50">
                    <h3 className="text-xl font-bold text-blue-900 mb-3">Grupo {grupo}</h3>
                    {[0, 1, 2, 3].map(i => (
                      <input
                        key={i}
                        type="text"
                        placeholder={`Equipo ${i + 1}`}
                        value={equipos[grupo][i]}
                        onChange={(e) => handleEquipoChange(grupo, i, e.target.value)}
                        className="w-full p-2 border rounded mb-2"
                      />
                    ))}
                  </div>
                ))}
              </div>

              <button
                onClick={guardarEquipos}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-50"
              >
                {loading ? 'Guardando...' : '💾 Guardar Equipos'}
              </button>

              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-900">
                  Total de equipos ingresados: <strong>{todosLosEquipos.length}/32</strong>
                </p>
              </div>
            </div>
          )}

          {/* SECCIÓN: PARTIDOS */}
          {step === 'fixtures' && (
            <div>
              {/* Selector de jornada */}
              <div className="mb-6 flex items-center gap-4">
                <label className="font-semibold">Jornada:</label>
                <select
                  value={jornadaActual}
                  onChange={(e) => setJornadaActual(Number(e.target.value))}
                  className="p-2 border rounded"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <option key={n} value={n}>
                      {n <= 6 ? `Fecha ${n} (Grupos)` : 
                       n === 7 ? 'Octavos de Final' :
                       n === 8 ? 'Cuartos de Final' :
                       n === 9 ? 'Semifinales' : 'Final'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Formulario agregar partido */}
              <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <h3 className="font-bold mb-3">➕ Agregar Partido</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <select
                    value={nuevoPartido.equipo_local}
                    onChange={(e) => {
                      setNuevoPartido(prev => ({ 
                        ...prev, 
                        equipo_local: e.target.value,
                        equipo_visitante: '' // Resetear visitante al cambiar local
                      }));
                    }}
                    className="p-2 border rounded"
                  >
                    <option value="">Local</option>
                    {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(grupo => {
                      const equiposDelGrupo = equipos[grupo].filter(eq => {
                        const equiposUsados = obtenerEquiposUsados();
                        return eq.trim() && !equiposUsados.has(eq);
                      });
                      
                      if (equiposDelGrupo.length === 0) return null;
                      
                      return (
                        <optgroup key={grupo} label={`GRUPO ${grupo}`}>
                          {equiposDelGrupo.map(eq => (
                            <option key={eq} value={eq}>{eq}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>

                  <select
                    value={nuevoPartido.equipo_visitante}
                    onChange={(e) => setNuevoPartido(prev => ({ ...prev, equipo_visitante: e.target.value }))}
                    className="p-2 border rounded"
                    disabled={!nuevoPartido.equipo_local}
                  >
                    <option value="">Visitante</option>
                    {nuevoPartido.equipo_local && (() => {
                      const grupoLocal = obtenerGrupoEquipo(nuevoPartido.equipo_local);
                      if (!grupoLocal) return null;
                      
                      const rivalesDisponibles = obtenerRivalesDisponibles();
                      
                      return (
                        <optgroup label={`GRUPO ${grupoLocal}`}>
                          {rivalesDisponibles.map(eq => (
                            <option key={eq} value={eq}>{eq}</option>
                          ))}
                        </optgroup>
                      );
                    })()}
                  </select>

                  <input
                    type="datetime-local"
                    value={nuevoPartido.fecha_hora}
                    onChange={(e) => setNuevoPartido(prev => ({ ...prev, fecha_hora: e.target.value }))}
                    className="p-2 border rounded"
                  />

                  <select
                    value={nuevoPartido.bonus}
                    onChange={(e) => setNuevoPartido(prev => ({ ...prev, bonus: Number(e.target.value) }))}
                    className="p-2 border rounded"
                  >
                    <option value={1}>Bonus x1</option>
                    <option value={2}>Bonus x2</option>
                    <option value={3}>Bonus x3</option>
                  </select>
                </div>

                <button
                  onClick={agregarPartido}
                  disabled={loading}
                  className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg"
                >
                  Agregar Partido
                </button>
              </div>

              {/* Lista de partidos */}
              <div className="mt-6">
                <h3 className="font-bold text-xl mb-4 text-gray-800">📋 Partidos de la Jornada {jornadaActual}</h3>
                {partidos.length === 0 ? (
                  <p className="text-gray-500 italic">No hay partidos configurados</p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {partidos.map((partido, index) => {
                      const grupoLocal = obtenerGrupoEquipo(partido.nombre_local);
                      return (
                        <div 
                          key={partido.id} 
                          className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl p-5 shadow-lg hover:shadow-xl transition-all relative overflow-hidden"
                        >
                          {/* Decoración de fondo */}
                          <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full -mr-16 -mt-16"></div>
                          
                          {/* Header */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <span className="bg-blue-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
                                #{index + 1}
                              </span>
                              {grupoLocal && (
                                <span className="bg-amber-500 text-white text-sm font-bold px-3 py-1 rounded-lg">
                                  GRUPO {grupoLocal}
                                </span>
                              )}
                            </div>
                            {partido.goles_local !== null && (
                              <span className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                                ✓ FINALIZADO
                              </span>
                            )}
                          </div>

                          {/* Equipos */}
                          <div className="bg-white bg-opacity-10 rounded-lg p-4 mb-4">
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-4">
                                <div className="flex-1 text-right">
                                  <p className="text-white font-bold text-lg leading-tight">
                                    {partido.nombre_local}
                                  </p>
                                </div>
                                
                                <div className="flex flex-col items-center px-3">
                                  {partido.goles_local !== null ? (
                                    <div className="bg-white rounded-lg px-4 py-2 shadow-md">
                                      <p className="text-slate-800 font-black text-2xl">
                                        {partido.goles_local} - {partido.goles_visita}
                                      </p>
                                    </div>
                                  ) : (
                                    <p className="text-white font-bold text-xl opacity-60">VS</p>
                                  )}
                                </div>

                                <div className="flex-1 text-left">
                                  <p className="text-white font-bold text-lg leading-tight">
                                    {partido.nombre_visita}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Footer con info */}
                          <div className="flex items-center justify-between text-sm">
                            <div className="text-gray-300 flex items-center gap-2">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                              </svg>
                              <span className="font-medium">
                                {new Date(partido.fecha).toLocaleDateString('es-CL', { 
                                  day: 'numeric', 
                                  month: 'short' 
                                })} - {new Date(partido.fecha).toLocaleTimeString('es-CL', { 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              {/* Bonus editable */}
                              <div className="flex items-center gap-2">
                                {editandoBonus === partido.id ? (
                                  <div className="flex items-center gap-2">
                                    <select
                                      defaultValue={partido.bonus}
                                      onChange={(e) => actualizarBonus(partido.id, Number(e.target.value))}
                                      className="bg-yellow-400 text-gray-900 font-bold px-2 py-1 rounded text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
                                      autoFocus
                                    >
                                      <option value={1}>⭐ x1</option>
                                      <option value={2}>⭐ x2</option>
                                      <option value={3}>⭐ x3</option>
                                    </select>
                                    <button
                                      onClick={() => setEditandoBonus(null)}
                                      className="text-gray-300 hover:text-white"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setEditandoBonus(partido.id)}
                                    className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold px-3 py-1 rounded-lg text-sm transition-all"
                                  >
                                    ⭐ x{partido.bonus}
                                  </button>
                                )}
                              </div>

                              {/* Botón eliminar */}
                              <button
                                onClick={() => eliminarPartido(partido.id)}
                                className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg transition-colors"
                                title="Eliminar partido"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Acciones de jornada */}
              <div className="mt-6 flex gap-4">
                <button
                  onClick={cerrarJornada}
                  disabled={loading || partidos.length === 0}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50"
                >
                  🔒 Cerrar Jornada {jornadaActual}
                </button>
              </div>
            </div>
          )}

          {/* SECCIÓN: PREDICCIONES FINALES */}
          {step === 'finales' && (
            <div className="text-center p-12">
              <h3 className="text-2xl font-bold text-gray-600 mb-4">
                🏆 Predicciones Finales
              </h3>
              <p className="text-gray-500">
                Funcionalidad próximamente disponible
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
