// ===================================================================
// HITELESSÉG-KAPU (2026-07-16, user: "kéne ellenőrzés a hitelességre
// mielőtt publikálva lenne... ne legyen hallucináció")
//
// Az Ellenőrző UTOLSÓ szűrője a publikálás előtt. Két réteg:
//   1. LINK-VADÁSZ ($0): minden link élő próbája — halott domain / 404
//      = kitalált URL = BLOKK (a copilot.github.com esetet ez fogta volna)
//   2. AI-BÍRÓ (paid-only, config.agents.truth): kitalált felület / gomb /
//      modellnév / ár / kedvezmény vadászat. Konzervatív: csak akkor
//      blokkol, ha észszerűen biztos a kitaláltságban.
//
// AI-hiba esetén HOLD: a piszkozat MARAD (következő futás újrapróbálja) —
// ellenőrizetlenül semmi nem megy ki, de beragadni sem tud örökre.
// Spec: docs/superpowers/specs/2026-07-16-hitelesseg-kapu-design.md
// ===================================================================

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOG_PATH = join(ROOT, 'memory', 'truth-gate-log.json');

const PROBE_TIMEOUT_MS = 8000;
const MAX_PROBES = 8;           // linkpróba-plafon cikkenként (költség: $0, de idő)
// Saját + nyilvánvalóan mindig-élő domainek: próbát sem érdemelnek
const SKIP_HOSTS_RX = /(^|\.)aiworldhq\.com$|(^|\.)aiworldco\.pages\.dev$|^localhost$/i;

// ---------------------------------------------------------------
// LINK-KIGYŰJTÉS — kódblokkokon KÍVÜLI http(s) linkek, dedupolva.
// A 💬 példa-blokkok (```text ... ```) szándékosan kimaradnak: ott
// gyakran szemléltető szöveg van, nem kattintható ígéret.
// ---------------------------------------------------------------
export function extractLinks(markdown) {
  const noCode = String(markdown || '').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  const found = new Set();
  for (const m of noCode.matchAll(/https?:\/\/[^\s)\]"'<>]+/gi)) {
    let url = m[0].replace(/[.,;:!?]+$/, '');
    try {
      const u = new URL(url);
      if (SKIP_HOSTS_RX.test(u.hostname)) continue;
      found.add(u.href);
    } catch { /* csonka URL — a bíró dolga, nem a próbáé */ }
  }
  return [...found].slice(0, MAX_PROBES);
}

// ---------------------------------------------------------------
// EGY link élő próbája. Osztályozás:
//   dead = DNS/kapcsolat-hiba VAGY 404/410  → blokk-ok
//   warn = időtúllépés VAGY 5xx             → nem blokkolunk (beteg szerver)
//   ok   = minden más (200-3xx, 403/405/429 = bot-védelem, átengedjük)
// ---------------------------------------------------------------
export async function probeUrl(url, fetcher = fetch) {
  const attempt = async (method) => fetcher(url, {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIWorldHQ-linkcheck/1.0)' }
  });
  try {
    let r = await attempt('HEAD');
    // Némely szerver HEAD-re 404/405-öt ad, GET-re jót — másodvélemény
    if (r.status === 404 || r.status === 405) r = await attempt('GET');
    if (r.status === 404 || r.status === 410) return { url, status: 'dead', detail: `HTTP ${r.status}` };
    if (r.status >= 500) return { url, status: 'warn', detail: `HTTP ${r.status}` };
    return { url, status: 'ok', detail: `HTTP ${r.status}` };
  } catch (e) {
    const msg = String(e?.cause?.code || e?.name || e?.message || e);
    if (/Timeout|Abort/i.test(msg)) return { url, status: 'warn', detail: 'időtúllépés' };
    return { url, status: 'dead', detail: msg.slice(0, 60) };
  }
}

export async function checkLinks(markdown, fetcher = fetch) {
  const links = extractLinks(markdown);
  const blockers = [], warnings = [];
  const results = await Promise.all(links.map(u => probeUrl(u, fetcher)));
  for (const r of results) {
    if (r.status === 'dead') blockers.push(`Halott/kitalált link: ${r.url} (${r.detail})`);
    else if (r.status === 'warn') warnings.push(`Bizonytalan link (nem blokkol): ${r.url} (${r.detail})`);
  }
  return { blockers, warnings, probed: links.length };
}

// ---------------------------------------------------------------
// AI-BÍRÓ — CSAK kitaláltság-vadászat (a minőség az Ellenőrző dolga).
// ---------------------------------------------------------------
const JUDGE_SYSTEM = `You are the pre-publication TRUTH GATE of AI World Co. Your ONLY job: catch FABRICATED specifics before they reach readers.

FLAG (credible=false) only these, and only when you are reasonably sure:
- UI elements/buttons/menus/pages described for a named product that do not exist (e.g. a self-serve "Purchase Reserved Capacity" button, a "Rewrite tool" with style dropdowns)
- invented or wrong URLs / domains
- invented model names or version numbers (e.g. "GPT-5.6", "CORTEX.GPT5_6") — EXCEPT names and versions that appear in the SOURCE block: those come from the publisher's own official announcement and are real, even if they are newer than your training data
- invented prices, discounts, percentages or plan claims stated as fact
- features attributed to a named tool that the tool does not have

DO NOT flag: general advice; example prompts the reader should type; honest hedged wording ("look for", "usually", "check the pricing page"); simplified but real flows; things you merely cannot verify. When unsure, let it pass — the quality reviewer already ran.

VERIFIED-REAL product & company names are supplied to you below. NEVER flag the mere existence of a name on that list as invented, even if it looks new to you (e.g. recently launched products) — your training may predate it. You MAY still flag invented features, URLs, prices or UI attributed to those products.

OUTPUT DISCIPLINE (2026-08-03 — a real failure): "problems" must contain ONLY the fabrications you are actually flagging. Do NOT narrate your checking process, do NOT list items you examined and found acceptable, and do NOT include phrases like "this is fine", "no problem there" or "wait, let me re-check". If, after checking, you are flagging nothing, return credible=true with an EMPTY problems array. A previous verdict listed a full self-check that concluded "No invented specific features" — yet still returned credible=false, which sent a correct article back for a pointless paid rewrite.

"confidence" = how sure you are that the flagged items are REAL fabrications (1 = guessing, 10 = certain).

Respond ONLY with JSON:
{"credible": true/false, "problems": ["specific fabricated claim + why", ...], "confidence": 1-10}`;

// A projekt ELLENŐRZÖTT terméknév-listája (website/tool-links.json) — ezt
// átadjuk a bírónak, hogy a friss, valós termékeket (pl. Alexa+, 2025.02.)
// NE minősítse kitaláltnak a saját, elavuló tudása alapján (2026-07-17
// tanulság: a Gemini "Alexa+ is invented"-et írt egy valós termékre).
let _knownNamesCache = null;
export function knownRealNames() {
  if (_knownNamesCache) return _knownNamesCache;
  try {
    const tl = JSON.parse(readFileSync(join(ROOT, 'website', 'tool-links.json'), 'utf-8'));
    const names = new Set([...Object.keys(tl.tools || {}), ...Object.keys(tl.companies || {})]);
    _knownNamesCache = [...names].filter(Boolean).sort();
  } catch { _knownNamesCache = []; }
  return _knownNamesCache;
}

function parseVerdict(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s !== -1 && e > s) t = t.slice(s, e + 1);
  const j = JSON.parse(t);
  if (typeof j.credible !== 'boolean') throw new Error('credible mező hiányzik');
  return { credible: j.credible, problems: Array.isArray(j.problems) ? j.problems.slice(0, 5) : [], confidence: j.confidence ?? null };
}

export async function aiTruthVerdict(markdown, meta = {}, askFn) {
  const head = `Title: ${meta.title || ''}\nTool: ${meta.tool || '-'} | Company: ${meta.company || '-'} | Type: ${meta.type || 'news'}`;
  const known = (meta.knownNames || knownRealNames());
  const knownBlock = known.length ? `\n\n=== VERIFIED-REAL NAMES (do NOT flag their existence as invented) ===\n${known.join(', ')}` : '';
  // ⚠️ A FORRÁS NÉLKÜL A BÍRÓ A SAJÁT, ELAVULT TUDÁSÁHOZ MÉR (2026-09-23).
  // A „Claude Opus 5.5 is now available on AWS" hírt az AWS HIVATALOS
  // blogjáról azzal blokkolta, hogy „a tudásom 2026 januárjáig tart, ott az
  // Opus 4.1 a legújabb" — az átdolgozás pedig KIVETTE a modell nevét a
  // cikkből. 14 nap alatt 15 blokk szólt így („nem ismerem"), jellemzően a
  // cég SAJÁT blogjáról jött hírre. A bíró eddig nem tudta, honnan jött a
  // hír, és milyen nap van ma.
  // ⚠️ CSAK VALÓDI KÜLSŐ FORRÁS-URL MELLETT. Az útmutatónak is van
  // `original_title`-je (a TÉMÁJA), de az nem hivatalos bejelentés — ha
  // annak mutatnánk be, a bíró a mi saját témacímünket hinné forrásnak.
  const forrasBlock = /^https?:\/\//i.test(meta.sourceUrl || '')
    ? `\n\n=== SOURCE (the official announcement this article rewrites) ===\nPublisher: ${meta.sourceName || '-'}\nOriginal headline: ${meta.originalTitle || '-'}\nURL: ${meta.sourceUrl || '-'}\nToday's date: ${meta.today || new Date().toISOString().slice(0, 10)}\nThis source is NEWER than your training data. Names, models, products and version numbers that appear in the original headline or the URL are REAL — never flag them as invented. Flag only specifics the article ADDS that the source does not support.`
    : '';
  const body = String(markdown || '').slice(0, 14000);
  const response = await askFn(`${head}${knownBlock}${forrasBlock}\n\n=== ARTICLE MARKDOWN ===\n${body}`, {
    agentName: 'truth',
    systemPrompt: JUDGE_SYSTEM,
    maxTokens: 6000,          // Gemini gondolkodási tokenjei is ebből fogynak!
    jsonMode: true
  });
  if (!response?.text) return { error: 'nincs AI-válasz', cost: response?.costUsd || 0 };
  try { return { ...parseVerdict(response.text), cost: response.costUsd || 0 }; }
  catch (e) { return { error: 'érthetetlen AI-válasz: ' + e.message.slice(0, 60), cost: response.costUsd || 0 }; }
}

// ---------------------------------------------------------------
// FORRÁS-VISSZAIGAZOLÁS ($0) — a bíró „nem létezik" kifogása a HIVATALOS
// forrás saját címével szemben nem áll meg.
//
// A prompt önmagában nem garancia: a modell a forrás-blokkot is figyelmen
// kívül hagyhatja. Ezért a döntés UTÁN egy gépi szűrő elveti azt a
// kifogást, amelyik:
//   (a) csak LÉTEZÉST vitat („invented", „does not exist", „no such"…),
//   (b) minden idézett neve szó szerint szerepel a forrás címében vagy
//       az URL-jében, és
//   (c) nem említ árat, százalékot vagy linket.
// ⚠️ A (c) nélkül egy valódi kitalációt is elengedne: „'Claude Opus 5.5'
// costs $3" — a név a címben van, de a kifogás az ÁRRÓL szól.
// ⚠️ Minden idézett névnek egyeznie kell: „'Gemini' has no 'Rewrite'
// button" a Gemini-t idézi (címben van), de a 'Rewrite'-ot nem → marad.
// ---------------------------------------------------------------
const LETEZES_RX = /invented|fabricat|does not exist|doesn't exist|no (?:such|known|verified|recogni[sz]ed|confirmed|published)|not (?:a )?(?:real|recogni[sz]ed|known|verified)|training|not aware|made[- ]up|no evidence|does not match any/i;
const ARAS_RX = /\$|€|£|\d\s*%|percent|price|pricing|cost|https?:\/\//i;
// ⚠️ FELÜLETRŐL SZÓLÓ KIFOGÁST SOHA NEM ENGEDÜNK EL. A kalibráláskor a
// szűrő elengedett volna egy jogos blokkot: az útmutató egy nem létező
// „Summarize" menüpontot írt le a Safariban, és mivel a „Summarize" szó a
// témacímben is szerepelt, a név-egyezés „visszaigazolta". A kitalált
// gomb/menü a kapu legfontosabb fogása — ezt a forrás címe nem igazolja.
const FELULET_RX = /\b(?:button|menu|option|icon|tab|panel|toggle|dropdown|settings?|screen|UI|click|tap|step \d|sidebar|toolbar|label(?:ed|led)?)\b/i;

/** kisbetű, csak betű/szám, szóközzel elválasztva — „Opus 5.5" ≡ „opus-5-5" */
const norm = s => ' ' + String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';

/** A kifogásban idézett nevek. Az aposztróf a szó közepén („Anthropic's") nem idézőjel. */
function idezettNevek(szoveg) {
  const ki = [];
  for (const m of String(szoveg).matchAll(/(?<![\p{L}\p{N}])['‘"“]([^'’"”\n]{2,60})['’"”](?![\p{L}\p{N}])/gu)) ki.push(m[1].trim());
  return ki.filter(x => /[\p{L}\p{N}]/u.test(x));
}

export function forrasVisszaigazol(problems, { originalTitle = '', sourceUrl = '' } = {}) {
  // Külső forrás-URL nélkül (útmutató) SEMMIT nem igazolunk vissza: az
  // útmutató `original_title`-je a saját témánk, nem hivatalos bejelentés.
  if (!/^https?:\/\//i.test(sourceUrl || '')) return { maradt: [...(problems || [])], elvetett: [] };
  let urlResz = '';
  try { urlResz = new URL(sourceUrl).pathname; } catch { urlResz = ''; }
  const forras = norm(originalTitle + ' ' + urlResz);
  const maradt = [], elvetett = [];
  for (const p of problems || []) {
    const nevek = idezettNevek(p);
    const mindForrasban = nevek.length > 0 && nevek.every(n => forras.includes(norm(n)));
    if (mindForrasban && LETEZES_RX.test(p) && !ARAS_RX.test(p) && !FELULET_RX.test(p)) elvetett.push(p);
    else maradt.push(p);
  }
  return { maradt, elvetett };
}

// ---------------------------------------------------------------
// A KAPU — { pass, hold, blockers, warnings, cost }
//   pass=false + hold=true  → piszkozat marad (AI nem elérhető)
//   pass=false + hold=false → rejected (kitaláltság)
// ---------------------------------------------------------------
export async function truthGate(writerData, { ask, fetcher = fetch } = {}) {
  const md = writerData.article_markdown || '';
  const meta = {
    title: (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || writerData.original_title,
    tool: writerData._meta?.tool, company: writerData._meta?.company, type: writerData._meta?.type,
    // a hivatalos forrás — az útmutatónak nincs, ott ezek üresek
    originalTitle: writerData.original_title || '',
    sourceName: writerData._meta?.source_name || '',
    sourceUrl: writerData._meta?.source_link || (writerData._meta?.source_links || [])[0] || '',
    today: new Date().toISOString().slice(0, 10)
  };

  // 1. réteg: linkek ($0) — ha itt bukik, AI-t sem hívunk
  const links = await checkLinks(md, fetcher);
  if (links.blockers.length) return { pass: false, hold: false, blockers: links.blockers, warnings: links.warnings, cost: 0 };

  // 2. réteg: AI-bíró (paid-only lánc)
  const v = await aiTruthVerdict(md, meta, ask);
  if (v.error) return { pass: false, hold: true, blockers: [`AI-bíró nem elérhető (${v.error}) — visszatartva a következő futásig`], warnings: links.warnings, cost: v.cost };
  // A `confidence` MOST CSAK MÉRÉS (2026-08-03). A bíró régóta visszaadja, de a
  // döntés eddig nem használta. Küszöböt SZÁNDÉKOSAN nem vezetünk be adat
  // nélkül: előbb naplózzuk pár napig, és ha kiderül, hogy az alacsony
  // magabiztosságú blokkolások a téves riasztások, AKKOR lesz küszöb.
  // (Vakon beállított küszöb valódi kitalációkat engedne ki.)
  if (!v.credible) {
    const { maradt, elvetett } = forrasVisszaigazol(v.problems, meta);
    if (v.problems.length && !maradt.length) {
      return { pass: true, hold: false, blockers: [], cost: v.cost, confidence: v.confidence, overridden: elvetett,
        warnings: [...links.warnings, `A bíró ${elvetett.length} kifogását felülbíráltuk: a név a hivatalos forrás címében szerepel (${meta.sourceName || meta.sourceUrl})`] };
    }
    return { pass: false, hold: false, blockers: maradt.length ? maradt : ['Az AI-bíró kitalált állítást talált (részletek nélkül)'], warnings: links.warnings, cost: v.cost, confidence: v.confidence };
  }
  return { pass: true, hold: false, blockers: [], warnings: links.warnings, cost: v.cost, confidence: v.confidence };
}

// ---------------------------------------------------------------
// NAPLÓ — nap-kulcsos, 14 nap retenció (quality-fix-log mintája);
// a napi Telegram-riport ebből írja a 🛡️ sort.
// ---------------------------------------------------------------
export function logGate(entry) {
  let log = {};
  try { log = JSON.parse(readFileSync(LOG_PATH, 'utf-8')); } catch { /* első futás */ }
  const day = new Date().toISOString().slice(0, 10);
  log[day] = [...(log[day] || []), { at: new Date().toISOString(), ...entry }];
  const keep = Object.keys(log).sort().slice(-14);
  try { writeFileSync(LOG_PATH, JSON.stringify(Object.fromEntries(keep.map(k => [k, log[k]])), null, 2), 'utf-8'); } catch { /* napló-hiba nem állít meg */ }
}
