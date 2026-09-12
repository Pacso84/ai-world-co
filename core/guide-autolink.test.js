// ===================================================================
// TESZT — szövegbeli belső linkelés (guideAutolink) MINDKÉT sablonban
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT LÉTEZIK EZ A FÁJL
// A `guideAutolink` a website/build.js-ben lakik, azt pedig IMPORTÁLNI TILOS
// (a fájl futtatáskor épít és publikál). Ezért két oldalról fogjuk meg:
//   1. FORRÁS-SZINTEN: tényleg meghívja-e MINDKÉT cikk-sablon, a helyes
//      paraméterekkel. Ez az a hiba, ami a build.js-ben NÉGYSZER fordult elő
//      (08-25 közép-doboz, 09-09 támogatás-sor, 09-10 + 09-11 második doboz).
//   2. A KIÉPÍTETT OLDALAKON: a valódi kimeneten stimmel-e a plafon és a
//      link-cél.
//
// ⚠️ A KOMMENTEKET KIVÁGJUK a forrásból: egy korábbi bekötés-őr egy
// KOMMENTRE illeszkedett, és zöld maradt, miközben a valódi hívás hiányzott.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, 'website', 'build.js');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 szövegbeli belső linkelés (guideAutolink)\n');

// ⚠️ SORVÉG-NORMALIZÁLÁS. A build.js hol LF-fel, hol CRLF-fel kerül a
// lemezre (egy `git checkout` az autocrlf miatt átválthatja). Enélkül a
// lentebbi `'\n}\n'` keresés -1-et ad, és az őr HAMIS BUKÁST jelez.
const nyers = readFileSync(BUILD, 'utf-8').replace(/\r\n/g, '\n');
const src = nyers.split('\n').filter(sor => !/^\s*\/\//.test(sor)).join('\n');

// A plafon a user döntése (2026: MARAD 2) — a tesztek ebből dolgoznak,
// hogy egy szándékos emelés ne itt bukjon el váratlanul.
const MAX = Number(/const GUIDE_LINK_MAX\s*=\s*(\d+)/.exec(src)?.[1]);

t('a GUIDE_LINK_MAX kiolvasható és értelmes', () => {
  assert.ok(Number.isInteger(MAX) && MAX >= 1, 'nem találom a GUIDE_LINK_MAX-ot: ' + MAX);
});

t('🔌 a HÍR-sablon hívja a guideAutolink-et', () => {
  assert.ok(/withMidRead\(\s*guideAutolink\(/.test(src),
    '🔴 a hír-sablonból eltűnt a szövegbeli linkelés');
});

t('🔌 az ÚTMUTATÓ-sablon MINDKÉT részében hívja (bevezető + lépések)', () => {
  // 2026-09-12-ig NULLA útmutató kapott szövegbeli linket, pedig a belépők
  // 61%-a ide érkezik. Ez az őr pontosan azt zárja be.
  assert.ok(/introHtml\s*=\s*intro\s*\?\s*guideAutolink\(/.test(src),
    '🔴 az útmutató BEVEZETŐJE nem kap szövegbeli linket');
  assert.ok(/insertMidGuide\(\s*guideAutolink\(/.test(src),
    '🔴 az útmutató LÉPÉSEI nem kapnak szövegbeli linket');
});

t('🔴 a két útmutató-hívás UGYANAZT az állapotot kapja (különben 2 helyett 4 link)', () => {
  // Ha a bevezető és a lépések külön számlálót kapnának, mindkettő megkapná
  // a maga MAX linkjét, és a user döntése (MARAD 2) NÉMÁN kétszereződne.
  const glState = [...src.matchAll(/const\s+glState\s*=/g)].length;
  assert.equal(glState, 1, '🔴 a megosztott állapot ' + glState + '× van deklarálva (kell: pontosan 1)');
  const glOpts = [...src.matchAll(/const\s+glOpts\s*=/g)].length;
  assert.equal(glOpts, 1, '🔴 a glOpts ' + glOpts + '× van deklarálva (kell: pontosan 1)');
  // és MINDKÉT hívás ezt az egy objektumot adja át
  const hasznal = [...src.matchAll(/guideAutolink\([^;]*?,\s*a,\s*glOpts\s*\)/g)].length;
  assert.equal(hasznal, 2,
    '🔴 ' + hasznal + ' útmutató-hívás használja a glOpts-ot (kell: pontosan 2 — bevezető + lépések)');
});

t('🔴 az útmutató NEM a /tools gyűjtőre linkel (mérés: 40 nap alatt 7 oldalletöltés)', () => {
  assert.ok(/const\s+glOpts\s*=\s*\{\s*state:\s*glState,\s*hubOk:\s*false\s*\}/.test(src),
    '🔴 az útmutató-ág hubOk:false nélkül megy — 270 linkből 240 zsákutcába vinne');
});

t('a HÍR-ág viselkedése VÁLTOZATLAN (nem kap opts-ot)', () => {
  // A hír egyetlen hívásban renderelődik, és a gyűjtő-link ott user-döntés
  // (2026-09-12: „csak az útmutatókat állítjuk át"). Ezért a hír-ági hívás
  // PONTOS alakját őrizzük — mutációval kiderült, hogy egy lazább regex ezt
  // elengedte, és a mutánst csak egy MÁSIK állítás kapta el véletlenül.
  const varva = 'withMidRead(guideAutolink(glossAutolink(a.bodyHtml, '
    + '{ linked: new Set(), count: 0 }), a), a)';
  assert.ok(src.includes(varva),
    '🔴 a hír-ági hívás alakja megváltozott — vagy megkapta a hubOk/state kapcsolót, '
    + 'ami a user 2026-09-12-i döntése szerint MARAD a régi. Várt alak: ' + varva);
});

t('🔬 a függvény a MEGOSZTOTT számlálót használja, nem helyit', () => {
  // Mutációval igazolt csapda: ha bárki visszaírja a helyi `count`-ot, a
  // megosztott plafon némán szétesik, és a kimeneten csak sok link látszik.
  const fn = src.slice(src.indexOf('function guideAutolink('));
  const teste = fn.slice(0, fn.indexOf('\n}\n') + 3);
  assert.ok(/const state = opts\.state \|\| \{ count: 0, used: new Set\(\) \}/.test(teste),
    '🔴 eltűnt a megosztható állapot');
  assert.ok(/state\.count\s*>=\s*GUIDE_LINK_MAX/.test(teste), '🔴 a plafon nem a megosztott számlálót nézi');
  assert.ok(/state\.count\+\+/.test(teste), '🔴 a megosztott számláló nem növekszik');
  assert.ok(!/\bcount\s*=\s*0\b/.test(teste.replace(/opts\.state \|\| \{ count: 0[^}]*\}/, '')),
    '🔴 maradt egy helyi, nullázott számláló a függvényben');
});

// ===================================================================
// A KIÉPÍTETT OLDALAKON
// ===================================================================
// ⚠️ ŐSZINTE MEGJEGYZÉS: a `website/public/` a LEGUTÓBBI build eredménye.
// Amíg a CI újra nem épít, az útmutatókon még 0 link van, ezért az alábbi
// útmutató-állítások addig ÜRESEN igazak. A HÍR-oldali állítás viszont MOST
// IS fog: 318/517 hír kap linket, tehát regressziót azonnal jelez.

const PUB = join(ROOT, 'website', 'public', 'article');

function lapok() {
  if (!existsSync(PUB)) return null;
  return readdirSync(PUB).filter(f => f.endsWith('.html'))
    .map(f => ({ f, h: readFileSync(join(PUB, f), 'utf-8') }));
}

t('a HÍREK ma is kapnak szövegbeli linket (regresszió-őr)', () => {
  const L = lapok();
  if (!L) { console.log('     ⏭️  kihagyva: még nincs build'); return; }
  const hirek = L.filter(x => !x.h.includes('class="g-steps"'));
  if (!hirek.length) { console.log('     ⏭️  kihagyva: nincs kiépített hír'); return; }
  const vanLink = hirek.filter(x => x.h.includes('class="guide-link"')).length;
  const arany = Math.round(vanLink / hirek.length * 100);
  console.log(`     📏 ${vanLink}/${hirek.length} hír (${arany}%) kap szövegbeli linket`);
  assert.ok(arany >= 40, '🔴 a hírek szövegbeli linkelése beszakadt: csak ' + arany + '%');
});

t('egyetlen cikk sem lépi túl a link-plafont', () => {
  const L = lapok();
  if (!L) { console.log('     ⏭️  kihagyva: még nincs build'); return; }
  const tullepok = [];
  for (const { f, h } of L) {
    const n = (h.match(/class="guide-link"/g) || []).length;
    if (n > MAX) tullepok.push(f + ' (' + n + ')');
  }
  assert.deepEqual(tullepok.slice(0, 5), [], tullepok.length + ' cikk lépi túl a ' + MAX + '-es plafont');
});

t('az ÚTMUTATÓK szövegbeli linkjei nem a /tools gyűjtőre visznek', () => {
  const L = lapok();
  if (!L) { console.log('     ⏭️  kihagyva: még nincs build'); return; }
  const utmutatok = L.filter(x => x.h.includes('class="g-steps"'));
  let osszes = 0, hubra = 0;
  for (const { h } of utmutatok) {
    for (const m of h.matchAll(/<a class="guide-link" href="([^"]+)"/g)) {
      osszes++;
      if (/\/tools(#|$)/.test(m[1])) hubra++;
    }
  }
  console.log(`     📏 ${utmutatok.length} útmutató · ${osszes} szövegbeli link · ${hubra} gyűjtőre`
    + (osszes === 0 ? '  (⏳ az újraépítésig 0 — lásd a fenti megjegyzést)' : ''));
  assert.equal(hubra, 0, '🔴 ' + hubra + ' útmutató-link a /tools gyűjtőre visz, pedig hubOk:false');
});

console.log(`\n✅ ${pass} teszt rendben`);
