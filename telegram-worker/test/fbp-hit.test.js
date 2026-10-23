// node telegram-worker/test/fbp-hit.test.js — „Bevált?” számláló, Worker-oldal (offline, hamis KV)
import { strict as assert } from 'assert';
import { handleFbpHit, fbpExport, NAPI_PLAFON, SLUG_PLAFON, NAPI_OSSZ } from '../src/bevalt-szamlalo.js';

const hamisKV = (elore = {}) => {
  const tar = new Map(Object.entries(elore).map(([k, v]) => [k, { v: String(v) }]));
  return {
    tar,
    get: async k => (tar.has(k) ? tar.get(k).v : null),
    put: async (k, v, o) => { tar.set(k, { v, o }); },
    list: async ({ prefix }) => ({ keys: [...tar.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true })
  };
};
const keres = (body, method = 'POST') => new Request('https://w.invalid/fbp-hit', {
  method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined
});
const NAP = Date.parse('2026-10-08T12:00:00Z');
const JO = { slug: 'my-guide', lang: 'hu', v: 'up' };

// 1) érvényes jel → napi számláló nő, megőrzéssel, CORS-szal
{
  const kv = hamisKV();
  for (let i = 0; i < 3; i++) {
    const r = await handleFbpHit(keres(JO), { FEEDBACK: kv }, NAP);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://aiworldhq.com');
  }
  // EGY napi kulcs (átnézés 10-23: kulcsonkénti tárolásnál egy áradat az exportot is megölné)
  const r = kv.tar.get('fbp:2026-10-08');
  assert.deepEqual(JSON.parse(r.v), { 'my-guide': { up: 3, down: 0 } }, 'nem számolt fel háromszor');
  assert.ok(r.o.expirationTtl > 300 * 86400, 'nincs (vagy túl rövid) megőrzés');
}

// 2) rossz bemenet / rossz metódus — a KV-be NEM kerül semmi
{
  const kv = hamisKV();
  for (const b of [{ ...JO, slug: '../x' }, { ...JO, slug: 'A' }, { ...JO, slug: 'ab' }, { ...JO, v: 'maybe' }, { ...JO, lang: 'de' }, null])
    assert.equal((await handleFbpHit(keres(b), { FEEDBACK: kv }, NAP)).status, 400, 'elfogadta: ' + JSON.stringify(b));
  assert.equal((await handleFbpHit(keres(null, 'GET'), { FEEDBACK: kv }, NAP)).status, 405);
  assert.equal(kv.tar.size, 0, 'szemét került a KV-be');
}

// 3) OPTIONS (a böngésző előkérése) → 204 CORS-szal
{
  const r = await handleFbpHit(new Request('https://w.invalid/fbp-hit', { method: 'OPTIONS' }), { FEEDBACK: hamisKV() }, NAP);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://aiworldhq.com');
}

// 4) napi PLAFON — egy hamis jel-áradat nem fújhatja fel korlátlanul
{
  const kv = hamisKV({ 'fbp:2026-10-08': JSON.stringify({ 'my-guide': { up: NAPI_PLAFON, down: 0 } }) });
  assert.equal((await handleFbpHit(keres(JO), { FEEDBACK: kv }, NAP)).status, 429);
  assert.equal(JSON.parse(kv.tar.get('fbp:2026-10-08').v)['my-guide'].up, NAPI_PLAFON);
}

// 4b) kitalált slugok áradata: legfeljebb SLUG_PLAFON különböző útmutató naponta — a meglévőre még lehet szavazni
{
  const nap = {};
  for (let i = 0; i < SLUG_PLAFON; i++) nap['fake-' + i] = { up: 0, down: 1 };
  const kv = hamisKV({ 'fbp:2026-10-08': JSON.stringify(nap) });
  assert.equal((await handleFbpHit(keres({ ...JO, slug: 'uj-kitalalt' }), { FEEDBACK: kv }, NAP)).status, 429);
  assert.equal((await handleFbpHit(keres({ ...JO, slug: 'fake-1' }), { FEEDBACK: kv }, NAP)).status, 200);
}

// 4c) napi összplafon (minden szavazat együtt)
{
  const nap = {};
  for (let i = 0; i < NAPI_OSSZ / 100; i++) nap['g-' + i] = { up: 100, down: 0 };
  const kv = hamisKV({ 'fbp:2026-10-08': JSON.stringify(nap) });
  assert.equal((await handleFbpHit(keres({ ...JO, slug: 'g-1' }), { FEEDBACK: kv }, NAP)).status, 429);
}

// 5) export: csak az utolsó 14 nap, { nap: { slug: { up, down } } }
{
  const kv = hamisKV({
    'fbp:2026-10-07': JSON.stringify({ 'my-guide': { up: 4, down: 1 }, 'other-guide': { up: 0, down: 2 } }),
    'fbp:2026-09-01': JSON.stringify({ 'old-guide': { up: 9, down: 0 } }),
    'fbp:2026-10-06': 'nem json'
  });
  const ki = await fbpExport({ FEEDBACK: kv }, NAP);
  assert.deepEqual(ki, { '2026-10-07': { 'my-guide': { up: 4, down: 1 }, 'other-guide': { up: 0, down: 2 } } });
}

// 6) hibás KV → { error: true }, nem üres (az „elromlott” ≠ „senki nem szavazott”)
{
  const rossz = { get: async () => { throw new Error('kv down'); }, list: async () => { throw new Error('kv down'); } };
  assert.deepEqual(await fbpExport({ FEEDBACK: rossz }, NAP), { error: true });
}

// 7) BEKÖTÉS-ŐR: a worker tényleg irányít ide, és az export viszi a __fbp-t
{
  const { readFileSync } = await import('fs');
  const w = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf-8');
  assert.match(w, /import \{ handleFbpHit, fbpExport \} from '\.\/bevalt-szamlalo\.js'/);
  assert.match(w, /path === '\/fbp-hit'\) return handleFbpHit\(request, env\)/);
  assert.match(w, /out\.__fbp = await fbpExport\(env\)/);
}

console.log('✅ fbp-hit: Bevált?-számláló rendben');
