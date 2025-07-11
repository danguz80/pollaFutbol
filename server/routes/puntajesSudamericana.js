// POST /api/sudamericana/guardar-clasificados (usuario guarda sus pronósticos de clasificados)
router.post('/guardar-clasificados', verifyToken, async (req, res) => {
  // Espera body: { ronda: string, clasificados: array de nombres }
  const { ronda, clasificados } = req.body;
  const usuarioId = req.usuario.id;
  if (!ronda || !Array.isArray(clasificados)) {
    return res.status(400).json({ error: 'Faltan datos: ronda o clasificados' });
  }
  try {
    await pool.query(
      `INSERT INTO clasif_sud_pron (usuario_id, ronda, clasificados)
       VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id, ronda) DO UPDATE SET clasificados = EXCLUDED.clasificados`,
      [usuarioId, ronda, JSON.stringify(clasificados)]
    );
    res.json({ ok: true, message: 'Pronóstico de clasificados guardado', ronda, clasificados });
  } catch (err) {
    console.error('Error guardando pronóstico de clasificados:', err);
    res.status(500).json({ error: 'Error guardando pronóstico de clasificados' });
  }
});

// POST /api/sudamericana/guardar-clasificados-reales (admin guarda los clasificados reales)
router.post('/guardar-clasificados-reales', verifyToken, authorizeRoles ? authorizeRoles('admin') : (req, res, next) => next(), async (req, res) => {
  // Espera body: { ronda: string, clasificados: array de nombres }
  const { ronda, clasificados } = req.body;
  if (!ronda || !Array.isArray(clasificados)) {
    return res.status(400).json({ error: 'Faltan datos: ronda o clasificados' });
  }
  try {
    await pool.query(
      `INSERT INTO clasif_sud (ronda, clasificados)
       VALUES ($1, $2)
       ON CONFLICT (ronda) DO UPDATE SET clasificados = EXCLUDED.clasificados`,
      [ronda, JSON.stringify(clasificados)]
    );
    res.json({ ok: true, message: 'Clasificados reales guardados', ronda, clasificados });
  } catch (err) {
    console.error('Error guardando clasificados reales:', err);
    res.status(500).json({ error: 'Error guardando clasificados reales' });
  }
});
// Endpoint para puntajes de Sudamericana
import express from 'express';
import { pool } from '../db/pool.js';
import { calcularPuntajesSudamericana } from '../services/puntajesSudamericana.js';
import { verifyToken } from '../middleware/verifyToken.js';

const router = express.Router();


// GET /api/sudamericana/puntajes/:usuarioId
router.get('/puntajes/:usuarioId', verifyToken, async (req, res) => {
  const { usuarioId } = req.params;

  // Verificar que el usuarioId de la URL coincida con el usuario autenticado
  if (req.usuario.id !== parseInt(usuarioId)) {
    return res.status(403).json({ error: "No autorizado: solo puedes consultar tus propios puntajes" });
  }

  // Verificar que el usuario tenga activo_sudamericana = true
  if (!req.usuario.activo_sudamericana) {
    return res.status(403).json({ 
      error: "No tienes autorización para consultar puntajes de Sudamericana. Contacta al administrador." 
    });
  }
  try {
    // Obtener fixture (partidos)
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    // Obtener pronósticos del usuario
    const pronosRes = await pool.query('SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1', [usuarioId]);

    // Obtener puntos por partidos (lógica existente)
    const resultados = fixtureRes.rows.map(f => ({
      fixture_id: f.fixture_id,
      goles_local: f.goles_local,
      goles_visita: f.goles_visita,
      ganador: f.ganador,
      equipo_local: f.equipo_local,
      equipo_visita: f.equipo_visita,
      ronda: f.ronda
    }));
    const puntajePartidos = calcularPuntajesSudamericana(fixtureRes.rows, pronosRes.rows, resultados);

    // === CLASIFICADOS ===
    // 1. Obtener todas las rondas únicas
    const rondasRes = await pool.query('SELECT DISTINCT ronda FROM sudamericana_fixtures ORDER BY ronda ASC');
    const rondas = rondasRes.rows.map(r => r.ronda);

    // 2. Obtener pronósticos de clasificados del usuario
    const pronClasifRes = await pool.query(
      'SELECT ronda, clasificados FROM clasif_sud_pron WHERE usuario_id = $1',
      [usuarioId]
    );
    const pronMap = {};
    for (const row of pronClasifRes.rows) {
      pronMap[row.ronda] = Array.isArray(row.clasificados) ? row.clasificados : (typeof row.clasificados === 'string' ? JSON.parse(row.clasificados) : []);
    }

    // 3. Obtener clasificados reales
    const realClasifRes = await pool.query(
      'SELECT ronda, clasificados FROM clasif_sud'
    );
    const realMap = {};
    for (const row of realClasifRes.rows) {
      realMap[row.ronda] = Array.isArray(row.clasificados) ? row.clasificados : (typeof row.clasificados === 'string' ? JSON.parse(row.clasificados) : []);
    }

    // 4. Definir puntaje por ronda
    const puntosPorRonda = {
      'Knockout Round Play-offs': 2,
      'Octavos de Final': 3,
      'Cuartos de Final': 3,
      'Semifinales': 5,
      'Final': 0 // especial, ver abajo
    };

    // 5. Calcular puntos por ronda de clasificados
    let totalClasif = 0;
    const detalleClasif = [];
    for (const ronda of rondas) {
      const misClasificados = pronMap[ronda] || [];
      const reales = realMap[ronda] || [];
      let puntos = 0;

      if (ronda === 'Final') {
        // Especial: campeón y subcampeón
        // Suponiendo que en la tabla 'clasif_sud' y 'clasif_sud_pron' para 'Final' hay dos elementos: [campeon, subcampeon]
        if (misClasificados[0] && reales[0] && misClasificados[0] === reales[0]) puntos += 15; // campeón
        if (misClasificados[1] && reales[1] && misClasificados[1] === reales[1]) puntos += 10; // subcampeón
      } else {
        // Rondas normales: 1 punto por acierto, multiplicado por el valor de la ronda
        const aciertos = misClasificados.filter(e => reales.includes(e)).length;
        puntos = aciertos * (puntosPorRonda[ronda] || 0);
      }
      totalClasif += puntos;
      detalleClasif.push({
        ronda,
        misClasificados,
        clasificadosReales: reales,
        puntos
      });
    }

    // Sumar total general (partidos + clasificados)
    const total = (puntajePartidos?.total || 0) + totalClasif;

    res.json({
      partidos: puntajePartidos,
      clasificados: {
        detalle: detalleClasif,
        total: totalClasif
      },
      total
    });
  } catch (error) {
    console.error('Error calculando puntajes Sudamericana:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
