// TESZT — a fordító nem honosíthatja a példa-domaint (core/example-domain.js). Ingyenes, hálózat nélkül.
import assert from 'assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { peldaDomainJavit } from './example-domain.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = (nev, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) { bukott++; console.log('  ❌ ' + nev + '\n     ' + String(e.message).split('\n')[0]); }
};
console.log('🧪 Példa-domain a fordításban\n');

t('🔑 a honosított alak visszaíródik (aldomain és e-mail is)', () => {
  assert.equal(peldaDomainJavit('apunta a usps-tracking.ejemplo.com/pagar-ahora'), 'apunta a usps-tracking.example.com/pagar-ahora');
  assert.equal(peldaDomainJavit('`tunombre@ejemplo.com`'), '`tunombre@example.com`');
  assert.equal(peldaDomainJavit('`te_neved@pelda.hu` → Bejelentkezés'), '`te_neved@example.com` → Bejelentkezés');
  assert.equal(peldaDomainJavit('a te.email@példa.com címet'), 'a te.email@example.com címet');
});

t('nem nyúl mást: a szó maga és a hosszabb név marad', () => {
  assert.equal(peldaDomainJavit('Por ejemplo, abre la app.'), 'Por ejemplo, abre la app.');
  assert.equal(peldaDomainJavit('miejemplo.com'), 'miejemplo.com');
  assert.equal(peldaDomainJavit(null), null);
});

t('a fordító MENTÉSKOR használja', () => {
  const a = readFileSync(join(ROOT, 'agents', 'translator', 'agent.js'), 'utf-8');
  assert.match(a, /import \{ peldaDomainJavit \} from '\.\.\/\.\.\/core\/example-domain\.js';/);
  assert.match(a, /function saveCache\(file, data\) \{[\s\S]{0,400}peldaDomainJavit/);
});

t('🔑 a mostani fordításokban nincs honosított példa-domain', () => {
  const D = join(ROOT, 'content', 'translations');
  const rossz = readdirSync(D).filter(f => f.endsWith('.json'))
    .filter(f => { const s = readFileSync(join(D, f), 'utf-8'); return peldaDomainJavit(s) !== s; });
  assert.equal(rossz.length, 0, rossz.length + ' fájlban: ' + rossz.slice(0, 3).join(', '));
});

console.log(`\n${bukott ? '❌' : '✅'} ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
