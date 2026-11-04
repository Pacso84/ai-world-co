// ===================================================================
// AMAZON PARTNERLINK KATTINTÁS-SZÁMLÁLÓ — Worker-oldal (2026-10-09)
// ===================================================================
// POST /aff-hit  {p: '<termék-id>'}  → KV: aff:<UTC-nap>:<p> += 1
// A jelet a honlap app.js-e küldi a partnerlink kattintásakor. A link maga
// KÖZVETLENÜL az Amazonra megy (átirányítás = nincs jutalék) — ezért itt
// számolunk, nem egy /go/ oldalon. Lásd core/affiliate.js.
//
// Ugyanaz a védelem, mint a PDF-számlálónál (pdf-dl.js): nincs titok a
// végponton (böngészőből jön), ezért csak ismert termék-id, és napi PLAFON.
// A KV nem atomikus → két egyidejű kattintásból lehet 1: alulmérés, ami a
// biztonságos irány.
// ===================================================================

import { affKulcs } from '../../core/affiliate.js';

export const NAPI_PLAFON = 1000;          // termékenként/nap — fölötte gyanús
const MEGORZES_MP = 400 * 24 * 3600;     // ~13 hónap

const CORS = { 'Access-Control-Allow-Origin': 'https://aiworldhq.com','Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const valasz = (szoveg, status) => new Response(szoveg, { status, headers: CORS });

export async function handleAffHit(request, env, now = Date.now()) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return valasz('method', 405);
  let body;
  try { body = await request.json(); } catch { return valasz('bad json', 400); }
  const kulcs = affKulcs(body && body.p, now);
  if (!kulcs) return valasz('bad product', 400);
  let db = 0;
  try { db = parseInt(await env.FEEDBACK.get(kulcs), 10) || 0; } catch { /* első */ }
  if (db >= NAPI_PLAFON) return valasz('cap', 429);
  await env.FEEDBACK.put(kulcs, String(db + 1), { expirationTtl: MEGORZES_MP });
  return valasz('ok', 200);
}

/** Az utolsó `napok` nap kattintásai: { 'YYYY-MM-DD': { id: db } }. Hibánál { error: true }. */
export async function affExport(env, now = Date.now(), napok = 14) {
  try {
    const hatar = new Date(now - napok * 864e5).toISOString().slice(0, 10);
    const ki = {};
    let cursor;
    do {
      const l = await env.FEEDBACK.list({ prefix: 'aff:', cursor });
      for (const k of l.keys) {
        const [, nap, id] = k.name.split(':');
        if (!nap || nap < hatar || !affKulcs(id, now)) continue;
        const v = parseInt(await env.FEEDBACK.get(k.name), 10) || 0;
        (ki[nap] = ki[nap] || {})[id] = v;
      }
      cursor = l.list_complete ? undefined : l.cursor;
    } while (cursor);
    return ki;
  } catch {
    return { error: true };
  }
}
