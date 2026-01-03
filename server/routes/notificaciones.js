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
          jornada_numero,
          ganadores,
          mensaje,
          fecha_calculo
        FROM notificaciones_ganadores
        ORDER BY competencia, fecha_calculo DESC
      )
      SELECT 
        un.id,
        un.competencia,
        un.tipo,
        un.jornada_numero,
        un.ganadores,
        un.mensaje,
        un.fecha_calculo
      FROM ultimas_notificaciones un
      WHERE NOT EXISTS (
        SELECT 1 
        FROM notificaciones_vistas nv 
        WHERE nv.notificacion_id = un.id 
          AND nv.usuario_id = $1
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
      `INSERT INTO notificaciones_vistas (usuario_id, notificacion_id)
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

export default router;
