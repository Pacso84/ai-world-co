// ===================================================================
// FRONTMATTER — tesztek
// ===================================================================
//
// A záró teszt VALÓDI cikkeken fut, nem kézzel gyártott mintán. Ez a
// lényeg: a core/reel-post.js első változata olyan alakot várt
// (`{slug, subtitle}` a JSON gyökerében), ami EGYETLEN valódi cikkünkre
// sem illett — és 16 zöld teszt ezt nem vette észre, mert mind kézzel
// írt mintát etetett. A minta a fejemből jött, nem a lemezről.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fm, guideMeta, findArticleBySlug } from './frontmatter.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 frontmatter\n');

const MD = `---
title: "How to Spot a Deepfake Video or Voice Clone Before You Share It"
subtitle: "Five quick checks anyone can run in under two minutes"
category: "guide"
read_time_minutes: 6
---

# How to Spot a Deepfake

## Step 1 — Watch the face
`;

t('kiolvassa a mezőt, és lehántja az idézőjelet', () => {
  assert.equal(fm(MD, 'category'), 'guide');
  assert.match(fm(MD, 'title'), /^How to Spot a Deepfake Video/);
});

t('nem talált mezőre üres string, nem undefined', () => {
  assert.equal(fm(MD, 'nincs_ilyen'), '');
});

t('hiányzó/hibás bemenetre nem borul', () => {
  for (const x of [null, undefined, 12, {}]) assert.equal(fm(x, 'title'), '');
});

t('csak a SOR ELEJI kulcsot fogadja el', () => {
  // A cikk törzsében is állhat „title:" — az nem frontmatter.
  const trukkos = 'x: 1\n\nA szövegben: title: nem ez kell\n';
  assert.equal(fm(trukkos, 'title'), '');
});

// ── guideMeta ───────────────────────────────────────────────────────

t('a slug a _meta-ból jön, nem a címből', () => {
  const m = guideMeta({ _meta: { slug: 'a-rogzitett-slug' }, article_markdown: MD });
  assert.equal(m.slug, 'a-rogzitett-slug');
  assert.match(m.title, /Deepfake/);
  assert.match(m.subtitle, /Five quick checks/);
});

t('cím híján az original_title lép be', () => {
  const m = guideMeta({ _meta: { slug: 's' }, article_markdown: '---\nx: 1\n---\n', original_title: 'Tartalék cím' });
  assert.equal(m.title, 'Tartalék cím');
});

t('üres bemenetre üres mezők, nem borulás', () => {
  for (const x of [null, undefined, {}]) {
    const m = guideMeta(x);
    assert.deepEqual(m, { slug: '', title: '', subtitle: '' });
  }
});

// ── ÉS MOST A LEMEZRŐL ──────────────────────────────────────────────

t('📌 VALÓDI cikkeken: minden útmutatónak van slugja, címe és alcíme', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const DIR = join(ROOT, 'content', 'articles');
  const fajlok = readdirSync(DIR).filter(f => f.startsWith('ARTICLE_GUIDE') && f.endsWith('.json'));
  assert.ok(fajlok.length > 50, 'kevés útmutató a méréshez: ' + fajlok.length);

  const hianyzik = { slug: 0, title: 0, subtitle: 0 };
  for (const f of fajlok) {
    const m = guideMeta(JSON.parse(readFileSync(join(DIR, f), 'utf-8')));
    for (const k of ['slug', 'title', 'subtitle']) if (!m[k]) hianyzik[k]++;
  }
  assert.equal(hianyzik.slug, 0, hianyzik.slug + ' cikkből hiányzik a slug');
  assert.equal(hianyzik.title, 0, hianyzik.title + ' cikkből hiányzik a cím');
  assert.equal(hianyzik.subtitle, 0, hianyzik.subtitle + ' cikkből hiányzik az alcím');
  console.log('     (' + fajlok.length + ' valódi útmutató átnézve)');
});

// ── keresés slug szerint ────────────────────────────────────────────
//
// ÉLES LELET (2026-08-24): a core/short-video.js `fajlnev.includes(slug)`-gal
// keresett, és a SAJÁT videója slugjára nem talált rá. A fájl neve
// „..._how-to-spot-a-deepfake-...-before-you-share.json", a slug viszont
// „...-before-you-share-it" — a fájlnév a guide_topic_id-ból jön, a slug meg
// a kanonikus URL, és a kettő a cikkek ~11%-ánál eltér.

t('🎯 megtalálja a cikket a VALÓDI slugjával, amire a fájlnév nem illik', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const DIR = join(ROOT, 'content', 'articles');
  const SLUG = 'how-to-spot-a-deepfake-video-or-voice-clone-before-you-share-it';

  const t1 = findArticleBySlug(DIR, SLUG);
  assert.ok(t1, 'slug szerint meg kell találni');
  assert.equal(t1.article._meta.slug, SLUG);
  assert.ok(!t1.file.includes(SLUG), 'a fájlnév épp NEM tartalmazza — ez a lényeg');
});

t('a rövid, fájlnévbe illő kulcs is működik (tartalék út)', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const DIR = join(ROOT, 'content', 'articles');
  const r = findArticleBySlug(DIR, 'how-to-spot-a-deepfake-video-or-voice-clone-before-you-share');
  assert.ok(r);
  assert.match(r.article._meta.slug, /deepfake/);
});

t('ismeretlen kulcsra null, nem borulás', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const DIR = join(ROOT, 'content', 'articles');
  assert.equal(findArticleBySlug(DIR, 'ilyen-cikk-biztosan-nincs-sehol-12345'), null);
  assert.equal(findArticleBySlug(DIR, ''), null);
  assert.equal(findArticleBySlug(DIR, null), null);
});

// ── A BUILD FEHÉRLISTÁS FELDOLGOZÓJA (2026-08-29) ───────────────────
// A `website/build.js` `parseFrontmatter()`-e FEHÉRLISTÁS: csak azokat a
// kulcsokat tartja meg, amik a mag-objektumban szerepelnek (`hasOwnProperty`).
// A `tool` és a `company` KIMARADT belőle, ezért a build a cikk saját
// frontmatterét NÉMÁN eldobta, és mindig a `_meta`-t (a párosító korai
// TERVÉT) használta — a melletti komment pont az ellenkezőjét állítja.
// Élő kár: 378 útmutatóból 3 rossz eszközt mutatott, köztük a KITALÁLT
// „365 Copilot" néven futó cikk.
//
// ⚠️ A build.js-t NEM lehet importálni (a fájl végén feltétel nélküli
// `main()`), ezért FORRÁS-SZINTEN ellenőrzünk. Ez a teszt nem csak a két
// kulcsot védi, hanem az EGÉSZ HIBAOSZTÁLYT: amit a kód `meta.X`-ként
// olvas, annak benne KELL lennie a fehérlistán, különben mindig undefined.
t('🔑 a build minden OLVASOTT frontmatter-kulcsa a fehérlistán van', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'website', 'build.js'), 'utf-8');

  const seedSor = src.match(/const fm = \{([^}]*)\}/);
  assert.ok(seedSor, 'nem találom a parseFrontmatter mag-objektumát');
  const feherlista = [...seedSor[1].matchAll(/(\w+)\s*:/g)].map(m => m[1]);

  for (const kell of ['tool', 'company']) {
    assert.ok(feherlista.includes(kell),
      'a „' + kell + '" hiányzik a fehérlistáról → a build némán eldobná a cikk saját értékét');
  }

  // ⚠️ Az `import.meta.url`-t KI KELL ZÁRNI: az első változatom rá is
  // illeszkedett, és hamis riasztást adott. (A mérőeszköz hitelesítése.)
  const olvasott = [...new Set(
    [...src.matchAll(/(?<!import\.)\bmeta\.(\w+)/g)].map(m => m[1])
  )];
  const hianyzo = olvasott.filter(k => !feherlista.includes(k));
  assert.deepEqual(hianyzo, [],
    'a kód olvassa, de a fehérlista nem tartalmazza (mindig undefined lenne): ' + hianyzo.join(', '));
});

console.log('\n✅ frontmatter.test: mind a ' + pass + ' eset rendben');
