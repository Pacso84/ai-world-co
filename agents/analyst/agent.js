// ===================================================================
// ELEMZŐ AGENT (Analyst / Learning)
// ===================================================================
//
// FELADAT (a tanulás 2-3. része):
//   1. FORRÁS-MINŐSÉG: melyik forrásból lett publikált vs elutasított cikk
//      => sources/source-stats.json
//   2. ÖNFEJLESZTÉSI JAVASLAT (TE döntesz!): AI-jal megnézi a hibamintázatokat
//      és javaslatot ír => agents/iro/improvement-suggestions.md
//      (a felhasználó dönti el, beépítjük-e — NEM módosít magától)
//
// FUTTATÁS:
//   node agents/analyst/agent.js
//
// (Az autonóm tanulás 1. része máshol van: Ellenőrző -> lessons.json -> Író)
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const REJECTED_DIR = join(ROOT, 'content', 'rejected');
const STATS_PATH = join(ROOT, 'sources', 'source-stats.json');
const SUGGESTIONS_PATH = join(ROOT, 'agents', 'iro', 'improvement-suggestions.md');

const AGENT_NAME = 'analyst';

function readJsonDir(dir, prefix) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .map(f => { try { return JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { return null; } })
    .filter(Boolean);
}

// ===================================================================
// 1. FORRÁS-MINŐSÉG STATISZTIKA
// ===================================================================
function computeSourceStats() {
  const published = readJsonDir(ARTICLES_DIR, 'ARTICLE_');
  const rejected = readJsonDir(REJECTED_DIR, 'REJECTED_');

  const stats = {};
  const bump = (id, key) => {
    if (!id) id = 'unknown';
    stats[id] = stats[id] || { source_id: id, published: 0, rejected: 0 };
    stats[id][key]++;
  };
  published.forEach(a => bump(a._meta?.source_id, 'published'));
  rejected.forEach(a => bump(a._meta?.source_id, 'rejected'));

  // yield rate
  const list = Object.values(stats).map(s => {
    const total = s.published + s.rejected;
    s.total = total;
    s.yield_rate = total ? Math.round((s.published / total) * 100) : 0;
    return s;
  }).sort((a, b) => b.published - a.published);

  return list;
}

// ===================================================================
// 2. ÖNFEJLESZTÉSI JAVASLAT (AI, user dönt)
// ===================================================================
async function generateSuggestions(rejected) {
  if (rejected.length === 0) return { text: null, cost: 0 };

  // Az elutasítások okai
  const reasons = rejected.map(a => {
    const r = a._meta?.ai_review;
    return `- ${a.original_title?.slice(0, 50) || '?'}: ${(r?.verdict || a._meta?.reason || 'unknown').slice(0, 120)}`;
  }).slice(0, 15).join('\n');

  const prompt = `You are a writing coach analysing why some articles were rejected by our quality reviewer.

Rejected articles and reasons:
${reasons}

Suggest 3-5 CONCRETE, actionable improvements to our Writer agent's instructions to reduce these rejections.
Be specific (e.g. "always do X", "avoid Y"). Respond as a short markdown bullet list only.`;

  const response = await ask(prompt, {
    agentName: AGENT_NAME,
    systemPrompt: 'You are a concise writing-process coach. Output only a markdown bullet list of concrete suggestions.',
    maxTokens: 800
  });
  if (!response) return { text: null, cost: 0 };
  return { text: response.text.trim(), cost: response.costUsd };
}

// ===================================================================
// FŐ
// ===================================================================
async function main() {
  console.log('📊 ELEMZŐ AGENT INDUL');
  console.log('─'.repeat(60));

  // 1. Forrás-statisztika
  const sourceStats = computeSourceStats();
  writeFileSync(STATS_PATH, JSON.stringify({
    _meta: { note: 'Forrás-minőség: publikált vs elutasított cikkek forrásonként.', updated: new Date().toISOString() },
    stats: sourceStats
  }, null, 2), 'utf-8');
  console.log(`✅ Forrás-statisztika: ${sourceStats.length} forrás → sources/source-stats.json`);
  sourceStats.slice(0, 5).forEach(s =>
    console.log(`   ${s.source_id}: ${s.published} pub / ${s.rejected} rej (${s.yield_rate}% yield)`));

  // 2. Önfejlesztési javaslat (user dönt)
  const rejected = readJsonDir(REJECTED_DIR, 'REJECTED_');
  console.log(`\n🤖 ${rejected.length} elutasított cikk elemzése javaslatokhoz...`);
  const { text, cost } = await generateSuggestions(rejected);

  if (text) {
    const md = `# Önfejlesztési javaslatok — Író agent

> ⚠️ Ezeket az ELEMZŐ agent javasolta a hibamintázatokból.
> **TE döntöd el, beépítjük-e!** Az agentek maguktól NEM módosítanak.
> Ha jónak látod, szólj és átírom az Író promptját.

*Generálva: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${rejected.length} elutasítás alapján*

---

${text}

---

**Döntés:** ☐ Beépítem  ☐ Részben  ☐ Elvetem
`;
    writeFileSync(SUGGESTIONS_PATH, md, 'utf-8');
    console.log(`✅ Javaslatok → agents/iro/improvement-suggestions.md (TE döntesz!)`);
    console.log(`   💰 AI költség: $${(cost || 0).toFixed(4)}`);
  } else {
    console.log('💤 Nincs elég elutasítás javaslathoz (ez jó jel!).');
  }

  console.log('\n' + '─'.repeat(60));
  console.log('📊 Tanulás frissítve. (Az Író a lessons.json-t automatikusan használja.)');
}

main().catch(e => { console.error('💥 KRITIKUS HIBA:', e); process.exit(1); });
