// Helper para obtener el logo de un equipo de Sudamericana
export const getLogoEquipo = (nombreEquipo) => {
  if (!nombreEquipo) return null;
  
  // Normalizar nombre del equipo (sin espacios, sin tildes, minúsculas)
  const nombreNormalizado = nombreEquipo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Eliminar tildes
    .replace(/\s+/g, ''); // Eliminar espacios
  
  // Mapeo de nombres de equipos a nombres de archivos
  const mapeoLogos = {
    'botafogo': 'botafogo.png',
    'atleticobucaramanga': 'AtléticoBucaramanga.png',
    'atléticobucaramanga': 'AtléticoBucaramanga.png',
    'colo-colo': 'colo-colo.png',
    'colocolo': 'colo-colo.png',
    'universidaddechile': 'udechile.png',
    'udechile': 'udechile.png',
    'u.dechile': 'udechile.png',
    // Nuevos logos (nombres exactos de archivos)
    'estudiantesdelaplata': 'estudiantes_de_la_plata.svg',
    'estudiantes': 'estudiantes_de_la_plata.svg',
    'carabobo': 'carabobo.png',
    'fortaleza': 'Fortaleza.png',
    'racing': 'Racing.png',
  };
  
  const nombreArchivo = mapeoLogos[nombreNormalizado];
  
  if (nombreArchivo) {
    return `/copa_sudamericana_logos_equipos/${nombreArchivo}`;
  }
  
  return null;
};

// Componente de logo con fallback
export const LogoEquipo = ({ nombre, className = "", style = {} }) => {
  const logoUrl = getLogoEquipo(nombre);
  
  if (!logoUrl) {
    return null;
  }
  
  return (
    <img
      src={logoUrl}
      alt={`Logo ${nombre}`}
      className={className}
      style={{
        width: '30px',
        height: '30px',
        objectFit: 'contain',
        marginRight: '8px',
        ...style
      }}
      onError={(e) => {
        e.target.style.display = 'none';
      }}
    />
  );
};
