// ===================================================================
// „BEVÁLT?” SZÁMLÁLÓ (2026-10-23, user: „az előzőeket is csináljuk!” — Gemini-javaslat:
// „did this tip work?” a promptok mellett). Terv: docs/superpowers/specs/2026-10-23-utmutato-segitseg-csomag-design.md (C).
// POST /fbp-hit {slug, lang, v} → KV: fbp:<UTC-nap>:<slug>:<up|down> += 1.
// A gomb csak a prompt Másolása után jelenik meg (website/assets/app.js) — azt nem tároljuk, ki szavazott.
// Nincs titok (a böngésző hívja) → szigorú bemenet-ellenőrzés + kulcsonkénti napi plafon.
// ===================================================================
export const NAPI_PLAFON = 300;
const MEGORZES_MP = 400 * 24 * 3600;
const SLUG = /^[a-z0-9-]{3,80}$/;
const NYELVEK = ['en', 'hu', 'es'];
const CORS = {
  'Access-Control-Allow-Origin': 'https://aiworldhq.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const valasz = (szoveg, status) => new Response(szoveg, { status, headers: CORS });

export async function handleFbpHit(request, env, now = Date.now()) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return valasz('method', 405);
  let b;
  try { b = await request.json(); } catch { return valasz('bad json', 400); }
  const slug = String(b?.slug ?? ''), lang = String(b?.lang ?? ''), v = String(b?.v ?? '');
  if (!SLUG.test(slug) || !NYELVEK.includes(lang) || !['up', 'down'].includes(v)) return valasz('bad input', 400);
  const kulcs = `fbp:${new Date(now).toISOString().slice(0, 10)}:${slug}:${v}`;
  let db = 0;
  try { db = parseInt(await env.FEEDBACK.get(kulcs), 10) || 0; } catch { /* első */ }
  if (db >= NAPI_PLAFON) return valasz('cap', 429);
  await env.FEEDBACK.put(kulcs, String(db + 1), { expirationTtl: MEGORZES_MP });
  return valasz('ok', 200);
}

/** Az utolsó `napok` nap: { 'YYYY-MM-DD': { slug: { up, down } } }. Hibánál { error: true }. */
export async function fbpExport(env, now = Date.now(), napok = 14) {
  try {
    const hatar = new Date(now - napok * 864e5).toISOString().slice(0, 10);
    const ki = {};
    let cursor;
    do {
      const l = await env.FEEDBACK.list({ prefix: 'fbp:', cursor });
      for (const k of l.keys) {
        const [, nap, slug, v] = k.name.split(':');
        if (!nap || nap < hatar || !SLUG.test(slug || '') || !['up', 'down'].includes(v)) continue;
        const sor = ((ki[nap] = ki[nap] || {})[slug] = ki[nap][slug] || { up: 0, down: 0 });
        sor[v] = parseInt(await env.FEEDBACK.get(k.name), 10) || 0;
      }
      cursor = l.list_complete ? undefined : l.cursor;
    } while (cursor);
    return ki;
  } catch { return { error: true }; }
}
