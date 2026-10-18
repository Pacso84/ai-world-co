// ===================================================================
// TESZT — NEM INDEXELENDŐ NYELVEK (2026-09-08 → VISSZAVONVA 2026-10-18)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// TÖRTÉNET. 2026-09-08-án a /hu/ ág noindexet kapott (a Bing 08-21-én
// lépcsőfüggvényként kikapcsolt minket; a magyar a beküldött címek ötöde
// volt, a látogatók 0,7%-a). 2026-10-18-án a user VISSZAVONTA:
// „a magyart nem rejtjük el! az a németre és a franciára volt érvényes!"
// → MA MINDEN ÉLŐ NYELV (en, hu, es) INDEXELHETŐ.
//
// ⚠️ NE KEVERD a `core/retired-langs.js`-szel: a DE/FR VÉGLEG TÖRÖLT
// (301 az angolra). Ez a modul az ÉLŐ lapokról szól.
//
// 🔑 A GÉPEZET MARAD (robots-meta, hreflang, sitemap, seo-őrszem, IndexNow
// mind innen olvas) — de egy nyelv újbóli elrejtése CSAK user-döntéssel
// történhet; ezért a döntést ez a teszt rögzíti, nem csak a modul.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { NOINDEX_LANGS, noindexNyelv, robotsTartalom, indexelhetoNyelvek, noindexKifogas } from './noindex-langs.js';
import { RETIRED_LANGS } from './retired-langs.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'website', 'public');
const ELO = ['en', 'hu', 'es'];

let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 nem indexelendő nyelvek\n');

// ===================================================================
// 1. A DÖNTÉS RÖGZÍTÉSE
// ===================================================================
t('🔑 a döntés (10-18, user: „a magyart nem rejtjük el!"): EGYETLEN élő nyelv sincs elrejtve', () => {
  assert.deepEqual(NOINDEX_LANGS, [], 'egy nyelv újbóli elrejtése csak user-döntéssel: ' + JSON.stringify(NOINDEX_LANGS));
  for (const l of [...ELO, '', 'HU', ' hu ']) assert.equal(noindexNyelv(l), false, 'elrejtett nyelv: ' + JSON.stringify(l));
});

t('hibás bemenet nem dob, és NEM tilt', () => {
  for (const rossz of [null, undefined, 42, {}, []]) {
    assert.doesNotThrow(() => noindexNyelv(rossz));
    assert.equal(noindexNyelv(rossz), false, 'ismeretlen bemenetre NEM tiltunk: ' + String(rossz));
  }
});

t('🔑 ez NEM a kivezetett nyelvek listája — a kettő külön dolog', () => {
  // A `RETIRED_LANGS` (de, fr) VÉGLEG TÖRÖLT: azok a címek 301-et kapnak.
  // Ha a kettő összekeveredne, vagy 301-et adnánk élő oldalra, vagy
  // noindexet egy nem létezőre.
  for (const l of NOINDEX_LANGS) assert.ok(!RETIRED_LANGS.includes(l), `a(z) ${l} mindkét listán szerepel`);
  for (const l of ELO) assert.ok(!RETIRED_LANGS.includes(l), `élő nyelv (${l}) a törölt listán`);
});

// ===================================================================
// 2. A ROBOTS-CÍMKE TARTALMA
// ===================================================================
t('🔑 egyik élő nyelv sem kap noindexet — a magyar sem', () => {
  for (const l of [...ELO, '']) assert.ok(!/noindex/.test(robotsTartalom(l)), 'noindex: ' + (l || 'angol gyökér'));
});

t('🔑 nofollow sehol — a belső linkek értéke ne vesszen el', () => {
  for (const l of [...ELO, '']) assert.ok(!/nofollow/.test(robotsTartalom(l)), 'nofollow: ' + (l || 'angol gyökér'));
});

t('🔑 a max-image-preview MINDEN ágon bent marad', () => {
  // A `core/seo-guard.js` NO_DISCOVER_META szabálya minden mintavett oldalon
  // megköveteli — enélkül minden futásban riasztana.
  for (const l of [...ELO, '']) assert.match(robotsTartalom(l), /max-image-preview:large/, 'kiesett: ' + l);
});

// ===================================================================
// 3. AMIT A KERESŐKNEK HIRDETÜNK (hreflang, sitemap, IndexNow)
// ===================================================================
t('🔑 mindhárom élő nyelv hirdethető — a magyar is', () => {
  assert.deepEqual(indexelhetoNyelvek(['en', 'hu', 'es']), ['en', 'hu', 'es']);
});

t('hibás bemenetre üres lista, nem dobás', () => {
  for (const rossz of [null, undefined, 'hu', 42]) {
    assert.doesNotThrow(() => indexelhetoNyelvek(rossz));
    assert.deepEqual(indexelhetoNyelvek(rossz), []);
  }
});

// ===================================================================
// 3/b. AZ ŐRSZEM DÖNTÉSE — VISELKEDÉSBEN, nem forrásban
// ===================================================================
// A `core/seo-guard.js` a végén feltétel nélkül hívja a `main()`-t, ezért a
// döntése ide költözött, ahol tesztelhető (mutációból született, 09-08).
console.log('\n🧪 az őrszem döntése (viselkedés, nem forrás)');

const LAP = (noindexel) => '<html><head><meta name="robots" content="'
  + (noindexel ? 'noindex, follow, ' : '') + 'max-image-preview:large"></head></html>';

t('🔑 noindex BÁRMELY élő nyelvi oldalon lelet — a MAGYARON IS', () => {
  // Ha egy elfelejtett címke a magyar lapokon maradna, a visszakapcsolás
  // csak papíron történne meg — ezt az őrszemnek jeleznie kell.
  for (const ut of ['/hu/index.html', '/hu/article/valami.html', '/index.html', '/es/article/x.html']) {
    const k = noindexKifogas(ut, LAP(true));
    assert.ok(k, 'nem szólt a noindexre: ' + ut);
    assert.equal(k.kod, 'NOINDEX');
  }
});

t('a rendes oldalak csendesek maradnak — a magyar is', () => {
  for (const ut of ['/index.html', '/hu/index.html', '/hu/article/x.html', '/es/index.html', '/article/x.html']) {
    assert.equal(noindexKifogas(ut, LAP(false)), null, 'hamis riasztás: ' + ut);
  }
});

t('a windowsos útelválasztó sem zavarja meg', () => {
  assert.equal(noindexKifogas('\\hu\\index.html', LAP(false)), null);
  assert.ok(noindexKifogas('\\hu\\index.html', LAP(true)), 'windowsos úton nem vette észre a noindexet');
});

t('hibás bemenetre nem dob', () => {
  for (const rossz of [null, undefined, 42, {}]) {
    assert.doesNotThrow(() => noindexKifogas(rossz, LAP(false)));
    assert.doesNotThrow(() => noindexKifogas('/index.html', rossz));
  }
});

// ===================================================================
// 4. AZ ÉPÍTETT KIMENETEN — „a kézzel gyártott minta az ALAKOT nézi"
// ===================================================================
console.log('\n🧪 az épített kimeneten (ha van helyi build)');

const van = existsSync(join(PUBLIC, 'index.html'));
if (!van) console.log('  (nincs helyi build — ezt a szakaszt kihagyom; a CI a build ELŐTT futtat teszteket)');

const robotsOf = (p) => {
  const f = join(PUBLIC, p);
  if (!existsSync(f)) return null;
  return (readFileSync(f, 'utf-8').match(/<meta name="robots" content="([^"]*)"/) || [])[1] || null;
};

t('🔑 ÉLES: egyik főoldal sem kap noindexet (en, hu, es)', () => {
  if (!van) return;
  for (const p of ['index.html', 'hu/index.html', 'es/index.html']) {
    const r = robotsOf(p);
    assert.ok(r && !/noindex/.test(r), '⚠️ noindex: ' + p + ' → ' + r);
  }
});

t('🔑 ÉLES: a CIKK-oldalak sem (nem csak a főoldal)', () => {
  if (!van) return;
  for (const dir of ['article', 'hu/article', 'es/article']) {
    const d = join(PUBLIC, dir);
    if (!existsSync(d)) continue;
    const f = readdirSync(d).filter(x => x.endsWith('.html'))[0];
    if (!f) continue;
    const r = robotsOf(join(dir, f));
    assert.ok(!/noindex/.test(r || ''), dir + ' cikk robots: ' + r);
  }
});

t('🔑 ÉLES: a magyar lapok MEGVANNAK', () => {
  if (!van) return;
  const d = join(PUBLIC, 'hu');
  assert.ok(existsSync(d), '⚠️ A /hu/ MAPPA ELTŰNT');
  let db = 0;
  const jar = (x) => { for (const e of readdirSync(x, { withFileTypes: true })) { const p = join(x, e.name); if (e.isDirectory()) jar(p); else if (e.name.endsWith('.html')) db++; } };
  jar(d);
  // KIMÉRVE 2026-09-08: 942 magyar html. A küszöb jóval alatta.
  assert.ok(db > 500, '⚠️ csak ' + db + ' magyar lap maradt — valaki törli őket');
});

t('🔑 ÉLES: a sitemap hirdeti a magyart ÉS a spanyolt', () => {
  if (!van) return;
  const sm = join(PUBLIC, 'sitemap.xml');
  if (!existsSync(sm)) { console.log('     (nincs sitemap)'); return; }
  const locs = [...readFileSync(sm, 'utf-8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const hu = locs.filter(u => u.includes('/hu/')).length;
  const es = locs.filter(u => u.includes('/es/')).length;
  console.log('     ↳ sitemap: ' + locs.length + ' URL — /hu/: ' + hu + ', /es/: ' + es);
  assert.ok(hu > 100, '⚠️ a sitemap NEM küldi be a magyar címeket (' + hu + ')');
  assert.ok(es > 100, '⚠️ a spanyol kiesett a sitemapből (' + es + ')');
  // A `core/live-guard.js` SITEMAP_SHRUNK küszöbe 500.
  assert.ok(locs.length > 500, 'a sitemap 500 alá esett (' + locs.length + ') — a live-guard riasztana');
});

t('🔑 ÉLES: a hreflang hirdeti a magyart és a spanyolt', () => {
  if (!van) return;
  const html = readFileSync(join(PUBLIC, 'index.html'), 'utf-8');
  const alt = html.match(/<link rel="alternate" hreflang="[^"]+"[^>]*>/g) || [];
  assert.ok(alt.some(a => /hreflang="hu"/.test(a)), '⚠️ a hreflang nem hirdeti a magyart: ' + alt.join(' '));
  assert.ok(alt.some(a => /hreflang="es"/.test(a)), 'a spanyol hreflang eltűnt');
});

t('🔑 ÉLES: a LÁTOGATÓ nyelvváltójában a magyar megvan', () => {
  if (!van) return;
  const html = readFileSync(join(PUBLIC, 'index.html'), 'utf-8');
  assert.match(html, /<option value="[^"]*\/hu\/"/, '⚠️ a magyar eltűnt a nyelvváltóból');
});

t('🔑 ÉLES: a robots.txt NEM tilthatja le a /hu/-t', () => {
  if (!van) return;
  const p = join(PUBLIC, 'robots.txt');
  if (!existsSync(p)) { console.log('     (nincs robots.txt)'); return; }
  assert.ok(!/Disallow:\s*\/hu/i.test(readFileSync(p, 'utf-8')), '⚠️ Disallow a /hu/-ra');
});

// ===================================================================
// 5. BEKÖTÉS-ŐR — a gépezet minden ponton EBBŐL a modulból olvas
// ===================================================================
// ⚠️ A KOMMENTEKET LEVÁGJUK: a kommentek is leírják a függvények nevét — egy
// kivágott hívást a puszta névkeresés zölden átengedne.
console.log('\n🧪 bekötés — a szabály mind a négy helyre eljut');

const kod = (p) => {
  const f = join(ROOT, p);
  if (!existsSync(f)) return '';
  return readFileSync(f, 'utf-8').split('\n').filter(s => !s.trim().startsWith('//')).join('\n');
};

t('🔌 a BUILD használja: robots-meta, hreflang és sitemap', () => {
  const b = kod('website/build.js');
  assert.ok(b, 'nem olvasható a website/build.js');
  assert.ok(/from '\.\.\/core\/noindex-langs\.js'/.test(b), 'nincs import');
  assert.ok(/content="\$\{robotsTartalom\(/.test(b), 'a robots-meta nem a modulból jön');
  assert.ok(/indexelhetoNyelvek\(SITE_LANGS\)/.test(b), 'a hreflang nem a modulból szűr');
  assert.ok(/if\s*\(\s*!noindexNyelv\(lang\)\s*\)/.test(b), 'a sitemap nem a modulból szűr');
});

t('🔌 a SEO-ŐRSZEM ezt a döntést használja (nem sajátot)', () => {
  const s = kod('core/seo-guard.js');
  assert.ok(/from '\.\/noindex-langs\.js'/.test(s), 'nincs import a seo-guard-ban');
  assert.ok(/noindexKifogas\s*\(\s*rel\s*,\s*html\s*\)/.test(s),
    'a seo-guard nem a közös döntést hívja — saját, tesztelhetetlen másolata van');
  assert.ok(!s.includes('name="robots"[^>]*noindex'),
    '⚠️ visszakerült a saját noindex-felismerés a seo-guard-ba — az ott nem tesztelhető');
});

t('🔌 az INDEXNOW ezt a döntést használja', () => {
  const i = kod('core/indexnow.js');
  assert.ok(/from '\.\/noindex-langs\.js'/.test(i), 'nincs import az indexnow-ban');
  assert.ok(/LANGS[\s\S]{0,120}?noindexNyelv\s*\(/.test(i), 'a LANGS lista nincs szűrve');
  assert.ok(/'\/hu'/.test(i), 'a magyar ág hiányzik az IndexNow nyelvlistájából');
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} noindex-langs.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
