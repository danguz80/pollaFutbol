import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lista de equipos del mundial con sus códigos de país
const equipos = [
  { nombre: "México", codigo: "MEX", pais: "mexico" },
  { nombre: "República de Corea", codigo: "KOR", pais: "south-korea" },
  { nombre: "Sudáfrica", codigo: "RSA", pais: "south-africa" },
  { nombre: "Canadá", codigo: "CAN", pais: "canada" },
  { nombre: "Catar", codigo: "QAT", pais: "qatar" },
  { nombre: "Suiza", codigo: "SUI", pais: "switzerland" },
  { nombre: "Brasil", codigo: "BRA", pais: "brazil" },
  { nombre: "Escocia", codigo: "SCO", pais: "scotland" },
  { nombre: "Haití", codigo: "HAI", pais: "haiti" },
  { nombre: "Marruecos", codigo: "MAR", pais: "morocco" },
  { nombre: "Australia", codigo: "AUS", pais: "australia" },
  { nombre: "Estados Unidos", codigo: "USA", pais: "united-states" },
  { nombre: "Paraguay", codigo: "PAR", pais: "paraguay" },
  { nombre: "Alemania", codigo: "GER", pais: "germany" },
  { nombre: "Costa de Marfil", codigo: "CIV", pais: "ivory-coast" },
  { nombre: "Curazao", codigo: "CUW", pais: "curacao" },
  { nombre: "Ecuador", codigo: "ECU", pais: "ecuador" },
  { nombre: "Japón", codigo: "JPN", pais: "japan" },
  { nombre: "Países Bajos", codigo: "NED", pais: "netherlands" },
  { nombre: "Túnez", codigo: "TUN", pais: "tunisia" },
  { nombre: "Bélgica", codigo: "BEL", pais: "belgium" },
  { nombre: "Egipto", codigo: "EGY", pais: "egypt" },
  { nombre: "Irán", codigo: "IRN", pais: "iran" },
  { nombre: "Nueva Zelanda", codigo: "NZL", pais: "new-zealand" },
  { nombre: "Arabia Saudí", codigo: "KSA", pais: "saudi-arabia" },
  { nombre: "Cabo Verde", codigo: "CPV", pais: "cape-verde" },
  { nombre: "España", codigo: "ESP", pais: "spain" },
  { nombre: "Uruguay", codigo: "URU", pais: "uruguay" },
  { nombre: "Francia", codigo: "FRA", pais: "france" },
  { nombre: "Noruega", codigo: "NOR", pais: "norway" },
  { nombre: "Senegal", codigo: "SEN", pais: "senegal" },
  { nombre: "Argelia", codigo: "ALG", pais: "algeria" },
  { nombre: "Argentina", codigo: "ARG", pais: "argentina" },
  { nombre: "Austria", codigo: "AUT", pais: "austria" },
  { nombre: "Jordania", codigo: "JOR", pais: "jordan" },
  { nombre: "Colombia", codigo: "COL", pais: "colombia" },
  { nombre: "Portugal", codigo: "POR", pais: "portugal" },
  { nombre: "Uzbekistán", codigo: "UZB", pais: "uzbekistan" },
  { nombre: "Croacia", codigo: "CRO", pais: "croatia" },
  { nombre: "Ghana", codigo: "GHA", pais: "ghana" },
  { nombre: "Inglaterra", codigo: "ENG", pais: "england" },
  { nombre: "Panamá", codigo: "PAN", pais: "panama" }
];

const outputDir = path.join(__dirname, '../client/public/logos_mundial');

// Crear directorio si no existe
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Función para descargar imagen
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200) {
        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
        fileStream.on('error', reject);
      } else if (response.statusCode === 301 || response.statusCode === 302) {
        // Seguir redirecciones
        downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
      } else {
        reject(new Error(`Status code: ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

// Función para esperar
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Descargar logos
async function descargarLogos() {
  console.log(`🏆 Descargando logos de ${equipos.length} selecciones...\n`);
  
  let exitosos = 0;
  let fallidos = 0;
  
  for (const equipo of equipos) {
    const nombreArchivo = `${equipo.codigo.toLowerCase()}.png`;
    const rutaArchivo = path.join(outputDir, nombreArchivo);
    
    // Intentar múltiples fuentes
    const urls = [
      // API de Flagpedia (escudos de fútbol)
      `https://flagcdn.com/w160/${equipo.codigo.toLowerCase().slice(0, 2)}.png`,
      // Backup: countryflagsapi
      `https://countryflagsapi.com/png/${equipo.pais}`,
      // Backup 2: flagsapi
      `https://flagsapi.com/${equipo.codigo.toUpperCase()}/flat/64.png`
    ];
    
    let descargado = false;
    
    for (const url of urls) {
      try {
        console.log(`📥 Descargando ${equipo.nombre} (${equipo.codigo})...`);
        await downloadImage(url, rutaArchivo);
        console.log(`   ✅ ${nombreArchivo} descargado exitosamente`);
        exitosos++;
        descargado = true;
        break;
      } catch (error) {
        console.log(`   ⚠️  Falló URL: ${url}`);
      }
    }
    
    if (!descargado) {
      console.log(`   ❌ No se pudo descargar logo de ${equipo.nombre}`);
      fallidos++;
    }
    
    // Esperar un poco para no saturar las APIs
    await sleep(200);
  }
  
  console.log(`\n🎉 Proceso completado:`);
  console.log(`   ✅ Exitosos: ${exitosos}`);
  console.log(`   ❌ Fallidos: ${fallidos}`);
  console.log(`   📁 Directorio: ${outputDir}`);
}

descargarLogos().catch(console.error);
