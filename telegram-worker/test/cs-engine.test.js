// node telegram-worker/test/cs-engine.test.js — offline: fake KV + fake AI + fake fetch
import { strict as assert } from 'assert';
import { answer, loadKb, MODEL, stripUnknownUrls } from '../src/cs-engine.js';

function fakeKv() {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
    _store: store
  };
}
const KB = { v: 1, lang: 'en', site: [{ q: 'How do I subscribe to the newsletter?', a: 'Box at the bottom.', u: 'https://aiworldhq.com/#nl' }], guides: [{ t: 'Getting started with ChatGPT writing', s: 'Beginner writing guide.', u: 'https://aiworldhq.com/article/chatgpt-writing', c: 'OpenAI' }], terms: [] };
let fetchCount = 0;
const fakeFetch = async (url) => { fetchCount++; assert.ok(url.includes('/kb.json'), 'kb URL-t kér'); return { ok: true, json: async () => KB }; };

// 1) loadKb: első hívás fetch-el, második KV-cache-ből (nincs új fetch)
{
  const env = { FEEDBACK: fakeKv() };
  const kb1 = await loadKb(env, 'en', fakeFetch);
  assert.equal(kb1.guides.length, 1);
  const before = fetchCount;
  await loadKb(env, 'en', fakeFetch);
  assert.equal(fetchCount, before, 'másodszor cache-ből jön');
}

// 2) answer: releváns kérdés → AI-válasz + a kb-ból származó link
{
  const env = {
    FEEDBACK: fakeKv(),
    AI: { async run(model, opts) {
      assert.equal(model, MODEL);
      const sys = opts.messages[0].content;
      assert.ok(sys.includes('chatgpt-writing'), 'a releváns kb-találat a promptban van');
      assert.ok(sys.includes('NEVER invent'), 'link-tiltás a promptban');
      return { response: 'Start with our ChatGPT writing guide: https://aiworldhq.com/article/chatgpt-writing' };
    } }
  };
  const r = await answer(env, { message: 'how do I start writing with chatgpt?', lang: 'en', fetchFn: fakeFetch });
  assert.equal(r.escalate, false);
  assert.ok(r.text.includes('guide'));
  assert.deepEqual(r.links.map(l => l.u), ['https://aiworldhq.com/article/chatgpt-writing']);
}

// 3) [ESCALATE] szentinel → escalate:true, a jelölő letisztítva
{
  const env = { FEEDBACK: fakeKv(), AI: { async run() { return { response: '[ESCALATE] I cannot help with that here.' }; } } };
  const r = await answer(env, { message: 'refund my bank transfer please', lang: 'en', fetchFn: fakeFetch });
  assert.equal(r.escalate, true);
  assert.ok(!r.text.includes('[ESCALATE]'));
}

// 4) AI-hiba → escalate:true, üres text (a hívó ad fallback-szöveget)
{
  const env = { FEEDBACK: fakeKv(), AI: { async run() { throw new Error('capacity'); } } };
  const r = await answer(env, { message: 'hello', lang: 'hu', fetchFn: fakeFetch });
  assert.equal(r.escalate, true);
  assert.equal(r.text, '');
}

// 5) sikeres hívás, de ÜRES response → escalate:true (degradált kimenet nem "normál" válasz)
{
  const env = { FEEDBACK: fakeKv(), AI: { async run() { return { response: '' }; } } };
  const r = await answer(env, { message: 'hello there', lang: 'en', fetchFn: fakeFetch });
  assert.equal(r.escalate, true);
  assert.equal(r.text, '');
}

// ===================================================================
// KITALÁLT-URL ŐR (2026-07-21, éles próbán lelt hiba): a modell a nem létező
// "aiworldhq.com/contact" címet írta. Ami nincs a kb.json-ban, ki kell esnie.
// ===================================================================
{
  const kb2 = {
    site: [{ q: 'x', a: 'y', u: 'https://aiworldhq.com/about.html' }],
    guides: [{ t: 'g', s: 's', u: 'https://aiworldhq.com/article/real-guide', c: '' }],
    terms: []
  };
  // valódi kb-linkek MEGMARADNAK (záró írásjellel is)
  const keep = stripUnknownUrls('Nézd meg: https://aiworldhq.com/article/real-guide, és https://aiworldhq.com/about.html.', kb2);
  assert.ok(keep.includes('https://aiworldhq.com/article/real-guide'), 'valódi guide-link megmarad');
  assert.ok(keep.includes('https://aiworldhq.com/about.html'), 'valódi site-link megmarad');

  // KITALÁLT cím eltűnik
  const drop = stripUnknownUrls('Írj ide: https://aiworldhq.com/contact vagy https://example.com/fake', kb2);
  assert.ok(!drop.includes('/contact'), 'kitalált /contact URL kivágva');
  assert.ok(!drop.includes('example.com'), 'idegen URL kivágva');

  // vegyes eset: a valódi marad, a kitalált megy
  const mixed = stripUnknownUrls('Igazi: https://aiworldhq.com/article/real-guide Hamis: https://aiworldhq.com/nincs-ilyen', kb2);
  assert.ok(mixed.includes('/article/real-guide') && !mixed.includes('nincs-ilyen'), 'vegyesen is jól szűr');
}

console.log('✅ cs-engine.test: minden átment');
