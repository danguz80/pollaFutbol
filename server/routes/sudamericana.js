import express from "express";
import { pool } from "../db/pool.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { reemplazarSiglasPorNombres, calcularAvanceSiglas } from '../utils/sudamericanaSiglas.js';

const router = express.Router();

// GET /api/sudamericana/fixture/:ronda - Obtener partidos de una ronda específica, con nombres reales según avance de cruces y pronósticos del usuario
router.get('/fixture/:ronda', async (req, res) => {
  try {
    const { ronda } = req.params;
    const usuarioId = req.query.usuarioId || null;
    // 1. Obtener fixture completo
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    const fixture = fixtureRes.rows;
    // 2. Si hay usuario, obtener sus pronósticos
    let pronos = [];
    if (usuarioId) {
      const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1', [usuarioId]);
      pronos = pronosRes.rows;
    }
    // 3. Calcular avance de cruces (si hay usuario, usa sus pronósticos)
    const dicSiglas = calcularAvanceSiglas(fixture, pronos);
    // 4. Filtrar partidos de la ronda y reemplazar nombres
    const partidosRonda = fixture.filter(f => f.ronda === ronda);
    const partidosConNombres = reemplazarSiglasPorNombres(partidosRonda, dicSiglas);
    res.json(Array.isArray(partidosConNombres) ? partidosConNombres : []);
  } catch (err) {
    res.json([]); // Siempre un array
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
         SET goles_local = $1, goles_visita = $2, penales_local = $3, penales_visita = $4, bonus = $5
         WHERE fixture_id = $6 AND ronda = $7`,
        [
          partido.golesLocal !== "" ? partido.golesLocal : null,
          partido.golesVisita !== "" ? partido.golesVisita : null,
          partido.penalesLocal !== undefined && partido.penalesLocal !== "" ? partido.penalesLocal : null,
          partido.penalesVisita !== undefined && partido.penalesVisita !== "" ? partido.penalesVisita : null,
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

// GET /api/sudamericana/fixture (puede ser público, acepta ?ronda=...&usuarioId=...)
router.get('/fixture', async (req, res) => {
  try {
    const { ronda, usuarioId } = req.query;
    // 1. Obtener fixture completo
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    const fixture = fixtureRes.rows;
    // 2. Si hay usuario, obtener sus pronósticos
    let pronos = [];
    if (usuarioId) {
      const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1', [usuarioId]);
      pronos = pronosRes.rows;
    }
    // 3. Calcular avance de cruces (si hay usuario, usa sus pronósticos)
    const dicSiglas = calcularAvanceSiglas(fixture, pronos);
    // 4. Filtrar partidos (por ronda si corresponde) y reemplazar nombres
    let partidos = fixture;
    if (ronda) partidos = partidos.filter(f => f.ronda === ronda);
    const partidosConNombres = reemplazarSiglasPorNombres(partidos, dicSiglas);
    res.json(Array.isArray(partidosConNombres) ? partidosConNombres : []);
  } catch (err) {
    res.json([]); // Siempre un array
  }
});

// GET /api/sudamericana/rondas - Todas las rondas únicas
router.get('/rondas', async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT ronda FROM sudamericana_fixtures ORDER BY ronda ASC');
    res.json(Array.isArray(result.rows) ? result.rows.map(r => r.ronda) : []);
  } catch (err) {
    res.json([]); // Siempre un array
  }
});

export default router;
