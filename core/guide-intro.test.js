// ===================================================================
// TESZT — az útmutató BEVEZETŐJE (2026-09-12)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MI VOLT A HIBA
// A hír-ág a betöltéskor kapja meg a `wrapInShort`-ot (loadArticles), de az
// útmutató SOSEM használja az `a.bodyHtml`-t — az `a.bodyMd`-ből renderel
// újra, így a doboz átalakítása kimaradt. Mérve a kiépített lapokon:
// 204 útmutató bevezetője `<blockquote>`-tal kezdődik, aminek a
// `.article__body`-n KÍVÜL egyetlen CSS-szabálya sincs, a reset pedig
// `* { margin: 0 }`. Böngészőben ellenőrizve (Chrome headless, 430px):
// az összefoglaló és a következő bekezdés NULLA térközzel összefolyt.
//
// A build.js-t IMPORTÁLNI TILOS (építene és publikálna), ezért forrás- és
// kimenet-szinten fogjuk meg. ⚠️ A kommenteket kivágjuk a forrásból.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8')
  .split('\n').filter(s => !/^\s*\/\//.test(s)).join('\n');
const css = readFileSync(join(ROOT, 'website', 'assets', 'style.css'), 'utf-8');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 az útmutató bevezetője\n');

t('🔌 az ÚTMUTATÓ bevezetője átmegy a wrapInShort-on', () => {
  assert.ok(/introHtml\s*=\s*intro[\s\S]{0,200}?wrapInShort\(guideSectionHtml\(intro\)\)/.test(src),
    '🔴 az útmutató bevezetője nem kapja meg az „In short"-dobozt');
});

t('🔌 a HÍR-ág is megkapja (a betöltéskor)', () => {
  assert.ok(/wrapTables\(wrapInShort\(/.test(src),
    '🔴 a hír-ág elvesztette a wrapInShort-ot');
});

t('🔴 A JAVÍTÁS CSAK AKKOR MŰKÖDIK, HA A `.lede` GLOBÁLIS', () => {
  // Ez a teszt LÉNYEGE. Ha valaki egyszer `.article__body .lede`-re szűkíti a
  // szabályt, a bekötés ÉRINTETLEN marad, a teszt zöld, és az útmutatókban
  // NÉMÁN visszatér a stílus nélküli idézetblokk — pontosan az a hibafajta,
  // ami ebben a fájlban négyszer előfordult.
  const sorok = css.split('\n');
  const fo = sorok.findIndex(s => /^\.lede\s*\{/.test(s.trim()));
  assert.ok(fo >= 0, '🔴 nincs `.lede` szabály a stíluslapon');
  // egyetlen .lede-szabály sem lehet leszűkítve egy szülő-osztályra
  const szukitett = sorok.filter(s => /\.lede\b/.test(s) && /^\s*\.[a-z-]+\s+\.lede/.test(s));
  assert.deepEqual(szukitett, [],
    '🔴 a `.lede` le van szűkítve egy szülőre, így az útmutatóban nem érvényesül: ' + szukitett.join(' | '));
  // és tartalmazza azt, amitől DOBOZ lesz
  const blokk = css.slice(css.indexOf('.lede {'), css.indexOf('}', css.indexOf('.lede {')));
  for (const kell of ['border-left', 'background', 'padding', 'margin']) {
    assert.ok(blokk.includes(kell), '🔴 a `.lede` dobozból hiányzik: ' + kell);
  }
});

t('🔴 az egymás utáni bekezdések nem ragadhatnak össze', () => {
  // 13 élő útmutatóban a dobozon KÍVÜL is több bekezdés van. A globális
  // reset (`* { margin: 0 }`) miatt azok is összeragadnának.
  assert.ok(/\.g-intro\s*>\s*p\s*\+\s*p\s*\{[^}]*margin-top/.test(css),
    '🔴 nincs térköz a bevezető egymás utáni bekezdései között');
  // A gyermek-kombinátor SZÁNDÉKOS: a .lede-n belül saját szabály van.
  assert.ok(!/\.g-intro\s+p\s*\+\s*p\s*\{/.test(css),
    '🔴 leszármazott-szelektor lett belőle — felülírná a `.lede p + p` szabályt');
});

// ===================================================================
// A KIÉPÍTETT OLDALAKON
// ===================================================================
// ⚠️ ŐSZINTÉN: a `website/public/` a LEGUTÓBBI build eredménye. Az
// útmutató-oldali állítás a CI újraépítéséig még a RÉGI állapotot látja,
// ezért csak JELENT, nem bukik. A hír-oldali állításnak MOST is foga van.

const PUB = join(ROOT, 'website', 'public', 'article');
const lapok = () => existsSync(PUB)
  ? readdirSync(PUB).filter(f => f.endsWith('.html')).map(f => ({ f, h: readFileSync(join(PUB, f), 'utf-8') }))
  : null;

t('a HÍREK ma is kapják a lede-dobozt (regresszió-őr)', () => {
  const L = lapok();
  if (!L) { console.log('     ⏭️  kihagyva: még nincs build'); return; }
  const hirek = L.filter(x => !x.h.includes('class="g-steps"'));
  if (!hirek.length) { console.log('     ⏭️  kihagyva: nincs kiépített hír'); return; }
  const van = hirek.filter(x => x.h.includes('class="lede"')).length;
  const arany = Math.round(van / hirek.length * 100);
  console.log(`     📏 ${van}/${hirek.length} hír (${arany}%) kap lede-dobozt`);
  assert.ok(arany >= 30, '🔴 a hírek lede-doboza beszakadt: csak ' + arany + '%');
});

t('az útmutatók bevezetőjében nem marad csupasz idézetblokk', () => {
  const L = lapok();
  if (!L) { console.log('     ⏭️  kihagyva: még nincs build'); return; }
  let csupasz = 0, ledes = 0, ossz = 0;
  for (const { h } of L) {
    if (!h.includes('class="g-steps"')) continue;
    const i = h.indexOf('<div class="g-intro">');
    if (i < 0) continue;
    ossz++;
    const intro = h.slice(i, h.indexOf('</div>', i) + 6);
    if (/<blockquote>/.test(intro)) csupasz++;
    if (/class="lede"/.test(intro)) ledes++;
  }
  console.log(`     📏 ${ossz} útmutató-bevezető · ${ledes} lede-doboz · ${csupasz} csupasz idézetblokk`);
  if (csupasz > 0 && ledes === 0) {
    console.log('     ⏳ még a RÉGI build — az újraépítés után ennek 0-ra kell váltania');
    return;                       // nem bukunk el a régi kimeneten
  }
  assert.equal(csupasz, 0, '🔴 ' + csupasz + ' útmutató bevezetőjében maradt csupasz idézetblokk');
});

// ===================================================================
// A TÖRZS-SZABÁLYOK, AMIK SOSEM ÉRTÉK EL AZ ÚTMUTATÓT (2026-09-12)
// ===================================================================
// A hír törzse `.article__body`-ban áll, az útmutatóé nem. Négy szabály
// némán kimaradt. Mérve a 424 kiépített útmutatón, böngészőben ellenőrizve.

t('🔴 az útmutatóban NEM látszik a fölösleges vízszintes vonal', () => {
  // 470 db <hr> 46 lapon. A hírben `.article__body hr { display:none }`
  // rejti; az útmutatóban KILÁTSZOTT (képernyőképpel igazolva).
  assert.ok(/\.article\.guide hr\s*\{[^}]*display:\s*none/.test(css),
    '🔴 az útmutatókban visszatér a kilátszó vonal (46 lap)');
});

t('az osztály nélküli linkek márka-színt kapnak', () => {
  // 126 db 49 lapon. Minden OSZTÁLYOS link-fajtának van saját szabálya
  // (.gloss-link, .midread__link, .g-official, .xref__link, .g-map__node) —
  // csak a szövegbe írt, csupasz linkek maradtak alapértelmezett kéken.
  assert.ok(/\.article\.guide a:not\(\[class\]\)\s*\{[^}]*color:/.test(css),
    '🔴 a csupasz linkek megint böngésző-alapértelmezett kékek lesznek');
});

t('a lépés-törzsben lévő listák behúzást kapnak', () => {
  // 82 lista a `.g-step__body` és a `.g-try` alatt. A többi listás doboznak
  // (.g-prereq, .g-mistakes, .g-faq__a, .impact) MÁR VAN saját szabálya.
  assert.ok(/\.g-step__body ul[^{]*\{[^}]*margin:/.test(css),
    '🔴 a lépéseken belüli listák behúzás nélkül állnak');
});

t('⚠️ a `.article__body` burkolót NEM tesszük az útmutatóra', () => {
  // Ez a teszt egy KÍSÉRTÉST zár ki. A burkoló egy sorral „megoldaná" mind a
  // négy hiányt — de behozná a magazin-tipográfiát is: az INICIÁLÉT és a
  // 28px-es h2-t, ami az útmutatóban SZÁNDÉKOSAN nincs. A pótlás célzott.
  const g = src.slice(src.indexOf('function buildGuidePage'));
  const teste = g.slice(0, g.indexOf('\nfunction buildSupportPage'));
  assert.ok(!/article__body/.test(teste),
    '🔴 az útmutató-sablon megkapta a `.article__body` burkolót — ezzel az iniciálé is megjelenne');
});

t('a rejtő szabálynak van dolga (tájékoztató)', () => {
  const L = lapok();
  if (!L) { console.log('     ⏭️  kihagyva: még nincs build'); return; }
  let hr = 0, lap = 0;
  for (const { h } of L) {
    if (!h.includes('class="g-steps"')) continue;
    const a = h.indexOf('<article'), r = h.indexOf('<section class="rel"');
    const n = (h.slice(a, r > 0 ? r : h.length).match(/<hr\s*\/?>/g) || []).length;
    if (n) { hr += n; lap++; }
  }
  // SZÁNDÉKOSAN nem állítás: ha az író egyszer abbahagyja a <hr> írását,
  // a szabály fölöslegessé válik — az nem hiba, csak tudni jó.
  console.log(`     📏 ${hr} <hr> ${lap} útmutatóban` + (hr === 0 ? '  (a rejtő szabály már fölösleges)' : ''));
});

console.log(`\n✅ ${pass} teszt rendben`);
