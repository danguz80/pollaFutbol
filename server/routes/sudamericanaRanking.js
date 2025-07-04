import express from 'express';
import { pool } from '../db/pool.js';
import { calcularPuntajesSudamericana } from '../services/puntajesSudamericana.js';
import { basePoints } from '../utils/sudamericanaBasePoints.js';

const router = express.Router();

// GET /api/sudamericana/ranking
router.get('/ranking', async (req, res) => {
  try {
    // Obtener todos los usuarios con pronósticos en Sudamericana
    const usuariosRes = await pool.query(
      `SELECT DISTINCT u.id as usuario_id, u.nombre as nombre_usuario, u.foto_perfil
       FROM pronosticos_sudamericana p
       JOIN usuarios u ON p.usuario_id = u.id`
    );
    const usuarios = usuariosRes.rows;
    // Obtener fixture y resultados
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    const fixture = fixtureRes.rows;
    // Obtener todos los pronósticos
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
    // Calcular puntaje total por usuario (puntaje base + puntos obtenidos)
    const ranking = usuarios.map(u => {
      const pronosUsuario = pronos.filter(p => p.usuario_id === u.usuario_id);
      const puntaje = calcularPuntajesSudamericana(fixture, pronosUsuario, resultados, u.usuario_id);
      // Buscar puntaje base por nombre (case-insensitive)
      const base = basePoints[(u.nombre_usuario || '').toUpperCase()] || 0;
      return {
        usuario_id: u.usuario_id,
        nombre_usuario: u.nombre_usuario,
        foto_perfil: u.foto_perfil,
        total: base + puntaje.total,
        base,
        puntos_sudamericana: puntaje.total
      };
    });
    // Ordenar por puntaje descendente y nombre ascendente
    ranking.sort((a, b) => b.total - a.total || a.nombre_usuario.localeCompare(b.nombre_usuario));
    res.json(ranking);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
