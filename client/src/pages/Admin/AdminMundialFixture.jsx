import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export default function AdminMundialFixture() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Estados para cada fase
  const [textFaseGrupos, setTextFaseGrupos] = useState('');
  const [text16vos, setText16vos] = useState('');
  const [textOctavos, setTextOctavos] = useState('');
  const [textCuartos, setTextCuartos] = useState('');
  const [textFinales, setTextFinales] = useState('');

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
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
      
    } catch (error) {
      console.error('Error procesando fase de grupos:', error);
      showMessage('danger', `Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ==================== 16VOS DE FINAL ====================
  const generar16vos = async () => {
    if (!text16vos.trim()) {
      showMessage('danger', 'Por favor ingresa los 16 cruces de 16vos de final');
      return;
    }

    setLoading(true);
    try {
      const lineas = text16vos.split('\n').filter(l => l.trim());
      const cruces = lineas.map(linea => {
        const [local, visita] = linea.split(/vs|VS|Vs/).map(s => s.trim());
        return { local, visita };
      });

      if (cruces.length !== 16) {
        showMessage('danger', 'Debes ingresar exactamente 16 cruces (uno por línea)');
        return;
      }

      const partidos = cruces.map(cruce => ({
        equipo_local: cruce.local,
        equipo_visitante: cruce.visita,
        fecha: new Date().toISOString(),
        bonus: 1
      }));

      const token = localStorage.getItem('token');

      await axios.post(
        `${API_URL}/api/mundial/jornadas/4/fixture`,
        { partidos },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      showMessage('success', `✅ 16vos generados: 16 partidos en Jornada 4`);
      alert(`✅ 16vos de Final generados exitosamente\n\n📊 Resumen:\n- Jornada 4: 16 partidos\n- Bonus predefinido: x1`);
      setText16vos('');
    } catch (error) {
      console.error('Error generando 16vos:', error);
      showMessage('danger', `Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ==================== OCTAVOS DE FINAL ====================
  const generarOctavos = async () => {
    if (!textOctavos.trim()) {
      showMessage('danger', 'Por favor ingresa los 8 cruces de octavos');
      return;
    }

    setLoading(true);
    try {
      const lineas = textOctavos.split('\n').filter(l => l.trim());
      const cruces = lineas.map(linea => {
        const [local, visita] = linea.split(/vs|VS|Vs/).map(s => s.trim());
        return { local, visita };
      });

      if (cruces.length !== 8) {
        showMessage('danger', 'Debes ingresar exactamente 8 cruces (uno por línea)');
        return;
      }

      const partidos = cruces.map(cruce => ({
        equipo_local: cruce.local,
        equipo_visitante: cruce.visita,
        fecha: new Date().toISOString(),
        bonus: 1
      }));

      const token = localStorage.getItem('token');

      await axios.post(
        `${API_URL}/api/mundial/jornadas/5/fixture`,
        { partidos },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      showMessage('success', `✅ Octavos generados: 8 partidos en Jornada 5`);
      alert(`✅ Octavos de Final generados exitosamente\n\n📊 Resumen:\n- Jornada 5: 8 partidos\n- Bonus predefinido: x1`);
      setTextOctavos('');
    } catch (error) {
      console.error('Error generando octavos:', error);
      showMessage('danger', `Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ==================== CUARTOS DE FINAL ====================
  const generarCuartos = async () => {
    if (!textCuartos.trim()) {
      showMessage('danger', 'Por favor ingresa los 4 cruces de cuartos');
      return;
    }

    setLoading(true);
    try {
      const lineas = textCuartos.split('\n').filter(l => l.trim());
      const cruces = lineas.map(linea => {
        const [local, visita] = linea.split(/vs|VS|Vs/).map(s => s.trim());
        return { local, visita };
      });

      if (cruces.length !== 4) {
        showMessage('danger', 'Debes ingresar exactamente 4 cruces (uno por línea)');
        return;
      }

      const partidos = cruces.map(cruce => ({
        equipo_local: cruce.local,
        equipo_visitante: cruce.visita,
        fecha: new Date().toISOString(),
        bonus: 1
      }));

      const token = localStorage.getItem('token');

      await axios.post(
        `${API_URL}/api/mundial/jornadas/6/fixture`,
        { partidos },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      showMessage('success', `✅ Cuartos generados: 4 partidos en Jornada 6`);
     alert(`✅ Cuartos de Final generados exitosamente\n\n📊 Resumen:\n- Jornada 6: 4 partidos\n- Bonus predefinido: x1`);
      setTextCuartos('');
    } catch (error) {
      console.error('Error generando cuartos:', error);
      showMessage('danger', `Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ==================== FINALES ====================
  const generarFinales = async () => {
    if (!textFinales.trim()) {
      showMessage('danger', 'Por favor ingresa los 2 cruces de semifinales');
      return;
    }

    setLoading(true);
    try {
      const lineas = textFinales.split('\n').filter(l => l.trim());
      const cruces = lineas.map(linea => {
        const [local, visita] = linea.split(/vs|VS|Vs/).map(s => s.trim());
        return { local, visita };
      });

      if (cruces.length !== 2) {
        showMessage('danger', 'Debes ingresar exactamente 2 cruces de semifinales (uno por línea)');
        return;
      }

      const partidos = [];
      
      // 2 Semifinales
      cruces.forEach(cruce => {
        partidos.push({
          equipo_local: cruce.local,
          equipo_visitante: cruce.visita,
          fecha: new Date().toISOString(),
          bonus: 2
        });
      });

      // 3er lugar (perdedores semifinales)
      partidos.push({
        equipo_local: 'Perdedor SF1',
        equipo_visitante: 'Perdedor SF2',
        fecha: new Date().toISOString(),
        bonus: 1
      });

      // Final (ganadores semifinales)
      partidos.push({
        equipo_local: 'Ganador SF1',
        equipo_visitante: 'Ganador SF2',
        fecha: new Date().toISOString(),
        bonus: 3
      });

      const token = localStorage.getItem('token');

      await axios.post(
        `${API_URL}/api/mundial/jornadas/7/fixture`,
        { partidos },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      showMessage('success', `✅ Finales generadas: 4 partidos en Jornada 7 (2 SF + 3er lugar + Final)`);
      alert(`✅ Finales generadas exitosamente\n\n📊 Resumen:\n- Jornada 7: 4 partidos\n  * 2 Semifinales (bonus x2)\n  * 1 Tercer lugar (bonus x1)\n  * 1 Final (bonus x3)\n\n⚠️ Recuerda actualizar los equipos del 3er lugar y Final cuando se definan`);
      setTextFinales('');
    } catch (error) {
      console.error('Error generando finales:', error);
      showMessage('danger', `Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
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
            onClick={() => navigate('/admin')}
          >
            ← Volver
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

      {/* ==================== SECCIÓN 2: 16VOS ==================== */}
      <div className="card mb-4">
        <div className="card-header bg-info text-white">
          <h5 className="mb-0">⚽ 16vos de Final (Jornada 4)</h5>
        </div>
        <div className="card-body">
          <p className="text-muted">
            Ingresa los 16 cruces (uno por línea). Formato: <code>Equipo Local vs Equipo Visitante</code>
          </p>
          <div className="mb-3">
            <label className="form-label">Cruces de 16vos (16 líneas):</label>
            <textarea
              className="form-control font-monospace"
              rows="16"
              placeholder="Ejemplo:&#10;México vs Uruguay&#10;Argentina vs Brasil&#10;..."
              value={text16vos}
              onChange={(e) => setText16vos(e.target.value)}
            />
          </div>
          <button
            className="btn btn-info"
            onClick={generar16vos}
            disabled={loading || !text16vos.trim()}
          >
            {loading ? '⏳ Generando...' : '🚀 Generar 16vos (J4)'}
          </button>
        </div>
      </div>

      {/* ==================== SECCIÓN 3: OCTAVOS ==================== */}
      <div className="card mb-4">
        <div className="card-header bg-success text-white">
          <h5 className="mb-0">🏅 Octavos de Final (Jornada 5)</h5>
        </div>
        <div className="card-body">
          <p className="text-muted">
            Ingresa los 8 cruces (uno por línea). Formato: <code>Equipo Local vs Equipo Visitante</code>
          </p>
          <div className="mb-3">
            <label className="form-label">Cruces de Octavos (8 líneas):</label>
            <textarea
              className="form-control font-monospace"
              rows="8"
              placeholder="Ejemplo:&#10;México vs Argentina&#10;Brasil vs España&#10;..."
              value={textOctavos}
              onChange={(e) => setTextOctavos(e.target.value)}
            />
          </div>
          <button
            className="btn btn-success"
            onClick={generarOctavos}
            disabled={loading || !textOctavos.trim()}
          >
            {loading ? '⏳ Generando...' : '🚀 Generar Octavos (J5)'}
          </button>
        </div>
      </div>

      {/* ==================== SECCIÓN 4: CUARTOS ==================== */}
      <div className="card mb-4">
        <div className="card-header bg-warning text-dark">
          <h5 className="mb-0">🏆 Cuartos de Final (Jornada 6)</h5>
        </div>
        <div className="card-body">
          <p className="text-muted">
            Ingresa los 4 cruces (uno por línea). Formato: <code>Equipo Local vs Equipo Visitante</code>
          </p>
          <div className="mb-3">
            <label className="form-label">Cruces de Cuartos (4 líneas):</label>
            <textarea
              className="form-control font-monospace"
              rows="4"
              placeholder="Ejemplo:&#10;México vs Brasil&#10;Argentina vs España&#10;..."
              value={textCuartos}
              onChange={(e) => setTextCuartos(e.target.value)}
            />
          </div>
          <button
            className="btn btn-warning"
            onClick={generarCuartos}
            disabled={loading || !textCuartos.trim()}
          >
            {loading ? '⏳ Generando...' : '🚀 Generar Cuartos (J6)'}
          </button>
        </div>
      </div>

      {/* ==================== SECCIÓN 5: FINALES ==================== */}
      <div className="card mb-4">
        <div className="card-header bg-danger text-white">
          <h5 className="mb-0">🥇 Semifinales, 3er lugar y Final (Jornada 7)</h5>
        </div>
        <div className="card-body">
          <p className="text-muted">
            Ingresa los 2 cruces de semifinales (uno por línea). Formato: <code>Equipo Local vs Equipo Visitante</code>
            <br />
            Se generarán automáticamente las 2 semifinales, el partido por 3er lugar y la final.
          </p>
          <div className="mb-3">
            <label className="form-label">Cruces de Semifinales (2 líneas):</label>
            <textarea
              className="form-control font-monospace"
              rows="2"
              placeholder="Ejemplo:&#10;México vs Argentina&#10;Brasil vs España"
              value={textFinales}
              onChange={(e) => setTextFinales(e.target.value)}
            />
          </div>
          <button
            className="btn btn-danger"
            onClick={generarFinales}
            disabled={loading || !textFinales.trim()}
          >
            {loading ? '⏳ Generando...' : '🚀 Generar Finales (J7)'}
          </button>
        </div>
      </div>

      {/* Información adicional */}
      <div className="alert alert-info">
        <h6>ℹ️ Información Importante:</h6>
        <ul className="mb-0">
          <li><strong>Fase de Grupos:</strong> 3 jornadas con formato "Equipo (PAÍS) vs Equipo (PAÍS) — Grupo X"</li>
          <li><strong>16vos:</strong> 16 partidos directos en J4</li>
          <li><strong>Octavos:</strong> 8 partidos directos en J5</li>
          <li><strong>Cuartos:</strong> 4 partidos directos en J6</li>
          <li><strong>Finales:</strong> 2 semifinales + 3er lugar + final (4 partidos totales en J7)</li>
          <li>Los bonus se pueden ajustar después desde Resultados</li>
        </ul>
      </div>
    </div>
  );
}
