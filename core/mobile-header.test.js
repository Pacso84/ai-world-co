// ===================================================================
// TESZT — a mobil fejléc keskeny telefonon is kifér (2026-09-15)
// ===================================================================
// INGYENES, hálózat nélküli, CSAK SZÖVEGET olvas. ⚠️ Az
// agents/designer/web-designer.js-t TILOS importálni: a fájl végén feltétel
// nélkül fut a main() — LLM-hívás és a design.json átírása.
//
// MIÉRT: Chrome-ban mérve (en/hu/es, 320–600 px) a fejléc MINDEN 440 px alatti
// szélességen 440 px széles volt (logó + nyelvválasztó + kereső + téma +
// menügomb, 12 px-es hézagokkal) → 360–412 px-es telefonon vízszintesen
// görgethető lap, a menügomb 360 px-en TELJESEN a képernyőn kívül. A forgalom
// ~82%-a mobil. Közben az agent csapat-üzenete azt írta: „nincs vízszintes
// görgetés".
//
// KÉT REJTETT OK:
//   (1) a mobil CSS NEM a style.css-ben van, hanem a web-designer agent
//       RESPONSIVE_CSS konstansában → design.json `mobileCss` → inline
//       <style id="responsive">, ami a style.css UTÁN jön, tehát felülírja.
//       Aki a style.css-ben javítja, élesben NEM lát változást;
//   (2) a style.css ≤440 px-es .lang-select szabálya sosem hatott, mert a
//       build.js inline stílust ad a <select>-nek.
//
// AMIT NÉZ:
//   (a) a design.json mobileCss-e = az agent konstansa (a build azt olvassa);
//   (b) SZÉLESSÉG-KÖLTSÉGVETÉS 320–440 px-en: a hézagok, a belső margó és a
//       gombok a CSS-ből, a logó és a nyelvválasztó szélessége Chrome-ban MÉRT
//       érték (2026-09-15).
// ⚠️ AMIT NEM LÁT: a betűk valódi szélességét. Ha a logó betűmérete vagy a
// nyelvválasztó stílusa változik, a teszt szól — ilyenkor böngészőben kell
// újramérni, és a MERT_* táblát frissíteni.
//
// Szinkron (az agent futtatása NÉLKÜL): node core/mobile-header.test.js --szinkron
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nl = (s) => s.replace(/\r\n/g, '\n');
const AGENT = join(ROOT, 'agents', 'designer', 'web-designer.js');
const DESIGN = join(ROOT, 'website', 'design.json');
const agentSrc = nl(readFileSync(AGENT, 'utf-8'));
const buildSrc = nl(readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8'));

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };
console.log('🧪 mobil fejléc — keskeny telefonon is kifér\n');

/** Az agent RESPONSIVE_CSS sablon-literálja, szövegként kiolvasva (import nélkül). */
function konstans() {
  const kezdo = 'const RESPONSIVE_CSS = `';
  const i = agentSrc.indexOf(kezdo);
  assert.ok(i >= 0, 'nincs RESPONSIVE_CSS a web-designer agentben');
  const tol = i + kezdo.length;
  const ig = agentSrc.indexOf('`;', tol);
  assert.ok(ig > tol, 'a RESPONSIVE_CSS vége nem található');
  const s = agentSrc.slice(tol, ig);
  assert.ok(!s.includes('${'), 'a RESPONSIVE_CSS-ben sablon-behelyettesítés van — szövegként nem olvasható');
  return s;
}
const CSS = konstans();

if (process.argv.includes('--szinkron')) {
  const d = JSON.parse(readFileSync(DESIGN, 'utf-8'));
  d.mobileCss = CSS;
  writeFileSync(DESIGN, JSON.stringify(d, null, 2), 'utf-8');   // ugyanaz a formátum, mint az agenté
  console.log('  ✍️  design.json mobileCss ← agent RESPONSIVE_CSS');
}

/** A legfelső szintű `@media (max-width:Npx){…}` blokkok, forrássorrendben. */
function blokkok(css) {
  const out = [];
  const rx = /@media\s*\(max-width:\s*(\d+)px\)\s*\{/g;
  let m;
  while ((m = rx.exec(css))) {
    let i = rx.lastIndex, melyseg = 1;
    while (melyseg && i < css.length) { if (css[i] === '{') melyseg++; else if (css[i] === '}') melyseg--; i++; }
    out.push({ max: Number(m[1]), body: css.slice(rx.lastIndex, i - 1) });
    rx.lastIndex = i;
  }
  return out;
}

/** Egy tulajdonság utolsó értéke azokban a szabályokban, amelyek szelektor-listája tartalmazza a szelektort. */
function ertek(body, szelektor, tul) {
  let v = null;
  for (const r of body.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!r[1].split(',').map(s => s.trim()).includes(szelektor)) continue;
    for (const d of r[2].matchAll(new RegExp('(?:^|;)\\s*' + tul + '\\s*:\\s*([^;}]+)', 'g'))) v = d[1].trim();
  }
  return v;
}

/** A `w` szélességen érvényes érték: a ráillő blokkok forrássorrendben, az utolsó nyer. */
function ervenyes(BLOKK, w, szelektor, tul) {
  let v = null;
  for (const b of BLOKK) if (w <= b.max) { const x = ertek(b.body, szelektor, tul); if (x !== null) v = x; }
  return v;
}
const szam = (s) => Number(String(s).replace('!important', '').trim().split(/\s+/)[0].replace('px', ''));
const vizszintes = (s) => { const r = String(s).replace('!important', '').trim().split(/\s+/); return Number((r[1] || r[0]).replace('px', '')); };

// Chrome-ban MÉRT szélességek (2026-09-15, en/hu/es azonos): logó (jel + felirat)
// betűméret szerint, és a nyelvválasztó a lent rögzített stílussal.
const MERT_LOGO = { '15px': 144, '13.5px': 132, '12px': 115 };
const MERT_NYELV = { stilus: ['12px !important', '6px 2px !important'], szelesseg: 69 };
const BIZTONSAG = 4;   // px tartalék a kerekítésre

/** A fejléc becsült legkisebb szélessége `w`-n. Hibát dob, ha valami nem mért értékre változott. */
function koltseg(css, w) {
  const B = blokkok(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  const kell = (szel, tul) => {
    const v = ervenyes(B, w, szel, tul);
    assert.ok(v !== null, `@${w}px: nincs ${szel} { ${tul} } a mobil CSS-ben`);
    return v;
  };
  const logoBetu = kell('.navbar__logo', 'font-size');
  const logo = MERT_LOGO[logoBetu];
  assert.ok(logo, `@${w}px: a logó betűmérete (${logoBetu}) nincs lemérve — mérd újra böngészőben, és frissítsd a MERT_LOGO-t`);
  const nyelv = [kell('.lang-select', 'font-size'), kell('.lang-select', 'padding')];
  assert.deepEqual(nyelv, MERT_NYELV.stilus, `@${w}px: a nyelvválasztó stílusa megváltozott — mérd újra böngészőben`);
  const reszek = {
    margo: 2 * vizszintes(kell('.navbar__inner', 'padding')),
    hezag: 4 * szam(kell('.navbar__inner', 'gap')),          // 5 elem: logó, nyelv, kereső, téma, menü
    logo, nyelv: MERT_NYELV.szelesseg,
    gombok: szam(kell('.search-toggle', 'width')) + szam(kell('.theme-toggle', 'width')) + szam(kell('.navbar__burger', 'width'))
  };
  return { osszeg: Object.values(reszek).reduce((a, b) => a + b, 0), reszek };
}

t('a design.json mobileCss-e pontosan az agent RESPONSIVE_CSS-e (a build azt olvassa)', () => {
  const d = JSON.parse(readFileSync(DESIGN, 'utf-8'));
  assert.equal(nl(d.mobileCss || ''), CSS,
    '🔴 a design.json mobileCss-e eltér az agent konstansától — élesben a RÉGI mobil CSS menne ki. Szinkron: node core/mobile-header.test.js --szinkron');
});

t('🔌 a keskeny-telefon blokk a ≤760 px-es UTÁN áll, és felülírja, amit kell', () => {
  const B = blokkok(CSS.replace(/\/\*[\s\S]*?\*\//g, ''));
  const i760 = B.findIndex(b => b.max === 760), i440 = B.findIndex(b => b.max === 440);
  assert.ok(i760 >= 0, 'nincs ≤760 px-es blokk');
  assert.ok(i440 > i760, '🔴 a ≤440 px-es blokk hiányzik, vagy a ≤760 px-es ELŐTT áll — akkor az felülírja');
  for (const [szel, tul] of [['.navbar__inner', 'gap'], ['.navbar__inner', 'padding'], ['.search-toggle', 'width'], ['.theme-toggle', 'width'], ['.navbar__burger', 'width'], ['.lang-select', 'font-size']]) {
    assert.ok(ertek(B[i440].body, szel, tul) !== null, `🔴 a ≤440 px-es blokkból hiányzik: ${szel} { ${tul} }`);
  }
  // A build.js inline stílust ad a <select>-nek → !important nélkül a szabály hatástalan.
  if (/class="lang-select"[^>]*style="[^"]*(font-size|padding)/.test(buildSrc)) {
    assert.ok(/!important/.test(ertek(B[i440].body, '.lang-select', 'font-size')) && /!important/.test(ertek(B[i440].body, '.lang-select', 'padding')),
      '🔴 a .lang-select-ből hiányzik az !important — a build.js inline stílusa felülírja (így járt a style.css szabálya is)');
  }
});

t('a költségvetés hiteles: a RÉGI mobil CSS-re (mérve: 440 px) túlcsordulást jelez', () => {
  // A javítás előtti állapot, a mért régi szélességekkel (logó 173, nyelv 81, menügomb 44).
  const regi = { margo: 36, hezag: 48, logo: 173, nyelv: 81, gombok: 38 + 38 + 44 };
  const osszeg = Object.values(regi).reduce((a, b) => a + b, 0);
  assert.ok(osszeg > 412, 'a régi, mérten túlcsorduló fejlécre sem jelez túlcsordulást: ' + osszeg);
});

t('🔴 a fejléc 320–440 px között minden szélességen kifér (menügomb a képernyőn)', () => {
  // 320: régi kis telefonok · 344: Galaxy Fold külső kijelző · 360/384: Android ·
  // 375/390/393: iPhone · 412: nagy Android · 440: a töréspont maga
  for (const w of [320, 344, 360, 375, 384, 390, 393, 412, 440]) {
    const { osszeg, reszek } = koltseg(CSS, w);
    assert.ok(osszeg <= w - BIZTONSAG, `🔴 @${w}px a fejléc ~${osszeg}px széles — vízszintesen görgethető lesz: ${JSON.stringify(reszek)}`);
  }
});

console.log(`\n✅ ${pass} teszt rendben`);
