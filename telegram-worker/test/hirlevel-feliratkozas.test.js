// node telegram-worker/test/hirlevel-feliratkozas.test.js — hírlevél-feliratkozás, Worker-oldal (offline, hamis Kit + KV)
import { strict as assert } from 'assert';
import { handleSubscribe } from '../src/hirlevel-feliratkozas.js';

const kv = () => { const t = new Map(); return { t, get: async k => t.get(k) ?? null, put: async (k, v) => { t.set(k, v); } }; };
const keres = (body, method = 'POST') => new Request('https://w.invalid/subscribe', {
  method, headers: { 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const ENV = () => ({ KIT_API_KEY: 'kulcs', KIT_FORM_ID: '311', FEEDBACK: kv() });
const kit = (allapotok) => { const hivasok = []; let i = 0;
  return { hivasok, f: async (url, o) => { hivasok.push([url, JSON.parse(o.body), o.headers]); return new Response('{}', { status: allapotok[i++] ?? 201 }); } }; };

// beállítás nélkül nem hív semmit
{ const k = kit([]); const r = await handleSubscribe(keres({ email: 'a@b.co' }), { FEEDBACK: kv() }, k.f);
  assert.equal(r.status, 503); assert.equal(k.hivasok.length, 0); }

// honeypot: csendes ok, nincs hívás
{ const k = kit([]); const r = await handleSubscribe(keres({ email: 'a@b.co', web: 'http://spam' }), ENV(), k.f);
  assert.equal(r.status, 200); assert.equal(k.hivasok.length, 0); }

// hibás cím
{ const k = kit([]); const r = await handleSubscribe(keres({ email: 'nem-email' }), ENV(), k.f);
  assert.equal(r.status, 400); assert.equal(k.hivasok.length, 0); }

// rendes út: létrehozás, majd az űrlapra (a megerősítő levélhez); számláló nő; kulcs fejlécben
{ const k = kit([201, 201]); const env = ENV(); const r = await handleSubscribe(keres({ email: ' A@B.co ' }), env, k.f);
  assert.equal(r.status, 200);
  assert.equal(k.hivasok[0][0], 'https://api.kit.com/v4/subscribers'); assert.equal(k.hivasok[0][1].email_address, 'a@b.co');
  assert.equal(k.hivasok[1][0], 'https://api.kit.com/v4/forms/311/subscribers');
  assert.equal(k.hivasok[0][2]['X-Kit-Api-Key'], 'kulcs');
  assert.equal(env.FEEDBACK.t.get('nl:signups'), '1'); }

// már feliratkozott (200 az űrlapnál) = siker az olvasónak
{ const k = kit([200, 200]); assert.equal((await handleSubscribe(keres({ email: 'a@b.co' }), ENV(), k.f)).status, 200); }

// Kit-hiba → 502 (nem hamis siker), az űrlap-lépés el sem indul
{ const k = kit([401]); const r = await handleSubscribe(keres({ email: 'a@b.co' }), ENV(), k.f);
  assert.equal(r.status, 502); assert.equal(k.hivasok.length, 1); }

// CORS előkérés
{ const r = await handleSubscribe(keres(null, 'OPTIONS'), ENV(), kit([]).f); assert.equal(r.status, 204); }

console.log('✅ hirlevel-feliratkozas.test: mind rendben');
