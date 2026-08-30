// node telegram-worker/test/cs-routes.test.js — offline: fake env + globális fetch-csere
import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { handleChat, handleContact, csCounters, csExport, LIMIT_MSG } from '../src/cs-routes.js';

function fakeKv() {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, String(v)); },
    // A Workers KV `list`-je: {keys:[{name}], list_complete, cursor}. Az export
    // ezen az úton számolja a kézbesítetlen üzeneteket — ha a teszt-utánzatban
    // nem lenne `list`, a mérőeszköz nem azt mérné, ami élesben fut.
    async list({ prefix = '', cursor } = {}) {
      const nevek = [...store.keys()].filter(k => k.startsWith(prefix)).sort();
      const tol = cursor ? nevek.indexOf(cursor) + 1 : 0;
      return { keys: nevek.slice(tol).map(name => ({ name })), list_complete: true, cursor: null };
    },
    _store: store
  };
}
const KB = { v: 1, lang: 'en', site: [], guides: [{ t: 'ChatGPT writing', s: 'guide', u: 'https://aiworldhq.com/article/x', c: 'OpenAI' }], terms: [] };
function baseEnv(over = {}) {
  return {
    CS_ENABLED: 'true', TURNSTILE_SECRET: 'ts-secret', OWNER_CHAT_ID: '42', BOT_TOKEN: 'bt',
    FEEDBACK: fakeKv(),
    AI: { async run() { return { response: 'Here you go.' }; } },
    ...over
  };
}
const realFetch = globalThis.fetch;
// Turnstile-verify + kb-fetch + Telegram — mind hálózat: stub.
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('turnstile')) {
    const body = String(opts.body);
    return { ok: true, json: async () => ({ success: body.includes('good-token') }) };
  }
  if (String(url).includes('kb.json')) return { ok: true, json: async () => KB };
  if (String(url).includes('api.telegram.org')) {
    globalThis.__tgSent = (globalThis.__tgSent || 0) + 1;
    // A Telegram háromféleképp végződhet — a teszt állítja be, melyikkel.
    if (globalThis.__tgMode === 'http500') return { ok: false, status: 500, json: async () => ({ ok: false, description: 'Internal Server Error' }) };
    if (globalThis.__tgMode === 'jsonfalse') return { ok: true, status: 200, json: async () => ({ ok: false, description: 'Forbidden: bot was blocked by the user' }) };
    if (globalThis.__tgMode === 'dob') throw new Error('halott hálózat');
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  }
  throw new Error('váratlan fetch: ' + url);
};
globalThis.__tgMode = 'ok';

function req(path, body, ip = '1.2.3.4') {
  return new Request('https://w.dev' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, Origin: 'https://aiworldhq.com' },
    body: JSON.stringify(body)
  });
}

try {
  // 1) kill-switch: CS_ENABLED!=='true' → 503
  {
    const r = await handleChat(req('/chat', { message: 'hi', lang: 'en', token: 'good-token' }), baseEnv({ CS_ENABLED: 'false' }));
    assert.equal(r.status, 503);
  }
  // 2) nincs/rossz turnstile-token első üzenetnél → 403
  {
    const r = await handleChat(req('/chat', { message: 'hi', lang: 'en', token: 'bad' }), baseEnv());
    assert.equal(r.status, 403);
  }
  // 3) happy path: jó token → 200, sessionId, válasz; a sessionId-vel a 2. üzenethez már nem kell token
  {
    const env = baseEnv();
    const r1 = await handleChat(req('/chat', { message: 'chatgpt writing help', lang: 'en', token: 'good-token' }), env);
    assert.equal(r1.status, 200);
    const j1 = await r1.json();
    assert.ok(j1.sessionId && j1.answer.length > 0);
    const r2 = await handleChat(req('/chat', { message: 'thanks', lang: 'en', sessionId: j1.sessionId }), env);
    assert.equal(r2.status, 200);
    const c = await csCounters(env);
    assert.equal(c.chat, 2, 'két chat-válasz számolva');
  }
  // 4) munkamenet-limit: 10 üzenet után 429 + limit-üzenet
  {
    const env = baseEnv();
    const r1 = await handleChat(req('/chat', { message: 'hello', lang: 'hu', token: 'good-token' }), env);
    const { sessionId } = await r1.json();
    let last;
    for (let i = 0; i < 10; i++) last = await handleChat(req('/chat', { message: 'm' + i, lang: 'hu', sessionId }), env);
    assert.equal(last.status, 429);
    assert.equal((await last.json()).answer, LIMIT_MSG.hu);
  }
  // 5) globális napi limit → 429 AI-hívás nélkül
  {
    const env = baseEnv({ AI: { async run() { throw new Error('NEM szabadna AI-t hívni'); } } });
    const day = new Date().toISOString().slice(0, 10);
    await env.FEEDBACK.put(`cs:global:${day}`, '300');
    const r = await handleChat(req('/chat', { message: 'hi', lang: 'en', token: 'good-token' }), env);
    assert.equal(r.status, 429);
  }
  // 6) contact happy path: KV-mentés + Telegram + esc-számláló; honeypot csendes ok
  {
    const env = baseEnv();
    globalThis.__tgSent = 0;
    const r = await handleContact(req('/contact', { email: 'a@b.hu', message: 'Segítsetek!', lang: 'hu', web: '', token: 'good-token' }), env);
    assert.equal(r.status, 200);
    assert.equal(globalThis.__tgSent, 1, 'Telegram-jelzés kiment');
    assert.ok([...env.FEEDBACK._store.keys()].some(k => k.startsWith('cs:msg:')), 'üzenet elmentve');
    assert.equal((await csCounters(env)).esc, 1);
    const hp = await handleContact(req('/contact', { email: 'x@y.z', message: 'spam', lang: 'en', web: 'bot-filled', token: 'good-token' }), env);
    assert.equal(hp.status, 200);
    assert.equal(globalThis.__tgSent, 1, 'honeypotnál NINCS Telegram');
  }
  // 7) rossz email a contactban → 400
  {
    const r = await handleContact(req('/contact', { email: 'nem-email', message: 'x', lang: 'en', web: '', token: 'good-token' }), baseEnv());
    assert.equal(r.status, 400);
  }
  // 8) I2: /contact SAJÁT napi IP-limit (CONTACT_DAILY_MAX=5, független a chat keretétől) — 5×200, 6. 429
  {
    const env = baseEnv();
    globalThis.__tgSent = 0;
    let last;
    for (let i = 0; i < 5; i++) {
      last = await handleContact(req('/contact', { email: 'a@b.hu', message: 'm' + i, lang: 'hu', web: '', token: 'good-token' }), env);
      assert.equal(last.status, 200, `${i + 1}. contact még 200`);
    }
    last = await handleContact(req('/contact', { email: 'a@b.hu', message: 'm5', lang: 'hu', web: '', token: 'good-token' }), env);
    assert.equal(last.status, 429, '6. contact ugyanarról az IP-ről = 429 (CONTACT_DAILY_MAX)');
  }
  // 9) I3: limit-429 után a visszaadott sessionId LÉTEZIK — retry nem kér Turnstile-t (nem 403)
  {
    const env = baseEnv();
    const day = new Date().toISOString().slice(0, 10);
    await env.FEEDBACK.put(`cs:global:${day}`, '300');
    const r1 = await handleChat(req('/chat', { message: 'hello', lang: 'en', token: 'good-token' }), env);
    assert.equal(r1.status, 429);
    const { sessionId } = await r1.json();
    assert.ok(sessionId, 'kapott sessionId-t a 429-en');
    // retry UGYANAZZAL a sessionId-vel, token NÉLKÜL → NEM 403 (a session létezik), marad 429
    const r2 = await handleChat(req('/chat', { message: 'again', lang: 'en', sessionId }), env);
    assert.notEqual(r2.status, 403, 'a perzisztált session miatt nincs Turnstile-403');
    assert.equal(r2.status, 429, 'globális limit miatt marad 429');
  }
  // 10) KV-HIBA (2026-07-22 audit): eddig kezeletlenül szállt el → nyers worker-hiba
  //     CORS-fejléc nélkül. Most szabályos 503 + eszkaláció (a látogató az űrlapra kerül).
  {
    const env = baseEnv();
    env.FEEDBACK.get = async () => { throw new Error('KV down'); };
    const r = await handleChat(req('/chat', { message: 'hello', lang: 'hu', token: 'good-token' }), env);
    assert.equal(r.status, 503, 'KV-hiba → 503 (nem összeomlás)');
    assert.ok(r.headers.get('Access-Control-Allow-Origin'), 'CORS-fejléc megvan (a böngésző értelmezni tudja)');
    const j = await r.json();
    assert.equal(j.escalate, true, 'eszkalál → a widget felkínálja az űrlapot');
    assert.ok(j.answer && j.answer.length > 0, 'kap érthető üzenetet, nem üres hibát');
  }
  // 11) /contact is túléli a KV-hibát
  {
    const env = baseEnv();
    env.FEEDBACK.get = async () => { throw new Error('KV down'); };
    const r = await handleContact(req('/contact', { email: 'a@b.hu', message: 'x', lang: 'hu', web: '', token: 'good-token' }), env);
    assert.equal(r.status, 503);
    assert.ok(r.headers.get('Access-Control-Allow-Origin'), 'CORS-fejléc megvan');
  }

  // ═════════════════════════════════════════════════════════════════
  // 2026-08-30 — A KAPCSOLAT-ŰRLAP ÜZENETE NÉMÁN ELVESZHETETT
  // ═════════════════════════════════════════════════════════════════
  // A `tg()` elnyelte a Telegram hibáit, a `contactFlow` pedig nem is nézte
  // az eredményt: a látogató {ok:true}-t kapott ("válaszolni fogunk"), a
  // tulajdonos viszont SOHA nem értesült az üzenetről. A `cs:msg:*` kulcsokat
  // a repóban SENKI nem olvassa — a mentés önmagában nem értesítés.
  const contact = (env, over = {}) => handleContact(
    req('/contact', { email: 'a@b.hu', message: 'Segítsetek!', lang: 'hu', web: '', token: 'good-token', ...over }), env);
  const unsentKeys = env => [...env.FEEDBACK._store.keys()].filter(k => k.startsWith('cs:unsent:'));

  // 12) Telegram HTTP-hiba → a látogató felé változatlan, DE marad NYOM
  {
    const env = baseEnv();
    globalThis.__tgMode = 'http500';
    const r = await contact(env);
    globalThis.__tgMode = 'ok';
    assert.equal(r.status, 200, 'a látogató viselkedése nem változhat');
    assert.equal((await r.json()).ok, true);
    const k = unsentKeys(env);
    assert.equal(k.length, 1, 'a kézbesítetlen üzenetnek nem maradt nyoma (HTTP-hiba)');
    const rec = JSON.parse(env.FEEDBACK._store.get(k[0]));
    assert.equal(rec.email, 'a@b.hu', 'a nyomban nincs benne a feladó');
    assert.equal(rec.message, 'Segítsetek!', 'a nyomban nincs benne az ÜZENET — így nem lehet megválaszolni');
    assert.ok(!JSON.stringify(rec).includes('bt'), 'nem szivároghat ki a BOT_TOKEN');
  }
  // 13) Telegram {ok:false} JSON (HTTP 200!) → ugyanúgy kézbesítetlen
  {
    const env = baseEnv();
    globalThis.__tgMode = 'jsonfalse';
    const r = await contact(env);
    globalThis.__tgMode = 'ok';
    assert.equal(r.status, 200);
    assert.equal(unsentKeys(env).length, 1, 'a törzsbeli {ok:false} átcsúszott sikerként');
  }
  // 14) siker → NINCS fölösleges nyom (különben a riport hamisan riogatna)
  {
    const env = baseEnv();
    const r = await contact(env);
    assert.equal(r.status, 200);
    assert.equal(unsentKeys(env).length, 0, 'sikeres küldésnél is kézbesítetlennek jelölte');
    const ex = await csExport(env);
    assert.equal(ex.unsent, 0, 'sikernél sem 0 a kézbesítetlenek száma');
    assert.equal(ex.unsentLast, null);
  }
  // 15) 📮 AZ EXPORTBAN MEGJELENIK — ez a lánc VÉGE: eddig jut el a tulajdonoshoz
  {
    const env = baseEnv();
    globalThis.__tgMode = 'http500';
    await contact(env, { message: 'első' });
    await contact(env, { message: 'második' });
    globalThis.__tgMode = 'ok';
    const ex = await csExport(env);
    assert.equal(ex.unsent, 2, 'az export nem látja a kézbesítetlen üzeneteket: ' + JSON.stringify(ex));
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(String(ex.unsentLast)), 'nincs (ISO) időbélyeg: ' + ex.unsentLast);
    assert.equal(ex.esc, 2, 'a meglévő számlálók eltűntek az exportból');
    assert.ok(!('unsentError' in ex), 'hibát jelzett, pedig a listázás ment');
  }
  // 16) ha a NYOM írása IS elbukik, a látogató NE kapjon hamis ígéretet
  {
    const env = baseEnv();
    const eredetiPut = env.FEEDBACK.put.bind(env.FEEDBACK);
    env.FEEDBACK.put = async (k, v, o) => {
      if (k.startsWith('cs:unsent:')) throw new Error('KV down');
      return eredetiPut(k, v, o);
    };
    globalThis.__tgMode = 'dob';
    const r = await contact(env);
    globalThis.__tgMode = 'ok';
    assert.equal(r.status, 503, 'se Telegram, se nyom — mégis {ok:true}-t ígért a látogatónak');
    assert.ok(r.headers.get('Access-Control-Allow-Origin'), 'CORS-fejléc megvan');
  }
  // 17) a listázás hibája NE vigye magával a napi számlálókat — és ne
  //     látsszon "0 kézbesítetlen"-nek ("elromlott" ≠ "nem volt dolga")
  {
    const env = baseEnv();
    await contact(env);
    env.FEEDBACK.list = async () => { throw new Error('KV list down'); };
    const ex = await csExport(env);
    assert.equal(ex.esc, 1, 'a list-hiba elvitte a számlálókat is');
    assert.equal(ex.unsentError, true, 'a sikertelen listázás "0 kézbesítetlen"-nek látszik');
    assert.ok(!('unsent' in ex) || ex.unsent === null, 'hamis nullát írt ki');
  }

  // 19) ⏱️ UGYANABBAN AZ EZREDMÁSODPERCBEN érkező két üzenet NEM írja felül
  //     egymást — sem a mentés, sem a kézbesítetlen-nyom.
  //     Ez a 15) esetben előbb VÉLETLENSZERŰEN bukó tesztként jelentkezett:
  //     a `Date.now()` önmagában nem egyedi kulcs. Itt már nem a szerencsén
  //     múlik — az órát kikötjük.
  {
    const env = baseEnv();
    const eredetiNow = Date.now;
    Date.now = () => 1756500000000;
    globalThis.__tgMode = 'http500';
    try {
      await contact(env, { message: 'egyszerre-A' });
      await contact(env, { message: 'egyszerre-B' });
    } finally {
      Date.now = eredetiNow;
      globalThis.__tgMode = 'ok';
    }
    assert.equal([...env.FEEDBACK._store.keys()].filter(k => k.startsWith('cs:msg:')).length, 2,
      'két egyidejű üzenetből csak egy maradt meg (cs:msg: kulcs-ütközés)');
    assert.equal(unsentKeys(env).length, 2, 'két egyidejű kézbesítetlenből csak egy maradt meg');
    const ex = await csExport(env);
    assert.equal(ex.unsent, 2, 'az export csak egyet lát a kettőből');
    assert.equal(ex.unsentLast, new Date(1756500000000).toISOString(), 'az időbélyeg nem olvasható ki a kulcsból: ' + ex.unsentLast);
  }

  // 18) 🔌 A HUZAL IS LEGYEN BEKÖTVE. A `worker.js` node alatt NEM
  //     importálható (`cloudflare:email`), ezért szövegként nézzük meg, hogy
  //     a /feedback-export tényleg a bővített összeállítót használja. Ez a
  //     lánc utolsó szeme: enélkül a `csExport` zölden állhatna használatlanul.
  {
    const src = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf-8');
    assert.ok(/out\.__cs\s*=\s*await\s+csExport\(env\)/.test(src), 'a /feedback-export nem a csExport()-ot adja ki');
    assert.ok(/import\s*\{[^}]*csExport[^}]*\}\s*from\s*'\.\/cs-routes\.js'/.test(src), 'a worker.js nem importálja a csExport-ot');
  }

  console.log('✅ cs-routes.test: minden átment');
} finally {
  globalThis.fetch = realFetch;
}
