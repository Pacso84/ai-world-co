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
import { canonicalChip } from './quality-guard.js';

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

  // Új tartalom — NAPTÁRI NAP szerint (2026-07-23 fix, user: "nincs 16 hír mára").
  // Régen 24 ÓRÁS gördülő ablak volt, ami "most"-hoz képest nézett vissza — így
  // átnyúlt a TEGNAP ESTI futásba, és a napi 8-as plafon ellenére 16-ot mutatott
  // (7 tegnap este + 9 ma). A user "Napi jelentés — MA" fejlécet olvas, tehát a
  // szám a MAI napra vonatkozzon. (A dél körül futó jelentés a mai éjszakai +
  // reggeli futást fogja; a délutáni futás tartalma az oldalon ott van.)
  const dayStr = today();
  let news = 0, guides = 0; const titles = [];
  const artDir = join(ROOT, 'content', 'articles');
  if (existsSync(artDir)) {
    for (const f of readdirSync(artDir).filter(x => x.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(artDir, f), 'utf-8'));
        if ((d._meta?.published_at || '').slice(0, 10) !== dayStr) continue;
        // Útmutató: a _meta.type MINDIG megbízható a guide-oknál; a hír-cikkeknek
        // nincs type mezőjük — a fájlnév-előtag a biztos tartalék (2026-07-23).
        (d._meta?.type === 'guide' || f.startsWith('ARTICLE_GUIDE')) ? guides++ : news++;
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
        // Frontmatter az elsődleges — a build is azt mutatja; kanonikus névvel
        // keresünk linket, hogy ne legyen hamis "nincs link" riasztás (2026-07-13)
        const comp = strip((md.match(/^company:\s*(.*)$/m) || [])[1] || d._meta?.company);
        const tool = canonicalChip((md.match(/^tool:\s*(.*)$/m) || [])[1] || d._meta?.tool, comp);
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
    `📰 Új tartalom ma: ${r.news} hír + ${r.guides} útmutató`,
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
  // Önjavító napló (2026-07-13): amit a cég MAGÁTÓL kijavított, arról csak
  // beszámol — ehhez már nem kell emberi kéz.
  try {
    const flog = JSON.parse(readFileSync(join(ROOT, 'memory', 'quality-fix-log.json'), 'utf-8'));
    const tf = flog[today()] || [];
    if (tf.length) lines.push(`🔧 Önjavító: ${tf.length} hibát magamtól kijavítottam (pl. ${tf[0].slice(0, 60)}…)`);
  } catch { /* még nincs javítás-napló */ }
  // HAVI VÉSZFÉK-ÁLLAPOT (2026-07-19, user-döntés: cap-nél tiszta szünet):
  // ha a havi keret betelt, a riport mondja meg, mi van és mikor indul újra.
  try {
    const { meteredBlocked } = await import('./budget.js');
    const mb = meteredBlocked();
    if (mb.blocked && mb.hard) {
      const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().slice(0, 10);
      lines.push(`⛔ Havi költségkeret elérve ($${HARD_CAP}) — a cég SZÜNETEL a hónap végéig. Az oldal él; ${nextMonth}-én magától újraindul (MiniMax-tervvel olcsóbban).`);
    }
  } catch { /* budget-őr nélkül is megy a riport */ }
  // KÖZELI-TÉMA-ŐR összegzés (2026-07-18): hány ismétlődő útmutató-témát
  // szűrtünk ki, mielőtt megíródott volna.
  try {
    const dlog = JSON.parse(readFileSync(join(ROOT, 'memory', 'topic-dedup-log.json'), 'utf-8'));
    const dd = dlog[today()] || [];
    if (dd.length) lines.push(`🔁 Ismétlődő téma kiszűrve: ${dd.length} (pl. „${(dd[0].rejected || '').slice(0, 45)}” ≈ „${(dd[0].closest || '').slice(0, 45)}”)`);
  } catch { /* még nincs dedup-napló */ }
  // HITELESSÉG-KAPU összegzés (2026-07-16): mit fogott a publikálás előtti
  // hallucináció-szűrő — blokk = rejected-be ment, hold = bíró-hiba, várakozik.
  try {
    const tlog = JSON.parse(readFileSync(join(ROOT, 'memory', 'truth-gate-log.json'), 'utf-8'));
    const tt = tlog[today()] || [];
    const blocked = tt.filter(x => x.action === 'block'), held = tt.filter(x => x.action === 'hold');
    if (blocked.length || held.length) {
      const sample = (blocked[0] || held[0])?.reasons?.[0] || '';
      lines.push(`🛡️ Hitelesség-kapu: ${blocked.length} blokkolva · ${held.length} visszatartva (pl. ${sample.slice(0, 70)}…)`);
    }
  } catch { /* még nincs kapu-napló */ }
  // MAKE-ŐRSZEM (2026-07-15, a 9 napos néma FB-leállás tanulsága): a webhook
  // válaszából NEM látszik, ha a Make-forgatókönyv áll (200-zal nyeli a sorba) —
  // ezért közvetlenül a Make API-tól kérdezzük. Csak BAJ esetén szól.
  // 2026-07-27 BŐVÍTÉS: az "aktív?" kérdés NEM elég. A Pinterest-forgatókönyv
  // AKTÍV volt, de CSAK a webhook-modult tartalmazta — a Make 200-zal nyelte a
  // pineket, amiket mi "kiküldve"-nek jelöltünk, és 38 pin némán elveszett.
  // A `usedPackages` mező elárulja, mi van benne: ["gateway"] = csak a webhook,
  // kimeneti modul nélkül. Ezt is figyeljük, mindkét csatornán.
  try {
    if (process.env.MAKE_API_TOKEN) {
      const WATCH = [
        { id: '6452490', pkg: 'facebook-pages', name: 'FB-POSZTOLÓ', fix: 'Facebook Pages → Upload a Photo' },
        { id: process.env.PINTEREST_MAKE_SCENARIO_ID || '6701833', pkg: 'pinterest', name: 'PINTEREST-POSZTOLÓ', fix: 'Pinterest → Create a Pin' }
      ];
      for (const w of WATCH) {
        const mr = await fetch(`https://eu1.make.com/api/v2/scenarios/${w.id}`, { headers: { Authorization: 'Token ' + process.env.MAKE_API_TOKEN }, signal: AbortSignal.timeout(15000) });
        const mj = await mr.json().catch(() => ({}));
        if (!mr.ok || !mj.scenario) continue;
        const s = mj.scenario;
        if (s.isActive === false || s.isPaused === true) {
          lines.push(`⛔ ${w.name} LEÁLLT (Make-forgatókönyv inaktív)! Kapcsold vissza: eu1.make.com → Scenarios → kapcsoló a sor végén.`);
        } else if (!(s.usedPackages || []).includes(w.pkg)) {
          lines.push(`⛔ ${w.name}: a Make-forgatókönyv HIÁNYOS — nincs benne kimeneti modul (csak: ${(s.usedPackages || []).join(', ') || '—'}). A webhook 200-at ad, de SEMMI nem megy ki! Javítás: eu1.make.com → a forgatókönyv → + → ${w.fix} → mentés.`);
        }
      }
    }
  } catch { /* a Make-őr hibája nem állítja meg a jelentést */ }
  // SEO-ŐRSZEM (2026-07-27): a kanonikus URL / rögzített slug / sitemap
  // visszaesését jelezzük. Csendes, ha nincs baj — a user így tudja, hogy a
  // Search Console-ban jelzett hibák nem jönnek vissza észrevétlenül.
  try {
    const seo = JSON.parse(readFileSync(join(ROOT, 'memory', 'seo-guard.json'), 'utf-8'));
    if (seo.problems?.length) {
      lines.push(`🔍 SEO-ŐRSZEM: ${seo.problems.length} lelet — ${seo.problems.slice(0, 2).map(p => p.code).join(', ')}${seo.problems.length > 2 ? '…' : ''}. Részletek a futás naplójában.`);
    }
  } catch { /* még nincs SEO-lelet vagy nem futott — nem baj */ }

  // ÉLŐ-ŐRSZEM (2026-07-31): a kintről-befelé nézés leletei. Csendes, ha
  // minden rendben; hangos, ha az ÉLŐ oldal máshogy viselkedik, mint amit
  // gyártottunk (www/http, 404, canonical, H1, sitemap). Ez a réteg fogja
  // meg a kiszolgálói-beállítás szintű hibákat, amiket a fájl-alapú őrök nem.
  try {
    const lg = JSON.parse(readFileSync(join(ROOT, 'memory', 'live-guard.json'), 'utf-8'));
    if (lg.problems?.length) {
      lines.push(`🌐 ÉLŐ-ŐRSZEM: ${lg.problems.length} lelet — ${lg.problems.slice(0, 2).map(p => p.code).join(', ')}${lg.problems.length > 2 ? '…' : ''}`);
    }
  } catch { /* még nem futott — nem baj */ }

  // HÁZMESTER (2026-07-30): mit takarított el, és hízik-e valami vissza.
  // CSENDES a hétköznapokon: napi pár régi napló törlése nem hír. Csak akkor
  // szólal meg, ha ÉRDEMI takarítás történt (kép/fordítás/embedding), vagy ha
  // a beépített őrszem szerint valami újra nőni kezdett — ez utóbbi a fontos,
  // mert pont az a hiba, ami fél évig észrevétlen marad.
  try {
    const hk = JSON.parse(readFileSync(join(ROOT, 'memory', 'housekeeping.json'), 'utf-8'));
    const worth = (hk.actions || []).filter(a => !a.startsWith('📄'));
    if (worth.length) lines.push('🧹 HÁZMESTER: ' + worth.join(' · '));
  } catch { /* nem futott — nem baj */ }

  // FORRÁS-BIZONYÍTVÁNY (2026-07-22): a külön lépés által kiírt osztályzatokból.
  // Csendes, ha nincs teendő; hangos, ha forrást kapcsoltunk ki vagy elavultból írunk.
  try {
    const { reportLineFromFile } = await import('./source-report-card.js');
    const srcLine = reportLineFromFile();
    if (srcLine) lines.push(srcLine);
  } catch { /* a riport ettől még kimegy */ }

  // ÜGYFÉLSZOLGÁLAT (2026-07-20): napi darabszámok a Workerből (💬 sor).
  // Csak akkor szól, ha volt forgalom — csendes, ha 0.
  try {
    const exportKey = (process.env.FEEDBACK_EXPORT_KEY || '').trim();
    if (exportKey) {
      const cr = await fetch('https://aiworld-telegram.pacsi84.workers.dev/feedback-export',
        { headers: { 'X-Export-Key': exportKey }, signal: AbortSignal.timeout(15000) });
      if (cr.ok) {
        const cs = (await cr.json()).__cs || {};
        const total = (cs.chat || 0) + (cs.mail || 0);
        if (total + (cs.esc || 0) > 0) lines.push(`💬 Ügyfélszolgálat ma: ${cs.chat || 0} chat-válasz · ${cs.mail || 0} email · ${cs.esc || 0} emberi kézbe adva`);
      }
    }
  } catch { /* a riport ettől még kimegy */ }

  // Hierarchia-műszerfal (2026-07-13): visszaadások + főnöki döntések + tanulságok
  try {
    const { handbackStats } = await import('./handback.js');
    const hb = handbackStats();
    if (hb.open + hb.deliveredToday + hb.escalated > 0)
      lines.push(`↩️ Visszaadott munkák: ${hb.deliveredToday} kézbesítve ma · ${hb.open} nyitott · ${hb.escalated} a Főnök asztalán`);
  } catch { /* iroda nélkül is megy */ }
  try {
    const dlog = JSON.parse(readFileSync(join(ROOT, 'memory', 'ceo-desk-log.json'), 'utf-8'));
    const td = dlog[today()] || [];
    if (td.length) lines.push(`👔 Főnöki döntés ma: ${td.length} (pl. ${td[0].slice(0, 70)}…)`);
  } catch { /* még nincs asztal-napló */ }
  try {
    const store = JSON.parse(readFileSync(join(ROOT, 'memory', 'store.json'), 'utf-8'));
    const todays = (store.items || []).filter(it => (it.created || '').startsWith(today())).length;
    if (todays) lines.push(`📖 Új tanulság ma: ${todays} — a cég minden tagja látja a következő munkájánál`);
    // ♻️ ISMÉTLŐDŐ HIBA (2026-07-19, user: "ne forduljon elő még egyszer —
    // nem költséghatékony"): ha egy hiba a MÁR MEGLÉVŐ lecke ellenére ma újra
    // megtörtént, az a jel, hogy kemény kód-szabály kell — szólunk hangosan.
    const rep = (store.items || []).filter(it => (it.lastRepeat || '').startsWith(today()));
    if (rep.length) {
      const worst = rep.sort((a, b) => (b.repeats || 0) - (a.repeats || 0))[0];
      lines.push(`♻️ ISMÉTLŐDŐ hiba a lecke ellenére: ${rep.length} típus ma (legmakacsabb ${worst.repeats}×: [${worst.scope}] ${worst.text.slice(0, 60)}…) — kemény szabály kellhet, szólj a fejlesztőnek!`);
    }
  } catch { /* könyv nélkül is megy */ }
  lines.push(``, `Minden megy magától. ✅`);

  // A TELJES riport a CI-naplóba is (2026-07-31, user: "te is olvasd el
  // mindig a telegramot, ne csak a rendszert ellenőrizd"). Eddig csak az
  // "elküldve" sor látszott a naplóban — a fejlesztő-asszisztens a nyers
  // állapotfájlokat nézte, nem azt, amit a user TÉNYLEGESEN kap. Mostantól
  // a napló őrzi a szó szerinti üzenetet, így visszaolvasható.
  console.log('── A MA KIKÜLDÖTT RIPORT ──────────────────────────');
  console.log(lines.join('\n'));
  console.log('───────────────────────────────────────────────────');

  await sendMessage(lines.join('\n'));
  try { writeFileSync(STATE_PATH, JSON.stringify({ last_sent: today() }, null, 2), 'utf-8'); } catch { /* nem kritikus */ }
  console.log('✅ Napi jelentés elküldve.');
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 NAPI JELENTÉS HIBA:', e); process.exit(1); });
