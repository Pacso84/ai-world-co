// ===================================================================
// „BEVÁLT?” SZÁMLÁLÓ (2026-10-23, user: „az előzőeket is csináljuk!” — Gemini-javaslat:
// „did this tip work?” a promptok mellett). Terv: docs/superpowers/specs/2026-10-23-utmutato-segitseg-csomag-design.md (C).
// POST /fbp-hit {slug, lang, v} → KV: fbp:<UTC-nap> = { slug: { up, down } } (EGY kulcs naponta).
// A gomb csak a prompt Másolása után jelenik meg (website/assets/app.js) — azt nem tároljuk, ki szavazott.
//
// MIÉRT EGY NAPI KULCS (független átnézés 10-23): a slug-lista NYITOTT (bármely útmutató), ezért a
// kulcsonkénti tárolásnál egy kitalált slugokkal dolgozó szkript korlátlan kulcsot írhatott volna,
// az export pedig kulcsonként olvas → 14 napra túllépte volna a hívásonkénti limitet (és vele a __aff
// exportot is). Így az export legfeljebb 14 olvasás, az áradatot pedig három plafon fogja meg.
// Ár: egyidejű szavazatoknál a KV „végül konzisztens” → ritkán elveszhet egy szavazat (mint a többi számlálónál).
// ===================================================================
export const NAPI_PLAFON = 300;    // egy útmutató, egy irány, egy nap
export const SLUG_PLAFON = 500;    // különböző útmutató naponta
export const NAPI_OSSZ = 3000;     // minden szavazat együtt, naponta
const MEGORZES_MP = 400 * 24 * 3600;
const SLUG = /^[a-z0-9-]{3,80}$/;
const NYELVEK = ['en', 'hu', 'es'];
const CORS = {
  'Access-Control-Allow-Origin': 'https://aiworldhq.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
const valasz = (szoveg, status) => new Response(szoveg, { status, headers: CORS });
const napKulcs = ms => 'fbp:' + new Date(ms).toISOString().slice(0, 10);
const olvasNap = async (env, kulcs) => {
  const nyers = await env.FEEDBACK.get(kulcs);
  if (!nyers) return {};
  try { const o = JSON.parse(nyers); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
};

export async function handleFbpHit(request, env, now = Date.now()) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return valasz('method', 405);
  let b;
  try { b = await request.json(); } catch { return valasz('bad json', 400); }
  const slug = String(b?.slug ?? ''), lang = String(b?.lang ?? ''), v = String(b?.v ?? '');
  if (!SLUG.test(slug) || !NYELVEK.includes(lang) || !['up', 'down'].includes(v)) return valasz('bad input', 400);
  const kulcs = napKulcs(now);
  const nap = await olvasNap(env, kulcs);
  const ossz = Object.values(nap).reduce((s, r) => s + (Number(r?.up) || 0) + (Number(r?.down) || 0), 0);
  if (ossz >= NAPI_OSSZ) return valasz('cap', 429);
  if (!nap[slug] && Object.keys(nap).length >= SLUG_PLAFON) return valasz('cap', 429);
  const sor = nap[slug] = { up: Number(nap[slug]?.up) || 0, down: Number(nap[slug]?.down) || 0 };
  if (sor[v] >= NAPI_PLAFON) return valasz('cap', 429);
  sor[v]++;
  await env.FEEDBACK.put(kulcs, JSON.stringify(nap), { expirationTtl: MEGORZES_MP });
  return valasz('ok', 200);
}

/** Az utolsó `napok` nap: { 'YYYY-MM-DD': { slug: { up, down } } }. Hibánál { error: true }. */
export async function fbpExport(env, now = Date.now(), napok = 14) {
  try {
    const ki = {};
    for (let i = 0; i <= napok; i++) {
      const kulcs = napKulcs(now - i * 864e5);
      const nap = await olvasNap(env, kulcs);
      const tiszta = {};
      for (const [slug, r] of Object.entries(nap)) {
        if (SLUG.test(slug)) tiszta[slug] = { up: Number(r?.up) || 0, down: Number(r?.down) || 0 };
      }
      if (Object.keys(tiszta).length) ki[kulcs.slice(4)] = tiszta;
    }
    return ki;
  } catch { return { error: true }; }
}
