// ===================================================================
// AMERIKAI HELYESÍRÁS TESZT — futtatás: node core/us-spelling.test.js
//
// Éles megfigyelésből (2026-08-03): a közönség-váltás után az Író promptja
// amerikai lett, de az első termésben 12 cikkből 3 még brit alakot vitt ki
// (colour, labelled, behaviour). A javítás gépi, ezért TESZTELHETŐ.
//
// A tesztek zöme NEM azt méri, hogy cserél-e, hanem hogy MIT NEM BÁNT:
// a két valódi baleset, amit el kell kerülni, az "analysis"→"analyzis"
// (előtag-illesztés) és egy tulajdonnév átírása.
// ===================================================================
import { strict as assert } from 'assert';
import { toUS, findBritish, BRITISH_TO_US } from './us-spelling.js';

// ── 1) A VALÓDI eset: a 2026-08-03-i három hiba ────────────────────
const real = 'losing the mood, colour, or scene. Look for a button labelled "Generate". Ask about behaviour, not people.';
const r1 = toUS(real);
assert.ok(r1.text.includes('mood, color,'), 'colour → color');
assert.ok(r1.text.includes('button labeled'), 'labelled → labeled');
assert.ok(r1.text.includes('about behavior,'), 'behaviour → behavior');
assert.equal(r1.fixed.length, 3, 'pontosan 3 javítás');

// ── 2) NEM BÁNTJUK, ami amerikaiul is így van ──────────────────────
// Ez a fontosabbik fele. Az `realis\w*` mintájú előtag-illesztés ezeket
// mind elrontaná: analysis→analyzis, realistic→realiztic.
const safe = 'The analysis and the analyses. An analyst ran a realistic test. '
  + 'Specialists reviewed the parameter, the diameter and the thermometer. '
  + 'A programmer programmed the programming task. Towards the catalogue dialogue.';
const r2 = toUS(safe);
assert.equal(r2.text, safe, 'egyetlen amerikaiul helyes szó sem változott');
assert.equal(r2.fixed.length, 0, 'nincs hamis javítás');

// ── 3) TÖBBES SZÁM: hosszabb alak elöl ─────────────────────────────
// Ha a "colour" cserélődne előbb, "colorss" lenne belőle.
assert.equal(toUS('colours and colour').text, 'colors and color', 'nincs dupla csere');
assert.equal(toUS('organisations organise').text, 'organizations organize');
assert.equal(toUS('centres and metres').text, 'centers and meters');

// ── 4) KÓD ÉRINTETLEN ──────────────────────────────────────────────
// A kódblokk tartalmát a felhasználó bemásolja — ha átírjuk, a parancs
// vagy a prompt elromlik.
const code = 'Írd be:\n\n```bash\nsetopt colour=auto\n```\n\nA colour fontos.';
const r4 = toUS(code);
assert.ok(r4.text.includes('setopt colour=auto'), 'kódblokkban NEM cserél');
assert.ok(r4.text.includes('A color fontos'), 'kódblokkon kívül cserél');

const inline = 'Használd a `--colour` kapcsolót a colour beállításához.';
const r4b = toUS(inline);
assert.ok(r4b.text.includes('`--colour`'), 'soron belüli kód érintetlen');
assert.ok(r4b.text.includes('a color beállításához'), 'körülötte cserél');

// ── 5) A KÓD NEM MOZDUL EL (helyőrző-ütközés próbája) ──────────────
// Korábban helyőrzőt terveztünk (" 0 ", " 1 "…). Ez a szöveg pont ilyen
// mintát tartalmaz — helyőrzős megoldásnál a kódblokk ide másolódna.
const trap = 'Az 1 . lépés: nyisd meg. A 0 gomb a colour. \n\n```\nkod 1 \n```\n\nVége 1 .';
const r5 = toUS(trap);
assert.ok(r5.text.includes('A 0 gomb a color.'), 'a csere megtörtént');
assert.ok(r5.text.startsWith('Az 1 . lépés'), 'a szövegbeli számok a helyükön');
assert.ok(r5.text.endsWith('Vége 1 .'), 'a szöveg vége ép');
assert.equal((r5.text.match(/```/g) || []).length, 2, 'a kódblokk egyben maradt');

// ── 6) NAGYBETŰS alakot NEM javít, csak JELEZ ──────────────────────
// "Centre for AI Safety" valódi szervezet lehet; nevet átírni ugyanaz a
// hiba, mint kitalálni egyet (hitelesség-kapu elve).
const proper = 'The Centre for AI Safety uses Cohere Summarise.';
const r6 = toUS(proper);
assert.equal(r6.text, proper, 'nagybetűs alakhoz NEM nyúl');
assert.equal(r6.fixed.length, 0, 'nem jelent javítást');
const flags = findBritish(proper);
assert.ok(flags.some(f => f.startsWith('Centre')), 'a Centre-t jelzi');
assert.ok(flags.some(f => f.startsWith('Summarise')), 'a Summarise-t jelzi');

// ── 7) SZÁMLÁLÁS ───────────────────────────────────────────────────
const many = toUS('colour colour colour');
assert.ok(many.fixed[0].includes('(3×)'), 'többszörös előfordulást megszámol');
assert.equal(findBritish('Centre Centre')[0], 'Centre (2×)', 'jelzésnél is számol');

// ── 8) ÜRES / HIÁNYZÓ bemenet nem dob hibát ────────────────────────
assert.deepEqual(toUS(''), { text: '', fixed: [] });
assert.deepEqual(toUS(null), { text: null, fixed: [] });
assert.deepEqual(findBritish(undefined), []);

// ── 9) A SZÓTÁR ÉPSÉGE ─────────────────────────────────────────────
// Önmagára cserélő pár (a===b) végtelen zajt okozna a naplóban.
for (const [br, us] of BRITISH_TO_US) {
  assert.notEqual(br, us, `azonos pár a szótárban: ${br}`);
  assert.equal(br, br.toLowerCase(), `a szótár kulcsa legyen kisbetűs: ${br}`);
}
const seen = new Set();
for (const [br] of BRITISH_TO_US) {
  assert.ok(!seen.has(br), `duplikált szótári bejegyzés: ${br}`);
  seen.add(br);
}

// ── 10) IDEMPOTENS: kétszer futtatva sem változik tovább ───────────
// A pipeline MINDEN futásban lefuttatja az összes cikken; ha nem lenne
// idempotens, minden nap "javítana" valamit, és zajt írna a naplóba.
const once = toUS(real).text;
const twice = toUS(once);
assert.equal(twice.text, once, 'a második futás nem változtat');
assert.equal(twice.fixed.length, 0, 'és nem is jelent javítást');

console.log('✅ us-spelling.test: minden átment');
