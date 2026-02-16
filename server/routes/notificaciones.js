import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

// GET: Obtener notificaciones pendientes para el usuario actual
// Devuelve solo la notificación MÁS RECIENTE por competencia que el usuario no ha visto
router.get('/pendientes', verifyToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    
    // Obtener la notificación más reciente de cada competencia que el usuario NO ha visto
    const notificaciones = await pool.query(`
      WITH ultimas_notificaciones AS (
        SELECT DISTINCT ON (competencia)
          id,
          competencia,
          tipo,
          tipo_notificacion,
          jornada_numero,
          ganadores,
          mensaje,
          icono,
          url,
          fecha_calculo
        FROM notificaciones
        ORDER BY competencia, fecha_calculo DESC
      )
      SELECT 
        un.id,
        un.competencia,
        un.tipo,
        un.tipo_notificacion,
        un.jornada_numero,
        un.ganadores,
        un.mensaje,
        un.icono,
        un.url,
        un.fecha_calculo
      FROM ultimas_notificaciones un
      WHERE NOT EXISTS (
        SELECT 1 
        FROM notificaciones_leidas nl 
        WHERE nl.notificacion_id = un.id 
          AND nl.usuario_id = $1
      )
      ORDER BY un.fecha_calculo DESC
    `, [usuarioId]);
    
    res.json(notificaciones.rows);
    
  } catch (error) {
    console.error('Error obteniendo notificaciones pendientes:', error);
    res.status(500).json({ error: 'Error obteniendo notificaciones pendientes' });
  }
});

// POST: Marcar una notificación como vista
router.post('/:notificacionId/marcar-vista', verifyToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { notificacionId } = req.params;
    
    console.log(`📝 Marcando notificación ${notificacionId} como vista para usuario ${usuarioId}`);
    
    await pool.query(
      `INSERT INTO notificaciones_leidas (usuario_id, notificacion_id)
       VALUES ($1, $2)
       ON CONFLICT (usuario_id, notificacion_id) DO NOTHING`,
      [usuarioId, notificacionId]
    );
    
    console.log(`✅ Notificación ${notificacionId} marcada como vista`);
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error marcando notificación como vista:', error);
    res.status(500).json({ error: 'Error marcando notificación como vista' });
  }
});

// GET: Obtener TODAS las notificaciones pendientes (para el dropdown)
router.get('/todas', verifyToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const limit = parseInt(req.query.limit) || 20;
    
    const notificaciones = await pool.query(`
      SELECT 
        n.id,
        n.competencia,
        n.tipo,
        n.tipo_notificacion,
        n.jornada_numero,
        n.ganadores,
        n.mensaje,
        n.icono,
        n.url,
        n.fecha_calculo,
        nl.fecha_vista IS NOT NULL as leida
      FROM notificaciones n
      LEFT JOIN notificaciones_leidas nl ON nl.notificacion_id = n.id AND nl.usuario_id = $1
      ORDER BY n.fecha_calculo DESC
      LIMIT $2
    `, [usuarioId, limit]);
    
    res.json({ notificaciones: notificaciones.rows });
    
  } catch (error) {
    console.error('Error obteniendo todas las notificaciones:', error);
    res.status(500).json({ error: 'Error obteniendo todas las notificaciones' });
  }
});

// GET: Contar notificaciones no leídas
router.get('/contador', verifyToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    
    const result = await pool.query(`
      SELECT COUNT(*) as total
      FROM notificaciones n
      WHERE NOT EXISTS (
        SELECT 1 
        FROM notificaciones_leidas nl 
        WHERE nl.notificacion_id = n.id 
          AND nl.usuario_id = $1
      )
    `, [usuarioId]);
    
    res.json({ contador: parseInt(result.rows[0].total) });
    
  } catch (error) {
    console.error('Error contando notificaciones:', error);
    res.status(500).json({ error: 'Error contando notificaciones' });
  }
});

// POST: Crear notificación (solo admin)
router.post('/crear', verifyToken, async (req, res) => {
  try {
    // Verificar que sea admin
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden crear notificaciones' });
    }
    
    const { 
      competencia, 
      tipo_notificacion, 
      mensaje, 
      icono, 
      url, 
      jornada_numero,
      datos_adicionales 
    } = req.body;
    
    const result = await pool.query(
      `INSERT INTO notificaciones (competencia, tipo_notificacion, mensaje, icono, url, jornada_numero, datos_adicionales)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [competencia, tipo_notificacion, mensaje, icono || '📢', url, jornada_numero, datos_adicionales ? JSON.stringify(datos_adicionales) : null]
    );
    
    console.log(`✅ Notificación creada con ID: ${result.rows[0].id}`);
    res.json({ success: true, id: result.rows[0].id });
    
  } catch (error) {
    console.error('Error creando notificación:', error);
    res.status(500).json({ error: 'Error creando notificación' });
  }
});

// GET: Obtener todas las notificaciones (solo admin) - para gestión
router.get('/admin', verifyToken, async (req, res) => {
  try {
    // Verificar que sea admin
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden acceder' });
    }
    
    const limit = parseInt(req.query.limit) || 100;
    
    const notificaciones = await pool.query(`
      SELECT 
        n.id,
        n.competencia,
        n.tipo,
        n.tipo_notificacion,
        n.jornada_numero,
        n.ganadores,
        n.mensaje,
        n.icono,
        n.url,
        n.fecha_calculo,
        n.datos_adicionales,
        COUNT(nl.usuario_id) as lecturas
      FROM notificaciones n
      LEFT JOIN notificaciones_leidas nl ON nl.notificacion_id = n.id
      GROUP BY n.id, n.competencia, n.tipo, n.tipo_notificacion, n.jornada_numero, 
               n.ganadores, n.mensaje, n.icono, n.url, n.fecha_calculo, n.datos_adicionales
      ORDER BY n.fecha_calculo DESC
      LIMIT $1
    `, [limit]);
    
    res.json({ notificaciones: notificaciones.rows });
    
  } catch (error) {
    console.error('Error obteniendo notificaciones para admin:', error);
    res.status(500).json({ error: 'Error obteniendo notificaciones' });
  }
});

// DELETE: Eliminar notificación específica (solo admin)
router.delete('/:notificacionId', verifyToken, async (req, res) => {
  try {
    // Verificar que sea admin
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden eliminar notificaciones' });
    }
    
    const { notificacionId } = req.params;
    
    console.log(`🗑️ Eliminando notificación ${notificacionId}`);
    
    // Primero eliminar las lecturas asociadas (por CASCADE debería hacerse automático, pero por seguridad)
    await pool.query(
      `DELETE FROM notificaciones_leidas WHERE notificacion_id = $1`,
      [notificacionId]
    );
    
    // Luego eliminar la notificación
    const result = await pool.query(
      `DELETE FROM notificaciones WHERE id = $1 RETURNING id`,
      [notificacionId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }
    
    console.log(`✅ Notificación ${notificacionId} eliminada exitosamente`);
    res.json({ success: true, message: 'Notificación eliminada' });
    
  } catch (error) {
    console.error('Error eliminando notificación:', error);
    res.status(500).json({ error: 'Error eliminando notificación' });
  }
});

// DELETE: Eliminar múltiples notificaciones (solo admin)
router.post('/eliminar-multiples', verifyToken, async (req, res) => {
  try {
    // Verificar que sea admin
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo administradores pueden eliminar notificaciones' });
    }
    
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de IDs' });
    }
    
    console.log(`🗑️ Eliminando ${ids.length} notificaciones`);
    
    // Primero eliminar las lecturas asociadas
    await pool.query(
      `DELETE FROM notificaciones_leidas WHERE notificacion_id = ANY($1)`,
      [ids]
    );
    
    // Luego eliminar las notificaciones
    const result = await pool.query(
      `DELETE FROM notificaciones WHERE id = ANY($1)`,
      [ids]
    );
    
    console.log(`✅ ${result.rowCount} notificaciones eliminadas exitosamente`);
    res.json({ success: true, eliminadas: result.rowCount });
    
  } catch (error) {
    console.error('Error eliminando notificaciones múltiples:', error);
    res.status(500).json({ error: 'Error eliminando notificaciones' });
  }
});

export default router;
