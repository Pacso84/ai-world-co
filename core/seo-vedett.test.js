// ===================================================================
// TESZT — Bing-győztes oldalak védelme (core/seo-vedett.js). Ingyenes, hálózat nélkül.
// A számok a 2026-11-25-i valódi Bing GetPageStats-ból (10-26–11-20).
// ===================================================================
import assert from 'assert/strict';
import { vedettLista } from './seo-vedett.js';

let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 SEO védett oldalak (Bing)\n');

const U = 'https://aiworldhq.com/article/';
const het = iso => `/Date(${Date.parse(iso)})/`;
const sor = (slug, iso, megj, katt, elo = U) => ({ Query: elo + slug, Date: het(iso), Impressions: megj, Clicks: katt });
const MOST = Date.parse('2026-11-25T12:00:00Z');
const SOROK = [
  // 4 hét: 10-30, 11-06, 11-13, 11-20 — egy-egy sorban a 4 hetes összeg (a hetek közti bontás nem számít)
  sor('how-to-run-stable-diffusion-on-your-computer-without-the-tech-headache', '2026-11-13T00:00:00Z', 1565, 150),
  sor('how-to-find-your-google-meet-recordings-transcripts-and-notes', '2026-11-06T00:00:00Z', 1659, 37),
  sor('how-to-generate-images-with-google-gemini-a-beginner-s-guide', '2026-11-20T00:00:00Z', 1696, 94),
  sor('try-free-ai-demos-in-your-browser-with-hugging-face-spaces', '2026-10-30T00:00:00Z', 812, 17),
  sor('kicsi-de-jo', '2026-11-20T00:00:00Z', 40, 10),                                  // kevés megjelenés → nem védett
  sor('how-to-find-your-google-meet-recordings-transcripts-and-notes', '2026-11-20T00:00:00Z', 66, 2, 'https://aiworldhq.com/es/article/'),
  sor('regi-gyoztes', '2026-10-09T00:00:00Z', 900, 300),                               // 6 hete → kívül esik
];

t('a Bing-győztesek védettek, a gyenge (Meet 2,2%) és a kicsi nem', () => {
  const r = vedettLista(SOROK, { most: MOST });
  assert.deepEqual(r.vedett.sort(), [
    'how-to-generate-images-with-google-gemini-a-beginner-s-guide',
    'how-to-run-stable-diffusion-on-your-computer-without-the-tech-headache'
  ]);
});
t('az átlag csak az angol cikkoldalakból, a 4 hetes ablakból', () => {
  const r = vedettLista(SOROK, { most: MOST });
  const vart = (150 + 37 + 94 + 17 + 10) / (1565 + 1659 + 1696 + 812 + 40);
  assert.ok(Math.abs(r.atlagArany - vart) < 1e-9, `${r.atlagArany} ≠ ${vart}`);
});
t('a /es/ és a régi (ablakon kívüli) sor nem számít', () => {
  const r = vedettLista(SOROK, { most: MOST });
  assert.ok(!r.vedett.includes('regi-gyoztes'));
});
t('üres / hibás bemenet → üres lista, nem omlik össze', () => {
  assert.deepEqual(vedettLista([], { most: MOST }).vedett, []);
  assert.deepEqual(vedettLista(null, { most: MOST }).vedett, []);
  assert.deepEqual(vedettLista([{ Query: 'x', Date: 'rossz' }], { most: MOST }).vedett, []);
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} rendben, ${bukott} bukott`);
if (bukott) process.exit(1);
