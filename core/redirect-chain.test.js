// ===================================================================
// TESZT — átirányítás-lánc kiegyenesítése
// ===================================================================
// INGYENES, hálózat nélküli. A záró eset a VALÓDI
// `content/slug-history.json`-on fut (csak olvas).
//
// MI TÖRTÉNT (2026-09-08, a user Search Console-képéből)
// ─────────────────────────────────────────────────────
// A GSC „Átirányítási hiba: 2" sora mögött ez állt, élesben mérve:
//     /article/summarise-any-text-with-chatgpt-for-everyday-use
//       301 → /article/how-to-get-ai-insights-anywhere-with-genie-one-on-your-phone
//       301 → /article/databricks-puts-genie-one-on-your-phone-ai-insights-on-the-go
//       200
// Két ugrás egy cím eléréséhez. Három nyelven és `.html`-lel együtt ez 6
// fölösleges szabály a `_redirects`-ben — abban a fájlban, aminek a
// Cloudflare-plafonja 2100 sor, és amiről 2026-08-15-én már megtanultuk,
// hogy a 83%-áig hízott.
//
// 🔑 A LÁNC NEM HIBA, HANEM KÖVETKEZMÉNY: minden KÉTSZER átnevezett cikk
// gyárt egyet. A `slug-history.json` szándékosan TÖRTÉNET — nem írjuk át.
// Amit ki kell egyenesíteni, az a KISZOLGÁLT átirányítás.
//
// ⚠️ A KÖR (A→B→A) NEM ELMÉLETI: két átnevezés visszavihet egy régi címre.
// Ott a kiegyenesítés végtelen ciklus lenne, ezért külön kezeljük.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { vegcel, laposit, MAX_LEPES } from './redirect-chain.js';

// ⚠️ `fileURLToPath`, NEM `.pathname` — Windowson az utóbbi „/C:/AI%20work/…"
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 átirányítás-lánc — egy ugrásban érjen célba\n');

// ===================================================================
// 1. A VALÓDI ESET
// ===================================================================
const VALODI = {
  'summarise-any-text-with-chatgpt-for-everyday-use':
    'how-to-get-ai-insights-anywhere-with-genie-one-on-your-phone',
  'how-to-get-ai-insights-anywhere-with-genie-one-on-your-phone':
    'databricks-puts-genie-one-on-your-phone-ai-insights-on-the-go'
};

t('🔑 a VALÓDI láncot egyenesre húzza', () => {
  assert.equal(
    vegcel(VALODI, 'summarise-any-text-with-chatgpt-for-everyday-use'),
    'databricks-puts-genie-one-on-your-phone-ai-insights-on-the-go');
});

t('a lánc KÖZEPE változatlanul a végcélra mutat', () => {
  assert.equal(
    vegcel(VALODI, 'how-to-get-ai-insights-anywhere-with-genie-one-on-your-phone'),
    'databricks-puts-genie-one-on-your-phone-ai-insights-on-the-go');
});

t('a `laposit()` MINDEN bejegyzést a végcélra állít', () => {
  const l = laposit(VALODI);
  const cel = 'databricks-puts-genie-one-on-your-phone-ai-insights-on-the-go';
  assert.equal(l.get('summarise-any-text-with-chatgpt-for-everyday-use'), cel);
  assert.equal(l.get('how-to-get-ai-insights-anywhere-with-genie-one-on-your-phone'), cel);
  assert.equal(l.size, 2, 'nem gyárthat új bejegyzést');
});

// ===================================================================
// 2. A MÁSIK IRÁNY — ami nem lánc, azt ne bántsa
// ===================================================================
t('🔑 a lánc NÉLKÜLI bejegyzést változatlanul hagyja', () => {
  const h = { 'regi-a': 'uj-a', 'regi-b': 'uj-b' };
  const l = laposit(h);
  assert.equal(l.get('regi-a'), 'uj-a');
  assert.equal(l.get('regi-b'), 'uj-b');
  assert.equal(l.size, 2);
});

t('a hosszabb láncot is végigköveti (3 ugrás)', () => {
  assert.equal(vegcel({ a: 'b', b: 'c', c: 'd' }, 'a'), 'd');
});

// ===================================================================
// 3. A KÖR — itt egy naiv megoldás VÉGTELEN CIKLUSBA fut
// ===================================================================
t('🔑 a KÖRT felismeri és nem fagy le (A→B→A)', () => {
  let eredmeny;
  assert.doesNotThrow(() => { eredmeny = vegcel({ a: 'b', b: 'a' }, 'a'); });
  // Bármit adhat vissza, EGYET nem: nem futhat örökké és nem dobhat.
  assert.ok(typeof eredmeny === 'string' || eredmeny === null,
    'kör esetén értelmetlen választ adott: ' + JSON.stringify(eredmeny));
});

t('a KÖRÖS bejegyzés kimarad a lapításból (inkább semmi, mint hurok)', () => {
  const l = laposit({ a: 'b', b: 'a', 'regi': 'uj' });
  assert.equal(l.get('regi'), 'uj', 'az ártatlan bejegyzést is eldobta');
  assert.equal(l.has('a'), false, 'körös szabályt engedett ki — az hurok lenne élesben');
  assert.equal(l.has('b'), false);
});

t('az önmagára mutató bejegyzés kimarad', () => {
  const l = laposit({ x: 'x', 'regi': 'uj' });
  assert.equal(l.has('x'), false);
  assert.equal(l.get('regi'), 'uj');
});

t('a lépés-korlát létezik és ésszerű', () => {
  assert.ok(MAX_LEPES >= 5 && MAX_LEPES <= 50, 'gyanús lépés-korlát: ' + MAX_LEPES);
});

// ===================================================================
// 4. HIBÁS BEMENET
// ===================================================================
t('hibás/üres bemenetre nem dob', () => {
  for (const rossz of [null, undefined, 'nem objektum', 42, [], {}]) {
    assert.doesNotThrow(() => laposit(rossz));
    assert.doesNotThrow(() => vegcel(rossz, 'a'));
  }
  assert.equal(laposit(null).size, 0);
});

// ===================================================================
// 5. A VALÓDI FÁJLON — „a kézzel gyártott minta az ALAKOT ellenőrzi"
// ===================================================================
// A projekt kemény szabálya: minden ilyen modul kap egy záró esetet, ami a
// VALÓDI adaton fut. A fenti minták a fejemből jöttek, ez a lemezről.
t('🔑 az ÉLES slug-history-ban a lapítás után NINCS lánc', () => {
  const hist = JSON.parse(readFileSync(join(ROOT, 'content', 'slug-history.json'), 'utf-8'));
  const lapos = laposit(hist);
  const maradek = [...lapos.entries()].filter(([, to]) => lapos.has(to));
  assert.deepEqual(maradek.map(([f, t2]) => f + ' → ' + t2), [],
    'lapítás után is maradt lánc — a _redirects két ugrást szolgálna ki');
});

t('a lapítás nem veszít el ÉRVÉNYES átirányítást', () => {
  const hist = JSON.parse(readFileSync(join(ROOT, 'content', 'slug-history.json'), 'utf-8'));
  const lapos = laposit(hist);
  // Csak az önmagára mutató és a körös bejegyzések eshetnek ki.
  const kiesett = Object.keys(hist).filter(k => !lapos.has(k));
  for (const k of kiesett) {
    const koros = hist[k] === k || vegcel(hist, k) === null;
    assert.ok(koros, 'ép átirányítás veszett el a lapításban: ' + k + ' → ' + hist[k]);
  }
});

// ===================================================================
// 5b. AZ ÁTIRÁNYÍTÁS ÉLŐ CIKKRE VIGYEN — különben 301 vezet 404-re
// ===================================================================
t('🔑 minden KILAPÍTOTT átirányítás létező cikkre mutat', () => {
  const hist = JSON.parse(readFileSync(join(ROOT, 'content', 'slug-history.json'), 'utf-8'));
  const elo = new Set();
  for (const f of readdirSync(join(ROOT, 'content', 'articles'))) {
    try {
      const m = JSON.parse(readFileSync(join(ROOT, 'content', 'articles', f), 'utf-8'))._meta || {};
      if (m.slug) elo.add(m.slug);
    } catch { /* olvashatatlan fájl — a többit attól még nézzük */ }
  }
  // ⚠️ A LÁNC KÖZEPE nem számít: az csak átmenő állomás, a lapítás után már
  // nem végcél. Ezért a LAPÍTOTT listát nézzük, nem a nyerset.
  const rossz = [...laposit(hist).entries()]
    .filter(([, to]) => !elo.has(to))
    .map(([f, to]) => f + ' → ' + to);
  assert.deepEqual(rossz, [],
    '301 vezet nem létező cikkre — a látogató 404-et kap két ugrás után:\n     '
    + rossz.join('\n     '));
});

t('🔑 a júl. 19-i összefoglaló halott linkjére van átirányítás', () => {
  // Értéket rögzítő teszt. Az amerikai-helyesírás javítónk 2026-08-30 ELŐTT
  // az URL-eket is átírta: a heti összefoglaló „personalise" slugja
  // „personalize"-ra változott, és a „Read the full story" gomb azóta 404.
  // A gépezet már javítva (core/us-spelling.js védi az URL-eket), ez a
  // maradék sérülés helyreállítása — az élő szöveghez nyúlás nélkül.
  const hist = JSON.parse(readFileSync(join(ROOT, 'content', 'slug-history.json'), 'utf-8'));
  assert.equal(
    hist['personalize-your-ai-connect-it-to-your-everyday-apps'],
    'personalise-your-ai-connect-it-to-your-everyday-apps',
    'hiányzik a 301 az elgépelt (amerikai) alakról a valódi cikkre');
});

// ===================================================================
// 6. BEKÖTÉS-ŐR
// ===================================================================
// A `website/build.js` importálása kimenetet gyártana és ÜRÍTENÉ a public/-ot,
// ezért forrásszinten ellenőrzünk. Az „importálva, de sosem hívva" alak
// forrásszinten pontosan úgy néz ki, mint egy működő bekötés — a HÍVÁST nézzük.
t('🔌 a build TÉNYLEG a lapított listából írja a _redirects-et', () => {
  const forras = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.ok(/from '\.\.\/core\/redirect-chain\.js'/.test(forras),
    'a build.js nem importálja a redirect-chain.js-t');
  assert.ok(/laposit\s*\(/.test(forras),
    'a laposit() csak importálva van, nem HÍVVA — a lánc kimenne élesbe');
  // ⚠️ A mutációs próba szökevénye volt (2026-09-08): a hívás megmaradhat úgy
  // is, hogy az EREDMÉNYT eldobjuk, és a ciklus mégis a nyers történetből megy.
  // A kiszámolt, de fel nem használt érték forrásszinten pontosan úgy néz ki,
  // mint egy működő bekötés. Ezért a CIKLUS FORRÁSÁT is nézzük.
  assert.ok(/for \(const \[from, to\] of lapos\)/.test(forras),
    'a _redirects ciklusa nem a LAPÍTOTT listán megy — a lánc kimenne élesbe');
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} redirect-chain.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
