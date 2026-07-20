// ===================================================================
// CS-ROUTES — /chat és /contact végpontok + védelem (2026-07-20).
// Kétszintű limit (10/nap/IP+munkamenet, 300/nap globális) — mint a havi
// vész-stop elve: degradáció (emailre terelés), nem összeomlás.
// IP-t CSAK hashelve tárolunk (adatvédelem). Kill-switch: env.CS_ENABLED.
// ===================================================================
import { answer } from './cs-engine.js';
import { tg } from './tg.js';

const ORIGINS = ['https://aiworldhq.com', 'https://www.aiworldhq.com'];
const LANGS = ['en', 'hu', 'es', 'de', 'fr'];
const SESSION_MAX = 10;      // üzenet / munkamenet
const IP_DAILY_MAX = 10;     // üzenet / nap / látogató
const GLOBAL_DAILY_MAX = 300; // AI-hívás / nap összesen (chat+email)

export const LIMIT_MSG = {
  en: 'I have reached today’s free answer limit. Please use the contact form below — a human will get back to you by email. 💛',
  hu: 'Mára elfogyott az ingyenes válasz-keretem. Kérlek, használd a lenti űrlapot — emailben válaszolunk. 💛',
  es: 'He alcanzado el límite de respuestas gratuitas de hoy. Usa el formulario de contacto — te responderemos por correo. 💛',
  de: 'Mein kostenloses Antwort-Kontingent für heute ist aufgebraucht. Nutze bitte das Kontaktformular — wir antworten per E-Mail. 💛',
  fr: 'J’ai atteint ma limite de réponses gratuites pour aujourd’hui. Utilisez le formulaire de contact — nous vous répondrons par e-mail. 💛'
};
export const ESC_FALLBACK = {
  en: 'I’m not able to help with that here — please use the contact form and a human will reply by email.',
  hu: 'Ebben itt nem tudok segíteni — kérlek, használd az űrlapot, és emailben válaszolunk.',
  es: 'No puedo ayudarte con eso aquí — usa el formulario y te responderemos por correo.',
  de: 'Dabei kann ich hier nicht helfen — nutze bitte das Formular, wir antworten per E-Mail.',
  fr: 'Je ne peux pas vous aider ici — utilisez le formulaire et nous vous répondrons par e-mail.'
};

function cors(request) {
  const o = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}
const j = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: h });

export function dayKey() { return new Date().toISOString().slice(0, 10); }

async function hashIp(ip) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cs-salt:' + ip));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function bump(env, key, ttl) {
  const n = parseInt(await env.FEEDBACK.get(key) || '0', 10) + 1;
  await env.FEEDBACK.put(key, String(n), { expirationTtl: ttl });
  return n;
}

// Napi riport-számlálók: chat-válasz / email-válasz / emberi kézbe adva
export async function bumpCs(env, kind) {
  await bump(env, `cs:${kind}:${dayKey()}`, 172800);
}
export async function csCounters(env) {
  const d = dayKey();
  const out = {};
  for (const k of ['chat', 'mail', 'esc']) {
    out[k] = parseInt(await env.FEEDBACK.get(`cs:${k}:${d}`) || '0', 10);
  }
  return out;
}
export async function globalLimitReached(env) {
  return parseInt(await env.FEEDBACK.get(`cs:global:${dayKey()}`) || '0', 10) >= GLOBAL_DAILY_MAX;
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return false; // nincs beállítva → zárva (mint a MailerLite-minta)
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token || ''), remoteip: ip })
    });
    return (await r.json()).success === true;
  } catch { return false; }
}

export async function handleChat(request, env) {
  const h = cors(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (request.method !== 'POST') return j({ error: 'method' }, 405, h);
  if (env.CS_ENABLED !== 'true') return j({ error: 'off' }, 503, h);
  let body;
  try { body = await request.json(); } catch { return j({ error: 'bad json' }, 400, h); }
  const lang = LANGS.includes(body.lang) ? body.lang : 'en';
  const message = String(body.message || '').trim().slice(0, 500);
  if (!message) return j({ error: 'empty' }, 400, h);
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const iph = await hashIp(ip);

  // Munkamenet: első üzenetnél Turnstile, utána sessionId (KV, 1h)
  let sessionId = String(body.sessionId || '');
  let sess = sessionId ? await env.FEEDBACK.get(`cs:sess:${sessionId}`) : null;
  if (!sess) {
    if (!(await verifyTurnstile(env, body.token, ip))) return j({ error: 'turnstile' }, 403, h);
    sessionId = crypto.randomUUID();
    sess = '0';
    // A munkamenetet AZONNAL rögzítjük (végső review I3): ha az első kérés
    // limitbe ütközik, a visszaadott sessionId létező legyen — a retry NE
    // kérjen újra Turnstile-t (az már elhasznált token → 403 lenne).
    await env.FEEDBACK.put(`cs:sess:${sessionId}`, '0', { expirationTtl: 3600 });
  }
  const sessCount = parseInt(sess, 10);
  if (sessCount >= SESSION_MAX) return j({ limit: true, answer: LIMIT_MSG[lang], links: [], escalate: true, sessionId }, 429, h);
  const ipCount = parseInt(await env.FEEDBACK.get(`cs:ip:${iph}:${dayKey()}`) || '0', 10);
  if (ipCount >= IP_DAILY_MAX) return j({ limit: true, answer: LIMIT_MSG[lang], links: [], escalate: true, sessionId }, 429, h);
  if (await globalLimitReached(env)) return j({ limit: true, answer: LIMIT_MSG[lang], links: [], escalate: true, sessionId }, 429, h);

  const r = await answer(env, { message, lang });
  await env.FEEDBACK.put(`cs:sess:${sessionId}`, String(sessCount + 1), { expirationTtl: 3600 });
  await bump(env, `cs:ip:${iph}:${dayKey()}`, 172800);
  await bump(env, `cs:global:${dayKey()}`, 172800);
  await bumpCs(env, 'chat');
  if (r.escalate) await bumpCs(env, 'esc');
  const text = r.text || ESC_FALLBACK[lang];
  return j({ answer: text, links: r.links, escalate: r.escalate, sessionId }, 200, h);
}

export async function handleContact(request, env) {
  const h = cors(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (request.method !== 'POST') return j({ error: 'method' }, 405, h);
  if (env.CS_ENABLED !== 'true') return j({ error: 'off' }, 503, h);
  let body;
  try { body = await request.json(); } catch { return j({ error: 'bad json' }, 400, h); }
  if (body.web) return j({ ok: true }, 200, h); // honeypot: bot volt, csendes eldobás
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return j({ error: 'bad email' }, 400, h);
  const message = String(body.message || '').trim().slice(0, 2000);
  if (!message) return j({ error: 'empty' }, 400, h);
  const lang = LANGS.includes(body.lang) ? body.lang : 'en';
  const name = String(body.name || '').trim().slice(0, 80);
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const iph = await hashIp(ip);
  if (!(await verifyTurnstile(env, body.token, ip))) return j({ error: 'turnstile' }, 403, h);
  // Napi IP-limit (végső review I2): a kapcsolat-űrlap ugyanabból a napi
  // IP-keretből fogyaszt, mint a chat — anti-flood a Telegram/KV felé.
  const ipCount = parseInt(await env.FEEDBACK.get(`cs:ip:${iph}:${dayKey()}`) || '0', 10);
  if (ipCount >= IP_DAILY_MAX) return j({ error: 'limit', ok: false }, 429, h);

  const ts = Date.now();
  await env.FEEDBACK.put(`cs:msg:${ts}`, JSON.stringify({ email, name, message, lang, ts }), { expirationTtl: 2592000 }); // 30 nap
  await bumpCs(env, 'esc');
  await tg(env, env.OWNER_CHAT_ID, `📝 ÚJ ÜGYFÉL-ÜZENET (űrlap, ${lang})\nFeladó: ${name ? name + ' — ' : ''}${email}\n\n${message.slice(0, 600)}\n\n(Válasz: sima email a feladónak.)`);
  await bump(env, `cs:ip:${iph}:${dayKey()}`, 172800);
  return j({ ok: true }, 200, h);
}
