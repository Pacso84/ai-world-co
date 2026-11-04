// Őszinte lastmod a sitemapban (2026-10-19, kutatás: „Látogatószerzés a mostani oldalra").
// A hub- és állandó oldalak napi 3× „ma" dátumot kaptak, az útmutatók a MEGJELENÉS
// napját — a Google figyelmen kívül hagyja az ilyen dátumot, a Bing szerint
// (Fabrice Canel) pedig elveszti a bizalmát benne. Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { napja, cikkLastmod, gyujtoLastmod, sitemapSor, valodiModositas } from './sitemap-lastmod.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8').replace(/\r\n/g, '\n');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

console.log('\n🧪 sitemap-lastmod');

t('📅 napja: ISO → ÉÉÉÉ-HH-NN, hibásra null (nem kitalált dátum)', () => {
  assert.equal(napja('2026-10-19T15:14:02.123Z'), '2026-10-19');
  for (const rossz of ['', null, undefined, 'tegnap', 42]) assert.equal(napja(rossz), null);
});

t('📄 cikk: a VALÓDI utolsó változás, nem a megjelenés', () => {
  assert.equal(cikkLastmod({ publishedAt: '2026-08-01T10:00:00Z', modifiedAt: '2026-10-02T09:00:00Z' }), '2026-10-02');
  assert.equal(cikkLastmod({ publishedAt: '2026-08-01T10:00:00Z' }), '2026-08-01', 'módosítás nélkül a megjelenés');
  assert.equal(cikkLastmod({}), null);
});

t('🗂️ gyűjtőoldal: a rajta lévő legfrissebb cikk dátuma — üres listán null', () => {
  const lista = [{ publishedAt: '2026-10-01' }, { publishedAt: '2026-09-01', modifiedAt: '2026-10-15T08:00:00Z' }, { publishedAt: '2026-10-03' }];
  assert.equal(gyujtoLastmod(lista), '2026-10-15');
  assert.equal(gyujtoLastmod([]), null);
  assert.equal(gyujtoLastmod(null), null);
});

t('🧾 sitemap-sor: dátum nélkül NINCS <lastmod> (a szabvány szerint elhagyható)', () => {
  assert.equal(sitemapSor({ loc: 'https://aiworldhq.com/about', date: null }), '  <url><loc>https://aiworldhq.com/about</loc></url>');
  assert.equal(sitemapSor({ loc: 'https://aiworldhq.com/', date: '2026-10-19' }), '  <url><loc>https://aiworldhq.com/</loc><lastmod>2026-10-19</lastmod></url>');
});

t('🔌 a build NEM ír többé „ma"-t a sitemapba, és a sorokat a modul rajzolja', () => {
  const sm = build.slice(build.indexOf('const sitemapUrls = []'), build.indexOf("writeFileSync(join(OUT_DIR, 'sitemap.xml')"));
  assert.ok(sm.length > 500, 'nem találom a sitemap-részt');
  assert.ok(!/sitemapUrls\.push\(\{[^}]*date: today/.test(sm), '🔴 maradt „date: today" a sitemapban');
  assert.ok(/sitemapUrls\.map\(sitemapSor\)/.test(sm), 'a sitemap sorait nem a sitemapSor rajzolja');
  assert.ok(/from '\.\.\/core\/sitemap-lastmod\.js'/.test(build), 'nincs import');
});

t('🔌 a gyűjtőoldalak a SAJÁT tartalmuk dátumát kapják', () => {
  for (const [ut, lista] of [['/`', 'loc'], ['/guides`', 'generalGuides'], ['/tools`', 'companyGuides'], ['/prompts`', 'guides'], ['/archive`', 'news']]) {
    const re = new RegExp(ut.replace(/[/`]/g, m => '\\' + m) + ', date: gyujtoLastmod\\(' + lista + '\\)');
    assert.match(build, re, 'rossz dátumforrás: ' + ut);
  }
  assert.match(build, /\/trending`, date: gyujtoLastmod\(loc\.filter\(a => a\.trend\)\)/);
  assert.match(build, /temaHubUt\(t\.id\)\}`, date: gyujtoLastmod\(lista\)/);
  assert.match(build, /\/article\/\$\{a\.slug\}`, date: cikkLastmod\(a\)/);
});

t('🔌 a felújító-frissítés (fresh_updated_at) is módosításnak számít', () => {
  // 2026-10-20: a képlet a közös valodiModositas()-ba költözött (core/modositas-datum.test.js) — itt VISELKEDÉSRE nézzük.
  assert.match(build, /modifiedAt:\s*valodiModositas\(data\._meta\)/, 'a build nem a közös függvényből számol');
  const alap = { published_at: '2026-08-01T10:00:00Z' };
  for (const mezo of ['howto_upgraded_at', 'fact_checked_at', 'fresh_updated_at']) {
    assert.equal(valodiModositas({ ...alap, [mezo]: '2026-10-02T09:00:00Z' }), '2026-10-02T09:00:00Z', 'nem számít módosításnak: ' + mezo);
  }
});

if (hiba) { console.log(`\n❌ sitemap-lastmod.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ sitemap-lastmod.test: mind rendben');
