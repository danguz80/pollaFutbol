import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapeo de nombres de equipos a archivos de logo
const LOGOS_EQUIPOS = {
  // Torneo Nacional
  'Audax Italiano': 'audax.png',
  'Colo-Colo': 'colo-colo.png',
  'Cobresal': 'cobresal.png',
  'Coquimbo Unido': 'coquimbo.png',
  'Deportes Iquique': 'iquique.png',
  'Deportes La Serena': 'laserena.png',
  'Deportes Limache': 'limache.webp',
  'Deportes Concepción': 'concepcion.png',
  'U. de Concepción': 'udeconce.png',
  'Everton': 'everton.png',
  'Huachipato': 'huachipato.png',
  'Ñublense': 'ñublense.png',
  "O'Higgins": 'ohiggins.webp',
  'Palestino': 'palestino.png',
  'U. Católica': 'uc.png',
  'U. de Chile': 'udechile.png',
  'U. Española': 'union-espanola.png',
  'Unión Española': 'union-espanola.png',
  'Unión La Calera': 'calera.png',
  'Universidad de Concepción': 'udeconce.png'
};

// Mapeo de equipos de Libertadores
const LOGOS_LIBERTADORES = {
  'Atlético Bucaramanga': 'AtléticoBucaramanga.png',
  'Fortaleza': 'Fortaleza.png',
  'Racing': 'Racing.png',
  'Botafogo': 'botafogo.png',
  'Carabobo': 'carabobo.png',
  'Colo-Colo': 'colo-colo.png',
  'Estudiantes de La Plata': 'estudiantes_de_la_plata.svg',
  'Estudiantes LP': 'Estudiantes_de_La_Plata.png',
  'Deportes Tolima': 'Tolima.png',
  'Universidad Central': 'ucentral_ven.png',
  'Lanús': 'Lanus.png',
  'Lanus': 'Lanus.png',
  'Universidad de Chile': 'udechile.png'
};

// Cache para almacenar logos en base64
const logoCache = {};

/**
 * Obtiene el logo de un equipo en formato base64 o URL
 * @param {string} nombreEquipo - Nombre del equipo
 * @returns {string|null} - Logo en base64/URL o null si no existe
 */
export function getLogoBase64(nombreEquipo) {
  // Normalizar apóstrofes: \u2019 (tipográfico) → ' (normal)
  const nombreNormalizado = nombreEquipo?.replace(/[\u2018\u2019]/g, "'");
  
  // Si ya está en cache, retornar
  if (logoCache[nombreNormalizado]) {
    return logoCache[nombreNormalizado];
  }

  // Buscar primero en logos nacionales
  let archivoLogo = LOGOS_EQUIPOS[nombreNormalizado];
  let carpeta = 'logos_torneo_nacional';
  
  // Si no está en nacionales, buscar en libertadores
  if (!archivoLogo) {
    archivoLogo = LOGOS_LIBERTADORES[nombreNormalizado];
    carpeta = 'copa_libertadores_logos_equipos';
  }
  
  if (!archivoLogo) {
    // Logo no encontrado
    return null;
  }

  try {
    // En producción, siempre usar URLs para reducir consumo de memoria
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      const urlLogo = `https://pollafutbol.netlify.app/${carpeta}/${archivoLogo}`;
      logoCache[nombreNormalizado] = urlLogo;
      console.log(`✅ Logo URL: ${nombreEquipo} -> ${urlLogo}`);
      return urlLogo;
    }
    
    // En desarrollo, intentar leer desde el servidor
    const rutaLogo = path.join(__dirname, '../../client/public', carpeta, archivoLogo);
    
    if (fs.existsSync(rutaLogo)) {
      // Leer el archivo y convertir a base64
      const imageBuffer = fs.readFileSync(rutaLogo);
      const extension = path.extname(archivoLogo).toLowerCase();
      const mimeType = extension === '.png' ? 'image/png' : 
                       extension === '.webp' ? 'image/webp' : 
                       extension === '.svg' ? 'image/svg+xml' :
                       extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 
                       'image/png';
      
      const base64Image = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
      logoCache[nombreNormalizado] = base64Image;
      console.log(`✅ Logo cargado desde servidor: ${nombreEquipo}`);
      return base64Image;
    } else {
      // Fallback a URL de Netlify
      const urlLogo = `https://pollafutbol.netlify.app/${carpeta}/${archivoLogo}`;
      logoCache[nombreNormalizado] = urlLogo;
      console.log(`✅ Logo URL (fallback): ${nombreEquipo} -> ${urlLogo}`);
      return urlLogo;
    }
  } catch (error) {
    // Fallback a URL de Netlify si hay error
    const urlLogo = `https://pollafutbol.netlify.app/${carpeta}/${archivoLogo}`;
    logoCache[nombreNormalizado] = urlLogo;
    console.log(`⚠️ Error leyendo logo, usando URL: ${nombreEquipo}`);
    return urlLogo;
  }
}

/**
 * Pre-carga todos los logos en memoria
 */
export function precargarLogos() {
  console.log('📦 Precargando logos de equipos...');
  let cargados = 0;
  
  // Precargar logos nacionales
  Object.keys(LOGOS_EQUIPOS).forEach(equipo => {
    if (getLogoBase64(equipo)) {
      cargados++;
    }
  });
  
  // Precargar logos de Libertadores
  Object.keys(LOGOS_LIBERTADORES).forEach(equipo => {
    if (getLogoBase64(equipo)) {
      cargados++;
    }
  });
  
  console.log(`✅ ${cargados} logos cargados en memoria`);
}
