// A VÉSZ-HÁLÓ ŐRE (2026-10-02). Ingyenes, hálózat nélküli.
//
// MIÉRT: a FREE_TIER_POOL mindhárom modellje csendben megszűnt (402 / archived /
// nem létezik), és ez csak akkor derült ki, amikor egy fordítás elbukott rajta
// („💥 MINDEN provider elesett"). Egy vész-háló, amit soha nem használunk,
// észrevétlenül elrohad. A user ekkor döntött: Gemini 3.1 Flash Lite az
// OpenRouterről, de CSAK a MiniMax UTÁN.
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { FREE_TIER_POOL, PAID_POOL, effectiveMaxTokens } from './ai-router.js';
import { isMetered } from './budget.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
const GEMINI = 'google/gemini-3.1-flash-lite';
console.log('\n🧪 vész-háló (FREE_TIER_POOL / PAID_POOL)');

t('🔑 a Gemini a fizetős tartalékban van, de SOHA nem a MiniMax előtt', () => {
  const gi = PAID_POOL.findIndex(a => a.model === GEMINI);
  const mi = PAID_POOL.findIndex(a => a.model === 'minimax/minimax-m3');
  assert.ok(gi >= 0, 'a Gemini nincs a PAID_POOL-ban');
  assert.ok(mi >= 0 && mi < gi, 'a Gemini a MiniMax ELÉ került — az a fő modell lecserélése lenne');
  assert.equal(PAID_POOL[gi].provider, 'openrouter', 'a Gemini csak OpenRouterről jöhet (a Google-számla nem — user, 07-22)');
});

t('💰 a Gemini a költségőr alá esik (fizetősnek számít → havi plafon védi)', () => {
  assert.equal(isMetered('openrouter', GEMINI), true);
});

t('⛔ a 10-02-én halottnak mért modellek nem jöhetnek vissza a vész-hálóba', () => {
  const halott = ['cerebras|gpt-oss-120b', 'cerebras|zai-glm-4.7', 'groq|llama-3.3-70b-versatile'];
  for (const a of [...FREE_TIER_POOL, ...PAID_POOL]) {
    assert.ok(!halott.includes(a.provider + '|' + a.model), 'halott modell a vész-hálóban: ' + a.provider + '/' + a.model);
  }
});

t('🛟 van INGYENES utolsó háló, és MÁS cégnél, mint az OpenRouter', () => {
  assert.ok(FREE_TIER_POOL.length >= 1, 'üres ingyenes háló');
  for (const a of FREE_TIER_POOL) assert.equal(isMetered(a.provider, a.model), false, a.model + ' fizetősnek számít');
  assert.ok(FREE_TIER_POOL.some(a => a.provider !== 'openrouter'), 'ha az OpenRouter leáll, nincs mire váltani');
});

t('🔗 MINDEN agent láncában a saját modelljei jönnek ELŐSZÖR, a Gemini csak a MiniMaxok után', () => {
  // Ugyanaz a képlet, mint az ask()-ban (paid-only ág) — a forrásból ellenőrizve, hogy nem változott.
  const src = readFileSync(join(ROOT, 'core', 'ai-router.js'), 'utf-8');
  assert.ok(src.includes('raw = [...own.filter(isPaidEntry), ...PAID_POOL, ...own.filter(a => !isPaidEntry(a)), ...FREE_TIER_POOL];'),
    'az ask() paid-only lánc-képlete megváltozott — ezt a tesztet is igazítsd');
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
  for (const [nev, a] of Object.entries(cfg.agents || {})) {
    if (!a || typeof a !== 'object' || !a.primary_model || (a.routing || 'free-first') !== 'paid-only') continue;
    const own = [a.primary_model, a.fallback_model].filter(Boolean);
    const paid = (x) => isMetered(x.provider, x.model);
    const seen = new Set();
    const lanc = [...own.filter(paid), ...PAID_POOL, ...own.filter(x => !paid(x)), ...FREE_TIER_POOL]
      .filter(x => { const k = x.provider + '|' + x.model; if (seen.has(k)) return false; seen.add(k); return true; });
    assert.equal(lanc[0].model, a.primary_model.model, nev + ': nem a saját fő modellje az első');
    const gi = lanc.findIndex(x => x.model === GEMINI);
    const utolsoMiniMax = lanc.map(x => x.model).filter(m => m.startsWith('minimax/')).length - 1;
    assert.ok(gi > utolsoMiniMax, nev + ': a Gemini megelőz egy MiniMaxot: ' + lanc.map(x => x.model).join(' → '));
  }
});

t('📏 gondolkodó-padló: a Groq gpt-oss kis keretnél is kap helyet, a Gemini nem kap fölöslegeset', () => {
  assert.ok(effectiveMaxTokens({ model: 'openai/gpt-oss-120b', maxTokens: 400 }) >= 8000, 'a gpt-oss kis keretnél üres választ adna');
  assert.equal(effectiveMaxTokens({ model: GEMINI, maxTokens: 400 }), 400, 'a Gemini nem gondolkodó — nem kell padló');
});

t('🧾 az ár-táblában ott a Gemini (ha a usage.cost hiányzik, ne látsszon $0-nak)', () => {
  const src = readFileSync(join(ROOT, 'core', 'ai-router.js'), 'utf-8');
  assert.ok(/'google\/gemini-3\.1-flash-lite': \{ input: 0\.25, output: 1\.50 \}/.test(src), 'hiányzik vagy változott az ár');
});

if (hiba) { console.log(`\n❌ fallback-pool.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ fallback-pool.test: mind rendben');
