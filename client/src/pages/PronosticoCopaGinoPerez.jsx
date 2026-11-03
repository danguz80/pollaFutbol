import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

// --- Réplica en el frontend del cálculo de tabla/bracket virtual del backend
// (server/utils/copaGinoPerezScoring.js), para mostrar en vivo, mientras el
// usuario llena el formulario, contra quién cree que jugará la fase final. ---

function ganadorVirtualPrediccion(pred, equipoLocalId, equipoVisitaId) {
  if (!pred || pred.goles_local === '' || pred.goles_visita === '' || pred.goles_local == null || pred.goles_visita == null) return null;
  const gl = Number(pred.goles_local);
  const gv = Number(pred.goles_visita);
  if (gl > gv) return equipoLocalId;
  if (gv > gl) return equipoVisitaId;
  return equipoLocalId;
}

function construirPartidosVirtualesGrupo(equiposGrupo, predicciones, idA, idB, idC) {
  const t1 = equiposGrupo.find(e => e.orden === 1);
  const t2 = equiposGrupo.find(e => e.orden === 2);
  const t3 = equiposGrupo.find(e => e.orden === 3);
  if (!t1 || !t2 || !t3) return [];
  const predA = predicciones[idA];
  const predB = predicciones[idB];
  const predC = predicciones[idC];

  const ganadorA = ganadorVirtualPrediccion(predA, t2.id, t3.id);
  const perdedorA = ganadorA ? (ganadorA === t2.id ? t3.id : t2.id) : null;

  const virtuales = [];
  if (predA && predA.goles_local !== '' && predA.goles_visita !== '') {
    virtuales.push({ equipo_local_id: t2.id, equipo_visita_id: t3.id, goles_local: Number(predA.goles_local), goles_visita: Number(predA.goles_visita) });
  }
  if (predB && perdedorA && predB.goles_local !== '' && predB.goles_visita !== '') {
    virtuales.push({ equipo_local_id: perdedorA, equipo_visita_id: t1.id, goles_local: Number(predB.goles_local), goles_visita: Number(predB.goles_visita) });
  }
  if (predC && ganadorA && predC.goles_local !== '' && predC.goles_visita !== '') {
    virtuales.push({ equipo_local_id: t1.id, equipo_visita_id: ganadorA, goles_local: Number(predC.goles_local), goles_visita: Number(predC.goles_visita) });
  }
  return virtuales;
}

function calcularStandingsGrupo(equiposGrupo, partidosGrupo) {
  const stats = {};
  equiposGrupo.forEach(e => { stats[e.id] = { equipo_id: e.id, nombre: e.nombre, orden: e.orden, puntos: 0, dg: 0, gf: 0 }; });
  const headToHead = {};
  partidosGrupo.forEach(p => {
    if (p.goles_local == null || p.goles_visita == null) return;
    const localId = p.equipo_local_id, visitaId = p.equipo_visita_id;
    if (!stats[localId] || !stats[visitaId]) return;
    stats[localId].gf += p.goles_local;
    stats[visitaId].gf += p.goles_visita;
    stats[localId].dg += (p.goles_local - p.goles_visita);
    stats[visitaId].dg += (p.goles_visita - p.goles_local);
    let ganador = 'draw';
    if (p.goles_local > p.goles_visita) { stats[localId].puntos += 3; ganador = localId; }
    else if (p.goles_visita > p.goles_local) { stats[visitaId].puntos += 3; ganador = visitaId; }
    else { stats[localId].puntos += 1; stats[visitaId].puntos += 1; }
    headToHead[[localId, visitaId].sort((a, b) => a - b).join('-')] = ganador;
  });
  const arr = Object.values(stats);
  arr.sort((a, b) => {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    if (b.dg !== a.dg) return b.dg - a.dg;
    if (b.gf !== a.gf) return b.gf - a.gf;
    const h2h = headToHead[[a.equipo_id, b.equipo_id].sort((x, y) => x - y).join('-')];
    if (h2h && h2h !== 'draw') return h2h === a.equipo_id ? -1 : 1;
    return a.orden - b.orden;
  });
  return arr;
}

const VACIO = { goles_local: '', goles_visita: '' };

export default function PronosticoCopaGinoPerez() {
  const navigate = useNavigate();
  const [equipos, setEquipos] = useState([]);
  const [predicciones, setPredicciones] = useState({
    1: { ...VACIO }, 2: { ...VACIO }, 3: { ...VACIO },
    4: { ...VACIO }, 5: { ...VACIO }, 6: { ...VACIO },
    7: { ...VACIO }, 8: { ...VACIO }, 9: { ...VACIO }
  });
  const [bonusGrupo1, setBonusGrupo1] = useState(1);
  const [bonusGrupo2, setBonusGrupo2] = useState(4);
  const [bonusFinal, setBonusFinal] = useState(7);
  const [bonusFinalMultiplicador, setBonusFinalMultiplicador] = useState(2);
  const [editable, setEditable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const [equiposRes, pronosticoRes] = await Promise.all([
        axios.get(`${API_URL}/api/copa-gino-perez/equipos`),
        axios.get(`${API_URL}/api/copa-gino-perez/pronostico`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setEquipos(equiposRes.data);
      setEditable(pronosticoRes.data.editable);

      if (pronosticoRes.data.pronosticos?.length) {
        const nuevas = { ...predicciones };
        pronosticoRes.data.pronosticos.forEach(p => {
          nuevas[p.partido_id] = { goles_local: String(p.goles_local), goles_visita: String(p.goles_visita) };
        });
        setPredicciones(nuevas);
      }
      if (pronosticoRes.data.extra) {
        const e = pronosticoRes.data.extra;
        if (e.bonus_grupo1_partido) setBonusGrupo1(e.bonus_grupo1_partido);
        if (e.bonus_grupo2_partido) setBonusGrupo2(e.bonus_grupo2_partido);
        if (e.bonus_final_partido) setBonusFinal(e.bonus_final_partido);
        if (e.bonus_final_multiplicador) setBonusFinalMultiplicador(e.bonus_final_multiplicador);
      }
    } catch (err) {
      console.error('Error cargando pronóstico:', err);
      setError('No se pudo cargar el pronóstico');
    } finally {
      setLoading(false);
    }
  };

  const equiposG1 = useMemo(() => equipos.filter(e => e.grupo === 1).sort((a, b) => a.orden - b.orden), [equipos]);
  const equiposG2 = useMemo(() => equipos.filter(e => e.grupo === 2).sort((a, b) => a.orden - b.orden), [equipos]);

  const actualizarPrediccion = (partidoId, campo, valor) => {
    setPredicciones(prev => ({ ...prev, [partidoId]: { ...prev[partidoId], [campo]: valor } }));
  };

  const standingsVirtualG1 = useMemo(
    () => equiposG1.length === 3 ? calcularStandingsGrupo(equiposG1, construirPartidosVirtualesGrupo(equiposG1, predicciones, 1, 2, 3)) : [],
    [equiposG1, predicciones]
  );
  const standingsVirtualG2 = useMemo(
    () => equiposG2.length === 3 ? calcularStandingsGrupo(equiposG2, construirPartidosVirtualesGrupo(equiposG2, predicciones, 4, 5, 6)) : [],
    [equiposG2, predicciones]
  );

  const nombrePorPosicion = (standings, idx) => standings[idx]?.nombre || '(completa la fase de grupos de este grupo)';

  const t1G1 = equiposG1.find(e => e.orden === 1);
  const t2G1 = equiposG1.find(e => e.orden === 2);
  const t3G1 = equiposG1.find(e => e.orden === 3);
  const t1G2 = equiposG2.find(e => e.orden === 1);
  const t2G2 = equiposG2.find(e => e.orden === 2);
  const t3G2 = equiposG2.find(e => e.orden === 3);

  const ganadorA_G1 = ganadorVirtualPrediccion(predicciones[1], t2G1?.id, t3G1?.id);
  const perdedorA_G1 = ganadorA_G1 ? (ganadorA_G1 === t2G1.id ? t3G1.id : t2G1.id) : null;
  const nombreEquipo = id => equipos.find(e => e.id === id)?.nombre || '?';

  const ganadorA_G2 = ganadorVirtualPrediccion(predicciones[4], t2G2?.id, t3G2?.id);
  const perdedorA_G2 = ganadorA_G2 ? (ganadorA_G2 === t2G2.id ? t3G2.id : t2G2.id) : null;

  const partidoInput = (id, labelLocal, labelVisita) => (
    <div className="row align-items-center g-2 mb-2">
      <div className="col-5 text-end">{labelLocal}</div>
      <div className="col-1">
        <input type="number" min="0" className="form-control form-control-sm text-center"
          value={predicciones[id].goles_local}
          disabled={!editable}
          onChange={e => actualizarPrediccion(id, 'goles_local', e.target.value)} />
      </div>
      <div className="col-auto">-</div>
      <div className="col-1">
        <input type="number" min="0" className="form-control form-control-sm text-center"
          value={predicciones[id].goles_visita}
          disabled={!editable}
          onChange={e => actualizarPrediccion(id, 'goles_visita', e.target.value)} />
      </div>
      <div className="col-5">{labelVisita}</div>
    </div>
  );

  const validar = () => {
    for (let i = 1; i <= 9; i++) {
      const p = predicciones[i];
      if (p.goles_local === '' || p.goles_visita === '' || Number(p.goles_local) < 0 || Number(p.goles_visita) < 0) {
        return 'Completa el marcador de los 9 partidos';
      }
    }
    return null;
  };

  const guardar = async () => {
    const err = validar();
    if (err) { setError(err); return; }
    setError('');
    try {
      setGuardando(true);
      const token = localStorage.getItem('token');
      const payload = {
        predicciones: Object.entries(predicciones).map(([partido_id, p]) => ({
          partido_id: Number(partido_id),
          goles_local: Number(p.goles_local),
          goles_visita: Number(p.goles_visita)
        })),
        bonus_grupo1_partido: Number(bonusGrupo1),
        bonus_grupo2_partido: Number(bonusGrupo2),
        bonus_final_partido: Number(bonusFinal),
        bonus_final_multiplicador: Number(bonusFinalMultiplicador)
      };
      await axios.post(`${API_URL}/api/copa-gino-perez/pronostico`, payload, { headers: { Authorization: `Bearer ${token}` } });
      setMensaje('✅ Pronóstico guardado exitosamente');
    } catch (err) {
      console.error('Error guardando pronóstico:', err);
      setError(err.response?.data?.error || 'Error guardando pronóstico');
    } finally {
      setGuardando(false);
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

      <h1 className="text-center mb-1">⚽ Pronóstico Copa Gino Pérez</h1>
      <p className="text-center text-muted mb-4">
        Se pronostica el torneo completo de una sola vez. Los partidos de la fase final se muestran según
        tu propio pronóstico de la fase de grupos: si no coincide con lo que termina pasando en la realidad,
        esos partidos valen 0 puntos.
      </p>

      {!editable && (
        <div className="alert alert-warning text-center">
          El torneo ya comenzó: tu pronóstico quedó bloqueado y no se puede modificar.
        </div>
      )}
      {mensaje && <div className="alert alert-success text-center">{mensaje}</div>}
      {error && <div className="alert alert-danger text-center">{error}</div>}

      <div className="row">
        <div className="col-md-6">
          <h4 className="text-center">Grupo 1</h4>
          {t2G1 && t3G1 && partidoInput(1, nombreEquipo(t2G1.id), nombreEquipo(t3G1.id))}
          {t1G1 && partidoInput(2, perdedorA_G1 ? `Perdedor P1 (${nombreEquipo(perdedorA_G1)})` : 'Perdedor Partido 1', nombreEquipo(t1G1.id))}
          {t1G1 && partidoInput(3, nombreEquipo(t1G1.id), ganadorA_G1 ? `Ganador P1 (${nombreEquipo(ganadorA_G1)})` : 'Ganador Partido 1')}
          <div className="mb-3">
            <label className="form-label">Partido con bonus x2 de este grupo:</label>
            <select className="form-select" value={bonusGrupo1} disabled={!editable} onChange={e => setBonusGrupo1(e.target.value)}>
              <option value={1}>Partido 1</option>
              <option value={2}>Partido 2</option>
              <option value={3}>Partido 3</option>
            </select>
          </div>
        </div>
        <div className="col-md-6">
          <h4 className="text-center">Grupo 2</h4>
          {t2G2 && t3G2 && partidoInput(4, nombreEquipo(t2G2.id), nombreEquipo(t3G2.id))}
          {t1G2 && partidoInput(5, perdedorA_G2 ? `Perdedor P4 (${nombreEquipo(perdedorA_G2)})` : 'Perdedor Partido 4', nombreEquipo(t1G2.id))}
          {t1G2 && partidoInput(6, nombreEquipo(t1G2.id), ganadorA_G2 ? `Ganador P4 (${nombreEquipo(ganadorA_G2)})` : 'Ganador Partido 4')}
          <div className="mb-3">
            <label className="form-label">Partido con bonus x2 de este grupo:</label>
            <select className="form-select" value={bonusGrupo2} disabled={!editable} onChange={e => setBonusGrupo2(e.target.value)}>
              <option value={4}>Partido 4</option>
              <option value={5}>Partido 5</option>
              <option value={6}>Partido 6</option>
            </select>
          </div>
        </div>
      </div>

      <h4 className="text-center mt-4">Fase Final (según tu propio pronóstico de grupos)</h4>
      <div className="row">
        <div className="col-md-4">
          <p className="text-center text-muted small mb-1">Final (1° y 2° lugar)</p>
          {partidoInput(7, nombrePorPosicion(standingsVirtualG1, 0), nombrePorPosicion(standingsVirtualG2, 0))}
        </div>
        <div className="col-md-4">
          <p className="text-center text-muted small mb-1">3er y 4to puesto</p>
          {partidoInput(8, nombrePorPosicion(standingsVirtualG1, 1), nombrePorPosicion(standingsVirtualG2, 1))}
        </div>
        <div className="col-md-4">
          <p className="text-center text-muted small mb-1">Partido de la vergüenza (5to y 6to)</p>
          {partidoInput(9, nombrePorPosicion(standingsVirtualG1, 2), nombrePorPosicion(standingsVirtualG2, 2))}
        </div>
      </div>

      <div className="row mt-3">
        <div className="col-md-6 offset-md-3">
          <label className="form-label">Partido de la fase final con bonus:</label>
          <select className="form-select mb-2" value={bonusFinal} disabled={!editable} onChange={e => setBonusFinal(e.target.value)}>
            <option value={7}>Final</option>
            <option value={8}>3er y 4to puesto</option>
            <option value={9}>Partido de la vergüenza</option>
          </select>
          <label className="form-label">Multiplicador del bonus de la final:</label>
          <select className="form-select" value={bonusFinalMultiplicador} disabled={!editable} onChange={e => setBonusFinalMultiplicador(e.target.value)}>
            <option value={2}>x2</option>
            <option value={3}>x3</option>
          </select>
        </div>
      </div>

      <div className="text-center mt-4">
        <button className="btn btn-primary btn-lg" disabled={!editable || guardando} onClick={guardar}>
          {guardando ? 'Guardando...' : 'Guardar Pronóstico'}
        </button>
      </div>
    </div>
  );
}
