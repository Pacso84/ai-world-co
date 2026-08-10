// ===================================================================
// TESZT — feed-linkek abszolutizálása
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-10): 2026-08-09-én a teljes cikkszöveg bekerült a feedbe
// (<content:encoded>, a Flipboard követelménye miatt). A törzs belső linkjei
// a LEMEZEN .html-esek — ez szándékos —, így az abszolutizálás után
// .html-es, ÁTIRÁNYÍTÓ URL-ek kerültek a feedbe. A SEO-őrszem jelezte is:
//   "feed.xml: 10 db .html-es (átirányító) saját URL"
// A kanonikus alakunk .html NÉLKÜLI, tehát a feedben is az kell.
// ===================================================================

import assert from 'assert/strict';
import { absolutizeFeedLinks } from './feed-links.js';

const SITE = 'https://aiworldhq.com';
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 feed-linkek\n');

t('a relatív link abszolút lesz', () => {
  // A hírolvasóban a cikk a SAJÁT domainjükön jelenik meg — ott a "/tools"
  // rájuk mutatna, nem ránk.
  const s = absolutizeFeedLinks('<a href="/tools">eszközök</a>', SITE);
  assert.equal(s, `<a href="${SITE}/tools">eszközök</a>`);
});

t('a saját cikk-linkről lekerül a .html', () => {
  const s = absolutizeFeedLinks('<a href="/article/valami-cikk.html">tovább</a>', SITE);
  assert.equal(s, `<a href="${SITE}/article/valami-cikk">tovább</a>`);
  assert.ok(!s.includes('.html'), 'nem marad átirányító URL a feedben');
});

t('a nyelvi útvonalon is levágja', () => {
  const s = absolutizeFeedLinks('<a href="/hu/article/magyar-cikk.html">tovább</a>', SITE);
  assert.equal(s, `${'<a href="' + SITE}/hu/article/magyar-cikk">tovább</a>`);
});

t('KÜLSŐ .html linkhez NEM nyúl', () => {
  // Ez a legfontosabb határ: a hivatalos forrásaink közt van .html-es URL
  // (pl. gyártói dokumentáció). Ha ahhoz hozzányúlnánk, halott linket
  // gyártanánk — és a truth-gate a halott linket blokkolja.
  const kulso = '<a href="https://example.com/docs/guide.html">dokumentáció</a>';
  assert.equal(absolutizeFeedLinks(kulso, SITE), kulso);
});

t('a képekhez és egyéb kiterjesztésekhez nem nyúl', () => {
  const s = absolutizeFeedLinks('<img src="/assets/images/kep.jpg">', SITE);
  assert.equal(s, `<img src="${SITE}/assets/images/kep.jpg">`);
  const pdf = absolutizeFeedLinks('<a href="/valami.pdf">pdf</a>', SITE);
  assert.equal(pdf, `<a href="${SITE}/valami.pdf">pdf</a>`, 'csak a .html-t vágjuk');
});

t('a CDATA-lezárót kettévágja', () => {
  // A CDATA-szakaszt a "]]>" zárja. Ha ez a szövegben előfordul (kódrészlet),
  // az XML eltörik — a hírolvasók ilyenkor az EGÉSZ feedet eldobják.
  const s = absolutizeFeedLinks('kód: ]]> vége', SITE);
  assert.ok(!/]]>/.test(s.replace(/]]]]><!\[CDATA\[>/g, '')), 'nem marad nyers ]]>');
  assert.ok(s.includes(']]]]><![CDATA[>'));
});

t('üres bemenetre üres', () => {
  assert.equal(absolutizeFeedLinks('', SITE), '');
  assert.equal(absolutizeFeedLinks(null, SITE), '');
});

console.log('\n✅ feed-links.test: mind a ' + pass + ' eset rendben');
