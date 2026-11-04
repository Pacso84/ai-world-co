// ===================================================================
// ÖSSZEHASONLÍTÓ AGENT — "X vs Y" örökzöld cikkek a topics-sorból
// ===================================================================
//
// User-ötlet (2026-07-08): "ChatGPT vs Gemini vs Claude — melyiket válaszd?"
// típusú oldalak a legkeresettebb AI-témák közé tartoznak. Hetente EGY
// készül (szerdán), a topics.json sorából. ŐSZINTESÉG-SZABÁLY: nincs
// kitalált ár és nincs konkrét funkció-ígéret — az változik; az AI csak
// általános, tartós jellemzőkről ír, és a hivatalos oldalra irányít.
//
// A kimenet sima WRITER_ vázlat → normál Ellenőrző-kapu → fordító → social.
//
// FUTTATÁS:  node agents/compare/agent.js [--force] [--dry]
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DRAFTS_DIR = join(ROOT, 'content', 'drafts');
const TOPICS_PATH = join(__dirname, 'topics.json');
const STATE_PATH = join(ROOT, 'memory', 'compare-state.json');
const AGENT_NAME = 'compare';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY = args.includes('--dry');

let SITE_URL = 'https://aiworldhq.com';
try { SITE_URL = (JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8')).company.website_url || SITE_URL).replace(/\/$/, ''); } catch { /* marad az alap */ }

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + String(Math.ceil((((t - y) / 86400000) + 1) / 7)).padStart(2, '0');
}

function guard() {
  if (FORCE) return true;
  if (new Date().getUTCDay() !== 3) { console.log('⏭️  Összehasonlító: nem szerda van — kihagyom.'); return false; }
  try {
    const s = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    if (s.last_week === isoWeek()) { console.log('⏭️  Összehasonlító: ezen a héten már készült.'); return false; }
  } catch { /* első futás */ }
  return true;
}

const SYSTEM_PROMPT = `You are the Comparison Writer for AI World HQ (aiworldhq.com), a site that explains AI for everyday people. (Primary audience: the United States — but written so ANYONE, anywhere can read it; never address readers by nationality and never say "here in <country>".) Plain, warm, jargon-free English; every technical word explained on first use.

HONESTY RULES (mandatory):
- NEVER state specific prices, version numbers or feature lists that change over time. Instead say things like "both have a free version — check the official site for current plans".
- NEVER invent screenshots, menu names or UI details.
- Be genuinely balanced: every tool in the comparison must get real strengths AND a real limitation.
- The reader should finish knowing WHICH tool suits WHICH kind of person — not "they are all great".`;

function buildPrompt(topic) {
  return `Write an evergreen comparison article for everyday readers.

TOPIC: ${topic.title}
COMPARING: ${topic.items.join(' · ')}
READER: ${topic.angle}

REQUIREMENTS:
- Start with YAML frontmatter EXACTLY like this (keep the exact title):
---
title: "${topic.title}"
subtitle: "<one friendly sentence promising an honest, plain-language comparison>"
category: "how-to"
audience: "both"
read_time_minutes: 5
tags: ["comparison"]
---
- Immediately after the closing "---" of the frontmatter, repeat the title as an H1 markdown heading on its own line: # ${topic.title}
- Warm 2-3 sentence intro: why this choice feels confusing, and that there is no single "best" — only the best FOR YOU.
- One "## <tool name>" section per tool: what it feels like to use, 2 real strengths, 1 honest limitation (3-5 sentences each).
- A "## Side by side" section with a markdown table: rows = what matters to a normal person (ease for beginners, writing help, works with your other apps, free version), columns = the tools. Keep cells SHORT (2-5 words).
- A "## Which one is right for you?" section: 3-4 one-sentence persona recommendations ("If you ..., pick ...").
- Finish with a "## What this means for you" section (3-4 sentences: reassure the reader they can start free, switch any time, and that trying one for a week beats reading ten reviews).
- 800-1100 words. Output the markdown only — no commentary.`;
}

function selfCheck(text) {
  if (!text) return false;
  const hasFm = text.trimStart().startsWith('---');
  const hasH1 = /^#\s+.+$/m.test(text);              // az Ellenőrző auto-check NO_H1 kapuja!
  const hasImpact = /what this means for you/i.test(text);
  const hasTable = /\|.+\|.+\|/.test(text);
  return hasFm && hasH1 && hasImpact && hasTable;
}

async function main() {
  console.log('⚖️  ÖSSZEHASONLÍTÓ AGENT INDUL');
  console.log('─'.repeat(60));
  if (!guard()) return;

  let topicsData;
  try { topicsData = JSON.parse(readFileSync(TOPICS_PATH, 'utf-8')); }
  catch (e) { console.log('💥 topics.json nem olvasható: ' + e.message); return; }
  const topic = (topicsData.topics || []).find(t => !t.done);
  if (!topic) { console.log('💤 Minden összehasonlító téma kész — nincs teendő. (Új témát a topics.json-ba vehetsz fel.)'); return; }
  console.log(`   📋 Téma: ${topic.title}`);

  const prompt = buildPrompt(topic);
  let response = await ask(prompt, { agentName: AGENT_NAME, systemPrompt: SYSTEM_PROMPT, maxTokens: 3500 });
  if (response && !selfCheck(response.text)) {
    console.log('   ↻ Hiányos szerkezet (frontmatter / táblázat / záró szekció) — újrapróbálom nyomatékkal...');
    const retry = await ask(prompt + `\n\n⚠️ CRITICAL: You MUST include (1) the YAML frontmatter, (2) an H1 heading line "# ${topic.title}" right after the frontmatter, (3) a markdown TABLE in the "## Side by side" section, and (4) a "## What this means for you" H2 section. Write the complete article again.`,
      { agentName: AGENT_NAME, systemPrompt: SYSTEM_PROMPT, maxTokens: 3500 });
    if (retry && selfCheck(retry.text)) { retry.costUsd += response.costUsd; response = retry; }
  }
  if (!response || !selfCheck(response.text)) {
    console.log('💥 Nem sikerült jó összehasonlítót írni — marad jövő hétre.');
    // Bukás-számláló (2026-07-13): 2 egymást követő bukás a Főnök-asztalra kerül
    try {
      let st = {}; try { st = JSON.parse(readFileSync(STATE_PATH, 'utf-8')); } catch { /* első futás */ }
      st.consecutive_failures = (st.consecutive_failures || 0) + 1;
      writeFileSync(STATE_PATH, JSON.stringify(st, null, 2), 'utf-8');
      const { remember } = await import('../../core/memory-manager.js');
      remember(AGENT_NAME, 'Az összehasonlító cikk önellenőrzésen bukott — a táblázat + H1 már az első vázlatban legyen kész.');
    } catch { /* a számláló nem kritikus */ }
    return;
  }

  if (DRY) {
    console.log('\n===== PRÓBA (nem mentem el) =====\n' + response.text.slice(0, 1500) + '\n... (levágva)');
    console.log(`\n💰 Költség: $${response.costUsd.toFixed(4)} | ${response.provider}/${response.model}`);
    return;
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safe = topic.id.replace(/[^a-z0-9-]/g, '');
  const filename = `WRITER_${ts}_aiworld-editorial_Compare_${safe}.json`;
  const out = {
    _meta: {
      written_at: new Date().toISOString(),
      writer_provider: response.provider,
      writer_model: response.model,
      writer_cost_usd: response.costUsd,
      original_draft: null,
      source_id: 'aiworld-editorial',
      source_name: 'AI World HQ Editorial',
      source_link: SITE_URL,
      status: 'awaiting-review'
    },
    article_markdown: response.text,
    original_title: topic.title
  };
  writeFileSync(join(DRAFTS_DIR, filename), JSON.stringify(out, null, 2), 'utf-8');

  // A témát lezárjuk, a heti állapotot rögzítjük
  topic.done = true;
  topic.written_at = new Date().toISOString();
  try { writeFileSync(TOPICS_PATH, JSON.stringify(topicsData, null, 2), 'utf-8'); } catch { /* nem kritikus */ }
  try { writeFileSync(STATE_PATH, JSON.stringify({ last_week: isoWeek(), topic: topic.id, consecutive_failures: 0 }, null, 2), 'utf-8'); } catch { /* nem kritikus */ }
  console.log(`✅ Összehasonlító vázlat kész → ${filename} (az Ellenőrző kapuja következik) | $${response.costUsd.toFixed(4)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 COMPARE HIBA:', e); process.exit(1); });
