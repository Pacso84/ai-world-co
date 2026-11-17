// ===================================================================
// ELBUKOTT FB-FOTÓPOSZT → MAGÁTÓL VISSZA A SORBA (2026-11-17)
// ===================================================================
//
// ÉLES ESET (11-16, user: „nézd meg a telegramot mert van hiba!”): a 19:29-es futás 19:44-kor
// feltöltötte az oldalt, 19:45:09-kor kiküldte a „Gemini's 66 new regional voices” fotóposztot.
// A Make a képet (`/assets/fb/<slug>.jpg`) 404-gyel kapta — a GitHub-futtató (USA) már látta, az
// európai Make-szerver még nem (a Cloudflare a 404-et NEM tárolja: `no-store, BYPASS` — tehát
// valódi terjedési késés volt, nem régi gyorsítótár). A webhook ettől még „200 Accepted”-et adott,
// mi `posted_fb: true`-t írtunk, és a poszt SOHA nem ment volna ki. A riport csak annyit mondott:
// „a Make hibasorában megvan, újrajátszható” — kézi munka, amit senki nem végez el.
//
// MIT CSINÁL: a FB-poszter MINDEN futás elején lekéri a fotó-forgatókönyv (6452490) utolsó 50
// futását. A nem sikeres (status ≠ 1) futást a posztjához párosítja — a Make a webhook FOGADÁSÁT
// naplózza, mi a válasz UTÁN írjuk a `posted_at`-ot, tehát a pár: a legkisebb nemnegatív
// különbség (élesben ~120 ms; egy kötegen belül a posztok ~450 ms-ra követik egymást). A párt
// visszaengedi a sorba (`posted_fb: false`), és számolja (`fb_ujraproba`). Legfeljebb
// FB_UJRAPROBA_MAX-szor — egy tartós hiba ne pörögjön végtelenül.
//
// A REEL NINCS BENNE SZÁNDÉKOSAN: Reelnél a status 2 mellett is kimehet a videó (memória-szabály:
// újraküldés előtt Business Suite) — ott az automata újrapróba dupla posztot csinálna.
//
// A LECSENGÉS ugyanennek a hibának a megelőzése: friss deploy után a fotóposzt előtt egyszer vár
// (a Reel ugyanezt a tanulságot 10-01 óta tudja: core/reel-post.js LECSENGES_MS).
//
// Hiba (nincs token, nincs net, furcsa válasz) SOHA nem állítja meg a posztolót: üres lista.
// ===================================================================

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { FB_SCENARIO_ID } from './make-budget.js';

export const FB_UJRAPROBA_MAX = 1;
export const VISSZATEKINTES_MS = 48 * 3600 * 1000;
/** A Make-napló ideje és a mi posted_at-unk közti legnagyobb eltérés, ami még pár. */
export const PAROSITAS_MS = 5000;
/** Friss deploy után ennyit vár a fotóposzt (a Reelnél bevált 45 mp + tartalék). */
export const LECSENGES_FOTO_MS = 60000;

const NEM_VEGREHAJTAS = new Set(['modify', 'start', 'stop']);

/**
 * @param {Array} logs   a Make scenarioLogs sorai
 * @param {Array<{key:string, post:object}>} posts
 * @returns {Array<{key:string, post:object, bukottAt:string}>}
 */
export function bukottPosztok(logs, posts, now = Date.now()) {
  const futasok = (Array.isArray(logs) ? logs : [])
    .filter(l => l && l.timestamp && !NEM_VEGREHAJTAS.has(l.type))
    .map(l => ({ ...l, ms: Date.parse(l.timestamp) }))
    .filter(l => Number.isFinite(l.ms) && l.ms > now - VISSZATEKINTES_MS);
  const ki = [];
  for (const { key, post } of posts || []) {
    if (!post || post.posted_fb !== true) continue;
    if ((Number(post.fb_ujraproba) || 0) >= FB_UJRAPROBA_MAX) continue;
    const p = Date.parse(post.posted_at || '');
    if (!Number.isFinite(p) || p <= now - VISSZATEKINTES_MS) continue;
    // a legkisebb nemnegatív különbség: a Make a fogadáskor naplóz, mi a válasz után írunk
    let par = null;
    for (const f of futasok) {
      const d = p - f.ms;
      if (d >= 0 && d <= PAROSITAS_MS && (!par || d < par.d)) par = { d, f };
    }
    if (par && par.f.status !== 1) ki.push({ key, post, bukottAt: par.f.timestamp });
  }
  return ki;
}

/** A posztot visszaengedi a FB-sorba; a többi csatorna jelölése marad. */
export function ujraJelol(post, bukottAt) {
  post.posted_fb = false;
  post.fb_ujraproba = (Number(post.fb_ujraproba) || 0) + 1;
  post.fb_bukott = bukottAt;
  return post;
}

/**
 * A social mappa posztjai közül a Make-ben elbukottakat visszateszi a sorba (fájlba írja).
 * @returns {Promise<Array<{slug:string, bukottAt:string}>>}
 */
export async function fbUjraproba({ dir, token, fetchFn = fetch, now = Date.now(), timeoutMs = 15000 } = {}) {
  if (!dir || !token) return [];
  try {
    const posts = [];
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
      try {
        const post = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
        const p = Date.parse(post.posted_at || '');
        if (post.posted_fb === true && Number.isFinite(p) && p > now - VISSZATEKINTES_MS) posts.push({ key: f, post });
      } catch { /* hibás fájl: kihagyjuk */ }
    }
    if (!posts.length) return [];
    const r = await fetchFn(`https://eu1.make.com/api/v2/scenarios/${FB_SCENARIO_ID}/logs?pg[limit]=50&pg[sortDir]=desc`,
      { headers: { Authorization: 'Token ' + token }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r || !r.ok) return [];
    const logs = (await r.json().catch(() => ({}))).scenarioLogs || [];
    const ki = [];
    for (const { key, post, bukottAt } of bukottPosztok(logs, posts, now)) {
      ujraJelol(post, bukottAt);
      writeFileSync(join(dir, key), JSON.stringify(post, null, 2), 'utf-8');
      ki.push({ slug: post.slug || key.replace(/\.json$/, ''), bukottAt });
    }
    return ki;
  } catch { return []; }
}
