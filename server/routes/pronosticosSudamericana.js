import express from "express";
import { pool } from "../db/pool.js";

const router = express.Router();

// POST /api/sudamericana/guardar-pronosticos-elim
router.post("/guardar-pronosticos-elim", async (req, res) => {
  const { usuario_id, pronosticos } = req.body;
  console.log("[PRONOSTICOS][BODY]", JSON.stringify(req.body, null, 2)); // Log completo del body recibido
  if (!usuario_id || !pronosticos || !Array.isArray(pronosticos)) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }
  let exitos = 0;
  let errores = [];
  try {
    for (const p of pronosticos) {
      try {
        console.log("[PRONOSTICO][GUARDAR]", JSON.stringify(p));
        await pool.query(
          `INSERT INTO pronosticos_sudamericana (usuario_id, fixture_id, ronda, equipo_local, equipo_visita, ganador, goles_local, goles_visita, penales_local, penales_visita)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (usuario_id, fixture_id) DO UPDATE SET
             ronda = EXCLUDED.ronda,
             equipo_local = EXCLUDED.equipo_local,
             equipo_visita = EXCLUDED.equipo_visita,
             ganador = EXCLUDED.ganador,
             goles_local = EXCLUDED.goles_local,
             goles_visita = EXCLUDED.goles_visita,
             penales_local = EXCLUDED.penales_local,
             penales_visita = EXCLUDED.penales_visita
          `,
          [
            usuario_id,
            p.fixture_id,
            p.ronda,
            p.equipo_local,
            p.equipo_visita,
            p.ganador,
            p.goles_local,
            p.goles_visita,
            p.penales_local,
            p.penales_visita
          ]
        );
        exitos++;
      } catch (err) {
        console.error("[ERROR][INSERT/UPDATE]", err, p);
        errores.push({ fixture_id: p.fixture_id, error: err.message });
      }
    }
    if (errores.length > 0) {
      res.status(207).json({ ok: false, exitos, errores, message: "Algunos pronósticos no se guardaron. Revisa los logs del backend." });
    } else {
      res.json({ ok: true, exitos });
    }
  } catch (error) {
    console.error("Error guardando pronósticos eliminación directa:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/sudamericana/pronosticos-elim/:usuarioId
router.get("/pronosticos-elim/:usuarioId", async (req, res) => {
  const { usuarioId } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1`,
      [usuarioId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
