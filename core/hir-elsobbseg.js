// ===================================================================
// 📰 HÍR-ELSŐBBSÉG — az OLVASÓK döntenek, melyik hír kerül előre (2026-11-09)
// ===================================================================
// MIÉRT (user 11-09): „jó lenne céges hírekből több … szívesen olvasnak az új funkciókról és modellekről”
// → „ne csak a Picsartról szóljon minden 4, de ha kell, jöhet több hír is” → „kezdjünk az olvasókra
// koncentrálni, amiket nem olvasnak, azokat háttérbe szorítani!”
//
// MÉRVE (traffic-log, 10-10…11-08, 467 angol hír): átlag 5,1 látogatás/hír. Az LLM-cégek saját
// termékhírei jóval fölötte (Kimi K3.1 19 · Gemini 17,3 · Brave Leo 12 · Alexa 10,5 · Copilot 9),
// a cégeknek szóló esettanulmányok alatta (OpenAI-blog 85 hír, átl. 3,4 — zömmel „X cég ROI-ja”;
// Salesforce 2,6). A Picsart 84 hírrel a hírek 18%-át vitte (átl. 4,4).
// Eddig a napi 4 helyre egyszerűen a LEGFRISSEBB vázlat ment (+ trend előre) — az olvasottság nem számított.
//
// MŰKÖDÉS (csak SORREND + VÁLOGATÁS, $0; minden ellenőrzés ugyanaz):
//   1. TERMÉKHÍR ELŐRE: nálunk lévő LLM-cég (ChatGPT, Claude, Gemini, Copilot, Meta AI, Grok, Mistral,
//      Perplexity, DeepSeek, Qwen, Kimi, MiniMax, Z.ai, Duck.ai, Leo, Lumo, Alexa+, Apple Intelligence)
//      hivatalos forrásából, ÚJ funkcióról/modellről szóló cím (termekHirE). Esettanulmány, partnerség,
//      kormány-megállapodás, hirdetés-üzlet, felmérés NEM az.
//      ➕ 11-10 (user: „a honlapon fent lévő összes céget nézzük”): utána BÁRMELY cég új funkciója / modellje /
//      fejlesztése (termekSzint 1) — lásd lent. Ha nincs elég újdonság, a többi hely a régi szabály szerint telik.
//   2. UTÁNA FORRÁSONKÉNTI OLVASOTTSÁG (az elmúlt 30 nap átlaga, forrasOlvasottsag) — a keveset olvasott
//      forrás HÁTRA kerül (nem tűnik el: ha marad hely, megjelenik). Kevés adat (<3 hír) → semleges.
//   3. FORRÁS-PLAFON: egy forrásból naponta legfeljebb 1 hír (termékhírből 2) — ne vigye el egy blog a napot.
//   4. +2 EXTRA HELY naponta CSAK termékhírnek (_meta.termek_extra), a rendes 4-es keretbe NEM számít.
//      A 4-es keret a 09-08-i user-döntés (Bing: tömeges új oldal → nem szolgált ki) — azt nem emeljük,
//      csak a legolvasottabb fajtának adunk helyet.
//
// KIKAPCSOLÁS: HIR_ELSOBBSEG_BE = false (kézi kill-switch; a config `enabled` mezői nem kapcsolnak ki semmit).
// Teszt: core/hir-elsobbseg.test.js
// ===================================================================

export const HIR_ELSOBBSEG_BE = true;
export const TERMEK_EXTRA_NAPI = 2;
export const FORRAS_NAPI_MAX = 1;
export const TERMEK_FORRAS_NAPI_MAX = 2;
const OLVASOTTSAG_NAPOK = 30;
const MIN_HIR_A_MERESHEZ = 3;

/** LLM-cégek hivatalos, FOGYASZTÓI termékhír-forrásai (sources/rss-feeds.json id-k). */
export const TERMEK_FORRASOK = new Set([
  'openai-blog', 'anthropic-blog', 'google-gemini', 'google-ai-blog', 'google-labs', 'google-deepmind',
  'microsoft-ai', 'github-copilot-changelog', 'meta-ai', 'xai-news', 'mistral-ai', 'perplexity-news',
  'deepseek-sitemap', 'qwen-news', 'kimi-blog', 'minimax-blog', 'zai-release-notes', 'duckduckgo-duck-ai',
  'brave-leo', 'proton-lumo', 'amazon-alexa'
]);
/** Vegyes forrás: csak akkor termékhír, ha a cím az MI-asszisztenst NEVEZI meg. */
export const ASSZISZTENS_NEVVEL = {
  'google-workspace': /\bGemini\b/i,
  'microsoft-365': /\bCopilot\b/i,
  'microsoft-blog': /\bCopilot\b/i,
  'apple-newsroom': /\b(Apple Intelligence|Siri)\b/i
};

const UJ_JEL = /\b(introduc\w*|launch\w*|now|new|newest|update[sd]?|announc\w*|meet|upgrade[sd]?|adds?|added|brings?|gets?|arriv\w*|release[sd]?|preview|beta|how to)\b/i;
const MODELL_VERZIO = /\b[A-Za-z][\w]*[ -]?[A-Z]?\d+(?:\.\d+)+\b|\b(?:GPT|Gemini|Claude|Grok|Llama|Qwen|DeepSeek|Kimi|GLM|Voxtral|Mistral|Sora|Veo|Imagen|Muse|Codex)[ -]?[A-Z]?\d+\b/i;
// Cégeknek / üzletnek / politikáról szóló cím → nem az olvasóink termékhíre (a valódi 10–11-i címeken mérve).
const NEM_TERMEK = /\b(ROI|cuts?|achiev\w*|customers?|case stud\w*|partner\w*|MOU|government|ministry|office|universit\w*|graduates?|hiring|careers?|econom\w*|polic\w*|regulat\w*|evaluators?|vulnerabilit\w*|webinar|summit|conference|podcast|interview|funding|invest\w*|acqui\w*|ads?|advertis\w*|revenue|enterprises?|startups?|nonprofits?|NHS|hospitals?|banks?)\b|^How (?!to\b)\S/i;

/** Termékhír-e: LLM-cég hivatalos forrása + új funkció/modell jele + nem üzleti/politikai téma. */
export function termekHirE(forrasId, cim) {
  const c = String(cim || '').trim();
  if (!c || !forrasId) return false;
  const vegyes = ASSZISZTENS_NEVVEL[forrasId];
  if (!TERMEK_FORRASOK.has(forrasId) && !(vegyes && vegyes.test(c))) return false;
  if (NEM_TERMEK.test(c)) return false;
  return UJ_JEL.test(c) || MODELL_VERZIO.test(c);
}

// ===================================================================
// MINDEN CÉG ÚJDONSÁGA (2026-11-10, user: „de a honlapon fent lévő összes céget nézzük, ne csak 1-2!
// Ha van új funkció vagy modell, esetleg fejlesztés, azt is nézzük! Ha nincs naponta elég, akkor a régi
// szabályok érvényesek!”)
// ===================================================================
// MÉRVE 11-10: a várakozó 15–18 vázlatból mindkét futásban CSAK 1 volt LLM-termékhír → a +2 extra hely
// üresen maradt, a rendes helyekre esettanulmányok mentek. A forráslistánk (sources/rss-feeds.json)
// minden bekapcsolt tétele egy cég hivatalos blogja — mostantól mind számít.
//
// HÁROM SZINT (a sorrendben ez az ELSŐ kulcs, utána a forrás olvasottsága, ahogy eddig):
//   2 = LLM-cég termékhíre (termekHirE — változatlan; a mért olvasottság itt a legmagasabb)
//   1 = BÁRMELY MÁS cég hivatalos forrásából: új funkció, modell VAGY fejlesztés (frissítés, gyorsabb,
//       bővül, elérhető lett…) — és nem üzleti/esettanulmány/politika (ugyanaz a NEM_TERMEK, mint fent)
//   0 = minden más → a RÉGI szabályok szerint, a maradék helyekre
// A „how to” egy cégblogon tanács, nem újdonság — ezért a 2. szinten igen (a régi viselkedés), az 1.-en nem.
// FORRÁS-PLAFON: 2. szint → napi 2/forrás; 1. szint → napi 1/forrás (a régi), hogy egy termékeny blog
// (Picsart: 10-10…11-08 a hírek 18%-a) ne vigye el a napot — a user 11-09-én ezt külön kérte.
// ===================================================================

/** Nem cég saját forrása: közösségi oldal, sajtó, a saját szerkesztőségünk. Ezekből nincs „céges újdonság”. */
const NEM_CEG_FORRAS = /^(aiworld-editorial|reddit-|hackernews|techcrunch|theverge|arstechnica|wired|venturebeat|the-conversation|itnews|zdnet)/;

/** Új funkció / modell / fejlesztés jele egy cég címében (a „how to” és a puszta „now” itt nem elég). */
const CEG_UJ_JEL = /\b(introduc\w*|launch\w*|new|newest|update[sd]?|announc\w*|upgrade[sd]?|adds?|added|bring\w*|gets|arriv\w*|release[sd]?|preview|beta|rolls? out|rolling out|improv\w*|enhanc\w*|faster|expand\w*|redesign\w*|integrat\w*|now (?:available|in|on|supports?|lets?|can|works?|has|with|offers?|includes?|generally available))\b/i;

/**
 * Termékhír-szint: 2 = LLM-cég termékhíre · 1 = más cég új funkciója/modellje/fejlesztése · 0 = egyéb.
 * Kikapcsolt elsőbbségnél (HIR_ELSOBBSEG_BE) a hívók eleve nem nézik.
 */
export function termekSzint(forrasId, cim) {
  if (termekHirE(forrasId, cim)) return 2;
  const c = String(cim || '').trim();
  const f = String(forrasId || '');
  if (!c || !f || NEM_CEG_FORRAS.test(f)) return 0;
  if (NEM_TERMEK.test(c)) return 0;
  // A százalék nem modellverzió (mérve: „Why 36.6% of Your AI Time…” a Dropboxtól átment volna).
  const szazalekNelkul = c.replace(/\d+(?:[.,]\d+)?\s?%/g, ' ');
  return CEG_UJ_JEL.test(c) || TERMEK_BEMUTATO.test(c) || MODELL_VERZIO.test(szazalekNelkul) ? 1 : 0;
}

/** „Meet AWS Quick.” — termékbemutató a cím elején vagy mondat elején (nagybetűs név; a „Google Meet” NEM ez). */
const TERMEK_BEMUTATO = /(?:^|[.:!?]\s+)(?:Meet|Introducing)\s+[A-Z]/;

/**
 * Forrásonkénti olvasottság: az utolsó `napok` nap angol cikkoldal-látogatásai / a forrás publikált híreinek száma.
 * @param napokLog  traffic-log.json `days` ({ 'YYYY-MM-DD': [{path, visits}] })
 * @param hirek     [{ slug, forras }] — a publikált HÍREK (útmutató nélkül)
 * @returns { atlag: összátlag, forras: { [id]: { db, latogatas, atlag } } }
 */
export function forrasOlvasottsag(napokLog, hirek, napok = OLVASOTTSAG_NAPOK) {
  const latas = {};
  const nk = Object.keys(napokLog || {}).sort().slice(-napok);
  for (const d of nk) for (const s of (napokLog[d] || [])) {
    const m = /^\/article\/([^/?#]+)/.exec(s && s.path || '');
    if (m) latas[m[1]] = (latas[m[1]] || 0) + (Number(s.visits) || 0);
  }
  const forras = {}; let ossz = 0, db = 0;
  for (const h of hirek || []) {
    if (!h || !h.slug || !h.forras) continue;
    const v = latas[h.slug] || 0; ossz += v; db++;
    const f = (forras[h.forras] ||= { db: 0, latogatas: 0, atlag: 0 });
    f.db++; f.latogatas += v;
  }
  for (const f of Object.values(forras)) f.atlag = f.latogatas / f.db;
  return { atlag: db ? ossz / db : 0, forras };
}

/** A sorrendhez használt pontszám: kevés adatnál (<3 hír) az összátlag (semleges). */
export function forrasPont(olv, forrasId) {
  const f = olv && olv.forras && olv.forras[forrasId];
  return f && f.db >= MIN_HIR_A_MERESHEZ ? f.atlag : (olv ? olv.atlag : 0);
}

/**
 * Új sorrend: termékhír előre, utána forrás-olvasottság szerint csökkenőben; egyenlőnél a régi sorrend
 * (legfrissebb / trend) marad. `info(id)` → { forras, cim }.
 */
export function elsobbsegiSorrend(ids, info, olv) {
  if (!HIR_ELSOBBSEG_BE) return [...ids];
  const k = ids.map((id, i) => {
    const x = info(id) || {};
    return { id, i, termek: termekSzint(x.forras, x.cim), pont: forrasPont(olv, x.forras) };   // 11-10: 2/1/0 szint
  });
  k.sort((a, b) => (b.termek - a.termek) || (b.pont - a.pont) || (a.i - b.i));
  return k.map(x => x.id);
}

/**
 * A planWriteOrder az összevont csoportokat MINDIG előre tette — a rangsortól függetlenül. Itt minden egység
 * a legjobb helyen álló tagja szerinti helyre kerül (a sorrend = az elsobbsegiSorrend kimenete).
 */
export function tervRendez(terv, sorrend) {
  if (!HIR_ELSOBBSEG_BE) return terv;
  const rang = new Map(sorrend.map((id, i) => [id, i]));
  const legjobb = e => Math.min(...e.ids.map(id => (rang.has(id) ? rang.get(id) : Infinity)));
  return terv.map((e, i) => ({ e, i, r: legjobb(e) })).sort((a, b) => (a.r - b.r) || (a.i - b.i)).map(x => x.e);
}

/**
 * A megírandó egységek kiválogatása a tervből (planWriteOrder kimenete: [{ ids, theme }]).
 * n rendes hely (bármilyen hír) + extra hely CSAK termékhírnek; forrás-plafon a ma már publikáltakkal együtt.
 * @returns [{ ids, theme, termek, extra }]
 */
export function valogat(terv, { n = 0, extra = 0, info, maForrasDb = {} } = {}) {
  const lista = Array.isArray(terv) ? terv : [];
  if (!HIR_ELSOBBSEG_BE) return lista.slice(0, Math.max(0, n)).map(e => ({ ...e, termek: false, extra: false }));
  const hasznalt = { ...maForrasDb };
  const egyseg = lista.map(e => {
    const xs = e.ids.map(id => info(id) || {});
    // 11-10: a szint a csoport legjobb tagjáé; termékhír (extra helyre is mehet) = 1. vagy 2. szint.
    const szint = Math.max(0, ...xs.map(x => termekSzint(x.forras, x.cim)));
    return { e, forrasok: [...new Set(xs.map(x => x.forras).filter(Boolean))], termek: szint > 0, szint };
  });
  // Forrás-plafon: LLM-termékhírből 2/forrás/nap, minden másból (más cég újdonsága is) 1 — lásd termekSzint.
  const fer = u => u.forrasok.every(f => (hasznalt[f] || 0) < (u.szint === 2 ? TERMEK_FORRAS_NAPI_MAX : FORRAS_NAPI_MAX));
  const foglal = u => u.forrasok.forEach(f => { hasznalt[f] = (hasznalt[f] || 0) + 1; });
  const ki = [], vett = new Set();
  let rendes = 0, plusz = 0;
  for (const u of egyseg) {
    if (rendes >= n) break;
    if (!fer(u)) continue;
    foglal(u); vett.add(u); rendes++;
    ki.push({ ...u.e, termek: u.termek, extra: false });
  }
  for (const u of egyseg) {
    if (plusz >= extra) break;
    if (vett.has(u) || !u.termek || !fer(u)) continue;
    foglal(u); vett.add(u); plusz++;
    ki.push({ ...u.e, termek: true, extra: true });
  }
  return ki;
}

/** Ma még hány extra termékhír-hely van (a ma már extra helyen publikált / váró hírek levonva). */
export function termekExtraMaradek(maExtraDb) {
  if (!HIR_ELSOBBSEG_BE) return 0;
  const m = Number.isFinite(maExtraDb) && maExtraDb > 0 ? Math.floor(maExtraDb) : 0;
  return Math.max(0, TERMEK_EXTRA_NAPI - m);
}

/** Extra termékhír-helyen született-e (a _meta alapján)? */
export function termekExtraHir(meta) {
  return !!(meta && meta.termek_extra);
}
