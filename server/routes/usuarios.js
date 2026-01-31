import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = express.Router();
const SECRET = process.env.JWT_SECRET || "secreto123";

// 📋 ENDPOINT PÚBLICO - Listar usuarios
router.get("/lista", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, nombre 
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
      `SELECT id, nombre, foto_perfil, rol, 
              activo_torneo_nacional, activo_libertadores, 
              activo_sudamericana, activo_copa_mundo
       FROM usuarios 
       WHERE activo = true 
       ORDER BY nombre ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ error: "No se pudieron obtener los usuarios" });
  }
});

// 🔹 Obtener todos los usuarios para admin
router.get("/admin", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, email, activo, rol, foto_perfil,
              activo_torneo_nacional, activo_libertadores, 
              activo_sudamericana, activo_copa_mundo
       FROM usuarios 
       ORDER BY nombre ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener usuarios para admin:", error);
    res.status(500).json({ error: "No se pudieron obtener los usuarios" });
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

// 🔧 TEMPORAL: Actualizar fotos de perfil faltantes
router.post("/actualizar-fotos-faltantes", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const updates = [
      { nombre: 'Alfred Venegas', foto: '/perfil/avenegas.jpeg' },
      { nombre: 'Carlos Titus', foto: '/perfil/ctitus.jpeg' },
      { nombre: 'Javier Aguilera', foto: '/perfil/jaguilera.jpeg' },
      { nombre: 'Juan Torrijo', foto: '/perfil/jtorrijo.png' },
      { nombre: 'Julio Zuñiga', foto: '/perfil/jzuniga.jpg' }
    ];

    const resultados = [];
    for (const update of updates) {
      const result = await pool.query(
        'UPDATE usuarios SET foto_perfil = $1 WHERE nombre = $2 RETURNING nombre, foto_perfil',
        [update.foto, update.nombre]
      );
      if (result.rowCount > 0) {
        resultados.push({ status: 'ok', ...result.rows[0] });
      } else {
        resultados.push({ status: 'not_found', nombre: update.nombre });
      }
    }

    res.json({ mensaje: 'Fotos actualizadas', resultados });
  } catch (error) {
    console.error("Error al actualizar fotos:", error);
    res.status(500).json({ error: "No se pudieron actualizar las fotos" });
  }
});

export default router;
