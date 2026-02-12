import { pool } from './db/pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapeo de códigos FIFA a nombres de archivo
const logosMap = {
  'MEX': 'mexico.png',
  'KOR': 'corea_del_sur.png',
  'RSA': 'sudafrica.png',
  'CAN': 'canada.png',
  'QAT': 'qatar.png',
  'SUI': 'suiza.png',
  'BRA': 'brasil.png',
  'SCO': 'escocia.png',
  'HAI': 'haiti.webp',
  'MAR': 'marruecos.png',
  'AUS': 'australia.png',
  'USA': 'usa.png',
  'PAR': 'paraguay.png',
  'GER': 'alemania.webp',
  'CIV': 'costa_de_marfil.webp',
  'CUW': 'curazao.webp',
  'ECU': 'ecuador.png',
  'JPN': 'japon.png',
  'NED': 'paises_bajos.png',
  'TUN': 'tunez.webp',
  'BEL': 'belgica.png',
  'EGY': 'egipto.webp',
  'IRN': 'iran.png',
  'NZL': 'nueva_zelanda.webp',
  'KSA': 'arabia_saudita.png',
  'CPV': 'cabo_verde.png',
  'ESP': 'espana.png',
  'URU': 'uruguay.png',
  'FRA': 'francia.png',
  'NOR': 'noruega.png',
  'SEN': 'senegal.png',
  'ALG': 'argelia.webp',
  'ARG': 'argentina.webp',
  'AUT': 'austria.png',
  'JOR': 'jordania.png',
  'COL': 'colombia.png',
  'POR': 'portugal.png',
  'UZB': 'uzbekistan.png',
  'CRO': 'croacia.webp',
  'GHA': 'ghana.png',
  'ENG': 'inglaterra.png',
  'PAN': 'panama.png'
};

async function verificarMapeo() {
  try {
    console.log('🔍 Verificando mapeo de logos del Mundial...\n');
    
    // Obtener equipos de la BD
    const result = await pool.query('SELECT nombre, pais FROM mundial_equipos ORDER BY pais');
    const equipos = result.rows;
    
    console.log(`📊 Equipos en BD: ${equipos.length}\n`);
    
    // Verificar directorio de logos
    const logosDir = path.join(__dirname, '../client/public/logos_mundial');
    const archivosExistentes = fs.readdirSync(logosDir).filter(f => f !== '.DS_Store');
    
    console.log(`📁 Archivos de logos: ${archivosExistentes.length}\n`);
    
    let encontrados = 0;
    let faltantes = 0;
    
    console.log('🏆 Verificación de mapeo:\n');
    
    for (const equipo of equipos) {
      const codigo = equipo.pais;
      const nombreArchivo = logosMap[codigo];
      
      if (!nombreArchivo) {
        console.log(`❌ ${equipo.nombre} (${codigo}) - NO MAPEADO`);
        faltantes++;
        continue;
      }
      
      const rutaCompleta = path.join(logosDir, nombreArchivo);
      const existe = fs.existsSync(rutaCompleta);
      
      if (existe) {
        console.log(`✅ ${equipo.nombre} (${codigo}) → ${nombreArchivo}`);
        encontrados++;
      } else {
        console.log(`⚠️  ${equipo.nombre} (${codigo}) → ${nombreArchivo} - ARCHIVO NO EXISTE`);
        faltantes++;
      }
    }
    
    console.log(`\n📊 Resumen:`);
    console.log(`   ✅ Logos mapeados correctamente: ${encontrados}`);
    console.log(`   ❌ Logos faltantes o no mapeados: ${faltantes}`);
    
    // Archivos no utilizados
    const codigosUsados = new Set(Object.values(logosMap));
    const noUtilizados = archivosExistentes.filter(f => !codigosUsados.has(f));
    
    if (noUtilizados.length > 0) {
      console.log(`\n⚠️  Archivos no mapeados en el directorio:`);
      noUtilizados.forEach(f => console.log(`   - ${f}`));
    }
    
    await pool.end();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verificarMapeo();
