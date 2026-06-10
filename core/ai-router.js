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

// Provider -> hívó függvény map
const providerCallers = {
  anthropic: callAnthropic,
  google: callGoogle,
  groq: callGroq
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
  // Anthropic
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-opus-4-8': { input: 15.0, output: 75.0 },
  // Google (Flash és Pro INGYENES a free tier-ig!)
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-flash-latest': { input: 0.075, output: 0.30 },
  'gemini-2.0-flash': { input: 0.075, output: 0.30 },
  'gemini-2.5-pro': { input: 1.25, output: 5.0 },
  // Groq (INGYENES a free tier-ig!)
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 }
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
  { provider: 'google', model: 'gemini-flash-latest' },
  { provider: 'google', model: 'gemini-2.5-flash' },
  { provider: 'google', model: 'gemini-2.0-flash' },
  { provider: 'google', model: 'gemini-2.5-pro' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'cerebras', model: 'llama-3.3-70b' },
  { provider: 'openrouter', model: 'deepseek/deepseek-chat' }
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

        // Költség számítás + log
        const cost = calculateCost(model, response.usage);
        logCall(agentName, provider, model, response.usage, cost, true);

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
// EXPORTOK
// ===================================================================

export default { ask };
