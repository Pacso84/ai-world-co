// core/olvasoi-kedvenc.js — „🔥 Olvasóink kedvence” automatikus kiemelés (2026-10-23). Ingyenes, hálózat nélküli.
//
// A MÉRCE IRÁNYA (user 10-23: „a kiemelés az olvasott cikkeknél legyen automatikus … azt ajánljuk,
// aminek van megtekintése, legalább a top 10-et!”): a veszély az, hogy (1) olvasó NÉLKÜLI útmutató
// kap kiemelést, (2) a magyar oldal (a tulaj böngészése) torzítja, (3) túl rövid naplóból döntünk,
// (4) hír vagy már törölt útmutató kerül a listára.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { olvasoiKedvencek, KEDVENC_DB } from './olvasoi-kedvenc.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = Date.parse('2026-10-23T12:00:00Z');
const nap = i => new Date(NOW - i * 864e5).toISOString().slice(0, 10);
// 20 napnyi napló, alapból üres napokkal
const naplo = (sorok = {}) => { const d = {}; for (let i = 1; i <= 20; i++) d[nap(i)] = []; return Object.assign(d, sorok); };
const UTM = new Set(['a-guide', 'b-guide', 'c-guide', 'hu-only-guide', 'zero-guide']);

assert.equal(KEDVENC_DB, 10);

// 1) sorrend olvasottság szerint; en + es együtt; hír nem kerül be; 0 olvasós nem kerül be
{
  const d = naplo({
    [nap(1)]: [{ path: '/article/a-guide', visits: 3 }, { path: '/es/article/b-guide', visits: 5 }, { path: '/article/some-news', visits: 99 }, { path: '/article/zero-guide', visits: 0 }],
    [nap(2)]: [{ path: '/article/a-guide', visits: 4 }, { path: '/article/c-guide', visits: 1 }]
  });
  assert.deepEqual(olvasoiKedvencek(d, UTM, { now: NOW }), ['a-guide', 'b-guide', 'c-guide']);
}

// 2) a /hu/ nézettség NEM számít (a tulaj böngészése)
{
  const d = naplo({ [nap(1)]: [{ path: '/hu/article/hu-only-guide', visits: 50 }, { path: '/article/c-guide', visits: 1 }] });
  assert.deepEqual(olvasoiKedvencek(d, UTM, { now: NOW }), ['c-guide']);
}

// 3) csak az utolsó 30 nap
{
  const d = naplo({ [nap(1)]: [{ path: '/article/c-guide', visits: 1 }], [nap(40)]: [{ path: '/article/a-guide', visits: 500 }] });
  assert.deepEqual(olvasoiKedvencek(d, UTM, { now: NOW }), ['c-guide']);
}

// 4) legfeljebb 10
{
  const sok = new Set(), sorok = [];
  for (let i = 0; i < 15; i++) { sok.add('g-' + i); sorok.push({ path: '/article/g-' + i, visits: 100 - i }); }
  const ki = olvasoiKedvencek(naplo({ [nap(1)]: sorok }), sok, { now: NOW });
  assert.equal(ki.length, 10);
  assert.equal(ki[0], 'g-0');
}

// 5) túl rövid napló (14 napnál kevesebb adatos nap a 30-ból) → nincs kiemelés
{
  const d = {}; for (let i = 1; i <= 5; i++) d[nap(i)] = [{ path: '/article/a-guide', visits: 9 }];
  assert.deepEqual(olvasoiKedvencek(d, UTM, { now: NOW }), []);
}

// 6) hibás / hiányzó napló → üres, nem dob
assert.deepEqual(olvasoiKedvencek(null, UTM, { now: NOW }), []);
assert.deepEqual(olvasoiKedvencek({ [nap(1)]: 'szemét' }, UTM, { now: NOW }), []);

// 7) BEKÖTÉS-ŐR: a build olvassa a naplót, kiteszi a címkét és az Útmutatók-sort, 3 nyelven
{
  const b = readFileSync(join(ROOT, 'website', 'build.js'), 'utf-8');
  assert.match(b, /import \{ olvasoiKedvencek \} from '\.\.\/core\/olvasoi-kedvenc\.js'/);
  assert.match(b, /class="g-fav"/);
  assert.match(b, /class="kedvenc-sor"/);
  for (const k of ['favBadge', 'favRowH']) assert.equal((b.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 3, k + ' mindhárom nyelven');
  assert.ok(!/Szerkesztő ajánlja|Editor['’]s pick/i.test(b), 'nem ember választotta — nem írhatjuk, hogy a szerkesztő ajánlja');
}

console.log('✅ olvasoi-kedvenc: automatikus top 10 rendben');
