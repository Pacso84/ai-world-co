// ===================================================================
// API-SZAKÉRTŐ AGENT (Model Strategist)
// ===================================================================
//
// Tudja, MELYIK modell MIRE a legjobb, és minden agenthez a LEGJOBB
// ELÉRHETŐ modellt rendeli (amihez van API kulcs). Szabály-alapú
// szakértő (nem találgat) — a modellek valódi erősségei alapján.
//
// TUDÁSBÁZIS: core/provider-knowledge.json — melyik gyártó miben jó, ingyenes-e,
// melyik képességhez melyik kulcs kell. ELV: INGYEN-ELŐSZÖR (csak akkor fizetünk,
// ha ingyen nem megoldható). Az agent ebből írja a "milyen kulcsot kössünk még be"
// ajánlást: agents/api-expert/key-recommendations.md
//
// FUTTATÁS:
//   node agents/api-expert/agent.js            (preflight + config + ajánlások)
//   node agents/api-expert/agent.js --dry-run  (megmutatja mit tenne, nem ír)
//   node agents/api-expert/agent.js --verify   (preflight + ajánlások, config-ot nem ír)
//   node agents/api-expert/agent.js --learn    (LLM frissítési JAVASLAT a tudásbázishoz)
//
// HASZNÁLAT: új API kulcs hozzáadása után futtasd → a legjobb ELÉRHETŐ
// (ingyen-először) modellekre állítja az agenteket, és megmondja mi hiányzik.
// ===================================================================

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { notify } from '../../core/ops.js';
import { probeModel, ask } from '../../core/ai-router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CONFIG_PATH = join(ROOT, 'config.json');
const ENV_PATH = join(ROOT, '.env');
const HEALTH_PATH = join(ROOT, 'core', 'model-health.json');
const KNOWLEDGE_PATH = join(ROOT, 'core', 'provider-knowledge.json');
const RECO_PATH = join(__dirname, 'key-recommendations.md');
const AGENT_NAME = 'api-expert';
const DRY = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');  // csak teszt+riport, nem ír config-ot
const LEARN = process.argv.includes('--learn');    // LLM frissítési JAVASLAT a tudásbázishoz (ember dönt)

function loadKnowledge() {
  try { return JSON.parse(readFileSync(KNOWLEDGE_PATH, 'utf-8')); }
  catch { return { providers: {}, capabilities: {} }; }
}

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
    mistral: !!env.MISTRAL_API_KEY,
    deepseek: !!env.DEEPSEEK_API_KEY,
    perplexity: !!env.PERPLEXITY_API_KEY
  };
}

// TUDÁSBÁZIS: agentenként a feladathoz ILLŐ modellek, LEGJOBB ELŐL.
// ELV: INGYEN-ELŐSZÖR — a fizetős (pl. anthropic) csak az utolsó, opcionális
// minőség-feljebblépés. (provider, model) — az expert az első olyat választja,
// amihez van kulcs ÉS működik. A fizetős csak akkor jön, ha be van kötve a kulcs.
const TASK_PREFERENCES = {
  // Orkesztrálás: olcsó+okos elég
  'ceo': [['google','gemini-flash-latest'], ['groq','llama-3.3-70b-versatile'], ['cerebras','gpt-oss-120b'], ['anthropic','claude-haiku-4-5']],
  // Osztályozás/relevancia: olcsó, gyors, JSON-képes
  'rss-scraper': [['google','gemini-flash-latest'], ['groq','llama-3.3-70b-versatile'], ['cerebras','gpt-oss-120b']],
  // Kreatív, hosszú cikkírás: ingyen-először (Cerebras erős+ingyen), fizetős a végén
  'iro': [['cerebras','gpt-oss-120b'], ['google','gemini-flash-latest'], ['groq','llama-3.3-70b-versatile'], ['anthropic','claude-sonnet-4-6']],
  // Útmutató (hosszú, strukturált): mint az Író
  'guide': [['cerebras','gpt-oss-120b'], ['google','gemini-flash-latest'], ['groq','llama-3.3-70b-versatile'], ['anthropic','claude-sonnet-4-6']],
  // Minőség-ellenőrzés (strukturált JSON): ingyen megbízható elöl, fizetős a végén
  'ellenorzo': [['google','gemini-flash-latest'], ['groq','llama-3.3-70b-versatile'], ['cerebras','gpt-oss-120b'], ['anthropic','claude-sonnet-4-6']],
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
  // Tény-ellenőrzés (NAGY kontextus: teljes útmutató) — NE groq (12k limit)
  'fact-check': [['google','gemini-flash-latest'], ['google','gemini-2.5-flash'], ['cerebras','gpt-oss-120b']],
  // Hír-osztályozás (JSON): olcsó, gyors
  'pairing': [['google','gemini-flash-latest'], ['groq','llama-3.3-70b-versatile'], ['cerebras','gpt-oss-120b']],
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

// ===================================================================
// AJÁNLÁSOK — költség-nézet + "milyen kulcsot kössünk még be"
// ===================================================================
// ELV: ingyen-először. Megnézi, mely KÉPESSÉGEK nincsenek lefedve bekötött
// gyártóval, és melyik (lehetőleg ingyenes) kulcs oldaná meg. + jelzi, ha
// valahol FIZETŐS modell fut, pedig van ingyenes alternatíva.
function buildRecommendations(avail, config, knowledge) {
  const prov = knowledge.providers || {};
  const caps = knowledge.capabilities || {};
  const costOf = p => prov[p]?.cost || 'unknown';

  // 1. Költség-nézet: melyik agent milyen (ingyenes/fizetős) modellt kap
  const costRows = [];
  let freeCount = 0, paidCount = 0;
  for (const id of Object.keys(TASK_PREFERENCES)) {
    const a = config.agents[id]; if (!a || a.type === 'custom') continue;
    const p = a.primary_model?.provider; if (!p) continue;
    const c = costOf(p);
    if (c === 'paid' || c === 'cheap') paidCount++; else freeCount++;
    costRows.push({ id, provider: p, model: a.primary_model?.model, cost: c });
  }
  const paidAgents = costRows.filter(r => r.cost === 'paid' || r.cost === 'cheap');

  // 2. Képesség-lefedettség: mely képességhez nincs bekötött gyártó
  const uncovered = [];
  for (const [capId, cap] of Object.entries(caps)) {
    const best = cap.best || [];
    const coveredByWired = best.some(p => avail[p]);
    if (!coveredByWired || cap.covered === false) {
      const freeBest = best.find(p => avail[p]) || best.find(p => ['free', 'freemium'].includes(costOf(p))) || best[0];
      uncovered.push({ capId, label: cap.label || capId, best, recommend: freeBest, freeOption: cap.free_option || '' });
    }
  }

  // 3. Beköthető kulcsok (nincs .env-ben), ingyen-először rendezve
  const order = { free: 0, freemium: 1, cheap: 2, paid: 3, unknown: 4 };
  const missing = Object.entries(prov)
    .filter(([p]) => !avail[p])
    .map(([p, info]) => ({ provider: p, cost: info.cost, best_for: info.best_for || [], notes: info.notes || '', free_notes: info.free_notes || '' }))
    .sort((a, b) => (order[a.cost] ?? 4) - (order[b.cost] ?? 4));

  // 4. Markdown riport
  const wired = Object.keys(avail).filter(k => avail[k]);
  const L = [];
  L.push('# API-kulcs ajánlások — az API-szakértő agenttől');
  L.push('');
  L.push(`*Generálva: ${new Date().toISOString()} · ELV: ingyen-először (csak akkor fizetünk, ha ingyen nem megoldható).*`);
  L.push('');
  L.push(`**Bekötött gyártók:** ${wired.map(p => `${p} (${costOf(p)})`).join(', ') || '—'}`);
  L.push(`**Költség-állapot:** ${freeCount} agent ingyenes modellen${paidAgents.length ? `, ⚠️ ${paidAgents.length} fizetős/olcsó modellen` : ' — minden agent INGYENES modellen fut ✅'}.`);
  if (paidAgents.length) { L.push(''); L.push('### ⚠️ Fizetős modellt használó agentek (van-e ingyenes alternatíva?)'); paidAgents.forEach(r => L.push(`- **${r.id}**: ${r.provider}/${r.model} (${r.cost})`)); }
  L.push('');
  L.push('### 🧩 Le NEM fedett képességek (ezekhez kéne kulcs)');
  if (!uncovered.length) L.push('- Minden fontos képesség lefedve a bekötött (ingyenes) gyártókkal. ✅');
  else uncovered.forEach(u => L.push(`- **${u.label}** — legjobb: ${u.best.join(', ')}. Javaslat: **${u.recommend}**. Ingyenes opció: ${u.freeOption || '—'}`));
  L.push('');
  L.push('### 🔑 Beköthető kulcsok (ingyen-először)');
  if (!missing.length) L.push('- Minden ismert gyártó be van kötve.');
  else missing.forEach(m => L.push(`- **${m.provider}** _(${m.cost}${m.free_notes ? ', ' + m.free_notes : ''})_ — erre jó: ${m.best_for.join(', ') || '?'}. ${m.notes}`));
  L.push('');
  L.push('> Az agent SOSEM köt be kulcsot magától — te döntesz. A kulcsot a `.env`-be tedd, majd futtasd: `node agents/api-expert/agent.js`.');

  return { md: L.join('\n'), freeCount, paidAgents, uncovered, missing };
}

// --learn: az LLM frissítési JAVASLATot ír a tudásbázishoz (ember dönt)
async function learnMode(knowledge) {
  console.log('📚 TANULÓ MÓD — frissítési javaslat a tudásbázishoz (LLM)...');
  const prompt = `You maintain a knowledge base of AI API providers for a cost-conscious indie project (free-first).
Current providers we know: ${Object.keys(knowledge.providers || {}).join(', ')}.

In a few bullet points, suggest UPDATES we might be missing as of your knowledge: new notable providers with a FREE tier, any provider whose free tier or best-use changed, and which provider is currently best for: web research with citations, image generation, image editing, voice. Be concise and practical. Plain text, no JSON.`;
  const r = await ask(prompt, { agentName: AGENT_NAME, systemPrompt: 'You are a pragmatic AI-infrastructure analyst. Free-first. Be concise and honest about uncertainty.', maxTokens: 600 });
  const suggestions = r?.text || '(nincs válasz)';
  const out = `\n\n---\n## 📚 Tudásbázis-frissítési JAVASLAT (LLM, ${new Date().toISOString()})\n*Az LLM tudása korlátozott/elavulhat — ELLENŐRIZD, mielőtt beírod a provider-knowledge.json-ba.*\n\n${suggestions}\n`;
  return out;
}

async function main() {
  console.log('🧠 API-SZAKÉRTŐ AGENT INDUL' + (VERIFY ? ' (verify)' : DRY ? ' (dry-run)' : LEARN ? ' (learn)' : ''));
  console.log('─'.repeat(60));

  const avail = availableProviders();
  const have = Object.entries(avail).filter(([, v]) => v).map(([k]) => k);
  console.log(`🔑 Elérhető providerek: ${have.join(', ') || '(egy sincs!)'}\n`);

  // PREFLIGHT: minden elérhető modellt letesztelünk — ne bízzunk a doksiban!
  const health = await probeAll(gatherCandidates(avail));
  const bad = Object.entries(health).filter(([, h]) => h.status === 'not_found').map(([k]) => k);
  if (bad.length) console.log(`\n⚠️  Nemlétező/megszűnt modellnév (404): ${bad.join(', ')} — ezeket NEM rendelem hozzá.`);

  const knowledge = loadKnowledge();
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));

  if (VERIFY) {
    await emitRecommendations(avail, config, knowledge);
    console.log(`\n✅ Verify kész — részletes egészség: core/model-health.json`);
    return;
  }

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

  await emitRecommendations(avail, config, knowledge);
}

// Ajánlások kiírása fájlba + rövid összefoglaló a konzolra
async function emitRecommendations(avail, config, knowledge) {
  const reco = buildRecommendations(avail, config, knowledge);
  let md = reco.md;
  if (LEARN) md += await learnMode(knowledge);
  if (!DRY) writeFileSync(RECO_PATH, md, 'utf-8');
  console.log('\n💡 KULCS-AJÁNLÁSOK:');
  console.log(`   Költség: ${reco.freeCount} agent ingyenes modellen${reco.paidAgents.length ? `, ⚠️ ${reco.paidAgents.length} fizetős/olcsó` : ' — minden agent INGYEN fut ✅'}`);
  if (reco.uncovered.length) console.log(`   🧩 Lefedetlen képesség: ${reco.uncovered.map(u => u.label).join(', ')}`);
  if (reco.missing.length) console.log(`   🔑 Beköthető (ingyen-először): ${reco.missing.slice(0, 4).map(m => `${m.provider} (${m.cost})`).join(', ')}${reco.missing.length > 4 ? '…' : ''}`);
  console.log(`   📄 Részletes javaslat: agents/api-expert/key-recommendations.md`);
}

main().catch(e => { console.error('💥 API-szakértő hiba:', e); process.exit(1); });
