// ===================================================================
// TESZT — útmutató-frissítés, ha az eszköz változik (core/guide-freshness.js).
// Ingyenes, hálózat nélkül.
// ===================================================================
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { frissitendok, maiFrissitesek, utolsoValtozas, nincsValtozas, FRISS_NAPI } from './guide-freshness.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 Útmutató-frissítés új hír alapján\n');

const MOST = Date.parse('2026-09-27T12:00:00Z');
const nap = n => new Date(MOST - n * 864e5).toISOString();
const hir = (file, title, tool, kor, rov) => ({ file, title, tool, company: '', publishedAt: nap(kor),
  md: `---\ntitle: "${title}"\n---\n\n# ${title}\n\n> **In short:** ${rov}\n`, snippet: '' });
const utm = (file, title, tool, meta) => ({ file, title, tool, company: '', meta });

const HIREK = [
  hir('N1.json', 'ChatGPT Custom Instructions Get Memory Controls', 'ChatGPT', 3, 'Custom instructions now include memory settings.'),
  hir('N2.json', 'OpenAI Signs a Data Center Deal', 'ChatGPT', 2, 'Infrastructure agreement.'),
  hir('N3.json', 'ChatGPT Custom Instructions Old Change', 'ChatGPT', 60, 'Custom instructions memory settings.')
];
const G1 = utm('G1.json', 'How to set ChatGPT custom instructions for memory', 'ChatGPT', { published_at: nap(40) });

t('🔑 az útmutató UTÁN megjelent, illő hír frissítést indít', () => {
  const r = frissitendok([G1], HIREK, MOST);
  assert.equal(r.length, 1);
  assert.equal(r[0].hirek[0].file, 'N1.json');
});

t('a témához nem illő hír (ugyanaz az eszköz) NEM indít frissítést', () => {
  const r = frissitendok([utm('G2.json', 'How to plan a birthday party menu', 'ChatGPT', { published_at: nap(40) })], HIREK, MOST);
  assert.equal(r.length, 0);
});

t('a 30 napnál régebbi hír és az útmutató ELŐTTI hír nem számít', () => {
  const r = frissitendok([utm('G3.json', 'How to set ChatGPT custom instructions for memory', 'ChatGPT', { published_at: nap(1) })], HIREK, MOST);
  assert.equal(r.length, 0, 'az útmutató ÚJABB a hírnél, mégis frissítené');
});

t('az ELLENŐRIZVE / FRISSÍTVE jelölés után ugyanarra a hírre nem kérdez rá újra', () => {
  assert.equal(frissitendok([{ ...G1, meta: { ...G1.meta, fresh_checked_at: nap(1) } }], HIREK, MOST).length, 0);
  assert.equal(frissitendok([{ ...G1, meta: { ...G1.meta, fresh_updated_at: nap(10) } }], HIREK, MOST).length, 0);
  assert.equal(utolsoValtozas({ published_at: nap(40), howto_upgraded_at: nap(5) }), Date.parse(nap(5)));
});

t(`🔑 naponta legfeljebb ${FRISS_NAPI} frissítés (a költség miatt)`, () => {
  const maiKesz = utm('K.json', 'x', 'ChatGPT', { published_at: nap(90), fresh_updated_at: new Date(MOST - 3600e3).toISOString() });
  assert.equal(maiFrissitesek([maiKesz], MOST), 1);
  assert.equal(frissitendok([maiKesz, G1], HIREK, MOST).length, Math.max(0, FRISS_NAPI - 1));
});

t('NO_CHANGE felismerése', () => {
  assert.ok(nincsValtozas('NO_CHANGE'));
  assert.ok(nincsValtozas('  no change — the news does not affect this guide'));
  assert.ok(!nincsValtozas('---\ntitle: "x"\n---'));
});

t('a felújító TÉNYLEG futtatja (mindkét ágon), NO_CHANGE-re és bukásra is jelöl', () => {
  const src = readFileSync(join(ROOT, 'agents', 'iro', 'upgrade-howtos.js'), 'utf-8');
  assert.equal((src.match(/await frissites\(brandContext\)/g) || []).length, 2, 'nem fut le mindkét ágon (van / nincs vékony cikk)');
  assert.match(src, /output exactly: NO_CHANGE/);
  assert.ok((src.match(/fresh_checked_at: new Date\(\)\.toISOString\(\)/g) || []).length >= 2, 'NO_CHANGE / bukás után újra és újra fizetne ugyanerre');
  assert.match(src, /await truthGate\(\{ \.\.\.u\.data, article_markdown: text \}/);
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
