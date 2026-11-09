// Hír-keret (2026-11-05): a napi 4-es hír-plafon az átdolgozott régi hírekkel együtt értendő.
// Valódi eset: 11-05 04:06 UTC — 4 új hír + a 11-04-én elutasított, most átdolgozott Heimstaden = 5/4.
// Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { hirIroKeret } from './hir-keret.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const olvas = p => readFileSync(join(ROOT, ...p.split('/')), 'utf-8');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 hir-keret (napi hír-plafon az átdolgozással együtt)');

t('11-05-i eset: 0 publikált + 1 átdolgozandó régi → az Író csak 3 újat írhat', () => {
  assert.equal(hirIroKeret({ max: 4, maPublikalt: 0, varoVazlat: 0, atdolgozhato: 1 }), 3);
});
t('üres nap → a teljes keret', () => {
  assert.equal(hirIroKeret({ max: 4 }), 4);
});
t('a korábbról váró WRITER_-vázlat is foglal helyet', () => {
  assert.equal(hirIroKeret({ max: 4, maPublikalt: 2, varoVazlat: 1, atdolgozhato: 0 }), 1);
});
t('soha nem negatív (több vár, mint a keret)', () => {
  assert.equal(hirIroKeret({ max: 4, maPublikalt: 3, varoVazlat: 1, atdolgozhato: 2 }), 0);
});
t('hibás bemenet (NaN, negatív, hiányzó max) → 0 vagy figyelmen kívül', () => {
  assert.equal(hirIroKeret({ max: NaN }), 0);
  assert.equal(hirIroKeret({ max: 4, maPublikalt: -3, varoVazlat: NaN }), 4);
});

t('🧭 a CEO az Író keretét hirIroKeret-tel számolja (átdolgozandó + váró vázlat levonva)', () => {
  const src = olvas('agents/ceo/agent.js');
  const iro = src.indexOf("━━━ 2. LÉPÉS: ÍRÓ AGENT ━━━");
  const hivas = src.indexOf("runAgent('agents/iro/agent.js', ['--limit'");
  assert.ok(iro > 0 && hivas > iro, 'az Író-lépés nem található (átnevezték? igazítsd a tesztet)');
  const blokk = src.slice(iro, hivas);
  assert.match(blokk, /hirIroKeret\(/, 'az Író kerete nem a hirIroKeret-ből jön');
  assert.match(blokk, /countReworkable\(\)/, 'az átdolgozandó régi hírek nincsenek levonva');
  assert.match(blokk, /writerGuides/, 'a váró hír-vázlatok nincsenek levonva');
  // 📰 11-09 (core/hir-elsobbseg.js): 0-s rendes keretnél az Író CSAK akkor indul, ha extra termékhír-hely van —
  // ilyenkor `--limit 0 --termek-extra N`-nel, és csak termékhírt írhat (hir-elsobbseg.test „extra hely”).
  assert.match(blokk, /if \(remaining > 0 \|\| termekExtra > 0\)/, '0-s keretnél is elindulna az Író');
});

t('🧭 az Író `--limit 0` esetén SEMMIT nem ír (nem „korlát nélkül”)', () => {
  const src = olvas('agents/iro/agent.js');
  assert.ok(!/args\.limit\s*\|\|/.test(src), '`args.limit || …` → 0-nál korlát nélkül írna');
  assert.match(src, /const maxCikk = Number\.isFinite\(args\.limit\)/);
});

if (hiba) { console.log(`\n❌ ${hiba} hiba`); process.exit(1); }
console.log('\n✅ hir-keret: minden rendben');
