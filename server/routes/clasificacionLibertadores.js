import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';
import { authorizeRoles } from '../middleware/authorizeRoles.js';

const router = express.Router();

// GET /api/libertadores-clasificacion/pronosticos - Obtener pronósticos con filtros
router.get('/pronosticos', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { usuario_id, partido_id, jornada_numero } = req.query;

    let query = `
      SELECT 
        lp.id,
        lp.usuario_id,
        u.nombre as usuario_nombre,
        lp.jornada_id,
        lj.numero as jornada_numero,
        lj.nombre as jornada_nombre,
        lp.partido_id,
        p.nombre_local,
        p.nombre_visita,
        el.pais as pais_local,
        ev.pais as pais_visita,
        el.grupo as grupo_local,
        ev.grupo as grupo_visita,
        p.fecha as partido_fecha,
        lp.goles_local as pronostico_local,
        lp.goles_visita as pronostico_visita,
        p.goles_local as resultado_local,
        p.goles_visita as resultado_visita,
        lp.puntos,
        lp.created_at as fecha_pronostico
      FROM libertadores_pronosticos lp
      INNER JOIN usuarios u ON lp.usuario_id = u.id
      INNER JOIN libertadores_jornadas lj ON lp.jornada_id = lj.id
      INNER JOIN libertadores_partidos p ON lp.partido_id = p.id
      LEFT JOIN libertadores_equipos el ON p.nombre_local = el.nombre
      LEFT JOIN libertadores_equipos ev ON p.nombre_visita = ev.nombre
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    // Filtro por usuario_id
    if (usuario_id && !isNaN(usuario_id)) {
      query += ` AND lp.usuario_id = $${paramIndex}`;
      params.push(parseInt(usuario_id));
      paramIndex++;
    }

    // Filtro por partido
    if (partido_id && !isNaN(partido_id)) {
      query += ` AND lp.partido_id = $${paramIndex}`;
      params.push(parseInt(partido_id));
      paramIndex++;
    }

    // Filtro por jornada
    if (jornada_numero && !isNaN(jornada_numero)) {
      query += ` AND lj.numero = $${paramIndex}`;
      params.push(parseInt(jornada_numero));
      paramIndex++;
    }

    query += ` ORDER BY lj.numero DESC, p.fecha DESC, u.nombre ASC`;

    const result = await pool.query(query, params);

    // Formatear datos
    const pronosticos = result.rows.map(row => ({
      id: row.id,
      usuario: {
        id: row.usuario_id,
        nombre: row.usuario_nombre
      },
      jornada: {
        id: row.jornada_id,
        numero: row.jornada_numero,
        nombre: row.jornada_nombre
      },
      partido: {
        id: row.partido_id,
        fecha: row.partido_fecha,
        grupo: row.grupo_local,
        local: {
          nombre: row.nombre_local,
          pais: row.pais_local
        },
        visita: {
          nombre: row.nombre_visita,
          pais: row.pais_visita
        },
        resultado: {
          local: row.resultado_local,
          visita: row.resultado_visita
        }
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

// GET /api/libertadores-clasificacion/partidos - Obtener lista de partidos para el filtro
router.get('/partidos', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.fecha,
        p.nombre_local,
        p.nombre_visita,
        el.pais as pais_local,
        ev.pais as pais_visita,
        el.grupo as grupo,
        lj.numero as jornada_numero
      FROM libertadores_partidos p
      LEFT JOIN libertadores_equipos el ON p.nombre_local = el.nombre
      LEFT JOIN libertadores_equipos ev ON p.nombre_visita = ev.nombre
      LEFT JOIN libertadores_jornadas lj ON p.jornada_id = lj.id
      ORDER BY lj.numero DESC, p.fecha DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo partidos:', error);
    res.status(500).json({ error: 'Error obteniendo partidos' });
  }
});

// GET /api/libertadores-clasificacion/jornadas - Obtener lista de jornadas para el filtro
router.get('/jornadas', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, numero, nombre
      FROM libertadores_jornadas
      ORDER BY numero
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo jornadas:', error);
    res.status(500).json({ error: 'Error obteniendo jornadas' });
  }
});

// GET /api/libertadores-clasificacion/jugadores - Obtener lista de jugadores con pronósticos
router.get('/jugadores', verifyToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT u.id, u.nombre
      FROM libertadores_pronosticos lp
      INNER JOIN usuarios u ON lp.usuario_id = u.id
      ORDER BY u.nombre ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo jugadores:', error);
    res.status(500).json({ error: 'Error obteniendo jugadores' });
  }
});

export default router;
