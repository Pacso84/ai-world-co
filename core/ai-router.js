// ===================================================================
// AI ROUTER — A multi-provider agy
// ===================================================================
//
// CÉL:
//   Az agentek nem közvetlenül hívják a Claude/Gemini/Groq API-t.
//   Helyette EZT a routert hívják: ai.ask(prompt, options)
//   A router dönti el melyik szolgáltatóhoz menjen, fallback-eli ha
//   elesik, és logolja a költséget.
//
// HASZNÁLAT (agentekben):
//   import { ask } from '../core/ai-router.js';
//   const response = await ask("Mi a fővárosa Ausztráliának?", {
//     agentName: "rss-scraper"
//   });
//
// MARVEEN-INSPIRÁCIÓ:
//   - Safety filter a válaszra (AUP block check)
//   - Tool restrictions (csak ami kell)
//   - Event-driven response handling
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';

import { recordSpend, meteredBlocked, isMetered } from './budget.js';

// ===================================================================
// KONFIG BETÖLTÉS
// ===================================================================
const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8'));

// ===================================================================
// PROVIDER KLIENSEK (lazy init — csak ha van API kulcs)
// ===================================================================
const clients = {
  anthropic: null,
  google: null,
  groq: null
};

function getClient(provider) {
  if (clients[provider]) return clients[provider];

  switch (provider) {
    case 'anthropic':
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY nincs a .env fájlban!');
      }
      clients.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      break;

    case 'google':
      if (!process.env.GOOGLE_API_KEY) {
        throw new Error('GOOGLE_API_KEY nincs a .env fájlban!');
      }
      clients.google = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
      break;

    case 'groq':
      if (!process.env.GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY nincs a .env fájlban!');
      }
      clients.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      break;

    default:
      throw new Error(`Ismeretlen provider: ${provider}`);
  }

  return clients[provider];
}

// ===================================================================
// EMBEDDING (szemantikus memóriához) — Gemini text-embedding-004, INGYEN
// ===================================================================
// Egy szám-vektort ad vissza a szöveghez, vagy null-t ha nem sikerült
// (nincs Google kulcs / hiba). A hívó ilyenkor kulcsszó-keresésre eshet vissza.
export async function embedText(text) {
  const t = (text || '').trim();
  if (!t || !process.env.GOOGLE_API_KEY) return null;
  try {
    const client = getClient('google');
    const resp = await client.models.embedContent({
      model: 'gemini-embedding-001',
      contents: t.slice(0, 2000),
      config: { outputDimensionality: 768 }
    });
    const v = resp?.embeddings?.[0]?.values || resp?.embedding?.values || null;
    return Array.isArray(v) && v.length ? v : null;
  } catch {
    return null;
  }
}

// ===================================================================
// PROVIDER-SPECIFIKUS HÍVÓK
// ===================================================================

async function callAnthropic(prompt, model, options) {
  const client = getClient('anthropic');
  const response = await client.messages.create({
    model: model,
    max_tokens: options.maxTokens || 2048,
    system: options.systemPrompt || 'You are a helpful assistant.',
    messages: [{ role: 'user', content: prompt }]
  });

  return {
    text: response.content[0]?.text || '',
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens
    },
    model: model,
    provider: 'anthropic'
  };
}

async function callGoogle(prompt, model, options) {
  const client = getClient('google');
  const genConfig = {
    systemInstruction: options.systemPrompt || 'You are a helpful assistant.',
    maxOutputTokens: options.maxTokens || 2048
  };
  // JSON-mód: garantáltan érvényes JSON kimenet (strukturált válaszhoz)
  if (options.jsonMode) {
    genConfig.responseMimeType = 'application/json';
  }
  const response = await client.models.generateContent({
    model: model,
    contents: prompt,
    config: genConfig
  });

  return {
    text: response.text || '',
    usage: {
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      // FONTOS (2026-07-07): a GONDOLKODÁSI tokenek (thoughtsTokenCount) is
      // válasz-áron számlázódnak! Nélkülük a mérő ~2.7x alulmért ($5.19 vs
      // a Google valós $14.21-e). A költség-számításba mindkettő kell.
      outputTokens: (response.usageMetadata?.candidatesTokenCount || 0)
                  + (response.usageMetadata?.thoughtsTokenCount || 0)
    },
    model: model,
    provider: 'google'
  };
}

async function callGroq(prompt, model, options) {
  const client = getClient('groq');
  const response = await client.chat.completions.create({
    model: model,
    max_tokens: options.maxTokens || 2048,
    messages: [
      { role: 'system', content: options.systemPrompt || 'You are a helpful assistant.' },
      { role: 'user', content: prompt }
    ]
  });

  return {
    text: response.choices[0]?.message?.content || '',
    usage: {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens
    },
    model: model,
    provider: 'groq'
  };
}

// ===================================================================
// OPENAI-KOMPATIBILIS PROVIDEREK (Cerebras, OpenRouter, Mistral)
// ===================================================================
// Mindegyik ugyanazt a /chat/completions formátumot használja, csak
// más URL + kulcs. Egy közös caller-gyár fedi le mindet (fetch-csel,
// SDK nélkül).
// ===================================================================

// KÜLÖN, tiszta függvény (tesztelhető): a kérés-törzs összeállítása
export function buildOpenAIBody(provider, model, prompt, options) {
  const body = {
    model,
    max_tokens: options.maxTokens || 2048,
    messages: [
      { role: 'system', content: options.systemPrompt || 'You are a helpful assistant.' },
      { role: 'user', content: prompt }
    ]
  };
  if (options.jsonMode) body.response_format = { type: 'json_object' };
  // VALÓDI költség kérése (2026-07-22 audit): az OpenRouter normalizált token-számot
  // ad vissza, a SZÁMLÁZÁS viszont a saját tokenizálóján és a gondolkodó-tokeneken
  // alapul → a helyi ár-táblás becslés ~18%-kal alámérte a tényleges költést.
  // Ezzel a kapcsolóval a válasz tartalmazza a ténylegesen felszámolt USD-t.
  if (provider === 'openrouter') body.usage = { include: true };
  // GONDOLKODÁS KI a mechanikus feladatoknál (2026-07-23): a MiniMax M3 a
  // FORDÍTÁS előtt is 8-12 000 karakternyi belső gondolkodást termelt, amit
  // ugyanúgy legenerál (idő) és kiszámláz (pénz). Éles A/B ugyanazon a cikken:
  //   alap:          4736 tok, $0.0123
  //   enabled:false: 1741 tok, $0.0025 (20%!) — a fordítás minősége UGYANOLYAN.
  // Ez volt a fő oka, hogy a pipeline-lépés 10-22 percről 57 percre lassult
  // (a futásidő ≈ kimenő tokenek / ~65 tok/mp). CSAK openrouteren küldjük
  // (ott dokumentált a paraméter); a minőség-kritikus írás/bírálat agenteknél
  // NEM kapcsoljuk ki — ott a gondolkodás minőséget vesz, nem időt éget.
  if (options.reasoningOff && provider === 'openrouter') body.reasoning = { enabled: false };
  return body;
}

// BERAGADÁS-VÉDELEM (2026-07-23): eddig EGYIK hívásnak sem volt időkorlátja —
// egy néma hálózati beragadás a teljes CI-futást megölhette (a 60 perces
// job-plafonig állt). A leghosszabb JOGOS hívás 377 mp volt → 8 perc bőven elég.
const AI_CALL_TIMEOUT_MS = 8 * 60 * 1000;

function makeOpenAICaller({ provider, baseUrl, keyEnv, extraHeaders }) {
  return async function (prompt, model, options) {
    const key = process.env[keyEnv];
    if (!key) throw new Error(`${keyEnv} nincs a .env fájlban!`);

    const body = buildOpenAIBody(provider, model, prompt, options);

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(extraHeaders || {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_CALL_TIMEOUT_MS)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${provider} HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const j = await res.json();
    // actualCostUsd: ha a szolgáltató megmondja a TÉNYLEGES árat, azt használjuk
    // (mérvadó), különben marad a helyi ár-táblás becslés.
    const actual = Number(j.usage?.cost);
    const choice = j.choices?.[0] || {};
    return {
      text: choice.message?.content || '',
      usage: { inputTokens: j.usage?.prompt_tokens || 0, outputTokens: j.usage?.completion_tokens || 0 },
      actualCostUsd: Number.isFinite(actual) && actual > 0 ? actual : null,
      // ÜRES-VÁLASZ DIAGNOSZTIKA (2026-08-04): eddig CSAK annyit tudtunk, hogy
      // "Üres válasz" — sem azt, hogy elvágta-e a keret, sem azt, hogy a
      // szöveg a gondolkodó-csatornába ment-e. Egy napi ellenőrzés emiatt
      // vakon keresgélt. Élesben elkapott minta: content 0 kar, reasoning
      // 5200 kar, finish_reason "length" → a modell végig gondolkodott.
      finishReason: choice.finish_reason || null,
      reasoningChars: (choice.message?.reasoning || '').length,
      reasoningTokens: j.usage?.completion_tokens_details?.reasoning_tokens ?? null,
      model, provider
    };
  };
}

const callCerebras = makeOpenAICaller({ provider: 'cerebras', baseUrl: 'https://api.cerebras.ai/v1/chat/completions', keyEnv: 'CEREBRAS_API_KEY' });
const callOpenRouter = makeOpenAICaller({ provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1/chat/completions', keyEnv: 'OPENROUTER_API_KEY', extraHeaders: { 'HTTP-Referer': 'https://aiworld.co', 'X-Title': 'AI World Co.' } });
const callMistral = makeOpenAICaller({ provider: 'mistral', baseUrl: 'https://api.mistral.ai/v1/chat/completions', keyEnv: 'MISTRAL_API_KEY' });
// Új, OpenAI-kompatibilis gyártók (a kulcs hiányában tisztán továbblép a router)
const callDeepSeek = makeOpenAICaller({ provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1/chat/completions', keyEnv: 'DEEPSEEK_API_KEY' });
const callPerplexity = makeOpenAICaller({ provider: 'perplexity', baseUrl: 'https://api.perplexity.ai/chat/completions', keyEnv: 'PERPLEXITY_API_KEY' });

// Provider -> hívó függvény map
const providerCallers = {
  anthropic: callAnthropic,
  google: callGoogle,
  groq: callGroq,
  cerebras: callCerebras,
  openrouter: callOpenRouter,
  mistral: callMistral,
  deepseek: callDeepSeek,
  perplexity: callPerplexity
};

// ===================================================================
// SAFETY FILTER (Marveen-inspiráció)
// ===================================================================
// Ellenőrzi hogy a válasz nem-e blokkolt vagy hibás.
// Ha NULL-t ad vissza, az hívó tudja: a tartalom nem használható.
// ===================================================================

function safetyFilter(response) {
  if (!response.text || response.text.trim().length === 0) {
    return { safe: false, reason: 'Üres válasz' };
  }

  const blockedPhrases = [
    "I can't help with",
    "I cannot provide",
    "I'm not able to",
    "I cannot assist",
    "This request violates"
  ];

  const lowerText = response.text.toLowerCase();
  for (const phrase of blockedPhrases) {
    if (lowerText.includes(phrase.toLowerCase())) {
      return { safe: false, reason: `Tartalom-szabály blokk: "${phrase}"` };
    }
  }

  return { safe: true };
}

// ===================================================================
// KÖLTSÉG SZÁMÍTÁS (közelítés)
// ===================================================================
// Modell -> ár per 1M token (input/output USD)
// ===================================================================

const PRICING = {
  // Anthropic (2026-07 árak)
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-opus-4-8': { input: 5.0, output: 25.0 },
  // MiniMax az OpenRouteren (2026-07-15, user kérése): a FŐNÖKI körös
  // újraírások erős modellje — olcsóbb kimenet, mint a gemini-2.5-flash.
  // MODELL-TIERING (2026-07-24, user): minden agent fizetős, MiniMax-tiering.
  // M3=csúcs (író/útmutató/bíró-szintű), M2.7=erős-olcsóbb, M2.5=költség-optimum
  // (gépies, gondolkodás ki). Élőben ellenőrzött árak az OpenRouter API-ból.
  'minimax/minimax-m3': { input: 0.30, output: 1.20 },
  'minimax/minimax-m2.7': { input: 0.25, output: 1.00 },
  'minimax/minimax-m2.5': { input: 0.15, output: 0.90 },
  // Google — PAID TIER (2026-07-02-től számlázva!). FIGYELEM:
  // a 'gemini-flash-latest' alias a 3.5 Flash-re mutat = 5x drágább a 2.5-nél!
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-flash-latest': { input: 1.50, output: 9.00 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  // Groq (INGYENES a free tier-ig!)
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  // Cerebras / OpenRouter / Mistral (ingyenes tier-en ~0)
  'gpt-oss-120b': { input: 0, output: 0 },
  'zai-glm-4.7': { input: 0, output: 0 },
  'llama-3.3-70b': { input: 0, output: 0 },
  'deepseek/deepseek-chat:free': { input: 0, output: 0 },
  'meta-llama/llama-3.3-70b-instruct:free': { input: 0, output: 0 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'sonar': { input: 1.0, output: 1.0 },
  'mistral-small-latest': { input: 0.20, output: 0.60 },
  'mistral-large-latest': { input: 2.0, output: 6.0 }
};

function calculateCost(model, usage) {
  const prices = PRICING[model];
  if (!prices) return 0;
  return (usage.inputTokens * prices.input + usage.outputTokens * prices.output) / 1_000_000;
}

// ===================================================================
// LOGOLÁS
// ===================================================================

function logCall(agentName, provider, model, usage, costUsd, success, error = null) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    agent: agentName,
    provider,
    model,
    inputTokens: usage?.inputTokens || 0,
    outputTokens: usage?.outputTokens || 0,
    costUsd: costUsd.toFixed(6),
    success,
    error: error?.message || null
  };
  // Egyszerű console log most — később fájlba is logolhatunk
  const icon = success ? '✅' : '❌';
  console.log(`${icon} [${agentName}] ${provider}/${model} - ${entry.inputTokens}+${entry.outputTokens} tok - $${entry.costUsd}${error ? ' ERROR: ' + error.message : ''}`);
}

// ===================================================================
// RETRY SEGÉDEK
// ===================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Átmeneti hiba? (érdemes ugyanazt a modellt újrapróbálni)
// 503/500/502/504 = szerver túlterhelt; hálózati hibák; "overloaded"
// NEM átmeneti: 429 (kvóta - inkább fallback), 401/403 (auth)
function isTransientError(error) {
  const msg = (error?.message || '').toLowerCase();
  const transientSignals = [
    '503', '500', '502', '504',
    'unavailable', 'overloaded', 'high demand', 'try again',
    'timeout', 'etimedout', 'econnreset', 'enotfound', 'socket hang up',
    'fetch failed', 'network'
  ];
  return transientSignals.some(s => msg.includes(s));
}

const MAX_TRANSIENT_RETRIES = 2;   // ugyanazon a modellen
const RETRY_BASE_DELAY_MS = 1000;  // 1s, majd 2s (exponenciális)

// ===================================================================
// KVÓTA-TUDATOS ROUTING (a "főnök" automatikusan átirányít)
// ===================================================================
// Ha egy modell napi kvótája elfogy (429), megjegyezzük meddig, és
// kihagyjuk — átirányítunk egy másik szabad modellre.
// ===================================================================

const QUOTA_PATH = join(__dirname, 'quota-state.json');

// ===================================================================
// KÉT POOL — INGYENES vs FIZETŐS (user-stratégia 2026-07-05):
// "Előbb az ingyenes kulcsok dolgozzanak; ha kimerültek, jöjjön a fizetős.
//  KIVÉTEL az Ellenőrző, a Főnök és a Fordító — ott csak a fizetős megy,
//  mert a minőség-kapun és a te asszisztenseden nem spórolunk."
// A stratégiát a config.json agents.<név>.routing mező adja:
//   'free-first' (alapértelmezés) | 'paid-only'
// ===================================================================

// VALÓBAN ingyenes szolgáltatók (free-tier kulcsok; kulcs hiányában kimarad)
// MINŐSÉG-ELŐSZÖR (2026-07-15, user): erős-ingyenesek elöl; a mistral-small
// KIKERÜLT (formátum-romboló volt a rework-ben — gyenge modell tartalmat nem érinthet).
// KÍNAI ERŐSÍTÉS (2026-07-15, user): GLM-4.7 a Cerebrason (Zhipu csúcsmodell,
// $0, JSON-módban is tesztelve) + Qwen3-Next-80B az OpenRouteren.
const FREE_TIER_POOL = [
  { provider: 'cerebras', model: 'gpt-oss-120b' },
  { provider: 'cerebras', model: 'zai-glm-4.7' },
  // 2026-07-22 audit: innen KIVÉVE a 'qwen/qwen3-next-80b-a3b-instruct:free' —
  // az OpenRouteren NEM LÉTEZIK (élőben ellenőrizve: csak a fizetős változat van),
  // így minden hívás felesleges 404-kör volt. Marad 3 VALÓDI ingyenes szolgáltató
  // (Cerebras ×2 + Groq), ami két különböző cég = elég szolgáltató-szintű tartalék.
  { provider: 'groq', model: 'llama-3.3-70b-versatile' }
];

// FIZETŐS pool (Google paid tier) — olcsó-megbízható elöl, a DRÁGA
// 'flash-latest' (3.5 Flash, 5x ár!) és a Pro a végén, végső tartaléknak.
// MINŐSÉG-ELŐSZÖR (2026-07-15, user): a gemini-2.0-flash (gyenge) és a
// gemini-flash-latest (5x ár-CSAPDA) kikerült; MiniMax M3 a 2. erős láncszem.
// Fizetős vég-tartalék. 2026-07-22 (user-döntés: "nem fizetek a Geminiért, csak
// ingyeneset"): a két fizetős Gemini KIVÉVE — csak a MiniMax marad fizetős, minden
// más tartalék az ingyenes készletből jön (FREE_TIER_POOL). A Google-egyenleg úgyis
// elfogyott; így egy hívás sem próbál fizetős Geminit.
const PAID_POOL = [
  { provider: 'openrouter', model: 'minimax/minimax-m3' }
];

function loadQuota() {
  if (!existsSync(QUOTA_PATH)) return {};
  try { return JSON.parse(readFileSync(QUOTA_PATH, 'utf-8')); } catch { return {}; }
}
function saveQuota(q) {
  try { writeFileSync(QUOTA_PATH, JSON.stringify(q, null, 2), 'utf-8'); } catch { /* ignore */ }
}
function isExhausted(model) {
  const q = loadQuota();
  return q[model] && new Date(q[model].until) > new Date();
}
function markExhausted(model, daily) {
  const q = loadQuota();
  let until;
  if (daily) {
    // napi kvóta: holnap reggelig kihagyjuk (helyi éjfél után)
    const d = new Date(); d.setHours(24, 5, 0, 0); until = d.toISOString();
  } else {
    // perces limit: 5 perc
    until = new Date(Date.now() + 5 * 60000).toISOString();
  }
  q[model] = { until, daily: !!daily, marked: new Date().toISOString() };
  saveQuota(q);
  console.log(`   🚦 Kvóta kimerült: ${model} → kihagyom ${daily ? 'ma estig' : '5 percig'} (átirányítás másik modellre)`);
}
// 429 = kvóta. PerDay = napi kimerülés; egyébként perces limit.
function isQuotaError(error) {
  const m = (error?.message || '').toLowerCase();
  return m.includes('429') || m.includes('resource_exhausted') || m.includes('quota')
    // 2026-07-21: az OpenRouter a kifogyott egyenleget 402-vel jelzi, a Google
    // "prepayment credits are depleted"-tel. Enélkül NEM jegyeztük meg kimerültként,
    // és minden további hívás újra nekifutott (felesleges körök + néma minőség-esés).
    || m.includes('402') || m.includes('insufficient credit') || m.includes('credits are depleted');
}

// Gondolkodó (reasoning) modellek — ezeknek token-padló kell, különben üres válasz.
function isThinkingModel(model) {
  const m = String(model || '').toLowerCase();
  return m.includes('zai-glm') || m.includes('minimax');
}
// Melyik modell TUDJA kikapcsolni a gondolkodást? CSAK az M3 — az M2.5/M2.7
// HTTP 400-zal ("Reasoning is mandatory") utasítja el (2026-07-24 mérés).
function canDisableReasoning(model) {
  return /minimax-m3/i.test(String(model || ''));
}

// KIMENETI KERET — KÜLÖN, tiszta függvény (tesztelhető): core/token-ceiling.test.js
// Két szabályt fog össze:
//  • GONDOLKODÓ-PADLÓ: a gondolkodó modellek a keret egy részét belső
//    gondolkodásra költik, ezért kis maxTokens mellett ÜRES válasz jön
//    (07-16 GLM-eset, 07-22 guide-ötletelő). Kikapcsolt gondolkodásnál a
//    padló értelmetlen → kimarad.
//  • MENTŐÖV-RÁHAGYÁS (2026-08-04): ha az előző hívás azért bukott, mert a
//    gondolkodás elvitte a TELJES keretet, az újrapróba nem kaphat kevesebb
//    (se ugyanannyi) helyet — élesben bizonyítva, hogy különben ugyanabba a
//    falba fut: 10000 → 🧯 → 9999 → megint üres, kétszer kifizetve.
//    A max_tokens FELSŐ HATÁR: a ráhagyás csak akkor kerül pénzbe, ha a
//    modell tényleg felhasználja (ezt a padló 4000→8000 emelésekor,
//    2026-07-22-én már megállapítottuk).
const RESCUE_HEADROOM = 1.5;
const RESCUE_CEILING_MAX = 24000;

export function effectiveMaxTokens({ model, maxTokens, noThink = false, prevCeiling = 0 }) {
  const base = maxTokens || 2048;
  const floored = (isThinkingModel(model) && !noThink) ? Math.max(base, 8000) : base;
  if (!prevCeiling) return floored;
  return Math.max(floored, Math.min(RESCUE_CEILING_MAX, Math.ceil(prevCeiling * RESCUE_HEADROOM)));
}
function isDailyQuota(error) {
  const m = (error?.message || '').toLowerCase();
  return m.includes('perday') || m.includes('per day') || m.includes('free_tier');
}

// ===================================================================
// FŐ FÜGGVÉNY: ASK
// ===================================================================
// Ez az amit az agentek hívnak!
//
// Paraméterek:
//   prompt    - mit kérdezünk az AI-tól (string)
//   options   - { agentName, systemPrompt?, maxTokens? }
//
// ===================================================================
// KÜLSŐ KÓD-KERÍTÉS LEHÁMOZÁSA (2026-07-21, MiniMax-váltás után derült ki)
// A MiniMax M3 az EGÉSZ választ ```markdown ... ``` kerítésbe csomagolja.
// Ettől a fordító looksValid()-ja elbukik (frontmatter nem a sor elején van),
// és a cikk-írók frontmatter-e is olvashatatlanná válik → néma gyártás-leállás.
// Központilag itt hámozzuk le, hogy MINDEN agent védve legyen — a szövegen
// BELÜLI kódblokkokat nem bántjuk, csak a mindent körbeölelő külső kerítést.
// ===================================================================
// Csak DOKUMENTUM-burok jelölőnél hámozunk. A ```bash/```js/```python stb. valódi
// kód-válasz lehet (az agent szándékosan kérte) — azt érintetlenül hagyjuk.
const DOC_FENCE_TAGS = new Set(['', 'markdown', 'md', 'json', 'text', 'txt', 'yaml', 'yml', 'html']);

export function unwrapOuterFence(text) {
  if (typeof text !== 'string') return text;
  const t = text.trim();
  if (!t.startsWith('```')) return text;
  const m = t.match(/^```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)\r?\n?```$/);
  if (!m) return text;
  const [, tag, inner] = m;
  if (!DOC_FENCE_TAGS.has(tag.toLowerCase())) return text;
  // A belső részben MARADT kerítéseknek párban kell lenniük. Páratlan szám azt
  // jelenti, hogy nem egyetlen burkot bontottunk, hanem több különálló blokk
  // elejét/végét téptük szét — ilyenkor inkább nem nyúlunk hozzá.
  const innerFences = (inner.match(/^```/gm) || []).length;
  if (innerFences % 2 !== 0) return text;
  return inner;
}

// Visszaadja: { text, provider, model, costUsd } VAGY null ha minden elesett
//
// HIBAKEZELÉS:
//   - Átmeneti hiba (503, hálózat) -> ugyanazt a modellt újrapróbálja (backoff)
//   - Kvóta (429) vagy más -> azonnal fallback modell
// ===================================================================

// VÉSZHÁLÓ-RIASZTÁS (2026-07-10): napi 1x Telegram, ha egy paid-only agent
// ingyenes kulcsra kényszerült (= minden fizetős elesett). Fire-and-forget,
// dinamikus telegram-import (nincs körkörös függőség); hiba nem állítja meg a routert.
const EMERGENCY_STATE = join(__dirname, '..', 'memory', 'emergency-fallback-state.json');
let _emergencyAlertedThisRun = false;
function emergencyFallbackAlert(agentName, provider, model) {
  if (_emergencyAlertedThisRun) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    const st = existsSync(EMERGENCY_STATE) ? JSON.parse(readFileSync(EMERGENCY_STATE, 'utf-8')) : {};
    if (st.last_alert === today) { _emergencyAlertedThisRun = true; return; }   // ma már szóltunk
    writeFileSync(EMERGENCY_STATE, JSON.stringify({ last_alert: today, agent: agentName, provider, model }, null, 2), 'utf-8');
  } catch { /* állapot-hiba ne állítsa meg a routert */ }
  _emergencyAlertedThisRun = true;
  console.log(`   🚨 VÉSZHÁLÓ: a(z) "${agentName}" fizetős helyett INGYENES kulccsal ment (${provider}) — Telegram-riasztás.`);
  import('./telegram.js').then(({ sendMessage }) => {
    // 2026-07-22: a szöveg eddig KŐBE VÉSVE a Google/Gemini feltöltésére küldött —
    // a Gemini kivezetése után ez félrevezető lett volna. Most a TÉNYLEGES helyzetet
    // mondjuk, és az egyetlen fizetős szolgáltatóra (OpenRouter) irányítunk.
    sendMessage(`⚠️ *Vészhelyzet — figyelj rám!*\n\nA fizetős AI most nem volt elérhető, ezért a *${agentName}* INGYENES kulccsal dolgozott (${provider}/${model}). Így a cég TOVÁBB megy, nem áll le 👍 — de a szöveg minősége gyengébb lehet.\n\nValószínű ok: elfogyott az OpenRouter-egyenleg vagy kvóta-limit.\nEllenőrizd: openrouter.ai → Credits.`).catch(() => {});
  }).catch(() => {});
}

export async function ask(prompt, options = {}) {
  const { agentName, systemPrompt, maxTokens, jsonMode } = options;

  if (!agentName) {
    throw new Error('agentName kötelező az options-ban!');
  }

  // KÖZPONTI TANULÁS (2026-07-13): a cég közös tanulságai minden hívásba —
  // "tudjanak egymás hibáiból tanulni". Determinisztikus, $0 (nincs API).
  let sysWithLessons = systemPrompt;
  try {
    const { lessonsBlock } = await import('./memory-manager.js');
    const lb = lessonsBlock(agentName);
    if (lb) sysWithLessons = (systemPrompt || 'You are a helpful assistant.') + lb;
  } catch { /* tanulság nélkül is megy */ }

  const agentConfig = config.agents[agentName];
  if (!agentConfig) {
    throw new Error(`Ismeretlen agent: ${agentName} (config.json nem tartalmazza)`);
  }

  // SORREND a routing-stratégia szerint (config.json agents.<név>.routing):
  //   'free-first' (alapértelmezés): saját ingyenes modellek → ingyenes pool →
  //                                  saját fizetős modellek → fizetős pool
  //   'paid-only'  (ellenorzo/boss/translator): CSAK fizetős — ingyenes SOHA
  const routing = agentConfig.routing || 'free-first';

  // SZÁNDÉKOS HAVI STOP (2026-07-19, user: "hagyjuk — álljon le"): ha a HAVI
  // hard cap telt be (hard:true), az a user TUDATOS kerete — ilyenkor a
  // paid-only (minőség-kritikus) agentek NEM esnek át a gyenge ingyenes
  // modellekre, hanem szünetelnek (null → a hívók draft-ban tartják a munkát;
  // hónapfordulón magától újraindul). A VÉSZHÁLÓ (üzemzavar: 429/egyenleg-
  // kifogyás, amikor a cap még NEM telt be) változatlanul él.
  if (routing === 'paid-only') {
    const mb = meteredBlocked();
    if (mb.blocked && mb.hard) {
      console.log(`   ⛔ [${agentName}] Havi költségkeret elérve (${mb.reason}) — minőség-kritikus agent SZÜNETEL (nem vált gyenge modellre).`);
      return null;
    }
  }

  const own = [agentConfig.primary_model, agentConfig.fallback_model].filter(Boolean);
  const isPaidEntry = (a) => isMetered(a.provider, a.model);
  let raw;
  if (routing === 'paid-only') {
    // Alaphelyzetben CSAK fizetős (minőség). VÉSZHÁLÓ (2026-07-10): ha MINDEN
    // fizetős provider elesik (pl. elfogyott a Google-egyenleg), vég-tartalékként
    // az ingyenes kulcsokra váltunk — a cég NE álljon le csendben. A free csak
    // akkor kerül sorra, ha minden fizetős elesett (a minőség így megmarad, míg a
    // fizetős bírja).
    raw = [...own.filter(isPaidEntry), ...PAID_POOL, ...own.filter(a => !isPaidEntry(a)), ...FREE_TIER_POOL];
  } else {
    raw = [...own.filter(a => !isPaidEntry(a)), ...FREE_TIER_POOL, ...own.filter(isPaidEntry), ...PAID_POOL];
  }
  // dedup modell szerint (megőrzi a sorrendet)
  const seen = new Set();
  const attempts = raw.filter(a => { const k = a.provider + '|' + a.model; if (seen.has(k)) return false; seen.add(k); return true; });

  let budgetNotice = false;   // hogy a költségőr üzenetét csak egyszer írjuk ki
  // VÉSZHÁLÓ-DIAGNÓZIS (2026-07-24): egy fizetős agent KÉTFÉLEképp eshet ingyenesre:
  //  (1) VALÓDI kimerülés — a fizetős modell kvóta/402/keret miatt esett ki → BAJ,
  //  (2) PILLANATNYI hiba — egy 500/időtúllépés/üres válasz → a tartalék elkapta, NEM baj.
  // A riasztás eddig MINDKETTŐRE "elfogyott az egyenleg!"-et kiáltott (téves pánik,
  // user: "ne küldjön hülyeségeket"). Ez a jelző CSAK a valódi kimerülést jegyzi meg;
  // riasztás csak akkor megy ki, ha ez igaz.
  let paidPathExhausted = false;
  for (const attempt of attempts) {
    const { provider, model } = attempt;
    const caller = providerCallers[provider];

    if (!caller) {
      continue; // ismeretlen provider -> tovább
    }

    // Kvóta kimerült ma? -> kihagyjuk, megyünk a következő modellre
    if (isExhausted(model)) {
      if (isMetered(provider, model)) paidPathExhausted = true;  // egy FIZETŐS modell tényleg kimerült
      continue;
    }

    // KÖLTSÉGŐR: ha a FIZETŐS (metered) keret betelt, a metered providereket
    // kihagyjuk és a FREE kulcsokra váltunk (a felhasználó kérése: figyelje a
    // keretet és váltson időben). A free providerek mindig mehetnek.
    if (isMetered(provider, model)) {
      const mb = meteredBlocked();
      if (mb.blocked) {
        paidPathExhausted = true;  // a keret betelte VALÓDI ok a fallbackra
        if (!budgetNotice) { console.log(`   💰 Költségőr: ${mb.reason} — metered kulcsok kihagyva.`); budgetNotice = true; }
        continue;
      }
    }

    // GONDOLKODÁS KI (2026-07-23): mechanikus agentnél (config.json
    // agents.<név>.reasoning: "off") az openrouteres gondolkodó modellek
    // belső gondolkodását kikapcsoljuk — fordításnál ez idő/pénz-égetés volt,
    // minőség-haszon nélkül (éles A/B: ugyanolyan fordítás ötödannyiért).
    const reasoningOff = agentConfig.reasoning === 'off' && provider === 'openrouter';

    // GONDOLKODÓ-PADLÓ (2026-07-16): a zai-glm-4.7 reasoning-modell — kis
    // token-keretnél (pl. pairing 400, seo 500) a TELJES keretet elgondolkodja
    // és üres választ ad. $0-s modell, a ráhagyás ingyen van → padló alá.
    // (Ugyanaz a lecke, mint a Gemini thinking-tokenjeinél 2026-07-03.)
    // GONDOLKODÓ-PADLÓ: a "gondolkodó" modellek a keret egy részét belső
    // gondolkodásra költik — kis maxTokens mellett ÜRES válasz jön (07-16 GLM-eset).
    // 2026-07-21: a MiniMax M3 is ilyen, és a váltással MINDEN tartalmi agent
    // rákerült (a ceo-desk 300 tokenes hívása így némán elbukott volna).
    // 2026-07-22: 4000 → 8000. Éles eset: a guide-ötletelő 14 600 tokenes promptján
    // a MiniMax a teljes 4000-es keretet ELGONDOLKODTA és ÜRES választ adott (a lánc
    // mentette meg). Nagy prompthoz nagyobb kimeneti keret kell. A max_tokens csak
    // FELSŐ HATÁR — ha a modell nem használja ki, nem kerül többe.
    // Kikapcsolt gondolkodásnál a padló ÉRTELMETLEN (nincs mit elgondolkodni) → kihagyjuk.
    // `noThink` PRÓBÁNKÉNT változhat (gondolkodás-mentő, lásd lent), ezért let.
    let noThink = reasoningOff;
    // MENTŐÖV-KÖNYVELÉS: melyik keretbe fulladt bele az előző próba. Amíg 0,
    // a keret-számítás a megszokott (a meglévő utak viselkedése változatlan).
    let prevCeiling = 0;

    // Átmeneti hibákra ugyanazt a modellt újrapróbáljuk (backoff-fal)
    for (let tryNum = 1; tryNum <= MAX_TRANSIENT_RETRIES + 1; tryNum++) {
      const effMaxTokens = effectiveMaxTokens({ model, maxTokens, noThink, prevCeiling });
      try {
        const response = await caller(prompt, model, { systemPrompt: sysWithLessons, maxTokens: effMaxTokens, jsonMode, reasoningOff: noThink });

        // Safety check
        const safety = safetyFilter(response);
        if (!safety.safe) {
          // A tokeneket a szolgáltató AKKOR IS felszámolta, ha a választ eldobjuk
          // (2026-07-22 audit): a gondolkodó modellek jellemzően így "égetik el" a
          // keretet üres válasszal. Enélkül valódi pénz tűnt el a nyilvántartásból.
          const wasted = response.actualCostUsd ?? calculateCost(model, response.usage);
          logCall(agentName, provider, model, response.usage, wasted, false, new Error(safety.reason));
          if (isMetered(provider, model) && wasted > 0) recordSpend(provider, wasted);

          // MIÉRT volt üres? A puszta "Üres válasz" nem elég a diagnózishoz:
          // a "length" azt jelenti, hogy a KERET vágta el, a reasoning-hossz
          // pedig megmutatja, hogy a modell a gondolkodó-csatornába írt-e.
          if (safety.reason === 'Üres válasz' && response.finishReason) {
            console.log(`   🔬 [${agentName}] üres válasz — finish: ${response.finishReason} · gondolkodás: ${response.reasoningTokens ?? '?'} tok / ${response.reasoningChars} kar · kimenő: ${response.usage?.outputTokens}/${effMaxTokens} tok`);
          }

          // GONDOLKODÁS-MENTŐ (2026-08-03). Éles minta a 08-03 01:47-es futásból:
          // 4 hívás, egyenként ~$0.017, kimenet PONTOSAN a plafonon (10000 tok),
          // szöveg ÜRES — a modell a teljes keretet elgondolkodta, a pénz elment,
          // az eredmény semmi (a futás pénzének 14%-a). Mielőtt GYENGÉBB modellre
          // esnénk (M2.7), UGYANEZT a modellt egyszer újrapróbáljuk gondolkodás
          // NÉLKÜL: M3 gondolkodás nélkül > M2.7, és a válasz így biztosan a
          // keretbe fér. Csak az M3 tudja (M2.5/M2.7: "Reasoning is mandatory").
          // A KERET VÁGTA EL? Két jel bármelyike elég: a szolgáltató maga
          // mondja ("length"), vagy a kimenő token a plafonon áll. A
          // finish_reason a közvetlenebb — a token-alapú becslés csak
          // tartalék, ha a provider nem küld finish_reason-t.
          const cutByCeiling = response.finishReason === 'length'
            || (response.usage?.outputTokens || 0) >= effMaxTokens * 0.98;
          if (safety.reason === 'Üres válasz' && !noThink
            && provider === 'openrouter' && canDisableReasoning(model)
            && cutByCeiling) {
            noThink = true;
            // 2026-08-04: a zászló ÖNMAGÁBAN kevés — az OpenRouter/MiniMax
            // párosnál nem mindig hat (élesben mérve: guide-nál hatott,
            // iro-nál nem). Ha nem hat, és a keret UGYANANNYI marad, az
            // újrapróba ugyanabba a falba fut, és másodszor is fizetünk.
            // Ezért a hellyel is bővítünk (a max_tokens felső határ: a
            // ráhagyás csak akkor kerül pénzbe, ha tényleg kell).
            prevCeiling = effMaxTokens;
            tryNum--;   // ez nem átmeneti-hiba próba, ne fogyassza azt a keretet
            const nextCeiling = effectiveMaxTokens({ model, maxTokens, noThink: true, prevCeiling });
            console.log(`   🧯 [${agentName}] a gondolkodás elette a teljes keretet (${response.usage?.outputTokens} tok, üres szöveg) — újra UGYANEZZEL a modellel, gondolkodás nélkül, ${effMaxTokens} → ${nextCeiling} tokenes kerettel.`);
            continue;
          }
          break; // Tartalom-szabály blokk -> fallback (nem retry)
        }

        // Költség: a szolgáltató által VISSZAIGAZOLT ár az elsődleges (OpenRouter),
        // a helyi ár-tábla csak tartalék. (2026-07-22 audit: a becslés 18%-kal alámért.)
        const cost = response.actualCostUsd ?? calculateCost(model, response.usage);
        logCall(agentName, provider, model, response.usage, cost, true);
        if (isMetered(provider, model)) recordSpend(provider, cost);

        // VÉSZHÁLÓ-RIASZTÁS: ha egy 'paid-only' agent INGYENES providerrel járt
        // sikerrel — DE csak akkor riasztunk, ha a fizetős út VALÓDI kimerülés miatt
        // esett ki (kvóta/402/keret), NEM egy pillanatnyi hiba miatt (2026-07-24 fix:
        // a téves "elfogyott az egyenleg!" pánik ellen). Pillanatnyi hibánál a tartalék
        // csendben elvégezte a dolgát — erről elég egy napló-sor.
        if (routing === 'paid-only' && !isMetered(provider, model)) {
          if (paidPathExhausted) emergencyFallbackAlert(agentName, provider, model);
          else console.log(`   ↩️ [${agentName}] pillanatnyi fizetős hiba — a tartalék (${provider}/${model}) elkapta, nincs riasztás (az egyenleg rendben).`);
        }

        return { text: unwrapOuterFence(response.text), provider, model, costUsd: cost };

      } catch (error) {
        logCall(agentName, provider, model, null, 0, false, error);

        // Kvóta-hiba (429/402) -> megjegyezzük (napi vagy perces), és átirányítunk másik modellre
        if (isQuotaError(error)) {
          markExhausted(model, isDailyQuota(error));
          if (isMetered(provider, model)) paidPathExhausted = true;  // fizetős kvóta/egyenleg tényleg elfogyott → VALÓDI ok
          break; // tovább a következő (szabad) modellre
        }
        // Átmeneti hiba + van még próba -> várunk és újra ugyanazt a modellt
        if (isTransientError(error) && tryNum <= MAX_TRANSIENT_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, tryNum - 1);
          console.log(`   ⏳ Átmeneti hiba — újrapróbálom ${delay}ms múlva (${tryNum}/${MAX_TRANSIENT_RETRIES})...`);
          await sleep(delay);
          continue;
        }
        // Egyéb hiba (pl. nincs kulcs) -> következő modell
        break;
      }
    }
  }

  // Ha ide eljutunk, minden próbálkozás elesett
  console.error(`💥 [${agentName}] MINDEN provider elesett!`);
  return null;
}

// ===================================================================
// PROBE — egyetlen KONKRÉT modell tesztelése (preflight, fallback NÉLKÜL)
// ===================================================================
// Egy apró hívással leteszteli, hogy a megadott provider/model TÉNYLEG él-e.
// Így nem manuálisan derül ki egy elgépelt/megszűnt modellnév (pl. 404).
// Visszaad: { provider, model, ok, status, detail }
//   status: 'ok' | 'not_found' | 'quota' | 'auth' | 'error' | 'no_caller' | 'no_key'
export async function probeModel(provider, model) {
  const r = { provider, model, ok: false, status: 'error', detail: '' };
  try {
    // Embedding modell külön úton fut (embedContent, nem chat)
    if (/embedding/i.test(model)) {
      const v = await embedText('ping');
      if (Array.isArray(v) && v.length) { r.ok = true; r.status = 'ok'; r.detail = `dim=${v.length}`; }
      else { r.status = 'error'; r.detail = 'nincs vektor (kulcs/hiba)'; }
      return r;
    }
    const caller = providerCallers[provider];
    if (!caller) { r.status = 'no_caller'; r.detail = 'ismeretlen provider'; return r; }
    const resp = await caller('ping', model, { maxTokens: 1 });
    r.ok = true; r.status = 'ok'; r.detail = `${resp?.usage?.outputTokens ?? '?'} tok`;
    return r;
  } catch (e) {
    const msg = (e?.message || String(e)).toLowerCase();
    if (/404|not found|is not supported|does not exist|could not find|not_found|decommission/.test(msg)) r.status = 'not_found';
    else if (isQuotaError(e)) r.status = 'quota';
    else if (isTransientError(e)) r.status = 'busy';   // 503/overloaded — a modell JÓ, csak épp terhelt
    else if (/401|403|api key|api_key|unauthor|permission|no key|nincs.*kulcs/.test(msg)) r.status = 'auth';
    else r.status = 'error';
    r.detail = (e?.message || String(e)).replace(/\s+/g, ' ').slice(0, 120);
    return r;
  }
}

// ===================================================================
// EXPORTOK
// ===================================================================

export default { ask, embedText, probeModel };
