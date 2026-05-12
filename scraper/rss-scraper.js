/**
 * rss-scraper.js
 *
 * Fetches RSS feeds from German tech sites, categorizes articles,
 * deduplicates by URL, and writes ../news.json.
 */

import Parser from 'rss-parser';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = join(__dirname, '..', 'news.json');
const MAX_ARTICLES = 30;

// ── Feeds ──────────────────────────────────────────────────────────
const FEEDS = [
  { url: 'https://www.heise.de/rss/heise.rdf',         source: 'Heise' },
  { url: 'https://www.computerbase.de/rss/news.xml',   source: 'ComputerBase' },
  { url: 'https://rss.golem.de/rss.php?feed=RSS2.0',   source: 'Golem' },
  { url: 'https://www.pcgameshardware.de/rss/news.rss', source: 'PCGH' },
  { url: 'https://www.hardwareluxx.de/rss.xml',        source: 'HardwareLuxx' },
  { url: 'https://www.notebookcheck.com/rss.xml',      source: 'Notebookcheck' },
  { url: 'https://www.hardwareschotte.de/?feed=rss2',  source: 'HardwareSchotte' },
  { url: 'https://www.tomshardware.de/rss.xml',        source: 'Tom\'s Hardware' },
];

// ── Categorization keywords ────────────────────────────────────────
const CATEGORIES = {
  Hardware: [
    'cpu', 'gpu', 'grafikkarte', 'prozessor', 'mainboard', 'motherboard',
    'ssd', 'speicher', 'ram', 'arbeitsspeicher', 'kühler', 'gebläse',
    'lüfter', 'gehäuse', 'netzteil', 'psu', 'festplatte', 'nvme', 'm.2',
    'grafikchip', 'chip', 'prozessoren', 'cpu-kühler', 'wasserkühlung',
    'luftkühlung', 'aio', 'tower', 'mini-itx', 'atx', 'micro-atx',
    'rtx', 'rx', 'radeon', 'geforce', 'arc', 'intel core', 'ryzen',
    'threadripper', 'xeon', 'epyc', 'ddr5', 'ddr4', 'pcie', 'sata',
    'oled', 'ips', 'va', 'monitor', 'display', 'bildschirm', 'tastatur',
    'maus', 'headset', 'webcam', 'microphone', 'mikrofon', 'keyboard',
    'mousepad', 'joystick', 'controller', 'gamepad'
  ],
  Markt: [
    'preis', 'markt', 'auslieferung', 'verkauf', 'umsatz', 'absatz',
    'nachfrage', 'lieferung', 'verfügbarkeit', 'knappheit', 'verkaufszahlen',
    'marktanteil', 'wachstum', 'rückgang', 'einbruch', 'steigerung',
    'preisentwicklung', 'preisanstieg', 'preisverfall', 'shortage',
    'lieferengpass', 'out of stock', 'vergriffen', 'verkauft',
    'bestellung', 'vorbestellung', 'release', 'launch'
  ],
  Angebote: [
    'angebot', 'deal', 'rabatt', 'reduziert', 'günstig', 'sale',
    'preissturz', 'sparen', 'aktion', 'schnäppchen', 'discount',
    'amazon', 'alternate', 'mindfactory', 'caseking', 'notebooksbilliger',
    'cyberport', 'otto', 'mediamarkt', 'saturn', 'ebay',
    'nur heute', 'nur für kurze zeit', 'limitiert', 'bundle',
    'gratis', 'geschenkt', 'kostenlos', 'rabattcode', 'coupon'
  ],
  Software: [
    'treiber', 'bios', 'windows', 'update', 'patch', 'firmware',
    'treiberupdate', 'beta', 'release', 'download', 'open-source',
    'linux', 'ubuntu', 'debian', 'gaming-os', 'directx', 'vulkan',
    'opengl', 'cuda', 'optix', 'dlss', 'fsr', 'raytracing',
    'benchmark', 'test', 'review', 'leistung', 'performance',
    'overclocking', 'übertakten', 'übertaktung', 'software'
  ],
  Industrie: [
    'übernahme', 'fusion', 'quartal', 'q1', 'q2', 'q3', 'q4',
    'jahreszahlen', 'bilanz', 'aktie', 'investition', 'milliarden',
    'strategie', 'ceo', 'geschäftsführer', 'firma', 'unternehmen',
    'hersteller', 'branche', 'industrie', 'nvidia', 'amd', 'intel',
    'tsmc', 'samsung', 'micron', 'sk hynix', 'foxconn', 'asml',
    'entlassung', 'einstellung', 'personal', 'umbau', 'restrukturierung'
  ]
};

const FALLBACK_CATEGORY = 'Hardware';

// ── Helpers ────────────────────────────────────────────────────────
const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'PC-Builder-NewsBot/1.0 (github.com/DavidLeitnerHTL/PC-Builder)',
    'Accept': 'application/rss+xml, application/xml, text/xml; q=0.9, */*; q=0.8'
  }
});

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // Strip tracking params
    const strip = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'ref'];
    strip.forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch {
    return url;
  }
}

function getTextField(item, ...keys) {
  for (const key of keys) {
    const val = item[key];
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object') {
      if (typeof val.content === 'string') return val.content;
      if (typeof val._ === 'string') return val._;
    }
  }
  return '';
}

function extractImage(item) {
  // 1. enclosure
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }
  // 2. media:content (rss-parser might expose it under media:content)
  if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) {
    return item['media:content'].$.url;
  }
  // 3. First <img> in content / content:encoded / description
  const html = getTextField(item, 'content:encoded', 'content', 'description');
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match) return match[1];
  return null;
}

function looksLikeImageUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif|bmp)(\?.*)?$/.test(lower);
}

function categorize(title = '', description = '') {
  const text = (title + ' ' + description).toLowerCase();
  const scores = {};
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    scores[cat] = keywords.reduce((sum, kw) => sum + (text.includes(kw.toLowerCase()) ? 1 : 0), 0);
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : FALLBACK_CATEGORY;
}

function parseDate(item) {
  const raw = item.isoDate || item.pubDate || item.date || item.published;
  if (!raw) return new Date().toISOString().split('T')[0];
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
    return d.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function cleanDescription(raw = '') {
  // Strip HTML tags
  let text = raw.replace(/<[^>]+>/g, ' ');
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();
  // Limit length
  if (text.length > 220) {
    text = text.substring(0, 217).trim() + '...';
  }
  return text;
}

function cleanTitle(raw = '') {
  let text = raw.replace(/<[^>]+>/g, '');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > 120) {
    text = text.substring(0, 117).trim() + '...';
  }
  return text;
}

// ── Main ───────────────────────────────────────────────────────────
async function fetchFeed(feed) {
  console.log(`[RSS] Fetching ${feed.source}...`);
  try {
    const result = await parser.parseURL(feed.url);
    const articles = [];
    for (const item of result.items || []) {
      const url = normalizeUrl(item.link || item.guid || '');
      if (!url) continue;

      const title = cleanTitle(getTextField(item, 'title'));
      const description = cleanDescription(getTextField(item, 'contentSnippet', 'content', 'description', 'summary'));
      const imageRaw = extractImage(item);
      const image = looksLikeImageUrl(imageRaw) ? imageRaw : null;
      const date = parseDate(item);
      const category = categorize(title, description);

      articles.push({
        title,
        date,
        category,
        description,
        url,
        image,
        source: feed.source
      });
    }
    console.log(`[RSS] ${feed.source}: ${articles.length} articles`);
    return articles;
  } catch (err) {
    console.error(`[RSS] ERROR ${feed.source}: ${err.message}`);
    return [];
  }
}

async function main() {
  console.log('==========================================');
  console.log('  PC Builder - RSS News Scraper');
  console.log('==========================================\n');

  const allResults = await Promise.all(FEEDS.map(fetchFeed));
  let combined = allResults.flat();

  console.log(`\nTotal raw articles: ${combined.length}`);

  // Deduplicate by URL
  const seen = new Set();
  combined = combined.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
  console.log(`After dedup: ${combined.length}`);

  // Sort by date descending
  combined.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Keep max
  const final = combined.slice(0, MAX_ARTICLES);
  console.log(`Final selection: ${final.length} articles`);

  // Category stats
  const stats = {};
  final.forEach(a => { stats[a.category] = (stats[a.category] || 0) + 1; });
  console.log('Categories:', stats);

  await writeFile(OUTPUT_FILE, JSON.stringify(final, null, 2), 'utf-8');
  console.log(`\n[WROTE] ${OUTPUT_FILE}`);
  console.log('==========================================');
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
