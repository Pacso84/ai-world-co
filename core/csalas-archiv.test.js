// 🛡️ Csalás-archív (2026-11-28) — betöltő + validátor + a build-bekötés őrei.
// A MINDEN valódi archív fájlt ellenőrző teszt a kézzel írt cikkek gépi kapuja (ár, példa-domain, szerkezet,
// fordítás-egyezés, egy H1, US helyesírás) — a napi gép ellenőrzőin ezek a cikkek NEM mennek át.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  ARCHIV_MAPPA, csalasArchivBetolt, csalasArchivMd, csalasArchivAdat, csalasArchivEllenoriz,
} from './csalas-archiv.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 csalas-archiv');

const fx = JSON.parse(readFileSync(join(ROOT, 'core', 'fixtures', 'csalas-ic3-valasztas.json'), 'utf-8'));
const fm = (cim, md) => `---\ntitle: "${cim}"\nsubtitle: "Minta"\ncategory: "news"\n---\n\n${md}`;
const jo = () => ({
  original_title: 'Scammers Exploit 2026 U.S. Midterm Election',
  article_markdown: fm('Scammers Are Using the 2026 Midterm Elections', fx.en),
  forditas: { hu: fm('Választási csalás', fx.hu), es: fm('Estafa electoral', fx.es) },
  _meta: {
    slug: 'scammers-midterm-minta',
    csalas: { csatorna: 'web', ok: 'minta', forras_id: 'ic3-psa' },
    csalas_archiv: { forras_datum: '2026-10-15', forras_nev: 'FBI' },
    source_link: 'https://www.ic3.gov/PSA/2026/PSA261015',
    source_name: 'FBI IC3',
    published_at: '2026-11-28T21:00:00.000Z',
  },
});
const MA = new Date('2026-11-28T22:00:00Z');

t('✅ jó cikkre üres hibalista', () => {
  assert.deepEqual(csalasArchivEllenoriz(jo(), { ma: MA }), []);
});

const hibaVan = (mod, minta) => {
  const d = jo(); mod(d);
  const h = csalasArchivEllenoriz(d, { ma: MA });
  assert.ok(h.some(x => minta.test(x)), `várt hiba ${minta}, kapott: ${JSON.stringify(h)}`);
};
t('🌐 hiányzó spanyol fordítás → hiba', () => hibaVan(d => { delete d.forditas.es; }, /\[es\] hiányzó fordítás/));
t('📅 2025-ös forrásdátum → hiba', () => hibaVan(d => { d._meta.csalas_archiv.forras_datum = '2025-12-19'; }, /nem 2026-os/));
t('📅 jövőbeli forrásdátum → hiba', () => hibaVan(d => { d._meta.csalas_archiv.forras_datum = '2026-12-05'; }, /nem 2026-os/));
t('🔗 nem jóváhagyott forrás → hiba', () => hibaVan(d => { d._meta.source_link = 'https://example.org/psa'; }, /nem jóváhagyott forrás/));
t('🔗 2025-ös PSA-link → hiba', () => hibaVan(d => { d._meta.source_link = 'https://www.ic3.gov/PSA/2025/PSA251219'; }, /nem jóváhagyott forrás/));
t('🛡️ nincs _meta.csalas → hiba', () => hibaVan(d => { delete d._meta.csalas; }, /nincs _meta\.csalas$/));
t('🔤 rossz slug → hiba', () => hibaVan(d => { d._meta.slug = 'Rossz Slug'; }, /érvénytelen _meta\.slug/));
t('🧪 a magyarból hiányzó példablokk → hiba', () => hibaVan(d => { d.forditas.hu = d.forditas.hu.replace(/^> .*$/gm, ''); }, /\[hu\] nincs \(elemezhető\) példablokk/));
t('💵 ár a szövegben → hiba', () => hibaVan(d => { d.article_markdown += '\n\nThe plan costs $19.99 per month.\n'; }, /\[en\] árat/));
t('🔠 két H1 → hiba', () => hibaVan(d => { d.forditas.es += '\n\n# Otro título\n'; }, /\[es\] nem pontosan 1 H1/));
t('🌐 valódi domain a példában → hiba', () => hibaVan(d => {
  d.article_markdown = d.article_markdown.replace('voter-status.example.com/confirm', 'voter-status.com/confirm');
}, /nem example\.com domain/));
t('🌐 angolul hagyott magyar példa → hiba', () => hibaVan(d => {
  const enBlokk = fx.en.match(/> 🧪[\s\S]*?(?=\n\n1\. )/)[0];
  const huBlokk = fx.hu.match(/> 🧪[\s\S]*?(?=\n\n1\. )/)[0];
  d.forditas.hu = d.forditas.hu.replace(huBlokk, enBlokk);
}, /\[hu\] a példablokk nem egyezik/));

t('📦 csalasArchivAdat: normalizál, hiányosra null', () => {
  assert.deepEqual(csalasArchivAdat(jo()._meta), { forrasNev: 'FBI', forrasDatum: '2026-10-15' });
  assert.equal(csalasArchivAdat({}), null);
  assert.equal(csalasArchivAdat({ csalas_archiv: { forras_datum: 'okt 15', forras_nev: 'FBI' } }), null);
});

t('📄 csalasArchivMd: en / hu / hiányzó', () => {
  const d = jo();
  assert.equal(csalasArchivMd(d, 'en'), d.article_markdown);
  assert.equal(csalasArchivMd(d, 'hu'), d.forditas.hu);
  assert.equal(csalasArchivMd({ article_markdown: 'x' }, 'es'), null);
});

t('📂 betöltő: jó fájl be, hibás JSON és idegen fájlnév ki', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'csarch-'));
  try {
    const dir = join(tmp, ARCHIV_MAPPA);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ARTICLE_SCAM_jo-cikk.json'), JSON.stringify(jo()));
    writeFileSync(join(dir, 'ARTICLE_SCAM_rossz.json'), '{ nem json');
    writeFileSync(join(dir, 'ARTICLE_mas.json'), JSON.stringify(jo()));
    const l = csalasArchivBetolt(tmp);
    assert.equal(l.length, 1);
    assert.equal(l[0].file, 'ARTICLE_SCAM_jo-cikk.json');
    assert.deepEqual(csalasArchivBetolt(join(tmp, 'nincs')), []);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

t('🛡️ MINDEN valódi archív cikk átmegy a kapun (content/csalas-archiv/)', () => {
  const rossz = [];
  const slugok = new Set();
  for (const { file, data } of csalasArchivBetolt(ROOT)) {
    const h = csalasArchivEllenoriz(data);
    if (h.length) rossz.push(`${file}: ${h.join(' · ')}`);
    if (`ARTICLE_SCAM_${data._meta?.slug}.json` !== file) rossz.push(`${file}: a fájlnév nem ARTICLE_SCAM_<slug>.json`);
    if (slugok.has(data._meta?.slug)) rossz.push(`${file}: ismétlődő slug`);
    slugok.add(data._meta?.slug);
  }
  assert.deepEqual(rossz, []);
});

console.log(hiba ? `  ❌ ${hiba} hiba` : '  ✅ minden rendben');
process.exit(hiba ? 1 : 0);
