// ===================================================================
// FORRÁS-BIZONYÍTVÁNY (2026-07-22, user: "kéne a hírforrásokat is osztályozni
// mert ha nincs infó minek nézzük, meg ha megbízhatatlan vagy valótlan dolgokat
// közölnek automatikusan töröljük őket")
//
// Minden forrás 3 jegyet kap:
//   1) FRISSESSÉG  — mikor volt a feed utolsó cikke (élő lekérdezésből)
//   2) TERMÉS      — hány publikált cikkünk született belőle (30 nap)
//   3) MEGBÍZHATÓSÁG — hány cikkét fogta meg a hitelesség-kapu (14 napos ablak,
//      a TARTÓS memory/truth-gate-log.json-ból — lásd TRUTH_WINDOW_DAYS)
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
const TRUTH_LOG_PATH = join(ROOT, 'memory', 'truth-gate-log.json');

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

// MEGBÍZHATÓSÁGI ABLAK (2026-08-30) — MIÉRT PONT 14 NAP?
// Két korlát metszete, nem szabad kéz:
//   1) A FORRÁS: a `memory/truth-gate-log.json`-t a `logGate()` írja, és
//      `Object.keys(log).sort().slice(-14)` — vagyis LEGFELJEBB 14 nap-kulcsot
//      őriz. Ennél hosszabb ablakon a hiányzó napokat NEM tudnánk megkülönböztetni
//      a "nem volt blokk" naptól: a "nincs adat" némán "tiszta forrás"-nak
//      látszana. Az ablak tehát nem lehet hosszabb, mint amit a napló GARANTÁL.
//   2) AZ ARÁNY ÉRTELME: az "ismétlődő hiba 4×" riport-sor leckéje (2026-08-03)
//      épp az volt, hogy a szám a lecke TELJES ÉLETTARTAMÁRA összegzett, és
//      ezért sürgetőnek látszott. Élettartam-összeg helyett kell a friss kép:
//      egy forrás, ami FÉL ÉVE rontott, ma nem megbízhatatlan.
// ⚠️ A SZÁMLÁLÓ ÉS A NEVEZŐ UGYANARRA AZ ABLAKRA VONATKOZIK. Ha a blokkokat
// 14 napra, a próbálkozásokat viszont az összes valaha kiadott cikkre néznénk,
// az arány mindig a nulla felé húzna — pontosan az a csendes elnémulás, amit
// ez a javítás megszüntet.
export const TRUTH_WINDOW_DAYS = 14;

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);

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
      // ⚠️ AZ IDŐTÁV IS KIMEGY. A napi riport "ismétlődő hiba 4×" sorának leckéje
      // (2026-08-06): időtáv nélkül a szám vagy sürgetőbbnek, vagy jelentéktelenebbnek
      // látszik a valóságnál. Itt ráadásul a szomszédos "30nap" oszlop MÁS ablak.
      reason: `valótlan tartalom — ${m.truthBlocks}/${m.totalAttempts} cikkét blokkolta a hitelesség-kapu (utolsó ${TRUTH_WINDOW_DAYS} nap)`
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

// -------------------------------------------------------------------
// FÁJLNÉV → FORRÁS. A kapu-napló CSAK a fájlnevet őrzi (`logGate({ file })`),
// forrás-azonosítót nem — a piszkozat pedig a döntés után eltűnik a lemezről,
// úgyhogy utólag nincs honnan kiolvasni. Szerencsére a név maga hordozza:
// az rss-scraper `${timestamp}_${feedConfig.id}_${safeTitle}.json`-t ad
// (agents/rss-scraper/agent.js:257), az Ellenőrző pedig csak az előtagot
// cseréli (WRITER_ → ARTICLE_ / REJECTED_), tehát az ALAPNÉV végig ugyanaz.
// A `safeTitle` minden nem [a-z0-9-] karaktert `_`-ra cserél, a forrás-id-k
// viszont kötőjelesek — így az időbélyeg utáni ELSŐ szelet pontosan az id.
// Szigorúan illesztjük az időbélyeget: ami nem így néz ki, az `null` (inkább
// ne mérjünk, mint hogy egy cikk-címet forrásnak higgyünk).
// -------------------------------------------------------------------
export function sourceIdFromFile(file) {
  const s = String(file || '').replace(/^(WRITER_|REJECTED_|ARTICLE_)/, '');
  if (s.startsWith('GUIDE_')) return 'guide';        // útmutató: nincs hírforrása
  const m = s.match(/^\d{4}-\d{2}-\d{2}T[\d-]+Z_([^_]+)/);
  return m ? (m[1].replace(/\.json$/, '') || null) : null;
}

/** Az összetartozó piszkozat/cikk/elutasítás KÖZÖS alapneve. */
const baseName = (file) => String(file || '').replace(/^(WRITER_|REJECTED_|ARTICLE_)/, '');

// -------------------------------------------------------------------
// TERMÉS + MEGBÍZHATÓSÁG forrásonként.
//
// 🩹 JAVÍTÁS (2026-08-30): a `truthBlocks` KORÁBBAN a `content/rejected/` mappa
// PILLANATNYI tartalmát számolta. Azt a mappát a CEO/rework lánc folyamatosan
// ÜRÍTI (agents/ceo/agent.js), tehát a számláló egy olvadó hókupacot mért.
// Mérve 2026-08-30-án: a napló 14 nap-kulcsán 29 blokk állt, a `rejected/`
// mappában 4 fájl (a legfiatalabb JÚLIUSI), a bizonyítványban pedig ÖSSZESEN
// 1 blokk — 57 forrásra. Az "AUTO enabled:false" szabály emiatt
// gyakorlatilag halott volt: elérhetetlen volt a 0,5-ös arány.
// Azóta a TARTÓS `memory/truth-gate-log.json`-ból dolgozunk.
//
// A MÉRCE (mindkét oldal ugyanarra a TRUTH_WINDOW_DAYS ablakra):
//   truthBlocks   = hány KÜLÖNBÖZŐ cikkét fogta meg a hitelesség-kapu
//   totalAttempts = hány KÜLÖNBÖZŐ cikke jutott el a kapuig egyáltalán
//                   (= a megfogottak ∪ az ablakban megjelentek)
// Miért halmaz, és nem összeadás? Két csapda:
//   • Egy cikket a rework után a kapu MÁSODSZOR is megfoghat (élesben megtörtént:
//     az openai-blog 7 naplósora 6 cikk volt). Külön számolva a JAVÍTÁSI KÍSÉRLET
//     rontaná a forrás jegyét.
//   • A megfogott cikk átírás után rendszerint KI IS MEGY (élesben az ablakban
//     14-ből 14). Ha a blokkot és a megjelenést két próbálkozásnak vennénk, a
//     nevező feleslegesen duplázódna, és az arány megint a nulla felé húzna.
// A `hold` NEM blokk: az azt jelenti, hogy a MI AI-bíránk volt elérhetetlen —
// az nem a forrás hibája (core/truth-gate.js:174 környéke).
//
// A paraméterek azért injektálhatók, hogy a teszt valódi fájlok írása NÉLKÜL
// tudjon élethű helyzetet előállítani. `truthLog: undefined` = olvasd a naplót.
// -------------------------------------------------------------------
export function collectArticleStats({
  articlesDir = ARTICLES_DIR,
  truthLog,
  now = Date.now()
} = {}) {
  const sinceYield = iso(now - ZERO_YIELD_DAYS * DAY);
  const sinceTruth = iso(now - TRUTH_WINDOW_DAYS * DAY);
  const log = truthLog === undefined ? readJson(TRUTH_LOG_PATH, {}) : (truthLog || {});

  const per = {};
  const get = (id) => (per[id] = per[id] || {
    published30d: 0, truthBlocks: 0, totalAttempts: 0, lastArticle: '',
    _blocked: new Set(), _reached: new Set()
  });

  // 1) A KAPU NAPLÓJA — nap-kulcsos objektum, minden nap alatt bejegyzés-tömb.
  for (const [day, entries] of Object.entries(log)) {
    if (!Array.isArray(entries) || day < sinceTruth) continue;
    for (const e of entries) {
      if (!e || e.action !== 'block') continue;      // a `hold` nem a forrás hibája
      const id = sourceIdFromFile(e.file);
      if (!id || id === 'guide') continue;
      get(id)._blocked.add(baseName(e.file));
    }
  }

  // 2) A MEGJELENT CIKKEK — a forrást itt a `_meta.source_id` mondja meg
  //    (az a hiteles), a dedup kulcsa viszont az alapnév, hogy a naplóbeli
  //    blokkal össze tudjon esni.
  if (existsSync(articlesDir)) {
    for (const f of readdirSync(articlesDir)) {
      if (!f.startsWith('ARTICLE_')) continue;
      const d = readJson(join(articlesDir, f), null); if (!d) continue;
      const id = d._meta?.source_id, at = (d._meta?.published_at || '').slice(0, 10);
      if (!id || id === 'guide') continue;
      const a = get(id);
      if (at > a.lastArticle) a.lastArticle = at;
      if (at >= sinceYield) a.published30d++;
      if (at >= sinceTruth) a._reached.add(baseName(f));
    }
  }

  for (const a of Object.values(per)) {
    a.truthBlocks = a._blocked.size;
    a.totalAttempts = new Set([...a._blocked, ...a._reached]).size;
    delete a._blocked; delete a._reached;
  }
  return per;
}

// A napló LEFEDETTSÉGE — a magyar helyesírás-őrszem leckéje: a "0 hiba" csak
// akkor hír, ha az is látszik, MENNYIT nézett meg. Enélkül az elnémult napló
// és a hibátlan hét kívülről egyformán néz ki.
export function truthLogCoverage(log = readJson(TRUTH_LOG_PATH, {})) {
  const days = Object.keys(log || {}).filter(d => Array.isArray(log[d])).sort();
  let blocks = 0;
  for (const d of days) blocks += log[d].filter(e => e && e.action === 'block').length;
  return { days: days.length, from: days[0] || null, to: days[days.length - 1] || null, blocks };
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
        thresholds: { DEAD_FEED_DAYS, MIN_SAMPLE, BAD_RATIO, ZERO_YIELD_DAYS, TRUTH_WINDOW_DAYS },
        // Mennyit LÁTOTT a mérő? Enélkül az elnémult kapu-napló és a hibátlan
        // hét ugyanúgy "0 blokk"-nak látszik (lásd truthLogCoverage()).
        truth_log: truthLogCoverage()
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
    const cov = truthLogCoverage();
    console.log(`   kapu-napló: ${cov.blocks} blokk / ${cov.days} nap (${cov.from || '—'} … ${cov.to || '—'}), mért ablak: ${TRUTH_WINDOW_DAYS} nap`);
    console.log('─'.repeat(60));
    for (const [id, c] of Object.entries(card).sort((a, b) => b[1].published30d - a[1].published30d)) {
      const icon = { ok: '✅', dead: '💀', unreliable: '🛑', 'no-yield': '🔎', stale: '⚠️', disabled: '⏸️' }[c.verdict] || '·';
      console.log(`${icon} ${id.padEnd(20).slice(0, 20)} 30nap:${String(c.published30d).padStart(3)}  feed:${c.feedAgeDays == null ? '  ?' : String(c.feedAgeDays).padStart(3) + 'n'}  kapu-blokk(${TRUTH_WINDOW_DAYS}n):${c.truthBlocks}/${c.totalAttempts}  ${c.reason}`);
    }
    console.log('─'.repeat(60));
    console.log(reportLine({ autoDisabled, proposals }) || '(nincs teendő)');
  }).catch(e => { console.error('❌', e.message); process.exit(1); });
}
