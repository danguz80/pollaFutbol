import express from "express";
import { pool } from "../db/pool.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = express.Router();

// GET /api/sudamericana/fixture/:ronda - Obtener partidos de una ronda específica
router.get('/fixture/:ronda', async (req, res) => {
  try {
    const { ronda } = req.params;
    const result = await pool.query(
      'SELECT fixture_id, fecha, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, ronda, clasificado, bonus FROM sudamericana_fixtures WHERE ronda = $1 ORDER BY clasificado ASC, fecha ASC, fixture_id ASC',
      [ronda]
    );
    res.json(Array.isArray(result.rows) ? result.rows : []);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el fixture de la ronda seleccionada.' });
  }
});

// PATCH /api/sudamericana/fixture/:ronda - Actualizar goles/bonus de los partidos de una ronda
router.patch('/fixture/:ronda', verifyToken, authorizeRoles('admin'), async (req, res) => {
  const { ronda } = req.params;
  const { partidos } = req.body;
  if (!Array.isArray(partidos) || partidos.length === 0) {
    return res.status(400).json({ error: 'No se recibieron partidos para actualizar' });
  }
  let actualizados = 0;
  try {
    for (const partido of partidos) {
      await pool.query(
        `UPDATE sudamericana_fixtures
         SET goles_local = $1, goles_visita = $2, bonus = $3
         WHERE fixture_id = $4 AND ronda = $5`,
        [
          partido.golesLocal !== "" ? partido.golesLocal : null,
          partido.golesVisita !== "" ? partido.golesVisita : null,
          partido.bonus ?? 1,
          partido.id,
          ronda
        ]
      );
      actualizados++;
    }
    res.json({ mensaje: 'Resultados y bonus guardados en la base de datos', actualizados });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar partidos Sudamericana' });
  }
});

// GET /api/sudamericana/fixture (puede ser público, acepta ?ronda=...)
router.get('/fixture', async (req, res) => {
  try {
    const { ronda } = req.query;
    let result;
    if (ronda) {
      result = await pool.query(
        'SELECT fixture_id, fecha, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, ronda, clasificado FROM sudamericana_fixtures WHERE ronda = $1 ORDER BY clasificado ASC, fecha ASC, fixture_id ASC',
        [ronda]
      );
    } else {
      result = await pool.query('SELECT fixture_id, fecha, equipo_local, equipo_visita, goles_local, goles_visita, penales_local, penales_visita, ronda, clasificado FROM sudamericana_fixtures ORDER BY clasificado ASC, fecha ASC, fixture_id ASC');
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el fixture de la Copa Sudamericana.' });
  }
});

// GET /api/sudamericana/rondas - Todas las rondas únicas
router.get('/rondas', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT ronda FROM sudamericana_fixtures ORDER BY ronda ASC');
    res.json(result.rows.map(r => r.ronda));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener las rondas de la Sudamericana' });
  }
});

export default router;
