import { Router } from "express";
import { pool } from "../db/pool.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = Router();

// GET - Obtener predicciones reales del admin
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM prediccion_final_admin 
      WHERE jugador_id = 1
      ORDER BY id DESC 
      LIMIT 1
    `);
    
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.json(null);
    }
  } catch (error) {
    console.error("Error obteniendo predicciones admin:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST - Guardar predicciones reales del admin
router.post("/", verifyToken, async (req, res) => {
  try {
    console.log("Received admin predictions:", req.body);
    
    const {
      campeon,
      subcampeon,
      tercero,
      cuarto,
      quinto,
      sexto,
      quinceto,
      dieciseisavo,
      copa_chile,
      copa_liga,
      goleador
    } = req.body;

    console.log("Extracted values:", {
      campeon, subcampeon, tercero, cuarto, 
      quinto, sexto, quinceto, dieciseisavo,
      copa_chile, copa_liga, goleador
    });

    // Usar UPSERT para actualizar o insertar
    const result = await pool.query(`
      INSERT INTO prediccion_final_admin (
        jugador_id, campeon, subcampeon, tercero,
        cuarto, quinto, sexto, quinceto, dieciseisavo,
        copa_chile, copa_liga, goleador
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (jugador_id) 
      DO UPDATE SET 
        campeon = EXCLUDED.campeon,
        subcampeon = EXCLUDED.subcampeon,
        tercero = EXCLUDED.tercero,
        cuarto = EXCLUDED.cuarto,
        quinto = EXCLUDED.quinto,
        sexto = EXCLUDED.sexto,
        quinceto = EXCLUDED.quinceto,
        dieciseisavo = EXCLUDED.dieciseisavo,
        copa_chile = EXCLUDED.copa_chile,
        copa_liga = EXCLUDED.copa_liga,
        goleador = EXCLUDED.goleador,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [1, campeon, subcampeon, tercero, cuarto, quinto, sexto, quinceto, dieciseisavo, copa_chile, copa_liga, goleador]);

    console.log("Database result:", result.rows[0]);

    res.json({ 
      message: "Predicciones reales guardadas exitosamente",
      prediccion: result.rows[0]
    });
  } catch (error) {
    console.error("Error guardando predicciones admin:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
