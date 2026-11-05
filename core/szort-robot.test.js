// Szétszórt robot — CSAK JELZÉS (2026-11-05). Ingyenes, hálózat nélküli.
// Mérve (Cloudflare RUM, hivatkozó nélküli látogatás /hu/ nem-HU-ból + /es/ nem spanyol országból):
// normál nap 0–10, 11-04: 20, 10-31: 38, 11-01: 123 (a riport „518 belépője”, ~240 robottal).
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { nyelviElteres, szortBejegyzes, szortToldalek, KUSZOB } from './szort-robot.js';
import { visitorLine } from './report-lines.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const olvas = p => readFileSync(join(ROOT, ...p.split('/')), 'utf-8');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 szort-robot (szétszórt robot jelzése)');

const sor = (country, path, visits, referer = '') => ({ country, path, visits, referer });

t('magyar oldal nem Magyarországról, hivatkozó nélkül = eltérés; Magyarországról nem', () => {
  const r = nyelviElteres([sor('DE', '/hu/article/a', 1), sor('HU', '/hu/article/b', 5), sor('HU', '/hu', 2)]);
  assert.equal(r.elteres, 1);
  assert.deepEqual(r.orszagok, { DE: 1 });
});
t('spanyol oldal: USA és Latin-Amerika nem eltérés, Japán igen', () => {
  const r = nyelviElteres([sor('US', '/es/article/a', 3), sor('MX', '/es/x', 2), sor('JP', '/es/article/c', 1), sor('JP', '/es', 1)]);
  assert.equal(r.elteres, 2);
});
t('angol oldal soha nem eltérés; a /huge vagy /espanol útvonal sem (csak a /hu/, /es/ előtag)', () => {
  assert.equal(nyelviElteres([sor('JP', '/article/a', 9), sor('JP', '/huge-news', 1), sor('JP', '/espanol', 1)]).elteres, 0);
});
t('hivatkozóval érkező (pl. Facebook, Bing) NEM számít; a saját domain hivatkozó igen', () => {
  const r = nyelviElteres([sor('DE', '/hu/a', 4, 'm.facebook.com'), sor('DE', '/hu/b', 1, 'www.bing.com'), sor('DE', '/hu/c', 1, 'aiworldhq.com'), sor('DE', '/hu/d', 1, 'www.aiworldhq.com')]);
  assert.equal(r.elteres, 2);
});

t('11-01-szerű nap (123 eltérés) → jelez, becslés ~246; normál nap (8) → nem jelez', () => {
  const rob = szortBejegyzes({ elteres: 123, orszagok: { DE: 24, GB: 13, US: 13, JP: 10, SG: 8, FR: 6 } });
  assert.equal(rob.jelzes, true);
  assert.equal(rob.becsles, 246);
  assert.deepEqual(Object.keys(rob.orszagok), ['DE', 'GB', 'US', 'JP', 'SG'], 'top 5 ország, csökkenő sorrendben');
  assert.equal(szortBejegyzes({ elteres: 8, orszagok: { CN: 8 } }).jelzes, false);
  assert.ok(KUSZOB > 20, 'a küszöb a mért normál maximum (11-04: 20) fölött legyen');
});

t('👥 sor: jelzésnél kiírja, és kimondja, hogy NINCS levonva; a szám marad', () => {
  const napok = { '2026-10-31': [{ path: '/', visits: 258 }], '2026-11-01': [{ path: '/', visits: 518 }] };
  const szort = { '2026-11-01': szortBejegyzes({ elteres: 123, orszagok: { DE: 24, GB: 13 } }) };
  const s = visitorLine(napok, '2026-11-02', szort);
  assert.match(s, /^👥 Tegnap: 518 látogató/);
  assert.match(s, /~246 gyanús szétszórt robot/);
  assert.match(s, /NINCS levonva/);
  assert.match(s, /DE, GB/);
});
t('👥 sor: normál napon / adat nélkül / régi hívással (2 paraméter) változatlan', () => {
  const napok = { '2026-11-03': [{ path: '/', visits: 203 }] };
  const alap = '👥 Tegnap: 203 látogató';
  assert.equal(visitorLine(napok, '2026-11-04'), alap);
  assert.equal(visitorLine(napok, '2026-11-04', {}), alap);
  assert.equal(visitorLine(napok, '2026-11-04', { '2026-11-03': szortBejegyzes({ elteres: 3, orszagok: {} }) }), alap);
  assert.equal(visitorLine(napok, '2026-11-04', { '2026-11-02': szortBejegyzes({ elteres: 99, orszagok: {} }) }), alap, 'másik nap jelzése nem szivároghat át');
});
t('a becslés soha nem nagyobb a napi belépőknél', () => {
  assert.match(szortToldalek({ jelzes: true, becsles: 500, orszagok: {} }, 120), /~120 gyanús/);
});

t('🧭 a napi jelentés és a bot ugyanazt a jelzést kapja (loadSzort / szort-robot.json)', () => {
  assert.match(olvas('core/daily-report.js'), /visitorLine\(loadLog\(\), today\(\), loadSzort\(\)\)/);
  assert.match(olvas('agents/ceo/instruct.js'), /szort-robot\.json[\s\S]{0,200}latogatoKontextus\(days, TODAY, szort\)/);
});
t('🧭 a forgalmi napló a jelzést KÜLÖN fájlba írja, és a napló sorait nem vonja le', () => {
  const src = olvas('core/traffic-log.js');
  assert.match(src, /szort\[day\] = await fetchSzort\(day\)/);
  assert.match(src, /saveSzort\(pruneOld\(szort, today\)\)/);
  assert.ok(!/robotLevonas\([^)]*szort/i.test(src), 'a szétszórt-robot adat nem kerülhet a levonásba');
});

if (hiba) { console.log(`\n❌ ${hiba} hiba`); process.exit(1); }
console.log('\n✅ szort-robot: minden rendben');
