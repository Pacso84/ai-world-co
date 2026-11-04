// ===================================================================
// HÁZMESTER (housekeeping) — 2026-07-30
// ===================================================================
//
// MIÉRT: a user kérésére átvilágítottam a központot, és négy helyen
// halmozódott fel olyan adat, amit senki nem használ, de MINDEN FUTÁSNÁL
// újra bekerül a git-történetbe:
//
//   1. memory/store.json — 2,2 MB, ebből 2,07 MB (93%!) halott "embedding"
//      vektor egy KIVEZETETT szolgáltatástól (Gemini). Leellenőrizve: az
//      embedText() null-t ad, tehát a kód SOHA nem olvassa ki őket.
//      Ez volt a legnagyobb tétel: 133 példány a történetben, és napi 3
//      futással évi ~2,2 GB-tal hízott volna tovább.
//      ⚠️ 2026-09-06: a takarítás MAGA vált a hiba forrásává, amikor a
//      beágyazás visszatért — lásd a `stripEmbeddings()` fölötti szakaszt.
//      A vektorok azóta a gitignore-olt memory/memory-embeddings.json-ban
//      laknak, és nem a szövegtárban.
//
//   2. logs/ — 949 fájl 2026-06-07-ig visszamenőleg. EGYETLEN SOR KÓD SEM
//      törölte őket, mert soha senki nem írt rá takarítást.
//
//   3. website/assets/images/ — 97 árva borítókép (2,7 MB) törölt vagy
//      átnevezett cikkekhez. Nemcsak fekszenek: MINDEN deploynál felmennek.
//
//   4. content/translations/ — néhány fordítás olyan cikkhez, ami már nincs.
//
// MIÉRT NEM A LEMEZHELY A LÉNYEG: a git nem különbséget tárol az ilyen
// nagy JSON-oknál, hanem az EGÉSZ új példányt. Egy 2 MB-os fájl napi 3
// újraírása havi ~180 MB-ot jelent, örökre. Ez a fajta hiba lassan öl:
// fél év múlva a klónozás percekig tart, és senki nem tudja, miért.
//
// BIZTONSÁG: csak azt törli, amiről BIZONYÍTHATÓ, hogy nincs rá hivatkozás.
// Ha bármi bizonytalan, HOZZÁ SEM NYÚL. A --dry mindent megmutat küldés
// nélkül. Kilépési kód mindig 0 — a takarítás soha ne állítsa meg a kiadást.
//
// FUTTATÁS:  node core/housekeeping.js [--dry] [--days 14]
// ===================================================================

import { readFileSync, writeFileSync, readdirSync, unlinkSync, statSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { decay, purgeStoreEmbeddings } from './memory-manager.js';
import { utmutatoE } from './guide-kind.js';
import { lejartCeluakNelkul } from './redirect-chain.js';
import { pruneBeallitas, torlendok, linkekKi, toroltListaFrissit, maiToroltDb, toroltHalottak } from './guide-prune.js';
import { hirTorlendok } from './news-prune.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES = join(ROOT, 'content', 'articles');
const TRANSLATIONS = join(ROOT, 'content', 'translations');
const IMAGES = join(ROOT, 'website', 'assets', 'images');
const LOGS = join(ROOT, 'logs');
const STORE = join(ROOT, 'memory', 'store.json');
const STATE = join(ROOT, 'memory', 'housekeeping.json');

const DRY = process.argv.includes('--dry');
// A HÍR MEGŐRZÉSI IDEJE (user-döntés 2026-08-02): 3 hónap. Az útmutatóra és az
// összehasonlításra NEM vonatkozik — azok örökzöldek.
// Sorrend: parancssori kapcsoló > config.json > 90. A configban azért van,
// hogy a szabály ott legyen, ahol a többi — kód nélkül átírható.
const NEWS_KEEP_DAYS = (() => {
  const i = process.argv.indexOf('--news-days');
  if (i >= 0 && process.argv[i + 1]) return parseInt(process.argv[i + 1], 10) || 90;
  try {
    const c = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
    return Number(c.limits?.news_keep_days) || 90;
  } catch { return 90; }
})();
// 2026-10-21 (user: „folytassuk a hírek törlését is!”): amíg a forgalmi napló rövidebb 90 napnál (08-02-án
// indult), a TELJES hiánytalan mért időszak az olvasottsági ablak, de legalább ennyi nap (szigorúbb az
// útmutatók 60 napjánál). ~10-31-től magától 90 nap. A KOR-határ marad 90 nap. Lásd core/news-prune.js.
const NEWS_MIN_ABLAK = 75;
const KEEP_DAYS = (() => {
  const i = process.argv.indexOf('--days');
  return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : 14;
})();

// Képek, amiket SOHA nem tekintünk árvának (nem cikkhez tartoznak)
const PROTECTED_IMAGES = new Set(['mascot-weekly.jpg', 'og-default.jpg']);

const report = [];
const kb = n => Math.round(n / 1024);

/** Az ÉLŐ cikkek: fájlnév + rögzített slug. Ez a hivatkozás-igazság. */
function liveArticles() {
  const files = new Set(), slugs = new Set();
  if (!existsSync(ARTICLES)) return { files, slugs };
  for (const f of readdirSync(ARTICLES).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    files.add(f);
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES, f), 'utf-8'));
      if (d._meta?.slug) slugs.add(d._meta.slug);
    } catch { /* rossz fájl — a cikk akkor is él, a fájlnevet már felvettük */ }
  }
  return { files, slugs };
}

// ── 1. RÉGI VEKTOROK A SZÖVEGTÁRBAN ──────────────────────────────────
//
// 🔴 EZ A FÜGGVÉNY VOLT A HIBA FORRÁSA — 2026-09-06-ig (igazolva).
// Ugyanannak a CI-futásnak két commitja:
//     8cd53e0a  02:02:54  memory/store.json = 6 379 702 bájt · 212 vektor
//     a8fd5f08  02:12:40  memory/store.json =   318 783 bájt ·   0 vektor
// Közte egyetlen dolog fut, ami vektort töröl: EZ. A régi kód így kérdezett:
//     alive = Array.isArray(await embedText('ping'))
// és `alive === false` esetén MINDEN emlékről letörölte a vektort.
//
// 🔑 A PRÓBA ROSSZ KÉRDÉST TETT FEL. Nem azt mérte, hogy „halott-e a
// szolgáltatás", hanem hogy „ÉN, ITT, MOST, tudok-e beágyazni" — és a
// Házmester CI-lépésének NINCS `env:` blokkja (`auto.yml`), tehát ott kulcs
// nélkül a válasz MINDIG „halott". A `recallSemantic()` viszont a következő
// futásban visszatöltötte és elmentette a vektorokat. Eredmény: 12 napja
// MINDEN futásban megszülettek és MINDEN futásban törlődtek, a nyilvános
// git-történet meg 13,9 MB ↔ 0,3 MB között hullámzott (165,9 KB/commit a
// stabil 14,3 KB helyett, ~335 MB/év).
// ⚠️ UGYANEZ AZ ALAK volt az `core/embed-guard.js kellIrni()`-jében is —
// ha ilyet találsz, keresd meg a többit.
//
// A JAVÍTÁS NEM JOBB PRÓBA, HANEM A KÉRDÉS MEGSZÜNTETÉSE. A vektorok azóta
// a gitignore-olt `memory/memory-embeddings.json`-ban laknak, a szövegtárban
// pedig SEMMILYEN körülmények között nincs helyük — nincs mit mérlegelni.
// Determinisztikus, hálózat nélküli, $0. (Ezért nincs itt már `await` sem:
// a Házmester ettől kezdve EGYETLEN hálózati hívást sem indít.)
function stripEmbeddings() {
  if (!existsSync(STORE)) return;

  if (DRY) {
    try {
      const s = JSON.parse(readFileSync(STORE, 'utf-8'));
      const n = (s.items || []).filter(it => it.embedding !== undefined && it.embedding !== null).length;
      if (n) report.push(`🧠 régi vektor a szövegtárban: ${n} elem — PRÓBA, nem írok`);
    } catch { /* olvashatatlan tár: a memória-halványítás úgyis szól */ }
    return;
  }

  try {
    const r = purgeStoreEmbeddings();
    if (!r.n) return;
    report.push(`🧠 régi vektor kiköltöztetve a szövegtárból: ${r.n} elem · ${kb(r.elotte)} KB → ${kb(r.utana)} KB `
      + '(a vektorok helye a gitignore-olt memory/memory-embeddings.json)');
  } catch (e) {
    report.push(`⚠️ a régi vektorok takarítása elbukott: ${String(e?.message || e).slice(0, 80)}`);
  }
}

// ── 2. RÉGI NAPLÓK ───────────────────────────────────────────────────
// A KOR A FÁJLNÉVBŐL JÖN, NEM AZ MTIME-BÓL (2026-08-02).
//
// A git NEM tárolja a módosítási időt. A GitHub Actions minden futásnál friss
// klónt csinál → MINDEN fájl mtime-ja a klónozás pillanata lesz. Vagyis élesben
// egyetlen napló sem volt soha "14 napnál régebbi", és ez a takarító a
// megírása óta EGYETLEN fájlt sem törölt — közben némán "rendben"-t jelentett.
// (Mérve: 99 napló volt 14 napnál régebbi a fájlnév-dátuma szerint, és a git
// történet szerint naplót egyedül egy KÉZI, helyi futás törölt, 2026-07-30-án.)
//
// Minden naplónk nevében ott a dátum (`scrape_2026-08-02T09-48-07-266Z.json`) —
// ez a git-en át is túléli, tehát ez az egyetlen megbízható kor-jelzés.
// Az mtime csak tartalék, ha valaha dátum nélküli naplófajta jelenne meg.
function logAgeMs(name, st) {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    if (!Number.isNaN(t)) return Date.now() - t;
  }
  return Date.now() - st.mtimeMs;
}

function pruneLogs() {
  if (!existsSync(LOGS)) return;
  const maxAge = KEEP_DAYS * 86400e3;
  let n = 0, bytes = 0;
  for (const f of readdirSync(LOGS)) {
    if (!f.endsWith('.json')) continue;          // README.md és társai maradnak
    const p = join(LOGS, f);
    let st; try { st = statSync(p); } catch { continue; }
    if (logAgeMs(f, st) <= maxAge) continue;
    bytes += st.size; n++;
    if (!DRY) { try { unlinkSync(p); } catch { /* zárolt fájl — jövő körben */ } }
  }
  if (n) report.push(`📄 régi napló törölve: ${n} fájl · ${kb(bytes)} KB (${KEEP_DAYS} napnál régebbi)`);
}

// ── 2b. LEJÁRT HÍREK ─────────────────────────────────────────────────
// User-döntés (2026-08-02): "a híreket csak három hónapra tároljuk, ez nem
// vonatkozik az útmutatókra".
//
// MIÉRT: a hír romlandó. Egy fél éves "új funkció" cikk gyakran már NEM IGAZ,
// és a keresőnek is gyenge jelzés. Napi ~11 hírrel a 90 napos ablak ~1000
// cikkes állandósult állapotot jelent — enélkül a tár és a build örökké nő.
//
// ÖRÖKZÖLD, SOHA NEM TÖRLŐDIK:
//   - útmutató (a user kifejezett kérése)
//   (az összehasonlítás 2026-10-13 óta LEJÁR, mint a hír — a user tiltja a műfajt)
// LEJÁR:
//   - sima hír
//   - heti összefoglaló (dátumos: "This Week in AI, 21 June 2026" — három
//     hónap múlva értéktelen; a főoldal amúgy is csak a legfrissebbet emeli ki)
//
// KÉT BIZTOSÍTÉK, mert a néma, tömeges törlés visszafordíthatatlan:
//   1. Dátum nélküli vagy értelmezhetetlen dátumú cikket SOHA nem törlünk.
//   2. Egy futásban legfeljebb MAX_DELETE cikk mehet — ha egy óra- vagy
//      dátumhiba miatt hirtelen "minden lejárt", az első futás megáll és
//      szól, ahelyett hogy kiürítené a honlapot.
// A törölt cikk képét és fordítását a lenti árva-takarítók viszik el
// ugyanebben a futásban (ezért fut ez ELŐTTÜK).
const MAX_DELETE = 200;

function isEvergreen(file, data) {
  // ⚠️ EZ A LEGDRÁGÁBB „útmutató-e?" kérdés a repóban: a téves „hír" válasz
  // 90 nap múlva VÉGLEG TÖRLI a cikket. Ezért a közös core/guide-kind.js dönt
  // (2026-09-16), ugyanazzal a szabállyal, mint a build és a poszterek.
  // 2026-10-13: az összehasonlítás NEM örökzöld többé — a user 09-26 óta TILTJA az
  // összehasonlító tartalmat; a július 8-i „chatgpt-vs-gemini-vs-claude" hír ezért
  // maradt 3 hónap után is az archívumban. Az ÚTMUTATÓ a címkétől függetlenül örökzöld.
  return utmutatoE(file, data);
}

// 2026-10-20 (user: „ha 60 napig nem olvassa senki, akkor van törlés — a cikkeknél 90 nap!"):
// a hír már NEM a kora miatt törlődik, hanem ha 90 napnál régebbi ÉS 90 napja senki nem
// olvasta (core/news-prune.js). Hiányos forgalmi naplónál nincs törlés (fail-closed).
function pruneOldNews() {
  if (!existsSync(ARTICLES)) return;
  const hirek = [];
  for (const f of readdirSync(ARTICLES).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(join(ARTICLES, f), 'utf-8')); } catch { continue; }
    if (isEvergreen(f, d)) continue;
    hirek.push({ f, slug: d._meta?.slug || '', published_at: d._meta?.published_at || '' });
  }
  let days = null;
  try { days = JSON.parse(readFileSync(join(ROOT, 'memory', 'traffic-log.json'), 'utf-8')).days; } catch { /* a kapu kezeli */ }
  const r = hirTorlendok({ hirek, days, now: Date.now(), keepDays: NEWS_KEEP_DAYS, minAblak: NEWS_MIN_ABLAK });
  if (!r.ok) { report.push(`⚠️ lejárt hír-törlés kihagyva (${r.regiek} db ${NEWS_KEEP_DAYS} napnál régebbi vár): ${r.ok_ok}`); return; }
  const doomed = r.torlendo.map(({ f, slug }) => ({ f, slug }));
  if (!doomed.length) {
    if (r.olvasott.length) report.push(`📖 ${r.olvasott.length} régi hír megtartva — az utolsó ${r.ablak} napban is olvasták`);
    return;
  }

  if (doomed.length > MAX_DELETE) {
    report.push(`🛑 LEJÁRT HÍR: ${doomed.length} cikk esne ki egyszerre (határ ${MAX_DELETE}) — NEM TÖRLÖK. Ez dátumhibára utal; nézd meg, mielőtt folytatjuk.`);
    return;
  }

  let bytes = 0, social = 0;
  for (const { f, slug } of doomed) {
    const p = join(ARTICLES, f);
    try { bytes += statSync(p).size; } catch { /* mindegy */ }
    if (!DRY) { try { unlinkSync(p); } catch { /* jövő körben */ } }
    if (slug) {
      const s = join(ROOT, 'content', 'social', `${slug}.json`);
      if (existsSync(s)) { social++; if (!DRY) { try { unlinkSync(s); } catch { /* jövő körben */ } } }
    }
  }
  // 🔗 A TÖRÖLT HÍRRE MUTATÓ ÁTIRÁNYÍTÁSOK IS MENNEK (2026-10-13, éles eset: 5 régi cím
  // két ugrás után 404-re futott). Csak a MOST törölt hírekre mutatókat vesszük ki.
  let atir = 0;
  try {
    const hp = join(ROOT, 'content', 'slug-history.json');
    const toroltek = new Set(doomed.map(x => x.slug).filter(Boolean));
    if (toroltek.size && existsSync(hp)) {
      const r = lejartCeluakNelkul(JSON.parse(readFileSync(hp, 'utf-8')), s => !toroltek.has(s));
      atir = r.torolt.length;
      if (atir && !DRY) writeFileSync(hp, JSON.stringify(r.tortenet, null, 2) + '\n', 'utf-8');
    }
  } catch { /* az átirányítás-takarítás hibája ne állítsa meg a házmestert */ }
  // 🔔 KERESŐ-ÉRTESÍTÉS + BELSŐ LINKEK (2026-10-21, user: „…és értesítés a keresőknek!”): eddig csak a
  // törölt ÚTMUTATÓKAT jelentettük be és vettük ki a linkjeiket; a hír némán tűnt el. Most ugyanúgy:
  // a törölt címek listára kerülnek (memory/torolt-hirek.json → core/indexnow.js 48 órán át bejelenti,
  // a kereső 404-et talál és kiveszi), a rájuk mutató belső linkek pedig kikerülnek a többi cikkből.
  const hirSlugok = doomed.map(x => x.slug).filter(Boolean);
  let hirLinkDb = 0;
  if (!DRY && hirSlugok.length) {
    try { hirLinkDb = linkekKiMindenhol(hirSlugok); } catch { /* a link-takarítás hibája ne állítsa meg a házmestert */ }
    const tu = join(ROOT, 'memory', 'torolt-hirek.json');
    let tl = []; try { tl = JSON.parse(readFileSync(tu, 'utf-8')); } catch { /* első törlés */ }
    try { writeFileSync(tu, JSON.stringify(toroltListaFrissit(tl, hirSlugok), null, 2) + '\n', 'utf-8'); } catch { /* a 404 akkor is kiveszi */ }
  }
  report.push(`📰 lejárt hír törölve: ${doomed.length} cikk · ${kb(bytes)} KB (${NEWS_KEEP_DAYS} napnál régebbi és ${r.ablak} napja 0 olvasó${hirLinkDb ? `; ${hirLinkDb} belső link kivéve` : ''}; a keresők értesítve${r.olvasott.length ? `; ${r.olvasott.length} olvasott régi hír megtartva` : ''})${social ? ` + ${social} közösségi poszt` : ''}${atir ? ` + ${atir} rá mutató átirányítás` : ''} — az útmutatókat külön szabály kezeli (60 nap olvasó nélkül)`);
}

// ── 2b. NÉZETLEN ÚTMUTATÓK (2026-10-14, user: „ha 60 napig nem volt olvasó, akkor minek
// tartjuk!" · „ne csak átirányítás legyen, teljes törlés!") ────────────────────────
// A DÖNTÉS a core/guide-prune.js-é (3 hibakapu + futásonkénti korlát) — itt csak a törlés
// történik, a hírtörlés mintájára. A képet és a fordítást a lenti árva-takarítók viszik el
// UGYANEBBEN a futásban (ezért fut ez előttük). Az oldal a következő buildben már nem
// készül el → 404, és kimarad a webhelytérképből; az IndexNow a törölt-listából szól.
function pruneUnreadGuides() {
  if (!existsSync(ARTICLES)) return;
  let cfg = {};
  // 10-14 végső átnézés: ha a config nem olvasható, a kapcsoló nem ítélhető meg → NEM törlünk (fail-closed).
  try { cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8')); } catch { report.push('⚠️ nézetlen útmutató-törlés kihagyva: a config.json nem olvasható'); return; }
  const b = pruneBeallitas(cfg);
  if (!b.be) return;
  let days = null;
  try { days = JSON.parse(readFileSync(join(ROOT, 'memory', 'traffic-log.json'), 'utf-8')).days; } catch { /* a kapu kezeli */ }
  const cikkek = [];
  for (const f of readdirSync(ARTICLES).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(join(ARTICLES, f), 'utf-8')); } catch { continue; }
    if (!utmutatoE(f, d)) continue;
    cikkek.push({ file: f, slug: d._meta?.slug || '', published_at: d._meta?.published_at || '' });
  }
  // 10-14 végső átnézés: a keret NAPI (a CI napi 3 futása együtt), nem futásonkénti — a mai törlések
  // száma a törölt-listából jön (ugyanez a lista íródik is lejjebb).
  const toroltUt = join(ROOT, 'memory', 'torolt-utmutatok.json');
  let lista = [];
  try { lista = JSON.parse(readFileSync(toroltUt, 'utf-8')); } catch { /* első törlés */ }
  const maiDb = maiToroltDb(lista);
  const keret = Math.max(0, b.max - maiDb);
  const r = torlendok({ cikkek, days, now: Date.now(), ablakNap: b.napok, max: keret });
  if (!r.ok) { report.push(`⚠️ nézetlen útmutató-törlés kihagyva: ${r.ok_ok}`); return; }
  if (!r.torlendo.length) {
    // a keret kimerült (vagy nincs jelölt): a napi összesítő így is látsszon minden aznapi futásban
    if (maiDb > 0) report.push(`🗑️ nézetlen útmutató: ma ${maiDb} db törölve (${b.napok} napja 0 olvasó, napi keret ${b.max})${r.jeloltek.length > 0 ? ` — még ${r.jeloltek.length} vár` : ''}`);
    return;
  }

  const slugok = r.torlendo.map(x => x.slug);
  let social = 0;
  for (const { file, slug } of r.torlendo) {
    if (!DRY) { try { unlinkSync(join(ARTICLES, file)); } catch { /* jövő körben */ } }
    const s = join(ROOT, 'content', 'social', `${slug}.json`);
    if (existsSync(s)) { social++; if (!DRY) { try { unlinkSync(s); } catch { /* jövő körben */ } } }
  }
  let atir = 0;
  try {
    const hp = join(ROOT, 'content', 'slug-history.json');
    const toroltek = new Set(slugok);
    if (existsSync(hp)) {
      const h = lejartCeluakNelkul(JSON.parse(readFileSync(hp, 'utf-8')), s => !toroltek.has(s));
      atir = h.torolt.length;
      if (atir && !DRY) writeFileSync(hp, JSON.stringify(h.tortenet, null, 2) + '\n', 'utf-8');
    }
  } catch { /* az átirányítás-takarítás hibája ne állítsa meg a házmestert */ }
  let linkDb = 0;
  if (!DRY) { try { linkDb = linkekKiMindenhol(slugok); } catch { /* a link-takarítás hibája ne állítsa meg a házmestert */ } }
  if (!DRY) {
    try {
      writeFileSync(toroltUt, JSON.stringify(toroltListaFrissit(lista, slugok), null, 2) + '\n', 'utf-8');
    } catch { /* az IndexNow-bejelentés elmarad, a 404 akkor is kiveszi a keresőből */ }
  }
  const maradek = r.jeloltek.length - r.torlendo.length;
  report.push(`🗑️ nézetlen útmutató: ma ${maiDb + r.torlendo.length} db törölve (${b.napok} napja 0 olvasó, napi keret ${b.max})`
    + `${social ? ` + ${social} közösségi poszt` : ''}${atir ? ` + ${atir} régi, rá mutató átirányítás is törölve` : ''}`
    + `${linkDb ? ` + ${linkDb} rá mutató link` : ''}${maradek > 0 ? ` — még ${maradek} vár` : ''}`);
}

// A törölt útmutatókra mutató linkek kivétele a többi cikkből ÉS a fordításokból (a szöveg
// marad). Cikk: article_markdown; fordítás: minden szöveg-mező (hu, es).
function linkekKiMindenhol(slugok) {
  let db = 0;
  for (const [dir, mezok] of [[ARTICLES, ['article_markdown']], [TRANSLATIONS, null]]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
      let d; try { d = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
      let valt = 0;
      for (const k of mezok || Object.keys(d)) {
        if (typeof d[k] !== 'string') continue;
        const r = linkekKi(d[k], slugok);
        if (r.db) { d[k] = r.md; valt += r.db; }
      }
      if (valt) { db += valt; try { writeFileSync(join(dir, f), JSON.stringify(d, null, 2), 'utf-8'); } catch { /* jövő körben */ } }
    }
  }
  return db;
}

// ── 2c. HALOTT BELSŐ LINKEK UTÓTAKARÍTÁSA (2026-10-24) ────────────────────
// A törléskor csak az AKKOR törölt cikkekre mutató linkek mennek ki. 10-24-én a napi riport 5 halott
// belső linket jelzett: a heti összefoglaló KÉPRE tett linkkel mutatott törölt hírekre, és a
// link-törlő ezt az alakot nem ismerte (core/guide-links.js, javítva). Hogy egy kimaradás ne maradjon
// örökre: minden futásban a törölt-listák (30 napos) még nem élő slugjaira is lefut — ismételten futtatva
// nem változtat semmit (idempotens), mert a már kivett link nem talál újra.
function halottLinkUtotakaritas(slugs) {
  const olvas = nev => { try { return JSON.parse(readFileSync(join(ROOT, 'memory', nev), 'utf-8')); } catch { return []; } };
  const halottak = toroltHalottak([olvas('torolt-hirek.json'), olvas('torolt-utmutatok.json')], slugs);
  if (!halottak.length) return;
  if (DRY) { console.log(`   (próba) utótakarítás: ${halottak.length} törölt cikk linkjei`); return; }
  let db = 0;
  try { db = linkekKiMindenhol(halottak); } catch { /* a link-takarítás hibája ne állítsa meg a házmestert */ }
  if (db) report.push(`🔗 halott belső link kivéve (utótakarítás): ${db} link ${halottak.length} törölt cikkre`);
}

// ── 3. ÁRVA BORÍTÓKÉPEK ──────────────────────────────────────────────
// A kép a cikk SLUGJÁHOZ tartozik (build.js: `${slug}.jpg`). Ami mögött
// nincs élő cikk, az törölt vagy átnevezett cikk maradványa.
function pruneImages(slugs) {
  if (!existsSync(IMAGES)) return;
  let n = 0, bytes = 0; const examples = [];
  for (const f of readdirSync(IMAGES)) {
    const m = f.match(/^(.+)\.(jpg|jpeg|png|webp)$/i);
    if (!m) continue;
    if (PROTECTED_IMAGES.has(f)) continue;
    if (slugs.has(m[1])) continue;
    try { bytes += statSync(join(IMAGES, f)).size; } catch { continue; }
    n++; if (examples.length < 2) examples.push(f.slice(0, 44));
    if (!DRY) { try { unlinkSync(join(IMAGES, f)); } catch { /* jövő körben */ } }
  }
  if (n) report.push(`🖼️  árva borítókép törölve: ${n} db · ${kb(bytes)} KB — pl. ${examples[0]}`);
}

// ── 4. ÁRVA FORDÍTÁSOK ───────────────────────────────────────────────
// A fordítás fájlneve = a cikk fájlneve. Ha a cikk nincs meg, a fordítás holt.
function pruneTranslations(files) {
  if (!existsSync(TRANSLATIONS)) return;
  let n = 0, bytes = 0;
  for (const f of readdirSync(TRANSLATIONS).filter(x => x.endsWith('.json'))) {
    if (files.has(f)) continue;
    try { bytes += statSync(join(TRANSLATIONS, f)).size; } catch { continue; }
    n++;
    if (!DRY) { try { unlinkSync(join(TRANSLATIONS, f)); } catch { /* jövő körben */ } }
  }
  if (n) report.push(`🌍 árva fordítás törölve: ${n} db · ${kb(bytes)} KB`);
}

// ── 5. ŐRSZEM: ne hízzon vissza észrevétlenül ────────────────────────
// Nem elég egyszer kitakarítani. Ha valami MEGINT elkezd nőni (pl. visszatér
// egy embedding-szolgáltató, vagy új naplófajta jelenik meg), arról tudni
// akarunk — ne fél év múlva, a lassú klónozásból.
//
// ⚠️ A `memory/memory-embeddings.json` SZÁNDÉKOSAN NINCS EZEN A LISTÁN
// (2026-09-06). Nagy (478 emlék × 1024 float ≈ 13 MB) és NŐNI IS FOG — de
// GITIGNORE-OLT, tehát a git-történetbe nem kerül, márpedig ez a lista pont
// azt őrzi. A 600 KB-os store.json-határ mellé véve NAPI HÁROM HAMIS
// figyelmeztetést adna, és a hamis riasztás megeszi az igazit is:
// pontosan azt a sort butítaná le, amelyik a mostani hibát elkapta volna.
// A store.json határa viszont TOVÁBBRA IS ÉRVÉNYES ÉS ÉLES: ha a vektorok
// valaha visszaszivárognának a szövegtárba, 600 KB-nál megszólal.
function watchGrowth() {
  const warn = [];
  for (const [label, path, limitKb] of [
    ['memory/store.json', STORE, 600],
    ['memory/ops.json', join(ROOT, 'memory', 'ops.json'), 400]
  ]) {
    if (!existsSync(path)) continue;
    const size = kb(statSync(path).size);
    if (size > limitKb) warn.push(`${label} ${size} KB (határ ${limitKb} KB)`);
  }
  const logCount = existsSync(LOGS) ? readdirSync(LOGS).filter(f => f.endsWith('.json')).length : 0;
  if (logCount > 400) warn.push(`logs/ ${logCount} fájl (határ 400)`);
  if (warn.length) report.push(`⚠️  FIGYELMEZTETÉS — újra hízik: ${warn.join(' · ')}`);
  return { logCount };
}

// ── 🧠 A MEMÓRIA HALVÁNYÍTÁSA (2026-08-29, hibavadászat) ────────────
// A `decay()` egyetlen hívója az `agents/analyst/agent.js` volt, azt pedig
// 2026-07-30-án kivezettük — azóta a salience SOHA nem csökkent. Élesben
// mérve: 556 emlék, MIND 1.000-en, MIND „hot". A `lessonsBlock()` a
// salience-rendezésből dolgozik, csupa döntetlennél tehát a BESZÚRÁSI
// SORREND első négyét adja: hat hete ugyanaz a négy 07-13/14-i lecke ment
// minden AI-hívásba, és a 119 megosztott leckéből 115 SOHA nem jutott
// promptba. A cég „tanulása" díszként működött.
//
// MIÉRT ITT: a házmester a CI MINDEN futásában megy (`auto.yml`), ingyenes,
// és pont ilyen időszakos karbantartás a dolga. A napi kapu a `decay()`-ben
// van — enélkül a napi három futás háromszoros ütemben halványítana.
//
// A DRY (próba) módot tiszteletben tartjuk: az is írás.
function memoriaHalvanyitas() {
  if (DRY) { console.log('   🧠 memória-halványítás: PRÓBA, nem írok'); return; }
  try {
    const d = decay();
    if (d.skipped) return;                       // ma már megvolt — csendben
    if (d.moved > 0) report.push(`🧠 memória: ${d.moved} lecke réteget váltott (${d.total} összesen)`);
  } catch (e) {
    // Sosem dönthet el egy házmester-futást — de NE legyen néma.
    report.push(`⚠️ a memória halványítása elbukott: ${String(e?.message || e).slice(0, 80)}`);
  }
}

async function main() {
  console.log('🧹 HÁZMESTER' + (DRY ? ' — PRÓBA (nem törlök)' : ''));
  console.log('─'.repeat(60));

  let { files, slugs } = liveArticles();     // let: a lejárt hírek után újraolvassuk
  if (!files.size) { console.log('   ⏭️  Nincs cikk — kihagyom (óvatosságból nem törlök semmit).'); return; }

  stripEmbeddings();
  pruneLogs();
  pruneOldNews();
  pruneUnreadGuides();
  // ÚJRAOLVASSUK az élő cikkeket: a lejárt hírek most tűntek el, és a lenti
  // árva-takarítók csak így viszik el a képüket és a fordításukat UGYANEBBEN
  // a futásban. E nélkül egy körrel később takarítanánk — vagy soha, ha
  // közben a lista megint feltöltődik.
  ({ files, slugs } = liveArticles());
  halottLinkUtotakaritas(slugs);
  pruneImages(slugs);
  pruneTranslations(files);
  memoriaHalvanyitas();
  const { logCount } = watchGrowth();

  if (!report.length) console.log('   ✅ Nincs takarítanivaló.');
  else for (const r of report) console.log('   ' + r);

  // A napi riport innen olvassa ki (mint a SEO-őrszemnél)
  try {
    mkdirSync(join(ROOT, 'memory'), { recursive: true });
    writeFileSync(STATE, JSON.stringify({
      at: new Date().toISOString(), dry: DRY, keep_days: KEEP_DAYS,
      articles: files.size, logs: logCount, actions: report
    }, null, 2), 'utf-8');
  } catch { /* a lelet a naplóban akkor is ott van */ }
}

// A takarítás SOHA ne állítsa meg a kiadást → mindig 0-val zárunk.
//
// MIÉRT NEM process.exit(0): a régi embedding-próba hálózati hívást indított,
// és az azonnali exit egy még nyitott kezelő mellett libuv-hibát dobott a
// naplóba ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"). A munka
// ilyenkor már kész volt, de a CI-naplóban riasztónak látszik.
// A próba 2026-09-06 óta NINCS (a Házmester egyetlen hálózati hívást sem
// indít), tehát a tünet oka megszűnt — de a türelmes kilépés így is helyes,
// és nem kerül semmibe: ha nincs nyitott kezelő, a Node azonnal kilép.
function finish() {
  process.exitCode = 0;
  const t = setTimeout(() => process.exit(0), 3000);
  t.unref();   // ha nincs más dolga, a Node azonnal kilép — nem várjuk ki
}
main().then(finish).catch(e => {
  console.error('💥 HÁZMESTER HIBA (nem kritikus):', String(e.message).slice(0, 200));
  finish();
});
