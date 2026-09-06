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

// ===================================================================
// 🔑 A „NINCS KULCS" NEM AZONOS A „HALOTT"-TAL (2026-09-06, saját regresszió)
// ===================================================================
// Élesben mérve: a `memory/embed-guard.json` NAPONTA OSZCILLÁLT
//     provider:"mistral", error:null   ←  a Pipeline lépés (VAN kulcsa)
//     provider:null, error:"mistral: nincs MISTRAL_API_KEY"  ← a Házmester
// A `jegyezEmbed()`-et a `core/ai-router.js` hívja, tehát MINDEN AI-t érintő
// CI-lépésből fut — de a Házmester lépésnek EGYÁLTALÁN NINCS env-je (nem is
// kell neki). Az a lépés így felülírta a Pipeline egészséges bejegyzését, és a
// napi riport „⚠️ BEÁGYAZÁS HALOTT"-ot írt volna egy MŰKÖDŐ beágyazásra.
//
// A KÜLÖNBSÉG, amit a kódnak látnia kell:
//   „megpróbáltam és ELBUKOTT"      → valódi baj, szólni kell
//   „ebben a lépésben NINCS kulcs"  → nem bizonyíték a rendszerről
// Ha aznap egy másik lépés MÁR IGAZOLTA, hogy megy, a konfig-hiány nem
// írhatja felül. (Fordítva viszont igen: a valódi hiba mindig felülír.)
t('🔑 a konfig-hiány nem írja felül az aznapi MŰKÖDŐ állapotot', () => {
  const ma = '2026-09-06T12:00:00.000Z';
  const mukodott = { provider: 'mistral', error: null, at: '2026-09-06T02:00:00.000Z' };
  const nincsKulcs = { provider: null, error: 'mistral: nincs MISTRAL_API_KEY', at: ma };

  assert.equal(kellIrni(mukodott, nincsKulcs), false,
    'a kulcs nélküli lépés HALOTT-ra írta az aznap MŰKÖDŐ beágyazást');

  // …de egy VALÓDI hiba igenis felülír.
  const valodiHiba = { provider: null, error: 'mistral: HTTP 429 kvóta elfogyott', at: ma };
  assert.equal(kellIrni(mukodott, valodiHiba), true,
    'a valódi hibát elnyelte');

  // …és ha MÁSIK napról való a siker, a konfig-hiány is kiírandó (nincs friss
  // bizonyítékunk, hogy ma működne).
  const tegnapiSiker = { provider: 'mistral', error: null, at: '2026-09-05T02:00:00.000Z' };
  assert.equal(kellIrni(tegnapiSiker, nincsKulcs), true,
    'tegnapi sikerre hivatkozva hallgatott ma');

  // …és ha aznap MÁR hibás volt, a konfig-hiány sem javíthatja zöldre.
  const maiHiba = { provider: null, error: 'mistral: HTTP 429', at: '2026-09-06T02:00:00.000Z' };
  assert.equal(kellIrni(maiHiba, nincsKulcs), false, 'fölöslegesen újraírt');
});

// ===================================================================
// 🔗 KÉT SZOLGÁLTATÓ, KÉT OK (2026-09-06)
// ===================================================================
// Az `embedText()` eddig a Google hibáját FELÜLÍRTA a Mistraléval, ezért az
// őrszem-fájlból SOHA nem derült ki, MIÉRT halott a Google. (Mérve: a fájl
// git-történetében a 16 sikeres bejegyzés MIND `provider:"mistral"` — google
// egy sem.) Mostantól az `error` mindkét okot hordozza, „ · "-tal elválasztva.
//
// ⚠️ AMI ÚJ VESZÉLY: a riport-sor eddig VAKON csonkolt (`.slice(0, 90)`), és
// egy hosszú Google-hibaüzenet így pont a MÁSODIK szolgáltatót vágta volna le —
// vagyis a bővebb diagnózisból kevesebb információ jutna ki, mint eddig.
t('🔗 a KÉTSZOLGÁLTATÓS hibából MINDKÉT név kijut a riport-sorba', () => {
  const hosszu = 'google: 429 Your prepayment credits are depleted — please enable billing '
    + 'on your project or wait for the quota window to reset before retrying'
    + ' · mistral: HTTP 401 Unauthorized';
  const sor = embedSor({ provider: null, error: hosszu });
  assert.ok(sor.includes('google:'), 'a Google oka eltűnt: ' + sor);
  assert.ok(sor.includes('mistral:'), '🔴 a vak csonkolás levágta a MÁSODIK szolgáltatót: ' + sor);
});

t('🔗 az EGYSZOLGÁLTATÓS hiba csonkolása változatlan (nem hízik a riport)', () => {
  const sor = embedSor({ provider: null, error: 'x'.repeat(300) });
  assert.ok(sor.length < 260, 'egy szolgáltató hibája elárasztotta a riportot: ' + sor.length);
});

// ===================================================================
// 🔑 A MAI SZABÁLY MEGMARAD — DE MOST MÁR RÉSZENKÉNT (2026-09-06)
// ===================================================================
// A „nincs kulcs ≠ halott" szabály fentebb egyetlen hibaüzenetre készült.
// Az összefűzött üzenetben viszont a minta BÁRHOL illeszkedhet: egy VALÓDI
// Google-hiba + egy hiányzó Mistral-kulcs így némán konfig-hiánynak látszana,
// és a valódi baj eltűnne. Ezért a szabály mostantól MINDEN részre kell.
t('🔑 a csupa-konfighiány üzenet TOVÁBBRA sem írja felül az aznapi működőt', () => {
  const mukodott = { provider: 'mistral', error: null, at: '2026-09-06T02:00:00.000Z' };
  const nincsSemmi = {
    provider: null,
    at: '2026-09-06T12:00:00.000Z',
    error: 'google: nincs GOOGLE_API_KEY · mistral: nincs MISTRAL_API_KEY'
  };
  assert.equal(kellIrni(mukodott, nincsSemmi), false,
    '🔴 a kulcs nélküli Házmester-lépés megint HALOTT-ra írná a működő beágyazást');
  // …és az egyrészes alak (a mai éles fájl alakja) ugyanúgy viselkedik
  assert.equal(kellIrni(mukodott, { ...nincsSemmi, error: 'mistral: nincs MISTRAL_API_KEY' }), false,
    'a régi, egyrészes konfig-hiány szabálya elromlott');
});

t('🔑 a VEGYES üzenet (valódi hiba + hiányzó kulcs) IGENIS kiíródik', () => {
  const mukodott = { provider: 'mistral', error: null, at: '2026-09-06T02:00:00.000Z' };
  const vegyes = {
    provider: null,
    at: '2026-09-06T12:00:00.000Z',
    error: 'google: 429 credits depleted · mistral: nincs MISTRAL_API_KEY'
  };
  assert.equal(kellIrni(mukodott, vegyes), true,
    '🔴 egy VALÓDI hibát elnyelt, mert a másik részben volt egy „nincs kulcs"');
});

try { rmSync(MUNKA, { recursive: true, force: true }); } catch { /* */ }
console.log(`\n${bukott === 0 ? '✅' : '❌'} embed-guard.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
