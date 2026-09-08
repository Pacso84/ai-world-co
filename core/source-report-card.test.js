// ===================================================================
// FORRÁS-BIZONYÍTVÁNY TESZT — futtatás: node core/source-report-card.test.js
// INGYENES, hálózat nélküli. Fut az `npm test` körben is.
//
// MIÉRT NŐTT MEG EZ A FÁJL (2026-08-30):
// A „megbízhatatlan forrás → AUTO enabled:false" szabály HALOTT volt. A
// `truthBlocks` számláló a `content/rejected/` mappa PILLANATNYI tartalmából
// dolgozott — azt viszont a CEO/rework lánc folyamatosan ÜRÍTI. Mérve:
//
//     memory/truth-gate-log.json (14 nap) ....... 29 blokk
//     content/rejected/ ......................... 4 fájl
//     sources/source-stats.json ................. ÖSSZESEN 1 truthBlock
//
// Vagyis a valótlant közlő forrás sosem érhette el a 0,5-ös arányt, a napi
// riport pedig mindenkit tisztának mutatott. A számláló azóta a TARTÓS
// naplóból dolgozik.
//
// ⚠️ EZ A TESZT VALÓDI ADATON IS VÉGIGFUT (4. rész) — a repó tanulsága szerint
// a csak kézzel gyártott mintán futó teszt az ALAKOT ellenőrzi, nem a
// valóságot. A valódi fájlokat CSAK OLVASSA; a `finally` ellenőrzi az épségüket.
// ===================================================================
import { strict as assert } from 'assert';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import {
  judgeSource, reportLine, reportLineFromFile, collectArticleStats, sourceIdFromFile, runReportCard,
  DEAD_FEED_DAYS, MIN_SAMPLE, BAD_RATIO, TRUTH_WINDOW_DAYS, UNFIXED_GRACE_HOURS
} from './source-report-card.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// --- Éles fájlok: lenyomat ELŐTTE, ellenőrzés a végén ---------------
const ELES_FAJLOK = [
  join(ROOT, 'sources', 'source-stats.json'),
  join(ROOT, 'sources', 'rss-feeds.json'),
  join(ROOT, 'memory', 'truth-gate-log.json')
];
const LENYOMAT = ELES_FAJLOK.map(p => (existsSync(p) ? readFileSync(p, 'utf-8') : null));

const MUNKA = join(tmpdir(), 'aiworld-forrasbizonyitvany-' + process.pid);
const CIKKEK = join(MUNKA, 'articles');
mkdirSync(CIKKEK, { recursive: true });

const DAY = 86400000;
const MOST = Date.parse('2026-08-30T12:00:00.000Z');
const napja = n => new Date(MOST - n * DAY).toISOString().slice(0, 10);

/** Publikált cikk a teszt-mappába. A fájlnév alakja az élessel azonos. */
function cikk(forras, cim, napokkalEzelott) {
  const ts = new Date(MOST - napokkalEzelott * DAY).toISOString().replace(/[:.]/g, '-');
  const nev = 'ARTICLE_' + ts + '_' + forras + '_' + cim + '.json';
  writeFileSync(join(CIKKEK, nev), JSON.stringify({
    _meta: { source_id: forras, published_at: new Date(MOST - napokkalEzelott * DAY).toISOString() }
  }), 'utf-8');
  return nev.replace(/^ARTICLE_/, '');
}

/** Kapu-napló bejegyzés — a `logGate()` alakja: nap-kulcs → tömb. */
function naplo(...bejegyzesek) {
  const log = {};
  for (const b of bejegyzesek) {
    const nap = napja(b.napokkalEzelott);
    (log[nap] = log[nap] || []).push({
      at: new Date(MOST - b.napokkalEzelott * DAY).toISOString(),
      file: 'WRITER_' + b.alap,
      action: b.action || 'block',
      reasons: ['teszt'], confidence: 8
    });
  }
  return log;
}

const uritCikkek = () => { rmSync(CIKKEK, { recursive: true, force: true }); mkdirSync(CIKKEK, { recursive: true }); };

let pass = 0;
const t = (nev, fn) => { fn(); pass++; console.log('  ✅ ' + nev); };

try {

// ===================================================================
// 1. rész — a DÖNTÉSI logika (a küszöbök VÁLTOZATLANOK)
// ===================================================================
console.log('🧪 döntési logika');

t('halott feed → automatikus kikapcsolás', () => {
  const j = judgeSource({ feedAgeDays: DEAD_FEED_DAYS + 1, published30d: 0, truthBlocks: 0, totalAttempts: 5 });
  assert.equal(j.verdict, 'dead');
  assert.equal(j.auto, true, 'halott feedet a rendszer MAGÁTÓL kikapcsolja');
});

// ===================================================================
// 🔑 A BLOKK NEM ÍTÉLET (2026-09-08) — a szerződés MEGVÁLTOZOTT
// ===================================================================
// Ez a teszt korábban azt rögzítette, hogy a kapu-blokkok aránya AUTOMATIKUS
// kikapcsolást vált ki. Kimérve a valódi naplón: 25 blokkolt piszkozatból
// 25 megjelent és ma is kint van (100%), elutasítva maradt 0. A blokk tehát
// „egy javítási kör kellett"-et jelent, nem azt, hogy a forrás valótlant közöl
// — a kitalált menüutakat ráadásul a MI írónk gyártotta, nem a forrás.
// Az ítélet ezért JAVASLAT lett, és a mérce a „nem is jött rendbe" szám.
t('🔑 a puszta BLOKK önmagában NEM minősít (25/25 blokkolt cikk megjelent)', () => {
  // Régen ez `unreliable` + `auto:true` volt. Ma: minden blokkolt cikk rendbe
  // jött, tehát nincs miről beszélni.
  const j = judgeSource({ feedAgeDays: 1, published30d: 2, truthBlocks: 8, totalAttempts: 10, truthUnfixed: 0 });
  assert.equal(j.verdict, 'ok', '8/10 blokk, de mind rendbe jött — ez nem forráshiba');
  assert.equal(j.auto, false);
});

t('🔑 ami NEM JÖTT RENDBE, arra szól — de csak JAVASLATKÉNT, nem kivégzésként', () => {
  const j = judgeSource({ feedAgeDays: 1, published30d: 2, truthBlocks: 6, totalAttempts: 10, truthUnfixed: 5 });
  assert.equal(j.verdict, 'unreliable');
  assert.equal(j.auto, false, '⚠️ NEM kapcsolhatja ki magától — ez ítélet kérdése, a user dönt');
  assert.ok(/fennakadt a hitelesség-kapun/.test(j.reason), 'a szöveg: ' + j.reason);
});

t('🔑 a szöveg nem állít TÖBBET, mint amennyit mér', () => {
  const j = judgeSource({ feedAgeDays: 1, published30d: 2, truthBlocks: 6, totalAttempts: 10, truthUnfixed: 5 });
  // A régi mondat „valótlan tartalom"-ról beszélt — az ítélet a forrásról,
  // amit ez a szám nem támaszt alá. Ilyet többé nem írunk le.
  assert.ok(!/valótlan/i.test(j.reason), 'visszatért a meg nem alapozott ítélet: ' + j.reason);
  assert.ok(/utolsó \d+ nap/.test(j.reason), 'az IDŐTÁV-nak ki kell mennie: ' + j.reason);
});

t('kevés minta → NEM minősítünk (egy-két rossz cikk nem tendencia)', () => {
  const j = judgeSource({ feedAgeDays: 1, published30d: 1, truthBlocks: MIN_SAMPLE - 1, totalAttempts: MIN_SAMPLE - 1, truthUnfixed: MIN_SAMPLE - 1 });
  assert.notEqual(j.verdict, 'unreliable', 'kis mintán nem bélyegzünk meg forrást');
  assert.equal(j.auto, false);
});

t('🔑 a MINTAKÜSZÖB valódi esetet véd: az nvidia-blog 1/3-on állt', () => {
  // 2026-09-08-i éles állapot. A RÉGI küszöbnél (4) egyetlen további blokk
  // kikapcsolta volna: 2/4 = 50%. Havi 7 cikket adó hivatalos forrás, három
  // elemű mintán. Ez a teszt azt őrzi, hogy ez ne fordulhasson elő újra.
  const j = judgeSource({ feedAgeDays: 1, published30d: 7, truthBlocks: 2, totalAttempts: 4, truthUnfixed: 2 });
  assert.equal(j.verdict, 'ok', '4 elemű mintán NEM minősítünk (MIN_SAMPLE=' + MIN_SAMPLE + ')');
  assert.equal(j.auto, false);
});

t('él, de nem termel → csak JAVASLAT (a user dönt)', () => {
  const j = judgeSource({ feedAgeDays: 2, published30d: 0, truthBlocks: 0, totalAttempts: 0 });
  assert.equal(j.verdict, 'no-yield');
  assert.equal(j.auto, false, 'ítélet kérdése — NEM kapcsoljuk ki magunktól');
});

t('jól működő forrás → nincs teendő', () => {
  const j = judgeSource({ feedAgeDays: 0, published30d: 12, truthBlocks: 0, totalAttempts: 12 });
  assert.equal(j.verdict, 'ok');
  assert.equal(j.auto, false);
});

t('egy rossz cikk sok jó mellett NEM elég a kikapcsoláshoz', () => {
  const j = judgeSource({ feedAgeDays: 0, published30d: 20, truthBlocks: 1, totalAttempts: 20, truthUnfixed: 1 });
  assert.equal(j.verdict, 'ok', '1/20 (' + BAD_RATIO + ' küszöb alatt) még rendben');
});

t('🚨 az AUTOMATIKUS kikapcsolás CSAK a halott feed ágán maradt', () => {
  // A projekt legdrágább hibaosztálya a némán meghozott, visszafordíthatatlan
  // döntés. Ez a teszt kimondja, hány ilyen ág van: PONTOSAN EGY.
  const esetek = [
    { nev: 'halott feed', m: { feedAgeDays: DEAD_FEED_DAYS + 1, published30d: 0, truthBlocks: 0, totalAttempts: 5, truthUnfixed: 0 } },
    { nev: 'fennakadt cikkek', m: { feedAgeDays: 1, published30d: 3, truthBlocks: 20, totalAttempts: 20, truthUnfixed: 20 } },
    { nev: 'elavult feed', m: { feedAgeDays: 200, published30d: 4, truthBlocks: 0, totalAttempts: 4, truthUnfixed: 0 } },
    { nev: 'nem termel', m: { feedAgeDays: 2, published30d: 0, truthBlocks: 0, totalAttempts: 0, truthUnfixed: 0 } },
    { nev: 'rendben', m: { feedAgeDays: 0, published30d: 12, truthBlocks: 0, totalAttempts: 12, truthUnfixed: 0 } }
  ];
  const autok = esetek.filter(e => judgeSource(e.m).auto === true).map(e => e.nev);
  assert.deepEqual(autok, ['halott feed'],
    'megváltozott, mely ág kapcsol ki MAGÁTÓL forrást: ' + JSON.stringify(autok));
});

t('már kikapcsolt forrást nem bántunk újra', () => {
  const j = judgeSource({ feedAgeDays: null, published30d: 0, truthBlocks: 0, totalAttempts: 0, alreadyDisabled: true });
  assert.equal(j.verdict, 'disabled');
  assert.equal(j.auto, false);
});

t('a küszöbök rögzítve (változás csak szándékosan, mérés mellé)', () => {
  assert.equal(MIN_SAMPLE, 8, 'a 4-es minta valódi forrást veszélyeztetett (nvidia-blog 1/3)');
  assert.equal(BAD_RATIO, 0.5);
  assert.equal(DEAD_FEED_DAYS, 365);
  assert.equal(UNFIXED_GRACE_HOURS, 48, 'a mért maximum 9,8 óra volt — ez az ötszöröse');
});

t('🔑 a türelmi idő a MÉRT valóság fölött van', () => {
  // Mérve 2026-09-08, 25 párosított eseten: blokk → megjelenés mediánja 0,0
  // óra, maximuma 9,8 óra. Ha a türelem ez alá csúszna, a rendszer a saját,
  // NORMÁLIS javítási körét minősítené kudarcnak.
  assert.ok(UNFIXED_GRACE_HOURS > 9.8 * 2,
    'a türelmi idő (' + UNFIXED_GRACE_HOURS + 'ó) nincs biztonságos távolságban a mért 9,8 órától');
});

t('riport-sor: csendes, ha nincs teendő; beszédes, ha van', () => {
  assert.equal(reportLine({ autoDisabled: [], proposals: [] }), '', 'nincs teendő → néma');
  const line = reportLine({
    autoDisabled: [{ id: 'x', name: 'Teszt Forrás (hivatalos)', reason: 'halott feed — 400 napja néma' }],
    proposals: [{ id: 'y', name: 'Másik Forrás', reason: 'nem termel' }]
  });
  assert.ok(line.includes('KIKAPCSOLVA') && line.includes('Teszt Forrás'), 'a kikapcsolt forrás nevesítve');
  assert.ok(!line.includes('(hivatalos)'), 'a technikai utótag nem megy ki a riportba');
  assert.ok(line.includes('Másik Forrás'), 'a javaslat is megjelenik');
});

t('🔑 a kapun fennakadt forrás a SAJÁT mondatát kapja, nem a „nem termel"-t', () => {
  // A riport-sornak korábban KÉT vödre volt: „elavult" és „minden más".
  // A 2026-09-08-i változás után az `unreliable` is javaslat lett — a régi
  // kódban abba a „minden más" vödörbe esett volna, és a napi riport azt írta
  // volna egy havi 36 cikket adó forrásra, hogy NEM TERMEL.
  const line = reportLine({
    autoDisabled: [],
    proposals: [{ id: 'p', name: 'Picsart (hivatalos)', reason: '5/8 cikke fennakadt a hitelesség-kapun és 48 óra után sem jelent meg (utolsó 14 nap) — érdemes megnézni' }]
  });
  assert.ok(line.includes('Picsart'), 'a forrás nevesítve: ' + line);
  assert.ok(/fennakadt/.test(line), 'a lelet szövege kimegy: ' + line);
  assert.ok(!/Nem termel/.test(line), '⚠️ a „nem termel" mondatot kapta egy termelő forrás: ' + line);
});

t('🔑 a fennakadt forrás NEM némul el a napi riportban', () => {
  // A legfontosabb: a javaslattá szelídítés nem jelentheti azt, hogy a lelet
  // senkihez nem jut el. („Az őrszem csak akkor őr, ha odaszól, ahol a user néz.")
  const line = reportLine({
    autoDisabled: [],
    proposals: [{ id: 'p', name: 'X', reason: '9/10 cikke fennakadt a hitelesség-kapun és 48 óra után sem jelent meg (utolsó 14 nap) — érdemes megnézni' }]
  });
  assert.ok(line && line.trim().length > 0, 'a riport-sor NÉMA maradt egy valódi leletre');
});

// ===================================================================
// 2. rész — FÁJLNÉV → FORRÁS (a napló csak a fájlnevet őrzi)
// ===================================================================
console.log('\n🧪 fájlnév → forrás-azonosító');

t('valódi naplóbeli nevek helyesen bomlanak szét', () => {
  // Ezek SZÓ SZERINT a memory/truth-gate-log.json-ból valók.
  assert.equal(sourceIdFromFile('WRITER_2026-08-08T00-50-18-674Z_picsart_Seedance_2_5_in_Picsart__cinematic_video__one_take.json'), 'picsart');
  assert.equal(sourceIdFromFile('WRITER_2026-08-13T16-45-06-656Z_aws-ml_Amazon_Quick_for_Microsoft_365__Agentic_AI_where_y.json'), 'aws-ml');
  assert.equal(sourceIdFromFile('WRITER_2026-08-14T01-01-26-376Z_google-ai-blog_Bring_your_spreadsheet_data_to_life_with_Sheets_ca.json'), 'google-ai-blog');
  assert.equal(sourceIdFromFile('WRITER_2026-08-23T00-52-32-690Z_aiworld-editorial_This_Week_in_AI.json'), 'aiworld-editorial');
});

t('az útmutató nem forrás — külön "guide" azonosítót kap', () => {
  assert.equal(sourceIdFromFile('WRITER_GUIDE_ask-alexa-to-read-your-calendar-aloud-and-remind-you.json'), 'guide');
});

t('a REJECTED_/ARTICLE_ előtag ugyanarra a forrásra vezet', () => {
  const alap = '2026-08-21T00-39-46-760Z_picsart_30_Gemini_Omni_prompts.json';
  assert.equal(sourceIdFromFile('WRITER_' + alap), 'picsart');
  assert.equal(sourceIdFromFile('REJECTED_' + alap), 'picsart');
  assert.equal(sourceIdFromFile('ARTICLE_' + alap), 'picsart');
});

t('értelmezhetetlen név → null, nem félreértett forrás', () => {
  assert.equal(sourceIdFromFile(''), null);
  assert.equal(sourceIdFromFile(null), null);
  assert.equal(sourceIdFromFile('valami-egeszen-mas.json'), null);
});

// ===================================================================
// 3. rész — A VALÓDI HIBA: a számláló ürülő mappából dolgozott
// ===================================================================
console.log('\n🧪 a blokk-számláló a TARTÓS naplóból dolgozik');

t('REGRESSZIÓ: a napló blokkjai átbillentik a forrást, ÜRES rejected mappa mellett is', () => {
  // Élethű helyzet: a forrásból 5 cikk ment ki, 5 másikat a kapu megfogott,
  // a `content/rejected/` közben KIÜRÜLT (ezt csinálja a CEO/rework lánc).
  uritCikkek();
  for (let i = 1; i <= 5; i++) cikk('rosszforras', 'Ok_' + i, i);
  const log = naplo(
    ...[1, 2, 3, 4, 5].map(i => ({ alap: '2026-08-2' + i + 'T00-00-00-000Z_rosszforras_Kamu_' + i + '.json', napokkalEzelott: i }))
  );

  const per = collectArticleStats({ articlesDir: CIKKEK, truthLog: log, now: MOST });
  const a = per['rosszforras'];
  assert.ok(a, 'a forrásnak meg kell jelennie a mérésben');
  assert.equal(a.truthBlocks, 5, 'mind az 5 naplózott blokk beszámít');
  assert.equal(a.totalAttempts, 10, '5 kiment + 5 blokkolt = 10 próbálkozás');
  // ⚠️ 2026-09-08-tól a SZÁMLÁLÁS ugyanaz, az ÍTÉLET más. Egyik blokkolt cikk
  // sem jött rendbe, de a türelmi időn belüliek nem terhelik a forrást, és a
  // kikapcsolás így sem automatikus.
  const j = judgeSource({ ...a, feedAgeDays: 1 });
  assert.equal(j.auto, false, '⚠️ ez az ág 2026-09-08 óta NEM kapcsol ki magától');
});

// ===================================================================
// 3/b. rész — „NEM JÖTT RENDBE" (2026-09-08): a blokk és a kudarc KÜLÖNBSÉGE
// ===================================================================
console.log('\n🧪 nem jött rendbe — a blokk önmagában nem kudarc');

t('🔑 a blokkolt, majd MEGJELENT cikk NEM számít kudarcnak', () => {
  // Ez az éles valóság: 25 blokkolt cikkből 25 megjelent. A `_blocked`
  // alapnév és a kiadott `ARTICLE_` alapnév UGYANAZ (ellenorzo/agent.js:571
  // csak az előtagot cseréli) — ezen a párosításon áll az egész mérés.
  uritCikkek();
  const alap = '2026-08-20T00-00-00-000Z_javuloforras_Kamu.json';
  writeFileSync(join(CIKKEK, 'ARTICLE_' + alap), JSON.stringify({
    _meta: { source_id: 'javuloforras', published_at: new Date(MOST - 9 * DAY).toISOString() }
  }), 'utf-8');
  const per = collectArticleStats({
    articlesDir: CIKKEK, truthLog: naplo({ alap, napokkalEzelott: 9 }), now: MOST });
  assert.equal(per['javuloforras'].truthBlocks, 1, 'a blokkot LÁTJUK');
  assert.equal(per['javuloforras'].truthUnfixed, 0, 'de rendbe jött — nem kudarc');
});

t('🔑 ami a türelmi idő után sincs kint, AZ a kudarc', () => {
  uritCikkek();
  const alap = '2026-08-20T00-00-00-000Z_elakadtforras_Kamu.json';
  const per = collectArticleStats({
    articlesDir: CIKKEK, truthLog: naplo({ alap, napokkalEzelott: 9 }), now: MOST });
  assert.equal(per['elakadtforras'].truthUnfixed, 1, '9 napja blokkolva, ma sincs kint');
});

t('🔑 a FRISSEN blokkolt cikk nem kudarc — még javítás alatt állhat', () => {
  // Mérve: a javítás mediánban 0,0 óra, maximum 9,8 óra alatt lezajlik. A
  // türelmi idő ennek ötszöröse. Türelem nélkül a rendszer a SAJÁT, normális
  // javítási körét minősítené kudarcnak — és épp a legfrissebb, legaktívabb
  // forrásokat büntetné.
  uritCikkek();
  const alap = '2026-08-30T00-00-00-000Z_frissforras_Kamu.json';
  const orakkal = o => ({ [napja(0)]: [{ at: new Date(MOST - o * 3600000).toISOString(), file: 'WRITER_' + alap, action: 'block', reasons: ['teszt'] }] });
  assert.equal(collectArticleStats({ articlesDir: CIKKEK, truthLog: orakkal(UNFIXED_GRACE_HOURS - 1), now: MOST })['frissforras'].truthUnfixed,
    0, 'a türelmi időn BELÜL még nem kudarc');
  assert.equal(collectArticleStats({ articlesDir: CIKKEK, truthLog: orakkal(UNFIXED_GRACE_HOURS + 1), now: MOST })['frissforras'].truthUnfixed,
    1, 'a türelmi idő UTÁN már az');
});

t('🔌 a collectArticleStats MINDIG kitölti a truthUnfixed mezőt', () => {
  // A `judgeSource` `?? 0`-val védekezik a hiányzó mező ellen. Ez a teszt azt
  // őrzi, hogy erre a védelemre soha ne legyen szükség: ha a mező kiesne a
  // gyűjtésből, az ítélet NÉMÁN mindenkit tisztának látna.
  uritCikkek();
  cikk('barmiforras', 'Ok', 1);
  const per = collectArticleStats({
    articlesDir: CIKKEK,
    truthLog: naplo({ alap: '2026-08-20T00-00-00-000Z_barmiforras_K.json', napokkalEzelott: 9 }),
    now: MOST });
  for (const [id, a] of Object.entries(per)) {
    assert.equal(typeof a.truthUnfixed, 'number', id + ': a truthUnfixed nem szám — az ítélet elnémulna');
  }
});

t('ABLAK: az ablakon KÍVÜLI blokk nem számít bele (nem élettartam-összeg)', () => {
  uritCikkek();
  for (let i = 1; i <= 5; i++) cikk('regiforras', 'Ok_' + i, i);
  const log = naplo(
    // ugyanaz az 5 blokk, csak RÉGEN — az ablakon kívül
    ...[1, 2, 3, 4, 5].map(i => ({ alap: '2026-01-0' + i + 'T00-00-00-000Z_regiforras_Kamu_' + i + '.json', napokkalEzelott: TRUTH_WINDOW_DAYS + i }))
  );
  const per = collectArticleStats({ articlesDir: CIKKEK, truthLog: log, now: MOST });
  const a = per['regiforras'];
  assert.equal(a.truthBlocks, 0, 'a régi blokk már nem terheli a forrást');
  assert.equal(judgeSource({ ...a, feedAgeDays: 1 }).verdict, 'ok');
});

t('ABLAK-HATÁR: a pont az ablak szélén lévő nap MÉG beleszámít', () => {
  uritCikkek();
  const log = naplo({ alap: '2026-08-16T00-00-00-000Z_hatarforras_Kamu.json', napokkalEzelott: TRUTH_WINDOW_DAYS });
  const per = collectArticleStats({ articlesDir: CIKKEK, truthLog: log, now: MOST });
  assert.equal(per['hatarforras'] && per['hatarforras'].truthBlocks, 1);
});

t('DEDUP: ugyanaz a cikk kétszer blokkolva EGY hibának számít', () => {
  // Élesben megtörtént: az openai-blog 7 naplósora 6 KÜLÖNBÖZŐ cikk volt —
  // egy cikket a rework után a kapu másodszor is megfogott. Ha ezt kétszer
  // számolnánk, a rework MAGA rontaná a forrás bizonyítványát.
  uritCikkek();
  for (let i = 1; i <= 3; i++) cikk('ismetlo', 'Ok_' + i, i);
  const alap = '2026-08-25T00-00-00-000Z_ismetlo_Ugyanaz.json';
  const log = naplo(
    { alap, napokkalEzelott: 5 },
    { alap, napokkalEzelott: 3 },
    { alap, napokkalEzelott: 2 }
  );
  const per = collectArticleStats({ articlesDir: CIKKEK, truthLog: log, now: MOST });
  assert.equal(per['ismetlo'].truthBlocks, 1, '3 naplósor, de EGY cikk');
  assert.equal(per['ismetlo'].totalAttempts, 4, '3 kiment + 1 blokkolt');
});

t('DEDUP: a blokkolt, majd átírás után KIMENT cikk EGY próbálkozás', () => {
  // Élesben az ablakban MINDEN blokkolt cikk később kiment (14/14). Ha a
  // blokkot és a publikálást külön számolnánk, a nevező felfújódna, és a
  // szabály megint elnémulna.
  uritCikkek();
  const alap = cikk('atirt', 'Kamu_majd_jo', 3);   // ARTICLE_<alap> a lemezen
  const log = naplo({ alap, napokkalEzelott: 4 });
  const per = collectArticleStats({ articlesDir: CIKKEK, truthLog: log, now: MOST });
  assert.equal(per['atirt'].truthBlocks, 1);
  assert.equal(per['atirt'].totalAttempts, 1, 'ugyanaz a cikk — EGY próbálkozás, nem kettő');
});

t('HOLD nem blokk: az elérhetetlen AI-bíró nem a forrás hibája', () => {
  uritCikkek();
  for (let i = 1; i <= 4; i++) cikk('holdforras', 'Ok_' + i, i);
  const log = naplo(
    ...[1, 2, 3, 4].map(i => ({ alap: '2026-08-2' + i + 'T00-00-00-000Z_holdforras_Var_' + i + '.json', napokkalEzelott: i, action: 'hold' }))
  );
  const per = collectArticleStats({ articlesDir: CIKKEK, truthLog: log, now: MOST });
  assert.equal(per['holdforras'].truthBlocks, 0, 'a hold = a mi AI-nk volt elérhetetlen');
  assert.equal(judgeSource({ ...per['holdforras'], feedAgeDays: 1 }).verdict, 'ok');
});

t('az ÚTMUTATÓ blokkjai nem terhelnek hírforrást', () => {
  uritCikkek();
  const log = naplo(
    { alap: 'GUIDE_ask-alexa-to-read-your-calendar.json', napokkalEzelott: 2 },
    { alap: 'GUIDE_track-your-monthly-bills.json', napokkalEzelott: 3 }
  );
  const per = collectArticleStats({ articlesDir: CIKKEK, truthLog: log, now: MOST });
  assert.equal(per['guide'], undefined, 'a "guide" nem hírforrás — ki kell maradnia');
});

t('hiányzó/olvashatatlan napló → 0 blokk, de NEM omlik össze', () => {
  uritCikkek();
  for (let i = 1; i <= 4; i++) cikk('naplotlan', 'Ok_' + i, i);
  const per = collectArticleStats({ articlesDir: CIKKEK, truthLog: null, now: MOST });
  assert.equal(per['naplotlan'].truthBlocks, 0);
  assert.equal(per['naplotlan'].published30d, 4);
});

t('a 30 napos TERMÉS mérője változatlan (a blokk-ablak ettől külön van)', () => {
  uritCikkek();
  cikk('termo', 'Uj', 3);
  cikk('termo', 'Regi', 45);         // 30 napon kívül
  const per = collectArticleStats({ articlesDir: CIKKEK, truthLog: {}, now: MOST });
  assert.equal(per['termo'].published30d, 1, 'csak a 30 napon belüli termés');
  assert.equal(per['termo'].lastArticle, napja(3));
});

// ===================================================================
// 4. rész — VALÓDI ADAT (csak olvasás)
//   A kézzel gyártott minta az ALAKOT ellenőrzi. Ez a szakasz azt nézi,
//   hogy a mérő az ÉLES naplón is dolgozik — és KIÍRJA a lefedettséget
//   (a magyar helyesírás-őrszem leckéje: a „0 hiba" csak akkor hír, ha
//   tudjuk, mennyit nézett meg).
// ===================================================================
console.log('\n🧪 VALÓDI adaton (memory/truth-gate-log.json, csak olvasás)');

const elesNaplo = JSON.parse(readFileSync(join(ROOT, 'memory', 'truth-gate-log.json'), 'utf-8'));
const elesNapok = Object.keys(elesNaplo).sort();

t('az éles napló olvasható és nap-kulcsos', () => {
  assert.ok(elesNapok.length > 0, 'üres napló → a mérőnek nincs mit mérnie');
  for (const nap of elesNapok) {
    assert.match(nap, /^\d{4}-\d{2}-\d{2}$/, 'nap-kulcs');
    assert.ok(Array.isArray(elesNaplo[nap]), 'a nap értéke tömb');
    for (const e of elesNaplo[nap]) assert.ok(typeof e.file === 'string' && e.file, 'minden bejegyzésnek van `file` mezője');
  }
  console.log('     ↳ napló: ' + elesNapok.length + ' nap (' + elesNapok[0] + ' … ' + elesNapok[elesNapok.length - 1] + ')');
});

t('MINDEN éles blokk-bejegyzés forrásra bomlik (nincs néma kiesés)', () => {
  const nevtelen = [];
  let blokk = 0;
  for (const nap of elesNapok) for (const e of elesNaplo[nap]) {
    if (e.action !== 'block') continue;
    blokk++;
    if (!sourceIdFromFile(e.file)) nevtelen.push(e.file);
  }
  console.log('     ↳ ' + blokk + ' blokk a teljes naplóban, felismerhetetlen név: ' + nevtelen.length);
  assert.deepEqual(nevtelen, [], 'ha egy fájlnév nem bomlik szét, a blokk NÉMÁN elveszne');
});

t('az éles mérés lefut, és minden szám értelmes', () => {
  const per = collectArticleStats();                     // valódi mappa + valódi napló
  for (const [id, a] of Object.entries(per)) {
    assert.ok(a.truthBlocks <= a.totalAttempts, id + ': blokk (' + a.truthBlocks + ') nem lehet több a próbálkozásnál (' + a.totalAttempts + ')');
    // ⚠️ A `published30d` 30 NAPOS, a `totalAttempts` 14 napos — a termő forrásnál
    // a 30 napos szám NAGYOBB, és ez helyes. (Az első teszt-változatom épp ezen
    // bukott el: rossz mércét szabtam, nem a kód volt hibás.) Ami viszont
    // MINDIG igaz: az ablakban próbálkozó cikkek a 30 napos termés RÉSZHALMAZA,
    // plusz a blokkoltak — tehát ennél több próbálkozás nem lehet.
    assert.ok(a.totalAttempts <= a.published30d + a.truthBlocks,
      id + ': a 14 napos próbálkozás (' + a.totalAttempts + ') nem lehet több, mint a 30 napos termés + blokk (' + (a.published30d + a.truthBlocks) + ')');
  }
  const sorok = Object.entries(per)
    .filter(([, a]) => a.truthBlocks > 0)
    .map(([id, a]) => ({ id, ...a, arany: a.totalAttempts ? a.truthBlocks / a.totalAttempts : 0 }))
    .sort((x, y) => y.arany - x.arany);
  console.log('     ↳ ' + Object.keys(per).length + ' forrás mérve, ' + sorok.length + ' forrásnak van blokkja az ablakban:');
  for (const s of sorok) {
    const jel = (s.totalAttempts >= MIN_SAMPLE && (s.truthUnfixed / s.totalAttempts) >= BAD_RATIO) ? '  ⛔ ÁTLÉPI A KÜSZÖBÖT' : '';
    console.log('        ' + s.id.padEnd(20) + ' blokk ' + s.truthBlocks + '/' + s.totalAttempts
      + ' = ' + s.arany.toFixed(2) + ' · nem jött rendbe: ' + s.truthUnfixed + jel);
  }
});

// ===================================================================
// 🔑 A LELET MAGA, ÉLES ADATON (2026-09-08)
// ===================================================================
t('🔑 ÉLESBEN: a blokkolt cikkek TÚLNYOMÓ TÖBBSÉGE rendbe jön', () => {
  // Ez a teszt a döntés ALAPJÁT méri újra minden futáskor. 2026-09-08-án:
  // 25 blokkolt cikkből 25 megjelent (100%), nem jött rendbe: 0.
  // Ha ez az arány valaha megfordul, AZ önmagában hír — és akkor a mostani
  // enyhítés újragondolandó. Küszöb: a blokkoltak több mint fele jöjjön rendbe.
  const per = collectArticleStats();
  const blokk = Object.values(per).reduce((s, a) => s + a.truthBlocks, 0);
  const elakadt = Object.values(per).reduce((s, a) => s + a.truthUnfixed, 0);
  if (blokk === 0) { console.log('     ⚠️ nincs blokk az ablakban — a lépést kihagyom'); return; }
  const rendbeJott = blokk - elakadt;
  console.log('     ↳ ' + blokk + ' blokkolt cikk, ebből ' + rendbeJott + ' megjelent ('
    + (100 * rendbeJott / blokk).toFixed(0) + '%), elakadt: ' + elakadt);
  assert.ok(elakadt <= blokk, 'elakadt (' + elakadt + ') nem lehet több a blokknál (' + blokk + ')');
  assert.ok(rendbeJott / blokk > 0.5,
    'MEGFORDULT A KÉP: a blokkolt cikkek többsége már NEM jön rendbe (' + rendbeJott + '/' + blokk
    + '). A 2026-09-08-i enyhítés ezen a mérésen állt — nézd meg újra.');
});

t('🚨 ÉLESBEN: egyetlen forrás sincs automatikus kikapcsolás előtt', () => {
  // A javítás LÉNYEGE. A régi szabállyal az `nvidia-blog` 1/3-on állt, azaz
  // EGYETLEN további blokkra a kikapcsolástól — havi 7 cikket adó hivatalos
  // forrás. Ez a lépés minden futáskor újrakérdezi az éles adaton.
  const per = collectArticleStats();
  const veszelyben = [];
  for (const [id, a] of Object.entries(per)) {
    const j = judgeSource({ ...a, feedAgeDays: 1 });
    if (j.auto) veszelyben.push(id + ' (' + j.reason + ')');
  }
  assert.deepEqual(veszelyben, [],
    'a kapu-blokkok miatt forrás kapcsolódna ki magától: ' + veszelyben.join(' · '));
});

// ===================================================================
// 🔌 BEKÖTÉS-ŐR — a lelet ELJUT a userhez (2026-09-08)
// ===================================================================
// Az éles adaton ma egyetlen forrás sem éri el a küszöböt — helyesen. Ezért
// egy elvágott huzalozás TELJESEN NÉMÁN maradna: a `truthUnfixed` kimaradhatna
// a `judgeSource` bemenetéből, vagy az `unreliable` a javaslatok közül, és
// minden teszt zöld lenne. Ezek a lépések élethű bemenettel kényszerítik ki.
console.log('\n🧪 bekötés — a lelet eljut a userhez');

const halottFeed = async () => ({ ok: true, text: async () => '<rss><channel></channel></rss>' });

await (async () => {
  const eredmeny = await runReportCard({
    dryRun: true,
    fetchFn: halottFeed,
    // A `picsart` VALÓDI forrás-azonosító a rss-feeds.json-ban — kitalált id-vel
    // a lépés némán semmit sem mérne.
    stats: { picsart: { published30d: 30, truthBlocks: 9, totalAttempts: 10, truthUnfixed: 9, lastArticle: '2026-09-01' } }
  });

  t('🔌 a truthUnfixed ELJUT a judgeSource-ig (különben soha nincs ítélet)', () => {
    const c = eredmeny.card['picsart'];
    assert.ok(c, 'a picsart nincs a bizonyítványban');
    assert.equal(c.truthUnfixed, 9, 'a mező nem jutott át a bizonyítványba');
    assert.equal(c.verdict, 'unreliable', '9/10 elakadt cikkre nem született ítélet — elvágott huzalozás');
  });

  t('🔌 az ítélet a JAVASLATOK közé kerül (nem a kikapcsoltak közé, és nem sehova)', () => {
    assert.ok(eredmeny.proposals.some(p => p.id === 'picsart'),
      '⚠️ az ítélet SEHOVA nem jutott el — a napi riport néma maradna');
    assert.ok(!eredmeny.autoDisabled.some(d => d.id === 'picsart'),
      '⚠️ visszatért az automatikus kikapcsolás ezen az ágon');
  });

  t('🔌 a riport-sor tényleg kimondja (a lánc VÉGE, nem a közepe)', () => {
    const sor = reportLine(eredmeny);
    assert.ok(/fennakadt a hitelesség-kapun/.test(sor), 'a lelet nem ér el a riport-sorig: ' + sor);
  });

  t('🔌 a NAPI RIPORT útján is kimegy (reportLineFromFile — ez hívja a user felé)', () => {
    // ⚠️ EZ A VALÓDI ÚT. A `core/daily-report.js:844` NEM a runReportCard
    // kimenetét használja, hanem a KIÍRT bizonyítványt olvassa vissza ezzel a
    // függvénnyel. Ha itt esne ki az `unreliable` a szűrésből, a lelet a
    // fájlban ott ülne, a Telegram-üzenetben pedig soha nem jelenne meg —
    // pontosan az i18n-őrszem hibája.
    const sor = reportLineFromFile(eredmeny.card);
    assert.ok(sor && /fennakadt a hitelesség-kapun/.test(sor),
      '⚠️ a napi riport ÚTJÁN a lelet elnémul: ' + JSON.stringify(sor));
  });
})();

t('A JAVÍTÁS TÉNYLEG SZÁMOL: az éles naplóból >0 blokk jut el a mérőig', () => {
  // Ez a lépés bukik, ha a mérő újra egy ürülő mappát néz. A régi kód
  // ÖSSZESEN 1 blokkot talált 57 forrásra — a napló 29-et rögzít.
  const naploBlokk = elesNapok.reduce((s, nap) => s + elesNaplo[nap].filter(e => e.action === 'block').length, 0);
  const per = collectArticleStats();
  const ossz = Object.values(per).reduce((s, a) => s + a.truthBlocks, 0);
  console.log('     ↳ a mérőnél ' + ossz + ' blokk (a napló teljes állománya: ' + naploBlokk + ')');
  if (naploBlokk === 0) { console.log('     ⚠️ az éles napló most üres — ezt a lépést kihagyom'); return; }
  assert.ok(ossz > 0, 'a napló rögzít blokkokat, de a mérőhöz egy sem jut el');
});

console.log('\n✅ source-report-card.test: ' + pass + ' eset átment');

} finally {
  rmSync(MUNKA, { recursive: true, force: true });
  // ⚠️ Épség-ellenőrzés: ez a teszt SEMMILYEN éles fájlt nem írhat.
  ELES_FAJLOK.forEach((p, i) => {
    const most = existsSync(p) ? readFileSync(p, 'utf-8') : null;
    if (most !== LENYOMAT[i]) {
      console.error('❌ AZ ÉLES FÁJL MEGVÁLTOZOTT: ' + p);
      process.exitCode = 1;
    }
  });
}
