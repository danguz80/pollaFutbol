import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { checkRole } from '../middleware/checkRole.js';

const router = express.Router();

// GET /api/mundial-ganadores-jornada/titulos - Obtener usuarios con más títulos (ganadores de jornadas)
router.get('/titulos', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COUNT(mgj.id) as titulos
      FROM mundial_ganadores_jornada mgj
      INNER JOIN usuarios u ON u.id = mgj.usuario_id
      WHERE mgj.posicion = 1
      GROUP BY u.id, u.nombre, u.foto_perfil
      HAVING COUNT(mgj.id) > 0
      ORDER BY titulos DESC, u.nombre ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo títulos:', error);
    res.status(500).json({ error: 'Error obteniendo títulos' });
  }
});

// GET /api/mundial-ganadores-jornada/:jornadaNumero - Obtener ganadores de una jornada específica
router.get('/:jornadaNumero', verifyToken, async (req, res) => {
  try {
    const { jornadaNumero } = req.params;

    const result = await pool.query(`
      SELECT 
        mgj.id,
        mgj.usuario_id,
        u.nombre,
        u.foto_perfil,
        mgj.puntos,
        mgj.posicion,
        mgj.jornada_numero
      FROM mundial_ganadores_jornada mgj
      INNER JOIN usuarios u ON u.id = mgj.usuario_id
      WHERE mgj.jornada_numero = $1
      ORDER BY mgj.posicion ASC
    `, [jornadaNumero]);

    // Agrupar ganadores por posición (manejo de empates)
    const ganadores = [];
    const empatePrimero = result.rows.filter(g => g.posicion === 1);
    
    if (empatePrimero.length > 0) {
      ganadores.push(...empatePrimero);
    }

    res.json({
      jornada: parseInt(jornadaNumero),
      ganadores: ganadores
    });
  } catch (error) {
    console.error('Error obteniendo ganadores de jornada:', error);
    res.status(500).json({ error: 'Error obteniendo ganadores de jornada' });
  }
});

// POST /api/mundial-ganadores-jornada/:jornadaNumero - Calcular y guardar ganadores de una jornada
router.post('/:jornadaNumero', verifyToken, checkRole('admin'), async (req, res) => {
  try {
    const { jornadaNumero } = req.params;
    const jornadaNum = parseInt(jornadaNumero);

    // Verificar que la jornada existe y está cerrada
    const jornadaCheck = await pool.query(`
      SELECT id, cerrada FROM mundial_jornadas WHERE numero = $1
    `, [jornadaNum]);

    if (jornadaCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Jornada no encontrada' });
    }

    if (!jornadaCheck.rows[0].cerrada) {
      return res.status(400).json({ error: 'La jornada debe estar cerrada para calcular ganadores' });
    }

    // Calcular ranking de la jornada
    const rankingQuery = `
      SELECT 
        u.id,
        u.nombre,
        u.foto_perfil,
        COALESCE(puntos_partidos.total, 0) as puntos_jornada
      FROM usuarios u
      LEFT JOIN (
        SELECT mp.usuario_id, SUM(mp.puntos) as total
        FROM mundial_pronosticos mp
        INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
        WHERE mj.numero = $1
        GROUP BY mp.usuario_id
      ) puntos_partidos ON u.id = puntos_partidos.usuario_id
      WHERE puntos_partidos.total IS NOT NULL AND puntos_partidos.total > 0
      ORDER BY puntos_jornada DESC, u.nombre ASC
    `;

    const rankingResult = await pool.query(rankingQuery, [jornadaNum]);

    if (rankingResult.rows.length === 0) {
      return res.status(404).json({ error: 'No hay pronósticos para esta jornada' });
    }

    // Determinar posiciones (manejo de empates)
    let posicion = 1;
    let puntajeAnterior = null;
    const ganadores = [];

    for (let i = 0; i < rankingResult.rows.length; i++) {
      const usuario = rankingResult.rows[i];
      const puntos = parseInt(usuario.puntos_jornada);

      if (puntajeAnterior !== null && puntos < puntajeAnterior) {
        posicion = i + 1;
      }

      ganadores.push({
        usuario_id: usuario.id,
        puntos: puntos,
        posicion: posicion
      });

      puntajeAnterior = puntos;
    }

    // Borrar ganadores anteriores de esta jornada
    await pool.query(
      'DELETE FROM mundial_ganadores_jornada WHERE jornada_numero = $1',
      [jornadaNum]
    );

    // Guardar ganadores (todos, no solo el primero)
    for (const ganador of ganadores) {
      await pool.query(`
        INSERT INTO mundial_ganadores_jornada (usuario_id, jornada_numero, puntos, posicion)
        VALUES ($1, $2, $3, $4)
      `, [ganador.usuario_id, jornadaNum, ganador.puntos, ganador.posicion]);
    }

    // Crear notificación
    const ganadoresPrimero = ganadores.filter(g => g.posicion === 1);
    const nombresGanadores = await pool.query(`
      SELECT nombre, foto_perfil FROM usuarios WHERE id = ANY($1::int[])
    `, [ganadoresPrimero.map(g => g.usuario_id)]);

    await pool.query(`
      INSERT INTO notificaciones (competencia, tipo, titulo, mensaje, metadata, creado_en)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      'mundial',
      'jornada',
      `Jornada ${jornadaNum} - Mundial 2026`,
      ganadoresPrimero.length === 1 
        ? `🏆 Ganador: ${nombresGanadores.rows[0].nombre}` 
        : `🏆 Ganadores: ${nombresGanadores.rows.map(r => r.nombre).join(', ')}`,
      JSON.stringify({
        jornada: jornadaNum,
        ganadores: nombresGanadores.rows.map(r => ({
          nombre: r.nombre,
          foto_perfil: r.foto_perfil
        }))
      })
    ]);

    res.json({
      mensaje: 'Ganadores calculados y guardados exitosamente',
      jornada: jornadaNum,
      ganadores: ganadoresPrimero.length,
      top3: ganadores.slice(0, 3)
    });

  } catch (error) {
    console.error('Error calculando ganadores:', error);
    res.status(500).json({ error: 'Error calculando ganadores', details: error.message });
  }
});

export default router;
