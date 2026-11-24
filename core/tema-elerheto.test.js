// core/tema-elerheto.js — mely útmutató-téma VÁR TÉNYLEG megírásra? (2026-11-24 élesben, user: „javítani kell!”)
// Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import { elerhetoTemaE, elerhetoTemaDb, varoTrendTemaE } from './tema-elerheto.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 tema-elerheto\n');

const NAP = 864e5;
const MOST = Date.parse('2026-11-24T19:00:00Z');
const parkolt = (napja) => ({ ok: false, ok_ok: 'nincs illő súgócikk', at: new Date(MOST - napja * NAP).toISOString() });

t('🔴 11-24 élesben: a parkolópályás (14 napja nem horgonyzott) téma NEM vár — különben a CEO nem ötletel újat', () => {
  // élőben: 29 nyitott téma, 6 fékezett, 17 parkolt → a CEO 23-at látott (cél 16) → az ötletelő nem futott → 1 útmutató
  const tema = { status: 'todo', company: 'Z.ai', title: 'How to Write a Calm Reply', horgony: parkolt(2) };
  assert.equal(elerhetoTemaE(tema, MOST), false, '🔴 a parkolt téma várakozónak számít');
  assert.equal(elerhetoTemaE({ ...tema, horgony: parkolt(15) }, MOST), true, 'a 14 nap letelte után újra próbálható');
  assert.equal(elerhetoTemaE({ ...tema, horgony: { ok: true, at: new Date(MOST).toISOString() } }, MOST), true, 'a horgonyzott téma vár');
  assert.equal(elerhetoTemaE({ status: 'todo', title: 'x' }, MOST), true, 'horgony-próba nélkül vár');
});

t('a kész téma nem vár; a fékezett (jóváhagyott súgó nélküli) sem — a fék-függvény dönt', () => {
  assert.equal(elerhetoTemaE({ status: 'done', title: 'x' }, MOST), false);
  assert.equal(elerhetoTemaE({ status: 'todo', title: 'x' }, MOST, { fekezett: () => ({ fek: true }) }), false);
  assert.equal(elerhetoTemaE({ status: 'todo', title: 'x' }, MOST, { fekezett: () => ({ fek: false }) }), true);
  assert.equal(elerhetoTemaE(null, MOST), false);
});

t('darabszám: csak a ténylegesen megírható témák (az élő eset kicsiben)', () => {
  const nincsFek = { fekezett: () => ({ fek: false }) };
  const lista = [
    { status: 'done' }, { status: 'todo' }, { status: 'todo', horgony: parkolt(1) },
    { status: 'todo', horgony: parkolt(3) }, { status: 'todo', horgony: parkolt(20) }
  ];
  assert.equal(elerhetoTemaDb(lista, MOST, nincsFek), 2);
  assert.equal(elerhetoTemaDb(null, MOST, nincsFek), 0);
});

t('🔴 11-20 óta élesben: a parkolt trend-téma nem „vár” — a következő trend-téma felvehető', () => {
  const nincsFek = { fekezett: () => ({ fek: false }) };
  const trend = { status: 'todo', priority: 'trend', title: 'How to Spot Fake ChatGPT Tricks', horgony: parkolt(4) };
  assert.equal(varoTrendTemaE(trend, MOST, nincsFek), false, '🔴 a parkolt trend-téma megállítja a trend-útmutatót');
  assert.equal(varoTrendTemaE({ ...trend, horgony: undefined }, MOST, nincsFek), true, 'a megírható trend-téma vár');
  assert.equal(varoTrendTemaE({ status: 'todo', title: 'x' }, MOST, nincsFek), false, 'nem trend');
});


// ── bekötés-őr (az agentet importálni tilos — a forrásszövegét nézzük) ──
import { readFileSync } from 'node:fs';
const forras = p => readFileSync(new URL('../' + p, import.meta.url), 'utf-8');
t('🔌 CEO: a téma-puffer a MEGÍRHATÓ témákat számolja; trend-felvétel: a parkolt trend-téma nem vár', () => {
  const ceo = forras('agents/ceo/agent.js');
  assert.ok(/elerhetoTemaDb\(JSON\.parse\(readFileSync\(GUIDE_TOPICS_PATH/.test(ceo), '🔴 a CEO a parkolt témákat is várakozónak számolja');
  const tk = forras('core/trend-kutato.js');
  assert.ok(/varoTrendTemaE\(t, now\)/.test(tk), '🔴 a trend-felvétel a parkolt trend-témát várónak nézi');
});
console.log(`✅ tema-elerheto + bekötés: ${pass} eset`);
