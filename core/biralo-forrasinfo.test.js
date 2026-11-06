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
import { biraloForrasInfo, tevesNevKifogas, nevJavitoMegjegyzes } from './biralo-forrasinfo.js';
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

console.log(`\n✅ ${pass} eset zöld`);
