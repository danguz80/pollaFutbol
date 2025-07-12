import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";

const JWT_SECRET = process.env.JWT_SECRET || "secreto-temporal";

export async function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // 🔴 LOG DE ERROR DETALLADO
    return res.status(401).json({ error: "Token no proporcionado en verifyToken" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query("SELECT * FROM usuarios WHERE id = $1", [decoded.id]);
    const usuario = result.rows[0];

    if (!usuario) {
      // 🔴 LOG DE ERROR DETALLADO
      return res.status(401).json({ error: "Usuario no encontrado en verifyToken" });
    }

    // ⚠️ Permitir acceso solo si está activo o es admin
    if (!usuario.activo && usuario.rol !== "admin") {
      // 🔴 LOG DE ERROR DETALLADO
      return res.status(403).json({ error: "Usuario inactivo en verifyToken" });
    }

    req.usuario = {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      activo: usuario.activo,
      activo_sudamericana: usuario.activo_sudamericana
    };

    next();
  } catch (err) {
    // 🔴 LOG DE ERROR DETALLADO
    return res.status(403).json({ error: "Token inválido o expirado en verifyToken" });
  }
}
