// ===================================================================
// TESZT — forrás-zár
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT: 2026-08-18-án öt sztoriról derült ki, hogy két-két cikkünk van róla.
// Négyet azonos forrás-URL azonosít, egyet csak az azonos eredeti cím — annál
// a forrás átírta a SAJÁT linkje kötőjelezését (gemini-36-flash vs
// gemini-3-6-flash), amit semmilyen ésszerű URL-normalizálás nem hoz közös
// kulcsra. Ezért kétkulcsos a zár.
// ===================================================================

import assert from 'assert/strict';
import {
  normalizeSourceUrl, normalizeSourceTitle, isOwnDomain,
  publishedSourceKeys, isAlreadyWritten, MIN_TITLE_KEY_LEN
} from './source-lock.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 Forrás-zár\n');

t('az URL-normalizálás a jelentéktelen eltéréseket vágja le', () => {
  const k = 'openai.com/index/gpt-red';
  assert.equal(normalizeSourceUrl('https://openai.com/index/gpt-red'), k);
  assert.equal(normalizeSourceUrl('http://www.openai.com/index/gpt-red/'), k);
  assert.equal(normalizeSourceUrl('https://openai.com/index/gpt-red?utm_source=rss'), k);
  assert.equal(normalizeSourceUrl('https://openai.com/index/gpt-red#top'), k);
  assert.equal(normalizeSourceUrl('  HTTPS://OpenAI.com/index/GPT-Red  '), k);
  assert.equal(normalizeSourceUrl(''), '');
  assert.equal(normalizeSourceUrl(null), '');
});

t('⚠️ az útvonal-eltérést NEM tünteti el (ezért kell a cím-kulcs)', () => {
  // A Gemini-pár valódi esete. Ha ez a két kulcs valaha egyenlő lenne, az azt
  // jelentené, hogy a normalizálás túl agresszív, és külön cikkeket olvasztana.
  const a = normalizeSourceUrl('https://deepmind.google/blog/introducing-gemini-36-flash-35-flash-lite/');
  const b = normalizeSourceUrl('https://deepmind.google/blog/introducing-gemini-3-6-flash-3-5-flash-lite/');
  assert.notEqual(a, b, 'az URL-kulcs itt bizonyítottan nem elég');
});

t('a cím-kulcs a központozástól és kisbetűtől független', () => {
  assert.equal(
    normalizeSourceTitle('Introducing Gemini 3.6 Flash, 3.5 Flash-Lite, and 3.5 Flash Cyber'),
    normalizeSourceTitle('introducing gemini 3 6 flash  3 5 flash lite and 3 5 flash cyber'));
  assert.equal(normalizeSourceTitle(null), '');
});

t('a saját domain felismerése', () => {
  assert.equal(isOwnDomain('https://aiworldhq.com'), true);
  assert.equal(isOwnDomain('https://www.aiworldhq.com/article/valami'), true);
  assert.equal(isOwnDomain('https://openai.com/index/x'), false);
});

t('🚫 a saját domain NEM kerül a zárolt kulcsok közé', () => {
  // Kilenc szerkesztőségi cikkünk (heti digest, összehasonlítás) source_link-je
  // a saját domainünk. Ha bekerülne, a digest legközelebb önmagát zárná ki.
  const keys = publishedSourceKeys([
    { _meta: { source_link: 'https://aiworldhq.com' }, original_title: 'This Week in AI' }
  ]);
  assert.equal(keys.urls.size, 0, 'a saját domain nem lehet kulcs');
});

t('📌 a négy VALÓDI azonos-URL-es duplikátum meg lett volna előzve', () => {
  const publikalt = [
    { _meta: { source_link: 'https://aws.amazon.com/blogs/machine-learning/built-technologies-builds-an-ai-powered-document-intelligence-solution-on-aws/' }, original_title: 'Built Technologies builds an AI-powered document intelligence solution on AWS' },
    { _meta: { source_link: 'https://openai.com/index/unlocking-self-improvement-gpt-red' }, original_title: 'GPT-Red: Unlocking Self-Improvement for Robustness' },
    { _meta: { source_link: 'https://openai.com/index/safety-alignment-long-horizon-models' }, original_title: 'Safety and alignment in an era of long-horizon models' },
    { _meta: { source_link: 'https://blogs.nvidia.com/blog/siggraph-news-2026/' }, original_title: 'At SIGGRAPH, NVIDIA Advances Graphics and Simulation' }
  ];
  const keys = publishedSourceKeys(publikalt);
  // A draftban a mező neve `link`, NEM `source_link` — ez az író adja neki később.
  for (const a of publikalt) {
    const draft = { link: a._meta.source_link, title: 'teljesen mas cim amit meg nem irtunk' };
    assert.equal(isAlreadyWritten(draft, keys), true, a._meta.source_link);
  }
});

t('📌 a Gemini-párt a CÍM-kulcs fogja meg', () => {
  const keys = publishedSourceKeys([{
    _meta: { source_link: 'https://deepmind.google/blog/introducing-gemini-36-flash-35-flash-lite-and-35-flash-cyber/' },
    original_title: 'Introducing Gemini 3.6 Flash, 3.5 Flash-Lite, and 3.5 Flash Cyber'
  }]);
  const draft = {
    link: 'https://deepmind.google/blog/introducing-gemini-3-6-flash-3-5-flash-lite-and-3-5-flash-cyber/',
    title: 'Introducing Gemini 3.6 Flash, 3.5 Flash-Lite, and 3.5 Flash Cyber'
  };
  assert.equal(isAlreadyWritten(draft, keys), true, 'az URL mas, a cim ugyanaz');
});

t('🔗 az ÖSSZEVONT cikk minden forrása zárolva van', () => {
  // Enélkül a beolvasztott hír később külön cikkként újra megíródna.
  const keys = publishedSourceKeys([{
    _meta: {
      source_link: 'https://midjourney.com/updates/v8-alpha',
      source_links: [
        'https://midjourney.com/updates/v8-alpha',
        'https://midjourney.com/updates/v8-1-updates',
        'https://midjourney.com/updates/web-updates'
      ]
    },
    original_title: 'V8 Alpha'
  }]);
  for (const l of ['https://midjourney.com/updates/v8-1-updates', 'https://midjourney.com/updates/web-updates']) {
    assert.equal(isAlreadyWritten({ link: l, title: 'mas cim teljesen' }, keys), true, l);
  }
});

t('az ÚJ hír átmegy', () => {
  const keys = publishedSourceKeys([
    { _meta: { source_link: 'https://openai.com/index/regi' }, original_title: 'Regi hir cime itt' }
  ]);
  assert.equal(isAlreadyWritten({ link: 'https://openai.com/index/uj', title: 'Teljesen uj hir cime' }, keys), false);
});

t('a túl rövid cím NEM zárol (ütközés-védelem)', () => {
  // Egy 3 karakteres cím véletlenül is egyezhet — abból nem csinálunk zárat.
  const rovid = 'V8';
  assert.ok(normalizeSourceTitle(rovid).length < MIN_TITLE_KEY_LEN);
  const keys = publishedSourceKeys([{ _meta: {}, original_title: rovid }]);
  assert.equal(keys.titles.size, 0);
  assert.equal(isAlreadyWritten({ link: 'https://uj.com/x', title: rovid }, keys), false);
});

t('hiányzó adat nem borít fel semmit', () => {
  const keys = publishedSourceKeys([]);
  assert.equal(isAlreadyWritten({}, keys), false);
  assert.equal(isAlreadyWritten({ link: 'https://x.com/a' }, null), false);
  assert.equal(publishedSourceKeys(null).urls.size, 0);
});

console.log('\n✅ source-lock.test: mind a ' + pass + ' eset rendben');
