// ===================================================================
// TESZT — publikálási meta (dátum, rögzített slug, fordítás-elavulás)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// A MIÉRT: két út publikál élő cikket, és SZÉTCSÚSZTAK. A CEO-felülbírálás
// útja (agents/ceo/escalate-guides.js) egyik lépést sem csinálta a három
// közül, és emiatt egy cikk `_meta.slug: undefined`-dal ment ki élesbe
// (89f99fa3). Részletek a core/publish-meta.js fejlécében.
//
// ⚠️ Az `agents/` alatti fájlokat FUTTATNI/IMPORTÁLNI TILOS (a puszta import
// pénzt költ és publikál), ezért a bekötést FORRÁS-SZINTEN nézzük.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { publikalasMeta, slugCimbol, SLUG_MAX } from './publish-meta.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const forras = (p) => readFileSync(join(ROOT, p), 'utf-8').replace(/\r\n/g, '\n');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
console.log('🧪 publikálási meta\n');

const MD = 'title: "How to Rename Photos with AI"\n\nSzöveg.';
const UJ = { _meta: {}, article_markdown: MD, original_title: 'Eredeti cím' };
const MOST = '2026-09-12T10:00:00.000Z';

t('ELSŐ megjelenés: mostani dátum, címből képzett slug', () => {
  const m = publikalasMeta({ elozo: null, uj: UJ, fajlnev: 'ARTICLE_X.json', most: MOST });
  assert.equal(m.publishedAt, MOST);
  assert.equal(m.slug, 'how-to-rename-photos-with-ai');
  assert.equal(m.forditasElavult, false, 'nincs előző szöveg — nincs mit elavulttá tenni');
});

t('🔴 ÚJRAKÖZLÉS: a RÉGI dátum és a RÉGI slug SÉRTHETETLEN', () => {
  // Ez a lényeg. Egy cím-átírás SOHA nem költöztetheti el az oldalt, és a
  // dátum sem ugorhat „mára" — különben az archívumban minden egy napnak
  // tűnne. 197 régi slugra emiatt kellett 301-es átirányítás.
  const elozo = {
    _meta: { published_at: '2026-07-01T08:00:00.000Z', slug: 'regi-rogzitett-slug' },
    article_markdown: MD
  };
  const m = publikalasMeta({ elozo, uj: UJ, fajlnev: 'ARTICLE_X.json', most: MOST });
  assert.equal(m.publishedAt, '2026-07-01T08:00:00.000Z', 'a dátum „mára" ugrott');
  assert.equal(m.slug, 'regi-rogzitett-slug', 'a slug elmozdult — az URL megváltozna');
});

t('🔴 a KINT LÉVŐ slug erősebb, mint az újban hozott', () => {
  // Ha az új adat is hoz slugot (pl. egy agent beleírta), akkor is a MÁR
  // MEGJELENT slug nyer. Ez volt a 2026-07-27-i Search Console-hiba.
  const elozo = { _meta: { slug: 'ez-a-megjelent' }, article_markdown: MD };
  const uj = { _meta: { slug: 'ez-csak-javaslat' }, article_markdown: MD };
  assert.equal(publikalasMeta({ elozo, uj, most: MOST }).slug, 'ez-a-megjelent');
});

t('ha nincs kint lévő, az újban hozott slug érvényes', () => {
  const uj = { _meta: { slug: 'ujban-hozott' }, article_markdown: MD };
  assert.equal(publikalasMeta({ elozo: null, uj, most: MOST }).slug, 'ujban-hozott');
});

t('🔴 a fordítás-cache CSAK szövegváltozáskor avul el', () => {
  const alap = { _meta: { slug: 's' }, article_markdown: MD };
  assert.equal(publikalasMeta({ elozo: alap, uj: UJ, most: MOST }).forditasElavult, false,
    'azonos szövegnél FELESLEGES újrafordítás indulna — a 07-31-i cache-ürítés $2,88 volt');
  const mas = { _meta: { slug: 's' }, article_markdown: MD + ' Új mondat.' };
  assert.equal(publikalasMeta({ elozo: mas, uj: UJ, most: MOST }).forditasElavult, true,
    'változott a szöveg, mégsem avul el — a nem-angol oldalak a RÉGIT mutatnák');
});

t('a slug-képlet megegyezik a build.js-ével', () => {
  assert.equal(slugCimbol('title: "Ékezetes Cím & Jelek!"', null, null), 'kezetes-c-m-jelek');
  assert.equal(slugCimbol('', 'Tartalék Cím', null), 'tartal-k-c-m');
  assert.equal(slugCimbol('', null, 'ARTICLE_valami.json'), 'article-valami-json');
  assert.equal(slugCimbol('', null, null), '', 'üres bemenetre üres slug, nem hiba');
  const hosszu = 'title: "' + 'a'.repeat(200) + '"';
  assert.equal(slugCimbol(hosszu, null, null).length, SLUG_MAX, 'a hossz-plafon nem érvényesül');
});

t('hiányzó bemenetre sem dob', () => {
  const m = publikalasMeta();
  assert.ok(typeof m.publishedAt === 'string' && m.publishedAt.length > 0);
  assert.equal(m.slug, '');
  assert.equal(m.forditasElavult, false);
});

// ===================================================================
// BEKÖTÉS-ŐR — MINDKÉT publikáló út
// ===================================================================

t('🔌 az ELLENŐRZŐ útja a közös modult használja', () => {
  const s = forras('agents/ellenorzo/agent.js').split('\n').filter(x => !/^\s*\/\//.test(x)).join('\n');
  assert.ok(/import \{ publikalasMeta \} from '\.\.\/\.\.\/core\/publish-meta\.js'/.test(s),
    '🔴 nincs import');
  assert.ok(/publikalasMeta\(\{ elozo: prev, uj: writerData/.test(s), '🔴 nem hívja');
  // és a RÉGI, beírt logika NEM maradhat ott — különben megint két példány van
  assert.ok(!/if \(prev\?\._meta\?\.slug\) pinnedSlug = prev\._meta\.slug/.test(s),
    '🔴 ottmaradt a régi, beírt slug-logika — újra két példány van');
});

t('🔌 a CEO FELÜLBÍRÁLÁS útja is a közös modult használja', () => {
  const s = forras('agents/ceo/escalate-guides.js').split('\n').filter(x => !/^\s*\/\//.test(x)).join('\n');
  assert.ok(/import \{ publikalasMeta \} from '\.\.\/\.\.\/core\/publish-meta\.js'/.test(s),
    '🔴 nincs import');
  assert.ok(/const meta = publikalasMeta\(\{/.test(s), '🔴 nem hívja');
  assert.ok(/slug: meta\.slug/.test(s), '🔴 a slug NEM kerül a kimenetbe — ez volt az eredeti hiba');
  assert.ok(/published_at: meta\.publishedAt/.test(s), '🔴 a dátum megint „mára" ugrana');
  assert.ok(/meta\.forditasElavult/.test(s), '🔴 a fordítás-cache nem ürül');
  // a régi, mindig-mostani dátum NEM maradhat a published_at-on
  assert.ok(!/published_at: new Date\(\)\.toISOString\(\)/.test(s),
    '🔴 ottmaradt a mindig-mostani dátum');
});

t('🔴 EGYETLEN publikáló út sem képez slugot a saját kezén', () => {
  // A slug-képlet HÁROM helyen élt korábban. Ha bárhol visszatér egy saját
  // `.replace(/[^a-z0-9]+/g, '-')` lánc, az újra szétcsúszhat.
  const gyanus = [];
  for (const p of ['agents/ellenorzo/agent.js', 'agents/ceo/escalate-guides.js']) {
    const s = forras(p).split('\n').filter(x => !/^\s*\/\//.test(x)).join('\n');
    if (/\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9\]\+\/g, '-'\)/.test(s)) gyanus.push(p);
  }
  assert.deepEqual(gyanus, [], '🔴 saját slug-képlet maradt itt: ' + gyanus.join(', '));
});

console.log(`\n✅ ${pass} teszt rendben`);
