/**
 * Descarga logos/escudos desde MÚLTIPLES FUENTES
 * - Wikimedia Commons
 * - Wikipedia (infobox)
 * - TheSportsDB API
 * - Fallback a búsqueda web
 * - Convierte todo a PNG con transparencia
 * - Tamaño uniforme 512x512
 */

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import sanitize from "sanitize-filename";

const OUTPUT_DIR = path.resolve("./Logos_Sudamericana");
const PNG_SIZE = 512;
const THESPORTSDB_API = "https://www.thesportsdb.com/api/v1/json/3";

// LISTA COMPLETA DE CLUBES (con variantes de nombres para mejor búsqueda)
const CLUBS = [
  // Argentina
  "Lanús",
  "Platense",
  "Estudiantes de La Plata",
  "Independiente Rivadavia",
  "Rosario Central",
  "Boca Juniors",
  "Argentinos Juniors",

  // Bolivia
  "Always Ready",
  "Bolívar",
  "Nacional Potosí",
  "The Strongest",

  // Brasil
  "Flamengo",
  "Corinthians",
  "Palmeiras",
  "Cruzeiro",
  "Mirassol",
  "Fluminense",
  "Botafogo",
  "Bahia",

  // Colombia
  "Santa Fe",
  "Junior",
  "Tolima",
  "Independiente Medellín",

  // Chile
  "Coquimbo Unido",
  "Universidad Católica",
  "O'Higgins",
  "Huachipato",

  // Ecuador
  "Independiente del Valle",
  "Liga de Quito",
  "Barcelona SC",
  "Universidad Católica (Ecuador)",

  // Paraguay
  "Libertad",
  "Cerro Porteño",
  "Guaraní",
  "2 de Mayo (Paraguay)",

  // Perú
  "Universitario",
  "Cusco FC",
  "Sporting Cristal",
  "Alianza Lima",

  // Uruguay
  "Nacional",
  "Peñarol",
  "Liverpool F.C. (Uruguay)",
  "Juventud de Las Piedras",

  // Venezuela
  "Universidad Central de Venezuela FC",
  "Carabobo FC",
  "Deportivo La Guaira",
  "Deportivo Táchira",
];

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

// ---------------- HELPERS ----------------

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function safeName(name) {
  return sanitize(name)
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "")
    .replace(/__+/g, "_")
    .trim();
}

async function mwSearchFiles(query) {
  const url = new URL(COMMONS_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6"); // File:
  url.searchParams.set("gsrlimit", "10");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime");
  url.searchParams.set("origin", "*");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed ${res.status}`);
  const data = await res.json();

  return (data?.query?.pages || [])
    .map((p) => {
      const ii = p.imageinfo?.[0];
      return ii?.url
        ? { title: p.title, url: ii.url, mime: ii.mime || "" }
        : null;
    })
    .filter(Boolean);
}

function scoreCandidate(c) {
  const t = c.title.toLowerCase();
  let s = 0;

  if (c.mime.includes("svg")) s += 50;
  if (c.mime.includes("png")) s += 30;
  if (t.includes("crest") || t.includes("escudo") || t.includes("logo")) s += 25;
  if (t.includes("kit") || t.includes("shirt")) s -= 40;
  if (t.includes("old") || t.includes("former")) s -= 20;

  return s;
}

async function pickBestLogo(club) {
  const q = `${club} crest logo escudo`;
  const candidates = await mwSearchFiles(q);
  if (!candidates.length) return null;

  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(c) }))
    .sort((a, b) => b.score - a.score)[0];
}

// ======== FUENTE 2: WIKIPEDIA INFOBOX ========
async function getLogoFromWikipedia(club) {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(club + " football club")}&srlimit=1&origin=*`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    
    if (!searchData.query?.search?.[0]) return null;
    
    const pageTitle = searchData.query.search[0].title;
    const pageUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(pageTitle)}&prop=pageimages&piprop=original&origin=*`;
    const pageRes = await fetch(pageUrl);
    const pageData = await pageRes.json();
    
    const pages = pageData.query?.pages;
    if (!pages) return null;
    
    const page = Object.values(pages)[0];
    return page.original?.source || null;
  } catch (err) {
    return null;
  }
}

// ======== FUENTE 3: THESPORTSDB ========
async function getLogoFromTheSportsDB(club) {
  try {
    const url = `${THESPORTSDB_API}/searchteams.php?t=${encodeURIComponent(club)}`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (!data.teams?.[0]) return null;
    
    const team = data.teams[0];
    return team.strTeamBadge || team.strTeamLogo || null;
  } catch (err) {
    return null;
  }
}

// ======== BÚSQUEDA EN CASCADA ========
async function findLogoUrl(club) {
  console.log(`🔍 Buscando: ${club}`);
  
  // 1. Intenta Wikimedia Commons (mejor calidad)
  const wmLogo = await pickBestLogo(club);
  if (wmLogo) {
    console.log(`   ✓ Encontrado en Wikimedia`);
    return wmLogo.url;
  }
  
  // 2. Intenta Wikipedia
  const wpLogo = await getLogoFromWikipedia(club);
  if (wpLogo) {
    console.log(`   ✓ Encontrado en Wikipedia`);
    return wpLogo;
  }
  
  // 3. Intenta TheSportsDB
  const tsdbLogo = await getLogoFromTheSportsDB(club);
  if (tsdbLogo) {
    console.log(`   ✓ Encontrado en TheSportsDB`);
    return tsdbLogo;
  }
  
  return null;
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Download failed");
  return Buffer.from(await res.arrayBuffer());
}

async function toPng(buffer) {
  return sharp(buffer, { density: 300 })
    .resize(PNG_SIZE, PNG_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

// ---------------- MAIN ----------------

async function main() {
  await ensureDir(OUTPUT_DIR);
  
  let found = 0;
  let notFound = 0;
  let errors = 0;

  for (const club of CLUBS) {
    try {
      const logoUrl = await findLogoUrl(club);
      
      if (!logoUrl) {
        console.log(`❌ No encontrado: ${club}\n`);
        notFound++;
        continue;
      }

      const buffer = await download(logoUrl);
      const png = await toPng(buffer);

      const fileName = `${safeName(club)}.png`;
      const filePath = path.join(OUTPUT_DIR, fileName);

      await fs.writeFile(filePath, png);
      console.log(`✅ ${club} → ${fileName}\n`);
      found++;
    } catch (err) {
      console.log(`⚠️ Error con ${club}: ${err.message}\n`);
      errors++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("🎉 Descarga finalizada");
  console.log(`📁 Carpeta: ${OUTPUT_DIR}`);
  console.log(`✅ Encontrados: ${found}`);
  console.log(`❌ No encontrados: ${notFound}`);
  console.log(`⚠️  Errores: ${errors}`);
  console.log(`📊 Total: ${CLUBS.length}`);
  console.log("=".repeat(50));
}

main();