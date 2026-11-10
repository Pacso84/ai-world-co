// ===================================================================
// RIPORT-SOROK — tesztek
// ===================================================================
// Két sor félrevezetett a napi jelentésben (2026-08-06, user jelezte):
//  1. "Facebook-poszt: N" — a MI jelölésünkből számolt, ami a webhook
//     200-ára kerül rá, nem arra, hogy a poszt megjelent-e.
//  2. "ISMÉTLŐDŐ hiba (legmakacsabb 4×) — kemény szabály kellhet" —
//     a 4 nem MAI szám volt, hanem egy hónap összesítése.
// ===================================================================

import assert from 'assert/strict';
import {
  describePosts, describeRepeat, ismetlesSuru, REPEAT_URGENT_PER_WEEK, describeTranslationGaps, mergeLine, huSpellingLine, zaroSor, hibaSorok
} from './report-lines.js';
import { readFileSync } from 'fs';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 riport-sorok\n');

// ---------- posztok: küldve vs. megjelent ----------

t('ha nincs Make-adat, csak a küldött számot írjuk (nem hazudunk többet)', () => {
  const s = describePosts(6, null);
  assert.equal(s, '📘 Facebook-poszt: 6 kiküldve');
});

t('ha minden megjelent, azt mondjuk ki', () => {
  const s = describePosts(6, 6);
  assert.match(s, /6/);
  assert.match(s, /megjelent/);
  assert.ok(!s.includes('⚠️'), 'nincs baj, ne riasszunk');
});

t('ha KEVESEBB jelent meg, az látszik és riaszt', () => {
  const s = describePosts(6, 4);
  assert.match(s, /⚠️/);
  assert.match(s, /6/);
  assert.match(s, /4/);
});

t('a "megjelent" SOSEM lehet több a küldöttnél a szövegben', () => {
  // A Make-napló más ablakot fedhet le; ilyenkor ne írjunk képtelenséget.
  const s = describePosts(2, 5);
  assert.ok(!/5\s*\/\s*2/.test(s), 'nem írunk 5/2-t');
  assert.match(s, /2/);
});

t('nulla küldésnél sincs se hiba, se riasztás', () => {
  const s = describePosts(0, 0);
  assert.match(s, /0/);
  assert.ok(!s.includes('⚠️'));
});

// ---------- ismétlődő hiba: az IDŐTÁV a lényeg ----------

const lesson = (repeats, createdDaysAgo) => ({
  scope: 'guide',
  text: 'Beginner clarity too low (6/10): steps are vague',
  repeats,
  created: new Date(Date.UTC(2026, 7, 6) - createdDaysAgo * 86400000).toISOString(),
  lastRepeat: '2026-08-06T01:00:00Z'
});

t('a sor MEGMONDJA, mekkora időtávra vonatkozik a szám', () => {
  const s = describeRepeat([lesson(4, 34)], 1, '2026-08-06');
  assert.match(s, /4/);
  assert.match(s, /34 nap/, 'az időtáv nélkül a 4 mainak látszik');
});

t('RITKA ismétlésnél NEM sürget kemény szabályt', () => {
  // 4 előfordulás 34 nap alatt = kevesebb mint heti 1
  const s = describeRepeat([lesson(4, 34)], 1, '2026-08-06');
  assert.ok(!/kemény szabály/.test(s), 'havi 4 nem indokol sürgetést');
  assert.ok(!/fejlesztő/.test(s));
});

t('SŰRŰ ismétlésnél viszont sürget', () => {
  // 12 előfordulás 7 nap alatt = heti 12
  const s = describeRepeat([lesson(12, 7)], 1, '2026-08-06');
  assert.match(s, /kemény szabály/);
});

t('a küszöb a HETI ütem, nem a nyers darabszám', () => {
  assert.ok(REPEAT_URGENT_PER_WEEK > 0);
  const ritka = describeRepeat([lesson(30, 365)], 1, '2026-08-06');  // évi 30 = heti 0,6
  const suru = describeRepeat([lesson(30, 21)], 1, '2026-08-06');    // 3 hét alatt 30 = heti 10
  assert.ok(!/kemény szabály/.test(ritka), 'a nagy szám önmagában nem sürgős');
  assert.match(suru, /kemény szabály/);
});

t('🔇 2026-11-10: a RITKA ismétlés nem megy a Telegramba, a SŰRŰ igen', () => {
  // A valódi eset: LEDE_TOO_LONG, 20× 86 nap alatt (heti 1,6) — a user minden nap látta.
  assert.equal(ismetlesSuru([lesson(20, 86)], '2026-08-06'), false, 'heti 1,6 nem riasztás');
  assert.equal(ismetlesSuru([lesson(12, 7)], '2026-08-06'), true, 'heti 12 igen');
  assert.equal(ismetlesSuru([lesson(20, 86), lesson(12, 7)], '2026-08-06'), true, 'ha BÁRMELYIK sűrű, szólunk');
  assert.equal(ismetlesSuru([], '2026-08-06'), false);
  const dr = readFileSync(new URL('./daily-report.js', import.meta.url), 'utf-8');
  assert.ok(dr.includes('if (repLine && ismetlesSuru(rep, today())) lines.push(repLine);'), 'a napi jelentés a sűrűség szerint dönt');
});

t('🇭🇺 2026-11-10: a sor a hiba MAGYAR nevét írja, nem a kódot', () => {
  const l = { ...lesson(12, 7), text: 'LEDE_TOO_LONG' };
  const s = describeRepeat([l], 1, '2026-08-06');
  assert.match(s, /túl hosszú a „Röviden” doboz/);
  assert.ok(!/LEDE_TOO_LONG/.test(s), 'a puszta kód a usernek semmit nem mond');
  assert.match(s, /útmutató-író/);
});

t('nincs ismétlés → nincs sor', () => {
  assert.equal(describeRepeat([], 0, '2026-08-06'), null);
});

t('hiányzó created dátum nem borítja fel', () => {
  const l = { scope: 'iro', text: 'valami', repeats: 3, created: '', lastRepeat: '2026-08-06T01:00:00Z' };
  const s = describeRepeat([l], 1, '2026-08-06');
  assert.ok(typeof s === 'string' && s.length > 0);
  assert.ok(!/NaN/.test(s), 'NaN sosem mehet ki a riportba');
});

t('a leghosszabb ideje makacs típust emeli ki', () => {
  const s = describeRepeat([lesson(2, 30), lesson(9, 30)], 2, '2026-08-06');
  assert.match(s, /9/, 'a nagyobb ismétlés-számú kerül a példába');
  assert.match(s, /2 típus/);
});

// ---------- fordítás-hiány: MELYIK cikk, ne csak hány ----------
// 2026-08-10: a 08-09-i heti összefoglaló magyarul ÜRESEN maradt, és angolul
// ment ki. A riport ezt "Fordítás-hiány: 1 pár"-ként írta le — egy szám, ami
// elvész a napi zajban. A user vette észre, nem a rendszer. Egy hiányzó
// fordítás nem statisztika: meg kell nevezni, MELYIK cikk az.
console.log('\n🧪 fordítás-hiány sora\n');

t('hiánytalan állapotban nincs sor', () => {
  assert.equal(describeTranslationGaps([]), '');
  assert.equal(describeTranslationGaps(null), '');
});

t('egyetlen hiányt MEGNEVEZ, okkal együtt', () => {
  const s = describeTranslationGaps([
    { slug: 'this-week-in-ai-august-9-2026', lang: 'hu', ok: 'ÜRES' }
  ]);
  assert.match(s, /this-week-in-ai-august-9-2026/, 'a cikk neve benne van');
  assert.match(s, /hu/, 'a nyelv benne van');
  assert.match(s, /ÜRES/, 'az ok benne van');
});

t('a heti összefoglalót KIEMELI', () => {
  // Ez a cikk a főoldal tetején ül minden nyelven, és a kabala-kép is
  // hozzá tartozik — ha ez angol, az a legláthatóbb hiba az oldalon.
  const s = describeTranslationGaps([
    { slug: 'this-week-in-ai', lang: 'hu', ok: 'ÜRES', kiemelt: true }
  ]);
  assert.match(s, /heti összefoglaló/i, 'külön szól a heti összefoglalóról');
});

t('sok hiánynál számot ad és példát mutat', () => {
  const sok = Array.from({ length: 9 }, (_, i) => ({ slug: 'cikk-' + i, lang: 'es', ok: 'ÜRES' }));
  const s = describeTranslationGaps(sok);
  assert.match(s, /9/, 'a teljes szám benne van');
  assert.match(s, /cikk-0/, 'az első példa benne van');
  assert.ok(!s.includes('cikk-8'), 'nem sorolja fel mind a kilencet');
});

t('az angolul maradt fordítás más ok, mint az üres', () => {
  const s = describeTranslationGaps([
    { slug: 'valami-cikk', lang: 'es', ok: 'angolul maradt' }
  ]);
  assert.match(s, /angolul maradt/);
});

t('🔗 az összevonás száma kimegy a riportba', () => {
  // MIÉRT KELL: ha az ítélet sosem von össze semmit, azt CSAK ebből lehet
  // észrevenni. A szám nélkül az „elkészült" és a „működik" nem különbözik.
  const most = Date.now();
  const cikkek = [
    { _meta: { merged_from: 3, published_at: new Date(most - 3600e3).toISOString() } },
    { _meta: { merged_from: 1, published_at: new Date(most - 7200e3).toISOString() } },
    { _meta: { published_at: new Date(most - 10800e3).toISOString() } }
  ];
  const sor = mergeLine(cikkek, 1);
  assert.match(sor, /🔗/);
  assert.match(sor, /1 cikk/, 'egy összevont cikk');
  assert.match(sor, /3 hírből/, 'három hírből');
});

t('a régi cikk nem számít bele az ablakba', () => {
  // AZ IRÁNY SZÁMÍT: ha a régi összevonásokat is beleszámolnánk, a sor akkor is
  // szép számot mutatna, amikor az ítélet MA már nem von össze semmit.
  const regi = new Date(Date.now() - 5 * 86400e3).toISOString();
  const sor = mergeLine([{ _meta: { merged_from: 4, published_at: regi } }], 1);
  assert.match(sor, /nem volt/);
});

t('összevonás nélkül is ad értelmes sort', () => {
  const sor = mergeLine([{ _meta: { published_at: new Date().toISOString() } }], 1);
  assert.ok(typeof sor === 'string' && sor.length > 0);
  assert.match(sor, /nem volt|0/);
});

t('hiányzó adatra nem borul', () => {
  assert.ok(typeof mergeLine(null, 1) === 'string');
  assert.ok(typeof mergeLine([], 1) === 'string');
  assert.ok(typeof mergeLine([{}, { _meta: null }], 1) === 'string');
});

t('📝 a magyar helyesírás-sor az EMBERI SZEMET kérőket emeli ki', () => {
  // MIÉRT EZT: az auto-javítottal nincs teendőd — az már rendben van. Ami
  // döntést kér, az az, amit a gép NEM javíthatott magától.
  const s = huSpellingLine({
    ok: ['alma', 'körte'],
    fix: { 'többiünknek': { correct: 'többieknek' } },
    review: { 'asksz': { correct: 'askolsz vagy valami' } }
  });
  assert.match(s, /📝/);
  assert.match(s, /asksz/, 'a döntést kérő szó látszódjon');
  assert.match(s, /1/);
});

// ── PÁSZTÁZÁS-LEFEDETTSÉG ───────────────────────────────────────────
// MIÉRT (2026-08-21, éles lelet): a helyesírás-őrszem egy elrontott
// fájlválasztás miatt 773 cikkből 12-t nézett — mindig ugyanazt a 12-t —, és
// erre büszkén „0 megítélendő szóalak"-ot jelentett. A CI-naplóban ez zöld
// volt. Ha a napi riport KIÍRJA, hány cikket néztünk át, a hiba az első napon
// szemet szúr: a „12" a 773 mellett hangosan hamis.

t('📝 a riport kiírja, HÁNY cikket néztünk át — enélkül a vakság zöldnek látszik', () => {
  const s = huSpellingLine({
    ok: [], fix: {}, review: { asksz: { correct: 'kérdezel' } },
    scan: { at: '2026-08-21', files: 773, candidates: 192 }
  });
  assert.match(s, /773/, 'a lefedettség a riportban legyen ott');
});

t('📝 a lefedettség akkor is látszik, ha NINCS átnézendő szó', () => {
  // Pont ez a veszélyes eset: a néma siker és a néma vakság megkülönböztethető
  // legyen. „0 szóalak 773 cikkből" megnyugtató; „0 szóalak 12 cikkből" nem.
  const s = huSpellingLine({ ok: [], fix: {}, review: {}, scan: { files: 773, candidates: 0 } });
  assert.match(s, /773/);
});

t('📝 régi tár (scan nélkül) nem borítja fel a riportot', () => {
  const s = huSpellingLine({ ok: [], fix: {}, review: { asksz: { correct: 'kérdezel' } } });
  assert.match(s, /asksz/);
  assert.ok(!s.includes('undefined'), 'hiányzó mező ne szivárogjon ki a riportba');
});

t('ha nincs átnézendő, a sor CSENDES', () => {
  // A napi riport hosszú; ami nem kér tőled semmit, az ne foglaljon sort.
  assert.equal(huSpellingLine({ ok: ['a'], fix: { x: { correct: 'y' } }, review: {} }), '');
  assert.equal(huSpellingLine(null), '');
  assert.equal(huSpellingLine({}), '');
});

t('sok átnézendőnél számot ad és néhány példát', () => {
  const review = {};
  for (let i = 0; i < 9; i++) review['szo' + i] = { correct: 'jó' + i };
  const s = huSpellingLine({ ok: [], fix: {}, review });
  assert.match(s, /9/);
  assert.ok(s.length < 220, 'a riport-sor ne fusson szét');
});


// ── 🔁 ISMÉTLÉS-ŐR ──────────────────────────────────────────────────
//
// ELŐZMÉNY (2026-08-25): a user vette észre, hogy ugyanaz a téma többször
// megjelenik. Kiderült, hogy a témaismétlés-őr beágyazása HÓNAPOK ÓTA halott
// volt (a Google-kulcs elfogyott), és 7%-os érzékenységgel futott — miközben
// végig zöldnek látszott. EZÉRT van most sor a napi riportban.

import { repeatLine } from './report-lines.js';

t('🔁 kiírja, hány ismétlést fogott meg', () => {
  const s = repeatLine({ skipped_repeat: 2, repeats: [
    { cim: 'What Is Agentic AI?', mar: "What 'Agentic AI' Means for Your Work", pont: 0.921 },
    { cim: 'How to Spot a Phishing Message', mar: 'How to Spot a Phishing Email', pont: 0.956 }
  ] });
  assert.match(s, /2/);
  assert.match(s, /Agentic AI/, 'mondja meg, MIT hagyott ki');
});

t('🔁 NULLÁNÁL IS KIÍR — a hallgatás itt félrevezetne', () => {
  // A „nem volt ismétlés" és az „el sem indult az őr" kívülről egyformán
  // néz ki: mindkettő nulla. Pont ez a hiba tartott hónapokig.
  const s = repeatLine({ skipped_repeat: 0, repeats: [] });
  assert.ok(s, 'nem lehet üres');
  assert.match(s, /nem volt|0/);
});

t('🔁 ha az őr EL SEM INDULT, az MÁS üzenet, mint a nulla', () => {
  const nincs = repeatLine({});                    // nincsenek mezők
  const nulla = repeatLine({ skipped_repeat: 0, repeats: [] });
  assert.notEqual(nincs, nulla, 'a két állapotot meg kell különböztetni');
  assert.match(nincs, /nem futott|ismeretlen|⚠️/i);
});

t('🔁 hibás bemenetre nem borul', () => {
  for (const x of [null, undefined, 'hopp', 42]) assert.doesNotThrow(() => repeatLine(x));
});

// ── 👥 LÁTOGATÓSZÁM (2026-08-28) ────────────────────────────────────
// A user panasza: „nem releváns, amit küld". A riportból pont a legfontosabb
// szám hiányzott, miközben az adat hónapok óta megvolt.
const { visitorLine, napiBelepok } = await import('./report-lines.js');

const NAPOK = {
  '2026-08-24': [{ path: '/', visits: 30 }, { path: '/a', visits: 18 }],
  '2026-08-25': [{ path: '/', visits: 49 }],
  '2026-08-26': [{ path: '/', visits: 40 }, { path: '/b', visits: 27 }]
};

t('a látogatószám a VALÓDI napi összeget adja', () => {
  // A --report ugyanígy számol: minden útvonal visits-e összeadva.
  assert.equal(napiBelepok(NAPOK['2026-08-26']), 67);
  assert.equal(napiBelepok(NAPOK['2026-08-24']), 48);
});

t('„Tegnap", ha tényleg tegnapi az adat', () => {
  const sor = visitorLine(NAPOK, '2026-08-27');
  assert.ok(sor.startsWith('👥 Tegnap: 67 látogató'), sor);
});

t('⚠️ DÁTUMOT ír, ha az adat RÉGEBBI — nem hazudik „tegnap"-ot', () => {
  // A Cloudflare-adat késhet, a CI is csúszhat. Élesben 2026-08-28-án a
  // napló legfrissebb napja tényleg 2026-08-26 volt.
  const sor = visitorLine(NAPOK, '2026-08-28');
  assert.ok(sor.includes('2026-08-26'), sor);
  assert.ok(!sor.includes('Tegnap'), 'régi adatra „Tegnap"-ot írt: ' + sor);
});

t('az átlag csak 3 naptól jelenik meg', () => {
  assert.ok(visitorLine(NAPOK, '2026-08-27').includes('átlag'));
  assert.ok(!visitorLine({ '2026-08-26': [{ visits: 5 }] }, '2026-08-27').includes('átlag'));
});

t('hiányzó vagy rossz adatra CSENDBEN kimarad', () => {
  for (const rossz of [null, undefined, {}, 'hopp', 42, { nem_datum: [] }]) {
    assert.equal(visitorLine(rossz, '2026-08-28'), '', String(rossz));
  }
  assert.equal(napiBelepok(null), 0);
  assert.equal(napiBelepok([{ visits: 'x' }, {}]), 0);
});

// ── 🔁 FUTOTT-E AZ ŐR? (2026-08-30, hibavadászat) ───────────────────
const { orFutott } = await import('./report-lines.js');

t('🔁 A VALÓDI ESET: csak útmutató készült → az őr AKKOR IS futott', () => {
  // 2026-08-30-án élesben: 0 writer-napló (nem volt hír-írás), DE a
  // topic-dedup naplóban 4 mai bejegyzés, mind `guide-*` forrásból.
  // A riport mégis „⚠️ NEM FUTOTT — ez hiba"-t írt, tizenöt sorral azután,
  // hogy kiírta: „Ismétlődő téma kiszűrve: 4". Két egymásnak ellentmondó sor.
  assert.equal(orFutott({ writerNaplok: 0, dedupMai: 4 }), true, 'a guide-ág lefutását nem vette észre');
});

t('a hír-író naplója önmagában is elég', () => {
  assert.equal(orFutott({ writerNaplok: 2, dedupMai: 0 }), true);
});

t('⚠️ ha EGYIK forrás sem mutat semmit, az TÉNYLEG „nem futott"', () => {
  // Ez a különbségtétel a lényeg — nem szabad elmosni. A 08-25-i lelet épp az
  // volt, hogy a „nem volt dolga" és a „el sem indult" egyformán nézett ki.
  assert.equal(orFutott({ writerNaplok: 0, dedupMai: 0 }), false);
  assert.equal(orFutott({}), false);
  assert.equal(orFutott(), false);
});

t('hibás bemenetre nem borul, és nem hazudik „futott"-at', () => {
  for (const rossz of [null, undefined, 'hopp', NaN]) {
    assert.equal(orFutott({ writerNaplok: rossz, dedupMai: rossz }), false, String(rossz));
  }
});

// ---------- zárósor: ✅ csak hibajelzés nélkül (10-12) ----------

t('🔴 a 10-12-i ÉLŐ jelentés: Reel-hiba mellett a zárósor NEM mondhat ✅-t', () => {
  const elo = [
    '📘 Facebook-poszt: 5 kiküldve, mind megjelent',
    '⚠️ REEL-POSZTOLÓ: 1/2 poszt ELBUKOTT ma. A Make hibasorában megvan, újrajátszható.',
    '🎬 REEL-ŐRSZEM: a videó-gyártás elbukott — Edge TTS WebSocket error: Unexpected server response: 403',
    '🧩 KIMENET-ŐR: 3 lelet — csak a hírben van'
  ];
  const z = zaroSor(elo);
  assert.ok(!z.includes('✅'), 'hiba mellett is ✅: ' + z);
  assert.match(z, /2 hibajelzés/);
  // 10-28: a zárósor a hibák NEVÉT is mondja (a szám magában elveszett a 25 sor között)
  assert.match(z, /REEL-POSZTOLÓ · REEL-ŐRSZEM/);
});

t('10-28 élő riport: a zárósor megnevezi a 3 hibát', () => {
  const z = zaroSor([
    '🎬 REEL-ŐRSZEM: a videó-gyártás elbukott — Stream closed before the synthesis completed',
    '⚠️ TIKTOK: ma eddig csak 2 videó ment ki (cél: 3) + 2 fotó — nem készülhetett videó ebből az útmutatóból: „How to X”: csak 0 lépés (legalább 3 kell).',
    '⚠️ AI-LASSULÁS (2026-10-28) — 95 hívásból: 1 AI-hívás lógott bele a türelem-plafonba',
    '📘 Facebook-poszt: 5 kiküldve, mind megjelent'
  ]);
  assert.equal(z, '⚠️ Nem minden ment magától: 3 hibajelzés — REEL-ŐRSZEM · TIKTOK · AI-LASSULÁS. Fent a részletek.');
});

t('hibajelzés nélkül marad a „Minden megy magától. ✅"; a krónikus 🧩/♻️ lelet nem hiba', () => {
  assert.equal(zaroSor(['📘 Facebook-poszt: 6 kiküldve, mind megjelent', '🧩 KIMENET-ŐR: 3 lelet', '♻️ Ismétlődő hiba: 2 típus ma']), 'Minden megy magától. ✅');
  assert.equal(zaroSor([]), 'Minden megy magától. ✅');
  assert.equal(hibaSorok(['❌ valami', '🔴 más', 'rendben']).length, 2);
});

t('🔌 a napi jelentés tényleg ezt használja (nem a régi feltétel nélküli ✅-t)', () => {
  const src = readFileSync(new URL('./daily-report.js', import.meta.url), 'utf-8');
  assert.match(src, /szurtSorok\.push\(``, zaroSor\(szurtSorok\)\)/);
  assert.ok(!/push\(``, `Minden megy magától\. ✅`\)/.test(src), 'a feltétel nélküli ✅ visszakerült');
});

// ---------- 🔧 Ha elakadsz: napi sor (2b bekötés, Task 4) ----------
const { elakadasLine } = await import('./report-lines.js');

t('🔧 mai állapot → a brief szerinti sor, 3 tizedes költséggel', () => {
  assert.equal(elakadasLine({ nap: '2026-10-27', uj: 2, forditva: 4, koltseg: 0.012 }, '2026-10-27'),
    '🔧 „Ha elakadsz” dobozok: 2 új, 4 fordítás ($0.012)');
});

t('🔧 a kimaradás oka a sor végére kerül', () => {
  const sor = elakadasLine({ nap: '2026-10-27', uj: 1, forditva: 2, koltseg: 0.5, kimaradt: 'keret' }, '2026-10-27');
  assert.equal(sor, '🔧 „Ha elakadsz” dobozok: 1 új, 2 fordítás ($0.500) · kimaradt: elfogyott a napi keret');
  assert.ok(!elakadasLine({ nap: '2026-10-27', uj: 0, forditva: 0, koltseg: 0, kimaradt: '' }, '2026-10-27').includes('kimaradt'));
});

t('🔧 tegnapi vagy hiányzó állapot → null (nem állítjuk, hogy ma futott)', () => {
  assert.equal(elakadasLine({ nap: '2026-10-26', uj: 2, forditva: 4, koltseg: 0.012 }, '2026-10-27'), null);
  for (const rossz of [null, undefined, {}, 'hopp', 42, [], { uj: 1 }]) {
    assert.equal(elakadasLine(rossz, '2026-10-27'), null, String(rossz));
  }
});

t('🔧 hibás számmezők nem borítanak, és NaN-t nem írnak ki', () => {
  const sor = elakadasLine({ nap: '2026-10-27', uj: 'x', forditva: null, koltseg: 'y' }, '2026-10-27');
  assert.equal(sor, '🔧 „Ha elakadsz” dobozok: 0 új, 0 fordítás ($0.000)');
  assert.ok(!/NaN|undefined/.test(sor));
});

t('🔧 a kimaradt-szöveg egy sorba tördelve, rövidítve kerül ki (nincs sortörés)', () => {
  const sor = elakadasLine({ nap: '2026-10-27', uj: 0, forditva: 0, koltseg: 0, kimaradt: 'a\nb ' + 'x'.repeat(200) }, '2026-10-27');
  assert.ok(!sor.includes('\n'));
  assert.ok(sor.length < 200, String(sor.length));
});

t('🔌 a napi jelentés beköti a sort, hibás/hiányzó fájlra sem dől el', () => {
  const src = readFileSync(new URL('./daily-report.js', import.meta.url), 'utf-8');
  assert.match(src, /elakadasLine\(/);
  assert.match(src, /elakadas-state\.json/);
});

console.log('\n✅ report-lines.test: mind a ' + pass + ' eset rendben');

// 🧩 2026-10-29: régi promptok kitölthetővé tétele — napi riport-sor
{
  const { kitolthetoRegiLine } = await import('./report-lines.js');
  assert.equal(kitolthetoRegiLine({ nap: '2026-10-29', uj: 3, mezo: 7, koltseg: 0.0123 }, '2026-10-29'), '🧩 Régi promptok kitölthetővé: 3 útmutató, 7 mező ($0.012)');
  assert.match(kitolthetoRegiLine({ nap: '2026-10-29', uj: 1, mezo: 0, koltseg: 0.05, kimaradt: 'keret' }, '2026-10-29'), /kimaradt: keret$/);
  assert.equal(kitolthetoRegiLine({ nap: '2026-10-28', uj: 3, mezo: 7, koltseg: 0.01 }, '2026-10-29'), null, 'tegnapi állapotból nincs sor');
  for (const rossz of [null, undefined, 5, 'x', [], {}]) assert.equal(kitolthetoRegiLine(rossz, '2026-10-29'), null, String(rossz));
  assert.equal(kitolthetoRegiLine({ nap: '2026-10-29', uj: 'x', mezo: null, koltseg: NaN }, '2026-10-29'), '🧩 Régi promptok kitölthetővé: 0 útmutató, 0 mező ($0.000)', 'hibás szám 0, sosem NaN');
  console.log('  ✅ kitolthetoRegiLine');
}

// 🕵️ 2026-11-01 (4. rész): tény-ellenőrző — napi riport-sor az elmúlt 24 óra logs/factcheck_*.json naplóiból
{
  const { tenyellenorzoLine, TENY_RESZLET_MAX } = await import('./report-lines.js');
  const { tenyNaplo, naploTetel } = await import('./friss-tenyellenorzes.js');
  const NOW = Date.parse('2026-11-02T12:30:00Z');
  const ora = h => new Date(NOW - h * 3600e3).toISOString();
  const tt = (eredmeny, cim, ok_hu, hir = true) => naploTetel({ file: cim + '.json', cim, hir, eredmeny, ok_hu });
  // VALÓDI forma: a naplót ugyanaz a tenyNaplo() építi, amit az agent ír
  const reggel = tenyNaplo({ at: ora(9), cost: 0.021, items: [
    tt('ok', 'A', 'rendben'), tt('ok', 'B', 'rendben'), tt('javitva', 'Gemini in Slides can now edit a whole *presentation* at once', 'a forrás szerint csak angolul indul'),
    tt('kihagyva', 'C', 'a forrás nem olvasható (1/3: HTTP 403)')
  ] });
  const delben = tenyNaplo({ at: ora(1), cost: 0.0301, items: [
    tt('ok', 'D', 'rendben'), tt('gyanu', 'Copilot útmutató', 'ma van ingyenes csomag', false),
    tt('visszautasitva', 'Ideogram_hír', 'a forrás alátámasztja, amit kivenne'), tt('ertelmezhetetlen', 'E', 'x')
  ] });
  const regi = { ok: 3, fixed: 1, removed: 0, cost: 0.5, at: ora(30), claim: null };   // 24 órán kívül
  const sor = tenyellenorzoLine([reggel, delben, regi], NOW);
  const [fej, ...reszlet] = sor.split('\n');
  assert.equal(fej, '🕵️ Tény-ellenőrző: 8 cikk · ✅ 3 rendben · 🔧 1 javítva · 🙋 1 gyanú (nem javítottuk) · ⛔ 1 javítás-javaslatot nem engedtünk át · ⏭️ 1 forrás olvashatatlan · ⚠️ 1 értelmezhetetlen válasz · $0,05');
  assert.equal(reszlet.length, 3);
  assert.match(reszlet[0], /^  • 🔧 javítva „Gemini in Slides can now edit a whole presentatio…” — a forrás szerint csak angolul indul$/, 'a javított elöl, a cím max 50 karakter, Markdown-jel nélkül');
  assert.match(reszlet[1], /„Ideogramhír” — a forrás alátámasztja/, 'a visszautasítás a 2.; az aláhúzás kiesik (Telegram Markdown)');
  assert.match(reszlet[2], /„Copilot útmutató” — ma van ingyenes csomag/);
  // sok részlet → max TENY_RESZLET_MAX + „…és még”
  const sok = tenyNaplo({ at: ora(2), items: Array.from({ length: 7 }, (_, i) => tt('gyanu', 'G' + i, 'gyanú ' + i)) });
  const ss = tenyellenorzoLine([sok], NOW).split('\n');
  assert.equal(ss.length, 1 + TENY_RESZLET_MAX + 1);
  assert.match(ss.at(-1), /…és még 3/);
  // régi forma (11-01 előtt: csak ok/fixed/cost) is beszámít, részletsor nélkül
  assert.equal(tenyellenorzoLine([{ ok: 2, fixed: 1, cost: 0.01, at: ora(3) }], NOW), '🕵️ Tény-ellenőrző: 3 cikk · ✅ 2 rendben · 🔧 1 javítva · $0,01');
  // három állapot: nem futott (⚠️) · futott, nem volt dolga · eredmény
  assert.match(tenyellenorzoLine([], NOW), /⚠️ NEM FUTOTT az elmúlt 24 órában/);
  assert.match(tenyellenorzoLine([regi], NOW), /⚠️ NEM FUTOTT/, 'a 24 órán kívüli napló nem számít');
  assert.match(tenyellenorzoLine([tenyNaplo({ at: ora(1) })], NOW), /futott \(1×\), de nem volt átnéznivaló cikk/);
  // 2026-11-02 (kód-átnézés): időkorlát / hiba is látszik, nem „NEM FUTOTT”
  assert.match(tenyellenorzoLine([{ ...tenyNaplo({ at: ora(1) }), megszakitva: true }], NOW), /nem volt átnéznivaló cikk · ⏱️ 1× időkorlát miatt megszakadt/);
  const felig = { ...tenyNaplo({ at: ora(1), items: [{ eredmeny: 'ok' }], cost: 0.01 }), hiba: 'x' };
  assert.match(tenyellenorzoLine([felig], NOW), /1 cikk · ✅ 1 rendben · 💥 1× hibával állt le · \$0,01/);
  {
    const fc = readFileSync(new URL('../agents/fact-check/agent.js', import.meta.url), 'utf-8');
    assert.match(fc, /if \(!guides\.length\) \{[^}]*naploIr\(\); return; \}/, 'üres sornál is napló');
    assert.match(fc, /if \(items\.length\) naploIr\(\);/, 'minden cikk után mentés');
    assert.match(fc, /process\.once\(jel, /, 'SIGTERM/SIGINT → napló');
    assert.match(fc, /_naploVeszhelyzet\?\.\(\{ hiba:/, 'hibánál is napló');
  }
  for (const rossz of [null, undefined, 'x', [null, 5, 'y', { at: 'nem dátum' }]]) assert.match(tenyellenorzoLine(rossz, NOW), /NEM FUTOTT/, String(rossz));
  // bekötés a napi riportba: a logs/ factcheck_ fájljaiból, hibára sem dől el
  const src = readFileSync(new URL('./daily-report.js', import.meta.url), 'utf-8');
  assert.match(src, /lines\.push\(tenyellenorzoLine\(naplok, Date\.now\(\)\)\);/);
  assert.match(src, /\^factcheck_/);
  assert.match(src, /f\.slice\(10, 20\) >= tegnap/, 'a fájlnév dátum-része: factcheck_ = 10 karakter');
  assert.equal('factcheck_2026-11-01T14-39-03-165Z.json'.slice(10, 20), '2026-11-01');
  console.log('  ✅ tenyellenorzoLine');
}
