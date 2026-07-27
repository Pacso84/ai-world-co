// node telegram-worker/test/kb-retrieval.test.js — offline, függőség nélkül
import { strict as assert } from 'assert';
import { tokenize, searchKb } from '../src/kb-retrieval.js';

// tokenize: kisbetű, ékezet-normalizálás, 3+ karakter, egyediség
// (2026-07-21: a 'val' magyar ESETRAG — a kötőjeles "AI-val" külön tokenné vágta,
//  és véletlen címegyezéseket okozott. Mostantól stopszó, ezért kiesik.)
assert.deepEqual(tokenize('Írás és ÍRÁS, az AI-val!'), ['iras']);
assert.deepEqual(tokenize(''), []);

const kb = {
  site: [
    { q: 'How do I report a mistake in an article?', a: 'Use the feedback buttons at the bottom of any page.', u: 'https://aiworldhq.com/support.html' },
    { q: 'How do I report a mistake?', a: 'Use the thumbs buttons or the contact form.', u: 'https://aiworldhq.com/about.html' }
  ],
  guides: [
    { t: 'Getting started with ChatGPT for everyday writing', s: 'A beginner guide to writing with AI.', u: 'https://aiworldhq.com/article/chatgpt-writing', c: 'OpenAI' },
    { t: 'Master Apple Intelligence writing tools', s: 'Writing tools on iPhone.', u: 'https://aiworldhq.com/article/apple-writing', c: 'Apple' },
    { t: 'Managing AI spend with Snowflake FinOps', s: 'Cost dashboards for teams.', u: 'https://aiworldhq.com/article/snowflake-finops', c: 'Snowflake' }
  ],
  terms: [{ t: 'prompt', d: 'The instruction you give an AI.', u: 'https://aiworldhq.com/glossary.html' }]
};

// címtalálat előrébb, mint az összefoglaló-találat; irreleváns kimarad
const hits = searchKb('how to start writing with chatgpt', kb, 4);
assert.ok(hits.length >= 1, 'van találat');
assert.equal(hits[0].u, 'https://aiworldhq.com/article/chatgpt-writing', 'a cím+összefoglaló találat az első');
assert.ok(!hits.some(h => h.u.includes('snowflake')), 'irreleváns guide nem kerül be');

// GYIK-találat: kind==='site'
const nlHits = searchKb('report mistake article', kb, 4);
assert.equal(nlHits[0].kind, 'site');

// üres/zaj kérdés → üres lista (nem hasraütés)
assert.deepEqual(searchKb('¤¤ !!', kb, 4), []);

// topN tartva
assert.ok(searchKb('writing AI guide tools', kb, 2).length <= 2);

// stopszavak kiesnek (2026-07-20 review-fix): gyakori szó nem kaphat pontot
assert.deepEqual(tokenize('how with the and für wie'), []);
assert.deepEqual(searchKb('how with for that', kb, 4), [], 'csak-stopszavas kérdésre nincs találat');

// ===================================================================
// TOLDALÉKOLÁS (2026-07-21, ÉLES HIBÁBÓL): a magyar ragozás miatt a
// "képet generálni" nem talált rá a "Képgenerálás..." útmutatóra (a kereső
// csak PONTOS szóegyezést nézett) → a bot eszkalált a válasz helyett.
// ===================================================================
const kbHu = {
  site: [],
  guides: [
    { t: 'Képgenerálás a Google Geminivel: kezdő útmutató', s: 'Készíts saját képeket néhány perc alatt.', u: 'https://aiworldhq.com/hu/article/kepgeneralas-gemini', c: 'Google' },
    { t: 'Heti közösségi média tartalomnaptár készítése', s: 'Tervezd meg a posztjaidat AI-val.', u: 'https://aiworldhq.com/hu/article/tartalomnaptar', c: 'Meta' }
  ],
  terms: []
};
const huHits = searchKb('Hogyan tudok képet generálni AI-val?', kbHu, 4);
assert.ok(huHits.length >= 1, 'a ragozott kérdés TALÁL (nem üres)');
assert.equal(huHits[0].u, 'https://aiworldhq.com/hu/article/kepgeneralas-gemini',
  'a képgenerálás-útmutató az ELSŐ (nem a tartalomnaptár)');

// "hírlevélre" (ragozott) rátalál a "hírlevél"-re
const kbNl = { site: [{ q: 'Hogyan iratkozom fel a hírlevélre?', a: 'A doboz az oldal alján van.', u: 'https://aiworldhq.com/hu' }], guides: [], terms: [] };
assert.equal(searchKb('hirlevel feliratkozas', kbNl, 4).length, 1, 'ragozatlan alak is talál');

// NEM lehet bármi bármivel: eltérő téma ne kerüljön be
assert.deepEqual(searchKb('kutya macska idojaras', kbHu, 4), [], 'témán kívüli kérdésre nincs találat');

console.log('✅ kb-retrieval.test: minden átment');
