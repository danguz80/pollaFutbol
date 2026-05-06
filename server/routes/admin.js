// routes/admin.js
import express from "express";
import { pool } from "../db/pool.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  insertarPronosticosAusentesNacional,
  insertarPronosticosAusentesLibertadores,
  insertarPronosticosAusentesSudamericana,
  insertarPronosticosAusentesMundial,
} from '../utils/insertarPronosticosAusentes.js';

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

/**
 * POST /api/admin/insertar-pronosticos-ausentes
 * Inserta pronósticos 0-0 para usuarios activos sin pronósticos en una jornada cerrada.
 * Body: { competencia: 'nacional'|'libertadores'|'sudamericana'|'mundial', jornadaNumero: number }
 */
router.post("/insertar-pronosticos-ausentes", verifyToken, authorizeRoles("admin"), async (req, res) => {
  const { competencia, jornadaNumero } = req.body;

  if (!competencia || !jornadaNumero) {
    return res.status(400).json({ error: "Se requieren 'competencia' y 'jornadaNumero'" });
  }

  const competenciasValidas = ['nacional', 'libertadores', 'sudamericana', 'mundial'];
  if (!competenciasValidas.includes(competencia)) {
    return res.status(400).json({ error: `Competencia inválida. Válidas: ${competenciasValidas.join(', ')}` });
  }

  try {
    let jornadaId;
    let insertados = 0;

    if (competencia === 'nacional') {
      const r = await pool.query('SELECT id, cerrada FROM jornadas WHERE numero = $1', [jornadaNumero]);
      if (r.rows.length === 0) return res.status(404).json({ error: `Jornada ${jornadaNumero} no encontrada en Torneo Nacional` });
      jornadaId = r.rows[0].id;
      insertados = await insertarPronosticosAusentesNacional(jornadaId);

    } else if (competencia === 'libertadores') {
      const r = await pool.query('SELECT id, cerrada FROM libertadores_jornadas WHERE numero = $1', [jornadaNumero]);
      if (r.rows.length === 0) return res.status(404).json({ error: `Jornada ${jornadaNumero} no encontrada en Libertadores` });
      jornadaId = r.rows[0].id;
      insertados = await insertarPronosticosAusentesLibertadores(jornadaId);

    } else if (competencia === 'sudamericana') {
      const r = await pool.query('SELECT id, cerrada FROM sudamericana_jornadas WHERE numero = $1', [jornadaNumero]);
      if (r.rows.length === 0) return res.status(404).json({ error: `Jornada ${jornadaNumero} no encontrada en Sudamericana` });
      jornadaId = r.rows[0].id;
      insertados = await insertarPronosticosAusentesSudamericana(jornadaId);

    } else if (competencia === 'mundial') {
      const r = await pool.query('SELECT id, cerrada FROM mundial_jornadas WHERE numero = $1', [jornadaNumero]);
      if (r.rows.length === 0) return res.status(404).json({ error: `Jornada ${jornadaNumero} no encontrada en Mundial` });
      jornadaId = r.rows[0].id;
      insertados = await insertarPronosticosAusentesMundial(jornadaId);
    }

    console.log(`✅ [Admin] ${insertados} pronósticos 0-0 insertados - ${competencia} J${jornadaNumero}`);
    res.json({
      ok: true,
      mensaje: `Se insertaron ${insertados} pronósticos 0-0 para usuarios sin pronósticos en ${competencia} Jornada ${jornadaNumero}`,
      insertados,
      competencia,
      jornadaNumero,
      jornadaId,
    });
  } catch (error) {
    console.error("Error insertando pronósticos ausentes:", error);
    res.status(500).json({ error: "Error al insertar pronósticos ausentes", detalle: error.message });
  }
});

export default router;
