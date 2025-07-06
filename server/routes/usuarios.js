import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = express.Router();
const SECRET = process.env.JWT_SECRET || "secreto123";

// 📋 ENDPOINT PÚBLICO - Listar usuarios con estado sudamericana
router.get("/lista", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, nombre, activo_sudamericana 
            FROM usuarios 
            ORDER BY nombre
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener usuarios:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// 📌 Registro
router.post("/register", async (req, res) => {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
        return res.status(400).json({ error: "Faltan datos obligatorios" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `INSERT INTO usuarios (nombre, email, password, activo) 
   VALUES ($1, $2, $3, false) 
   RETURNING id, nombre, email, rol, activo`,
            [nombre, email, hashedPassword]
        );


        res.status(201).json({
            mensaje: "Usuario registrado",
            usuario: result.rows[0],
        });
    } catch (err) {
        console.error("Error al registrar:", err);
        res.status(500).json({ error: "Error al registrar usuario" });
    }
});

// 🔐 Login
router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);

        if (result.rowCount === 0) {
            return res.status(401).json({ error: "Credenciales inválidas" });
        }

        const usuario = result.rows[0];
        const match = await bcrypt.compare(password, usuario.password);

        if (!match) {
            return res.status(401).json({ error: "Credenciales inválidas" });
        }

        const token = jwt.sign(
            { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
            SECRET,
            { expiresIn: "7d" }
        );

        res.json({
            mensaje: "Login exitoso",
            token,
            usuario: { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
        });
    } catch (err) {
        console.error("Error al hacer login:", err);
        res.status(500).json({ error: "Error al hacer login" });
    }
});

// 🧾 Ruta para obtener datos del usuario logueado
router.get("/me", verifyToken, (req, res) => {
    res.json({ usuario: req.usuario });
});

// 👑 Solo admin
router.get("/solo-admin", verifyToken, authorizeRoles("admin"), (req, res) => {
    res.send("👑 Bienvenido, Admin");
});

// 🎮 Solo jugador
router.get("/solo-jugador", verifyToken, authorizeRoles("jugador"), (req, res) => {
    res.send(`🎮 Bienvenido, jugador ${req.usuario.nombre}`);
});

// 🔐 Obtener usuarios pendientes (solo admin)
router.get("/pendientes", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, email FROM usuarios WHERE activo = false ORDER BY creado_en ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener usuarios pendientes:", error);
    res.status(500).json({ error: "No se pudieron obtener los usuarios" });
  }
});

// 🔹 Obtener todos los usuarios activos (jugadores y admin, si quieres filtrar solo jugadores, agrega WHERE rol = 'jugador')
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, nombre, foto_perfil FROM usuarios WHERE activo = true ORDER BY nombre ASC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ error: "No se pudieron obtener los usuarios" });
  }
});

// 🔹 Obtener todos los usuarios para admin (incluye activo_sudamericana)
router.get("/admin", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, nombre, email, activo, activo_sudamericana FROM usuarios ORDER BY nombre ASC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener usuarios para admin:", error);
    res.status(500).json({ error: "No se pudieron obtener los usuarios" });
  }
});

// 🔹 Actualizar estado activo_sudamericana de un usuario
router.patch("/:id/sudamericana", verifyToken, authorizeRoles("admin"), async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;
  try {
    await pool.query(
      "UPDATE usuarios SET activo_sudamericana = $1 WHERE id = $2",
      [!!activo, id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error("Error al actualizar activo_sudamericana:", error);
    res.status(500).json({ error: "Error al actualizar usuario" });
  }
});

router.patch("/cambiar-password", verifyToken, async (req, res) => {
  const { actual, nueva } = req.body;
  const usuarioId = req.usuario.id;

  if (!actual || !nueva) {
    return res.status(400).json({ error: "Debes ingresar ambas contraseñas." });
  }

  try {
    // Obtener el hash actual de la DB
    const result = await pool.query(
      "SELECT password FROM usuarios WHERE id = $1",
      [usuarioId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Usuario no encontrado." });

    const hashActual = result.rows[0].password;

    // Comparar actual
    const esValida = await bcrypt.compare(actual, hashActual);
    if (!esValida) {
      return res.status(401).json({ error: "La contraseña actual no es correcta." });
    }

    // Hash de la nueva contraseña
    const nuevaHash = await bcrypt.hash(nueva, 10);
    await pool.query(
      "UPDATE usuarios SET password = $1 WHERE id = $2",
      [nuevaHash, usuarioId]
    );

    res.json({ mensaje: "Contraseña actualizada correctamente." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al cambiar la contraseña." });
  }
});

// 🔹 Obtener TODOS los usuarios (sin filtros)
router.get("/todos", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM usuarios ORDER BY nombre ASC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener todos los usuarios:", error);
    res.status(500).json({ error: "No se pudieron obtener los usuarios" });
  }
});

// 🔄 ENDPOINT PARA ACTUALIZAR ESTADO SUDAMERICANA
router.put("/sudamericana/:id", async (req, res) => {
    const { id } = req.params;
    const { activo_sudamericana } = req.body;
    
    try {
        const result = await pool.query(
            "UPDATE usuarios SET activo_sudamericana = $1 WHERE id = $2 RETURNING id, nombre, activo_sudamericana",
            [activo_sudamericana, id]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error al actualizar usuario:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

export default router;
