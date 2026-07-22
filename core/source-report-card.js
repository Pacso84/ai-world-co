// ===================================================================
// FORRÁS-BIZONYÍTVÁNY (2026-07-22, user: "kéne a hírforrásokat is osztályozni
// mert ha nincs infó minek nézzük, meg ha megbízhatatlan vagy valótlan dolgokat
// közölnek automatikusan töröljük őket")
//
// Minden forrás 3 jegyet kap:
//   1) FRISSESSÉG  — mikor volt a feed utolsó cikke (élő lekérdezésből)
//   2) TERMÉS      — hány publikált cikkünk született belőle (30 nap)
//   3) MEGBÍZHATÓSÁG — hányszor blokkolta a hitelesség-kapu a belőle írt cikket
//
// USER-DÖNTÉS a beavatkozásról: ami EGYÉRTELMŰ, azt a rendszer magától elintézi;
// ami ítélet kérdése, arra csak JAVASLATOT tesz:
//   • halott feed (>365 nap néma)        → AUTOMATIKUS kikapcsolás
//   • valótlant közöl (kapu-blokkok)     → AUTOMATIKUS kikapcsolás
//   • él, de sosem termel                → csak jelzés, a user dönt
//
// KIKAPCSOLÁS, NEM TÖRLÉS (enabled:false): visszafordítható, és megmarad a
// forrás története. Újraindult forrást egy sor átírásával vissza lehet hozni.
// ===================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FEEDS_PATH = join(ROOT, 'sources', 'rss-feeds.json');
const STATS_PATH = join(ROOT, 'sources', 'source-stats.json');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const REJECTED_DIR = join(ROOT, 'content', 'rejected');

// --- Küszöbök (egy helyen hangolhatók) ---
export const DEAD_FEED_DAYS = 365;   // ennél régebben néma feed = HALOTT (auto-kikapcsolás)
// ELAVULT sáv (2026-07-22, éles lelet): az Alibaba Qwen feedje 303 napja néma volt,
// MÉGIS 5 "friss hírt" írtunk belőle 30 nap alatt — vagyis 10 hónapos anyagot adtunk
// ki újdonságként. A 365-ös halott-küszöb ezt átengedte. Ez a köztes sáv elkapja, de
// NEM kapcsol ki magától (lehet ritkán posztoló, mégis értékes hivatalos blog).
export const STALE_FEED_DAYS = 120;
export const MIN_SAMPLE = 4;         // ennyi cikk alatt NEM minősítünk megbízhatatlannak
export const BAD_RATIO = 0.5;        // a kapu ennyi hányadát blokkolta = valótlant közöl
export const ZERO_YIELD_DAYS = 30;   // ennyi nap 0 cikk = "nem termel" (csak javaslat)

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const daysAgo = (n) => iso(Date.now() - n * DAY);

// ===================================================================
// DÖNTÉSI LOGIKA — tiszta függvény, hálózat és fájl nélkül (tesztelhető)
// ===================================================================
export function judgeSource(m) {
  // m: { feedAgeDays, published30d, truthBlocks, totalAttempts, alreadyDisabled }
  if (m.alreadyDisabled) return { verdict: 'disabled', auto: false, reason: 'már ki van kapcsolva' };

  if (m.feedAgeDays != null && m.feedAgeDays > DEAD_FEED_DAYS) {
    return {
      verdict: 'dead', auto: true,
      reason: `halott feed — ${Math.round(m.feedAgeDays)} napja nincs új cikk`
    };
  }

  // Megbízhatatlan: a hitelesség-kapu a cikkei ÉRDEMI hányadát blokkolta.
  // MIN_SAMPLE alatt nem ítélünk (egy-két rossz cikk még nem tendencia).
  if (m.totalAttempts >= MIN_SAMPLE && m.truthBlocks / m.totalAttempts >= BAD_RATIO) {
    return {
      verdict: 'unreliable', auto: true,
      reason: `valótlan tartalom — ${m.truthBlocks}/${m.totalAttempts} cikkét blokkolta a hitelesség-kapu`
    };
  }

  // ELAVULT, mégis írunk belőle: ez a legveszélyesebb csendes hiba — régi anyagot
  // adunk ki friss hírként. Nem kapcsoljuk ki magunktól, de HANGOSAN jelezzük.
  if (m.feedAgeDays != null && m.feedAgeDays > STALE_FEED_DAYS && m.published30d > 0) {
    return {
      verdict: 'stale', auto: false,
      reason: `⚠️ a feed ${Math.round(m.feedAgeDays)} napja néma, mégis ${m.published30d} "friss" cikket írtunk belőle — régi anyag újdonságként!`
    };
  }

  // Él, de nem termel: NEM kapcsoljuk ki magunktól (lehet, hogy a mi
  // válogatásunk hibája, nem a forrásé) — csak javasoljuk.
  if (m.published30d === 0) {
    return {
      verdict: 'no-yield', auto: false,
      reason: `él, de ${ZERO_YIELD_DAYS} napja egy cikket sem adott — érdemes megnézni`
    };
  }

  return { verdict: 'ok', auto: false, reason: '' };
}

// ===================================================================
// ADATGYŰJTÉS
// ===================================================================
function readJson(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return fallback; }
}

// Publikált + elutasított cikkek forrásonként (a kapu-blokk külön számolva)
export function collectArticleStats() {
  const since = daysAgo(ZERO_YIELD_DAYS);
  const per = {};
  const bump = (id, key) => {
    if (!id || id === 'guide') return;
    per[id] = per[id] || { published30d: 0, truthBlocks: 0, totalAttempts: 0, lastArticle: '' };
    per[id][key]++;
  };

  if (existsSync(ARTICLES_DIR)) {
    for (const f of readdirSync(ARTICLES_DIR)) {
      if (!f.startsWith('ARTICLE_')) continue;
      const d = readJson(join(ARTICLES_DIR, f), null); if (!d) continue;
      const id = d._meta?.source_id, at = (d._meta?.published_at || '').slice(0, 10);
      if (!id || id === 'guide') continue;
      per[id] = per[id] || { published30d: 0, truthBlocks: 0, totalAttempts: 0, lastArticle: '' };
      per[id].totalAttempts++;
      if (at > per[id].lastArticle) per[id].lastArticle = at;
      if (at >= since) per[id].published30d++;
    }
  }

  if (existsSync(REJECTED_DIR)) {
    for (const f of readdirSync(REJECTED_DIR)) {
      if (!f.endsWith('.json')) continue;
      const d = readJson(join(REJECTED_DIR, f), null); if (!d) continue;
      const id = d._meta?.source_id;
      if (!id || id === 'guide') continue;
      bump(id, 'totalAttempts');
      // A hitelesség-kapu blokkja felismerhető a bíráló verdiktjéből
      const verdict = String(d._meta?.ai_review?.verdict || '');
      if (verdict.startsWith('Hitelesség-kapu blokkolta')) bump(id, 'truthBlocks');
    }
  }
  return per;
}

// A feed LEGFRISSEBB cikkének kora napokban (null = nem sikerült megállapítani)
export async function feedAgeDays(url, fetchFn = fetch) {
  try {
    const r = await fetchFn(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIWorldBot/1.0)' }
    });
    if (!r.ok) return null;
    const t = await r.text();
    const dates = [...t.matchAll(/<(?:pubDate|updated|published|dc:date)>([^<]+)</g)]
      .map(m => new Date(m[1])).filter(d => !isNaN(d));
    if (!dates.length) return null;
    return (Date.now() - Math.max(...dates.map(d => d.getTime()))) / DAY;
  } catch { return null; }
}

// ===================================================================
// FŐ FUTÁS
// ===================================================================
export async function runReportCard({ dryRun = false, fetchFn = fetch } = {}) {
  const feeds = readJson(FEEDS_PATH, null);
  if (!feeds?.sources) throw new Error('sources/rss-feeds.json nem olvasható');
  const arts = collectArticleStats();

  const card = {};
  const autoDisabled = [], proposals = [];

  for (const s of feeds.sources) {
    const a = arts[s.id] || { published30d: 0, truthBlocks: 0, totalAttempts: 0, lastArticle: '' };
    const age = s.enabled === false ? null : await feedAgeDays(s.url, fetchFn);
    const m = {
      feedAgeDays: age,
      published30d: a.published30d,
      truthBlocks: a.truthBlocks,
      totalAttempts: a.totalAttempts,
      alreadyDisabled: s.enabled === false
    };
    const j = judgeSource(m);
    card[s.id] = {
      name: s.name, ...m,
      feedAgeDays: age == null ? null : Math.round(age),
      lastArticle: a.lastArticle || null,
      verdict: j.verdict, reason: j.reason
    };

    if (j.auto && s.enabled !== false) {
      autoDisabled.push({ id: s.id, name: s.name, reason: j.reason });
      card[s.id].disabledNow = true;
      if (!dryRun) {
        s.enabled = false;
        s.disabled_at = iso(Date.now());
        s.disabled_reason = j.reason;
      }
    } else if (j.verdict === 'no-yield' || j.verdict === 'stale') {
      proposals.push({ id: s.id, name: s.name, reason: j.reason });
    }
  }

  if (!dryRun) {
    // Csak akkor írunk, ha tényleg változott valami (ne zajongjon a git)
    if (autoDisabled.length) {
      JSON.parse(JSON.stringify(feeds));               // épség-ellenőrzés írás előtt
      writeFileSync(FEEDS_PATH, JSON.stringify(feeds, null, 2) + '\n', 'utf-8');
    }
    writeFileSync(STATS_PATH, JSON.stringify({
      _meta: {
        note: 'Forrás-bizonyítvány: frissesség + termés + megbízhatóság forrásonként. Gyártja: core/source-report-card.js',
        updated: new Date().toISOString(),
        thresholds: { DEAD_FEED_DAYS, MIN_SAMPLE, BAD_RATIO, ZERO_YIELD_DAYS }
      },
      sources: card
    }, null, 2) + '\n', 'utf-8');
  }

  return { card, autoDisabled, proposals };
}

// A napi riport sora (üres string = nincs mondanivaló)
export function reportLine({ autoDisabled, proposals }) {
  const parts = [];
  if (autoDisabled.length) {
    parts.push(`🚫 Forrás KIKAPCSOLVA (${autoDisabled.length}): ` +
      autoDisabled.map(d => `${d.name.replace(/\s*\(hivatalos\)$/, '')} — ${d.reason}`).join(' · '));
  }
  const stale = proposals.filter(p => /néma, mégis/.test(p.reason));
  const idle = proposals.filter(p => !/néma, mégis/.test(p.reason));
  if (stale.length) {
    parts.push('⚠️ ELAVULT forrásból írunk (' + stale.length + '): ' +
      stale.map(p => p.name.replace(/s*(hivatalos)$/, '') + ' — ' + p.reason.replace('⚠️ ', '')).join(' · '));
  }
  if (idle.length) {
    parts.push('🔎 Nem termel (' + idle.length + '): ' +
      idle.map(p => p.name.replace(/s*(hivatalos)$/, '')).join(', ') +
      ' — érdemes megnézni, kell-e még');
  }
  return parts.join('\n');
}

// A napi riportnak: a MÁR KIÍRT bizonyítványból építi a sort (nincs hálózat).
// Így a riport gyors marad, a mérést a külön futó lépés végzi.
export function reportLineFromFile() {
  const st = readJson(STATS_PATH, null);
  if (!st?.sources) return '';
  const autoDisabled = [], proposals = [];
  for (const [id, c] of Object.entries(st.sources)) {
    if (!c || !c.verdict) continue;
    if ((c.verdict === 'dead' || c.verdict === 'unreliable') && c.disabledNow) {
      autoDisabled.push({ id, name: c.name || id, reason: c.reason });
    } else if (c.verdict === 'stale' || c.verdict === 'no-yield') {
      proposals.push({ id, name: c.name || id, reason: c.reason });
    }
  }
  return reportLine({ autoDisabled, proposals });
}

// CLI: node core/source-report-card.js [--dry-run]
if (process.argv[1] && process.argv[1].endsWith('source-report-card.js')) {
  const dryRun = process.argv.includes('--dry-run');
  runReportCard({ dryRun }).then(({ card, autoDisabled, proposals }) => {
    console.log(`📋 FORRÁS-BIZONYÍTVÁNY${dryRun ? ' (PRÓBA — nem írok semmit)' : ''}`);
    console.log('─'.repeat(60));
    for (const [id, c] of Object.entries(card).sort((a, b) => b[1].published30d - a[1].published30d)) {
      const icon = { ok: '✅', dead: '💀', unreliable: '🛑', 'no-yield': '🔎', stale: '⚠️', disabled: '⏸️' }[c.verdict] || '·';
      console.log(`${icon} ${id.padEnd(20).slice(0, 20)} 30nap:${String(c.published30d).padStart(3)}  feed:${c.feedAgeDays == null ? '  ?' : String(c.feedAgeDays).padStart(3) + 'n'}  kapu-blokk:${c.truthBlocks}/${c.totalAttempts}  ${c.reason}`);
    }
    console.log('─'.repeat(60));
    console.log(reportLine({ autoDisabled, proposals }) || '(nincs teendő)');
  }).catch(e => { console.error('❌', e.message); process.exit(1); });
}
