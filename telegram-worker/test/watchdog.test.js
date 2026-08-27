// ===================================================================
// TESZT — pipeline-őrkutya (worker oldal)
// ===================================================================
// INGYENES, hálózat nélküli: a fetch-et becsomagoljuk.
// Fut: node telegram-worker/test/watchdog.test.js
//
// A DÖNTÉS logikáját a core/pipeline-watchdog.test.js fedi. EZ a fájl azt
// nézi, amit csak itt lehet: a beszerzést (GitHub API), a cselekvést
// (repository_dispatch), és hogy BAJ ESETÉN SEM DOB — egy Cloudflare
// cron-ban eldobott hiba némán elveszne.
// ===================================================================
import assert from 'assert/strict';
import { pipelineWatchdog } from '../src/watchdog.js';

let pass = 0;
const t = async (name, fn) => { await fn(); pass++; console.log('  ✅ ' + name); };

const MOST = Date.parse('2026-08-27T04:07:00.000Z');
const env = (extra = {}) => ({
  GH_REPO: 'Pacso84/ai-world-co', GH_TOKEN: 'x', BOT_TOKEN: 'y', OWNER_CHAT_ID: '1',
  FEEDBACK: { get: async () => null, put: async () => {} }, ...extra
});

// ⚠️ A `tg()` a GLOBÁLIS fetch-et hívja, nem a beadottat — az első
// változatban ezért látszott "némának" egy olyan őrjárat, ami valójában
// küldött Telegram-üzenetet. A mock tehát a globálisat is elfoglalja.
const eredetiFetch = globalThis.fetch;

/** Rögzíti a hívásokat, és előre megadott válaszokat ad. */
function mockFetch({ runsAt = '2026-08-26T16:40:40Z', runsOk = true, dispatchOk = true } = {}) {
  const hivasok = [];
  const fn = async (url, opts = {}) => {
    hivasok.push({ url: String(url), method: opts.method || 'GET' });
    if (String(url).includes('/actions/workflows/')) {
      return runsOk
        ? { ok: true, json: async () => ({ workflow_runs: runsAt ? [{ created_at: runsAt }] : [] }) }
        : { ok: false, status: 500, json: async () => ({}) };
    }
    if (String(url).includes('/dispatches')) {
      return { ok: dispatchOk, status: dispatchOk ? 204 : 403, text: async () => 'nope' };
    }
    return { ok: true, json: async () => ({}), text: async () => '' };   // Telegram
  };
  fn.hivasok = hivasok;
  globalThis.fetch = fn;      // a tg() emiatt is ide fut be
  return fn;
}

console.log('🧪 őrkutya (worker)\n');

await t('11,4 óra némaság → ELINDÍTJA a pipeline-t', async () => {
  const f = mockFetch();
  const r = await pipelineWatchdog(env(), f, MOST);
  assert.equal(r.trigger, true);
  assert.equal(r.sent, true);
  const d = f.hivasok.find(x => x.url.includes('/dispatches'));
  assert.ok(d, 'nem hívta a dispatches végpontot');
  assert.equal(d.method, 'POST');
});

await t('friss futás → NEM indít, és nem is szól', async () => {
  const f = mockFetch({ runsAt: new Date(MOST - 2 * 3600e3).toISOString() });
  const r = await pipelineWatchdog(env(), f, MOST);
  assert.equal(r.trigger, false);
  assert.ok(!f.hivasok.some(x => x.url.includes('/dispatches')), 'fölöslegesen indított');
  assert.ok(!f.hivasok.some(x => x.url.includes('telegram')), 'fölöslegesen zajongott');
});

await t('⚠️ ha a lekérdezés ELBUKIK, NEM indít vakon — de SZÓL', async () => {
  // A vak indítás duplikált futás és dupla költés lenne. A némaság viszont
  // ugyanúgy nézne ki, mint a nyugalom — ezért megy Telegram-üzenet.
  const f = mockFetch({ runsOk: false });
  const r = await pipelineWatchdog(env(), f, MOST);
  assert.equal(r.trigger, false);
  assert.ok(r.reason.startsWith('ISMERETLEN'), r.reason);
  assert.ok(!f.hivasok.some(x => x.url.includes('/dispatches')), 'vakon indított!');
  assert.ok(f.hivasok.some(x => x.url.includes('telegram')), 'némán maradt');
});

await t('üres futás-lista is "ISMERETLEN", nem "indíts"', async () => {
  const f = mockFetch({ runsAt: null });
  const r = await pipelineWatchdog(env(), f, MOST);
  assert.equal(r.trigger, false);
  assert.ok(!f.hivasok.some(x => x.url.includes('/dispatches')));
});

await t('a bökés tényét SIKERTELEN indításnál is rögzíti', async () => {
  // Enélkül óránként újrapróbálnánk ugyanazt.
  let mentett = null;
  const f = mockFetch({ dispatchOk: false });
  const e = env({ FEEDBACK: { get: async () => null, put: async (k, v) => { mentett = { k, v }; } } });
  const r = await pipelineWatchdog(e, f, MOST);
  assert.equal(r.sent, false);
  assert.ok(mentett, 'nem rögzítette a bökést');
  assert.ok(mentett.k.includes('watchdog'));
});

await t('friss bökés után nem bök újra', async () => {
  const f = mockFetch();
  const e = env({ FEEDBACK: { get: async () => new Date(MOST - 3600e3).toISOString(), put: async () => {} } });
  const r = await pipelineWatchdog(e, f, MOST);
  assert.equal(r.trigger, false);
  assert.ok(!f.hivasok.some(x => x.url.includes('/dispatches')));
});

await t('SOHA nem dob — a cron-ban eldobott hiba némán elveszne', async () => {
  const robban = async () => { throw new Error('halott hálózat'); };
  const r = await pipelineWatchdog(env(), robban, MOST);
  assert.equal(r.trigger, false);
  assert.ok(r.reason.includes('őrkutya-hiba'), r.reason);
  // KV nélkül és env nélkül sem
  assert.equal((await pipelineWatchdog({}, mockFetch(), MOST)).trigger, false);
  assert.equal((await pipelineWatchdog(null, mockFetch(), MOST)).trigger, false);
});

await t('a KV hibája nem akasztja meg az őrjáratot', async () => {
  const f = mockFetch();
  const e = env({ FEEDBACK: { get: async () => { throw new Error('KV down'); }, put: async () => { throw new Error('KV down'); } } });
  const r = await pipelineWatchdog(e, f, MOST);
  assert.equal(r.trigger, true, 'a KV-hiba miatt kimaradt a mentés');
});

console.log(`\n✅ watchdog.test: mind a ${pass} eset rendben`);
