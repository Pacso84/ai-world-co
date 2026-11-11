// ===================================================================
// 📘 HÍR → ÚTMUTATÓ A HIVATALOS SÚGÓBÓL (hír-elsőbbség 3. rész, 2026-11-11)
// ===================================================================
// MIÉRT (user 11-09/11-10: „új funkciókról és modellekről … útmutató az új dologhoz, CSAK hivatalos súgóból”;
// 11-11: „mehet”). MÉRVE 11-04…11-11: hírből egy hét alatt 1 új útmutató született (Galaxy Ring). A friss
// LLM-termékhíreket a párosító „nincsenek lépések” / „több funkció” miatt elutasította (Gemini 4 Carbon,
// Businesses in ChatGPT, Gemini Intelligence) — a hírben valóban nincs lépés, de a cég SÚGÓJÁBAN van
// („Setting up your business on ChatGPT”, „Create & manage skills for Gemini Apps” — élőben ellenőrizve).
//
// MŰKÖDÉS (agents/pairing/agent.js hívja):
//   1. MÁSODIK ESÉLY csak LLM-cég termékhírének (termekSzint 2), amit a párosító elutasított, és van hozzá
//      jóváhagyott súgó (core/sugo-index.js ENGEDELY — új súgó CSAK user-jóváhagyással).
//   2. Az AI a súgó TELJES cikklistájából kiválaszt EGY cikket (vagy semmit) — a cím alapján.
//   3. A kiválasztott cikk szövegét letöltjük; az AI eldönti, hogy az a súgócikk elmagyarázza-e egy
//      hétköznapi felhasználónak (nem adminnak/fejlesztőnek), hogyan használja az ÚJ funkciót. Ha nem → nincs
//      útmutató. Kitalálni TILOS: az útmutató-író később CSAK ebből a súgócikkből dolgozik (official_sources).
//   4. Naponta legfeljebb NAPI_MAX ilyen téma.
//
// KIKAPCSOLÁS: SUGO_PAROSITAS_BE = false (kézi kill-switch).
// Teszt: core/sugo-parositas.test.js
// ===================================================================

import { termekSzint, HIR_ELSOBBSEG_BE } from './hir-elsobbseg.js';
import { engedelyezett } from './sugo-index.js';
import { MIN_HIANYZO_FELIRAT } from './forras-tema.js';
import { confidentUiClaims } from './guide-claims.js';

export const SUGO_PAROSITAS_BE = true;
/** Naponta legfeljebb ennyi súgó-alapú útmutató-téma (a napi útmutató-kereten belül). */
export const NAPI_MAX = 1;
/** Futásonként legfeljebb ennyi második-esély vizsgálat (költség-fék: ~2 hívás/hír). */
export const FUTAS_MAX = 3;
/** Ennyi cikkcímet adunk a választónak (a mért listák: OpenAI 203, Microsoft 231, Gemini 101). */
export const INDEX_MAX = 260;

/** Hírforrás → a hozzá tartozó jóváhagyott súgó(k) (core/sugo-index.js FORRASOK kulcsai). */
export const FORRAS_SUGO = {
  'openai-blog': ['openai'],
  'anthropic-blog': ['claude'],
  'google-gemini': ['gemini'], 'google-ai-blog': ['gemini'], 'google-labs': ['gemini'], 'google-deepmind': ['gemini'],
  'google-workspace': ['gemini'],
  'microsoft-ai': ['microsoft'], 'microsoft-365': ['microsoft'], 'microsoft-blog': ['microsoft'],
  'mistral-ai': ['mistral']
};

const napja = x => { const t = Date.parse(String(x || '')); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };

/** Melyik súgó(k)ban keressünk ehhez a hírhez? Üres = nincs jóváhagyott súgó → nincs második esély. */
export function sugoSzolgaltatok(sourceId) {
  return FORRAS_SUGO[String(sourceId || '')] || [];
}

/** Kell-e második esély: LLM-termékhír, a párosító elutasította, és van hozzá jóváhagyott súgó. */
export function masodikEselyKell({ sourceId, cim, parsed } = {}) {
  if (!SUGO_PAROSITAS_BE || !HIR_ELSOBBSEG_BE) return false;
  if (!parsed || parsed.guide_worthy) return false;
  if (termekSzint(sourceId, cim) !== 2) return false;
  return sugoSzolgaltatok(sourceId).length > 0;
}

/** Ma még hány súgó-alapú téma születhet (a témalista `sugo_alapu` + `created_at` jelöléséből). */
export function napiMaradek(topics, now = Date.now()) {
  if (!SUGO_PAROSITAS_BE || !Number.isFinite(now)) return 0;
  const ma = new Date(now).toISOString().slice(0, 10);
  const db = (Array.isArray(topics) ? topics : []).filter(t => t && t.sugo_alapu && napja(t.created_at) === ma).length;
  return Math.max(0, NAPI_MAX - db);
}

const tiszta = s => String(s || '').replace(/\s+/g, ' ').trim();

/** A választó promptja: a hír + a súgó számozott cikkcímei; a válasz egy sorszám (0 = egyik sem). */
export function valasztoPrompt(hir, index) {
  const lista = (index || []).slice(0, INDEX_MAX).map((c, i) => `${i + 1}. ${tiszta(c.cim).slice(0, 110)}`).join('\n');
  return {
    rendszer: `You match an AI product NEWS item to ONE article of the company's OFFICIAL HELP CENTER.
Pick the help article that explains how an ordinary user USES the NEW feature/model named in the news.
Pick 0 if no article is clearly about that exact feature (a generic "getting started" or an unrelated feature is NOT a match).
Admin-only, developer/API-only or billing articles are NOT a match.
Output ONLY JSON: {"pick": <number>, "reason": "one short sentence"}`,
    felhasznalo: `NEWS TITLE: "${tiszta(hir?.cim)}"
NEWS SUMMARY: ${tiszta(hir?.kivonat).slice(0, 700)}

HELP CENTER ARTICLES:
${lista}

Which ONE article explains how to use the new feature? Output ONLY the JSON.`
  };
}

function jsonKibont(szoveg) {
  const t = String(szoveg || '').replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s < 0 || e < s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

/** A választó válasza → a kiválasztott cikk ({url, cim}) vagy null. Csak a listából, csak engedélyezett címmel. */
export function valasztoValasz(szoveg, index) {
  const j = jsonKibont(szoveg);
  const n = Number(j?.pick);
  const lista = (index || []).slice(0, INDEX_MAX);
  if (!Number.isInteger(n) || n < 1 || n > lista.length) return null;
  const c = lista[n - 1];
  return c && engedelyezett(c.url) ? c : null;
}

/** A súgócikk szövegének legkisebb hossza, amiből még útmutató írható (rövidebb = gyűjtőlap / hiba). */
export const MIN_SUGO_SZOVEG = 600;

/** Az ellenőrző promptja: a hír + a súgócikk szövege → írható-e belőle hétköznapi útmutató. */
export function ellenorzoPrompt(hir, sugo) {
  return {
    rendszer: `You decide whether an OFFICIAL HELP ARTICLE lets us write a step-by-step GUIDE for everyday people about the NEW feature in a news item. Be STRICT.
Say ok = TRUE only if ALL hold:
1. The help article is about the SAME feature/model the news announces (not a neighbouring or older feature).
2. It explains concrete steps an ordinary person (not an admin, not a developer, not an API user) can follow today.
3. A guide could be written using ONLY what the help article says — nothing invented.
Otherwise ok = FALSE.
If ok, give a guide title that promises ONLY what the help article covers ("How to …"), the SHORTEST official product name as "tool" (ChatGPT, Gemini, Claude, Copilot, Le Chat), the company, and one sentence on the angle.
Output ONLY JSON: {"ok": true|false, "reason": "one short sentence", "title": "How to …", "tool": "", "company": "", "angle": "", "level": "beginner|intermediate", "audience": "personal|business|both"}`,
    felhasznalo: `NEWS TITLE: "${tiszta(hir?.cim)}"
NEWS SUMMARY: ${tiszta(hir?.kivonat).slice(0, 700)}

OFFICIAL HELP ARTICLE: "${tiszta(sugo?.cim)}" (${sugo?.url || ''})
${String(sugo?.szoveg || '').slice(0, 6000)}

Output ONLY the JSON.`
  };
}

/** Az ellenőrző válasza → { ok, title, tool, company, angle, level, audience, reason }; hibás/hiányos → ok:false. */
export function ellenorzoValasz(szoveg) {
  const j = jsonKibont(szoveg);
  if (!j || j.ok !== true) return { ok: false, reason: tiszta(j?.reason) || 'nem értelmezhető válasz' };
  const title = tiszta(j.title);
  // Az ígéret a cím — „How to …” alakú, ésszerű hosszú (style-guide §3b: a cím lépéseit a szöveg megadja).
  if (!/^How to\s+\S/i.test(title) || title.length > 110) return { ok: false, reason: 'a javasolt cím nem „How to …” alakú' };
  return {
    ok: true, title,
    tool: tiszta(j.tool).slice(0, 40), company: tiszta(j.company).slice(0, 40), angle: tiszta(j.angle).slice(0, 300),
    level: j.level === 'intermediate' ? 'intermediate' : 'beginner',
    audience: ['personal', 'business', 'both'].includes(j.audience) ? j.audience : 'both',
    reason: tiszta(j.reason).slice(0, 200)
  };
}

// ===================================================================
// MEGLÉVŐ TÉMA (a párosító findExistingTopic-ja, ide költözve, 2026-11-11)
// ===================================================================
// MÉRVE 11-04…11-11: a „már van ilyen útmutató” egyezés gyakran IDEGEN ESZKÖZRE mutatott — „MiniMax H3-Image”
// → gemini-images, „GPT Image 2.6 in Picsart” → custom GPT. Ok: 2 közös általános szó („image”, „create”)
// elég volt. Most: ha a hírnek van eszköze, a meglévő témának UGYANAZ az eszköze kell legyen; eszköz
// nélkül azonos cég + legalább 2 közös címszó kell.
const STOP = new Set(['how', 'to', 'the', 'a', 'an', 'for', 'with', 'your', 'and', 'of', 'in', 'on', 'use', 'using', 'get', 'getting', 'started', 'guide']);
const szavak = t => new Set(String(t || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)));

export function meglevoTema(parsed, topics) {
  const tool = String(parsed?.tool || '').toLowerCase().trim(), co = String(parsed?.company || '').toLowerCase().trim();
  // Az eszköz és a cég neve NEM közös szó (különben „MiniMax H3-Image” → „Getting started with MiniMax Code”).
  const nevek = new Set([...szavak(tool), ...szavak(co)]);
  const pw = new Set([...szavak(parsed?.title)].filter(w => !nevek.has(w)));
  let best = null, bestScore = 0;
  for (const t of Array.isArray(topics) ? topics : []) {
    if (!t) continue;
    const ttool = String(t.tool || '').toLowerCase().trim(), tco = String(t.company || '').toLowerCase().trim();
    if (tool) { if (ttool !== tool) continue; }          // 🔒 idegen eszközre SOHA
    else if (!co || tco !== co) continue;                // eszköz nélkül legalább a cég egyezzen
    let overlap = 0; for (const w of szavak(t.title)) if (pw.has(w)) overlap++;
    const score = overlap + (tool ? 2 : 1);
    if (overlap >= (tool ? 1 : 2) && score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

// ===================================================================
// 2. RÉSZ — az útmutató-író CSAK a súgóból ír, az Ellenőrző a súgón méri a gombneveket (2026-11-11)
// ===================================================================
// A súgó szövegét NEM tároljuk a gitben (kiadói szöveg, nyilvános repó) — az író és az Ellenőrző ugyanabban
// a CI-futásban letölti (core/elakadas-gen.js cikkSzoveg, max 6000 karakter).

/**
 * A súgó-alapú téma / vázlat letöltendő súgócikkei [{url, title}]. CSAK a `sugo_alapu` jelölésűre (a régi, kézzel
 * írt útmutatók `official_sources`-a sima URL-lista, nem csak jóváhagyott súgóra — azokra ez a gát NEM vonatkozik),
 * és csak engedélyezett címmel. Elfogad sima URL-t és {url, title} objektumot is.
 */
export function sugoForrasok(x) {
  if (!x || x.sugo_alapu !== true || !Array.isArray(x.official_sources)) return [];
  return x.official_sources
    .map(s => (typeof s === 'string' ? { url: s, title: '' } : { url: String(s?.url || ''), title: String(s?.title || '') }))
    .filter(s => engedelyezett(s.url))
    .slice(0, 2);
}

/** Az író promptjába fűzött blokk: a súgócikk(ek) szövege + a „csak ebből” szabály. Üres lista → ''. */
export function sugoBlokk(sugok) {
  const l = (Array.isArray(sugok) ? sugok : []).filter(s => s && String(s.szoveg || '').trim());
  if (!l.length) return '';
  return `

OFFICIAL HELP ARTICLE — the ONLY source for this guide (from the company's own help center):
${l.map(s => `--- "${tiszta(s.cim)}" (${s.url}) ---\n${String(s.szoveg).slice(0, 6000)}`).join('\n\n')}

STRICT RULES FOR THIS GUIDE:
- Every step, button, menu, setting name, plan and availability statement must come from the help article above.
- Do NOT add steps, buttons, menus or screens the help article does not mention — not even "typical" ones.
- If the help article does not say something (where exactly a button is, what a screen looks like), do not guess:
  say it in general terms and tell the reader that the company's official help center has the details (no link).
- Write in your OWN words — never copy sentences from the help article.
- Never state a price.`;
}

/**
 * Az Ellenőrző jelzése egy súgó-alapú útmutatóra: ha a magabiztos gomb-/menünevek közül legalább
 * MIN_HIANYZO_FELIRAT NINCS a súgócikk szövegében → GUIDE_UI_NOT_IN_HELP (elutasít). Súgószöveg nélkül null.
 */
export function sugoUtmutatoJelzes(markdown, sugoSzoveg) {
  // ⚠️ NEM a forrasbanNemLevoFeliratok(): az 3200 karakter alatti forrásra nem ítél (hírforrásra méretezve), a
  // súgócikkek viszont rövidebbek (mérve 11-11: a Gmail-súgó 2739 karakter) → itt a MIN_SUGO_SZOVEG a határ.
  const fsz = String(sugoSzoveg || '');
  if (fsz.trim().length < MIN_SUGO_SZOVEG) return null;
  const kis = fsz.toLowerCase();
  const hianyzo = (confidentUiClaims(markdown).labels || []).filter(l => !kis.includes(String(l).toLowerCase()));
  if (hianyzo.length < MIN_HIANYZO_FELIRAT) return null;
  return `GUIDE_UI_NOT_IN_HELP: A súgó-alapú útmutató ${hianyzo.length} gomb-/menünevet állít, ami a hivatalos súgócikkben nincs (${hianyzo.slice(0, 4).join(', ')}).`;
}

export default {
  SUGO_PAROSITAS_BE, NAPI_MAX, FUTAS_MAX, FORRAS_SUGO, sugoSzolgaltatok, masodikEselyKell, napiMaradek,
  valasztoPrompt, valasztoValasz, ellenorzoPrompt, ellenorzoValasz, meglevoTema, MIN_SUGO_SZOVEG,
  sugoBlokk, sugoUtmutatoJelzes, sugoForrasok
};
