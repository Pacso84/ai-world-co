// ===================================================================
// TESZT — minden `_meta` mezőnek, amit a build / a core OLVAS, legyen ÍRÓJA (2026-11-25)
// ===================================================================
// MIÉRT: a build július óta `_meta.seo.description`-t olvasott, az SEO-agent viszont
// `meta_description`-t írt → 924 cikk meta-leírása SOHA nem jutott ki, és minden „működött”.
// A munka-visszaadó iroda ezt nem foghatta meg (senki nem kapott rossz bemenetet — a munka
// egyszerűen nem ért célba). Ez a teszt a lánc végét nézi: amit valaki olvas, azt valakinek
// írnia kell — a valódi cikkekben léteznie kell (vagy indokolt kivétel legyen).
// ===================================================================
import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n').slice(0, 6).join('\n     ')); }
};
console.log('🧪 olvasott _meta mező → van írója\n');

const METODUS = new Set(['slice', 'includes', 'length', 'map', 'filter', 'startsWith', 'endsWith', 'toLowerCase', 'trim',
  'split', 'join', 'some', 'every', 'find', 'indexOf', 'replace', 'match', 'test', 'forEach', 'reduce', 'concat', 'at']);

/** Egy forrásszöveg `_meta?.a(?.b)` olvasásai „a” vagy „a.b” alakban (metódushívás nélkül). */
export function metaOlvasasok(szoveg) {
  const ki = new Set();
  for (const m of String(szoveg).matchAll(/_meta\??\.([a-zA-Z_][a-zA-Z0-9_]*)(?:\??\.([a-zA-Z_][a-zA-Z0-9_]*))?/g)) {
    ki.add(m[2] && !METODUS.has(m[2]) ? `${m[1]}.${m[2]}` : m[1]);
  }
  return [...ki];
}

// Indokolt kivételek: feltételesen írt mező (ma épp egy cikkben sincs), vagy NEM cikk-`_meta`.
// ⚠️ `seo.description` SOHA nem kerülhet ide.
const KIVETEL = new Map([
  ["csalas", "csalás-figyelő: az író a csalás-vázlatra teszi (agents/iro/agent.js); élő cikkben a /scams oldal (8. rész) után lesz"],
  ["csalas_archiv", "csalás-archív (2026-11-28): a kézzel írt content/csalas-archiv/ fájlokban van (core/csalas-archiv.js), a content/articles-ben SOHA — a napi gép nem írja"],
  ["csalas_video_at", "csalás-Reel (13. rész): a core/reel-post.js prepareCsalasReel írja a gyártáskor — élő cikkben a kapcsoló (CSALAS_FIGYELO_BE) bekapcsolása után lesz"],
  ["csalas_reel_at", "csalás-Reel (13. rész): a core/reel-post.js sendCsalasReel írja a Facebook-küldéskor — élő cikkben a kapcsoló bekapcsolása után lesz"],
  ["fact_check_flag", "a tény-ellenőrző CSAK elavultság-gyanúnál írja (agents/fact-check/agent.js: 'may-be-obsolete') — ma épp egy cikkben sincs"],
  ["source_snippet", "régi kivonat-mező (11-02 óta a privát forrás-tárban; core/forras-cache.js visszafelé-kompatibilis tartaléka)"],
  ["source_text", "csak KOMMENT (core/iro-forras.js 147. sor: a bíró szövegének leírása), nem olvasás"],
  ["updated", "NEM cikk-`_meta`: a memory/store.json és a skills tár saját `_meta.updated` mezője (memory-manager.js, skills.js)"],
  ["tags", "holt, de ártalmatlan: core/image-guard.js a heti összefoglalót a markdown első 600 karakteréből (frontmatter tags) is felismeri"],
]);

// a valódi cikkek mezői
const VAN = new Set();
for (const f of readdirSync(join(ROOT, 'content', 'articles'))) {
  if (!f.endsWith('.json')) continue;
  let m; try { m = JSON.parse(readFileSync(join(ROOT, 'content', 'articles', f), 'utf-8'))._meta || {}; } catch { continue; }
  for (const [k, v] of Object.entries(m)) {
    VAN.add(k);
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const k2 of Object.keys(v)) VAN.add(`${k}.${k2}`);
  }
}
const FORRASOK = [join(ROOT, 'website', 'build.js'),
  ...readdirSync(join(ROOT, 'core')).filter(f => f.endsWith('.js') && !f.endsWith('.test.js')).map(f => join(ROOT, 'core', f))];
const olvasott = new Map();   // mező → fájl(ok)
for (const p of FORRASOK) {
  for (const k of metaOlvasasok(readFileSync(p, 'utf-8'))) {
    if (!olvasott.has(k)) olvasott.set(k, []);
    olvasott.get(k).push(p.slice(ROOT.length + 1).replace(/\\/g, '/'));
  }
}

t('ellenpróba: a gyűjtő megtalálja az elírt mezőt', () => {
  assert.deepEqual(metaOlvasasok('const d = data._meta?.seo?.descriptoin || x;'), ['seo.descriptoin']);
  assert.deepEqual(metaOlvasasok('a._meta.slug.slice(0, 3)'), ['slug']);
});
t('a `seo.description` nem lehet kivétel (ezen veszett el július óta minden leírás)', () => {
  assert.ok(!KIVETEL.has('seo.description'));
});
t('minden olvasott `_meta` mező létezik a valódi cikkekben (vagy indokolt kivétel)', () => {
  const hiany = [...olvasott].filter(([k]) => !VAN.has(k) && !KIVETEL.has(k));
  assert.equal(hiany.length, 0, 'olvasott, de SENKI nem írja:\n' + hiany.map(([k, f]) => `${k}  ← ${[...new Set(f)].join(', ')}`).join('\n'));
});
t('a kivétel-lista nem rejt el ma már létező mezőt (elavult kivétel ki)', () => {
  const elavult = [...KIVETEL.keys()].filter(k => VAN.has(k));
  assert.equal(elavult.length, 0, 'ma már létezik, vedd ki a kivételek közül: ' + elavult.join(', '));
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} rendben, ${bukott} bukott`);
if (bukott) process.exit(1);
