import express from "express";
import { pool } from "../db/pool.js";

const router = express.Router();

// GET /api/ganadores/titulos
router.get("/titulos", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.nombre, u.foto_perfil, COUNT(*) AS titulos
      FROM ganadores_jornada gj
      JOIN usuarios u ON gj.jugador_id = u.id
      GROUP BY u.id, u.nombre, u.foto_perfil
      ORDER BY titulos DESC, u.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudo obtener el resumen de títulos" });
  }
});

export default router;
