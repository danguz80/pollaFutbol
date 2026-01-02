import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export default function AdminLibertadores() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Estados para cada fase
  const [textFaseGrupos, setTextFaseGrupos] = useState('');
  const [textOctavos, setTextOctavos] = useState('');
  const [textCuartos, setTextCuartos] = useState('');
  const [textSemiFinal, setTextSemiFinal] = useState('');

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
      // Parsear el texto para extraer partidos Y equipos
      const lineas = textFaseGrupos.split('\n');
      const jornadasPartidos = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
      const equiposMap = new Map(); // Map<nombre, {pais, grupo}>
      let jornadaActual = null;

      lineas.forEach(linea => {
        const lineaTrim = linea.trim();
        
        // Detectar jornada
        const matchFecha = lineaTrim.match(/Fecha\s*(\d+)/i);
        
        if (matchFecha) {
          const num = parseInt(matchFecha[1]);
          if (num >= 1 && num <= 6) {
            jornadaActual = num;
            console.log(`Detectada Jornada ${num}`);
          }
        }

        // Solo procesar partidos si ya detectamos una jornada
        if (!jornadaActual) return;

        // Detectar líneas con formato: Equipo (PAÍS) vs Equipo (PAÍS) — Grupo X
        // Probar múltiples variaciones del regex (em dash —, en dash –, guion -)
        let matchPartidoPais = lineaTrim.match(/^(.+?)\s*\(([A-Z]{3})\)\s+vs\s+(.+?)\s*\(([A-Z]{3})\)\s*—\s*Grupo\s+([A-H])/i);
        
        // Si no coincide, probar con en dash (–)
        if (!matchPartidoPais) {
          matchPartidoPais = lineaTrim.match(/^(.+?)\s*\(([A-Z]{3})\)\s+vs\s+(.+?)\s*\(([A-Z]{3})\)\s*–\s*Grupo\s+([A-H])/i);
        }
        
        // Si no coincide, probar con guion normal (-)
        if (!matchPartidoPais) {
          matchPartidoPais = lineaTrim.match(/^(.+?)\s*\(([A-Z]{3})\)\s+vs\s+(.+?)\s*\(([A-Z]{3})\)\s*-\s*Grupo\s+([A-H])/i);
        }
        
        // Si no coincide, probar sin guion
        if (!matchPartidoPais) {
          matchPartidoPais = lineaTrim.match(/^(.+?)\s*\(([A-Z]{3})\)\s+vs\s+(.+?)\s*\(([A-Z]{3})\)\s+Grupo\s+([A-H])/i);
        }
        
        if (matchPartidoPais) {
          const local = matchPartidoPais[1].trim();
          const paisLocal = matchPartidoPais[2].trim();
          const visita = matchPartidoPais[3].trim();
          const paisVisita = matchPartidoPais[4].trim();
          const grupo = matchPartidoPais[5].toUpperCase();
          
          // Validar que sean nombres válidos
          if (local.length > 2 && visita.length > 2) {
            
            // Agregar equipos al mapa (solo si no existen o si el grupo es consistente)
            if (!equiposMap.has(local)) {
              equiposMap.set(local, { pais: paisLocal, grupo });
            } else {
              // Verificar consistencia del grupo
              const equipoExistente = equiposMap.get(local);
              if (equipoExistente.grupo !== grupo) {
                console.error(`⚠️ INCONSISTENCIA: ${local} aparece en Grupo ${equipoExistente.grupo} y Grupo ${grupo}`);
              }
            }
            
            if (!equiposMap.has(visita)) {
              equiposMap.set(visita, { pais: paisVisita, grupo });
            } else {
              // Verificar consistencia del grupo
              const equipoExistente = equiposMap.get(visita);
              if (equipoExistente.grupo !== grupo) {
                console.error(`⚠️ INCONSISTENCIA: ${visita} aparece en Grupo ${equipoExistente.grupo} y Grupo ${grupo}`);
              }
            }
            
            // Agregar partido
            jornadasPartidos[jornadaActual].push({
              equipo_local: local,
              equipo_visitante: visita,
              fecha_hora: new Date().toISOString(),
              bonus: 1
            });
            
            console.log(`J${jornadaActual}: ${local} vs ${visita} - Grupo ${grupo}`);
          }
        } else {
          // Mostrar líneas que no coinciden (para debug)
          if (lineaTrim.includes('vs') && lineaTrim.length > 10) {
            console.warn('Línea no capturada:', lineaTrim);
          }
        }
      });

      // Validar que se extrajeron partidos y equipos
      const totalPartidos = Object.values(jornadasPartidos).reduce((sum, arr) => sum + arr.length, 0);
      const totalEquipos = equiposMap.size;
      
      if (totalPartidos === 0) {
        showMessage('danger', 'No se pudieron extraer partidos. Verifica el formato del texto.');
        console.error('Jornadas parseadas:', jornadasPartidos);
        return;
      }

      // Mostrar resumen antes de enviar
      console.log('Partidos detectados por jornada:');
      for (let j = 1; j <= 6; j++) {
        console.log(`Jornada ${j}: ${jornadasPartidos[j].length} partidos`, jornadasPartidos[j]);
      }
      console.log(`Total equipos únicos: ${totalEquipos}`, Array.from(equiposMap.entries()));

      // Confirmar antes de enviar
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

      // 1. Primero crear/actualizar equipos
      const equiposArray = Array.from(equiposMap.entries()).map(([nombre, data]) => ({
        nombre,
        pais: data.pais,
        grupo: data.grupo
      }));

      await axios.post(
        `${API_URL}/api/libertadores/equipos`,
        { equipos: equiposArray },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log(`✅ ${equiposArray.length} equipos creados/actualizados`);

      // 2. Luego crear partidos por jornada
      let partidosCreados = 0;

      for (let j = 1; j <= 6; j++) {
        if (jornadasPartidos[j].length > 0) {
          await axios.post(
            `${API_URL}/api/libertadores/jornadas/${j}/partidos`,
            { partidos: jornadasPartidos[j] },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          partidosCreados += jornadasPartidos[j].length;
        }
      }

      showMessage('success', `✅ Fase de grupos generada:\n- ${equiposArray.length} equipos\n- ${partidosCreados} partidos en ${Object.keys(jornadasPartidos).filter(j => jornadasPartidos[j].length > 0).length} jornadas`);
      alert(`✅ Fase de Grupos generada exitosamente\n\n📊 Resumen:\n- ${equiposArray.length} equipos creados\n- ${partidosCreados} partidos generados\n- Jornadas: ${Object.keys(jornadasPartidos).filter(j => jornadasPartidos[j].length > 0).map(j => `J${j}`).join(', ')}\n\n⚠️ Recuerda ajustar los bonus si es necesario desde Resultados y Jornadas`);
      setTextFaseGrupos('');
      
    } catch (error) {
      console.error('Error procesando fase de grupos:', error);
      showMessage('danger', `Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ==================== OCTAVOS IDA/VUELTA ====================
  const generarOctavos = async () => {
    if (!textOctavos.trim()) {
      showMessage('danger', 'Por favor ingresa los cruces de octavos');
      return;
    }

    setLoading(true);
    try {
      // Parsear texto: formato esperado es líneas con "Equipo1 vs Equipo2"
      const lineas = textOctavos.split('\n').filter(l => l.trim());
      const cruces = lineas.map(linea => {
        const [local, visita] = linea.split(/vs|VS|Vs/).map(s => s.trim());
        return { local, visita };
      });

      if (cruces.length !== 8) {
        showMessage('danger', 'Debes ingresar exactamente 8 cruces (uno por línea)');
        return;
      }

      // Generar partidos IDA (Jornada 7)
      const partidosIda = cruces.map(cruce => ({
        equipo_local: cruce.local,
        equipo_visitante: cruce.visita,
        fecha_hora: new Date().toISOString(),
        bonus: 1
      }));

      // Generar partidos VUELTA (Jornada 8)
      const partidosVuelta = cruces.map(cruce => ({
        equipo_local: cruce.visita,
        equipo_visitante: cruce.local,
        fecha_hora: new Date().toISOString(),
        bonus: 1
      }));

      const token = localStorage.getItem('token');

      // Crear partidos de jornada 7
      await axios.post(
        `${API_URL}/api/libertadores/jornadas/7/partidos`,
        { partidos: partidosIda },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Crear partidos de jornada 8
      await axios.post(
        `${API_URL}/api/libertadores/jornadas/8/partidos`,
        { partidos: partidosVuelta },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      showMessage('success', `✅ Octavos generados: 8 partidos en Jornada 7 (IDA) y 8 en Jornada 8 (VUELTA)`);
      alert(`✅ Octavos de Final generados exitosamente\n\n📊 Resumen:\n- Jornada 7 (IDA): 8 partidos\n- Jornada 8 (VUELTA): 8 partidos\n- Bonus predefinido: x1\n\n⚠️ Recuerda ajustar los bonus si es necesario desde Resultados y Jornadas`);
      setTextOctavos('');
    } catch (error) {
      console.error('Error generando octavos:', error);
      showMessage('danger', `Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ==================== CUARTOS IDA/VUELTA ====================
  const generarCuartos = async () => {
    if (!textCuartos.trim()) {
      showMessage('danger', 'Por favor ingresa los cruces de cuartos');
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

      // Generar partidos IDA y VUELTA en la misma jornada 9
      const partidos = [];
      cruces.forEach(cruce => {
        // IDA
        partidos.push({
          equipo_local: cruce.local,
          equipo_visitante: cruce.visita,
          fecha_hora: new Date().toISOString(),
          bonus: 1
        });
        // VUELTA
        partidos.push({
          equipo_local: cruce.visita,
          equipo_visitante: cruce.local,
          fecha_hora: new Date().toISOString(),
          bonus: 1
        });
      });

      const token = localStorage.getItem('token');

      await axios.post(
        `${API_URL}/api/libertadores/jornadas/9/partidos`,
        { partidos },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      showMessage('success', `✅ Cuartos generados: 8 partidos en Jornada 9 (4 IDA + 4 VUELTA)`);
      alert(`✅ Cuartos de Final generados exitosamente\n\n📊 Resumen:\n- Jornada 9: 8 partidos (4 IDA + 4 VUELTA)\n- Bonus predefinido: x1\n\n⚠️ Recuerda ajustar los bonus si es necesario desde Resultados y Jornadas`);
      setTextCuartos('');
    } catch (error) {
      console.error('Error generando cuartos:', error);
      showMessage('danger', `Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ==================== SEMIFINALES + FINAL ====================
  const generarSemiFinales = async () => {
    if (!textSemiFinal.trim()) {
      showMessage('danger', 'Por favor ingresa los cruces de semifinales');
      return;
    }

    setLoading(true);
    try {
      const lineas = textSemiFinal.split('\n').filter(l => l.trim());
      const cruces = lineas.map(linea => {
        const [local, visita] = linea.split(/vs|VS|Vs/).map(s => s.trim());
        return { local, visita };
      });

      if (cruces.length !== 2) {
        showMessage('danger', 'Debes ingresar exactamente 2 cruces de semifinales (uno por línea)');
        return;
      }

      // Generar partidos de SEMIFINALES (IDA y VUELTA) + FINAL
      const partidos = [];
      
      // Semifinales IDA y VUELTA
      cruces.forEach(cruce => {
        // IDA
        partidos.push({
          equipo_local: cruce.local,
          equipo_visitante: cruce.visita,
          fecha_hora: new Date().toISOString(),
          bonus: 1
        });
        // VUELTA
        partidos.push({
          equipo_local: cruce.visita,
          equipo_visitante: cruce.local,
          fecha_hora: new Date().toISOString(),
          bonus: 1
        });
      });

      // FINAL (ganadores por determinar)
      partidos.push({
        equipo_local: 'Ganador SF1',
        equipo_visitante: 'Ganador SF2',
        fecha_hora: new Date().toISOString(),
        bonus: 1
      });

      const token = localStorage.getItem('token');

      await axios.post(
        `${API_URL}/api/libertadores/jornadas/10/partidos`,
        { partidos },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      showMessage('success', `✅ Semifinales y Final generadas: 5 partidos en Jornada 10 (2 SF IDA + 2 SF VUELTA + 1 FINAL)`);
      alert(`✅ Semifinales y Final generadas exitosamente\n\n📊 Resumen:\n- Jornada 10: 5 partidos\n  * 2 Semifinales IDA\n  * 2 Semifinales VUELTA\n  * 1 FINAL\n- Bonus predefinido: x1\n\n⚠️ Recuerda ajustar los bonus si es necesario desde Resultados y Jornadas`);
      setTextSemiFinal('');
    } catch (error) {
      console.error('Error generando semifinales:', error);
      showMessage('danger', `Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>🔴 Generador de Fixture - Copa Libertadores</h2>
        <div className="d-flex gap-2">
          <button 
            className="btn btn-success"
            onClick={() => navigate('/admin/libertadores/resultados')}
          >
            📊 Resultados y Jornadas
          </button>
          <button 
            className="btn btn-warning"
            onClick={() => navigate('/admin/libertadores/gestion')}
          >
            🗑️ Gestión y Respaldo
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
          <h5 className="mb-0">📄 Fase de Grupos (Jornadas 1-6)</h5>
        </div>
        <div className="card-body">
          <p className="text-muted">
            Copia y pega el texto del PDF con los partidos de fase de grupos. Formato esperado:
            <br />
            <code>Jornada 1</code> (o <code>J1</code> o simplemente <code>1</code>)
            <br />
            <code>Equipo Local vs Equipo Visitante</code>
            <br />
            (Puedes usar "vs", "VS", "Vs" o "-" como separador)
          </p>
          <div className="mb-3">
            <label className="form-label">Texto de Fase de Grupos:</label>
            <textarea
              className="form-control font-monospace"
              rows="15"
              placeholder="Ejemplo:&#10;Jornada 1&#10;Flamengo vs River Plate&#10;Boca Juniors vs Palmeiras&#10;...&#10;&#10;Jornada 2&#10;River Plate vs Boca Juniors&#10;..."
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

      {/* ==================== SECCIÓN 2: OCTAVOS ==================== */}
      <div className="card mb-4">
        <div className="card-header bg-success text-white">
          <h5 className="mb-0">⚽ Octavos de Final (Jornadas 7 y 8)</h5>
        </div>
        <div className="card-body">
          <p className="text-muted">
            Ingresa los 8 cruces de octavos (uno por línea). Formato: <code>Equipo Local vs Equipo Visitante</code>
            <br />
            Se generarán automáticamente los partidos IDA (J7) y VUELTA (J8).
          </p>
          <div className="mb-3">
            <label className="form-label">Cruces de Octavos (8 líneas):</label>
            <textarea
              className="form-control font-monospace"
              rows="8"
              placeholder="Ejemplo:&#10;Flamengo vs River Plate&#10;Boca Juniors vs Palmeiras&#10;..."
              value={textOctavos}
              onChange={(e) => setTextOctavos(e.target.value)}
            />
          </div>
          <button
            className="btn btn-success"
            onClick={generarOctavos}
            disabled={loading || !textOctavos.trim()}
          >
            {loading ? '⏳ Generando...' : '🚀 Generar Octavos (J7 + J8)'}
          </button>
        </div>
      </div>

      {/* ==================== SECCIÓN 3: CUARTOS ==================== */}
      <div className="card mb-4">
        <div className="card-header bg-warning text-dark">
          <h5 className="mb-0">🏆 Cuartos de Final (Jornada 9)</h5>
        </div>
        <div className="card-body">
          <p className="text-muted">
            Ingresa los 4 cruces de cuartos (uno por línea). Formato: <code>Equipo Local vs Equipo Visitante</code>
            <br />
            Se generarán automáticamente IDA y VUELTA en la misma jornada 9.
          </p>
          <div className="mb-3">
            <label className="form-label">Cruces de Cuartos (4 líneas):</label>
            <textarea
              className="form-control font-monospace"
              rows="4"
              placeholder="Ejemplo:&#10;Flamengo vs Boca Juniors&#10;River Plate vs Palmeiras&#10;..."
              value={textCuartos}
              onChange={(e) => setTextCuartos(e.target.value)}
            />
          </div>
          <button
            className="btn btn-warning"
            onClick={generarCuartos}
            disabled={loading || !textCuartos.trim()}
          >
            {loading ? '⏳ Generando...' : '🚀 Generar Cuartos (J9)'}
          </button>
        </div>
      </div>

      {/* ==================== SECCIÓN 4: SEMIFINALES + FINAL ==================== */}
      <div className="card mb-4">
        <div className="card-header bg-danger text-white">
          <h5 className="mb-0">🥇 Semifinales + Final (Jornada 10)</h5>
        </div>
        <div className="card-body">
          <p className="text-muted">
            Ingresa los 2 cruces de semifinales (uno por línea). Formato: <code>Equipo Local vs Equipo Visitante</code>
            <br />
            Se generarán automáticamente SF IDA, SF VUELTA y la FINAL (con ganadores por determinar).
          </p>
          <div className="mb-3">
            <label className="form-label">Cruces de Semifinales (2 líneas):</label>
            <textarea
              className="form-control font-monospace"
              rows="2"
              placeholder="Ejemplo:&#10;Flamengo vs River Plate&#10;Boca Juniors vs Palmeiras"
              value={textSemiFinal}
              onChange={(e) => setTextSemiFinal(e.target.value)}
            />
          </div>
          <button
            className="btn btn-danger"
            onClick={generarSemiFinales}
            disabled={loading || !textSemiFinal.trim()}
          >
            {loading ? '⏳ Generando...' : '🚀 Generar Semifinales + Final (J10)'}
          </button>
        </div>
      </div>

      {/* Información adicional */}
      <div className="alert alert-info">
        <h6>ℹ️ Información Importante:</h6>
        <ul className="mb-0">
          <li><strong>Fase de Grupos:</strong> Copia el texto del PDF. Formato: "Jornada X" seguido de "Equipo1 vs Equipo2" (uno por línea)</li>
          <li><strong>Octavos:</strong> 8 cruces generan 16 partidos (8 IDA en J7 + 8 VUELTA en J8)</li>
          <li><strong>Cuartos:</strong> 4 cruces generan 8 partidos (4 IDA + 4 VUELTA en J9)</li>
          <li><strong>Semifinales:</strong> 2 cruces generan 5 partidos (2 SF IDA + 2 SF VUELTA + 1 FINAL en J10)</li>
          <li>Los partidos se crean con bonus predeterminados (Fase: 1, 8vos: 2, 4tos: 2, Semis: 3, Final: 5)</li>
        </ul>
      </div>
    </div>
  );
}
