import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapeo de nombres de equipos a archivos de logo
const LOGOS_EQUIPOS = {
  'Audax Italiano': 'audax.png',
  'Colo-Colo': 'colo-colo.png',
  'Cobreloa': 'cobreloa.png',
  'Cobresal': 'cobresal.png',
  'Coquimbo Unido': 'coquimbo.png',
  'Deportes Iquique': 'iquique.png',
  'Deportes La Serena': 'laserena.png',
  'Deportes Limache': 'limache.webp',
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

// Cache para almacenar logos en base64
const logoCache = {};

/**
 * Obtiene el logo de un equipo en formato base64
 * @param {string} nombreEquipo - Nombre del equipo
 * @returns {string|null} - Logo en base64 o null si no existe
 */
export function getLogoBase64(nombreEquipo) {
  // Si ya está en cache, retornar
  if (logoCache[nombreEquipo]) {
    return logoCache[nombreEquipo];
  }

  const archivoLogo = LOGOS_EQUIPOS[nombreEquipo];
  if (!archivoLogo) {
    console.warn(`⚠️ Logo no encontrado para equipo: ${nombreEquipo}`);
    return null;
  }

  try {
    // Ruta al archivo de logo (ajustar según la estructura del proyecto)
    const rutaLogo = path.join(__dirname, '../../client/public/logos_torneo_nacional', archivoLogo);
    
    // Verificar si el archivo existe
    if (!fs.existsSync(rutaLogo)) {
      console.warn(`⚠️ Archivo de logo no existe: ${rutaLogo}`);
      return null;
    }

    // Leer el archivo y convertir a base64
    const imageBuffer = fs.readFileSync(rutaLogo);
    const extension = path.extname(archivoLogo).toLowerCase();
    const mimeType = extension === '.png' ? 'image/png' : 
                     extension === '.webp' ? 'image/webp' : 
                     extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 
                     'image/png';
    
    const base64Image = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    
    // Guardar en cache
    logoCache[nombreEquipo] = base64Image;
    
    return base64Image;
  } catch (error) {
    console.error(`❌ Error leyendo logo de ${nombreEquipo}:`, error.message);
    return null;
  }
}

/**
 * Pre-carga todos los logos en memoria
 */
export function precargarLogos() {
  console.log('📦 Precargando logos de equipos...');
  let cargados = 0;
  
  Object.keys(LOGOS_EQUIPOS).forEach(equipo => {
    if (getLogoBase64(equipo)) {
      cargados++;
    }
  });
  
  console.log(`✅ ${cargados} logos cargados en memoria`);
}
