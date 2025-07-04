// Utilidad para obtener la URL de la foto de perfil (igual que en Ranking Acumulado)
export function getFotoPerfilUrl(foto_perfil) {
  if (!foto_perfil) return null;
  return foto_perfil.startsWith('/') ? foto_perfil : `/perfil/${foto_perfil}`;
}
