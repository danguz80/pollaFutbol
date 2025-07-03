import express from 'express';
import { pool } from '../db/pool.js';
import { calcularPuntajesSudamericana } from '../services/puntajesSudamericana.js';

const router = express.Router();

// GET /api/sudamericana/clasificacion/:ronda
router.get('/clasificacion/:ronda', async (req, res) => {
  const { ronda } = req.params;
  try {
    // Obtener todos los usuarios con pronósticos en esa ronda
    const usuariosRes = await pool.query(
      `SELECT DISTINCT usuario_id FROM pronosticos_sudamericana WHERE ronda = $1`,
      [ronda]
    );
    const usuarios = usuariosRes.rows.map(u => u.usuario_id);
    // Obtener fixture y resultados
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures WHERE ronda = $1', [ronda]);
    const fixture = fixtureRes.rows;
    // Obtener todos los pronósticos de esa ronda
    const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE ronda = $1', [ronda]);
    const pronos = pronosRes.rows;
    // Obtener resultados oficiales (de fixture)
    const resultados = fixture.map(f => ({
      fixture_id: f.fixture_id,
      goles_local: f.goles_local,
      goles_visita: f.goles_visita,
      ganador: f.ganador,
      equipo_local: f.equipo_local,
      equipo_visita: f.equipo_visita,
      ronda: f.ronda,
      bonus: f.bonus
    }));
    // Calcular puntaje por usuario
    const clasificacion = usuarios.map(uid => {
      const pronosUsuario = pronos.filter(p => p.usuario_id === uid);
      const puntaje = calcularPuntajesSudamericana(fixture, pronosUsuario, resultados);
      return { usuario_id: uid, total: puntaje.total, detalle: puntaje.detalle };
    });
    res.json(clasificacion);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
