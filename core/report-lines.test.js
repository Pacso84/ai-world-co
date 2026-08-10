// ===================================================================
// RIPORT-SOROK — tesztek
// ===================================================================
// Két sor félrevezetett a napi jelentésben (2026-08-06, user jelezte):
//  1. "Facebook-poszt: N" — a MI jelölésünkből számolt, ami a webhook
//     200-ára kerül rá, nem arra, hogy a poszt megjelent-e.
//  2. "ISMÉTLŐDŐ hiba (legmakacsabb 4×) — kemény szabály kellhet" —
//     a 4 nem MAI szám volt, hanem egy hónap összesítése.
// ===================================================================

import assert from 'assert/strict';
import {
  describePosts, describeRepeat, REPEAT_URGENT_PER_WEEK, describeTranslationGaps
} from './report-lines.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 riport-sorok\n');

// ---------- posztok: küldve vs. megjelent ----------

t('ha nincs Make-adat, csak a küldött számot írjuk (nem hazudunk többet)', () => {
  const s = describePosts(6, null);
  assert.equal(s, '📘 Facebook-poszt: 6 kiküldve');
});

t('ha minden megjelent, azt mondjuk ki', () => {
  const s = describePosts(6, 6);
  assert.match(s, /6/);
  assert.match(s, /megjelent/);
  assert.ok(!s.includes('⚠️'), 'nincs baj, ne riasszunk');
});

t('ha KEVESEBB jelent meg, az látszik és riaszt', () => {
  const s = describePosts(6, 4);
  assert.match(s, /⚠️/);
  assert.match(s, /6/);
  assert.match(s, /4/);
});

t('a "megjelent" SOSEM lehet több a küldöttnél a szövegben', () => {
  // A Make-napló más ablakot fedhet le; ilyenkor ne írjunk képtelenséget.
  const s = describePosts(2, 5);
  assert.ok(!/5\s*\/\s*2/.test(s), 'nem írunk 5/2-t');
  assert.match(s, /2/);
});

t('nulla küldésnél sincs se hiba, se riasztás', () => {
  const s = describePosts(0, 0);
  assert.match(s, /0/);
  assert.ok(!s.includes('⚠️'));
});

// ---------- ismétlődő hiba: az IDŐTÁV a lényeg ----------

const lesson = (repeats, createdDaysAgo) => ({
  scope: 'guide',
  text: 'Beginner clarity too low (6/10): steps are vague',
  repeats,
  created: new Date(Date.UTC(2026, 7, 6) - createdDaysAgo * 86400000).toISOString(),
  lastRepeat: '2026-08-06T01:00:00Z'
});

t('a sor MEGMONDJA, mekkora időtávra vonatkozik a szám', () => {
  const s = describeRepeat([lesson(4, 34)], 1, '2026-08-06');
  assert.match(s, /4/);
  assert.match(s, /34 nap/, 'az időtáv nélkül a 4 mainak látszik');
});

t('RITKA ismétlésnél NEM sürget kemény szabályt', () => {
  // 4 előfordulás 34 nap alatt = kevesebb mint heti 1
  const s = describeRepeat([lesson(4, 34)], 1, '2026-08-06');
  assert.ok(!/kemény szabály/.test(s), 'havi 4 nem indokol sürgetést');
  assert.ok(!/fejlesztő/.test(s));
});

t('SŰRŰ ismétlésnél viszont sürget', () => {
  // 12 előfordulás 7 nap alatt = heti 12
  const s = describeRepeat([lesson(12, 7)], 1, '2026-08-06');
  assert.match(s, /kemény szabály/);
});

t('a küszöb a HETI ütem, nem a nyers darabszám', () => {
  assert.ok(REPEAT_URGENT_PER_WEEK > 0);
  const ritka = describeRepeat([lesson(30, 365)], 1, '2026-08-06');  // évi 30 = heti 0,6
  const suru = describeRepeat([lesson(30, 21)], 1, '2026-08-06');    // 3 hét alatt 30 = heti 10
  assert.ok(!/kemény szabály/.test(ritka), 'a nagy szám önmagában nem sürgős');
  assert.match(suru, /kemény szabály/);
});

t('nincs ismétlés → nincs sor', () => {
  assert.equal(describeRepeat([], 0, '2026-08-06'), null);
});

t('hiányzó created dátum nem borítja fel', () => {
  const l = { scope: 'iro', text: 'valami', repeats: 3, created: '', lastRepeat: '2026-08-06T01:00:00Z' };
  const s = describeRepeat([l], 1, '2026-08-06');
  assert.ok(typeof s === 'string' && s.length > 0);
  assert.ok(!/NaN/.test(s), 'NaN sosem mehet ki a riportba');
});

t('a leghosszabb ideje makacs típust emeli ki', () => {
  const s = describeRepeat([lesson(2, 30), lesson(9, 30)], 2, '2026-08-06');
  assert.match(s, /9/, 'a nagyobb ismétlés-számú kerül a példába');
  assert.match(s, /2 típus/);
});

// ---------- fordítás-hiány: MELYIK cikk, ne csak hány ----------
// 2026-08-10: a 08-09-i heti összefoglaló magyarul ÜRESEN maradt, és angolul
// ment ki. A riport ezt "Fordítás-hiány: 1 pár"-ként írta le — egy szám, ami
// elvész a napi zajban. A user vette észre, nem a rendszer. Egy hiányzó
// fordítás nem statisztika: meg kell nevezni, MELYIK cikk az.
console.log('\n🧪 fordítás-hiány sora\n');

t('hiánytalan állapotban nincs sor', () => {
  assert.equal(describeTranslationGaps([]), '');
  assert.equal(describeTranslationGaps(null), '');
});

t('egyetlen hiányt MEGNEVEZ, okkal együtt', () => {
  const s = describeTranslationGaps([
    { slug: 'this-week-in-ai-august-9-2026', lang: 'hu', ok: 'ÜRES' }
  ]);
  assert.match(s, /this-week-in-ai-august-9-2026/, 'a cikk neve benne van');
  assert.match(s, /hu/, 'a nyelv benne van');
  assert.match(s, /ÜRES/, 'az ok benne van');
});

t('a heti összefoglalót KIEMELI', () => {
  // Ez a cikk a főoldal tetején ül minden nyelven, és a kabala-kép is
  // hozzá tartozik — ha ez angol, az a legláthatóbb hiba az oldalon.
  const s = describeTranslationGaps([
    { slug: 'this-week-in-ai', lang: 'hu', ok: 'ÜRES', kiemelt: true }
  ]);
  assert.match(s, /heti összefoglaló/i, 'külön szól a heti összefoglalóról');
});

t('sok hiánynál számot ad és példát mutat', () => {
  const sok = Array.from({ length: 9 }, (_, i) => ({ slug: 'cikk-' + i, lang: 'es', ok: 'ÜRES' }));
  const s = describeTranslationGaps(sok);
  assert.match(s, /9/, 'a teljes szám benne van');
  assert.match(s, /cikk-0/, 'az első példa benne van');
  assert.ok(!s.includes('cikk-8'), 'nem sorolja fel mind a kilencet');
});

t('az angolul maradt fordítás más ok, mint az üres', () => {
  const s = describeTranslationGaps([
    { slug: 'valami-cikk', lang: 'es', ok: 'angolul maradt' }
  ]);
  assert.match(s, /angolul maradt/);
});

console.log('\n✅ report-lines.test: mind a ' + pass + ' eset rendben');
