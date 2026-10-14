// core/guide-prune.js — a 60 napja olvasatlan útmutatók törlés-döntése (2026-10-14, user:
// „ha 60 napig nem volt olvasó, minek tartjuk!"). Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import {
  SITE, pruneBeallitas, latogatasok, lefedettseg, torlendok,
  linkAlakok, linkekKi, toroltListaFrissit, toroltUrlek
} from './guide-prune.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 guide-prune\n');

const NAP = 864e5;
const MOST = Date.parse('2026-10-14T12:00:00Z');
const d = n => new Date(MOST - n * NAP).toISOString().slice(0, 10);
// Teljes, 70 napos napló: minden napon 1 „zaj" sor, a megadott slugok látogatásaival.
const naplo = (latogatott = {}) => {
  const days = {};
  for (let i = 1; i <= 70; i++) days[d(i)] = [{ path: '/', visits: 5, views: 6 }, { path: '/article/zaj-hir', visits: 1, views: 1 }];
  for (const [path, nap] of Object.entries(latogatott)) days[d(nap)].push({ path, visits: 1, views: 1 });
  return days;
};
const ut = (slug, korNap) => ({ file: `ARTICLE_GUIDE_${slug}.json`, slug, published_at: new Date(MOST - korNap * NAP).toISOString() });

t('beállítás: alap 60 nap / 25 db; csak a kifejezett false kapcsol ki; 30 nap alá nem engedünk', () => {
  assert.deepEqual(pruneBeallitas({}), { be: true, napok: 60, max: 25 });
  assert.deepEqual(pruneBeallitas({ content: { guide_prune: { enabled: false } } }).be, false);
  assert.equal(pruneBeallitas({ content: { guide_prune: { days: 6 } } }).napok, 60, '🔴 egy elgépelt 6 nap tömeges törlést indítana');
  assert.equal(pruneBeallitas({ content: { guide_prune: { days: 90, max_per_run: 10 } } }).napok, 90);
  assert.equal(pruneBeallitas({ content: { guide_prune: { max_per_run: 5000 } } }).max, 100);
});

t('látogatás: a 3 nyelvi útvonal együtt számít, az ablakon kívüli nap nem', () => {
  const days = naplo({ '/hu/article/a': 3, '/es/article/b': 10, '/article/c': 65 });
  const v = latogatasok(days, d(1), 60);
  assert.equal(v.get('a'), 1);
  assert.equal(v.get('b'), 1);
  assert.equal(v.get('c'), undefined, 'a 65 napja volt látogatás az ablakon kívül esik');
});

t('🔴 lefedettség-kapu: hiányzó nap, üres nap, elavult vagy üres napló → NINCS törlés', () => {
  assert.equal(lefedettseg(naplo(), MOST, 60).ok, true);
  const lyukas = naplo(); delete lyukas[d(30)];
  assert.equal(lefedettseg(lyukas, MOST, 60).ok, false);
  assert.match(lefedettseg(lyukas, MOST, 60).ok_ok, /hiányzó nap/);
  const ures = naplo(); ures[d(10)] = [];
  assert.equal(lefedettseg(ures, MOST, 60).ok, false);
  const regi = {}; for (const [k, v] of Object.entries(naplo())) if (k <= d(5)) regi[k] = v;
  assert.match(lefedettseg(regi, MOST, 60).ok_ok, /elavult/);
  assert.equal(lefedettseg({}, MOST, 60).ok, false);
  assert.equal(lefedettseg(null, MOST, 60).ok, false);
});

t('jelölt: legalább 60 napos ÉS 60 napja 0 olvasó; a legrégebbi előre; futásonként max', () => {
  const cikkek = [ut('olvasott', 100), ut('ures-regi', 120), ut('ures-uj', 30), ut('ures-kozep', 80), ut('datum-nelkul', 0), ut('olvasott2', 90)];
  cikkek[4].published_at = '';
  // 4 régi útmutatóból 2 olvasatlan (50%) — a 60%-os gyanú-kapu alatt marad
  const days = naplo({ '/article/olvasott': 20, '/hu/article/olvasott2': 5 });
  const r = torlendok({ cikkek, days, now: MOST, ablakNap: 60, max: 1 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.jeloltek.map(x => x.slug), ['ures-regi', 'ures-kozep'], '🔴 olvasott, fiatal vagy dátum nélküli útmutató is törlődne');
  assert.deepEqual(r.torlendo.map(x => x.slug), ['ures-regi']);
});

t('🔴 Review Focus 1: ha a naplóban egyetlen cikk-látogatás sincs (útvonal-formátum változott) → nincs törlés', () => {
  const days = {};
  for (let i = 1; i <= 70; i++) days[d(i)] = [{ path: '/guides/valami', visits: 3, views: 3 }];
  const r = torlendok({ cikkek: [ut('a', 100), ut('b', 100)], days, now: MOST, ablakNap: 60, max: 25 });
  assert.equal(r.ok, false);
  assert.match(r.ok_ok, /egyetlen cikk-látogatás/);
});

t('🔴 Review Focus 1: ha a régi útmutatók több mint 60%-a jelölt → gyanús, nincs törlés', () => {
  const cikkek = [ut('a', 100), ut('b', 100), ut('c', 100), ut('d', 100), ut('e', 100)];
  const r = torlendok({ cikkek, days: naplo({ '/article/a': 3 }), now: MOST, ablakNap: 60, max: 25 });
  assert.equal(r.ok, false, '4 az 5-ből (80%) olvasatlan — ez mérési hibára utal');
  assert.match(r.ok_ok, /60%/);
  const rendben = torlendok({ cikkek, days: naplo({ '/article/a': 3, '/article/b': 3, '/article/c': 3 }), now: MOST, ablakNap: 60, max: 25 });
  assert.equal(rendben.ok, true);
  assert.equal(rendben.jeloltek.length, 2);
});

t('linkkivétel: abszolút, relatív és nyelvi alak; a hasonló, hosszabb slug linkje MARAD', () => {
  assert.deepEqual(linkAlakok('x'), [
    `${SITE}/article/x`, '/article/x', `${SITE}/hu/article/x`, '/hu/article/x', `${SITE}/es/article/x`, '/es/article/x'
  ]);
  const md = 'A [régi](https://aiworldhq.com/article/slug-a) és [rel](/hu/article/slug-a/) meg [más](/article/slug-a-b) link.';
  const r = linkekKi(md, ['slug-a']);
  assert.equal(r.md, 'A régi és rel meg [más](/article/slug-a-b) link.');
  assert.equal(r.db, 2);
  assert.deepEqual(linkekKi('', ['x']), { md: '', db: 0 });
});

t('törölt-lista: új bejegyzés be, 30 napnál régebbi ki; IndexNow csak a 48 órán belülit kéri', () => {
  const regi = [{ slug: 'nagyon-regi', at: new Date(MOST - 40 * NAP).toISOString() }, { slug: 'tegnapi', at: new Date(MOST - NAP).toISOString() }];
  const l = toroltListaFrissit(regi, ['mai'], MOST);
  assert.deepEqual(l.map(x => x.slug), ['tegnapi', 'mai']);
  assert.deepEqual(toroltListaFrissit(null, [], MOST), []);
  const urlek = toroltUrlek([{ slug: 'mai', at: new Date(MOST).toISOString() }, { slug: 'regi', at: new Date(MOST - 3 * NAP).toISOString() }], SITE, ['', '/es'], MOST, 48);
  assert.deepEqual(urlek, [`${SITE}/article/mai`, `${SITE}/es/article/mai`]);
});

// ── BEKÖTÉS (forrás-alapú: a housekeeping.js és az indexnow.js NEM importálható) ──
import { readFileSync } from 'node:fs';
const forras = p => readFileSync(new URL('../' + p, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');

t('🔌 Házmester: a hírtörlés UTÁN, az árva-takarítás ELŐTT fut; a 3 kaput a modul adja', () => {
  const hk = forras('core/housekeeping.js');
  assert.match(hk, /import \{ pruneBeallitas, torlendok, linkekKi, toroltListaFrissit \} from '\.\/guide-prune\.js';/);
  assert.match(hk, /pruneOldNews\(\);\n\s*pruneUnreadGuides\(\);/, '🔴 a takarító nincs bekötve, vagy rossz helyen fut');
  const fn = hk.slice(hk.indexOf('function pruneUnreadGuides()'), hk.indexOf('function linkekKiMindenhol('));
  assert.ok(fn.length > 100, 'nincs pruneUnreadGuides()');
  assert.match(fn, /torlendok\(\{ cikkek, days, now: Date\.now\(\), ablakNap: b\.napok, max: b\.max \}\)/);
  assert.match(fn, /if \(!r\.ok\) \{ report\.push\(`⚠️ nézetlen útmutató-törlés kihagyva: \$\{r\.ok_ok\}`\); return; \}/);
  assert.match(fn, /utmutatoE\(f, d\)/, 'csak útmutató törlődhet');
  assert.match(fn, /lejartCeluakNelkul\(/, 'a rá mutató átirányítások maradnának');
  assert.match(fn, /linkekKiMindenhol\(slugok\)/, 'a többi cikkben halott link maradna');
  assert.match(fn, /toroltListaFrissit\(/, 'az IndexNow nem tudna a törlésről');
  assert.match(fn, /if \(!DRY\)/, 'a --dry próba is törölne');
});

t('🔌 config: content.guide_prune be, 60 nap, 25/futás', () => {
  const cfg = JSON.parse(forras('config.json'));
  assert.deepEqual(pruneBeallitas(cfg), { be: true, napok: 60, max: 25 });
});

t('🔌 IndexNow: a 48 órán belül törölt útmutatókat is bejelenti', () => {
  const ix = forras('core/indexnow.js');
  assert.match(ix, /import \{ toroltUrlek \} from '\.\/guide-prune\.js';/);
  assert.match(ix, /toroltUrlek\(lista, site, LANGS, now, FRESH_HOURS\)/);
});

console.log('\n✅ guide-prune.test: mind a ' + pass + ' eset rendben');
