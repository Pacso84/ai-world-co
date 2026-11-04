// ===================================================================
// TESZT — tg() küldés-visszajelzés (2026-08-30)
// ===================================================================
// INGYENES, hálózat nélküli: a globális fetch le van cserélve.
// Fut: node core/run-tests.js (a futtató a telegram-worker/test/-et is viszi)
//
// MIÉRT VAN EZ A FÁJL: a `tg()` eddig ELNYELTE a Telegram hibáit — sem a
// `r.ok`-t nem nézte, sem visszatérési értéke nem volt. Egy 403 („bot was
// blocked") pontosan úgy nézett ki, mint egy sikeres küldés, és a hívó
// (kapcsolat-űrlap, őrkutya) erre építette a saját „megvan" állapotát.
// Ezért itt a VISSZATÉRÉSI ÉRTÉKET mérjük, nem azt, hogy „nem dobott".
// ===================================================================
import assert from 'assert/strict';
import { tg } from '../src/tg.js';

let pass = 0;
let bukott = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) { bukott++; console.log('  ❌ ' + name + '\n     ' + String(e.message).split('\n')[0]); }
};

const EREDETI_FETCH = globalThis.fetch;
const ENV = { BOT_TOKEN: 'titkos-bot-token', OWNER_CHAT_ID: '42' };

/** Egy Telegram-válasz utánzata. `json` szándékosan elhagyható (nem-JSON válasz). */
function mockFetch(valasz) {
  const hivasok = [];
  const fn = async (url, opts = {}) => {
    hivasok.push({ url: String(url), body: opts.body || null });
    if (typeof valasz === 'function') return valasz(url, opts);
    return valasz;
  };
  fn.hivasok = hivasok;
  globalThis.fetch = fn;
  return fn;
}

console.log('🧪 tg() — küldés-visszajelzés\n');

await t('siker: HTTP 200 + {ok:true} → { ok: true }', async () => {
  mockFetch({ ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 7 } }) });
  const r = await tg(ENV, '42', 'szia');
  assert.equal(r.ok, true, 'a sikeres küldés nem ok:true');
  assert.equal(r.status, 200);
});

await t('🔴 HTTP-hiba (403) → a HÍVÓ MEGTUDJA (ok:false + status)', async () => {
  // Élesben ez a „bot was blocked by the user" eset: a Telegram 403-at ad,
  // a régi tg() ezt teljesen elnyelte.
  mockFetch({ ok: false, status: 403, json: async () => ({ ok: false, description: 'Forbidden: bot was blocked by the user' }) });
  const r = await tg(ENV, '42', 'szia');
  assert.equal(r.ok, false, 'a 403-at sikernek vette');
  assert.equal(r.status, 403);
  assert.ok(/blocked/.test(String(r.description)), 'nincs indoklás: ' + r.description);
});

await t('🔴 HTTP 200, de {ok:false} JSON → a HÍVÓ MEGTUDJA', async () => {
  // A Telegram nem mindig HTTP-hibával jelez: a törzsben jön az {ok:false}.
  // Ha csak az r.ok-t néznénk, ez a hiba UGYANÚGY láthatatlan maradna.
  mockFetch({ ok: true, status: 200, json: async () => ({ ok: false, description: 'Bad Request: chat not found' }) });
  const r = await tg(ENV, '999', 'szia');
  assert.equal(r.ok, false, 'a törzsbeli {ok:false} átcsúszott sikerként');
  assert.ok(/chat not found/.test(String(r.description)), 'nincs indoklás: ' + r.description);
});

await t('🔴 429 (rate limit) → ok:false', async () => {
  mockFetch({ ok: false, status: 429, json: async () => ({ ok: false, description: 'Too Many Requests: retry after 30' }) });
  const r = await tg(ENV, '42', 'szia');
  assert.equal(r.ok, false);
  assert.equal(r.status, 429);
});

await t('SOHA NEM DOB: hálózati hiba → ok:false, nem kivétel', async () => {
  // A hívók (őrkutya, cs-routes) erre építenek — a szerződés nem változhat.
  mockFetch(async () => { throw new Error('halott hálózat'); });
  const r = await tg(ENV, '42', 'szia');
  assert.equal(r.ok, false, 'hálózati hibánál nem ok:false');
});

await t('SOHA NEM DOB: hiányzó env (null) sem robban', async () => {
  mockFetch({ ok: true, status: 200, json: async () => ({ ok: true }) });
  const r = await tg(null, undefined, 'szia');
  assert.ok(r && typeof r.ok === 'boolean', 'nem adott értelmes választ: ' + JSON.stringify(r));
});

await t('SOHA NEM DOB: nem-JSON válasz (nincs .json) sem robban', async () => {
  // Cloudflare/Telegram közti proxy-hiba HTML-t is adhat. HTTP 200 → siker,
  // a törzs olvashatatlansága önmagában nem bizonyítja a kézbesítetlenséget.
  mockFetch({ ok: true, status: 200 });
  const r = await tg(ENV, '42', 'szia');
  assert.equal(r.ok, true, 'nem-JSON 200-at bukásnak vette');
  const r2 = await tg(ENV, '42', 'szia2');
  assert.ok(r2 && typeof r2.ok === 'boolean');
});

await t('nem-JSON válasz HTTP 500-nál → ok:false (a status a döntő)', async () => {
  mockFetch({ ok: false, status: 500, text: async () => '<html>oops</html>' });
  const r = await tg(ENV, '42', 'szia');
  assert.equal(r.ok, false);
  assert.equal(r.status, 500);
});

await t('🔑 a visszaadott hiba SOHA nem tartalmazza a BOT_TOKEN-t', async () => {
  // A hívók a description-t Telegram-üzenetbe/riportba teszik.
  mockFetch({ ok: false, status: 401, json: async () => ({ ok: false, description: 'Unauthorized' }) });
  const r = await tg(ENV, '42', 'szia');
  assert.ok(!JSON.stringify(r).includes(ENV.BOT_TOKEN), '🔴 A TOKEN BENNE VAN A VISSZATÉRÉSI ÉRTÉKBEN!');
});

await t('a kérés változatlan: POST a sendMessage-re, chat_id + text a törzsben', async () => {
  const f = mockFetch({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await tg(ENV, '42', 'próba-szöveg');
  const h = f.hivasok[0];
  assert.ok(h, 'nem is hívta a Telegramot');
  assert.ok(h.url.includes('/sendMessage'), 'nem a sendMessage-t hívta: ' + h.url);
  const body = JSON.parse(h.body);
  assert.equal(body.chat_id, '42');
  assert.equal(body.text, 'próba-szöveg');
});

globalThis.fetch = EREDETI_FETCH;
console.log(`\n${bukott === 0 ? '✅' : '❌'} tg.test: ${pass} rendben, ${bukott} bukott`);
process.exit(bukott === 0 ? 0 : 1);
