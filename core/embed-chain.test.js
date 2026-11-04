// ===================================================================
// TESZT — beágyazó-lánc (szolgáltató-sorrend + folyamat-lokális rövidzár)
// ===================================================================
// INGYENES, HÁLÓZAT NÉLKÜLI. Fut: node core/run-tests.js
//
// A szolgáltató-függvények INJEKTÁLTAK (ál-függvények) — ez a teszt SOHA nem
// hív valódi beágyazó API-t, és nem is importálja az `ai-router.js`-t.
//
// A MÉRT BAJ (2026-09-06): a `memory/embed-guard.json` teljes git-történetében
// 33 bejegyzésből 16 sikeres, és MIND `provider: "mistral"` — google EGY SEM.
// A `guides/topic-embeddings.json` ugyanezt mutatja: 58 db 768 dimenziós
// (Google-korszak) vektor mellett 46 db 1024 dimenziós (Mistral) — a váltás
// megtörtént, a Google-kör viszont MINDEN egyes beágyazás előtt lefutott.
// Egy futásban ez 100+ eldobott HTTP-hívás.
//
// ÉS a diagnózis is elveszett: a régi kód a Google hibáját FELÜLÍRTA a
// Mistraléval, tehát az őrszem-fájlból sosem derült ki, MIÉRT halott a Google.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { probalSorban, osszefuz } = await import('./embed-chain.js');

let pass = 0, bukott = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

console.log('🧪 beágyazó-lánc\n');

// Ál-szolgáltató: számolja, hányszor hívták.
const alSzolgaltato = (viselkedes) => {
  const f = async (t) => { f.hivasok++; return viselkedes(t, f.hivasok); };
  f.hivasok = 0;
  return f;
};
const MINDIG_JO = () => alSzolgaltato(() => ({ v: [1, 2, 3], error: null }));
const MINDIG_ROSSZ = (ok) => alSzolgaltato(() => ({ v: null, error: ok }));

await t('a sorrend számít: ha az ELSŐ ad vektort, a második el sem indul', async () => {
  const g = MINDIG_JO(), m = MINDIG_JO();
  const kiesett = new Map();
  const r = await probalSorban([['google', g], ['mistral', m]], kiesett, 'szöveg');
  assert.equal(r.provider, 'google');
  assert.deepEqual(r.v, [1, 2, 3]);
  assert.equal(m.hivasok, 0, 'fölöslegesen hívta a tartalékot');
});

await t('az első bukása után a TARTALÉK ad vektort', async () => {
  const g = MINDIG_ROSSZ('429 kvóta elfogyott'), m = MINDIG_JO();
  const r = await probalSorban([['google', g], ['mistral', m]], new Map(), 'szöveg');
  assert.equal(r.provider, 'mistral');
  assert.equal(r.error, null);
});

await t('🔑 A RÖVIDZÁR: a folyamatban egyszer elbukott szolgáltatót nem próbáljuk újra', async () => {
  // EZ A MÉRT PAZARLÁS. A Google minden egyes beágyazás előtt lefutott és
  // elbukott — futásonként 100+ eldobott HTTP-hívás.
  const g = MINDIG_ROSSZ('429 Your prepayment credits are depleted');
  const m = MINDIG_JO();
  const kiesett = new Map();
  for (let i = 0; i < 5; i++) await probalSorban([['google', g], ['mistral', m]], kiesett, 'sz' + i);
  assert.equal(g.hivasok, 1, `a halott szolgáltatót ${g.hivasok}× hívtuk 5 beágyazásra`);
  assert.equal(m.hivasok, 5, 'a működő szolgáltatót nem hívtuk minden alkalommal');
});

await t('🔑 A RÖVIDZÁR SOSEM OKOZHAT VAKSÁGOT: ha mindenki kiesett, mindenkit újrapróbálunk', async () => {
  // Ha a rövidzár tartósan kizárná a szolgáltatókat, egy múló Mistral-hiba
  // után NULLA beágyazónk maradna — pontosan az a csendes vakság, ami miatt
  // ez a modul készült. A rövidzár csak SPÓROLHAT, kizárni nem zárhat ki.
  const kiesett = new Map();
  let googleEl = false;
  const g = alSzolgaltato(() => googleEl ? { v: [9], error: null } : { v: null, error: 'kvóta' });
  const m = alSzolgaltato((_, n) => n === 1 ? { v: [7], error: null } : { v: null, error: 'HTTP 500' });

  assert.equal((await probalSorban([['google', g], ['mistral', m]], kiesett, 'a')).provider, 'mistral');
  assert.equal((await probalSorban([['google', g], ['mistral', m]], kiesett, 'b')).provider, null, 'a második körben mindkettő halott');
  googleEl = true;   // a Google feltámad (új kvóta-ablak)
  const r = await probalSorban([['google', g], ['mistral', m]], kiesett, 'c');
  assert.equal(r.provider, 'google', 'a talpra állt szolgáltatót a rövidzár kizárta');
});

await t('a SIKER törli a kiesés-jelet — különben ELAVULT okot jelentenénk róla', async () => {
  // ⚠️ EZT A TESZTET A MUTÁCIÓS PRÓBA ÍRATTA ÁT (2026-09-06). Az első
  // változat egy szolgáltatóval dolgozott, és a „mindenkit újrapróbálunk"
  // ág `clear()`-je ELTAKARTA a törlést: a mutáns (törlés kivéve) TÚLÉLTE.
  // Most két szolgáltató van, és a nyilvántartás nem ürül — így a törlésnek
  // önálló, MÉRHETŐ következménye van.
  const kiesett = new Map();
  let googleEl = false, mistralEl = true;
  const g = alSzolgaltato(() => (googleEl ? { v: [9], error: null } : { v: null, error: 'RÉGI kvótahiba' }));
  const m = alSzolgaltato(() => (mistralEl ? { v: [7], error: null } : { v: null, error: 'HTTP 500' }));
  const ps = [['google', g], ['mistral', m]];

  await probalSorban(ps, kiesett, 'a');                 // google bukik, mistral megy
  mistralEl = false;
  await probalSorban(ps, kiesett, 'b');                 // most mindkettő halott
  googleEl = true;
  const r3 = await probalSorban(ps, kiesett, 'c');      // a google talpra állt
  assert.equal(r3.provider, 'google');
  assert.equal(kiesett.has('google'), false, 'a gyógyult szolgáltató kiesettként maradt');

  // …és ez nem elméleti kérdés: a következő TELJES bukásnál a RÉGI okot
  // jelentenénk egy olyan szolgáltatóról, ami közben működött.
  googleEl = false;
  const r4 = await probalSorban(ps, kiesett, 'd');
  assert.equal(r4.provider, null);
  assert.match(r4.error, /google: RÉGI kvótahiba/, r4.error);
  assert.match(r4.error, /mistral: HTTP 500/, 'a MÉG halott tartalék oka elveszett: ' + r4.error);
});

await t('🔑 A DIAGNÓZIS MEGMARAD: teljes bukásnál MINDKÉT szolgáltató oka kimegy', async () => {
  // A régi kód a 189. sorban FELÜLÍRTA a Google hibáját a Mistraléval, ezért a
  // `memory/embed-guard.json`-ból sosem derült ki, MIÉRT halott a Google.
  const g = MINDIG_ROSSZ('429 credits depleted');
  const m = MINDIG_ROSSZ('HTTP 401');
  const r = await probalSorban([['google', g], ['mistral', m]], new Map(), 'x');
  assert.equal(r.v, null);
  assert.match(r.error, /google: 429 credits depleted/, 'a Google oka elveszett: ' + r.error);
  assert.match(r.error, /mistral: HTTP 401/, 'a Mistral oka elveszett: ' + r.error);
});

await t('🔑 a RÖVIDZÁRT szolgáltató oka is kimegy, pedig most nem futott', async () => {
  // Ez a lényeg: ha a Google-t kihagyjuk, a hibája nem tűnhet el a riportból —
  // különben a spórolás vakságot vásárolna.
  const kiesett = new Map();
  const g = MINDIG_ROSSZ('429 credits depleted');
  const m = alSzolgaltato((_, n) => n === 1 ? { v: [1], error: null } : { v: null, error: 'HTTP 500' });
  await probalSorban([['google', g], ['mistral', m]], kiesett, 'a');   // google bukik, mistral megy
  const r = await probalSorban([['google', g], ['mistral', m]], kiesett, 'b');   // most a mistral is bukik
  assert.equal(g.hivasok, 1, 'mégis újrahívta a googlet');
  assert.match(r.error, /google: 429 credits depleted/, 'a rövidzárral kihagyott ok eltűnt: ' + r.error);
  assert.match(r.error, /mistral: HTTP 500/, r.error);
});

await t('a hiba nélkül bukó szolgáltató sem marad néma', async () => {
  const g = alSzolgaltato(() => ({ v: null, error: null }));
  const r = await probalSorban([['google', g]], new Map(), 'x');
  assert.ok(r.error && r.error.includes('google'), 'üres hibaüzenetnél elnémult: ' + r.error);
});

await t('osszefuz: üres nyilvántartásra üres sztring, nem "undefined"', () => {
  assert.equal(osszefuz([['google', null], ['mistral', null]], new Map()), '');
});

// ===================================================================
// 🔌 BEKÖTÉS-ŐR — a logika hiába jó, ha az `ai-router.js` nem használja.
// ===================================================================
// Az `ai-router.js`-t SZÁNDÉKOSAN NEM importáljuk (dotenv-et tölt, valódi
// kulcsokkal — egy véletlen hívás pénzbe kerülne). Forrásszinten nézzük meg,
// hogy a lánc tényleg be van kötve.
await t('🔌 az ai-router.js TÉNYLEG a láncot használja (nem maradt bekötetlen)', () => {
  const src = readFileSync(join(__dirname, 'ai-router.js'), 'utf-8');
  assert.match(src, /from\s+'\.\/embed-chain\.js'/, 'az ai-router nem importálja az embed-chain.js-t');
  assert.match(src, /probalSorban\s*\(/, 'az ai-router nem hívja a probalSorban-t');
  assert.ok(!/for \(const \[nev, fn\] of \[\['google'/.test(src),
    'a régi, minden hívásnál mindenkit végigpróbáló ciklus visszakerült');
});

console.log(`\n${bukott === 0 ? '✅' : '❌'} embed-chain.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
