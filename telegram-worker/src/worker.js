// ===================================================================
// AI WORLD — Telegram Worker (Cloudflare)
// ===================================================================
// A Telegram webhookját fogadja. Ellenőrzi, hogy a TULAJDONOS írt-e
// (chat-ID), azonnal nyugtáz, majd a GitHub Actions-t indítja
// (repository_dispatch) — a tényleges munkát (tartalom + deploy + válasz)
// a felhőben a főnök (instruct.js) végzi.
//
// SECRET-ek (wrangler secret put):
//   BOT_TOKEN       — a @BotFather token
//   OWNER_CHAT_ID   — a te chat-ID-d (csak te parancsolhatsz)
//   GH_TOKEN        — szűk jogú GitHub PAT (repo dispatch)
//   WEBHOOK_SECRET  — a Telegram webhook titok (kérés-hitelesítés)
// VARS (wrangler.toml):
//   GH_REPO         — pl. "Pacso84/ai-world-co"
// ===================================================================
import { tg } from './tg.js';
import { handleChat, handleContact, csCounters } from './cs-routes.js';

// ===================================================================
// OLVASÓI 👍/👎 VISSZAJELZÉS (2026-07-07) — a weboldal cikkeiről érkezik.
// POST /feedback  {slug, lang, vote:'up'|'down'}  → KV számláló
// GET  /feedback-export  (X-Export-Key fejléccel) → összesítés a heti riportnak
// ===================================================================
const FEEDBACK_CORS = {
  'Access-Control-Allow-Origin': 'https://aiworldhq.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

async function handleFeedback(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: FEEDBACK_CORS });
  if (request.method !== 'POST') return new Response('method', { status: 405, headers: FEEDBACK_CORS });
  let body;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400, headers: FEEDBACK_CORS }); }
  const slug = String(body.slug || '').replace(/[^a-z0-9-]/g, '').slice(0, 80);
  const lang = ['en', 'hu', 'es', 'de', 'fr'].includes(body.lang) ? body.lang : 'en';
  const vote = body.vote === 'up' ? 'up' : body.vote === 'down' ? 'down' : null;
  if (!slug || !vote) return new Response('bad input', { status: 400, headers: FEEDBACK_CORS });
  const key = `fb:${slug}`;
  let rec = { up: 0, down: 0, byLang: {} };
  try { rec = JSON.parse(await env.FEEDBACK.get(key)) || rec; } catch { /* első szavazat */ }
  rec[vote] = (rec[vote] || 0) + 1;
  rec.byLang[lang] = rec.byLang[lang] || { up: 0, down: 0 };
  rec.byLang[lang][vote]++;
  await env.FEEDBACK.put(key, JSON.stringify(rec));
  return new Response('ok', { status: 200, headers: FEEDBACK_CORS });
}

// ===================================================================
// HÍRLEVÉL-FELIRATKOZÁS (2026-07-12) — POST /subscribe {email, lang, web}
// A weboldal saját dobozából jön; a Worker hívja a MailerLite API-t
// (MAILERLITE_TOKEN secret — a kulcs SOHA nem kerül a böngészőbe).
// A "web" mező HONEYPOT: ember üresen hagyja, bot kitölti → csendes eldobás.
// A double opt-in (megerősítő email) a MailerLite-ban van bekapcsolva.
// ===================================================================
async function handleSubscribe(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: FEEDBACK_CORS });
  if (request.method !== 'POST') return new Response('method', { status: 405, headers: FEEDBACK_CORS });
  if (!env.MAILERLITE_TOKEN) return new Response('not configured', { status: 503, headers: FEEDBACK_CORS });
  let body;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400, headers: FEEDBACK_CORS }); }
  if (body.web) return new Response('ok', { status: 200, headers: FEEDBACK_CORS });   // honeypot: bot volt
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return new Response('bad email', { status: 400, headers: FEEDBACK_CORS });
  const lang = ['en', 'hu', 'es', 'de', 'fr'].includes(body.lang) ? body.lang : 'en';
  try {
    const r = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.MAILERLITE_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      // NINCS status mező! Ha explicit státuszt küldünk, a MailerLite átugorja
      // a double opt-in megerősítő emailt (2026-07-12 tanulság). Státusz nélkül
      // az ML maga kezeli: unconfirmed + megerősítő email a feliratkozónak.
      body: JSON.stringify({ email, fields: { language: lang } })
    });
    if (r.status === 200 || r.status === 201 || r.status === 409 || r.status === 422) {
      // 200/201 = felvéve; 409/422 = már szerepel — az olvasónak mindegy: siker
      try { const c = parseInt(await env.FEEDBACK.get('nl:signups') || '0', 10); await env.FEEDBACK.put('nl:signups', String(c + 1)); } catch { /* számláló nem kritikus */ }
      return new Response('ok', { status: 200, headers: FEEDBACK_CORS });
    }
    return new Response('upstream ' + r.status, { status: 502, headers: FEEDBACK_CORS });
  } catch {
    return new Response('upstream error', { status: 502, headers: FEEDBACK_CORS });
  }
}

async function handleFeedbackExport(request, env) {
  // Csak a heti riport olvashatja (titkos fejléc-kulccsal)
  if (!env.FEEDBACK_EXPORT_KEY || request.headers.get('X-Export-Key') !== env.FEEDBACK_EXPORT_KEY) {
    return new Response('forbidden', { status: 403 });
  }
  const out = {};
  const list = await env.FEEDBACK.list({ prefix: 'fb:' });
  for (const k of list.keys) {
    try { out[k.name.slice(3)] = JSON.parse(await env.FEEDBACK.get(k.name)); } catch { /* skip */ }
  }
  // Hírlevél-jelentkezések száma a heti riportnak (2026-07-12)
  try { out.__nl_signups = parseInt(await env.FEEDBACK.get('nl:signups') || '0', 10); } catch { /* skip */ }
  // Ügyfélszolgálat napi számlálói a riportoknak (2026-07-20)
  try { out.__cs = await csCounters(env); } catch { /* skip */ }
  return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export default {
  async fetch(request, env) {
    // Olvasói visszajelzés útvonalak (a Telegram-webhook előtt ágazik el)
    const path = new URL(request.url).pathname;
    if (path === '/feedback') return handleFeedback(request, env);
    if (path === '/feedback-export') return handleFeedbackExport(request, env);
    if (path === '/subscribe') return handleSubscribe(request, env);
    if (path === '/chat') return handleChat(request, env);
    if (path === '/contact') return handleContact(request, env);

    // Egészség-ellenőrzés / böngészős megnyitás
    if (request.method !== 'POST') {
      return new Response('AI World Telegram worker — OK', { status: 200 });
    }

    // A kérés tényleg a Telegramtól jön? (secret_token fejléc)
    if (env.WEBHOOK_SECRET) {
      const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (got !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
    }

    let update;
    try { update = await request.json(); } catch { return new Response('ok'); }

    const msg = update.message || update.edited_message;
    const text = (msg && msg.text || '').trim();
    const chatId = msg && msg.chat && msg.chat.id;
    if (!text || !chatId) return new Response('ok');

    // CSAK a tulajdonos parancsolhat
    if (String(chatId) !== String(env.OWNER_CHAT_ID)) {
      await tg(env, chatId, '⛔ Ez egy privát asszisztens — nincs jogosultságod a használatához.');
      return new Response('ok');
    }

    // Azonnali nyugta (jó UX), a munka a háttérben indul
    await tg(env, chatId, '👍 Megvan! Dolgozom rajta — pár perc és írok az eredménnyel.');

    // A nehéz munka a GitHub Actions-ben (repository_dispatch)
    const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'aiworld-telegram-worker',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event_type: 'telegram-command',
        client_payload: { text, chat_id: chatId }
      })
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.log('GitHub dispatch hiba', r.status, detail);
      await tg(env, chatId, `⚠️ Nem sikerült elindítani a munkát (GitHub ${r.status}). Próbáld kicsit később.`);
    }

    return new Response('ok');
  }
};
