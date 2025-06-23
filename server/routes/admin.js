// routes/admin.js
import express from "express";
import { pool } from "../db/pool.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = express.Router();

// Activar un usuario (solo admins)
router.patch("/activar-usuario/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE usuarios SET activo = true WHERE id = $1 RETURNING id, nombre, email, activo`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({ mensaje: "✅ Usuario activado", usuario: result.rows[0] });
  } catch (error) {
    console.error("Error al activar usuario:", error);
    res.status(500).json({ error: "No se pudo activar el usuario" });
  }
});

// Obtener usuarios inactivos (solo admins)
router.get("/usuarios-pendientes", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, nombre, email FROM usuarios WHERE activo = false"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener usuarios pendientes:", err);
    res.status(500).json({ error: "Error al obtener usuarios pendientes" });
  }
});

export default router;
