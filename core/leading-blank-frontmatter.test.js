// TESZT — üres sorral kezdődő cikk ne némítsa el a fordítót (2026-09-28).
// Élő eset: a 09-27-i heti összefoglaló "\n\n---"-tal kezdődött; a digest önellenőrzése
// (trimStart) átengedte, a fordító szigorú /^---/ mintája nem → hu/es fordítás NEM KÉSZÜLT,
// „a forrásnak nincs frontmatter-e" hibával, ami nem kerül újrapróbálásra.
import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 Üres sorral kezdődő frontmatter\n');

t('a fordító a frontmattert a kezdő üres sorok levágása UTÁN keresi', () => {
  const a = readFileSync(join(ROOT, 'agents', 'translator', 'agent.js'), 'utf-8');
  assert.match(a, /function splitFrontmatter\(md\) \{[\s\S]{0,300}?const m = String\(md \|\| ''\)\.trimStart\(\)\.match\(/);
});

t('a heti összefoglaló levágott szöveget ment', () => {
  const a = readFileSync(join(ROOT, 'agents', 'digest', 'agent.js'), 'utf-8');
  assert.match(a, /article_markdown: response\.text\.trimStart\(\),/);
});

t('🔑 egyetlen élő cikk sem kezdődik üres sorral a frontmatter előtt', () => {
  const D = join(ROOT, 'content', 'articles');
  const rossz = readdirSync(D).filter(f => f.endsWith('.json')).filter(f => {
    const md = JSON.parse(readFileSync(join(D, f), 'utf-8')).article_markdown;
    return typeof md === 'string' && /^\s+---/.test(md);
  });
  assert.equal(rossz.length, 0, rossz.length + ' cikk: ' + rossz.slice(0, 3).join(', '));
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
