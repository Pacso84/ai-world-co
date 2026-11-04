// ===================================================================
// FRISS CIKKEK TÉNYELLENŐRZÉSE (2026-10-21, user: „jó lenne, ha a tényellenőr a friss cikkeket
// nézné át! ne a régieket.”)
//
// A tény-ellenőrző (agents/fact-check) eddig CSAK a 30 napnál régebbi útmutatókat nézte, és az
// „ok” ítéletet sehova nem írta fel → minden futásban UGYANAZT a 2–3 útmutatót kapta (10-20/21:
// Gemini-számológép, ChatRTX, DeepSeek-kísérőlevél). Most:
//   • ELÖL a friss (≤7 napos) hírek és útmutatók, a legújabb előre — ezeket olvassák, ezek mennek
//     ki a Facebookra;
//   • a hírt a HIVATALOS FORRÁSÁHOZ méri (letöltve), nem a modell emlékezetéhez: a modell tudása
//     régebbi a hírnél, az új funkciót „nem létezőnek” hinné;
//   • a régi útmutatók csak a maradék helyre jönnek;
//   • minden átnézést a `fact_verified_at` jegyez → nincs körbeforgás. Ez NEM módosítás: a
//     „Frissítve” sort és a sitemap-dátumot csak a valódi javítás (`fact_checked_at`) mozdítja.
// Hálózat és lemez nélkül számol → tesztelhető (az agents/ alól nem lehet importálni).
// ===================================================================

import { arAllitasok } from './ar-tilalom.js';

export const FRISS_NAP = 7;
const NAP = 86400e3;

const pub = m => Date.parse(m?.published_at || '') || 0;

// 🧑 EMBER ÁLTAL MEGERŐSÍTETT cikk (2026-10-29): a tény-ellenőrző a SAJÁT elavult emlékezete alapján 75 útmutatót írt át
// és 6-ot jelölt „elavultnak” — a Le Chat „megszűnt”, a GPT Store „bezárt”, az Alexa+ „nincs kint”: mind téves volt
// (helyreállítva, hivatalos forrással). Amit ember (vagy a hivatalos forrás) megerősített, azt az automata HUMAN_OK_NAP
// napig nem nézi újra — különben ugyanazt a tévedést újra beírná / újra megjelölné.
export const HUMAN_OK_NAP = 180;
export const emberOk = (meta, now = Date.now()) => {
  const t = Date.parse(meta?.fact_human_ok || '');
  return Number.isFinite(t) && now - t < HUMAN_OK_NAP * NAP;
};

// ── KÉSZ-E EGY CIKK? (2026-11-01) ───────────────────────────────────
// 10-21 – 10-31: 13 hír „a forrás nem olvasható” miatt VÉGLEG kimaradt (a kihagyás is a `fact_verified_at`-et írta),
// pedig a hiba sokszor múló volt (Workspace-blog gyors bukás a CI-ben, Dropbox: szóközzel kezdődő link). A 7
// „döntés nem értelmezhető” esetnél viszont SEMMI nem jegyződött → 7-ből 5 a következő futásban újra elöl állt.
// Most: a kihagyás SKIP_MAX-szor próbálható, az értelmezhetetlen válasz ERTELMEZHETETLEN_MAX-szor; utána kész.
export const SKIP_MAX = 3;
export const ERTELMEZHETETLEN_MAX = 2;
const iso = now => new Date(now ?? Date.now()).toISOString();
const PROBA_MEZOK = ['fact_check_skip', 'fact_check_skip_count', 'fact_check_skip_at', 'fact_check_parse_fail_count'];

/** Kész-e a cikk az automata kör szempontjából (nem kell újra elővenni a friss cikkek között). */
export function kesz(meta) {
  const m = meta || {};
  return (!!m.fact_verified_at && !m.fact_check_skip)
    || (Number(m.fact_check_skip_count) || 0) >= SKIP_MAX
    || (Number(m.fact_check_parse_fail_count) || 0) >= ERTELMEZHETETLEN_MAX;
}

/** Sikeres átnézés: `fact_verified_at` + a próba-mezők törlése. Ez NEM módosítás (a „Frissítve” nem mozdul). */
export function atnezveMeta(meta, now) {
  const m = { ...(meta || {}) };
  for (const k of PROBA_MEZOK) delete m[k];
  m.fact_verified_at = iso(now);
  return m;
}

/** Kihagyás (a forrás nem olvasható): NEM írja a `fact_verified_at`-et — a cikk SKIP_MAX próbáig újra sorra kerül. */
export function kihagyasMeta(meta, ok, now) {
  const m = meta || {};
  return { ...m, fact_check_skip: String(ok || 'ismeretlen ok').slice(0, 300), fact_check_skip_count: (Number(m.fact_check_skip_count) || 0) + 1, fact_check_skip_at: iso(now) };
}

/** Értelmezhetetlen modell-válasz: számláló +1; ERTELMEZHETETLEN_MAX-nál lezárva (átnézettnek jelölve, okkal). */
export function ertelmezhetetlenMeta(meta, now) {
  const m = meta || {};
  const n = (Number(m.fact_check_parse_fail_count) || 0) + 1;
  const uj = { ...m, fact_check_parse_fail_count: n };
  if (n >= ERTELMEZHETETLEN_MAX) { uj.fact_verified_at = iso(now); uj.fact_check_skip = 'a válasz kétszer nem volt értelmezhető'; }
  return uj;
}

/** Gyanú (automata útmutató-kör, emlékezetből): a cikk átnézett, a szöveg NEM változik, csak a gyanú jegyződik. */
export function gyanuMeta(meta, szoveg, now) {
  return { ...atnezveMeta(meta, now), fact_check_suspect: String(szoveg || '').slice(0, 300), fact_check_suspect_at: iso(now) };
}

// ── OLVASOTTSÁG (2026-11-01, 4. rész; user 10-31: „igen!” a lefedettség-bővítésre) ─────────
// 10-31-i mérés: 392 hír soha nem volt átnézve, ebből 336-ot olvastak (havi ~917 látogatás) — mert a sor csak a
// ≤7 napos friss cikkeket és a 30+ napos útmutatókat adta, a 8+ napos hír SOHA nem került sorra. Most a régi,
// OLVASOTT hírek is bejönnek, a legolvasottabb előre. A cikk útvonala a website/build.js szerint
// `/article/<slug>` (hír és útmutató egyaránt; nyelvi előtag: /hu/, /es/). A /hu/ KIMARAD: az a tulaj böngészése
// (a mérésből mindenhol kizárjuk); a /es/ ugyanahhoz a cikkhez számít. A slug a forgalmi naplóban pontosan
// egyezik a _meta.slug-gal (11-01: 615 egyező útvonal; a 100 eltérő törölt cikké) → NINCS előtag-illesztés.
export const OLVASOTT_NAP = 30;
const OLVASO_UTVONAL = /^\/(?:es\/)?article\/([^/?#]+)/;   // a core/guide-prune.js mintája, de /hu/ NÉLKÜL

/** A cikk angol útvonala (a website/build.js `${LP}/article/${slug}` mintája), vagy null, ha nincs slug. */
export function cikkUtvonal(meta) {
  const slug = String(meta?.slug || '').trim();
  return slug ? `/article/${slug}` : null;
}

/**
 * slug → az utolsó `napok` nap látogatásai a forgalmi naplóból (memory/traffic-log.json `days`; CSAK olvassuk,
 * a core/traffic-log.js írja a CI-ben). /hu/ kizárva, /es/ beszámít. Üres napló → üres Map.
 */
export function latogatasTerkep(days, now = Date.now(), napok = OLVASOTT_NAP) {
  const tol = new Date(now - (napok - 1) * NAP).toISOString().slice(0, 10);
  const ig = new Date(now).toISOString().slice(0, 10);
  const v = new Map();
  for (const [nap, sorok] of Object.entries(days || {})) {
    if (nap < tol || nap > ig || !Array.isArray(sorok)) continue;
    for (const r of sorok) {
      const m = String(r?.path || '').match(OLVASO_UTVONAL);
      const n = Number(r?.visits) || 0;
      if (m && n > 0) v.set(m[1], (v.get(m[1]) || 0) + n);
    }
  }
  return v;
}

/**
 * Az automata kör sorrendje: friss (még nem kész) cikkek a legújabbal kezdve, utána FELVÁLTVA a régi (8+ napos),
 * még nem kész, OLVASOTT hírek (a legolvasottabb előre) és a 30 napnál régebbi útmutatók (a legrégebben
 * átnézettel kezdve). A megjelölt (emberre váró) és az ember által jóváhagyott kimarad.
 * @param {{file: string, data: object}[]} cikkek  publikált cikkek (hír + útmutató)
 * @param {{latogatas?: Map<string, number>}} [opts]  slug → látogatás (latogatasTerkep); nélküle régi hír nincs a sorban
 */
export function ellenorzesiSor(cikkek, now = Date.now(), { latogatas } = {}) {
  const elo = (cikkek || []).filter(c => c?.data?._meta && !c.data._meta.fact_check_flag && !emberOk(c.data._meta, now) && pub(c.data._meta));
  // 2026-11-01: a „kész-e” döntés a kesz()-ben (a kihagyás már nem végleges). Az újrapróbára váró cikk
  // (volt már kihagyva / értelmezhetetlen) a még SOHA nem nézett friss cikkek MÖGÉ kerül.
  // A régi útmutatók szándéka VÁLTOZATLAN: körbeforognak, a legrégebben átnézett előre.
  const ujra = m => (m.fact_check_skip || (Number(m.fact_check_skip_count) || 0) + (Number(m.fact_check_parse_fail_count) || 0) > 0 ? 1 : 0);
  const friss = elo
    .filter(c => now - pub(c.data._meta) < FRISS_NAP * NAP && !kesz(c.data._meta))
    .sort((a, b) => ujra(a.data._meta) - ujra(b.data._meta) || pub(b.data._meta) - pub(a.data._meta));
  const regi = elo
    .filter(c => c.data._meta.type === 'guide' && now - pub(c.data._meta) > 30 * NAP)
    .sort((a, b) => {
      const av = a.data._meta.fact_verified_at || a.data._meta.fact_checked_at || '';
      const bv = b.data._meta.fact_verified_at || b.data._meta.fact_checked_at || '';
      return av.localeCompare(bv);
    });
  if (!(latogatas instanceof Map) || !latogatas.size) return [...friss, ...regi];
  // Régi OLVASOTT hír: egyszer nézzük át (a kesz() szerint), utána kimarad — nem forog körbe, mint az útmutató.
  const olvas = m => latogatas.get(String(m.slug || '')) || 0;
  const regiHir = elo
    .filter(c => c.data._meta.type !== 'guide' && now - pub(c.data._meta) >= FRISS_NAP * NAP && !kesz(c.data._meta) && olvas(c.data._meta) > 0)
    .sort((a, b) => olvas(b.data._meta) - olvas(a.data._meta) || pub(b.data._meta) - pub(a.data._meta));
  const felvaltva = [];
  for (let i = 0; i < Math.max(regiHir.length, regi.length); i++) {
    if (i < regiHir.length) felvaltva.push(regiHir[i]);
    if (i < regi.length) felvaltva.push(regi[i]);
  }
  return [...friss, ...felvaltva];
}

/** A forrásoldal olvasható szövege (szkript, stílus, menü nélkül), legfeljebb `max` karakter. */
export function forrasSzoveg(html, max = 15000) {
  return String(html || '')
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * A cikk ÖSSZES forrása. Az összevont hírnek (merged_from) több forrása van a `source_links`-ben;
 * ha csak az elsőt néznénk, a többiből jövő HELYES adatot „kitaláltnak” hinnénk (10-21, Picsart).
 */
export function forrasLinkek(meta) {
  const m = meta || {};
  // ✂️ 2026-11-01: a linket LEVÁGVA nézzük. A Dropbox hírfolyama „  https://blog.dropbox.com/… ” alakban adja, és a
  // régi `^https?://` szűrő emiatt a forrást kihagyta → „a forrás nem olvasható (0/0)”, pedig a link jó volt.
  const nyers = [...(Array.isArray(m.source_links) ? m.source_links : []), m.source_link];
  return [...new Set(nyers.map(u => (typeof u === 'string' ? u.trim() : '')).filter(u => /^https?:\/\/\S/i.test(u)))];
}

/** Ennél rövidebb forrásszövegből nem ítélünk (JS-oldal, bejelentkezés, hibaoldal). */
export const MIN_FORRAS = 600;

export const HIR_RENDSZER = `You are the post-publication fact-checker for AI World HQ. You compare a PUBLISHED news explainer with the OFFICIAL SOURCE(S) it was written from. When several sources are given, the article may combine them: a claim is supported if ANY source supports it. The source text is the ONLY authority. Your own memory is NOT: the source may describe products and features newer than your training, so never call something false just because you have not heard of it.

WE NEVER PUBLISH PRICES. A price, fee or dollar amount that the article leaves out is NEVER an error — do not report it and never add one. If the article itself states a product price, remove that price (keep the plan name, e.g. "check the official pricing page for current plans").

Find factual specifics in the article that the SOURCE CONTRADICTS: numbers, dates, plan or tier names, who gets it and where (regions, languages, platforms, account types), what the feature does or does not do, and timing (available now vs. coming later).
Ignore: general advice, explanations of what it means for the reader, widely known background, opinions and style.
A specific factual claim presented as part of this announcement that the source does not support at all: soften it ("if your account has it…") or remove it. Do not touch anything else.

Change ONLY the wrong sentences and keep everything else word for word: the same frontmatter, title, headings and structure. Keep product and company names EXACTLY as written.

Do NOT add any new claim of your own: a new or rewritten sentence may only state what the source says. Our code checks this and rejects the whole fix otherwise.

Output ONLY JSON (no prose, no code fence):
{"verdict":"ok"|"fix","errors":["article says X, source says Y"],"reason":"one short sentence","reason_hu":"the same reason as one short sentence in Hungarian","fixed_markdown":"the full corrected article markdown, or an empty string"}`;

// ── GÉPI BIZTOSÍTÉK (2026-10-21, user: „ezek a hibák ne forduljanak elő többet!”) ──────────────
// A modell ítélete nem elég ahhoz, hogy élő szövegből kivegyünk valamit: 10-21-én a Picsart-hírből
// HELYES adatot vett ki, mert a forrás egy részét nem látta. Ezért a csere ELŐTT a kód maga nézi
// meg: a kivett / átírt mondat számai és tartalomszavai benne vannak-e a forrás(ok)ban. Ha igen,
// a forrás ALÁTÁMASZTJA → a javítás nem mehet ki (a régi szöveg marad, és szólunk).
const SZAMSZO = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, hundred: 100 };
const TOLTELEK = new Set('about above after again also because been before being between both could does doing down during each from further have having here into itself just more most much need only other over same should some such than that their them then there these they this those through under until very what when where which while with would your yours youre will what\'s it\'s that\'s company says said according announcement post blog article'.split(' '));
const mondatok = md => String(md || '').replace(/^---[\s\S]*?\n---\n/, '').split(/\n+|(?<=[.!?])\s+(?=[A-Z"„“])/).map(s => s.replace(/^[#>*\-\d.\s]+/, '').trim()).filter(s => s.split(/\s+/).length >= 4);
/** A szöveg mondatainak száma UGYANAZZAL a bontással, mint a forrasAlatamasztja (≥4 szavas mondatok) — az arány nevezője (core/elakadas.js, 2026-10-24). */
export const mondatSzam = md => mondatok(md).length;
const szamok = s => [...String(s).toLowerCase().matchAll(/\b(\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|fifty|hundred)\b/g)].map(m => String(SZAMSZO[m[1]] ?? m[1].replace(',', '.')));
const szavak = s => [...new Set((String(s).toLowerCase().replace(/[’']s\b/g, '').match(/[a-z][a-z-]{3,}/g) || []).filter(w => !TOLTELEK.has(w)))];

/**
 * A javítás által KIVETT vagy átírt mondatok közül azok, amelyeket a forrás alátámaszt
 * (minden számuk és tartalomszavaik ≥60%-a megvan a forrásban). Üres tömb = a csere mehet.
 * KIVÉTEL — ÁR (2026-11-02, kód-átnézés 8. rész): a termékárat hordozó mondatot a javítás akkor is kiveheti / átírhatja,
 * ha a forrás közli: árat NEM közlünk (user 11-01), és eddig ez az őr épp a kint lévő ár kivételét blokkolta. Hogy az
 * átírt mondat se hozzon be új árat, azt az agent ujArak()-őre nézi.
 */
export function forrasAlatamasztja(eredeti, javitott, forrasSz) {
  const uj = new Set(mondatok(javitott));
  const F = String(forrasSz || '').toLowerCase();
  const fSzam = new Set(szamok(F)), fSzo = new Set(szavak(F));
  return mondatok(eredeti).filter(m => !uj.has(m)).filter(m => !arAllitasok(m).length).filter(m => {
    const sz = szamok(m), w = szavak(m);
    if (!w.length) return false;
    const szamOk = sz.every(x => fSzam.has(x));
    const arany = w.filter(x => fSzo.has(x)).length / w.length;
    return szamOk && arany >= 0.6;
  });
}

/** A hír javítása csak akkor cserélheti a régit, ha kis, célzott javítás maradt. null = rendben. */
export function hirCsereEp(fixed, original) {
  if (!fixed || !String(fixed).trimStart().startsWith('---')) return 'nincs frontmatter';
  if (!/^title:\s*\S/m.test(fixed)) return 'nincs title mező';
  const szo = s => String(s || '').split(/\s+/).filter(Boolean).length;
  const fw = szo(fixed), ow = szo(original);
  if (ow && (fw < ow * 0.8 || fw > ow * 1.2)) return `túl nagy átírás (${fw} szó a ${ow}-ből)`;
  const cimek = s => (String(s || '').match(/^#{1,4} /gm) || []).length;
  if (cimek(fixed) !== cimek(original)) return 'megváltozott a fejezetek száma';
  return null;
}

// ── HOZZÁADOTT ÁLLÍTÁS-ŐR (2026-11-01) ──────────────────────────────
// A forrasAlatamasztja() azt védi, amit a javítás KIVENNE. Ez a fordított irány: amit a javítás BEHOZNA (új vagy
// átírt mondat), annak a forrásban kell lennie — különben a „tény-ellenőrző” maga vinne be kitalált adatot (10-29:
// emlékezetből 75 útmutatóba így került hiba). UGYANAZ a mondat- és szóbontás, mint a forrasAlatamasztja-nál.
// A lágyító szavak („if your account has it…”, „the source does not mention…”) nem állítások → nem számítanak
// tartalomszónak; ha egy új mondatban csak ilyenek vannak, az nem hoz be állítást.
const LAGYITO = new Set('available availability account accounts check checking appear appears rolling roll gradually eventually might possibly perhaps later look whether confirm confirmed confirms specify specified specifies mention mentioned mentions detail details source sources official clear unclear exact exactly mean means region regions plan plans tier option options feature features yet page pages pricing price prices website current latest'.split(' '));

/**
 * A javítás által BEHOZOTT (az eredetiben nem szereplő) mondatok közül azok, amelyeket a forrás NEM támaszt alá
 * (van olyan számuk, ami a forrásban nincs, vagy a tartalomszavaik < 60%-a van meg). Üres tömb = rendben.
 */
export function forrasbanNemSzereplo(eredeti, javitott, forrasSz) {
  const regi = new Set(mondatok(eredeti));
  const F = String(forrasSz || '').toLowerCase();
  const fSzam = new Set(szamok(F)), fSzo = new Set(szavak(F));
  return mondatok(javitott).filter(m => !regi.has(m)).filter(m => {
    const sz = szamok(m), w = szavak(m).filter(x => !LAGYITO.has(x));
    if (!sz.every(x => fSzam.has(x))) return true;
    if (!w.length) return false;
    return w.filter(x => fSzo.has(x)).length / w.length < 0.6;
  });
}

// ── ELVESZETT FRONTMATTER (2026-11-01) ──────────────────────────────
// 10-21 – 10-31: 5 hír-javítás „nincs frontmatter” miatt veszett el — a modell csak a törzset adta vissza. A
// frontmattert a javításnak úgysem szabad megváltoztatnia → ha hiányzik, az EREDETIT tesszük vissza, és a javítás
// utána ugyanazon az ellenőrzésen megy át (hirCsereEp, forrás-őrök, név-zár).
const FM = /^﻿?---\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/;
/** Ha a javított szövegből hiányzik a frontmatter, de az eredetiben megvan: az eredeti frontmatter + a javított törzs. */
export function frontmatterVissza(javitott, eredeti) {
  const j = String(javitott ?? '');
  if (!j.trim() || j.trimStart().startsWith('---')) return javitott;
  const fm = String(eredeti || '').match(FM);
  if (!fm) return javitott;
  return fm[0].replace(/\s*$/, '\n') + '\n' + j.replace(/^\s+/, '');
}

// ── AUTOMATA ÚTMUTATÓ-KÖR: CSAK GYANÚ, JAVÍTOTT SZÖVEG NÉLKÜL (2026-11-01) ──
// 10-21 – 10-31: az útmutató-ágon a modell 2500–2970 tokenben a TELJES javított markdownt írta, holott automata
// körben azt úgysem használhattuk (forrás nincs, élő szöveget nem írhat át) → 7 csonka, értelmezhetetlen válasz.
// Most rövid válasz: ítélet + gyanús állítások + egy magyar mondat. Kézi módban (--claim/--id/--company/--tool)
// marad a teljes javító prompt (agents/fact-check/agent.js SYSTEM_PROMPT).
export const UTMUTATO_GYANU_RENDSZER = `You are the post-publication fact-checker for AI World HQ. You read a PUBLISHED step-by-step guide and say whether anything in it is likely no longer true. You do NOT rewrite the guide.

IMPORTANT — YOUR MEMORY IS OLDER THAN OUR PRODUCTS. The guide may describe products, features, names, plans and prices that are newer than your training. On 2026-10-29 we found that this check had wrongly called Le Chat "discontinued", the GPT Store "shut down" and Alexa+ "not launched" — all false.
- Flag ONLY a concrete, specific suspicion you are confident about (e.g. a feature you know was removed, a clearly impossible step).
- If you do not recognize something, do NOT treat it as non-existent, removed or discontinued.
- A new name, a new feature or a new price is NOT an error just because you have not heard of it.
- We never publish prices: a missing price is NEVER a suspicion.
- General advice, style and opinions are not your job.
- When in doubt, answer "ok".

Output ONLY JSON (no prose, no code fence), short:
{"verdict":"ok"|"suspect","claims":["the exact suspicious claim, max 3"],"reason":"one short sentence","reason_hu":"the same as one short sentence in Hungarian"}`;

/** A modell válaszából az első {...} JSON-objektum (kódkerítés, előtte-utána szöveg megengedett); hibánál null. */
export function jsonKivesz(text) {
  if (!text) return null;
  const t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e <= s) return null;
  try { const o = JSON.parse(t.slice(s, e + 1)); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; }
}

/**
 * A rövid (gyanú-)válasz feldolgozása. Visszaad: {verdict: 'ok'|'suspect', claims: string[], reason, reason_hu}
 * vagy null (értelmezhetetlen). A régi ítéletszavak („fix”, „unpublish”) is gyanúnak számítanak — a modell néha
 * a megszokott formát adja; szöveget ebből az ágból SOHA nem írunk át.
 */
export function gyanuDontes(text) {
  const o = jsonKivesz(text);
  if (!o) return null;
  const v = String(o.verdict || '').toLowerCase().trim();
  const verdict = v === 'ok' ? 'ok' : ['suspect', 'fix', 'unpublish'].includes(v) ? 'suspect' : null;
  if (!verdict) return null;
  const lista = Array.isArray(o.claims) ? o.claims : Array.isArray(o.removed_claims) ? o.removed_claims : [];
  const claims = lista.filter(x => typeof x === 'string' && x.trim()).slice(0, 3).map(x => x.trim().slice(0, 200));
  return { verdict, claims, reason: String(o.reason || '').trim().slice(0, 300), reason_hu: String(o.reason_hu || '').trim().slice(0, 300) };
}

// ── NAPLÓ (2026-11-01) ──────────────────────────────────────────────
// A logs/factcheck_<idő>.json eddig csak darabszámot írt (ok/fixed/removed) — a 10-21 – 10-31-i átnézéshez a
// konzolt kellett visszabogarászni. Most tételesen: cikkenként egy sor. A forma STABIL: a napi Telegram-sor
// (későbbi rész) ebből olvas. A régi ok/fixed/removed/cost/at/claim mezők változatlanul megmaradnak.
export const EREDMENYEK = ['ok', 'javitva', 'visszautasitva', 'gyanu', 'kihagyva', 'ertelmezhetetlen'];

/** Egy napló-tétel. `status`: a kihagyott forrás HTTP-státusza (ha van). `jelolve`: kézi „levételre javasolt” jelölés. */
export function naploTetel({ file, cim, hir, eredmeny, ok_hu, status, modell_hu, jelolve } = {}) {
  if (!EREDMENYEK.includes(eredmeny)) throw new Error('ismeretlen eredmény: ' + eredmeny);
  const t = { file: String(file || ''), cim: String(cim || '').slice(0, 120), tipus: hir ? 'hir' : 'utmutato', eredmeny, ok_hu: String(ok_hu || '').slice(0, 300) };
  if (status != null && status !== '') t.status = Number(status) || status;
  if (modell_hu) t.modell_hu = String(modell_hu).slice(0, 300);
  if (jelolve) t.jelolve = true;
  return t;
}

/** A teljes napló-objektum (ezt írja az agent a logs/factcheck_<idő>.json-ba). */
export function tenyNaplo({ items = [], cost = 0, at, claim = null } = {}) {
  const darab = Object.fromEntries(EREDMENYEK.map(e => [e, 0]));
  for (const it of items) if (it && it.eredmeny in darab) darab[it.eredmeny]++;
  return {
    ok: darab.ok, fixed: darab.javitva, removed: items.filter(it => it?.jelolve).length,
    cost: Number(cost) || 0, at: at || new Date().toISOString(), claim: claim || null,
    osszes: items.length, darab, items
  };
}
