// Lejárt hírek (2026-10-20, user: „ha 60 napig nem olvassa senki, akkor van törlés — a
// cikkeknél 90 nap!"). Eddig a kor döntött, most a kor ÉS az olvasottság. Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { hirTorlendok } from './news-prune.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

const NOW = Date.parse('2026-11-05T03:00:00Z');
const nap = i => new Date(NOW - i * 864e5).toISOString().slice(0, 10);
// hiánytalan 95 napos napló, naponta 30 sor (egy „kitöltő" cikk), az utolsó nap tegnap
const naplo = (extra = {}) => {
  const d = {};
  for (let i = 1; i <= 95; i++) d[nap(i)] = Array.from({ length: 30 }, (_, k) => ({ path: `/article/kitolto-${k}`, visits: 1 }));
  for (const [n, sorok] of Object.entries(extra)) d[n] = [...(d[n] || []), ...sorok];
  return d;
};
const hir = (slug, korNap) => ({ f: `ARTICLE_${slug}.json`, slug, published_at: new Date(NOW - korNap * 864e5).toISOString() });

console.log('\n🧪 news-prune');

t('📖 a 90 napnál régebbi, de OLVASOTT hír marad (a 09-29-i eset)', () => {
  const r = hirTorlendok({ hirek: [hir('olvasott-regi', 130)], days: naplo({ [nap(3)]: [{ path: '/article/olvasott-regi', visits: 2 }] }), now: NOW });
  assert.equal(r.ok, true);
  assert.deepEqual(r.torlendo, []);
  assert.deepEqual(r.olvasott.map(x => x.slug), ['olvasott-regi']);
});

t('🗑️ a 90 napnál régebbi, 90 napja OLVASATLAN hír törlődik; a spanyol/magyar olvasás is számít', () => {
  const r = hirTorlendok({ hirek: [hir('senki', 120), hir('spanyol', 120)], days: naplo({ [nap(10)]: [{ path: '/es/article/spanyol', visits: 1 }] }), now: NOW });
  assert.deepEqual(r.torlendo.map(x => x.slug), ['senki']);
  assert.deepEqual(r.olvasott.map(x => x.slug), ['spanyol']);
});

t('🌱 a 90 napnál fiatalabb hír SOHA nem törlődik (olvasatlanul sem)', () => {
  const r = hirTorlendok({ hirek: [hir('friss', 40)], days: naplo(), now: NOW });
  assert.equal(r.regiek, 0);
  assert.deepEqual(r.torlendo, []);
});

t('🛑 hiányos napló (nem fedi le a 90 napot) → NEM töröl (fail-closed)', () => {
  const d = naplo(); delete d[nap(50)];
  const r = hirTorlendok({ hirek: [hir('senki', 120)], days: d, now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.ok_ok, /hiányzó nap/);
  assert.deepEqual(r.torlendo, []);
});

t('🛑 üres / elavult napló → NEM töröl', () => {
  assert.equal(hirTorlendok({ hirek: [hir('x', 120)], days: {}, now: NOW }).ok, false);
  assert.equal(hirTorlendok({ hirek: [hir('x', 120)], days: null, now: NOW }).torlendo.length, 0);
});

t('📅 dátum nélküli hírt nem bántunk', () => {
  const r = hirTorlendok({ hirek: [{ slug: 'nincs-datum', published_at: '' }], days: naplo(), now: NOW });
  assert.equal(r.regiek, 0);
});

t('🔌 a Házmester ezt a döntést használja (nem a puszta kort)', () => {
  const src = readFileSync(join(ROOT, 'core', 'housekeeping.js'), 'utf-8');
  assert.match(src, /import \{ hirTorlendok \} from '\.\/news-prune\.js'/);
  assert.match(src, /hirTorlendok\(\{/);
  assert.doesNotMatch(src, /if \(t >= cutoff\) continue;/, 'a régi, csak-kor szabály maradt');
});

if (hiba) { console.log(`\n❌ news-prune.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ news-prune.test: mind rendben');
