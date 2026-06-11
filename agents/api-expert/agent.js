// ===================================================================
// API-SZAKÉRTŐ AGENT (Model Strategist)
// ===================================================================
//
// Tudja, MELYIK modell MIRE a legjobb, és minden agenthez a LEGJOBB
// ELÉRHETŐ modellt rendeli (amihez van API kulcs). Szabály-alapú
// szakértő (nem találgat) — a modellek valódi erősségei alapján.
//
// FUTTATÁS:
//   node agents/api-expert/agent.js            (átrendezi a config-ot)
//   node agents/api-expert/agent.js --dry-run  (csak megmutatja mit tenne)
//
// HASZNÁLAT: új API kulcs hozzáadása után futtasd → automatikusan a
// legjobb elérhető modellekre állítja az agenteket.
// ===================================================================

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { notify } from '../../core/ops.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CONFIG_PATH = join(ROOT, 'config.json');
const ENV_PATH = join(ROOT, '.env');
const DRY = process.argv.includes('--dry-run');

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

function firstAvailable(list, avail) {
  return list.find(([p]) => avail[p]);
}

function main() {
  console.log('🧠 API-SZAKÉRTŐ AGENT INDUL' + (DRY ? ' (dry-run)' : ''));
  console.log('─'.repeat(60));

  const avail = availableProviders();
  const have = Object.entries(avail).filter(([, v]) => v).map(([k]) => k);
  console.log(`🔑 Elérhető providerek: ${have.join(', ') || '(egy sincs!)'}\n`);

  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  let changes = 0;

  for (const [id, prefs] of Object.entries(TASK_PREFERENCES)) {
    const agent = config.agents[id];
    if (!agent || agent.type === 'custom') continue;

    const best = firstAvailable(prefs, avail);
    if (!best) { console.log(`⚠️  ${id}: nincs elérhető modell (adj hozzá kulcsot)`); continue; }

    // Fallback: az első elérhető általános, ami NEM a primary
    const fb = (firstAvailable(GENERIC_FALLBACK, avail) || best);
    const [bp, bm] = best;
    const cur = agent.primary_model || {};
    const isChange = cur.provider !== bp || cur.model !== bm;

    if (isChange) {
      console.log(`🔧 ${id}: ${cur.provider || '?'}/${cur.model || '?'}  →  ${bp}/${bm}`);
      changes++;
      if (!DRY) {
        agent.primary_model = { provider: bp, model: bm };
        if (fb && (fb[0] !== bp || fb[1] !== bm)) agent.fallback_model = { provider: fb[0], model: fb[1] };
      }
    } else {
      console.log(`✓  ${id}: már optimális (${bp}/${bm})`);
    }
  }

  if (!DRY && changes > 0) {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    notify('info', `API-szakértő: ${changes} agent modellje optimalizálva az elérhető kulcsokhoz.`, { agent: 'api-expert' });
  }

  console.log('\n' + '─'.repeat(60));
  console.log(DRY ? `📋 ${changes} változtatást javasolnék (dry-run, nem mentettem).`
                  : `✅ Kész — ${changes} agent modellje frissítve a legjobb elérhetőre.`);
  console.log('   (Bármely agent felülírható kézzel a Vezérlőpulton.)');
}

main();
