// ===================================================================
// TESZT — beágyazás-őr
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// A miértet lásd a core/embed-guard.js fejlécében: az `embedStatus()`-nak
// 2026-08-30-ig NULLA hívója volt, ráadásul folyamat-lokális változóból
// dolgozott — a külön processzben futó napi riport akkor SEM láthatta volna,
// ha meghívja. A 08-25-i javítás így csak a „nem futott" esetet zárta le, a
// „LEBUTULT" esetet nem.
//
// ⚠️ A valódi `memory/embed-guard.json`-t ez a teszt NEM ÉRINTI.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELES = join(__dirname, '..', 'memory', 'embed-guard.json');
const ELES_ELOTTE = existsSync(ELES) ? readFileSync(ELES, 'utf-8') : null;

const MUNKA = join(tmpdir(), 'aiworld-embed-teszt-' + process.pid);
mkdirSync(MUNKA, { recursive: true });
const UT = join(MUNKA, 'embed-guard.json');

const { kellIrni, jegyezEmbed, embedSor } = await import('./embed-guard.js');

let pass = 0, bukott = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

const olvas = () => JSON.parse(readFileSync(UT, 'utf-8'));
const ok = at => ({ provider: 'google', at, error: null });
const halott = at => ({ provider: null, at, error: 'google: 429 Your prepayment credits are depleted' });

console.log('🧪 beágyazás-őr\n');

t('A VALÓDI ESET: a 429-es kvótahiba ELJUT a riportig', () => {
  // 2026-08-25, élesben: a Google-kulcs kerete elfogyott, az embedText némán
  // null-t adott, az őr Jaccardra váltott — és zöldnek látszott.
  jegyezEmbed(halott('2026-08-30T10:00:00.000Z'), UT);
  const sor = embedSor(olvas());
  assert.ok(sor.startsWith('⚠️'), 'nem vészjelzés-mintás, a zajszűrő elnémíthatná: ' + sor);
  assert.ok(sor.includes('depleted'), 'nem mondja meg, MI a baj: ' + sor);
  assert.ok(sor.includes('Jaccard'), 'nem mondja meg, mi a KÖVETKEZMÉNY: ' + sor);
});

t('ha rendben van, NEM zajong', () => {
  assert.equal(embedSor({ provider: 'google', error: null }), '');
  assert.equal(embedSor(null), '');
  assert.equal(embedSor('hopp'), '');
});

t('📝 CSAK VÁLTOZÁSKOR ír (az embedText futásonként sokszor hívódik)', () => {
  const a = ok('2026-08-30T10:00:00.000Z');
  assert.equal(kellIrni(null, a), true, 'az első alkalommal írni kell');
  assert.equal(kellIrni(a, { ...a, at: '2026-08-30T11:00:00.000Z' }), false, 'ugyanaznap, változatlanul is írt');
});

t('a SZOLGÁLTATÓ-VÁLTÁS írásra kényszerít', () => {
  const g = ok('2026-08-30T10:00:00.000Z');
  assert.equal(kellIrni(g, { provider: 'mistral', at: g.at, error: null }), true);
});

t('⚠️ a hiba MEGJELENÉSE és ELTŰNÉSE is írásra kényszerít', () => {
  // Mindkét irány számít: a gyógyulást ugyanúgy látni kell, mint a romlást —
  // különben a riport a javítás után is riasztana. („Ha egy számláló N bukást
  // jelent, kell út VISSZA a nullához is.")
  const j = ok('2026-08-30T10:00:00.000Z');
  const r = halott('2026-08-30T10:30:00.000Z');
  assert.equal(kellIrni(j, r), true, 'a romlás nem íródott ki');
  assert.equal(kellIrni(r, j), true, 'a GYÓGYULÁS nem íródott ki');

  // ⚠️ A FENTI KÉT ÁLLÍTÁS NEM ELÉG — a mutációs próba mutatta ki. A valódi
  // `embedText()`-ben a szolgáltató és a hiba EGYÜTT mozog (siker → provider
  // van, hiba nincs; bukás → fordítva), tehát a szolgáltató-ellenőrzés
  // ELTAKARJA a hiba-ellenőrzést: a hiba-ág törlésével is zöld maradt.
  // Ez itt SZÁNDÉKOSAN mesterséges állapot: azonos szolgáltató, változó hiba.
  // A védelem így nem a mai `embedText()`-nek szól, hanem annak, hogy egy
  // jövőbeli részleges hiba (van vektor, de van panasz is) se maradjon néma.
  const reszlegesJo = { provider: 'google', at: '2026-08-30T10:00:00.000Z', error: null };
  const reszlegesRossz = { provider: 'google', at: '2026-08-30T10:30:00.000Z', error: 'google: csonka válasz' };
  assert.equal(kellIrni(reszlegesJo, reszlegesRossz), true,
    'azonos szolgáltató mellett a hiba MEGJELENÉSE nem íródott ki');
  assert.equal(kellIrni(reszlegesRossz, reszlegesJo), true,
    'azonos szolgáltató mellett a hiba ELTŰNÉSE nem íródott ki');
});

t('a hiba SZÖVEGÉNEK változása önmagában nem ír (zaj)', () => {
  const a = halott('2026-08-30T10:00:00.000Z');
  const b = { provider: null, at: '2026-08-30T11:00:00.000Z', error: 'google: 429 más üzenet' };
  assert.equal(kellIrni(a, b), false, 'minden eltérő hibaüzenetre írna');
});

t('NAPONTA egyszer akkor is ír — hogy a frissesség-őr lássa', () => {
  const a = ok('2026-08-30T23:00:00.000Z');
  assert.equal(kellIrni(a, ok('2026-08-31T01:00:00.000Z')), true, 'másnap nem frissítette az at-ot');
});

t('a lemezre írt alak illeszkedik az őrszem-mintához', () => {
  jegyezEmbed(halott('2026-08-31T10:00:00.000Z'), UT);
  const g = olvas();
  assert.ok(g.at, 'nincs `at` — a frissesség-őr nem látná');
  assert.ok(Array.isArray(g.problems) && g.problems.length === 1, 'nincs `problems` tömb: ' + JSON.stringify(g));
});

t('SOHA nem dob — egy őrszem nem akaszthat meg egy AI-hívást', () => {
  assert.doesNotThrow(() => jegyezEmbed(halott('2026-09-01T10:00:00.000Z'), 'Z:/nincs/ilyen/ut/x.json'));
  assert.doesNotThrow(() => jegyezEmbed(null, UT));
  for (const rossz of [null, undefined, 'hopp', 42]) assert.doesNotThrow(() => kellIrni(rossz, ok('2026-09-01T10:00:00.000Z')));
});

t('🔒 a valódi memory/embed-guard.json ÉRINTETLEN', () => {
  const most = existsSync(ELES) ? readFileSync(ELES, 'utf-8') : null;
  assert.equal(most, ELES_ELOTTE, '🔴 A TESZT BELEÍRT AZ ÉLES ŐRSZEM-FÁJLBA!');
});

try { rmSync(MUNKA, { recursive: true, force: true }); } catch { /* */ }
console.log(`\n${bukott === 0 ? '✅' : '❌'} embed-guard.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
