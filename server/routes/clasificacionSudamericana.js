import express from 'express';
import { pool } from '../db/pool.js';
import { calcularPuntajesSudamericana } from '../services/puntajesSudamericana.js';

const router = express.Router();

// GET /api/sudamericana/clasificacion/:ronda
router.get('/clasificacion/:ronda', async (req, res) => {
  const { ronda } = req.params;
  try {
    // Obtener todos los usuarios con pronósticos en esa ronda y sus nombres
    const usuariosRes = await pool.query(
      `SELECT DISTINCT u.id as usuario_id, u.nombre as nombre_usuario
       FROM pronosticos_sudamericana p
       JOIN usuarios u ON p.usuario_id = u.id
       WHERE p.ronda = $1`,
      [ronda]
    );
    const usuarios = usuariosRes.rows; // [{usuario_id, nombre_usuario}]
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
    // Calcular puntaje por usuario SOLO de la ronda seleccionada
    const clasificacion = usuarios.map(u => {
      const pronosUsuario = pronos.filter(p => p.usuario_id === u.usuario_id);
      // Pasar usuarioId para log
      const puntaje = calcularPuntajesSudamericana(fixture, pronosUsuario, resultados, u.usuario_id);
      // Sumar solo los puntos de partidos de la ronda seleccionada
      const totalRonda = puntaje.detalle.reduce((acc, d) => d.partido.ronda === ronda ? acc + d.pts : acc, 0);
      return { usuario_id: u.usuario_id, nombre_usuario: u.nombre_usuario, total: totalRonda, detalle: puntaje.detalle };
    });
    res.json(clasificacion);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/sudamericana/clasificacion - TODOS los pronósticos de eliminación directa de todos los usuarios (todas las rondas)
router.get('/clasificacion', async (req, res) => {
  try {
    // Obtener todos los usuarios con pronósticos de eliminación directa y sus nombres
    const usuariosRes = await pool.query(
      `SELECT DISTINCT u.id as usuario_id, u.nombre as nombre_usuario
       FROM pronosticos_sudamericana p
       JOIN usuarios u ON p.usuario_id = u.id`
    );
    const usuarios = usuariosRes.rows; // [{usuario_id, nombre_usuario}]
    // Obtener todo el fixture de eliminación directa
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    const fixture = fixtureRes.rows;
    // Obtener todos los pronósticos de eliminación directa
    const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana');
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
    // Calcular puntaje por usuario (todas las rondas)
    const clasificacion = usuarios.map(u => {
      const pronosUsuario = pronos.filter(p => p.usuario_id === u.usuario_id);
      const puntaje = calcularPuntajesSudamericana(fixture, pronosUsuario, resultados, u.usuario_id);
      // Sumar todos los puntos de eliminación directa
      const total = puntaje.detalle.reduce((acc, d) => acc + d.pts, 0);
      return { usuario_id: u.usuario_id, nombre_usuario: u.nombre_usuario, total, detalle: puntaje.detalle };
    });
    res.json(clasificacion);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
