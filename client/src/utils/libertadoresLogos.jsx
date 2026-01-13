// Helper para obtener el logo de un equipo de Libertadores
export const getLogoEquipo = (nombreEquipo) => {
  if (!nombreEquipo) return null;
  
  // Normalizar nombre del equipo (sin espacios, sin tildes, minúsculas)
  const nombreNormalizado = nombreEquipo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Eliminar tildes
    .replace(/[\u2018\u2019]/g, "'") // Normalizar apóstrofes tipográficos → normal
    .replace(/\s+/g, ''); // Eliminar espacios
  
  // Mapeo de nombres de equipos a nombres de archivos
  const mapeoLogos = {
    // Argentina
    'bocajuniors': 'Boca_juniors.png',
    'estudiantesdelaplata': 'Estudiantes_de_La_Plata.png',
    'independienterivadavia': 'Independiente_Rivadavia.png',
    'lanus': 'Lanús.png',
    'platense': 'Platense.png',
    'racing': 'Racing.png',
    'rosariocentral': 'rosario_central.png',
    'argentinosjuniors': 'Argentinos_Juniors.png',
    
    // Brasil
    'botafogo': 'Botafogo.png',
    'flamengo': 'Flamengo.png',
    'palmeiras': 'Palmeiras.png',
    'bahia': 'bahia.png',
    'cruzeiro': 'Cruzeiro.png',
    'fluminense': 'Fluminense.png',
    'fortaleza': 'Fortaleza.png',
    'corinthians': 'corinthians.png',
    'mirassol': 'Mirassol.png',
    
    // Bolivia
    'bolivar': 'bolivar.png',
    'thestrongest': 'The_Strongest.png',
    'alwaysready': 'Always_Ready.png',
    'nacionalpotosi': 'Nacional_Potosí.png',
    
    // Chile (todos los equipos del torneo nacional)
    'colo-colo': 'colo-colo.png',
    'colocolo': 'colo-colo.png',
    'universidaddechile': 'udechile.png',
    'udechile': 'udechile.png',
    'u.dechile': 'udechile.png',
    'universidadcatolica': 'uc.png',
    'u.catolica': 'uc.png',
    'coquimbounido': 'coquimbo.png',
    'ohiggins': 'ohiggins.webp',
    "o'higgins": 'ohiggins.webp',
    'huachipato': 'huachipato.png',
    'palestino': 'palestino.png',
    'cobresal': 'cobresal.png',
    'everton': 'everton.png',
    'audaxitaliano': 'audax.png',
    'unionlacalera': 'calera.png',
    'unionespanola': 'union-espanola.png',
    'u.espanola': 'union-espanola.png',
    'deportesiquique': 'iquique.png',
    'deporteslaserena': 'laserena.png',
    'nublense': 'ñublense.png',
    'ñublense': 'ñublense.png',
    'deporteslimache': 'limache.webp',
    'deportesconcepcion': 'concepcion.png',
    'universidaddeconcepcion': 'udeconce.png',
    'u.deconcepcion': 'udeconce.png',
    
    // Colombia
    'atleticobucaramanga': 'AtléticoBucaramanga.png',
    'santafe': 'Santa_Fe.png',
    'junior': 'junior_barranquilla.png',
    'juniorbarranquilla': 'junior_barranquilla.png',
    'tolima': 'Tolima.png',
    'independientemedellin': 'ind_medellin.png',
    
    // Ecuador
    'independientedelvalle': 'Independiente_del_Valle.png',
    'barcelona': 'Barcelona_SC.png',
    'barcelonasc': 'Barcelona_SC.png',
    'ldu': 'LDU.png',
    'l.d.u.quito': 'LDU.png',
    'ldquito': 'LDU.png',
    'ligadequito': 'LDU.png',
    'universidadcatolicaecuador': 'Universidad_Católica_Ecuador.png',
    
    // Paraguay
    'libertad': 'libertad.png',
    'cerroporteno': 'Cerro_Porteno.png',
    'guarani': 'Guaraní.png',
    '2demayo': '2demayo.png',
    
    // Perú
    'alianzalima': 'Alianza_Lima.png',
    'sportingcristal': 'Sporting_Cristal.png',
    'universitario': 'Universitario.png',
    'cuscofc': 'cusco.png',
    'cusco': 'cusco.png',
    
    // Uruguay
    'nacional': 'Nacional.png',
    'penarol': 'Penarol.png',
    'liverpool': 'liverpool.png',
    'liverpoolfc': 'liverpool.png',
    'juventuddelaspiedras': 'Juventud_de_Las_Piedras.png',
    
    // Venezuela
    'carabobo': 'carabobo.png',
    'carabobofc': 'carabobo.png',
    'deportivotachira': 'tachira.png',
    'universidadcentraldevenezuela': 'ucentral_ven.png',
    'universidadcentraldevenezuelafc': 'ucentral_ven.png',
    'deportivolaguaira': 'depor_la_guauria.png',
  };
  
  const nombreArchivo = mapeoLogos[nombreNormalizado];
  
  if (nombreArchivo) {
    // Detectar si es equipo chileno del torneo nacional
    const equiposNacionales = ['colo-colo.png', 'udechile.png', 'uc.png', 'coquimbo.png', 'ohiggins.webp', 
      'huachipato.png', 'palestino.png', 'cobresal.png', 'everton.png', 'audax.png', 'calera.png', 
      'union-espanola.png', 'iquique.png', 'laserena.png', 'ñublense.png', 'limache.webp', 
      'concepcion.png', 'udeconce.png'];
    
    if (equiposNacionales.includes(nombreArchivo)) {
      return `/logos_torneo_nacional/${nombreArchivo}`;
    }
    return `/copa_libertadores_logos_equipos/${nombreArchivo}`;
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
