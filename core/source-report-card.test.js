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
  judgeSource, reportLine, collectArticleStats, sourceIdFromFile,
  DEAD_FEED_DAYS, MIN_SAMPLE, BAD_RATIO, TRUTH_WINDOW_DAYS
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

t('valótlant közöl → automatikus kikapcsolás (elég minta felett)', () => {
  const j = judgeSource({ feedAgeDays: 1, published30d: 2, truthBlocks: 3, totalAttempts: 6 });
  assert.equal(j.verdict, 'unreliable');
  assert.equal(j.auto, true);
  assert.ok(/hitelesség-kapu/i.test(j.reason));
});

t('kevés minta → NEM minősítünk (egy-két rossz cikk nem tendencia)', () => {
  const j = judgeSource({ feedAgeDays: 1, published30d: 1, truthBlocks: 2, totalAttempts: MIN_SAMPLE - 1 });
  assert.notEqual(j.verdict, 'unreliable', 'kis mintán nem bélyegzünk meg forrást');
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
  const j = judgeSource({ feedAgeDays: 0, published30d: 20, truthBlocks: 1, totalAttempts: 20 });
  assert.equal(j.verdict, 'ok', '1/20 blokk (' + BAD_RATIO + ' küszöb alatt) még rendben');
});

t('már kikapcsolt forrást nem bántunk újra', () => {
  const j = judgeSource({ feedAgeDays: null, published30d: 0, truthBlocks: 0, totalAttempts: 0, alreadyDisabled: true });
  assert.equal(j.verdict, 'disabled');
  assert.equal(j.auto, false);
});

t('a küszöbök NEM változtak (a javítás csak a BEMENŐ számot javítja)', () => {
  assert.equal(MIN_SAMPLE, 4);
  assert.equal(BAD_RATIO, 0.5);
  assert.equal(DEAD_FEED_DAYS, 365);
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
  const j = judgeSource({ ...a, feedAgeDays: 1 });
  assert.equal(j.verdict, 'unreliable');
  assert.equal(j.auto, true, 'ez a szabály eddig HALOTT volt');
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
    const jel = (s.totalAttempts >= MIN_SAMPLE && s.arany >= BAD_RATIO) ? '  ⛔ ÁTLÉPI A KÜSZÖBÖT' : '';
    console.log('        ' + s.id.padEnd(20) + ' ' + s.truthBlocks + '/' + s.totalAttempts + ' = ' + s.arany.toFixed(2) + jel);
  }
});

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
