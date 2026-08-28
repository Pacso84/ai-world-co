// ===================================================================
// TESZT — pipeline-őrkutya (worker oldal)
// ===================================================================
// INGYENES, hálózat nélküli: a fetch-et becsomagoljuk.
// Fut: node core/run-tests.js (a futtató a telegram-worker/test/-et is viszi)
//
// A DÖNTÉS logikáját a core/pipeline-watchdog.test.js fedi. EZ a fájl azt
// nézi, amit csak itt lehet: a beszerzést (GitHub API), a cselekvést
// (repository_dispatch), a nyomhagyást (KV), és hogy BAJ ESETÉN SEM DOB —
// egy Cloudflare cron-ban eldobott hiba némán elveszne.
// ===================================================================
import assert from 'assert/strict';
import { pipelineWatchdog } from '../src/watchdog.js';

let pass = 0;
let bukott = 0;
// ⚠️ A hibát ELFOGJUK, különben az első bukás után a maradék teszt LE SEM FUT
// (a hitelesítés-mutációnál 13-ból 4 eset némán kimaradt).
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

const MOST = Date.parse('2026-08-27T04:07:00.000Z');

/** Egy env, saját KV-utánzattal — így a nyomok és a szünetek is mérhetők. */
const env = (extra = {}) => {
  const tar = new Map();
  return {
    GH_REPO: 'Pacso84/ai-world-co', GH_TOKEN: 'teszt-token', BOT_TOKEN: 'y', OWNER_CHAT_ID: '1',
    __tar: tar,
    FEEDBACK: { get: async k => (tar.has(k) ? tar.get(k) : null), put: async (k, v) => { tar.set(k, v); } },
    ...extra
  };
};

// ⚠️ A `tg()` a GLOBÁLIS fetch-et hívja, nem a beadottat — az első
// változatban ezért látszott "némának" egy olyan őrjárat, ami valójában
// küldött Telegram-üzenetet. A mock tehát a globálisat is elfoglalja.
const EREDETI_FETCH = globalThis.fetch;

/**
 * Rögzíti a hívásokat (fejlécekkel ÉS törzzsel), és előre megadott
 * válaszokat ad. `runsStatus` a HITELESÍTETT lekérdezésre vonatkozik;
 * `runsStatusToken nelkul` a tartalék-útra.
 */
function mockFetch({
  runsAt = '2026-08-26T16:40:40Z', runsStatus = 200, runsStatusNoAuth = null, dispatchOk = true
} = {}) {
  const hivasok = [];
  const fn = async (url, opts = {}) => {
    const h = opts.headers || {};
    hivasok.push({ url: String(url), method: opts.method || 'GET', headers: h, body: opts.body || null });

    if (String(url).includes('/actions/workflows/')) {
      const auth = !!h.Authorization;
      const st = auth ? runsStatus : (runsStatusNoAuth ?? runsStatus);
      return {
        ok: st >= 200 && st < 300, status: st,
        json: async () => ({ workflow_runs: runsAt ? [{ created_at: runsAt }] : [] })
      };
    }
    if (String(url).includes('/dispatches')) {
      return { ok: dispatchOk, status: dispatchOk ? 204 : 403, text: async () => 'nope' };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' };  // Telegram
  };
  fn.hivasok = hivasok;
  fn.runs = () => hivasok.filter(x => x.url.includes('/actions/workflows/'));
  fn.dispatch = () => hivasok.find(x => x.url.includes('/dispatches'));
  fn.telegram = () => hivasok.filter(x => x.url.includes('telegram'));
  globalThis.fetch = fn;      // a tg() emiatt is ide fut be
  return fn;
}

/** A KV-be írt záró nyom (JSON-ként). */
const nyom = e => { try { return JSON.parse(e.__tar.get('watchdog:last-check')); } catch { return null; } };

console.log('🧪 őrkutya (worker)\n');

await t('11,4 óra némaság → ELINDÍTJA a pipeline-t', async () => {
  const f = mockFetch();
  const r = await pipelineWatchdog(env(), f, MOST);
  assert.equal(r.trigger, true);
  assert.equal(r.sent, true);
  assert.ok(f.dispatch(), 'nem hívta a dispatches végpontot');
  assert.equal(f.dispatch().method, 'POST');
});

await t('friss futás → NEM indít, és nem is szól', async () => {
  const f = mockFetch({ runsAt: new Date(MOST - 2 * 3600e3).toISOString() });
  const r = await pipelineWatchdog(env(), f, MOST);
  assert.equal(r.trigger, false);
  assert.ok(!f.dispatch(), 'fölöslegesen indított');
  assert.equal(f.telegram().length, 0, 'fölöslegesen zajongott');
});

await t('⚠️ ha a lekérdezés ELBUKIK, NEM indít vakon — de SZÓL', async () => {
  const f = mockFetch({ runsStatus: 500, runsStatusNoAuth: 500 });
  const r = await pipelineWatchdog(env(), f, MOST);
  assert.equal(r.trigger, false);
  assert.ok(r.reason.startsWith('ISMERETLEN'), r.reason);
  assert.ok(!f.dispatch(), 'vakon indított!');
  assert.equal(f.telegram().length, 1, 'némán maradt');
});

await t('üres futás-lista is "ISMERETLEN", nem "indíts"', async () => {
  const f = mockFetch({ runsAt: null });
  const r = await pipelineWatchdog(env(), f, MOST);
  assert.equal(r.trigger, false);
  assert.ok(!f.dispatch());
});

await t('friss bökés után nem bök újra', async () => {
  const f = mockFetch();
  const e = env();
  e.__tar.set('watchdog:last-poke', new Date(MOST - 3600e3).toISOString());
  const r = await pipelineWatchdog(e, f, MOST);
  assert.equal(r.trigger, false);
  assert.ok(!f.dispatch());
});

await t('SOHA nem dob — a cron-ban eldobott hiba némán elveszne', async () => {
  const robban = async () => { throw new Error('halott hálózat'); };
  const r = await pipelineWatchdog(env(), robban, MOST);
  assert.equal(r.trigger, false);
  assert.ok(r.reason.includes('őrkutya-hiba'), r.reason);
  assert.equal((await pipelineWatchdog({}, mockFetch(), MOST)).trigger, false);
  assert.equal((await pipelineWatchdog(null, mockFetch(), MOST)).trigger, false);
});

await t('⚠️ REGRESSZIÓ-ŐR: érvénytelen `now` mellett SEM dob', async () => {
  // Az első javításom a `new Date(now).toISOString()`-et a try-blokkon KÍVÜLRE
  // tette → `now = NaN` esetén RangeError repült ki. A `ctx.waitUntil()` alatt
  // egy elutasított ígéret NÉMÁN elvész — pontosan az a hibaosztály, ami az
  // egész őrkutyát kiváltotta.
  for (const rossz of [NaN, undefined, 'hopp']) {
    const r = await pipelineWatchdog(env(), mockFetch(), rossz);
    assert.ok(r && typeof r.reason === 'string', String(rossz) + ' → nincs értelmes válasz');
  }
});

await t('a KV hibája nem akasztja meg az őrjáratot', async () => {
  const f = mockFetch();
  const e = env({ FEEDBACK: { get: async () => { throw new Error('KV down'); }, put: async () => { throw new Error('KV down'); } } });
  const r = await pipelineWatchdog(e, f, MOST);
  assert.equal(r.trigger, true, 'a KV-hiba miatt kimaradt a mentés');
});

// ═══════════════════════════════════════════════════════════════════
// 2026-08-28 — a kihagyott őrjáratok után
// ═══════════════════════════════════════════════════════════════════

await t('🔑 a lekérdezés HITELESÍTVE megy (osztott IP-n elfogy a keret)', async () => {
  // Mérve, próba-workerrel a Cloudflare élén: a hitelesítetlen GitHub-keret
  // 60/óra IP-CÍMENKÉNT, és más bérlők 2-21 kérést már elhasználtak
  // (39/60 · 48/60 · 58/60 · 57/60). Tokennel 5000/óra, a tokenhez kötve.
  const f = mockFetch();
  await pipelineWatchdog(env(), f, MOST);
  const q = f.runs()[0];
  assert.ok(q, 'nem kérdezte le a futásokat');
  assert.equal(q.headers.Authorization, 'Bearer teszt-token', 'nem a GH_TOKEN-nel hitelesített');
});

await t('token nélkül is működik (csak hitelesítetlenül)', async () => {
  const f = mockFetch();
  const e = env(); delete e.GH_TOKEN;
  const r = await pipelineWatchdog(e, f, MOST);
  assert.ok(!f.runs()[0].headers.Authorization, 'nem létező tokent küldött');
  assert.equal(r.trigger, true, 'a döntés elromlott token nélkül');
});

await t('🛟 403-nál VISSZAESIK a hitelesítetlen útra — a javítás sosem ronthat', async () => {
  // Ha a GH_TOKEN fine-grained PAT `Actions: Read` nélkül, erre a végpontra
  // PUBLIKUS repón is 403 jön. Tartalék nélkül a javítás MEGÖLNÉ az őrkutyát.
  const f = mockFetch({ runsStatus: 403, runsStatusNoAuth: 200 });
  const r = await pipelineWatchdog(env(), f, MOST);
  assert.equal(f.runs().length, 2, 'nem próbálta újra token nélkül');
  assert.ok(f.runs()[0].headers.Authorization, 'az első kérés nem volt hitelesítve');
  assert.ok(!f.runs()[1].headers.Authorization, 'a tartalék-kérés IS tokent küldött');
  assert.equal(r.trigger, true, 'a tartalék-út ellenére nem indított');
  assert.ok(String(r.allapot).includes('TARTALÉK'), 'nem jelezte, hogy tartalékon van: ' + r.allapot);
});

await t('ha MINDKÉT út bukik, az ISMERETLEN — és a szöveg megmondja, miért', async () => {
  const f = mockFetch({ runsStatus: 403, runsStatusNoAuth: 403 });
  const r = await pipelineWatchdog(env(), f, MOST);
  assert.equal(r.trigger, false);
  const uzenet = String(f.telegram()[0]?.body || '');
  assert.ok(uzenet.includes('403'), 'a riasztás nem mondja meg a HTTP-állapotot: ' + uzenet.slice(0, 160));
  assert.ok(!uzenet.includes('teszt-token'), '🔴 A TOKEN BENNE VAN A TELEGRAM-ÜZENETBEN!');
});

await t('🔍 a ZÁRÓ nyom rögzíti a DÖNTÉST is, nem csak az időt', async () => {
  // Az első teszt-változatom csak azt nézte, hogy „van legalább egy írás" —
  // a záró nyom teljes törlésével is zöld maradt. A `trigger`/`reason` mező
  // a javítás egész értelme, tehát arra kell állítani.
  const f = mockFetch();
  const e = env();
  await pipelineWatchdog(e, f, MOST);
  const n = nyom(e);
  assert.ok(n, 'nincs záró nyom a KV-ben');
  assert.equal(n.trigger, true, 'a nyom nem tartalmazza a döntést');
  assert.ok(n.reason.includes('KIMARADT'), 'a nyomban nincs indoklás: ' + n.reason);
  assert.ok(n.at.startsWith('2026-08-27'), 'a nyomban nincs időbélyeg: ' + n.at);
});

await t('🔍 nyugalomban IS marad nyom — enélkül nem tudni, futott-e', async () => {
  const e = env();
  await pipelineWatchdog(e, mockFetch({ runsAt: new Date(MOST - 2 * 3600e3).toISOString() }), MOST);
  const n = nyom(e);
  assert.ok(n && n.trigger === false && n.reason.includes('rendben'), JSON.stringify(n));
});

await t('🔍 a nyom AKKOR IS megvan, ha az őrjárat DOB', async () => {
  const e = env();
  await pipelineWatchdog(e, async () => { throw new Error('halott hálózat'); }, MOST);
  const n = nyom(e);
  assert.ok(n && n.reason.includes('őrkutya-hiba'), JSON.stringify(n));
});

await t('🔔 a KIVÉTEL-ág is SZÓL (korábban teljesen néma volt)', async () => {
  const f = mockFetch();
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('api.github.com')) throw new Error('halott hálózat');
    return f(url, opts);
  };
  const e = env();
  const r = await pipelineWatchdog(e, async () => { throw new Error('halott hálózat'); }, MOST);
  assert.equal(r.trigger, false);
  assert.ok(e.__tar.get('watchdog:last-alert'), 'a kivétel-ág nem riasztott');
});

await t('🔕 egy tartós hibáról max. 4 óránként szól, nem óránként', async () => {
  // Napi 24 üzenet egy hét alatt láthatatlanná tenné a riasztást.
  const e = env();
  let db = 0;
  for (const ora of [0, 1, 2, 3]) {
    const f = mockFetch({ runsStatus: 500, runsStatusNoAuth: 500 });
    await pipelineWatchdog(e, f, MOST + ora * 3600e3);
    db += f.telegram().length;
  }
  assert.equal(db, 1, '4 óra alatt ' + db + ' üzenetet küldött, nem 1-et');
});

await t('💰 a bökés-nyom az INDÍTÁS ELŐTT rögzül (dupla futás ellen)', async () => {
  // Ha a dispatch DOB (timeout, miközben a GitHub már átvette), a nyomnak
  // akkor is ott kell lennie — különben egy óra múlva újra indítanánk.
  const e = env();
  const dobo = async (url, opts) => {
    if (String(url).includes('/dispatches')) throw new Error('timeout');
    return mockFetch()(url, opts);
  };
  await pipelineWatchdog(e, dobo, MOST);
  assert.ok(e.__tar.get('watchdog:last-poke'), 'dobó dispatch után nem maradt bökés-nyom → DUPLA FUTÁS kockázata');
});

globalThis.fetch = EREDETI_FETCH;
console.log(`\n${bukott === 0 ? '✅' : '❌'} watchdog.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
