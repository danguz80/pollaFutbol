import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export default function AdminLibertadores() {
  const navigate = useNavigate();
  const [step, setStep] = useState('teams'); // 'teams', 'fixtures', 'finales'
  const [jornadaActual, setJornadaActual] = useState(1);
  const [jornadaCerrada, setJornadaCerrada] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Estados para octavos de final
  const [equiposClasificados, setEquiposClasificados] = useState({ primeros: [], segundos: [] });
  const [crucesOctavos, setCrucesOctavos] = useState([
    { local: null, visita: null },
    { local: null, visita: null },
    { local: null, visita: null },
    { local: null, visita: null },
    { local: null, visita: null },
    { local: null, visita: null },
    { local: null, visita: null },
    { local: null, visita: null }
  ]);
  const [equiposSeleccionados, setEquiposSeleccionados] = useState([]);
  
  // Estado para equipos (cada equipo es un objeto {nombre, pais})
  const [equipos, setEquipos] = useState({
    A: [{ nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }],
    B: [{ nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }],
    C: [{ nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }],
    D: [{ nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }],
    E: [{ nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }],
    F: [{ nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }],
    G: [{ nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }],
    H: [{ nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }]
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
  const [resultados, setResultados] = useState({}); // { partidoId: { goles_local, goles_visita } }

  // Estado para generador de fixture
  const [fixtureGenerado, setFixtureGenerado] = useState(null);
  const [jornadasAsignadas, setJornadasAsignadas] = useState({}); // { partidoIndex: numeroJornada }

  useEffect(() => {
    cargarEquipos();
    cargarJornada();
    if (jornadaActual === 7) {
      cargarEquiposClasificados();
    }
  }, [jornadaActual]);

  useEffect(() => {
    if (step === 'finales') {
      cargarEquiposClasificados();
    }
  }, [step]);

  const cargarEquiposClasificados = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/libertadores/equipos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Filtrar primeros y segundos de cada grupo
      const primeros = response.data.filter(eq => eq.posicion_grupo === 1).sort((a, b) => a.grupo.localeCompare(b.grupo));
      const segundos = response.data.filter(eq => eq.posicion_grupo === 2).sort((a, b) => a.grupo.localeCompare(b.grupo));
      
      setEquiposClasificados({ primeros, segundos });
    } catch (error) {
      console.error('Error cargando equipos clasificados:', error);
    }
  };

  const seleccionarEquipo = (equipo) => {
    // Calcular en qué posición va el equipo
    const indice = equiposSeleccionados.length;
    const cruceIndex = Math.floor(indice / 2);
    const esLocal = indice % 2 === 0;

    // VALIDACIÓN: Si es visitante, validar que no sea del mismo tipo que el local
    if (!esLocal) {
      const equipoLocal = crucesOctavos[cruceIndex].local;
      if (equipoLocal) {
        const localEsPrimero = equiposClasificados.primeros.some(e => e.nombre === equipoLocal.nombre);
        const nuevoEsPrimero = equiposClasificados.primeros.some(e => e.nombre === equipo.nombre);
        
        if (localEsPrimero === nuevoEsPrimero) {
          setMessage({ 
            type: 'error', 
            text: `❌ No se pueden enfrentar dos ${localEsPrimero ? 'primeros' : 'segundos'} de grupo` 
          });
          setTimeout(() => setMessage({ type: '', text: '' }), 3000);
          return;
        }
      }
    }

    // Agregar equipo a la lista de seleccionados
    const nuevosSeleccionados = [...equiposSeleccionados, equipo];
    setEquiposSeleccionados(nuevosSeleccionados);

    // Actualizar el cruce correspondiente
    const nuevosCruces = [...crucesOctavos];
    if (esLocal) {
      nuevosCruces[cruceIndex].local = equipo;
    } else {
      nuevosCruces[cruceIndex].visita = equipo;
    }
    setCrucesOctavos(nuevosCruces);

    // Limpiar mensaje de error si había
    setMessage({ type: '', text: '' });
  };

  const reiniciarSeleccion = () => {
    setEquiposSeleccionados([]);
    setCrucesOctavos([
      { local: null, visita: null },
      { local: null, visita: null },
      { local: null, visita: null },
      { local: null, visita: null },
      { local: null, visita: null },
      { local: null, visita: null },
      { local: null, visita: null },
      { local: null, visita: null }
    ]);
  };

  const guardarCrucesOctavos = async () => {
    // Validar que todos los cruces estén completos
    const crucesCompletos = crucesOctavos.filter(c => c.local && c.visita);
    if (crucesCompletos.length !== 8) {
      setMessage({ type: 'error', text: 'Debes completar los 8 cruces antes de guardar' });
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // Preparar partidos para la jornada 7 (octavos)
      const partidos = crucesCompletos.map((cruce, index) => ({
        nombre_local: cruce.local.nombre,
        nombre_visita: cruce.visita.nombre,
        jornada_numero: 7,
        orden: index + 1
      }));

      await axios.post(
        `${API_URL}/api/libertadores/octavos`,
        { partidos },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMessage({ type: 'success', text: '✅ Cruces de octavos guardados exitosamente' });
      cargarJornada(); // Recargar partidos
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error completo:', error);
      console.error('Response data:', error.response?.data);
      const mensajeError = error.response?.data?.detalle || error.response?.data?.error || error.message;
      setMessage({ type: 'error', text: `Error: ${mensajeError}` });
    } finally {
      setLoading(false);
    }
  };

  const invertirJornada7ParaJornada8 = async () => {
    if (!confirm('¿Invertir los cruces de la Jornada 7 para crear la Jornada 8 (vuelta)?')) {
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // Obtener partidos de jornada 7
      const responseJ7 = await axios.get(`${API_URL}/api/libertadores/jornadas/7`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const partidosJ7 = responseJ7.data.partidos || [];
      
      if (partidosJ7.length === 0) {
        setMessage({ type: 'error', text: 'No hay partidos en la Jornada 7 para invertir' });
        setLoading(false);
        return;
      }

      // Invertir local/visita para jornada 8
      const partidosJ8 = partidosJ7.map((partido, index) => ({
        nombre_local: partido.nombre_visita,
        nombre_visita: partido.nombre_local,
        jornada_numero: 8,
        orden: index + 1
      }));

      // Guardar en jornada 8
      await axios.post(
        `${API_URL}/api/libertadores/octavos`,
        { partidos: partidosJ8 },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMessage({ type: 'success', text: '✅ Jornada 8 creada exitosamente (partidos invertidos)' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${error.response?.data?.error || error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const cargarEquipos = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/libertadores/equipos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.length > 0) {
        const equiposPorGrupo = response.data.reduce((acc, equipo) => {
          if (!acc[equipo.grupo]) acc[equipo.grupo] = [];
          acc[equipo.grupo].push({ nombre: equipo.nombre, pais: equipo.pais || '' });
          return acc;
        }, {});
        
        // Completar con vacíos si faltan equipos
        ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(grupo => {
          if (!equiposPorGrupo[grupo]) {
            equiposPorGrupo[grupo] = [{ nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }, { nombre: '', pais: '' }];
          } else {
            while (equiposPorGrupo[grupo].length < 4) {
              equiposPorGrupo[grupo].push({ nombre: '', pais: '' });
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
      const partidosCargados = response.data.partidos || [];
      setPartidos(partidosCargados);
      // Corregido: el estado cerrada viene directo en response.data
      setJornadaCerrada(response.data.cerrada || false);
      
      // Inicializar resultados con valores existentes
      const resultadosIniciales = {};
      partidosCargados.forEach(p => {
        resultadosIniciales[p.id] = {
          goles_local: p.goles_local ?? '',
          goles_visita: p.goles_visita ?? ''
        };
      });
      setResultados(resultadosIniciales);
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
        teams.forEach(equipo => {
          if (equipo.nombre.trim()) {
            equiposArray.push({ 
              nombre: equipo.nombre.trim(), 
              pais: equipo.pais.trim(),
              grupo 
            });
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

  const handleResultadoChange = (partidoId, campo, valor) => {
    setResultados(prev => ({
      ...prev,
      [partidoId]: {
        ...prev[partidoId],
        [campo]: valor === '' ? '' : Number(valor)
      }
    }));
  };

  const guardarResultados = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // Preparar array de partidos con resultados
      const partidosConResultados = partidos
        .filter(p => resultados[p.id]?.goles_local !== '' && resultados[p.id]?.goles_visita !== '')
        .map(p => ({
          id: p.id,
          goles_local: resultados[p.id].goles_local,
          goles_visita: resultados[p.id].goles_visita,
          bonus: p.bonus
        }));
      
      if (partidosConResultados.length === 0) {
        setMessage({ type: 'error', text: 'No hay resultados para guardar' });
        setLoading(false);
        return;
      }
      
      await axios.patch(
        `${API_URL}/api/libertadores/jornadas/${jornadaActual}/resultados`,
        { partidos: partidosConResultados },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setMessage({ type: 'success', text: `✅ ${partidosConResultados.length} resultado(s) guardado(s)` });
      cargarJornada();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: `Error: ${error.response?.data?.error || error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const generarResultadosAleatorios = () => {
    const nuevosResultados = {};
    partidos.forEach(partido => {
      nuevosResultados[partido.id] = {
        goles_local: Math.floor(Math.random() * 5), // 0 a 4
        goles_visita: Math.floor(Math.random() * 5)  // 0 a 4
      };
    });
    setResultados(nuevosResultados);
    setMessage({ type: 'success', text: '🎲 Resultados aleatorios generados' });
    setTimeout(() => setMessage({ type: '', text: '' }), 2000);
  };

  const resetearResultados = () => {
    const resultadosVacios = {};
    partidos.forEach(partido => {
      resultadosVacios[partido.id] = {
        goles_local: 0,
        goles_visita: 0
      };
    });
    setResultados(resultadosVacios);
    setMessage({ type: 'success', text: '🔄 Resultados reseteados a 0' });
    setTimeout(() => setMessage({ type: '', text: '' }), 2000);
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

  const toggleJornada = async () => {
    const nuevoCerrada = !jornadaCerrada;
    const accion = nuevoCerrada ? 'cerrar' : 'abrir';
    const mensaje = nuevoCerrada 
      ? `¿Cerrar jornada ${jornadaActual}? Los usuarios ya no podrán ingresar pronósticos.`
      : `¿Abrir jornada ${jornadaActual}? Los usuarios podrán modificar sus pronósticos.`;
    
    if (!confirm(mensaje)) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      
      // Obtener el ID de la jornada primero
      const jornadaResponse = await axios.get(
        `${API_URL}/api/libertadores/jornadas/${jornadaActual}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const jornadaId = jornadaResponse.data.id;
      
      // Cambiar estado con el endpoint correcto
      await axios.patch(
        `${API_URL}/api/libertadores/jornadas/${jornadaId}/estado`,
        { cerrada: nuevoCerrada },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setMessage({ type: 'success', text: `✅ Jornada ${nuevoCerrada ? 'cerrada' : 'abierta'} exitosamente` });
      await cargarJornada();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error(`Error al ${accion} jornada:`, error);
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

  const generarFixtureFaseGrupos = async () => {
    const fixture = {};
    
    // Para cada grupo
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(grupo => {
      const equiposGrupo = equipos[grupo].filter(e => e.nombre.trim());
      if (equiposGrupo.length < 4) return; // Saltar si no hay 4 equipos
      
      const partidosGrupo = [];
      
      // Generar todos los cruces (ida y vuelta)
      for (let i = 0; i < equiposGrupo.length; i++) {
        for (let j = i + 1; j < equiposGrupo.length; j++) {
          // Partido IDA
          partidosGrupo.push({
            local: equiposGrupo[i].nombre,
            visita: equiposGrupo[j].nombre,
            grupo: grupo,
            tipo: 'IDA'
          });
          // Partido VUELTA
          partidosGrupo.push({
            local: equiposGrupo[j].nombre,
            visita: equiposGrupo[i].nombre,
            grupo: grupo,
            tipo: 'VUELTA'
          });
        }
      }
      
      fixture[grupo] = partidosGrupo;
    });
    
    setFixtureGenerado(fixture);
    
    // Cargar partidos existentes para recuperar asignaciones previas
    try {
      const token = localStorage.getItem('token');
      const asignacionesPrevias = {};
      
      // Cargar partidos de jornadas 1-6
      for (let j = 1; j <= 6; j++) {
        const response = await axios.get(
          `${API_URL}/api/libertadores/jornadas/${j}/partidos`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        const partidosJornada = response.data;
        const todosPartidosFixture = Object.values(fixture).flat();
        
        // Mapear partidos existentes con el fixture generado
        partidosJornada.forEach(partidoExistente => {
          const globalIndex = todosPartidosFixture.findIndex(
            p => p.local === partidoExistente.nombre_local && 
                 p.visita === partidoExistente.nombre_visita
          );
          
          if (globalIndex !== -1) {
            asignacionesPrevias[globalIndex] = j;
          }
        });
      }
      
      setJornadasAsignadas(asignacionesPrevias);
      
      const totalAsignados = Object.keys(asignacionesPrevias).length;
      if (totalAsignados > 0) {
        setMessage({ 
          type: 'success', 
          text: `✅ Fixture generado: ${Object.values(fixture).flat().length} partidos (${totalAsignados} ya asignados)` 
        });
      } else {
        setMessage({ 
          type: 'success', 
          text: `✅ Fixture generado: ${Object.values(fixture).flat().length} partidos` 
        });
      }
    } catch (error) {
      setMessage({ 
        type: 'success', 
        text: `✅ Fixture generado: ${Object.values(fixture).flat().length} partidos` 
      });
    }
    
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
    const partidosConJornada = Object.keys(jornadasAsignadas).length;
    
    if (partidosConJornada === 0) {
      setMessage({ type: 'error', text: '⚠️ Debes asignar al menos un partido a una jornada' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      return;
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
      
      const partidosSinJornada = todosPartidos.length - partidosConJornada;
      setMessage({ 
        type: 'success', 
        text: `✅ ${partidosConJornada} partidos guardados${partidosSinJornada > 0 ? ` (${partidosSinJornada} pendientes)` : ''}` 
      });
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

  const handleEquipoChange = (grupo, index, field, value) => {
    setEquipos(prev => ({
      ...prev,
      [grupo]: prev[grupo].map((eq, i) => 
        i === index ? { ...eq, [field]: value } : eq
      )
    }));
  };

  const todosLosEquipos = Object.values(equipos).flat().filter(eq => eq.nombre.trim());

  // Obtener el grupo de un equipo
  const obtenerGrupoEquipo = (nombreEquipo) => {
    for (const [grupo, teams] of Object.entries(equipos)) {
      if (teams.some(eq => eq.nombre === nombreEquipo)) {
        return grupo;
      }
    }
    return null;
  };

  // Función para obtener el nombre completo con sufijo de país
  const getNombreConPais = (nombreEquipo) => {
    for (const teams of Object.values(equipos)) {
      const equipo = teams.find(eq => eq.nombre === nombreEquipo);
      if (equipo && equipo.pais) {
        return `${equipo.nombre} (${equipo.pais})`;
      }
    }
    return nombreEquipo;
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
    const equiposDelGrupo = equipos[grupoLocal].filter(eq => eq.nombre.trim() && eq.nombre !== nuevoPartido.equipo_local);
    
    // Equipos ya usados en partidos de esta jornada
    const equiposUsados = obtenerEquiposUsados();
    
    // Filtrar equipos disponibles
    return equiposDelGrupo.filter(eq => !equiposUsados.has(eq.nombre));
  };

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from {
            transform: translate(-50%, 100%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }
      `}</style>
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Mensajes - Fixed en la parte inferior de la pantalla */}
        {message.text && (
          <div 
            className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[9999] p-6 rounded-lg shadow-2xl min-w-[400px] max-w-[700px] text-center font-bold text-xl ${
              message.type === 'success' ? 'bg-green-100 text-green-800 border-4 border-green-500' : 'bg-red-100 text-red-800 border-4 border-red-500'
            }`}
            style={{ animation: 'slideUp 0.3s ease-out' }}
          >
            {message.text}
          </div>
        )}
        
        <div className="bg-white rounded-lg shadow-2xl p-6">
          <h1 className="text-3xl font-bold text-blue-900 mb-6">
            ⚽ Admin Copa Libertadores 2026
          </h1>

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
              <div className="row g-4 mb-4">
                {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(grupo => (
                  <div key={grupo} className="col-12 col-md-6">
                    <div className="border rounded p-3 bg-light">
                      <h3 className="fs-5 fw-bold text-primary mb-3">Grupo {grupo}</h3>
                      {[0, 1, 2, 3].map(i => (
                        <div key={i} className="mb-2">
                          <div className="d-flex gap-2">
                            <input
                              type="text"
                              placeholder={`Equipo ${i + 1}`}
                              value={equipos[grupo][i].nombre}
                              onChange={(e) => handleEquipoChange(grupo, i, 'nombre', e.target.value)}
                              className="form-control"
                            />
                            <input
                              type="text"
                              placeholder="País"
                              value={equipos[grupo][i].pais}
                              onChange={(e) => handleEquipoChange(grupo, i, 'pais', e.target.value)}
                              className="form-control text-center"
                              style={{ width: '80px' }}
                              maxLength="6"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={guardarEquipos}
                disabled={loading}
                className="btn btn-primary btn-lg px-4"
              >
                {loading ? 'Guardando...' : '💾 Guardar Equipos'}
              </button>

              <div className="mt-4 p-3 bg-light rounded">
                <p className="small text-primary mb-0">
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
                  
                  <div className="row g-4">
                    {Object.entries(fixtureGenerado).map(([grupo, partidosGrupo]) => (
                      <div key={grupo} className="col-12">
                        <div className="card shadow">
                          <div className="card-body">
                            <h4 className="card-title fw-bold text-primary mb-3">GRUPO {grupo}</h4>
                            <div className="row">
                              {/* Primera columna - primeros 6 partidos */}
                              <div className="col-12 col-lg-6">
                                {partidosGrupo.slice(0, 6).map((partido, idx) => {
                                  const globalIndex = Object.values(fixtureGenerado)
                                    .flat()
                                    .findIndex(p => p.local === partido.local && p.visita === partido.visita && p.tipo === partido.tipo);
                                  
                                  const jornadaAsignada = jornadasAsignadas[globalIndex];
                                  
                                  return (
                                    <div key={idx} className="border rounded p-2 mb-2 bg-light">
                                      <div className="small mb-2">
                                        <span className="fw-bold">{getNombreConPais(partido.local)}</span> vs {getNombreConPais(partido.visita)}
                                        <span className="text-muted ms-1" style={{ fontSize: '0.75rem' }}>({partido.tipo})</span>
                                      </div>
                                      <div className="d-flex gap-1 flex-wrap">
                                        {jornadaAsignada ? (
                                          <button
                                            onClick={() => asignarJornada(globalIndex, jornadaAsignada)}
                                            className="btn btn-danger btn-sm fw-bold"
                                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                            title="Click para desasignar y cambiar de jornada"
                                          >
                                            J{jornadaAsignada} ✓
                                          </button>
                                        ) : (
                                          [1, 2, 3, 4, 5, 6].map(j => {
                                            const esValido = validarAsignacionJornada(globalIndex, j, partido);
                                            
                                            return (
                                              <button
                                                key={j}
                                                onClick={() => asignarJornada(globalIndex, j)}
                                                disabled={!esValido}
                                                className={`btn btn-sm fw-bold ${
                                                  esValido
                                                    ? 'btn-outline-primary'
                                                    : 'btn-outline-secondary disabled opacity-50'
                                                }`}
                                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                                title={
                                                  esValido
                                                    ? `Asignar a Jornada ${j}`
                                                    : 'Equipo ya en esta jornada'
                                                }
                                              >
                                                J{j}
                                              </button>
                                            );
                                          })
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              
                              {/* Segunda columna - últimos 6 partidos */}
                              <div className="col-12 col-lg-6">
                                {partidosGrupo.slice(6, 12).map((partido, idx) => {
                                  const realIdx = idx + 6;
                                  const globalIndex = Object.values(fixtureGenerado)
                                    .flat()
                                    .findIndex(p => p.local === partido.local && p.visita === partido.visita && p.tipo === partido.tipo);
                                  
                                  const jornadaAsignada = jornadasAsignadas[globalIndex];
                                  
                                  return (
                                    <div key={realIdx} className="border rounded p-2 mb-2 bg-light">
                                      <div className="small mb-2">
                                        <span className="fw-bold">{getNombreConPais(partido.local)}</span> vs {getNombreConPais(partido.visita)}
                                        <span className="text-muted ms-1" style={{ fontSize: '0.75rem' }}>({partido.tipo})</span>
                                      </div>
                                      <div className="d-flex gap-1 flex-wrap">
                                        {jornadaAsignada ? (
                                          <button
                                            onClick={() => asignarJornada(globalIndex, jornadaAsignada)}
                                            className="btn btn-danger btn-sm fw-bold"
                                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                            title="Click para desasignar y cambiar de jornada"
                                          >
                                            J{jornadaAsignada} ✓
                                          </button>
                                        ) : (
                                          [1, 2, 3, 4, 5, 6].map(j => {
                                            const esValido = validarAsignacionJornada(globalIndex, j, partido);
                                            
                                            return (
                                              <button
                                                key={j}
                                                onClick={() => asignarJornada(globalIndex, j)}
                                                disabled={!esValido}
                                                className={`btn btn-sm fw-bold ${
                                                  esValido
                                                    ? 'btn-outline-primary'
                                                    : 'btn-outline-secondary disabled opacity-50'
                                                }`}
                                                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                                                title={
                                                  esValido
                                                    ? `Asignar a Jornada ${j}`
                                                    : 'Equipo ya en esta jornada'
                                                }
                                              >
                                                J{j}
                                              </button>
                                            );
                                          })
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SISTEMA DE OCTAVOS - JORNADA 7 */}
              {jornadaActual === 7 ? (
                <div>
                  <div className="card shadow-sm mb-4">
                    <div className="card-header bg-danger text-white">
                      <h3 className="mb-0">⚽ Formar Fixture de Octavos de Final</h3>
                    </div>
                    <div className="card-body">
                      <div className="alert alert-info mb-4">
                        <strong>Instrucciones:</strong> Haz clic en los equipos en el orden deseado. 
                        El primer clic irá a Local del Cruce 1, el segundo a Visita del Cruce 1, y así sucesivamente.
                      </div>

                      {/* Equipos Clasificados - Primeros */}
                      <div className="mb-4">
                        <h5 className="text-center mb-3 fw-bold">🥇 Primeros de Grupo</h5>
                        <div className="d-flex flex-wrap justify-content-center gap-2">
                          {equiposClasificados.primeros.map((equipo) => {
                            const yaSeleccionado = equiposSeleccionados.some(e => e.nombre === equipo.nombre);
                            return (
                              <button
                                key={equipo.id}
                                className={`btn ${
                                  yaSeleccionado 
                                    ? 'btn-secondary' 
                                    : 'btn-outline-primary'
                                }`}
                                onClick={() => !yaSeleccionado && seleccionarEquipo(equipo)}
                                disabled={yaSeleccionado}
                                style={{ minWidth: '140px' }}
                              >
                                {equipo.nombre} {equipo.pais && `(${equipo.pais})`}
                                {yaSeleccionado && ' ✓'}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Equipos Clasificados - Segundos */}
                      <div className="mb-4">
                        <h5 className="text-center mb-3 fw-bold">🥈 Segundos de Grupo</h5>
                        <div className="d-flex flex-wrap justify-content-center gap-2">
                          {equiposClasificados.segundos.map((equipo) => {
                            const yaSeleccionado = equiposSeleccionados.some(e => e.nombre === equipo.nombre);
                            return (
                              <button
                                key={equipo.id}
                                className={`btn ${
                                  yaSeleccionado 
                                    ? 'btn-secondary' 
                                    : 'btn-outline-success'
                                }`}
                                onClick={() => !yaSeleccionado && seleccionarEquipo(equipo)}
                                disabled={yaSeleccionado}
                                style={{ minWidth: '140px' }}
                              >
                                {equipo.nombre} {equipo.pais && `(${equipo.pais})`}
                                {yaSeleccionado && ' ✓'}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Botón Reiniciar */}
                      <div className="text-center mb-4">
                        <button
                          className="btn btn-warning"
                          onClick={reiniciarSeleccion}
                        >
                          🔄 Reiniciar Selección
                        </button>
                      </div>

                      <hr />

                      {/* Cruces de Octavos */}
                      <h5 className="text-center mb-4 fw-bold">🏆 Cruces de Octavos de Final</h5>
                      <div className="row g-3">
                        {crucesOctavos.map((cruce, index) => (
                          <div key={index} className="col-12 col-md-6 col-lg-3">
                            <div className="card h-100 border-primary">
                              <div className="card-header bg-primary text-white text-center">
                                <strong>Cruce {index + 1}</strong>
                              </div>
                              <div className="card-body">
                                {/* Equipo Local */}
                                <div className="mb-3">
                                  <small className="text-muted d-block mb-1">Local</small>
                                  <div className={
                                    cruce.local 
                                      ? 'alert alert-success mb-0 py-2' 
                                      : 'alert alert-light mb-0 py-2 text-muted'
                                  }>
                                    {cruce.local 
                                      ? `${cruce.local.nombre} ${cruce.local.pais ? `(${cruce.local.pais})` : ''}`
                                      : 'Esperando...'
                                    }
                                  </div>
                                </div>

                                {/* VS */}
                                <div className="text-center mb-3">
                                  <strong className="text-danger">VS</strong>
                                </div>

                                {/* Equipo Visita */}
                                <div>
                                  <small className="text-muted d-block mb-1">Visita</small>
                                  <div className={
                                    cruce.visita 
                                      ? 'alert alert-info mb-0 py-2' 
                                      : 'alert alert-light mb-0 py-2 text-muted'
                                  }>
                                    {cruce.visita 
                                      ? `${cruce.visita.nombre} ${cruce.visita.pais ? `(${cruce.visita.pais})` : ''}`
                                      : 'Esperando...'
                                    }
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Botón Guardar */}
                      <div className="text-center mt-4">
                        <button
                          className="btn btn-success btn-lg px-5 me-3"
                          onClick={guardarCrucesOctavos}
                          disabled={loading || crucesOctavos.filter(c => c.local && c.visita).length !== 8}
                        >
                          {loading ? '⏳ Guardando...' : '💾 Guardar Cruces de Octavos (IDA)'}
                        </button>
                        
                        {/* Botón para crear jornada 8 invirtiendo */}
                        {partidos.length > 0 && (
                          <button
                            className="btn btn-info btn-lg px-5"
                            onClick={invertirJornada7ParaJornada8}
                            disabled={loading}
                          >
                            {loading ? '⏳ Creando...' : '🔄 Invertir para Jornada 8 (VUELTA)'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : jornadaActual === 8 ? (
                /* JORNADA 8 - OCTAVOS VUELTA */
                <div>
                  <div className="alert alert-info mb-4">
                    <h5 className="mb-3">🔄 Jornada 8 - Octavos de Final VUELTA</h5>
                    <p className="mb-0">
                      Esta jornada se genera automáticamente invirtiendo los cruces de la Jornada 7.
                      Los equipos locales pasan a ser visitantes y viceversa.
                    </p>
                  </div>

                  {partidos.length === 0 ? (
                    <div className="text-center py-5">
                      <p className="text-muted mb-4">Aún no se han creado los partidos de vuelta</p>
                      <button
                        className="btn btn-primary btn-lg px-5"
                        onClick={invertirJornada7ParaJornada8}
                        disabled={loading}
                      >
                        {loading ? '⏳ Creando...' : '🔄 Crear Jornada 8 desde Jornada 7'}
                      </button>
                    </div>
                  ) : (
                    <div className="alert alert-success">
                      <h6 className="mb-0">✅ Jornada 8 configurada con {partidos.length} partidos (vuelta de octavos)</h6>
                    </div>
                  )}
                </div>
              ) : (
                /* FORMULARIO NORMAL PARA OTRAS JORNADAS */
                <div>
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
                        return eq.nombre.trim() && !equiposUsados.has(eq.nombre);
                      });
                      
                      if (equiposDelGrupo.length === 0) return null;
                      
                      return (
                        <optgroup key={grupo} label={`GRUPO ${grupo}`}>
                          {equiposDelGrupo.map(eq => (
                            <option key={eq.nombre} value={eq.nombre}>
                              {eq.nombre}{eq.pais && ` (${eq.pais})`}
                            </option>
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
                            <option key={eq.nombre} value={eq.nombre}>
                              {eq.nombre}{eq.pais && ` (${eq.pais})`}
                            </option>
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
              <div className="mt-4">
                <h3 className="fw-bold fs-5 mb-3">Partidos de la Jornada {jornadaActual}</h3>
                {partidos.length === 0 ? (
                  <p className="text-muted fst-italic">No hay partidos configurados</p>
                ) : (
                  <div className="row g-3">
                    {partidos.map(partido => {
                    const grupoLocal = obtenerGrupoEquipo(partido.nombre_local);
                    return (
                      <div key={partido.id} className="col-12 col-md-6">
                        <div className="card">
                          <div className="card-body">
                            <div className="d-flex justify-content-between align-items-start gap-3">
                              <div className="flex-grow-1">
                                <p className="fw-bold mb-2">
                                  {getNombreConPais(partido.nombre_local)} vs {getNombreConPais(partido.nombre_visita)}
                                  {grupoLocal && <span className="ms-2 badge bg-primary">Grupo {grupoLocal}</span>}
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
                                  <p className="text-success fw-bold small mb-2">
                                    ✅ Resultado guardado: {partido.goles_local} - {partido.goles_visita}
                                  </p>
                                )}
                                
                                {/* Inputs para ingresar resultados */}
                                <div className="mt-2">
                                  <label className="form-label small mb-1">Ingresar Resultado:</label>
                                  <div className="d-flex gap-2 align-items-center">
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="Local"
                                      value={resultados[partido.id]?.goles_local ?? ''}
                                      onChange={(e) => handleResultadoChange(partido.id, 'goles_local', e.target.value)}
                                      className="form-control form-control-sm text-center"
                                      style={{ width: '60px' }}
                                    />
                                    <span className="fw-bold">-</span>
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="Visita"
                                      value={resultados[partido.id]?.goles_visita ?? ''}
                                      onChange={(e) => handleResultadoChange(partido.id, 'goles_visita', e.target.value)}
                                      className="form-control form-control-sm text-center"
                                      style={{ width: '60px' }}
                                    />
                                  </div>
                                </div>
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

              {/* Botones para guardar/generar resultados */}
              {partidos.length > 0 && (
                <div className="mt-4 d-flex gap-2 flex-wrap">
                  <button
                    onClick={generarResultadosAleatorios}
                    className="btn btn-outline-info px-4"
                  >
                    🎲 Azar (0-4)
                  </button>
                  <button
                    onClick={resetearResultados}
                    className="btn btn-outline-secondary px-4"
                  >
                    🔄 Resetear
                  </button>
                  <button
                    onClick={guardarResultados}
                    disabled={loading}
                    className="btn btn-success px-4"
                  >
                    💾 Guardar Todos los Resultados
                  </button>
                </div>
              )}

              {/* Acciones de jornada */}
              <div className="mt-4 d-flex gap-3">
                <button
                  onClick={toggleJornada}
                  disabled={loading || (!jornadaCerrada && partidos.length === 0)}
                  className={`btn ${jornadaCerrada ? 'btn-success' : 'btn-warning'}`}
                >
                  {jornadaCerrada ? '🔓 Abrir' : '🔒 Cerrar'} Jornada {jornadaActual}
                </button>
              </div>
              </div>
              )}
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
    </>
  );
}
