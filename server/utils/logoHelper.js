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

// Mapeo de equipos de Sudamericana
const LOGOS_SUDAMERICANA = {
  // Argentina
  'Boca Juniors': 'Boca_juniors.png',
  'Argentinos Juniors': 'Argentinos_Juniors.png',
  'Independiente': 'INDEPENDIENTE.png',
  'Independiente Rivadavia': 'Independiente_Rivadavia.png',
  'Lanús': 'Lanus.png',
  'Lanus': 'Lanus.png',
  'Platense': 'Platense.png',
  'Racing': 'Racing.png',
  'River Plate': 'RIVER_PLATE.png',
  'Rosario Central': 'rosario_central.png',
  'San Lorenzo': 'SAN_LORENZO.png',
  'Tigre': 'TIGRE.png',
  'Barracas Central': 'BARRACAS_CENTRAL.png',
  'Deportivo Riestra': 'DEPORTIVO_RIESTRA.png',
  'Estudiantes de La Plata': 'Estudiantes_de_La_Plata.png',
  'Estudiantes LP': 'Estudiantes_de_La_Plata.png',
  
  // Brasil
  'Atlético Mineiro': 'ATLETICO_MINEIRO.png',
  'Bahia': 'bahia.png',
  'Botafogo': 'BOTAFOGO.png',
  'Bragantino': 'BRAGANTINO.png',
  'RB Bragantino': 'BRAGANTINO.png',
  'Corinthians': 'corinthians.png',
  'Cruzeiro': 'Cruzeiro.png',
  'Flamengo': 'Flamengo.png',
  'Fluminense': 'Fluminense.png',
  'Fortaleza': 'Fortaleza.png',
  'Gremio': 'GREMIO.png',
  'Mirassol': 'Mirassol.png',
  'Palmeiras': 'Palmeiras.png',
  'Santos': 'SANTOS.png',
  'São Paulo': 'SAO_PAULO.png',
  'Sao Paulo': 'SAO_PAULO.png',
  'Vasco da Gama': 'VASCO_DA_GAMA.png',
  
  // Bolivia
  'Bolívar': 'bolivar.png',
  'Bolivar': 'bolivar.png',
  'Blooming': 'BLOOMING.png',
  'Always Ready': 'Always_Ready.png',
  'Independiente Petrolero': 'INDEPENDIENTE_PETROLERO.png',
  'Nacional Potosí': 'Nacional_Potosí.png',
  'Nacional Potosi': 'Nacional_Potosí.png',
  'The Strongest': 'The_Strongest.png',
  
  // Chile
  'Audax Italiano': 'AUDAX_ITALIANO.png',
  'Colo-Colo': 'colo-colo.png',
  'Coquimbo Unido': 'coquimbo.png',
  'Huachipato': 'huachipato.png',
  "O'Higgins": 'ohiggins.webp',
  'Palestino': 'PALESTINO.png',
  'Recoleta': 'RECOLETA.png',
  'Universidad Católica': 'uc.png',
  'U. Católica': 'uc.png',
  'Universidad de Chile': 'udechile.png',
  'U. de Chile': 'udechile.png',
  
  // Colombia
  'América de Cali': 'AMERICA_DE_CALI.png',
  'Atlético Bucaramanga': 'AtléticoBucaramanga.png',
  'Independiente Medellín': 'ind_medellin.png',
  'Junior': 'junior_barranquilla.png',
  'Junior Barranquilla': 'junior_barranquilla.png',
  'Millonarios': 'MILLONARIOS.png',
  'Santa Fe': 'Santa_Fe.png',
  'Tolima': 'Tolima.png',
  'Deportes Tolima': 'Tolima.png',
  
  // Ecuador
  'Barcelona': 'Barcelona_SC.png',
  'Barcelona SC': 'Barcelona_SC.png',
  'Cienciano': 'CIENCIANO.png',
  'Cuenca': 'CUENCA.png',
  'Deportivo Cuenca': 'CUENCA.png',
  'Independiente del Valle': 'Independiente_del_Valle.png',
  'LDU': 'LDU.png',
  'L.D.U. Quito': 'LDU.png',
  'Liga de Quito': 'LDU.png',
  'Macará': 'MACARA.png',
  'Macara': 'MACARA.png',
  'Universidad Católica Ecuador': 'Universidad_Católica_Ecuador.png',
  
  // Paraguay
  '2 de Mayo': '2demayo.png',
  'Cerro Porteño': 'Cerro_Porteno.png',
  'Cerro Porteno': 'Cerro_Porteno.png',
  'Guaraní': 'Guaraní.png',
  'Guarani': 'Guaraní.png',
  'Libertad': 'libertad.png',
  'Olimpia': 'OLIMPIA.png',
  
  // Perú
  'Alianza Atlético': 'ALIANZA_ATLETICO.png',
  'Alianza Atletico': 'ALIANZA_ATLETICO.png',
  'Alianza Lima': 'Alianza_Lima.png',
  'Cusco': 'cusco.png',
  'Cusco FC': 'cusco.png',
  'Sporting Cristal': 'Sporting_Cristal.png',
  'Universitario': 'Universitario.png',
  
  // Uruguay
  'Atlético Juventud': 'ATLÉTICO_JUVENTUD.png',
  'Boston River': 'ATLETICO_BOSTON_RIVER.png',
  'Juventud': 'Juventud_de_Las_Piedras.png',
  'Juventud de Las Piedras': 'Juventud_de_Las_Piedras.png',
  'Liverpool': 'liverpool.png',
  'Liverpool FC': 'liverpool.png',
  'Montevideo City Torque': 'MONTEVIDEO_CITY_TORQUE.png',
  'City Torque': 'MONTEVIDEO_CITY_TORQUE.png',
  'Nacional': 'Nacional.png',
  'Peñarol': 'Penarol.png',
  'Penarol': 'Penarol.png',
  
  // Venezuela
  'Caracas': 'CARACAS.png',
  'Caracas FC': 'CARACAS.png',
  'Carabobo': 'carabobo.png',
  'Carabobo FC': 'carabobo.png',
  'Deportivo Táchira': 'tachira.png',
  'Deportivo Tachira': 'tachira.png',
  'Deportivo La Guaira': 'depor_la_guauria.png',
  'Puerto Cabello': 'PUERTO_CABELLO.png',
  'Academia Puerto Cabello': 'PUERTO_CABELLO.png',
  'Universidad Central': 'UNIVERSIDAD_CENTRAL.png',
  'Universidad Central de Venezuela': 'ucentral_ven.png'
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
  let nombreNormalizado = nombreEquipo?.replace(/[\u2018\u2019]/g, "'");
  
  // Extraer país entre paréntesis si existe (ej: "Palmeiras (BRA)" -> país = "BRA")
  const matchPais = nombreNormalizado?.match(/\(([A-Z]{3})\)\s*$/i);
  const pais = matchPais ? matchPais[1].toUpperCase() : null;
  
  // Eliminar país entre paréntesis (ej: "Palmeiras (BRA)" -> "Palmeiras")
  nombreNormalizado = nombreNormalizado?.replace(/\s*\([A-Z]{3}\)\s*$/i, '').trim();
  
  // Casos especiales: equipos con mismo nombre pero diferentes países
  if (nombreNormalizado === 'Independiente') {
    if (pais === 'BOL') {
      nombreNormalizado = 'Independiente Petrolero';
    }
    // Si es ARG, mantener "Independiente" para que busque el logo argentino
  }
  
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
  
  // Si no está en libertadores, buscar en sudamericana
  if (!archivoLogo) {
    archivoLogo = LOGOS_SUDAMERICANA[nombreNormalizado];
    carpeta = 'copa_sudamericana_logos_equipos';
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
  
  // Precargar logos de Sudamericana
  Object.keys(LOGOS_SUDAMERICANA).forEach(equipo => {
    if (getLogoBase64(equipo)) {
      cargados++;
    }
  });
  
  console.log(`✅ ${cargados} logos cargados en memoria`);
}
