import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';
import { recalcularTodo, determinarGanador, asegurarEquiposGrupoFijos, calcularStandingsGrupo, obtenerDetalleCompletoTorneo } from '../utils/copaGinoPerezScoring.js';
import { generarPdfFinalCopaGinoPerezBuffer } from '../utils/pdfFinalCopaGinoPerez.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secreto-temporal';

async function verificarAccesoJugador(req, res, next) {
  if (req.usuario.rol === 'admin') return next();
  const check = await pool.query('SELECT activo_copa_gino_perez FROM usuarios WHERE id = $1', [req.usuario.id]);
  if (check.rowCount === 0 || check.rows[0].activo_copa_gino_perez !== true) {
    return res.status(403).json({ error: 'No tienes acceso a la Copa Gino Pérez' });
  }
  next();
}

// Autenticación opcional: si viene un token válido lo decodifica en
// req.usuario, pero nunca bloquea la petición si no viene o es inválido
// (a diferencia de verifyToken). Se usa en endpoints públicos que, además,
// le dan más acceso al admin si está identificado.
async function autenticacionOpcional(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const result = await pool.query('SELECT id, nombre, rol FROM usuarios WHERE id = $1', [decoded.id]);
    if (result.rowCount > 0) req.usuario = result.rows[0];
  } catch (err) {
    // Token ausente/ inválido: seguir sin req.usuario, no es un error acá.
  }
  next();
}

// GET /api/copa-gino-perez/equipos
router.get('/equipos', async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, nombre, grupo, orden FROM copa_gino_perez_equipos ORDER BY grupo, orden`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo equipos de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error obteniendo equipos' });
  }
});

// GET /api/copa-gino-perez/partidos
router.get('/partidos', async (req, res) => {
  try {
    await asegurarEquiposGrupoFijos();
    const result = await pool.query(`
      SELECT p.id, p.grupo, p.fase, p.descripcion_local, p.descripcion_visita,
             p.equipo_local_id, el.nombre as equipo_local_nombre,
             p.equipo_visita_id, ev.nombre as equipo_visita_nombre,
             p.goles_local, p.goles_visita, p.ganador_id, p.jugado
      FROM copa_gino_perez_partidos p
      LEFT JOIN copa_gino_perez_equipos el ON el.id = p.equipo_local_id
      LEFT JOIN copa_gino_perez_equipos ev ON ev.id = p.equipo_visita_id
      ORDER BY p.id
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo partidos de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error obteniendo partidos' });
  }
});

// Helper: ¿el admin ya cerró los pronósticos? (equivalente a "cerrar
// jornada" en los demás torneos: bloquea la edición y revela los
// pronósticos de todos).
async function pronosticosCerrados() {
  const result = await pool.query(`SELECT cerrado FROM copa_gino_perez_config WHERE id = 1`);
  return result.rows[0]?.cerrado === true;
}

// GET /api/copa-gino-perez/config
router.get('/config', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cerrado, fecha_cierre, bonus_grupo1_partido, bonus_grupo2_partido,
             bonus_final_partido, bonus_final_multiplicador
      FROM copa_gino_perez_config WHERE id = 1
    `);
    const config = result.rows[0] || {};
    res.json({
      cerrado: config.cerrado === true,
      fecha_cierre: config.fecha_cierre || null,
      bonus_grupo1_partido: config.bonus_grupo1_partido || null,
      bonus_grupo2_partido: config.bonus_grupo2_partido || null,
      bonus_final_partido: config.bonus_final_partido || null,
      bonus_final_multiplicador: config.bonus_final_multiplicador || 2
    });
  } catch (error) {
    console.error('Error obteniendo config de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error obteniendo configuración' });
  }
});

// PATCH /api/copa-gino-perez/admin/bonus (Admin) - fija globalmente cuál es
// el partido con bonus de cada grupo y de la fase final (los jugadores solo
// pueden VER cuál es, no elegirlo).
router.patch('/admin/bonus', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { bonus_grupo1_partido, bonus_grupo2_partido, bonus_final_partido, bonus_final_multiplicador } = req.body;
    if (![1,2,3].includes(bonus_grupo1_partido) || ![4,5,6].includes(bonus_grupo2_partido)
      || ![7,8,9].includes(bonus_final_partido) || ![2,3].includes(bonus_final_multiplicador)) {
      return res.status(400).json({ error: 'Selección de bonus inválida' });
    }
    await pool.query(`
      UPDATE copa_gino_perez_config SET
        bonus_grupo1_partido = $1,
        bonus_grupo2_partido = $2,
        bonus_final_partido = $3,
        bonus_final_multiplicador = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `, [bonus_grupo1_partido, bonus_grupo2_partido, bonus_final_partido, bonus_final_multiplicador]);
    await recalcularTodo();
    res.json({ mensaje: '✅ Partidos con bonus actualizados y puntajes recalculados' });
  } catch (error) {
    console.error('Error actualizando bonus de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error actualizando los partidos con bonus' });
  }
});

// PATCH /api/copa-gino-perez/admin/cerrar (Admin) - cierra/reabre los pronósticos
router.patch('/admin/cerrar', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { cerrado } = req.body;
    if (typeof cerrado !== 'boolean') {
      return res.status(400).json({ error: 'Falta el campo cerrado (true/false)' });
    }
    await pool.query(
      `UPDATE copa_gino_perez_config SET cerrado = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
      [cerrado]
    );
    res.json({ mensaje: cerrado ? '🔒 Pronósticos cerrados' : '🔓 Pronósticos reabiertos', cerrado });
  } catch (error) {
    console.error('Error cerrando pronósticos de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error actualizando el cierre de pronósticos' });
  }
});

// PATCH /api/copa-gino-perez/admin/fecha-cierre (Admin) - programa (o quita)
// una fecha/hora de cierre automático de los pronósticos.
router.patch('/admin/fecha-cierre', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { fecha_cierre } = req.body;
    if (fecha_cierre === undefined) {
      return res.status(400).json({ error: 'Se requiere el campo fecha_cierre (puede ser null para quitarla)' });
    }
    await pool.query(
      `UPDATE copa_gino_perez_config SET fecha_cierre = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
      [fecha_cierre]
    );
    res.json({
      mensaje: fecha_cierre ? '✅ Fecha de cierre programada' : '✅ Fecha de cierre eliminada',
      fecha_cierre
    });
  } catch (error) {
    console.error('Error programando fecha de cierre de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error programando la fecha de cierre' });
  }
});

// GET /api/copa-gino-perez/participantes - quién ya envió su pronóstico
// completo (fase de grupos + fase final) y quién todavía no, sin revelar los
// pronósticos en sí. Público: se usa para mostrarlo mientras el pronóstico
// sigue abierto, igual que en los demás torneos.
router.get('/participantes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.nombre, u.foto_perfil,
             COALESCE(ex.enviado, false) as enviado
      FROM usuarios u
      LEFT JOIN copa_gino_perez_predicciones_extra ex ON ex.usuario_id = u.id
      WHERE u.rol != 'admin' AND u.activo_copa_gino_perez = true
      ORDER BY u.nombre ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo participantes de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error obteniendo participantes' });
  }
});

// GET /api/copa-gino-perez/pronosticos-todos - pronósticos de todos los
// usuarios. Para un jugador normal, solo disponible una vez que el admin
// cerró los pronósticos; el admin puede verlos en cualquier momento.
router.get('/pronosticos-todos', autenticacionOpcional, async (req, res) => {
  try {
    const esAdmin = req.usuario?.rol === 'admin';
    const cerrado = await pronosticosCerrados();
    if (!cerrado && !esAdmin) {
      return res.status(403).json({ error: 'Los pronósticos todavía no están cerrados' });
    }

    const usuariosRes = await pool.query(`
      SELECT id, nombre, foto_perfil
      FROM usuarios
      WHERE rol != 'admin' AND activo_copa_gino_perez = true
      ORDER BY nombre ASC
    `);
    const pronosticosRes = await pool.query(`SELECT usuario_id, partido_id, goles_local, goles_visita, puntos FROM copa_gino_perez_pronosticos`);

    const usuarios = usuariosRes.rows.map(u => {
      const pronosticos = {};
      pronosticosRes.rows
        .filter(p => p.usuario_id === u.id)
        .forEach(p => { pronosticos[p.partido_id] = { goles_local: p.goles_local, goles_visita: p.goles_visita, puntos: p.puntos }; });
      return { id: u.id, nombre: u.nombre, foto_perfil: u.foto_perfil, pronosticos };
    });

    res.json({ cerrado, usuarios });
  } catch (error) {
    console.error('Error obteniendo pronósticos de todos en Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error obteniendo los pronósticos' });
  }
});

// GET /api/copa-gino-perez/pronostico - pronóstico propio (9 partidos + extras)
router.get('/pronostico', verifyToken, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const pronosticos = await pool.query(
      `SELECT partido_id, goles_local, goles_visita, puntos_base, bonus_multiplicador, puntos
       FROM copa_gino_perez_pronosticos WHERE usuario_id = $1 ORDER BY partido_id`,
      [usuarioId]
    );
    const extra = await pool.query(
      `SELECT puntos_posiciones_grupos, puntos_posiciones_finales, grupos_guardados, final_guardado, enviado
       FROM copa_gino_perez_predicciones_extra WHERE usuario_id = $1`,
      [usuarioId]
    );
    const cerrado = await pronosticosCerrados();
    res.json({
      pronosticos: pronosticos.rows,
      extra: extra.rows[0] || null,
      editable: !cerrado
    });
  } catch (error) {
    console.error('Error obteniendo pronóstico de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error obteniendo pronóstico' });
  }
});

// POST /api/copa-gino-perez/pronostico/grupos - guardar los 6 pronósticos de
// fase de grupos. Al guardarse, la app ya puede calcular (en base a estos
// mismos pronósticos del usuario) qué equipo le corresponde a cada partido
// de la fase final según su propio bracket virtual.
router.post('/pronostico/grupos', verifyToken, verificarAccesoJugador, async (req, res) => {
  try {
    if (await pronosticosCerrados()) {
      return res.status(403).json({ error: 'Los pronósticos ya están cerrados, no se puede modificar' });
    }

    const usuarioId = req.usuario.id;
    const { predicciones } = req.body;

    if (!Array.isArray(predicciones) || predicciones.length !== 6) {
      return res.status(400).json({ error: 'Se requieren pronósticos para los 6 partidos de fase de grupos' });
    }
    for (const p of predicciones) {
      if (![1,2,3,4,5,6].includes(p.partido_id) || p.goles_local == null || p.goles_visita == null
        || p.goles_local < 0 || p.goles_visita < 0) {
        return res.status(400).json({ error: 'Pronóstico inválido' });
      }
    }

    for (const p of predicciones) {
      await pool.query(`
        INSERT INTO copa_gino_perez_pronosticos (usuario_id, partido_id, goles_local, goles_visita, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (usuario_id, partido_id)
        DO UPDATE SET goles_local = $3, goles_visita = $4, updated_at = CURRENT_TIMESTAMP
      `, [usuarioId, p.partido_id, p.goles_local, p.goles_visita]);
    }

    await pool.query(`
      INSERT INTO copa_gino_perez_predicciones_extra (usuario_id, grupos_guardados, updated_at)
      VALUES ($1, true, CURRENT_TIMESTAMP)
      ON CONFLICT (usuario_id) DO UPDATE SET
        grupos_guardados = true,
        updated_at = CURRENT_TIMESTAMP
    `, [usuarioId]);

    res.json({ mensaje: '✅ Pronóstico de fase de grupos guardado exitosamente' });
  } catch (error) {
    console.error('Error guardando pronóstico de grupos de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error guardando pronóstico de fase de grupos' });
  }
});

// POST /api/copa-gino-perez/pronostico/final - guardar los 3 pronósticos de
// fase final. Requiere haber guardado antes el pronóstico de fase de grupos
// (de ahí sale, según el propio pronóstico del usuario, contra quién juega
// cada partido de la fase final).
router.post('/pronostico/final', verifyToken, verificarAccesoJugador, async (req, res) => {
  try {
    if (await pronosticosCerrados()) {
      return res.status(403).json({ error: 'Los pronósticos ya están cerrados, no se puede modificar' });
    }

    const usuarioId = req.usuario.id;
    const { predicciones } = req.body;

    const extraActual = await pool.query(
      `SELECT grupos_guardados FROM copa_gino_perez_predicciones_extra WHERE usuario_id = $1`,
      [usuarioId]
    );
    if (extraActual.rowCount === 0 || !extraActual.rows[0].grupos_guardados) {
      return res.status(400).json({ error: 'Primero debes guardar tu pronóstico de fase de grupos' });
    }

    if (!Array.isArray(predicciones) || predicciones.length !== 3) {
      return res.status(400).json({ error: 'Se requieren pronósticos para los 3 partidos de fase final' });
    }
    for (const p of predicciones) {
      if (![7,8,9].includes(p.partido_id) || p.goles_local == null || p.goles_visita == null
        || p.goles_local < 0 || p.goles_visita < 0) {
        return res.status(400).json({ error: 'Pronóstico inválido' });
      }
    }

    for (const p of predicciones) {
      await pool.query(`
        INSERT INTO copa_gino_perez_pronosticos (usuario_id, partido_id, goles_local, goles_visita, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (usuario_id, partido_id)
        DO UPDATE SET goles_local = $3, goles_visita = $4, updated_at = CURRENT_TIMESTAMP
      `, [usuarioId, p.partido_id, p.goles_local, p.goles_visita]);
    }

    await pool.query(`
      UPDATE copa_gino_perez_predicciones_extra SET
        final_guardado = true,
        enviado = true,
        updated_at = CURRENT_TIMESTAMP
      WHERE usuario_id = $1
    `, [usuarioId]);

    res.json({ mensaje: '✅ Pronóstico de fase final guardado exitosamente' });
  } catch (error) {
    console.error('Error guardando pronóstico final de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error guardando pronóstico de fase final' });
  }
});

// PUT /api/copa-gino-perez/admin/partidos/:id - ingresar resultado real (Admin)
router.put('/admin/partidos/:id', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const partidoId = parseInt(req.params.id);
  const { goles_local, goles_visita, ganador_id } = req.body;

  if (!Number.isInteger(partidoId) || partidoId < 1 || partidoId > 9) {
    return res.status(400).json({ error: 'Partido inválido' });
  }
  if (goles_local == null || goles_visita == null || goles_local < 0 || goles_visita < 0) {
    return res.status(400).json({ error: 'Marcador inválido' });
  }

  try {
    const actual = await pool.query(`SELECT * FROM copa_gino_perez_partidos WHERE id = $1`, [partidoId]);
    if (actual.rowCount === 0) {
      return res.status(404).json({ error: 'Partido no encontrado' });
    }
    const partido = actual.rows[0];
    if (!partido.equipo_local_id || !partido.equipo_visita_id) {
      return res.status(400).json({ error: 'Los equipos de este partido todavía no están definidos' });
    }

    const requiereGanador = [7, 8, 9].includes(partidoId);
    const esEmpate = goles_local === goles_visita;
    let ganadorFinal = null;
    if (esEmpate && requiereGanador) {
      if (![partido.equipo_local_id, partido.equipo_visita_id].includes(ganador_id)) {
        return res.status(400).json({ error: 'En caso de empate debes indicar el equipo ganador (ej. por penales)' });
      }
      ganadorFinal = ganador_id;
    }

    await pool.query(
      `UPDATE copa_gino_perez_partidos SET goles_local = $1, goles_visita = $2, ganador_id = $3, jugado = true WHERE id = $4`,
      [goles_local, goles_visita, ganadorFinal, partidoId]
    );

    const resultado = await recalcularTodo();
    res.json({ mensaje: '✅ Resultado guardado y puntajes recalculados', estado: resultado });
  } catch (error) {
    console.error('Error guardando resultado de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error guardando resultado' });
  }
});

// POST /api/copa-gino-perez/admin/recalcular - forzar recálculo (Admin)
router.post('/admin/recalcular', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const resultado = await recalcularTodo();
    res.json({ mensaje: '✅ Puntajes recalculados', estado: resultado });
  } catch (error) {
    console.error('Error recalculando Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error recalculando puntajes' });
  }
});

// GET /api/copa-gino-perez/clasificacion
router.get('/clasificacion', async (req, res) => {
  try {
    await asegurarEquiposGrupoFijos();
    const equiposRes = await pool.query(`SELECT id, nombre, grupo, orden FROM copa_gino_perez_equipos ORDER BY grupo, orden`);
    const partidosRes = await pool.query(`SELECT * FROM copa_gino_perez_partidos ORDER BY id`);
    const equipos = equiposRes.rows;
    const partidos = partidosRes.rows;

    const equiposG1 = equipos.filter(e => e.grupo === 1);
    const equiposG2 = equipos.filter(e => e.grupo === 2);
    const partidosG1 = partidos.filter(p => [1,2,3].includes(p.id));
    const partidosG2 = partidos.filter(p => [4,5,6].includes(p.id));

    const standingsG1 = calcularStandingsGrupo(equiposG1, partidosG1);
    const standingsG2 = calcularStandingsGrupo(equiposG2, partidosG2);

    const p7 = partidos.find(p => p.id === 7);
    const p8 = partidos.find(p => p.id === 8);
    const p9 = partidos.find(p => p.id === 9);

    let posicionesFinales = null;
    const finalCompleto = [p7, p8, p9].every(p => p.jugado && determinarGanador(p));
    if (finalCompleto) {
      const gan7 = determinarGanador(p7);
      const gan8 = determinarGanador(p8);
      const gan9 = determinarGanador(p9);
      const nombre = id => equipos.find(e => e.id === id)?.nombre;
      posicionesFinales = {
        1: nombre(gan7),
        2: nombre(gan7 === p7.equipo_local_id ? p7.equipo_visita_id : p7.equipo_local_id),
        3: nombre(gan8),
        4: nombre(gan8 === p8.equipo_local_id ? p8.equipo_visita_id : p8.equipo_local_id),
        5: nombre(gan9),
        6: nombre(gan9 === p9.equipo_local_id ? p9.equipo_visita_id : p9.equipo_local_id)
      };
    }

    res.json({
      grupo1: standingsG1,
      grupo2: standingsG2,
      partidos,
      posicionesFinales
    });
  } catch (error) {
    console.error('Error obteniendo clasificación de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error obteniendo clasificación' });
  }
});

// GET /api/copa-gino-perez/estadisticas - ranking de usuarios
router.get('/estadisticas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id, u.nombre, u.foto_perfil,
        COALESCE(pr.total_partidos, 0) as puntos_partidos,
        COALESCE(ex.puntos_posiciones_grupos, 0) as puntos_posiciones_grupos,
        COALESCE(ex.puntos_posiciones_finales, 0) as puntos_posiciones_finales,
        COALESCE(pr.total_partidos, 0) + COALESCE(ex.puntos_posiciones_grupos, 0) + COALESCE(ex.puntos_posiciones_finales, 0) as puntos_totales
      FROM usuarios u
      LEFT JOIN (
        SELECT usuario_id, SUM(puntos) as total_partidos
        FROM copa_gino_perez_pronosticos
        GROUP BY usuario_id
      ) pr ON pr.usuario_id = u.id
      LEFT JOIN copa_gino_perez_predicciones_extra ex ON ex.usuario_id = u.id
      WHERE u.rol != 'admin' AND u.activo_copa_gino_perez = true
      ORDER BY puntos_totales DESC, u.nombre ASC
    `);
    res.json({ ranking: result.rows });
  } catch (error) {
    console.error('Error obteniendo estadísticas de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// GET /api/copa-gino-perez/puntuacion/reglas
router.get('/puntuacion/reglas', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM copa_gino_perez_puntuacion ORDER BY id`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo reglas de puntuación de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error obteniendo reglas de puntuación' });
  }
});

// PUT /api/copa-gino-perez/puntuacion/reglas (Admin)
router.put('/puntuacion/reglas', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { reglas } = req.body;
    if (!Array.isArray(reglas)) {
      return res.status(400).json({ error: 'Se requiere un array de reglas' });
    }
    for (const regla of reglas) {
      if (regla.id && regla.puntos !== undefined) {
        await pool.query('UPDATE copa_gino_perez_puntuacion SET puntos = $1 WHERE id = $2', [regla.puntos, regla.id]);
      }
    }
    await recalcularTodo();
    res.json({ mensaje: '✅ Reglas de puntuación actualizadas y puntajes recalculados' });
  } catch (error) {
    console.error('Error actualizando reglas de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error actualizando reglas de puntuación' });
  }
});

// POST /api/copa-gino-perez/admin/pdf-final (Admin) - PDF con el detalle
// completo del torneo: partidos, bonos, puntos, posiciones virtual-vs-real
// y ranking final de cada jugador.
router.post('/admin/pdf-final', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    console.log('📄 Generando PDF Final de Copa Gino Pérez...');
    const detalle = await obtenerDetalleCompletoTorneo();
    const pdfBuffer = await generarPdfFinalCopaGinoPerezBuffer(detalle);
    const nombreArchivo = `Resultados_CopaGinoPerez_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generando PDF Final de Copa Gino Pérez:', error);
    res.status(500).json({ error: 'Error generando PDF final', details: error.message });
  }
});

export default router;
