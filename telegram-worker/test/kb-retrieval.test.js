// node telegram-worker/test/kb-retrieval.test.js — offline, függőség nélkül
import { strict as assert } from 'assert';
import { tokenize, searchKb } from '../src/kb-retrieval.js';

// tokenize: kisbetű, ékezet-normalizálás, 3+ karakter, egyediség
assert.deepEqual(tokenize('Írás és ÍRÁS, az AI-val!'), ['iras', 'val']);
assert.deepEqual(tokenize(''), []);

const kb = {
  site: [
    { q: 'How do I subscribe to the newsletter?', a: 'Use the box at the bottom of any page.', u: 'https://aiworldhq.com/#newsletter' },
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
const nlHits = searchKb('newsletter subscribe', kb, 4);
assert.equal(nlHits[0].kind, 'site');

// üres/zaj kérdés → üres lista (nem hasraütés)
assert.deepEqual(searchKb('¤¤ !!', kb, 4), []);

// topN tartva
assert.ok(searchKb('writing AI guide tools', kb, 2).length <= 2);

console.log('✅ kb-retrieval.test: minden átment');
