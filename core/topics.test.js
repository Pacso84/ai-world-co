// ===================================================================
// TESZT — TÉMA-BESOROLÁS és TÉMA-HUB OLDALAK (2026-09-10)
// ===================================================================
// INGYENES, hálózat nélküli.
//
// MIÉRT SZÜLETETT. A user kérdése: „ezt a látogató-arányt kéne növelni és
// hogy visszajöjjenek". Kimérve: a látogatók 92%-a EGY cikkre érkezik,
// 0%-uk gyűjtő-oldalra, a mélység 1,04 — egy hónapja lapos.
//
// 🔑 Nem a linkek hiányoztak (minden útmutatóban ott a „Read this next" a
// szöveg 36%-ánál), hanem az EMBERI MÉRETŰ gyűjtő-oldal: a /guides 129
// csempét mutat egyszerre, a /tools 295-öt.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { TEMAK, temaOf, tema, temaMinta } from './topics.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'website', 'public');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 téma-besorolás\n');

// ===================================================================
// 1. A TÖBBES SZÁM — ez volt a valódi hiba
// ===================================================================
t('🔑 A TÖBBES SZÁM ILLESZKEDIK (ez zárta ki a cikkek 60%-át)', () => {
  // VALÓDI LELET: a minta `\b(email|meal|image|scam)\b` alakú volt. A ZÁRÓ
  // szóhatár miatt a többes szám NEM illeszkedett — „polite emails",
  // „plan meals", „create images", „AI Scams, Deepfakes" mind kimaradt.
  // Mérve: 424 útmutatóból 255 (60%) volt besorolatlan, EGYETLEN `s` miatt.
  assert.equal(temaOf('How to use AI to write quick, polite emails'), 'work');
  assert.equal(temaOf('How to plan meals and a grocery budget with AI'), 'home');
  assert.equal(temaOf('How to create images with AI'), 'create');
  assert.equal(temaOf('How to Spot AI Scams, Deepfakes, and Fake Content'), 'safe');
  // Az EGYES szám természetesen továbbra is megy.
  assert.equal(temaOf('Write a polite email'), 'work');
});

t('🚨 de CSAK egy „s" — nem szabad vég', () => {
  // A záró határ elhagyása azt jelentené, hogy a „safe" illeszkedik a
  // „safely"-re és a „home" a „homework"-re. A projekt szótár-elve
  // (core/us-spelling.js): EXPLICIT szóalakok, SOHA nem előtag-illesztés.
  const rx = temaMinta(['home', 'safe']);
  assert.ok(rx.test('at home'), 'az egyes szám nem megy');
  assert.ok(rx.test('two homes'), 'a többes szám nem megy');
  assert.ok(!rx.test('homework assignment'), '⚠️ a „homework" beleillett a „home"-ba');
  assert.ok(!rx.test('safely stored'), '⚠️ a „safely" beleillett a „safe"-be');
});

// ===================================================================
// 2. A SORREND — az első illeszkedő nyer
// ===================================================================
t('🔑 a specifikusabb téma nyer: a phishing-cikk BIZTONSÁG, nem „email"', () => {
  // VALÓDI HIBA: a „How to Spot a Phishing Email…" a Work témára esett,
  // mert az „email" hamarabb illeszkedett, mint a „phishing".
  assert.equal(temaOf('How to Spot a Phishing Email or Scam Text'), 'safe');
  assert.equal(temaOf('Turn Off AI Chat History and Data Saving'), 'safe');
  // …de a valódi munkacikk marad a Work témán.
  assert.equal(temaOf('Automate Email Drafts for Faster Inbox Management'), 'work');
});

t('ismeretlen cím → null, nem találgatunk', () => {
  assert.equal(temaOf('Zzz qqq wwww'), null);
  for (const rossz of [null, undefined, '', 42, {}]) {
    assert.doesNotThrow(() => temaOf(rossz));
    assert.equal(temaOf(rossz), null);
  }
});

t('minden témának van azonosítója, címe és szólistája', () => {
  const idk = new Set();
  for (const x of TEMAK) {
    assert.ok(x.id && !idk.has(x.id), 'ismétlődő vagy hiányzó téma-azonosító: ' + x.id);
    idk.add(x.id);
    assert.ok(x.cim && x.rovid, x.id + ': hiányzó cím');
    assert.ok(Array.isArray(x.szavak) && x.szavak.length >= 5, x.id + ': túl kevés kulcsszó');
    assert.equal(tema(x.id).cim, x.cim);
  }
  assert.equal(tema('nincs-ilyen'), null);
});

// ===================================================================
// 3. A VALÓDI TARTALMON
// ===================================================================
t('🔑 ÉLES: az útmutatók többsége besorolódik', () => {
  const dir = join(ROOT, 'content', 'articles');
  if (!existsSync(dir)) { console.log('     (nincs cikk-mappa — kihagyva)'); return; }
  let ossz = 0, be = 0;
  for (const f of readdirSync(dir).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { continue; }
    if (d._meta?.type !== 'guide') continue;
    const cim = (String(d.article_markdown || '').match(/^title:\s*"?([^"\n]+)/m) || [])[1] || '';
    ossz++; if (temaOf(cim)) be++;
  }
  if (!ossz) return;
  console.log(`     ↳ ${be}/${ossz} útmutató besorolva (${(100 * be / ossz).toFixed(0)}%)`);
  // A javítás ELŐTT 40% volt. Az 55%-os küszöb alatt a hubok kiürülnének.
  assert.ok(be / ossz > 0.55,
    'csak ' + (100 * be / ossz).toFixed(0) + '% sorolódik be — a hubok kiürülnek');
});

// ===================================================================
// 4. A HUB-OLDALAK AZ ÉPÍTETT KIMENETEN
// ===================================================================
console.log('\n🧪 téma-hub oldalak (ha van helyi build)');

const hubok = (dir) => existsSync(dir) ? readdirSync(dir).filter(x => /^topic-[a-z]+\.html$/.test(x)) : [];

t('🔑 ÉLES: MINDEN nyelven elkészülnek a hubok', () => {
  if (!existsSync(join(PUBLIC, 'index.html'))) { console.log('     (nincs helyi build — kihagyva)'); return; }
  // ⚠️ EZ EGY VALÓDI HIBÁT FOGOTT MEG. A besorolás a CÍMBŐL dolgozik, a
  // fordított futásban viszont a cím LE VAN FORDÍTVA — így a /es/ és /hu/
  // ágon szinte semmi nem sorolódott be, a hubok EL SEM KÉSZÜLTEK, a
  // nyelvváltó viszont hivatkozott rájuk → HALOTT LINK. A téma a CIKK
  // tulajdonsága, nem a megjelenítés nyelvéé: az eredeti angol címből megy.
  const en = hubok(PUBLIC).length;
  assert.ok(en >= 5, 'csak ' + en + ' hub az angol ágon');
  for (const ny of ['hu', 'es']) {
    const d = join(PUBLIC, ny);
    if (!existsSync(d)) continue;
    assert.equal(hubok(d).length, en,
      '⚠️ /' + ny + ': ' + hubok(d).length + ' hub az angol ' + en + ' helyett — a fordított címekből sorolunk?');
  }
  console.log(`     ↳ ${en} hub nyelvenként`);
});

t('🔑 ÉLES: a hubok EMBERI MÉRETŰEK (a /guides 129 csempéjével szemben)', () => {
  const f = hubok(PUBLIC);
  if (!f.length) return;
  for (const x of f) {
    const db = (readFileSync(join(PUBLIC, x), 'utf-8').match(/class="gtile"/g) || []).length;
    assert.ok(db >= 3, x + ': csak ' + db + ' csempe — egy három elemű gyűjtő nem segít');
  }
});

t('🔑 ÉLES: a /guides oldalról ELÉRHETŐK (különben senki nem találja meg)', () => {
  const p = join(PUBLIC, 'guides.html');
  if (!existsSync(p)) return;
  const html = readFileSync(p, 'utf-8');
  const linkek = (html.match(/href="topic-[a-z]+"/g) || []).length;
  assert.ok(linkek >= 5,
    '⚠️ csak ' + linkek + ' hub-link a /guides tetején — a hubok léteznének, de senki nem jutna el hozzájuk');
});

t('🔑 ÉLES: a hub-csempék linkjei ÉLNEK (a relatív út csapdája)', () => {
  // A `guideTile()` RELATÍV linket ad (`article/<slug>`). Ha a hub egy
  // alkönyvtárban lenne, az `/topic/article/<slug>`-ra mutatna — halott
  // link több száz helyen. Ezért vannak a hubok a GYÖKÉRBEN.
  const f = hubok(PUBLIC);
  if (!f.length) return;
  const html = readFileSync(join(PUBLIC, f[0]), 'utf-8');
  const elso = (html.match(/class="gtile" href="([^"]+)"/) || [])[1];
  assert.ok(elso, 'nincs csempe-link a hubon');
  assert.match(elso, /^article\//, 'a csempe-link nem article/-lel kezdődik: ' + elso);
  assert.ok(existsSync(join(PUBLIC, elso + '.html')),
    '⚠️ HALOTT csempe-link a hubon: ' + elso);
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} topics.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
