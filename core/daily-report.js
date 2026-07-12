// ===================================================================
// NAPI ÖNJELENTÉS — a cég reggel magától beszámol Telegramon
// ===================================================================
//
// User-ötlet (2026-07-07): "jó érzés lenne kávé mellé olvasni, mit csinált
// éjjel a cég". A cron minden futáskor meghívja, de csak NAPONTA EGYSZER
// küld, és csak a 07-15 UTC sávban (≈ dél körül ér a userhez) — így a
// hajnali futás nem ébreszt, az esti nem duplikál.
//
// Tartalom: új tartalom (24h), FB-posztok, költés (tegnap + havi),
// fordítás-hiány, kvóta-tiltások, várólistás forrás-javaslatok.
//
// FUTTATÁS:  node core/daily-report.js            (sáv+dedup őrrel)
//            node core/daily-report.js --force    (azonnal, teszthez)
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { sendMessage } from './telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE_PATH = join(ROOT, 'memory', 'daily-report-state.json');
const FORCE = process.argv.includes('--force');
// Havi vész-stop a configból (ne legyen beégetve — user 2026-07-11: 80→40)
let HARD_CAP = 40;
try { HARD_CAP = Number(JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8')).limits?.monthly_budget_usd_hard_cap ?? HARD_CAP); } catch { /* marad az alap */ }

function today() { return new Date().toISOString().slice(0, 10); }

function guard() {
  if (FORCE) return true;
  const h = new Date().getUTCHours();
  if (h < 7 || h > 15) { console.log(`⏭️  Napi jelentés: ${h}h UTC a sávon kívül (7-15) — kihagyom.`); return false; }
  try {
    const s = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    if (s.last_sent === today()) { console.log('⏭️  Napi jelentés: ma már ment — kihagyom.'); return false; }
  } catch { /* nincs állapot — mehet */ }
  return true;
}

function collect() {
  const now = Date.now();
  const h24 = 24 * 3600e3;

  // Új tartalom (24 óra) — a címeket MAGYARUL idézzük (a fordítás-cache-ből),
  // mert a jelentés a magyar Főnöktől jön (user-kérés 2026-07-08)
  let news = 0, guides = 0; const titles = [];
  const artDir = join(ROOT, 'content', 'articles');
  if (existsSync(artDir)) {
    for (const f of readdirSync(artDir).filter(x => x.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(artDir, f), 'utf-8'));
        const pub = new Date(d._meta?.published_at || 0).getTime();
        if (now - pub > h24) continue;
        d._meta?.type === 'guide' ? guides++ : news++;
        if (titles.length < 3) {
          let title = d.original_title || f;
          try {
            const hu = JSON.parse(readFileSync(join(ROOT, 'content', 'translations', f), 'utf-8')).hu || '';
            const m = hu.match(/^title:\s*["']?(.+?)["']?\s*$/m);
            if (m) title = m[1];
          } catch { /* marad az angol, ha még nincs fordítás */ }
          titles.push(title);
        }
      } catch { /* skip */ }
    }
  }

  // FB-posztok (24 óra)
  let fbPosts = 0;
  const socDir = join(ROOT, 'content', 'social');
  if (existsSync(socDir)) {
    for (const f of readdirSync(socDir).filter(x => x.endsWith('.json'))) {
      try {
        const p = JSON.parse(readFileSync(join(socDir, f), 'utf-8'));
        if (p.posted_fb === true && p.posted_at && (now - new Date(p.posted_at).getTime()) < h24) fbPosts++;
      } catch { /* skip */ }
    }
  }

  // Költés (budget-state: days)
  let spentYesterday = 0, spentMonth = 0;
  try {
    const b = JSON.parse(readFileSync(join(ROOT, 'core', 'budget-state.json'), 'utf-8'));
    const days = b.days || {};
    const y = new Date(now - h24).toISOString().slice(0, 10);
    const month = today().slice(0, 7);
    spentYesterday = days[y]?.total || 0;
    for (const [d, v] of Object.entries(days)) if (d.startsWith(month)) spentMonth += v.total || 0;
  } catch { /* skip */ }

  // Fordítás-hiány
  let missing = 0;
  if (existsSync(artDir)) {
    for (const f of readdirSync(artDir).filter(x => x.endsWith('.json'))) {
      let t = {};
      try { t = JSON.parse(readFileSync(join(ROOT, 'content', 'translations', f), 'utf-8')); } catch { /* nincs */ }
      for (const l of ['hu', 'es', 'de', 'fr']) if (!t[l]) missing++;
    }
  }

  // ÚJ eszköz/cég HIVATALOS LINK nélkül (2026-07-12, "model-bővítés legyen
  // automatikus"): ha egy guide tool-jához ÉS cégéhez sincs link a térképben,
  // a gomb nem jelenik meg — ilyenkor itt szólunk, hogy 1 sor bővítés kell.
  let missingLinks = [];
  try {
    const tl = JSON.parse(readFileSync(join(ROOT, 'website', 'tool-links.json'), 'utf-8'));
    const seen = new Set();
    for (const f of readdirSync(artDir).filter(x => x.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(artDir, f), 'utf-8'));
        if (d._meta?.type !== 'guide') continue;
        const md = d.article_markdown || '';
        const strip = (s) => (s || '').trim().replace(/^["']+|["']+$/g, '').trim();
        const tool = strip(d._meta?.tool || (md.match(/^tool:\s*(.*)$/m) || [])[1]);
        const comp = strip(d._meta?.company || (md.match(/^company:\s*(.*)$/m) || [])[1]);
        if ((tl.ignore || []).includes(tool) || (tl.ignore || []).includes(comp)) continue;
        if (!tl.tools[tool] && !tl.companies[comp]) {
          const key = tool || comp;
          if (key && !seen.has(key)) { seen.add(key); missingLinks.push(key); }
        }
      } catch { /* skip */ }
    }
  } catch { /* nincs térkép-fájl */ }

  // Aktív kvóta-tiltások + várólistás forrás-javaslatok
  let bans = 0, pendingSources = 0;
  try {
    const q = JSON.parse(readFileSync(join(ROOT, 'core', 'quota-state.json'), 'utf-8'));
    bans = Object.values(q).filter(v => new Date(v.until) > new Date()).length;
  } catch { /* skip */ }
  try {
    pendingSources = (JSON.parse(readFileSync(join(ROOT, 'agents', 'source-scout', 'discovered-sources.json'), 'utf-8')).discovered_sources || []).length;
  } catch { /* skip */ }

  return { news, guides, titles, fbPosts, spentYesterday, spentMonth, missing, bans, pendingSources, missingLinks };
}

async function main() {
  if (!guard()) return;
  const r = collect();

  const lines = [
    `📊 *Napi jelentés — ${today()}*`,
    ``,
    `📰 Új tartalom (24h): ${r.news} hír + ${r.guides} útmutató`,
    ...r.titles.map(t => `   • ${t.slice(0, 60)}`),
    `📘 Facebook-poszt: ${r.fbPosts}`,
    `💰 Tegnap: $${r.spentYesterday.toFixed(2)} · e havi: $${r.spentMonth.toFixed(2)} / $${HARD_CAP}`,
    `🌍 Fordítás-hiány: ${r.missing} pár${r.bans ? ` · 🚦 kvóta-tiltás: ${r.bans}` : ''}`,
  ];
  if (r.pendingSources > 0) lines.push(`🔭 Jóváhagyásra váró forrás-javaslat: ${r.pendingSources} (írd: "mik a javaslatok?")`);
  if (r.missingLinks?.length) lines.push(`🔗 Hivatalos link nélküli új eszköz: ${r.missingLinks.join(', ')} — a fejlesztő 1 sorral pótolja (tool-links.json)`);
  // Minőség-őr összegzés (chip-szabályok + duplikált linkek) — ha talál valamit
  try {
    const { qualityFindings } = await import('./quality-guard.js');
    const qf = qualityFindings();
    if (qf.length) lines.push(`🧹 Minőség-őr: ${qf.length} találat (pl. ${qf[0].slice(0, 70)}…) — szólj a fejlesztőnek!`);
  } catch { /* az őr hibája ne állítsa meg a jelentést */ }
  lines.push(``, `Minden megy magától. ✅`);

  await sendMessage(lines.join('\n'));
  try { writeFileSync(STATE_PATH, JSON.stringify({ last_sent: today() }, null, 2), 'utf-8'); } catch { /* nem kritikus */ }
  console.log('✅ Napi jelentés elküldve.');
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 NAPI JELENTÉS HIBA:', e); process.exit(1); });
