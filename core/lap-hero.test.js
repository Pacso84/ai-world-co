// 📄 Papírlapos fejléc (2026-10-28): főoldal + szótár. Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LAP_SZ, SZOTAR_CSOPORT, szotarCsoportok, napSzava, fooldalHeroHtml, szotarOldalHtml, lapSavHtml } from './lap-hero.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SZOTAR = JSON.parse(readFileSync(join(ROOT, 'website', 'glossary-data.json'), 'utf-8')).terms;
const BUILD = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
const CSS = readFileSync(join(ROOT, 'website', 'assets', 'style.css'), 'utf-8');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

console.log('\n🧪 lap-hero');

t('📚 a VALÓDI szótár minden szava pontosan egy csoportba kerül, egy sem vész el', () => {
  const csop = szotarCsoportok(SZOTAR);
  const idk = csop.flatMap(c => c.szavak.map(s => s.id));
  assert.equal(idk.length, SZOTAR.length);
  assert.equal(new Set(idk).size, SZOTAR.length, 'duplán szerepel szó');
  const ismeretlen = SZOTAR_CSOPORT.flatMap(c => c.t).filter(id => !SZOTAR.some(s => s.id === id));
  assert.deepEqual(ismeretlen, [], 'a csoportlistában nem létező szó van');
});

t('➕ új (csoportba nem sorolt) szó az alapok végére kerül, nem tűnik el', () => {
  const csop = szotarCsoportok([...SZOTAR, { id: 'uj-szo', en: { term: 'New word', def: 'x' } }]);
  assert.equal(csop[0].szavak.at(-1).id, 'uj-szo');
});

t('📅 a nap szava napról napra változik, egy napon belül ugyanaz (napi 3 build)', () => {
  const a = napSzava(SZOTAR, new Date('2026-10-28T02:00:00Z'));
  assert.equal(a.id, napSzava(SZOTAR, new Date('2026-10-28T19:00:00Z')).id);
  assert.notEqual(a.id, napSzava(SZOTAR, new Date('2026-10-29T02:00:00Z')).id);
  assert.equal(napSzava([], new Date()), null);
});

t('🔗 a szótár-oldal megtartja a #<id> horgonyokat (a cikkek kisszótár-linkjei ide mutatnak)', () => {
  for (const lang of ['en', 'hu', 'es']) {
    const html = szotarOldalHtml({ terms: SZOTAR, lang, cim: 'X' });
    for (const s of SZOTAR) assert.ok(html.includes(`id="${s.id}"`), `${lang}: hiányzik #${s.id}`);
    assert.equal((html.match(/<h1/g) || []).length, 1, 'pontosan egy h1');
  }
});

t('🌐 nem angol oldalon nincs angol felirat (csoportnév, kereső, pecsét, sáv)', () => {
  for (const lang of ['hu', 'es']) {
    const s = LAP_SZ[lang];
    for (const id of SZOTAR_CSOPORT.map(c => c.id)) assert.ok(s.csop[id], `${lang}: nincs csoportnév: ${id}`);
    const html = szotarOldalHtml({ terms: SZOTAR, lang, cim: 'X' }) + fooldalHeroHtml({ lang, kicker: 'k', maiak: [{ href: 'a', cim: 'c' }] });
    for (const angol of ['Word of the day', 'No jargon', 'The basics', 'Staying safe', 'Find a word', "In today's issue", 'Read the news', 'Follow a guide', 'new today', 'plain English'])
      assert.ok(!html.includes(angol), `${lang}: angol felirat maradt: ${angol}`);
  }
});

t('🗞️ főoldal: van mai cikk → „mai szám” + mai pecsét; hajnalban → legfrissebbek + heti szám; semmi → nincs lap', () => {
  const mai = fooldalHeroHtml({ lang: 'en', kicker: 'Issue 9', maiak: [{ href: 'article/a', cim: 'A' }, { href: 'article/b', cim: 'B' }], frissek: [] });
  assert.match(mai, /In today's issue/); assert.match(mai, /2 new today/); assert.match(mai, /href="article\/a"/);
  const hajnal = fooldalHeroHtml({ lang: 'en', kicker: 'Issue 9', maiak: [], frissek: [{ href: 'article/x', cim: 'X' }], hetiDb: 17 });
  assert.match(hajnal, /Latest stories/); assert.match(hajnal, /17 this week/); assert.doesNotMatch(hajnal, /new today/);
  const ures = fooldalHeroHtml({ lang: 'en', kicker: 'k' });
  assert.doesNotMatch(ures, /lh-lap"/);
  const sok = fooldalHeroHtml({ lang: 'en', kicker: 'k', maiak: 'abcdef'.split('').map(c => ({ href: c, cim: c })) });
  assert.equal((sok.match(/<li><a href/g) || []).length, 4 + 3, 'max 4 cikk a lapon (+3 lépés a sávban)');
  assert.match(sok, /6 new today/, 'a pecsét az összes mai cikket számolja');
});

t('🛡️ a cím és a cikkcímek escape-elve kerülnek a HTML-be', () => {
  const h = fooldalHeroHtml({ lang: 'en', kicker: '<b>', maiak: [{ href: 'a"b', cim: '<script>x</script>' }] });
  assert.ok(!h.includes('<script>x'), 'nyers cikkcím'); assert.ok(!h.includes('<b>'), 'nyers kicker'); assert.ok(h.includes('a&quot;b'));
  assert.match(lapSavHtml([{ href: '#x', cimke: 'A&B' }]), /A&amp;B/);
});

t('🔌 a build.js a főoldalt és a szótárt az új fejléccel építi, a régi kártyarács-szótár eltűnt', () => {
  assert.match(BUILD, /import \{ fooldalHeroHtml, szotarOldalHtml \} from '\.\.\/core\/lap-hero\.js'/);
  assert.match(BUILD, /bodyContent: fooldalHero \+ featuredHtml/);
  assert.match(BUILD, /const body = szotarOldalHtml\(/);
  const fv = BUILD.slice(BUILD.indexOf('function buildGlossaryPage'), BUILD.indexOf('function buildGlossaryPage') + 1200);
  assert.doesNotMatch(fv, /gloss__card/, 'a szótár még a régi kártyarácsot építi');
});

t('🎨 a stíluslapban minden használt lh- osztály megvan, telefonos nézettel és csökkentett mozgással', () => {
  const html = szotarOldalHtml({ terms: SZOTAR, lang: 'en', cim: 'X' }) + fooldalHeroHtml({ lang: 'en', kicker: 'k', maiak: [{ href: 'a', cim: 'c' }] });
  const osztalyok = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(c => c.startsWith('lh-')));
  for (const c of osztalyok) assert.ok(CSS.includes('.' + c), 'nincs stílus: .' + c);
  assert.match(CSS, /@media \(max-width: 760px\) \{\s*\.lh-top/);
  assert.match(CSS, /prefers-reduced-motion: no-preference\) \{\s*\.lh-lap/);
});

t('🇺🇸 a szótár angol szövege amerikai írásmódú (recognize, cutoff)', () => {
  const en = SZOTAR.map(s => s.en.term + ' ' + s.en.def).join(' ');
  for (const brit of [/recognis/i, /\bcut-off\b/i, /\bcolour/i, /isation\b/i]) assert.doesNotMatch(en, brit);
});

if (hiba) { console.log(`\n❌ lap-hero.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ lap-hero.test: mind rendben');
