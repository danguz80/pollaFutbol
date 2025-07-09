import express from "express";
import { pool } from "../db/pool.js";
import { reemplazarSiglasPorNombres, calcularAvanceSiglas } from '../utils/sudamericanaSiglas.js';
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

// POST /api/sudamericana/guardar-pronosticos-elim
router.post("/guardar-pronosticos-elim", verifyToken, async (req, res) => {
  const { usuario_id, pronosticos } = req.body;
  
  // Verificar que el usuario_id del body coincida con el usuario autenticado
  if (req.usuario.id !== parseInt(usuario_id)) {
    return res.status(403).json({ error: "No autorizado: usuario_id no coincide con el usuario autenticado" });
  }

  // Verificar que el usuario tenga activo_sudamericana = true
  if (!req.usuario.activo_sudamericana) {
    return res.status(403).json({ 
      error: "No tienes autorización para realizar pronósticos de Sudamericana. Contacta al administrador." 
    });
  }

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
router.get("/pronosticos-elim/:usuarioId", verifyToken, async (req, res) => {
  const { usuarioId } = req.params;
  
  // Verificar que el usuarioId de la URL coincida con el usuario autenticado
  if (req.usuario.id !== parseInt(usuarioId)) {
    return res.status(403).json({ error: "No autorizado: solo puedes consultar tus propios pronósticos" });
  }

  // Verificar que el usuario tenga activo_sudamericana = true
  if (!req.usuario.activo_sudamericana) {
    return res.status(403).json({ 
      error: "No tienes autorización para consultar pronósticos de Sudamericana. Contacta al administrador." 
    });
  }
  try {
    // 1. Obtener todos los pronósticos del usuario
    const result = await pool.query(
      `SELECT * FROM pronosticos_sudamericana WHERE usuario_id = $1`,
      [usuarioId]
    );
    const pronos = result.rows;
    // 2. Obtener fixture completo
    const fixtureRes = await pool.query('SELECT * FROM sudamericana_fixtures');
    const fixture = fixtureRes.rows;
    // 3. Calcular avance de cruces con pronósticos (como en el frontend)
    const dicSiglas = calcularAvanceSiglas(fixture, pronos);
    // 4. Reemplazar siglas por nombres reales
    const pronosConNombres = reemplazarSiglasPorNombres(pronos, dicSiglas);
    
    console.log("PRONÓSTICOS FINALES CON PENALES:", pronosConNombres.filter(p => p.penales_local || p.penales_visita));
    
    res.json(pronosConNombres);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
