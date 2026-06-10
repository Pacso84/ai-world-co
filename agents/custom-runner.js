// ===================================================================
// CUSTOM AGENT FUTTATÓ (generikus)
// ===================================================================
//
// Bármelyik FELHASZNÁLÓ ÁLTAL LÉTREHOZOTT (custom) agentet lefuttatja.
// Az agent "agya" az instructions mezője (system prompt). Kap egy
// inputot, és a választott modellen (kvóta-tudatos router) elvégzi.
//
// FUTTATÁS:
//   node agents/custom-runner.js <agentId> "input szöveg"
//   node agents/custom-runner.js <agentId> --latest-article
//
// Kimenet: agents/<agentId>/output/<időbélyeg>.md
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../core/ai-router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));

const agentId = process.argv[2];
const rest = process.argv.slice(3);

if (!agentId) {
  console.log('Használat: node agents/custom-runner.js <agentId> "input"');
  console.log('Elérhető custom agentek:');
  for (const [id, a] of Object.entries(CONFIG.agents)) {
    if (a.type === 'custom') console.log(`  - ${id}: ${a.name || ''} — ${a.role || ''}`);
  }
  process.exit(0);
}

const agent = CONFIG.agents[agentId];
if (!agent) { console.error(`Nincs ilyen agent: ${agentId}`); process.exit(1); }

// Utasítás (system prompt): config.instructions VAGY agents/<id>/instructions.md
function loadInstructions() {
  if (agent.instructions) return agent.instructions;
  const p = join(__dirname, agentId, 'instructions.md');
  if (existsSync(p)) return readFileSync(p, 'utf-8');
  return 'You are a helpful assistant for AI World Co.';
}

// Input meghatározása
function resolveInput() {
  if (rest[0] === '--latest-article') {
    const dir = join(ROOT, 'content', 'articles');
    if (!existsSync(dir)) return '(nincs cikk)';
    const files = readdirSync(dir).filter(f => f.startsWith('ARTICLE_')).sort();
    if (!files.length) return '(nincs cikk)';
    const data = JSON.parse(readFileSync(join(dir, files[files.length - 1]), 'utf-8'));
    return data.article_markdown || '';
  }
  return rest.join(' ') || 'Do your task based on your instructions.';
}

async function main() {
  console.log(`🤖 CUSTOM AGENT: ${agent.name || agentId} (${agentId})`);
  console.log('─'.repeat(60));
  if (agent.enabled === false) { console.log('⏸️  Ez az agent ki van kapcsolva.'); return; }

  const systemPrompt = loadInstructions();
  const input = resolveInput();

  const response = await ask(input, { agentName: agentId, systemPrompt, maxTokens: 2000 });
  if (!response) { console.log('❌ Nem érkezett válasz (router elesett).'); process.exit(1); }

  // Mentés
  const outDir = join(__dirname, agentId, 'output');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
  writeFileSync(file, response.text, 'utf-8');

  console.log(`\n📝 Eredmény (${response.provider}/${response.model}, $${response.costUsd.toFixed(4)}):\n`);
  console.log(response.text.slice(0, 600) + (response.text.length > 600 ? '\n…' : ''));
  console.log(`\n💾 Mentve: ${file}`);
}

main().catch(e => { console.error('💥 HIBA:', e); process.exit(1); });
