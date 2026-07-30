// ===================================================================
// KÖLTSÉGKERET-FIGYELŐ (budget guard)
// ===================================================================
// Számon tartja a napi/havi AI-költést providerenként, és eldönti, mikor
// kell a FIZETŐS (metered) kulcsokról a FREE kulcsokra váltani.
//
//   - A free tier 429-cel jelez (azt a router quota-state-je kezeli).
//   - A FIZETŐS terv (pl. Gemini paid, Anthropic) NEM jelez — ott PÉNZ fogy.
//     Ezért itt követjük a költést, és ha eléri a napi keretet, a metered
//     providereket kihagyjuk → a router a free kulcsokra vált.
//
// Állapot: core/budget-state.json  { days: { "YYYY-MM-DD": { total, byProvider } } }
// ===================================================================

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, 'budget-state.json');
const CONFIG = JSON.parse(readFileSync(join(__dirname, '..', 'config.json'), 'utf-8'));
const LIMITS = CONFIG.limits || {};

// Mely providerek FIZETŐSEK (metered)? Ezeket fékezi a költségőr.
// A free kulcsok (groq, cerebras, mistral, openrouter:free, cloudflare) sosem.
// OPENROUTER VEGYES (2026-07-15): a ':free' végű modellek ingyenesek, minden
// más FIZETŐS (pl. minimax/minimax-m3) — ezért modell-szinten döntünk.
const METERED = new Set(['google', 'anthropic', 'openai', 'deepseek', 'perplexity']);
export function isMetered(provider, model = '') {
  if (METERED.has(provider)) return true;
  if (provider === 'openrouter' && model && !/:free$/.test(model)) return true;
  return false;
}

function today() { return new Date().toISOString().slice(0, 10); }       // YYYY-MM-DD
function month() { return new Date().toISOString().slice(0, 7); }        // YYYY-MM

// ===================================================================
// IDŐZÍTETT KERET-VÁLTÁS (2026-07-30)
// ===================================================================
// A hard cap a FUTÓ HÓNAP költésével van összevetve. Ezért egy tervezett
// csökkentést (júl. 50 → aug. 40) NEM lehet előre beírni: ha ma állítanám
// 40-re, július pedig már $41,91-nél tart, a cég AZONNAL LEÁLLNA a hónap
// hátralévő részére.
//
// Eddig ez emberi emlékezeten múlt ("augusztus 1-jén állítsd át"). Most a
// config megadhatja HÓNAPRA BONTVA is (monthly_budget_usd_hard_cap_by_month),
// és a váltás magától megtörténik a hónapfordulón — senkinek nem kell rá
// emlékeznie, és nincs az a veszély, hogy túl korán lép életbe.
function capForMonth(m) {
  const byMonth = LIMITS.monthly_budget_usd_hard_cap_by_month;
  if (byMonth && typeof byMonth === 'object') {
    // A LEGKÉSŐBBI olyan bejegyzés, ami már életbe lépett (így elég egyszer
    // beírni: onnantól minden későbbi hónapra az érvényes, amíg nincs újabb).
    const keys = Object.keys(byMonth).filter(k => k <= m).sort();
    if (keys.length) return Number(byMonth[keys[keys.length - 1]]);
  }
  return Number(LIMITS.monthly_budget_usd_hard_cap ?? 80);
}

const MONTH_HARD_CAP = capForMonth(month());
const MONTH_TARGET = Number(LIMITS.monthly_budget_usd_target ?? 30);

function load() {
  if (!existsSync(STATE_PATH)) return { days: {} };
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf-8')); } catch { return { days: {} }; }
}
function save(s) {
  // Csak az utolsó ~45 napot tartjuk meg
  const days = Object.keys(s.days || {}).sort();
  if (days.length > 45) for (const d of days.slice(0, days.length - 45)) delete s.days[d];
  try { writeFileSync(STATE_PATH, JSON.stringify(s, null, 2), 'utf-8'); } catch { /* ignore */ }
}

// Egy sikeres hívás költségének rögzítése
export function recordSpend(provider, costUsd) {
  const c = Number(costUsd) || 0;
  if (c <= 0) return;
  const s = load();
  const d = today();
  s.days[d] = s.days[d] || { total: 0, byProvider: {} };
  s.days[d].total = +(s.days[d].total + c).toFixed(6);
  s.days[d].byProvider[provider] = +((s.days[d].byProvider[provider] || 0) + c).toFixed(6);
  save(s);
}

export function spentToday() {
  const s = load();
  return s.days[today()]?.total || 0;
}
export function spentThisMonth() {
  const s = load(); const m = month();
  return Object.entries(s.days).filter(([d]) => d.startsWith(m)).reduce((sum, [, v]) => sum + (v.total || 0), 0);
}
export function byProviderToday() {
  return load().days[today()]?.byProvider || {};
}

// A FŐ DÖNTÉS: ki kell-e hagyni MOST a fizetős (metered) providereket?
// FILOZÓFIA: használjuk a fizetős kulcsot, AMÍG BÍRJA — a kimerülést (rate/kvóta
// limit) a router 429-kezelése érzékeli és vált free-re. Itt NINCS napi
// dollár-plafon; csak a havi HARD CAP a végső biztosíték, hogy egy hiba ne
// fusson el a számlával.
export function meteredBlocked() {
  const month = spentThisMonth();
  if (month >= MONTH_HARD_CAP) return { blocked: true, reason: `havi hard cap elérve ($${month.toFixed(2)}/$${MONTH_HARD_CAP}) — végső biztosíték`, hard: true };
  return { blocked: false };
}

// Olvasható állapot a jelentésekhez / Telegramhoz
export function budgetStatus() {
  const day = spentToday(), mon = spentThisMonth();
  return {
    today: +day.toFixed(4),
    month: +mon.toFixed(4), monthTarget: MONTH_TARGET, monthHardCap: MONTH_HARD_CAP,
    byProviderToday: byProviderToday(),
    meteredBlocked: meteredBlocked()
  };
}

export default { recordSpend, spentToday, spentThisMonth, byProviderToday, meteredBlocked, budgetStatus, isMetered };
