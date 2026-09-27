// ===================================================================
// TESZT — az útmutató tényanyaga a saját híreinkből (core/guide-sources.js).
// Ingyenes, hálózat nélkül, hamis adatokkal.
// ===================================================================
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { valasztHireket, hirBlokk, trendBlokk, HIR_MAX } from './guide-sources.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 Útmutató-tényanyag a saját híreinkből\n');

const MOST = Date.parse('2026-09-27T12:00:00Z');
const nap = n => new Date(MOST - n * 864e5).toISOString();
const hir = (file, title, tool, kor, rov = '', extra = {}) => ({
  file, title, tool, company: '', publishedAt: nap(kor),
  md: `---\ntitle: "${title}"\n---\n\n# ${title}\n\n> **In short:** ${rov}\n\nBody text.`, snippet: '', ...extra
});
const HIREK = [
  hir('A.json', 'How to Use Voice Mode in ChatGPT on Your Phone', 'ChatGPT', 10, 'Voice mode lets you talk to ChatGPT.'),
  hir('B.json', 'OpenAI Signs a Data Center Deal', 'ChatGPT', 5, 'A new infrastructure agreement.'),
  hir('C.json', 'Parallel AI Agents: What GitHub Copilot\'s New Mode Does', '', 3, 'Plan a family trip of coding tasks with parallel agents.'),   // szándékosan illő szavak: CSAK a GitHub-kizárás foghatja meg
  hir('D.json', 'How to Use Microsoft Copilot to Plan Your Day', '', 8, 'Copilot helps you plan a trip or a day.'),
  hir('E.json', 'ChatGPT Voice Gets New Accents', 'ChatGPT', 200, 'Old voice news.'),
  hir('P.json', 'Old but Paired Announcement', 'Gemini', 400, 'Paired.', { snippet: 'OFFICIAL EXCERPT TEXT' })
];

t('🔑 a párosított hír (source_news) mindig elöl áll, kortól függetlenül', () => {
  const v = valasztHireket({ title: 'x', tool: 'Gemini', source_news: { file: 'P.json', title: 'Old' } }, HIREK, MOST);
  assert.equal(v[0].file, 'P.json');
});

t('ugyanarról az eszközről CSAK a témához illő hír jön (a „data center" nem)', () => {
  const v = valasztHireket({ title: 'Talk to ChatGPT by voice while cooking', tool: 'ChatGPT' }, HIREK, MOST);
  assert.deepEqual(v.map(h => h.file), ['A.json']);
});

t('🔑 „Copilot" témához NEM jön „GitHub Copilot" hír', () => {
  const v = valasztHireket({ title: 'Plan a family trip with Copilot', tool: 'Copilot' }, HIREK, MOST);
  assert.ok(!v.some(h => h.file === 'C.json'), 'GitHub Copilot hír került a Copilot-útmutatóhoz');
  assert.ok(v.some(h => h.file === 'D.json'), 'a valódi Copilot-hír kimaradt');
});

t(`legfeljebb ${HIR_MAX} hír, és a ${'>'}120 napos (nem párosított) hír kimarad`, () => {
  const v = valasztHireket({ title: 'Use ChatGPT voice accents while cooking', tool: 'ChatGPT' }, HIREK, MOST);
  assert.ok(v.length <= HIR_MAX);
  assert.ok(!v.some(h => h.file === 'E.json'), 'régi hír került be');
});

t('nincs illő hír → üres blokk (marad a mostani, óvatos mód)', () => {
  assert.equal(hirBlokk(valasztHireket({ title: 'Knit a scarf', tool: 'Midjourney' }, HIREK, MOST)), '');
});

t('a blokk: tényalap-utasítás, UI csak ha a szöveg megnevezi, a hivatalos kivonat benne', () => {
  const b = hirBlokk(valasztHireket({ title: 'x', tool: 'Gemini', source_news: 'P.json' }, HIREK, MOST));
  assert.match(b, /FACT BASE/);
  assert.match(b, /Name a button, menu or screen ONLY if these texts name it/);
  assert.match(b, /OFFICIAL EXCERPT TEXT/);
  assert.ok(!/^---/m.test(b.split('FACT BASE')[1]), 'a frontmatter bekerült a blokkba');
});

t('„mi újság most" blokk: csak friss (≤14 nap) hírek, legújabb elöl, a „próbáld ki" kéréssel', () => {
  const b = trendBlokk(HIREK, MOST);
  assert.match(b, /WHAT IS NEW RIGHT NOW/);
  assert.match(b, /Make 1-2 of your topics a hands-on "try this new thing" guide/);
  assert.ok(b.indexOf('Parallel AI Agents') < b.indexOf('How to Use Voice Mode'), 'nem a legújabb áll elöl');
  assert.ok(!/Old but Paired|New Accents/.test(b), 'régi hír került a trend-blokkba');
  assert.equal(trendBlokk([], MOST), '');
  const tema = readFileSync(join(ROOT, 'agents', 'guide', 'agent.js'), 'utf-8');
  assert.match(tema, /trendBlokk\(sajatHirek\(\)\)/, 'a témaválasztó nem kapja meg');
});

t('az útmutató-író TÉNYLEG megkapja (bekötés)', () => {
  const src = readFileSync(join(ROOT, 'agents', 'guide', 'agent.js'), 'utf-8');
  assert.match(src, /buildUserPrompt\(topic, brandContext, lessons, skills, hirBlokk\(valasztott\)\)/);
  assert.match(src, /\$\{topic\.angle \|\| ''\}\$\{hirek\}/);
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
