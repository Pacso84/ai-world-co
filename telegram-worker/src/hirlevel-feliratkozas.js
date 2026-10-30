// ===================================================================
// HÍRLEVÉL-FELIRATKOZÁS — Worker-oldal (2026-10-30, Kit)
// ===================================================================
// POST /subscribe {email, web}  ← a honlap doboza (core/hirlevel-doboz.js)
// A 07-12-i MailerLite-handler mintájára (d403b617 előtt), Kit API v4-gyel:
//   1) POST /v4/subscribers {email_address}           — a Kit szerint a feliratkozónak léteznie kell
//   2) POST /v4/forms/{KIT_FORM_ID}/subscribers        — az űrlap küldi a megerősítő („incentive”) levelet
// (developers.kit.com/api-reference/forms/add-subscriber-to-form-by-email-address)
// ⚠️ Hogy a 2. lépés tényleg kiküldi-e a megerősítő levelet, az élőben igazolandó egy próba-feliratkozással.
// Titkok: KIT_API_KEY + KIT_FORM_ID (Worker-secret / var) — a kulcs SOHA nem kerül a böngészőbe.
// A „web” mező HONEYPOT: ember üresen hagyja, bot kitölti → csendes „ok”, nincs hívás.
// ===================================================================

const CORS = { 'Access-Control-Allow-Origin': 'https://aiworldhq.com', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const valasz = (szoveg, status) => new Response(szoveg, { status, headers: CORS });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function handleSubscribe(request, env, fetchFn = fetch) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return valasz('method', 405);
  const kulcs = String(env.KIT_API_KEY || '').trim(), urlap = String(env.KIT_FORM_ID || '').trim();
  if (!kulcs || !/^\d+$/.test(urlap)) return valasz('not configured', 503);
  let body;
  try { body = await request.json(); } catch { return valasz('bad json', 400); }
  if (body && body.web) return valasz('ok', 200);   // honeypot: bot volt
  const email = String((body && body.email) || '').trim().toLowerCase().slice(0, 120);
  if (!EMAIL.test(email)) return valasz('bad email', 400);
  const fej = { 'X-Kit-Api-Key': kulcs, 'Content-Type': 'application/json', Accept: 'application/json' };
  try {
    const a = await fetchFn('https://api.kit.com/v4/subscribers', { method: 'POST', headers: fej, body: JSON.stringify({ email_address: email, state: 'inactive' }) });   // 10-30 élőben: state nélkül rögtön „active” lett → nem ment megerősítő levél
    if (![200, 201, 202].includes(a.status)) return valasz('upstream ' + a.status, 502);
    const b = await fetchFn(`https://api.kit.com/v4/forms/${urlap}/subscribers`, { method: 'POST', headers: fej,
      body: JSON.stringify({ email_address: email, referrer: 'https://aiworldhq.com' }) });
    if (b.status !== 200 && b.status !== 201) return valasz('upstream ' + b.status, 502);
    try { const c = parseInt(await env.FEEDBACK.get('nl:signups') || '0', 10); await env.FEEDBACK.put('nl:signups', String(c + 1)); } catch { /* számláló nem kritikus */ }
    return valasz('ok', 200);
  } catch {
    return valasz('upstream error', 502);
  }
}
