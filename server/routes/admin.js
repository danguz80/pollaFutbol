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

// Desactivar un usuario (solo admins)
router.patch("/desactivar-usuario/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE usuarios SET activo = false WHERE id = $1 RETURNING id, nombre, email, activo`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({ mensaje: "✅ Usuario desactivado", usuario: result.rows[0] });
  } catch (error) {
    console.error("Error al desactivar usuario:", error);
    res.status(500).json({ error: "No se pudo desactivar el usuario" });
  }
});

// Actualizar usuario (solo admins)
router.put("/actualizar-usuario/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
  const { id } = req.params;
  const { 
    nombre, 
    email, 
    rol, 
    activo,
    foto_perfil,
    activo_torneo_nacional,
    activo_libertadores,
    activo_sudamericana,
    activo_copa_mundo,
    activo_mundial
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE usuarios 
       SET nombre = $1, 
           email = $2, 
           rol = $3, 
           activo = $4,
           foto_perfil = $5,
           activo_torneo_nacional = $6,
           activo_libertadores = $7,
           activo_sudamericana = $8,
           activo_copa_mundo = $9,
           activo_mundial = $10
       WHERE id = $11 
       RETURNING id, nombre, email, rol, activo, foto_perfil, activo_torneo_nacional, 
                 activo_libertadores, activo_sudamericana, activo_copa_mundo, activo_mundial`,
      [nombre, email, rol, activo, foto_perfil, activo_torneo_nacional, activo_libertadores, 
       activo_sudamericana, activo_copa_mundo, activo_mundial, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({ mensaje: "✅ Usuario actualizado", usuario: result.rows[0] });
  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    res.status(500).json({ error: "No se pudo actualizar el usuario" });
  }
});

// Eliminar usuario (solo admins)
router.delete("/eliminar-usuario/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM usuarios WHERE id = $1 RETURNING id, nombre, email`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({ mensaje: "✅ Usuario eliminado", usuario: result.rows[0] });
  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    res.status(500).json({ error: "No se pudo eliminar el usuario. Puede tener datos asociados." });
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

// Abrir/Cerrar Cuadro Final
router.post("/cuadro-final/toggle", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    // Verificar si ya existe la "jornada" cuadro-final (número 999)
    const existingResult = await pool.query(
      `SELECT * FROM jornadas WHERE numero = 999`
    );

    if (existingResult.rows.length === 0) {
      // Crear la jornada cuadro-final
      const createResult = await pool.query(
        `INSERT INTO jornadas (numero, cerrada) VALUES (999, false) RETURNING *`
      );
      res.json({ 
        message: "Jornada Cuadro Final creada",
        jornada: createResult.rows[0]
      });
    } else {
      // Toggle del estado cerrada
      const newState = !existingResult.rows[0].cerrada;
      const updateResult = await pool.query(
        `UPDATE jornadas SET cerrada = $1 WHERE numero = 999 RETURNING *`,
        [newState]
      );
      res.json({ 
        message: `Cuadro Final ${newState ? 'cerrado' : 'abierto'}`,
        jornada: updateResult.rows[0]
      });
    }
  } catch (error) {
    console.error("Error al toggle cuadro final:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Obtener estado del Cuadro Final
router.get("/cuadro-final/estado", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM jornadas WHERE numero = 999`
    );
    
    if (result.rows.length === 0) {
      res.json({ existe: false, cerrada: false });
    } else {
      res.json({ 
        existe: true, 
        cerrada: result.rows[0].cerrada,
        jornada: result.rows[0]
      });
    }
  } catch (error) {
    console.error("Error al obtener estado cuadro final:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
