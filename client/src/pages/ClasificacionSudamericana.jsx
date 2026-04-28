import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import FireworksEffect from '../components/FireworksEffect';
import NavegacionSudamericana from '../components/NavegacionSudamericana';
import { getLogoEquipo } from '../utils/sudamericanaLogos';

const API_URL = import.meta.env.VITE_API_URL;

export default function ClasificacionSudamericana() {
  const navigate = useNavigate();
  const [pronosticos, setPronosticos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [jornadaAbierta, setJornadaAbierta] = useState(false);
  const [participantes, setParticipantes] = useState([]);
  const [noParticipantes, setNoParticipantes] = useState([]);
  
  // Rankings
  const [rankingJornada, setRankingJornada] = useState([]);
  const [rankingAcumulado, setRankingAcumulado] = useState([]);
  const [mostrarActual, setMostrarActual] = useState(false);
  const [jornadaActual, setJornadaActual] = useState(null);
  
  // Filtros
  const [filtroNombre, setFiltroNombre] = useState('');
  const [filtroPartido, setFiltroPartido] = useState('');
  const [filtroJornada, setFiltroJornada] = useState('1');
  
  // Datos para los selectores
  const [partidos, setPartidos] = useState([]);
  const [jornadas, setJornadas] = useState([]);
  const [jugadores, setJugadores] = useState([]);
  
  // Ganadores de jornada
  const [ganadores, setGanadores] = useState(null);
  const [mostrarGanadores, setMostrarGanadores] = useState(false);
  const [calculandoGanadores, setCalculandoGanadores] = useState(false);
  
  // Ganadores acumulado
  const [ganadoresAcumulado, setGanadoresAcumulado] = useState(null);
  const [mostrarGanadoresAcumulado, setMostrarGanadoresAcumulado] = useState(false);
  const [calculandoGanadoresAcumulado, setCalculandoGanadoresAcumulado] = useState(false);

  // Clasificados J6
  const [clasificadosOficiales, setClasificadosOficiales] = useState([]);
  const [puntosClasificadosJ6, setPuntosClasificadosJ6] = useState([]);
  const [puntosClasificadosJ7, setPuntosClasificadosJ7] = useState([]);
  const [puntosClasificadosJ8, setPuntosClasificadosJ8] = useState([]);
  const [puntosClasificadosJ9, setPuntosClasificadosJ9] = useState([]);
  const [puntosClasificadosJ10, setPuntosClasificadosJ10] = useState([]);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [modalType, setModalType] = useState("success");

  useEffect(() => {
    // Verificar si es admin
    const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
    setEsAdmin(usuario.rol === 'admin');
    
    cargarDatosIniciales();
  }, []);

  useEffect(() => {
    // Solo cargar pronósticos si ya tenemos las jornadas cargadas
    if (jornadas.length > 0) {
      cargarPronosticos();
      // Cargar rankings siempre que haya jornadas
      if (filtroJornada && filtroJornada !== '') {
        cargarRankings();

        // Solo cargar ganadores si la jornada está cerrada
        const jornadaSel = jornadas.find(j => j.numero === parseInt(filtroJornada));
        if (jornadaSel?.cerrada) {
          cargarGanadoresJornada(parseInt(filtroJornada));
        } else {
          setGanadores(null);
        }
        
        // Si es jornada 6, 7, 8 o 9, cargar clasificados
        if (parseInt(filtroJornada) === 6 || parseInt(filtroJornada) === 7 || parseInt(filtroJornada) === 8 || parseInt(filtroJornada) === 9 || parseInt(filtroJornada) === 10) {
          cargarClasificados();
        }
      }
    }
    // Cargar ganadores acumulado siempre (no depende de filtro)
    cargarGanadoresAcumulado();
  }, [filtroNombre, filtroPartido, filtroJornada, jornadas.length]);

  // Resetear filtro de partido cuando cambia la jornada
  useEffect(() => {
    setFiltroPartido('');
  }, [filtroJornada]);

  // Recargar rankings cuando cambia el modo de visualización
  useEffect(() => {
    cargarRankings();
  }, [mostrarActual]);

  const cargarDatosIniciales = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        console.error('No hay token, redirigiendo a login');
        navigate('/login');
        return;
      }
      
      const headers = { Authorization: `Bearer ${token}` };

      // Cargar partidos, jornadas y jugadores en paralelo
      const [partidosRes, jornadasRes, jugadoresRes] = await Promise.all([
        axios.get(`${API_URL}/api/sudamericana-clasificacion/partidos`, { headers }),
        axios.get(`${API_URL}/api/sudamericana-clasificacion/jornadas`, { headers }),
        axios.get(`${API_URL}/api/sudamericana-clasificacion/jugadores`, { headers })
      ]);

      setPartidos(partidosRes.data);
      setJornadas(jornadasRes.data);
      setJugadores(jugadoresRes.data);
      
    } catch (error) {
      console.error('Error cargando datos iniciales:', error);
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.error('Token inválido o expirado, redirigiendo a login');
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        navigate('/login');
      }
    }
  };

  const cargarPronosticos = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Construir query params
      const params = new URLSearchParams();
      if (filtroNombre) params.append('usuario_id', filtroNombre);
      if (filtroPartido) params.append('partido_id', filtroPartido);
      if (filtroJornada) params.append('jornada_numero', filtroJornada);

      const response = await axios.get(
        `${API_URL}/api/sudamericana-clasificacion/pronosticos?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Si es J6, también cargar TODOS los pronósticos de J1-J6 para calcular tablas
      let pronosticosParaTablas = response.data;
      if (parseInt(filtroJornada) === 6) {
        const paramsTablas = new URLSearchParams();
        if (filtroNombre) paramsTablas.append('usuario_id', filtroNombre);
        // NO filtrar por jornada - queremos todas las jornadas 1-6
        
        const responseTablas = await axios.get(
          `${API_URL}/api/sudamericana-clasificacion/pronosticos?${paramsTablas.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        // Filtrar solo jornadas 1-6 para las tablas
        pronosticosParaTablas = responseTablas.data.filter(p => p.jornada.numero >= 1 && p.jornada.numero <= 6);
      }

      // Verificar si la jornada seleccionada está abierta (no cerrada)
      const jornadaSeleccionada = jornadas.find(j => j.numero === parseInt(filtroJornada));
      const estaAbierta = jornadaSeleccionada && !jornadaSeleccionada.cerrada;
      setJornadaAbierta(estaAbierta);

      // Si no es admin y la jornada está abierta, solo mostrar participantes
      if (!esAdmin && estaAbierta) {
        // Extraer usuarios únicos que tienen pronósticos
        const usuariosUnicos = [];
        const idsVistos = new Set();
        
        response.data.forEach(p => {
          if (!idsVistos.has(p.usuario.id)) {
            idsVistos.add(p.usuario.id);
            usuariosUnicos.push({
              id: p.usuario.id,
              nombre: p.usuario.nombre,
              foto_perfil: p.usuario.foto_perfil
            });
          }
        });
        
        setParticipantes(usuariosUnicos);
        const usuarioActual = JSON.parse(localStorage.getItem('usuario') || '{}');
        setPronosticos(response.data.filter(p => p.usuario.id === usuarioActual.id));

        // Obtener todos los usuarios activos en sudamericana para mostrar quién no ha subido pronósticos
        try {
          const todosRes = await fetch(`${API_URL}/api/usuarios`);
          const todosUsuarios = await todosRes.json();
          const usuariosSinPronosticos = todosUsuarios
            .filter(u => u.activo_sudamericana === true && !idsVistos.has(u.id) && u.rol !== 'admin')
            .map(u => ({ id: u.id, nombre: u.nombre, foto_perfil: u.foto_perfil || null }));
          setNoParticipantes(usuariosSinPronosticos);
        } catch (err) {
          console.error('Error cargando usuarios para no participantes:', err);
          setNoParticipantes([]);
        }
      } else {
        // Si es admin o la jornada está cerrada, mostrar pronósticos normalmente
        if (!esAdmin) {
          const pronosticosFiltrados = response.data.filter(p => p.jornada.cerrada === true);
          setPronosticos(pronosticosFiltrados);
        } else {
          setPronosticos(response.data);
        }
        setParticipantes([]);
        setNoParticipantes([]);
      }
      
      // Guardar pronósticos para tablas en el estado si es J6
      if (parseInt(filtroJornada) === 6) {
        // Crear un estado temporal para pasar a agruparPronosticos
        window.pronosticosParaTablas = pronosticosParaTablas;
      }
    } catch (error) {
      console.error('Error cargando pronósticos:', error);
    } finally {
      setLoading(false);
    }
  };

  const cargarRankings = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Usar backend para todas las jornadas
      if (mostrarActual) {
        const actualRes = await axios.get(
          `${API_URL}/api/sudamericana-rankings/actual`,
          { headers }
        );
        setJornadaActual(actualRes.data.jornada);
        setRankingAcumulado(actualRes.data.ranking);
        
        const jornadaRes = await axios.get(
          `${API_URL}/api/sudamericana-rankings/jornada/${actualRes.data.jornada}`,
          { headers }
        );
        setRankingJornada(jornadaRes.data);
      } else {
        const jornadaNum = filtroJornada || 1;
        const [jornadaRes, acumuladoRes] = await Promise.all([
          axios.get(`${API_URL}/api/sudamericana-rankings/jornada/${jornadaNum}`, { headers }),
          axios.get(`${API_URL}/api/sudamericana-rankings/acumulado/${jornadaNum}`, { headers })
        ]);
        setRankingJornada(jornadaRes.data);
        setRankingAcumulado(acumuladoRes.data);
      }
    } catch (error) {
      console.error('Error cargando rankings:', error);
    }
  };

  const cargarClasificados = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Cargar clasificados oficiales desde backend
      const oficialesRes = await axios.get(
        `${API_URL}/api/sudamericana-clasificados/clasificados-oficiales`,
        { headers }
      );
      setClasificadosOficiales(oficialesRes.data);

      // Cargar puntos de clasificación desde la base de datos
      const params6 = new URLSearchParams();
      params6.append('jornada_numero', '6');
      if (filtroNombre) params6.append('usuario_id', filtroNombre);

      const puntosRes6 = await axios.get(
        `${API_URL}/api/sudamericana-clasificacion/puntos-clasificacion?${params6.toString()}`,
        { headers }
      );
      setPuntosClasificadosJ6(puntosRes6.data);
      
      // Cargar puntos de clasificación de jornada 7 (Play-Offs)
      const params7 = new URLSearchParams();
      params7.append('jornada_numero', '7');
      if (filtroNombre) params7.append('usuario_id', filtroNombre);

      const puntosRes7 = await axios.get(
        `${API_URL}/api/sudamericana-clasificacion/puntos-clasificacion?${params7.toString()}`,
        { headers }
      );
      setPuntosClasificadosJ7(puntosRes7.data);
      
      // Cargar puntos de clasificación de jornada 8 (Octavos)
      const params8 = new URLSearchParams();
      params8.append('jornada_numero', '8');
      if (filtroNombre) params8.append('usuario_id', filtroNombre);

      const puntosRes8 = await axios.get(
        `${API_URL}/api/sudamericana-clasificacion/puntos-clasificacion?${params8.toString()}`,
        { headers }
      );
      setPuntosClasificadosJ8(puntosRes8.data);
      
      // Cargar puntos de clasificación de jornada 9 (Cuartos)
      const params9 = new URLSearchParams();
      params9.append('jornada_numero', '9');
      if (filtroNombre) params9.append('usuario_id', filtroNombre);

      const puntosRes9 = await axios.get(
        `${API_URL}/api/sudamericana-clasificacion/puntos-clasificacion?${params9.toString()}`,
        { headers }
      );
      setPuntosClasificadosJ9(puntosRes9.data);
      
      // Cargar puntos de clasificación de jornada 10 (Semifinales/Cuadro Final)
      const params10 = new URLSearchParams();
      params10.append('jornada_numero', '10');
      if (filtroNombre) params10.append('usuario_id', filtroNombre);

      const puntosRes10 = await axios.get(
        `${API_URL}/api/sudamericana-clasificacion/puntos-clasificacion?${params10.toString()}`,
        { headers }
      );
      setPuntosClasificadosJ10(puntosRes10.data);
    } catch (error) {
      console.error('Error cargando clasificados:', error);
      setClasificadosOficiales([]);
      setPuntosClasificadosJ6([]);
      setPuntosClasificadosJ7([]);
      setPuntosClasificadosJ8([]);
      setPuntosClasificadosJ9([]);
      setPuntosClasificadosJ10([]);
    }
  };

  const limpiarFiltros = () => {
    setFiltroNombre('');
    setFiltroPartido('');
    setFiltroJornada('');
  };

  const calcularPuntos = async () => {
    const mensaje = filtroJornada 
      ? `¿Calcular puntajes de la jornada ${filtroJornada}?`
      : "¿Calcular puntajes de todas las jornadas de Sudamericana?";
    
    if (!confirm(mensaje)) return;
    
    try {
      setCalculando(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/sudamericana-calcular/puntos`, {
        method: "POST",
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jornadaNumero: filtroJornada ? parseInt(filtroJornada) : null })
      });
      const data = await res.json();
      
      alert(data.mensaje || "✅ Puntajes calculados correctamente");
      
      // Recargar pronósticos y rankings
      await cargarPronosticos();
      await cargarRankings();
    } catch (error) {
      console.error("Error al calcular puntajes:", error);
      alert("❌ Error al calcular puntajes");
    } finally {
      setCalculando(false);
    }
  };

  const calcularClasificadosJ7 = async () => {
    if (!confirm('¿Calcular equipos clasificados de Play-Offs (J7)?\n\nSe determinarán los ganadores de cada cruce IDA/VUELTA y se asignarán puntos por clasificados acertados.')) {
      return;
    }

    try {
      setCalculando(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/sudamericana-calcular/clasificados-j7`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      
      if (data.success) {
        alert(`✅ ${data.mensaje}\n\n🏆 Clasificados oficiales: ${data.clasificados_oficiales}\n📊 Registros insertados: ${data.registros_insertados}`);
        
        // Recargar todo
        await cargarPronosticos();
        await cargarRankings();
        await cargarClasificados();
      } else {
        alert('❌ Error: ' + (data.error || 'No se pudo calcular'));
      }
    } catch (error) {
      console.error('Error calculando clasificados J7:', error);
      alert('❌ Error al calcular clasificados de Play-Offs');
    } finally {
      setCalculando(false);
    }
  };

  const calcularClasificadosJ8 = async () => {
    if (!confirm('¿Calcular equipos clasificados de Octavos (J8)?\n\nSe determinarán los ganadores de cada cruce IDA/VUELTA y se asignarán puntos por clasificados acertados.')) {
      return;
    }

    try {
      setCalculando(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/sudamericana-calcular/clasificados-j8`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      
      if (data.success) {
        alert(`✅ ${data.mensaje}\n\n🏆 Clasificados oficiales: ${data.clasificados_oficiales}\n📊 Registros insertados: ${data.registros_insertados}`);
        
        // Recargar todo
        await cargarPronosticos();
        await cargarRankings();
        await cargarClasificados();
      } else {
        alert('❌ Error: ' + (data.error || 'No se pudo calcular'));
      }
    } catch (error) {
      console.error('Error calculando clasificados J8:', error);
      alert('❌ Error al calcular clasificados de Octavos');
    } finally {
      setCalculando(false);
    }
  };

  const calcularClasificadosJ9 = async () => {
    if (!confirm('¿Calcular equipos clasificados de Cuartos (J9)?\n\nSe determinarán los ganadores de cada cruce IDA/VUELTA y se asignarán puntos por clasificados acertados.')) {
      return;
    }

    try {
      setCalculando(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/sudamericana-calcular/clasificados-j9`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const data = await res.json();
      
      if (data.success) {
        alert(`✅ ${data.mensaje}\n\n🏆 Clasificados oficiales: ${data.clasificados_oficiales}\n📊 Registros insertados: ${data.registros_insertados}`);
        
        // Recargar todo
        await cargarPronosticos();
        await cargarRankings();
        await cargarClasificados();
      } else {
        alert('❌ Error: ' + (data.error || 'No se pudo calcular'));
      }
    } catch (error) {
      console.error('Error calculando clasificados J9:', error);
      alert('❌ Error al calcular clasificados de Cuartos');
    } finally {
      setCalculando(false);
    }
  };

  const calcularGanadoresJornada = async () => {
    if (!filtroJornada) {
      alert('Por favor selecciona una jornada primero');
      return;
    }

    if (!confirm(`¿Calcular los ganadores de la jornada ${filtroJornada}?\n\nEsto determinará los jugadores con mayor puntaje en esta jornada y se añadirá a las notificaciones.`)) {
      return;
    }

    try {
      setCalculandoGanadores(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const response = await axios.post(
        `${API_URL}/api/sudamericana-ganadores-jornada/${filtroJornada}`,
        {},
        { headers }
      );

      setGanadores(response.data);
      setMostrarGanadores(true);
      
      // Notificar al hook global para que recargue las notificaciones pendientes
      window.dispatchEvent(new Event('nuevaNotificacion'));
      
      // Mostrar modal con resultado
      const pdfInfo = response.data.pdfGenerado 
        ? '\n\n📧 PDF enviado por email con:\n• Ganadores destacados con fotos\n• Ranking de la jornada\n• Ranking acumulado\n• Todos los pronósticos y resultados' 
        : '';
      
      setModalType("success");
      setModalMessage(`✅ ${response.data.mensaje}\n\n🔔 Notificación añadida para todos los usuarios\n• Ganadores de la jornada ${filtroJornada}\n• Visible en la página de inicio${pdfInfo}`);
      setShowModal(true);
      
      // Recargar rankings
      cargarRankings();
    } catch (error) {
      console.error('Error calculando ganadores:', error);
      setModalType("error");
      setModalMessage("❌ Error al calcular los ganadores\n\n" + (error.response?.data?.error || error.message || "Error desconocido"));
      setShowModal(true);
    } finally {
      setCalculandoGanadores(false);
    }
  };

  const cargarGanadoresJornada = async (jornadaNumero) => {
    try {
      const response = await axios.get(
        `${API_URL}/api/sudamericana-ganadores-jornada/${jornadaNumero}`
      );

      if (response.data.ganadores && Array.isArray(response.data.ganadores) && response.data.ganadores.length > 0) {
        setGanadores(response.data);
      } else {
        setGanadores(null);
      }
    } catch (error) {
      console.error('Error cargando ganadores:', error);
      setGanadores(null);
    }
  };

  const calcularGanadoresAcumulado = async () => {
    if (!confirm('¿Calcular el/los CAMPEÓN/CAMPEONES del ranking acumulado (TODAS LAS JORNADAS)?\n\nSe añadirá una notificación para todos los usuarios.')) {
      return;
    }

    try {
      setCalculandoGanadoresAcumulado(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const response = await axios.post(
        `${API_URL}/api/sudamericana-ganadores-jornada/acumulado`,
        {},
        { headers }
      );

      setGanadoresAcumulado(response.data);
      setMostrarGanadoresAcumulado(true);
      
      // Notificar al hook global para que recargue las notificaciones pendientes
      window.dispatchEvent(new Event('nuevaNotificacion'));
      
      // Mostrar modal con resultado
      setModalType("success");
      setModalMessage(`✅ ${response.data.mensaje}\n\n🔔 Notificación añadida para todos los usuarios\n• Campeón del ranking acumulado\n• Visible en la página de inicio`);
      setShowModal(true);
      
      // Recargar rankings
      cargarRankings();
    } catch (error) {
      console.error('Error calculando ganadores acumulado:', error);
      setModalType("error");
      setModalMessage('❌ Error al calcular el campeón del ranking acumulado\n\n' + (error.response?.data?.error || error.message || "Error desconocido"));
      setShowModal(true);
    } finally {
      setCalculandoGanadoresAcumulado(false);
    }
  };

  const cargarGanadoresAcumulado = async () => {
    try {
      // REPLICAR LÓGICA DEL PDF: Obtener datos directamente del ranking acumulado, no de la tabla de ganadores
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const rankingResponse = await axios.get(
        `${API_URL}/api/sudamericana-puntuacion/ranking-acumulado`,
        { headers }
      );

      if (rankingResponse.data && rankingResponse.data.length > 0) {
        // Encontrar el puntaje máximo
        const puntajeMaximo = Math.max(...rankingResponse.data.map(u => parseInt(u.puntos_acumulados, 10)));
        
        // Obtener todos los ganadores con el puntaje máximo
        const ganadores = rankingResponse.data
          .filter(u => parseInt(u.puntos_acumulados, 10) === puntajeMaximo)
          .map(u => ({
            nombre: u.nombre,
            puntaje: parseInt(u.puntos_acumulados, 10),
            foto_perfil: u.foto_perfil
          }));
        
        setGanadoresAcumulado({
          ganadores: ganadores,
          mensaje: ganadores.length > 1 
            ? `¡Empate! ${ganadores.length} campeones comparten el primer lugar del ranking acumulado`
            : `¡${ganadores[0].nombre} es el campeón del ranking acumulado de la Sudamericana!`
        });
      } else {
        setGanadoresAcumulado(null);
      }
    } catch (error) {
      console.error('Error cargando ganadores acumulado:', error);
      setGanadoresAcumulado(null);
    }
  };

  const getResultadoClase = (pronostico) => {
    if (!pronostico || !pronostico.partido || !pronostico.partido.resultado) {
      return 'table-secondary';
    }
    
    const { partido, puntos } = pronostico;
    
    // Si no hay resultado aún
    if (partido.resultado.local === null || partido.resultado.visita === null) {
      return 'table-secondary';
    }

    // Si acertó
    if (puntos > 0) {
      return 'table-success';
    }

    // Si falló
    return 'table-danger';
  };

  const formatearNombreEquipo = (nombre, pais) => {
    if (!nombre) return '-';
    return pais ? `${nombre} (${pais})` : nombre;
  };

  // Calcular tabla virtual de un grupo basado en los pronósticos del usuario
  const calcularTablaVirtualUsuario = (pronosticos, grupoLetra) => {
    // Filtrar partidos del grupo
    const partidosGrupo = pronosticos.filter(p => 
      p.partido?.grupo === grupoLetra && !p.esClasificado
    );
    
    // Inicializar equipos
    const equipos = {};
    partidosGrupo.forEach(p => {
      const local = p.partido.local.nombre;
      const visita = p.partido.visita.nombre;
      
      if (!equipos[local]) {
        equipos[local] = { nombre: local, puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0 };
      }
      if (!equipos[visita]) {
        equipos[visita] = { nombre: visita, puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dif: 0 };
      }
      
      // Procesar solo si hay pronóstico
      if (p.pronostico?.local !== null && p.pronostico?.visita !== null) {
        equipos[local].pj++;
        equipos[visita].pj++;
        equipos[local].gf += p.pronostico.local;
        equipos[local].gc += p.pronostico.visita;
        equipos[visita].gf += p.pronostico.visita;
        equipos[visita].gc += p.pronostico.local;
        
        if (p.pronostico.local > p.pronostico.visita) {
          // Gana local
          equipos[local].puntos += 3;
          equipos[local].pg++;
          equipos[visita].pp++;
        } else if (p.pronostico.local < p.pronostico.visita) {
          // Gana visita
          equipos[visita].puntos += 3;
          equipos[visita].pg++;
          equipos[local].pp++;
        } else {
          // Empate
          equipos[local].puntos++;
          equipos[visita].puntos++;
          equipos[local].pe++;
          equipos[visita].pe++;
        }
      }
    });
    
    // Calcular diferencia de goles
    Object.values(equipos).forEach(e => {
      e.dif = e.gf - e.gc;
    });
    
    // Ordenar: puntos DESC, dif DESC, gf DESC, nombre ASC
    return Object.values(equipos).sort((a, b) => {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      if (b.dif !== a.dif) return b.dif - a.dif;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.nombre.localeCompare(b.nombre);
    });
  };

  // Agrupar pronósticos por jornada y jugador
  const agruparPronosticos = () => {
    if (filtroJornada) {
      // Si hay jornada seleccionada, agrupar solo por jugador
      const grupos = {};
      pronosticos.forEach(p => {
        const key = `${p.usuario.id}`;
        if (!grupos[key]) {
          grupos[key] = {
            usuario_id: p.usuario.id,
            jugador: p.usuario.nombre,
            foto_perfil: p.usuario.foto_perfil,
            jornada: p.jornada.numero,
            pronosticos: [],
            pronosticosTotales: [] // Para calcular tablas virtuales J6
          };
        }
        grupos[key].pronosticos.push(p);
      });
      
      // Para J6: Agregar pronosticosTotales (TODAS las jornadas 1-6)
      if (parseInt(filtroJornada) === 6 && window.pronosticosParaTablas) {
        window.pronosticosParaTablas.forEach(p => {
          const key = `${p.usuario.id}`;
          if (grupos[key]) {
            grupos[key].pronosticosTotales.push(p);
          }
        });
      } else {
        // Para otras jornadas, usar los pronósticos de la jornada actual
        pronosticos.forEach(p => {
          const key = `${p.usuario.id}`;
          if (grupos[key]) {
            grupos[key].pronosticosTotales.push(p);
          }
        });
      }
      
      // Si es jornada 6, agregar pronósticos de clasificados
      if (parseInt(filtroJornada) === 6 && clasificadosOficiales.length > 0) {
        Object.values(grupos).forEach(grupo => {
          // Para cada usuario, calcular tablas virtuales de TODOS los grupos (A-H)
          const gruposLetras = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
          
          gruposLetras.forEach(grupoLetra => {
            // Calcular tabla virtual del usuario para este grupo usando TODOS los pronósticos
            const tablaVirtual = calcularTablaVirtualUsuario(grupo.pronosticosTotales, grupoLetra);
            
            // Solo agregar si hay equipos en la tabla (el usuario hizo pronósticos para este grupo)
            if (tablaVirtual.length >= 2) {
              // Obtener clasificados oficiales del grupo (1ero y 2do)
              const primerOficial = clasificadosOficiales.find(c => c.grupo === grupoLetra && c.posicion === 1);
              const segundoOficial = clasificadosOficiales.find(c => c.grupo === grupoLetra && c.posicion === 2);
              
              // Top 2 del usuario
              const primeroUsuario = tablaVirtual[0].nombre;
              const segundoUsuario = tablaVirtual.length >= 2 ? tablaVirtual[1].nombre : null;
              
              // Obtener puntos REALES desde la base de datos
              const puntoOctavosDB = puntosClasificadosJ6.find(p => {
                const coincide = p.usuario_id === grupo.usuario_id && 
                  p.fase_clasificado.includes('OCTAVOS') && 
                  p.fase_clasificado.includes(`GRUPO_${grupoLetra}`);
                return coincide;
              });
              
              const puntoPlayoffsDB = puntosClasificadosJ6.find(p => {
                const coincide = p.usuario_id === grupo.usuario_id && 
                  p.fase_clasificado.includes('PLAYOFFS') && 
                  p.fase_clasificado.includes(`GRUPO_${grupoLetra}`);
                return coincide;
              });
              
              // Usar puntos de BD si existen, sino 0
              const puntosOctavos = puntoOctavosDB?.puntos || 0;
              const puntosPlayoffs = puntoPlayoffsDB?.puntos || 0;
              
              // Agregar fila para 1er lugar (Octavos)
              grupo.pronosticos.push({
                id: `clasif-octavos-${grupo.usuario_id}-${grupoLetra}`,
                esClasificado: true,
                tipoClasificado: 'octavos',
                usuario: { id: grupo.usuario_id, nombre: grupo.jugador },
                jornada: { numero: 6, cerrada: true },
                partido: {
                  grupo: grupoLetra,
                  local: { nombre: `Clasificado a Octavos de Sudamericana del Grupo ${grupoLetra}` },
                  visita: { nombre: '' }
                },
                equipo_pronosticado: primeroUsuario,
                equipo_oficial: primerOficial?.equipo_nombre || null,
                puntos: puntosOctavos
              });
              
              // Agregar fila para 2do lugar (Playoffs)
              grupo.pronosticos.push({
                id: `clasif-playoffs-${grupo.usuario_id}-${grupoLetra}`,
                esClasificado: true,
                tipoClasificado: 'playoffs',
                usuario: { id: grupo.usuario_id, nombre: grupo.jugador },
                jornada: { numero: 6, cerrada: true },
                partido: {
                  grupo: grupoLetra,
                  local: { nombre: `Clasificado a Playoffs Sudamericana del Grupo ${grupoLetra}` },
                  visita: { nombre: '' }
                },
                equipo_pronosticado: segundoUsuario,
                equipo_oficial: segundoOficial?.equipo_nombre || null,
                puntos: puntosPlayoffs
              });
            }
          });
        });
      }
      
      // Si es jornada 7 (Play-Offs), agregar pronósticos de clasificados a Octavos
      if (parseInt(filtroJornada) === 7 && puntosClasificadosJ7.length > 0) {
        Object.values(grupos).forEach(grupo => {
          // Para cada usuario, obtener los puntos por equipos clasificados desde la BD
          const puntosUsuario = puntosClasificadosJ7.filter(p => p.usuario_id === grupo.usuario_id);
          
          // Agregar una fila por cada clasificado (solo los que están en BD)
          puntosUsuario.forEach(punto => {
            grupo.pronosticos.push({
              id: `clasif-octavos-j7-${punto.id}`,
              esClasificado: true,
              tipoClasificado: 'octavos',
              usuario: { id: grupo.usuario_id, nombre: grupo.jugador },
              jornada: { numero: 7, cerrada: true },
              partido: {
                grupo: 'Clasificados',
                local: { nombre: `Equipo clasificado a Octavos desde Play-Offs` },
                visita: { nombre: '' }
              },
              equipo_pronosticado: punto.equipo_clasificado || 'N/A',
              equipo_oficial: punto.equipo_oficial || null,
              puntos: punto.puntos || 0
            });
          });
        });
      }
      
      // Si es jornada 8 (Octavos), agregar pronósticos de clasificados a Cuartos
      if (parseInt(filtroJornada) === 8 && puntosClasificadosJ8.length > 0) {
        Object.values(grupos).forEach(grupo => {
          // Para cada usuario, obtener los puntos por equipos clasificados desde la BD
          const puntosUsuario = puntosClasificadosJ8.filter(p => p.usuario_id === grupo.usuario_id);
          
          // Agregar una fila por cada clasificado (solo los que están en BD)
          puntosUsuario.forEach(punto => {
            grupo.pronosticos.push({
              id: `clasif-cuartos-j8-${punto.id}`,
              esClasificado: true,
              tipoClasificado: 'cuartos',
              usuario: { id: grupo.usuario_id, nombre: grupo.jugador },
              jornada: { numero: 8, cerrada: true },
              partido: {
                grupo: 'Clasificados',
                local: { nombre: `Equipo clasificado a Cuartos desde Octavos` },
                visita: { nombre: '' }
              },
              equipo_pronosticado: punto.equipo_clasificado || 'N/A',
              equipo_oficial: punto.equipo_oficial || null,
              puntos: punto.puntos || 0
            });
          });
        });
      }
      
      // Si es jornada 9 (Cuartos), agregar pronósticos de clasificados a Semifinales
      if (parseInt(filtroJornada) === 9 && puntosClasificadosJ9.length > 0) {
        Object.values(grupos).forEach(grupo => {
          // Para cada usuario, obtener los puntos por equipos clasificados desde la BD
          const puntosUsuario = puntosClasificadosJ9.filter(p => p.usuario_id === grupo.usuario_id);
          
          // Agregar una fila por cada clasificado (solo los que están en BD)
          puntosUsuario.forEach(punto => {
            grupo.pronosticos.push({
              id: `clasif-semifinales-j9-${punto.id}`,
              esClasificado: true,
              tipoClasificado: 'semifinales',
              usuario: { id: grupo.usuario_id, nombre: grupo.jugador },
              jornada: { numero: 9, cerrada: true },
              partido: {
                grupo: 'Clasificados',
                local: { nombre: `Equipo clasificado a Semifinales desde Cuartos` },
                visita: { nombre: '' }
              },
              equipo_pronosticado: punto.equipo_clasificado || 'N/A',
              equipo_oficial: punto.equipo_oficial || null,
              puntos: punto.puntos || 0
            });
          });
        });
      }
      
      // Para J10: NO sobrescribir partido.local/visita.nombre - mantener valores reales de BD
      // Los valores pronosticados están en final_virtual_local/visita
      
      // Ordenar pronósticos dentro de cada grupo
      Object.values(grupos).forEach(grupo => {
        grupo.pronosticos.sort((a, b) => {
          // Las filas de clasificados van siempre al final, ordenadas por grupo
          if (a.esClasificado && !b.esClasificado) return 1;
          if (!a.esClasificado && b.esClasificado) return -1;
          if (a.esClasificado && b.esClasificado) {
            // Ordenar clasificados por grupo (A-H)
            if (a.partido.grupo !== b.partido.grupo) {
              return a.partido.grupo.localeCompare(b.partido.grupo);
            }
            // Dentro del mismo grupo: octavos primero, luego playoffs
            const tipoOrden = { 'octavos': 1, 'playoffs': 2 };
            const ordenA = tipoOrden[a.tipoClasificado] || 999;
            const ordenB = tipoOrden[b.tipoClasificado] || 999;
            return ordenA - ordenB;
          }
          
          // Para otras jornadas, ordenar por fecha de partido
          return new Date(a.partido.fecha) - new Date(b.partido.fecha);
        });
        
        // CALCULAR Y GUARDAR EL PUNTAJE TOTAL DEL GRUPO (incluyendo clasificados)
        grupo.puntaje_total = grupo.pronosticos.reduce((sum, p) => sum + (p.puntos || 0), 0);
        
        // Agregar clasificación para jornadas específicas
        if (parseInt(filtroJornada) === 10) {
          grupo.clasificacion = puntosClasificadosJ10.filter(p => p.usuario_id === grupo.usuario_id);
        } else if (parseInt(filtroJornada) === 9) {
          grupo.clasificacion = puntosClasificadosJ9.filter(p => p.usuario_id === grupo.usuario_id);
        } else if (parseInt(filtroJornada) === 8) {
          grupo.clasificacion = puntosClasificadosJ8.filter(p => p.usuario_id === grupo.usuario_id);
        } else if (parseInt(filtroJornada) === 7) {
          grupo.clasificacion = puntosClasificadosJ7.filter(p => p.usuario_id === grupo.usuario_id);
        }
      });
      
      return Object.values(grupos);
    } else {
      // Si no hay jornada, agrupar por jornada y jugador
      const grupos = {};
      pronosticos.forEach(p => {
        const key = `${p.jornada.numero}-${p.usuario.id}`;
        if (!grupos[key]) {
          grupos[key] = {
            jugador: p.usuario.nombre,
            jornada: p.jornada.numero,
            pronosticos: []
          };
        }
        grupos[key].pronosticos.push(p);
      });
      return Object.values(grupos).sort((a, b) => {
        if (a.jornada !== b.jornada) return b.jornada - a.jornada;
        return a.jugador.localeCompare(b.jugador);
      });
    }
  };

  return (
    <div className="container mt-4">
      <div className="text-center mb-4">
        <h1 className="display-5 fw-bold">📋 Clasificación - Pronósticos Sudamericana</h1>
        <p className="text-muted">Visualiza todos los pronósticos entregados por los jugadores</p>
      </div>

      {/* Botonera Principal */}
      <NavegacionSudamericana />

      {/* Mostrar ganadores guardados si existen (sin modal) */}
      {ganadores && Array.isArray(ganadores.ganadores) && ganadores.ganadores.length > 0 && !mostrarGanadores && (
        <div className="alert alert-info text-center mb-4">
          <h5 className="mb-3">
            🏆 {ganadores.ganadores.length === 1 ? 'Ganador' : 'Ganadores'} de la Jornada {ganadores.jornadaNumero}
          </h5>
          <div className="d-flex justify-content-center gap-3 flex-wrap">
            {ganadores.ganadores.map((ganador, index) => (
              <div key={index} className="text-center">
                {ganador.foto_perfil && (
                  <img
                    src={ganador.foto_perfil}
                    alt={ganador.nombre}
                    className="rounded-circle mb-2"
                    style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                    onError={(e) => { e.target.src = '/perfil/default.png'; }}
                  />
                )}
                <p className="mb-0 fw-bold">{ganador.nombre}</p>
                <span className="badge bg-warning text-dark">{parseInt(ganador.puntaje) || 0} puntos</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botón Calcular Puntos (Solo Admin) */}
      {esAdmin && (
        <div className="mb-4 text-center">
          <button 
            className="btn btn-success btn-lg px-5 me-3"
            onClick={calcularPuntos}
            disabled={calculando}
          >
            {calculando ? '⏳ Calculando...' : '🧮 Calcular Puntos'}
          </button>
          
          {/* Botón específico para calcular clasificados de J7 */}
          {parseInt(filtroJornada) === 7 && (
            <button 
              className="btn btn-warning btn-lg px-5"
              onClick={calcularClasificadosJ7}
              disabled={calculando}
            >
              {calculando ? '⏳ Calculando...' : '🏆 Calcular Clasificados J7'}
            </button>
          )}
          
          {/* Botón específico para calcular clasificados de J8 */}
          {parseInt(filtroJornada) === 8 && (
            <button 
              className="btn btn-info btn-lg px-5"
              onClick={calcularClasificadosJ8}
              disabled={calculando}
            >
              {calculando ? '⏳ Calculando...' : '🏆 Calcular Clasificados J8'}
            </button>
          )}
          
          {/* Botón específico para calcular clasificados de J9 */}
          {parseInt(filtroJornada) === 9 && (
            <button 
              className="btn btn-success btn-lg px-5"
              onClick={calcularClasificadosJ9}
              disabled={calculando}
            >
              {calculando ? '⏳ Calculando...' : '🏆 Calcular Clasificados J9'}
            </button>
          )}
          
          <p className="text-muted mt-2 mb-0">
            <small>Calcula puntos por partidos{parseInt(filtroJornada) === 7 ? ' y equipos clasificados desde Play-Offs' : parseInt(filtroJornada) === 8 ? ' y equipos clasificados desde Octavos' : parseInt(filtroJornada) === 9 ? ' y equipos clasificados desde Cuartos' : parseInt(filtroJornada) === 10 ? ' y Cuadro Final (Campeón y Subcampeón)' : ''}</small>
          </p>
        </div>
      )}

      {/* Mensaje informativo para usuarios */}
      {!esAdmin && (
        <div className="alert alert-info mb-4">
          <strong>ℹ️ Información:</strong> Solo puedes ver los pronósticos de las jornadas cerradas.
        </div>
      )}

      {/* Filtros */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h5 className="card-title mb-3">🔍 Filtros</h5>
          <div className="row g-3">
            {/* Filtro por Nombre */}
            <div className="col-12 col-md-4">
              <label className="form-label fw-bold">Por Jugador</label>
              <select
                className="form-select"
                value={filtroNombre}
                onChange={(e) => setFiltroNombre(e.target.value)}
              >
                <option value="">Todos los jugadores</option>
                {jugadores.map(jugador => (
                  <option key={jugador.id} value={jugador.id}>
                    {jugador.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro por Jornada */}
            <div className="col-12 col-md-4">
              <label className="form-label fw-bold">Por Jornada</label>
              <select
                className="form-select"
                value={filtroJornada}
                onChange={(e) => setFiltroJornada(e.target.value)}
              >
                <option value="">Todas las jornadas</option>
                {jornadas.map(jornada => (
                  <option key={jornada.id} value={jornada.numero}>
                    {jornada.nombre} {jornada.cerrada ? '🔒 Cerrada' : '🔓 Abierta'}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro por Partido */}
            <div className="col-12 col-md-4">
              <label className="form-label fw-bold">Por Partido</label>
              <select
                className="form-select"
                value={filtroPartido}
                onChange={(e) => setFiltroPartido(e.target.value)}
              >
                <option value="">Todos los partidos</option>
                {partidos
                  .filter(partido => !filtroJornada || partido.jornada_numero === parseInt(filtroJornada))
                  .map(partido => (
                  <option key={partido.id} value={partido.id}>
                    {formatearNombreEquipo(partido.nombre_local, partido.pais_local)} vs{' '}
                    {formatearNombreEquipo(partido.nombre_visita, partido.pais_visita)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Botones de acciones */}
          <div className="text-center mt-3">
            <button 
              className="btn btn-outline-secondary"
              onClick={limpiarFiltros}
            >
              🔄 Limpiar Filtros
            </button>
            
            {/* Botón Calcular Ganadores - Solo admin con jornada seleccionada */}
            {esAdmin && (
              <>
                {/* Botón Calcular Ganadores Jornada - Solo si hay jornada seleccionada */}
                {filtroJornada && (
                  <button
                    className="btn btn-success ms-2"
                    onClick={calcularGanadoresJornada}
                    disabled={calculandoGanadores}
                  >
                    {calculandoGanadores ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Calculando...
                      </>
                    ) : (
                      <>🏆 Calcular Ganadores Jornada</>
                    )}
                  </button>
                )}
                
                {/* Botón Ganador Ranking Acumulado - Siempre disponible */}
                <button
                  className="btn btn-warning text-dark fw-bold ms-2"
                  onClick={calcularGanadoresAcumulado}
                  disabled={calculandoGanadoresAcumulado}
                >
                  {calculandoGanadoresAcumulado ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Calculando...
                    </>
                  ) : (
                    <>👑 Ganador Ranking Acumulado</>
                  )}
                </button>
              </>
            )}
          </div>

          {/* Botones de acceso directo a Rankings */}
          <div className="d-flex justify-content-center gap-2 mt-3">
            <button
              className="btn btn-primary"
              onClick={() => document.getElementById('ranking-jornada')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              🏆 Ir a Ranking Jornada
            </button>
            <button
              className="btn btn-success"
              onClick={() => document.getElementById('ranking-acumulado')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              📊 Ir a Ranking Acumulado
            </button>
          </div>
        </div>
      </div>

      {/* Resultados */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-success" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
        </div>
      ) : (
        <>
          {/* Sección participantes - visible cuando jornada está abierta y no es admin */}
          {!esAdmin && jornadaAbierta && (
            <div className="mb-4">
              <div className="alert alert-info text-center">
                <h5>⏳ Jornada Abierta</h5>
                <p className="mb-0">Puedes ver tus propios pronósticos abajo. Los de los demás estarán disponibles cuando se cierre la jornada.</p>
              </div>

          {participantes.length > 0 && (
            <div className="card mb-3">
              <div className="card-header bg-primary text-white">
                <h5 className="mb-0">✅ Participantes que ya subieron sus pronósticos ({participantes.length})</h5>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  {participantes.map((participante) => (
                    <div key={participante.id} className="col-6 col-md-4 col-lg-3">
                      <div className="card h-100 shadow-sm">
                        <div className="card-body text-center p-2">
                          {participante.foto_perfil ? (
                            <img
                              src={participante.foto_perfil.startsWith('/') ? participante.foto_perfil : `/perfil/${participante.foto_perfil}`}
                              alt={participante.nombre}
                              className="rounded-circle mb-2"
                              style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                              onError={(e) => { e.target.src = '/perfil/default.png'; }}
                            />
                          ) : (
                            <div
                              className="rounded-circle bg-secondary d-flex align-items-center justify-content-center mb-2 mx-auto"
                              style={{ width: '60px', height: '60px' }}
                            >
                              <span className="text-white fs-4">{(participante.nombre || 'U').charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <p className="mb-0 small fw-bold">{participante.nombre}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {noParticipantes.length > 0 && (
            <div className="card">
              <div className="card-header bg-warning text-dark">
                <h5 className="mb-0">⏳ Participantes que AÚN NO han ingresado pronósticos ({noParticipantes.length})</h5>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  {noParticipantes.map((p) => (
                    <div key={p.id} className="col-6 col-md-4 col-lg-3">
                      <div className="card h-100 shadow-sm border-warning">
                        <div className="card-body text-center p-2">
                          {p.foto_perfil ? (
                            <img
                              src={p.foto_perfil.startsWith('/') ? p.foto_perfil : `/perfil/${p.foto_perfil}`}
                              alt={p.nombre}
                              className="rounded-circle mb-2 opacity-50"
                              style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                              onError={(e) => { e.target.src = '/perfil/default.png'; }}
                            />
                          ) : (
                            <div
                              className="rounded-circle bg-warning d-flex align-items-center justify-content-center mb-2 mx-auto opacity-50"
                              style={{ width: '60px', height: '60px' }}
                            >
                              <span className="text-dark fs-4">{(p.nombre || 'U').charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <p className="mb-0 small fw-bold text-muted">{p.nombre}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
            </div>
          )}

          {pronosticos.length === 0 ? (
            <div className="alert alert-info text-center">
              {!esAdmin && jornadaAbierta
                ? 'Aún no tienes pronósticos ingresados para esta jornada.'
                : 'No se encontraron pronósticos con los filtros aplicados'}
            </div>
          ) : (
            <>
          <div className="alert alert-info d-flex justify-content-between align-items-center">
            <span>Total de pronósticos: <strong>{pronosticos.length}</strong></span>
            <div>
              <span className="badge bg-success me-2">✓ Acertado</span>
              <span className="badge bg-danger me-2">✗ Fallado</span>
              <span className="badge bg-secondary">⏳ Pendiente</span>
            </div>
          </div>

          <div className="table-responsive">
            {/* Para Jornada 6, 7 y 8: separar en dos tablas */}
            {(parseInt(filtroJornada) === 6 || parseInt(filtroJornada) === 7 || parseInt(filtroJornada) === 8 || parseInt(filtroJornada) === 9 || parseInt(filtroJornada) === 10) ? (
              <>
                {agruparPronosticos().map((grupo, grupoIndex) => {
                  // Separar pronósticos en partidos y clasificados
                  const pronosticosPartidos = grupo.pronosticos.filter(p => !p.esClasificado);
                  const pronosticosClasificados = grupo.pronosticos.filter(p => p.esClasificado);
                  const puntosPartidos = pronosticosPartidos.reduce((sum, p) => sum + (p.puntos || 0), 0);
                  const puntosClasificados = pronosticosClasificados.reduce((sum, p) => sum + (p.puntos || 0), 0);
                  
                  return (
                    <React.Fragment key={`grupo-${grupo.usuario_id}-${grupoIndex}`}>
                      {/* TABLA DE PARTIDOS */}
                      <h5 className="mt-4 mb-3 text-success">⚽ Pronósticos de Partidos - {grupo.jugador}</h5>
                      <table className="table table-bordered table-hover">
                        <thead>
                          <tr>
                            <th colSpan={6} className="py-2 text-center" style={{ background: '#000000' }}>
                              <div className="d-flex align-items-center justify-content-center gap-2">
                                <img
                                  src={grupo.foto_perfil || '/perfil/default.png'}
                                  alt={grupo.jugador}
                                  className="rounded-circle"
                                  style={{ width: '35px', height: '35px', objectFit: 'cover' }}
                                  onError={(e) => { e.target.src = '/perfil/default.png'; }}
                                />
                                <span className="fw-bold fs-5 text-white">Jugador: {grupo.jugador}</span>
                              </div>
                            </th>
                          </tr>
                          <tr className="table-dark">
                            <th className="text-center" style={{ width: '80px' }}>Grupo</th>
                            <th className="text-center">Partido</th>
                            <th className="text-center" style={{ width: '100px' }}>Pronóstico</th>
                            <th className="text-center" style={{ width: '100px' }}>Resultado</th>
                            <th className="text-center" style={{ width: '60px' }}>Bonus</th>
                            <th className="text-center" style={{ width: '80px' }}>Puntos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pronosticosPartidos.map((pronostico, index) => (
                            <tr key={`partido-${pronostico.id}-${index}`} className={getResultadoClase(pronostico)}>
                              <td className="text-center">
                                {pronostico.partido?.grupo ? (
                                  <span className="badge bg-info">Grupo {pronostico.partido.grupo}</span>
                                ) : parseInt(filtroJornada) === 7 ? (
                                  <div className="d-flex flex-column gap-1">
                                    <span className="badge bg-warning text-dark">Play-Offs</span>
                                    <span className="badge bg-secondary">{pronostico.partido?.id % 2 === 1 ? 'IDA' : 'VUELTA'}</span>
                                  </div>
                                ) : parseInt(filtroJornada) === 8 ? (
                                  <div className="d-flex flex-column gap-1">
                                    <span className="badge bg-primary">Octavos</span>
                                    <span className="badge bg-secondary">{pronostico.partido?.id % 2 === 1 ? 'IDA' : 'VUELTA'}</span>
                                  </div>
                                ) : parseInt(filtroJornada) === 9 ? (
                                  <div className="d-flex flex-column gap-1">
                                    <span className="badge bg-success">Cuartos</span>
                                    <span className="badge bg-secondary">{pronostico.partido?.id % 2 === 1 ? 'IDA' : 'VUELTA'}</span>
                                  </div>
                                ) : parseInt(filtroJornada) === 10 ? (
                                  pronostico.partido?.tipo_partido === 'FINAL' ? (
                                    <span className="badge bg-warning text-dark">🏆 Final</span>
                                  ) : pronostico.partido?.tipo_partido === 'IDA' || pronostico.partido?.tipo_partido === 'VUELTA' ? (
                                    <div className="d-flex flex-column gap-1">
                                      <span className="badge bg-danger">
                                        {filtroJornada === 7 ? 'Play-Offs' : 
                                         filtroJornada === 8 ? 'Octavos' : 
                                         filtroJornada === 9 ? 'Cuartos' : 
                                         'Semifinales'}
                                      </span>
                                      <span className="badge bg-secondary">{pronostico.partido.tipo_partido}</span>
                                    </div>
                                  ) : (
                                    <span className="badge bg-danger">
                                      {filtroJornada === 7 ? 'Play-Offs' : 
                                       filtroJornada === 8 ? 'Octavos' : 
                                       filtroJornada === 9 ? 'Cuartos' : 
                                       'Semifinales'}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td>
                                <div className="d-flex flex-column align-items-center">
                                  {/* Primera línea: PRONOSTICADO (grande) */}
                                  <div className="d-flex justify-content-center align-items-center gap-2 w-100">
                                    <div className="d-flex align-items-center justify-content-end gap-2" style={{flex: 1}}>
                                      <small className="fw-bold text-end">
                                        {pronostico.partido?.tipo_partido === 'FINAL' && pronostico.final_virtual_local
                                          ? formatearNombreEquipo(pronostico.final_virtual_local, null)
                                          : formatearNombreEquipo(pronostico.partido?.local?.nombre, pronostico.partido?.local?.pais)
                                        }
                                      </small>
                                      {((pronostico.partido?.tipo_partido === 'FINAL' && pronostico.final_virtual_local && getLogoEquipo(pronostico.final_virtual_local)) || 
                                        (pronostico.partido?.local?.nombre && getLogoEquipo(pronostico.partido.local.nombre))) && (
                                        <img 
                                          src={pronostico.partido?.tipo_partido === 'FINAL' && pronostico.final_virtual_local
                                            ? getLogoEquipo(pronostico.final_virtual_local)
                                            : getLogoEquipo(pronostico.partido.local.nombre)
                                          }
                                          alt={pronostico.partido?.tipo_partido === 'FINAL' && pronostico.final_virtual_local
                                            ? pronostico.final_virtual_local
                                            : pronostico.partido.local.nombre
                                          }
                                          style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                                          onError={(e) => e.target.style.display = 'none'}
                                        />
                                      )}
                                    </div>
                                    <span className="text-muted">vs</span>
                                    <div className="d-flex align-items-center justify-content-start gap-2" style={{flex: 1}}>
                                      {((pronostico.partido?.tipo_partido === 'FINAL' && pronostico.final_virtual_visita && getLogoEquipo(pronostico.final_virtual_visita)) || 
                                        (pronostico.partido?.visita?.nombre && getLogoEquipo(pronostico.partido.visita.nombre))) && (
                                        <img 
                                          src={pronostico.partido?.tipo_partido === 'FINAL' && pronostico.final_virtual_visita
                                            ? getLogoEquipo(pronostico.final_virtual_visita)
                                            : getLogoEquipo(pronostico.partido.visita.nombre)
                                          }
                                          alt={pronostico.partido?.tipo_partido === 'FINAL' && pronostico.final_virtual_visita
                                            ? pronostico.final_virtual_visita
                                            : pronostico.partido.visita.nombre
                                          }
                                          style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                                          onError={(e) => e.target.style.display = 'none'}
                                        />
                                      )}
                                      <small className="fw-bold text-start">
                                        {pronostico.partido?.tipo_partido === 'FINAL' && pronostico.final_virtual_visita
                                          ? formatearNombreEquipo(pronostico.final_virtual_visita, null)
                                          : formatearNombreEquipo(pronostico.partido?.visita?.nombre, pronostico.partido?.visita?.pais)
                                        }
                                      </small>
                                    </div>
                                  </div>
                                  {/* Segunda línea: REAL (pequeña) */}
                                  {pronostico.partido?.tipo_partido === 'FINAL' && pronostico.final_virtual_local && (
                                    <div className="mt-1">
                                      <small className="fst-italic text-muted" style={{fontSize: '0.75rem'}}>
                                        <strong>Real:</strong> {pronostico.partido.local.nombre} vs {pronostico.partido.visita.nombre}
                                        {pronostico.partido?.resultado?.local !== null && (
                                          <>
                                            {' - '}
                                            <span className={pronostico.final_virtual_local === pronostico.partido.local.nombre && pronostico.final_virtual_visita === pronostico.partido.visita.nombre ? 'text-success fw-bold' : 'text-danger fw-bold'}>
                                              {pronostico.final_virtual_local === pronostico.partido.local.nombre && pronostico.final_virtual_visita === pronostico.partido.visita.nombre ? '✓ Coincide' : '✗ No coincide'}
                                            </span>
                                          </>
                                        )}
                                      </small>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="text-center fw-bold fs-5">
                                {pronostico.pronostico?.local !== undefined && pronostico.pronostico?.visita !== undefined ? (
                                  <>{pronostico.pronostico.local} - {pronostico.pronostico.visita}</>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td className="text-center fw-bold fs-5">
                                {pronostico.partido?.resultado?.local !== null && pronostico.partido?.resultado?.visita !== null ? (
                                  <>{pronostico.partido.resultado.local} - {pronostico.partido.resultado.visita}</>
                                ) : (
                                  <span className="text-muted">Pendiente</span>
                                )}
                              </td>
                              <td className="text-center fw-bold">
                                <span className={pronostico.partido?.bonus && pronostico.partido.bonus > 1 ? "badge bg-info text-white" : "text-muted"}>
                                  x{pronostico.partido?.bonus || 1}
                                </span>
                              </td>
                              <td className="text-center fw-bold">
                                {pronostico.puntos !== null && pronostico.puntos !== undefined ? (
                                  <span className="badge bg-warning text-dark fs-6">
                                    {pronostico.puntos} pts
                                  </span>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                          {/* TOTAL PARTIDOS */}
                          <tr className="table-dark fw-bold">
                            <td colSpan="5" className="text-end">TOTAL PARTIDOS:</td>
                            <td className="text-center">
                              <span className="badge bg-dark fs-5">{puntosPartidos} pts</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      
                      {/* TABLA DE CLASIFICACIÓN */}
                      {(pronosticosClasificados.length > 0 || parseInt(filtroJornada) === 10) && (
                        <>
                          <h5 className="mt-4 mb-3 text-success">⚡ Equipos Clasificados - {grupo.jugador}</h5>
                          <table className="table table-bordered table-hover">
                            <thead>
                              <tr>
                                <th colSpan={5} className="py-2 text-center" style={{ background: '#000000' }}>
                                  <div className="d-flex align-items-center justify-content-center gap-2">
                                    <img
                                      src={grupo.foto_perfil || '/perfil/default.png'}
                                      alt={grupo.jugador}
                                      className="rounded-circle"
                                      style={{ width: '35px', height: '35px', objectFit: 'cover' }}
                                      onError={(e) => { e.target.src = '/perfil/default.png'; }}
                                    />
                                    <span className="fw-bold fs-5 text-white">Jugador: {grupo.jugador}</span>
                                  </div>
                                </th>
                              </tr>
                              <tr className="table-dark">
                                <th className="text-center" style={{ width: '80px' }}>Grupo</th>
                                <th className="text-center">Clasificación</th>
                                <th className="text-center" style={{ width: '150px' }}>Equipo Pronosticado</th>
                                <th className="text-center" style={{ width: '150px' }}>Equipo Real</th>
                                <th className="text-center" style={{ width: '80px' }}>Puntos</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pronosticosClasificados.length > 0 ? (
                                pronosticosClasificados.map((pronostico, index) => (
                                  <tr key={`clasif-${pronostico.id}-${index}`} className={pronostico.puntos > 0 ? 'table-success' : 'table-danger'}>
                                    <td className="text-center">
                                      <span className="badge bg-warning text-dark">{pronostico.partido.grupo}</span>
                                    </td>
                                    <td>
                                      <div className="fw-bold text-center">
                                        {pronostico.partido.local.nombre}
                                      </div>
                                    </td>
                                    <td className="text-center">
                                      <div className={`fw-bold ${pronostico.puntos > 0 ? 'text-success' : 'text-danger'}`}>
                                        {pronostico.equipo_pronosticado || '-'}
                                      </div>
                                    </td>
                                    <td className="text-center">
                                      <div className={`fw-bold ${pronostico.puntos > 0 ? 'text-success' : pronostico.equipo_oficial ? 'text-danger' : 'text-muted'}`}>
                                        {pronostico.equipo_oficial || 'Pendiente'}
                                      </div>
                                    </td>
                                    <td className="text-center">
                                      {pronostico.puntos > 0 ? (
                                        <span className="badge bg-success">+{pronostico.puntos} pts</span>
                                      ) : (
                                        <span className="badge bg-secondary">0 pts</span>
                                      )}
                                    </td>
                                  </tr>
                                ))
                              ) : parseInt(filtroJornada) === 10 ? (() => {
                                // Si no hay clasificación, mostrar mensaje
                                if (!grupo.clasificacion || grupo.clasificacion.length === 0) {
                                  return (
                                    <tr className="table-warning">
                                      <td colSpan="5" className="text-center">
                                        <em>Este usuario no ha completado sus pronósticos de la Jornada 10</em>
                                      </td>
                                    </tr>
                                  );
                                }
                                
                                // Mapear las clasificaciones: 2 finalistas + campeón + subcampeón
                                const finalistas = grupo.clasificacion.filter(c => c.fase_clasificado === 'FINALISTA');
                                const campeon = grupo.clasificacion.find(c => c.fase_clasificado === 'CAMPEON');
                                const subcampeon = grupo.clasificacion.find(c => c.fase_clasificado === 'SUBCAMPEON');
                                
                                const clasificacionesOrdenadas = [
                                  ...finalistas,
                                  campeon,
                                  subcampeon
                                ].filter(Boolean);

                                return clasificacionesOrdenadas.map((clasif, idx) => (
                                  <tr key={idx} className={clasif.puntos > 0 ? 'table-success' : 'table-danger'}>
                                    <td className="text-center">
                                      <span className="badge bg-warning text-dark">Clasificados</span>
                                    </td>
                                    <td className="text-center fw-bold">
                                      {clasif.fase_clasificado === 'FINALISTA' && '⚡ Clasificado a Final'}
                                      {clasif.fase_clasificado === 'CAMPEON' && '🏆 Campeón'}
                                      {clasif.fase_clasificado === 'SUBCAMPEON' && '🥈 Subcampeón'}
                                    </td>
                                    <td className="text-center">
                                      <div className="fw-bold text-primary">
                                        {clasif.equipo_clasificado}
                                      </div>
                                    </td>
                                    <td className="text-center">
                                      {clasif.equipo_oficial ? (
                                        <span className="badge bg-success">{clasif.equipo_oficial}</span>
                                      ) : (
                                        <span className="text-muted">Pendiente</span>
                                      )}
                                    </td>
                                    <td className="text-center">
                                      <span className={`badge ${clasif.puntos > 0 ? 'bg-success' : 'bg-secondary'}`}>
                                        {clasif.puntos > 0 ? `+${clasif.puntos}` : '0'} pts
                                      </span>
                                    </td>
                                  </tr>
                                ));
                              })() : (
                                // Para otras jornadas, mostrar clasificación normal
                                grupo.clasificacion && grupo.clasificacion.length > 0 ? (
                                  grupo.clasificacion.map((clasif, idx) => (
                                    <tr key={idx} className="table-light">
                                      <td className="text-center">
                                        {idx === 0 && <span className="badge bg-warning text-dark">Clasificados</span>}
                                      </td>
                                      <td className="text-center fw-bold">
                                        {clasif.fase_clasificado}
                                      </td>
                                      <td className="text-center">
                                        <div className="fw-bold text-primary">
                                          {clasif.equipo_clasificado}
                                        </div>
                                      </td>
                                      <td className="text-center">
                                        {clasif.equipo_oficial ? (
                                          <span className="badge bg-success">{clasif.equipo_oficial}</span>
                                        ) : (
                                          <span className="text-muted">Pendiente</span>
                                        )}
                                      </td>
                                      <td className="text-center">
                                        <span className={`badge ${clasif.puntos > 0 ? 'bg-success' : 'bg-secondary'}`}>
                                          {clasif.puntos} pts
                                        </span>
                                      </td>
                                    </tr>
                                  ))
                                ) : null
                              )}
                            </tbody>
                            <tfoot className="table-dark">
                              <tr>
                                <td colSpan="4" className="text-end fw-bold">TOTAL CLASIFICACIÓN:</td>
                                <td className="text-center">
                                  <span className="badge bg-dark fs-5">{puntosClasificados} pts</span>
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                          
                          {/* NOTA EXPLICATIVA */}
                          <div className="alert alert-warning d-flex align-items-center mb-4" role="alert">
                            <div>
                              <strong>ℹ️ Nota:</strong> Los puntos de clasificación NO suman al ranking de esta jornada, 
                              solo se agregan al ranking acumulado total.
                            </div>
                          </div>
                        </>
                      )}
                      
                      {/* Separador entre usuarios */}
                      {grupoIndex < agruparPronosticos().length - 1 && (
                        <hr className="my-4" style={{ borderTop: '3px solid #28a745' }} />
                      )}
                    </React.Fragment>
                  );
                })}
              </>
            ) : (
              /* Para otras jornadas: tabla única como antes */
              <table className="table table-bordered table-hover">
                <tbody>
                  {agruparPronosticos().map((grupo, grupoIndex) => (
                    <React.Fragment key={`grupo-${grupo.usuario_id}-${grupoIndex}`}>
                      {/* Encabezado con foto y nombre del jugador */}
                      <tr>
                        <td colSpan={6} className="py-2" style={{ background: '#000000' }}>
                          <div className="d-flex align-items-center justify-content-center gap-2">
                            <img
                              src={grupo.foto_perfil || '/perfil/default.png'}
                              alt={grupo.jugador}
                              className="rounded-circle"
                              style={{ width: '35px', height: '35px', objectFit: 'cover' }}
                              onError={(e) => { e.target.src = '/perfil/default.png'; }}
                            />
                            <span className="fw-bold fs-5 text-white">Jugador: {grupo.jugador}</span>
                          </div>
                        </td>
                      </tr>
                      {/* Cabeceras de columnas */}
                      <tr className="table-dark">
                        <th className="text-center" style={{ width: '80px' }}>Grupo</th>
                        <th className="text-center">Partido</th>
                        <th className="text-center" style={{ width: '100px' }}>Pronóstico</th>
                        <th className="text-center" style={{ width: '100px' }}>Resultado</th>
                        <th className="text-center" style={{ width: '60px' }}>Bonus</th>
                        <th className="text-center" style={{ width: '80px' }}>Puntos</th>
                      </tr>
                      {grupo.pronosticos.map((pronostico, index) => (
                      <React.Fragment key={`pronostico-${pronostico.id}-${index}`}>
                        {/* SI ES FILA DE CLASIFICADO - Renderizado especial */}
                        {pronostico.esClasificado ? (
                          <tr className={pronostico.puntos > 0 ? 'table-success' : 'table-danger'}>
                            <td className="text-center">
                              <span className="badge bg-warning text-dark">Clasificados</span>
                            </td>
                            <td>
                              <div className="fw-bold text-center">
                                {pronostico.partido.local.nombre}
                              </div>
                            </td>
                            <td className="text-center">
                              <div className={`fw-bold ${pronostico.puntos > 0 ? 'text-success' : 'text-danger'}`}>
                                {pronostico.equipo_pronosticado || '-'}
                              </div>
                            </td>
                            <td className="text-center">
                              <div className="fw-bold">
                                {pronostico.equipo_oficial || '-'}
                              </div>
                            </td>
                            <td className="text-center">
                              {/* Columna Bonus vacía */}
                            </td>
                            <td className="text-center">
                              {pronostico.puntos > 0 ? (
                                <span className="badge bg-success">
                                  +{pronostico.puntos} pts
                                </span>
                              ) : (
                                <span className="badge bg-secondary">0 pts</span>
                              )}
                            </td>
                          </tr>
                        ) : (
                          /* FILA NORMAL DE PARTIDO */
                          <tr className={getResultadoClase(pronostico)}>
                            <td className="text-center">
                              {pronostico.partido?.tipo_partido === 'IDA' || pronostico.partido?.tipo_partido === 'VUELTA' ? (
                                <div className="d-flex flex-column gap-1">
                                  <span className="badge bg-danger">
                                    {pronostico.jornada?.numero === 7 ? 'Play-Offs' : 
                                     pronostico.jornada?.numero === 8 ? 'Octavos' : 
                                     pronostico.jornada?.numero === 9 ? 'Cuartos' : 
                                     'Semifinales'}
                                  </span>
                                  <span className="badge bg-secondary">{pronostico.partido.tipo_partido}</span>
                                </div>
                              ) : (pronostico.jornada?.numero >= 7 && pronostico.jornada?.numero <= 9) ? (
                                <div className="d-flex flex-column gap-1">
                                  <span className="badge bg-danger">
                                    {pronostico.jornada?.numero === 7 ? 'Play-Offs' : 
                                     pronostico.jornada?.numero === 8 ? 'Octavos' : 
                                     'Cuartos'}
                                  </span>
                                  <span className="badge bg-secondary">{pronostico.partido?.id % 2 === 1 ? 'IDA' : 'VUELTA'}</span>
                                </div>
                              ) : pronostico.partido?.tipo_partido === 'FINAL' ? (
                                <span className="badge bg-warning text-dark">🏆 Final</span>
                              ) : pronostico.partido?.grupo ? (
                                <span className="badge bg-info">Grupo {pronostico.partido.grupo}</span>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                            <td>
                              <div className="d-flex flex-column align-items-center">
                                <div className="d-flex justify-content-center align-items-center gap-2 w-100">
                                  <div className="d-flex align-items-center justify-content-end gap-2" style={{flex: 1}}>
                                    <small className="fw-bold text-end">
                                      {formatearNombreEquipo(pronostico.partido?.local?.nombre, pronostico.partido?.local?.pais)}
                                    </small>
                                    {pronostico.partido?.local?.nombre && getLogoEquipo(pronostico.partido.local.nombre) && (
                                      <img 
                                        src={getLogoEquipo(pronostico.partido.local.nombre)} 
                                        alt={pronostico.partido.local.nombre}
                                        style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                                        onError={(e) => e.target.style.display = 'none'}
                                      />
                                    )}
                                  </div>
                                  <span className="text-muted">vs</span>
                                  <div className="d-flex align-items-center justify-content-start gap-2" style={{flex: 1}}>
                                    {pronostico.partido?.visita?.nombre && getLogoEquipo(pronostico.partido.visita.nombre) && (
                                      <img 
                                        src={getLogoEquipo(pronostico.partido.visita.nombre)} 
                                        alt={pronostico.partido.visita.nombre}
                                        style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                                        onError={(e) => e.target.style.display = 'none'}
                                      />
                                    )}
                                    <small className="fw-bold text-start">
                                      {formatearNombreEquipo(pronostico.partido?.visita?.nombre, pronostico.partido?.visita?.pais)}
                                    </small>
                                  </div>
                                </div>
                                {pronostico.partido?.tipo_partido === 'FINAL' && pronostico.partido?.resultado?.local !== null && (
                                  <div className="mt-1">
                                    <small className="fst-italic text-muted" style={{fontSize: '0.75rem'}}>
                                      <strong>Real:</strong> {pronostico.partido.local.nombre} vs {pronostico.partido.visita.nombre}
                                      {' - '}
                                      <span className={pronostico.final_virtual_local === pronostico.partido.local.nombre && pronostico.final_virtual_visita === pronostico.partido.visita.nombre ? 'text-success fw-bold' : 'text-danger fw-bold'}>
                                        {pronostico.final_virtual_local === pronostico.partido.local.nombre && pronostico.final_virtual_visita === pronostico.partido.visita.nombre ? '✓ Coincide' : '✗ No coincide'}
                                      </span>
                                    </small>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="text-center fw-bold fs-5">
                              {pronostico.pronostico?.local !== undefined && pronostico.pronostico?.visita !== undefined ? (
                                <>{pronostico.pronostico.local} - {pronostico.pronostico.visita}</>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                            <td className="text-center fw-bold fs-5">
                              {pronostico.partido?.resultado?.local !== null && pronostico.partido?.resultado?.visita !== null ? (
                                <>
                                  {pronostico.partido.resultado.local} - {pronostico.partido.resultado.visita}
                                </>
                              ) : (
                                <span className="text-muted">Pendiente</span>
                              )}
                            </td>
                            <td className="text-center fw-bold">
                              <span className={pronostico.partido?.bonus && pronostico.partido.bonus > 1 ? "badge bg-info text-white" : "text-muted"}>
                                x{pronostico.partido?.bonus || 1}
                              </span>
                            </td>
                            <td className="text-center fw-bold">
                              {pronostico.puntos !== null && pronostico.puntos !== undefined ? (
                                <span className="badge bg-warning text-dark fs-6">
                                  {pronostico.puntos} pts
                                </span>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      ))}
                      
                      {/* FILA TOTAL */}
                      <tr className="table-dark fw-bold">
                        <td colSpan="5" className="text-end">TOTAL {grupo.jugador} - Jornada {grupo.jornada}:</td>
                        <td className="text-center">
                          <span className="badge bg-dark fs-5">
                            {parseInt(grupo.puntaje_total, 10) || 0} pts
                          </span>
                        </td>
                      </tr>
                      {/* Separador entre grupos */}
                      {grupoIndex < agruparPronosticos().length - 1 && (
                        <tr style={{ height: '30px', backgroundColor: '#e9ecef' }}>
                          <td colSpan="6" className="p-0 text-center align-middle">
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                              style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                            >
                              ⬆️ Ir arriba
                            </button>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
          )}
        </>
      )}

      {/* Rankings - SIEMPRE MOSTRAR si hay jornada seleccionada */}
      {filtroJornada && (
        <div className="mt-5">
          <hr className="my-5" />
          
          {/* Ranking de Jornada */}
          <div id="ranking-jornada" className="card shadow-sm mb-4">
            <div className="card-header bg-success text-white">
              <h4 className="mb-0">🏆 Ranking Jornada {mostrarActual ? jornadaActual : filtroJornada}</h4>
            </div>
            <div className="card-body">
              {rankingJornada.length > 0 ? (
                <div className="row g-3">
                  {rankingJornada.map((jugador, index) => {
                  let bgClass = '';
                  let textClass = 'text-dark';
                  let positionIcon = '';
                  
                  if (index === 0) {
                    bgClass = 'bg-warning';
                    positionIcon = '🥇';
                  } else if (index === 1) {
                    bgClass = 'bg-secondary';
                    textClass = 'text-white';
                    positionIcon = '🥈';
                  } else if (index === 2) {
                    bgClass = 'bg-danger';
                    textClass = 'text-white';
                    positionIcon = '🥉';
                  }
                  
                  return (
                    <div key={jugador.id} className="col-12 col-md-6 col-lg-4">
                      <div className={`card h-100 ${bgClass} ${textClass}`}>
                        <div className="card-body d-flex align-items-center">
                          <div className="me-3">
                            <span className="fs-3 fw-bold">{positionIcon || `${index + 1}º`}</span>
                          </div>
                          <div className="me-3">
                            <img
                              src={jugador.foto_perfil || '/perfil/default.png'}
                              alt={jugador.nombre}
                              className="rounded-circle"
                              style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                              onError={(e) => {
                                e.target.src = '/perfil/default.png';
                              }}
                            />
                          </div>
                          <div className="flex-grow-1">
                            <h5 className="mb-1">{jugador.nombre}</h5>
                            <p className="mb-0 fs-4 fw-bold">{jugador.puntos_jornada} pts</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="alert alert-info text-center">
                No hay datos de ranking para esta jornada aún
              </div>
            )}
            </div>
          </div>

          {/* Ranking Acumulado */}
          <div id="ranking-acumulado" className="card shadow-sm mb-4">
            <div className="card-header bg-info text-white">
              <h4 className="mb-0">📊 Ranking Acumulado {mostrarActual ? `(Hasta Jornada ${jornadaActual})` : `(Hasta Jornada ${filtroJornada})`}</h4>
            </div>
            <div className="card-body">
              {rankingAcumulado.length > 0 ? (
                <div className="row g-3">
                  {rankingAcumulado.map((jugador, index) => {
                  let bgClass = '';
                  let textClass = 'text-dark';
                  let positionIcon = '';
                  
                  if (index === 0) {
                    bgClass = 'bg-warning';
                    positionIcon = '🥇';
                  } else if (index === 1) {
                    bgClass = 'bg-secondary';
                    textClass = 'text-white';
                    positionIcon = '🥈';
                  } else if (index === 2) {
                    bgClass = 'bg-danger';
                    textClass = 'text-white';
                    positionIcon = '🥉';
                  }
                  
                  return (
                    <div key={jugador.id} className="col-12 col-md-6 col-lg-4">
                      <div className={`card h-100 ${bgClass} ${textClass}`}>
                        <div className="card-body d-flex align-items-center">
                          <div className="me-3">
                            <span className="fs-3 fw-bold">{positionIcon || `${index + 1}º`}</span>
                          </div>
                          <div className="me-3">
                            <img
                              src={jugador.foto_perfil || '/perfil/default.png'}
                              alt={jugador.nombre}
                              className="rounded-circle"
                              style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                              onError={(e) => {
                                e.target.src = '/perfil/default.png';
                              }}
                            />
                          </div>
                          <div className="flex-grow-1">
                            <h5 className="mb-1">{jugador.nombre}</h5>
                            <p className="mb-0 fs-4 fw-bold">{parseInt(jugador.puntos_acumulados, 10) || 0} pts</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="alert alert-info text-center">
                No hay datos de ranking acumulado aún
              </div>
            )}
            </div>
          </div>

          {/* Botones de navegación de jornadas */}
          <div className="text-center mb-3 d-flex gap-2 justify-content-center align-items-center">
            <button 
              className="btn btn-outline-secondary"
              onClick={() => {
                const jornadaActualNum = parseInt(filtroJornada);
                const jornadaAnterior = jornadas.find(j => j.numero === jornadaActualNum - 1);
                if (jornadaAnterior) setFiltroJornada(jornadaAnterior.numero.toString());
              }}
              disabled={!filtroJornada || parseInt(filtroJornada) === jornadas[0]?.numero}
            >
              ← Anterior
            </button>
            <span className="mx-2 fw-bold">
              {filtroJornada ? `Jornada ${filtroJornada}` : 'Todas las jornadas'}
            </span>
            <button 
              className="btn btn-outline-secondary"
              onClick={() => {
                const jornadaActualNum = parseInt(filtroJornada);
                const jornadaSiguiente = jornadas.find(j => j.numero === jornadaActualNum + 1);
                if (jornadaSiguiente) setFiltroJornada(jornadaSiguiente.numero.toString());
              }}
              disabled={!filtroJornada || parseInt(filtroJornada) === jornadas[jornadas.length - 1]?.numero}
            >
              Siguiente →
            </button>
          </div>

          {/* Botones de control de ranking */}
          <div className="text-center mb-4 d-flex gap-3 justify-content-center flex-wrap">
            <button 
              className={`btn ${mostrarActual ? 'btn-success' : 'btn-outline-success'} btn-lg px-4`}
              onClick={() => setMostrarActual(true)}
            >
              📈 Mostrar Ranking Actual
            </button>
            <button 
              className={`btn ${!mostrarActual ? 'btn-info' : 'btn-outline-info'} btn-lg px-4`}
              onClick={() => setMostrarActual(false)}
            >
              🔍 Mostrar Ranking de Jornada Seleccionada
            </button>
          </div>
        </div>
      )}

      {/* Botón Volver */}
      <div className="text-center mt-4 mb-4">
        <button 
          className="btn btn-outline-secondary btn-lg"
          onClick={() => navigate('/sudamericana')}
        >
          ← Volver a Sudamericana
        </button>
      </div>

      {/* Modal de Ganadores con Confeti */}
      {mostrarGanadores && ganadores && (
        <>
          <FireworksEffect />
          <div 
            className="modal show d-block" 
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            onClick={() => setMostrarGanadores(false)}
          >
            <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header bg-warning text-dark">
                  <h5 className="modal-title">
                    🏆 {Array.isArray(ganadores.ganadores) && ganadores.ganadores.length === 1 ? 'Ganador' : 'Ganadores'} de la Jornada {ganadores.jornadaNumero} - Copa Sudamericana
                  </h5>
                  <button 
                    type="button" 
                    className="btn-close" 
                    onClick={() => setMostrarGanadores(false)}
                  ></button>
                </div>
                <div className="modal-body text-center py-4">
                  <div className="mb-4">
                    <h2 className="text-warning">🎉 ¡Felicitaciones! 🎉</h2>
                  </div>
                  {ganadores.ganadores.map((ganador, index) => (
                    <div key={index} className="alert alert-success mb-3 d-flex flex-column align-items-center">
                      {ganador.foto_perfil && (
                        <img
                          src={ganador.foto_perfil.startsWith('/') ? ganador.foto_perfil : `/perfil/${ganador.foto_perfil}`}
                          alt={ganador.nombre}
                          style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '3px solid #28a745',
                            marginBottom: '15px'
                          }}
                        />
                      )}
                      <h4 className="mb-0">
                        🏆 {ganador.nombre}
                      </h4>
                      <p className="mb-0 fs-5 fw-bold text-success">
                        {parseInt(ganador.puntaje, 10) || 0} puntos
                      </p>
                    </div>
                  ))}
                  <p className="text-muted mt-3">
                    {ganadores.mensaje}
                  </p>
                </div>
                <div className="modal-footer">
                  <button 
                    type="button" 
                    className="btn btn-primary" 
                    onClick={() => setMostrarGanadores(false)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de Ganadores Acumulado con Confeti Intenso */}
      {mostrarGanadoresAcumulado && ganadoresAcumulado && (
        <>
          <FireworksEffect />
          <FireworksEffect />
          <FireworksEffect />
          <div 
            className="modal show d-block" 
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 2000 }}
            onClick={() => setMostrarGanadoresAcumulado(false)}
          >
            <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-content border-5 border-warning">
                <div className="modal-header bg-gradient" style={{ background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)' }}>
                  <h3 className="modal-title text-dark fw-bold w-100 text-center">
                    👑 {Array.isArray(ganadoresAcumulado.ganadores) && ganadoresAcumulado.ganadores.length === 1 ? 'CAMPEÓN' : 'CAMPEONES'} COPA SUDAMERICANA 👑
                  </h3>
                  <button 
                    type="button" 
                    className="btn-close" 
                    onClick={() => setMostrarGanadoresAcumulado(false)}
                  ></button>
                </div>
                <div className="modal-body text-center py-5" style={{ background: 'linear-gradient(to bottom, #fff 0%, #fffaf0 100%)' }}>
                  <div className="mb-5">
                    <h1 className="display-3 mb-3">🎊 🎉 🎊</h1>
                    <h2 className="text-warning fw-bold" style={{ fontSize: '2.5rem', textShadow: '2px 2px 4px rgba(0,0,0,0.2)' }}>
                      ¡FELICITACIONES!
                    </h2>
                  </div>
                  {ganadoresAcumulado.ganadores.map((ganador, index) => (
                    <div key={index} className="alert alert-warning mb-4 border-3 border-warning shadow-lg" style={{ backgroundColor: '#FFF8DC' }}>
                      <h1 className="mb-3" style={{ fontSize: '3rem' }}>👑</h1>
                      {ganador.foto_perfil && (
                        <img
                          src={ganador.foto_perfil}
                          alt={ganador.nombre}
                          className="rounded-circle mb-3"
                          style={{ width: '120px', height: '120px', objectFit: 'cover', border: '4px solid #FFD700' }}
                          onError={(e) => { e.target.src = '/perfil/default.png'; }}
                        />
                      )}
                      <h2 className="mb-2 fw-bold text-dark" style={{ fontSize: '2rem' }}>
                        {ganador.nombre.toUpperCase()}
                      </h2>
                      <p className="mb-0 fw-bold text-warning" style={{ fontSize: '1.8rem' }}>
                        {parseInt(ganador.puntaje, 10) || 0} PUNTOS
                      </p>
                    </div>
                  ))}
                  <p className="text-muted mt-4 fs-5">
                    {ganadoresAcumulado.mensaje}
                  </p>
                </div>
                <div className="modal-footer justify-content-center">
                  <button 
                    type="button" 
                    className="btn btn-warning btn-lg fw-bold px-5" 
                    onClick={() => setMostrarGanadoresAcumulado(false)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de confirmación para cálculo de ganadores */}
      {showModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content border-3 shadow-lg">
              <div className={`modal-header ${
                modalType === 'success' ? 'bg-success text-white' : 
                modalType === 'warning' ? 'bg-warning text-dark' : 
                'bg-danger text-white'
              }`}>
                <h5 className="modal-title fw-bold">
                  {modalType === 'success' ? '✅ Éxito' : modalType === 'warning' ? '⚠️ Advertencia' : '❌ Error'}
                </h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => setShowModal(false)}
                  aria-label="Close"
                ></button>
              </div>
              <div className="modal-body">
                <div style={{ whiteSpace: 'pre-line' }}>
                  {modalMessage}
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className={`btn ${
                    modalType === 'success' ? 'btn-success' : 
                    modalType === 'warning' ? 'btn-warning' : 
                    'btn-danger'
                  }`}
                  onClick={() => setShowModal(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
