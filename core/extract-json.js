// ===================================================================
// JSON-TÖMB KIHÁMOZÁSA A MODELL VÁLASZÁBÓL
// ===================================================================
//
// A modell néha markdown-kerítésbe teszi (```json), néha szöveget ír köré,
// JSON-módban pedig legfelül objektumot kényszerít.
//
// MIÉRT ITT: 2026-08-18-ig ez a függvény KÉTSZER volt lemásolva
// (agents/rss-scraper/agent.js:209 és agents/guide/agent.js:352), core-ban
// sehol — tehát tesztje sem volt. A 2026-07-16-i „results is not iterable"
// hiba 3 napra megállította a hírbeszerzést; egy közös, tesztelt függvényben
// az ilyen javítás egyszer kell.
// ===================================================================

/**
 * @param {string} text a modell nyers válasza
 * @returns {any[]}
 * @throws ha nincs benne értelmezhető tömb — a hívó ilyenkor a biztonságos
 *         alapértelmezésre esik vissza, nem próbál okoskodni
 */
export function extractJsonArray(text) {
  let t = String(text == null ? '' : text).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);

  const parsed = JSON.parse(t);
  if (Array.isArray(parsed)) return parsed;

  // JSON-objektum-mód: {"decisions":[...]} boríték vagy egyetlen objektum.
  if (parsed && typeof parsed === 'object') {
    for (const v of Object.values(parsed)) if (Array.isArray(v)) return v;
    if ('index' in parsed) return [parsed];
  }
  throw new Error('A válaszban nincs JSON-tömb');
}

export default { extractJsonArray };
