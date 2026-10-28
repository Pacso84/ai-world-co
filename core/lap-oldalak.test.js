// 📄 Papírlapos fejléc a menüoldalakon (2026-10-28). Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LAPO_SZ, utmutatoLapHtml, eszkozLapHtml, honapLapHtml, honapId, kerdesLapHtml, szovegLapHtml, napIndex, TEMA_IKON, nagyKezdo } from './lap-oldalak.js';
import { TEMAK } from './topics.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8').replace(/\r\n/g, '\n');   // sorvég-független (munkamodszer-tanulsagok)
const CSS = readFileSync(join(ROOT, 'website', 'assets', 'style.css'), 'utf-8');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const fv = nev => { const i = BUILD.indexOf('function ' + nev + '('); assert.ok(i > 0, 'nincs: ' + nev); return BUILD.slice(i, BUILD.indexOf('\nfunction ', i + 10)); };

console.log('\n🧪 lap-oldalak');

t('🌐 mindhárom nyelvnek ugyanazok a feliratai, és hu/es-en nincs angol szó a lapokon', () => {
  const kulcsok = Object.keys(LAPO_SZ.en).sort();
  for (const l of ['hu', 'es']) assert.deepEqual(Object.keys(LAPO_SZ[l]).sort(), kulcsok, l);
  for (const lang of ['hu', 'es']) {
    const html = utmutatoLapHtml({ lang, fej: 'f', href: 'h', cim: 'c', lepesek: ['1', '2', '3', '4', '5', '6'] })
      + eszkozLapHtml({ lang, nev: 'X', db: 3, hivatalos: [{ href: 'https://x.com', felirat: 'X' }], elso: { href: 'a', cim: 'b' }, horgony: 'c-x' })
      + honapLapHtml({ lang, honapok: [{ id: 'm-1', nev: 'n', db: 2 }] }) + kerdesLapHtml({ lang, kerdesek: [{ t: 'q', db: 4 }] });
    for (const angol of ['Open the guide', 'more step', 'Tool of the day', 'Official sites', 'Start with', 'guides', 'Stories by month', 'stories', 'questions', 'answers to pick', 'About 1 minute'])
      assert.ok(!html.includes(angol), `${lang}: angol felirat: ${angol}`);
  }
});

t('🧭 útmutató-lap: max 4 lépés, a többi „még N lépés”, egyes/többes szám; lépés nélkül nincs üres lista', () => {
  const h = utmutatoLapHtml({ lang: 'en', fej: 'F', href: 'article/x', cim: 'Cím', lepesek: ['a', 'b', 'c', 'd', 'e'] });
  assert.equal((h.match(/<li>/g) || []).length, 4); assert.match(h, /\+ 1 more step</);
  assert.match(utmutatoLapHtml({ lang: 'en', fej: 'F', href: 'x', cim: 'c', lepesek: 'abcdefg'.split('') }), /\+ 3 more steps/);
  assert.doesNotMatch(utmutatoLapHtml({ lang: 'en', fej: 'F', href: 'x', cim: 'c' }), /<ol/);
});

t('📅 a nap eszköze naponta lép, egy napon belül állandó; üres listánál -1', () => {
  const n = 16;
  assert.equal(napIndex(n, new Date('2026-10-28T01:00:00Z')), napIndex(n, new Date('2026-10-28T23:00:00Z')));
  assert.notEqual(napIndex(n, new Date('2026-10-28T01:00:00Z')), napIndex(n, new Date('2026-10-29T01:00:00Z')));
  assert.equal(napIndex(0), -1);
});

t('🗂️ archívum: a hónap-azonosító egyezik a lap linkjével; a pecsét az összes hírt számolja', () => {
  assert.equal(honapId('2026-10'), 'm-2026-10');
  const h = honapLapHtml({ lang: 'en', honapok: [{ id: 'm-2026-10', nev: 'October 2026', db: 3 }, { id: 'm-2026-09', nev: 'September 2026', db: 4 }] });
  assert.match(h, /href="#m-2026-10"/); assert.match(h, /7 stories/);
  assert.match(fv('buildArchivePage'), /<section class="arch__month" id="\$\{g\.id\}">/, 'a hónap-szekció nem kapja meg a horgonyt');
});

t('🛡️ escape: cím, eszköznév, kérdés nem kerül nyersen a HTML-be', () => {
  const h = utmutatoLapHtml({ lang: 'en', fej: 'F', href: 'x', cim: '<img>', lepesek: ['<b>'] }) + kerdesLapHtml({ lang: 'en', kerdesek: [{ t: '<i>', db: 1 }] })
    + szovegLapHtml({ fej: 'f', szoveg: '<s>' }) + eszkozLapHtml({ lang: 'en', nev: '<x>', db: 1, horgony: 'c' });
  for (const nyers of ['<img>', '<b>', '<i>', '<s>', '<x>']) assert.ok(!h.includes(nyers), nyers);
});

t('🏷️ minden témának van ikonja; a szint nagybetűvel kezdődik', () => {
  for (const tm of TEMAK) assert.ok(TEMA_IKON[tm.id], 'nincs ikon: ' + tm.id);
  assert.equal(nagyKezdo('kezdő'), 'Kezdő'); assert.equal(nagyKezdo(''), '');
});

t('🔌 a build.js hat menüoldalt papírlapos fejléccel épít, a régi guides-hero fejléc ott eltűnt', () => {
  for (const nev of ['buildGuidesPage', 'buildTopicPage', 'buildToolsPage', 'buildArchivePage', 'buildAboutPage', 'buildWizardPage']) {
    const kod = fv(nev);
    assert.match(kod, /lapHeroHtml\(/, nev + ': nincs papírlapos fejléc');
    assert.doesNotMatch(kod.slice(0, kod.indexOf('lapHeroHtml(')), /<section class="guides-hero">\s*<p class="intro__kicker">/, nev + ': a régi fejléc maradt');
  }
  assert.match(fv('buildTopicPage'), /temaLeiras\(sz\.rovid, cikkek\.length, LANG\)/, 'a témaoldal bevezetője a lefordított témaleírás');
  assert.doesNotMatch(fv('buildAboutPage'), /startS3h'\)\}<\/h2>/, 'az aranyszabály kétszer szerepel (lap + kártya)');
  assert.match(fv('buildToolsPage'), /#c-|c-\$\{companySlug\(napCeg\)\}/, 'a nap eszköze nem a cég-horgonyra mutat');
});

t('🎨 a lapokban használt minden lh- osztálynak van stílusa', () => {
  const html = utmutatoLapHtml({ lang: 'en', fej: 'f', href: 'h', cim: 'c', lepesek: '123456'.split('') })
    + eszkozLapHtml({ lang: 'en', nev: 'X', db: 3, hivatalos: [{ href: 'https://x.com', felirat: 'X' }], elso: { href: 'a', cim: 'b' }, horgony: 'c-x' })
    + honapLapHtml({ lang: 'en', honapok: [{ id: 'm', nev: 'n', db: 1 }] }) + kerdesLapHtml({ lang: 'en', kerdesek: [{ t: 'q', db: 2 }] })
    + BUILD.match(/class="lh-gomb"/)[0];
  const osztalyok = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(c => c.startsWith('lh-')));
  for (const c of osztalyok) assert.ok(CSS.includes('.' + c), 'nincs stílus: .' + c);
});

if (hiba) { console.log(`\n❌ lap-oldalak.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ lap-oldalak.test: mind rendben');
