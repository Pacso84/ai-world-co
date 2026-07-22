// node telegram-worker/test/cs-routes.test.js — offline: fake env + globális fetch-csere
import { strict as assert } from 'assert';
import { handleChat, handleContact, csCounters, LIMIT_MSG } from '../src/cs-routes.js';

function fakeKv() {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, String(v)); },
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
  if (String(url).includes('api.telegram.org')) { globalThis.__tgSent = (globalThis.__tgSent || 0) + 1; return { ok: true, json: async () => ({}) }; }
  throw new Error('váratlan fetch: ' + url);
};

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

  console.log('✅ cs-routes.test: minden átment');
} finally {
  globalThis.fetch = realFetch;
}
