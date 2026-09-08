// ===================================================================
// FORRÁS-BIZONYÍTVÁNY (2026-07-22, user: "kéne a hírforrásokat is osztályozni
// mert ha nincs infó minek nézzük, meg ha megbízhatatlan vagy valótlan dolgokat
// közölnek automatikusan töröljük őket")
//
// Minden forrás 3 jegyet kap:
//   1) FRISSESSÉG  — mikor volt a feed utolsó cikke (élő lekérdezésből)
//   2) TERMÉS      — hány publikált cikkünk született belőle (30 nap)
//   3) MEGBÍZHATÓSÁG — hány cikke akadt fenn a hitelesség-kapun ÚGY, hogy nem is
//      jött rendbe (14 napos ablak, a TARTÓS memory/truth-gate-log.json-ból —
//      lásd TRUTH_WINDOW_DAYS és a „A BLOKK NEM ÍTÉLET" szakaszt lentebb)
//
// USER-DÖNTÉS a beavatkozásról: ami EGYÉRTELMŰ, azt a rendszer magától elintézi;
// ami ítélet kérdése, arra csak JAVASLATOT tesz:
//   • halott feed (>365 nap néma)        → AUTOMATIKUS kikapcsolás
//   • cikkei fennakadnak a kapun         → csak JAVASLAT  (2026-09-08 óta! régen
//                                          automatikus volt — lásd a mérést lent)
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
// MIN_SAMPLE 4 → 8 (2026-09-08). A 4-es minta nem véd meg semmitől: az
// `nvidia-blog` ezen a napon 1/3-on állt, vagyis EGYETLEN további blokk
// kikapcsolta volna — egy havi 7 cikket adó, hivatalos NVIDIA-forrást, három
// elemű mintán. Statisztikát 3-4 elemből nem lehet csinálni.
export const MIN_SAMPLE = 8;
export const BAD_RATIO = 0.5;        // a kapu ennyi hányadát fogta meg ÉS nem jött rendbe
export const ZERO_YIELD_DAYS = 30;   // ennyi nap 0 cikk = "nem termel" (csak javaslat)

// ===================================================================
// 🔑 A BLOKK NEM ÍTÉLET — MÉRVE 2026-09-08
// ===================================================================
// Ez a modul eddig azt állította egy forrásról, hogy „valótlan tartalmat
// közöl", ha a hitelesség-kapu a cikkei felét megfogta. Megmértem, mi lett a
// megfogott cikkekkel — a napló 14 napján, STABIL ALAPNÉV szerint párosítva
// (`WRITER_x` → `ARTICLE_x`, lásd agents/ellenorzo/agent.js:649):
//
//     25 blokkolt piszkozatból 25 MEGJELENT és ma is kint van.  100%.
//     Elutasítva maradt: 0.
//
// A „kapu-blokk" tehát a valóságban azt jelenti: EGY JAVÍTÁSI KÖR KELLETT.
// Nem azt, hogy a forrás valótlant közöl.
//
// ⚠️ ÉS A HIBÁT NEM IS A FORRÁS KÖVETTE EL. A blokkok indoklása (idézet a
// naplóból): „a 'Settings → Extensions → Google apps' menüútvonal KITALÁLT",
// „a 'Gemini Omni' nem tűnik valódi Google terméknek", „ez a sablon nincs a
// Picsart tényleges funkciói között". Ezeket a menüket és neveket nem az
// NVIDIA blogja találta ki — hanem A MI ÍRÓNK. A mérce a FORRÁST büntette a
// MI AI-nk hallucinációjáért.
//
// Ebből egy fordított ösztönző lett: minél gazdagabb és funkciókban
// részletesebb egy hivatalos bejelentés, annál inkább csábítja az írónkat
// konkrét gombnevek kitalálására — vagyis a LEGJOBB forrásokat ölte volna meg
// leghamarabb.
//
// A JAVÍTÁS HÁROM RÉTEGE:
//   A) az „unreliable" ítélet AUTOMATIKUS kikapcsolásból JAVASLAT lett
//      (`auto: false`). A halott feed ága marad automatikus: az objektív jel.
//   B) MIN_SAMPLE 4 → 8, és a szöveg csak annyit állít, amennyit mér.
//   C) a mérce maga változott: nem a blokkot számoljuk, hanem azt, hogy a
//      blokkolt cikk SOSEM JÖTT RENDBE (`truthUnfixed`).
// ===================================================================

// TÜRELMI IDŐ — mennyi idő után mondhatjuk egy blokkolt cikkre, hogy nem jött
// rendbe? MÉRVE (2026-09-08), 25 párosított eseten: a blokk és a megjelenés
// között eltelt idő MEDIÁNJA 0,0 óra, a MAXIMUMA 9,8 óra — a javítás ugyanabban
// a futásban lezajlik (20/25 ugyanabban az órában). A 48 óra tehát a mért
// maximum ÖTSZÖRÖSE: ami ennyi után sincs kint, az tényleg elakadt.
export const UNFIXED_GRACE_HOURS = 48;

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

  // Megbízhatatlan: a kapu a cikkei érdemi hányadát megfogta, ÉS azok NEM
  // JÖTTEK RENDBE. A puszta blokk NEM elég — mérve 25/25 blokkolt cikk megjelent
  // (lásd a fenti szakaszt). A `truthUnfixed` a türelmi időn túli, ma sem élő
  // blokkoltak száma.
  //
  // ⚠️ `auto: false` — ez JAVASLAT, nem kivégzés. Az automatikus kikapcsolást
  // 2026-09-08-án levettük erről az ágról: a mérce a forrást büntette a mi
  // írónk hallucinációjáért, és egy 3 elemű mintán ölt volna meg egy hivatalos
  // NVIDIA-forrást. A HALOTT FEED ága automatikus marad — az objektív jel.
  const unfixed = m.truthUnfixed ?? 0;
  if (m.totalAttempts >= MIN_SAMPLE && unfixed / m.totalAttempts >= BAD_RATIO) {
    return {
      verdict: 'unreliable', auto: false,
      // ⚠️ AZ IDŐTÁV IS KIMEGY. A napi riport "ismétlődő hiba 4×" sorának leckéje
      // (2026-08-06): időtáv nélkül a szám vagy sürgetőbbnek, vagy jelentéktelenebbnek
      // látszik a valóságnál. Itt ráadásul a szomszédos "30nap" oszlop MÁS ablak.
      //
      // ⚠️ A MONDAT CSAK ANNYIT ÁLLÍT, AMENNYIT MÉR. A régi szöveg „valótlan
      // tartalom"-ról beszélt — az egy ítélet a forrásról, amit ez a szám nem
      // támaszt alá. Ez itt egy megfigyelés: a cikkek elakadtak a kapuban.
      reason: `${unfixed}/${m.totalAttempts} cikke fennakadt a hitelesség-kapun és ${UNFIXED_GRACE_HOURS} óra után sem jelent meg (utolsó ${TRUTH_WINDOW_DAYS} nap) — érdemes megnézni`
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
    published30d: 0, truthBlocks: 0, totalAttempts: 0, truthUnfixed: 0, lastArticle: '',
    _blocked: new Set(), _reached: new Set(), _blockAt: new Map()
  });

  // ÉLŐ CIKKEK alapnév szerint — ez a „rendbe jött-e?" kérdés hiteles válasza.
  // ⚠️ SZÁNDÉKOSAN NEM a `_reached` halmazt használjuk erre: az csak a MÉRT
  // ABLAKBAN megjelent cikkeket tartalmazza, tehát egy ablak előtt megjelent,
  // majd újraellenőrzött cikkre tévesen azt mondaná, hogy „nem jött rendbe".
  const eloAlapnevek = new Set();
  if (existsSync(articlesDir)) {
    for (const f of readdirSync(articlesDir)) {
      if (f.startsWith('ARTICLE_') && f.endsWith('.json')) eloAlapnevek.add(baseName(f));
    }
  }

  // 1) A KAPU NAPLÓJA — nap-kulcsos objektum, minden nap alatt bejegyzés-tömb.
  for (const [day, entries] of Object.entries(log)) {
    if (!Array.isArray(entries) || day < sinceTruth) continue;
    for (const e of entries) {
      if (!e || e.action !== 'block') continue;      // a `hold` nem a forrás hibája
      const id = sourceIdFromFile(e.file);
      if (!id || id === 'guide') continue;
      const bn = baseName(e.file);
      const a = get(id);
      a._blocked.add(bn);
      // A LEGUTOLSÓ blokk ideje számít: ha egy cikket kétszer fogott meg a kapu,
      // a második után is volt még ideje rendbe jönni. Az `e.at` hiányában a
      // nap-kulcs a tartalék (a napló régebbi sorain még nem volt `at` mező).
      const t = Date.parse(e.at || (day + 'T23:59:59Z'));
      if (Number.isFinite(t) && t > (a._blockAt.get(bn) || 0)) a._blockAt.set(bn, t);
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

  const gracePeriod = UNFIXED_GRACE_HOURS * 3600000;
  for (const a of Object.values(per)) {
    a.truthBlocks = a._blocked.size;
    a.totalAttempts = new Set([...a._blocked, ...a._reached]).size;
    // NEM JÖTT RENDBE = a kapu megfogta, a türelmi idő letelt, és ma sincs kint.
    // A frissen blokkolt cikk NEM számít bele: az még javítás alatt állhat.
    a.truthUnfixed = [...a._blocked].filter(bn =>
      !eloAlapnevek.has(bn) && (now - (a._blockAt.get(bn) || 0)) > gracePeriod
    ).length;
    delete a._blocked; delete a._reached; delete a._blockAt;
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
// A `stats` azért injektálható, mert enélkül a BEKÖTÉS nem mérhető: az éles
// adaton ma egyetlen forrás sem éri el a küszöböt (helyesen), így egy elvágott
// huzalozás — kimaradó `truthUnfixed`, vagy a javaslatok közül kifelejtett
// `unreliable` — TELJESEN NÉMÁN maradna. `undefined` = mérj a valódi adaton.
export async function runReportCard({ dryRun = false, fetchFn = fetch, stats } = {}) {
  const feeds = readJson(FEEDS_PATH, null);
  if (!feeds?.sources) throw new Error('sources/rss-feeds.json nem olvasható');
  const arts = stats === undefined ? collectArticleStats() : (stats || {});

  const card = {};
  const autoDisabled = [], proposals = [];

  for (const s of feeds.sources) {
    const a = arts[s.id] || { published30d: 0, truthBlocks: 0, totalAttempts: 0, truthUnfixed: 0, lastArticle: '' };
    const age = s.enabled === false ? null : await feedAgeDays(s.url, fetchFn);
    const m = {
      feedAgeDays: age,
      published30d: a.published30d,
      truthBlocks: a.truthBlocks,
      truthUnfixed: a.truthUnfixed,
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
    } else if (j.verdict === 'no-yield' || j.verdict === 'stale' || j.verdict === 'unreliable') {
      // ⚠️ AZ `unreliable` IDE KELL. 2026-09-08-tól `auto: false`, tehát a
      // `disabledNow` ága SOSEM fut le rá — ha nem tennénk be a javaslatok közé,
      // az ítélet a bizonyítványba bekerülne, de a userhez SOHA nem jutna el.
      // Pontosan az i18n-őrszem hibája: „a lelet a CI-naplóig jutott, senkihez."
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
        thresholds: { DEAD_FEED_DAYS, MIN_SAMPLE, BAD_RATIO, ZERO_YIELD_DAYS, TRUTH_WINDOW_DAYS, UNFIXED_GRACE_HOURS },
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
  // ⚠️ HÁROM KÜLÖN VÖDÖR. Korábban kettő volt, és minden „nem elavult" javaslat
  // a „Nem termel" mondatot kapta. A 2026-09-08-i változás után az `unreliable`
  // is javaslat lett — abba a vödörbe esve azt írtuk volna egy szorgalmasan
  // termelő forrásra, hogy nem termel. A riport-sor akkor ér valamit, ha AZT
  // mondja, ami történt.
  const stale = proposals.filter(p => /néma, mégis/.test(p.reason));
  const stuck = proposals.filter(p => /fennakadt a hitelesség-kapun/.test(p.reason));
  const idle = proposals.filter(p => !/néma, mégis|fennakadt a hitelesség-kapun/.test(p.reason));
  if (stuck.length) {
    parts.push('🛡️ Kapun fennakadt cikkek (' + stuck.length + '): ' +
      stuck.map(p => p.name.replace(/\s*\(hivatalos\)$/, '') + ' — ' + p.reason).join(' · '));
  }
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
// A `card` azért injektálható, mert EZ a függvény visz a userhez
// (core/daily-report.js:844) — a `runReportCard` csak a fájlt írja. Ha itt esne
// ki egy ítélet-fajta a szűrésből, a lelet a bizonyítványban ott ülne, a napi
// riportban pedig SOHA nem jelenne meg. `undefined` = olvasd az éles fájlt.
export function reportLineFromFile(card) {
  const st = card === undefined ? readJson(STATS_PATH, null) : { sources: card || {} };
  if (!st?.sources) return '';
  const autoDisabled = [], proposals = [];
  for (const [id, c] of Object.entries(st.sources)) {
    if (!c || !c.verdict) continue;
    if ((c.verdict === 'dead' || c.verdict === 'unreliable') && c.disabledNow) {
      autoDisabled.push({ id, name: c.name || id, reason: c.reason });
    } else if (c.verdict === 'stale' || c.verdict === 'no-yield' || c.verdict === 'unreliable') {
      // Az `unreliable` 2026-09-08 óta javaslat (auto:false) — ha ez az ág nem
      // venné fel, a napi riportban NÉMA maradna. (A fenti ág `disabledNow`-ra
      // szűr, ami már csak a régi bizonyítvány-fájlokon lehet igaz.)
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
      // A „nem jött rendbe" oszlop KÜLÖN áll a blokk-oszloptól: a kettő
      // különbsége maga a lecke — a blokkok túlnyomó része javítási kör volt.
      console.log(`${icon} ${id.padEnd(20).slice(0, 20)} 30nap:${String(c.published30d).padStart(3)}  feed:${c.feedAgeDays == null ? '  ?' : String(c.feedAgeDays).padStart(3) + 'n'}  kapu-blokk(${TRUTH_WINDOW_DAYS}n):${c.truthBlocks}/${c.totalAttempts}  nem-jött-rendbe:${c.truthUnfixed ?? '?'}  ${c.reason}`);
    }
    console.log('─'.repeat(60));
    console.log(reportLine({ autoDisabled, proposals }) || '(nincs teendő)');
  }).catch(e => { console.error('❌', e.message); process.exit(1); });
}
