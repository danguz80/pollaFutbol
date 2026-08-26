import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { checkRole } from '../middleware/checkRole.js';
import { generarPdfFinalBuffer } from '../utils/pdfFinal.js';
import { calcularTablaOficial } from '../utils/calcularClasificadosLibertadores.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();


// IMPORTANTE: Rutas específicas (/acumulado) ANTES de rutas con parámetros (/:jornadaNumero)

// POST: Calcular y guardar ganador del ranking acumulado TOTAL (todas las jornadas)
router.post('/acumulado', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    // Verificar/crear tabla libertadores_ganadores_acumulado (NO hacer DROP - mantener histórico)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libertadores_ganadores_acumulado (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
        puntaje INTEGER NOT NULL,
        fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Obtener el ranking acumulado TOTAL (todas las jornadas)
    const rankingResult = await pool.query(`
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(puntos_partidos.total, 0) + 
        COALESCE(puntos_clasificacion.total, 0) + 
        COALESCE(puntos_campeon.campeon, 0) + 
        COALESCE(puntos_campeon.subcampeon, 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN (
        SELECT lp.usuario_id, SUM(lp.puntos) as total
        FROM libertadores_pronosticos lp
        -- INNER JOIN a partidos: descarta pronósticos huérfanos de partidos borrados
        INNER JOIN libertadores_partidos p ON p.id = lp.partido_id
        GROUP BY lp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      LEFT JOIN (
        SELECT lpc.usuario_id, SUM(lpc.puntos) as total
        FROM libertadores_puntos_clasificacion lpc
        WHERE lpc.fase_clasificado NOT IN ('CAMPEON', 'SUBCAMPEON')
        GROUP BY lpc.usuario_id
      ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
      LEFT JOIN (
        SELECT usuario_id, puntos_campeon as campeon, puntos_subcampeon as subcampeon
        FROM libertadores_predicciones_campeon
      ) puntos_campeon ON u.id = puntos_campeon.usuario_id
      -- rol != 'admin': el campeón del acumulado final nunca puede ser la
      -- cuenta de administrador, aunque tenga puntos cargados por error.
      WHERE u.activo = true AND u.rol != 'admin'
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
    // NOTA: Usar endpoint /api/rankings-historicos/actualizar para guardar en históricos permanentes
    await pool.query('DELETE FROM libertadores_ganadores_acumulado');
    
    // Guardar el TOP 3 en la tabla (no solo el ganador)
    for (let i = 0; i < top3.length; i++) {
      await pool.query(
        `INSERT INTO libertadores_ganadores_acumulado (usuario_id, puntaje)
         VALUES ($1, $2)`,
        [top3[i].id, parseInt(top3[i].puntos_acumulados, 10)]
      );
    }
    
    // Registrar notificación para usuarios
    try {
      const mensajeNotificacion = ganadores.length === 1 
        ? `🏆 EL CAMPEÓN DEL RANKING ACUMULADO DE LIBERTADORES ES: ${ganadores[0].nombre.toUpperCase()}`
        : `🏆 LOS CAMPEONES DEL RANKING ACUMULADO DE LIBERTADORES SON: ${ganadores.map(g => g.nombre.toUpperCase()).join(', ')}`;
      
      // Primero eliminar notificaciones anteriores del acumulado
      await pool.query(
        `DELETE FROM notificaciones 
         WHERE competencia = $1 AND tipo = $2`,
        ['libertadores', 'acumulado']
      );
      
      // Luego insertar la nueva notificación
      const resultNotif = await pool.query(
        `INSERT INTO notificaciones (competencia, tipo, tipo_notificacion, jornada_numero, ganadores, mensaje, icono, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          'libertadores', 
          'acumulado', 
          'ganador_acumulado',
          10, 
          JSON.stringify(ganadores.map(g => ({
            nombre: g.nombre,
            puntaje: puntajeMaximo,
            foto_perfil: g.foto_perfil
          }))), 
          mensajeNotificacion,
          '👑',
          '/libertadores/clasificacion'
        ]
      );
      
      console.log(`✅ Notificación acumulado creada con ID: ${resultNotif.rows[0].id}`);
    } catch (errorNotif) {
      console.error('❌ Error creando notificación acumulado:', errorNotif);
      // No fallar la petición completa si la notificación falla
    }
    
    // Generar y enviar PDF de la jornada 10 con ganadores
    let pdfGenerado = false;
    let pdfError = null;
    try {
      // Obtener los ganadores de la JORNADA 10 (no acumulado) para el PDF
      const ganadoresJ10Result = await pool.query(`
        SELECT u.nombre, lgj.puntaje, u.foto_perfil
        FROM libertadores_ganadores_jornada lgj
        INNER JOIN usuarios u ON lgj.usuario_id = u.id
        WHERE lgj.jornada_numero = 10
        ORDER BY lgj.puntaje DESC, u.nombre ASC
      `);
      
      const ganadoresJ10 = ganadoresJ10Result.rows.map(row => ({
        nombre: row.nombre,
        puntaje: parseInt(row.puntaje, 10),
        foto_perfil: row.foto_perfil
      }));
      
      // Pasar ganadores de JORNADA 10 (no acumulado) al PDF
      await generarPDFLibertadoresConGanadores(10, ganadoresJ10);
      pdfGenerado = true;
    } catch (error) {
      console.error('❌ Error generando PDF de Libertadores jornada 10:', error);
      pdfError = error.message;
      // No fallar la petición completa si el PDF falla
    }
    
    // Retornar los ganadores
    res.json({
      tipo: 'acumulado',
      ganadores: ganadores.map(g => ({
        nombre: g.nombre,
        foto_perfil: g.foto_perfil,
        puntaje: puntajeMaximo
      })),
      mensaje: pdfGenerado
        ? (ganadores.length === 1 
            ? `🏆 EL CAMPEÓN DEL RANKING ACUMULADO ES: ${ganadores[0].nombre.toUpperCase()}. PDF enviado por email.`
            : `🏆 LOS CAMPEONES DEL RANKING ACUMULADO SON: ${ganadores.map(g => g.nombre.toUpperCase()).join(', ')}. PDF enviado por email.`)
        : (ganadores.length === 1 
            ? `🏆 EL CAMPEÓN DEL RANKING ACUMULADO ES: ${ganadores[0].nombre.toUpperCase()}. PDF falló: ${pdfError}`
            : `🏆 LOS CAMPEONES DEL RANKING ACUMULADO SON: ${ganadores.map(g => g.nombre.toUpperCase()).join(', ')}. PDF falló: ${pdfError}`),
      pdfGenerado
    });
    
  } catch (error) {
    console.error('Error calculando ganadores acumulado:', error);
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
    const result = await pool.query(`
      SELECT 
        lga.puntaje,
        lga.fecha_calculo,
        u.id as usuario_id,
        u.nombre,
        u.foto_perfil
      FROM libertadores_ganadores_acumulado lga
      INNER JOIN usuarios u ON lga.usuario_id = u.id
      ORDER BY u.nombre
    `);
    
    if (result.rows.length === 0) {
      return res.json({ ganadores: [], mensaje: null });
    }
    
    const ganadores = result.rows.map(row => ({
      nombre: row.nombre,
      foto_perfil: row.foto_perfil,
      puntaje: row.puntaje
    }));
    
    const mensaje = ganadores.length === 1 
      ? `🏆 EL CAMPEÓN DEL RANKING ACUMULADO ES: ${ganadores[0].nombre.toUpperCase()}`
      : `🏆 LOS CAMPEONES DEL RANKING ACUMULADO SON: ${ganadores.map(g => g.nombre.toUpperCase()).join(', ')}`;
    
    res.json({
      tipo: 'acumulado',
      ganadores,
      mensaje,
      fechaCalculo: result.rows[0].fecha_calculo
    });
    
  } catch (error) {
    console.error('Error obteniendo ganadores acumulado:', error);
    res.status(500).json({ error: 'Error obteniendo ganadores del ranking acumulado' });
  }
});


// GET: Obtener resumen de títulos de todos los ganadores
router.get('/titulos', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.nombre, u.foto_perfil, COUNT(*) AS titulos
      FROM libertadores_ganadores_jornada lgj
      JOIN usuarios u ON lgj.usuario_id = u.id
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY titulos DESC, u.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo títulos:', error);
    res.status(500).json({ error: 'No se pudo obtener el resumen de títulos' });
  }
});


// IMPORTANTE: Rutas específicas ANTES de rutas con parámetros

// POST: Calcular y guardar ganadores de una jornada específica
router.post('/:jornadaNumero', verifyToken, checkRole('admin'), async (req, res) => {
  const jornadaNumero = parseInt(req.params.jornadaNumero);
  
  // Validar que jornadaNumero sea un número válido
  if (isNaN(jornadaNumero)) {
    return res.status(400).json({ error: 'Número de jornada inválido' });
  }
  
  try {
    // Verificar/crear tabla libertadores_ganadores_jornada SI NO EXISTE
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libertadores_ganadores_jornada (
        id SERIAL PRIMARY KEY,
        jornada_numero INTEGER NOT NULL,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        puntaje INTEGER NOT NULL,
        fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(jornada_numero, usuario_id)
      )
    `);
    
    // Verificar/crear tabla libertadores_puntos_clasificacion
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libertadores_puntos_clasificacion (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        partido_id INTEGER NOT NULL,
        jornada_numero INTEGER NOT NULL,
        equipo_clasificado VARCHAR(100) NOT NULL,
        fase_clasificado VARCHAR(50) NOT NULL,
        puntos INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(usuario_id, partido_id, jornada_numero)
      )
    `);
    
    // 1. Obtener todos los usuarios activos con sus fotos de perfil.
    // rol != 'admin': la cuenta de administrador solo carga resultados reales,
    // nunca debe poder ganar ni aparecer como candidato a ganador de jornada,
    // aunque por error tenga pronósticos cargados (como pasó en J8).
    const usuariosResult = await pool.query(
      "SELECT id, nombre, foto_perfil FROM usuarios WHERE activo = true AND rol != 'admin' ORDER BY nombre"
    );
    
    if (usuariosResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay usuarios activos' });
    }
    
    // 2. Calcular puntos de cada usuario para la jornada
    const puntosUsuarios = [];
    
    for (const usuario of usuariosResult.rows) {
      // Puntos de partidos
      // INNER JOIN a partidos: descarta pronósticos huérfanos de partidos borrados
      // (p.ej. al regenerar el fixture) que de otro modo inflarían el puntaje.
      const puntosPartidosResult = await pool.query(`
        SELECT COALESCE(SUM(lp.puntos), 0) as puntos_partidos
        FROM libertadores_pronosticos lp
        INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
        INNER JOIN libertadores_partidos p ON p.id = lp.partido_id
        WHERE lp.usuario_id = $1 AND lj.numero = $2
      `, [usuario.id, jornadaNumero]);
      
      // Puntos de clasificación (equipos que avanzan)
      const puntosClasificacionResult = await pool.query(`
        SELECT COALESCE(SUM(puntos), 0) as puntos_clasificacion
        FROM libertadores_puntos_clasificacion
        WHERE usuario_id = $1 AND jornada_numero = $2
      `, [usuario.id, jornadaNumero]);
      
      // Para jornada 10 (FINAL), también incluir puntos de campeón y subcampeón
      let puntosCampeonSubcampeon = 0;
      let puntosPartidoFinal = 0;
      if (jornadaNumero === 10) {
        const puntosFinalesResult = await pool.query(`
          SELECT 
            COALESCE(SUM(puntos_campeon), 0) + COALESCE(SUM(puntos_subcampeon), 0) as puntos_finales
          FROM libertadores_predicciones_campeon
          WHERE usuario_id = $1
        `, [usuario.id]);
        
        puntosCampeonSubcampeon = puntosFinalesResult.rows[0].puntos_finales || 0;
        
        // Calcular puntos del partido FINAL (id 456) basados en pronóstico virtual
        const partidoFinalResult = await pool.query(`
          SELECT 
            p.id,
            p.nombre_local,
            p.nombre_visita,
            p.goles_local,
            p.goles_visita,
            p.bonus,
            lpfv.equipo_local AS equipo_local_pronosticado,
            lpfv.equipo_visita AS equipo_visita_pronosticado,
            lpfv.goles_local AS goles_local_pronosticado,
            lpfv.goles_visita AS goles_visita_pronosticado
          FROM libertadores_partidos p
          LEFT JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
          LEFT JOIN libertadores_pronosticos_final_virtual lpfv ON lpfv.usuario_id = $1 AND lpfv.jornada_id = lj.id
          WHERE p.id = 456
        `, [usuario.id]);
        
        if (partidoFinalResult.rows.length > 0 && partidoFinalResult.rows[0].goles_local !== null) {
          const partido = partidoFinalResult.rows[0];
          
          // Verificar si los equipos coinciden
          const equiposCoinciden = 
            partido.equipo_local_pronosticado === partido.nombre_local && 
            partido.equipo_visita_pronosticado === partido.nombre_visita;
          
          if (equiposCoinciden && partido.goles_local_pronosticado !== null && partido.goles_visita_pronosticado !== null) {
            const pronostico_local = partido.goles_local_pronosticado;
            const pronostico_visita = partido.goles_visita_pronosticado;
            const resultado_local = partido.goles_local;
            const resultado_visita = partido.goles_visita;
            const bonus = partido.bonus || 1;
            
            // Calcular puntos usando la misma lógica del frontend
            let puntos = 0;
            if (pronostico_local === resultado_local && pronostico_visita === resultado_visita) {
              puntos = 10 * bonus; // Resultado exacto
            } else if (Math.abs(pronostico_local - pronostico_visita) === Math.abs(resultado_local - resultado_visita)) {
              const signoPronostico = Math.sign(pronostico_local - pronostico_visita);
              const signoResultado = Math.sign(resultado_local - resultado_visita);
              if (signoPronostico === signoResultado) {
                puntos = 7 * bonus; // Diferencia de goles
              }
            } else {
              const signoPronostico = Math.sign(pronostico_local - pronostico_visita);
              const signoResultado = Math.sign(resultado_local - resultado_visita);
              if (signoPronostico === signoResultado) {
                puntos = 4 * bonus; // Solo signo
              }
            }
            
            puntosPartidoFinal = puntos;
          }
        }
      }
      
      const puntosPartidos = parseInt(puntosPartidosResult.rows[0].puntos_partidos || 0, 10);
      const puntosClasificacion = parseInt(puntosClasificacionResult.rows[0].puntos_clasificacion || 0, 10);
      const puntosCampeonSubcampeonNum = parseInt(puntosCampeonSubcampeon || 0, 10);
      
      // SOLO puntos por partidos para ganador de jornada (igual que Sudamericana)
      const puntajeTotal = puntosPartidos;
      
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
      'DELETE FROM libertadores_ganadores_jornada WHERE jornada_numero = $1',
      [jornadaNumero]
    );
    
    // 6. Guardar los nuevos ganadores
    console.log(`📝 Guardando ${ganadores.length} ganador(es) para jornada ${jornadaNumero}`);
    for (const ganador of ganadores) {
      await pool.query(
        `INSERT INTO libertadores_ganadores_jornada (jornada_numero, usuario_id, puntaje)
         VALUES ($1, $2, $3)`,
        [jornadaNumero, ganador.usuario_id, ganador.puntaje]
      );
    }
    
    // 6.5. Registrar notificación para usuarios
    console.log(`🔔 Creando notificación para jornada ${jornadaNumero}...`);
    try {
      const mensajeNotificacion = ganadores.length === 1 
        ? `El ganador de la jornada ${jornadaNumero} de Libertadores es: ${ganadores[0].nombre}`
        : `Los ganadores de la jornada ${jornadaNumero} de Libertadores son: ${ganadores.map(g => g.nombre).join(', ')}`;
      
      // Primero eliminar notificaciones anteriores de esta jornada
      await pool.query(
        `DELETE FROM notificaciones 
         WHERE competencia = $1 AND tipo = $2 AND jornada_numero = $3`,
        ['libertadores', 'jornada', jornadaNumero]
      );
      
      // Luego insertar la nueva notificación
      const resultNotif = await pool.query(
        `INSERT INTO notificaciones (competencia, tipo, tipo_notificacion, jornada_numero, ganadores, mensaje, icono, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          'libertadores', 
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
          `/libertadores/clasificacion?jornada=${jornadaNumero}`
        ]
      );
      
      console.log(`✅ Notificación creada con ID: ${resultNotif.rows[0].id}`);
    } catch (errorNotif) {
      console.error('❌ Error creando notificación:', errorNotif);
      // No fallar la petición completa si la notificación falla
    }
    
    // 7. Retornar los ganadores. Este endpoint SOLO calcula y guarda el
    // ganador de la jornada — ya no genera ni "envía" un PDF acá (esa
    // generación era puro gasto de memoria: el buffer resultante nunca se
    // enviaba a ningún lado, ni por email ni de ninguna otra forma). El PDF
    // Final real se genera aparte, bajo demanda, desde el botón dedicado
    // (POST /:jornadaNumero/pdf-final).
    const mensaje = ganadores.length === 1
      ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}.`
      : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}.`;

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
    console.error('Error calculando ganadores:', error);
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
    // Leer ganadores guardados desde la tabla (solo existen después de presionar "Calcular Ganadores")
    const result = await pool.query(
      `SELECT lgj.puntaje, lgj.fecha_calculo, u.id as usuario_id, u.nombre, u.foto_perfil
       FROM libertadores_ganadores_jornada lgj
       INNER JOIN usuarios u ON lgj.usuario_id = u.id
       WHERE lgj.jornada_numero = $1
       ORDER BY lgj.puntaje DESC, u.nombre ASC`,
      [jornadaNumero]
    );

    if (result.rows.length === 0) {
      return res.json({ ganadores: [], mensaje: null });
    }

    const ganadores = result.rows.map(row => ({
      nombre: row.nombre,
      foto_perfil: row.foto_perfil,
      puntaje: parseInt(row.puntaje)
    }));

    const mensaje = ganadores.length === 1
      ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}`
      : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}`;

    res.json({
      jornadaNumero,
      ganadores,
      mensaje,
      fechaCalculo: result.rows[0].fecha_calculo
    });
    
  } catch (error) {
    console.error('Error obteniendo ganadores:', error);
    res.status(500).json({ error: 'Error obteniendo ganadores de la jornada' });
  }
});

// ==================== FUNCIÓN PARA GENERAR PDF CON RESULTADOS Y GANADORES ====================
async function generarPDFLibertadoresConGanadores(jornadaNumero, ganadores) {
  try {
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
        lp.goles_local AS pred_local,
        lp.goles_visita AS pred_visita,
        p.goles_local AS real_local,
        p.goles_visita AS real_visita,
        lp.puntos,
        lj.numero AS jornada_numero,
        lj.nombre AS jornada_nombre
      FROM libertadores_pronosticos lp
      JOIN usuarios u ON lp.usuario_id = u.id
      JOIN libertadores_partidos p ON lp.partido_id = p.id
      JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      WHERE p.goles_local IS NOT NULL AND p.goles_visita IS NOT NULL
        AND lj.numero = $1
      ORDER BY u.nombre, p.fecha, p.id`,
      [jornadaNumero]
    );

    // 2. Obtener ranking acumulado - USAR EXACTAMENTE LA MISMA QUERY QUE /api/libertadores-rankings/acumulado/:numero
    const rankingQuery = jornadaNumero >= 10
      ? await pool.query(
          `SELECT
            u.id,
            u.nombre,
            u.foto_perfil,
            COALESCE(puntos_partidos.total, 0) +
            COALESCE(puntos_clasificacion.total, 0) +
            COALESCE(puntos_final.puntos, 0) as puntos_acumulados
          FROM usuarios u
          LEFT JOIN (
            SELECT lp.usuario_id, SUM(lp.puntos) as total
            FROM libertadores_pronosticos lp
            INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
            INNER JOIN libertadores_partidos p ON p.id = lp.partido_id
            WHERE lj.numero <= $1 AND lp.partido_id != 456
            GROUP BY lp.usuario_id
          ) puntos_partidos ON u.id = puntos_partidos.usuario_id
          LEFT JOIN (
            SELECT lpc.usuario_id, SUM(lpc.puntos) as total
            FROM libertadores_puntos_clasificacion lpc
            WHERE lpc.jornada_numero <= $1
            GROUP BY lpc.usuario_id
          ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
          LEFT JOIN (
            SELECT
              lpfv.usuario_id,
              CASE
                WHEN lpfv.goles_local = lp.goles_local AND lpfv.goles_visita = lp.goles_visita
                  THEN 10 * COALESCE(lp.bonus, 1)
                WHEN ABS(lpfv.goles_local - lpfv.goles_visita) = ABS(lp.goles_local - lp.goles_visita)
                     AND SIGN(lpfv.goles_local - lpfv.goles_visita) = SIGN(lp.goles_local - lp.goles_visita)
                  THEN 7 * COALESCE(lp.bonus, 1)
                WHEN SIGN(lpfv.goles_local - lpfv.goles_visita) = SIGN(lp.goles_local - lp.goles_visita)
                  THEN 4 * COALESCE(lp.bonus, 1)
                ELSE 0
              END as puntos
            FROM libertadores_pronosticos_final_virtual lpfv
            INNER JOIN libertadores_jornadas lj ON lpfv.jornada_id = lj.id
            INNER JOIN libertadores_partidos lp ON lp.id = 456
            WHERE lj.numero = 10
              AND lpfv.equipo_local = lp.nombre_local
              AND lpfv.equipo_visita = lp.nombre_visita
              AND lp.goles_local IS NOT NULL
              AND lp.goles_visita IS NOT NULL
          ) puntos_final ON u.id = puntos_final.usuario_id
          WHERE (puntos_partidos.total IS NOT NULL
             OR puntos_clasificacion.total IS NOT NULL
             OR puntos_final.puntos IS NOT NULL)
            AND u.rol != 'admin'
          ORDER BY puntos_acumulados DESC, u.nombre ASC
          LIMIT 10`,
          [jornadaNumero]
        )
      : await pool.query(
          `SELECT
            u.id,
            u.nombre,
            u.foto_perfil,
            COALESCE(puntos_partidos.total, 0) +
            COALESCE(puntos_clasificacion.total, 0) as puntos_acumulados
          FROM usuarios u
          LEFT JOIN (
            SELECT lp.usuario_id, SUM(lp.puntos) as total
            FROM libertadores_pronosticos lp
            INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
            INNER JOIN libertadores_partidos p ON p.id = lp.partido_id
            WHERE lj.numero <= $1
            GROUP BY lp.usuario_id
          ) puntos_partidos ON u.id = puntos_partidos.usuario_id
          LEFT JOIN (
            SELECT lpc.usuario_id, SUM(lpc.puntos) as total
            FROM libertadores_puntos_clasificacion lpc
            WHERE lpc.jornada_numero <= $1
            GROUP BY lpc.usuario_id
          ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
          WHERE (puntos_partidos.total IS NOT NULL
             OR puntos_clasificacion.total IS NOT NULL)
            AND u.rol != 'admin'
          ORDER BY puntos_acumulados DESC, u.nombre ASC
          LIMIT 10`,
          [jornadaNumero]
        );

    let ranking = rankingQuery.rows.map((r, index) => ({
      ...r,
      usuario: r.nombre,
      puntaje_total: r.puntos_acumulados,
      posicion: index + 1
    }));

    // 3. Obtener ranking de la jornada específica (excluyendo admins) - SOLO PUNTOS DE PARTIDOS
    // USAR MISMA QUERY QUE /api/libertadores-rankings/jornada/:numero
    const rankingJornadaQuery = await pool.query(
      `SELECT
        u.id,
        u.nombre AS usuario,
        u.foto_perfil,
        COALESCE(puntos_partidos.total, 0) as puntos_jornada,
        ROW_NUMBER() OVER (ORDER BY COALESCE(puntos_partidos.total, 0) DESC, u.nombre ASC) AS posicion
      FROM usuarios u
      LEFT JOIN (
        SELECT lp.usuario_id, SUM(lp.puntos) as total
        FROM libertadores_pronosticos lp
        INNER JOIN libertadores_partidos p ON lp.partido_id = p.id
        INNER JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
        WHERE lj.numero = $1
        GROUP BY lp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      WHERE u.rol != 'admin'
        AND EXISTS (
          SELECT 1 FROM libertadores_pronosticos lp2
          INNER JOIN libertadores_partidos p2 ON lp2.partido_id = p2.id
          INNER JOIN libertadores_jornadas lj2 ON p2.jornada_id = lj2.id
          WHERE lp2.usuario_id = u.id AND lj2.numero = $1
        )
      ORDER BY puntos_jornada DESC, u.nombre ASC
      LIMIT 10`,
      [jornadaNumero]
    );

    const pronosticos = pronosticosQuery.rows;
    let rankingJornada = rankingJornadaQuery.rows;

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

    // PREPARAR DATOS ADICIONALES
    let clasificacionPorUsuario = {};
    let partidoFinalPorUsuario = {};
    let cuadroFinalPorUsuario = {};
    let clasificadosOficialesJ6 = {}; // Para almacenar clasificados oficiales de J6

    // AGREGAR DATOS DE CLASIFICACIÓN PARA JORNADA 6 (Fase de Grupos - Clasificación)
    if (jornadaNumero === 6) {
      // Calcular clasificados oficiales de cada grupo
      const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const jornadasNumeros = [1, 2, 3, 4, 5, 6];

      for (const grupo of grupos) {
        const tabla = await calcularTablaOficial(grupo, jornadasNumeros);
        clasificadosOficialesJ6[grupo] = {
          octavos: tabla.length >= 2 ? [tabla[0].nombre, tabla[1].nombre] : [],
          playoffs: tabla.length >= 3 ? tabla[2].nombre : null
        };
      }

      // Para jornada 6, obtener los pronósticos de clasificación de fase de grupos
      const clasificacionQuery = await pool.query(`
        SELECT
          u.nombre AS usuario,
          lpc.equipo_clasificado,
          lpc.fase_clasificado,
          lpc.puntos
        FROM libertadores_puntos_clasificacion lpc
        JOIN usuarios u ON lpc.usuario_id = u.id
        WHERE lpc.jornada_numero = $1
        ORDER BY u.nombre, lpc.fase_clasificado
      `, [jornadaNumero]);

      clasificacionQuery.rows.forEach(row => {
        if (!clasificacionPorUsuario[row.usuario]) {
          clasificacionPorUsuario[row.usuario] = [];
        }
        clasificacionPorUsuario[row.usuario].push(row);
      });
    }
    // AGREGAR DATOS DE CLASIFICACIÓN PARA JORNADAS 8 Y 9 (Octavos, Cuartos)
    else if (jornadaNumero === 8 || jornadaNumero === 9) {
      // Para J8 y J9: Obtener los pronósticos de clasificación con los datos completos de los partidos
      // para poder calcular correctamente qué equipo avanzó en cada cruce
      const clasificacionQuery = await pool.query(`
        SELECT
          u.nombre AS usuario,
          lpc.equipo_clasificado,
          lpc.fase_clasificado,
          lpc.partido_id,
          lpc.puntos,
          p.nombre_local AS partido_local,
          p.nombre_visita AS partido_visita,
          p.goles_local AS resultado_vuelta_local,
          p.goles_visita AS resultado_vuelta_visita,
          p.penales_local AS penales_vuelta_local,
          p.penales_visita AS penales_vuelta_visita,
          p_ida.nombre_local AS ida_nombre_local,
          p_ida.nombre_visita AS ida_nombre_visita,
          p_ida.goles_local AS resultado_ida_local,
          p_ida.goles_visita AS resultado_ida_visita,
          lp_ida.goles_local AS pronostico_ida_local,
          lp_ida.goles_visita AS pronostico_ida_visita
        FROM libertadores_puntos_clasificacion lpc
        JOIN usuarios u ON lpc.usuario_id = u.id
        JOIN libertadores_partidos p ON lpc.partido_id = p.id
        JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
        -- Buscar el partido IDA (equipos invertidos)
        LEFT JOIN libertadores_partidos p_ida ON
          ${jornadaNumero === 8
            ? `p_ida.jornada_id IN (SELECT id FROM libertadores_jornadas WHERE numero = 7)
               AND p_ida.nombre_local = p.nombre_visita
               AND p_ida.nombre_visita = p.nombre_local`
            : `p_ida.jornada_id = p.jornada_id
               AND p_ida.nombre_local = p.nombre_visita
               AND p_ida.nombre_visita = p.nombre_local
               AND p_ida.id < p.id`}
        -- Pronóstico del propio usuario para ese partido de ida (para mostrar
        -- lo que pronosticó vs. lo que realmente pasó en J7)
        LEFT JOIN libertadores_pronosticos lp_ida ON
          lp_ida.usuario_id = lpc.usuario_id AND lp_ida.partido_id = p_ida.id
        WHERE lpc.jornada_numero = $1
        ORDER BY u.nombre, lpc.fase_clasificado
      `, [jornadaNumero]);

      clasificacionQuery.rows.forEach(row => {
        if (!clasificacionPorUsuario[row.usuario]) {
          clasificacionPorUsuario[row.usuario] = [];
        }

        // Calcular qué equipo realmente avanzó en este cruce
        let equipoRealQueAvanza = null;
        if (row.resultado_vuelta_local !== null && row.resultado_vuelta_visita !== null) {
          // Calcular resultado global (IDA + VUELTA)
          const resultadoGlobalLocal = row.resultado_vuelta_local + (row.resultado_ida_visita || 0);
          const resultadoGlobalVisita = row.resultado_vuelta_visita + (row.resultado_ida_local || 0);

          if (resultadoGlobalLocal > resultadoGlobalVisita) {
            equipoRealQueAvanza = row.partido_local;
          } else if (resultadoGlobalLocal < resultadoGlobalVisita) {
            equipoRealQueAvanza = row.partido_visita;
          } else {
            // Empate global, revisar penales
            if (row.penales_vuelta_local !== null && row.penales_vuelta_visita !== null) {
              if (row.penales_vuelta_local > row.penales_vuelta_visita) {
                equipoRealQueAvanza = row.partido_local;
              } else if (row.penales_vuelta_local < row.penales_vuelta_visita) {
                equipoRealQueAvanza = row.partido_visita;
              }
            }
          }
        }

        row.equipo_real_avanza = equipoRealQueAvanza || '?';

        // Texto informativo de la ida: pronosticado por el usuario vs. real,
        // para poder auditar por qué se eligió el equipo que se eligió
        // (el marcador global usa siempre el resultado real de la ida, no lo
        // que el usuario había pronosticado para esa jornada).
        if (row.ida_nombre_local && row.ida_nombre_visita) {
          const pronTxt = row.pronostico_ida_local !== null && row.pronostico_ida_local !== undefined &&
            row.pronostico_ida_visita !== null && row.pronostico_ida_visita !== undefined
            ? `${row.pronostico_ida_local}-${row.pronostico_ida_visita}` : 'sin pronóstico';
          const realTxt = row.resultado_ida_local !== null && row.resultado_ida_local !== undefined &&
            row.resultado_ida_visita !== null && row.resultado_ida_visita !== undefined
            ? `${row.resultado_ida_local}-${row.resultado_ida_visita}` : 'pendiente';
          row.ida_texto = `${row.ida_nombre_local} vs ${row.ida_nombre_visita} — pron: ${pronTxt} / real: ${realTxt}`;
        } else {
          row.ida_texto = '-';
        }

        clasificacionPorUsuario[row.usuario].push(row);
      });
    }
    // AGREGAR DATOS DE CLASIFICACIÓN PARA JORNADA 10 (Semifinales - Finalistas)
    else if (jornadaNumero === 10) {
      // Para J10: consulta simple sin JOIN con partidos porque los finalistas no vienen de partidos IDA/VUELTA
      const clasificacionQuery = await pool.query(`
        SELECT
          u.nombre AS usuario,
          lpc.equipo_clasificado,
          lpc.fase_clasificado,
          lpc.puntos
        FROM libertadores_puntos_clasificacion lpc
        JOIN usuarios u ON lpc.usuario_id = u.id
        WHERE lpc.jornada_numero = $1
        ORDER BY u.nombre, lpc.fase_clasificado
      `, [jornadaNumero]);

      clasificacionQuery.rows.forEach(row => {
        if (!clasificacionPorUsuario[row.usuario]) {
          clasificacionPorUsuario[row.usuario] = [];
        }
        clasificacionPorUsuario[row.usuario].push(row);
      });
    }

    if (jornadaNumero === 10) {
      const partidoFinalQuery = await pool.query(`
        SELECT
          u.nombre AS usuario,
          p.nombre_local,
          p.nombre_visita,
          p.goles_local AS resultado_local,
          p.goles_visita AS resultado_visita,
          p.bonus,
          lpfv.goles_local AS pronostico_local,
          lpfv.goles_visita AS pronostico_visita,
          lpfv.equipo_local AS equipo_local_pronosticado,
          lpfv.equipo_visita AS equipo_visita_pronosticado
        FROM usuarios u
        INNER JOIN libertadores_pronosticos_final_virtual lpfv ON lpfv.usuario_id = u.id
        INNER JOIN libertadores_jornadas lj ON lpfv.jornada_id = lj.id
        INNER JOIN libertadores_partidos p ON p.id = 456
        WHERE lj.numero = 10
        ORDER BY u.nombre
      `);

      partidoFinalQuery.rows.forEach(row => {
        const equiposCoinciden =
          row.equipo_local_pronosticado === row.nombre_local &&
          row.equipo_visita_pronosticado === row.nombre_visita;

        let puntos = 0;
        if (equiposCoinciden && row.resultado_local !== null && row.resultado_visita !== null) {
          const bonus = row.bonus || 1;
          if (row.pronostico_local === row.resultado_local && row.pronostico_visita === row.resultado_visita) {
            puntos = 10 * bonus;
          } else if (Math.abs(row.pronostico_local - row.pronostico_visita) === Math.abs(row.resultado_local - row.resultado_visita)) {
            const signoP = Math.sign(row.pronostico_local - row.pronostico_visita);
            const signoR = Math.sign(row.resultado_local - row.resultado_visita);
            if (signoP === signoR) puntos = 7 * bonus;
          } else {
            const signoP = Math.sign(row.pronostico_local - row.pronostico_visita);
            const signoR = Math.sign(row.resultado_local - row.resultado_visita);
            if (signoP === signoR) puntos = 4 * bonus;
          }
        }

        partidoFinalPorUsuario[row.usuario] = {
          ...row,
          puntos,
          equiposCoinciden,
          finalistasPronosticados: [row.equipo_local_pronosticado, row.equipo_visita_pronosticado]
        };
      });

      // Obtener cuadro final por usuario
      const cuadroFinalQuery = await pool.query(`
        SELECT
          u.nombre AS usuario,
          lpc.campeon,
          lpc.subcampeon,
          lpc.puntos_campeon,
          lpc.puntos_subcampeon
        FROM libertadores_predicciones_campeon lpc
        JOIN usuarios u ON lpc.usuario_id = u.id
        ORDER BY u.nombre
      `);

      cuadroFinalQuery.rows.forEach(row => {
        cuadroFinalPorUsuario[row.usuario] = row;
      });
    }

    // Construir la lista de secciones "por usuario" para el generador pdfkit.
    // A diferencia de la versión anterior, acá NO se arma HTML: se arma un
    // array de datos ya formateados que pdfFinal.js sabe dibujar.
    const usuariosPdf = [];

    for (const [usuario, userData] of Object.entries(pronosticosPorUsuario)) {
      const pronosticosUsuario = userData.pronosticos;

      // Calcular puntaje de PARTIDOS solamente
      const puntosPartidos = pronosticosUsuario
        .filter(p => p.jornada_numero === jornadaNumero)
        .reduce((sum, p) => sum + (p.puntos || 0), 0);

      // Para J10: Cuadro Final incluye clasificados + campeon + subcampeon
      // Para otras jornadas: solo Clasificación
      let puntosCuadroFinal = 0;
      let puntosClasificacion = 0;

      if (jornadaNumero === 10) {
        if (clasificacionPorUsuario[usuario]) {
          puntosCuadroFinal += clasificacionPorUsuario[usuario]
            .filter(c => c.fase_clasificado === 'FINALISTA')
            .reduce((sum, c) => sum + (c.puntos || 0), 0);
        }
        if (cuadroFinalPorUsuario[usuario]) {
          const cf = cuadroFinalPorUsuario[usuario];
          puntosCuadroFinal += (cf.puntos_campeon || 0) + (cf.puntos_subcampeon || 0);
        }
      } else if ((jornadaNumero === 6 || jornadaNumero === 8 || jornadaNumero === 9) && clasificacionPorUsuario[usuario]) {
        puntosClasificacion = clasificacionPorUsuario[usuario].reduce((sum, c) => sum + (c.puntos || 0), 0);
      }

      const partesResumen = [`Partidos: ${puntosPartidos} pts`];
      if (puntosClasificacion > 0) partesResumen.push(`Clasificación: ${puntosClasificacion} pts`);
      if (puntosCuadroFinal > 0) partesResumen.push(`Cuadro Final: ${puntosCuadroFinal} pts`);

      // Filtrar partidos: para J10, excluir el partido final (bonus x3) de la tabla normal
      const partidosMostrar = jornadaNumero === 10
        ? pronosticosUsuario.filter(p => (p.bonus || 1) !== 3)
        : pronosticosUsuario;

      const filasPartidos = partidosMostrar.map((p) => {
        const pronostico = `${p.pred_local} - ${p.pred_visita}`;
        const resultado = (p.real_local !== null && p.real_visita !== null)
          ? `${p.real_local} - ${p.real_visita}`
          : 'Pendiente';
        return [
          p.jornada_numero,
          `${p.nombre_local} vs ${p.nombre_visita}`,
          pronostico,
          resultado,
          `x${p.bonus || 1}`,
          p.puntos || 0
        ];
      });

      // Sección de clasificación (J6, J8, J9)
      let tablaClasificacion = null;
      if (jornadaNumero === 6) {
        const clasificacion = clasificacionPorUsuario[usuario];
        if (clasificacion && clasificacion.length > 0) {
          const grupos = {};
          clasificacion.forEach(c => {
            const grupo = c.fase_clasificado.split('_').pop(); // Extraer A, B, C, etc.
            if (!grupos[grupo]) grupos[grupo] = { octavos: [], playoffs: null };
            if (c.fase_clasificado.includes('OCTAVOS')) {
              grupos[grupo].octavos.push(c);
            } else if (c.fase_clasificado.includes('PLAYOFFS')) {
              grupos[grupo].playoffs = c;
            }
          });

          const totalPuntosClasificacion = clasificacion.reduce((sum, c) => sum + (c.puntos || 0), 0);
          const filas = [];

          Object.keys(grupos).sort().forEach((grupo) => {
            const data = grupos[grupo];
            const oficialesGrupo = clasificadosOficialesJ6[grupo] || { octavos: [], playoffs: null };
            const equiposRealesOctavos = oficialesGrupo.octavos.length > 0
              ? oficialesGrupo.octavos.join(' / ')
              : '? / ?';
            const equipoRealPlayoffs = oficialesGrupo.playoffs || '?';

            if (data.octavos.length > 0) {
              const equiposPronosticados = data.octavos.map(o => o.equipo_clasificado).join(' / ');
              const puntosTotal = data.octavos.reduce((sum, o) => sum + (o.puntos || 0), 0);
              filas.push([grupo, 'Clasificados a Octavos', equiposPronosticados, equiposRealesOctavos, String(puntosTotal)]);
            }

            if (data.playoffs) {
              filas.push([grupo, 'Clasificado a Playoffs Sudamericana', data.playoffs.equipo_clasificado, equipoRealPlayoffs, String(data.playoffs.puntos)]);
            } else {
              filas.push([grupo, 'Clasificado a Playoffs Sudamericana', '-', '-', '0']);
            }
          });

          filas.push(['', 'TOTAL CLASIFICACIÓN', '', '', String(totalPuntosClasificacion)]);

          tablaClasificacion = {
            titulo: 'EQUIPOS CLASIFICADOS',
            columnas: ['Grupo', 'Clasificación', 'Pronosticado', 'Real', 'Puntos'],
            filas
          };
        }
      } else if (jornadaNumero === 8 || jornadaNumero === 9) {
        const clasificacion = clasificacionPorUsuario[usuario];
        if (clasificacion && clasificacion.length > 0) {
          tablaClasificacion = {
            titulo: 'EQUIPO QUE AVANZA',
            columnas: ['Equipo Pronosticado', 'Equipo Real', jornadaNumero === 8 ? 'Ida (J7)' : 'Ida', 'Puntos'],
            filas: clasificacion.map(c => [c.equipo_clasificado, c.equipo_real_avanza, c.ida_texto || '-', String(c.puntos)])
          };
        }
      }

      // Secciones adicionales solo para Jornada 10
      let tablaPartidoFinal = null;
      let tablaCuadroFinal = null;

      if (jornadaNumero === 10) {
        const partidoFinal = partidoFinalPorUsuario[usuario];

        if (partidoFinal && partidoFinal.nombre_local && partidoFinal.nombre_visita) {
          const equiposCoinciden = partidoFinal.equipo_local_pronosticado === partidoFinal.nombre_local &&
            partidoFinal.equipo_visita_pronosticado === partidoFinal.nombre_visita;
          const pronostico = `${partidoFinal.pronostico_local} - ${partidoFinal.pronostico_visita}`;
          const resultado = partidoFinal.resultado_local !== null
            ? `${partidoFinal.resultado_local} - ${partidoFinal.resultado_visita}`
            : 'Pendiente';
          const partidoTexto = equiposCoinciden
            ? `${partidoFinal.nombre_local} vs ${partidoFinal.nombre_visita}`
            : `${partidoFinal.nombre_local} vs ${partidoFinal.nombre_visita} (real)\n${partidoFinal.equipo_local_pronosticado} vs ${partidoFinal.equipo_visita_pronosticado} (pron.)`;

          tablaPartidoFinal = {
            filas: [[partidoTexto, pronostico, resultado, `x${partidoFinal.bonus || 1}`, String(partidoFinal.puntos)]]
          };
        }

        // Cuadro Final (Clasificados + Campeón + Subcampeón)
        const cuadroFinal = cuadroFinalPorUsuario[usuario];
        const todosClasificados = clasificacionPorUsuario[usuario] || [];
        const finalistas = todosClasificados.filter(c => c.fase_clasificado === 'FINALISTA');
        const finalistasPronosticados = partidoFinal?.finalistasPronosticados?.join(', ') || '-';
        const puntosClasificados = finalistas.reduce((sum, c) => sum + (c.puntos || 0), 0);
        const puntosCampeon = cuadroFinal?.puntos_campeon || 0;
        const puntosSubcampeon = cuadroFinal?.puntos_subcampeon || 0;
        const totalCuadroFinal = puntosClasificados + puntosCampeon + puntosSubcampeon;

        // NOTA: "Equipo Real" de Finalistas/Campeón/Subcampeón queda igual
        // que en la versión anterior (valores fijos, no calculados desde la
        // BD). Es un bug preexistente ajeno a esta migración de motor de
        // PDF; se preserva tal cual para no mezclar cambios.
        tablaCuadroFinal = {
          filas: [
            ['Finalistas', 'Palmeiras (BRA), Flamengo (BRA)', finalistasPronosticados, String(puntosClasificados)],
            ['Campeón', 'Flamengo (BRA)', cuadroFinal?.campeon || '-', String(puntosCampeon)],
            ['Subcampeón', 'Palmeiras (BRA)', cuadroFinal?.subcampeon || '-', String(puntosSubcampeon)]
          ],
          total: String(totalCuadroFinal)
        };
      }

      usuariosPdf.push({
        nombre: usuario,
        resumenPuntos: partesResumen.join('   '),
        filasPartidos,
        tablaClasificacion,
        tablaPartidoFinal,
        tablaCuadroFinal
      });
    }

    const ganadorAcumulado = (jornadaNumero === 10 && ranking.length > 0)
      ? { usuario: ranking[0].usuario, puntaje_total: ranking[0].puntaje_total }
      : null;

    // 4. Generar el PDF con pdfkit (sin Chromium, bajo consumo de memoria)
    const pdfBuffer = await generarPdfFinalBuffer({
      competencia: 'Copa Libertadores',
      jornadaNumero,
      ganadores: ganadores.map(g => ({ nombre: g.nombre, puntaje: g.puntaje })),
      ganadorAcumulado,
      rankingJornada: rankingJornada.map(r => ({
        posicion: parseInt(r.posicion, 10),
        usuario: r.usuario,
        puntos_jornada: r.puntos_jornada
      })),
      ranking: ranking.map(r => ({
        posicion: r.posicion,
        usuario: r.usuario,
        puntaje_total: r.puntaje_total
      })),
      usuarios: usuariosPdf
    });

    return pdfBuffer;

  } catch (error) {
    console.error('Error al generar PDF de Libertadores:', error);
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
    console.log(`📄 Generando PDF Final Libertadores Jornada ${jornadaNumero}...`);

    // Obtener ganadores guardados de la jornada (puede estar vacío si aún no se calcularon)
    const ganadoresResult = await pool.query(
      `SELECT u.nombre, u.foto_perfil, lgj.puntaje
       FROM libertadores_ganadores_jornada lgj
       JOIN usuarios u ON lgj.usuario_id = u.id
       WHERE lgj.jornada_numero = $1
       ORDER BY lgj.puntaje DESC`,
      [jornadaNumero]
    );

    const ganadores = ganadoresResult.rows.map(r => ({
      nombre: r.nombre,
      foto_perfil: r.foto_perfil,
      puntaje: r.puntaje
    }));

    const pdfBuffer = await generarPDFLibertadoresConGanadores(jornadaNumero, ganadores);
    const nombreArchivo = `Resultados_Libertadores_Jornada_${jornadaNumero}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generando PDF Final Libertadores:', error);
    res.status(500).json({ error: 'Error generando PDF completo', details: error.message });
  }
});

export default router;
