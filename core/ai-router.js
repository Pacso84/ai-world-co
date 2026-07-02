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
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0
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

// Szabad modell-pool: ha a primary+fallback kimerült, ezeken megy végig.
// (Külön kvótájú Gemini modellek + ingyenes providerek. Kulcs hiányában kimarad.)
const FREE_POOL = [
  // KÖLTSÉG-SORREND (Google paid tier, 2026-07-02): elöl az olcsó-megbízható
  // 2.5-flash, a DRÁGA 'latest' (3.5 Flash, 5x ár) és a Pro a lista VÉGÉN,
  // csak végső tartaléknak.
  { provider: 'google', model: 'gemini-2.5-flash' },
  { provider: 'google', model: 'gemini-2.0-flash' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'cerebras', model: 'gpt-oss-120b' },
  { provider: 'mistral', model: 'mistral-small-latest' },
  { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  { provider: 'google', model: 'gemini-flash-latest' },
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
  return m.includes('429') || m.includes('resource_exhausted') || m.includes('quota');
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
// Visszaadja: { text, provider, model, costUsd } VAGY null ha minden elesett
//
// HIBAKEZELÉS:
//   - Átmeneti hiba (503, hálózat) -> ugyanazt a modellt újrapróbálja (backoff)
//   - Kvóta (429) vagy más -> azonnal fallback modell
// ===================================================================

export async function ask(prompt, options = {}) {
  const { agentName, systemPrompt, maxTokens, jsonMode } = options;

  if (!agentName) {
    throw new Error('agentName kötelező az options-ban!');
  }

  const agentConfig = config.agents[agentName];
  if (!agentConfig) {
    throw new Error(`Ismeretlen agent: ${agentName} (config.json nem tartalmazza)`);
  }

  // Sorrend: primary -> fallback -> szabad pool (kvóta-tudatos átirányítás)
  const raw = [agentConfig.primary_model, agentConfig.fallback_model, ...FREE_POOL].filter(Boolean);
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
    if (isMetered(provider)) {
      const mb = meteredBlocked();
      if (mb.blocked) {
        if (!budgetNotice) { console.log(`   💰 Költségőr: ${mb.reason} — metered kulcsok kihagyva.`); budgetNotice = true; }
        continue;
      }
    }

    // Átmeneti hibákra ugyanazt a modellt újrapróbáljuk (backoff-fal)
    for (let tryNum = 1; tryNum <= MAX_TRANSIENT_RETRIES + 1; tryNum++) {
      try {
        const response = await caller(prompt, model, { systemPrompt, maxTokens, jsonMode });

        // Safety check
        const safety = safetyFilter(response);
        if (!safety.safe) {
          logCall(agentName, provider, model, response.usage, 0, false, new Error(safety.reason));
          break; // Tartalom-szabály blokk -> fallback (nem retry)
        }

        // Költség számítás + log + költségkeret-rögzítés (csak a fizetős fogy)
        const cost = calculateCost(model, response.usage);
        logCall(agentName, provider, model, response.usage, cost, true);
        if (isMetered(provider)) recordSpend(provider, cost);

        return { text: response.text, provider, model, costUsd: cost };

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
