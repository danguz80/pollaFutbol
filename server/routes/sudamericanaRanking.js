import express from 'express';
import { pool } from '../db/pool.js';
import { calcularPuntajesSudamericana } from '../services/puntajesSudamericana.js';
import { basePoints } from '../utils/sudamericanaBasePoints.js';
import { basePlayers } from '../utils/sudamericanaBasePlayers.js';

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
    // Obtener fotos de perfil de todos los jugadores base
    const fotosRes = await pool.query(
      `SELECT nombre, foto_perfil, id as usuario_id FROM usuarios WHERE upper(nombre) = ANY($1)`,
      [basePlayers.map(j => j.nombre.toUpperCase())]
    );
    const fotosMap = Object.fromEntries(fotosRes.rows.map(f => [f.nombre.toUpperCase(), f]));
    // Mapear todos los jugadores base, aunque no tengan pronósticos
    const ranking = basePlayers.map(j => {
      const nombreKey = j.nombre.toUpperCase();
      const user = usuarios.find(u => (u.nombre_usuario || '').toUpperCase() === nombreKey);
      const foto = fotosMap[nombreKey]?.foto_perfil || null;
      const usuario_id = fotosMap[nombreKey]?.usuario_id || (user && user.usuario_id) || null;
      const base = basePoints[nombreKey] || 0;
      const puntos_sudamericana = user ? (calcularPuntajesSudamericana(fixture, pronos.filter(p => p.usuario_id === user.usuario_id), resultados, user.usuario_id).total) : 0;
      return {
        usuario_id,
        nombre_usuario: j.nombre,
        foto_perfil: foto,
        total: base + puntos_sudamericana,
        base,
        puntos_sudamericana
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
