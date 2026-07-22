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

function makeOpenAICaller({ provider, baseUrl, keyEnv, extraHeaders }) {
  return async function (prompt, model, options) {
    const key = process.env[keyEnv];
    if (!key) throw new Error(`${keyEnv} nincs a .env fájlban!`);

    const body = {
      model,
      max_tokens: options.maxTokens || 2048,
      messages: [
        { role: 'system', content: options.systemPrompt || 'You are a helpful assistant.' },
        { role: 'user', content: prompt }
      ]
    };
    if (options.jsonMode) body.response_format = { type: 'json_object' };

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(extraHeaders || {}) },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`${provider} HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    const j = await res.json();
    return {
      text: j.choices?.[0]?.message?.content || '',
      usage: { inputTokens: j.usage?.prompt_tokens || 0, outputTokens: j.usage?.completion_tokens || 0 },
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
  'minimax/minimax-m3': { input: 0.30, output: 1.20 },
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
  { provider: 'openrouter', model: 'qwen/qwen3-next-80b-a3b-instruct:free' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile' }
];

// FIZETŐS pool (Google paid tier) — olcsó-megbízható elöl, a DRÁGA
// 'flash-latest' (3.5 Flash, 5x ár!) és a Pro a végén, végső tartaléknak.
// MINŐSÉG-ELŐSZÖR (2026-07-15, user): a gemini-2.0-flash (gyenge) és a
// gemini-flash-latest (5x ár-CSAPDA) kikerült; MiniMax M3 a 2. erős láncszem.
// Fizetős vég-tartalék sorrend. ÁTÁLLVA 2026-07-21: a MiniMax M3 került előre
// (cikkenként ~fele ár), a Gemini 2.5 Flash mögé — a saját agent-modellek után
// ez a lánc jön. (A 2.5-pro marad az utolsó, drága mentsvárnak.)
const PAID_POOL = [
  { provider: 'openrouter', model: 'minimax/minimax-m3' },
  { provider: 'google', model: 'gemini-2.5-flash' },
  { provider: 'google', model: 'gemini-2.5-pro' }
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
    sendMessage(`⚠️ *Vészhelyzet — figyelj rám!*\n\nA fizetős AI (Google/Gemini) nem elérhető — valószínűleg *elfogyott az egyenleg*. Átváltottam az INGYENES kulcsokra, így a cég TOVÁBB dolgozik és nem áll le. 👍\n\nA prémium minőségért töltsd fel a Google-egyenleged: ai.studio → a projekted → Billing.`).catch(() => {});
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
  for (const attempt of attempts) {
    const { provider, model } = attempt;
    const caller = providerCallers[provider];

    if (!caller) {
      continue; // ismeretlen provider -> tovább
    }

    // Kvóta kimerült ma? -> kihagyjuk, megyünk a következő modellre
    if (isExhausted(model)) {
      continue;
    }

    // KÖLTSÉGŐR: ha a FIZETŐS (metered) keret betelt, a metered providereket
    // kihagyjuk és a FREE kulcsokra váltunk (a felhasználó kérése: figyelje a
    // keretet és váltson időben). A free providerek mindig mehetnek.
    if (isMetered(provider, model)) {
      const mb = meteredBlocked();
      if (mb.blocked) {
        if (!budgetNotice) { console.log(`   💰 Költségőr: ${mb.reason} — metered kulcsok kihagyva.`); budgetNotice = true; }
        continue;
      }
    }

    // GONDOLKODÓ-PADLÓ (2026-07-16): a zai-glm-4.7 reasoning-modell — kis
    // token-keretnél (pl. pairing 400, seo 500) a TELJES keretet elgondolkodja
    // és üres választ ad. $0-s modell, a ráhagyás ingyen van → padló alá.
    // (Ugyanaz a lecke, mint a Gemini thinking-tokenjeinél 2026-07-03.)
    // GONDOLKODÓ-PADLÓ: a "gondolkodó" modellek a keret egy részét belső
    // gondolkodásra költik — kis maxTokens mellett ÜRES válasz jön (07-16 GLM-eset).
    // 2026-07-21: a MiniMax M3 is ilyen, és a váltással MINDEN tartalmi agent
    // rákerült (a ceo-desk 300 tokenes hívása így némán elbukott volna).
    const effMaxTokens = isThinkingModel(model) ? Math.max(maxTokens || 2048, 4000) : maxTokens;

    // Átmeneti hibákra ugyanazt a modellt újrapróbáljuk (backoff-fal)
    for (let tryNum = 1; tryNum <= MAX_TRANSIENT_RETRIES + 1; tryNum++) {
      try {
        const response = await caller(prompt, model, { systemPrompt: sysWithLessons, maxTokens: effMaxTokens, jsonMode });

        // Safety check
        const safety = safetyFilter(response);
        if (!safety.safe) {
          logCall(agentName, provider, model, response.usage, 0, false, new Error(safety.reason));
          break; // Tartalom-szabály blokk -> fallback (nem retry)
        }

        // Költség számítás + log + költségkeret-rögzítés (csak a fizetős fogy)
        const cost = calculateCost(model, response.usage);
        logCall(agentName, provider, model, response.usage, cost, true);
        if (isMetered(provider, model)) recordSpend(provider, cost);

        // VÉSZHÁLÓ-RIASZTÁS: ha egy 'paid-only' agent INGYENES providerrel járt
        // sikerrel, az azt jelenti, hogy minden fizetős elesett (pl. Google-egyenleg
        // elfogyott). Napi 1x szólunk Telegramon, hogy tudd, tölteni kell.
        if (routing === 'paid-only' && !isMetered(provider, model)) emergencyFallbackAlert(agentName, provider, model);

        return { text: unwrapOuterFence(response.text), provider, model, costUsd: cost };

      } catch (error) {
        logCall(agentName, provider, model, null, 0, false, error);

        // Kvóta-hiba (429) -> megjegyezzük (napi vagy perces), és átirányítunk másik modellre
        if (isQuotaError(error)) {
          markExhausted(model, isDailyQuota(error));
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
