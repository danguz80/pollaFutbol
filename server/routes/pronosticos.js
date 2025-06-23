import express from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { pool } from "../db/pool.js";
import fetch from "node-fetch";

const router = express.Router();

// GUARDAR O ACTUALIZAR PRONÓSTICO (UPSERT) — ahora bloquea si la jornada está cerrada
router.post("/", verifyToken, async (req, res) => {
  const usuarioId = req.usuario.id;
  const { jornada_id, partido_id, goles_local, goles_visita } = req.body;

  try {
    // 1. Verificar si la jornada está cerrada
    const jornadaCheck = await pool.query(
      "SELECT cerrada FROM jornadas WHERE id = $1",
      [jornada_id]
    );
    if (jornadaCheck.rowCount === 0) {
      return res.status(404).json({ error: "Jornada no encontrada" });
    }
    if (jornadaCheck.rows[0].cerrada) {
      return res.status(403).json({ error: "Esta jornada está cerrada. No se pueden modificar los pronósticos." });
    }

    // 2. Guardar o actualizar el pronóstico
    const result = await pool.query(
      `
      INSERT INTO pronosticos (usuario_id, jornada_id, partido_id, goles_local, goles_visita)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (usuario_id, jornada_id, partido_id)
      DO UPDATE SET goles_local = EXCLUDED.goles_local, goles_visita = EXCLUDED.goles_visita
      RETURNING id
      `,
      [usuarioId, jornada_id, partido_id, goles_local, goles_visita]
    );

    res.status(201).json({
      mensaje: "Pronóstico guardado/actualizado correctamente",
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error("Error al guardar/actualizar pronóstico:", error);
    res.status(500).json({ error: "No se pudo guardar/actualizar el pronóstico" });
  }
});

// CALCULAR PUNTAJES con BONUS
router.post("/calcular/:jornada", async (req, res) => {
  const { jornada } = req.params;

  try {
    const pronosticos = await pool.query(
      `SELECT p.id, p.usuario_id, p.partido_id, p.goles_local, p.goles_visita,
              pa.goles_local AS real_local, pa.goles_visita AS real_visita,
              COALESCE(pa.bonus, 1) AS bonus
       FROM pronosticos p
       JOIN partidos pa ON p.partido_id = pa.id
       JOIN jornadas j ON pa.jornada_id = j.id
       WHERE j.numero = $1`,
      [jornada]
    );

    if (pronosticos.rowCount === 0) {
      return res.status(404).json({ error: "No hay pronósticos para esta jornada" });
    }

    let actualizados = 0;

    for (const p of pronosticos.rows) {
      let goles_local = p.real_local;
      let goles_visita = p.real_visita;
      const bonus = parseInt(p.bonus) || 1;

      // Si faltan resultados, intentamos obtenerlos desde la API
      if (goles_local === null || goles_visita === null) {
        const response = await fetch(`https://api-football-v1.p.rapidapi.com/v3/fixtures?id=${p.partido_id}`, {
          headers: {
            "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
            "X-RapidAPI-Host": "api-football-v1.p.rapidapi.com"
          }
        });
        const data = await response.json();
        const partido = data.response[0];

        if (partido && partido.goals.home !== null && partido.goals.away !== null) {
          goles_local = partido.goals.home;
          goles_visita = partido.goals.away;
          // Actualizar tabla partidos con los goles obtenidos
          await pool.query(
            `UPDATE partidos SET goles_local = $1, goles_visita = $2 WHERE id = $3`,
            [goles_local, goles_visita, p.partido_id]
          );
        }
      }

      if (goles_local === null || goles_visita === null) continue;

      // Calcular puntaje base
      let puntosBase = 0;
      const pred_dif = p.goles_local - p.goles_visita;
      const real_dif = goles_local - goles_visita;
      const pred_signo = Math.sign(pred_dif);
      const real_signo = Math.sign(real_dif);

      if (p.goles_local === goles_local && p.goles_visita === goles_visita) {
        puntosBase = 5;
      } else if (pred_dif === real_dif) {
        puntosBase = 3;
      } else if (pred_signo === real_signo) {
        puntosBase = 1;
      }

      // Multiplicar por bonus
      const puntos = puntosBase * bonus;

      await pool.query(
        `UPDATE pronosticos SET puntos = $1 WHERE id = $2`,
        [puntos, p.id]
      );

      actualizados++;
    }

    res.json({
      mensaje: `✅ Puntajes calculados correctamente (con bonus)`,
      pronosticos: pronosticos.rowCount,
      actualizados
    });

  } catch (error) {
    console.error("Error al calcular puntajes:", error);
    res.status(500).json({ error: "Error interno al calcular los puntajes" });
  }
});

// GET /api/pronosticos/mis
router.get("/mis", verifyToken, async (req, res) => {
  const usuarioId = req.usuario.id;
  try {
    const result = await pool.query(`
      SELECT 
        p.id AS pronostico_id,
        j.numero AS jornada,
        pa.nombre_local,
        pa.nombre_visita,
        p.goles_local,
        p.goles_visita,
        p.signo,
        pa.goles_local AS real_local,
        pa.goles_visita AS real_visita,
        pa.bonus,
        p.puntos
      FROM pronosticos p
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE p.usuario_id = $1
      ORDER BY j.numero, pa.fecha
    `, [usuarioId]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron obtener tus pronósticos" });
  }
});

// GET /api/pronosticos/:jornada
router.get("/:jornada", verifyToken, async (req, res) => {
  const usuarioId = req.usuario.id;
  const { jornada } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT 
        p.id AS pronostico_id,
        p.partido_id,
        p.goles_local,
        p.goles_visita,
        p.signo,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha
      FROM pronosticos p
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE p.usuario_id = $1 AND j.numero = $2
      ORDER BY pa.fecha ASC
      `,
      [usuarioId, jornada]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener pronósticos:", error);
    res.status(500).json({ error: "No se pudieron obtener los pronósticos" });
  }
});

// 1. Pronósticos de todos los usuarios en una jornada (por partido)
router.get("/jornada/:jornada", async (req, res) => {
  const { jornada } = req.params;
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (u.id, pa.id)
        u.id as usuario_id,
        u.nombre as usuario,
        p.id AS pronostico_id,
        p.partido_id,
        pa.nombre_local,
        pa.nombre_visita,
        pa.fecha,
        p.goles_local,
        p.goles_visita,
        p.signo,
        pa.goles_local AS real_local,
        pa.goles_visita AS real_visita,
        pa.bonus,
        p.puntos
      FROM pronosticos p
      JOIN usuarios u ON p.usuario_id = u.id
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE j.numero = $1
      ORDER BY u.id, pa.id, p.id DESC
      `,
      [jornada]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron obtener los pronósticos" });
  }
});


// 2. Detalle de puntos por partido de la jornada actual (por jugador y partido)
// (Ya cubierto por el endpoint anterior; puedes usarlo para armar la tabla de detalle en frontend)

router.get("/ranking/jornada/:jornada", async (req, res) => {
  const { jornada } = req.params;
  try {
    const result = await pool.query(
      `SELECT 
        u.id as usuario_id,
        u.nombre as usuario,
        SUM(p.puntos) as puntaje_jornada
      FROM usuarios u
      JOIN pronosticos p ON p.usuario_id = u.id
      JOIN partidos pa ON p.partido_id = pa.id
      JOIN jornadas j ON pa.jornada_id = j.id
      WHERE j.numero = $1
      GROUP BY u.id, u.nombre
      ORDER BY puntaje_jornada DESC, usuario ASC`,
      [jornada]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener el ranking de la jornada" });
  }
});

// 4. Ranking acumulado general (puntaje sumado de todas las jornadas)
router.get("/ranking/general", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        u.id as usuario_id,
        u.nombre as usuario,
        COALESCE(SUM(p.puntos),0) as puntaje_total
      FROM usuarios u
      LEFT JOIN pronosticos p ON p.usuario_id = u.id
      GROUP BY u.id, u.nombre
      ORDER BY puntaje_total DESC, usuario ASC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener el ranking general" });
  }
});

export default router;
