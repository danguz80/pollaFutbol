import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convierte una foto de perfil a base64 o URL según el entorno
 * En producción usa URLs para reducir consumo de memoria
 * En desarrollo usa base64 para mejor compatibilidad
 * 
 * @param {string} fotoPerfil - Ruta de la foto de perfil
 * @returns {string|null} - URL o base64 de la foto
 */
export function getFotoPerfilBase64(fotoPerfil) {
  if (!fotoPerfil) return null;
  
  try {
    let cleanPath = fotoPerfil;
    if (cleanPath.startsWith('/perfil/')) {
      cleanPath = cleanPath.substring(8);
    } else if (cleanPath.startsWith('perfil/')) {
      cleanPath = cleanPath.substring(7);
    }
    
    // En producción, usar URL directa para reducir memoria
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      return `https://pollafutbol.netlify.app/perfil/${cleanPath}`;
    }
    
    // En desarrollo, intentar leer desde el servidor
    const fotoPath = path.join(__dirname, '../../client/public/perfil', cleanPath);
    
    if (fs.existsSync(fotoPath)) {
      const imageBuffer = fs.readFileSync(fotoPath);
      const ext = path.extname(cleanPath).substring(1);
      return `data:image/${ext};base64,${imageBuffer.toString('base64')}`;
    }
  } catch (error) {
    console.warn(`⚠️ Error cargando foto: ${fotoPerfil}`, error.message);
  }
  
  return null;
}
