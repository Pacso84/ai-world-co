// ===================================================================
// PDF-LETÖLTÉS SZÁMLÁLÓ — Worker-oldal (2026-10-07)
// ===================================================================
// POST /dl-hit  {f: 'aiworldhq-<téma>-<en|es>.pdf'}  → KV: dl:<UTC-nap>:<fájl> += 1
// A jelet a honlap middleware-je küldi (functions/_middleware.js), CSAK ha a
// kérés a közös szabály (core/pdf-download.js letoltesFajl) szerint letöltés.
//
// ⚠️ NINCS TITOK A VÉGPONTON: a Pages Function szerver-oldali hívásához nem
// tudunk titkot adni a dashboard nélkül. A kár, amit egy hamis jel okozhat:
// felfújt szám. Ezért: csak a mi fájlneveink, és fájlonként napi PLAFON.
// A KV nem atomikus — két egyidejű letöltésből lehet 1; alulmérés, ami a
// biztonságos irány.
// ===================================================================

import { dlKulcs, PDF_FAJL_MINTA } from '../../core/pdf-download.js';

export const NAPI_PLAFON = 1000;          // fájlonként/nap — fölötte gyanús, nem számolunk
const MEGORZES_MP = 400 * 24 * 3600;     // ~13 hónap

export async function handleDlHit(request, env, now = Date.now()) {
  if (request.method !== 'POST') return new Response('method', { status: 405 });
  let body;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const f = String(body && body.f || '');
  const kulcs = dlKulcs(f, now);
  if (!kulcs) return new Response('bad file', { status: 400 });
  let db = 0;
  try { db = parseInt(await env.FEEDBACK.get(kulcs), 10) || 0; } catch { /* első */ }
  if (db >= NAPI_PLAFON) return new Response('cap', { status: 429 });
  await env.FEEDBACK.put(kulcs, String(db + 1), { expirationTtl: MEGORZES_MP });
  return new Response('ok', { status: 200 });
}

/** Az utolsó `napok` nap letöltései: { 'YYYY-MM-DD': { fájl: db } }. Hibánál { error: true }. */
export async function dlExport(env, now = Date.now(), napok = 14) {
  try {
    const hatar = new Date(now - napok * 864e5).toISOString().slice(0, 10);
    const ki = {};
    let cursor;
    do {
      const l = await env.FEEDBACK.list({ prefix: 'dl:', cursor });
      for (const k of l.keys) {
        const [, nap, fajl] = k.name.split(':');
        if (!nap || nap < hatar || !PDF_FAJL_MINTA.test(fajl || '')) continue;
        const v = parseInt(await env.FEEDBACK.get(k.name), 10) || 0;
        (ki[nap] = ki[nap] || {})[fajl] = v;
      }
      cursor = l.list_complete ? undefined : l.cursor;
    } while (cursor);
    return ki;
  } catch {
    return { error: true };
  }
}
