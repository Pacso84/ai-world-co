// ===================================================================
// API-SZAKÉRTŐ AGENT (Model Strategist)
// ===================================================================
//
// Tudja, MELYIK modell MIRE a legjobb, és minden agenthez a LEGJOBB
// ELÉRHETŐ modellt rendeli (amihez van API kulcs). Szabály-alapú
// szakértő (nem találgat) — a modellek valódi erősségei alapján.
//
// FUTTATÁS:
//   node agents/api-expert/agent.js            (preflight-teszt + átrendezi a config-ot)
//   node agents/api-expert/agent.js --dry-run  (preflight-teszt + megmutatja mit tenne)
//   node agents/api-expert/agent.js --verify   (CSAK preflight modell-teszt + riport)
//
// HASZNÁLAT: új API kulcs hozzáadása után futtasd → automatikusan a
// legjobb elérhető modellekre állítja az agenteket.
// ===================================================================

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { notify } from '../../core/ops.js';
import { probeModel } from '../../core/ai-router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CONFIG_PATH = join(ROOT, 'config.json');
const ENV_PATH = join(ROOT, '.env');
const HEALTH_PATH = join(ROOT, 'core', 'model-health.json');
const DRY = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');  // csak teszt+riport, nem ír config-ot

// Melyik provider-kulcs van beállítva (.env)?
function availableProviders() {
  const env = {};
  if (existsSync(ENV_PATH)) {
    for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)$/);
      if (m && m[2].trim()) env[m[1]] = true;
    }
  }
  return {
    anthropic: !!env.ANTHROPIC_API_KEY,
    google: !!env.GOOGLE_API_KEY,
    groq: !!env.GROQ_API_KEY,
    cerebras: !!env.CEREBRAS_API_KEY,
    openrouter: !!env.OPENROUTER_API_KEY,
    mistral: !!env.MISTRAL_API_KEY
  };
}

// TUDÁSBÁZIS: agentenként a feladathoz ILLŐ modellek, LEGJOBB ELŐL.
// (provider, model) — az expert az első olyat választja, amihez van kulcs.
const TASK_PREFERENCES = {
  // Orkesztrálás: olcsó+okos elég
  'ceo': [['anthropic','claude-haiku-4-5'], ['google','gemini-flash-latest'], ['groq','llama-3.3-70b-versatile']],
  // Osztályozás/relevancia: olcsó, gyors, JSON-képes
  'rss-scraper': [['google','gemini-flash-latest'], ['groq','llama-3.3-70b-versatile'], ['cerebras','gpt-oss-120b']],
  // Kreatív, hosszú cikkírás: minőség
  'iro': [['anthropic','claude-sonnet-4-6'], ['cerebras','gpt-oss-120b'], ['google','gemini-2.5-pro'], ['google','gemini-flash-latest']],
  // Minőség-ellenőrzés (strukturált JSON): erős + megbízható
  'ellenorzo': [['anthropic','claude-sonnet-4-6'], ['google','gemini-2.5-pro'], ['google','gemini-flash-latest'], ['groq','llama-3.3-70b-versatile']],
  // Felfedezés/kutatás: olcsó, JSON
  'source-scout': [['google','gemini-flash-latest'], ['groq','llama-3.3-70b-versatile'], ['cerebras','gpt-oss-120b']],
  // Art-director (rövid kreatív szöveg): gyors+megbízható (NEM reasoning-modell!)
  'designer': [['groq','llama-3.3-70b-versatile'], ['google','gemini-flash-latest'], ['mistral','mistral-small-latest']],
  // Elemzés/tanulás: olcsó
  'analyst': [['google','gemini-flash-latest'], ['groq','llama-3.3-70b-versatile'], ['cerebras','gpt-oss-120b']],
  // SEO (rövid strukturált): gyors+megbízható
  'seo': [['groq','llama-3.3-70b-versatile'], ['google','gemini-flash-latest'], ['mistral','mistral-small-latest']],
  // Social poszt (rövid kreatív): gyors
  'social': [['groq','llama-3.3-70b-versatile'], ['google','gemini-flash-latest'], ['cerebras','gpt-oss-120b']],
  // Főszerkesztői záró + összefoglaló: olcsó
  'publisher': [['groq','llama-3.3-70b-versatile'], ['google','gemini-flash-latest']]
};

// Megbízható, ÁLTALÁNOS fallback sorrend (amihez van kulcs)
const GENERIC_FALLBACK = [['google','gemini-flash-latest'], ['groq','llama-3.3-70b-versatile'], ['cerebras','gpt-oss-120b'], ['google','gemini-2.5-flash']];

// ===================================================================
// PREFLIGHT MODELL-EGÉSZSÉG — "ne bízz a doksiban, teszteld!"
// ===================================================================
// Nem-chat modellek, amiket szintén ellenőrzünk (pl. embedding):
const EXTRA_PROBE = [['google', 'gemini-embedding-001']];

// Minden EGYEDI jelölt modell (csak elérhető providerekhez), amit tesztelünk
function gatherCandidates(avail) {
  const set = new Map();
  const add = ([p, m]) => { if (avail[p]) set.set(p + '/' + m, [p, m]); };
  for (const prefs of Object.values(TASK_PREFERENCES)) prefs.forEach(add);
  GENERIC_FALLBACK.forEach(add);
  EXTRA_PROBE.forEach(add);
  return [...set.values()];
}

// Minden jelöltet letesztel egy apró hívással, és kiírja az eredményt.
async function probeAll(candidates) {
  const ICON = { ok: '✅', busy: '🔄', not_found: '❌', quota: '⏳', auth: '🔒', error: '⚠️', no_caller: '❔', no_key: '🔒' };
  const health = {};
  console.log(`🔬 ${candidates.length} modell preflight-tesztelése (apró hívások)...\n`);
  for (const [p, m] of candidates) {
    const r = await probeModel(p, m);
    health[`${p}/${m}`] = { ok: r.ok, status: r.status, detail: r.detail, checkedAt: new Date().toISOString() };
    console.log(`  ${ICON[r.status] || '•'} ${p}/${m}${r.detail ? '  — ' + r.detail : ''}`);
  }
  writeFileSync(HEALTH_PATH, JSON.stringify({ updated: new Date().toISOString(), models: health }, null, 2), 'utf-8');
  return health;
}

// Egy modell BIZTOSAN használhatatlan? (nemlétező név / nincs jogosultság)
function isUsable(p, m, health) {
  const h = health[`${p}/${m}`];
  if (!h) return true; // nem teszteltük → ne zárjuk ki feleslegesen
  return !['not_found', 'auth', 'no_caller', 'no_key'].includes(h.status);
}
// Most TÉNYLEG működik? (ok vagy csak átmenetileg terhelt) — ezt preferáljuk
function isHealthy(p, m, health) {
  const h = health[`${p}/${m}`];
  if (!h) return false; // ismeretlen → ne ezt preferáljuk
  return h.status === 'ok' || h.status === 'busy';
}

// Választás: ELŐSZÖR a ténylegesen működő (ok/busy), és csak ha olyan nincs,
// akkor bármi használható (pl. átmenetileg kvótás). Nemlétezőt SOHA.
function firstAvailable(list, avail, health = {}) {
  return list.find(([p, m]) => avail[p] && isHealthy(p, m, health))   // 1. menet: működő
      || list.find(([p, m]) => avail[p] && isUsable(p, m, health));   // 2. menet: használható
}

// Fallback: az első működő/használható ÁLTALÁNOS modell, ami NEM a primary
// (a jobb ellenállóságért lehetőleg eltér a primary-tól).
function pickFallback(bp, bm, avail, health) {
  const diff = ([p, m]) => !(p === bp && m === bm);
  return GENERIC_FALLBACK.find(([p, m]) => avail[p] && isHealthy(p, m, health) && diff([p, m]))
      || GENERIC_FALLBACK.find(([p, m]) => avail[p] && isUsable(p, m, health) && diff([p, m]))
      || null;
}

async function main() {
  console.log('🧠 API-SZAKÉRTŐ AGENT INDUL' + (VERIFY ? ' (verify)' : DRY ? ' (dry-run)' : ''));
  console.log('─'.repeat(60));

  const avail = availableProviders();
  const have = Object.entries(avail).filter(([, v]) => v).map(([k]) => k);
  console.log(`🔑 Elérhető providerek: ${have.join(', ') || '(egy sincs!)'}\n`);

  // PREFLIGHT: minden elérhető modellt letesztelünk — ne bízzunk a doksiban!
  const health = await probeAll(gatherCandidates(avail));
  const bad = Object.entries(health).filter(([, h]) => h.status === 'not_found').map(([k]) => k);
  if (bad.length) console.log(`\n⚠️  Nemlétező/megszűnt modellnév (404): ${bad.join(', ')} — ezeket NEM rendelem hozzá.`);

  if (VERIFY) {
    console.log(`\n✅ Verify kész — részletes egészség: core/model-health.json`);
    return;
  }

  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  let changes = 0;

  for (const [id, prefs] of Object.entries(TASK_PREFERENCES)) {
    const agent = config.agents[id];
    if (!agent || agent.type === 'custom') continue;

    const best = firstAvailable(prefs, avail, health);
    if (!best) { console.log(`⚠️  ${id}: nincs elérhető+működő modell`); continue; }

    const [bp, bm] = best;
    // Fallback: működő általános modell, ami lehetőleg ELTÉR a primary-tól
    const fb = pickFallback(bp, bm, avail, health);
    const cur = agent.primary_model || {};
    const curFb = agent.fallback_model || {};
    const primaryChange = cur.provider !== bp || cur.model !== bm;
    // A fallback rossz, ha hiányzik VAGY ugyanaz mint a primary
    const fbIsBad = !!fb && (!curFb.provider || (curFb.provider === bp && curFb.model === bm));
    const fbChange = !!fb && (curFb.provider !== fb[0] || curFb.model !== fb[1]) && (primaryChange || fbIsBad);

    if (primaryChange) console.log(`🔧 ${id}: ${cur.provider || '?'}/${cur.model || '?'}  →  ${bp}/${bm}`);
    if (fbChange) console.log(`   ↳ ${id} fallback: ${curFb.model || '(nincs)'}  →  ${fb[1]}`);

    if (primaryChange || fbChange) {
      changes++;
      if (!DRY) {
        agent.primary_model = { provider: bp, model: bm };
        if (fb && (primaryChange || fbIsBad)) agent.fallback_model = { provider: fb[0], model: fb[1] };
      }
    } else {
      console.log(`✓  ${id}: már optimális (${bp}/${bm})`);
    }
  }

  if (!DRY && changes > 0) {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    notify('info', `API-szakértő: ${changes} agent modellje optimalizálva (preflight-ellenőrzött).`, { agent: 'api-expert' });
  }

  console.log('\n' + '─'.repeat(60));
  console.log(DRY ? `📋 ${changes} változtatást javasolnék (dry-run, nem mentettem).`
                  : `✅ Kész — ${changes} agent modellje a legjobb ELÉRHETŐ + MŰKÖDŐ modellre állítva.`);
  console.log('   (Modell-egészség: core/model-health.json · agent kézzel felülírható a Vezérlőpulton.)');
}

main().catch(e => { console.error('💥 API-szakértő hiba:', e); process.exit(1); });
