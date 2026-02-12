import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Escudos de las selecciones con IDs de API-Football
const selecciones = [
  { nombre: "México", codigo: "MEX", apiId: 16 },
  { nombre: "República de Corea", codigo: "KOR", apiId: 17 },
  { nombre: "Sudáfrica", codigo: "RSA", apiId: 21 },
  { nombre: "Canadá", codigo: "CAN", apiId: 15 },
  { nombre: "Catar", codigo: "QAT", apiId: 1569 },
  { nombre: "Suiza", codigo: "SUI", apiId: 15 },
  { nombre: "Brasil", codigo: "BRA", apiId: 6 },
  { nombre: "Escocia", codigo: "SCO", apiId: 1108 },
  { nombre: "Haití", codigo: "HAI", apiId: 2384 },
  { nombre: "Marruecos", codigo: "MAR", apiId: 31 },
  { nombre: "Australia", codigo: "AUS", apiId: 13 },
  { nombre: "Estados Unidos", codigo: "USA", apiId: 2384 },
  { nombre: "Paraguay", codigo: "PAR", apiId: 25 },
  { nombre: "Alemania", codigo: "GER", apiId: 25 },
  { nombre: "Costa de Marfil", codigo: "CIV", apiId: 1501 },
  { nombre: "Curazao", codigo: "CUW", apiId: 2331 },
  { nombre: "Ecuador", codigo: "ECU", apiId: 2382 },
  { nombre: "Japón", codigo: "JPN", apiId: 12 },
  { nombre: "Países Bajos", codigo: "NED", apiId: 1118 },
  { nombre: "Túnez", codigo: "TUN", apiId: 28 },
  { nombre: "Bélgica", codigo: "BEL", apiId: 1 },
  { nombre: "Egipto", codigo: "EGY", apiId: 1104 },
  { nombre: "Irán", codigo: "IRN", apiId: 22 },
  { nombre: "Nueva Zelanda", codigo: "NZL", apiId: 1530 },
  { nombre: "Arabia Saudí", codigo: "KSA", apiId: 23 },
  { nombre: "Cabo Verde", codigo: "CPV", apiId: 1504 },
  { nombre: "España", codigo: "ESP", apiId: 9 },
  { nombre: "Uruguay", codigo: "URU", apiId: 7 },
  { nombre: "Francia", codigo: "FRA", apiId: 2 },
  { nombre: "Noruega", codigo: "NOR", apiId: 1531 },
  { nombre: "Senegal", codigo: "SEN", apiId: 13 },
  { nombre: "Argelia", codigo: "ALG", apiId: 1503 },
  { nombre: "Argentina", codigo: "ARG", apiId: 26 },
  { nombre: "Austria", codigo: "AUT", apiId: 775 },
  { nombre: "Jordania", codigo: "JOR", apiId: 1532 },
  { nombre: "Colombia", codigo: "COL", apiId: 8 },
  { nombre: "Portugal", codigo: "POR", apiId: 27 },
  { nombre: "Uzbekistán", codigo: "UZB", apiId: 1530 },
  { nombre: "Croacia", codigo: "CRO", apiId: 3 },
  { nombre: "Ghana", codigo: "GHA", apiId: 1504 },
  { nombre: "Inglaterra", codigo: "ENG", apiId: 10 },
  { nombre: "Panamá", codigo: "PAN", apiId: 2331 }
];

const outputDir = path.join(__dirname, '../client/public/logos_mundial');

// Limpiar directorio
console.log('🗑️  Limpiando directorio de logos...');
if (fs.existsSync(outputDir)) {
  fs.readdirSync(outputDir).forEach(file => {
    fs.unlinkSync(path.join(outputDir, file));
  });
}

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

async function descargarEscudos() {
  console.log(`\n⚽ Descargando escudos de ${selecciones.length} selecciones...\n`);
  
  let exitosos = 0;
  let fallidos = 0;
  
  for (const seleccion of selecciones) {
    const nombreArchivo = `${seleccion.codigo.toLowerCase()}.png`;
    const rutaArchivo = path.join(outputDir, nombreArchivo);
    
    // Fuentes alternativas de escudos de fútbol
    const urls = [
      // Wikipedia Commons - Escudos oficiales
      `https://upload.wikimedia.org/wikipedia/commons/thumb/`,
      // FootballAPI logos (free)
      `https://media.api-sports.io/football/teams/${seleccion.apiId}.png`,
      // Alternativa: logo.clearbit (a veces tienen federaciones)
      `https://logo.clearbit.com/${seleccion.codigo.toLowerCase()}-football.com`
    ];
    
    // Mapeo manual de URLs de Wikipedia para escudos conocidos
    const wikipediaLogos = {
      'ARG': '1/1a/Flag_of_Argentina.svg/50px-Flag_of_Argentina.svg.png',
      'BRA': '0/05/Flag_of_Brazil.svg/50px-Flag_of_Brazil.svg.png',
      'MEX': 'f/fc/Flag_of_Mexico.svg/50px-Flag_of_Mexico.svg.png',
      'ESP': '9/9a/Flag_of_Spain.svg/50px-Flag_of_Spain.svg.png',
      'FRA': 'c/c3/Flag_of_France.svg/50px-Flag_of_France.svg.png',
      'GER': 'b/ba/Flag_of_Germany.svg/50px-Flag_of_Germany.svg.png',
      'ENG': 'b/be/Flag_of_England.svg/50px-Flag_of_England.svg.png',
      'POR': '5/5c/Flag_of_Portugal.svg/50px-Flag_of_Portugal.svg.png',
      'URU': 'f/fe/Flag_of_Uruguay.svg/50px-Flag_of_Uruguay.svg.png',
      'COL': '2/21/Flag_of_Colombia.svg/50px-Flag_of_Colombia.svg.png'
    };
    
    console.log(`📥 Descargando escudo de ${seleccion.nombre} (${seleccion.codigo})...`);
    
    // Intentar primero con el código FIFA común (CR, AR, BR, etc.)
    const codigoISO = {
      'MEX': 'mx', 'KOR': 'kr', 'RSA': 'za', 'CAN': 'ca', 'QAT': 'qa',
      'SUI': 'ch', 'BRA': 'br', 'SCO': 'scotland', 'HAI': 'ht', 'MAR': 'ma',
      'AUS': 'au', 'USA': 'us', 'PAR': 'py', 'GER': 'de', 'CIV': 'ci',
      'CUW': 'cw', 'ECU': 'ec', 'JPN': 'jp', 'NED': 'nl', 'TUN': 'tn',
      'BEL': 'be', 'EGY': 'eg', 'IRN': 'ir', 'NZL': 'nz', 'KSA': 'sa',
      'CPV': 'cv', 'ESP': 'es', 'URU': 'uy', 'FRA': 'fr', 'NOR': 'no',
      'SEN': 'sn', 'ALG': 'dz', 'ARG': 'ar', 'AUT': 'at', 'JOR': 'jo',
      'COL': 'co', 'POR': 'pt', 'UZB': 'uz', 'CRO': 'hr', 'GHA': 'gh',
      'ENG': 'england', 'PAN': 'pa'
    }[seleccion.codigo];
    
    // URL de logos de fútbol (varios servicios gratuitos)
    const urlsAlternativas = [
      `https://flagcdn.com/${codigoISO}.svg`,
      `https://countryflagsapi.com/svg/${seleccion.nombre.toLowerCase()}`,
      `https://www.countryflags.io/${codigoISO}/flat/64.png`
    ];
    
    let descargado = false;
    
    for (const url of urlsAlternativas) {
      try {
        await downloadImage(url, rutaArchivo);
        console.log(`   ✅ ${nombreArchivo} descargado`);
        exitosos++;
        descargado = true;
        break;
      } catch (error) {
        // Intentar siguiente URL
      }
    }
    
    if (!descargado) {
      console.log(`   ❌ No disponible`);
      fallidos++;
    }
    
    await sleep(100);
  }
  
  console.log(`\n🎉 Proceso completado:`);
  console.log(`   ✅ Exitosos: ${exitosos}`);
  console.log(`   ❌ Fallidos: ${fallidos}`);
  console.log(`\n💡 Los escudos oficiales de federaciones requieren APIs de pago.`);
  console.log(`   Te recomiendo descargarlos manualmente desde:`);
  console.log(`   - https://www.fifa.com/associations/`);
  console.log(`   - https://en.wikipedia.org/wiki/[País]_national_football_team`);
}

descargarEscudos().catch(console.error);
