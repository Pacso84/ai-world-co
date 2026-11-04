// ===================================================================
// TESZT — közösségi bejegyzés állapota a céljához képest
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT: 2026-08-18-án a SEO-őr azt jelentette, hogy "4 közösségi poszt NEM
// LÉTEZŐ cikkre mutat (az olvasó 404-et kap)". Élesben ellenőrizve MIND A
// NÉGY 301-en át élő oldalon kötött ki — nulla olvasó kapott hibát. Az őr
// két különböző dolgot mosott össze, és a súlyosabbik nevén nevezte mindet.
// Ez a fajta téves riasztás a legdrágább: nem lehet "megjavítani", tehát
// megtanítja az embert, hogy ne nézzen oda.
// ===================================================================

import assert from 'assert/strict';
import { linkState, slugOf, followRedirects, CHANNELS, OK, CLOSED, REDIRECT, DEAD }
  from './social-link-state.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 Közösségi link-állapot\n');

const el = new Set(['friss-cikk', 'atnevezett-uj']);
const atir = { 'atnevezett-regi': 'atnevezett-uj' };
const poszt = (url, extra = {}) => ({ url: `https://aiworldhq.com/article/${url}`, ...extra });

t('élő cikkre mutató bejegyzés rendben van', () => {
  assert.equal(linkState(poszt('friss-cikk'), el, atir), OK);
});

t('nincs cikk és nincs átirányítás → VALÓDI 404', () => {
  assert.equal(linkState(poszt('sosem-volt'), el, atir), DEAD);
});

t('🔀 átnevezett cikk NEM 404 — a 301 él', () => {
  // EZ VOLT A TÉVES RIASZTÁS. A régi slug nincs a publikáltak közt, de a
  // slug-history élő cikkre viszi. Az olvasó hibátlanul megérkezik.
  assert.equal(linkState(poszt('atnevezett-regi'), el, atir), REDIRECT);
});

t('🔒 minden csatornán lezárt bejegyzés nem riaszt (olvasóhoz nem jut)', () => {
  // Mindkét poszter `if (post[field]) continue` alapon szűr.
  const lezart = Object.fromEntries(CHANNELS.map(c => [c, 'skipped-withdrawn']));
  assert.equal(linkState(poszt('sosem-volt', lezart), el, atir), CLOSED);
  // ...még akkor sem, ha egyébként élne:
  assert.equal(linkState(poszt('friss-cikk', lezart), el, atir), CLOSED);
});

t('⚠️ a RÉSZBEN lezárt bejegyzés IGENIS számít', () => {
  // Facebookra kiment, Threadsre/Instagramra még nem — ott még kimehet,
  // tehát a törött link ott még elérheti az olvasót.
  assert.equal(linkState(poszt('sosem-volt', { posted_fb: true }), el, atir), DEAD);
});

t('az átirányítás LÁNCOT is követ (a slug-history halmozódik)', () => {
  const lanc = { a: 'b', b: 'c' };
  assert.equal(followRedirects('a', lanc), 'c');
  assert.equal(linkState(poszt('a'), new Set(['c']), lanc), REDIRECT);
});

t('a körkörös átirányítás nem fagyaszt le', () => {
  // Védekezés elgépelés ellen: ha valaki A→B→A-t ír a listába, ne pörögjünk.
  assert.equal(followRedirects('a', { a: 'b', b: 'a' }), 'b');
});

t('a 301 CÉLJÁNAK is élnie kell', () => {
  // Ha az átirányítás egy szintén törölt cikkre mutat, az VALÓDI hiba.
  assert.equal(linkState(poszt('atnevezett-regi'), new Set(), atir), DEAD);
});

t('a slug az url-ből jön, .html és ?# nélkül', () => {
  assert.equal(slugOf(poszt('valami.html')), 'valami');
  assert.equal(slugOf(poszt('valami?utm=fb')), 'valami');
  assert.equal(slugOf({ url: '' }), '');
});

t('link nélküli bejegyzés nem riaszt', () => {
  assert.equal(linkState({}, el, atir), CLOSED);
});

t('📌 a 2026-08-18-i NÉGY VALÓDI eset', () => {
  // Kettőt átneveztünk (a cikk él), kettőt levettünk (a cikk elment).
  // A helyes lelet: 2 elavult + 2 lezárt — és NULLA valódi 404.
  const eloSlugok = new Set([
    'how-to-plan-a-camping-trip-with-any-ai-assistant',
    'how-to-use-qwen-chat-to-plan-a-weekend-road-trip-without-getting-lost',
    'use-qwen-to-summarise-long-policy-documents-in-plain-english',
    'databricks-puts-genie-one-on-your-phone-ai-insights-on-the-go'
  ]);
  const tortenet = {
    'how-to-plan-an-australian-camping-trip-with-any-ai-assistant': 'how-to-plan-a-camping-trip-with-any-ai-assistant',
    'how-to-use-qwen-chat-to-plan-a-weekend-road-trip-in-australia-without-': 'how-to-use-qwen-chat-to-plan-a-weekend-road-trip-without-getting-lost',
    'how-to-break-down-an-australian-government-form-in-plain-english': 'use-qwen-to-summarise-long-policy-documents-in-plain-english',
    'how-to-get-ai-insights-anywhere-with-genie-one-on-your-phone': 'databricks-puts-genie-one-on-your-phone-ai-insights-on-the-go'
  };
  const lezart = Object.fromEntries(CHANNELS.map(c => [c, 'skipped-withdrawn']));

  // A kettő, amit a friss slugra állítottunk: már rendben van.
  assert.equal(linkState(poszt('how-to-plan-a-camping-trip-with-any-ai-assistant'), eloSlugok, tortenet), OK);
  // A kettő, amit lezártunk: nem riaszt többé.
  assert.equal(linkState(poszt('how-to-get-ai-insights-anywhere-with-genie-one-on-your-phone', lezart), eloSlugok, tortenet), CLOSED);
  // ÉS a lényeg: javítás ELŐTT egyik sem volt "404" — mind a négy 301-en át élt.
  for (const regi of Object.keys(tortenet)) {
    assert.equal(linkState(poszt(regi), eloSlugok, tortenet), REDIRECT,
      `${regi} — ez NEM 404 volt, hanem elavult bejegyzés`);
  }
});

console.log('\n✅ social-link-state.test: mind a ' + pass + ' eset rendben');
