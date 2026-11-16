// TESZT — a heti összefoglaló ütemezése (core/heti-utemezes.js). Ingyenes, hálózat nélküli.
// MIÉRT (2026-11-16): a hétfői pótlás a futás napjának hetét (W47) írta volna „késznek” → a 11-22-i vasárnapi
// heti cikk kimaradt volna.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isoHet, hetKulcs, digestFuthat } from './heti-utemezes.js';

let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const D = s => new Date(s);

console.log('\n🧪 heti-utemezes.test');

t('ISO-hét: 11-15 (vasárnap) W46, 11-16 (hétfő) W47, 11-22 (vasárnap) W47', () => {
  assert.equal(isoHet(D('2026-11-15T04:00:00Z')), '2026-W46');
  assert.equal(isoHet(D('2026-11-16T19:00:00Z')), '2026-W47');
  assert.equal(isoHet(D('2026-11-22T04:00:00Z')), '2026-W47');
});

t('hetKulcs: vasárnap a saját hete (mint eddig), hétfőn/kedden az előző vasárnapé', () => {
  assert.equal(hetKulcs(D('2026-11-15T04:00:00Z')), '2026-W46');
  assert.equal(hetKulcs(D('2026-11-16T19:00:00Z')), '2026-W46');
  assert.equal(hetKulcs(D('2026-11-17T02:00:00Z')), '2026-W46');
  assert.equal(hetKulcs(D('2026-11-22T04:00:00Z')), '2026-W47');
});

t('vasárnap fut, ha erre a hétre még nem készült; másodszor nem', () => {
  assert.equal(digestFuthat({ last_week: '2026-W45' }, D('2026-11-15T04:00:00Z')).fut, true);
  assert.equal(digestFuthat({ last_week: '2026-W46' }, D('2026-11-15T20:00:00Z')).fut, false);
  assert.equal(digestFuthat({}, D('2026-11-15T04:00:00Z')).fut, true);
  assert.equal(digestFuthat(null, D('2026-11-15T04:00:00Z')).fut, true);
});

t('hétköznap pótlás nélkül NEM fut', () => {
  assert.equal(digestFuthat({ last_week: '2026-W45' }, D('2026-11-16T19:00:00Z')).fut, false);
});

t('pótlás: csak a megadott UTC-napon fut, utána magától megszűnik', () => {
  const s = { last_week: '2026-W46', potlas_nap: '2026-11-16' };
  assert.equal(digestFuthat(s, D('2026-11-16T19:30:00Z')).fut, true);
  assert.equal(digestFuthat(s, D('2026-11-16T19:30:00Z')).potlas, true);
  assert.equal(digestFuthat(s, D('2026-11-17T02:00:00Z')).fut, false);
});

t('a 11-16-i pótlás után a 11-22-i vasárnap IS fut (a jelző W46, nem W47)', () => {
  const utana = { last_week: hetKulcs(D('2026-11-16T19:30:00Z')) };
  assert.equal(utana.last_week, '2026-W46');
  assert.equal(digestFuthat(utana, D('2026-11-22T04:00:00Z')).fut, true);
});

// ŐR: a digest-agent tényleg ezt használja (szövegként; az agent-modult NEM importáljuk — feltétel nélküli main()).
t('őr: az agents/digest a digestFuthat-tal dönt és a hetKulcs-ot írja a jelzőbe', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'agents', 'digest', 'agent.js'), 'utf-8');
  assert.match(src, /from '\.\.\/\.\.\/core\/heti-utemezes\.js'/);
  assert.match(src, /digestFuthat\(/);
  assert.match(src, /last_week:\s*hetKulcs\(\)/);
  assert.ok(!/last_week:\s*isoWeek\(\)/.test(src), 'a régi (futás-napi) hét-jelző maradt');
});

console.log(`\n${hiba === 0 ? '✅' : '❌'} heti-utemezes.test: ${hiba} bukott`);
if (hiba) process.exit(1);
