import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

// --- Réplica en el frontend del cálculo de tabla de grupo del backend
// (server/utils/copaGinoPerezScoring.js), para mostrar en vivo, mientras el
// usuario llena el formulario, contra quién cree que jugará la fase final. ---

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

// Enfrentamientos fijos de cada grupo (todos contra todos): el orden en que
// se jueguen en la realidad no importa para el pronóstico, que es a ciegas
// por partido.
const PARTIDOS_GRUPO = {
  1: [{ id: 1, ordenLocal: 2, ordenVisita: 3 }, { id: 2, ordenLocal: 1, ordenVisita: 3 }, { id: 3, ordenLocal: 1, ordenVisita: 2 }],
  2: [{ id: 4, ordenLocal: 2, ordenVisita: 3 }, { id: 5, ordenLocal: 1, ordenVisita: 3 }, { id: 6, ordenLocal: 1, ordenVisita: 2 }]
};

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
  const [gruposGuardados, setGruposGuardados] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guardandoGrupos, setGuardandoGrupos] = useState(false);
  const [guardandoFinal, setGuardandoFinal] = useState(false);
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
        setPredicciones(prev => {
          const nuevas = { ...prev };
          pronosticoRes.data.pronosticos.forEach(p => {
            nuevas[p.partido_id] = { goles_local: String(p.goles_local), goles_visita: String(p.goles_visita) };
          });
          return nuevas;
        });
      }
      if (pronosticoRes.data.extra) {
        const e = pronosticoRes.data.extra;
        if (e.bonus_grupo1_partido) setBonusGrupo1(e.bonus_grupo1_partido);
        if (e.bonus_grupo2_partido) setBonusGrupo2(e.bonus_grupo2_partido);
        if (e.bonus_final_partido) setBonusFinal(e.bonus_final_partido);
        if (e.bonus_final_multiplicador) setBonusFinalMultiplicador(e.bonus_final_multiplicador);
        setGruposGuardados(!!e.grupos_guardados);
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
  const nombrePorOrden = (equiposGrupo, orden) => equiposGrupo.find(e => e.orden === orden)?.nombre || '...';
  const idPorOrden = (equiposGrupo, orden) => equiposGrupo.find(e => e.orden === orden)?.id;

  const actualizarPrediccion = (partidoId, campo, valor) => {
    setPredicciones(prev => ({ ...prev, [partidoId]: { ...prev[partidoId], [campo]: valor } }));
  };

  const golAzar = () => String(Math.floor(Math.random() * 5));

  const azarPartidos = (ids) => {
    setPredicciones(prev => {
      const nuevas = { ...prev };
      ids.forEach(id => {
        nuevas[id] = { goles_local: golAzar(), goles_visita: golAzar() };
      });
      return nuevas;
    });
  };

  const azarGrupos = () => azarPartidos([1, 2, 3, 4, 5, 6]);
  const azarDefinicionPuestos = () => azarPartidos([7, 8, 9]);

  const partidosFijos = (grupoNum, equiposGrupo) => PARTIDOS_GRUPO[grupoNum].map(p => ({
    id: p.id,
    equipo_local_id: idPorOrden(equiposGrupo, p.ordenLocal),
    equipo_visita_id: idPorOrden(equiposGrupo, p.ordenVisita),
    nombreLocal: nombrePorOrden(equiposGrupo, p.ordenLocal),
    nombreVisita: nombrePorOrden(equiposGrupo, p.ordenVisita)
  }));

  const partidosFijosG1 = useMemo(() => equiposG1.length === 3 ? partidosFijos(1, equiposG1) : [], [equiposG1]);
  const partidosFijosG2 = useMemo(() => equiposG2.length === 3 ? partidosFijos(2, equiposG2) : [], [equiposG2]);

  const standingsVirtualG1 = useMemo(() => {
    if (partidosFijosG1.length !== 3) return [];
    const virtuales = partidosFijosG1.map(p => ({
      equipo_local_id: p.equipo_local_id, equipo_visita_id: p.equipo_visita_id,
      goles_local: predicciones[p.id].goles_local === '' ? null : Number(predicciones[p.id].goles_local),
      goles_visita: predicciones[p.id].goles_visita === '' ? null : Number(predicciones[p.id].goles_visita)
    }));
    return calcularStandingsGrupo(equiposG1, virtuales);
  }, [partidosFijosG1, equiposG1, predicciones]);

  const standingsVirtualG2 = useMemo(() => {
    if (partidosFijosG2.length !== 3) return [];
    const virtuales = partidosFijosG2.map(p => ({
      equipo_local_id: p.equipo_local_id, equipo_visita_id: p.equipo_visita_id,
      goles_local: predicciones[p.id].goles_local === '' ? null : Number(predicciones[p.id].goles_local),
      goles_visita: predicciones[p.id].goles_visita === '' ? null : Number(predicciones[p.id].goles_visita)
    }));
    return calcularStandingsGrupo(equiposG2, virtuales);
  }, [partidosFijosG2, equiposG2, predicciones]);

  const grupo1Completo = [1, 2, 3].every(id => predicciones[id].goles_local !== '' && predicciones[id].goles_visita !== '');
  const grupo2Completo = [4, 5, 6].every(id => predicciones[id].goles_local !== '' && predicciones[id].goles_visita !== '');

  const nombrePorPosicion = (standings, idx, grupoCompleto) =>
    grupoCompleto ? (standings[idx]?.nombre || '...') : `(completa el Grupo ${standings === standingsVirtualG1 ? 1 : 2})`;

  const finalHabilitada = editable && gruposGuardados;

  const partidoInput = (id, labelLocal, labelVisita, habilitado) => (
    <div className="cgp-fila-partido">
      <span className="cgp-equipo cgp-equipo-local">{labelLocal}</span>
      <div className="cgp-marcador">
        <input type="number" min="0" className="form-control form-control-sm text-center cgp-input"
          value={predicciones[id].goles_local}
          disabled={!habilitado}
          onChange={e => actualizarPrediccion(id, 'goles_local', e.target.value)} />
        <span className="cgp-guion">-</span>
        <input type="number" min="0" className="form-control form-control-sm text-center cgp-input"
          value={predicciones[id].goles_visita}
          disabled={!habilitado}
          onChange={e => actualizarPrediccion(id, 'goles_visita', e.target.value)} />
      </div>
      <span className="cgp-equipo cgp-equipo-visita">{labelVisita}</span>
    </div>
  );

  const validarGrupos = () => {
    for (const id of [1, 2, 3, 4, 5, 6]) {
      const p = predicciones[id];
      if (p.goles_local === '' || p.goles_visita === '' || Number(p.goles_local) < 0 || Number(p.goles_visita) < 0) {
        return 'Completa el marcador de los 6 partidos de fase de grupos';
      }
    }
    return null;
  };

  const validarFinal = () => {
    for (const id of [7, 8, 9]) {
      const p = predicciones[id];
      if (p.goles_local === '' || p.goles_visita === '' || Number(p.goles_local) < 0 || Number(p.goles_visita) < 0) {
        return 'Completa el marcador de los 3 partidos de fase final';
      }
    }
    return null;
  };

  const guardarGrupos = async () => {
    const err = validarGrupos();
    if (err) { setError(err); return; }
    setError('');
    try {
      setGuardandoGrupos(true);
      const token = localStorage.getItem('token');
      const payload = {
        predicciones: [1, 2, 3, 4, 5, 6].map(partido_id => ({
          partido_id,
          goles_local: Number(predicciones[partido_id].goles_local),
          goles_visita: Number(predicciones[partido_id].goles_visita)
        })),
        bonus_grupo1_partido: Number(bonusGrupo1),
        bonus_grupo2_partido: Number(bonusGrupo2)
      };
      await axios.post(`${API_URL}/api/copa-gino-perez/pronostico/grupos`, payload, { headers: { Authorization: `Bearer ${token}` } });
      setGruposGuardados(true);
      setMensaje('✅ Pronóstico de fase de grupos guardado. Ya puedes pronosticar la fase final.');
    } catch (err) {
      console.error('Error guardando pronóstico de grupos:', err);
      setError(err.response?.data?.error || 'Error guardando pronóstico de fase de grupos');
    } finally {
      setGuardandoGrupos(false);
    }
  };

  const guardarFinal = async () => {
    const err = validarFinal();
    if (err) { setError(err); return; }
    setError('');
    try {
      setGuardandoFinal(true);
      const token = localStorage.getItem('token');
      const payload = {
        predicciones: [7, 8, 9].map(partido_id => ({
          partido_id,
          goles_local: Number(predicciones[partido_id].goles_local),
          goles_visita: Number(predicciones[partido_id].goles_visita)
        })),
        bonus_final_partido: Number(bonusFinal),
        bonus_final_multiplicador: Number(bonusFinalMultiplicador)
      };
      await axios.post(`${API_URL}/api/copa-gino-perez/pronostico/final`, payload, { headers: { Authorization: `Bearer ${token}` } });
      setMensaje('✅ Pronóstico de fase final guardado exitosamente');
    } catch (err) {
      console.error('Error guardando pronóstico final:', err);
      setError(err.response?.data?.error || 'Error guardando pronóstico de fase final');
    } finally {
      setGuardandoFinal(false);
    }
  };

  if (loading) return <div className="text-center mt-4">Cargando...</div>;

  const opcionesBonusGrupo = (partidosFijosGrupo) => partidosFijosGrupo.map(p => (
    <option key={p.id} value={p.id}>{p.nombreLocal} vs {p.nombreVisita}</option>
  ));

  const nombreFinal = (standings, idx) => standings[idx]?.nombre;
  const opcionesBonusFinal = [
    { id: 7, texto: `Final: ${nombreFinal(standingsVirtualG1, 0) && nombreFinal(standingsVirtualG2, 0) ? `${nombreFinal(standingsVirtualG1, 0)} vs ${nombreFinal(standingsVirtualG2, 0)}` : '(completa los grupos)'}` },
    { id: 8, texto: `3er/4to puesto: ${nombreFinal(standingsVirtualG1, 1) && nombreFinal(standingsVirtualG2, 1) ? `${nombreFinal(standingsVirtualG1, 1)} vs ${nombreFinal(standingsVirtualG2, 1)}` : '(completa los grupos)'}` },
    { id: 9, texto: `Vergüenza: ${nombreFinal(standingsVirtualG1, 2) && nombreFinal(standingsVirtualG2, 2) ? `${nombreFinal(standingsVirtualG1, 2)} vs ${nombreFinal(standingsVirtualG2, 2)}` : '(completa los grupos)'}` }
  ];

  return (
    <div className="container mt-4 mb-5 cgp-pronostico">
      <style>{`
        .cgp-pronostico .cgp-card {
          background: #fff;
          border: 1px solid #ddd;
          border-radius: 10px;
          padding: 18px 20px;
          margin-bottom: 18px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }
        .cgp-pronostico .cgp-card-header {
          font-weight: 700;
          font-size: 1.15em;
          text-align: center;
          color: #fff;
          padding: 8px;
          border-radius: 6px;
          margin-bottom: 16px;
        }
        .cgp-pronostico .cgp-grupo1 .cgp-card-header { background: #d32f2f; }
        .cgp-pronostico .cgp-grupo2 .cgp-card-header { background: #28a745; }
        .cgp-pronostico .cgp-final .cgp-card-header { background: #111; }
        .cgp-pronostico .cgp-final.cgp-bloqueada { opacity: 0.6; }
        .cgp-pronostico .cgp-fila-partido {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 12px;
          flex-wrap: nowrap;
        }
        .cgp-pronostico .cgp-equipo {
          flex: 1 1 0;
          font-weight: 600;
          font-size: 0.98em;
          min-width: 0;
        }
        .cgp-pronostico .cgp-equipo-local { text-align: right; }
        .cgp-pronostico .cgp-equipo-visita { text-align: left; }
        .cgp-pronostico .cgp-marcador {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .cgp-pronostico .cgp-input { width: 54px; font-weight: 700; }
        .cgp-pronostico .cgp-guion { font-weight: 700; color: #888; }
        .cgp-pronostico .cgp-bonus-label { font-weight: 600; margin-top: 10px; margin-bottom: 4px; display: block; }
        .cgp-pronostico .cgp-fase-final-sub {
          text-align: center;
          font-weight: 600;
          color: #555;
          margin-bottom: 10px;
        }
      `}</style>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <button className="btn btn-outline-secondary" onClick={() => navigate('/copa-gino-perez')}>
          ← Volver a Copa Gino Pérez
        </button>
      </div>

      <h1 className="text-center mb-1">⚽ Pronóstico Copa Gino Pérez</h1>
      <p className="text-center text-muted mb-4">
        Primero se guarda el pronóstico de la fase de grupos. Con eso guardado, la app calcula tu propio
        bracket virtual y te muestra contra quién pronosticas en la fase final: si ese enfrentamiento no
        coincide con lo que termina pasando en la realidad, esos partidos valen 0 puntos.
      </p>

      {!editable && (
        <div className="alert alert-warning text-center">
          El torneo ya comenzó: tu pronóstico quedó bloqueado y no se puede modificar.
        </div>
      )}
      {mensaje && <div className="alert alert-success text-center">{mensaje}</div>}
      {error && <div className="alert alert-danger text-center">{error}</div>}

      <div className="text-center mb-3">
        <button type="button" className="btn btn-outline-dark" disabled={!editable} onClick={azarGrupos}>
          🎲 Azar (fase de grupos)
        </button>
      </div>

      <div className="row">
        <div className="col-md-6">
          <div className="cgp-card cgp-grupo1">
            <div className="cgp-card-header">Grupo 1</div>
            {partidosFijosG1.map(p => partidoInput(p.id, p.nombreLocal, p.nombreVisita, editable))}
            <label className="cgp-bonus-label">Partido con bonus x2 de este grupo:</label>
            <select className="form-select" value={bonusGrupo1} disabled={!editable} onChange={e => setBonusGrupo1(e.target.value)}>
              {opcionesBonusGrupo(partidosFijosG1)}
            </select>
          </div>
        </div>
        <div className="col-md-6">
          <div className="cgp-card cgp-grupo2">
            <div className="cgp-card-header">Grupo 2</div>
            {partidosFijosG2.map(p => partidoInput(p.id, p.nombreLocal, p.nombreVisita, editable))}
            <label className="cgp-bonus-label">Partido con bonus x2 de este grupo:</label>
            <select className="form-select" value={bonusGrupo2} disabled={!editable} onChange={e => setBonusGrupo2(e.target.value)}>
              {opcionesBonusGrupo(partidosFijosG2)}
            </select>
          </div>
        </div>
      </div>

      <div className="text-center mb-4">
        <button className="btn btn-primary" disabled={!editable || guardandoGrupos} onClick={guardarGrupos}>
          {guardandoGrupos ? 'Guardando...' : '💾 Guardar Pronóstico de Fase de Grupos'}
        </button>
      </div>

      <div className={`cgp-card cgp-final ${finalHabilitada ? '' : 'cgp-bloqueada'}`}>
        <div className="cgp-card-header">Fase Final (según tu propio pronóstico de grupos)</div>

        {!gruposGuardados ? (
          <p className="text-center text-muted">
            Primero guarda tu pronóstico de fase de grupos para poder pronosticar la fase final.
          </p>
        ) : (
          <>
            <div className="text-center mb-3">
              <button type="button" className="btn btn-outline-dark" disabled={!finalHabilitada} onClick={azarDefinicionPuestos}>
                🎲 Azar (definición de puestos)
              </button>
            </div>
            <div className="row">
              <div className="col-md-4">
                <p className="cgp-fase-final-sub">Final (1° y 2° lugar)</p>
                {partidoInput(7, nombrePorPosicion(standingsVirtualG1, 0, grupo1Completo), nombrePorPosicion(standingsVirtualG2, 0, grupo2Completo), finalHabilitada)}
              </div>
              <div className="col-md-4">
                <p className="cgp-fase-final-sub">3er y 4to puesto</p>
                {partidoInput(8, nombrePorPosicion(standingsVirtualG1, 1, grupo1Completo), nombrePorPosicion(standingsVirtualG2, 1, grupo2Completo), finalHabilitada)}
              </div>
              <div className="col-md-4">
                <p className="cgp-fase-final-sub">Partido de la vergüenza (5to y 6to)</p>
                {partidoInput(9, nombrePorPosicion(standingsVirtualG1, 2, grupo1Completo), nombrePorPosicion(standingsVirtualG2, 2, grupo2Completo), finalHabilitada)}
              </div>
            </div>

            <div className="row mt-2">
              <div className="col-md-8 offset-md-2">
                <label className="cgp-bonus-label">Partido de la fase final con bonus:</label>
                <select className="form-select mb-2" value={bonusFinal} disabled={!finalHabilitada} onChange={e => setBonusFinal(e.target.value)}>
                  {opcionesBonusFinal.map(o => <option key={o.id} value={o.id}>{o.texto}</option>)}
                </select>
                <label className="cgp-bonus-label">Multiplicador del bonus de la final:</label>
                <select className="form-select" value={bonusFinalMultiplicador} disabled={!finalHabilitada} onChange={e => setBonusFinalMultiplicador(e.target.value)}>
                  <option value={2}>x2</option>
                  <option value={3}>x3</option>
                </select>
              </div>
            </div>

            <div className="text-center mt-4">
              <button className="btn btn-primary btn-lg" disabled={!finalHabilitada || guardandoFinal} onClick={guardarFinal}>
                {guardandoFinal ? 'Guardando...' : '💾 Guardar Pronóstico de Fase Final'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
