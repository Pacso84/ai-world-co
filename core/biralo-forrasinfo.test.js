// ===================================================================
// TESZT — az ellenőrző AI-bírálatának forrás-blokkja (core/biralo-forrasinfo.js)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-11-06): a „Gemini Omni 1.2 Flash now in Picsart” hírt az
// ellenőrző AI-bírálata azzal utasította el, hogy a modellnév „kitalált” —
// pedig a hivatalos Picsart-forrás címében szó szerint ez állt, és a Google
// is bejelentette (blog.google, DeepMind modellkártya). Ugyanez a minta, mint
// 11-05-én a Gemini Notebooknál. Ok: a hiteles névlistát és a „forrás címében
// szereplő név valódi” szabályt eddig CSAK a hitelesség-kapu (truth-gate.js)
// kapta meg, az ellenőrző nem — az a saját, elavult tudásához mért.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { biraloForrasInfo, tevesNevKifogas, nevJavitoMegjegyzes, atdolgozoMeta, utmutatoNevForras } from './biralo-forrasinfo.js';
import { knownRealNames } from './truth-gate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 ellenőrző forrás-blokk (hiteles nevek)\n');

const picsart = {
  original_title: 'Gemini Omni 1.2 Flash now in Picsart: a creator’s guide',
  _meta: { source_name: 'Picsart Blog', source_id: 'picsart', source_link: 'https://picsart.com/blog/gemini-omni-1-2-flash-launch/' }
};

t('a régi mezők (forrás, URL, eredeti cím) megmaradnak', () => {
  const s = biraloForrasInfo(picsart, { known: ['Gemini'], today: '2026-11-06' });
  assert.match(s, /Source: Picsart Blog \(picsart\)/);
  assert.match(s, /URL: https:\/\/picsart\.com\/blog\/gemini-omni-1-2-flash-launch\//);
  assert.match(s, /Original title: Gemini Omni 1\.2 Flash now in Picsart/);
});

t('megkapja a mai dátumot és a „forrás címében szereplő név VALÓDI” szabályt', () => {
  const s = biraloForrasInfo(picsart, { known: [], today: '2026-11-06' });
  assert.match(s, /Today's date: 2026-11-06/);
  assert.match(s, /NEWER than your training/);
  assert.match(s, /original title or the URL are REAL/);
});

t('megkapja a hiteles névlistát', () => {
  const s = biraloForrasInfo(picsart, { known: ['Gemini', 'Gemini Omni'], today: '2026-11-06' });
  assert.match(s, /VERIFIED-REAL NAMES[^\n]*\n.*Gemini Omni/);
});

t('alapból a website/tool-links.json listáját adja, és abban ott a Gemini Omni', () => {
  const s = biraloForrasInfo(picsart);
  assert.ok(knownRealNames().includes('Gemini Omni'), 'Gemini Omni a tool-links.json-ban');
  assert.match(s, /Gemini Omni/);
});

t('forrás-URL nélkül nem állít „frissebb forrást”, de a névlista marad', () => {
  const s = biraloForrasInfo({ original_title: 'x', _meta: {} }, { known: ['Claude'], today: '2026-11-06' });
  assert.doesNotMatch(s, /NEWER than your training/);
  assert.match(s, /VERIFIED-REAL NAMES[^\n]*\nClaude/);
});

t('az ellenőrző agent ténylegesen ezt használja (nem a régi, névlista nélküli blokkot)', () => {
  const src = readFileSync(join(ROOT, 'agents', 'ellenorzo', 'agent.js'), 'utf-8');
  assert.match(src, /import \{ biraloForrasInfo[^}]*\} from '\.\.\/\.\.\/core\/biralo-forrasinfo\.js'/);
  assert.match(src, /const sourceInfo = biraloForrasInfo\(writerData\)/);
});

t('a Gemini Omni hivatalos linkje a Google saját oldala', () => {
  const tl = JSON.parse(readFileSync(join(ROOT, 'website', 'tool-links.json'), 'utf-8'));
  assert.equal(tl.tools['Gemini Omni'], 'https://gemini.google/overview/video-generation/');
});

// ---------------------------------------------------------------
// KÓD-BIZTOSÍTÉK (user 11-06: „a hibák ne forduljanak többet elő”): az AI-utasítás
// nem garancia — ha a bírálat MÉGIS kitaláltnak mondja a forrásban álló nevet, a kód veszi ki.
// A mai VALÓDI bírálat szövege (content/rejected/REJECTED_2026-11-06T15-30-26-279Z_picsart_…):
// ---------------------------------------------------------------
const valodiBiralat = {
  overall_score: 6, clarity_score: 9, decision: 'FAIL',
  issues: [
    "Model name 'Gemini Omni 1.2 Flash' cannot be independently verified — Google AI documentation shows no product with this exact name; this appears to be an invented/hallucinated model name",
    "Attribution to 'Google's announcement' lacks a verifiable source URL in the article, making claims about the model unverifiable",
    'Publishing with an unverified model name risks misleading readers about which product actually exists in Picsart AI Playground'
  ],
  verdict: "The guide is well-structured and the writing is clear and accessible, but it fails factual accuracy because the model name 'Gemini Omni 1.2 Flash' cannot be verified against any known Google AI product listing."
};
const pForras = { originalTitle: picsart.original_title, sourceUrl: picsart._meta.source_link, sourceText: '', known: ['Gemini', 'Gemini Omni'] };

t('a mai Picsart-bírálat: a „kitalált név” kifogás TÉVES, a név a forrás címében áll', () => {
  const r = tevesNevKifogas(valodiBiralat, pForras);
  assert.deepEqual(r.nevek, ['Gemini Omni 1.2 Flash']);
  assert.equal(r.teves.length, 2, 'a név-kifogás + a következménye („unverified model name”)');
  assert.equal(r.maradt.length, 1, 'a forrás-URL-hiány kifogás marad (azt a bíró dönti el újra)');
  assert.match(r.maradt[0], /Attribution/);
  assert.equal(r.verdictTeves, true);
});

t('a teljes forrásszövegben szereplő név is igazolt (nem csak a cím)', () => {
  const b = { decision: 'FAIL', issues: ["'Veo 4 Fast' appears to be an invented model"], verdict: '' };
  const r = tevesNevKifogas(b, { originalTitle: 'Big video update', sourceUrl: 'https://blog.google/x/', sourceText: 'Today we launch Veo 4 Fast in the Gemini app.', known: [] });
  assert.deepEqual(r.nevek, ['Veo 4 Fast']);
});

t('a hiteles listán PONTOSAN szereplő név forrás nélkül (útmutató) is igazolt', () => {
  const b = { decision: 'FAIL', issues: ["'Gemini Notebook' is not a real Google product (it is NotebookLM)"], verdict: '' };
  const r = tevesNevKifogas(b, { originalTitle: 'Study with Gemini Notebook', sourceUrl: '', sourceText: '', known: ['Gemini Notebook'] });
  assert.equal(r.teves.length, 1);
});

t('ELLENPRÓBA: útmutatónál (nincs forrás-URL) a saját témacímünk NEM igazol nevet', () => {
  const b = { decision: 'FAIL', issues: ["'Gemini Omni Studio' appears to be an invented product"], verdict: '' };
  const r = tevesNevKifogas(b, { originalTitle: 'Getting started with Gemini Omni Studio', sourceUrl: '', sourceText: '', known: ['Gemini Omni'] });
  assert.equal(r.teves.length, 0);
});

t('ELLENPRÓBA: valóban kitalált név (se forrásban, se listán) → a kifogás MARAD', () => {
  const b = { decision: 'FAIL', issues: ["'ChatGPT Presence' is an invented feature name"], verdict: '' };
  const r = tevesNevKifogas(b, { originalTitle: 'ChatGPT adds voice', sourceUrl: 'https://openai.com/index/x/', sourceText: 'ChatGPT now has voice.', known: ['ChatGPT'] });
  assert.equal(r.teves.length, 0);
  assert.equal(r.maradt.length, 1);
});

t('ELLENPRÓBA: a lista-névvel csak KEZDŐDŐ név nem igazolt („Gemini Omni Ultra” ≠ „Gemini Omni”)', () => {
  const b = { decision: 'FAIL', issues: ["'Gemini Omni Ultra' does not exist"], verdict: '' };
  const r = tevesNevKifogas(b, { originalTitle: 'x', sourceUrl: '', sourceText: '', known: ['Gemini Omni'] });
  assert.equal(r.teves.length, 0);
});

t('ELLENPRÓBA: kitalált GOMB/MENÜ kifogás akkor is marad, ha a szó a címben van', () => {
  const b = { decision: 'FAIL', issues: ["The 'Summarize' button in Safari appears to be invented"], verdict: '' };
  const r = tevesNevKifogas(b, { originalTitle: 'Summarize pages in Safari', sourceUrl: 'https://apple.com/x', sourceText: '', known: [] });
  assert.equal(r.teves.length, 0);
});

t('ELLENPRÓBA: ÁRRÓL szóló kifogás marad, ha a név valódi is', () => {
  const b = { decision: 'FAIL', issues: ["'Gemini Omni 1.2 Flash' is not verified to cost $0.07 per second"], verdict: '' };
  const r = tevesNevKifogas(b, pForras);
  assert.equal(r.teves.length, 0);
});

t('ELLENPRÓBA: ha nincs igazolt név-kifogás, a név nélküli „unverified” kifogás sem esik ki', () => {
  const b = { decision: 'FAIL', issues: ['Several unverified claims about release dates'], verdict: '' };
  const r = tevesNevKifogas(b, pForras);
  assert.equal(r.teves.length, 0);
  assert.equal(r.maradt.length, 1);
});

t('a javító megjegyzés megnevezi a valódi neveket és tiltja a kivételüket', () => {
  const m = nevJavitoMegjegyzes(['Gemini Omni 1.2 Flash']);
  assert.match(m, /Gemini Omni 1\.2 Flash/);
  assert.match(m, /REAL/);
  assert.match(m, /Do NOT/);
});

t('az ellenőrző agent bekötötte a kód-biztosítékot (újrabírálat + kifogás-szűrés + napló)', () => {
  const src = readFileSync(join(ROOT, 'agents', 'ellenorzo', 'agent.js'), 'utf-8');
  assert.match(src, /tevesNevKifogas\(/);
  assert.match(src, /nevJavitoMegjegyzes\(/);
  assert.match(src, /stats\.nev_felulbiralva/);
});

const { nevVedesLine } = await import('./report-lines.js');
t('Telegram-sor: csak akkor szól, ha volt felülbírálás az elmúlt 24 órában', () => {
  const most = Date.parse('2026-11-07T12:00:00Z');
  assert.equal(nevVedesLine([{ started_at: '2026-11-07T04:00:00Z', total: 3 }], most), '');
  assert.equal(nevVedesLine([{ started_at: '2026-11-05T04:00:00Z', nev_felulbiralva: [{ nevek: ['X'], cim: 'régi', dontes: 'PASS' }] }], most), '');
  const s = nevVedesLine([{ started_at: '2026-11-07T04:00:00Z', nev_felulbiralva: [{ nevek: ['Gemini Omni 1.2 Flash'], cim: picsart.original_title, dontes: 'PASS' }] }], most);
  assert.match(s, /🛟 Ellenőrző: 1× téves „kitalált név”/);
  assert.match(s, /Gemini Omni 1\.2 Flash/);
  assert.match(s, /✅ a bírálaton átment/);
  assert.match(s, /tool-links\.json/);
});

t('a napi riport beolvassa a reviewer-naplókat és kiírja a sort', () => {
  const src = readFileSync(join(ROOT, 'core', 'daily-report.js'), 'utf-8');
  assert.match(src, /nevVedesLine\(naplok/);
  assert.match(src, /\^reviewer_/);
});

// A fájlnév-szeletelés pontossága: reviewer_2026-11-06T… → a 9–19. karakter a dátum.
t('a riport fájlnév-szeletelése a dátumot adja', () => {
  assert.equal('reviewer_2026-11-06T15-37-30-957Z.json'.slice(9, 19), '2026-11-06');
});

// ---------------------------------------------------------------
// ÁTDOLGOZÓ ELŐTTI SZŰRÉS (2026-11-06): a MÁR ELMENTETT téves kifogás se jusson az átdolgozóhoz.
// A valódi eset: REJECTED_2026-11-06T15-30-26-279Z_picsart_Gemini_Omni… (15:37, a javítás előtt) → az átdolgozó
// 21:11-kor kivette a cikkből a „Gemini Omni” nevet. Az alábbi _meta betűre az akkor elmentett.
// ---------------------------------------------------------------
const VERDICT_1106 = "The guide is well-structured and the writing is clear and accessible, but it fails factual accuracy because the model name 'Gemini Omni 1.2 Flash' cannot be verified against any known Google AI product listing. This violates the core trust principle — readers must be able to verify claims about products they are being told to use. The Writer must either confirm the exact official product name from an authoritative source before publication or remove references to this specific model.";
const meta1106 = {
  source_link: 'https://picsart.com/blog/gemini-omni-1-2-flash-launch/',
  ai_review: {
    overall_score: 6, decision: 'FAIL',
    issues: [
      "Model name 'Gemini Omni 1.2 Flash' cannot be independently verified — Google AI documentation shows no product with this exact name; this appears to be an invented/hallucinated model name",
      "Attribution to 'Google's announcement' lacks a verifiable source URL in the article, making claims about the model unverifiable",
      'Publishing with an unverified model name risks misleading readers about which product actually exists in Picsart AI Playground'
    ],
    verdict: VERDICT_1106
  },
  reason: VERDICT_1106,
  rework_attempts: 1
};

t('🔑 átdolgozó: a 11-06-i elmentett téves név-kifogás + verdict + reason KIESIK, a valódi kifogás marad', () => {
  const r = atdolgozoMeta(meta1106, { originalTitle: picsart.original_title });
  assert.deepEqual(r.nevek, ['Gemini Omni 1.2 Flash']);
  assert.equal(r.meta.ai_review.issues.length, 1);
  assert.match(r.meta.ai_review.issues[0], /Attribution to 'Google's announcement'/);
  assert.equal(r.meta.ai_review.verdict, undefined);
  assert.equal(r.meta.reason, undefined);
  assert.equal(r.csakTevesNev, false, 'maradt valódi kifogás → átírás kell');
  assert.ok(!JSON.stringify(r.meta.ai_review).includes('Gemini Omni'), 'a név-kifogás valahol bennmaradt');
  assert.ok(r.meta.nev_kifogas_kivetve?.kifogasok?.length >= 2, 'nyom a _meta-ban');
  // az eredeti _meta NEM változik (a hívó dönt)
  assert.equal(meta1106.ai_review.issues.length, 3);
});

t('átdolgozó: ha CSAK téves név-kifogás volt → csakTevesNev (változatlan újrabírálat, 0 költség)', () => {
  const m = { ...meta1106, ai_review: { ...meta1106.ai_review, issues: [meta1106.ai_review.issues[0], meta1106.ai_review.issues[2]] } };
  const r = atdolgozoMeta(m, { originalTitle: picsart.original_title });
  assert.equal(r.csakTevesNev, true);
  assert.deepEqual(r.meta.ai_review.issues, []);
});

t('ellenpróba: a forrásban NEM szereplő név kifogása marad (valódi kitalálás)', () => {
  const m = { source_link: 'https://picsart.com/blog/gemini-omni-1-2-flash-launch/', ai_review: { decision: 'FAIL', issues: ["Model name 'Gemini Omni Ultra 9' cannot be verified — appears invented"], verdict: 'Fails: invented model name.' }, reason: 'Fails: invented model name.' };
  const r = atdolgozoMeta(m, { originalTitle: picsart.original_title });
  assert.equal(r.kivett.length, 0);
  assert.equal(r.meta, m, 'érintetlenül kell visszaadni');
});

t('ellenpróba: árról / felületről szóló kifogás marad, bírálat nélküli _meta nem dől el', () => {
  const m = { source_link: 'https://picsart.com/blog/gemini-omni-1-2-flash-launch/', ai_review: { decision: 'FAIL', issues: ["The 'Gemini Omni 1.2 Flash' button in the toolbar cannot be verified"] } };
  assert.equal(atdolgozoMeta(m, { originalTitle: picsart.original_title }).kivett.length, 0);
  assert.equal(atdolgozoMeta({}, {}).kivett.length, 0);
  assert.equal(atdolgozoMeta(undefined, {}).kivett.length, 0);
});

t('mindkét átdolgozó (iro + guide) a feedback ELŐTT szűr, és a csak-téves esetben nem ír át', () => {
  for (const f of ['agents/iro/agent.js', 'agents/guide/agent.js']) {
    const src = readFileSync(join(ROOT, f), 'utf-8');
    assert.match(src, /import \{ atdolgozoMeta[^}]*\} from '\.\.\/\.\.\/core\/biralo-forrasinfo\.js'/, f);
    const i = src.indexOf('atdolgozoMeta(data._meta');
    const j = src.indexOf('isReviewerSideFailure(data._meta) || (nevSzuro.csakTevesNev');
    assert.ok(i > 0 && j > i, f + ': a szűrés nem az ESET A előtt van');
  }
});

// ---------------------------------------------------------------
// ÚTMUTATÓ: a forrás-hír és a súgó IGAZOLJA a nevet (2026-11-12, TÉNYKÖZPONT 0d).
// Valódi esetek: „Gemini 4 Carbon” (Gemini Models súgó + blog.google hír) és „Workspace Studio”
// (forrás-hír címe) — az útmutatónál a source_link üres volt → az ellenőrző „kitaláltnak” mondta.
// ---------------------------------------------------------------
const guideMeta = {
  type: 'guide', source_link: '',
  source_news: { file: 'X.json', title: 'Gemini 4 Carbon is now available' },
  official_sources: [{ url: 'https://support.google.com/gemini/answer/18648722', title: 'About Gemini models - Computer' }],
  sugo_alapu: true
};
const hirCarbon = { original_title: 'Gemini 4 Carbon is now available', _meta: { source_link: 'https://blog.google/products/gemini/gemini-4-carbon/' } };
const hirBetolt = f => (f === 'X.json' ? hirCarbon : null);
const carbonBiralat = { issues: [], verdict: "refers to 'Gemini 4 Carbon' which does not appear in the verified-real names list" };

t('útmutató: a forrás-hír és a súgó adja a forrás-URL-t, címet, szöveget', () => {
  const f = utmutatoNevForras(guideMeta, { hirBetolt, sugoSzovegek: ['Gemini 4 Carbon: Our strongest model…'] });
  assert.equal(f.sourceUrl, 'https://blog.google/products/gemini/gemini-4-carbon/');
  assert.match(f.originalTitle, /Gemini 4 Carbon is now available/);
  assert.match(f.originalTitle, /About Gemini models - Computer/);
  assert.match(f.sourceText, /Our strongest model/);
});

t('🔑 útmutató: a „Gemini 4 Carbon” kitalált-név kifogás TÉVES (11-12-i eset)', () => {
  const f = { ...utmutatoNevForras(guideMeta, { hirBetolt, sugoSzovegek: ['Gemini 4 Carbon: Our strongest model…'] }), known: [] };
  const r = tevesNevKifogas(carbonBiralat, f, { utmutato: true });
  assert.equal(r.verdictTeves, true);
  assert.ok(r.nevek.includes('Gemini 4 Carbon'));
});

t('🔑 útmutató: a „Workspace Studio” kifogás TÉVES (a forrás-hír címében áll)', () => {
  const hir = { original_title: 'Pause and schedule automated workflows with the new Workspace Studio', _meta: { source_link: 'https://workspace.google.com/blog/x/' } };
  const m = { ...guideMeta, source_news: { file: 'W.json', title: hir.original_title } };
  const f = { ...utmutatoNevForras(m, { hirBetolt: () => hir, sugoSzovegek: [] }), known: [] };
  const r = tevesNevKifogas({ issues: [], verdict: "the core product name 'Workspace Studio' cannot be independently verified" }, f);
  assert.equal(r.verdictTeves, true);
  assert.ok(r.nevek.includes('Workspace Studio'));
});

t('ELLENPRÓBA: a forrásban NEM szereplő név („Gemini 5 Ultra”) kifogása marad', () => {
  const f = { ...utmutatoNevForras(guideMeta, { hirBetolt, sugoSzovegek: ['Gemini 4 Carbon: Our strongest model…'] }), known: [] };
  const r = tevesNevKifogas({ issues: [], verdict: "refers to 'Gemini 5 Ultra' which does not appear in the verified-real names list" }, f, { utmutato: true });
  assert.equal(r.verdictTeves, false);
  assert.equal(r.nevek.length, 0);
});

t('hirBetolt null / dob → nem dob; a súgó URL-je a forrás, a súgószövegben álló név igazolódik', () => {
  for (const hb of [() => null, () => { throw new Error('nincs fájl'); }]) {
    const f = utmutatoNevForras(guideMeta, { hirBetolt: hb, sugoSzovegek: ['Gemini 4 Carbon: Our strongest model…'] });
    assert.equal(f.sourceUrl, 'https://support.google.com/gemini/answer/18648722');
    assert.match(f.originalTitle, /About Gemini models/);
    const r = tevesNevKifogas(carbonBiralat, { ...f, known: [] }, { utmutato: true });
    assert.equal(r.verdictTeves, true);
  }
});

t('útmutató: forrás-hír és súgó nélkül üres forrás (nem dob, nem igazol)', () => {
  const f = utmutatoNevForras({ type: 'guide' }, { hirBetolt: () => null });
  assert.deepEqual(f, { originalTitle: '', sourceUrl: '', sourceText: '' });
  assert.deepEqual(utmutatoNevForras(undefined), { originalTitle: '', sourceUrl: '', sourceText: '' });
});

t('alapértelmezett hirBetolt: hiányzó fájl / útvonal-trükk → null-kezelés, nem dob', () => {
  const m = { source_news: { file: '../../package.json', title: 'x' }, official_sources: [] };
  assert.doesNotThrow(() => utmutatoNevForras(m));
  assert.doesNotThrow(() => utmutatoNevForras({ source_news: 'NINCS_ILYEN.json' }));
});

t('🔑 átdolgozó: új sourceUrl + sourceText → a mentett „Gemini 4 Carbon” kifogás kiesik', () => {
  const rejected = {
    source_link: '',
    ai_review: { decision: 'FAIL', issues: [], verdict: "refers to 'Gemini 4 Carbon' which does not appear in the verified-real names list" },
    reason: "refers to 'Gemini 4 Carbon' which does not appear in the verified-real names list"
  };
  const nelkul = atdolgozoMeta(rejected, { originalTitle: 'x', known: [] });
  assert.equal(nelkul.kivett.length, 0, 'forrás-URL nélkül nem igazol');
  const r = atdolgozoMeta(rejected, { originalTitle: 'x', sourceUrl: 'https://support.google.com/gemini/answer/18648722', sourceText: 'Gemini 4 Carbon: Our strongest model', known: [], utmutato: true });
  assert.ok(r.kivett.length > 0);
  assert.ok(r.nevek.includes('Gemini 4 Carbon'));
});

t('az ellenőrző és az útmutató-író is az új forrás-összeállítást használja', () => {
  for (const f of ['agents/ellenorzo/agent.js', 'agents/guide/agent.js']) {
    const src = readFileSync(join(ROOT, f), 'utf-8');
    assert.match(src, /utmutatoNevForras/, f);
  }
});

// ---------------------------------------------------------------
// IDÉZŐJEL NÉLKÜLI NÉV — CSAK ÚTMUTATÓNÁL, CSAK KIFEJEZETT NÉV-KIFOGÁSNÁL (11-12; bírálat C1–C2, I3, I4).
// A VALÓDI Workspace Studio-bírálat (memory/quality-fix-log.json) szó szerint:
// ---------------------------------------------------------------
const VALODI_WS = 'Product name Workspace Studio cannot be independently verified as a real Google product - this is the core factual gate issue';
const wsForras = { originalTitle: 'Pause and schedule automated workflows with the new Workspace Studio', sourceUrl: 'https://workspace.google.com/blog/x/', sourceText: '', known: [] };
const UT = { utmutato: true };

t('🔑 idézőjel nélküli: a valódi „Product name Workspace Studio cannot be…” bírálat TÉVES (a név a forrás címében áll)', () => {
  const r = tevesNevKifogas({ issues: [], verdict: VALODI_WS }, wsForras, UT);
  assert.equal(r.verdictTeves, true);
  assert.deepEqual(r.nevek, ['Workspace Studio']);
  assert.equal(tevesNevKifogas({ issues: [VALODI_WS], verdict: '' }, wsForras, UT).teves.length, 1);
});

t('idézőjel nélküli: a forrásszövegben álló név is igazol (cím nélkül)', () => {
  const r = tevesNevKifogas({ issues: [], verdict: VALODI_WS }, { originalTitle: 'Big news', sourceUrl: 'https://workspace.google.com/blog/x/', sourceText: 'Meet Workspace Studio, a new Google tool.', known: [] }, UT);
  assert.equal(r.verdictTeves, true);
});

t('idézőjel nélküli: a „X is not a real product” alak is név-kifogás (B)', () => {
  const r = tevesNevKifogas({ issues: ['Workspace Studio is not a real Google product'], verdict: '' }, wsForras, UT);
  assert.equal(r.teves.length, 1);
  assert.deepEqual(r.nevek, ['Workspace Studio']);
});

t('ELLENPRÓBA idézőjel nélkül: „Gemini 5 Ultra” egy Gemini 4 Carbon forrással szemben NEM téves', () => {
  const f = { ...utmutatoNevForras(guideMeta, { hirBetolt, sugoSzovegek: ['Gemini 4 Carbon: Our strongest model…'] }), known: ['Google'] };
  const r = tevesNevKifogas({ issues: [], verdict: 'Product name Gemini 5 Ultra cannot be independently verified' }, f, UT);
  assert.equal(r.verdictTeves, false);
  assert.equal(r.nevek.length, 0);
});

t('ELLENPRÓBA idézőjel nélkül: igazolt ÉS nem igazolt név egy mondatban → NEM téves (A és B alak)', () => {
  for (const v of [
    'Product name Workspace Studio and Gemini 5 Ultra cannot be independently verified as real Google products',
    'Product name Workspace Studio, Gemini 5 Ultra cannot be independently verified',
    'Gemini 5 Ultra is not a real product, Product name Workspace Studio cannot be independently verified'
  ]) {
    const r = tevesNevKifogas({ issues: [], verdict: v }, wsForras, UT);
    assert.equal(r.verdictTeves, false, v);
    assert.equal(r.nevek.length, 0, v);
  }
});

t('ELLENPRÓBA: kisbetűs szó folytatja a nevet („Workspace studio pro”) → nem ítélünk', () => {
  for (const v of ['Product name Workspace studio pro cannot be independently verified', 'Workspace studio pro is not a real product', 'Workspace studio pro is fabricated']) {
    assert.equal(tevesNevKifogas({ issues: [v], verdict: '' }, wsForras, UT).teves.length, 0, v);
  }
});

t('ELLENPRÓBA: kötőjeles név egy token („Gemini Ultra-Max” ≠ „Gemini Ultra”)', () => {
  const f = { originalTitle: 'Gemini Ultra and Max modes', sourceUrl: 'https://blog.google/x/', sourceText: 'Gemini Ultra is here. Max is a mode.', known: [] };
  assert.equal(tevesNevKifogas({ issues: ['Gemini Ultra-Max is not a real model'], verdict: '' }, f, UT).teves.length, 0);
  assert.equal(tevesNevKifogas({ issues: ['Product name Gemini Ultra-Max cannot be independently verified'], verdict: '' }, f, UT).teves.length, 0);
  // és ha a kötőjeles név SZÓ SZERINT a forrásban áll, igazolt
  const g = { ...f, sourceText: 'Meet Gemini Ultra-Max today.' };
  assert.equal(tevesNevKifogas({ issues: ['Gemini Ultra-Max is not a real model'], verdict: '' }, g, UT).teves.length, 1);
});

t('idézőjel nélküli: árról / felületről szóló kifogás marad; név nélküli „unverified” sem esik ki', () => {
  assert.equal(tevesNevKifogas({ issues: ['Product name Workspace Studio pricing cannot be independently verified'], verdict: '' }, wsForras, UT).teves.length, 0);
  assert.equal(tevesNevKifogas({ issues: ['Product name Workspace Studio button cannot be independently verified'], verdict: '' }, wsForras, UT).teves.length, 0);
  assert.equal(tevesNevKifogas({ issues: ['Product name cannot be independently verified'], verdict: '' }, wsForras, UT).teves.length, 0);
});

t('idézőjel nélküli tartalék csak forrás-URL mellett igazol (URL nélkül a saját cím nem)', () => {
  assert.equal(tevesNevKifogas({ issues: [], verdict: VALODI_WS }, { ...wsForras, sourceUrl: '' }, UT).verdictTeves, false);
});

// I4: a valódi KITALÁLÁS-kifogások (tartalmi állítás kitalálva) akkor sem esnek ki, ha a forrásban szerepel a szó.
const TARTALMI = [
  ['The article invents an auto-summary mode in Gemini that does not exist', 'Gemini is great.'],
  ['The guide describes a smart sheets feature that cannot be verified in Google Workspace', 'Google Workspace news.'],
  ['The steps for exporting to Google Docs are invented', 'Export to Google Docs.'],
  ['Gemini 4 Carbon offline mode is fabricated', 'Gemini 4 Carbon is now available.'],
  ['Workspace studio pro is fabricated', 'Workspace Studio is new.'],
  ['Gemini Ultra-Max is not a real model', 'Gemini Ultra is here. Max is a mode.'],
  ['Offline mode for Gemini 4 Carbon does not appear in the official announcement', 'Gemini 4 Carbon is now available.'],
  ['Claims about Gemini Live translation are not verified by the source', 'Gemini Live translation is announced.'],
  ['This guide says Gemini 4 Carbon runs offline, which is fabricated', 'Gemini 4 Carbon is now available.'],
  ["The claim that 'Gemini 4 Carbon' supports offline mode does not appear in the official source", 'Gemini 4 Carbon is now available.']
];
t('ELLENPRÓBA (I4): tartalmi kitalálás-kifogások útmutatónál is megmaradnak, issue-ként ÉS verdictként', () => {
  for (const [mondat, szoveg] of TARTALMI) {
    const f = { originalTitle: 'Gemini 4 Carbon is now available', sourceUrl: 'https://blog.google/products/gemini/gemini-4-carbon/', sourceText: szoveg, known: ['Google'] };
    const r = tevesNevKifogas({ issues: [mondat], verdict: mondat }, f, UT);
    assert.equal(r.teves.length, 0, 'issue kiesett: ' + mondat);
    assert.equal(r.verdictTeves, false, 'verdict kiesett: ' + mondat);
  }
});

t('I3: a névlista-megfogalmazás szűk — „does not appear in the official source” nem név-kifogás', () => {
  const f = { originalTitle: 'Gemini 4 Carbon is now available', sourceUrl: 'https://blog.google/products/gemini/gemini-4-carbon/', sourceText: '', known: [] };
  assert.equal(tevesNevKifogas({ issues: [], verdict: "The claim that 'Gemini 4 Carbon' supports offline mode does not appear in the official source" }, f, UT).verdictTeves, false);
  // a névlista-megfogalmazás útmutatónál téves…
  assert.equal(tevesNevKifogas({ issues: [], verdict: "refers to 'Gemini 4 Carbon' which does not appear in the known names list" }, f, UT).verdictTeves, true);
});

// C2: HÍRNÉL (opció nélkül) a viselkedés változatlan — sem a névlista-megfogalmazás, sem az idézőjel nélküli név nem fog.
t('🔒 C2: hírnél (opció nélkül) a Gemini 4 Carbon névlista-verdict és az idézőjel nélküli Workspace Studio verdict a RÉGI eredményt adja', () => {
  const carbon = { originalTitle: 'Gemini 4 Carbon is now available', sourceUrl: 'https://blog.google/products/gemini/gemini-4-carbon/', sourceText: '', known: [] };
  const a = tevesNevKifogas(carbonBiralat, carbon);
  assert.deepEqual(a, { teves: [], maradt: [], nevek: [], verdictTeves: false });
  const b = tevesNevKifogas({ issues: [VALODI_WS], verdict: VALODI_WS }, wsForras);
  assert.deepEqual(b, { teves: [], maradt: [VALODI_WS], nevek: [], verdictTeves: false });
  // atdolgozoMeta opció nélkül (iro / hír) ugyanígy érintetlen
  const rejected = { source_link: 'https://workspace.google.com/blog/x/', ai_review: { decision: 'FAIL', issues: [], verdict: VALODI_WS }, reason: VALODI_WS };
  assert.equal(atdolgozoMeta(rejected, { ...wsForras }).kivett.length, 0);
  assert.ok(atdolgozoMeta(rejected, { ...wsForras, utmutato: true }).kivett.length > 0);
});

t('idézőjel nélküli: az átdolgozó a mentett valódi Workspace Studio-bírálatot is kiveszi (útmutató)', () => {
  const rejected = { source_link: '', ai_review: { decision: 'FAIL', issues: [], verdict: VALODI_WS }, reason: VALODI_WS };
  const r = atdolgozoMeta(rejected, { ...wsForras, utmutato: true });
  assert.ok(r.kivett.length > 0);
  assert.equal(r.csakTevesNev, true);
});

t('az ellenőrző az útmutató-opciót CSAK az útmutató-ágon adja át, az útmutató-átdolgozó mindig', () => {
  const e = readFileSync(join(ROOT, 'agents', 'ellenorzo', 'agent.js'), 'utf-8');
  assert.match(e, /const nevOpt = writerData\._meta\?\.type === 'guide' \? \{ utmutato: true \} : \{\};/);
  assert.match(e, /tevesNevKifogas\(aiReviewResult, nevForras, nevOpt\)/);
  assert.match(e, /tevesNevKifogas\(vegso, nevForras, nevOpt\)/);
  assert.doesNotMatch(e, /tevesNevKifogas\([^)]*\{ utmutato: true \}/, 'az opció csak a nevOpt-on át mehet');
  const g = readFileSync(join(ROOT, 'agents', 'guide', 'agent.js'), 'utf-8');
  assert.match(g, /atdolgozoMeta\(data\._meta, \{ \.\.\.utmutatoNevForras\(data\._meta, \{ sugoSzovegek \}\), utmutato: true \}\)/);
  assert.match(g, /if \(data\._meta\?\.ai_review\)/, 'a súgót csak mentett bírálat mellett töltjük le');
  const i = readFileSync(join(ROOT, 'agents', 'iro', 'agent.js'), 'utf-8');
  assert.doesNotMatch(i, /utmutato: true/, 'a hír-átdolgozó nem kaphat útmutató-opciót');
});

console.log(`\n✅ ${pass} eset zöld`);
