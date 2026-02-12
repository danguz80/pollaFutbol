// Mapeo de códigos FIFA a nombres de archivos de logos
export const MUNDIAL_LOGOS_MAP = {
  // Grupo A
  'MEX': 'mexico.png',
  'KOR': 'corea_del_sur.png',
  'RSA': 'sudafrica.png',
  'TBD': null, // Por definir
  
  // Grupo B
  'CAN': 'canada.png',
  'QAT': 'qatar.png',
  'SUI': 'suiza.png',
  
  // Grupo C
  'BRA': 'brasil.png',
  'SCO': 'escocia.png',
  'HAI': 'haiti.webp',
  'MAR': 'marruecos.webp',
  
  // Grupo D
  'AUS': 'australia.png',
  'USA': 'usa.png',
  'PAR': 'paraguay.png',
  
  // Grupo E
  'GER': 'alemania.webp',
  'CIV': 'costa_de_marfil.webp',
  'CUW': 'curazao.webp',
  'ECU': 'ecuador.png',
  
  // Grupo F
  'JPN': 'japon.png',
  'NED': 'paises_bajos.png',
  'TUN': 'tunez.webp',
  
  // Grupo G
  'BEL': 'belgica.png',
  'EGY': 'egipto.webp',
  'IRN': 'iran.png',
  'NZL': 'nueva_zelanda.webp',
  
  // Grupo H
  'KSA': 'arabia_saudita.png',
  'CPV': 'cabo_verde.png',
  'ESP': 'espana.png',
  'URU': 'uruguay.png',
  
  // Grupo I
  'FRA': 'francia.png',
  'NOR': 'noruega.png',
  'SEN': 'senegal.png',
  
  // Grupo J
  'ALG': 'argelia.webp',
  'ARG': 'argentina.webp',
  'AUT': 'austria.png',
  'JOR': 'jordania.png',
  
  // Grupo K
  'COL': 'colombia.png',
  'POR': 'portugal.png',
  'UZB': 'uzbekistan.png',
  
  // Grupo L
  'CRO': 'croacia.webp',
  'GHA': 'ghana.png',
  'ENG': 'inglaterra.png',
  'PAN': 'panama.png'
};

/**
 * Obtiene la URL del logo de una selección por su código FIFA
 * @param {string} codigoFIFA - Código de 3 letras (ej: 'ARG', 'BRA', 'ESP')
 * @returns {string} URL del logo o placeholder si no existe
 */
export function getMundialLogo(codigoFIFA) {
  const nombreArchivo = MUNDIAL_LOGOS_MAP[codigoFIFA];
  
  if (!nombreArchivo) {
    // Placeholder genérico si no hay logo
    return '/logos_mundial/placeholder.png';
  }
  
  return `/logos_mundial/${nombreArchivo}`;
}

/**
 * Obtiene la URL del logo de una selección por su nombre completo
 * @param {string} nombreEquipo - Nombre completo (ej: 'Argentina', 'Brasil')
 * @returns {string} URL del logo o placeholder si no existe
 */
export function getMundialLogoPorNombre(nombreEquipo) {
  // Mapeo de nombres completos a códigos FIFA
  const nombreACodigo = {
    'México': 'MEX',
    'República de Corea': 'KOR',
    'Sudáfrica': 'RSA',
    'Canadá': 'CAN',
    'Catar': 'QAT',
    'Suiza': 'SUI',
    'Brasil': 'BRA',
    'Escocia': 'SCO',
    'Haití': 'HAI',
    'Marruecos': 'MAR',
    'Australia': 'AUS',
    'Estados Unidos': 'USA',
    'Paraguay': 'PAR',
    'Alemania': 'GER',
    'Costa de Marfil': 'CIV',
    'Curazao': 'CUW',
    'Ecuador': 'ECU',
    'Japón': 'JPN',
    'Países Bajos': 'NED',
    'Túnez': 'TUN',
    'Bélgica': 'BEL',
    'Egipto': 'EGY',
    'Irán': 'IRN',
    'Nueva Zelanda': 'NZL',
    'Arabia Saudí': 'KSA',
    'Cabo Verde': 'CPV',
    'España': 'ESP',
    'Uruguay': 'URU',
    'Francia': 'FRA',
    'Noruega': 'NOR',
    'Senegal': 'SEN',
    'Argelia': 'ALG',
    'Argentina': 'ARG',
    'Austria': 'AUT',
    'Jordania': 'JOR',
    'Colombia': 'COL',
    'Portugal': 'POR',
    'Uzbekistán': 'UZB',
    'Croacia': 'CRO',
    'Ghana': 'GHA',
    'Inglaterra': 'ENG',
    'Panamá': 'PAN',
    'POR DEFINIR': 'TBD'
  };
  
  const codigo = nombreACodigo[nombreEquipo];
  return getMundialLogo(codigo);
}

export default MUNDIAL_LOGOS_MAP;
