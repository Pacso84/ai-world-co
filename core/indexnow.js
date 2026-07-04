// ===================================================================
// INDEXNOW — azonnali kereső-értesítés (Bing/Yandex/Seznam/Naver…)
// ===================================================================
//
// A deploy UTÁN hívódik (publisher agent): a FRISS (48 órán belül publikált
// vagy frissített) tartalmak URL-jeit bejelenti az api.indexnow.org-nak,
// mind az 5 nyelvi változatban + a nyelvi főoldalakat. Így az új cikkeket
// a Bing (= a ChatGPT-kereső indexe) percek alatt észreveszi, nem várunk
// a feltérképezésre.
//
// A kulcs a config.json company.indexnow_key — SZÁNDÉKOSAN nyilvános (a
// protokoll a webhelyen kiszolgált kulcsfájllal igazolja a tulajdonjogot).
// A kulcsfájlt (<kulcs>.txt) a website/build.js teszi ki a gyökérbe.
//
// FUTTATÁS önállóan:  node core/indexnow.js            (48 órás friss kör)
//                     node core/indexnow.js --all      (MINDEN URL, első bejelentéshez)
// ===================================================================

import 'dotenv/config';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const LANGS = ['', '/hu', '/es', '/de', '/fr'];   // '' = angol gyökér
const FRESH_HOURS = 48;                            // a 8 órás cron mellé bő ráhagyás

function slugify(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

function titleOf(md, fallback) {
  const m = (md || '').match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m);
  return m ? m[1] : fallback;
}

export async function submitIndexNow({ all = false } = {}) {
  let key = '', site = '';
  try {
    const c = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8')).company || {};
    key = (c.indexnow_key || '').trim();
    site = (c.website_url || '').replace(/\/$/, '');
  } catch { /* lent kezeljük */ }
  if (!key || !site) { console.log('   ⏭️  IndexNow: nincs kulcs/site a configban — kihagyom.'); return { submitted: 0 }; }

  // Friss cikkek összegyűjtése
  const urls = new Set();
  const now = Date.now();
  if (existsSync(ARTICLES_DIR)) {
    for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
        const pub = new Date(d._meta?.published_at || 0).getTime();
        const written = new Date(d._meta?.written_at || 0).getTime();
        if (!all && (now - Math.max(pub, written)) > FRESH_HOURS * 3600e3) continue;
        const slug = slugify(titleOf(d.article_markdown, d.original_title || f));
        for (const lp of LANGS) urls.add(`${site}${lp}/article/${slug}.html`);
      } catch { /* rossz fájl kihagyva */ }
    }
  }
  // Ha van friss tartalom, a listaoldalak is változtak
  if (urls.size > 0 || all) {
    for (const lp of LANGS) { urls.add(`${site}${lp}/`); urls.add(`${site}${lp}/guides.html`); urls.add(`${site}${lp}/tools.html`); }
  }
  if (urls.size === 0) { console.log('   💤 IndexNow: nincs friss URL — nincs bejelentés.'); return { submitted: 0 }; }

  const list = [...urls].slice(0, 10000);   // protokoll-limit
  try {
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: site.replace(/^https?:\/\//, ''),
        key,
        keyLocation: `${site}/${key}.txt`,
        urlList: list
      }),
      signal: AbortSignal.timeout(20000)
    });
    // 200 = feldolgozva, 202 = elfogadva (első alkalommal tipikus, amíg a kulcsot ellenőrzi)
    if (r.status === 200 || r.status === 202) {
      console.log(`   📣 IndexNow: ${list.length} URL bejelentve (HTTP ${r.status})`);
      return { submitted: list.length };
    }
    console.log(`   ⚠️ IndexNow HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  } catch (e) {
    console.log(`   ⚠️ IndexNow hiba (nem kritikus): ${e.message.slice(0, 80)}`);
  }
  return { submitted: 0 };
}

// Önálló futtatás
if (process.argv[1] && process.argv[1].endsWith('indexnow.js')) {
  submitIndexNow({ all: process.argv.includes('--all') }).then(() => process.exit(0));
}
