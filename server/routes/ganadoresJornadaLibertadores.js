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
    // Verificar/crear tabla libertadores_ganadores_acumulado (NO hacer DROP - mantener histórico)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libertadores_ganadores_acumulado (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
        puntaje INTEGER NOT NULL,
        fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Tabla libertadores_ganadores_acumulado verificada');
    
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
    
    console.log('Ganadores acumulado encontrados:', ganadores);
    console.log('Top 3 para históricos:', top3);
    
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
    
    // Retornar los ganadores
    res.json({
      tipo: 'acumulado',
      ganadores: ganadores.map(g => ({
        nombre: g.nombre,
        puntaje: puntajeMaximo
      })),
      mensaje: ganadores.length === 1 
        ? `🏆 EL CAMPEÓN DEL RANKING ACUMULADO ES: ${ganadores[0].nombre.toUpperCase()}`
        : `🏆 LOS CAMPEONES DEL RANKING ACUMULADO SON: ${ganadores.map(g => g.nombre.toUpperCase()).join(', ')}`
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
        u.nombre
      FROM libertadores_ganadores_acumulado lga
      INNER JOIN usuarios u ON lga.usuario_id = u.id
      ORDER BY u.nombre
    `);
    
    if (result.rows.length === 0) {
      return res.json({ ganadores: [], mensaje: null });
    }
    
    const ganadores = result.rows.map(row => ({
      nombre: row.nombre,
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
    
    console.log('✅ Tabla libertadores_ganadores_jornada verificada');
    
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
      if (jornadaNumero === 10) {
        const puntosFinalesResult = await pool.query(`
          SELECT 
            COALESCE(SUM(puntos_campeon), 0) + COALESCE(SUM(puntos_subcampeon), 0) as puntos_finales
          FROM libertadores_predicciones_campeon
          WHERE usuario_id = $1
        `, [usuario.id]);
        
        puntosCampeonSubcampeon = puntosFinalesResult.rows[0].puntos_finales || 0;
      }
      
      const puntosPartidos = parseInt(puntosPartidosResult.rows[0].puntos_partidos || 0, 10);
      const puntosClasificacion = parseInt(puntosClasificacionResult.rows[0].puntos_clasificacion || 0, 10);
      const puntosCampeonSubcampeonNum = parseInt(puntosCampeonSubcampeon || 0, 10);
      const puntosTotal = puntosPartidos + puntosClasificacion + puntosCampeonSubcampeonNum;
      
      puntosUsuarios.push({
        usuario_id: usuario.id,
        nombre: usuario.nombre,
        foto_perfil: usuario.foto_perfil,
        puntaje: puntosTotal
      });
    }
    
    // Verificar que haya datos
    if (puntosUsuarios.length === 0) {
      return res.status(404).json({ error: 'No se encontraron usuarios con pronósticos para esta jornada' });
    }
    
    console.log('Puntos usuarios calculados:', puntosUsuarios);
    
    // 3. Encontrar el puntaje máximo
    const puntajeMaximo = Math.max(...puntosUsuarios.map(u => u.puntaje));
    
    console.log('Puntaje máximo:', puntajeMaximo);
    
    // 4. Obtener todos los usuarios con el puntaje máximo (manejo de empates)
    const ganadores = puntosUsuarios.filter(u => u.puntaje === puntajeMaximo);
    
    console.log('Ganadores encontrados:', ganadores);
    
    if (ganadores.length === 0) {
      return res.status(404).json({ error: 'No se pudieron determinar ganadores' });
    }
    
    // 5. Borrar ganadores anteriores de esta jornada (si existen)
    await pool.query(
      'DELETE FROM libertadores_ganadores_jornada WHERE jornada_numero = $1',
      [jornadaNumero]
    );
    
    // 6. Guardar los nuevos ganadores
    for (const ganador of ganadores) {
      await pool.query(
        `INSERT INTO libertadores_ganadores_jornada (jornada_numero, usuario_id, puntaje)
         VALUES ($1, $2, $3)`,
        [jornadaNumero, ganador.usuario_id, ganador.puntaje]
      );
    }
    
    // 7. Generar y enviar PDF con resultados completos
    let pdfGenerado = false;
    let pdfError = null;
    try {
      console.log(`📄 Generando PDF con resultados de jornada ${jornadaNumero}...`);
      await generarPDFLibertadoresConGanadores(jornadaNumero, ganadores);
      console.log('✅ PDF de Libertadores generado y enviado exitosamente');
      pdfGenerado = true;
    } catch (error) {
      console.error('❌ Error generando PDF de Libertadores:', error);
      pdfError = error.message;
      // No fallar la petición completa si el PDF falla
    }

    const mensaje = pdfGenerado
      ? (ganadores.length === 1 
          ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}. PDF enviado por email.`
          : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}. PDF enviado por email.`)
      : (ganadores.length === 1 
          ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}. PDF falló: ${pdfError}`
          : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}. PDF falló: ${pdfError}`);

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
    return res.status(400).json({ error: 'Número de jornada inválido' });
  }
  
  try {
    const result = await pool.query(`
      SELECT 
        lgj.jornada_numero,
        lgj.puntaje,
        lgj.fecha_calculo,
        u.id as usuario_id,
        u.nombre
      FROM libertadores_ganadores_jornada lgj
      INNER JOIN usuarios u ON lgj.usuario_id = u.id
      WHERE lgj.jornada_numero = $1
      ORDER BY u.nombre
    `, [jornadaNumero]);
    
    if (result.rows.length === 0) {
      return res.json({ ganadores: [], mensaje: null });
    }
    
    const ganadores = result.rows.map(row => ({
      nombre: row.nombre,
      puntaje: row.puntaje
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
    console.log(`\n🎯 Generando PDF para jornada ${jornadaNumero}`);
    console.log(`📸 Ganadores recibidos:`, ganadores.map(g => ({ nombre: g.nombre, foto: g.foto_perfil })));
    
    // 1. Obtener pronósticos con resultados reales y puntos de la jornada específica
    const pronosticosQuery = await pool.query(
      `SELECT 
        u.nombre AS usuario,
        u.foto_perfil,
        p.nombre_local,
        p.nombre_visita,
        p.fecha,
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
      ORDER BY u.nombre, p.fecha`,
      [jornadaNumero]
    );

    // 2. Obtener ranking acumulado hasta la jornada (excluyendo admins)
    const rankingQuery = await pool.query(
      `SELECT 
        u.nombre AS usuario,
        u.foto_perfil,
        COALESCE(SUM(lp.puntos), 0) AS puntaje_total,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(lp.puntos), 0) DESC, u.nombre ASC) AS posicion
      FROM usuarios u
      LEFT JOIN libertadores_pronosticos lp ON lp.usuario_id = u.id
      LEFT JOIN libertadores_partidos p ON lp.partido_id = p.id
      LEFT JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      WHERE u.activo_libertadores = true
        AND u.rol != 'admin'
        AND (lj.numero IS NULL OR lj.numero <= $1)
        AND (p.goles_local IS NULL OR p.goles_visita IS NULL OR (p.goles_local IS NOT NULL AND p.goles_visita IS NOT NULL))
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
        COALESCE(SUM(lp.puntos), 0) AS puntos_jornada,
        ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(lp.puntos), 0) DESC, u.nombre ASC) AS posicion
      FROM usuarios u
      LEFT JOIN libertadores_pronosticos lp ON lp.usuario_id = u.id
      LEFT JOIN libertadores_partidos p ON lp.partido_id = p.id
      LEFT JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      WHERE u.activo_libertadores = true
        AND u.rol != 'admin'
        AND lj.numero = $1
        AND p.goles_local IS NOT NULL AND p.goles_visita IS NOT NULL
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntos_jornada DESC
      LIMIT 10`,
      [jornadaNumero]
    );

    const pronosticos = pronosticosQuery.rows;
    const ranking = rankingQuery.rows;
    const rankingJornada = rankingJornadaQuery.rows;

    console.log(`📊 Datos obtenidos - Pronósticos: ${pronosticos.length}, Ranking: ${ranking.length}, Ranking Jornada: ${rankingJornada.length}, Ganadores: ${ganadores.length}`);

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
        // Limpiar el path: si empieza con /perfil/, quitarlo
        let cleanPath = fotoPerfil;
        if (cleanPath.startsWith('/perfil/')) {
          cleanPath = cleanPath.substring(8); // Quitar "/perfil/"
        } else if (cleanPath.startsWith('perfil/')) {
          cleanPath = cleanPath.substring(7); // Quitar "perfil/"
        }
        
        const fotoPath = path.join(__dirname, '../../client/public/perfil', cleanPath);
        console.log(`🖼️  Buscando foto: ${fotoPerfil} -> ${fotoPath}`);
        
        if (fs.existsSync(fotoPath)) {
          const imageBuffer = fs.readFileSync(fotoPath);
          const ext = path.extname(cleanPath).substring(1);
          const base64 = `data:image/${ext};base64,${imageBuffer.toString('base64')}`;
          console.log(`✅ Foto cargada: ${cleanPath} (${imageBuffer.length} bytes)`);
          return base64;
        } else {
          console.warn(`⚠️  Foto no encontrada: ${fotoPath}`);
        }
      } catch (error) {
        console.warn(`❌ Error cargando foto: ${fotoPerfil}`, error.message);
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
        console.log(`\n🏆 Procesando ganador: ${ganador.nombre}`);
        console.log(`   foto_perfil: ${ganador.foto_perfil}`);
        
        const fotoBase64 = ganador.foto_perfil ? getFotoPerfilBase64(ganador.foto_perfil) : null;
        console.log(`   fotoBase64 generado: ${fotoBase64 ? 'SÍ (' + fotoBase64.substring(0, 50) + '...)' : 'NO'}`);
        
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
      rankingJornada.forEach((r) => {
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

    // PRONÓSTICOS POR USUARIO
    for (const [usuario, userData] of Object.entries(pronosticosPorUsuario)) {
      const pronosticosUsuario = userData.pronosticos;
      const fotoPerfil = userData.foto_perfil;
      
      // Calcular puntaje de la jornada (solo pronósticos de la jornada actual)
      const puntajeJornada = pronosticosUsuario
        .filter(p => p.jornada_numero === jornadaNumero)
        .reduce((sum, p) => sum + (p.puntos || 0), 0);
      
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
          <div class="usuario-total">Jornada ${jornadaNumero}: ${puntajeJornada} pts</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 10%;">Jornada</th>
              <th style="width: 35%;">Partido</th>
              <th style="width: 15%;">Pronóstico</th>
              <th style="width: 15%;">Resultado</th>
              <th style="width: 10%;">Puntos</th>
            </tr>
          </thead>
          <tbody>
      `;

      pronosticosUsuario.forEach((p) => {
        const logoLocal = getLogoBase64(p.nombre_local);
        const logoVisita = getLogoBase64(p.nombre_visita);
        
        const pronostico = `${p.pred_local} - ${p.pred_visita}`;
        const resultado = (p.real_local !== null && p.real_visita !== null) 
          ? `${p.real_local} - ${p.real_visita}` 
          : 'Pendiente';
        
        const puntos = p.puntos || 0;
        const puntosClass = puntos > 0 ? 'puntos-positivo' : 'puntos-cero';

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
              <td style="text-align: center;" class="puntos-cell ${puntosClass}">
                ${puntos}
              </td>
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
        <p>Campeonato Itaú ${new Date().getFullYear()} • Copa Libertadores</p>
        <p>Sistema de Pronósticos Deportivos</p>
      </div>
    </body>
    </html>
    `;

    // Generar PDF
    console.log('📝 Generando PDF desde HTML...');
    const options = {
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    };
    const file = { content: html };
    const pdfBuffer = await htmlPdf.generatePdf(file, options);
    console.log(`✅ PDF generado, tamaño: ${pdfBuffer.length} bytes`);

    // Enviar por email
    const nombreArchivo = `Resultados_Libertadores_Jornada_${jornadaNumero}_${new Date().toISOString().split('T')[0]}.pdf`;
    console.log(`📧 Enviando PDF por email...`);
    const resultadoEmail = await whatsappService.enviarEmailConPDF(
      pdfBuffer,
      nombreArchivo,
      jornadaNumero,
      'Libertadores'
    );

    if (!resultadoEmail.success) {
      throw new Error(resultadoEmail.mensaje);
    }

    console.log(`✅ PDF de Libertadores jornada ${jornadaNumero} generado y enviado exitosamente`);
    return true;

  } catch (error) {
    console.error('Error al generar PDF de Libertadores:', error);
    throw error;
  }
}

export default router;
