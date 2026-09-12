// ===================================================================
// TESZT — MI-jelölés (EU AI Act 50. cikk): a cikkek TETEJÉN és a chatben
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-09-12): a user felvetette, hogy az uniós szabály kötelezővé
// teszi az MI-tartalom jelölését. Mérve: minden cikken VOLT jelölés
// (2026-06-08 óta), de csak a lap ALJÁN (77–84%), puha szöveggel („AI
// editorial team" — félreérthető), a cikk tetején semmi, és a chat sem
// mondta ki, hogy MI-vel beszél a látogató.
//
// AZ AI ACT (hatályos 2026-08-02-től):
//   50(1) — az MI-vel folytatott interakciót jelezni kell;
//   50(4) — a közérdekű ügyekben tájékoztató MI-szöveget jelölni kell
//           (mentesség csak VALÓDI emberi ellenőrzéssel — a mi automatikus
//           kapunk az EU GYIK szerint nem az);
//   50(5) — „clear and distinguishable manner at the latest at the time of
//           the first interaction or exposure".
// User-döntés (2026-09-12): jelölés a cikkek tetejére is + a chatbe.
// ⚠️ Nem jogi tanács — ez a teszt azt őrzi, amit megcsináltunk.
//
// ⚠️ A „AI World HQ" márkanévben is benne van az „AI" szó, ezért a
// szövegeket KONKRÉT kifejezésekre ellenőrizzük — egy puszta /AI/ minta a
// régi, félreérthető szövegen is zöld lett volna.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const kommentNelkul = (s) => s.split('\n').filter(x => !/^\s*\/\//.test(x)).join('\n');
const src = kommentNelkul(readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8').replace(/\r\n/g, '\n'));
const css = readFileSync(join(ROOT, 'website', 'assets', 'style.css'), 'utf-8').replace(/\r\n/g, '\n');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
console.log('🧪 MI-jelölés (EU AI Act 50. cikk)\n');

const NYELV = ['en', 'hu', 'es'];

/** Egy felület-kulcs értékei a build.js-ben, előfordulási sorrendben (en, hu, es). */
function ertekek(kulcs) {
  const rx = new RegExp('\\b' + kulcs + ':\\s*([\'"])((?:(?!\\1).)*)\\1', 'g');
  return [...src.matchAll(rx)].map(m => m[2]);
}

// Nyelvenként: kimondja-e, hogy MI írta, ÉS hogy ember nem nézte át?
const MI_IRTA = {
  // ⚠️ A `(?! World)` szándékos: „Written by AI World HQ" — a márkanév miatt a
  // puszta `by AI\b` erre is illeszkedne, pedig az NEM mondja ki, hogy MI írta.
  en: /(written|generated) by AI\b(?! World)/i,
  hu: /mesterséges intelligencia (írta|készítette)/i,
  es: /(escrit|generad)[oa] por IA\b/i
};
const EMBER_NEM = {
  en: /no human editor/i,
  hu: /emberi szerkesztő nem/i,
  es: /ningún editor humano/i
};

function sablonTest(nev) {
  const i = src.indexOf('function ' + nev + '(');
  assert.ok(i >= 0, 'nincs ' + nev + ' a build.js-ben');
  const vege = src.indexOf('\nfunction ', i + 10);
  return src.slice(i, vege > 0 ? vege : src.length);
}

t('🔌 a HÍR-sablon a fejlécben, a cikk törzse ELŐTT jelöl', () => {
  const s = sablonTest('buildArticlePage');
  const cimke = s.indexOf('<p class="ai-label">${tr(\'aiLabelNews\')}</p>');
  assert.ok(cimke > 0, '🔴 a hírek tetején nincs MI-jelölés');
  assert.ok(cimke > s.indexOf('article__title'), 'a címke a cím ELŐTT áll — a fejlécben, a cím után a helye');
  assert.ok(cimke < s.indexOf('article__body'), '🔴 a címke a törzs UTÁN jön — nem „az első találkozáskor"');
});

t('🔌 az ÚTMUTATÓ-sablon a fejlécben, a lépések ELŐTT jelöl', () => {
  const s = sablonTest('buildGuidePage');
  const cimke = s.indexOf('<p class="ai-label">${tr(\'aiLabelGuide\')}</p>');
  assert.ok(cimke > 0, '🔴 az útmutatók tetején nincs MI-jelölés (a két sablon NÉGYSZER csúszott már szét)');
  assert.ok(cimke > s.indexOf('article__title'), 'a címke a cím ELŐTT áll');
  const map = s.indexOf('guideMapHtml(');
  assert.ok(map > 0 && cimke < map, '🔴 a címke a lépés-térkép UTÁN jön — nem „az első találkozáskor"');
});

t('🔴 a FELSŐ címke minden nyelven kimondja: MI írta, ember nem nézte át', () => {
  for (const kulcs of ['aiLabelNews', 'aiLabelGuide']) {
    const v = ertekek(kulcs);
    assert.equal(v.length, 3, kulcs + ': nem pontosan 3 nyelven van (' + v.length + ')');
    v.forEach((s, i) => {
      const l = NYELV[i];
      assert.ok(MI_IRTA[l].test(s), `🔴 ${kulcs}/${l} nem mondja ki egyértelműen, hogy MI írta: ${s}`);
      assert.ok(EMBER_NEM[l].test(s), `🔴 ${kulcs}/${l} nem mondja ki, hogy ember nem nézte át: ${s}`);
    });
  }
});

t('🔴 a lap ALJI jelölés is egyértelmű, és eltűnt a félreérthető régi szöveg', () => {
  for (const kulcs of ['disclosureNews', 'disclosureGuide']) {
    const v = ertekek(kulcs);
    assert.equal(v.length, 3, kulcs + ': nem pontosan 3 nyelven van');
    v.forEach((s, i) => {
      const l = NYELV[i];
      assert.ok(MI_IRTA[l].test(s), `🔴 ${kulcs}/${l}: nem egyértelmű, hogy MI készítette`);
      assert.ok(EMBER_NEM[l].test(s), `🔴 ${kulcs}/${l}: nem mondja ki, hogy ember nem nézte át`);
    });
  }
  // Az „AI editorial team" úgy is olvasható, hogy EMBEREK írnak az MI-ről.
  const regi = src.match(/AI editorial team|szerkesztősége által írt|equipo editorial de IA/i);
  assert.equal(regi, null, '🔴 visszakerült a félreérthető régi jelölés: ' + (regi && regi[0]));
});

t('🔴 a chat a megnyitó gombtól kezdve kimondja, hogy MI-asszisztens (50. cikk (1))', () => {
  const ASSZISZTENS = { en: /AI assistant/i, hu: /AI-asszisztens/i, es: /asistente de IA/i };
  const NEM_EMBER = {
    en: /I am an AI assistant, not a human/i,
    hu: /mesterséges intelligencia vagyok, nem ember/i,
    es: /soy un asistente de IA, no una persona/i
  };
  for (const kulcs of ['csOpen', 'csTitle']) {
    const v = ertekek(kulcs);
    assert.equal(v.length, 3, kulcs + ': nem pontosan 3 nyelven');
    v.forEach((s, i) => assert.ok(ASSZISZTENS[NYELV[i]].test(s), `🔴 ${kulcs}/${NYELV[i]} nem mondja, hogy MI-asszisztens: ${s}`));
  }
  const hello = ertekek('csHello');
  assert.equal(hello.length, 3);
  hello.forEach((s, i) => assert.ok(NEM_EMBER[NYELV[i]].test(s), `🔴 csHello/${NYELV[i]} nem mondja ki, hogy nem ember: ${s}`));
});

t('a felső címke látható stílust kap (nem rejtett, nem apró)', () => {
  const m = /\.ai-label\s*\{([^}]*)\}/.exec(css);
  assert.ok(m, '🔴 nincs .ai-label szabály a stíluslapon');
  assert.ok(!/display:\s*none|visibility:\s*hidden|opacity:\s*0[;\s]/.test(m[1]), '🔴 a címke el van rejtve');
  const px = Number((/font-size:\s*(\d+)px/.exec(m[1]) || [])[1]);
  assert.ok(px >= 12, '🔴 a címke betűmérete túl kicsi: ' + px + 'px');
});

console.log(`\n✅ ${pass} teszt rendben`);
