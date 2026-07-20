import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getMundialLogoPorNombre } from '../../utils/mundialLogos';

const API_BASE_URL = import.meta.env.VITE_API_URL;

export default function AdminMundialResultados() {
  const navigate = useNavigate();
  const [jornadas, setJornadas] = useState([]);
  const [jornadaSeleccionada, setJornadaSeleccionada] = useState("");
  const [partidos, setPartidos] = useState([]);
  const [jornadaCerrada, setJornadaCerrada] = useState(false);
  const [jornadaActiva, setJornadaActiva] = useState(false);
  const [jornadaId, setJornadaId] = useState(null);
  const [fechaCierre, setFechaCierre] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [modalType, setModalType] = useState("success");

  // Modal Ganador Fase de Grupos
  const [showFaseGruposModal, setShowFaseGruposModal] = useState(false);
  const [faseGruposGanador, setFaseGruposGanador] = useState(null);
  const [calculandoFaseGrupos, setCalculandoFaseGrupos] = useState(false);
  // Acumulado final
  const [calculandoAcumuladoFinal, setCalculandoAcumuladoFinal] = useState(false);
  const [showPodioAcumulado, setShowPodioAcumulado] = useState(false);
  const [podioAcumulado, setPodioAcumulado] = useState([]);

  const confettiPieces = useMemo(() => {
    const colors = ['#ff4444','#ffdd00','#44cc44','#4488ff','#ff44cc','#44dddd','#ff8800','#aa44ff'];
    return Array.from({ length: 70 }, (_, i) => ({
      id: i,
      left: `${(i * 41 + 7) % 100}%`,
      color: colors[i % colors.length],
      delay: `${((i * 0.11) % 2.8).toFixed(2)}s`,
      duration: `${(2.2 + (i % 12) * 0.15).toFixed(2)}s`,
      size: `${6 + (i % 7)}px`,
      isCircle: i % 3 === 0,
    }));
  }, []);

  // Mejores terceros
  const [tablasOficialesFaseGrupos, setTablasOficialesFaseGrupos] = useState({});
  const [mejoresTercerosSeleccionados, setMejoresTercerosSeleccionados] = useState({}); // grupo → equipo seleccionado
  const [guardandoTerceros, setGuardandoTerceros] = useState(false);

  const jornadasOrdenadas = jornadas.sort((a, b) => a.numero - b.numero);

  useEffect(() => {
    cargarJornadas();
    cargarDatosTerceros();
  }, []);

  useEffect(() => {
    if (!jornadaSeleccionada) return;
    fetchPartidos(jornadaSeleccionada);
    fetchJornadaInfo(jornadaSeleccionada);
  }, [jornadaSeleccionada]);

  const cargarDatosTerceros = async () => {
    try {
      const token = localStorage.getItem('token');
      const [tablasRes, tercerosRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/mundial-clasificados/todas-tablas-oficiales`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_BASE_URL}/api/admin/mejores-terceros-mundial`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      const tablas = await tablasRes.json();
      const terceros = await tercerosRes.json();
      setTablasOficialesFaseGrupos(tablas);
      // Precargar selección guardada: grupo → equipo
      const seleccionGuardada = {};
      if (Array.isArray(terceros)) {
        terceros.forEach(t => { seleccionGuardada[t.grupo] = t.equipo; });
      }
      setMejoresTercerosSeleccionados(seleccionGuardada);
    } catch (err) {
      console.error('Error cargando datos terceros:', err);
    }
  };

  const toggleTercero = (grupo, equipo) => {
    setMejoresTercerosSeleccionados(prev => {
      const next = { ...prev };
      if (next[grupo] === equipo) {
        delete next[grupo]; // deseleccionar
      } else {
        next[grupo] = equipo;
      }
      return next;
    });
  };

  const guardarMejoresTerceros = async () => {
    const equipos = Object.entries(mejoresTercerosSeleccionados).map(([grupo, equipo]) => ({ grupo, equipo }));
    if (equipos.length > 8) {
      alert('⚠️ Solo puedes seleccionar máximo 8 mejores terceros (uno por grupo)');
      return;
    }
    setGuardandoTerceros(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/admin/mejores-terceros-mundial`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipos })
      });
      const data = await res.json();
      if (res.ok) {
        setModalType('success');
        setModalMessage(`${data.mensaje}\n\nRecuerda recalcular los puntajes de J3 para que los cambios se reflejen en los rankings.`);
      } else {
        setModalType('error');
        setModalMessage(`❌ ${data.error}`);
      }
      setShowModal(true);
    } catch (err) {
      setModalType('error');
      setModalMessage('❌ Error al guardar los mejores terceros');
      setShowModal(true);
    } finally {
      setGuardandoTerceros(false);
    }
  };

  const cargarJornadas = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/mundial/jornadas`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setJornadas(data);
      
      if (data.length > 0) {
        setJornadaSeleccionada(String(data[0].numero));
      }
    } catch (err) {
      console.error("Error al cargar jornadas:", err);
    }
  };

  const fetchPartidos = async (numero) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/mundial/partidos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      const partidosJornada = data.filter(p => p.jornada_numero === Number(numero));
      
      const partidosConGoles = partidosJornada.map(p => ({
        id: p.id,
        local: p.equipo_local,
        visita: p.equipo_visitante,
        golesLocal: p.resultado_local ?? "",
        golesVisita: p.resultado_visitante ?? "",
        quienAvanzo: p.quien_avanzo || "",
        bonus: p.bonus ?? 1,
        subtipo: p.subtipo || null,
        jornadaId: p.jornada_id,
        grupo: p.grupo,
        paisLocal: p.pais_local,
        paisVisita: p.pais_visita
      }));
      setPartidos(partidosConGoles);
    } catch (err) {
      console.error("Error al cargar partidos:", err);
    }
  };

  const fetchJornadaInfo = async (numero) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/mundial/jornadas`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const jornada = data.find(j => j.numero === Number(numero));
      
      setJornadaCerrada(!!jornada?.cerrada);
      setJornadaActiva(!!jornada?.activa);
      setJornadaId(jornada?.id);

      if (jornada?.fecha_cierre) {
        const fechaUTC = new Date(jornada.fecha_cierre);
        const anio = fechaUTC.getFullYear();
        const mes = String(fechaUTC.getMonth() + 1).padStart(2, '0');
        const dia = String(fechaUTC.getDate()).padStart(2, '0');
        const hora = String(fechaUTC.getHours()).padStart(2, '0');
        const minutos = String(fechaUTC.getMinutes()).padStart(2, '0');
        setFechaCierre(`${anio}-${mes}-${dia}T${hora}:${minutos}`);
      } else {
        setFechaCierre("");
      }
    } catch (err) {
      setJornadaCerrada(false);
      setJornadaActiva(false);
      setJornadaId(null);
      setFechaCierre("");
    }
  };

  const configurarFechaCierre = async () => {
    if (!jornadaSeleccionada || !fechaCierre) {
      alert("⚠️ Debes seleccionar una fecha y hora");
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const fechaLocal = new Date(fechaCierre);
      const fechaUTCString = fechaLocal.toISOString();

      const res = await fetch(`${API_BASE_URL}/api/mundial/jornadas/${jornadaSeleccionada}/fecha-cierre`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ fecha_cierre: fechaUTCString })
      });

      if (res.ok) {
        await fetchJornadaInfo(jornadaSeleccionada);
        const [fecha, hora] = fechaCierre.split('T');
        const [year, month, day] = fecha.split('-');
        setModalType("success");
        setModalMessage(`✅ Fecha configurada: ${day}/${month}/${year} a las ${hora} hrs (hora local Chile)\n\nLa jornada ${jornadaSeleccionada} del Mundial se cerrará automáticamente a esa hora.\n\nEl sistema revisa cada minuto.`);
        setShowModal(true);
      } else {
        alert("❌ Error al guardar la fecha de cierre");
      }
    } catch (error) {
      alert("❌ Error al configurar fecha de cierre");
    }
  };

  const eliminarFechaCierre = async () => {
    if (!jornadaSeleccionada) return;
    if (!confirm("¿Eliminar la fecha de cierre automático?")) return;

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/mundial/jornadas/${jornadaSeleccionada}/fecha-cierre`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ fecha_cierre: null })
      });

      if (res.ok) {
        setFechaCierre("");
        await fetchJornadaInfo(jornadaSeleccionada);
        setModalType("success");
        setModalMessage("✅ Fecha de cierre eliminada correctamente\n\nLa jornada ya no se cerrará automáticamente.");
        setShowModal(true);
      } else {
        alert("❌ Error al eliminar fecha de cierre");
      }
    } catch (error) {
      alert("❌ Error al eliminar fecha de cierre");
    }
  };

  const handleCambiarGoles = (id, campo, valor) => {
    setPartidos(partidos.map(p =>
      p.id === id ? { ...p, [campo]: valor } : p
    ));
  };

  const handleCambiarBonus = async (id, valor) => {
    // Actualizar el estado local
    setPartidos(partidos.map(p =>
      p.id === id ? { ...p, bonus: Number(valor) } : p
    ));

    // Actualizar inmediatamente en la base de datos
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/api/mundial/partidos/${id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ bonus: Number(valor) }),
      });

      if (!response.ok) {
        throw new Error('Error al actualizar bonus');
      }

      console.log(`✅ Bonus actualizado a x${valor} para partido ${id}`);
    } catch (error) {
      console.error('Error actualizando bonus:', error);
      alert('❌ Error al actualizar bonus. Por favor, intenta de nuevo.');
      // Recargar partidos para restaurar el estado correcto
      fetchPartidos(jornadaSeleccionada);
    }
  };

  const guardarResultados = async () => {
    if (!jornadaSeleccionada) return;
    try {
      const token = localStorage.getItem('token');
      
      const partidosParaGuardar = partidos.map(p => ({
        id: p.id,
        subtipo: p.subtipo || null,
        resultado_local: p.golesLocal === "" ? null : Number(p.golesLocal),
        resultado_visitante: p.golesVisita === "" ? null : Number(p.golesVisita),
        quien_avanzo: p.quienAvanzo || null,
        bonus: p.bonus
      }));

      // Guardar resultados y bonus
      for (const partido of partidosParaGuardar) {
        await fetch(`${API_BASE_URL}/api/mundial/partidos/${partido.id}`, {
          method: "PATCH",
          headers: { 
            "Content-Type": "application/json",
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ 
            resultado_local: partido.resultado_local, 
            resultado_visitante: partido.resultado_visitante,
            quien_avanzo: partido.quien_avanzo,
            bonus: partido.bonus
          }),
        });
      }
      
      const partidosConResultado = partidosParaGuardar.filter(p => p.resultado_local !== null && p.resultado_visitante !== null).length;
      const bonusModificados = partidosParaGuardar.filter(p => p.bonus !== 1).length;
      
      alert(`✅ Resultados guardados exitosamente\n\n📊 Resumen Jornada ${jornadaSeleccionada}:\n- ${partidosConResultado} de ${partidosParaGuardar.length} partidos con resultado\n- ${bonusModificados} partidos con bonus modificado\n\n💾 Datos guardados en la base de datos`);
      fetchPartidos(jornadaSeleccionada);
    } catch (error) {
      console.error("Error al guardar resultados:", error);
      alert("❌ Error al guardar resultados: " + (error.message || "Error desconocido"));
    }
  };

  const toggleCierreJornada = async () => {
    if (!jornadaSeleccionada) return;
    try {
      const token = localStorage.getItem('token');
      const jornada = jornadas.find(j => String(j.numero) === String(jornadaSeleccionada));
      if (!jornada) {
        alert("No se encontró la jornada");
        return;
      }

      const endpoint = jornada.cerrada 
        ? `${API_BASE_URL}/api/mundial/jornadas/${jornadaSeleccionada}/abrir`
        : `${API_BASE_URL}/api/mundial/jornadas/${jornadaSeleccionada}/cerrar`;

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        alert(jornada.cerrada ? "✅ Jornada abierta" : "✅ Jornada cerrada");
        await cargarJornadas();
        await fetchJornadaInfo(jornadaSeleccionada);
      } else {
        alert("❌ Error al cambiar estado de jornada");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("❌ Error al cambiar estado de jornada");
    }
  };

  const toggleActivarJornada = async () => {
    if (!jornadaSeleccionada) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/mundial/jornadas/${jornadaSeleccionada}/toggle`, {
        method: "PATCH",
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        alert(jornadaActiva ? "✅ Jornada desactivada (oculta)" : "✅ Jornada activada (visible)");
        await cargarJornadas();
        await fetchJornadaInfo(jornadaSeleccionada);
      } else {
        alert("❌ Error al cambiar visibilidad");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("❌ Error al cambiar visibilidad");
    }
  };

  const generarAzar = () => {
    const partidosAzar = partidos.map(p => ({
      ...p,
      golesLocal: Math.floor(Math.random() * 4),
      golesVisita: Math.floor(Math.random() * 4)
    }));
    setPartidos(partidosAzar);
  };

  const generarAzarFaseGruposCompleta = async () => {
    if (!confirm('¿Estás seguro de completar TODAS las jornadas de fase de grupos (1-3) con resultados aleatorios?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      
      // Iterar sobre jornadas 1 a 3 (fase de grupos del Mundial)
      for (let jornadaNum = 1; jornadaNum <= 3; jornadaNum++) {
        // Obtener partidos de la jornada
        const res = await fetch(`${API_BASE_URL}/api/mundial/partidos`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        const partidosJornada = data.filter(p => p.jornada_numero === jornadaNum);
        
        if (partidosJornada.length === 0) continue;

        // Guardar resultados aleatorios para cada partido
        for (const partido of partidosJornada) {
          await fetch(`${API_BASE_URL}/api/mundial/partidos/${partido.id}`, {
            method: "PATCH",
            headers: { 
              "Content-Type": "application/json",
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
              resultado_local: Math.floor(Math.random() * 4),
              resultado_visitante: Math.floor(Math.random() * 4)
            }),
          });
        }
      }

      alert('✅ Se completaron todas las jornadas de fase de grupos (1-3) con resultados aleatorios');
      
      // Recargar la jornada actual
      fetchPartidos(jornadaSeleccionada);
    } catch (error) {
      console.error('Error al generar azar fase grupos completa:', error);
      alert('❌ Error al completar fase de grupos: ' + (error.message || 'Error desconocido'));
    }
  };

  const resetearTodos = async () => {
    // En J7: preguntar si también borrar los partidos generados de Final + 3er Lugar
    if (String(jornadaSeleccionada) === '7') {
      const confirmar = confirm('\u00bfResetear resultados de la Jornada 7?\n\nEsto también eliminará los partidos generados de Final y 3er Lugar (y sus pronósticos).');
      if (!confirmar) return;
      try {
        const token = localStorage.getItem('token');
        await fetch(`${API_BASE_URL}/api/mundial-calcular/borrar-partidos-finales`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        await fetchPartidos(jornadaSeleccionada);
        return;
      } catch (e) { console.warn('Error borrando partidos finales:', e); }
    }
    const partidosReseteados = partidos.map(p => ({
      ...p,
      golesLocal: "",
      golesVisita: ""
    }));
    setPartidos(partidosReseteados);
  };

  const calcularPuntajes = async () => {
    if (!jornadaSeleccionada) return;
    if (!confirm(`¿Calcular puntajes de la jornada ${jornadaSeleccionada} del Mundial 2026?`)) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/mundial-calcular/puntos`, {
        method: "POST",
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jornadaNumero: parseInt(jornadaSeleccionada) })
      });
      const data = await res.json();
      
      alert(data.mensaje || "✅ Puntajes calculados correctamente");
    } catch (error) {
      console.error("Error al calcular puntajes:", error);
      alert("❌ Error al calcular puntajes");
    }
  };

  const generarPDFTestigo = async () => {
    if (!jornadaSeleccionada) return;

    if (!confirm(`¿Generar PDF testigo con los pronósticos de la Jornada ${jornadaSeleccionada}?`)) {
      return;
    }

    try {
      setModalMessage("⏳ Generando PDF testigo...");
      setModalType("success");
      setShowModal(true);

      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/mundial/generar-pdf-testigo/${jornadaSeleccionada}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al generar PDF');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Mundial_Testigo_Jornada_${jornadaSeleccionada}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setModalType("success");
      setModalMessage(`✅ PDF testigo descargado en tu equipo\n\n📄 El PDF contiene todos los pronósticos de la Jornada ${jornadaSeleccionada}`);
      setShowModal(true);
    } catch (error) {
      console.error("Error al generar PDF testigo:", error);
      setModalType("error");
      setModalMessage(`❌ Error al generar PDF testigo\n\n${error.message}`);
      setShowModal(true);
    }
  };

  const generarPDFCompleto = async () => {
    if (!jornadaSeleccionada) return;

    if (!confirm(`¿Generar PDF completo con resultados de la Jornada ${jornadaSeleccionada}?\n\nIncluirá: pronósticos, resultados reales, puntos, rankings y ganadores.`)) {
      return;
    }

    try {
      setModalMessage("⏳ Generando PDF completo...");
      setModalType("success");
      setShowModal(true);

      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/mundial-ganadores-jornada/${jornadaSeleccionada}/pdf-final`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al generar PDF');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Resultados_Mundial_Jornada_${jornadaSeleccionada}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setModalType("success");
      setModalMessage(`✅ PDF completo descargado en tu equipo\n\n📄 El PDF incluye:\n• Ganadores de la jornada\n• Ranking de jornada\n• Ranking acumulado\n• Pronósticos y resultados\n• Puntos por usuario`);
      setShowModal(true);
    } catch (error) {
      console.error("Error al generar PDF completo:", error);
      setModalType("error");
      setModalMessage(`❌ Error al generar PDF completo\n\n${error.message}`);
      setShowModal(true);
    }
  };

  const calcularGanadoresJornada = async () => {
    if (!jornadaSeleccionada) return;
    if (!confirm(`¿Calcular ganadores de la jornada ${jornadaSeleccionada} del Mundial 2026?\n\nEsto determinará quién ganó esta jornada.`)) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/mundial-calcular/ganadores`, {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jornadaNumero: parseInt(jornadaSeleccionada) })
      });
      const data = await res.json();
      alert(data.mensaje || "✅ Ganadores calculados correctamente");
    } catch (error) {
      console.error("Error al calcular ganadores:", error);
      alert("❌ Error al calcular ganadores");
    }
  };

  const calcularGanadorFaseGrupos = async () => {
    if (!confirm('¿Calcular el Ganador de la Fase de Grupos?\n\nSe determinará quién tuvo el mayor puntaje acumulado en J1+J2+J3.')) return;
    setCalculandoFaseGrupos(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/mundial-calcular/ganador-fase-grupos`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error calculando');
      setFaseGruposGanador(data.ganador);
      setShowFaseGruposModal(true);
    } catch (error) {
      console.error('Error calculando ganador fase de grupos:', error);
      alert('❌ ' + error.message);
    } finally {
      setCalculandoFaseGrupos(false);
    }
  };

  const calcularAcumuladoFinal = async () => {
    if (!confirm('¿Declarar los campeones finales del Ranking Acumulado?\n\nEsto publicará el pódio (1°, 2°, 3°) en Tesorería.')) return;
    setCalculandoAcumuladoFinal(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE_URL}/api/mundial-calcular/ganadores-acumulado-final`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setPodioAcumulado(data.ganadores || []);
      setShowPodioAcumulado(true);
    } catch (error) {
      alert('❌ ' + error.message);
    } finally {
      setCalculandoAcumuladoFinal(false);
    }
  };

  const getSubtitulo = (numero) => {
    if (numero <= 3) return 'Fase de Grupos';
    if (numero === 4) return '16vos de Final';
    if (numero === 5) return 'Octavos de Final';
    if (numero === 6) return 'Cuartos de Final';
    if (numero === 7) return 'Semifinales y Final';
    return '';
  };

  return (
    <div className="container mt-4">
      <div className="mb-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2>⚽ Resultados y Jornadas - Mundial 2026</h2>
          <div className="d-flex gap-2">
            <button 
              className="btn btn-primary"
              onClick={() => navigate('/admin/mundial/fixture')}
            >
              ⚙️ Generador de Fixture
            </button>
            <button 
              className="btn btn-warning"
              onClick={() => navigate('/admin/mundial/gestion')}
            >
              🔧 Gestión
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

      {/* Selector de Jornada */}
      <div className="card mb-4">
        <div className="card-header">
          <h5>Seleccionar Jornada</h5>
        </div>
        <div className="card-body">
          <select
            className="form-select"
            value={jornadaSeleccionada}
            onChange={(e) => setJornadaSeleccionada(e.target.value)}
          >
            <option value="">-- Seleccione una jornada --</option>
            {jornadasOrdenadas.map((j) => (
              <option key={j.id} value={j.numero}>
                Jornada {j.numero} - {j.nombre} {j.cerrada ? "🔒" : "🔓"} {j.activa ? "✅" : "❌"}
              </option>
            ))}
          </select>
          <small className="text-muted d-block mt-2">
            🔒 = Cerrada (no se pueden modificar pronósticos) | 🔓 = Abierta | ✅ = Activa (visible) | ❌ = Oculta
          </small>
        </div>
      </div>

      {/* Botones de estado de jornada */}
      {jornadaSeleccionada && (
        <div className="card mb-4">
          <div className="card-header">
            <h5>Estado de la Jornada</h5>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6">
                <div className="d-flex flex-column gap-2">
                  <button
                    className={`btn btn-lg ${jornadaCerrada ? "btn-danger" : "btn-success"}`}
                    onClick={toggleCierreJornada}
                  >
                    {jornadaCerrada ? "🔓 Abrir Jornada" : "🔒 Cerrar Jornada"}
                  </button>
                  <small className="text-muted">
                    {jornadaCerrada ? "Cerrada: Los jugadores no pueden modificar pronósticos" : "Abierta: Los jugadores pueden ingresar pronósticos"}
                  </small>
                </div>
              </div>
              <div className="col-md-6">
                <div className="d-flex flex-column gap-2">
                  <button
                    className={`btn btn-lg ${jornadaActiva ? "btn-info" : "btn-warning"}`}
                    onClick={toggleActivarJornada}
                  >
                    {jornadaActiva ? "❌ Desactivar (Ocultar)" : "✅ Activar (Mostrar)"}
                  </button>
                  <small className="text-muted">
                    {jornadaActiva ? "Activa: Visible para todos los jugadores" : "Inactiva: Oculta para los jugadores"}
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cierre Automático de Jornada */}
      {jornadaSeleccionada && (
        <div className="card mb-4">
          <div className="card-header bg-warning text-dark">
            <h5>⏰ Cierre Automático de Jornada</h5>
          </div>
          <div className="card-body">
            <p className="text-muted">
              Configura una fecha y hora para que la jornada se cierre automáticamente.
              El sistema revisará cada minuto y cerrará la jornada cuando llegue la fecha configurada.
            </p>
            <div className="row align-items-end">
              <div className="col-md-6">
                <label className="form-label fw-bold">Fecha y Hora de Cierre (Hora de Chile GMT-3)</label>
                <input
                  type="datetime-local"
                  className="form-control form-control-lg"
                  value={fechaCierre}
                  onChange={(e) => setFechaCierre(e.target.value)}
                />
                {fechaCierre && (
                  <div className="alert alert-success mt-2 mb-0">
                    <strong>✅ Configurado:</strong> Se cerrará el {fechaCierre.split('T')[0].split('-').reverse().join('/')} a las {fechaCierre.split('T')[1]} hrs (Chile GMT-3)
                    <br/>
                    <small className="text-muted">La jornada se cerrará automáticamente a esta hora, sin importar dónde estés ubicado.</small>
                  </div>
                )}
              </div>
              <div className="col-md-6">
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={configurarFechaCierre}
                    disabled={!fechaCierre}
                  >
                    💾 Guardar Fecha de Cierre
                  </button>
                  {fechaCierre && (
                    <button
                      className="btn btn-outline-danger btn-lg"
                      onClick={eliminarFechaCierre}
                    >
                      🗑️ Eliminar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cards de resultados */}
      {partidos.length > 0 && (
        <>
          <div className="card mb-4">
            <div className="card-header">
              <h5>⚽ Ingresar Resultados Reales</h5>
            </div>
            <div className="card-body">
              <div className="row g-3">
                {partidos.map((partido, index) => {
                  const getBorderClass = (bonus) => {
                    if (Number(bonus) === 2) return 'border-warning border-3';
                    if (Number(bonus) === 3) return 'border-danger border-3';
                    return '';
                  };
                  const getBonusBanner = (bonus, subtipo) => {
                    if (subtipo === 'final') return (
                      <div className="text-center py-2 fw-bold" style={{ background: 'linear-gradient(135deg,#b8860b,#ffd700,#b8860b)', color: '#000', fontSize: '1rem', borderTopLeftRadius: '0.375rem', borderTopRightRadius: '0.375rem' }}>
                        🏆 GRAN FINAL — BONUS x2 🏆
                      </div>
                    );
                    if (subtipo === 'tercero_lugar') return (
                      <div className="text-center py-2 fw-bold" style={{ backgroundColor: '#cd7f32', color: '#fff', fontSize: '1rem', borderTopLeftRadius: '0.375rem', borderTopRightRadius: '0.375rem' }}>
                        🥉 PARTIDO POR EL 3er LUGAR
                      </div>
                    );
                    if (Number(bonus) === 2) return (
                      <div className="text-center py-2 fw-bold" style={{ backgroundColor: '#ffc107', color: '#000', fontSize: '1rem', borderTopLeftRadius: '0.375rem', borderTopRightRadius: '0.375rem' }}>
                        ⚡ PARTIDO BONUS x2 ⚡
                      </div>
                    );
                    if (Number(bonus) === 3) return (
                      <div className="text-center py-2 fw-bold" style={{ backgroundColor: '#dc3545', color: '#fff', fontSize: '1rem', borderTopLeftRadius: '0.375rem', borderTopRightRadius: '0.375rem' }}>
                        ⚡ PARTIDO BONUS x3 ⚡
                      </div>
                    );
                    return null;
                  };
                  const borderClass = partido.subtipo === 'final' ? 'border-warning border-3' : partido.subtipo === 'tercero_lugar' ? 'border-secondary border-2' : getBorderClass(partido.bonus);
                  return (
                  <div key={partido.id} className="col-12 col-md-6 col-lg-4">
                    <div className={`card shadow-sm h-100 ${borderClass}`}>
                      {getBonusBanner(partido.bonus, partido.subtipo)}
                      <div className="card-header bg-info text-white text-center">
                        <div className="d-flex justify-content-between align-items-center">
                          <small className="fw-bold">Partido {index + 1}</small>
                          <div>
                            {partido.grupo && (
                              <span className="badge bg-primary me-2">Grupo {partido.grupo}</span>
                            )}
                            <select
                              className="form-select form-select-sm d-inline-block"
                              style={{ width: 'auto', fontSize: '0.75rem' }}
                              value={partido.bonus}
                              onChange={(e) => handleCambiarBonus(partido.id, e.target.value)}
                            >
                              <option value="1">x1</option>
                              <option value="2">x2</option>
                              <option value="3">x3</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <div className="card-body">
                        <div className="row align-items-center text-center">
                          {/* Equipo Local */}
                          <div className="col-5">
                            <img 
                              src={getMundialLogoPorNombre(partido.local)} 
                              alt={partido.local}
                              className="mb-2"
                              style={{ width: '60px', height: '60px', objectFit: 'contain' }}
                              onError={(e) => e.target.style.display = 'none'}
                            />
                            <p className="fw-bold mb-2 small">{partido.local}</p>
                            {partido.paisLocal && (
                              <span className="badge bg-secondary mb-2">{partido.paisLocal}</span>
                            )}
                            <input
                              type="number"
                              min="0"
                              className="form-control form-control-lg text-center fw-bold"
                              style={{ MozAppearance: 'textfield' }}
                              value={partido.golesLocal}
                              onChange={(e) => handleCambiarGoles(partido.id, "golesLocal", e.target.value)}
                              placeholder="0"
                            />
                          </div>

                          {/* VS */}
                          <div className="col-2">
                            <p className="fw-bold text-muted fs-3 mb-0">VS</p>
                          </div>

                          {/* Equipo Visitante */}
                          <div className="col-5">
                            <img 
                              src={getMundialLogoPorNombre(partido.visita)} 
                              alt={partido.visita}
                              className="mb-2"
                              style={{ width: '60px', height: '60px', objectFit: 'contain' }}
                              onError={(e) => e.target.style.display = 'none'}
                            />
                            <p className="fw-bold mb-2 small">{partido.visita}</p>
                            {partido.paisVisita && (
                              <span className="badge bg-secondary mb-2">{partido.paisVisita}</span>
                            )}
                            <input
                              type="number"
                              min="0"
                              className="form-control form-control-lg text-center fw-bold"
                              style={{ MozAppearance: 'textfield' }}
                              value={partido.golesVisita}
                              onChange={(e) => handleCambiarGoles(partido.id, "golesVisita", e.target.value)}
                              placeholder="0"
                            />
                          </div>
                        </div>

                        {/* Quién avanzó en empate de eliminatoria */}
                        {Number(jornadaSeleccionada) >= 4 &&
                         partido.golesLocal !== "" && partido.golesVisita !== "" &&
                         Number(partido.golesLocal) === Number(partido.golesVisita) && (
                          <div className="mt-3">
                            <div className="alert alert-warning py-2 mb-0">
                              <small className="fw-bold d-block mb-1">⚽ Empate — ¿Quién avanzó realmente?</small>
                              <select
                                className="form-select form-select-sm"
                                value={partido.quienAvanzo || ""}
                                onChange={(e) => handleCambiarGoles(partido.id, "quienAvanzo", e.target.value)}
                              >
                                <option value="">-- Seleccionar --</option>
                                <option value={partido.local}>{partido.local}</option>
                                <option value={partido.visita}>{partido.visita}</option>
                              </select>
                            </div>
                          </div>
                        )}

                        {/* Botón limpiar */}
                        <div className="text-center mt-3">
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => {
                              handleCambiarGoles(partido.id, "golesLocal", "");
                              handleCambiarGoles(partido.id, "golesVisita", "");
                              handleCambiarGoles(partido.id, "quienAvanzo", "");
                            }}
                            title="Limpiar resultado"
                          >
                            🗑️ Limpiar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>

              <div className="text-center d-flex gap-3 justify-content-center flex-wrap mt-4">
                {Number(jornadaSeleccionada) <= 3 && (
                  <button className="btn btn-outline-warning btn-lg px-4" onClick={generarAzarFaseGruposCompleta}>
                    🎲✨ Azar Fase Grupos (3 Jornadas)
                  </button>
                )}
                <button className="btn btn-outline-info btn-lg px-4" onClick={generarAzar}>
                  🎲 Azar Solo Jornada {jornadaSeleccionada}
                </button>
                <button className="btn btn-outline-secondary btn-lg px-4" onClick={resetearTodos}>
                  🔄 Resetear
                </button>
                <button className="btn btn-warning btn-lg px-4" onClick={generarPDFTestigo}>
                  📄 PDF Testigo
                </button>
                <button className="btn btn-info btn-lg px-4" onClick={generarPDFCompleto}>
                  📊 PDF Final
                </button>
                <button className="btn btn-primary btn-lg px-4" onClick={guardarResultados}>
                  💾 Guardar Resultados
                </button>
                <button className="btn btn-success btn-lg px-4" onClick={calcularPuntajes}>
                  🧮 Calcular Puntajes
                </button>
                <button className="btn btn-warning btn-lg px-4" onClick={calcularGanadoresJornada}>
                  🏆 Calcular Ganadores
                </button>
                <button
                  className="btn btn-primary btn-lg px-4"
                  onClick={calcularGanadorFaseGrupos}
                  disabled={calculandoFaseGrupos}
                >
                  {calculandoFaseGrupos ? <><span className="spinner-border spinner-border-sm me-2"/></> : '🌟'} Ganador Fase de Grupos
                </button>
                <button
                  className="btn btn-success btn-lg px-4"
                  onClick={calcularAcumuladoFinal}
                  disabled={calculandoAcumuladoFinal}
                >
                  {calculandoAcumuladoFinal ? <><span className="spinner-border spinner-border-sm me-2"/></> : '🏆'} Campeón Acumulado Final
                </button>
                <button
                  className="btn btn-outline-secondary btn-lg"
                  onClick={() => {
                    const nuevaJornada = Number(jornadaSeleccionada) - 1;
                    if (nuevaJornada >= 1) setJornadaSeleccionada(String(nuevaJornada));
                  }}
                  disabled={Number(jornadaSeleccionada) <= 1}
                >
                  ← Anterior
                </button>
                <button
                  className="btn btn-outline-secondary btn-lg"
                  onClick={() => {
                    const nuevaJornada = Number(jornadaSeleccionada) + 1;
                    if (nuevaJornada <= 7) setJornadaSeleccionada(String(nuevaJornada));
                  }}
                  disabled={Number(jornadaSeleccionada) >= 7}
                >
                  Siguiente →
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {partidos.length === 0 && jornadaSeleccionada && (
        <div className="alert alert-info">
          <h5>📋 No hay partidos en esta jornada</h5>
          <p className="mb-0">El fixture aún no ha sido creado para esta jornada.</p>
        </div>
      )}

      {/* ===== SECCIÓN MEJORES TERCEROS ===== */}
      <div className="card mb-4 border-warning">
        <div className="card-header bg-warning text-dark">
          <h5 className="mb-0">🥉 8 Mejores Terceros — Clasificados a 16vos de Final</h5>
        </div>
        <div className="card-body">
          <p className="text-muted mb-3">
            Selecciona los <strong>8 mejores terceros</strong> de los 12 grupos. Solo los equipos marcados aquí
            (además de los 1ros y 2dos de cada grupo) recibirán puntos de clasificación.
            Los usuarios solo obtienen puntos si ese equipo aparece en sus posiciones 1°, 2° o 3° en su tabla virtual del grupo.
          </p>

          {Object.keys(tablasOficialesFaseGrupos).length === 0 ? (
            <div className="alert alert-info">
              Cargando tablas oficiales... (requiere que haya partidos de fase de grupos con resultados)
            </div>
          ) : (
            <>
              <div className="d-flex align-items-center justify-content-between mb-3">
                <span className="badge bg-warning text-dark fs-6">
                  {Object.keys(mejoresTercerosSeleccionados).length} / 8 seleccionados
                </span>
                {Object.keys(mejoresTercerosSeleccionados).length > 8 && (
                  <span className="text-danger fw-bold">⚠️ Máximo 8 grupos permitidos</span>
                )}
              </div>

              <div className="row g-3">
                {Object.entries(tablasOficialesFaseGrupos)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([grupo, tabla]) => {
                    const tercero = tabla[2]; // equipo en 3ra posición oficial
                    const cuarto = tabla[3];  // equipo en 4ta posición oficial
                    const seleccionadoEnEsteGrupo = mejoresTercerosSeleccionados[grupo];
                    // Mostrar los equipos 3ro y 4to para que el admin pueda seleccionar
                    const candidatos = [];
                    if (tercero) candidatos.push({ equipo: tercero.nombre, label: `3° ${tercero.nombre} (${tercero.puntos} pts, DG: ${tercero.dif > 0 ? '+' : ''}${tercero.dif})` });
                    if (cuarto) candidatos.push({ equipo: cuarto.nombre, label: `4° ${cuarto.nombre} (${cuarto.puntos} pts)` });
                    // También incluir los primeros 2 como opción por si hay empate técnico
                    if (tabla[0]) candidatos.unshift({ equipo: tabla[0].nombre, label: `1° ${tabla[0].nombre} (${tabla[0].puntos} pts)` });
                    if (tabla[1]) candidatos.splice(1, 0, { equipo: tabla[1].nombre, label: `2° ${tabla[1].nombre} (${tabla[1].puntos} pts)` });

                    return (
                      <div key={grupo} className="col-12 col-sm-6 col-md-4 col-lg-3">
                        <div className={`card h-100 shadow-sm ${seleccionadoEnEsteGrupo ? 'border-warning border-2' : ''}`}>
                          <div className={`card-header text-center fw-bold py-2 ${seleccionadoEnEsteGrupo ? 'bg-warning text-dark' : 'bg-light'}`}>
                            Grupo {grupo}
                            {seleccionadoEnEsteGrupo && <span className="ms-1">✅</span>}
                          </div>
                          <div className="card-body p-2">
                            {/* Tabla mini del grupo */}
                            <table className="table table-sm mb-2" style={{ fontSize: '0.78rem' }}>
                              <thead><tr><th>#</th><th>Equipo</th><th>Pts</th></tr></thead>
                              <tbody>
                                {tabla.slice(0, 4).map((eq, idx) => (
                                  <tr key={eq.nombre} className={idx < 2 ? 'table-success' : (seleccionadoEnEsteGrupo === eq.nombre ? 'table-warning' : '')}>
                                    <td>{idx + 1}</td>
                                    <td>
                                      <div className="d-flex align-items-center gap-1">
                                        <img src={getMundialLogoPorNombre(eq.nombre)} alt="" style={{ width: '16px', height: '16px', objectFit: 'contain' }} onError={(e) => { e.target.style.display = 'none'; }} />
                                        <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{eq.nombre}</span>
                                      </div>
                                    </td>
                                    <td>{eq.puntos}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {/* Select para elegir qué equipo de este grupo va como mejor tercero */}
                            <label className="form-label small fw-bold mb-1">Marcar como mejor 3°:</label>
                            <select
                              className="form-select form-select-sm"
                              value={seleccionadoEnEsteGrupo || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') {
                                  setMejoresTercerosSeleccionados(prev => { const n = { ...prev }; delete n[grupo]; return n; });
                                } else {
                                  setMejoresTercerosSeleccionados(prev => ({ ...prev, [grupo]: val }));
                                }
                              }}
                            >
                              <option value="">— Sin selección —</option>
                              {tabla.slice(0, 4).map((eq, idx) => (
                                <option key={eq.nombre} value={eq.nombre}>
                                  {idx + 1}° {eq.nombre} ({eq.puntos} pts, DG:{eq.dif > 0 ? '+' : ''}{eq.dif}, GF:{eq.gf})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="text-center mt-4">
                <button
                  className="btn btn-warning btn-lg px-5"
                  onClick={guardarMejoresTerceros}
                  disabled={guardandoTerceros || Object.keys(mejoresTercerosSeleccionados).length > 8}
                >
                  {guardandoTerceros ? (
                    <><span className="spinner-border spinner-border-sm me-2"></span>Guardando...</>
                  ) : (
                    <>💾 Guardar {Object.keys(mejoresTercerosSeleccionados).length} Mejores Terceros</>
                  )}
                </button>
                <p className="text-muted small mt-2">
                  Después de guardar, recalcula los puntajes de J3 para que los cambios se apliquen.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal general */}
      {showModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className={`modal-header ${modalType === 'error' ? 'bg-danger text-white' : 'bg-success text-white'}`}>
                <h5 className="modal-title">{modalType === 'error' ? '❌ Error' : '✅ Éxito'}</h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setShowModal(false)} />
              </div>
              <div className="modal-body">
                {modalMessage.split('\n').map((line, i) => (
                  <p key={i} className="mb-1">{line}</p>
                ))}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ganador Fase de Grupos — azul con confeti */}
      {showFaseGruposModal && faseGruposGanador && (
        <div className="modal show d-block" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,10,0.75)', zIndex: 1060 }}>
          <style>{`
            @keyframes fgConfetti {
              0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
              100% { transform: translateY(650px) rotate(540deg); opacity: 0; }
            }
          `}</style>
          <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1061 }}>
            {confettiPieces.map(p => (
              <div key={p.id} style={{
                position: 'absolute', left: p.left, top: '-20px',
                width: p.size, height: p.size, backgroundColor: p.color,
                borderRadius: p.isCircle ? '50%' : '2px',
                animation: `fgConfetti ${p.duration} ${p.delay} ease-in both infinite`,
              }} />
            ))}
          </div>
          <div className="modal-dialog modal-dialog-centered" style={{ position: 'relative', zIndex: 1062 }}>
            <div className="modal-content" style={{ border: '3px solid #1a5bc4', overflow: 'hidden' }}>
              <div className="modal-header" style={{ background: '#0d3b8e' }}>
                <h4 className="modal-title w-100 text-center fw-bold text-white fs-3">
                  🌟 GANADOR FASE DE GRUPOS 🌟
                </h4>
              </div>
              <div className="modal-body text-center py-5" style={{ background: 'linear-gradient(160deg,#e8f0fe 0%,#fff 55%,#dff0ff 100%)' }}>
                <div className="mb-4">
                  {faseGruposGanador.foto_perfil ? (
                    <img
                      src={faseGruposGanador.foto_perfil.startsWith('/') ? faseGruposGanador.foto_perfil : `/perfil/${faseGruposGanador.foto_perfil}`}
                      alt={faseGruposGanador.nombre}
                      className="rounded-circle shadow-lg"
                      style={{ width: '140px', height: '140px', objectFit: 'cover', border: '5px solid #ffd700' }}
                      onError={e => { e.target.src = '/perfil/default.png'; }}
                    />
                  ) : (
                    <div className="rounded-circle d-inline-flex align-items-center justify-content-center shadow-lg"
                      style={{ width: '140px', height: '140px', background: '#0d3b8e', fontSize: '3.5rem', color: 'white', border: '5px solid #ffd700' }}>
                      {faseGruposGanador.nombre.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <h2 className="fw-bold mb-1" style={{ color: '#0d3b8e' }}>{faseGruposGanador.nombre}</h2>
                <p className="text-muted fs-6 mb-3">Mejor acumulado en la Fase de Grupos (J1 + J2 + J3)</p>
                <span className="badge fs-5 px-4 py-2 shadow" style={{ background: '#0d3b8e', color: 'white' }}>
                  ⭐ {faseGruposGanador.puntos} puntos
                </span>
                <p className="mt-4 fw-bold fs-4 text-success">🏆 ¡Felicitaciones!</p>
              </div>
              <div className="modal-footer justify-content-center" style={{ background: '#0d3b8e' }}>
                <button className="btn btn-light btn-lg px-5" onClick={() => setShowFaseGruposModal(false)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pódio Acumulado Final */}
      {showPodioAcumulado && podioAcumulado.length > 0 && (
        <div className="modal show d-block" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,10,0.85)', zIndex: 1060 }}>
          <style>{`
            @keyframes podioConfetti {
              0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
              100% { transform: translateY(700px) rotate(600deg); opacity: 0; }
            }
            @keyframes podioFirework {
              0%   { transform: scale(0) translate(var(--fx,0px),var(--fy,0px)); opacity: 1; }
              80%  { opacity: 1; }
              100% { transform: scale(1) translate(var(--fx,0px),var(--fy,0px)); opacity: 0; }
            }
          `}</style>
          {/* Confeti */}
          <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1061 }}>
            {confettiPieces.map(p => (
              <div key={p.id} style={{
                position: 'absolute', left: p.left, top: '-20px',
                width: p.size, height: p.size, backgroundColor: p.color,
                borderRadius: p.isCircle ? '50%' : '2px',
                animation: `podioConfetti ${p.duration} ${p.delay} ease-in both infinite`,
              }} />
            ))}
            {/* Fuegos artificiales */}
            {[{x:'15%',y:'20%',c:'#ffd700'},{x:'85%',y:'15%',c:'#ff4444'},{x:'50%',y:'10%',c:'#44ccff'},{x:'25%',y:'50%',c:'#ff44cc'},{x:'75%',y:'45%',c:'#44ff88'}].map((fw,i) => (
              Array.from({length:12},(_,j) => {
                const angle = (j/12)*360;
                const dist = 40 + Math.random()*30;
                const fx = Math.cos(angle*Math.PI/180)*dist;
                const fy = Math.sin(angle*Math.PI/180)*dist;
                return (
                  <div key={`fw-${i}-${j}`} style={{
                    position:'absolute', left:fw.x, top:fw.y,
                    width:'6px', height:'6px', borderRadius:'50%', backgroundColor:fw.c,
                    '--fx':`${fx}px`, '--fy':`${fy}px`,
                    animation:`podioFirework 1.4s ${(i*0.35+j*0.04).toFixed(2)}s ease-out both infinite`,
                  }}/>
                );
              })
            ))}
          </div>
          <div className="modal-dialog modal-dialog-centered" style={{ position:'relative', zIndex:1062, maxWidth:'520px' }}>
            <div className="modal-content border-0" style={{ overflow:'hidden', borderRadius:'1rem', border:'3px solid #ffd700' }}>
              <div className="modal-header border-0 justify-content-center py-3" style={{ background:'linear-gradient(135deg,#1a237e,#0d3b8e)' }}>
                <h3 className="modal-title fw-bold text-white text-center">🌍 Campeones del Mundial 2026 🌍</h3>
              </div>
              <div className="modal-body py-4" style={{ background:'linear-gradient(160deg,#e8f0fe,#fff,#dff0ff)' }}>
                {[
                  { pos:1, emoji:'🥇', borderColor:'#ffd700', label:'CAMPEÓN' },
                  { pos:2, emoji:'🥈', borderColor:'#c0c0c0', label:'2° LUGAR' },
                  { pos:3, emoji:'🥉', borderColor:'#cd7f32', label:'3er LUGAR' },
                ].map(({ pos, emoji, borderColor, label }) => {
                  const g = podioAcumulado.find(x => x.posicion === pos);
                  if (!g) return null;
                  const fotoSrc = g.foto_perfil ? (g.foto_perfil.startsWith('/') ? g.foto_perfil : `/perfil/${g.foto_perfil}`) : null;
                  return (
                    <div key={pos} className="d-flex align-items-center gap-3 rounded p-3 mb-3 shadow-sm" style={{ border:`2px solid ${borderColor}`, background:'#fff' }}>
                      <div style={{ fontSize: pos===1?'2.8rem':'2.2rem', lineHeight:1, minWidth:'2.5rem', textAlign:'center' }}>{emoji}</div>
                      {fotoSrc ? (
                        <img src={fotoSrc} alt={g.nombre} className="rounded-circle" style={{ width:pos===1?'60px':'50px', height:pos===1?'60px':'50px', objectFit:'cover', border:`3px solid ${borderColor}`, flexShrink:0 }} onError={e=>{e.target.src='/perfil/default.png';}}/>
                      ) : (
                        <div className="rounded-circle d-flex align-items-center justify-content-center fw-bold" style={{ width:pos===1?'60px':'50px', height:pos===1?'60px':'50px', background:'#0d3b8e', color:'#fff', fontSize:'1.4rem', border:`3px solid ${borderColor}`, flexShrink:0 }}>{g.nombre.charAt(0)}</div>
                      )}
                      <div className="flex-grow-1">
                        <div className="text-uppercase fw-bold" style={{ color:borderColor, fontSize:'0.7rem', letterSpacing:'0.1em' }}>{label}</div>
                        <div className="fw-bold" style={{ fontSize: pos===1?'1.2rem':'1rem', color:'#0d3b8e' }}>{g.nombre}</div>
                      </div>
                      <div className="text-end">
                        <div className="fw-bold" style={{ color:borderColor, fontSize: pos===1?'1.5rem':'1.2rem' }}>{g.puntos_totales}</div>
                        <div style={{ fontSize:'0.65rem', color:'#666' }}>pts</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="modal-footer border-0 justify-content-center pb-4" style={{ background:'linear-gradient(135deg,#1a237e,#0d3b8e)' }}>
                <button className="btn btn-warning btn-lg px-5 fw-bold" onClick={()=>setShowPodioAcumulado(false)}>🎉 Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
