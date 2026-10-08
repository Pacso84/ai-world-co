// node telegram-worker/test/pdf-dl.test.js — PDF-letöltés számláló, Worker-oldal (offline, hamis KV)
import { strict as assert } from 'assert';
import { handleDlHit, dlExport, NAPI_PLAFON } from '../src/pdf-dl.js';

const hamisKV = (elore = {}) => {
  const tar = new Map(Object.entries(elore).map(([k, v]) => [k, { v: String(v) }]));
  return {
    tar,
    get: async k => (tar.has(k) ? tar.get(k).v : null),
    put: async (k, v, o) => { tar.set(k, { v, o }); },
    list: async ({ prefix }) => ({ keys: [...tar.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true })
  };
};
const keres = (body, method = 'POST') => new Request('https://w.invalid/dl-hit', {
  method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined
});
const NAP = Date.parse('2026-10-08T12:00:00Z');

// 1) érvényes jel → napi számláló nő, megőrzéssel
{
  const kv = hamisKV();
  for (let i = 0; i < 3; i++) assert.equal((await handleDlHit(keres({ f: 'aiworldhq-all-en.pdf' }), { FEEDBACK: kv }, NAP)).status, 200);
  const r = kv.tar.get('dl:2026-10-08:aiworldhq-all-en.pdf');
  assert.equal(r.v, '3', 'nem számolt fel háromszor');
  assert.ok(r.o.expirationTtl > 300 * 86400, 'nincs (vagy túl rövid) megőrzés');
}

// 2) csak a mi fájljaink, csak POST — más NEM kerül a KV-be
{
  const kv = hamisKV();
  for (const f of ['../x', 'evil.pdf', 'aiworldhq-all-de.pdf', '', null]) {
    assert.equal((await handleDlHit(keres({ f }), { FEEDBACK: kv }, NAP)).status, 400, 'elfogadta: ' + f);
  }
  assert.equal((await handleDlHit(keres(null, 'GET'), { FEEDBACK: kv }, NAP)).status, 405);
  assert.equal(kv.tar.size, 0, 'szemét került a KV-be');
}

// 3) napi PLAFON — egy hamis jel-áradat nem fújhatja fel korlátlanul
{
  const kv = hamisKV({ 'dl:2026-10-08:aiworldhq-safe-es.pdf': NAPI_PLAFON });
  assert.equal((await handleDlHit(keres({ f: 'aiworldhq-safe-es.pdf' }), { FEEDBACK: kv }, NAP)).status, 429);
  assert.equal(kv.tar.get('dl:2026-10-08:aiworldhq-safe-es.pdf').v, String(NAPI_PLAFON));
}

// 4) export: napra bontva, a régit és a szemetet kihagyja; hibánál {error:true}, nem üres
{
  const kv = hamisKV({
    'dl:2026-10-07:aiworldhq-all-en.pdf': 2, 'dl:2026-10-08:aiworldhq-work-es.pdf': 1,
    'dl:2026-08-01:aiworldhq-all-en.pdf': 9, 'dl:2026-10-08:gonosz.pdf': 5, 'fb:valami': 1
  });
  const ki = await dlExport({ FEEDBACK: kv }, NAP);
  assert.deepEqual(ki, { '2026-10-07': { 'aiworldhq-all-en.pdf': 2 }, '2026-10-08': { 'aiworldhq-work-es.pdf': 1 } });
  assert.deepEqual(await dlExport({ FEEDBACK: { list: async () => { throw new Error('KV le'); } } }, NAP), { error: true });
}

// 5) a bekötés: a worker.js tényleg ismeri az útvonalat, és az export továbbadja
{
  const { readFileSync } = await import('fs');
  const w = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf-8');
  assert.match(w, /path === '\/dl-hit'\) return handleDlHit\(request, env\)/, 'a /dl-hit nincs bekötve');
  assert.match(w, /out\.__dl = await dlExport\(env\)/, 'az export nem adja tovább a letöltéseket');
}

console.log('✅ pdf-dl.test: mind az 5 csoport rendben');
