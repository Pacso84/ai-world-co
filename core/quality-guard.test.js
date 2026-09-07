// ===================================================================
// TESZT — minőség-őr chip-szabályai
// ===================================================================
// INGYENES, hálózat nélküli. A `qualityFindings()` a VALÓDI
// `content/articles/` fájlokat olvassa (csak olvas, nem ír).
//
// A modul importálása biztonságos: a `main()`-je `import.meta.url`-re szűr.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { qualityFindings, FULLFORM_OK, chipKifogas } from './quality-guard.js';

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 minőség-őr — chip-szabályok\n');

// ===================================================================
// 🔑 EGY FIGYELMEZTETÉS, AMIT NEM LEHET HELYESEN KÖVETNI, ROSSZABB A SEMMINÉL
// ===================================================================
// Élesben mérve (2026-08-30, 09-01, 09-06 napi jelentése):
//     🧹 Minőség-őr: 1 találat (CHIP cégnév-duplázás: "Microsoft 365 Copilot"
//     a(z) Microsoft szekcióban)
//
// A szabály azt tanácsolja, hogy rövidítsük le a nevet. CSAKHOGY a
// „Microsoft 365 Copilot" a termék HIVATALOS, teljes alakú neve — rövidíteni
// csak úgy lehetne, hogy KITALÁLUNK egy nem létező terméket.
//
// ⚠️ ÉS EZ MÁR MEGTÖRTÉNT: 2026-08-30-án három élő útmutatóból javítottuk ki a
// KITALÁLT „365 Copilot" nevet. Ez a figyelmeztetés tehát pontosan azt a hibát
// ajánlja vissza, amit egyszer már megszüntettünk.
//
// A `FULLFORM_OK` kivétel-lista pontosan erre való — ott van már a
// „GitHub Copilot", a „Meta AI", az „Apple Intelligence". A „Microsoft 365
// Copilot" ugyanaz a kategória, csak kimaradt.
t('🔑 a hivatalos teljes alakú nevet NEM jelenti cégnév-duplázásnak', () => {
  const talalatok = qualityFindings();
  const hamis = talalatok.filter(x =>
    /cégnév-dupláz/.test(x) && /Microsoft 365 Copilot/.test(x));
  assert.deepEqual(hamis, [],
    'HAMIS RIASZTÁS: a "Microsoft 365 Copilot" hivatalos terméknév, '
    + 'a rövidítése a KITALÁLT "365 Copilot" lenne (2026-08-30-án javítottuk):\n     '
    + hamis.join('\n     '));
});

t('a kivétel-lista tartalmazza a hivatalos teljes alakokat', () => {
  // Értéket rögzítő teszt: a fenti eset ÖNMAGÁBAN eltűnne, ha a cikk kikerülne
  // a /tools oldalról — akkor a védelem némán elveszne. Ez a sor a SZÁNDÉKOT őrzi.
  for (const nev of ['GitHub Copilot', 'Microsoft 365 Copilot', 'Meta AI', 'Apple Intelligence']) {
    assert.ok(FULLFORM_OK.has(nev), 'hiányzik a kivétel-listáról: ' + nev);
  }
});

t('⚠️ NINCS olyan cégnév-duplázás-találat, amit ne lehetne követni', () => {
  // A tágabb őr: ha egy ÚJ hivatalos teljes alakú név jelenik meg (pl. egy új
  // „Google Workspace Gemini"), ez a teszt szól — nem a napi riport zaja.
  // ⚠️ Ha ez elbukik, ELŐBB döntsd el, VALÓDI-e a hiba: ha a chip tényleg
  // rövidíthető egy LÉTEZŐ névre, a CIKKET javítsd, ne a listát bővítsd.
  const dupla = qualityFindings().filter(x => /cégnév-dupláz/.test(x));
  assert.deepEqual(dupla, [],
    'cégnév-duplázás találat(ok) — döntsd el, valódi-e:\n     ' + dupla.join('\n     '));
});

// ===================================================================
// A MÁSIK IRÁNY — a mutációs próba kényszerítette ki (2026-09-06)
// ===================================================================
// A fenti három eset MIND azt méri, hogy NINCS hamis riasztás. Egy mutáns
// viszont átcsúszott rajtuk: kikapcsoltam a szabályt teljesen, és a teszt
// ZÖLD MARADT — hiszen találat akkor sincs. Egy „nincs hiba" állítás nem
// bizonyítja, hogy a kapu egyáltalán működik.
t('🔑 a VALÓDI cégnév-duplázást viszont ELKAPJA', () => {
  assert.equal(chipKifogas('Google Gemini', 'Google'), 'cegnev-dupla',
    'a valódi duplázást átengedte — a szabály halott');
  assert.equal(chipKifogas('OpenAI Sora', 'OpenAI'), 'cegnev-dupla');
});

t('a hivatalos teljes alakot NEM kapja el (mindkét irány egy helyen)', () => {
  for (const [tool, company] of [
    ['Microsoft 365 Copilot', 'Microsoft'], ['GitHub Copilot', 'GitHub'],
    ['Meta AI', 'Meta'], ['Apple Intelligence', 'Apple']
  ]) assert.equal(chipKifogas(tool, company), null, tool + ' hamisan kifogásolva');
});

t('⚠️ SZÓHATÁRON illeszt, nem puszta előtagként', () => {
  // A „Meta" nem előtagja a „Metaphor"-nak — a projekt kemény szabálya
  // (az analysis→analyzis csapda kétszer megfogott).
  assert.equal(chipKifogas('Metaphor', 'Meta'), null, 'szóhatár nélkül illesztett');
  assert.equal(chipKifogas('OpenAIze', 'OpenAI'), null);
});

t('hibás/üres bemenetre nem dob és nem kifogásol', () => {
  for (const [a, b] of [[null, null], ['', 'Google'], ['ChatGPT', ''], [undefined, undefined], [42, 7]]) {
    assert.doesNotThrow(() => chipKifogas(a, b));
    assert.equal(chipKifogas(a, b) === 'cegnev-dupla', false, JSON.stringify([a, b]));
  }
});

// ===================================================================
// BEKÖTÉS-ŐR — a szabály és a riport-sor közti kapcsolat (2026-09-06)
// ===================================================================
// A mutációs próba utolsó szökevénye: elvágtam a `chipKifogas()` és az
// `out.push()` közti utat, és MINDEN teszt zöld maradt — mert a valódi
// cikkekben jelenleg nincs egyetlen duplázás sem, tehát a különbség nem
// látszik az eredményen. A tiszta függvény tökéletesen működhet úgy is,
// hogy a válaszát senki nem használja.
//
// Ugyanaz a hibaosztály, mint az `embedStatus()`-é volt: a javítás megvolt,
// csak sosem ért célba. Forrásszinten ellenőrizzük, mert futásidőben nem lehet.
t('🔌 a kifogás ELJUT a riport-sorig (bekötés-őr)', () => {
  const forras = readFileSync(new URL('./quality-guard.js', import.meta.url), 'utf-8');
  assert.ok(/const kifogas = chipKifogas\(tool, company\);/.test(forras),
    'a qualityFindings() nem a chipKifogas()-t hívja — a szabály megkerülhető');
  assert.ok(/kifogas === 'cegnev-dupla'[\s\S]{0,120}CHIP cégnév-duplázás/.test(forras),
    'a cégnév-duplázás kifogásból nem lesz riport-sor');
  assert.ok(/kifogas === 'generikus'[\s\S]{0,120}CHIP generikus/.test(forras),
    'a generikus kifogásból nem lesz riport-sor');
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} quality-guard.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
