// Hivatalos teljes név ne csonkuljon (2026-11-06). A minőség-őr önjavítója a
// guides/guide-topics.json-ban a „MiniMax Code" témát „Code"-ra, a „Brave Leo"-t
// „Leo"-ra írta át (cégnév-levágás) — mindkettő a website/tool-links.json-ban álló
// hivatalos név, a rövid alak nem létező termék. Mindkét irányt mérjük.
import assert from 'assert';
import { readFileSync } from 'fs';
import { canonicalChip, chipKifogas, teljesNevCsonkbol } from './quality-guard.js';

let fail = 0;
const t = (n, f) => { try { f(); console.log('  ✅', n); } catch (e) { fail++; console.log('  ❌', n, '\n    ', e.message); } };

t('a két csonkított név MARAD', () => {
  assert.equal(canonicalChip('MiniMax Code', 'MiniMax'), 'MiniMax Code');
  assert.equal(canonicalChip('Brave Leo', 'Brave'), 'Brave Leo');
  assert.equal(chipKifogas('MiniMax Code', 'MiniMax'), null);
  assert.equal(chipKifogas('Brave Leo', 'Brave'), null);
});

t('a tool-links.json MINDEN kulcsa változatlan marad a kanonizáláson (a saját cégével is)', () => {
  const tl = JSON.parse(readFileSync(new URL('../website/tool-links.json', import.meta.url), 'utf-8'));
  const rossz = [];
  for (const nev of Object.keys(tl.tools)) {
    const ceg = nev.split(' ')[0];           // a legrosszabb eset: az első szó a cégnév
    const ki = canonicalChip(nev, ceg);
    if (ki !== nev) rossz.push(`${nev} → ${ki}`);
  }
  assert.deepEqual(rossz, [], 'hivatalos név csonkult: ' + rossz.join(', '));
});

t('🔑 ELLENIRÁNY: a valódi cégnév-duplázást továbbra is levágja', () => {
  assert.equal(canonicalChip('NVIDIA ChatRTX', 'NVIDIA'), 'ChatRTX');
  assert.equal(canonicalChip('Anthropic Claude', 'Anthropic'), 'Claude');
  assert.equal(chipKifogas('Anthropic Claude', 'Anthropic'), 'cegnev-dupla');
  assert.equal(canonicalChip('MiniMax Agent', 'MiniMax'), 'Agent'); // nem hivatalos név → a régi szabály él
});

t('a témafájlban a 6 cég-téma eszközneve a hivatalos név', () => {
  const j = JSON.parse(readFileSync(new URL('../guides/guide-topics.json', import.meta.url), 'utf-8'));
  const a = Array.isArray(j) ? j : j.topics;
  const kell = { 'getting-started-minimax-code': 'MiniMax Code', 'getting-started-brave-leo': 'Brave Leo' };
  for (const [id, tool] of Object.entries(kell)) {
    const x = a.find(y => y.id === id);
    if (x && x.status === 'todo') assert.equal(x.tool, tool, id);
  }
});

// 11-08 élő hiba: az író a frontmatterbe „Code"-ot írt, az önjavító a _meta-t igazította hozzá.
t('🔑 a frontmatter csonkja helyett a hivatalos teljes név győz (és fordítva NEM)', () => {
  assert.equal(teljesNevCsonkbol('Code', 'MiniMax Code'), 'MiniMax Code');
  assert.equal(teljesNevCsonkbol('Leo', 'Brave Leo'), 'Brave Leo');
  assert.equal(teljesNevCsonkbol('code', 'MiniMax Code'), 'MiniMax Code');
  // nem hivatalos név → a régi szabály marad
  assert.equal(teljesNevCsonkbol('Agent', 'MiniMax Agent'), null);
  // nem csonk (más szó / szóhatár nélkül) → nem nyúl hozzá
  assert.equal(teljesNevCsonkbol('Leonardo', 'Brave Leo'), null);
  assert.equal(teljesNevCsonkbol('ode', 'MiniMax Code'), null);
  assert.equal(teljesNevCsonkbol('MiniMax Code', 'MiniMax Code'), null);
  assert.equal(teljesNevCsonkbol('', 'MiniMax Code'), null);
});

t('a kész cikkekben nincs csonkított hivatalos név (en frontmatter + _meta + hu/es)', () => {
  const kell = { 'ARTICLE_GUIDE_getting-started-minimax-code.json': 'MiniMax Code' };
  for (const [f, tool] of Object.entries(kell)) {
    let a, tr;
    try { a = JSON.parse(readFileSync(new URL('../content/articles/' + f, import.meta.url), 'utf-8')); } catch { continue; }
    assert.equal(a._meta.tool, tool, f + ' _meta');
    assert.equal(((a.article_markdown.match(/^tool:\s*"?([^"\n]*)"?/m)) || [])[1], tool, f + ' en');
    try { tr = JSON.parse(readFileSync(new URL('../content/translations/' + f, import.meta.url), 'utf-8')); } catch { tr = {}; }
    for (const l of ['hu', 'es']) if (tr[l]) assert.equal(((tr[l].match(/^tool:\s*"?([^"\n]*)"?/m)) || [])[1], tool, f + ' ' + l);
  }
});

if (fail) { console.log(`❌ ${fail} hiba`); process.exit(1); }
console.log('✅ hivatalos-chip-nev: minden rendben');
