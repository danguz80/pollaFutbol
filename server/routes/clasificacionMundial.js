import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

// GET /api/mundial-clasificacion/pronosticos - Obtener pronósticos con filtros
router.get('/pronosticos', verifyToken, async (req, res) => {
  try {
    const { usuario_id, partido_id, jornada_numero } = req.query;

    let query = `
      SELECT 
        mp.id,
        mp.usuario_id,
        u.nombre as usuario_nombre,
        u.foto_perfil as usuario_foto_perfil,
        mp.jornada_id,
        mj.numero as jornada_numero,
        mj.nombre as jornada_nombre,
        mj.cerrada as jornada_cerrada,
        mp.partido_id,
        p.equipo_local,
        p.equipo_visitante,
        p.grupo,
        p.fecha as partido_fecha,
        mp.resultado_local as pronostico_local,
        mp.resultado_visitante as pronostico_visita,
        p.resultado_local,
        p.resultado_visitante,
        p.bonus,
        mp.puntos,
        mp.creado_en as fecha_pronostico
      FROM mundial_pronosticos mp
      INNER JOIN usuarios u ON mp.usuario_id = u.id
      INNER JOIN mundial_jornadas mj ON mp.jornada_id = mj.id
      INNER JOIN mundial_partidos p ON mp.partido_id = p.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (usuario_id) {
      query += ` AND mp.usuario_id = $${paramIndex}`;
      params.push(usuario_id);
      paramIndex++;
    }

    if (partido_id) {
      query += ` AND mp.partido_id = $${paramIndex}`;
      params.push(partido_id);
      paramIndex++;
    }

    if (jornada_numero) {
      query += ` AND mj.numero = $${paramIndex}`;
      params.push(jornada_numero);
      paramIndex++;
    }

    query += ` ORDER BY mj.numero, u.nombre, p.fecha`;

    const result = await pool.query(query, params);

    // Transformar datos al formato esperado por el frontend
    const pronosticos = result.rows.map(row => ({
      id: row.id,
      usuario: {
        id: row.usuario_id,
        nombre: row.usuario_nombre,
        foto_perfil: row.usuario_foto_perfil
      },
      jornada: {
        id: row.jornada_id,
        numero: row.jornada_numero,
        nombre: row.jornada_nombre,
        cerrada: row.jornada_cerrada
      },
      partido: {
        id: row.partido_id,
        local: { nombre: row.equipo_local },
        visita: { nombre: row.equipo_visitante },
        grupo: row.grupo,
        fecha: row.partido_fecha,
        resultado: {
          local: row.resultado_local,
          visita: row.resultado_visitante
        },
        bonus: row.bonus
      },
      pronostico: {
        local: row.pronostico_local,
        visita: row.pronostico_visita
      },
      puntos: row.puntos,
      fecha_pronostico: row.fecha_pronostico
    }));

    res.json(pronosticos);
  } catch (error) {
    console.error('Error obteniendo pronósticos:', error);
    res.status(500).json({ error: 'Error obteniendo pronósticos' });
  }
});

// GET /api/mundial-clasificacion/partidos - Obtener todos los partidos
router.get('/partidos', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.equipo_local,
        p.equipo_visitante,
        p.grupo,
        p.fecha,
        mj.numero as jornada_numero,
        mj.nombre as jornada_nombre
      FROM mundial_partidos p
      INNER JOIN mundial_jornadas mj ON p.jornada_id = mj.id
      ORDER BY mj.numero, p.fecha
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo partidos:', error);
    res.status(500).json({ error: 'Error obteniendo partidos' });
  }
});

// GET /api/mundial-clasificacion/jornadas - Obtener todas las jornadas
router.get('/jornadas', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM mundial_jornadas
      ORDER BY numero
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo jornadas:', error);
    res.status(500).json({ error: 'Error obteniendo jornadas' });
  }
});

// GET /api/mundial-clasificacion/jugadores - Obtener todos los jugadores activos
router.get('/jugadores', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        nombre,
        foto_perfil
      FROM usuarios
      WHERE activo = true AND activo_mundial = true
      ORDER BY nombre
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo jugadores:', error);
    res.status(500).json({ error: 'Error obteniendo jugadores' });
  }
});

export default router;
