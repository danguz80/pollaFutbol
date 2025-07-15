import express from 'express';
import { pool } from '../db/pool.js';
import { calcularAvanceSiglas, reemplazarSiglasPorNombres } from '../utils/sudamericanaSiglas.js';
import { calcularPuntajesSudamericana } from '../services/puntajesSudamericana.js';

const router = express.Router();

// Función helper para calcular clasificados del usuario usando calcularAvanceSiglas
async function obtenerClasificadosUsuario(userId) {
  const fixturesResult = await pool.query('SELECT * FROM sudamericana_fixtures ORDER BY fixture_id');
  const pronosticosResult = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1', [userId]);
  
  return calcularAvanceSiglas(fixturesResult.rows, pronosticosResult.rows);
}

// Función helper para obtener clasificados reales basándose en los fixtures oficiales
async function obtenerClasificadosReales() {
  // Obtener todos los fixtures con sus datos reales
  const fixturesResult = await pool.query('SELECT * FROM sudamericana_fixtures ORDER BY fixture_id');
  
  // Construir diccionario basándose en los campos 'clasificado' de los fixtures
  const dic = {};
  
  for (const fixture of fixturesResult.rows) {
    const { clasificado, equipo_local, equipo_visita } = fixture;
    
    // Si hay un clasificado definido, mapear la sigla al equipo clasificado
    if (clasificado) {
      // El clasificado ya tiene el nombre del equipo que realmente avanzó
      // Necesitamos mapear desde las siglas WP01, WO.A, etc. al nombre real
      
      // Si el clasificado es una sigla (como WO.A), mapear desde los equipos del fixture
      if (/^W[OP][0-9]+|WO\.[A-Z]|WC[0-9]+|WS[0-9]+$/.test(clasificado)) {
        // Si el fixture tiene equipos reales (no siglas), usar esos
        if (equipo_local && !/^W[OP][0-9]+/.test(equipo_local)) {
          dic[clasificado] = equipo_local;
        } else if (equipo_visita && !/^W[OP][0-9]+/.test(equipo_visita)) {
          dic[clasificado] = equipo_visita;
        }
      } else {
        // El clasificado ya es un nombre de equipo real
        // Mapear las siglas de los equipos del fixture al clasificado
        if (equipo_local && /^W[OP][0-9]+/.test(equipo_local)) {
          dic[equipo_local] = clasificado;
        }
        if (equipo_visita && /^W[OP][0-9]+/.test(equipo_visita)) {
          dic[equipo_visita] = clasificado;
        }
      }
    }
  }
  
  return dic;
}

// Función helper para detectar si un string es una sigla
function esSigla(str) {
  return typeof str === 'string' && /^W[OP][0-9]+|WO\.[A-Z]|WC[0-9]+|WS[0-9]+|CHAMPION$/.test(str);
}

// GET /api/sudamericana/clasificacion/:ronda
router.get('/clasificacion/:ronda', async (req, res) => {
  const { ronda } = req.params;
  try {
    // Obtener todos los usuarios con pronósticos en esa ronda y sus nombres
    const usuariosRes = await pool.query(
      `SELECT DISTINCT u.id as usuario_id, u.nombre as nombre_usuario
       FROM pronosticos_sudamericana p
       JOIN usuarios u ON p.usuario_id = u.id
       WHERE p.ronda = $1`,
      [ronda]
    );
    const usuarios = usuariosRes.rows; // [{usuario_id, nombre_usuario}]
    // Obtener fixture y resultados
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures WHERE ronda = $1', [ronda]);
    const fixture = fixtureRes.rows;
    // Obtener todos los pronósticos de esa ronda
    const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE ronda = $1', [ronda]);
    const pronos = pronosRes.rows;
    
    // Calcular puntaje por usuario SOLO de la ronda seleccionada
    const clasificacion = [];
    
    // Obtener clasificados REALES desde la BD oficial
    const dicSiglasReales = await obtenerClasificadosReales();
    
    // Reemplazar siglas en fixture usando clasificados REALES calculados
    const fixtureConNombresReales = reemplazarSiglasPorNombres(fixture, dicSiglasReales);
    
    for (const u of usuarios) {
      // Obtener clasificados del usuario usando calcularAvanceSiglas
      const dicSiglasUsuario = await obtenerClasificadosUsuario(u.usuario_id);
      
      // Reemplazar siglas solo en pronósticos usando diccionario del usuario
      const pronosUsuario = pronos.filter(p => p.usuario_id === u.usuario_id);
      const pronosUsuarioConNombres = reemplazarSiglasPorNombres(pronosUsuario, dicSiglasUsuario);
      
      // Crear resultados con equipos reales (desde fixture con nombres REALES)
      const resultados = fixtureConNombresReales.map(f => ({
        fixture_id: f.fixture_id,
        goles_local: f.goles_local,
        goles_visita: f.goles_visita,
        ganador: f.ganador,
        equipo_local: f.equipo_local,
        equipo_visita: f.equipo_visita,
        ronda: f.ronda,
        bonus: f.bonus
      }));
      
      // Calcular puntajes (usando fixture con nombres REALES, pronósticos con nombres del usuario, y resultados con nombres REALES)
      const puntaje = calcularPuntajesSudamericana(fixtureConNombresReales, pronosUsuarioConNombres, resultados, u.usuario_id);
      
      // Sumar solo los puntos de partidos de la ronda seleccionada
      const totalRonda = puntaje.detalle.reduce((acc, d) => d.partido.ronda === ronda ? acc + d.pts : acc, 0);
      
      // Agregar información de cruce real vs pronosticado
      const detalleConCruce = puntaje.detalle.map(d => ({
        ...d,
        cruceReal: `${d.real?.equipo_local || ''} vs ${d.real?.equipo_visita || ''}`,
        crucePronosticado: `${d.pron?.equipo_local || ''} vs ${d.pron?.equipo_visita || ''}`,
        cruceCoincide: d.cruceCoincide,
        motivoSinPuntos: d.motivoSinPuntos
      }));
      
      clasificacion.push({ 
        usuario_id: u.usuario_id, 
        nombre_usuario: u.nombre_usuario, 
        total: totalRonda, 
        detalle: detalleConCruce 
      });
    }
    res.json(clasificacion);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/sudamericana/clasificacion-completa - Puntajes completos (partidos + clasificados) por usuario
router.get('/clasificacion-completa', async (req, res) => {
  try {
    // Obtener todos los usuarios con pronósticos de sudamericana
    const usuariosRes = await pool.query(
      `SELECT DISTINCT u.id as usuario_id, u.nombre as nombre_usuario
       FROM usuarios u 
       WHERE u.activo_sudamericana = true
       AND (EXISTS(SELECT 1 FROM pronosticos_sudamericana p WHERE p.usuario_id = u.id) 
            OR EXISTS(SELECT 1 FROM clasif_sud_pron cp WHERE cp.usuario_id = u.id))`
    );
    const usuarios = usuariosRes.rows;
    
    // Obtener todo el fixture de eliminación directa
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    const fixture = fixtureRes.rows;
    
    // Obtener todos los pronósticos de eliminación directa
    const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana');
    const pronos = pronosRes.rows;
    
    // Obtener todas las rondas únicas
    const rondasRes = await pool.query('SELECT DISTINCT ronda FROM sudamericana_fixtures ORDER BY ronda ASC');
    const rondas = rondasRes.rows.map(r => r.ronda);
    
    // Calcular puntajes completos por usuario
    const clasificacion = [];
    
    // Obtener clasificados REALES desde la BD oficial
    const dicSiglasReales = await obtenerClasificadosReales();
    
    for (const usuario of usuarios) {
      // Obtener clasificados del usuario usando calcularAvanceSiglas
      const dicSiglasUsuario = await obtenerClasificadosUsuario(usuario.usuario_id);
      
      // Reemplazar siglas en fixture usando clasificados REALES y en pronósticos usando diccionario del usuario
      const fixtureConNombres = reemplazarSiglasPorNombres(fixture, dicSiglasReales);
      const pronosUsuario = pronos.filter(p => p.usuario_id === usuario.usuario_id);
      const pronosUsuarioConNombres = reemplazarSiglasPorNombres(pronosUsuario, dicSiglasUsuario);
      
      // Crear resultados con equipos reales (desde fixture con nombres REALES)
      const resultados = fixtureConNombres.map(f => ({
        fixture_id: f.fixture_id,
        goles_local: f.goles_local,
        goles_visita: f.goles_visita,
        ganador: f.clasificado, // CORREGIDO: usar 'clasificado' en lugar de 'ganador'
        equipo_local: f.equipo_local,
        equipo_visita: f.equipo_visita,
        ronda: f.ronda,
        bonus: f.bonus
      }));
      
      // Calcular puntos por partidos (usando fixture con nombres REALES, pronósticos con nombres del usuario, y resultados con nombres REALES)
      const puntajePartidos = calcularPuntajesSudamericana(fixtureConNombres, pronosUsuarioConNombres, resultados, usuario.usuario_id);
      
      // Agregar información de cruce real vs pronosticado al detalle
      const detalleConCruce = puntajePartidos?.detalle?.map(d => ({
        ...d,
        cruceReal: `${d.real?.equipo_local || ''} vs ${d.real?.equipo_visita || ''}`,
        crucePronosticado: `${d.pron?.equipo_local || ''} vs ${d.pron?.equipo_visita || ''}`,
        cruceCoincide: d.cruceCoincide,
        motivoSinPuntos: d.motivoSinPuntos
      })) || [];
      
      // Calcular puntos por clasificados usando el diccionario calculado
      const pronMap = {
        'Knockout Round Play-offs': [],
        'Octavos de Final': [],
        'Cuartos de Final': [],
        'Semifinales': [],
        'Final': []
      };
      
      // Mapear desde diccionario calculado
      for (let i = 1; i <= 8; i++) {
        const wp = `WP0${i}`;
        if (dicSiglasUsuario[wp]) pronMap['Knockout Round Play-offs'].push(dicSiglasUsuario[wp]);
      }
      
      const octavosKeys = ['WO.A', 'WO.B', 'WO.C', 'WO.D', 'WO.E', 'WO.F', 'WO.G', 'WO.H'];
      octavosKeys.forEach(key => {
        if (dicSiglasUsuario[key]) pronMap['Octavos de Final'].push(dicSiglasUsuario[key]);
      });
      
      for (let i = 1; i <= 4; i++) {
        const wc = `WC${i}`;
        if (dicSiglasUsuario[wc]) pronMap['Cuartos de Final'].push(dicSiglasUsuario[wc]);
      }
      
      for (let i = 1; i <= 2; i++) {
        const ws = `WS${i}`;
        if (dicSiglasUsuario[ws]) pronMap['Semifinales'].push(dicSiglasUsuario[ws]);
      }
      
      if (dicSiglasUsuario['WS1 vs WS2'] || dicSiglasUsuario['CHAMPION']) {
        pronMap['Final'].push(dicSiglasUsuario['WS1 vs WS2'] || dicSiglasUsuario['CHAMPION']);
      }

      const realClasifRes = await pool.query('SELECT ronda, clasificados FROM clasif_sud');
      const realMap = {};
      for (const row of realClasifRes.rows) {
        if (!realMap[row.ronda]) realMap[row.ronda] = [];
        if (row.clasificados && row.clasificados.trim()) {
          realMap[row.ronda].push(row.clasificados.trim());
        }
      }

      const puntosPorRonda = {
        'Knockout Round Play-offs': 2,
        'Octavos de Final': 3,
        'Cuartos de Final': 3,
        'Semifinales': 5,
        'Final': 0 // especial
      };

      let totalClasif = 0;
      const detalleClasif = [];
      for (const ronda of rondas) {
        const misClasificados = pronMap[ronda] || [];
        const reales = realMap[ronda] || [];
        let puntos = 0;
        let aciertos = 0;

        if (ronda === 'Final') {
          if (misClasificados[0] && reales[0] && misClasificados[0] === reales[0]) {
            puntos += 15; // campeón
            aciertos++;
          }
          if (misClasificados[1] && reales[1] && misClasificados[1] === reales[1]) {
            puntos += 10; // subcampeón
            aciertos++;
          }
        } else {
          const puntajePorAcierto = puntosPorRonda[ronda] || 0;
          for (const miEquipo of misClasificados) {
            if (reales.includes(miEquipo)) {
              aciertos++;
              puntos += puntajePorAcierto;
            }
          }
        }
        
        totalClasif += puntos;
        detalleClasif.push({
          ronda,
          misClasificados,
          clasificadosReales: reales,
          aciertos,
          puntos
        });
      }
      
      const totalPartidos = puntajePartidos?.total || 0;
      const totalGeneral = totalPartidos + totalClasif;
      
      clasificacion.push({
        usuario_id: usuario.usuario_id,
        nombre_usuario: usuario.nombre_usuario,
        total: totalGeneral,
        partidos: {
          detalle: detalleConCruce,
          total: totalPartidos
        },
        clasificados: {
          detalle: detalleClasif,
          total: totalClasif
        }
      });
    }
    
    res.json(clasificacion);
  } catch (error) {
    console.error('Error en clasificacion-completa:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/sudamericana/clasificacion - TODOS los pronósticos de eliminación directa de todos los usuarios (todas las rondas)
router.get('/clasificacion', async (req, res) => {
  try {
    // Obtener todos los usuarios con pronósticos de eliminación directa y sus nombres
    const usuariosRes = await pool.query(
      `SELECT DISTINCT u.id as usuario_id, u.nombre as nombre_usuario
       FROM pronosticos_sudamericana p
       JOIN usuarios u ON p.usuario_id = u.id`
    );
    const usuarios = usuariosRes.rows; // [{usuario_id, nombre_usuario}]
    // Obtener todo el fixture de eliminación directa
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    const fixture = fixtureRes.rows;
    // Obtener todos los pronósticos de eliminación directa
    const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana');
    const pronos = pronosRes.rows;
    
    // Calcular puntaje por usuario (todas las rondas)
    const clasificacion = [];
    
    // Obtener clasificados REALES desde la BD oficial
    const dicSiglasReales = await obtenerClasificadosReales();
    
    for (const u of usuarios) {
      // Obtener clasificados del usuario usando calcularAvanceSiglas
      const dicSiglasUsuario = await obtenerClasificadosUsuario(u.usuario_id);
      
      // Reemplazar siglas en fixture usando clasificados REALES y en pronósticos usando diccionario del usuario
      const fixtureConNombres = reemplazarSiglasPorNombres(fixture, dicSiglasReales);
      const pronosUsuario = pronos.filter(p => p.usuario_id === u.usuario_id);
      const pronosUsuarioConNombres = reemplazarSiglasPorNombres(pronosUsuario, dicSiglasUsuario);
      
      // Crear resultados con equipos reales (desde fixture con nombres REALES)
      const resultados = fixtureConNombres.map(f => ({
        fixture_id: f.fixture_id,
        goles_local: f.goles_local,
        goles_visita: f.goles_visita,
        ganador: f.ganador,
        equipo_local: f.equipo_local,
        equipo_visita: f.equipo_visita,
        ronda: f.ronda,
        bonus: f.bonus
      }));
      
      // Calcular puntajes (usando fixture con nombres REALES, pronósticos con nombres del usuario, y resultados con nombres REALES)
      const puntaje = calcularPuntajesSudamericana(fixtureConNombres, pronosUsuarioConNombres, resultados, u.usuario_id);
      
      // Sumar todos los puntos de eliminación directa
      const total = puntaje.detalle.reduce((acc, d) => acc + d.pts, 0);
      
      // Agregar información de cruce real vs pronosticado
      const detalleConCruce = puntaje.detalle.map(d => ({
        ...d,
        cruceReal: `${d.real?.equipo_local || ''} vs ${d.real?.equipo_visita || ''}`,
        crucePronosticado: `${d.pron?.equipo_local || ''} vs ${d.pron?.equipo_visita || ''}`,
        cruceCoincide: d.cruceCoincide,
        motivoSinPuntos: d.motivoSinPuntos
      }));
      
      clasificacion.push({ 
        usuario_id: u.usuario_id, 
        nombre_usuario: u.nombre_usuario, 
        total, 
        detalle: detalleConCruce 
      });
    }
    res.json(clasificacion);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/sudamericana/debug-clasificados/:userId - Debug de clasificados
router.get('/debug-clasificados/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    // 1. Obtener clasificados del usuario desde clasif_sud_pron
    const pronClasifRes = await pool.query(
      'SELECT ronda, clasificados FROM clasif_sud_pron WHERE usuario_id = $1 ORDER BY ronda',
      [userId]
    );
    
    // 2. Obtener fixture completo
    const fixtureCompleto = await pool.query('SELECT * FROM sudamericana_fixtures ORDER BY ronda, fixture_id');
    
    // 3. Calcular clasificados REALES desde la BD oficial
    const dicSiglasReales = await obtenerClasificadosReales();
    
    // 4. Obtener clasificados REALES desde clasif_sud
    const realClasifRes = await pool.query('SELECT ronda, clasificados FROM clasif_sud ORDER BY ronda');
    
    // 5. DEBUG: Obtener los pronósticos del usuario para ver la propagación
    const pronosUsuario = await pool.query(
      'SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1 ORDER BY ronda, fixture_id',
      [userId]
    );
    
    // 6. Crear diccionario del usuario usando calcularAvanceSiglas
    const dicSiglasUsuario = await obtenerClasificadosUsuario(userId);
    
    res.json({
      usuario_id: userId,
      clasificados_usuario_bd: pronClasifRes.rows,
      clasificados_reales_bd: realClasifRes.rows,
      clasificados_calculados: dicSiglasReales,
      diccionario_siglas_usuario: dicSiglasUsuario,
      pronosticos_usuario: pronosUsuario.rows,
      fixture_sample: fixtureCompleto.rows.slice(0, 5)
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/sudamericana/debug-bd-actualizada/:userId - Verificar si se actualizó correctamente
router.get('/debug-bd-actualizada/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    // Consultar los pronósticos actualizados
    const pronosticosActualizados = await pool.query(
      'SELECT id, usuario_id, fixture_id, ronda, equipo_local, equipo_visita, ganador, goles_local, goles_visita FROM pronosticos_sudamericana WHERE usuario_id = $1 AND fixture_id IN ($2, $3) ORDER BY fixture_id',
      [userId, 90003, 90004]
    );
    
    // Verificar si ahora el sistema de comparación funciona correctamente
    const dicSiglasReales = await obtenerClasificadosReales();
    const dicSiglasUsuario = await obtenerClasificadosUsuario(userId);
    
    // Simular la comparación como lo hace el endpoint de clasificación
    const fixturesResult = await pool.query('SELECT * FROM sudamericana_fixtures WHERE fixture_id IN ($1, $2)', [90003, 90004]);
    const fixture = fixturesResult.rows;
    const pronos = pronosticosActualizados.rows;
    
    // Aplicar reemplazos igual que en clasificación
    const fixtureConNombresReales = reemplazarSiglasPorNombres(fixture, dicSiglasReales);
    const pronosUsuarioConNombres = reemplazarSiglasPorNombres(pronos, dicSiglasUsuario);
    
    // Crear resultados para comparación
    const resultados = fixtureConNombresReales.map(f => ({
      fixture_id: f.fixture_id,
      goles_local: f.goles_local,
      goles_visita: f.goles_visita,
      ganador: f.ganador,
      equipo_local: f.equipo_local,
      equipo_visita: f.equipo_visita,
      ronda: f.ronda,
      bonus: f.bonus
    }));
    
    // Calcular puntajes para ver si ahora la comparación es correcta
    const { calcularPuntajesSudamericana } = await import('../services/puntajesSudamericana.js');
    const puntajes = calcularPuntajesSudamericana(fixtureConNombresReales, pronosUsuarioConNombres, resultados, userId);
    
    res.json({
      usuario_id: userId,
      estado: "Datos actualizados - verificando comparación",
      pronosticos_actualizados: pronosticosActualizados.rows,
      diccionario_usuario: dicSiglasUsuario,
      diccionario_real: dicSiglasReales,
      fixture_con_nombres_reales: fixtureConNombresReales,
      pronos_con_nombres_usuario: pronosUsuarioConNombres,
      resultados_para_comparacion: resultados,
      puntajes_calculados: puntajes.detalle.map(d => ({
        fixture_id: d.fixture_id,
        cruceReal: `${d.real?.equipo_local} vs ${d.real?.equipo_visita}`,
        crucePronosticado: `${d.pron?.equipo_local} vs ${d.pron?.equipo_visita}`,
        cruceCoincide: d.cruceCoincide,
        pts: d.pts,
        motivoSinPuntos: d.motivoSinPuntos
      }))
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/sudamericana/clasificados/:userId - Obtener clasificados del usuario
router.get('/clasificados/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    // Obtener fixtures y pronósticos para calcular dinámicamente
    const fixturesResult = await pool.query('SELECT * FROM sudamericana_fixtures ORDER BY fixture_id');
    const pronosticosResult = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1', [userId]);
    
    // Calcular avance usando la función corregida
    const diccionarioSiglas = calcularAvanceSiglas(fixturesResult.rows, pronosticosResult.rows);
    
    // Crear clasificados_por_ronda basado en el diccionario calculado
    const clasificadosUsuario = {
      'Knockout Round Play-offs': [],
      'Octavos de Final': [],
      'Cuartos de Final': [],
      'Semifinales': [],
      'Final': []
    };
    
    // Mapear WP01-WP08 a Knockout Round Play-offs
    for (let i = 1; i <= 8; i++) {
      const wp = `WP0${i}`;
      if (diccionarioSiglas[wp]) {
        clasificadosUsuario['Knockout Round Play-offs'].push(diccionarioSiglas[wp]);
      }
    }
    
    // Mapear WO.A-WO.H a Octavos de Final
    const octavosKeys = ['WO.A', 'WO.B', 'WO.C', 'WO.D', 'WO.E', 'WO.F', 'WO.G', 'WO.H'];
    octavosKeys.forEach(key => {
      if (diccionarioSiglas[key]) {
        clasificadosUsuario['Octavos de Final'].push(diccionarioSiglas[key]);
      }
    });
    
    // Mapear WC1-WC4 a Cuartos de Final
    for (let i = 1; i <= 4; i++) {
      const wc = `WC${i}`;
      if (diccionarioSiglas[wc]) {
        clasificadosUsuario['Cuartos de Final'].push(diccionarioSiglas[wc]);
      }
    }
    
    // Mapear WS1-WS2 a Semifinales
    for (let i = 1; i <= 2; i++) {
      const ws = `WS${i}`;
      if (diccionarioSiglas[ws]) {
        clasificadosUsuario['Semifinales'].push(diccionarioSiglas[ws]);
      }
    }
    
    // Mapear campeón a Final
    if (diccionarioSiglas['WS1 vs WS2'] || diccionarioSiglas['CHAMPION']) {
      clasificadosUsuario['Final'].push(diccionarioSiglas['WS1 vs WS2'] || diccionarioSiglas['CHAMPION']);
    }
    
    res.json({
      clasificados_por_ronda: clasificadosUsuario,
      diccionario_siglas: diccionarioSiglas,
      raw_data: [] // Ya no se usa la tabla clasif_sud_pron
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
