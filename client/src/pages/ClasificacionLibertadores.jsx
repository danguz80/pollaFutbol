import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import FireworksEffect from '../components/FireworksEffect';
import NavegacionLibertadores from '../components/NavegacionLibertadores';
import { getLogoEquipo } from '../utils/libertadoresLogos';

const API_URL = import.meta.env.VITE_API_URL;

export default function ClasificacionLibertadores() {
  const navigate = useNavigate();
  const [pronosticos, setPronosticos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const [jornadaAbierta, setJornadaAbierta] = useState(false);
  const [participantes, setParticipantes] = useState([]);
  
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
  
  // Clasificados para jornada 6
  const [clasificadosUsuarios, setClasificadosUsuarios] = useState({});
  const [clasificadosOficiales, setClasificadosOficiales] = useState([]);
  const [puntosClasificadosJ6, setPuntosClasificadosJ6] = useState({});

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
    cargarPronosticos();
    if (filtroJornada && filtroJornada !== '') {
      cargarRankings();
      cargarGanadoresJornada(parseInt(filtroJornada));
      
      // Si es jornada 6, cargar clasificados
      if (parseInt(filtroJornada) === 6) {
        cargarClasificados();
      }
    }
    // Cargar ganadores acumulado siempre (no depende de filtro)
    cargarGanadoresAcumulado();
  }, [filtroNombre, filtroPartido, filtroJornada]);

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
        axios.get(`${API_URL}/api/libertadores-clasificacion/partidos`, { headers }),
        axios.get(`${API_URL}/api/libertadores-clasificacion/jornadas`, { headers }),
        axios.get(`${API_URL}/api/libertadores-clasificacion/jugadores`, { headers })
      ]);

      setPartidos(partidosRes.data);
      setJornadas(jornadasRes.data);
      setJugadores(jugadoresRes.data);
      
      if (jornadasRes.data.length === 0) {
        // No hay jornadas disponibles
      }
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
      // Si es jornada 6, NO filtrar por jornada para obtener todas las jornadas 1-6
      // (necesarias para calcular tablas de clasificación)
      if (filtroJornada && parseInt(filtroJornada) !== 6) params.append('jornada_numero', filtroJornada);

      const response = await axios.get(
        `${API_URL}/api/libertadores-clasificacion/pronosticos?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

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
        setPronosticos([]);
      } else {
        // Si es admin o la jornada está cerrada, mostrar pronósticos normalmente
        if (!esAdmin) {
          const pronosticosFiltrados = response.data.filter(p => p.jornada.cerrada === true);
          setPronosticos(pronosticosFiltrados);
        } else {
          setPronosticos(response.data);
        }
        setParticipantes([]);
      }
    } catch (error) {
      console.error('Error cargando pronósticos:', error);
    } finally {
      setLoading(false);
    }
  };

  const cargarClasificados = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Cargar clasificados oficiales
      const oficialesRes = await axios.get(
        `${API_URL}/api/libertadores-clasificados/clasificados-oficiales`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setClasificadosOficiales(oficialesRes.data);
      
      // Cargar puntos de clasificados J6 desde la base de datos
      const puntosJ6Res = await axios.get(
        `${API_URL}/api/libertadores-clasificacion/puntos-clasificados-j6`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setPuntosClasificadosJ6(puntosJ6Res.data);
      
    } catch (error) {
      console.error('Error cargando clasificados:', error);
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
      : "¿Calcular puntajes de todas las jornadas de Libertadores?";
    
    if (!confirm(mensaje)) return;
    
    try {
      setCalculando(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/libertadores-calcular/puntos`, {
        method: "POST",
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jornadaNumero: filtroJornada || null })
      });
      const data = await res.json();
      
      alert(data.mensaje || "✅ Puntajes calculados correctamente");
      
      // Recargar pronósticos y rankings
      cargarPronosticos();
      cargarRankings();
    } catch (error) {
      console.error("Error al calcular puntajes:", error);
      alert("❌ Error al calcular puntajes");
    } finally {
      setCalculando(false);
    }
  };

  const cargarRankings = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Usar backend para todas las jornadas
      if (mostrarActual) {
        const actualRes = await axios.get(
          `${API_URL}/api/libertadores-rankings/actual`,
          { headers }
        );
        setJornadaActual(actualRes.data.jornada);
        setRankingAcumulado(actualRes.data.ranking);
        
        const jornadaRes = await axios.get(
          `${API_URL}/api/libertadores-rankings/jornada/${actualRes.data.jornada}`,
          { headers }
        );
        setRankingJornada(jornadaRes.data);
      } else {
        const jornadaNum = filtroJornada || 1;
        const [jornadaRes, acumuladoRes] = await Promise.all([
          axios.get(`${API_URL}/api/libertadores-rankings/jornada/${jornadaNum}`, { headers }),
          axios.get(`${API_URL}/api/libertadores-rankings/acumulado/${jornadaNum}`, { headers })
        ]);
        setRankingJornada(jornadaRes.data);
        setRankingAcumulado(acumuladoRes.data);
      }
    } catch (error) {
      console.error('Error cargando rankings:', error);
    }
  };



  const calcularGanadoresJornada = async () => {
    if (!filtroJornada) {
      alert('Por favor selecciona una jornada primero');
      return;
    }

    if (!confirm(`¿Calcular los ganadores de la jornada ${filtroJornada} y generar PDF con resultados?\n\nEl PDF incluirá: pronósticos, resultados reales, puntos, rankings, fotos de perfil y ganadores. Se enviará automáticamente por email.`)) {
      return;
    }

    try {
      setCalculandoGanadores(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const response = await axios.post(
        `${API_URL}/api/libertadores-ganadores-jornada/${filtroJornada}`,
        {},
        { headers }
      );

      setGanadores(response.data);
      setMostrarGanadores(true);
      
      // Mostrar modal con resultado
      if (response.data.pdfGenerado) {
        setModalType("success");
        setModalMessage(`✅ ${response.data.mensaje}\n\n📧 PDF enviado por email con:\n• Ganadores de la jornada (con fotos)\n• Ranking de la jornada\n• Ranking acumulado\n• Pronósticos con resultados\n• Fotos de perfil de todos los jugadores`);
      } else {
        setModalType("warning");
        setModalMessage(`⚠️ ${response.data.mensaje}`);
      }
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
        `${API_URL}/api/libertadores-ganadores-jornada/${jornadaNumero}`
      );

      if (response.data.ganadores && response.data.ganadores.length > 0) {
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
    if (!confirm('¿Calcular el/los CAMPEÓN/CAMPEONES del ranking acumulado (TODAS LAS JORNADAS)?\n\nSe generará un PDF con los resultados y se enviará por email.')) {
      return;
    }

    try {
      setCalculandoGanadoresAcumulado(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const response = await axios.post(
        `${API_URL}/api/libertadores-ganadores-jornada/acumulado`,
        {},
        { headers }
      );

      setGanadoresAcumulado(response.data);
      setMostrarGanadoresAcumulado(true);
      
      // Recargar rankings
      cargarRankings();
    } catch (error) {
      console.error('Error calculando ganadores acumulado:', error);
      alert('❌ Error al calcular el campeón del ranking acumulado');
    } finally {
      setCalculandoGanadoresAcumulado(false);
    }
  };

  const cargarGanadoresAcumulado = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/api/libertadores-ganadores-jornada/acumulado`
      );

      if (response.data.ganadores && response.data.ganadores.length > 0) {
        setGanadoresAcumulado(response.data);
      } else {
        setGanadoresAcumulado(null);
      }
    } catch (error) {
      console.error('Error cargando ganadores acumulado:', error);
      setGanadoresAcumulado(null);
    }
  };

  const getResultadoClase = (pronostico) => {
    const { partido, pronostico: pron, puntos } = pronostico;
    
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
      
      // Para jornada 6, separar pronósticos de jornada 6 vs jornadas 1-5
      const pronosticosParaMostrar = parseInt(filtroJornada) === 6 
        ? pronosticos.filter(p => p.jornada.numero === 6)
        : pronosticos;
      
      const pronosticosParaTablas = pronosticos; // Todos los pronósticos para calcular tablas
      
      pronosticosParaMostrar.forEach(p => {
        const key = `${p.usuario.id}`;
        if (!grupos[key]) {
          grupos[key] = {
            usuario_id: p.usuario.id,
            jugador: p.usuario.nombre,
            foto_perfil: p.usuario.foto_perfil,
            jornada: p.jornada.numero,
            pronosticos: [],
            pronosticosTotales: [] // Todos los pronósticos incluyendo jornadas anteriores
          };
        }
        grupos[key].pronosticos.push(p);
      });
      
      // Agregar pronosticosTotales a cada grupo
      pronosticosParaTablas.forEach(p => {
        const key = `${p.usuario.id}`;
        if (grupos[key]) {
          grupos[key].pronosticosTotales.push(p);
        }
      });
      
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
              // Obtener clasificados oficiales del grupo (solo top 2 para octavos, sin 3ero)
              const clasificadosOficialesGrupo = clasificadosOficiales
                .filter(c => c.grupo === grupoLetra && c.posicion <= 2)
                .map(c => c.equipo_nombre);
              
              // Top 2 del usuario
              const equiposUsuario = [tablaVirtual[0].nombre, tablaVirtual[1].nombre];
              
              // Separar aciertos y fallos
              const aciertos = equiposUsuario.filter(e => clasificadosOficialesGrupo.includes(e));
              const fallos = equiposUsuario.filter(e => !clasificadosOficialesGrupo.includes(e));
              
              // Ordenar equipos pronosticados: aciertos primero
              const equiposOrdenados = [...aciertos, ...fallos];
              
              // Ordenar equipos oficiales para alinear con pronósticos
              // Los que coinciden van primero (en el mismo orden que aciertos)
              // Los que no coinciden van después
              const oficialesOrdenados = [
                ...aciertos, // Los mismos equipos que acertó (alineados)
                ...clasificadosOficialesGrupo.filter(e => !equiposUsuario.includes(e)) // Los oficiales que no pronosticó
              ];
              
              // Calcular puntos de cada línea
              const puntosDetalle = equiposOrdenados.map(e => 
                clasificadosOficialesGrupo.includes(e) ? 2 : 0
              );
              
              // Calcular puntos totales
              const totalPuntos = aciertos.length * 2;
              
              // Agregar UNA SOLA fila para este grupo con los 2 clasificados a OCTAVOS
              grupo.pronosticos.push({
                id: `clasif-octavos-${grupo.usuario_id}-${grupoLetra}`,
                esClasificado: true,
                tipoClasificado: 'octavos',
                usuario: { id: grupo.usuario_id, nombre: grupo.jugador },
                jornada: { numero: 6, cerrada: true },
                partido: {
                  grupo: grupoLetra,
                  local: { nombre: `Clasificados a Octavos de Libertadores Grupo ${grupoLetra}` },
                  visita: { nombre: '' }
                },
                // Arrays con 2 equipos cada uno
                equipos_pronosticados: equiposOrdenados, // Aciertos primero
                equipos_oficiales: oficialesOrdenados, // Alineados con pronósticos
                // Array con puntos de cada equipo
                puntos_detalle: puntosDetalle,
                puntos: totalPuntos
              });
              
              // Agregar fila para 3er lugar (Play-offs Sudamericana)
              if (tablaVirtual.length >= 3) {
                const terceroUsuario = tablaVirtual[2].nombre;
                const clasificadosOficialesTerceros = clasificadosOficiales
                  .filter(c => c.grupo === grupoLetra && c.posicion === 3)
                  .map(c => c.equipo_nombre);
                
                const terceroOficial = clasificadosOficialesTerceros.length > 0 ? clasificadosOficialesTerceros[0] : null;
                const puntosPlayoffs = (terceroOficial && terceroUsuario === terceroOficial) ? 2 : 0;
                
                grupo.pronosticos.push({
                  id: `clasif-playoffs-${grupo.usuario_id}-${grupoLetra}`,
                  esClasificado: true,
                  tipoClasificado: 'playoffs',
                  usuario: { id: grupo.usuario_id, nombre: grupo.jugador },
                  jornada: { numero: 6, cerrada: true },
                  partido: {
                    grupo: grupoLetra,
                    local: { nombre: `Clasificados a Playoffs Sudamericana Grupo ${grupoLetra}` },
                    visita: { nombre: '' }
                  },
                  equipo_pronosticado: terceroUsuario,
                  equipo_oficial: terceroOficial,
                  puntos: puntosPlayoffs
                });
              }
            }
          });
        });
      }
      
      // Ordenar pronósticos dentro de cada grupo
      Object.values(grupos).forEach(grupo => {
        grupo.pronosticos.sort((a, b) => {
          // Las filas de clasificados van siempre al final, ordenadas por grupo y posición
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
          
          // Para jornadas 7-10, ordenar por cruce (equipos) y luego IDA antes de VUELTA
          if (a.jornada.numero >= 7 && a.jornada.numero <= 10) {
            // Para J10: FINAL siempre al final
            if (grupo.jornada === 10) {
              const esFinalA = a.partido.tipo_partido === 'FINAL';
              const esFinalB = b.partido.tipo_partido === 'FINAL';
              
              if (esFinalA && !esFinalB) return 1;  // A es FINAL, va al final
              if (!esFinalA && esFinalB) return -1; // B es FINAL, va al final
              
              // Si ninguno es FINAL, ordenar por cruce
              if (!esFinalA && !esFinalB) {
                const getClaveEquipos = (p) => {
                  return [p.partido.local.nombre, p.partido.visita.nombre].sort().join('-');
                };
                const claveA = getClaveEquipos(a);
                const claveB = getClaveEquipos(b);
                
                if (claveA !== claveB) {
                  return claveA.localeCompare(claveB);
                }
                
                // Mismo cruce: IDA antes de VUELTA
                const ordenTipo = { 'IDA': 1, 'VUELTA': 2 };
                return (ordenTipo[a.partido.tipo_partido] || 999) - (ordenTipo[b.partido.tipo_partido] || 999);
              }
              
              return 0; // Ambos son FINAL (no debería pasar)
            }
            
            // Para otras jornadas (7, 8, 9): ordenar por cruce normal
            const getClaveEquipos = (p) => {
              return [p.partido.local.nombre, p.partido.visita.nombre].sort().join('-');
            };
            const claveA = getClaveEquipos(a);
            const claveB = getClaveEquipos(b);
            
            if (claveA !== claveB) {
              return claveA.localeCompare(claveB);
            }
            
            // Mismo cruce: IDA antes de VUELTA
            const ordenTipo = { 'IDA': 1, 'VUELTA': 2, 'FINAL': 3 };
            return (ordenTipo[a.partido.tipo_partido] || 999) - (ordenTipo[b.partido.tipo_partido] || 999);
          }
          
          // Para otras jornadas, ordenar por fecha de partido
          return new Date(a.partido.fecha) - new Date(b.partido.fecha);
        });
        
        // CALCULAR Y GUARDAR EL PUNTAJE TOTAL DEL GRUPO (para usar en ranking)
        // Sumar puntos de partidos normales
        const puntosPartidos = grupo.pronosticos
          .filter(p => !p.esClasificado)
          .reduce((sum, p) => sum + (p.puntos || 0), 0);
        
        // Sumar puntos reales de clasificados J6 desde la base de datos (octavos y playoffs)
        const puntosClasificadosJ6Real = puntosClasificadosJ6[grupo.usuario_id] || 0;
        
        // Sumar puntos de clasificación de otras jornadas (7-10)
        const puntosClasificacion = grupo.pronosticos
          .filter((p, index) => {
            const jornada = p.jornada.numero;
            if (jornada === 8) return true;
            if (jornada === 9) return index % 2 === 1;
            if (jornada === 10) return index === 1 || index === 3 || index === 4;
            return false;
          })
          .reduce((sum, p) => sum + (p.puntos_clasificacion || 0), 0);
        
        let puntosCuadroFinal = 0;
        let puntosPartidoFinal = 0;
        
        if (grupo.jornada === 10 && grupo.pronosticos.length > 0) {
          const primerPronostico = grupo.pronosticos[0];
          puntosCuadroFinal = (primerPronostico.puntos_campeon || 0) + (primerPronostico.puntos_subcampeon || 0);
          
          if (primerPronostico.final_virtual_local && primerPronostico.final_virtual_visita) {
            const partidoFinalReal = partidos.find(p => p.id === 456);
            
            if (partidoFinalReal && partidoFinalReal.goles_local !== null && partidoFinalReal.goles_visita !== null) {
              const equiposPronosticados = {
                local: primerPronostico.final_virtual_local,
                visita: primerPronostico.final_virtual_visita,
                goles_local: primerPronostico.final_virtual_goles_local,
                goles_visita: primerPronostico.final_virtual_goles_visita
              };
              
              const equiposReales = {
                local: partidoFinalReal.nombre_local,
                visita: partidoFinalReal.nombre_visita
              };
              
              const coincidePartido = (
                (equiposPronosticados.local === equiposReales.local && equiposPronosticados.visita === equiposReales.visita) ||
                (equiposPronosticados.local === equiposReales.visita && equiposPronosticados.visita === equiposReales.local)
              );
              
              if (coincidePartido) {
                const difPronosticada = equiposPronosticados.goles_local - equiposPronosticados.goles_visita;
                const difReal = partidoFinalReal.goles_local - partidoFinalReal.goles_visita;
                const bonus = partidoFinalReal.bonus || 1;
                
                if (equiposPronosticados.goles_local === partidoFinalReal.goles_local && 
                    equiposPronosticados.goles_visita === partidoFinalReal.goles_visita) {
                  puntosPartidoFinal = 10 * bonus;
                }
                else if (difPronosticada === difReal) {
                  puntosPartidoFinal = 7 * bonus;
                }
                else if ((difPronosticada > 0 && difReal > 0) || (difPronosticada < 0 && difReal < 0) || (difPronosticada === 0 && difReal === 0)) {
                  puntosPartidoFinal = 4 * bonus;
                }
              }
            }
          }
        }
        
        grupo.puntaje_total = puntosPartidos + puntosClasificadosJ6Real + puntosClasificacion + puntosCuadroFinal + puntosPartidoFinal;
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
        <h1 className="display-5 fw-bold">📋 Clasificación - Pronósticos Libertadores</h1>
        <p className="text-muted">Visualiza todos los pronósticos entregados por los jugadores</p>
      </div>

      {/* Botonera Principal */}
      <NavegacionLibertadores />

      {/* Mostrar ganador acumulado guardado si existe */}
      {ganadoresAcumulado && ganadoresAcumulado.ganadores && ganadoresAcumulado.ganadores.length > 0 && !mostrarGanadoresAcumulado && (
        <div className="alert alert-warning text-center mb-4">
          <h5 className="mb-3">
            🏆 Top 3 Ranking Acumulado
          </h5>
          <div className="d-flex justify-content-center gap-3 flex-wrap">
            {ganadoresAcumulado.ganadores.map((ganador, index) => (
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
                <span className="badge bg-warning text-dark">{ganador.puntaje} puntos</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mostrar ganadores guardados si existen (sin modal) */}
      {ganadores && ganadores.ganadores.length > 0 && !mostrarGanadores && (
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
                <span className="badge bg-warning text-dark">{ganador.puntaje} puntos</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botón Calcular Puntos (Solo Admin) */}
      {esAdmin && (
        <div className="mb-4 text-center">
          <button 
            className="btn btn-success btn-lg px-5"
            onClick={calcularPuntos}
            disabled={calculando}
          >
            {calculando ? '⏳ Calculando...' : '🧮 Calcular Puntos'}
          </button>
          <p className="text-muted mt-2 mb-0">
            <small>Esto comparará todos los pronósticos con los resultados reales y asignará puntos según el sistema de puntuación</small>
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
                    {partido.tipo === 'IDA' && ' - IDA'}
                    {partido.tipo === 'VUELTA' && ' - VUELTA'}
                    {partido.tipo === 'FINAL' && ' - FINAL'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Botones de acciones */}
          <div className="text-center mt-3 d-flex justify-content-center gap-2 flex-wrap">
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
                    className="btn btn-success"
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
                  className="btn btn-warning text-dark fw-bold"
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
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
        </div>
      ) : !esAdmin && jornadaAbierta && participantes.length > 0 ? (
        /* Mostrar solo participantes si la jornada está abierta */
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-warning text-dark">
            <h5 className="mb-0">⏳ Jornada Abierta - Participantes que han subido pronósticos</h5>
          </div>
          <div className="card-body">
            <p className="text-muted mb-4">
              Esta jornada aún está abierta. Los pronósticos se revelarán cuando la jornada se cierre.
            </p>
            <div className="row g-3">
              {participantes.map((participante) => (
                <div key={participante.id} className="col-6 col-sm-4 col-md-3 col-lg-2">
                  <div className="card h-100 text-center">
                    <div className="card-body p-3">
                      <img
                        src={participante.foto_perfil || '/perfil/default.png'}
                        alt={participante.nombre}
                        className="rounded-circle mb-2"
                        style={{ width: '80px', height: '80px', objectFit: 'cover' }}
                        onError={(e) => {
                          e.target.src = '/perfil/default.png';
                        }}
                      />
                      <p className="mb-0 small fw-bold">{participante.nombre}</p>
                      <span className="badge bg-success mt-1">✓ Pronóstico enviado</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-4">
              <p className="text-muted mb-0">
                <strong>{participantes.length}</strong> {participantes.length === 1 ? 'participante ha' : 'participantes han'} enviado sus pronósticos
              </p>
            </div>
          </div>
        </div>
      ) : pronosticos.length === 0 ? (
        <div className="alert alert-info text-center">
          No se encontraron pronósticos con los filtros aplicados
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
            <table className="table table-bordered table-hover">
              <thead className="table-dark">
                <tr>
                  <th className="text-center" style={{ width: '150px' }}>Jugador</th>
                  <th className="text-center" style={{ width: '100px' }}>Jornada</th>
                  <th className="text-center" style={{ width: '80px' }}>Grupo</th>
                  <th className="text-center">Partido</th>
                  <th className="text-center" style={{ width: '100px' }}>Pronóstico</th>
                  <th className="text-center" style={{ width: '100px' }}>Resultado</th>
                  <th className="text-center" style={{ width: '60px' }}>Bonus</th>
                  <th className="text-center" style={{ width: '80px' }}>Puntos</th>
                </tr>
              </thead>
              <tbody>
                {agruparPronosticos().map((grupo, grupoIndex) => (
                  <React.Fragment key={`grupo-${grupo.usuario_id}-${grupoIndex}`}>
                    {/* Encabezado para cada grupo de usuario */}
                    {grupoIndex > 0 && (
                      <tr className="table-dark">
                        <th className="text-center" style={{ width: '150px' }}>Jugador</th>
                        <th className="text-center" style={{ width: '100px' }}>Jornada</th>
                        <th className="text-center" style={{ width: '80px' }}>Grupo</th>
                        <th className="text-center">Partido</th>
                        <th className="text-center" style={{ width: '100px' }}>Pronóstico</th>
                        <th className="text-center" style={{ width: '100px' }}>Resultado</th>
                        <th className="text-center" style={{ width: '60px' }}>Bonus</th>
                        <th className="text-center" style={{ width: '80px' }}>Puntos</th>
                      </tr>
                    )}
                    {grupo.pronosticos.map((pronostico, index) => (
                      <React.Fragment key={`pronostico-${pronostico.id}-${index}`}>
                        {/* SI ES FILA DE CLASIFICADO - Renderizado especial */}
                        {pronostico.esClasificado ? (
                          <tr className={pronostico.puntos > 0 ? 'table-success' : 'table-danger'}>
                            <td className="fw-bold">{pronostico.usuario.nombre}</td>
                            <td className="text-center">
                              <span className="badge bg-primary">
                                Jornada {pronostico.jornada.numero}
                              </span>
                            </td>
                            <td className="text-center">
                              <span className="badge bg-warning text-dark">Clasificados</span>
                            </td>
                            <td>
                              <div className="fw-bold text-center">
                                {pronostico.partido.local.nombre}
                              </div>
                            </td>
                            <td className="text-center">
                              {/* Renderizado condicional según tipo de clasificado */}
                              {pronostico.tipoClasificado === 'playoffs' ? (
                                // Para playoffs: mostrar 1 solo equipo
                                <div className={`fw-bold ${pronostico.puntos > 0 ? 'text-success' : 'text-danger'}`}>
                                  {pronostico.equipo_pronosticado}
                                </div>
                              ) : (
                                // Para octavos: mostrar 2 equipos pronosticados (aciertos primero)
                                pronostico.equipos_pronosticados?.map((equipo, idx) => (
                                  <div 
                                    key={idx} 
                                    className={`fw-bold ${pronostico.puntos_detalle[idx] > 0 ? 'text-success' : 'text-danger'}`}
                                    style={{ 
                                      borderBottom: idx === 0 ? '1px solid #ddd' : 'none',
                                      padding: '4px 0'
                                    }}
                                  >
                                    {equipo}
                                  </div>
                                ))
                              )}
                            </td>
                            <td className="text-center">
                              {/* Renderizado condicional según tipo de clasificado */}
                              {pronostico.tipoClasificado === 'playoffs' ? (
                                // Para playoffs: mostrar 1 solo equipo
                                <div className="fw-bold">
                                  {pronostico.equipo_oficial || '-'}
                                </div>
                              ) : (
                                // Para octavos: mostrar 2 equipos oficiales
                                pronostico.equipos_oficiales?.map((equipo, idx) => (
                                  <div 
                                    key={idx}
                                    className="fw-bold"
                                    style={{ 
                                      borderBottom: idx === 0 ? '1px solid #ddd' : 'none',
                                      padding: '4px 0'
                                    }}
                                  >
                                    {equipo}
                                  </div>
                                ))
                              )}
                            </td>
                            <td className="text-center">
                              {/* Columna Bonus vacía */}
                            </td>
                            <td className="text-center">
                              {/* Renderizado condicional según tipo de clasificado */}
                              {pronostico.tipoClasificado === 'playoffs' ? (
                                // Para playoffs: mostrar puntos totales
                                pronostico.puntos > 0 ? (
                                  <span className="badge bg-success">
                                    +{pronostico.puntos} pts
                                  </span>
                                ) : (
                                  <span className="badge bg-secondary">0 pts</span>
                                )
                              ) : (
                                // Para octavos: mostrar puntos de cada equipo
                                pronostico.puntos_detalle?.map((pts, idx) => (
                                  <div 
                                    key={idx}
                                    style={{ 
                                      borderBottom: idx === 0 ? '1px solid #ddd' : 'none',
                                      padding: '4px 0'
                                    }}
                                  >
                                    {pts > 0 ? (
                                      <span className="badge bg-success">
                                        +{pts} pts
                                      </span>
                                    ) : (
                                      <span className="badge bg-secondary">0 pts</span>
                                    )}
                                  </div>
                                ))
                              )}
                            </td>
                          </tr>
                        ) : (
                          /* FILA NORMAL DE PARTIDO */
                          <>
                            <tr key={pronostico.id} className={getResultadoClase(pronostico)}>
                              <td className="fw-bold">{pronostico.usuario.nombre}</td>
                              <td className="text-center">
                                <span className="badge bg-primary">
                                  Jornada {pronostico.jornada.numero}
                                </span>
                              </td>
                              <td className="text-center">
                                {pronostico.jornada.numero >= 7 && pronostico.jornada.numero <= 10 && pronostico.partido.tipo_partido ? (
                                  <span className={`badge ${
                                    pronostico.partido.tipo_partido === 'IDA' ? 'bg-info' : 
                                    pronostico.partido.tipo_partido === 'FINAL' ? 'bg-warning text-dark' : 
                                    'bg-success'
                                  }`}>
                                    {pronostico.partido.tipo_partido}
                                  </span>
                                ) : pronostico.partido.grupo ? (
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
                                        {formatearNombreEquipo(pronostico.partido.local.nombre, pronostico.partido.local.pais)}
                                      </small>
                                      {getLogoEquipo(pronostico.partido.local.nombre) && (
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
                                      {getLogoEquipo(pronostico.partido.visita.nombre) && (
                                        <img 
                                          src={getLogoEquipo(pronostico.partido.visita.nombre)} 
                                          alt={pronostico.partido.visita.nombre}
                                          style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                                          onError={(e) => e.target.style.display = 'none'}
                                        />
                                      )}
                                      <small className="fw-bold text-start">
                                        {formatearNombreEquipo(pronostico.partido.visita.nombre, pronostico.partido.visita.pais)}
                                      </small>
                                    </div>
                                  </div>
                                  {/* Si es FINAL en J10, mostrar equipos pronosticados debajo */}
                                  {pronostico.partido.tipo_partido === 'FINAL' && pronostico.equipos_pronosticados_final && (
                                    <div className="text-primary small mt-1 text-center" style={{fontSize: '0.75rem'}}>
                                      Pronosticado: {pronostico.equipos_pronosticados_final.equipo_local} vs {pronostico.equipos_pronosticados_final.equipo_visita}
                                      {' '}
                                      {pronostico.equipos_pronosticados_final.equipo_local === pronostico.partido.local.nombre && 
                                       pronostico.equipos_pronosticados_final.equipo_visita === pronostico.partido.visita.nombre 
                                       ? <span className="text-success">✓ Coincide</span>
                                       : <span className="text-danger">✗ No coincide</span>}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="text-center fw-bold fs-5">
                                {/* Para FINAL en J10, mostrar pronóstico virtual */}
                                {pronostico.partido.tipo_partido === 'FINAL' && pronostico.equipos_pronosticados_final ? (
                                  <>
                                    {pronostico.equipos_pronosticados_final.goles_local} - {pronostico.equipos_pronosticados_final.goles_visita}
                                    {pronostico.equipos_pronosticados_final.penales_local !== null && 
                                     pronostico.equipos_pronosticados_final.penales_visita !== null && (
                                      <div className="text-muted small">
                                        Pen: {pronostico.equipos_pronosticados_final.penales_local} - {pronostico.equipos_pronosticados_final.penales_visita}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {pronostico.pronostico.local} - {pronostico.pronostico.visita}
                                    {pronostico.partido.tipo_partido === 'VUELTA' && 
                                     pronostico.pronostico.penales_local !== null && 
                                     pronostico.pronostico.penales_visita !== null && (
                                      <div className="text-muted small">
                                        Pen: {pronostico.pronostico.penales_local} - {pronostico.pronostico.penales_visita}
                                      </div>
                                    )}
                                  </>
                                )}
                              </td>
                              <td className="text-center fw-bold fs-5">
                                {pronostico.jornada.cerrada && pronostico.partido.resultado.local !== null && pronostico.partido.resultado.visita !== null ? (
                                  <>
                                    {pronostico.partido.resultado.local} - {pronostico.partido.resultado.visita}
                                    {pronostico.partido.tipo_partido === 'VUELTA' && 
                                     pronostico.partido.resultado.penales_local !== null && 
                                     pronostico.partido.resultado.penales_visita !== null && (
                                      <div className="text-muted small">
                                        Pen: {pronostico.partido.resultado.penales_local} - {pronostico.partido.resultado.penales_visita}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-muted">Pendiente</span>
                                )}
                              </td>
                              <td className="text-center fw-bold">
                                <span className={pronostico.partido.bonus && pronostico.partido.bonus > 1 ? "badge bg-info text-white" : "text-muted"}>
                                  x{pronostico.partido.bonus || 1}
                                </span>
                              </td>
                              <td className="text-center fw-bold">
                                {pronostico.puntos !== null ? (
                                  <span className="badge bg-warning text-dark fs-6">
                                    {pronostico.puntos} pts
                                  </span>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                            </tr>
                            
                            {/* Fila de "Equipo que avanza" - Solo en jornadas 8+ y solo en partidos de VUELTA */}
                            {(() => {
                              const jornada = pronostico.jornada.numero;
                              // Usar el campo tipo_partido del backend para detectar si es VUELTA
                              const esPartidoVuelta = pronostico.partido.tipo_partido === 'VUELTA';
                              
                              return esPartidoVuelta && pronostico.equipo_pronosticado_avanza && (
                                <tr className={pronostico.puntos_clasificacion > 0 ? 'table-success' : pronostico.partido.resultado.local !== null ? 'table-danger' : 'table-secondary'}>
                                  <td colSpan="4">
                                    <div className="fw-bold mb-2 text-center">⚡ Equipo que avanza</div>
                                    {(jornada === 8 || jornada === 9 || jornada === 10) && pronostico.partido_ida && (
                                      <div className="d-flex justify-content-between small">
                                        {/* PRONÓSTICO (Izquierda) */}
                                        <div className="text-start" style={{flex: 1}}>
                                          <div className="text-primary fw-bold mb-2">Pronosticado</div>
                                          <div className="mb-1">
                                            <strong>IDA:</strong> {pronostico.partido_ida.nombre_local} {pronostico.partido_ida.pronostico_ida_local !== null && pronostico.partido_ida.pronostico_ida_local !== undefined ? pronostico.partido_ida.pronostico_ida_local : '?'} - {pronostico.partido_ida.pronostico_ida_visita !== null && pronostico.partido_ida.pronostico_ida_visita !== undefined ? pronostico.partido_ida.pronostico_ida_visita : '?'} {pronostico.partido_ida.nombre_visita}
                                          </div>
                                          <div>
                                            <strong>Global:</strong> {pronostico.partido.local.nombre} {
                                              (pronostico.pronostico.local || 0) + (pronostico.partido_ida.pronostico_ida_visita || 0)
                                            } - {
                                              (pronostico.pronostico.visita || 0) + (pronostico.partido_ida.pronostico_ida_local || 0)
                                            } {pronostico.partido.visita.nombre}
                                          </div>
                                        </div>
                                        
                                        {/* REAL (Derecha) - Solo si la jornada está cerrada */}
                                        {pronostico.jornada.cerrada && pronostico.partido.resultado.local !== null && (
                                          <div className="text-end text-muted" style={{flex: 1}}>
                                            <div className="text-success fw-bold mb-2">Real</div>
                                            <div className="mb-1">
                                              <strong>IDA:</strong> {pronostico.partido_ida.nombre_local} {pronostico.partido_ida.resultado_ida_local !== null ? pronostico.partido_ida.resultado_ida_local : '?'} - {pronostico.partido_ida.resultado_ida_visita !== null ? pronostico.partido_ida.resultado_ida_visita : '?'} {pronostico.partido_ida.nombre_visita}
                                            </div>
                                            <div>
                                              <strong>Global:</strong> {pronostico.partido.local.nombre} {
                                                pronostico.partido.resultado.local + (pronostico.partido_ida.resultado_ida_visita || 0)
                                              } {
                                                pronostico.partido.resultado.penales_local !== null ? `(${pronostico.partido.resultado.penales_local} pen)` : ''
                                              } - {
                                                pronostico.partido.resultado.visita + (pronostico.partido_ida.resultado_ida_local || 0)
                                              } {
                                                pronostico.partido.resultado.penales_visita !== null ? `(${pronostico.partido.resultado.penales_visita} pen)` : ''
                                              } {pronostico.partido.visita.nombre}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="text-center fw-bold">
                                    {pronostico.equipo_pronosticado_avanza}
                                  </td>
                                  <td className="text-center">
                                    {pronostico.jornada.cerrada && pronostico.partido.resultado.local !== null ? (
                                      <div className="fw-bold text-success">
                                        {pronostico.equipo_real_avanza || '?'}
                                      </div>
                                    ) : (
                                      <span className="text-muted">Pendiente</span>
                                    )}
                                  </td>
                                  <td className="text-center">
                                    {/* Columna Bonus vacía */}
                                  </td>
                                  <td className="text-center fw-bold">
                                    {pronostico.puntos_clasificacion !== null && pronostico.puntos_clasificacion !== undefined ? (
                                      pronostico.puntos_clasificacion > 0 ? (
                                        <span className="badge bg-success fs-6">
                                          +{pronostico.puntos_clasificacion} pts
                                        </span>
                                      ) : (
                                        <span className="badge bg-secondary">0 pts</span>
                                      )
                                    ) : (
                                      <span className="text-muted">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })()}
                          </>
                        )}
                      </React.Fragment>
                    ))}
                    
                    {/* FILA 7: PARTIDO FINAL - Solo para Jornada 10 */}
                    {grupo.jornada === 10 && grupo.pronosticos.length > 0 && (() => {
                      // Tomar el primer pronóstico para obtener los datos de la FINAL virtual
                      const primerPronostico = grupo.pronosticos[0];
                      
                      // Verificar que existan datos de FINAL virtual
                      if (!primerPronostico.final_virtual_local || !primerPronostico.final_virtual_visita) {
                        return null;
                      }
                      
                      const equiposPronosticados = {
                        local: primerPronostico.final_virtual_local,
                        visita: primerPronostico.final_virtual_visita,
                        goles_local: primerPronostico.final_virtual_goles_local,
                        goles_visita: primerPronostico.final_virtual_goles_visita,
                        penales_local: primerPronostico.final_virtual_penales_local,
                        penales_visita: primerPronostico.final_virtual_penales_visita
                      };
                      
                      // TEMPORAL: Buscar por id 456 ya que tipo_partido no está llegando del backend
                      const partidoFinalReal = partidos.find(p => p.id === 456);
                      
                      // Si no existe el partido FINAL en la BD, no mostrar
                      if (!partidoFinalReal) {
                        return null;
                      }
                      
                      const equiposReales = {
                        local: partidoFinalReal.nombre_local,
                        visita: partidoFinalReal.nombre_visita
                      };
                      
                      // Verificar si coinciden los equipos (en cualquier orden)
                      const coincidePartido = (
                        (equiposPronosticados.local === equiposReales.local && equiposPronosticados.visita === equiposReales.visita) ||
                        (equiposPronosticados.local === equiposReales.visita && equiposPronosticados.visita === equiposReales.local)
                      );
                      
                      // Determinar si hay resultado real y si la jornada está cerrada
                      const hayResultado = partidoFinalReal.goles_local !== null && partidoFinalReal.goles_visita !== null;
                      const jornada = jornadas.find(j => j.id === primerPronostico.jornada.id);
                      const jornadaCerrada = jornada?.cerrada || false;
                      
                      // Calcular puntos si hay resultado y coinciden los equipos
                      let puntosPartidoFinal = 0;
                      if (hayResultado && coincidePartido) {
                        // SISTEMA DE PUNTOS ESPECIAL PARA LA FINAL
                        const golesPronosticadosLocal = equiposPronosticados.goles_local;
                        const golesPronosticadosVisita = equiposPronosticados.goles_visita;
                        const golesRealesLocal = partidoFinalReal.goles_local;
                        const golesRealesVisita = partidoFinalReal.goles_visita;
                        
                        // Diferencia de goles
                        const difPronosticada = golesPronosticadosLocal - golesPronosticadosVisita;
                        const difReal = golesRealesLocal - golesRealesVisita;
                        
                        // Obtener bonus del partido (x1, x2, x3)
                        const bonus = partidoFinalReal.bonus || 1;
                        
                        // 10 puntos si acierta resultado exacto
                        if (golesPronosticadosLocal === golesRealesLocal && golesPronosticadosVisita === golesRealesVisita) {
                          puntosPartidoFinal = 10 * bonus;
                        }
                        // 7 puntos si acierta diferencia de goles
                        else if (difPronosticada === difReal) {
                          puntosPartidoFinal = 7 * bonus;
                        }
                        // 4 puntos si acierta ganador/empate (signo 1X2)
                        else if ((difPronosticada > 0 && difReal > 0) || (difPronosticada < 0 && difReal < 0) || (difPronosticada === 0 && difReal === 0)) {
                          puntosPartidoFinal = 4 * bonus;
                        }
                      }
                      
                      return (
                        <tr className={coincidePartido && hayResultado && jornadaCerrada ? 'table-success' : hayResultado && jornadaCerrada ? 'table-danger' : ''}>
                          <td colSpan="4" className="text-center">
                            <div className="mb-2">
                              <strong style={{fontSize: '1.1rem'}}>🏆 FINAL</strong>
                            </div>
                            {/* Partido REAL arriba (grande) */}
                            <div className="mb-2">
                              <strong>{equiposReales.local} vs {equiposReales.visita}</strong>
                              <span className="text-muted ms-2">(Partido Real)</span>
                            </div>
                            {/* Partido PRONOSTICADO abajo (pequeño, cursiva) */}
                            <div style={{fontSize: '0.85rem', fontStyle: 'italic'}} className="text-muted">
                              {equiposPronosticados.local} vs {equiposPronosticados.visita}
                              <span className="ms-2">(Partido Pronosticado)</span>
                            </div>
                          </td>
                          {/* Columna: Goles Pronosticado */}
                          <td className="text-center">
                            <div className="fw-bold text-primary">
                              {equiposPronosticados.goles_local} - {equiposPronosticados.goles_visita}
                              {equiposPronosticados.penales_local !== null && equiposPronosticados.penales_visita !== null && (
                                <div style={{fontSize: '0.85rem'}}>
                                  (Pen: {equiposPronosticados.penales_local} - {equiposPronosticados.penales_visita})
                                </div>
                              )}
                            </div>
                          </td>
                          {/* Columna: Goles Real */}
                          <td className="text-center">
                            {hayResultado && jornadaCerrada ? (
                              <div className="fw-bold text-success">
                                {partidoFinalReal.goles_local} - {partidoFinalReal.goles_visita}
                                {partidoFinalReal.penales_local !== null && partidoFinalReal.penales_visita !== null && (
                                  <div style={{fontSize: '0.85rem'}}>
                                    (Pen: {partidoFinalReal.penales_local} - {partidoFinalReal.penales_visita})
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted">Pendiente</span>
                            )}
                          </td>
                          {/* Columna: Bonus */}
                          <td className="text-center">
                            <span className={partidoFinalReal.bonus && partidoFinalReal.bonus > 1 ? "badge bg-info text-white" : "text-muted"}>
                              x{partidoFinalReal.bonus || 1}
                            </span>
                          </td>
                          {/* Columna: Puntaje + Coincidencia */}
                          <td className="text-center">
                            {hayResultado && jornadaCerrada ? (
                              <div>
                                <div className="fw-bold fs-5">
                                  {puntosPartidoFinal} pts
                                </div>
                                <div style={{fontSize: '0.85rem'}} className={coincidePartido ? 'text-success' : 'text-danger'}>
                                  {coincidePartido ? 'Partido SI coincide' : 'Partido NO coincide'}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })()}
                    
                    {/* FILA 8: Cuadro Final (Campeón + Subcampeón) - Solo para Jornada 10 */}
                    {grupo.jornada === 10 && (() => {
                      const primerPronostico = grupo.pronosticos[0];
                      
                      if (!primerPronostico.equipos_pronosticados_final) {
                        return null;
                      }
                      
                      const { campeon: pronosticadoCampeon, subcampeon: pronosticadoSubcampeon } = primerPronostico.equipos_pronosticados_final;
                      
                      // Buscar el partido FINAL real - TEMPORAL: usar id 456
                      const partidoFinalReal = partidos.find(p => p.id === 456);
                      if (!partidoFinalReal) return null;
                      
                      // Determinar campeón y subcampeón REALES
                      let realCampeon = null;
                      let realSubcampeon = null;
                      const hayResultado = partidoFinalReal.goles_local !== null && partidoFinalReal.goles_visita !== null;
                      const jornada = jornadas.find(j => j.id === primerPronostico.jornada.id);
                      const jornadaCerrada = jornada?.cerrada || false;
                      
                      if (hayResultado) {
                        let golesLocal = partidoFinalReal.goles_local;
                        let golesVisita = partidoFinalReal.goles_visita;
                        
                        if (golesLocal > golesVisita) {
                          realCampeon = partidoFinalReal.nombre_local;
                          realSubcampeon = partidoFinalReal.nombre_visita;
                        } else if (golesLocal < golesVisita) {
                          realCampeon = partidoFinalReal.nombre_visita;
                          realSubcampeon = partidoFinalReal.nombre_local;
                        } else {
                          // Empate, revisar penales
                          if (partidoFinalReal.penales_local !== null && partidoFinalReal.penales_visita !== null) {
                            if (partidoFinalReal.penales_local > partidoFinalReal.penales_visita) {
                              realCampeon = partidoFinalReal.nombre_local;
                              realSubcampeon = partidoFinalReal.nombre_visita;
                            } else {
                              realCampeon = partidoFinalReal.nombre_visita;
                              realSubcampeon = partidoFinalReal.nombre_local;
                            }
                          }
                        }
                      }
                      
                      // Verificar si coinciden
                      const coincideCampeon = pronosticadoCampeon === realCampeon;
                      const coincideSubcampeon = pronosticadoSubcampeon === realSubcampeon;
                      
                      return (
                        <tr className="table-info">
                          <td colSpan="4" className="text-center">
                            <div className="mb-2">
                              <strong>🏆 Cuadro Final</strong>
                            </div>
                            {/* REAL arriba (grande) */}
                            {hayResultado && jornadaCerrada ? (
                              <div className="mb-2">
                                <strong>Campeón: {realCampeon}</strong> | <strong>Subcampeón: {realSubcampeon}</strong>
                              </div>
                            ) : (
                              <div className="mb-2 text-muted">
                                <strong>Pendiente</strong>
                              </div>
                            )}
                            {/* PRONOSTICADO abajo (pequeño, cursiva) */}
                            <div style={{fontSize: '0.85rem', fontStyle: 'italic'}} className="text-muted">
                              Campeón: {pronosticadoCampeon} | Subcampeón: {pronosticadoSubcampeon}
                            </div>
                          </td>
                          <td colSpan="3" className="text-center">
                            {/* Vacío o info adicional */}
                          </td>
                          {/* Columna: Puntaje desglosado */}
                          <td className="text-center">
                            {hayResultado && jornadaCerrada ? (
                              <div>
                                <div className={coincideCampeon ? 'text-success fw-bold' : 'text-danger'}>
                                  {primerPronostico.puntos_campeon || 0} pts Campeón
                                </div>
                                <div className={coincideSubcampeon ? 'text-success fw-bold' : 'text-danger'}>
                                  {primerPronostico.puntos_subcampeon || 0} pts Subcampeón
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })()}
                    
                    {/* FILA 9: TOTAL - Solo para todas las jornadas */}
                    <tr className="table-dark fw-bold">
                      <td colSpan="7" className="text-end">TOTAL {grupo.jugador} - Jornada {grupo.jornada}:</td>
                      <td className="text-center">
                        <span className="badge bg-dark fs-5">
                          {(() => {
                            // Para jornada 6, usar el puntaje del ranking (que viene de BD)
                            if (grupo.jornada === 6 && rankingJornada.length > 0) {
                              const jugadorRanking = rankingJornada.find(j => j.id === grupo.usuario_id);
                              return jugadorRanking ? jugadorRanking.puntos_jornada : 0;
                            }
                            // Para otras jornadas, usar el cálculo dinámico
                            return grupo.puntaje_total || 0;
                          })()} pts
                        </span>
                      </td>
                    </tr>
                    {/* Separador entre grupos */}
                    {grupoIndex < agruparPronosticos().length - 1 && (
                      <tr style={{ height: '30px', backgroundColor: '#e9ecef' }}>
                        <td colSpan="8" className="p-0 text-center align-middle">
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
          </div>
        </>
      )}

      {/* Rankings */}
      {rankingJornada.length > 0 && (
        <div className="mt-5">
          <hr className="my-5" />
          
          {/* Ranking de Jornada */}
          <div id="ranking-jornada" className="card shadow-sm mb-4">
            <div className="card-header bg-primary text-white">
              <h4 className="mb-0">🏆 Ranking Jornada {mostrarActual ? jornadaActual : filtroJornada}</h4>
            </div>
            <div className="card-body">
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
            </div>
          </div>

          {/* Ranking Acumulado */}
          <div id="ranking-acumulado" className="card shadow-sm mb-4">
            <div className="card-header bg-success text-white">
              <h4 className="mb-0">📊 Ranking Acumulado {mostrarActual ? `(Hasta Jornada ${jornadaActual})` : `(Hasta Jornada ${filtroJornada})`}</h4>
            </div>
            <div className="card-body">
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
                            <p className="mb-0 fs-4 fw-bold">{jugador.puntos_acumulados} pts</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
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
              className={`btn ${!mostrarActual ? 'btn-primary' : 'btn-outline-primary'} btn-lg px-4`}
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
          onClick={() => navigate('/libertadores')}
        >
          ← Volver a Libertadores
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
                    🏆 {ganadores.ganadores.length === 1 ? 'Ganador' : 'Ganadores'} de la Jornada {ganadores.jornadaNumero}
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
                        {ganador.puntaje} puntos
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
                    👑 {ganadoresAcumulado.ganadores.length === 1 ? 'CAMPEÓN' : 'CAMPEONES'} DEL RANKING ACUMULADO 👑
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
                        {ganador.puntaje} PUNTOS
                      </p>
                    </div>
                  ))}
                  <div className="mt-4">
                    <p className="fs-5 fw-bold text-dark">
                      {ganadoresAcumulado.mensaje}
                    </p>
                  </div>
                  <div className="mt-4">
                    <h1>🏆 🥇 🏆</h1>
                  </div>
                </div>
                <div className="modal-footer bg-light">
                  <button 
                    type="button" 
                    className="btn btn-warning btn-lg fw-bold" 
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
