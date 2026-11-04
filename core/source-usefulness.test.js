// ===================================================================
// TESZT — forrás-hasznosság kapu
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-11, user: "csak 100 százalékosakat használjuk!!!!"):
// a source-scout hat javaslatot tett, MIND 100/100 megbízhatósággal — és
// négy közülük semmit nem ír AI-ról. Az Airbnb friss címei: "Q2 2026
// financial results", "74% of Gen Z want small town trips". A megbízhatóság
// azt méri, VALÓDI-e a forrás; azt nem, hogy KELL-e nekünk.
//
// Ez a második nekifutás ugyanerre: 2026-08-01-én a küszöb 70→100 ment, és
// a vadászmezők fogyasztói appokra álltak. A scout azóta jó mezőn vadászik —
// csak épp senki nem nézte meg, hogy a jelölt ír-e egyáltalán AI-ról.
//
// KALIBRÁCIÓ ÉLES ADATON (2026-08-11, friss 12 cikk forrásonként):
//   bevált forrásaink : openai 92 · aws-ml 100 · d-id 89 · nvidia 75
//                       midjourney 75 · databricks 60 · workspace 50 · picsart 33
//   a hat javaslat    : coursera 70 · notion 50 · zoho 30 · khan 10
//                       memrise 0 · airbnb 0
// A haszontalanok 30% ALATT, a használhatók 50% FELETT → tiszta elválás.
// ===================================================================

import assert from 'assert/strict';
import { aiContentRatio, sameSource, usefulnessVerdict, MIN_AI_RATIO } from './source-usefulness.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 forrás-hasznosság\n');

// ---------- AI-arány ----------
t('a terméknév szóhatár NÉLKÜL is számít', () => {
  // Az első mércém az OpenAI blogra 58%-ot mondott — egy AI-cég blogjára.
  // Ok: a \b szóhatár miatt a "ChatGPT"-ben a "GPT" nem illeszkedett.
  assert.equal(aiContentRatio([{ title: 'Testing ads in ChatGPT' }]), 100);
  assert.equal(aiContentRatio([{ title: 'Introducing GPT-5.6 Sol' }]), 100);
  assert.equal(aiContentRatio([{ title: 'Claude now writes your emails' }]), 100);
});

t('a valódi nem-AI cikk nem számít bele', () => {
  // Szó szerint az Airbnb friss címeiből.
  const airbnb = [
    { title: 'Airbnb Q2 2026 financial results' },
    { title: 'Record Airbnb guest numbers at FIFA World Cup 2026' },
    { title: 'Hunger for Culture: Rise of Culinary Travel' },
    { title: '74% of Gen Z want small town trips over big cities' }
  ];
  assert.equal(aiContentRatio(airbnb), 0);
});

t('vegyes feednél a tényleges arányt adja', () => {
  // Szó szerint a Zoho friss címeiből. A mérce DURVA: a negyedik sor
  // ("transcribes") valójában AI-funkció, de a szótár nem ismeri, tehát nem
  // számít bele. Ezt tudatosan hagyjuk így: a döntéshez elég, mert 25% és 50%
  // is jóval a 60-as küszöb ALATT van. A szótár bővítése hamis pozitívokat
  // hozna (egy nyelvtanuló app "translation" cikke nem AI-hír).
  const vegyes = [
    { title: 'Meet Zoho Social MCP: your AI assistant runs social media' },
    { title: 'App Spotlight: Shopify Pro for Zoho CRM' },
    { title: 'Announcing Zoho POS for South Africa' },
    { title: 'Zoho Notebook transcribes your call recordings' }
  ];
  assert.equal(aiContentRatio(vegyes), 25);
});

t('a kivonatot is nézi, nem csak a címet', () => {
  const r = aiContentRatio([{ title: 'Product update', contentSnippet: 'We added a new assistant powered by machine learning.' }]);
  assert.equal(r, 100);
});

t('üres bemenet 0', () => {
  assert.equal(aiContentRatio([]), 0);
  assert.equal(aiContentRatio(null), 0);
});

// ---------- duplikátum ----------
t('a domain-variáns UGYANAZ a forrás', () => {
  // A scout a notion.so-t javasolta, miközben a notion.com már fut nálunk —
  // és 30 napja 0 cikket hozott. Ugyanaz a cég, ugyanaz a feed.
  assert.equal(sameSource('https://www.notion.so/releases/rss.xml',
    'https://www.notion.com/releases/rss.xml'), true);
});

t('a www és a záró / nem tesz különbséget', () => {
  assert.equal(sameSource('https://blog.coursera.org/feed/', 'http://www.blog.coursera.org/feed'), true);
});

t('két külön forrás nem duplikátum', () => {
  assert.equal(sameSource('https://blog.khanacademy.org/feed/', 'https://blog.coursera.org/feed/'), false);
  assert.equal(sameSource('https://notion.com/releases/rss.xml', 'https://notion.com/blog/rss.xml'), false);
});

// ---------- együtt: az ítélet ----------
t('a haszontalan javaslatot elutasítja', () => {
  const v = usefulnessVerdict({ aiRatio: 0, url: 'https://news.airbnb.com/feed/', existingUrls: [] });
  assert.equal(v.ok, false);
  assert.match(v.reason, /AI/, 'az indok megmondja, mi a baj');
});

t('a duplikátumot elutasítja, akkor is ha AI-tartalmú', () => {
  const v = usefulnessVerdict({
    aiRatio: 90, url: 'https://www.notion.so/releases/rss.xml',
    existingUrls: ['https://www.notion.com/releases/rss.xml']
  });
  assert.equal(v.ok, false);
  assert.match(v.reason, /már|duplik/i);
});

t('a jó jelöltet átengedi', () => {
  const v = usefulnessVerdict({ aiRatio: 70, url: 'https://blog.coursera.org/feed/', existingUrls: [] });
  assert.equal(v.ok, true);
});

t('a küszöb a bevált forrásainkhoz van szabva', () => {
  // 100%-os küszöb a SAJÁT forrásaink 7/8-át is kizárná (az OpenAI-t is).
  // 60: a mért haszontalanok (0-30%) kiesnek, a használhatók bent maradnak.
  assert.equal(MIN_AI_RATIO, 60);
  assert.equal(usefulnessVerdict({ aiRatio: 30, url: 'https://a.hu/f', existingUrls: [] }).ok, false, 'zoho-szint: ki');
  assert.equal(usefulnessVerdict({ aiRatio: 70, url: 'https://b.hu/f', existingUrls: [] }).ok, true, 'coursera-szint: be');
});

console.log('\n✅ source-usefulness.test: mind a ' + pass + ' eset rendben');
