import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "secreto-temporal";

// Registro de usuario
router.post("/register", async (req, res) => {
  const { nombre, email, password, rol = "jugador" } = req.body;

  try {
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    // Verificar si ya existe
    const existente = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    if (existente.rows.length > 0) {
      return res.status(409).json({ error: "El email ya está registrado" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO usuarios (nombre, email, password, rol)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, email, rol`,
      [nombre, email, hashed, rol]
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.status(201).json({ token, usuario: user });
  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ error: "No se pudo registrar el usuario" });
  }
});

// Login de usuario
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(`SELECT * FROM usuarios WHERE email = $1`, [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Email no encontrado" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      token,
      usuario: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        activo_torneo_nacional: user.activo_torneo_nacional || false,
        activo_libertadores: user.activo_libertadores || false,
        activo_sudamericana: user.activo_sudamericana || false,
        activo_copa_mundo: user.activo_copa_mundo || false,
        foto_perfil: user.foto_perfil || null
      }
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ error: "No se pudo iniciar sesión" });
  }
});

export default router;
