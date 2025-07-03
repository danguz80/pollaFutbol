// Endpoint para puntajes de Sudamericana
import express from 'express';
import pool from '../db/pool.js';
import { calcularPuntajesSudamericana } from '../services/puntajesSudamericana.js';

const router = express.Router();

// GET /api/sudamericana/puntajes/:usuarioId
router.get('/puntajes/:usuarioId', async (req, res) => {
  const { usuarioId } = req.params;
  try {
    // Obtener fixture
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    // Obtener pronósticos del usuario
    const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1', [usuarioId]);
    // Obtener resultados oficiales (pueden ser los mismos que fixture si ya están cargados)
    // Aquí asumimos que los resultados oficiales están en sudamericana_fixtures
    const resultados = fixtureRes.rows.map(f => ({
      fixture_id: f.fixture_id,
      goles_local: f.goles_local,
      goles_visita: f.goles_visita,
      ganador: f.ganador,
      equipo_local: f.equipo_local,
      equipo_visita: f.equipo_visita,
      ronda: f.ronda
    }));
    const puntaje = calcularPuntajesSudamericana(fixtureRes.rows, pronosRes.rows, resultados);
    res.json(puntaje);
  } catch (error) {
    console.error('Error calculando puntajes Sudamericana:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
