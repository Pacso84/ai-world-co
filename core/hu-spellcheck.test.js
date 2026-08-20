// ===================================================================
// MAGYAR HELYESÍRÁS — 1. LÉPCSŐ: jelöltek kiszűrése (tesztek)
// ===================================================================
// MIÉRT KELL: 2026-08-20-án a user egy ÉLŐ oldalon vette észre a
// „többiünknek" alakot. A vizsgálat kiderítette, hogy ugyanabban a cikkben
// még két hiba volt („hetodból", „bízasz") — egyiket sem vette észre senki.
//
// Ez a modul NEM dönt helyességről. Azt dönti el, MELYIK SZÓT érdemes
// megnézetni — a 2325 szavas cikkből néhányat. A szótárak kívülről jönnek,
// ezért ez a fájl hálózat és pénz nélkül végigjárható.
// ===================================================================

import assert from 'assert/strict';
import { toProse, extractCandidates } from './hu-spellcheck.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
console.log('🧪 magyar helyesírás — jelöltek\n');

// Ismer minden szót, kivéve amit felsorolunk. Igy a teszt a SZURESRE néz,
// nem a szótárra.
const ismer = (...rosszak) => w => !rosszak.includes(w);

t('a hibás szót jelöltnek veszi', () => {
  const r = extractCandidates('Ez egy hetodból vett példa.', { isKnownWord: ismer('hetodból') });
  assert.equal(r.length, 1);
  assert.equal(r[0].word, 'hetodból');
});

t('a jelölt mellé megy a MONDATA — a bíró enélkül nem tud dönteni', () => {
  const md = 'Első mondat. Ez egy hetodból vett példa. Harmadik mondat.';
  const r = extractCandidates(md, { isKnownWord: ismer('hetodból') });
  assert.match(r[0].context, /hetodból/);
  assert.ok(!r[0].context.includes('Harmadik'), 'ne a fél cikket adja át');
});

t('🔤 a NAGYBETŰS szó kimarad — márkanév, nem magyar szó', () => {
  const r = extractCandidates('A Midjourney és az Asana jó.', { isKnownWord: () => false });
  assert.deepEqual(r.map(x => x.word), []);
});

t('a kódrészlet és a link URL-je kimarad', () => {
  const md = 'Nézd: `xyzqq` és [ide](https://pelda.example.com/xyzqq) meg\n```\nzzzqq\n```\n';
  const r = extractCandidates(md, { isKnownWord: () => false });
  assert.deepEqual(r.map(x => x.word), [], 'kód és URL nem próza');
});

t('a link SZÖVEGE viszont próza, azt nézzük', () => {
  const r = extractCandidates('Olvasd el [a hetodból cikket](https://a.example.com).',
    { isKnownWord: ismer('hetodból') });
  assert.deepEqual(r.map(x => x.word), ['hetodból']);
});

t('a frontmatter mezőnevei kimaradnak, a CÍM viszont nem', () => {
  // A cím a legláthatóbb szöveg — a user is ott vette észre a hibát.
  const md = '---\ntitle: "Egy hetodból vett cím"\ncategory: "explainer"\n---\n\nTörzs.';
  const r = extractCandidates(md, { isKnownWord: ismer('hetodból') });
  assert.deepEqual(r.map(x => x.word), ['hetodból']);
});

t('🔗 a KÖTŐJELES összetétel EGY szó, nem kettő', () => {
  // Enélkül a „PDF-jéből"-ből „jéből" töredék lesz, és a bíró arra ítél —
  // az ítélet pedig a szöveg elrontásához vezetne (éles lelet, 2026-08-20).
  const r = extractCandidates('A PDF-jéből másoltam.', { isKnownWord: w => w === 'másoltam' });
  assert.ok(!r.some(x => x.word === 'jéből'), 'a töredék NEM lehet jelölt');
});

t('a rövid szó kimarad (túl zajos)', () => {
  const r = extractCandidates('az ez de ha', { isKnownWord: () => false });
  assert.deepEqual(r.map(x => x.word), []);
});

t('🔁 ugyanaz a szó KÉTSZER is csak egy jelölt', () => {
  const r = extractCandidates('hetodból meg megint hetodból.', { isKnownWord: ismer('hetodból') });
  assert.equal(r.length, 1, 'a bírót ne fizessük ki kétszer ugyanazért');
});

t('📋 az engedélylistás szó kimarad', () => {
  // A bíró egyszer már azt mondta rá: rendben. Többé nem kérdezzük meg.
  const r = extractCandidates('A refaktorálás hasznos.', {
    isKnownWord: ismer('refaktorálás'), allowlist: new Set(['refaktorálás'])
  });
  assert.deepEqual(r.map(x => x.word), []);
});

t('az engedélylista KISBETŰRE illeszt', () => {
  const r = extractCandidates('Sok refaktorálás kell.', {
    isKnownWord: ismer('refaktorálás'), allowlist: new Set(['REFAKTORÁLÁS'])
  });
  assert.deepEqual(r.map(x => x.word), []);
});

t('toProse: a markdown-jelölők eltűnnek, a szöveg marad', () => {
  const p = toProse('## Cím\n\n**vastag** és *dőlt* meg `kód`.\n');
  assert.match(p, /vastag/);
  assert.ok(!p.includes('`kód`'), 'a kód kiesik');
  assert.ok(!p.includes('##'), 'a fejléc-jelölő kiesik');
});

t('hiányzó bemenetre nem borul', () => {
  assert.deepEqual(extractCandidates(null, { isKnownWord: () => true }), []);
  assert.deepEqual(extractCandidates('', { isKnownWord: () => true }), []);
  assert.deepEqual(extractCandidates('szöveg', {}), [], 'szótár nélkül NEM tippelünk');
});

console.log('\n✅ hu-spellcheck.test: mind a ' + pass + ' eset rendben');
