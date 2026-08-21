// ===================================================================
// MAGYAR HELYESÍRÁS — 2. LÉPCSŐ: a bíró és a döntés-tár (tesztek)
// ===================================================================
// Az `ask` paraméter, ezért a teljes hibaág végigjárható pénz és hálózat
// nélkül. A LEGFONTOSABB eset a „kikapcsolva": ha a vészkapcsoló nem VALÓDI,
// a mező csak dísz (2026-08-19, ai-router).
// ===================================================================

import assert from 'assert/strict';
import { judgeWords, applyVerdicts, applyFixes, needsReview, isFixable, isAccentOnly, emptyStore, sentenceConfirms, safeContext } from './hu-proofread.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
const at = async (n, f) => { await f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 magyar helyesírás — bíró\n');

const JELOLTEK = [
  { word: 'többiünknek', context: 'Mit jelent ez a többiünknek?' },
  { word: 'refaktorálás', context: 'A refaktorálás hasznos.' }
];
const valasz = (obj, costUsd = 0.0002) => async () => ({ text: JSON.stringify(obj), costUsd });

await at('a bíró ítéletét szóalakonként adja vissza', async () => {
  const r = await judgeWords({
    candidates: JELOLTEK,
    ask: valasz({ words: [
      { word: 'többiünknek', ok: false, correct: 'többieknek' },
      { word: 'refaktorálás', ok: true }
    ] })
  });
  assert.equal(r.verdicts.length, 2);
  assert.equal(r.verdicts.find(v => v.word === 'többiünknek').ok, false);
  assert.equal(r.verdicts.find(v => v.word === 'refaktorálás').ok, true);
  assert.equal(r.costUsd, 0.0002);
});

await at('🔌 KIKAPCSOLVA: nem hív AI-t, nem költ', async () => {
  let hivas = 0;
  const r = await judgeWords({ candidates: JELOLTEK, enabled: false,
    ask: async () => { hivas++; return { text: '{"words":[]}', costUsd: 9 }; } });
  assert.equal(hivas, 0);
  assert.deepEqual(r.verdicts, []);
  assert.equal(r.costUsd, 0);
});

await at('nincs jelölt → nincs hívás', async () => {
  let hivas = 0;
  const ask = async () => { hivas++; return { text: '{"words":[]}', costUsd: 9 }; };
  for (const c of [[], null, undefined]) assert.deepEqual((await judgeWords({ candidates: c, ask })).verdicts, []);
  assert.equal(hivas, 0);
});

await at('⚠️ ÉRTELMEZHETETLEN VÁLASZ → NINCS ítélet, de a költség elszámolva', async () => {
  // A hallgatás a biztonságos irány: itelet nelkul senkit nem buktatunk el.
  const r = await judgeWords({ candidates: JELOLTEK, ask: async () => ({ text: 'bocsánat', costUsd: 0.003 }) });
  assert.deepEqual(r.verdicts, []);
  assert.equal(r.costUsd, 0.003);
});

await at('a hálózati hiba sem boríthatja fel a fordítást', async () => {
  const r = await judgeWords({ candidates: JELOLTEK, ask: async () => { throw new Error('lekapcsolt'); } });
  assert.deepEqual(r.verdicts, []);
  assert.equal(r.costUsd, 0);
});

await at('a NEM KÉRDEZETT szóra adott ítéletet eldobja', async () => {
  // A modell kitalálhat szavakat; csak arról fogadunk el dontest, amit kérdeztünk.
  const r = await judgeWords({ candidates: JELOLTEK,
    ask: valasz({ words: [{ word: 'kitalált', ok: false, correct: 'x' }] }) });
  assert.deepEqual(r.verdicts, []);
});

await at('a "rossz" ítélet JAVÍTÁS nélkül nem ér semmit — eldobjuk', async () => {
  const r = await judgeWords({ candidates: JELOLTEK,
    ask: valasz({ words: [{ word: 'többiünknek', ok: false }] }) });
  assert.deepEqual(r.verdicts, [], 'javaslat nélkül nem tudunk mit kezdeni vele');
});

t('applyVerdicts: a jó szó engedélylistára, az ékezetes a fix-térképbe', () => {
  const s = applyVerdicts(emptyStore(), [
    { word: 'refaktorálás', ok: true },
    { word: 'kezdo', ok: false, correct: 'kezdő', fixable: true }
  ]);
  assert.ok(s.ok.includes('refaktorálás'));
  assert.equal(s.fix['kezdo'].correct, 'kezdő');
  assert.ok(!s.ok.includes('kezdo'), 'egy szó nem lehet egyszerre jó és rossz');
});

t('⚠️ még a BIZONYOSAN helyes nyelvtani javítás sem megy magától', () => {
  // A „többiünknek" → „többieknek" javítás HELYES — a user és én együtt
  // igazoltuk. A gép mégsem nyúlhat hozzá magától: nem tudja megkülönböztetni
  // ettől: „biokra" → „biogra". Amit ember igazolt, azt ember írja át.
  const s = applyVerdicts(emptyStore(), [
    { word: 'többiünknek', ok: false, correct: 'többieknek', fixable: true }
  ]);
  assert.equal(s.fix['többiünknek'], undefined);
  assert.equal(s.review['többiünknek'].correct, 'többieknek');
});

t('⚠️ a NEM behelyettesíthető javaslat NEM a fix-térképbe megy', () => {
  // Élesben ilyet adott a bíró: «askolsz vagy „túl tág kérdéseket teszel fel».
  // Ha ezt a gép magától becserélné, értelmetlen szöveg kerülne az élő oldalra.
  const s = applyVerdicts(emptyStore(), [
    { word: 'asksz', ok: false, correct: 'askolsz vagy „túl tág kérdéseket teszel fel', fixable: false }
  ]);
  assert.equal(s.fix['asksz'], undefined, 'ehhez a gép NEM nyúlhat');
  assert.equal(s.review['asksz'].correct.startsWith('askolsz'), true, 'de jelezni kell');
  assert.deepEqual(needsReview(s).map(x => x.word), ['asksz']);
});

t('isFixable: csak az egyszavas, tiszta alak cserélhető', () => {
  assert.equal(isFixable('többieknek'), true);
  assert.equal(isFixable('jó-rossz'), true, 'a kötőjeles összetétel rendben');
  assert.equal(isFixable('heti számok'), false, 'két szó: nem csere, hanem átfogalmazás');
  assert.equal(isFixable('askolsz vagy valami'), false);
  assert.equal(isFixable('„idézet”'), false);
  assert.equal(isFixable(''), false);
  assert.equal(isFixable(null), false);
});

t('🔤 CSAK az ékezet-helyreállítás javul magától', () => {
  // ÉLES LELET (2026-08-20), MIELŐTT lefutott volna: a bíró egyszavas
  // javaslatai gyakran nem illenek a mondatba —
  //   „anny ideig" → „annyit ideig"   (nyelvtanilag rossz)
  //   „biokra"     → „biogra"          (nem is szó)
  // Az ékezet-helyreállítás viszont BIZONYÍTHATÓAN ártalmatlan: ugyanaz a szó,
  // ugyanaz a rag, csak a vesszők hiányoztak.
  const s = applyVerdicts(emptyStore(), [
    { word: 'kezdo', ok: false, correct: 'kezdő', fixable: true },
    { word: 'anny', ok: false, correct: 'annyit', fixable: true }
  ]);
  assert.equal(s.fix['kezdo'].correct, 'kezdő', 'ékezet: javítjuk');
  assert.equal(s.fix['anny'], undefined, 'nem ékezet: a gép NEM nyúl hozzá');
  assert.equal(s.review['anny'].correct, 'annyit', 'de jelezni kell');
});

t('isAccentOnly: a magyar ékezet-párokat ismeri', () => {
  assert.equal(isAccentOnly('kezdo', 'kezdő'), true);
  assert.equal(isAccentOnly('egyszeru', 'egyszerű'), true);
  assert.equal(isAccentOnly('lepesrol', 'lépésről'), true);
  assert.equal(isAccentOnly('anny', 'annyit'), false, 'hosszabb lett: nem ékezet');
  assert.equal(isAccentOnly('biokra', 'biogra'), false, 'más betű: nem ékezet');
  assert.equal(isAccentOnly('szövezdoboz', 'szövegdoboz'), false, 'z→g nem ékezet');
});

t('applyVerdicts nem duplikál és nem borul hiányos bemenetre', () => {
  let s = applyVerdicts(emptyStore(), [{ word: 'alma', ok: true }]);
  s = applyVerdicts(s, [{ word: 'ALMA', ok: true }, null, { ok: true }]);
  assert.deepEqual(s.ok, ['alma']);
});

t('🔧 applyFixes: az EGYSZER megítélt hiba ingyen, AI nélkül javul', () => {
  const s = applyVerdicts(emptyStore(), [{ word: 'kezdo', ok: false, correct: 'kezdő', fixable: true }]);
  const r = applyFixes('Ez egy kezdo útmutató.', s);
  assert.equal(r.text, 'Ez egy kezdő útmutató.');
  assert.deepEqual(r.fixed, [{ word: 'kezdo', correct: 'kezdő' }]);
});

t('applyFixes IDEMPOTENS — a már javított szövegen nincs mit tenni', () => {
  const s = applyVerdicts(emptyStore(), [{ word: 'kezdo', ok: false, correct: 'kezdő', fixable: true }]);
  const egyszer = applyFixes('Ez a kezdo útmutató.', s);
  const ketszer = applyFixes(egyszer.text, s);
  assert.equal(ketszer.text, egyszer.text);
  assert.deepEqual(ketszer.fixed, []);
});

t('applyFixes megtartja a NAGY kezdőbetűt', () => {
  const s = applyVerdicts(emptyStore(), [{ word: 'hetedbol', ok: false, correct: 'hetedből', fixable: true }]);
  assert.equal(applyFixes('Hetedbol választok.', s).text, 'Hetedből választok.');
});

t('applyFixes SZÓHATÁRON cserél — nem előtagra', () => {
  // A helyesírás-szótár csapdája KÉTSZER megfogott (analysis→analyzis).
  const s = applyVerdicts(emptyStore(), [{ word: 'kezdo', ok: false, correct: 'kezdő', fixable: true }]);
  assert.equal(applyFixes('A kezdodik szó érintetlen.', s).text, 'A kezdodik szó érintetlen.');
  assert.equal(applyFixes('Egy kezdo lépés.', s).text, 'Egy kezdő lépés.');
});

t('applyFixes minden előfordulást javít, nem csak az elsőt', () => {
  const s = applyVerdicts(emptyStore(), [{ word: 'hetedbol', ok: false, correct: 'hetedből', fixable: true }]);
  assert.equal(applyFixes('hetedbol és hetedbol', s).text, 'hetedből és hetedből');
});

t('🔗 applyFixes NEM nyúl KÖTŐJELES összetétel belsejébe', () => {
  // ÉLES LELET (2026-08-20): a bíró a „PDF-jéből" szóból a „jéből" TÖREDÉKET
  // kapta meg (a tokenizáló a kötőjelnél vágott), és arra azt mondta:
  // „jéből → PDF-ből". Ha ez lefut, a szövegből „PDF-PDF-ből" lesz.
  // A kötőjel tehát SZÓ RÉSZE, nem szóhatár.
  const s = applyVerdicts(emptyStore(), [{ word: 'jebol', ok: false, correct: 'jéből', fixable: true }]);
  assert.equal(applyFixes('A PDF-jebol másoltam ki.', s).text, 'A PDF-jebol másoltam ki.');
  assert.equal(applyFixes('e-mailjebol idéztem.', s).text, 'e-mailjebol idéztem.');
});

t('a kötőjeles szó ÖNMAGÁBAN viszont javítható marad', () => {
  const s = applyVerdicts(emptyStore(), [{ word: 'e-mailt', ok: false, correct: 'e-mailt', fixable: true }]);
  assert.ok(typeof applyFixes('Küldök egy e-mailt.', s).text === 'string');
});

t('applyFixes üres tárra és hiányzó szövegre sem borul', () => {
  assert.deepEqual(applyFixes('valami', emptyStore()).fixed, []);
  assert.equal(applyFixes(null, emptyStore()).text, '');
  assert.equal(applyFixes('valami', null).text, 'valami');
});

// ── A MONDAT MINT BIZONYÍTÉK ────────────────────────────────────────
//
// MIÉRT (2026-08-21, user-döntés). Eddig CSAK az ékezet-helyreállítás
// javult magától, mert a bíró a SZÓT nézi, a nyelvtan viszont a MONDATÉ:
// az „anny → annyit" a mondatból „annyit ideig tartott"-ot csinált volna.
// Emiatt 222 nyilvánvaló elgépelés — „adddig", „remej", „rlapon" — kint
// maradt az élő oldalon egy listán, amit senki nem néz át.
//
// A megoldás nem lazább zár, hanem KEMÉNYEBB BIZONYÍTÁS: a bírónak le kell
// írnia a TELJES kijavított mondatot. Ha abban pontosan a mi szavunk
// változott meg és semmi más, a javítás igazoltan belefér a mondatba.
// A mondatot NEM cseréljük vissza (a bíró prózát lát, a fájlban markdown
// van) — a mondat csak BIZONYÍTÉK a szó-szintű cseréhez.

t('🧾 a mondat IGAZOLJA a javítást, ha pontosan a mi szavunk változott', () => {
  assert.equal(sentenceConfirms(
    'Ezt kell hozzáadnod – adddig ez egy manuális lépés.',
    'Ezt kell hozzáadnod – addig ez egy manuális lépés.',
    'adddig', 'addig'), true);
});

t('🧾 az anny→annyit CSAPDA: a mondat leleplezi a rossz alakot', () => {
  // A bíró a szóra „annyit"-ot javasolt, de a mondatba „annyi" illik.
  assert.equal(sentenceConfirms(
    'Nem tudom, anny ideig tartott-e.',
    'Nem tudom, annyi ideig tartott-e.',
    'anny', 'annyit'), false, 'a mondat mást mond, mint a szó-javaslat');
});

t('🧾 ha a bíró ÁTFOGALMAZZA a mondatot, nem nyúlunk hozzá', () => {
  assert.equal(sentenceConfirms(
    'A terveztel dolgot nézd meg.',
    'Nézd meg azt, amit terveztél.',
    'terveztel', 'tervezted'), false);
});

t('🧾 EGY szó, de MÁSIK szó változott → nem a mi javításunk', () => {
  assert.equal(sentenceConfirms(
    'Ez a remej ötlet nagyon jo.',
    'Ez a remej ötlet nagyon jó.',
    'remej', 'remek'), false);
});

t('🧾 ugyanaz a hiba KÉTSZER a mondatban: mindkettő javítva → rendben', () => {
  assert.equal(sentenceConfirms(
    'Adddig várj, és adddig ne kattints.',
    'Addig várj, és addig ne kattints.',
    'adddig', 'addig'), true, 'minden eltérés a mi szavunk — igazolás, nem zaj');
});

t('🧾 változatlan mondat nem bizonyít semmit', () => {
  const m = 'Ez a mondat rendben van.';
  assert.equal(sentenceConfirms(m, m, 'rendben', 'rendben'), false);
});

t('🧾 hiányzó mondatra NEM igazolunk — a mai viselkedés marad', () => {
  assert.equal(sentenceConfirms('Valami.', '', 'a', 'b'), false);
  assert.equal(sentenceConfirms('', 'Valami.', 'a', 'b'), false);
  assert.equal(sentenceConfirms(null, null, 'a', 'b'), false);
});

t('🧾 az írásjelek és a szóköz nem számít eltérésnek', () => {
  assert.equal(sentenceConfirms(
    'Kattints ide  – adddig várj!',
    'Kattints ide – addig várj!',
    'adddig', 'addig'), true, 'a szavakat hasonlítjuk, nem a formázást');
});

// ── amit ezzel a bizonyítékkal AUTOMATIKUSSÁ teszünk ────────────────

t('🔓 az IGAZOLT javítás automatikussá válik (nem csak az ékezet)', () => {
  const s = applyVerdicts(emptyStore(), [
    { word: 'adddig', ok: false, correct: 'addig', fixable: true, verified: true }
  ]);
  assert.equal(s.fix['adddig']?.correct, 'addig', 'igazolt → magától javuljon');
  assert.ok(!s.review['adddig'], 'ne várjon emberre, amit a mondat igazolt');
});

t('🔒 az IGAZOLATLAN javítás továbbra is emberi szemet kér', () => {
  const s = applyVerdicts(emptyStore(), [
    { word: 'terveztel', ok: false, correct: 'tervezted', fixable: true, verified: false }
  ]);
  assert.equal(s.review['terveztel']?.correct, 'tervezted');
  assert.ok(!s.fix['terveztel'], 'bizonyíték nélkül a gép nem nyúl az élő szöveghez');
});

t('🔒 az ÉKEZET-javítás bizonyíték nélkül is megy — ez nem változott', () => {
  const s = applyVerdicts(emptyStore(), [
    { word: 'dícséretet', ok: false, correct: 'dicséretet', fixable: true }
  ]);
  assert.equal(s.fix['dícséretet']?.correct, 'dicséretet');
});

// ── a bíró válaszából számolt igazolás ──────────────────────────────

// A bírót itt egy egyszerű függvény játssza: a teszt a MI logikánkra néz,
// nem a modellre. Pénz és hálózat nincs benne.
const birot = valasz => async () => ({ text: JSON.stringify(valasz), costUsd: 0.001 });
const JELOLT = [{ word: 'adddig', context: 'Ezt kell hozzáadnod – adddig ez egy manuális lépés.' }];

await (async () => {
  await at('🧾 a bíró MONDATA igazolja a javítást → verified', async () => {
    const r = await judgeWords({
      candidates: JELOLT,
      ask: birot({ words: [{ word: 'adddig', ok: false, correct: 'addig',
        sentence: 'Ezt kell hozzáadnod – addig ez egy manuális lépés.' }] }),
      isKnownWord: w => w === 'addig'
    });
    assert.equal(r.verdicts[0].verified, true);
  });

  await at('🧾 MONDAT NÉLKÜLI válasz → nem igazolt (a mai viselkedés)', async () => {
    const r = await judgeWords({
      candidates: JELOLT,
      ask: birot({ words: [{ word: 'adddig', ok: false, correct: 'addig' }] }),
      isKnownWord: () => true
    });
    assert.equal(r.verdicts[0].verified, false, 'bizonyíték nélkül nem javítunk magunktól');
  });

  await at('🧾 ha a javaslat NEM létező magyar szó, a mondat sem menti meg', async () => {
    // Élesben ilyet adott: „biokra" → „biogra" — ami nem is szó.
    const r = await judgeWords({
      candidates: [{ word: 'biokra', context: 'Nézd meg a biokra vonatkozó részt.' }],
      ask: birot({ words: [{ word: 'biokra', ok: false, correct: 'biogra',
        sentence: 'Nézd meg a biogra vonatkozó részt.' }] }),
      isKnownWord: w => w !== 'biogra'
    });
    assert.equal(r.verdicts[0].verified, false);
  });

  await at('🧾 szótár nélkül is működik — csak a mondat dönt', async () => {
    const r = await judgeWords({
      candidates: JELOLT,
      ask: birot({ words: [{ word: 'adddig', ok: false, correct: 'addig',
        sentence: 'Ezt kell hozzáadnod – addig ez egy manuális lépés.' }] })
    });
    assert.equal(r.verdicts[0].verified, true);
  });
})();

t('🪣 egy szó CSAK EGY vödörben lehet — az újraítélés átmozgatja', () => {
  // Az újraítéléskor (a mondat-bizonyíték bevezetése) a 222 emberi listás
  // szó egy része automatikussá válik. Ha a régi bejegyzés bent ragad, a
  // riport tovább kérné az emberi szemet olyasmire, ami már megjavult.
  const elozo = { ok: [], fix: {}, review: { adddig: { correct: 'addig', at: '2026-08-20' } } };
  const s = applyVerdicts(elozo, [
    { word: 'adddig', ok: false, correct: 'addig', fixable: true, verified: true }
  ]);
  assert.equal(s.fix['adddig']?.correct, 'addig');
  assert.ok(!s.review['adddig'], 'a régi bejegyzés nem ragadhat bent');
});

t('🪣 visszafelé is: az igazolatlan ítélet leveszi a fix-listáról', () => {
  const elozo = { ok: [], fix: { valami: { correct: 'valamit', at: '2026-08-20' } }, review: {} };
  const s = applyVerdicts(elozo, [
    { word: 'valami', ok: false, correct: 'valamit', fixable: true, verified: false }
  ]);
  assert.ok(!s.fix['valami'], 'ha már nem igazolt, ne javítsa tovább magától');
  assert.equal(s.review['valami']?.correct, 'valamit');
});

// ── a mondat mint JSON-veszély ──────────────────────────────────────
//
// MÉRVE (2026-08-21): a 202 megítélendő mondatból 32-ben (16%) van EGYENES
// idézőjel. Amióta a bírótól a teljes mondatot is kérjük, ezt vissza kell
// írnia a JSON-ba — és ha nem escape-eli, az egész köteg értelmezhetetlen
// lesz. Élesben pontosan ez történt: 40 szó, 4647 kifizetett token, NULLA
// ítélet. A pénz elment, a napló meg csak annyit írt: „0 ítélet".
//
// A javítás iránya: ne a modelltől várjuk a fegyelmet, hanem NE ADJUNK neki
// olyan karaktert, amit elronthat. Az összevetés úgyis csak a SZAVAKAT nézi,
// az írásjel nem számít — a mondat megcsonkítása tehát ingyen van.

t('🔒 a bírónak küldött mondatból kikerül az egyenes idézőjel', () => {
  const be = 'Váltás ' + String.fromCharCode(34) + 'Creative' + String.fromCharCode(34) + ' módra.';
  const ki = safeContext(be);
  assert.ok(!ki.includes(String.fromCharCode(34)), 'ezt írná vissza a JSON-ba escape nélkül');
  assert.match(ki, /Creative/, 'a szavaknak meg kell maradniuk');
});

t('🔒 a visszaper is kikerül', () => {
  const ki = safeContext('Egy ' + String.fromCharCode(92) + ' jel a szövegben.');
  assert.ok(!ki.includes(String.fromCharCode(92)));
});

t('🔒 a magyar idézőjel MARADHAT — az nem tör el JSON-t', () => {
  assert.match(safeContext('Írd be: „remek válasz”.'), /„remek válasz”/);
});

t('🔒 a csonkítás nem zavarja az összevetést', () => {
  // Az igazolás szavakat hasonlít, nem írásjelet — az idézőjel elvesztése
  // tehát nem ronthatja el a bizonyítást.
  const eredeti = safeContext('Váltás ' + String.fromCharCode(34) + 'Creative' + String.fromCharCode(34) + ' módra, adddig várj.');
  assert.equal(sentenceConfirms(eredeti, 'Váltás Creative módra, addig várj.', 'adddig', 'addig'), true);
});

t('🔒 hiányzó bemenetre üres sztringet ad', () => {
  assert.equal(safeContext(null), '');
  assert.equal(safeContext(undefined), '');
});

// ── a HARMADIK jel: a javítás TÁVOLSÁGA ─────────────────────────────
//
// MÉRVE (2026-08-21, 34 éles ítéleten, kézzel átnézve): a mondat-bizonyíték
// egymagában NEM elég. Az „anny → annyit" — pontosan az a csapda, ami ellen
// az egészet építettük — ÁTMENT rajta, mert a bíró a saját mondatába is
// „annyit"-ot írt. A mondat tehát az ÖNELLENTMONDÁST fogja meg; a magabiztos
// tévedést nem.
//
// A kézi átnézés éles mintát mutatott: a KIS távolságú javítás elgépelés-
// javítás, a nagy távolságú viszont SZÓCSERE — a bíró más szót tesz oda.
//   táv ≤ 1: 15 javítás, 1 hibás (és az is ártalmatlan: tasmán→tasman)
//   táv ≤ 2: 25 javítás, 4 hibás — köztük az anny→annyit és a pineld→pinned
// Ezért a zár: mondat-bizonyíték ÉS legfeljebb egy karakternyi eltérés.

t('📏 az egy karakternyi, mondattal igazolt javítás automatikus', () => {
  const s = applyVerdicts(emptyStore(), [
    { word: 'konkrát', ok: false, correct: 'konkrét', fixable: true, verified: true }
  ]);
  assert.equal(s.fix['konkrát']?.correct, 'konkrét');
});

t('📏 az anny→annyit CSAPDA a távolságon bukik el, ha a mondat átengedte', () => {
  // A bíró magabiztosan tévedhet: a saját mondatába is a rossz alakot írja.
  // Két karakternyi eltérés = már nem elgépelés-javítás, hanem szócsere.
  const s = applyVerdicts(emptyStore(), [
    { word: 'anny', ok: false, correct: 'annyit', fixable: true, verified: true }
  ]);
  assert.ok(!s.fix['anny'], 'a mondat átengedte, a távolság megfogja');
  assert.equal(s.review['anny']?.correct, 'annyit');
});

t('📏 a nagy távolságú SZÓCSERE sosem automatikus', () => {
  // Élesben: „hetéd → önéletrajzodat" — a bíró a szövegkörnyezetből talált ki
  // egy teljesen más szót.
  const s = applyVerdicts(emptyStore(), [
    { word: 'hetéd', ok: false, correct: 'önéletrajzodat', fixable: true, verified: true }
  ]);
  assert.ok(!s.fix['hetéd']);
});

t('📏 az ÉKEZET-javítás a távolságtól függetlenül megy', () => {
  // Több ékezet is hiányozhat egyszerre — attól az még ugyanaz a szó.
  const s = applyVerdicts(emptyStore(), [
    { word: 'kezdo', ok: false, correct: 'kezdő', fixable: true },
    { word: 'tortenetunkrol', ok: false, correct: 'történetünkről', fixable: true }
  ]);
  assert.equal(s.fix['kezdo']?.correct, 'kezdő');
  assert.equal(s.fix['tortenetunkrol']?.correct, 'történetünkről', 'négy ékezet, de ugyanaz a szó');
});

// ── a SZÁNDÉKOS elgépelés ───────────────────────────────────────────
//
// ÉLES LELET (2026-08-21, az alkalmazás előtti előnézet fogta meg): az egyik
// útmutatónk MAGÁRÓL az elgépelésről szól, és példaként idézi a rossz alakot:
//   «Majdnem jó elgépelések — „verfication" a „verification" helyett»
// A javítás ebből ezt csinálta volna: «„verification" a „verification"
// helyett» — értelmetlen mondat egy élő oldalon.
//
// A minta általános: ha a HELYES alak is ott áll a rossz mellett, akkor a
// szöveg a kettő KÜLÖNBSÉGÉRŐL beszél, nem hibázik. Ilyenkor nem nyúlunk
// hozzá — a hallgatás itt is a biztonságos irány.

t('✍️ nem javítunk ott, ahol a HELYES alak is ott áll mellette', () => {
  const store = { ok: [], fix: { verfication: { correct: 'verification' } }, review: {} };
  const szoveg = 'Majdnem jó elgépelések — „verfication" a „verification" helyett.';
  const r = applyFixes(szoveg, store);
  assert.equal(r.text, szoveg, 'a szöveg a kettő különbségéről beszél');
  assert.deepEqual(r.fixed, []);
});

t('✍️ a rendes hibát viszont ugyanúgy javítjuk', () => {
  const store = { ok: [], fix: { verfication: { correct: 'verification' } }, review: {} };
  const r = applyFixes('A verfication lépés kimaradt.', store);
  assert.match(r.text, /A verification lépés/);
});

t('✍️ a szó SAJÁT részlete nem számít „ott álló helyes alaknak"', () => {
  // Az „adatokat" benne van az „aadatokat"-ban — ha ezt találatnak vennénk,
  // egyetlen ilyen hibát sem javítanánk ki soha.
  const store = { ok: [], fix: { aadatokat: { correct: 'adatokat' } }, review: {} };
  const r = applyFixes('A rendszerek aadatokat gyűjtenek.', store);
  assert.match(r.text, /rendszerek adatokat gyűjtenek/);
});

t('✍️ a TÁVOLI előfordulás nem véd — csak a közvetlen környezet számít', () => {
  const store = { ok: [], fix: { konkrát: { correct: 'konkrét' } }, review: {} };
  const szoveg = 'Adj konkrét példát. ' + 'x'.repeat(400) + ' Ne konkrát fájlnevet adj meg.';
  const r = applyFixes(szoveg, store);
  assert.equal(r.fixed.length, 1, 'a bekezdésekkel arrébb lévő szó nem ugyanarról beszél');
});

// ── az újraítélés ne legyen végtelen pénzcsap ───────────────────────
//
// A --rejudge minden emberi listás szót újra megkérdez. Ha nem jelölnénk meg,
// mit ítéltünk MÁR mondattal, minden futásban újra kifizetnénk ugyanazt a 200
// szót — és pont azokat, amelyek úgysem fognak átmenni. A költés CSENDES:
// ez a fajta szivárgás csak a havi számlán látszana meg.

t('🏷️ a mondattal ítélt bejegyzés megjelölődik', () => {
  const s = applyVerdicts(emptyStore(), [
    { word: 'anny', ok: false, correct: 'annyit', fixable: true, verified: true }
  ]);
  assert.equal(s.review['anny'].mondattal, true, 'enélkül minden futásban újra fizetnénk érte');
});

t('🏷️ a régi, mondat nélküli bejegyzés NEM kap jelölést', () => {
  // Ezeket érdemes újra megkérdezni: mondat híján sosem kaptak esélyt.
  const s = applyVerdicts(emptyStore(), [
    { word: 'regi', ok: false, correct: 'régi', fixable: true }
  ]);
  assert.ok(!s.fix['regi'].mondattal);
});

// ── egy rossz mondat ne vigye el az egész köteget ───────────────────
//
// ÉLES LELET (2026-08-21/22): amióta a bírótól TELJES MONDATOT kérünk, egyetlen
// escape-eletlen idézőjel az EGÉSZ választ értelmezhetetlenné teszi. Mérve:
// 176 megkérdezett szóból 16 ítélet jött vissza — a többiért fizettünk, és
// semmit nem kaptunk. 40 szavas kötegnél egy hiba 40 ítéletet visz el.
//
// A mentés soronként dolgozik: amit ki lehet olvasni, azt kiolvassa. A csonkán
// maradt mondat nem baj — a hiányos bizonyíték „nem igazolt"-at jelent, tehát
// a szó az emberi listára kerül. A rossz irányba dőlés itt is a biztonságos.

await (async () => {
  const tort = '{"words": [' +
    '{"word": "adddig", "ok": false, "correct": "addig", "sentence": "Ezt kell – addig várj."},' +
    '{"word": "remej", "ok": false, "correct": "remek", "sentence": "A "remek" válasz nem jó."},' +
    '{"word": "ritán", "ok": false, "correct": "ritkán", "sentence": "Az első próba ritkán az utolsó."}' +
    ']}';

  await at('🛟 a törött válaszból is kimentjük, amit lehet', async () => {
    const r = await judgeWords({
      candidates: [
        { word: 'adddig', context: 'Ezt kell – adddig várj.' },
        { word: 'remej', context: 'A "remej" válasz nem jó.' },
        { word: 'ritán', context: 'Az első próba ritán az utolsó.' }
      ],
      ask: async () => ({ text: tort, costUsd: 0.005 })
    });
    const szavak = r.verdicts.map(v => v.word).sort();
    assert.deepEqual(szavak, ['adddig', 'remej', 'ritán'], 'egy rossz sor ne vigye el a többit');
  });

  await at('🛟 a mentett ítélet is megkapja a mondat-bizonyítékát, ha ép', async () => {
    const r = await judgeWords({
      candidates: [
        { word: 'adddig', context: 'Ezt kell – adddig várj.' },
        { word: 'remej', context: 'A "remej" válasz nem jó.' },
        { word: 'ritán', context: 'Az első próba ritán az utolsó.' }
      ],
      ask: async () => ({ text: tort, costUsd: 0.005 })
    });
    assert.equal(r.verdicts.find(v => v.word === 'adddig').verified, true);
    assert.equal(r.verdicts.find(v => v.word === 'ritán').verified, true);
  });

  await at('🛟 a menthetetlen válaszra üres marad — nem találunk ki ítéletet', async () => {
    const r = await judgeWords({
      candidates: [{ word: 'adddig', context: 'Ezt kell – adddig várj.' }],
      ask: async () => ({ text: 'Sajnálom, nem tudok segíteni.', costUsd: 0.004 })
    });
    assert.deepEqual(r.verdicts, []);
    assert.equal(r.costUsd, 0.004, 'a kifizetett pénzt akkor is könyveljük');
  });
})();

console.log('\n✅ hu-proofread.test: mind a ' + pass + ' eset rendben');
