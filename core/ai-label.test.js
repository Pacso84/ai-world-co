// ===================================================================
// TESZT — „Written by AI" jelölés minden kimenő poszt-szövegben (EU AI Act,
// 2026-09-27). Ingyenes, hálózat nélkül.
// ===================================================================
import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { AI_JELOLES } from './social-text.js';
import { reelCaption } from './reel-post.js';
import { promoCaption } from './packs-reel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 MI-jelölés a poszt-szövegekben\n');

t('a jelölés szövege kimondja, hogy MI írta', () => {
  assert.match(AI_JELOLES, /Written by AI/);
});

t('Reel-felirat: a jelölés a végén', () => {
  const c = reelCaption({ _meta: { slug: 'how-to-test' }, article_markdown: '---\ntitle: "How to test"\nsubtitle: "A short test guide"\n---\n\n# Body\n' });
  assert.ok(c.includes(AI_JELOLES), c);
});

t('csomag-reklám felirat: a jelölés a végén', () => {
  assert.ok(promoCaption({ utmutatoDb: 10 }).includes(AI_JELOLES));
});

t('Facebook-poszt: a poster a jelöléssel zárja a feliratot', () => {
  const src = readFileSync(join(ROOT, 'agents', 'social', 'poster.js'), 'utf-8');
  const sor = src.split('\n').find(l => l.includes('const caption = `')) || '';
  assert.ok(sor.trim().endsWith('${AI_JELOLES}`;'), 'a FB-felirat nem a jelöléssel zárul: ' + sor.trim());
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
