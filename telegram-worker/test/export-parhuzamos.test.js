// node telegram-worker/test/export-parhuzamos.test.js — a /feedback-export olvasásai PÁRHUZAMOSAN menjenek (offline, hamis KV)
//
// MIÉRT (2026-11-19, hibavadászat): a CI napi riportjában a /feedback-export 1. próbája újra és újra időtúllépett
// (11-08, 11-10, 11-12, 11-13, 11-19 — 20 mp-es korlát). Mérve: hideg Cloudflare-csomóponton 7,9 mp, melegen 0,5 mp.
// Gyökérok: egy hívás ~140 KV-olvasást végzett EGYMÁS UTÁN (a PDF-letöltések 14 napja egymagában ~97), és hideg
// csomóponton minden olvasás a központi tárból jön (~50–150 ms) → összeadódik. A szám a letöltésekkel NŐ
// (18 PDF × 14 nap → akár ~250). Ez a teszt azt őrzi, hogy egy exporton belül az olvasások egyszerre fussanak,
// és az eredmény betűre ugyanaz maradjon.
import { strict as assert } from 'assert';
import { dlExport } from '../src/pdf-dl.js';
import { srcExport } from '../src/forras-szamlalo.js';
import { fbpExport } from '../src/bevalt-szamlalo.js';
import { csCounters } from '../src/cs-routes.js';

const lassuKV = (elore = {}) => {
  const tar = new Map(Object.entries(elore).map(([k, v]) => [k, String(v)]));
  const st = { most: 0, max: 0, get: 0 };
  return {
    st,
    get: async k => {
      st.get++; st.most++; st.max = Math.max(st.max, st.most);
      await new Promise(r => setTimeout(r, 5));
      st.most--;
      return tar.has(k) ? tar.get(k) : null;
    },
    list: async ({ prefix }) => ({ keys: [...tar.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true })
  };
};
const NAP = Date.parse('2026-11-19T12:00:00Z');
const nap = i => new Date(NAP - i * 864e5).toISOString().slice(0, 10);

let pass = 0;
const t = async (nev, fn) => { await fn(); pass++; console.log('  ✅ ' + nev); };
console.log('🧪 /feedback-export — párhuzamos KV-olvasás\n');

await t('📚 dlExport: a letöltés-kulcsokat egyszerre olvassa, az eredmény változatlan', async () => {
  const elore = {};
  for (let i = 0; i < 10; i++) elore[`dl:${nap(i)}:aiworldhq-all-en.pdf`] = i + 1;
  elore[`dl:${nap(30)}:aiworldhq-all-en.pdf`] = 99;            // régi → kimarad, nem is olvassa
  const kv = lassuKV(elore);
  const ki = await dlExport({ FEEDBACK: kv }, NAP);
  assert.equal(kv.st.get, 10, 'a 14 napnál régebbi kulcsot is olvasta');
  assert.ok(kv.st.max > 1, `egyszerre csak ${kv.st.max} olvasás futott — sorban olvas`);
  for (let i = 0; i < 10; i++) assert.equal(ki[nap(i)]['aiworldhq-all-en.pdf'], i + 1);
  assert.equal(ki[nap(30)], undefined);
});

await t('🧵 srcExport: ugyanígy', async () => {
  const elore = {};
  for (let i = 0; i < 8; i++) elore[`src:${nap(i)}:th`] = 10 + i;
  const kv = lassuKV(elore);
  const ki = await srcExport({ FEEDBACK: kv }, NAP);
  assert.ok(kv.st.max > 1, `egyszerre csak ${kv.st.max} olvasás futott`);
  for (let i = 0; i < 8; i++) assert.equal(ki[nap(i)].th, 10 + i);
});

await t('👍 fbpExport: a 15 napi kulcs egyszerre, sorrend és tartalom változatlan', async () => {
  const elore = { [`fbp:${nap(0)}`]: JSON.stringify({ 'abc-def': { up: 2, down: 1 } }), [`fbp:${nap(3)}`]: JSON.stringify({ 'xyz-123': { up: 1 } }) };
  const kv = lassuKV(elore);
  const ki = await fbpExport({ FEEDBACK: kv }, NAP);
  assert.equal(kv.st.get, 15);
  assert.ok(kv.st.max > 1, `egyszerre csak ${kv.st.max} olvasás futott`);
  assert.deepEqual(ki, { [nap(0)]: { 'abc-def': { up: 2, down: 1 } }, [nap(3)]: { 'xyz-123': { up: 1, down: 0 } } });
});

await t('💬 csCounters: az 5 napi számláló egyszerre', async () => {
  const kv = lassuKV();
  const ki = await csCounters({ FEEDBACK: kv });
  assert.ok(kv.st.max > 1, `egyszerre csak ${kv.st.max} olvasás futott`);
  assert.deepEqual(ki, { chat: 0, mail: 0, esc: 0, replyfail: 0, noreply: 0, replyfailWhy: null });
});

await t('hibás KV → {error:true} marad (nem dob)', async () => {
  const rossz = { FEEDBACK: { list: async () => ({ keys: [{ name: `dl:${nap(0)}:aiworldhq-all-en.pdf` }], list_complete: true }), get: async () => { throw new Error('KV le'); } } };
  assert.deepEqual(await dlExport(rossz, NAP), { error: true });
  assert.deepEqual(await srcExport({ FEEDBACK: { ...rossz.FEEDBACK, list: async () => ({ keys: [{ name: `src:${nap(0)}:th` }], list_complete: true }) } }, NAP), { error: true });
});

console.log(`\n✅ export-parhuzamos.test: mind a ${pass} eset rendben`);
