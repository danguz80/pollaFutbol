import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logos faltantes con códigos ISO correctos
const logosFaltantes = [
  { nombre: "República de Corea", codigo: "KOR", iso: "kr" },
  { nombre: "Suiza", codigo: "SUI", iso: "ch" },
  { nombre: "Haití", codigo: "HAI", iso: "ht" },
  { nombre: "Túnez", codigo: "TUN", iso: "tn" },
  { nombre: "Arabia Saudí", codigo: "KSA", iso: "sa" },
  { nombre: "Cabo Verde", codigo: "CPV", iso: "cv" },
  { nombre: "Uruguay", codigo: "URU", iso: "uy" },
  { nombre: "Portugal", codigo: "POR", iso: "pt" },
  { nombre: "Inglaterra", codigo: "ENG", iso: "gb-eng" }
];

const outputDir = path.join(__dirname, '../client/public/logos_mundial');

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
        fileStream.on('error', reject);
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
      } else {
        reject(new Error(`Status code: ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function descargarLogosFaltantes() {
  console.log(`🏆 Descargando ${logosFaltantes.length} logos faltantes...\n`);
  
  let exitosos = 0;
  let fallidos = 0;
  
  for (const equipo of logosFaltantes) {
    const nombreArchivo = `${equipo.codigo.toLowerCase()}.png`;
    const rutaArchivo = path.join(outputDir, nombreArchivo);
    
    // Usar flagcdn con código ISO correcto
    const url = `https://flagcdn.com/w160/${equipo.iso}.png`;
    
    try {
      console.log(`📥 Descargando ${equipo.nombre} (${equipo.codigo})...`);
      await downloadImage(url, rutaArchivo);
      console.log(`   ✅ ${nombreArchivo} descargado exitosamente`);
      exitosos++;
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      fallidos++;
    }
    
    await sleep(200);
  }
  
  console.log(`\n🎉 Proceso completado:`);
  console.log(`   ✅ Exitosos: ${exitosos}`);
  console.log(`   ❌ Fallidos: ${fallidos}`);
  console.log(`   📁 Total en directorio: ${fs.readdirSync(outputDir).length} archivos`);
}

descargarLogosFaltantes().catch(console.error);
