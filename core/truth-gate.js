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
- invented model names or version numbers (e.g. "GPT-5.6", "CORTEX.GPT5_6")
- invented prices, discounts, percentages or plan claims stated as fact
- features attributed to a named tool that the tool does not have

DO NOT flag: general advice; example prompts the reader should type; honest hedged wording ("look for", "usually", "check the pricing page"); simplified but real flows; things you merely cannot verify. When unsure, let it pass — the quality reviewer already ran.

Respond ONLY with JSON:
{"credible": true/false, "problems": ["specific fabricated claim + why", ...], "confidence": 1-10}`;

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
  const body = String(markdown || '').slice(0, 14000);
  const response = await askFn(`${head}\n\n=== ARTICLE MARKDOWN ===\n${body}`, {
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
// A KAPU — { pass, hold, blockers, warnings, cost }
//   pass=false + hold=true  → piszkozat marad (AI nem elérhető)
//   pass=false + hold=false → rejected (kitaláltság)
// ---------------------------------------------------------------
export async function truthGate(writerData, { ask, fetcher = fetch } = {}) {
  const md = writerData.article_markdown || '';
  const meta = {
    title: (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || writerData.original_title,
    tool: writerData._meta?.tool, company: writerData._meta?.company, type: writerData._meta?.type
  };

  // 1. réteg: linkek ($0) — ha itt bukik, AI-t sem hívunk
  const links = await checkLinks(md, fetcher);
  if (links.blockers.length) return { pass: false, hold: false, blockers: links.blockers, warnings: links.warnings, cost: 0 };

  // 2. réteg: AI-bíró (paid-only lánc)
  const v = await aiTruthVerdict(md, meta, ask);
  if (v.error) return { pass: false, hold: true, blockers: [`AI-bíró nem elérhető (${v.error}) — visszatartva a következő futásig`], warnings: links.warnings, cost: v.cost };
  if (!v.credible) return { pass: false, hold: false, blockers: v.problems.length ? v.problems : ['Az AI-bíró kitalált állítást talált (részletek nélkül)'], warnings: links.warnings, cost: v.cost };
  return { pass: true, hold: false, blockers: [], warnings: links.warnings, cost: v.cost };
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
