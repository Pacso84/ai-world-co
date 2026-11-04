// node telegram-worker/test/aff-hit.test.js — Amazon-kattintás számláló, Worker-oldal (offline, hamis KV)
import { strict as assert } from 'assert';
import { handleAffHit, affExport, NAPI_PLAFON } from '../src/aff-hit.js';

const hamisKV = (elore = {}) => {
  const tar = new Map(Object.entries(elore).map(([k, v]) => [k, { v: String(v) }]));
  return {
    tar,
    get: async k => (tar.has(k) ? tar.get(k).v : null),
    put: async (k, v, o) => { tar.set(k, { v, o }); },
    list: async ({ prefix }) => ({ keys: [...tar.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true })
  };
};
const keres = (body, method = 'POST') => new Request('https://w.invalid/aff-hit', {
  method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined
});
const NAP = Date.parse('2026-10-09T12:00:00Z');

// 1) érvényes jel → napi számláló nő, megőrzéssel; a honlapnak CORS-fejléc
{
  const kv = hamisKV();
  let r;
  for (let i = 0; i < 2; i++) r = await handleAffHit(keres({ p: 'echo' }), { FEEDBACK: kv }, NAP);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://aiworldhq.com', 'a böngésző eldobná a választ');
  const rec = kv.tar.get('aff:2026-10-09:echo');
  assert.equal(rec.v, '2');
  assert.ok(rec.o.expirationTtl > 300 * 86400);
  assert.equal((await handleAffHit(keres(null, 'OPTIONS'), { FEEDBACK: kv }, NAP)).status, 204, 'az előzetes (preflight) kérés elbukna');
}

// 2) ismeretlen termék, rossz metódus → semmi nem kerül a KV-be
{
  const kv = hamisKV();
  for (const p of ['', 'x', '../echo', 'toString', null]) assert.equal((await handleAffHit(keres({ p }), { FEEDBACK: kv }, NAP)).status, 400, 'elfogadta: ' + p);
  assert.equal((await handleAffHit(keres(null, 'GET'), { FEEDBACK: kv }, NAP)).status, 405);
  assert.equal(kv.tar.size, 0, 'szemét került a KV-be');
}

// 3) napi plafon
{
  const kv = hamisKV({ 'aff:2026-10-09:echo': NAPI_PLAFON });
  assert.equal((await handleAffHit(keres({ p: 'echo' }), { FEEDBACK: kv }, NAP)).status, 429);
  assert.equal(kv.tar.get('aff:2026-10-09:echo').v, String(NAPI_PLAFON));
}

// 4) export: napra bontva, régit / szemetet / más előtagot kihagy; hiba → {error:true}
{
  const kv = hamisKV({ 'aff:2026-10-08:echo': 3, 'aff:2026-08-01:echo': 9, 'aff:2026-10-08:gonosz': 5, 'dl:2026-10-08:aiworldhq-all-en.pdf': 1 });
  assert.deepEqual(await affExport({ FEEDBACK: kv }, NAP), { '2026-10-08': { echo: 3 } });
  assert.deepEqual(await affExport({ FEEDBACK: { list: async () => { throw new Error('KV le'); } } }, NAP), { error: true });
}

console.log('✅ aff-hit.test: mind a 4 csoport rendben');
