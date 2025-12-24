import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// Guardar pronóstico de final VIRTUAL (J10)
router.post('/final-virtual', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { jornada_id, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita } = req.body;

    // Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      'SELECT cerrada, numero FROM libertadores_jornadas WHERE id = $1',
      [jornada_id]
    );

    if (jornadaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: 'Esta jornada está cerrada' });
    }

    if (jornadaCheck.rows[0].numero !== 10) {
      return res.status(400).json({ error: 'Este endpoint es solo para la jornada 10' });
    }

    // Guardar pronóstico de final virtual
    await pool.query(`
      INSERT INTO libertadores_pronosticos_final_virtual 
      (usuario_id, jornada_id, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (usuario_id, jornada_id)
      DO UPDATE SET 
        equipo_local = EXCLUDED.equipo_local,
        equipo_visita = EXCLUDED.equipo_visita,
        goles_local = EXCLUDED.goles_local, 
        goles_visita = EXCLUDED.goles_visita,
        penales_local = EXCLUDED.penales_local,
        penales_visita = EXCLUDED.penales_visita
    `, [usuario_id, jornada_id, equipo_local, equipo_visita, goles_local, goles_visita, penales_local || null, penales_visita || null]);

    // Determinar ganador para predicción de campeón/subcampeón
    let campeon = null;
    let subcampeon = null;
    
    if (goles_local > goles_visita) {
      campeon = equipo_local;
      subcampeon = equipo_visita;
    } else if (goles_local < goles_visita) {
      campeon = equipo_visita;
      subcampeon = equipo_local;
    } else if (penales_local !== null && penales_visita !== null) {
      if (penales_local > penales_visita) {
        campeon = equipo_local;
        subcampeon = equipo_visita;
      } else if (penales_local < penales_visita) {
        campeon = equipo_visita;
        subcampeon = equipo_local;
      }
    }
    
    // Guardar predicción de campeón/subcampeón
    if (campeon && subcampeon) {
      await pool.query(
        `INSERT INTO libertadores_predicciones_campeon (usuario_id, campeon, subcampeon)
         VALUES ($1, $2, $3)
         ON CONFLICT (usuario_id)
         DO UPDATE SET campeon = EXCLUDED.campeon, subcampeon = EXCLUDED.subcampeon, updated_at = CURRENT_TIMESTAMP`,
        [usuario_id, campeon, subcampeon]
      );
    }

    res.json({ 
      mensaje: 'Pronóstico de final virtual guardado exitosamente',
      prediccion_campeon: campeon && subcampeon ? { campeon, subcampeon } : null
    });
  } catch (error) {
    console.error('Error guardando pronóstico de final virtual:', error);
    res.status(500).json({ error: 'Error guardando pronóstico' });
  }
});

// Guardar/Actualizar pronóstico
router.post('/', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { partido_id, jornada_id, goles_local, goles_visita, penales_local, penales_visita } = req.body;

    // Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      'SELECT cerrada FROM libertadores_jornadas WHERE id = $1',
      [jornada_id]
    );

    if (jornadaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: 'Esta jornada está cerrada' });
    }

    // Insertar o actualizar pronóstico (incluyendo penales)
    await pool.query(`
      INSERT INTO libertadores_pronosticos 
      (usuario_id, partido_id, jornada_id, goles_local, goles_visita, penales_local, penales_visita)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (usuario_id, partido_id, jornada_id)
      DO UPDATE SET 
        goles_local = EXCLUDED.goles_local, 
        goles_visita = EXCLUDED.goles_visita,
        penales_local = EXCLUDED.penales_local,
        penales_visita = EXCLUDED.penales_visita
    `, [usuario_id, partido_id, jornada_id, goles_local, goles_visita, penales_local || null, penales_visita || null]);

    res.json({ mensaje: 'Pronóstico guardado exitosamente' });
  } catch (error) {
    console.error('Error guardando pronóstico:', error);
    res.status(500).json({ error: 'Error guardando pronóstico' });
  }
});

// Obtener pronósticos de un usuario para una jornada
router.get('/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { numero } = req.params;

    const result = await pool.query(`
      SELECT p.*
      FROM libertadores_pronosticos p
      JOIN libertadores_jornadas j ON p.jornada_id = j.id
      WHERE p.usuario_id = $1 AND j.numero = $2
    `, [usuario_id, numero]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo pronósticos:', error);
    res.status(500).json({ error: 'Error obteniendo pronósticos' });
  }
});

// Obtener pronóstico de final virtual (J10)
router.get('/final-virtual/:jornada_id', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { jornada_id } = req.params;

    const result = await pool.query(`
      SELECT *
      FROM libertadores_pronosticos_final_virtual
      WHERE usuario_id = $1 AND jornada_id = $2
    `, [usuario_id, jornada_id]);

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error obteniendo pronóstico de final virtual:', error);
    res.status(500).json({ error: 'Error obteniendo pronóstico' });
  }
});

// Calcular puntajes de una jornada
router.post('/calcular/:numero', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { numero } = req.params;

    const pronosticos = await pool.query(`
      SELECT p.id, p.usuario_id, p.goles_local, p.goles_visita,
             pa.goles_local AS real_local, pa.goles_visita AS real_visita,
             pa.bonus
      FROM libertadores_pronosticos p
      JOIN libertadores_partidos pa ON p.partido_id = pa.id
      JOIN libertadores_jornadas j ON p.jornada_id = j.id
      WHERE j.numero = $1
    `, [numero]);

    let actualizados = 0;

    for (const p of pronosticos.rows) {
      if (p.real_local === null || p.real_visita === null) {
        continue; // Saltar partidos sin resultado
      }

      let puntosBase = 0;
      const pred_dif = p.goles_local - p.goles_visita;
      const real_dif = p.real_local - p.real_visita;
      const pred_signo = Math.sign(pred_dif);
      const real_signo = Math.sign(real_dif);

      if (p.goles_local === p.real_local && p.goles_visita === p.real_visita) {
        puntosBase = 5; // Resultado exacto
      } else if (pred_dif === real_dif) {
        puntosBase = 3; // Diferencia exacta
      } else if (pred_signo === real_signo && real_signo !== 0) {
        puntosBase = 1; // Solo el signo
      }

      const puntos = puntosBase * (p.bonus || 1);

      await pool.query(
        'UPDATE libertadores_pronosticos SET puntos = $1 WHERE id = $2',
        [puntos, p.id]
      );

      actualizados++;
    }

    res.json({ mensaje: 'Puntajes calculados', actualizados });
  } catch (error) {
    console.error('Error calculando puntajes:', error);
    res.status(500).json({ error: 'Error calculando puntajes' });
  }
});

// Ranking general
router.get('/ranking', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id, u.nombre, u.foto_perfil,
        COALESCE(SUM(p.puntos), 0) as puntaje_total
      FROM usuarios u
      LEFT JOIN libertadores_pronosticos p ON p.usuario_id = u.id
      LEFT JOIN libertadores_usuarios_activos lua ON lua.usuario_id = u.id
      WHERE lua.activo = true OR lua.usuario_id IS NULL
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntaje_total DESC, u.nombre
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ranking:', error);
    res.status(500).json({ error: 'Error obteniendo ranking' });
  }
});

// Ranking de una jornada
router.get('/ranking/jornada/:numero', async (req, res) => {
  try {
    const { numero } = req.params;

    const result = await pool.query(`
      SELECT 
        u.id, u.nombre, u.foto_perfil,
        SUM(p.puntos) as puntaje_jornada
      FROM usuarios u
      JOIN libertadores_pronosticos p ON p.usuario_id = u.id
      JOIN libertadores_jornadas j ON p.jornada_id = j.id
      WHERE j.numero = $1
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY puntaje_jornada DESC, u.nombre
    `, [numero]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo ranking de jornada:', error);
    res.status(500).json({ error: 'Error obteniendo ranking de jornada' });
  }
});

// Borrar todos los pronósticos de un usuario para una jornada específica
router.delete('/jornada/:numero', verifyToken, async (req, res) => {
  try {
    const usuario_id = req.usuario.id;
    const { numero } = req.params;

    // Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      'SELECT id, cerrada FROM libertadores_jornadas WHERE numero = $1',
      [numero]
    );

    if (jornadaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: 'No puedes borrar pronósticos de una jornada cerrada' });
    }

    const jornadaId = jornadaCheck.rows[0].id;

    // Borrar todos los pronósticos del usuario para esta jornada
    const result = await pool.query(
      'DELETE FROM libertadores_pronosticos WHERE usuario_id = $1 AND jornada_id = $2',
      [usuario_id, jornadaId]
    );

    res.json({ 
      mensaje: 'Pronósticos borrados exitosamente',
      cantidad: result.rowCount
    });
  } catch (error) {
    console.error('Error borrando pronósticos:', error);
    res.status(500).json({ error: 'Error borrando pronósticos' });
  }
});

export default router;
