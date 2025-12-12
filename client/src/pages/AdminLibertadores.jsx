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

  // Estado para generador de fixture
  const [fixtureGenerado, setFixtureGenerado] = useState(null);
  const [jornadasAsignadas, setJornadasAsignadas] = useState({}); // { partidoIndex: numeroJornada }

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
      // Si la jornada no existe, intentar crearla
      if (error.response?.status === 404) {
        await crearJornadaSiNoExiste();
      }
    }
  };

  const crearJornadaSiNoExiste = async () => {
    try {
      const token = localStorage.getItem('token');
      // Simplemente hacer un GET a /jornadas que las creará automáticamente
      await axios.get(`${API_URL}/api/libertadores/jornadas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Recargar después de crear
      cargarJornada();
    } catch (error) {
      console.error('Error creando jornada:', error);
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
        `${API_URL}/api/libertadores/jornadas/${jornadaActual}/toggle`,
        { cerrada: true },
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

  const activarJornada = async () => {
    if (!confirm(`¿Activar jornada ${jornadaActual}? Los usuarios podrán ingresar pronósticos.`)) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_URL}/api/libertadores/jornadas/${jornadaActual}/toggle`,
        { cerrada: false },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Activar la jornada
      await axios.patch(
        `${API_URL}/api/libertadores/jornadas/${jornadaActual}`,
        { activa: true },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setMessage({ type: 'success', text: '✅ Jornada activada' });
      cargarJornada();
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${error.response?.data?.error || error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const borrarTodosPartidos = async () => {
    if (!confirm(`⚠️ ¿BORRAR TODOS los partidos de la jornada ${jornadaActual}? Esta acción no se puede deshacer.`)) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      await axios.delete(
        `${API_URL}/api/libertadores/jornadas/${jornadaActual}/partidos`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setMessage({ type: 'success', text: '✅ Todos los partidos eliminados' });
      cargarPartidos();
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${error.response?.data?.error || error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const generarFixtureFaseGrupos = () => {
    const fixture = {};
    
    // Para cada grupo
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(grupo => {
      const equiposGrupo = equipos[grupo].filter(e => e.trim());
      if (equiposGrupo.length < 4) return; // Saltar si no hay 4 equipos
      
      const partidosGrupo = [];
      
      // Generar todos los cruces (ida y vuelta)
      for (let i = 0; i < equiposGrupo.length; i++) {
        for (let j = i + 1; j < equiposGrupo.length; j++) {
          // Partido IDA
          partidosGrupo.push({
            local: equiposGrupo[i],
            visita: equiposGrupo[j],
            grupo: grupo,
            tipo: 'IDA'
          });
          // Partido VUELTA
          partidosGrupo.push({
            local: equiposGrupo[j],
            visita: equiposGrupo[i],
            grupo: grupo,
            tipo: 'VUELTA'
          });
        }
      }
      
      fixture[grupo] = partidosGrupo;
    });
    
    setFixtureGenerado(fixture);
    setJornadasAsignadas({});
    setMessage({ type: 'success', text: `✅ Fixture generado: ${Object.values(fixture).flat().length} partidos` });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const validarAsignacionJornada = (partidoIndex, jornadaSeleccionada, partido) => {
    // Obtener todos los partidos ya asignados a esa jornada
    const partidosEnJornada = Object.entries(jornadasAsignadas)
      .filter(([idx, jornada]) => Number(idx) !== partidoIndex && jornada === jornadaSeleccionada)
      .map(([idx]) => Number(idx));
    
    // Obtener equipos ya usados en esa jornada
    const equiposEnJornada = new Set();
    const todosPartidos = Object.values(fixtureGenerado).flat();
    
    partidosEnJornada.forEach(idx => {
      const p = todosPartidos[idx];
      if (p) {
        equiposEnJornada.add(p.local);
        equiposEnJornada.add(p.visita);
      }
    });
    
    // Verificar si algún equipo se repite
    if (equiposEnJornada.has(partido.local) || equiposEnJornada.has(partido.visita)) {
      return false;
    }
    
    return true;
  };

  const asignarJornada = (partidoIndex, jornadaSeleccionada) => {
    const todosPartidos = Object.values(fixtureGenerado).flat();
    const partido = todosPartidos[partidoIndex];
    
    // Si ya está asignado a esta jornada, desasignar
    if (jornadasAsignadas[partidoIndex] === jornadaSeleccionada) {
      const nuevasJornadas = { ...jornadasAsignadas };
      delete nuevasJornadas[partidoIndex];
      setJornadasAsignadas(nuevasJornadas);
      return;
    }
    
    if (!validarAsignacionJornada(partidoIndex, jornadaSeleccionada, partido)) {
      setMessage({ 
        type: 'error', 
        text: `❌ ${partido.local} o ${partido.visita} ya está en la Jornada ${jornadaSeleccionada}` 
      });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      return;
    }
    
    setJornadasAsignadas(prev => ({
      ...prev,
      [partidoIndex]: Number(jornadaSeleccionada)
    }));
  };

  const guardarFixtureCompleto = async () => {
    const todosPartidos = Object.values(fixtureGenerado).flat();
    const partidosSinJornada = todosPartidos.filter((_, idx) => !jornadasAsignadas[idx]);
    
    if (partidosSinJornada.length > 0) {
      if (!confirm(`⚠️ Hay ${partidosSinJornada.length} partidos sin jornada asignada. ¿Continuar de todas formas?`)) {
        return;
      }
    }
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // Agrupar partidos por jornada
      const partidosPorJornada = {};
      todosPartidos.forEach((partido, idx) => {
        const jornada = jornadasAsignadas[idx];
        if (jornada) {
          if (!partidosPorJornada[jornada]) {
            partidosPorJornada[jornada] = [];
          }
          partidosPorJornada[jornada].push({
            equipo_local: partido.local,
            equipo_visitante: partido.visita,
            fecha_hora: new Date().toISOString(),
            bonus: 1
          });
        }
      });
      
      // Guardar cada jornada
      for (const [jornada, partidos] of Object.entries(partidosPorJornada)) {
        await axios.post(
          `${API_URL}/api/libertadores/jornadas/${jornada}/partidos`,
          { partidos },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      
      setMessage({ type: 'success', text: '✅ Fixture guardado exitosamente' });
      setFixtureGenerado(null);
      setJornadasAsignadas({});
      cargarPartidos();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
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
                      {n <= 6 ? `Jornada ${n} - Fase de Grupos` : 
                       n === 7 ? 'Jornada 7 - Octavos de Final IDA' :
                       n === 8 ? 'Jornada 8 - Octavos de Final VUELTA' :
                       n === 9 ? 'Jornada 9 - Cuartos de Final IDA/VUELTA' : 
                       'Jornada 10 - Semifinales IDA/VUELTA + Final + Cuadro Final'}
                    </option>
                  ))}
                </select>
                
                <button
                  onClick={borrarTodosPartidos}
                  disabled={loading || partidos.length === 0}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Borrar todos los partidos de esta jornada"
                >
                  🗑️ Borrar Todos los Partidos
                </button>
                
                <button
                  onClick={generarFixtureFaseGrupos}
                  disabled={loading}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
                >
                  ⚽ Generar Fixture Fase de Grupos
                </button>
              </div>

              {/* Vista del generador de fixture */}
              {fixtureGenerado && (
                <div className="bg-blue-50 p-6 rounded-lg mb-6 border-2 border-blue-300">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-xl text-blue-900">📋 Fixture Generado - Asignar Jornadas</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={guardarFixtureCompleto}
                        disabled={loading}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
                      >
                        💾 Guardar Fixture Completo
                      </button>
                      <button
                        onClick={() => setFixtureGenerado(null)}
                        className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
                      >
                        ✕ Cancelar
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Object.entries(fixtureGenerado).map(([grupo, partidosGrupo]) => (
                      <div key={grupo} className="bg-white p-4 rounded-lg shadow">
                        <h4 className="font-bold text-lg mb-3 text-blue-800">GRUPO {grupo}</h4>
                        <div className="space-y-3">
                          {partidosGrupo.map((partido, idx) => {
                            const globalIndex = Object.values(fixtureGenerado)
                              .flat()
                              .findIndex(p => p.local === partido.local && p.visita === partido.visita && p.tipo === partido.tipo);
                            
                            const jornadaAsignada = jornadasAsignadas[globalIndex];
                            
                            return (
                              <div key={idx} className="border rounded p-2 bg-gray-50">
                                <div className="text-sm mb-2">
                                  <span className="font-semibold">{partido.local}</span> vs {partido.visita}
                                  <span className="text-xs text-gray-500 ml-1">({partido.tipo})</span>
                                </div>
                                <div className="flex gap-1 flex-wrap">
                                  {[1, 2, 3, 4, 5, 6].map(j => {
                                    const esValido = validarAsignacionJornada(globalIndex, j, partido);
                                    const estaAsignado = jornadaAsignada === j;
                                    
                                    return (
                                      <button
                                        key={j}
                                        onClick={() => asignarJornada(globalIndex, j)}
                                        disabled={!esValido && !estaAsignado}
                                        className={`px-3 py-1.5 text-xs rounded font-bold transition-all ${
                                          estaAsignado
                                            ? 'bg-red-600 text-white ring-2 ring-red-300'
                                            : esValido
                                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300'
                                            : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-40'
                                        }`}
                                        title={
                                          estaAsignado
                                            ? 'Click para desasignar'
                                            : esValido
                                            ? `Asignar a Jornada ${j}`
                                            : 'Equipo ya en esta jornada'
                                        }
                                      >
                                        J{j}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
              <div>
                <h3 className="font-bold text-lg mb-4">Partidos de la Jornada {jornadaActual}</h3>
                {partidos.length === 0 ? (
                  <p className="text-gray-500 italic">No hay partidos configurados</p>
                ) : (
                  <div className="row g-3">
                    {partidos.map(partido => {
                    const grupoLocal = obtenerGrupoEquipo(partido.nombre_local);
                    return (
                      <div key={partido.id} className="col-12 col-lg-6">
                        <div className="card">
                          <div className="card-body">
                            <div className="d-flex justify-content-between align-items-start gap-3">
                              <div className="flex-grow-1">
                                <p className="fw-bold mb-2">
                                  {partido.nombre_local} vs {partido.nombre_visita}
                                  {grupoLocal && <span className="ms-2 badge bg-primary">Grupo {grupoLocal}</span>}
                                </p>
                                <p className="text-muted small mb-2">
                                  {new Date(partido.fecha).toLocaleString('es-CL')}
                                </p>
                                <div className="mb-2">
                                  {editandoBonus === partido.id ? (
                                    <span className="d-inline-flex align-items-center gap-2">
                                      <select
                                        defaultValue={partido.bonus}
                                        onChange={(e) => actualizarBonus(partido.id, Number(e.target.value))}
                                        className="form-select form-select-sm"
                                        autoFocus
                                        style={{ width: 'auto' }}
                                      >
                                        <option value={1}>Bonus x1</option>
                                        <option value={2}>Bonus x2</option>
                                        <option value={3}>Bonus x3</option>
                                      </select>
                                      <button
                                        onClick={() => setEditandoBonus(null)}
                                        className="btn btn-sm btn-link text-muted"
                                      >
                                        ✕
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => setEditandoBonus(partido.id)}
                                      className="btn btn-link btn-sm p-0 text-decoration-underline"
                                    >
                                      Bonus x{partido.bonus}
                                    </button>
                                  )}
                                </div>
                                {partido.goles_local !== null && (
                                  <p className="text-primary fw-bold small mb-0">
                                    Resultado: {partido.goles_local} - {partido.goles_visita}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => eliminarPartido(partido.id)}
                                className="btn btn-danger btn-sm"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>

              {/* Acciones de jornada */}
              <div className="mt-4 d-flex gap-3">
                <button
                  onClick={activarJornada}
                  disabled={loading}
                  className="btn btn-success"
                >
                  ✅ Activar Jornada {jornadaActual}
                </button>
                <button
                  onClick={cerrarJornada}
                  disabled={loading || partidos.length === 0}
                  className="btn btn-warning"
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
