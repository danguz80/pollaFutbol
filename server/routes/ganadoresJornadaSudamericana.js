import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { checkRole } from '../middleware/checkRole.js';
import { generarPdfFinalBuffer } from '../utils/pdfFinal.js';
import { calcularTablaOficial } from '../utils/calcularClasificadosSudamericana.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// IMPORTANTE: Rutas específicas (/acumulado) ANTES de rutas con parámetros (/:jornadaNumero)

// POST: Calcular y guardar ganador del ranking acumulado TOTAL (todas las jornadas)
router.post('/acumulado', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    // Verificar/crear tabla sudamericana_ganadores_acumulado (NO hacer DROP - mantener histórico)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_ganadores_acumulado (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
        puntaje INTEGER NOT NULL,
        fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Obtener el ranking acumulado TOTAL (todas las jornadas) - INCLUIR CLASIFICACIÓN
    const rankingResult = await pool.query(`
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(puntos_partidos.total, 0) + COALESCE(puntos_clasificacion.total, 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN (
        SELECT usuario_id, SUM(puntos) as total
        FROM sudamericana_pronosticos
        GROUP BY usuario_id
      ) puntos_partidos ON puntos_partidos.usuario_id = u.id
      LEFT JOIN (
        SELECT usuario_id, SUM(puntos) as total
        FROM sudamericana_puntos_clasificacion
        GROUP BY usuario_id
      ) puntos_clasificacion ON puntos_clasificacion.usuario_id = u.id
      WHERE u.activo_sudamericana = true
        AND (COALESCE(puntos_partidos.total, 0) + COALESCE(puntos_clasificacion.total, 0)) > 0
      ORDER BY puntos_acumulados DESC, u.nombre ASC
    `);
    
    if (rankingResult.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontraron usuarios con pronósticos' });
    }
    
    // Obtener el top 3 del ranking para guardar en históricos
    const top3 = rankingResult.rows.slice(0, 3);
    
    // Encontrar el puntaje máximo para retornar los ganadores
    const puntajeMaximo = Math.max(...rankingResult.rows.map(u => parseInt(u.puntos_acumulados, 10)));
    
    // Obtener todos los usuarios con el puntaje máximo (manejo de empates para mostrar)
    const ganadores = rankingResult.rows.filter(u => parseInt(u.puntos_acumulados, 10) === puntajeMaximo);
    
    if (ganadores.length === 0) {
      return res.status(404).json({ error: 'No se pudieron determinar ganadores' });
    }
    
    // Borrar ganadores acumulados anteriores (se recalculan cada vez)
    await pool.query('DELETE FROM sudamericana_ganadores_acumulado');
    
    // Guardar el TOP 3 en la tabla (no solo el ganador)
    for (let i = 0; i < top3.length; i++) {
      await pool.query(
        `INSERT INTO sudamericana_ganadores_acumulado (usuario_id, puntaje)
         VALUES ($1, $2)`,
        [top3[i].id, parseInt(top3[i].puntos_acumulados, 10)]
      );
    }
    
    // NOTA: acá antes se generaba también el PDF Final de J10 (para
    // "enviarlo por email"), pero ese envío nunca existió de verdad — el
    // buffer se descartaba sin mandarse a ningún lado. Se saca esa
    // generación: este endpoint solo calcula y guarda el campeón del
    // acumulado. El PDF Final real se genera aparte, bajo demanda, desde
    // el botón dedicado (POST /:jornadaNumero/pdf-final).

    // Registrar notificación para usuarios
    try {
      const mensajeNotificacion = ganadores.length === 1 
        ? `🏆 EL CAMPEÓN DE COPA SUDAMERICANA ES: ${ganadores[0].nombre.toUpperCase()}`
        : `🏆 LOS CAMPEONES DE COPA SUDAMERICANA SON: ${ganadores.map(g => g.nombre.toUpperCase()).join(', ')}`;
      
      // Primero eliminar notificaciones anteriores del acumulado
      await pool.query(
        `DELETE FROM notificaciones 
         WHERE competencia = $1 AND tipo = $2`,
        ['sudamericana', 'acumulado']
      );
      
      // Luego insertar la nueva notificación
      const resultNotif = await pool.query(
        `INSERT INTO notificaciones (competencia, tipo, tipo_notificacion, jornada_numero, ganadores, mensaje, icono, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          'sudamericana', 
          'acumulado', 
          'ganador_acumulado',
          null, 
          JSON.stringify(ganadores.map(g => ({
            nombre: g.nombre,
            puntaje: puntajeMaximo,
            foto_perfil: g.foto_perfil
          }))), 
          mensajeNotificacion,
          '👑',
          '/sudamericana/clasificacion'
        ]
      );
      
      console.log(`✅ Notificación acumulado Sudamericana creada con ID: ${resultNotif.rows[0].id}`);
    } catch (errorNotif) {
      console.error('❌ Error creando notificación acumulado Sudamericana:', errorNotif);
      // No fallar la petición completa si la notificación falla
    }
    
    // Retornar los ganadores
    res.json({
      tipo: 'acumulado',
      ganadores: ganadores.map(g => ({
        nombre: g.nombre,
        foto_perfil: g.foto_perfil,
        puntaje: parseInt(puntajeMaximo, 10) || 0
      })),
      mensaje: ganadores.length === 1
        ? `🏆 EL CAMPEÓN DE COPA SUDAMERICANA ES: ${ganadores[0].nombre.toUpperCase()}`
        : `🏆 LOS CAMPEONES DE COPA SUDAMERICANA SON: ${ganadores.map(g => g.nombre.toUpperCase()).join(', ')}`
    });
    
  } catch (error) {
    console.error('Error calculando ganadores acumulado Sudamericana:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Error calculando ganadores del ranking acumulado',
      details: error.message 
    });
  }
});

// GET: Obtener ganadores del ranking acumulado
router.get('/acumulado', async (req, res) => {
  try {
    // Verificar si la tabla existe
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'sudamericana_ganadores_acumulado'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      return res.json({ ganadores: [], mensaje: null });
    }
    
    const result = await pool.query(`
      SELECT 
        sga.puntaje,
        sga.fecha_calculo,
        u.id as usuario_id,
        u.nombre,
        u.foto_perfil
      FROM sudamericana_ganadores_acumulado sga
      INNER JOIN usuarios u ON sga.usuario_id = u.id
      ORDER BY u.nombre
    `);
    
    if (result.rows.length === 0) {
      return res.json({ ganadores: [], mensaje: null });
    }
    
    const ganadores = result.rows.map(row => ({
      nombre: row.nombre,
      foto_perfil: row.foto_perfil,
      puntaje: parseInt(row.puntaje, 10) || 0
    }));
    
    const mensaje = ganadores.length === 1 
      ? `🏆 EL CAMPEÓN DE COPA SUDAMERICANA ES: ${ganadores[0].nombre.toUpperCase()}`
      : `🏆 LOS CAMPEONES DE COPA SUDAMERICANA SON: ${ganadores.map(g => g.nombre.toUpperCase()).join(', ')}`;
    
    res.json({
      tipo: 'acumulado',
      ganadores,
      mensaje,
      fechaCalculo: result.rows[0].fecha_calculo
    });
    
  } catch (error) {
    console.error('Error obteniendo ganadores acumulado Sudamericana:', error);
    res.status(500).json({ error: 'Error obteniendo ganadores del ranking acumulado' });
  }
});

// GET: Obtener resumen de títulos de todos los ganadores
router.get('/titulos', async (req, res) => {
  try {
    // Verificar si la tabla existe
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'sudamericana_ganadores_jornada'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      return res.json([]);
    }
    
    const result = await pool.query(`
      SELECT u.id, u.nombre, u.foto_perfil, COUNT(*) AS titulos
      FROM sudamericana_ganadores_jornada sgj
      JOIN usuarios u ON sgj.usuario_id = u.id
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY titulos DESC, u.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo títulos Sudamericana:', error);
    res.status(500).json({ error: 'No se pudo obtener el resumen de títulos' });
  }
});

// POST: Calcular y guardar ganadores de una jornada específica
router.post('/:jornadaNumero', verifyToken, checkRole('admin'), async (req, res) => {
  const jornadaNumero = parseInt(req.params.jornadaNumero);
  
  // Validar que jornadaNumero sea un número válido
  if (isNaN(jornadaNumero)) {
    return res.status(400).json({ error: 'Número de jornada inválido' });
  }
  
  try {
    // Verificar/crear tabla sudamericana_ganadores_jornada SI NO EXISTE
    // Primero verificar si existe con el esquema correcto
    const tableCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sudamericana_ganadores_jornada'
    `);
    
    const columns = tableCheck.rows.map(row => row.column_name);
    const hasJornadaNumero = columns.includes('jornada_numero');
    
    // Si la tabla existe pero no tiene jornada_numero, eliminarla
    if (columns.length > 0 && !hasJornadaNumero) {
      console.log('⚠️ Tabla sudamericana_ganadores_jornada tiene esquema antiguo, recreando...');
      await pool.query('DROP TABLE IF EXISTS sudamericana_ganadores_jornada CASCADE');
    }
    
    // Crear tabla con el esquema correcto
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sudamericana_ganadores_jornada (
        id SERIAL PRIMARY KEY,
        jornada_numero INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        puntaje INTEGER NOT NULL,
        fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(jornada_numero, usuario_id)
      )
    `);
    
    // 1. Obtener todos los usuarios activos en Sudamericana con sus fotos de perfil
    const usuariosResult = await pool.query(
      'SELECT id, nombre, foto_perfil FROM usuarios WHERE activo_sudamericana = true ORDER BY nombre'
    );
    
    console.log(`\n🔍 DEBUG GANADORES SUDAMERICANA J${jornadaNumero}`);
    console.log(`Total usuarios activos: ${usuariosResult.rows.length}`);
    
    if (usuariosResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay usuarios activos en Sudamericana' });
    }
    
    // 2. Calcular puntos de cada usuario para la jornada - SOLO PARTIDOS
    const puntosUsuarios = [];
    
    for (const usuario of usuariosResult.rows) {
      // Puntos de partidos (usando p.jornada_id porque sp.jornada_id es NULL)
      const puntosPartidosResult = await pool.query(`
        SELECT COALESCE(SUM(sp.puntos::integer), 0) as puntos_partidos
        FROM sudamericana_pronosticos sp
        INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
        INNER JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
        WHERE sp.usuario_id = $1 AND sj.numero = $2
      `, [usuario.id, jornadaNumero]);
      
      const puntosPartidos = parseInt(puntosPartidosResult.rows[0].puntos_partidos || 0, 10);
      
      // Puntos de clasificación (solo para log)
      const puntosClasificacionResult = await pool.query(`
        SELECT COALESCE(SUM(pc.puntos::integer), 0) as puntos_clasificacion
        FROM sudamericana_puntos_clasificacion pc
        WHERE pc.usuario_id = $1 AND pc.jornada_numero = $2
      `, [usuario.id, jornadaNumero]);
      
      const puntosClasificacion = parseInt(puntosClasificacionResult.rows[0].puntos_clasificacion || 0, 10);
      
      // SOLO puntos por partidos para ganador de jornada
      const puntajeTotal = puntosPartidos;
      
      if (puntosUsuarios.length < 3 || puntosClasificacion > 0) {
        console.log(`🔍 Usuario ${usuario.nombre}: partidos=${puntosPartidos}, clasificación=${puntosClasificacion}, total=${puntajeTotal}`);
      }
      
      puntosUsuarios.push({
        usuario_id: usuario.id,
        nombre: usuario.nombre,
        foto_perfil: usuario.foto_perfil,
        puntaje: puntajeTotal
      });
    }
    
    // Verificar que haya datos
    if (puntosUsuarios.length === 0) {
      return res.status(404).json({ error: 'No se encontraron usuarios con pronósticos para esta jornada' });
    }
    
    // 3. Encontrar el puntaje máximo
    const puntajeMaximo = Math.max(...puntosUsuarios.map(u => u.puntaje));
    
    // 4. Obtener todos los usuarios con el puntaje máximo (manejo de empates)
    const ganadores = puntosUsuarios.filter(u => u.puntaje === puntajeMaximo);
    
    if (ganadores.length === 0) {
      return res.status(404).json({ error: 'No se pudieron determinar ganadores' });
    }
    
    // 5. Borrar ganadores anteriores de esta jornada (si existen)
    await pool.query(
      'DELETE FROM sudamericana_ganadores_jornada WHERE jornada_numero = $1',
      [jornadaNumero]
    );
    
    // 6. Guardar los nuevos ganadores
    console.log(`📝 Guardando ${ganadores.length} ganador(es) para jornada ${jornadaNumero} Sudamericana`);
    for (const ganador of ganadores) {
      await pool.query(
        `INSERT INTO sudamericana_ganadores_jornada (jornada_numero, usuario_id, puntaje)
         VALUES ($1, $2, $3)`,
        [jornadaNumero, ganador.usuario_id, ganador.puntaje]
      );
    }
    
    // 7. Registrar notificación para usuarios
    console.log(`🔔 Creando notificación para jornada ${jornadaNumero} Sudamericana...`);
    try {
      const mensajeNotificacion = ganadores.length === 1 
        ? `El ganador de la jornada ${jornadaNumero} de Copa Sudamericana es: ${ganadores[0].nombre}`
        : `Los ganadores de la jornada ${jornadaNumero} de Copa Sudamericana son: ${ganadores.map(g => g.nombre).join(', ')}`;
      
      // Primero eliminar notificaciones anteriores de esta jornada
      await pool.query(
        `DELETE FROM notificaciones 
         WHERE competencia = $1 AND tipo = $2 AND jornada_numero = $3`,
        ['sudamericana', 'jornada', jornadaNumero]
      );
      
      // Luego insertar la nueva notificación
      const resultNotif = await pool.query(
        `INSERT INTO notificaciones (competencia, tipo, tipo_notificacion, jornada_numero, ganadores, mensaje, icono, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          'sudamericana', 
          'jornada', 
          'ganador_jornada',
          jornadaNumero, 
          JSON.stringify(ganadores.map(g => ({
            nombre: g.nombre,
            puntaje: g.puntaje,
            foto_perfil: g.foto_perfil
          }))), 
          mensajeNotificacion,
          '🏆',
          `/sudamericana/clasificacion?jornada=${jornadaNumero}`
        ]
      );
      
      console.log(`✅ Notificación Sudamericana creada con ID: ${resultNotif.rows[0].id}`);
    } catch (errorNotif) {
      console.error('❌ Error creando notificación Sudamericana:', errorNotif);
      // No fallar la petición completa si la notificación falla
    }
    
    // 8. Retornar los ganadores. Este endpoint SOLO calcula y guarda el
    // ganador de la jornada — ya no genera ni "envía" un PDF acá (esa
    // generación era puro gasto de memoria: el buffer resultante nunca se
    // enviaba a ningún lado, ni por email ni de ninguna otra forma). El PDF
    // Final real se genera aparte, bajo demanda, desde el botón dedicado
    // (POST /:jornadaNumero/pdf-final).
    const mensaje = ganadores.length === 1
      ? `El ganador de la jornada ${jornadaNumero} de Copa Sudamericana es: ${ganadores[0].nombre}.`
      : `Los ganadores de la jornada ${jornadaNumero} de Copa Sudamericana son: ${ganadores.map(g => g.nombre).join(', ')}.`;

    res.json({
      jornadaNumero,
      ganadores: ganadores.map(g => ({
        nombre: g.nombre,
        puntaje: g.puntaje,
        foto_perfil: g.foto_perfil
      })),
      mensaje
    });
    
  } catch (error) {
    console.error('Error calculando ganadores Sudamericana:', error);
    console.error('Stack trace:', error.stack);
    console.error('Error message:', error.message);
    res.status(500).json({ 
      error: 'Error calculando ganadores de la jornada',
      details: error.message 
    });
  }
});

// GET: Obtener ganadores de una jornada
router.get('/:jornadaNumero', async (req, res) => {
  const jornadaNumero = parseInt(req.params.jornadaNumero);
  
  // Validar que jornadaNumero sea un número válido
  if (isNaN(jornadaNumero)) {
    return res.status(400).json({ error: 'Número de jornada inválida' });
  }
  
  try {
    // Verificar si existen ganadores guardados para esta jornada
    const ganadoresGuardados = await pool.query(`
      SELECT 
        sgj.puntaje,
        sgj.fecha_calculo,
        u.id,
        u.nombre,
        u.foto_perfil
      FROM sudamericana_ganadores_jornada sgj
      INNER JOIN usuarios u ON sgj.usuario_id = u.id
      WHERE sgj.jornada_numero = $1
      ORDER BY sgj.puntaje DESC, u.nombre ASC
    `, [jornadaNumero]);
    
    if (ganadoresGuardados.rows.length > 0) {
      // Usar los ganadores guardados (con el puntaje correcto de solo partidos)
      const ganadores = ganadoresGuardados.rows.map(row => ({
        nombre: row.nombre,
        puntaje: parseInt(row.puntaje),
        foto_perfil: row.foto_perfil
      }));
      
      const mensaje = ganadores.length === 1 
        ? `El ganador de la jornada ${jornadaNumero} de Copa Sudamericana es: ${ganadores[0].nombre}`
        : `Los ganadores de la jornada ${jornadaNumero} de Copa Sudamericana son: ${ganadores.map(g => g.nombre).join(', ')}`;
      
      return res.json({
        jornadaNumero,
        ganadores,
        mensaje,
        fechaCalculo: ganadoresGuardados.rows[0].fecha_calculo
      });
    }
    
    // Si no hay ganadores guardados, retornar vacío
    return res.json({ ganadores: [], mensaje: null });
    
  } catch (error) {
    console.error('Error obteniendo ganadores Sudamericana:', error);
    res.status(500).json({ error: 'Error obteniendo ganadores de la jornada' });
  }
});

// ==================== FUNCIÓN PARA GENERAR PDF CON RESULTADOS Y GANADORES ====================
async function generarPDFSudamericanaConGanadores(jornadaNumero, ganadores) {
  try {
    const normalizarTexto = (valor) => (valor || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();

    const reglaCoincide = (regla, fase, conceptoIncluye) => {
      const faseNorm = normalizarTexto(regla.fase);
      const conceptoNorm = normalizarTexto(regla.concepto);
      return faseNorm === normalizarTexto(fase) && conceptoNorm.includes(normalizarTexto(conceptoIncluye));
    };

    // Reglas dinámicas desde la página de Puntuación.
    const reglasPuntuacionResult = await pool.query(`
      SELECT fase, concepto, puntos
      FROM sudamericana_puntuacion
      ORDER BY id
    `);
    const reglasPuntuacion = reglasPuntuacionResult.rows;

    const obtenerPuntos = (fase, conceptoIncluye, fallback = 0) => {
      const regla = reglasPuntuacion.find((r) => reglaCoincide(r, fase, conceptoIncluye));
      return regla ? Number(regla.puntos || 0) : fallback;
    };

    const puntosClasificacionReglas = {
      playoffs: obtenerPuntos('CLASIFICACIÓN', 'PLAY-OFFS', 2),
      octavos: obtenerPuntos('CLASIFICACIÓN', 'OCTAVOS', 2),
      cuartos: obtenerPuntos('CLASIFICACIÓN', 'CUARTOS', 3),
      semifinales: obtenerPuntos('CLASIFICACIÓN', 'SEMIFINALES', 3),
      final: obtenerPuntos('CLASIFICACIÓN', 'LA FINAL', 5),
      campeon: obtenerPuntos('CAMPEÓN', 'CAMPEON', 15),
      subcampeon: obtenerPuntos('CAMPEÓN', 'SUBCAMPEON', 8)
    };

    // 1. Obtener pronósticos con resultados reales y puntos de la jornada específica
    const pronosticosQuery = await pool.query(
      `SELECT
        u.nombre AS usuario,
        u.foto_perfil,
        p.nombre_local,
        p.nombre_visita,
        p.fecha,
        p.bonus,
        p.id as partido_id,
        sp.goles_local AS pred_local,
        sp.goles_visita AS pred_visita,
        sp.penales_local AS pred_pen_local,
        sp.penales_visita AS pred_pen_visita,
        p.goles_local AS real_local,
        p.goles_visita AS real_visita,
        p.penales_local AS real_pen_local,
        p.penales_visita AS real_pen_visita,
        p.tipo_partido,
        sp.puntos,
        sj.numero AS jornada_numero,
        sj.nombre AS jornada_nombre
      FROM sudamericana_pronosticos sp
      JOIN usuarios u ON sp.usuario_id = u.id
      JOIN sudamericana_partidos p ON sp.partido_id = p.id
      JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      WHERE p.goles_local IS NOT NULL AND p.goles_visita IS NOT NULL
        AND sj.numero = $1
      ORDER BY u.nombre, p.fecha, p.id`,
      [jornadaNumero]
    );

    // 2. Obtener ranking acumulado hasta la jornada (excluyendo admins) - INCLUIR CLASIFICACIÓN
    // USAR MISMA QUERY QUE /api/sudamericana-rankings/acumulado/:numero
    const rankingQuery = await pool.query(
      `SELECT
        u.id,
        u.nombre AS usuario,
        u.foto_perfil,
        (COALESCE(puntos_partidos.total::integer, 0) + COALESCE(puntos_clasificacion.total::integer, 0)) as puntaje_total,
        ROW_NUMBER() OVER (ORDER BY (COALESCE(puntos_partidos.total::integer, 0) + COALESCE(puntos_clasificacion.total::integer, 0)) DESC, u.nombre ASC) AS posicion
      FROM usuarios u
      LEFT JOIN (
        SELECT sp.usuario_id, SUM(sp.puntos::integer) as total
        FROM sudamericana_pronosticos sp
        INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
        INNER JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
        WHERE sj.numero <= $1
        GROUP BY sp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      LEFT JOIN (
        SELECT pc.usuario_id, SUM(pc.puntos::integer) as total
        FROM sudamericana_puntos_clasificacion pc
        WHERE pc.jornada_numero <= $1
        GROUP BY pc.usuario_id
      ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
      WHERE u.rol != 'admin'
        AND EXISTS (
          SELECT 1 FROM sudamericana_pronosticos sp2
          INNER JOIN sudamericana_partidos p2 ON sp2.partido_id = p2.id
          INNER JOIN sudamericana_jornadas sj2 ON p2.jornada_id = sj2.id
          WHERE sp2.usuario_id = u.id AND sj2.numero <= $1
        )
      ORDER BY puntaje_total DESC, u.nombre ASC
      LIMIT 10`,
      [jornadaNumero]
    );

    // 3. Obtener ranking de la jornada específica (excluyendo admins) - SOLO PUNTOS DE PARTIDOS
    // USAR MISMA QUERY QUE /api/sudamericana-rankings/jornada/:numero
    const rankingJornadaQuery = await pool.query(
      `SELECT
        u.id,
        u.nombre AS usuario,
        u.foto_perfil,
        COALESCE(puntos_partidos.total, 0) as puntos_jornada,
        ROW_NUMBER() OVER (ORDER BY COALESCE(puntos_partidos.total, 0) DESC, u.nombre ASC) AS posicion
      FROM usuarios u
      LEFT JOIN (
        SELECT sp.usuario_id, SUM(sp.puntos) as total
        FROM sudamericana_pronosticos sp
        INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
        INNER JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
        WHERE sj.numero = $1
        GROUP BY sp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      WHERE u.rol != 'admin'
        AND EXISTS (
          SELECT 1 FROM sudamericana_pronosticos sp2
          INNER JOIN sudamericana_partidos p2 ON sp2.partido_id = p2.id
          INNER JOIN sudamericana_jornadas sj2 ON p2.jornada_id = sj2.id
          WHERE sp2.usuario_id = u.id AND sj2.numero = $1
        )
      ORDER BY puntos_jornada DESC, u.nombre ASC
      LIMIT 10`,
      [jornadaNumero]
    );

    const pronosticos = pronosticosQuery.rows;
    const ranking = rankingQuery.rows;
    const rankingJornada = rankingJornadaQuery.rows;

    // AGREGAR DATOS DE CLASIFICACIÓN PARA JORNADA 6, 7, 8, 9 y 10
    let clasificacionPorUsuario = {};
    if (jornadaNumero === 6) {
      // 1. Calcular las tablas OFICIALES primero (ya importado arriba)
      const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const jornadasNumeros = [1, 2, 3, 4, 5, 6];

      for (const grupo of grupos) {
        await calcularTablaOficial(grupo, jornadasNumeros);
      }

      // 2. Obtener TODOS los pronósticos de clasificación (ahora incluye aciertos y fallos)
      const clasificacionQuery = await pool.query(`
        SELECT
          u.nombre AS usuario,
          spc.equipo_clasificado,
          spc.equipo_oficial,
          spc.fase_clasificado,
          spc.puntos
        FROM sudamericana_puntos_clasificacion spc
        JOIN usuarios u ON spc.usuario_id = u.id
        WHERE spc.jornada_numero = $1
        ORDER BY u.nombre, spc.fase_clasificado
      `, [jornadaNumero]);

      clasificacionQuery.rows.forEach(row => {
        if (!clasificacionPorUsuario[row.usuario]) {
          clasificacionPorUsuario[row.usuario] = [];
        }
        row.equipo_real_avanza = row.equipo_oficial || '?';
        clasificacionPorUsuario[row.usuario].push(row);
      });
    } else if (jornadaNumero >= 7 && jornadaNumero <= 10) {
      // JORNADA 7: Play-Offs -> Octavos | J8: Octavos -> Cuartos
      // J9: Cuartos -> Semifinales | J10: Semifinales y Final (finalistas, campeón, subcampeón)
      const clasificacionQuery = jornadaNumero === 10
        ? await pool.query(`
            SELECT
              u.nombre AS usuario,
              spc.equipo_clasificado,
              spc.equipo_oficial,
              spc.fase_clasificado,
              spc.puntos
            FROM sudamericana_puntos_clasificacion spc
            JOIN usuarios u ON spc.usuario_id = u.id
            WHERE spc.jornada_numero = $1
            ORDER BY u.nombre,
              CASE spc.fase_clasificado
                WHEN 'FINALISTA' THEN 1
                WHEN 'CAMPEON' THEN 2
                WHEN 'SUBCAMPEON' THEN 3
              END
          `, [jornadaNumero])
        : await pool.query(`
            SELECT
              u.nombre AS usuario,
              spc.equipo_clasificado,
              spc.equipo_oficial,
              spc.fase_clasificado,
              spc.puntos
            FROM sudamericana_puntos_clasificacion spc
            JOIN usuarios u ON spc.usuario_id = u.id
            WHERE spc.jornada_numero = $1
            ORDER BY u.nombre, spc.fase_clasificado
          `, [jornadaNumero]);

      clasificacionQuery.rows.forEach(row => {
        if (!clasificacionPorUsuario[row.usuario]) {
          clasificacionPorUsuario[row.usuario] = [];
        }
        row.equipo_real_avanza = row.equipo_oficial || '?';
        clasificacionPorUsuario[row.usuario].push(row);
      });
    }

    // Agrupar pronósticos por usuario
    const pronosticosPorUsuario = {};
    pronosticos.forEach((p) => {
      if (!pronosticosPorUsuario[p.usuario]) {
        pronosticosPorUsuario[p.usuario] = {
          foto_perfil: p.foto_perfil,
          pronosticos: []
        };
      }
      pronosticosPorUsuario[p.usuario].pronosticos.push(p);
    });

    // Construir la lista de secciones "por usuario" para el generador pdfkit.
    const usuariosPdf = [];
    const usuariosOrdenados = Object.keys(pronosticosPorUsuario).sort();

    for (const usuario of usuariosOrdenados) {
      const data = pronosticosPorUsuario[usuario];

      // Calcular puntaje de PARTIDOS
      const puntosPartidos = data.pronosticos.reduce((sum, p) => sum + (p.puntos || 0), 0);

      // Calcular puntos de CLASIFICACIÓN (separados, no suman al total de jornada)
      const puntosClasificacion = (jornadaNumero >= 6 && jornadaNumero <= 10 && clasificacionPorUsuario[usuario])
        ? clasificacionPorUsuario[usuario].reduce((sum, c) => sum + (c.puntos || 0), 0)
        : 0;

      const partesResumen = [`Puntaje: ${puntosPartidos} pts`];
      if (puntosClasificacion > 0) partesResumen.push(`Clasificación: ${puntosClasificacion} pts`);

      const filasPartidos = data.pronosticos.map((p) => {
        const predLocal = p.pred_local !== null && p.pred_local !== undefined ? p.pred_local : '-';
        const predVisita = p.pred_visita !== null && p.pred_visita !== undefined ? p.pred_visita : '-';

        let pronostico = `${predLocal} - ${predVisita}`;
        if (p.tipo_partido === 'VUELTA' && p.pred_pen_local !== null && p.pred_pen_visita !== null) {
          pronostico += ` (${p.pred_pen_local}-${p.pred_pen_visita} pen.)`;
        }

        let resultado = `${p.real_local} - ${p.real_visita}`;
        if (p.tipo_partido === 'VUELTA' && p.real_pen_local !== null && p.real_pen_visita !== null) {
          resultado += ` (${p.real_pen_local}-${p.real_pen_visita} pen.)`;
        }

        return [
          p.jornada_numero,
          `${p.nombre_local} vs ${p.nombre_visita}`,
          pronostico,
          resultado,
          `x${p.bonus || 1}`,
          p.puntos || 0
        ];
      });

      // Sección "Equipo que avanza" (J6 a J10, incluye finalista/campeón/subcampeón en J10)
      let tablaClasificacion = null;
      if (jornadaNumero >= 6 && jornadaNumero <= 10 && clasificacionPorUsuario[usuario] && clasificacionPorUsuario[usuario].length > 0) {
        const filas = clasificacionPorUsuario[usuario].map((c) => {
          let textoFase = '';

          if (jornadaNumero === 6) {
            const grupoMatch = c.fase_clasificado.match(/GRUPO_([A-H])/);
            const grupoLetra = grupoMatch ? grupoMatch[1] : '';
            textoFase = c.fase_clasificado.includes('OCTAVOS')
              ? `1° Clasificado a Octavos - Grupo ${grupoLetra} (${puntosClasificacionReglas.octavos} pts)`
              : `2° Clasificado a Playoffs - Grupo ${grupoLetra} (${puntosClasificacionReglas.playoffs} pts)`;
          } else if (jornadaNumero === 7) {
            textoFase = `Clasificado a Octavos (${puntosClasificacionReglas.octavos} pts)`;
          } else if (jornadaNumero === 8) {
            textoFase = `Clasificado a Cuartos (${puntosClasificacionReglas.cuartos} pts)`;
          } else if (jornadaNumero === 9) {
            textoFase = `Clasificado a Semifinales (${puntosClasificacionReglas.semifinales} pts)`;
          } else if (jornadaNumero === 10) {
            if (c.fase_clasificado === 'FINALISTA') textoFase = `Finalista (${puntosClasificacionReglas.final} pts)`;
            else if (c.fase_clasificado === 'CAMPEON') textoFase = `Campeón (${puntosClasificacionReglas.campeon} pts)`;
            else if (c.fase_clasificado === 'SUBCAMPEON') textoFase = `Subcampeón (${puntosClasificacionReglas.subcampeon} pts)`;
          }

          const equipoPronosticado = c.equipo_clasificado || 'Sin pronóstico';
          const equipoReal = c.equipo_real_avanza || '?';

          return [`${textoFase}\n${equipoPronosticado}`, equipoReal, String(c.puntos)];
        });

        filas.push(['TOTAL CLASIFICACIÓN', '', String(puntosClasificacion)]);

        tablaClasificacion = {
          titulo: 'EQUIPO QUE AVANZA',
          columnas: ['Fase / Pronóstico', 'Equipo Real', 'Puntos'],
          filas
        };
      }

      usuariosPdf.push({
        nombre: usuario,
        resumenPuntos: partesResumen.join('   '),
        filasPartidos,
        tablaClasificacion,
        tablaPartidoFinal: null,
        tablaCuadroFinal: null
      });
    }

    const ganadorAcumulado = (jornadaNumero === 10 && ranking.length > 0)
      ? { usuario: ranking[0].usuario, puntaje_total: ranking[0].puntaje_total }
      : null;

    // Generar el PDF con pdfkit (sin Chromium, bajo consumo de memoria)
    console.log(`📄 Generando PDF Sudamericana jornada ${jornadaNumero}...`);

    const pdfBuffer = await generarPdfFinalBuffer({
      competencia: 'Copa Sudamericana',
      jornadaNumero,
      ganadores: ganadores.map(g => ({ nombre: g.nombre, puntaje: g.puntaje })),
      ganadorAcumulado,
      rankingJornada: rankingJornada.map(r => ({
        posicion: parseInt(r.posicion, 10),
        usuario: r.usuario,
        puntos_jornada: r.puntos_jornada
      })),
      ranking: ranking.map(r => ({
        posicion: parseInt(r.posicion, 10),
        usuario: r.usuario,
        puntaje_total: r.puntaje_total
      })),
      usuarios: usuariosPdf
    });

    console.log(`✅ PDF Sudamericana jornada ${jornadaNumero} generado correctamente`);

    return pdfBuffer;
  } catch (error) {
    console.error('Error generando PDF Sudamericana:', error);
    throw error;
  }
}

// POST /:jornadaNumero/pdf-final - Generar PDF completo con resultados bajo demanda
router.post('/:jornadaNumero/pdf-final', verifyToken, checkRole('admin'), async (req, res) => {
  const jornadaNumero = parseInt(req.params.jornadaNumero);

  if (isNaN(jornadaNumero)) {
    return res.status(400).json({ error: 'Número de jornada inválido' });
  }

  try {
    console.log(`📄 Generando PDF Final Sudamericana Jornada ${jornadaNumero}...`);

    // Obtener ganadores guardados de la jornada (puede estar vacío si aún no se calcularon)
    const ganadoresResult = await pool.query(
      `SELECT u.nombre, u.foto_perfil, sgj.puntaje
       FROM sudamericana_ganadores_jornada sgj
       JOIN usuarios u ON sgj.usuario_id = u.id
       WHERE sgj.jornada_numero = $1
       ORDER BY sgj.puntaje DESC`,
      [jornadaNumero]
    );

    const ganadores = ganadoresResult.rows.map(r => ({
      nombre: r.nombre,
      foto_perfil: r.foto_perfil,
      puntaje: r.puntaje
    }));

    const pdfBuffer = await generarPDFSudamericanaConGanadores(jornadaNumero, ganadores);
    const nombreArchivo = `Resultados_Sudamericana_Jornada_${jornadaNumero}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generando PDF Final Sudamericana:', error);
    res.status(500).json({ error: 'Error generando PDF completo', details: error.message });
  }
});

export default router;
