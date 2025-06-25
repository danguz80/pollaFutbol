// middleware/verifyToken.js
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";

const JWT_SECRET = process.env.JWT_SECRET || "secreto-temporal";

export async function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Busca el usuario por el id del token
    const result = await pool.query("SELECT * FROM usuarios WHERE id = $1", [decoded.id]);
    const usuario = result.rows[0];

    if (!usuario) {
      return res.status(401).json({ error: "Usuario no encontrado" });
    }

    // Permitir acceso solo si está activo o es admin
    if (!usuario.activo && usuario.rol !== "admin") {
      return res.status(403).json({ error: "Tu cuenta aún no ha sido activada por un administrador" });
    }

    req.usuario = {
      id: usuario.id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      activo: usuario.activo
    };

    next();
  } catch (err) {
    // Puede ser por token vencido, mal formado, etc.
    return res.status(403).json({ error: "Token inválido o expirado" });
  }
}
