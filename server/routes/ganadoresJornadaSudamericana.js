import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { checkRole } from '../middleware/checkRole.js';
import htmlPdf from 'html-pdf-node';
import { getWhatsAppService } from '../services/whatsappService.js';
import { getLogoBase64 } from '../utils/logoHelper.js';
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
    
    // Obtener el ranking acumulado TOTAL (todas las jornadas)
    const rankingResult = await pool.query(`
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(SUM(sp.puntos), 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN sudamericana_pronosticos sp ON u.id = sp.usuario_id
      WHERE u.activo_sudamericana = true
      GROUP BY u.id, u.nombre, u.foto_perfil
      HAVING COALESCE(SUM(sp.puntos), 0) > 0
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
        puntaje: puntajeMaximo
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
      puntaje: row.puntaje
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
    
    if (usuariosResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay usuarios activos en Sudamericana' });
    }
    
    // 2. Calcular puntos de cada usuario para la jornada
    const puntosUsuarios = [];
    
    for (const usuario of usuariosResult.rows) {
      // Puntos de partidos (usando p.jornada_id porque sp.jornada_id es NULL)
      const puntosPartidosResult = await pool.query(`
        SELECT COALESCE(SUM(sp.puntos), 0) as puntos_partidos
        FROM sudamericana_pronosticos sp
        INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
        INNER JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
        WHERE sp.usuario_id = $1 AND sj.numero = $2
      `, [usuario.id, jornadaNumero]);
      
      const puntosPartidos = parseInt(puntosPartidosResult.rows[0].puntos_partidos || 0, 10);
      
      puntosUsuarios.push({
        usuario_id: usuario.id,
        nombre: usuario.nombre,
        foto_perfil: usuario.foto_perfil,
        puntaje: puntosPartidos
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
    
    // 8. Generar PDF con resultados y enviarlo por email
    let pdfGenerado = false;
    try {
      await generarPDFSudamericanaConGanadores(jornadaNumero, ganadores);
      pdfGenerado = true;
      console.log(`✅ PDF generado y enviado para jornada ${jornadaNumero} de Sudamericana`);
    } catch (pdfError) {
      console.error('❌ Error generando/enviando PDF Sudamericana:', pdfError);
      // No falla el endpoint si falla el PDF
    }
    
    const mensaje = ganadores.length === 1 
      ? `El ganador de la jornada ${jornadaNumero} de Copa Sudamericana es: ${ganadores[0].nombre}${pdfGenerado ? '\n\n📧 PDF enviado por email' : ''}`
      : `Los ganadores de la jornada ${jornadaNumero} de Copa Sudamericana son: ${ganadores.map(g => g.nombre).join(', ')}${pdfGenerado ? '\n\n📧 PDF enviado por email' : ''}`;

    // 9. Retornar los ganadores
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
    // Calcular ganadores DIRECTAMENTE desde el ranking (siempre actualizado)
    const rankingQuery = `
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(SUM(sp.puntos), 0) as puntos_jornada
      FROM usuarios u
      LEFT JOIN sudamericana_pronosticos sp ON u.id = sp.usuario_id
      LEFT JOIN sudamericana_partidos p ON sp.partido_id = p.id
      LEFT JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      WHERE sj.numero = $1 AND u.activo_sudamericana = true
      GROUP BY u.id, u.nombre, u.foto_perfil
      HAVING COALESCE(SUM(sp.puntos), 0) > 0
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
      ? `El ganador de la jornada ${jornadaNumero} de Copa Sudamericana es: ${ganadores[0].nombre}`
      : `Los ganadores de la jornada ${jornadaNumero} de Copa Sudamericana son: ${ganadores.map(g => g.nombre).join(', ')}`;
    
    res.json({
      jornadaNumero,
      ganadores,
      mensaje,
      fechaCalculo: new Date()
    });
    
  } catch (error) {
    console.error('Error obteniendo ganadores Sudamericana:', error);
    res.status(500).json({ error: 'Error obteniendo ganadores de la jornada' });
  }
});

// ==================== FUNCIÓN PARA GENERAR PDF CON RESULTADOS Y GANADORES ====================
async function generarPDFSudamericanaConGanadores(jornadaNumero, ganadores) {
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
        sp.goles_local AS pred_local,
        sp.goles_visita AS pred_visita,
        p.goles_local AS real_local,
        p.goles_visita AS real_visita,
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

    // 2. Obtener ranking acumulado hasta la jornada (excluyendo admins)
    const rankingQuery = await pool.query(
      `SELECT 
        u.nombre AS usuario,
        u.foto_perfil,
        COALESCE(SUM(sp.puntos), 0) AS puntaje_total,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(sp.puntos), 0) DESC, u.nombre ASC) AS posicion
      FROM usuarios u
      LEFT JOIN sudamericana_pronosticos sp ON u.id = sp.usuario_id
      LEFT JOIN sudamericana_partidos p ON sp.partido_id = p.id
      LEFT JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      WHERE u.activo_sudamericana = true
        AND u.rol != 'admin'
        AND sj.numero <= $1
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntaje_total DESC
      LIMIT 10`,
      [jornadaNumero]
    );

    // 3. Obtener ranking de la jornada específica (excluyendo admins)
    const rankingJornadaQuery = await pool.query(
      `SELECT 
        u.nombre AS usuario,
        u.foto_perfil,
        COALESCE(SUM(sp.puntos), 0) AS puntos_jornada,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(sp.puntos), 0) DESC, u.nombre ASC) AS posicion
      FROM usuarios u
      LEFT JOIN sudamericana_pronosticos sp ON u.id = sp.usuario_id
      LEFT JOIN sudamericana_partidos p ON sp.partido_id = p.id
      LEFT JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      WHERE u.activo_sudamericana = true
        AND u.rol != 'admin'
        AND sj.numero = $1
      GROUP BY u.id, u.nombre, u.foto_perfil
      HAVING COALESCE(SUM(sp.puntos), 0) > 0
      ORDER BY puntos_jornada DESC
      LIMIT 10`,
      [jornadaNumero]
    );

    const pronosticos = pronosticosQuery.rows;
    const ranking = rankingQuery.rows;
    const rankingJornada = rankingJornadaQuery.rows;

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

    // Función para convertir foto de perfil a base64
    const getFotoPerfilBase64 = (fotoPerfil) => {
      if (!fotoPerfil) return null;
      try {
        let cleanPath = fotoPerfil;
        if (cleanPath.startsWith('/perfil/')) {
          cleanPath = cleanPath.substring(8);
        } else if (cleanPath.startsWith('perfil/')) {
          cleanPath = cleanPath.substring(7);
        }
        
        const fotoPath = path.join(__dirname, '../../client/public/perfil', cleanPath);
        
        if (fs.existsSync(fotoPath)) {
          const imageBuffer = fs.readFileSync(fotoPath);
          const ext = path.extname(cleanPath).substring(1);
          const base64 = `data:image/${ext};base64,${imageBuffer.toString('base64')}`;
          return base64;
        }
      } catch (error) {
        console.error('Error cargando foto:', error);
      }
      return null;
    };

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
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
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
          color: #28a745;
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
          color: #28a745;
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
          color: #28a745;
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
          color: #28a745;
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
          border-bottom: 3px solid #28a745;
          padding-bottom: 6px;
        }
        .usuario-foto {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          object-fit: cover;
          margin-right: 15px;
          border: 2px solid #28a745;
        }
        .usuario-info {
          flex-grow: 1;
        }
        .usuario-nombre {
          color: #28a745;
          font-size: 24px;
          font-weight: bold;
          margin: 0;
        }
        .usuario-total {
          color: #28a745;
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
          background: #28a745;
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
          color: #28a745;
          font-size: 22px;
        }
        .puntos-cell {
          font-weight: bold;
          font-size: 22px;
        }
        .puntos-positivo { color: #28a745; }
        .puntos-cero { color: #c0392b; }
        
        .ranking-table th {
          background: #28a745;
        }
        .ranking-table .posicion {
          text-align: center;
          font-weight: bold;
          font-size: 19px;
          color: #28a745;
        }
        .ranking-table .top-1 {
          background: #ffd700 !important;
          color: #000 !important;
        }
        .ranking-table .top-2 {
          background: #c0c0c0 !important;
          color: #000 !important;
        }
        .ranking-table .top-3 {
          background: #cd7f32 !important;
          color: #000 !important;
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
        <h1>🏆 RESULTADOS SUDAMERICANA - JORNADA ${jornadaNumero}</h1>
        <p>Copa Sudamericana</p>
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
          <div class="ganador-puntos">${ganador.puntaje} puntos</div>
        </div>
        `;
      }
      html += `</div>`;
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

      rankingJornada.forEach((jugador, index) => {
        const fotoBase64 = jugador.foto_perfil ? getFotoPerfilBase64(jugador.foto_perfil) : null;
        const fotoHTML = fotoBase64 
          ? `<img src="${fotoBase64}" class="ranking-foto" alt="${jugador.usuario}">` 
          : '';

        const posicionClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
        
        html += `
            <tr class="${posicionClass}">
              <td class="posicion">${jugador.posicion}°</td>
              <td>${fotoHTML}${jugador.usuario}</td>
              <td style="text-align: center; font-weight: bold;">${jugador.puntos_jornada}</td>
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
        <h2>📊 RANKING ACUMULADO (hasta jornada ${jornadaNumero})</h2>
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

      ranking.forEach((jugador, index) => {
        const fotoBase64 = jugador.foto_perfil ? getFotoPerfilBase64(jugador.foto_perfil) : null;
        const fotoHTML = fotoBase64 
          ? `<img src="${fotoBase64}" class="ranking-foto" alt="${jugador.usuario}">` 
          : '';

        const posicionClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
        
        html += `
            <tr class="${posicionClass}">
              <td class="posicion">${jugador.posicion}°</td>
              <td>${fotoHTML}${jugador.usuario}</td>
              <td style="text-align: center; font-weight: bold;">${jugador.puntaje_total}</td>
            </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      </div>
      `;
    }

    // PRONÓSTICOS POR USUARIO
    const usuariosOrdenados = Object.keys(pronosticosPorUsuario).sort();
    
    for (const usuario of usuariosOrdenados) {
      const data = pronosticosPorUsuario[usuario];
      const fotoBase64 = data.foto_perfil ? getFotoPerfilBase64(data.foto_perfil) : null;
      const fotoHTML = fotoBase64 
        ? `<img src="${fotoBase64}" class="usuario-foto" alt="${usuario}">` 
        : '';

      const puntosTotal = data.pronosticos.reduce((sum, p) => sum + (p.puntos || 0), 0);

      html += `
      <div class="usuario-section">
        <div class="usuario-header">
          ${fotoHTML}
          <div class="usuario-info">
            <h3 class="usuario-nombre">${usuario}</h3>
          </div>
          <div class="usuario-total">Total: ${puntosTotal} pts</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Partido</th>
              <th style="width: 18%; text-align: center;">Pronóstico</th>
              <th style="width: 18%; text-align: center;">Resultado</th>
              <th style="width: 10%; text-align: center;">Bonus</th>
              <th style="width: 15%; text-align: center;">Puntos</th>
            </tr>
          </thead>
          <tbody>
      `;

      data.pronosticos.forEach((p) => {
        const puntosClass = p.puntos > 0 ? 'puntos-positivo' : 'puntos-cero';
        const predLocal = p.pred_local !== null && p.pred_local !== undefined ? p.pred_local : '-';
        const predVisita = p.pred_visita !== null && p.pred_visita !== undefined ? p.pred_visita : '-';
        const bonusValue = p.bonus && p.bonus > 1 ? `x${p.bonus}` : 'x1';

        html += `
            <tr>
              <td>${p.nombre_local} vs ${p.nombre_visita}</td>
              <td style="text-align: center;" class="resultado">${predLocal} - ${predVisita}</td>
              <td style="text-align: center;" class="resultado">${p.real_local} - ${p.real_visita}</td>
              <td style="text-align: center; font-weight: bold; color: ${p.bonus > 1 ? '#17a2b8' : '#666'};">${bonusValue}</td>
              <td style="text-align: center;" class="puntos-cell ${puntosClass}">${p.puntos || 0}</td>
            </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      </div>
      `;
    }

    html += `
      <div class="footer">
        <p>Este PDF fue generado automáticamente por el sistema de pronósticos</p>
        <p>Copa Sudamericana 2026</p>
      </div>
    </body>
    </html>
    `;

    // Opciones para el PDF
    const options = {
      format: 'A4',
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      printBackground: true,
      preferCSSPageSize: true
    };

    const file = { content: html };

    // Generar PDF
    console.log(`📄 Generando PDF Sudamericana jornada ${jornadaNumero}...`);
    const pdfBuffer = await htmlPdf.generatePdf(file, options);

    // Enviar por email
    console.log(`📧 Enviando PDF por email...`);
    const nombreArchivo = `Resultados_Sudamericana_Jornada_${jornadaNumero}_${new Date().toISOString().split('T')[0]}.pdf`;
    const resultadoEmail = await whatsappService.enviarEmailConPDF(
      pdfBuffer,
      nombreArchivo,
      jornadaNumero,
      'Sudamericana'
    );

    if (!resultadoEmail.success) {
      throw new Error(resultadoEmail.mensaje);
    }

    console.log(`✅ PDF Sudamericana jornada ${jornadaNumero} generado y enviado correctamente`);
    
    return true;
  } catch (error) {
    console.error('Error generando PDF Sudamericana:', error);
    throw error;
  }
}

export default router;
