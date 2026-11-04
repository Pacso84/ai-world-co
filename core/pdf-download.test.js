// ===================================================================
// INGYENES PDF-LETÖLTÉS SZÁMLÁLÓ — tesztek (2026-10-07)
// ===================================================================
// User: „jó lenne a könyvekhez mérő, hány töltik le". A CF RUM csak a
// HTML-oldalakat látja, a zóna-analitikához a kulcsunknak nincs joga →
// saját számláló: a honlap middleware-je jelez, a Worker számol.
//
// A mérce IRÁNYA (2026-08-14 óta a szabály): ha minden kérést számolnánk,
// a robotok és a PDF-olvasó részletes (Range) kérései FELFÚJNÁK a számot —
// egy olyan siker-szám, ami nem embereket mér, rosszabb a semminél.
// ===================================================================

import assert from 'assert/strict';
import { letoltesFajl, dlKulcs, pdfLetoltesSor, PDF_FAJL_MINTA } from './pdf-download.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 PDF-letöltés számláló\n');

const BONGESZO = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const k = (o = {}) => ({ path: '/assets/free/aiworldhq-all-en.pdf', method: 'GET', status: 200, range: null, ua: BONGESZO, ...o });

t('egy ember sima letöltése számít — a fájlnévvel', () => {
  assert.equal(letoltesFajl(k()), 'aiworldhq-all-en.pdf');
  assert.equal(letoltesFajl(k({ path: '/assets/free/aiworldhq-safe-es.pdf' })), 'aiworldhq-safe-es.pdf');
});

t('a PDF-olvasó RÉSZLETES kérései közül csak az ELSŐ számít (bytes=0-)', () => {
  assert.equal(letoltesFajl(k({ status: 206, range: 'bytes=0-' })), 'aiworldhq-all-en.pdf');
  assert.equal(letoltesFajl(k({ status: 206, range: 'bytes=0-65535' })), 'aiworldhq-all-en.pdf');
  assert.equal(letoltesFajl(k({ status: 206, range: 'bytes=65536-131071' })), null, 'a folytatás külön letöltésnek számított');
});

t('robot, előnézet, parancssor NEM ember', () => {
  for (const ua of ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)',
    'facebookexternalhit/1.1', 'curl/8.4.0', 'python-requests/2.31', 'Mozilla/5.0 HeadlessChrome/129.0', '', null]) {
    assert.equal(letoltesFajl(k({ ua })), null, 'robotot számolt: ' + ua);
  }
});

t('csak sikeres GET: HEAD, 304, 404 nem letöltés', () => {
  assert.equal(letoltesFajl(k({ method: 'HEAD' })), null);
  assert.equal(letoltesFajl(k({ status: 304 })), null, 'a gyorsítótárból újranyitott fájl új letöltésnek számított');
  assert.equal(letoltesFajl(k({ status: 404 })), null);
});

t('csak a MI ingyenes PDF-jeink — más útvonal, kitalált név, trükk nem', () => {
  for (const path of ['/packs', '/assets/fb/x.jpg', '/assets/free/', '/assets/free/../x.pdf',
    '/assets/free/aiworldhq-all-de.pdf', '/assets/free/evil.pdf', '/assets/free/aiworldhq-all-en.pdf.exe']) {
    assert.equal(letoltesFajl(k({ path })), null, 'ezt számolta: ' + path);
  }
  assert.ok(PDF_FAJL_MINTA.test('aiworldhq-automate-es.pdf'));
});

t('a KV-kulcs napra bontott (UTC), és csak érvényes fájlra készül', () => {
  assert.equal(dlKulcs('aiworldhq-all-en.pdf', Date.parse('2026-10-08T23:59:00Z')), 'dl:2026-10-08:aiworldhq-all-en.pdf');
  assert.equal(dlKulcs('../../x', Date.now()), null);
});

// ── a riport-sor ────────────────────────────────────────────────────
const MOST = Date.parse('2026-10-09T06:00:00Z');

t('a riport a TEGNAPI letöltéseket írja, fájlonként, a 7 napos összeggel', () => {
  const dl = { '2026-10-08': { 'aiworldhq-all-en.pdf': 2, 'aiworldhq-safe-es.pdf': 1 }, '2026-10-05': { 'aiworldhq-work-en.pdf': 4 } };
  const sor = pdfLetoltesSor(dl, MOST);
  assert.match(sor, /tegnap: 3/);
  assert.match(sor, /all-en 2/);
  assert.match(sor, /safe-es 1/);
  assert.match(sor, /7 nap: 7/);
});

t('tegnap 0, de a héten volt → a sor marad (a 0 is hír), sosem volt → nincs sor', () => {
  assert.match(pdfLetoltesSor({ '2026-10-05': { 'aiworldhq-work-en.pdf': 4 } }, MOST), /tegnap: 0 · 7 nap: 4/);
  assert.equal(pdfLetoltesSor({}, MOST), '');
  assert.equal(pdfLetoltesSor(null, MOST), '');
});

t('🔴 ha a számláló NEM VÁLASZOLT, az nem nulla — külön mondat', () => {
  // Az „elromlott" és a „senki nem töltött le" kívülről egyforma lenne.
  assert.match(pdfLetoltesSor({ error: true }, MOST), /nem sikerült lekérdezni/);
});

// ── a lánc bekötése (a fájlok nem importálhatók: a riport fut, a middleware Pages-környezet) ──
t('🔌 a lánc be van kötve: middleware → Worker → napi riport', async () => {});
{
  const { readFileSync } = await import('fs');
  const ROOT = new URL('../', import.meta.url);
  const mw = readFileSync(new URL('functions/_middleware.js', ROOT), 'utf-8');
  assert.match(mw, /from '\.\.\/core\/pdf-download\.js'/, 'a middleware nem a közös szabályt használja');
  assert.match(mw, /letoltesFajl\(\{/, 'a middleware nem dönt a letöltésről');
  assert.match(mw, /waitUntil\(/, 'a jelzés nem a háttérben megy — lassítaná a letöltést');
  assert.match(mw, /\/dl-hit/, 'a middleware nem a Worker számlálójának jelez');
  const dr = readFileSync(new URL('core/daily-report.js', ROOT), 'utf-8');
  assert.match(dr, /pdfLetoltesSor\(exp\.__dl\)/, 'a napi riport nem írja ki a letöltéseket');
}

console.log('\n✅ pdf-download.test: mind a ' + pass + ' eset rendben');
