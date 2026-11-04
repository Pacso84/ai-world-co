// ===================================================================
// FORRÁS-SZÁMLÁLÓ (2026-10-22, user: „ha senki nem jön a Threadsről, törlöm a fiókot”)
// POST /src-hit {s:'th'} → KV: src:<UTC-nap>:<s> += 1. A jelet a honlap middleware-je küldi, csak
// jelölt linkkel érkező emberi oldalletöltésre. Nincs titok → csak ismert forrás + napi plafon.
// ===================================================================
export const FORRASOK = ['th'];
export const NAPI_PLAFON = 2000;
const MEGORZES_MP = 400 * 24 * 3600;

export async function handleSrcHit(request, env, now = Date.now()) {
  if (request.method !== 'POST') return new Response('method', { status: 405 });
  let s = '';
  try { s = String((await request.json()).s || ''); } catch { return new Response('bad json', { status: 400 }); }
  if (!FORRASOK.includes(s)) return new Response('bad src', { status: 400 });
  const kulcs = 'src:' + new Date(now).toISOString().slice(0, 10) + ':' + s;
  let db = 0;
  try { db = parseInt(await env.FEEDBACK.get(kulcs), 10) || 0; } catch { /* első */ }
  if (db >= NAPI_PLAFON) return new Response('cap', { status: 429 });
  await env.FEEDBACK.put(kulcs, String(db + 1), { expirationTtl: MEGORZES_MP });
  return new Response('ok', { status: 200 });
}

/** Az utolsó `napok` nap: { 'YYYY-MM-DD': { th: db } }. Hibánál { error: true }. */
export async function srcExport(env, now = Date.now(), napok = 14) {
  try {
    const hatar = new Date(now - napok * 864e5).toISOString().slice(0, 10);
    const ki = {};
    let cursor;
    do {
      const l = await env.FEEDBACK.list({ prefix: 'src:', cursor });
      for (const k of l.keys) {
        const [, nap, s] = k.name.split(':');
        if (!nap || nap < hatar || !FORRASOK.includes(s)) continue;
        (ki[nap] = ki[nap] || {})[s] = parseInt(await env.FEEDBACK.get(k.name), 10) || 0;
      }
      cursor = l.list_complete ? undefined : l.cursor;
    } while (cursor);
    return ki;
  } catch { return { error: true }; }
}
