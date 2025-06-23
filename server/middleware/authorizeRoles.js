export function authorizeRoles(...rolesPermitidos) {
  return (req, res, next) => {
    const usuario = req.usuario;

    if (!usuario || !rolesPermitidos.includes(usuario.rol)) {
      return res.status(403).json({ error: "No tienes permiso para acceder a esta ruta" });
    }

    next();
  };
}
