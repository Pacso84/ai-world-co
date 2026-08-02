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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTICLES = join(ROOT, 'content', 'articles');
const TRANSLATIONS = join(ROOT, 'content', 'translations');
const IMAGES = join(ROOT, 'website', 'assets', 'images');
const LOGS = join(ROOT, 'logs');
const STORE = join(ROOT, 'memory', 'store.json');
const STATE = join(ROOT, 'memory', 'housekeeping.json');

const DRY = process.argv.includes('--dry');
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

// ── 1. HALOTT EMBEDDINGEK ────────────────────────────────────────────
// A legnagyobb tétel. Csak akkor törlünk, ha a szolgáltatás TÉNYLEG halott —
// ha egyszer visszatérne, az embedding hasznos gyorsítótár, nem szemét.
async function stripEmbeddings() {
  if (!existsSync(STORE)) return;

  let alive = false;
  try {
    const { embedText } = await import('./ai-router.js');
    alive = Array.isArray(await embedText('ping'));
  } catch { alive = false; }

  if (alive) {
    report.push('🧠 embedding: a szolgáltatás ÉL — a vektorok hasznos gyorsítótárak, maradnak.');
    return;
  }

  const before = statSync(STORE).size;
  const store = JSON.parse(readFileSync(STORE, 'utf-8'));
  let n = 0;
  for (const it of (store.items || [])) {
    if (it.embedding !== undefined && it.embedding !== null) { delete it.embedding; n++; }
  }
  if (!n) return;

  const out = JSON.stringify(store, null, 2);
  if (!DRY) writeFileSync(STORE, out, 'utf-8');
  report.push(`🧠 halott embedding törölve: ${n} elem · ${kb(before)} KB → ${kb(out.length)} KB (${Math.round((1 - out.length / before) * 100)}%-kal kisebb)`);
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

async function main() {
  console.log('🧹 HÁZMESTER' + (DRY ? ' — PRÓBA (nem törlök)' : ''));
  console.log('─'.repeat(60));

  const { files, slugs } = liveArticles();
  if (!files.size) { console.log('   ⏭️  Nincs cikk — kihagyom (óvatosságból nem törlök semmit).'); return; }

  await stripEmbeddings();
  pruneLogs();
  pruneImages(slugs);
  pruneTranslations(files);
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
// MIÉRT NEM process.exit(0): az embedding-próba hálózati hívást indít, és a
// azonnali exit egy még nyitott kezelő mellett libuv-hibát dobott a naplóba
// ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"). A munka ilyenkor
// már kész volt, de a CI-naplóban riasztónak látszik. Ezért hagyjuk a Node-ot
// magától kiürülni, és CSAK akkor lövünk, ha valami tényleg beragadna.
function finish() {
  process.exitCode = 0;
  const t = setTimeout(() => process.exit(0), 3000);
  t.unref();   // ha nincs más dolga, a Node azonnal kilép — nem várjuk ki
}
main().then(finish).catch(e => {
  console.error('💥 HÁZMESTER HIBA (nem kritikus):', String(e.message).slice(0, 200));
  finish();
});
