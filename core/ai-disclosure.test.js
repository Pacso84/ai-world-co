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
//
// 2026-09-15 (kutatás után, user-döntés): „AI"-jel a kártyákon és a címkében,
// a címke kontrasztja 4,5:1 fölé, és a Rólunk oldalon leírjuk, hogyan jelölünk.
// A Gyakorlati Kódex 1.1(a): a jel fő eleme „the capitalised acronym "AI" in
// the English language" — ezért a spanyol oldalon sem „IA". A régi „látható
// stílust kap" teszt a 4,21:1-es kontrasztot ZÖLDNEK látta — ezért a
// kontrasztot most a stíluslap színtokenjeiből SZÁMOLJUK, mindkét témában.
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
  const cimke = s.indexOf("${aiLabelHtml('aiLabelNews')}");
  assert.ok(cimke > 0, '🔴 a hírek tetején nincs MI-jelölés');
  assert.ok(cimke > s.indexOf('article__title'), 'a címke a cím ELŐTT áll — a fejlécben, a cím után a helye');
  assert.ok(cimke < s.indexOf('article__body'), '🔴 a címke a törzs UTÁN jön — nem „az első találkozáskor"');
});

t('🔌 az ÚTMUTATÓ-sablon a fejlécben, a lépések ELŐTT jelöl', () => {
  const s = sablonTest('buildGuidePage');
  const cimke = s.indexOf("${aiLabelHtml('aiLabelGuide')}");
  assert.ok(cimke > 0, '🔴 az útmutatók tetején nincs MI-jelölés (a két sablon NÉGYSZER csúszott már szét)');
  assert.ok(cimke > s.indexOf('article__title'), 'a címke a cím ELŐTT áll');
  const map = s.indexOf('guideMapHtml(');
  assert.ok(map > 0 && cimke < map, '🔴 a címke a lépés-térkép UTÁN jön — nem „az első találkozáskor"');
});

t('🔴 az „AI"-jel minden nyelven a nagybetűs ANGOL rövidítés (Kódex 1.1(a))', () => {
  const m = sablonTest('aiMark');
  assert.ok(m.includes('>AI</span>'), '🔴 a jel nem a nagybetűs „AI" rövidítést mutatja');
  assert.ok(!/\bLANG\b|\blang\b|\bIA\b/.test(m), '🔴 a jel nyelvenként változik — a Kódex minden nyelven az angol „AI"-t kéri');
  const cimke = sablonTest('aiLabelHtml');
  assert.ok(cimke.includes('class="ai-label"'), 'az aiLabelHtml nem az .ai-label bekezdést adja');
  assert.ok(cimke.indexOf('aiMark(') >= 0 && cimke.indexOf('aiMark(') < cimke.indexOf('tr(kulcs)'),
    '🔴 a címkében nincs „AI"-jel, vagy a mondat UTÁN áll — a fő elemnek elöl a helye');
});

t('🔴 a kártyákon is ott az „AI"-jel (főoldal + útmutató-csempék)', () => {
  const kartya = sablonTest('articleCard');
  const jel = kartya.indexOf('aiMark()');
  assert.ok(jel > 0, '🔴 a főoldali cikk-kártyán nincs „AI"-jel');
  assert.ok(jel > kartya.indexOf('card__link') && jel < kartya.indexOf('</a>'), 'az „AI"-jel a kártya linkjén KÍVÜL van');
  assert.ok(sablonTest('guideTile').includes('aiMark()'), '🔴 az útmutató-csempén nincs „AI"-jel');
  // A főoldali kártyák 19/30-án ott a szürke „AI" TÉMA-címke (az `other` kategória
  // felirata, mérve 2026-09-15) — a puszta „AI"-jel mellette témának is olvasható,
  // a tooltip pedig mobilon nem látszik. Ezért a kártyán a jel mellett szó is áll
  // (a Kódex 1.1(b) és melléklete is „AI" + „generated" alakot mutat).
  assert.ok(kartya.includes("tr('aiMarkShort')"), '🔴 a kártyán az „AI"-jel mellől hiányzik a „generated" szó — összetéveszthető a téma-címkével');
  const rovid = ertekek('aiMarkShort');
  assert.equal(rovid.length, 3, 'aiMarkShort: nem pontosan 3 nyelven');
  rovid.forEach((s, i) => assert.ok(/generat|generál|generad/i.test(s), `🔴 aiMarkShort/${NYELV[i]} nem mondja, hogy generált: ${s}`));
  const cim = ertekek('aiMarkTitle');
  assert.equal(cim.length, 3, 'aiMarkTitle: nem pontosan 3 nyelven');
  cim.forEach((s, i) => assert.ok(MI_IRTA[NYELV[i]].test(s), `🔴 aiMarkTitle/${NYELV[i]} nem mondja ki, hogy MI írta: ${s}`));
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

t('🔴 a lábléc nem sugall emberi ellenőrzést (minden oldal alján ott van)', () => {
  // 2026-09-15: a lábléc „Reviewed for accuracy" / „Pontosságra ellenőrizve" volt —
  // alany nélkül, szenvedő szerkezetben ez EMBERI átnézést sugall, miközben a
  // címke kimondja, hogy szerkesztő nem nézte át. A kettő nem mondhat ellent.
  const NEM_EMBER = { en: /no human editor/i, hu: /emberi szerkesztő nélkül/i, es: /sin editor humano/i };
  const v = ertekek('footerNote');
  assert.equal(v.length, 3, 'footerNote: nem pontosan 3 nyelven');
  v.forEach((s, i) => {
    assert.ok(!/Reviewed for accuracy|Pontosságra ellenőrizve|Revisado para mayor precisión/i.test(s), `🔴 footerNote/${NYELV[i]}: visszakerült az emberi ellenőrzést sugalló szöveg: ${s}`);
    assert.ok(NEM_EMBER[NYELV[i]].test(s), `🔴 footerNote/${NYELV[i]} nem mondja ki, hogy ember nem nézte át: ${s}`);
  });
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

t('🔴 a Rólunk oldal leírja, hogyan jelöljük az MI-tartalmat', () => {
  assert.ok(sablonTest('buildAboutPage').includes("'aboutAiH', 'aboutAiP'"), '🔴 a Rólunk oldalon nincs „Hogyan jelölünk" kártya');
  assert.equal(ertekek('aboutAiH').length, 3, 'aboutAiH: nem pontosan 3 nyelven');
  const JEL = { en: '“AI”', hu: '„AI”', es: '“AI”' };
  ertekek('aboutAiP').forEach((s, i) => {
    const l = NYELV[i];
    assert.ok(s.includes(JEL[l]), `🔴 aboutAiP/${l} nem említi az „AI"-jelet: ${s}`);
    assert.ok(MI_IRTA[l].test(s), `🔴 aboutAiP/${l} nem mondja ki, hogy MI írta`);
    assert.ok(EMBER_NEM[l].test(s), `🔴 aboutAiP/${l} nem mondja ki, hogy ember nem nézte át`);
  });
  assert.equal(ertekek('aboutAiP').length, 3, 'aboutAiP: nem pontosan 3 nyelven');
});

// --- KONTRASZT: a stíluslap színtokenjeiből számolva (WCAG 2.x képlet) ---
function tokenek(blokk) {
  const out = {};
  for (const m of blokk.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)) out[m[1]] = m[2];
  return out;
}
const vilagos = tokenek((/:root\s*\{([^}]*)\}/.exec(css) || [])[1] || '');
const sotet = { ...vilagos, ...tokenek((/\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css) || [])[1] || '') };

function rgb(h) {
  let x = h.slice(1);
  if (x.length === 3) x = x.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16));
}
function fenyesseg(h) {
  const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function kontraszt(a, b) {
  const [v, s] = [fenyesseg(a), fenyesseg(b)].sort((p, q) => q - p);
  return (v + 0.05) / (s + 0.05);
}
function szabaly(szelektor) {
  const m = new RegExp(szelektor.replace(/\./g, '\\.') + '\\s*\\{([^}]*)\\}').exec(css);
  assert.ok(m, '🔴 nincs ' + szelektor + ' szabály a stíluslapon');
  return m[1];
}
function tokenNev(test, tul) {
  const m = new RegExp('(^|[;\\s])' + tul + ':\\s*var\\(--([\\w-]+)\\)').exec(test);
  assert.ok(m, `a(z) ${tul} nem színtokenből jön — a kontraszt így nem ellenőrizhető`);
  return m[2];
}

t('a mérőeszköz hiteles: a régi címke-színre (4,21:1) valóban 4,5 ALATTI értéket ad', () => {
  const k = kontraszt('#6f6a60', '#eae3d6');
  assert.ok(k > 4.1 && k < 4.3, 'a kontraszt-képlet elcsúszott: ' + k.toFixed(2));
  assert.ok(Math.abs(kontraszt('#000000', '#ffffff') - 21) < 0.01, 'a fekete-fehér nem 21:1');
});

t('🔴 a címke és az „AI"-jel kontrasztja ≥ 4,5:1 — világos ÉS sötét témában', () => {
  assert.ok(vilagos.ink && vilagos['paper-2'], 'nem olvashatók a :root színtokenek');
  const label = szabaly('.ai-label');
  assert.ok(!/display:\s*none|visibility:\s*hidden|opacity:\s*0[;\s]/.test(label), '🔴 a címke el van rejtve');
  const px = Number((/font-size:\s*(\d+)px/.exec(label) || [])[1]);
  assert.ok(px >= 12, '🔴 a címke betűmérete túl kicsi: ' + px + 'px');
  const mark = szabaly('.ai-mark');
  for (const [nev, tok] of [['világos', vilagos], ['sötét', sotet]]) {
    for (const [mit, test] of [['.ai-label', label], ['.ai-mark', mark]]) {
      const elo = tok[tokenNev(test, 'color')], hat = tok[tokenNev(test, 'background')];
      assert.ok(elo && hat, `${mit}: ismeretlen színtoken (${nev} téma)`);
      const k = kontraszt(elo, hat);
      assert.ok(k >= 4.5, `🔴 ${mit} kontrasztja ${nev} témában csak ${k.toFixed(2)}:1 (WCAG AA: 4,5)`);
    }
  }
});

console.log(`\n✅ ${pass} teszt rendben`);
