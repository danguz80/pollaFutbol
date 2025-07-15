import express from 'express';
import { pool } from '../db/pool.js';
import { calcularPuntajesSudamericana } from '../services/puntajesSudamericana.js';
import { reemplazarSiglasPorNombres, calcularAvanceSiglas } from '../utils/sudamericanaSiglas.js';

const router = express.Router();

// Función para crear diccionario desde clasif_sud_pron (igual que en sudamericanaRanking.js)
function crearDiccionarioDesdeClasificados(clasificadosUsuario) {
  const dic = {};
  
  // Mapear clasificados por ronda hacia siglas predefinidas
  if (clasificadosUsuario['Knockout Round Play-offs']) {
    const knockout = clasificadosUsuario['Knockout Round Play-offs'];
    if (knockout[0]) dic['WP01'] = knockout[0];
    if (knockout[1]) dic['WP02'] = knockout[1];
    if (knockout[2]) dic['WP03'] = knockout[2];
    if (knockout[3]) dic['WP04'] = knockout[3];
    if (knockout[4]) dic['WP05'] = knockout[4];
    if (knockout[5]) dic['WP06'] = knockout[5];
    if (knockout[6]) dic['WP07'] = knockout[6];
    if (knockout[7]) dic['WP08'] = knockout[7];
  }
  
  if (clasificadosUsuario['Octavos de Final']) {
    const octavos = clasificadosUsuario['Octavos de Final'];
    if (octavos[0]) dic['WO.A'] = octavos[0];
    if (octavos[1]) dic['WO.B'] = octavos[1];
    if (octavos[2]) dic['WO.C'] = octavos[2];
    if (octavos[3]) dic['WO.D'] = octavos[3];
    if (octavos[4]) dic['WO.E'] = octavos[4];
    if (octavos[5]) dic['WO.F'] = octavos[5];
    if (octavos[6]) dic['WO.G'] = octavos[6];
    if (octavos[7]) dic['WO.H'] = octavos[7];
  }
  
  if (clasificadosUsuario['Cuartos de Final']) {
    const cuartos = clasificadosUsuario['Cuartos de Final'];
    if (cuartos[0]) dic['WC1'] = cuartos[0];
    if (cuartos[1]) dic['WC2'] = cuartos[1];
    if (cuartos[2]) dic['WC3'] = cuartos[2];
    if (cuartos[3]) dic['WC4'] = cuartos[3];
  }
  
  if (clasificadosUsuario['Semifinales']) {
    const semis = clasificadosUsuario['Semifinales'];
    if (semis[0]) dic['WS1'] = semis[0];
    if (semis[1]) dic['WS2'] = semis[1];
  }
  
  if (clasificadosUsuario['Final']) {
    const final = clasificadosUsuario['Final'];
    // El ganador de la final es el campeón
    if (final[0]) dic['CHAMPION'] = final[0];
  }
  
  return dic;
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
    
    // Obtener clasificados REALES calculando desde resultados de partidos
    const fixtureCompleto = await pool.query('SELECT * FROM sudamericana_fixtures');
    const dicSiglasReales = calcularAvanceSiglas(fixtureCompleto.rows);
    
    // Reemplazar siglas en fixture usando clasificados REALES calculados
    const fixtureConNombresReales = reemplazarSiglasPorNombres(fixture, dicSiglasReales);
    
    for (const u of usuarios) {
      // Obtener clasificados del usuario para crear diccionario de siglas del usuario
      const pronClasifRes = await pool.query(
        'SELECT ronda, clasificados FROM clasif_sud_pron WHERE usuario_id = $1',
        [u.usuario_id]
      );
      const clasificadosUsuario = {};
      for (const row of pronClasifRes.rows) {
        if (!clasificadosUsuario[row.ronda]) clasificadosUsuario[row.ronda] = [];
        if (row.clasificados && row.clasificados.trim()) {
          clasificadosUsuario[row.ronda].push(row.clasificados.trim());
        }
      }
      
      // Crear diccionario de siglas del usuario para sus pronósticos
      const dicSiglasUsuario = crearDiccionarioDesdeClasificados(clasificadosUsuario);
      
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
    
    // Obtener clasificados REALES calculando desde resultados de partidos
    const fixtureCompleto = await pool.query('SELECT * FROM sudamericana_fixtures');
    const dicSiglasReales = calcularAvanceSiglas(fixtureCompleto.rows);
    
    for (const usuario of usuarios) {
      // Obtener clasificados del usuario para crear diccionario de siglas
      const pronClasifRes = await pool.query(
        'SELECT ronda, clasificados FROM clasif_sud_pron WHERE usuario_id = $1',
        [usuario.usuario_id]
      );
      const clasificadosUsuario = {};
      for (const row of pronClasifRes.rows) {
        if (!clasificadosUsuario[row.ronda]) clasificadosUsuario[row.ronda] = [];
        if (row.clasificados && row.clasificados.trim()) {
          clasificadosUsuario[row.ronda].push(row.clasificados.trim());
        }
      }
      
      // Crear diccionario de siglas del usuario
      const dicSiglasUsuario = crearDiccionarioDesdeClasificados(clasificadosUsuario);
      
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
      
      // Calcular puntos por clasificados (igual lógica que en puntajesSudamericana.js)
      const pronMap = {};
      for (const row of pronClasifRes.rows) {
        if (!pronMap[row.ronda]) pronMap[row.ronda] = [];
        if (row.clasificados && row.clasificados.trim()) {
          pronMap[row.ronda].push(row.clasificados.trim());
        }
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
    
    // Obtener clasificados REALES calculando desde resultados de partidos
    const fixtureCompleto = await pool.query('SELECT * FROM sudamericana_fixtures');
    const dicSiglasReales = calcularAvanceSiglas(fixtureCompleto.rows);
    
    for (const u of usuarios) {
      // Obtener clasificados del usuario para crear diccionario de siglas
      const pronClasifRes = await pool.query(
        'SELECT ronda, clasificados FROM clasif_sud_pron WHERE usuario_id = $1',
        [u.usuario_id]
      );
      const clasificadosUsuario = {};
      for (const row of pronClasifRes.rows) {
        if (!clasificadosUsuario[row.ronda]) clasificadosUsuario[row.ronda] = [];
        if (row.clasificados && row.clasificados.trim()) {
          clasificadosUsuario[row.ronda].push(row.clasificados.trim());
        }
      }
      
      // Crear diccionario de siglas del usuario
      const dicSiglasUsuario = crearDiccionarioDesdeClasificados(clasificadosUsuario);
      
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
    
    // 3. Calcular clasificados REALES desde resultados
    const dicSiglasReales = calcularAvanceSiglas(fixtureCompleto.rows);
    
    // 4. Obtener clasificados REALES desde clasif_sud
    const realClasifRes = await pool.query('SELECT ronda, clasificados FROM clasif_sud ORDER BY ronda');
    
    // 5. DEBUG: Obtener los pronósticos del usuario para ver la propagación
    const pronosUsuario = await pool.query(
      'SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1 ORDER BY ronda, fixture_id',
      [userId]
    );
    
    // 6. Crear diccionario del usuario
    const clasificadosUsuario = {};
    for (const row of pronClasifRes.rows) {
      if (!clasificadosUsuario[row.ronda]) clasificadosUsuario[row.ronda] = [];
      if (row.clasificados && row.clasificados.trim()) {
        clasificadosUsuario[row.ronda].push(row.clasificados.trim());
      }
    }
    const dicSiglasUsuario = crearDiccionarioDesdeClasificados(clasificadosUsuario);
    
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

// GET /api/sudamericana/clasificados/:userId - Obtener clasificados del usuario
router.get('/clasificados/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      'SELECT ronda, clasificados FROM clasif_sud_pron WHERE usuario_id = $1 ORDER BY ronda, id',
      [userId]
    );
    
    // Convertir a formato agrupado por ronda y crear diccionario de siglas
    const clasificadosUsuario = {};
    for (const row of result.rows) {
      if (!clasificadosUsuario[row.ronda]) clasificadosUsuario[row.ronda] = [];
      if (row.clasificados && row.clasificados.trim()) {
        clasificadosUsuario[row.ronda].push(row.clasificados.trim());
      }
    }
    
    // Usar la misma función que se usa en todo el backend para crear el diccionario
    const diccionarioSiglas = crearDiccionarioDesdeClasificados(clasificadosUsuario);
    
    res.json({
      clasificados_por_ronda: clasificadosUsuario,
      diccionario_siglas: diccionarioSiglas,
      raw_data: result.rows
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
