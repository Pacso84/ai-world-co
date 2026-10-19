// Útmutató-összevonás (2026-10-19, user: „igen mehet!" — „csak a valódi ismétléseket").
// Kutatás: memoria/reports/Látogatószerzés a mostani oldalra.md — „kevesebb, erősebb
// oldal": az átfedő útmutatók a legerősebbikbe költöznek, 301-gyel (a régi Facebook-
// linkek így a megmaradó útmutatóra visznek, nem 404-re). Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

/** megszűnt → megmaradó (a 10-19-i, user által jóváhagyott lista). */
export const OSSZEVONAS_2026_10_19 = {
  'how-to-summarize-a-long-article-or-report-in-5-minutes': 'summarise-any-long-document-or-article-with-ai',
  'plan-a-week-of-family-dinners-with-one-ai-prompt': 'plan-a-week-of-family-dinners-and-a-matching-grocery-list-with-qwen',
  'how-to-tailor-your-resume-to-a-job-posting-using-claude': 'how-to-tailor-your-resume-to-a-specific-job-posting-in-15-minutes',
  'write-a-polite-complaint-email-with-grok-that-actually-gets-results': 'how-to-write-a-polite-but-firm-complaint-email-that-actually-gets-a-re',
  'write-a-polite-complaint-email-to-a-company-with-deepseek': 'how-to-write-a-polite-but-firm-complaint-email-that-actually-gets-a-re',
  'write-a-polite-complaint-email-with-le-chat-in-minutes': 'how-to-write-a-polite-but-firm-complaint-email-that-actually-gets-a-re'
};

const hist = JSON.parse(readFileSync(join(ROOT, 'content', 'slug-history.json'), 'utf-8'));
const elo = new Set();
for (const f of readdirSync(join(ROOT, 'content', 'articles'))) {
  try { const s = JSON.parse(readFileSync(join(ROOT, 'content', 'articles', f), 'utf-8'))._meta?.slug; if (s) elo.add(s); } catch { /* sérült fájl */ }
}

console.log('\n🧪 guide-merge');

t('↪️ mind a 6 megszűnt útmutató címe a megmaradó útmutatóra visz (slug-history)', () => {
  for (const [from, to] of Object.entries(OSSZEVONAS_2026_10_19)) assert.equal(hist[from], to, 'hiányzó/rossz átirányítás: ' + from);
});

t('🗑️ a megszűnt útmutatók NINCSENEK a tartalomban (különben két oldal versengene)', () => {
  for (const from of Object.keys(OSSZEVONAS_2026_10_19)) assert.ok(!elo.has(from), 'még létezik: ' + from);
});

t('✅ a megmaradó útmutatók ÉLNEK', () => {
  for (const to of new Set(Object.values(OSSZEVONAS_2026_10_19))) assert.ok(elo.has(to), 'a cél nem létezik: ' + to);
});

if (hiba) { console.log(`\n❌ guide-merge.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ guide-merge.test: mind rendben');
