import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { checkRole } from '../middleware/checkRole.js';
import htmlPdf from 'html-pdf-node';
import { getWhatsAppService } from '../services/whatsappService.js';
import { getLogoBase64 } from '../utils/logoHelper.js';
import { getFotoPerfilBase64 } from '../utils/fotoPerfilHelper.js';
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
      WHERE u.activo = true
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
    
    // 1. Obtener todos los usuarios activos con sus fotos de perfil
    const usuariosResult = await pool.query(
      'SELECT id, nombre, foto_perfil FROM usuarios WHERE activo = true ORDER BY nombre'
    );
    
    if (usuariosResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay usuarios activos' });
    }
    
    // 2. Calcular puntos de cada usuario para la jornada
    const puntosUsuarios = [];
    
    for (const usuario of usuariosResult.rows) {
      // Puntos de partidos
      const puntosPartidosResult = await pool.query(`
        SELECT COALESCE(SUM(lp.puntos), 0) as puntos_partidos
        FROM libertadores_pronosticos lp
        INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
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
    
    // 7. Generar y enviar PDF con resultados completos (SOLO si NO es jornada 10)
    let pdfGenerado = false;
    let pdfError = null;
    if (jornadaNumero !== 10) {
      try {
        await generarPDFLibertadoresConGanadores(jornadaNumero, ganadores);
        pdfGenerado = true;
      } catch (error) {
        console.error('❌ Error generando PDF de Libertadores:', error);
        pdfError = error.message;
        // No fallar la petición completa si el PDF falla
      }
    }

    const mensaje = jornadaNumero === 10
      ? (ganadores.length === 1 
          ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}.`
          : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}.`)
      : (pdfGenerado
          ? (ganadores.length === 1 
              ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}. PDF enviado por email.`
              : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}. PDF enviado por email.`)
          : (ganadores.length === 1 
              ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}. PDF falló: ${pdfError}`
              : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}. PDF falló: ${pdfError}`));

    // 8. Retornar los ganadores
    res.json({
      jornadaNumero,
      ganadores: ganadores.map(g => ({
        nombre: g.nombre,
        puntaje: g.puntaje,
        foto_perfil: g.foto_perfil
      })),
      mensaje,
      pdfGenerado
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
    // Calcular ganadores DIRECTAMENTE desde el ranking (siempre actualizado)
    const incluirClasificacion = true;
    
    const rankingQuery = jornadaNumero === 10 
      ? `
        SELECT 
          u.id,
          u.nombre,
          u.foto_perfil,
          COALESCE(puntos_partidos.total, 0) as puntos_jornada
        FROM usuarios u
        LEFT JOIN (
          SELECT lp.usuario_id, SUM(lp.puntos) as total
          FROM libertadores_pronosticos lp
          INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
          WHERE lj.numero = $1
          GROUP BY lp.usuario_id
        ) puntos_partidos ON u.id = puntos_partidos.usuario_id
        WHERE puntos_partidos.total IS NOT NULL
        ORDER BY puntos_jornada DESC, u.nombre ASC
      `
      : `
        SELECT 
          u.id,
          u.nombre,
          u.foto_perfil,
          ${(jornadaNumero === 6 || jornadaNumero === 8 || jornadaNumero === 9 || jornadaNumero === 10)
            ? 'COALESCE(puntos_partidos.total, 0) as puntos_jornada' 
            : 'COALESCE(puntos_partidos.total, 0) + COALESCE(puntos_clasificacion.total, 0) as puntos_jornada'}
        FROM usuarios u
        LEFT JOIN (
          SELECT lp.usuario_id, SUM(lp.puntos) as total
          FROM libertadores_pronosticos lp
          INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
          WHERE lj.numero = $1
          GROUP BY lp.usuario_id
        ) puntos_partidos ON u.id = puntos_partidos.usuario_id
        ${(jornadaNumero === 6 || jornadaNumero === 8 || jornadaNumero === 9 || jornadaNumero === 10) ? '' : `
        LEFT JOIN (
          SELECT usuario_id, SUM(puntos) as total
          FROM libertadores_puntos_clasificacion
          WHERE jornada_numero = $1
          GROUP BY usuario_id
        ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
        `}
        WHERE puntos_partidos.total IS NOT NULL ${(jornadaNumero === 6 || jornadaNumero === 8 || jornadaNumero === 9 || jornadaNumero === 10) ? '' : 'OR puntos_clasificacion.total IS NOT NULL'}
        ORDER BY puntos_jornada DESC, u.nombre ASC
      `;

    const ranking = await pool.query(rankingQuery, [jornadaNumero]);
    
    if (ranking.rows.length === 0) {
      return res.json({ ganadores: [], mensaje: null });
    }
    
    // Obtener el puntaje máximo
    const maxPuntaje = parseInt(ranking.rows[0].puntos_jornada);
    
    // Filtrar todos los que tienen el puntaje máximo (pueden ser varios en empate)
    const ganadores = ranking.rows
      .filter(row => parseInt(row.puntos_jornada) === maxPuntaje)
      .map(row => ({
        nombre: row.nombre,
        puntaje: maxPuntaje,
        foto_perfil: row.foto_perfil
      }));
    
    const mensaje = ganadores.length === 1 
      ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}`
      : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}`;
    
    res.json({
      jornadaNumero,
      ganadores,
      mensaje,
      fechaCalculo: new Date()
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
          WHERE puntos_partidos.total IS NOT NULL 
             OR puntos_clasificacion.total IS NOT NULL 
             OR puntos_final.puntos IS NOT NULL
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
            WHERE lj.numero <= $1
            GROUP BY lp.usuario_id
          ) puntos_partidos ON u.id = puntos_partidos.usuario_id
          LEFT JOIN (
            SELECT lpc.usuario_id, SUM(lpc.puntos) as total
            FROM libertadores_puntos_clasificacion lpc
            WHERE lpc.jornada_numero <= $1
            GROUP BY lpc.usuario_id
          ) puntos_clasificacion ON u.id = puntos_clasificacion.usuario_id
          WHERE puntos_partidos.total IS NOT NULL 
             OR puntos_clasificacion.total IS NOT NULL
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

    // Para jornada 10: Agregar puntos del partido FINAL a los rankings
    if (jornadaNumero === 10) {
      // Obtener todos los usuarios con pronósticos del FINAL
      const puntosFinalesResult = await pool.query(`
        SELECT 
          u.id,
          u.nombre,
          p.goles_local AS resultado_local,
          p.goles_visita AS resultado_visita,
          p.bonus,
          lpfv.goles_local AS pronostico_local,
          lpfv.goles_visita AS pronostico_visita,
          lpfv.equipo_local AS equipo_local_pronosticado,
          lpfv.equipo_visita AS equipo_visita_pronosticado,
          p.nombre_local AS equipo_local_real,
          p.nombre_visita AS equipo_visita_real
        FROM usuarios u
        INNER JOIN libertadores_pronosticos_final_virtual lpfv ON lpfv.usuario_id = u.id
        INNER JOIN libertadores_jornadas lj ON lpfv.jornada_id = lj.id
        INNER JOIN libertadores_partidos p ON p.id = 456
        WHERE lj.numero = 10
          AND p.goles_local IS NOT NULL
          AND p.goles_visita IS NOT NULL
      `);

      const puntosFinalesPorUsuario = {};
      puntosFinalesResult.rows.forEach(row => {
        // Verificar que los equipos coincidan
        if (row.equipo_local_pronosticado === row.equipo_local_real && 
            row.equipo_visita_pronosticado === row.equipo_visita_real) {
          
          const pronostico_local = row.pronostico_local;
          const pronostico_visita = row.pronostico_visita;
          const resultado_local = row.resultado_local;
          const resultado_visita = row.resultado_visita;
          const bonus = row.bonus || 1;

          let puntos = 0;
          // Resultado exacto
          if (pronostico_local === resultado_local && pronostico_visita === resultado_visita) {
            puntos = 10 * bonus;
          } 
          // Diferencia de goles
          else if (Math.abs(pronostico_local - pronostico_visita) === Math.abs(resultado_local - resultado_visita)) {
            const signoPronostico = Math.sign(pronostico_local - pronostico_visita);
            const signoResultado = Math.sign(resultado_local - resultado_visita);
            if (signoPronostico === signoResultado) {
              puntos = 7 * bonus;
            }
          } 
          // Solo signo
          else {
            const signoPronostico = Math.sign(pronostico_local - pronostico_visita);
            const signoResultado = Math.sign(resultado_local - resultado_visita);
            if (signoPronostico === signoResultado) {
              puntos = 4 * bonus;
            }
          }

          puntosFinalesPorUsuario[row.nombre] = puntos;
        }
      });

      // NO agregar puntos del FINAL a los rankings porque YA están incluidos en las queries
      // El ranking de jornada incluye TODOS los partidos (incluyendo el 456)
      // El ranking acumulado incluye puntos_final calculado desde libertadores_pronosticos_final_virtual
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

    // Obtener servicio de WhatsApp para envío de email
    const whatsappService = getWhatsAppService();

    // Generar HTML
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Arial', sans-serif; 
          padding: 20px; 
          background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
          color: #333;
        }
        .header {
          text-align: center;
          background: white;
          padding: 10px;
          border-radius: 10px;
          margin-bottom: 15px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .header img {
          height: 60px;
          margin: 0 15px;
          vertical-align: middle;
        }
        .header h1 {
          color: #1e3c72;
          font-size: 34px;
          margin: 15px 0 5px 0;
        }
        .header p {
          color: #666;
          font-size: 19px;
        }
        
        .ganadores-section {
          background: linear-gradient(135deg, #ffd700, #ffed4e);
          padding: 15px;
          margin-bottom: 15px;
          border-radius: 10px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.2);
          text-align: center;
          page-break-inside: avoid;
        }
        .ganadores-section h2 {
          color: #1e3c72;
          font-size: 32px;
          margin-bottom: 15px;
        }
        .ganador-card {
          display: inline-block;
          background: white;
          padding: 15px;
          margin: 10px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          vertical-align: top;
        }
        .ganador-foto {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid #ffd700;
          margin-bottom: 10px;
        }
        .ganador-nombre {
          font-size: 24px;
          font-weight: bold;
          color: #1e3c72;
          margin: 10px 0;
        }
        .ganador-puntos {
          font-size: 19px;
          color: #666;
        }

        .rankings-section {
          background: white;
          padding: 10px;
          margin-bottom: 12px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          page-break-inside: avoid;
        }
        .rankings-section h2 {
          color: #1e3c72;
          font-size: 27px;
          margin-bottom: 15px;
          text-align: center;
        }
        
        .usuario-section {
          background: white;
          padding: 10px;
          margin-bottom: 12px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          page-break-inside: avoid;
        }
        .usuario-header {
          display: flex;
          align-items: center;
          margin-bottom: 10px;
          border-bottom: 3px solid #ff6b35;
          padding-bottom: 6px;
        }
        .usuario-foto {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          object-fit: cover;
          margin-right: 15px;
          border: 2px solid #1e3c72;
        }
        .usuario-info {
          flex-grow: 1;
        }
        .usuario-nombre {
          color: #1e3c72;
          font-size: 24px;
          font-weight: bold;
          margin: 0;
        }
        .usuario-total {
          color: #27ae60;
          font-size: 22px;
          font-weight: bold;
          text-align: right;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th {
          background: #1e3c72;
          color: white;
          padding: 8px;
          text-align: left;
          font-size: 18px;
          font-weight: bold;
        }
        td {
          padding: 6px;
          border-bottom: 1px solid #e0e0e0;
          font-size: 17px;
          font-weight: bold;
        }
        tr:hover {
          background-color: #f5f5f5;
        }
        .partido-cell {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .equipo-logo {
          width: 32px;
          height: 32px;
          object-fit: contain;
        }
        .vs {
          color: #999;
          font-weight: bold;
          margin: 0 4px;
        }
        .resultado {
          font-weight: bold;
          color: #1e3c72;
          font-size: 22px;
        }
        .puntos-cell {
          font-weight: bold;
          font-size: 22px;
        }
        .puntos-positivo { color: #27ae60; }
        .puntos-cero { color: #c0392b; }
        
        .ranking-table th {
          background: #27ae60;
        }
        .ranking-table .posicion {
          text-align: center;
          font-weight: bold;
          font-size: 19px;
          color: #1e3c72;
        }
        .ranking-table .top-1 {
          background: #ffd700 !important;
        }
        .ranking-table .top-1 td {
          background: #ffd700 !important;
          color: #000 !important;
          font-weight: bold !important;
        }
        .ranking-table .top-2 {
          background: #c0c0c0 !important;
        }
        .ranking-table .top-2 td {
          background: #c0c0c0 !important;
          color: #000 !important;
          font-weight: bold !important;
        }
        .ranking-table .top-3 {
          background: #cd7f32 !important;
        }
        .ranking-table .top-3 td {
          background: #cd7f32 !important;
          color: #fff !important;
          font-weight: bold !important;
        }
        .ranking-foto {
          width: 35px;
          height: 35px;
          border-radius: 50%;
          object-fit: cover;
          vertical-align: middle;
          margin-right: 10px;
          border: 2px solid #ddd;
        }

        .footer {
          text-align: center;
          color: white;
          font-size: 12px;
          margin-top: 30px;
          padding: 15px;
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🏆 RESULTADOS LIBERTADORES - JORNADA ${jornadaNumero}</h1>
        <p>Copa Libertadores</p>
        <p style="font-size: 14px; color: #999; margin-top: 10px;">
          Fecha de generación: ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })}
        </p>
      </div>
    `;

    // GANADORES DE LA JORNADA
    if (ganadores && ganadores.length > 0) {
      html += `
      <div class="ganadores-section">
        <h2>🏆 GANADOR${ganadores.length > 1 ? 'ES' : ''} DE LA JORNADA ${jornadaNumero}</h2>
      `;
      
      for (const ganador of ganadores) {
        const fotoBase64 = ganador.foto_perfil ? getFotoPerfilBase64(ganador.foto_perfil) : null;
        
        const fotoHTML = fotoBase64 
          ? `<img src="${fotoBase64}" class="ganador-foto" alt="${ganador.nombre}">` 
          : `<div class="ganador-foto" style="background: #ddd; display: flex; align-items: center; justify-content: center;">👤</div>`;
        
        html += `
        <div class="ganador-card">
          ${fotoHTML}
          <div class="ganador-nombre">${ganador.nombre}</div>
          <div class="ganador-puntos">${ganador.puntaje !== undefined ? ganador.puntaje : 0} puntos</div>
        </div>
        `;
      }
      html += `</div>`;
    }

    // GANADOR DEL RANKING ACUMULADO (solo para J10)
    if (jornadaNumero === 10 && ranking.length > 0) {
      const ganadorAcumulado = ranking[0];
      const fotoBase64Acum = ganadorAcumulado.foto_perfil ? getFotoPerfilBase64(ganadorAcumulado.foto_perfil) : null;
      const fotoHTMLAcum = fotoBase64Acum 
        ? `<img src="${fotoBase64Acum}" class="ganador-foto" alt="${ganadorAcumulado.usuario}">` 
        : `<div class="ganador-foto" style="background: #ddd; display: flex; align-items: center; justify-content: center;">👤</div>`;
      
      html += `
      <div class="ganadores-section" style="margin-top: 20px; background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); border: 3px solid #ffd700;">
        <h2 style="color: #333;">👑 CAMPEÓN DEL RANKING ACUMULADO</h2>
        <div class="ganador-cards">
          <div class="ganador-card">
            ${fotoHTMLAcum}
            <div class="ganador-nombre">${ganadorAcumulado.usuario}</div>
            <div class="ganador-puntos" style="font-size: 24px; font-weight: bold;">${ganadorAcumulado.puntaje_total} puntos</div>
          </div>
        </div>
      </div>
      `;
    }

    // RANKING DE LA JORNADA
    if (rankingJornada.length > 0) {
      html += `
      <div class="rankings-section">
        <h2>🥇 RANKING JORNADA ${jornadaNumero}</h2>
        <table class="ranking-table">
          <thead>
            <tr>
              <th style="width: 15%; text-align: center;">Posición</th>
              <th style="width: 60%;">Jugador</th>
              <th style="width: 25%; text-align: center;">Puntos</th>
            </tr>
          </thead>
          <tbody>
      `;
      rankingJornada.forEach((r) => {
        let rowClass = '';
        const pos = parseInt(r.posicion);
        if (pos === 1) rowClass = 'top-1';
        else if (pos === 2) rowClass = 'top-2';
        else if (pos === 3) rowClass = 'top-3';
        
        const fotoBase64 = r.foto_perfil ? getFotoPerfilBase64(r.foto_perfil) : null;
        const fotoHTML = fotoBase64 ? `<img src="${fotoBase64}" class="ranking-foto" alt="${r.usuario}">` : '';
        
        html += `
            <tr class="${rowClass}">
              <td class="posicion">${r.posicion}</td>
              <td>${fotoHTML}${r.usuario}</td>
              <td style="text-align: center; font-weight: bold;">${r.puntos_jornada}</td>
            </tr>
        `;
      });
      html += `
          </tbody>
        </table>
      </div>
      `;
    }

    // RANKING ACUMULADO
    if (ranking.length > 0) {
      html += `
      <div class="rankings-section">
        <h2>📈 RANKING ACUMULADO (hasta Jornada ${jornadaNumero})</h2>
        <table class="ranking-table">
          <thead>
            <tr>
              <th style="width: 15%; text-align: center;">Posición</th>
              <th style="width: 60%;">Jugador</th>
              <th style="width: 25%; text-align: center;">Puntos Totales</th>
            </tr>
          </thead>
          <tbody>
      `;
      ranking.forEach((r) => {
        let rowClass = '';
        if (r.posicion === 1) rowClass = 'top-1';
        else if (r.posicion === 2) rowClass = 'top-2';
        else if (r.posicion === 3) rowClass = 'top-3';
        
        const fotoBase64 = r.foto_perfil ? getFotoPerfilBase64(r.foto_perfil) : null;
        const fotoHTML = fotoBase64 ? `<img src="${fotoBase64}" class="ranking-foto" alt="${r.usuario}">` : '';
        
        html += `
            <tr class="${rowClass}">
              <td class="posicion">${r.posicion}</td>
              <td>${fotoHTML}${r.usuario}</td>
              <td style="text-align: center; font-weight: bold;">${r.puntaje_total}</td>
            </tr>
        `;
      });
      html += `
          </tbody>
        </table>
      </div>
      `;
    }

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
    // AGREGAR DATOS DE CLASIFICACIÓN PARA JORNADAS 8, 9 Y 10 (Octavos, Cuartos, Semifinales)
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
          p_ida.goles_local AS resultado_ida_local,
          p_ida.goles_visita AS resultado_ida_visita
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

    // PRONÓSTICOS POR USUARIO
    for (const [usuario, userData] of Object.entries(pronosticosPorUsuario)) {
      const pronosticosUsuario = userData.pronosticos;
      const fotoPerfil = userData.foto_perfil;
      
      // Calcular puntaje de PARTIDOS solamente
      const puntosPartidos = pronosticosUsuario
        .filter(p => p.jornada_numero === jornadaNumero)
        .reduce((sum, p) => sum + (p.puntos || 0), 0);
      
      // Para J10: Cuadro Final incluye clasificados + campeon + subcampeon
      // Para otras jornadas: solo Clasificación
      let puntosCuadroFinal = 0;
      let puntosClasificacion = 0;
      
      if (jornadaNumero === 10) {
        // J10: Cuadro Final = finalistas + campeon + subcampeon
        if (clasificacionPorUsuario[usuario]) {
          // Solo sumar puntos de FINALISTAS (no CAMPEON ni SUBCAMPEON porque vienen de cuadroFinalPorUsuario)
          puntosCuadroFinal += clasificacionPorUsuario[usuario]
            .filter(c => c.fase_clasificado === 'FINALISTA')
            .reduce((sum, c) => sum + (c.puntos || 0), 0);
        }
        if (cuadroFinalPorUsuario[usuario]) {
          const cf = cuadroFinalPorUsuario[usuario];
          puntosCuadroFinal += (cf.puntos_campeon || 0) + (cf.puntos_subcampeon || 0);
        }
      } else if ((jornadaNumero === 6 || jornadaNumero === 8 || jornadaNumero === 9) && clasificacionPorUsuario[usuario]) {
        // J6, J8, J9: solo Clasificación
        puntosClasificacion = clasificacionPorUsuario[usuario].reduce((sum, c) => sum + (c.puntos || 0), 0);
      }
      
      const fotoBase64 = fotoPerfil ? getFotoPerfilBase64(fotoPerfil) : null;
      const fotoHTML = fotoBase64 
        ? `<img src="${fotoBase64}" class="usuario-foto" alt="${usuario}">` 
        : '';
      
      html += `
      <div class="usuario-section">
        <div class="usuario-header">
          ${fotoHTML}
          <div class="usuario-info">
            <h2 class="usuario-nombre">👤 ${usuario}</h2>
          </div>
          <div class="usuario-total">
            Partidos: ${puntosPartidos} pts
            ${puntosClasificacion > 0 ? `<br/>Clasificación: ${puntosClasificacion} pts` : ''}
            ${puntosCuadroFinal > 0 ? `<br/>Cuadro Final: ${puntosCuadroFinal} pts` : ''}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 10%;">Jornada</th>
              <th style="width: 30%;">Partido</th>
              <th style="width: 12%;">Pronóstico</th>
              <th style="width: 12%;">Resultado</th>
              <th style="width: 8%;">Bonus</th>
              <th style="width: 10%;">Puntos</th>
            </tr>
          </thead>
          <tbody>
      `;

      // Filtrar partidos: para J10, excluir el partido final (bonus x3) de la tabla normal
      const partidosMostrar = jornadaNumero === 10 
        ? pronosticosUsuario.filter(p => (p.bonus || 1) !== 3)
        : pronosticosUsuario;

      partidosMostrar.forEach((p) => {
        const logoLocal = getLogoBase64(p.nombre_local);
        const logoVisita = getLogoBase64(p.nombre_visita);
        
        const pronostico = `${p.pred_local} - ${p.pred_visita}`;
        const resultado = (p.real_local !== null && p.real_visita !== null) 
          ? `${p.real_local} - ${p.real_visita}` 
          : 'Pendiente';
        
        const puntos = p.puntos || 0;
        const puntosClass = puntos > 0 ? 'puntos-positivo' : 'puntos-cero';
        const bonus = p.bonus || 1;

        html += `
            <tr>
              <td style="text-align: center;">${p.jornada_numero}</td>
              <td>
                <div class="partido-cell">
                  ${logoLocal ? `<img src="${logoLocal}" class="equipo-logo" alt="${p.nombre_local}">` : ''}
                  <span>${p.nombre_local}</span>
                  <span class="vs">vs</span>
                  ${logoVisita ? `<img src="${logoVisita}" class="equipo-logo" alt="${p.nombre_visita}">` : ''}
                  <span>${p.nombre_visita}</span>
                </div>
              </td>
              <td style="text-align: center;">${pronostico}</td>
              <td style="text-align: center;" class="resultado">${resultado}</td>
              <td style="text-align: center;">×${bonus}</td>
              <td style="text-align: center;" class="puntos-cell ${puntosClass}">
                ${puntos}
              </td>
            </tr>
        `;
      });

      html += `
          </tbody>
        </table>

      `;

      // AGREGAR SECCIONES ADICIONALES PARA JORNADAS 6, 8, 9 Y 10
      // Jornada 6: Clasificación de fase de grupos
      // Jornadas 8, 9, 10: Clasificación de octavos, cuartos, semifinales
      if (jornadaNumero === 6) {
        // Para J6: Mostrar clasificación agrupada por grupo (2 filas por grupo)
        const clasificacion = clasificacionPorUsuario[usuario];
        if (clasificacion && clasificacion.length > 0) {
          // Agrupar por grupo
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
          
          // Calcular total de puntos de clasificación
          const totalPuntosClasificacion = clasificacion.reduce((sum, c) => sum + (c.puntos || 0), 0);
          
          html += `
            <h3 style="color: #1e3c72; margin-top: 15px; margin-bottom: 10px;">⚡ Equipos Clasificados</h3>
            <table>
              <thead>
                <tr>
                  <th style="width: 10%; text-align: center;">Grupo</th>
                  <th style="width: 30%;">Clasificación</th>
                  <th style="width: 25%;">Equipo Pronosticado</th>
                  <th style="width: 25%;">Equipo Real</th>
                  <th style="width: 10%; text-align: center;">Puntos</th>
                </tr>
              </thead>
              <tbody>
          `;
          
          // Ordenar grupos alfabéticamente
          const gruposOrdenados = Object.keys(grupos).sort();
          
          gruposOrdenados.forEach((grupo, index) => {
            const data = grupos[grupo];
            const tieneOctavos = data.octavos.length > 0;
            const tienePlayoffs = data.playoffs !== null;
            
            // Obtener equipos reales clasificados
            const oficialesGrupo = clasificadosOficialesJ6[grupo] || { octavos: [], playoffs: null };
            const equiposRealesOctavos = oficialesGrupo.octavos.length > 0 
              ? oficialesGrupo.octavos.join('<br>') 
              : '?<br>?';
            const equipoRealPlayoffs = oficialesGrupo.playoffs || '?';
            
            // Siempre mostrar 2 filas por grupo
            // Primera fila: Octavos (1° y 2° lugar)
            if (tieneOctavos) {
              const equiposPronosticados = data.octavos.map(o => o.equipo_clasificado).join('<br>');
              const puntosTotal = data.octavos.reduce((sum, o) => sum + (o.puntos || 0), 0);
              const puntosClass = puntosTotal > 0 ? 'puntos-positivo' : 'puntos-cero';
              
              html += `
                <tr>
                  <td style="text-align: center; font-weight: bold; vertical-align: middle;" rowspan="2">${grupo}</td>
                  <td><strong>Clasificados a Octavos</strong></td>
                  <td>${equiposPronosticados}</td>
                  <td>${equiposRealesOctavos}</td>
                  <td style="text-align: center;" class="puntos-cell ${puntosClass}">${puntosTotal}</td>
                </tr>
              `;
            }
            
            // Segunda fila: Playoffs Sudamericana (3° lugar)
            if (tienePlayoffs) {
              const puntosClass = data.playoffs.puntos > 0 ? 'puntos-positivo' : 'puntos-cero';
              html += `
                <tr>
                  <td><strong>Clasificado a Playoffs Sudamericana</strong></td>
                  <td>${data.playoffs.equipo_clasificado}</td>
                  <td>${equipoRealPlayoffs}</td>
                  <td style="text-align: center;" class="puntos-cell ${puntosClass}">${data.playoffs.puntos}</td>
                </tr>
              `;
            } else {
              // Si no hay playoffs, agregar fila vacía para mantener estructura
              html += `
                <tr>
                  <td><strong>Clasificado a Playoffs Sudamericana</strong></td>
                  <td>-</td>
                  <td>-</td>
                  <td style="text-align: center;" class="puntos-cell">0</td>
                </tr>
              `;
            }
          });
          
          // Fila de total
          html += `
                <tr style="background-color: #f8f9fa; font-weight: bold;">
                  <td colspan="4" style="text-align: right; padding-right: 10px;">TOTAL CLASIFICACIÓN:</td>
                  <td style="text-align: center;" class="puntos-cell">${totalPuntosClasificacion}</td>
                </tr>
              </tbody>
            </table>
          `;
        }
      } else if (jornadaNumero === 8 || jornadaNumero === 9) {
        // Para J8-9 solamente: Mostrar equipos que avanzan
        const clasificacion = clasificacionPorUsuario[usuario];
        if (clasificacion && clasificacion.length > 0) {
          html += `
            <h3 style="color: #1e3c72; margin-top: 15px; margin-bottom: 10px;">⚡ Equipo que avanza</h3>
            <table>
              <thead>
                <tr>
                  <th style="width: 40%;">Equipo Pronosticado</th>
                  <th style="width: 40%;">Equipo Real</th>
                  <th style="width: 20%; text-align: center;">Puntos</th>
                </tr>
              </thead>
              <tbody>
          `;
          
          clasificacion.forEach(c => {
            const puntosClass = c.puntos > 0 ? 'puntos-positivo' : 'puntos-cero';
            
            html += `
                <tr>
                  <td>${c.equipo_clasificado}</td>
                  <td>${c.equipo_real_avanza}</td>
                  <td style="text-align: center;" class="puntos-cell ${puntosClass}">${c.puntos}</td>
                </tr>
            `;
          });

          html += `
              </tbody>
            </table>
          `;
        }
      }

      // SECCIONES ADICIONALES SOLO PARA JORNADA 10
      if (jornadaNumero === 10) {
        // Partido FINAL (solo si tiene equipos reales, para evitar duplicados)
        const partidoFinal = partidoFinalPorUsuario[usuario];
        if (partidoFinal && partidoFinal.nombre_local && partidoFinal.nombre_visita) {
          const logoLocal = getLogoBase64(partidoFinal.nombre_local);
          const logoVisita = getLogoBase64(partidoFinal.nombre_visita);
          const puntosClass = partidoFinal.puntos > 0 ? 'puntos-positivo' : 'puntos-cero';
          const pronostico = `${partidoFinal.pronostico_local} - ${partidoFinal.pronostico_visita}`;
          const resultado = partidoFinal.resultado_local !== null ? `${partidoFinal.resultado_local} - ${partidoFinal.resultado_visita}` : 'Pendiente';
          const equiposCoinciden = partidoFinal.equipo_local_pronosticado === partidoFinal.nombre_local && 
                                  partidoFinal.equipo_visita_pronosticado === partidoFinal.nombre_visita;

          html += `
            <h3 style="color: #1e3c72; margin-top: 15px; margin-bottom: 10px;">🏆 PARTIDO FINAL</h3>
            <table>
              <thead>
                <tr>
                  <th style="width: 40%;">Partido</th>
                  <th style="width: 15%;">Pronóstico</th>
                  <th style="width: 15%;">Resultado</th>
                  <th style="width: 10%;">Bonus</th>
                  <th style="width: 10%; text-align: center;">Puntos</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div style="margin-bottom: 5px;">
                      <div class="partido-cell">
                        ${logoLocal ? `<img src="${logoLocal}" class="equipo-logo" alt="${partidoFinal.nombre_local}">` : ''}
                        <span>${partidoFinal.nombre_local}</span>
                        <span class="vs">vs</span>
                        ${logoVisita ? `<img src="${logoVisita}" class="equipo-logo" alt="${partidoFinal.nombre_visita}">` : ''}
                        <span>${partidoFinal.nombre_visita}</span>
                        <span style="font-size: 12px; font-style: italic; color: #666; margin-left: 10px;">Real</span>
                      </div>
                    </div>
                    ${!equiposCoinciden ? `<div style="font-size: 14px; color: #666;">
                      <span>${partidoFinal.equipo_local_pronosticado} vs ${partidoFinal.equipo_visita_pronosticado}</span>
                      <span style="font-size: 12px; font-style: italic; margin-left: 10px;">Pron.</span>
                    </div>` : ''}
                  </td>
                  <td style="text-align: center;">${pronostico}</td>
                  <td style="text-align: center;" class="resultado">${resultado}</td>
                  <td style="text-align: center;">×${partidoFinal.bonus || 1}</td>
                  <td style="text-align: center;" class="puntos-cell ${puntosClass}">${partidoFinal.puntos}</td>
                </tr>
              </tbody>
            </table>
          `;
        }



        // Cuadro Final (Clasificados + Campeón + Subcampeón) - Solo para J10
        if (jornadaNumero === 10) {
          const cuadroFinal = cuadroFinalPorUsuario[usuario];
          const partidoFinal = partidoFinalPorUsuario[usuario];
          const todosClasificados = clasificacionPorUsuario[usuario] || [];
          
          // Filtrar solo FINALISTAS (no incluir CAMPEON ni SUBCAMPEON porque vienen en cuadroFinal)
          const finalistas = todosClasificados.filter(c => c.fase_clasificado === 'FINALISTA');
          
          // Obtener equipos finalistas pronosticados desde partidoFinal
          const finalistasPronosticados = partidoFinal?.finalistasPronosticados?.join(', ') || '-';
          
          // Calcular puntos de finalistas
          const puntosClasificados = finalistas.reduce((sum, c) => sum + (c.puntos || 0), 0);
          
          const puntosCampeon = cuadroFinal?.puntos_campeon || 0;
          const puntosSubcampeon = cuadroFinal?.puntos_subcampeon || 0;
          const totalCuadroFinal = puntosClasificados + puntosCampeon + puntosSubcampeon;
          
          const puntosClasificadosClass = puntosClasificados > 0 ? 'puntos-positivo' : 'puntos-cero';
          const puntosCampeonClass = puntosCampeon > 0 ? 'puntos-positivo' : 'puntos-cero';
          const puntosSubcampeonClass = puntosSubcampeon > 0 ? 'puntos-positivo' : 'puntos-cero';

          html += `
            <h3 style="color: #1e3c72; margin-top: 15px; margin-bottom: 10px;">🏆 Cuadro Final</h3>
            <table>
              <thead>
                <tr>
                  <th style="width: 20%;">Posición</th>
                  <th style="width: 35%;">Equipo Real</th>
                  <th style="width: 35%;">Equipo Pronosticado</th>
                  <th style="width: 10%; text-align: center;">Puntos</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Finalistas</strong></td>
                  <td>Palmeiras (BRA), Flamengo (BRA)</td>
                  <td>${finalistasPronosticados}</td>
                  <td style="text-align: center;" class="puntos-cell ${puntosClasificadosClass}">${puntosClasificados}</td>
                </tr>
                <tr>
                  <td><strong>Campeón</strong></td>
                  <td>Flamengo (BRA)</td>
                  <td>${cuadroFinal?.campeon || '-'}</td>
                  <td style="text-align: center;" class="puntos-cell ${puntosCampeonClass}">${puntosCampeon}</td>
                </tr>
                <tr>
                  <td><strong>Subcampeón</strong></td>
                  <td>Palmeiras (BRA)</td>
                  <td>${cuadroFinal?.subcampeon || '-'}</td>
                  <td style="text-align: center;" class="puntos-cell ${puntosSubcampeonClass}">${puntosSubcampeon}</td>
                </tr>
                <tr style="border-top: 2px solid #1e3c72;">
                  <td colspan="3" style="text-align: right;"><strong>Total Cuadro Final:</strong></td>
                  <td style="text-align: center;" class="puntos-cell"><strong>${totalCuadroFinal} pts</strong></td>
                </tr>
              </tbody>
            </table>
          `;
        }
      }

      html += `
      </div>
      `;
    }

    html += `
      <div class="footer">
        <p>Campeonato Itaú ${new Date().getFullYear()} • Copa Libertadores</p>
        <p>Sistema de Pronósticos Deportivos</p>
      </div>
    </body>
    </html>
    `;

    // Generar PDF
    const options = {
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    };
    const file = { content: html };
    const pdfBuffer = await htmlPdf.generatePdf(file, options);

    // Enviar por email
    const nombreArchivo = `Resultados_Libertadores_Jornada_${jornadaNumero}_${new Date().toISOString().split('T')[0]}.pdf`;
    const resultadoEmail = await whatsappService.enviarEmailConPDF(
      pdfBuffer,
      nombreArchivo,
      jornadaNumero,
      'Libertadores'
    );

    if (!resultadoEmail.success) {
      throw new Error(resultadoEmail.mensaje);
    }

    return true;

  } catch (error) {
    console.error('Error al generar PDF de Libertadores:', error);
    throw error;
  }
}

export default router;
