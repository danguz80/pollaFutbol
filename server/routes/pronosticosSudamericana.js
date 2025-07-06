import express from "express";
import { pool } from "../db/pool.js";
import { reemplazarSiglasPorNombres } from '../utils/sudamericanaSiglas.js';

const router = express.Router();

// POST /api/sudamericana/guardar-pronosticos-elim
router.post("/guardar-pronosticos-elim", async (req, res) => {
  const { usuario_id, pronosticos } = req.body;
  console.log("[PRONOSTICOS][BODY RECIBIDO]", JSON.stringify(req.body, null, 2));
  if (!usuario_id || !pronosticos || !Array.isArray(pronosticos)) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }
  if (pronosticos.length === 0) {
    console.log("[PRONOSTICOS][VACIO] El array de pronosticos está vacío");
  } else {
    console.log(`[PRONOSTICOS][CANTIDAD] Se recibieron ${pronosticos.length} pronosticos`);
    pronosticos.forEach((p, i) => {
      console.log(`[PRONOSTICO #${i+1}]`, JSON.stringify(p));
    });
  }
  let exitos = 0;
  let errores = [];
  try {
    for (const p of pronosticos) {
      try {
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
    // 1. Obtener todos los pronósticos del usuario
    const result = await pool.query(
      `SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1`,
      [usuarioId]
    );
    const pronos = result.rows;
    // 2. Obtener diccionario de siglas actuales
    const fixtureRes = await pool.query('SELECT fixture_id, equipo_local, equipo_visita FROM sudamericana_fixtures');
    const dicSiglas = {};
    for (const f of fixtureRes.rows) {
      dicSiglas[f.equipo_local] = f.equipo_local;
      dicSiglas[f.equipo_visita] = f.equipo_visita;
      // Si la sigla es distinta al nombre real, mapear
      if (f.clasificado && f.clasificado !== f.equipo_local) dicSiglas[f.clasificado] = f.equipo_local;
      if (f.clasificado && f.clasificado !== f.equipo_visita) dicSiglas[f.clasificado] = f.equipo_visita;
    }
    // 3. Reemplazar siglas por nombres reales
    const pronosConNombres = reemplazarSiglasPorNombres(pronos, dicSiglas);
    res.json(pronosConNombres);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
