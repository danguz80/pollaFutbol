import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';
import { generarPDFCompleto } from './ganadores.js';

const router = express.Router();

// IMPORTANTE: Rutas específicas (/acumulado) ANTES de rutas con parámetros (/:jornadaNumero)

// POST: Calcular y guardar ganador del ranking acumulado TOTAL (todas las jornadas)
router.post('/acumulado', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    // Verificar/crear tabla ganadores_acumulado (NO hacer DROP - mantener histórico)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ganadores_acumulado (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
        puntaje INTEGER NOT NULL,
        fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Tabla ganadores_acumulado verificada');
    
    // Obtener el ranking acumulado TOTAL (todas las jornadas)
    const rankingResult = await pool.query(`
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(SUM(p.puntos), 0) as puntos_acumulados
      FROM usuarios u
      LEFT JOIN pronosticos p ON u.id = p.usuario_id
      WHERE u.activo_torneo_nacional = true
      GROUP BY u.id, u.nombre, u.foto_perfil
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
    await pool.query('DELETE FROM ganadores_acumulado');
    
    // Guardar el TOP 3 en la tabla (no solo el ganador)
    for (let i = 0; i < top3.length; i++) {
      await pool.query(
        `INSERT INTO ganadores_acumulado (usuario_id, puntaje)
         VALUES ($1, $2)`,
        [top3[i].id, parseInt(top3[i].puntos_acumulados, 10)]
      );
    }
    
    // Registrar notificación para usuarios
    try {
      const mensajeNotificacion = ganadores.length === 1 
        ? `🏆 EL CAMPEÓN DEL RANKING ACUMULADO DEL TORNEO NACIONAL ES: ${ganadores[0].nombre.toUpperCase()}`
        : `🏆 LOS CAMPEONES DEL RANKING ACUMULADO DEL TORNEO NACIONAL SON: ${ganadores.map(g => g.nombre.toUpperCase()).join(', ')}`;
      
      // Primero eliminar notificaciones anteriores del acumulado
      await pool.query(
        `DELETE FROM notificaciones 
         WHERE competencia = $1 AND tipo = $2`,
        ['torneo_nacional', 'acumulado']
      );
      
      // Luego insertar la nueva notificación
      const resultNotif = await pool.query(
        `INSERT INTO notificaciones (competencia, tipo, tipo_notificacion, jornada_numero, ganadores, mensaje, icono, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          'torneo_nacional', 
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
          '/clasificacion'
        ]
      );
      
      console.log(`✅ Notificación acumulado creada con ID: ${resultNotif.rows[0].id}`);
    } catch (errorNotif) {
      console.error('❌ Error creando notificación acumulado:', errorNotif);
      // No fallar la petición completa si la notificación falla
    }
    
    // Retornar el TOP 3 con sus posiciones
    res.json({
      tipo: 'acumulado',
      ganadores: top3.map((g, index) => ({
        nombre: g.nombre,
        foto_perfil: g.foto_perfil,
        puntaje: parseInt(g.puntos_acumulados, 10),
        posicion: index + 1
      })),
      mensaje: `🏆 TOP 3 DEL RANKING ACUMULADO`
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

// GET: Obtener ganadores del ranking acumulado (TOP 3)
router.get('/acumulado', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ga.puntaje,
        ga.fecha_calculo,
        u.id as usuario_id,
        u.nombre,
        u.foto_perfil
      FROM ganadores_acumulado ga
      INNER JOIN usuarios u ON ga.usuario_id = u.id
      ORDER BY ga.puntaje DESC, u.nombre ASC
    `);
    
    if (result.rows.length === 0) {
      return res.json({ ganadores: [], mensaje: null });
    }
    
    const ganadores = result.rows.map((row, index) => ({
      nombre: row.nombre,
      foto_perfil: row.foto_perfil,
      puntaje: row.puntaje,
      posicion: index + 1
    }));
    
    const mensaje = ganadores.length === 1 
      ? `🏆 EL CAMPEÓN DEL RANKING ACUMULADO ES: ${ganadores[0].nombre.toUpperCase()}`
      : `🏆 TOP 3 DEL RANKING ACUMULADO`;
    
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

// GET: Obtener ganadores de una jornada
router.get('/:jornadaNumero', async (req, res) => {
  try {
    const { jornadaNumero } = req.params;

    // Obtener ganadores guardados
    const result = await pool.query(
      `SELECT 
        gj.jornada_id,
        gj.jugador_id as usuario_id,
        gj.puntaje,
        u.nombre,
        u.foto_perfil
      FROM ganadores_jornada gj
      JOIN jornadas j ON gj.jornada_id = j.id
      JOIN usuarios u ON gj.jugador_id = u.id
      WHERE j.numero = $1
      ORDER BY gj.puntaje DESC, u.nombre ASC`,
      [jornadaNumero]
    );

    if (result.rows.length === 0) {
      return res.json({
        jornada: parseInt(jornadaNumero),
        ganadores: [],
        mensaje: `No se han calculado ganadores para la jornada ${jornadaNumero}`
      });
    }

    const ganadores = result.rows;
    const mensaje = ganadores.length === 1
      ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre}`
      : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')}`;

    res.json({
      jornada: parseInt(jornadaNumero),
      ganadores,
      mensaje
    });

  } catch (error) {
    console.error('❌ Error obteniendo ganadores de la jornada:', error);
    res.status(500).json({ error: 'Error obteniendo ganadores de la jornada' });
  }
});

// POST: Calcular y guardar ganadores de una jornada específica
router.post('/:jornadaNumero', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { jornadaNumero } = req.params;

    console.log(`\n🏆 Calculando ganadores para jornada ${jornadaNumero}...`);

    // 1. Verificar que la jornada existe
    const jornadaResult = await pool.query(
      'SELECT id, numero, cerrada FROM jornadas WHERE numero = $1',
      [jornadaNumero]
    );

    if (jornadaResult.rows.length === 0) {
      return res.status(404).json({ error: `La jornada ${jornadaNumero} no existe` });
    }

    const jornada = jornadaResult.rows[0];
    console.log(`✓ Jornada encontrada: ID ${jornada.id}, Cerrada: ${jornada.cerrada}`);

    // 2. Verificar que todos los partidos tienen resultados
    const partidosPendientes = await pool.query(
      `SELECT COUNT(*) as count
       FROM partidos p
       WHERE p.jornada_id = $1
       AND (p.goles_local IS NULL OR p.goles_visita IS NULL)`,
      [jornada.id]
    );

    if (parseInt(partidosPendientes.rows[0].count) > 0) {
      return res.status(400).json({
        error: `La jornada ${jornadaNumero} tiene ${partidosPendientes.rows[0].count} partido(s) sin resultado`
      });
    }

    console.log(`✓ Todos los partidos tienen resultados`);

    // 3. Calcular puntos de todos los usuarios activos en torneo nacional
    const rankingResult = await pool.query(
      `SELECT 
        u.id as usuario_id,
        u.nombre,
        u.foto_perfil,
        COALESCE(SUM(p.puntos), 0) as puntaje
      FROM usuarios u
      LEFT JOIN pronosticos p ON u.id = p.usuario_id
      LEFT JOIN partidos pa ON p.partido_id = pa.id
      WHERE pa.jornada_id = $1
        AND u.activo_torneo_nacional = true
        AND p.puntos IS NOT NULL
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntaje DESC, u.nombre ASC`,
      [jornada.id]
    );

    if (rankingResult.rows.length === 0) {
      return res.status(400).json({
        error: `No hay pronósticos para la jornada ${jornadaNumero}`
      });
    }

    console.log(`✓ Ranking calculado: ${rankingResult.rows.length} participantes`);

    // 4. Identificar ganadores (máximo puntaje)
    const maxPuntaje = rankingResult.rows[0].puntaje;
    const ganadores = rankingResult.rows.filter(r => r.puntaje === maxPuntaje);

    console.log(`✓ Puntaje máximo: ${maxPuntaje}`);
    console.log(`✓ Ganadores: ${ganadores.map(g => g.nombre).join(', ')}`);

    // 5. Borrar ganadores anteriores de esta jornada (si existen)
    await pool.query(
      'DELETE FROM ganadores_jornada WHERE jornada_id = $1',
      [jornada.id]
    );

    // 6. Insertar los nuevos ganadores
    for (const ganador of ganadores) {
      await pool.query(
        `INSERT INTO ganadores_jornada (jornada_id, jugador_id, puntaje, acierto)
         VALUES ($1, $2, $3, true)`,
        [jornada.id, ganador.usuario_id, ganador.puntaje]
      );
    }

    // 7. Actualizar el campo 'ganadores' en la tabla jornadas (para la página GanadoresJornada.jsx)
    const nombresGanadores = ganadores.map(g => g.nombre);
    await pool.query(
      'UPDATE jornadas SET ganadores = $1 WHERE id = $2',
      [nombresGanadores, jornada.id]
    );

    console.log(`✅ Ganadores guardados exitosamente`);
    console.log(`✅ Campo 'ganadores' actualizado en tabla jornadas\n`);

    // 7.5. Registrar notificación para usuarios
    console.log(`🔔 Creando notificación para jornada ${jornadaNumero}...`);
    try {
      const mensajeNotificacion = ganadores.length === 1 
        ? `El ganador de la jornada ${jornadaNumero} del Torneo Nacional es: ${ganadores[0].nombre}`
        : `Los ganadores de la jornada ${jornadaNumero} del Torneo Nacional son: ${ganadores.map(g => g.nombre).join(', ')}`;
      
      // Primero eliminar notificaciones anteriores de esta jornada
      await pool.query(
        `DELETE FROM notificaciones 
         WHERE competencia = $1 AND tipo = $2 AND jornada_numero = $3`,
        ['torneo_nacional', 'jornada', jornadaNumero]
      );
      
      // Luego insertar la nueva notificación
      const resultNotif = await pool.query(
        `INSERT INTO notificaciones (competencia, tipo, tipo_notificacion, jornada_numero, ganadores, mensaje, icono, url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          'torneo_nacional', 
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
          `/clasificacion?jornada=${jornadaNumero}`
        ]
      );
      
      console.log(`✅ Notificación creada con ID: ${resultNotif.rows[0].id}`);
    } catch (errorNotif) {
      console.error('❌ Error creando notificación:', errorNotif);
      // No fallar la petición completa si la notificación falla
    }

    // 8. Generar PDF con resultados y enviarlo por email
    let pdfGenerado = false;
    let pdfError = null;
    try {
      await generarPDFCompleto(jornadaNumero);
      pdfGenerado = true;
      console.log(`✅ PDF generado y enviado para jornada ${jornadaNumero}`);
    } catch (error) {
      pdfError = error.message;
      console.error(`❌ Error generando PDF para jornada ${jornadaNumero}:`, error);
      // No fallar la petición completa si el PDF falla
    }

    const mensaje = ganadores.length === 1
      ? `El ganador de la jornada ${jornadaNumero} es: ${ganadores[0].nombre} con ${maxPuntaje} puntos${pdfGenerado ? '. PDF enviado por email.' : ''}`
      : `Los ganadores de la jornada ${jornadaNumero} son: ${ganadores.map(g => g.nombre).join(', ')} con ${maxPuntaje} puntos${pdfGenerado ? '. PDF enviado por email.' : ''}`;

    res.json({
      jornada: parseInt(jornadaNumero),
      ganadores,
      mensaje,
      pdfGenerado,
      ...(pdfError && { pdfError })
    });

  } catch (error) {
    console.error('❌ Error calculando ganadores de la jornada:', error);
    res.status(500).json({
      error: 'Error calculando ganadores de la jornada',
      detalles: error.message
    });
  }
});

export default router;
