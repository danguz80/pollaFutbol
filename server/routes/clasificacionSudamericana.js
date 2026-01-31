import express from 'express';
import { pool } from '../db/pool.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();

// GET /api/sudamericana-clasificacion/pronosticos - Obtener pronósticos con filtros
router.get('/pronosticos', verifyToken, async (req, res) => {
  try {
    const { usuario_id, partido_id, jornada_numero } = req.query;

    let query = `
      SELECT 
        sp.id,
        sp.usuario_id,
        u.nombre as usuario_nombre,
        u.foto_perfil as usuario_foto_perfil,
        sj.id as jornada_id,
        sj.numero as jornada_numero,
        sj.nombre as jornada_nombre,
        sj.cerrada as jornada_cerrada,
        sp.partido_id,
        p.nombre_local,
        p.nombre_visita,
        el.pais as pais_local,
        ev.pais as pais_visita,
        el.grupo as grupo_local,
        ev.grupo as grupo_visita,
        p.fecha as partido_fecha,
        p.tipo_partido,
        sp.goles_local as pronostico_local,
        sp.goles_visita as pronostico_visita,
        sp.penales_local as pronostico_penales_local,
        sp.penales_visita as pronostico_penales_visita,
        p.goles_local as resultado_local,
        p.goles_visita as resultado_visita,
        p.bonus,
        sp.puntos,
        sp.created_at as fecha_pronostico,
        spfv.equipo_local as final_virtual_local,
        spfv.equipo_visita as final_virtual_visita,
        spfv.goles_local as final_virtual_goles_local,
        spfv.goles_visita as final_virtual_goles_visita,
        spfv.penales_local as final_virtual_penales_local,
        spfv.penales_visita as final_virtual_penales_visita
      FROM sudamericana_pronosticos sp
      INNER JOIN usuarios u ON sp.usuario_id = u.id
      INNER JOIN sudamericana_partidos p ON sp.partido_id = p.id
      INNER JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      LEFT JOIN sudamericana_equipos el ON p.nombre_local = el.nombre
      LEFT JOIN sudamericana_equipos ev ON p.nombre_visita = ev.nombre
      LEFT JOIN sudamericana_pronosticos_final_virtual spfv ON sp.usuario_id = spfv.usuario_id 
        AND sj.id = spfv.jornada_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (usuario_id && !isNaN(usuario_id)) {
      query += ` AND sp.usuario_id = $${paramIndex}`;
      params.push(parseInt(usuario_id));
      paramIndex++;
    }

    if (partido_id && !isNaN(partido_id)) {
      query += ` AND sp.partido_id = $${paramIndex}`;
      params.push(parseInt(partido_id));
      paramIndex++;
    }

    if (jornada_numero && !isNaN(jornada_numero)) {
      query += ` AND sj.numero = $${paramIndex}`;
      params.push(parseInt(jornada_numero));
      paramIndex++;
    }

    query += ` ORDER BY sj.numero DESC, p.id ASC, u.nombre ASC`;

    const result = await pool.query(query, params);

    const pronosticosFormateados = result.rows.map(row => ({
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
        local: {
          nombre: row.nombre_local,
          pais: row.pais_local
        },
        visita: {
          nombre: row.nombre_visita,
          pais: row.pais_visita
        },
        grupo: row.grupo_local || row.grupo_visita,
        fecha: row.partido_fecha,
        tipo_partido: row.tipo_partido,
        bonus: row.bonus,
        resultado: {
          local: row.resultado_local,
          visita: row.resultado_visita
        }
      },
      pronostico: {
        local: row.pronostico_local,
        visita: row.pronostico_visita,
        penales_local: row.pronostico_penales_local,
        penales_visita: row.pronostico_penales_visita
      },
      puntos: row.puntos,
      fecha_pronostico: row.fecha_pronostico,
      final_virtual_local: row.final_virtual_local,
      final_virtual_visita: row.final_virtual_visita,
      final_virtual_goles_local: row.final_virtual_goles_local,
      final_virtual_goles_visita: row.final_virtual_goles_visita,
      final_virtual_penales_local: row.final_virtual_penales_local,
      final_virtual_penales_visita: row.final_virtual_penales_visita
    }));

    res.json(pronosticosFormateados);
  } catch (error) {
    console.error('Error obteniendo pronósticos:', error);
    res.status(500).json({ error: 'Error al obtener pronósticos' });
  }
});

// GET /api/sudamericana-clasificacion/partidos
router.get('/partidos', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.id,
        p.nombre_local,
        p.nombre_visita,
        p.fecha,
        sj.numero as jornada_numero,
        sj.nombre as jornada_nombre,
        el.grupo as grupo_local,
        ev.grupo as grupo_visita
      FROM sudamericana_partidos p
      INNER JOIN sudamericana_jornadas sj ON p.jornada_id = sj.id
      LEFT JOIN sudamericana_equipos el ON p.nombre_local = el.nombre
      LEFT JOIN sudamericana_equipos ev ON p.nombre_visita = ev.nombre
      ORDER BY sj.numero, p.fecha
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo partidos:', error);
    res.status(500).json({ error: 'Error al obtener partidos' });
  }
});

// GET /api/sudamericana-clasificacion/jornadas
router.get('/jornadas', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, numero, nombre, cerrada, activa, fecha_inicio, fecha_cierre
      FROM sudamericana_jornadas
      ORDER BY numero
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo jornadas:', error);
    res.status(500).json({ error: 'Error al obtener jornadas' });
  }
});

// GET /api/sudamericana-clasificacion/jugadores
router.get('/jugadores', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT 
        u.id,
        u.nombre,
        u.foto_perfil
      FROM usuarios u
      INNER JOIN sudamericana_pronosticos sp ON u.id = sp.usuario_id
      WHERE u.activo_sudamericana = true
      ORDER BY u.nombre
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo jugadores:', error);
    res.status(500).json({ error: 'Error al obtener jugadores' });
  }
});

// GET /api/sudamericana-clasificacion/puntos-clasificacion - Obtener puntos de clasificación
router.get('/puntos-clasificacion', verifyToken, async (req, res) => {
  try {
    const { jornada_numero, usuario_id } = req.query;

    let query = `
      SELECT 
        pc.id,
        pc.usuario_id,
        u.nombre as usuario_nombre,
        pc.jornada_numero,
        pc.equipo_clasificado,
        pc.equipo_oficial,
        pc.fase_clasificado,
        pc.puntos
      FROM sudamericana_puntos_clasificacion pc
      INNER JOIN usuarios u ON pc.usuario_id = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (jornada_numero && !isNaN(jornada_numero)) {
      query += ` AND pc.jornada_numero = $${paramIndex}`;
      params.push(parseInt(jornada_numero));
      paramIndex++;
    }

    if (usuario_id && !isNaN(usuario_id)) {
      query += ` AND pc.usuario_id = $${paramIndex}`;
      params.push(parseInt(usuario_id));
      paramIndex++;
    }

    query += ` ORDER BY pc.usuario_id, 
      CASE pc.fase_clasificado
        WHEN 'FINALISTA' THEN 1
        WHEN 'CAMPEON' THEN 2
        WHEN 'SUBCAMPEON' THEN 3
        ELSE 4
      END, pc.id`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo puntos clasificación:', error);
    res.status(500).json({ error: 'Error al obtener puntos de clasificación' });
  }
});

export default router;
