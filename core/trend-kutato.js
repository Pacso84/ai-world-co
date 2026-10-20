// ===================================================================
// TRENDKUTATÓ (2026-10-14, user ötlete: „csináljunk egy AI trendkutatót, és így
// csinálnánk cikkeket és útmutatókat") — mi érdekli MOST az embereket?
// ===================================================================
// Naponta EGYSZER gyűjt (a CI napi 3 futásából az első dolgozik, a többi a 20 órás
// kapun kihagy), ingyen, AI-hívás NÉLKÜL:
//   1. Google keresési javaslatok — mit gépelnek be az emberek. NEM hivatalos végpont,
//      ezért lassan (1 mp szünet) és keveset (max 40) kérünk; tiltásnál (403/429) aznap
//      kimarad, a többi forrás megy tovább.
//   2. Google napi felkapott lista (USA) — csak az AI-hoz kapcsolódó tételek.
//   3. A saját legolvasottabb cikkeink eszközei (memory/traffic-log.json, 14 nap) — bónusz.
//   4. A Bing AI Performance „Top Opportunity Queries" listája (content/trend-bing.json) —
//      havonta KÉZZEL frissül (Claude a user böngészőjéből olvassa, vagy a user letölti).
//
// 🔑 A TRENDKUTATÓ CSAK TÉMÁT VÁLASZT. A tények továbbra is csak hivatalos forrásból
// jönnek, a trendből írt cikk ugyanazokon a kapukon megy át (tény, hitelesség, név).
// Mért alap (10-14): az eszköz NÉPSZERŰSÉGE nálunk nem számít (népszerű 4,1 vs kevésbé
// ismert 4,3 belépő/7 nap), a „mindenki ezt csinálja" téma igen (Save Yourself AI Photo
// Trend: 27 belépő, az átlag ~4) — ezért nincs Bing-keresésszám és Wikipedia.
// Terv: docs/superpowers/specs/2026-10-14-trendkutato-es-utmutato-torles-design.md
// ===================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { utmutatoE } from './guide-kind.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAP = 864e5;
const UA = 'Mozilla/5.0 (compatible; aiworldhq-trends/1.0; +https://aiworldhq.com)';
export const TRENDEK_UT = join(ROOT, 'memory', 'trendek.json');
export const BING_UT = join(ROOT, 'content', 'trend-bing.json');
export const FRISS_ORA = 20;          // ennyi órán belül nem gyűjtünk újra
export const AKTIV_ORA = 48;          // ennél régebbi listának nincs hatása (a CI-lépés napok óta nem fut)
export const MAX_LEKERES = 40;
export const SZUNET_MS = 1000;
export const LEKERES_IDO_MS = 8000;
export const OSSZ_IDO_MS = 120000;    // a CI-lépés 3 perces kerete alatt
export const TOP_DB = 10;
export const MAX_SZO = 10;
export const MAX_ESZKOZONKENT = 2;
export const BING_ELAVULT_NAP = 45;
export const FORRAS_NEV = { 'google-javaslat': 'Google-javaslat', 'google-felkapott': 'Google felkapott', 'bing-lehetoseg': 'Bing' };
const BING_PONT = { '100K-500K': 30, '10K-50K': 25, '5K-10K': 20, '1K-5K': 15, '500-1K': 12, '101-500': 10, '51-100': 8, '11-50': 6, '0-10': 4 };

// ── SZŰRŐK ──────────────────────────────────────────────────────────
// Összehasonlítás TILOS (user 09-26; core/no-comparison-rules.test.js) — a „best X" is az.
export const OSSZEHASONLITAS_RX = /\b(vs\.?|versus|compar\w*|alternatives?|better than|best|top \d+|differen\w*)\b/i;
export const TILTOTT_RX = /\b(nsfw|nude|naked|porn\w*|sex\w*|onlyfans|undress\w*|casino|gambl\w*|betting|lottery|trump|biden|harris|election\w*|politic\w*|democrat\w*|republican\w*)\b/i;
// Szám-, ár- és statisztika-kérdés: csak hivatalos adattal írható, a trendből nem lesz cikk.
export const TENY_RX = /\b(cost|costs|price|prices|pricing|no longer free|benchmark\w*|adoption|daily active|users|subscribers?|subscription numbers|how many|market share|revenue|stock|context window|launched|release date)\b/i;
const NEM_ANGOL_RX = /\b(gratis|aziendale|quando|stata|lanciata|conversacional|para|cómo|como|qué|kostenlos|wie|pour|avec)\b|[àèéìòùñ]/i;
const AI_RX = /\b(ai|a\.i\.|chatgpt|gpt|gemini|claude|copilot|alexa|notebooklm|perplexity|grok|meta ai|midjourney|deepfakes?|chatbots?|prompts?)\b/i;
const FELADAT_RX = /\b(how|use|using|make|create|write|prompts?|trend\w*|photos?|pictures?|images?|videos?|voice|help|scams?|plan|learn|study|edit|summar\w*|translate|paraphrase|record|skill|identify|build|setup|set up|organi[sz]e|emails?|resume|budget|cook\w*|recipes?|travel|homework|letter|schedule|remind\w*|shopping|clone)\b/i;
const GENERIKUS = new Set(['ai', 'chat', 'gpt', 'gptt', 'chet', 'jet', 'bot', 'chatbot', 'assistant', 'app', 'apps', 'free', 'online', 'web', 'login', 'sign', 'download',
  'version', 'versions', 'model', 'models', 'plus', 'pro', 'new', 'latest', 'the', 'a', 'an', 'for', 'with', 'of', 'in', 'on', 'to', 'and', 'or', 'is', 'it', 'my', 'your',
  'anthropic', 'openai', 'google', 'microsoft', 'meta', 'amazon', 'xai',
  'feature', 'features', 'update', 'updates', 'news']);   // 10-14 javítás: hír-stílusú, nem útmutató-téma
const TOLTELEK = new Set(['the', 'and', 'for', 'with', 'your', 'you', 'how', 'use', 'using', 'what', 'that', 'this', 'from', 'into', 'can', 'are', 'step', 'steps',
  'guide', 'minutes', 'beginner', 'beginners', 'easy', 'simple', 'ai']);
const escRx = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** config.json content.trends → { be, seeds }. Csak a kifejezett false kapcsol ki. */
export function trendBeallitas(cfg) {
  const c = cfg?.content?.trends || {};
  const seeds = Array.isArray(c.seeds) ? c.seeds.filter(s => typeof s === 'string' && s.trim()).slice(0, MAX_LEKERES) : [];
  return { be: c.enabled !== false, seeds };
}

/** Kisbetű, írásjel → szóköz (a „+" és a „-" marad), egyszeres szóközök. */
export function normal(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9+\-' àèéìòùñ.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A tartalmas szavak halmaza (legalább 3 betű, töltelékszó nélkül). */
export function szavak(s) {
  return new Set(normal(s).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(w => w.length >= 3 && !TOLTELEK.has(w)));
}

/** Melyik ismert eszközt nevezi meg? (website/tool-links.json neve; a végi „+" nélkül is) → név vagy ''. */
export function eszkozBenne(kifejezes, eszkozok) {
  const k = ` ${normal(kifejezes)} `;
  return (eszkozok || []).find(e => {
    const n = String(e).toLowerCase().replace(/\+$/, '');
    return n.length >= 3 && new RegExp(`[^a-z0-9]${escRx(n)}\\+?[^a-z0-9]`).test(k);
  }) || '';
}

/** Megvan-e már: a kifejezés tartalmas szavainak legalább 75%-a egy meglévő címben. */
export function marMegirt(kifejezes, cimek) {
  const a = szavak(kifejezes);
  if (!a.size) return false;
  return (cimek || []).some(c => {
    const b = szavak(c);
    let k = 0; for (const w of a) if (b.has(w)) k++;
    return k / a.size >= 0.75;
  });
}

/** Átmegy-e a szűrőkön? `rss`: a Google felkapott listájáról jött (egy szó is lehet). */
export function szuro(kifejezes, { eszkozok = [], magok = [], meglevoCimek = [], rss = false } = {}) {
  const nyers = String(kifejezes || '');
  const k = normal(nyers);
  if (!k) return { ok: false, ok_ok: 'üres' };
  const sz = k.split(' ');
  if (!rss && sz.length < 2) return { ok: false, ok_ok: 'egyszavas' };
  if (sz.length > MAX_SZO) return { ok: false, ok_ok: 'túl hosszú (valószínűleg egyedi kérdés)' };
  if (magok.some(m => normal(m) === k)) return { ok: false, ok_ok: 'maga az alapkérdés' };
  if (OSSZEHASONLITAS_RX.test(k)) return { ok: false, ok_ok: 'összehasonlítás (tilos)' };
  if (TILTOTT_RX.test(k)) return { ok: false, ok_ok: 'nem nekünk való' };
  if (TENY_RX.test(k)) return { ok: false, ok_ok: 'szám/ár-kérdés (hivatalos adat kell)' };
  // 10-14 javítás: a verzió/évszám nem ellenőrizhető a trendből („gemini 4 argon" kitalált név lehet)
  if (sz.some(s => /\d/.test(s))) return { ok: false, ok_ok: 'verzió/évszám (hivatalos forrás kell)' };
  if (NEM_ANGOL_RX.test(nyers)) return { ok: false, ok_ok: 'nem angol' };
  const eszkoz = eszkozBenne(k, eszkozok);
  if (!rss) {
    if (!eszkoz && !AI_RX.test(k)) return { ok: false, ok_ok: 'nem AI-téma' };
    // az eszköz MINDEN szavát le kell vágni („microsoft copilot" két szó)
    const nevSzavak = new Set(eszkoz.toLowerCase().replace(/\+$/, '').split(' ').filter(Boolean));
    const maradek = sz.filter(s => !GENERIKUS.has(s) && !nevSzavak.has(s.replace(/\+$/, '')));
    if (!maradek.length) return { ok: false, ok_ok: 'csak márkanév (navigációs keresés)' };
    if (!FELADAT_RX.test(k)) return { ok: false, ok_ok: 'ismeretlen márka vagy nincs benne feladat' };
  }
  if (marMegirt(k, meglevoCimek)) return { ok: false, ok_ok: 'már van ilyen útmutatónk' };
  return { ok: true, ok_ok: '', eszkoz };
}

// ── FORRÁSOK ────────────────────────────────────────────────────────
const decodeXml = s => String(s || '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** A Google felkapott-RSS tételei: kifejezés, becsült forgalom, kapcsolódó hírcímek. */
export function rssTetelek(xml) {
  const ki = [];
  for (const m of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const cim = (m[1].match(/<title>([^<]*)<\/title>/) || [])[1];
    if (!cim) continue;
    const forgalom = (m[1].match(/<ht:approx_traffic>([^<]*)<\/ht:approx_traffic>/) || [])[1] || '';
    const hirek = [...m[1].matchAll(/<ht:news_item_title>([^<]*)<\/ht:news_item_title>/g)].map(x => decodeXml(x[1]).trim());
    ki.push({ kifejezes: decodeXml(cim).trim(), forgalom, hirek });
  }
  return ki;
}

const alvasAlap = ms => new Promise(r => setTimeout(r, ms));

/** Google keresési javaslatok az alapkérdésekre. Tiltásnál (403/429) vagy hálózati hibánál MEGÁLL. */
export async function googleJavaslatok(magok, { fetchFn = fetch, alvas = alvasAlap, ora = Date.now, szunetMs = SZUNET_MS, idoMs = LEKERES_IDO_MS, hatarido } = {}) {
  const vege = hatarido ?? ora() + OSSZ_IDO_MS;
  const talalat = [];
  let hiba = '';
  let n = 0, kuldve = 0, hasznalhato = 0;
  for (const mag of (magok || []).slice(0, MAX_LEKERES)) {
    if (ora() > vege) { hiba = 'időkeret elfogyott'; break; }
    if (n++) await alvas(szunetMs);
    let r;
    kuldve++;
    try {
      r = await fetchFn('https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=' + encodeURIComponent(mag),
        { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(idoMs) });
    } catch (e) { hiba = 'hálózati hiba: ' + String(e?.message || e).slice(0, 60); break; }
    if (r.status === 403 || r.status === 429) { hiba = `HTTP ${r.status} (letiltott)`; break; }
    if (r.status >= 500) { hiba = `HTTP ${r.status} (szerverhiba)`; break; }
    if (!r.ok) continue;
    let j; try { j = JSON.parse(await r.text()); } catch { continue; }   // pl. HTML egyetértés-oldal
    if (!Array.isArray(j?.[1])) continue;
    hasznalhato++;
    j[1].slice(0, 10).forEach((k, i) => {
      if (typeof k === 'string' && normal(k) !== normal(mag)) talalat.push({ kifejezes: k, hely: i, mag });
    });
  }
  // 10-14 végső átnézés: ha minden válasz használhatatlan volt (egyetértés-oldal, új formátum),
  // a forrás halott — ez eddig némán „nincs trend"-nek látszott.
  if (!hiba && kuldve > 0 && hasznalhato === 0) hiba = 'egyetlen használható válasz sem jött (a formátum megváltozott?)';
  return { talalat, hiba };
}

/** A Google napi felkapott listája (USA, RSS). */
export async function googleFelkapott({ fetchFn = fetch, idoMs = LEKERES_IDO_MS } = {}) {
  try {
    const r = await fetchFn('https://trends.google.com/trending/rss?geo=US', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(idoMs) });
    if (!r.ok) return { tetelek: [], hiba: `HTTP ${r.status}` };
    const tetelek = rssTetelek(await r.text());
    if (!tetelek.length) return { tetelek: [], hiba: 'üres lista (a formátum megváltozott?)' };
    return { tetelek, hiba: '' };
  } catch (e) {
    return { tetelek: [], hiba: 'hálózati hiba: ' + String(e?.message || e).slice(0, 60) };
  }
}

/** A saját, utolsó `napok` nap `db` legolvasottabb cikkének eszközei (kisbetűs, egyedi). */
export function sajatTopEszkozok(days, cikkMeta, now = Date.now(), napok = 14, db = 10) {
  const tol = new Date(now - napok * NAP).toISOString().slice(0, 10);
  const v = new Map();
  for (const [nap, sorok] of Object.entries(days || {})) {
    if (nap < tol) continue;
    for (const r of Array.isArray(sorok) ? sorok : []) {
      const m = String(r?.path || '').match(/^\/(?:hu\/|es\/)?article\/([^/?#]+)/);
      if (m) v.set(m[1], (v.get(m[1]) || 0) + (Number(r.visits) || 0));
    }
  }
  const top = [...v.entries()].sort((a, b) => b[1] - a[1]).slice(0, db).map(([s]) => s);
  return [...new Set(top.map(s => String(cikkMeta?.get(s)?.tool || '').trim().toLowerCase()).filter(Boolean))];
}

// A hírcím-ágban a puszta „AI” szó NEM elég (2026-10-20, élesben: a „dow today” tőzsdei keresés
// átjutott, mert a hírcímek többsége „AI stocks…” volt → nem odaillő trend-útmutató készült).
// Konkrét MI-termék/-műfaj kell (Gemini, ChatGPT, chatbot, prompt…) — a „nano banana” így is átmegy.
const AI_TERMEK_RX = /\b(chatgpt|gpt|gemini|claude|copilot|alexa|notebooklm|perplexity|grok|meta ai|midjourney|deepfakes?|chatbots?|prompts?)\b/i;

/** Felkapott tétel AI-kapcsolatú-e? A kifejezés maga AI/ismert eszköz, VAGY a hírcímek TÖBBSÉGE konkrét MI-termékről szól (10-14, 10-20). */
export function rssAiE(tetel, eszkozok = []) {
  const kif = String(tetel?.kifejezes || '');
  if (AI_RX.test(kif) || eszkozBenne(kif, eszkozok)) return true;
  const hirek = tetel?.hirek || [];
  return hirek.length > 0 && hirek.filter(h => AI_TERMEK_RX.test(h) || eszkozBenne(h, eszkozok)).length > hirek.length / 2;
}

/** Pontozás + összevonás (azonos tartalmas szókészlet = egy téma) → a legjobb TOP_DB. */
export function osszesit({ javaslatok = [], felkapott = [], bing = null, sajatEszkozok = [], eszkozok = [], magok = [], meglevoCimek = [] } = {}) {
  const m = new Map();
  const add = (kif, forras, pont, rss = false) => {
    const sz = szuro(kif, { eszkozok, magok, meglevoCimek, rss });
    if (!sz.ok) return;
    const kulcs = [...szavak(kif)].sort().join(' ') || normal(kif);
    const e = m.get(kulcs);
    if (e) {
      if (forras === 'google-javaslat' && e.forras.has('google-javaslat')) {                            // több alapkérdésnél is felbukkant
        if (e.ism < 2) { e.pont += 5; e.ism++; }                                                         // legfeljebb +10 összesen
        return;
      }
      if (e.forras.has(forras)) return;                                                                // ugyanaz a Bing-sor más szórenddel
      e.forras.add(forras); e.pont += pont; return;
    }
    m.set(kulcs, { kifejezes: normal(kif), forras: new Set([forras]), pont, eszkoz: sz.eszkoz || '', ism: 0 });
  };
  for (const j of javaslatok) add(j.kifejezes, 'google-javaslat', 10 - Math.min(9, Number(j.hely) || 0));
  for (const f of felkapott) if (rssAiE(f, eszkozok)) add(f.kifejezes, 'google-felkapott', 50, true);
  for (const b of bing?.lehetosegek || []) add(b.kifejezes, 'bing-lehetoseg', BING_PONT[b.sav] || 4);
  const sajat = new Set((sajatEszkozok || []).map(s => s.toLowerCase()));
  for (const e of m.values()) if (e.eszkoz && sajat.has(e.eszkoz.toLowerCase())) e.pont += 10;
  const db = new Map();   // 10-14 javítás: eszközönként legfeljebb 2 téma (változatosság); eszköz nélküli nincs korlátozva
  return [...m.values()]
    .map(e => ({ kifejezes: e.kifejezes, forras: [...e.forras], pont: Math.round(e.pont), eszkoz: e.eszkoz }))
    .sort((a, b) => b.pont - a.pont || a.kifejezes.localeCompare(b.kifejezes))
    .filter(e => {
      if (!e.eszkoz) return true;
      const kulcs = e.eszkoz.toLowerCase();
      const n = db.get(kulcs) || 0;
      if (n >= MAX_ESZKOZONKENT) return false;
      db.set(kulcs, n + 1);
      return true;
    })
    .slice(0, TOP_DB);
}

/** A CLI-nek: ha a gyűjtés üres ÉS hibás volt, a tegnapi nem üres lista marad (10-14 javítás). */
export function mentendo(uj, regi) {
  if (!(uj?.temak?.length) && (uj?.hibak?.length) && regi?.temak?.length) return regi;
  return uj;
}

// ── LEMEZ ───────────────────────────────────────────────────────────
const jsonBe = ut => { try { return JSON.parse(readFileSync(ut, 'utf-8')); } catch { return null; } };
export const trendekBetolt = (ut = TRENDEK_UT) => jsonBe(ut);
export const bingListaBetolt = (ut = BING_UT) => jsonBe(ut);

/** Elég friss-e a lista ahhoz, hogy MA ne gyűjtsünk újra? */
export function frissE(trendek, now = Date.now()) {
  const t = Date.parse(trendek?.at || '');
  return Number.isFinite(t) && now - t < FRISS_ORA * 3600e3;
}

/** A HATÁSHOZ használható lista: be van kapcsolva, és 48 óránál nem régebbi — különben null. */
export function aktivTrendek({ now = Date.now(), cfg, trendek } = {}) {
  const c = cfg ?? jsonBe(join(ROOT, 'config.json')) ?? {};
  if (!trendBeallitas(c).be) return null;
  const T = trendek === undefined ? trendekBetolt() : trendek;
  const t = Date.parse(T?.at || '');
  if (!T || !Number.isFinite(t) || now - t > AKTIV_ORA * 3600e3) return null;
  return T;
}

function eszkozokBetolt(root) {
  const j = jsonBe(join(root, 'website', 'tool-links.json'));
  return Object.keys(j?.tools || {});
}

function cikkAdatok(root) {
  const dir = join(root, 'content', 'articles');
  const cimek = [], meta = new Map();
  if (!existsSync(dir)) return { cimek, meta };
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    const d = jsonBe(join(dir, f));
    if (!d) continue;
    const slug = d._meta?.slug;
    if (slug) meta.set(slug, { tool: d._meta?.tool || '' });
    if (utmutatoE(f, d)) {
      const cim = (String(d.article_markdown || '').match(/^title:\s*"?([^"\n]+)/m) || [])[1];
      if (cim) cimek.push(cim);
    }
  }
  return { cimek, meta };
}

/** A napi gyűjtés: minden forrás, szűrés, pontozás. Soha nem dob — a hibák a `hibak`-ba kerülnek. */
export async function gyujt({ beall, fetchFn = fetch, alvas = alvasAlap, ora = Date.now, root = ROOT } = {}) {
  const hibak = [];
  const eszkozok = eszkozokBetolt(root);
  const { cimek, meta } = cikkAdatok(root);
  const j = await googleJavaslatok(beall?.seeds || [], { fetchFn, alvas, ora });
  if (j.hiba) hibak.push(`${FORRAS_NEV['google-javaslat']}: ${j.hiba}`);
  const f = await googleFelkapott({ fetchFn });
  if (f.hiba) hibak.push(`${FORRAS_NEV['google-felkapott']}: ${f.hiba}`);
  const bing = bingListaBetolt(join(root, 'content', 'trend-bing.json'));
  const days = jsonBe(join(root, 'memory', 'traffic-log.json'))?.days || {};
  const most = ora();
  const temak = osszesit({
    javaslatok: j.talalat, felkapott: f.tetelek, bing,
    sajatEszkozok: sajatTopEszkozok(days, meta, most), eszkozok, magok: beall?.seeds || [], meglevoCimek: cimek
  });
  return { at: new Date(most).toISOString(), datum: new Date(most).toISOString().slice(0, 10), temak, hibak, bing_frissitve: bing?.frissitve || null };
}

// ── HATÁS: HÍREK (core) ─────────────────────────────────────────────
/**
 * Melyik trendhez illik egy cím? Eszköz-egyezés, vagy a kifejezés MINDEN tartalmas szava benne van.
 * `szigoru` (2026-10-20): CSAK a teljes szó-egyezés számít — a hír trend-CÍMKÉJÉHEZ (agents/iro). A puszta
 * eszköznév („Gemini…”) a sorrendhez (trendElore) jó jel, címkének túl laza: 10-20-án 4 Gemini-hír kapta
 * meg a „gemini prompt for professional photo” címkét, pedig egyik sem arról szólt.
 */
export function trendTalalat(cim, trendek, { szigoru = false } = {}) {
  const c = ` ${normal(cim).replace(/[^a-z0-9+ ]+/g, ' ')} `;
  for (const t of trendek?.temak || []) {
    const e = String(t.eszkoz || '').toLowerCase().replace(/\+$/, '');
    if (!szigoru && e && new RegExp(`[^a-z0-9]${escRx(e)}\\+?[^a-z0-9]`).test(c)) return t.kifejezes;
    const sz = [...szavak(t.kifejezes)];
    if (sz.length >= 2 && sz.every(w => c.includes(` ${w} `) || c.includes(` ${w.replace(/s$/, '')} `))) return t.kifejezes;
  }
  return null;
}

/** Stabil átrendezés: a trendhez illő draftok előre, a sorrend egyébként változatlan. */
export function trendElore(fajlok, trendek, cimOf) {
  const L = Array.isArray(fajlok) ? fajlok.slice() : [];
  if (!trendek?.temak?.length) return L;
  const elol = [], hatul = [];
  for (const f of L) {
    let cim = '';
    try { cim = cimOf(f) || ''; } catch { /* sérült draft: a helyén marad */ }
    (trendTalalat(cim, trendek) ? elol : hatul).push(f);
  }
  return [...elol, ...hatul];
}

// ── HATÁS: ÚTMUTATÓK (core) ─────────────────────────────────────────
export const UJRA_NAP = 30;

/** Hány trend-útmutató íródott MA (a _meta.trend + written_at alapján). */
export function maiTrendDb(metak, ma) {
  return (Array.isArray(metak) ? metak : []).filter(m => m && m.trend && String(m.written_at || '').startsWith(ma)).length;
}

/** A mai trend-téma — csak ha ma még nem készült trend-útmutató. */
export function maiTrendTema(topics, metak, ma) {
  if (maiTrendDb(metak, ma) > 0) return null;
  return (Array.isArray(topics) ? topics : []).find(t => t && t.status !== 'done' && t.priority === 'trend') || null;
}

/**
 * Ugyanannak az igénynek két Google-változata-e? (10-16 élesben: a „gemini prompt for professional
 * headshot" után másnap a „…professional photo" jött, és szinte ugyanaz az útmutató került sorra.)
 * Rokon: pontos egyezés, vagy a RÖVIDEBB kifejezés tartalmas szavainak legalább 75%-a a másikban is.
 */
export function rokonKifejezes(a, b) {
  if (normal(a) === normal(b)) return true;
  const x = szavak(a), y = szavak(b);
  const kicsi = Math.min(x.size, y.size);
  if (!kicsi) return false;
  let k = 0; for (const w of x) if (y.has(w)) k++;
  return k / kicsi >= 0.75;
}

/** Az első trend, amit (vagy aminek rokonát) az utóbbi UJRA_NAP napban nem próbáltuk. */
export function kovetkezoTrendTema(trendek, proba, now = Date.now()) {
  const hatar = now - UJRA_NAP * NAP;
  const volt = (Array.isArray(proba) ? proba : []).filter(p => Date.parse(p?.at || '') >= hatar).map(p => p.kifejezes);
  return (trendek?.temak || []).find(t => !volt.some(v => rokonKifejezes(v, t.kifejezes))) || null;
}

/** Kell-e ma trend-témát felvenni? → a téma, vagy null (ma már próbáltuk / vár egy / nincs lista). */
export function trendFelvetelKell(store, trendek, now = Date.now()) {
  if (!trendek?.temak?.length) return null;
  const ma = new Date(now).toISOString().slice(0, 10);
  if ((store?.topics || []).some(t => t?.priority === 'trend' && t.status !== 'done')) return null;
  if ((store?.trend_proba || []).some(p => String(p?.at || '').startsWith(ma))) return null;
  return kovetkezoTrendTema(trendek, store?.trend_proba, now);
}

/** A próbálkozás feljegyzése (sikertelen ötletelésnél is) — 60 napnál régebbi kiesik. */
export function trendProbaJegyez(lista, kifejezes, now = Date.now()) {
  const hatar = now - 60 * NAP;
  return [...(Array.isArray(lista) ? lista : []).filter(p => Date.parse(p?.at || '') >= hatar), { kifejezes, at: new Date(now).toISOString() }];
}

/** Az ötletelő kérésének kiegészítése egy trendhez. */
export function trendPrompt(t) {
  if (!t) return '';
  return `\n\nTREND — real people are searching for this RIGHT NOW: "${t.kifejezes}". Every idea must be a practical, beginner-friendly how-to that answers exactly this need`
    + (t.eszkoz ? ` using ${t.eszkoz}` : '')
    + `. Only describe features that really exist; if you are not sure a feature exists, choose a general approach that works with any mainstream AI assistant. No comparisons or rankings between products.`;
}

// ── RIPORT ÉS MÉRÉS ─────────────────────────────────────────────────
/** A napi Telegram-riport sorai. Ha még sosem futott: csend (üres tömb). */
export function trendRiportSorok(trendek, bing, now = Date.now()) {
  const s = [];
  if (!trendek) return s;
  const kor = now - Date.parse(trendek.at || 0);
  if (!(kor <= AKTIV_ORA * 3600e3)) s.push(`⚠️ Trendkutató: a lista ${Math.floor(kor / NAP)} napja nem frissült — a hírek és útmutatók most trend nélkül mennek`);
  const top = (trendek.temak || []).slice(0, 3).map(t => `${t.kifejezes} (${(t.forras || []).map(f => FORRAS_NEV[f] || f).join('+')})`);
  s.push(top.length ? '📈 Trend ma: ' + top.join(' · ') : '📈 Trend ma: nincs a szűrőn átjutó téma');
  for (const h of trendek.hibak || []) s.push('⚠️ Trendforrás kiesett: ' + h);
  const bk = now - Date.parse(bing?.frissitve || '');
  if (bk > BING_ELAVULT_NAP * NAP) s.push(`🔁 Bing AI-lehetőség lista régi (${Math.floor(bk / NAP)} nap) — kérd: „frissítsd a Bing-listát"`);
  return s;
}

const csoport = a => {
  if (!a.length) return { db: 0, atlag: 0, median: 0 };
  const r = a.slice().sort((x, y) => x - y);
  const med = r.length % 2 ? r[(r.length - 1) / 2] : (r[r.length / 2 - 1] + r[r.length / 2]) / 2;
  return { db: a.length, atlag: Math.round(10 * a.reduce((x, y) => x + y, 0) / a.length) / 10, median: med };
};

/** Trend vs többi: az első 7 nap belépői (3 nyelv együtt), a `kezdet` utáni, teljes 7 napos cikkekre. */
export function trendMeres({ cikkek, days, kezdet = '2026-10-15', now = Date.now() }) {
  const napok = Object.keys(days || {}).sort();
  const utolso = napok[napok.length - 1] || '';
  const v = new Map();
  for (const [nap, sorok] of Object.entries(days || {})) {
    for (const r of Array.isArray(sorok) ? sorok : []) {
      const m = String(r?.path || '').match(/^\/(?:hu\/|es\/)?article\/([^/?#]+)/);
      if (m) { const x = v.get(m[1]) || []; x.push([nap, Number(r.visits) || 0]); v.set(m[1], x); }
    }
  }
  const ki = { utmutato: { trend: [], tobbi: [] }, hir: { trend: [], tobbi: [] } };
  for (const c of cikkek || []) {
    const pub = String(c?.published_at || '').slice(0, 10);
    if (!pub || pub < kezdet) continue;
    const vege = new Date(Date.parse(pub) + 7 * NAP).toISOString().slice(0, 10);
    if (vege > utolso) continue;   // az első 7 nap még nincs meg a naplóban
    const ossz = (v.get(c.slug) || []).filter(([n]) => n >= pub && n <= vege).reduce((s, [, x]) => s + x, 0);
    ki[c.guide ? 'utmutato' : 'hir'][c.trend ? 'trend' : 'tobbi'].push(ossz);
  }
  return {
    utmutato: { trend: csoport(ki.utmutato.trend), tobbi: csoport(ki.utmutato.tobbi) },
    hir: { trend: csoport(ki.hir.trend), tobbi: csoport(ki.hir.tobbi) }
  };
}

// ── PARANCSSOR ──────────────────────────────────────────────────────
//   node core/trend-kutato.js            napi gyűjtés (20 órán belül nem ismétel)
//   node core/trend-kutato.js --force    gyűjtés mindenképp
//   node core/trend-kutato.js --dry      gyűjt és kiírja, de NEM menti (helyi próba)
if (process.argv[1] && process.argv[1].endsWith('trend-kutato.js')) {
  const arg = process.argv.slice(2);
  (async () => {
    if (arg.includes('--meres')) {
      const dir = join(ROOT, 'content', 'articles');
      const cikkek = readdirSync(dir).filter(x => x.endsWith('.json')).map(f => {
        const d = jsonBe(join(dir, f)) || {};
        return { slug: d._meta?.slug, published_at: d._meta?.published_at, guide: utmutatoE(f, d), trend: !!d._meta?.trend };
      }).filter(c => c.slug);
      const m = trendMeres({ cikkek, days: jsonBe(join(ROOT, 'memory', 'traffic-log.json'))?.days || {} });
      const sor = (n, g) => console.log(`   ${n}: trend ${g.trend.db} db · átlag ${g.trend.atlag} · medián ${g.trend.median}  |  többi ${g.tobbi.db} db · átlag ${g.tobbi.atlag} · medián ${g.tobbi.median}  (első 7 nap belépői)`);
      console.log('📏 TREND-MÉRÉS (2026-10-15 óta megjelent, teljes 7 napos cikkek)');
      sor('Útmutató', m.utmutato); sor('Hír     ', m.hir);
      return;
    }
    const cfg = jsonBe(join(ROOT, 'config.json')) || {};
    const beall = trendBeallitas(cfg);
    if (!beall.be) { console.log('⏭️  Trendkutató: kikapcsolva (config content.trends.enabled).'); return; }
    if (!arg.includes('--force') && !arg.includes('--dry') && frissE(trendekBetolt())) { console.log('💤 Trendkutató: a mai lista már megvan.'); return; }
    console.log('📈 TRENDKUTATÓ — ' + beall.seeds.length + ' alapkérdés');
    const ki = await gyujt({ beall });
    for (const tm of ki.temak) console.log(`   ${String(tm.pont).padStart(3)}  ${tm.kifejezes}  [${tm.forras.map(x => FORRAS_NEV[x] || x).join(' + ')}]${tm.eszkoz ? ' · ' + tm.eszkoz : ''}`);
    for (const h of ki.hibak) console.log('   ⚠️ ' + h);
    if (arg.includes('--dry')) { console.log('   (próba — nem mentem)'); return; }
    const regi = trendekBetolt();
    if (mentendo(ki, regi) === regi) { console.log('   ⚠️ minden forrás kiesett — a tegnapi lista marad'); return; }
    mkdirSync(dirname(TRENDEK_UT), { recursive: true });
    writeFileSync(TRENDEK_UT, JSON.stringify(ki, null, 2) + '\n', 'utf-8');
    console.log(`   ✅ ${ki.temak.length} téma mentve → memory/trendek.json`);
  })().catch(e => console.log('⚠️ Trendkutató hiba (nem kritikus): ' + String(e?.message || e).slice(0, 120)))
    .finally(() => { process.exitCode = 0; });
}
