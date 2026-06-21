// ===================================================================
// ÚTMUTATÓ AGENT (Guide Agent)
// ===================================================================
//
// FELADAT:
//   Gyakorlati, LÉPÉSRŐL-LÉPÉSRE útmutatókat ír a hétköznapi embereknek
//   (pl. "hogyan írj promptot", cégenkénti kezdő-útmutatók). NEM hír —
//   időtálló, tanító tartalom. Forrás: guides/guide-topics.json (szerkeszthető).
//
//   A kész útmutató a content/drafts/-be kerül WRITER_GUIDE_* néven,
//   _meta.type='guide' jelzéssel → ugyanúgy átmegy az Ellenőrző + pipeline-on.
//
// FUTTATÁS:
//   node agents/guide/agent.js                 -- a legrégebbi 'todo' téma
//   node agents/guide/agent.js --id prompt-basics
//   node agents/guide/agent.js --title "How to ..."
//   node agents/guide/agent.js --limit 3       -- több téma egymás után
//
// FŐ ELV: EREDETI tartalom. A cégek doksiját csak ihletként — sosem másoljuk.
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { recallSemantic } from '../../core/memory-manager.js';
import { skillsBlock } from '../../core/skills.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DRAFTS_DIR = join(ROOT, 'content', 'drafts');
const LOGS_DIR = join(ROOT, 'logs');
const SHARED_DIR = join(ROOT, 'shared');
const TOPICS_PATH = join(ROOT, 'guides', 'guide-topics.json');
const AGENT_NAME = 'guide';

// ---- argumentumok ----
function parseArgs() {
  const a = process.argv.slice(2);
  const p = { id: null, title: null, limit: 1 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--id' && a[i + 1]) { p.id = a[++i]; }
    else if (a[i] === '--title' && a[i + 1]) { p.title = a[++i]; }
    else if (a[i] === '--limit' && a[i + 1]) { p.limit = parseInt(a[++i], 10) || 1; }
  }
  return p;
}

function loadBrandContext() {
  const parts = [];
  for (const f of ['company-info.md', 'style-guide.md', 'legal-rules.md']) {
    const path = join(SHARED_DIR, f);
    if (existsSync(path)) parts.push(`=== ${f} ===\n${readFileSync(path, 'utf-8')}`);
  }
  return parts.join('\n\n');
}

function loadTopics() {
  return JSON.parse(readFileSync(TOPICS_PATH, 'utf-8'));
}
function saveTopics(data) {
  writeFileSync(TOPICS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// Mely témá(ka)t dolgozzuk fel?
function pickTopics(store, args) {
  if (args.id) return store.topics.filter(t => t.id === args.id);
  if (args.title) return store.topics.filter(t => t.title === args.title);
  return store.topics.filter(t => t.status !== 'done').slice(0, args.limit);
}

async function loadLessons() {
  const hits = await recallSemantic('guide structure clarity steps beginners common mistakes rejection', { scope: 'guide', limit: 6 });
  if (!hits.length) return '';
  const reasons = [...new Set(hits.map(h => h.text))].slice(0, 8);
  return `\n\nLESSONS FROM PAST FEEDBACK (avoid these):\n${reasons.map(r => `- ${r}`).join('\n')}`;
}

const GUIDE_SYSTEM_PROMPT = `You are the Guide Agent for AI World Co., a site that teaches everyday people how to use AI in daily life. (Primary audience: Australia — but written so ANYONE can read it; do not address "Australians" or say "here in Australia".)

YOUR JOB: write an ORIGINAL, practical, STEP-BY-STEP guide (a mini tutorial/presentation) that a complete beginner can follow.

⚠️ ORIGINALITY (most important): You may name the real tool/company you are teaching about (e.g. ChatGPT, Gemini, Claude). But DO NOT copy, paraphrase or quote any company's documentation, help pages or marketing. Write our OWN clear, friendly explanation from scratch. No "Source:" line, no external links.

TONE & RULES:
- Australian English (colour, organise, centre). Warm, encouraging, teaching voice. No clichés.
- Explain EVERY technical term the first time, in plain words with a relatable analogy.
- Be concrete and practical. Every step should be something the reader can actually DO.
- NEVER put any company or product down. Be neutral and kind, especially in comparisons.
- No invented facts, fake numbers, or made-up menu items. If a UI detail may vary, say so ("look for a button like…").
- Safe: no medical/financial/legal advice, no politics.

OUTPUT FORMAT: Markdown with YAML frontmatter, then the guide body, in EXACTLY this shape:
---
title: "Clear, descriptive title (60-80 chars)"
subtitle: "One practical, benefit-focused sentence (100-150 chars)"
category: "guide"
audience: "personal" | "business" | "both"
company: "OpenAI"          # the company, or "" if general
tool: "ChatGPT"            # the tool, or "" if general
level: "beginner" | "intermediate"
read_time_minutes: 4
tags: ["getting-started", "chatgpt"]
---

# Title

**Hook (1-2 sentences):** what the reader will be able to do by the end, and who this is for.

## Before you start
- 1-3 quick prerequisites (an account, the app, etc.). Keep it short.

## Step 1 — <short action>
Plain-language explanation of what to do and why.
💬 Example: a concrete example the reader can copy.

## Step 2 — <short action>
…(write 3 to 6 numbered steps total; each with a 💬 Example where helpful)…

## Common mistakes
- 2-3 short, friendly "watch out for…" points.

## What this means for you
- **In everyday life:** a concrete personal use.
- **For your business or work:** a concrete professional use.
- **If you're just getting started:** the easiest first move.

## Try it now
One concrete action the reader can take in the next 2 minutes.

Write 450-800 words. Output ONLY the markdown — no commentary.`;

function buildUserPrompt(topic, brandContext, lessons, skills) {
  const subject = topic.company || topic.tool
    ? `Tool/company: ${[topic.company, topic.tool].filter(Boolean).join(' — ')}`
    : `General topic (not tied to one company)`;
  return `Write a complete, ORIGINAL step-by-step guide.

GUIDE TITLE TO WRITE: "${topic.title}"
${subject}
Audience: ${topic.audience} · Level: ${topic.level || 'beginner'}
Angle / what to focus on (a hint, write it in your own words): ${topic.angle || ''}

Follow the exact output format from your instructions (frontmatter + Before you start + numbered Steps + Common mistakes + What this means for you + Try it now). Keep it beginner-friendly and genuinely useful.

BRAND CONTEXT (must follow):
${brandContext}${lessons}${skills}

Now write the guide. Output the markdown only.`;
}

// Kötelező szerkezet megléte (a self-checkhez + a pipeline-kompatibilitáshoz)
function hasGuideStructure(md) {
  if (!md) return false;
  const fm = md.trimStart().startsWith('---');
  const impact = /what this means for you/i.test(md);
  const steps = (md.match(/^##\s*Step\s*\d/gim) || []).length >= 2;
  return fm && impact && steps;
}

function slugify(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function saveGuide(topic, response) {
  if (!existsSync(DRAFTS_DIR)) mkdirSync(DRAFTS_DIR, { recursive: true });
  const filename = `WRITER_GUIDE_${topic.id || slugify(topic.title)}.json`;
  const out = {
    _meta: {
      type: 'guide',
      guide_topic_id: topic.id || null,
      company: topic.company || '',
      tool: topic.tool || '',
      icon: topic.icon || '',
      level: topic.level || 'beginner',
      written_at: new Date().toISOString(),
      writer_provider: response.provider,
      writer_model: response.model,
      writer_cost_usd: response.costUsd,
      source_id: 'guide', source_name: 'AI World Guide', source_link: '',
      status: 'awaiting-review'
    },
    article_markdown: response.text,
    original_title: topic.title
  };
  writeFileSync(join(DRAFTS_DIR, filename), JSON.stringify(out, null, 2), 'utf-8');
  return filename;
}

async function writeGuide(topic, brandContext) {
  const lessons = await loadLessons();
  const skills = skillsBlock('guide');
  const userPrompt = buildUserPrompt(topic, brandContext, lessons, skills);

  let response = await ask(userPrompt, { agentName: AGENT_NAME, systemPrompt: GUIDE_SYSTEM_PROMPT, maxTokens: 3000 });
  if (response && !hasGuideStructure(response.text)) {
    console.log('   ↻ Hiányos szerkezet — újrapróbálom nyomatékkal...');
    const retry = await ask(userPrompt + `\n\n⚠️ CRITICAL: Use YAML frontmatter (---), at least 2 "## Step N — …" headings, and a "## What this means for you" section. Write the full guide again.`,
      { agentName: AGENT_NAME, systemPrompt: GUIDE_SYSTEM_PROMPT, maxTokens: 3000 });
    if (retry && hasGuideStructure(retry.text)) { retry.costUsd += response.costUsd; response = retry; }
  }
  return response;
}

async function main() {
  const args = parseArgs();
  console.log('📘 ÚTMUTATÓ AGENT INDUL');
  console.log('─'.repeat(60));

  const brandContext = loadBrandContext();
  const store = loadTopics();
  const topics = pickTopics(store, args);

  if (!topics.length) {
    console.log('💤 Nincs feldolgozandó téma (vagy mind "done"). Adj hozzá a guides/guide-topics.json-ban, vagy --id-val kérj egyet.');
    return;
  }
  console.log(`🎯 Feldolgozandó útmutató: ${topics.length}\n`);

  const stats = { started_at: new Date().toISOString(), written: 0, failed: 0, total_cost_usd: 0, by_guide: [] };

  for (const topic of topics) {
    console.log(`📝 Útmutató: "${topic.title.slice(0, 60)}..."${topic.company ? ` [${topic.company}]` : ''}`);
    const response = await writeGuide(topic, brandContext);
    if (!response) { console.log('   ❌ Sikertelen (router null)\n'); stats.failed++; continue; }

    const filename = saveGuide(topic, response);
    stats.total_cost_usd += response.costUsd || 0;
    stats.written++;
    stats.by_guide.push({ id: topic.id, file: filename, cost: response.costUsd });

    // témát 'done'-ra állítjuk (az élő topics.json-ban)
    const t = store.topics.find(x => x.id === topic.id);
    if (t) { t.status = 'done'; t.written_at = new Date().toISOString(); }

    console.log(`   ✅ Kész → ${filename} ($${(response.costUsd || 0).toFixed(4)}, ${response.model})\n`);
  }
  saveTopics(store);

  // log
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  stats.finished_at = new Date().toISOString();
  writeFileSync(join(LOGS_DIR, `guide_${stats.started_at.replace(/[:.]/g, '-')}.json`), JSON.stringify(stats, null, 2), 'utf-8');

  console.log('─'.repeat(60));
  console.log(`📊 ÖSSZEFOGLALÓ: ${stats.written} útmutató megírva, ${stats.failed} sikertelen | költség $${stats.total_cost_usd.toFixed(4)}`);
  if (stats.written > 0) console.log(`✨ ${stats.written} útmutató vár az Ellenőrzőre (WRITER_GUIDE_* a content/drafts-ban)`);
}

main().catch(e => { console.error('💥 ÚTMUTATÓ HIBA:', e); process.exit(1); });
