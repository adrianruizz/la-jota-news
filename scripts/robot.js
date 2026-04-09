import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

const dbPath = path.resolve(process.cwd(), 'public', 'data', 'news.json');

// ============================================================
// FUENTES RSS — Periódicos locales + Google News con varias búsquedas
// ============================================================
const RSS_SOURCES = [
  // --- FUENTES DIRECTAS DE PERIÓDICOS ---
  { url: 'https://www.heraldo.es/rss/', name: 'Heraldo de Aragón', type: 'direct' },
  { url: 'https://www.aragondigital.es/feed/', name: 'Aragón Digital', type: 'direct' },
  { url: 'https://www.elperiodicodearagon.com/rss/section/4340', name: 'El Periódico de Aragón', type: 'direct' },
  { url: 'https://www.20minutos.es/rss/zaragoza/', name: '20 Minutos Zaragoza', type: 'direct' },
  { url: 'https://www.cartv.es/aragonnoticiasdigital/rss', name: 'Aragón Noticias', type: 'direct' },
  // --- GOOGLE NEWS: búsquedas específicas por barrio ---
  { url: 'https://news.google.com/rss/search?q=Zaragoza+"La+Jota"&hl=es&gl=ES&ceid=ES:es', name: 'Google News', type: 'google' },
  { url: 'https://news.google.com/rss/search?q=Zaragoza+"Vadorrey"&hl=es&gl=ES&ceid=ES:es', name: 'Google News', type: 'google' },
  { url: 'https://news.google.com/rss/search?q=Zaragoza+"margen+izquierda"&hl=es&gl=ES&ceid=ES:es', name: 'Google News', type: 'google' },
  { url: 'https://news.google.com/rss/search?q=Zaragoza+Arrabal+barrio&hl=es&gl=ES&ceid=ES:es', name: 'Google News', type: 'google' },
  { url: 'https://news.google.com/rss/search?q=Zaragoza+Picarral+barrio&hl=es&gl=ES&ceid=ES:es', name: 'Google News', type: 'google' },
  { url: 'https://news.google.com/rss/search?q="Avenida+Cataluña"+Zaragoza&hl=es&gl=ES&ceid=ES:es', name: 'Google News', type: 'google' },
];

// Palabras clave organizadas por sección/barrio
const SECTION_KEYWORDS = {
  'LA JOTA':            ['la jota', 'barrio la jota', 'calle la jota'],
  'VADORREY':           ['vadorrey', 'pasarela de vadorrey', 'azud de vadorrey'],
  'ARRABAL':            ['arrabal', 'el arrabal'],
  'PICARRAL':           ['picarral', 'el picarral'],
  'MARGEN IZQUIERDA':   ['margen izquierda', 'avenida cataluña', 'avenida de cataluña', 'puente de piedra'],
  'RIBERA DEL EBRO':    ['ebro', 'ribera', 'meandro', 'crecida del ebro'],
  'ZARAGOZA':           ['zaragoza']
};

const parser = new Parser({
  timeout: 8000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['enclosure', 'enclosure']
    ]
  }
});

// Max antigüedad: 10 días
const MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;

async function extractImageFromArticle(articleUrl) {
  try {
    const { data } = await axios.get(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html', 'Accept-Language': 'es-ES,es;q=0.9'
      },
      timeout: 8000, maxRedirects: 5
    });
    const $ = cheerio.load(data);
    let img = $('meta[property="og:image"]').attr('content');
    if (!img) img = $('meta[name="twitter:image"]').attr('content');
    if (!img) img = $('article img, .article-image img, .news-image img').first().attr('src');
    if (img && !img.startsWith('http')) {
      const u = new URL(articleUrl);
      img = `${u.protocol}//${u.host}${img.startsWith('/') ? '' : '/'}${img}`;
    }
    if (img && (img.includes('logo') || img.includes('favicon') || img.includes('sprite'))) return null;
    return img || null;
  } catch { return null; }
}

function extractImageFromRSS(item) {
  if (item.mediaContent && item.mediaContent.length > 0) {
    for (const mc of item.mediaContent) {
      const url = mc.$ ? mc.$.url : mc.url;
      if (url && (url.includes('.jpg') || url.includes('.png') || url.includes('.jpeg') || url.includes('.webp') || url.includes('image'))) return url;
    }
  }
  if (item.mediaThumbnail) { const url = item.mediaThumbnail.$ ? item.mediaThumbnail.$.url : item.mediaThumbnail.url; if (url) return url; }
  if (item.enclosure && item.enclosure.url) {
    if ((item.enclosure.type && item.enclosure.type.startsWith('image')) || item.enclosure.url.match(/\.(jpg|jpeg|png|webp)/i)) return item.enclosure.url;
  }
  return null;
}

function detectSection(text) {
  const lower = text.toLowerCase();
  // Prioridad: barrios específicos primero, Zaragoza genérico al final
  for (const section of ['LA JOTA', 'VADORREY', 'ARRABAL', 'PICARRAL', 'MARGEN IZQUIERDA', 'RIBERA DEL EBRO']) {
    if (SECTION_KEYWORDS[section].some(kw => lower.includes(kw))) return section;
  }
  return 'ZARAGOZA';
}

function isRelevant(item) {
  const text = `${item.title} ${item.contentSnippet || item.content || ''}`.toLowerCase();
  const allKeywords = Object.values(SECTION_KEYWORDS).flat();
  return allKeywords.some(kw => text.includes(kw));
}

async function fetchAndProcessNews() {
  console.log("🤖 Robot Periodista v4 — Edición COMPLETA Multi-Barrio");
  console.log("=========================================================\n");

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let newsDB = [];
  if (fs.existsSync(dbPath)) {
    newsDB = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  }

  // 🧹 LIMPIEZA: Eliminar noticias de más de 10 días
  const now = Date.now();
  const before = newsDB.length;
  newsDB = newsDB.filter(n => (now - new Date(n.pub_date).getTime()) < MAX_AGE_MS);
  const purged = before - newsDB.length;
  if (purged > 0) console.log(`🧹 Limpieza: ${purged} noticias antiguas eliminadas (> 10 días).\n`);

  let totalNuevas = 0;

  for (const source of RSS_SOURCES) {
    console.log(`📡 ${source.name} (${source.url.substring(0, 50)}...)`);
    try {
      const feed = await parser.parseURL(source.url);
      const relevant = feed.items.filter(isRelevant);
      console.log(`   ${feed.items.length} totales → ${relevant.length} relevantes`);

      for (const item of relevant.slice(0, 8)) {
        // Filtrar por antigüedad ya en la importación
        const pubDate = new Date(item.pubDate || Date.now());
        if ((now - pubDate.getTime()) > MAX_AGE_MS) continue;

        const exists = newsDB.find(n => n.link === item.link || n.title === item.title.replace(/ - .*/, '').trim());
        if (exists) continue;

        const cleanTitle = item.title.replace(/ - .*/, '').trim();
        const fullText = `${cleanTitle} ${item.contentSnippet || ''}`;
        const section = detectSection(fullText);

        console.log(`   📰 [${section}] ${cleanTitle}`);

        let imageUrl = extractImageFromRSS(item);
        if (!imageUrl && source.type === 'direct') {
          imageUrl = await extractImageFromArticle(item.link);
        }
        if (imageUrl) console.log(`      📸 ✅ Imagen encontrada`);

        const cleanSummary = (item.contentSnippet || item.content || '').replace(/<[^>]*>?/gm, '').substring(0, 350);

        newsDB.unshift({
          id: Math.random().toString(36).substr(2, 9),
          title: cleanTitle,
          original_source: source.type === 'google' ? (item.title.split(' - ').pop() || source.name) : source.name,
          link: item.link,
          pub_date: pubDate.toISOString(),
          summary: cleanSummary + '...',
          image_url: imageUrl,
          category: section
        });
        totalNuevas++;
      }
    } catch (e) {
      console.log(`   ⚠️ Error: ${e.message.substring(0, 60)}`);
    }
  }

  newsDB.sort((a, b) => new Date(b.pub_date) - new Date(a.pub_date));
  fs.writeFileSync(dbPath, JSON.stringify(newsDB, null, 2), 'utf-8');
  console.log(`\n=========================================================`);
  console.log(`🎉 +${totalNuevas} nuevas. Total activas: ${newsDB.length}. Purgadas: ${purged}`);
}

fetchAndProcessNews();
