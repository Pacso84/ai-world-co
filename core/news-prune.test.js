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

// 2026-10-21 (user: „folytassuk a hírek törlését is és értesítés a keresőknek!”)
const roviditett = (napDb, extra = {}) => { const d = naplo(extra); for (let i = napDb + 1; i <= 95; i++) delete d[nap(i)]; return d; };

t('▶️ 80 napos hiánytalan napló + minAblak 75 → törlés INDUL a teljes mért időszakkal; az olvasott marad', () => {
  const r = hirTorlendok({ hirek: [hir('senki', 120), hir('olvasott', 120)], days: roviditett(80, { [nap(70)]: [{ path: '/hu/article/olvasott', visits: 1 }] }), now: NOW, minAblak: 75 });
  assert.equal(r.ok, true, r.ok_ok);
  assert.equal(r.ablak, 80);
  assert.deepEqual(r.torlendo.map(h => h.slug), ['senki']);
  assert.deepEqual(r.olvasott.map(h => h.slug), ['olvasott']);
});

t('🛑 70 napos napló + minAblak 75 → NEM töröl; alapértelmezésben (minAblak = 90) a 80 napos sem', () => {
  const r = hirTorlendok({ hirek: [hir('senki', 120)], days: roviditett(70), now: NOW, minAblak: 75 });
  assert.equal(r.ok, false); assert.match(r.ok_ok, /hiányzó nap.*hiánytalan: 70 nap, kell legalább 75/);
  assert.equal(hirTorlendok({ hirek: [hir('senki', 120)], days: roviditett(80), now: NOW }).ok, false, 'a szigorú alapérték marad');
});

t('📏 ha a napló eléri a 90 napot, az ablak magától 90 (minAblak mellett is); a KOR-határ mindig 90', () => {
  const r = hirTorlendok({ hirek: [hir('senki', 120), hir('fiatal', 85)], days: naplo(), now: NOW, minAblak: 75 });
  assert.equal(r.ablak, 90);
  assert.deepEqual(r.torlendo.map(h => h.slug), ['senki'], 'a 85 napos hír túl fiatal a törléshez');
});

t('🔔 bekötés: a Házmester min. 75 napot kér, a törölt hírt listára teszi (IndexNow) és kiveszi a rá mutató linkeket', () => {
  const src = readFileSync(join(ROOT, 'core', 'housekeeping.js'), 'utf-8');
  assert.match(src, /const NEWS_MIN_ABLAK = 75;/);
  assert.match(src, /hirTorlendok\(\{ hirek, days, now: Date\.now\(\), keepDays: NEWS_KEEP_DAYS, minAblak: NEWS_MIN_ABLAK \}\)/);
  assert.match(src, /hirLinkDb = linkekKiMindenhol\(hirSlugok\)/);
  assert.match(src, /'torolt-hirek\.json'/);
  const ix = readFileSync(join(ROOT, 'core', 'indexnow.js'), 'utf-8');
  assert.match(ix, /'memory', 'torolt-hirek\.json'/);
});

t('🔌 a Házmester ezt a döntést használja (nem a puszta kort)', () => {
  const src = readFileSync(join(ROOT, 'core', 'housekeeping.js'), 'utf-8');
  assert.match(src, /import \{ hirTorlendok \} from '\.\/news-prune\.js'/);
  assert.match(src, /hirTorlendok\(\{/);
  assert.doesNotMatch(src, /if \(t >= cutoff\) continue;/, 'a régi, csak-kor szabály maradt');
});

t('🟡 10-26: egy becsült (mintavételezett) nap nem állítja le a törlést, és a rajta olvasott hír marad', () => {
  const d = naplo();
  d[nap(3)] = [{ path: '/article/csak-becsult-napon', visits: 1, becsult: true },
    ...Array.from({ length: 25 }, (_, k) => ({ path: `/article/kitolto-${k}`, visits: 1, becsult: true }))];
  const r = hirTorlendok({ hirek: [hir('senki', 120), hir('csak-becsult-napon', 120)], days: d, now: NOW, minAblak: 75 });
  assert.equal(r.ok, true, r.ok_ok);
  assert.deepEqual(r.torlendo.map(h => h.slug), ['senki']);
  assert.deepEqual(r.olvasott.map(h => h.slug), ['csak-becsult-napon']);
  // a hibás, 1 soros „becsült” válasz megállít (független átnézés 10-26)
  const hibas = { ...d, [nap(3)]: [{ path: '/', visits: 100, becsult: true }] };
  assert.equal(hirTorlendok({ hirek: [hir('senki', 120)], days: hibas, now: NOW, minAblak: 75 }).ok, false);
  // VALÓDI hiányzó nap továbbra is megállít
  delete d[nap(5)];
  assert.equal(hirTorlendok({ hirek: [hir('senki', 120)], days: d, now: NOW, minAblak: 75 }).ok, false);
});

if (hiba) { console.log(`\n❌ news-prune.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ news-prune.test: mind rendben');
