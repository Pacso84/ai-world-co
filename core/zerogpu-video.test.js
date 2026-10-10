// core/zerogpu-video.js — ingyenes MI-videóklip (2026-10-09). Hálózat nélkül: hamis fetch.
import assert from 'node:assert/strict';
import { sseEsemenyek, kvotaHibaE, mp4Url, ltxAdat, zerogpuKlip } from './zerogpu-video.js';

let hiba = 0;
const t = async (nev, fn) => { try { await fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 zerogpu-video');

const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(20000)]);
const SSE_OK = 'event: heartbeat\ndata: null\n\nevent: complete\ndata: [{"path": "/tmp/x.mp4", "url": "https://s.hf.space/gradio_api/file=/tmp/x.mp4"}, 10]\n\n';
const hamis = (sse, { video = MP4, post = 200 } = {}) => {
  const hivasok = [];
  const fetchFn = async (url, opt = {}) => {
    hivasok.push({ url, opt });
    if (url.endsWith('/call/generate_video')) return { ok: post === 200, status: post, json: async () => ({ event_id: 'e1' }) };
    if (url.includes('/call/generate_video/e1')) return { ok: true, text: async () => sse };
    return { ok: true, status: 200, arrayBuffer: async () => video };
  };
  return { fetchFn, hivasok };
};

await t('SSE-események és MP4-URL kiolvasása', () => {
  const e = sseEsemenyek(SSE_OK);
  assert.deepEqual(e.map(x => x[0]), ['heartbeat', 'complete']);
  assert.equal(mp4Url(e[1][1]), 'https://s.hf.space/gradio_api/file=/tmp/x.mp4');
  assert.equal(mp4Url('[{"url": "https://x/kep.png"}]'), null);
});

await t('álló méret 32-vel osztható, a hossz 1–10 mp közé szorítva', () => {
  const d = ltxAdat({ prompt: 'p', mp: 99, magas: 1000, szeles: 560 });
  assert.equal(d[1], 'p');
  assert.equal(d[2], 10);
  assert.equal(d[6] % 32, 0); assert.equal(d[7] % 32, 0);
  assert.ok(d[6] > d[7], 'álló (magasabb, mint széles)');
});

await t('✅ siker CSAK valódi, letöltött MP4-gyel; a token a fejlécben megy', async () => {
  const { fetchFn, hivasok } = hamis(SSE_OK);
  const r = await zerogpuKlip({ prompt: 'p', token: 'hf_teszt', fetchFn });
  assert.equal(r.ok, true);
  assert.ok(r.buf.length > 10000);
  assert.ok(hivasok.every(h => (h.opt.headers || {}).Authorization === 'Bearer hf_teszt'), 'a kulcs nem minden hívásban ment');
  assert.ok(hivasok.every(h => !String(h.url).includes('hf_teszt')), 'a kulcs az URL-be került (naplóba szivárogna)');
});

await t('🔴 HTML-hibaoldal MP4 helyett = NEM siker', async () => {
  const { fetchFn } = hamis(SSE_OK, { video: Buffer.from('<html>' + 'x'.repeat(20000)) });
  const r = await zerogpuKlip({ prompt: 'p', fetchFn });
  assert.equal(r.ok, false);
  assert.match(r.hiba, /nem MP4/);
});

await t('🔴 elfogyott keret: külön jelölve (nem „elromlott")', async () => {
  const { fetchFn } = hamis('event: error\ndata: "You have exceeded your GPU quota (75s requested vs. 40s left)."\n\n');
  const r = await zerogpuKlip({ prompt: 'p', fetchFn });
  assert.equal(r.ok, false);
  assert.equal(r.kvota, true);
  assert.ok(kvotaHibaE('You have exceeded your free GPU quota'));
  assert.ok(!kvotaHibaE('CUDA out of memory'));
});

await t('🔴 üres hiba (data: null, élő eset 10-10) = valószínű kvóta, nem „ismeretlen"', async () => {
  const { fetchFn } = hamis('event: error\ndata: null\n\n');
  const r = await zerogpuKlip({ prompt: 'p', fetchFn });
  assert.equal(r.ok, false);
  assert.equal(r.kvota, true);
  assert.match(r.hiba, /elfogyott a napi keret/);
});

await t('hálózati hiba / rossz POST → ok:false, nem dob kivételt', async () => {
  assert.equal((await zerogpuKlip({ prompt: 'p', fetchFn: async () => { throw new Error('ECONNRESET'); } })).ok, false);
  const { fetchFn } = hamis(SSE_OK, { post: 503 });
  assert.match((await zerogpuKlip({ prompt: 'p', fetchFn })).hiba, /503/);
});

if (hiba) { console.log(`\n❌ zerogpu-video.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ zerogpu-video.test: mind rendben');
