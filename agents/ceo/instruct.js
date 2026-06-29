// ===================================================================
// FŐNÖK (instruct.js) — Telegram → CEO, INTELLIGENS "agy"
// ===================================================================
//
// A felhasználó Telegram-üzenetét egy LLM-"agy" dolgozza fel, amely ISMERI a
// cég ÉLŐ adatait (hány hír/útmutató, cégenkénti bontás, mai költés), valódi
// MANAGER-személyiséggel válaszol, és ha kell, AKCIÓT indít (útmutató-írás,
// pipeline-futás). Nem merev parancs-felismerő, hanem beszélgető főnök.
//
// FUTTATÁS:
//   node agents/ceo/instruct.js "írj útmutatót az AI-adóbevallásról"
//   TELEGRAM_TEXT="mi a helyzet?" node agents/ceo/instruct.js
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { ask } from '../../core/ai-router.js';
import { sendMessage } from '../../core/telegram.js';
import { budgetStatus } from '../../core/budget.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const TOPICS_PATH = join(ROOT, 'guides', 'guide-topics.json');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
const SITE_URL = (CONFIG.company?.website_url || 'https://aiworldco.pages.dev').replace(/\/$/, '');

const TEXT = (process.argv.slice(2).join(' ').trim()) || (process.env.TELEGRAM_TEXT || '').trim();

function slugify(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function normCompany(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// Gyerek-folyamat futtatása (agent vagy parancs)
function sh(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd: ROOT, env: process.env, shell: false });
    let out = '';
    proc.stdout.on('data', d => { const s = d.toString(); out += s; process.stdout.write(s); });
    proc.stderr.on('data', d => { const s = d.toString(); out += s; process.stderr.write(s); });
    proc.on('close', code => resolve({ code, out }));
    proc.on('error', e => resolve({ code: -1, out: out + '\n' + e.message }));
  });
}
const node = (script, args = []) => sh('node', [script, ...args]);

// ===================================================================
// ÉLŐ CÉG-KONTEXTUS — ezt kapja az "agy", hogy okosan válaszolhasson
// ===================================================================
function gatherContext() {
  const TODAY = new Date().toISOString().slice(0, 10);
  let news = 0, guides = 0, today = 0;
  const perCompany = {};
  const recent = [];
  if (existsSync(ARTICLES_DIR)) {
    const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
        const isGuide = d._meta?.type === 'guide';
        if (isGuide) guides++; else news++;
        if ((d._meta?.published_at || '').slice(0, 10) === TODAY) today++;
        if (isGuide && d._meta?.company) perCompany[d._meta.company] = (perCompany[d._meta.company] || 0) + 1;
        recent.push({ t: d._meta?.published_at || '', title: (d.original_title || '').slice(0, 60), guide: isGuide });
      } catch { /* skip */ }
    }
  }
  let backlog = 0;
  try { backlog = JSON.parse(readFileSync(TOPICS_PATH, 'utf-8')).topics.filter(t => t.status !== 'done').length; } catch { /* */ }
  const b = budgetStatus();
  const perCo = Object.entries(perCompany).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(', ') || '(nincs)';
  const last = recent.sort((a, b) => (b.t || '').localeCompare(a.t || '')).slice(0, 5)
    .map(r => `• ${r.guide ? '📘' : '📰'} ${r.title}`).join('\n');

  return `Site: ${SITE_URL}
Published — news: ${news}, guides: ${guides}, today: ${today}
Guides per company: ${perCo}
Guide backlog (queued, not yet written): ${backlog}
Paid AI spend — today: $${b.today.toFixed(2)}, this month: $${b.month.toFixed(2)} (final stop $${b.monthHardCap})
Daily limits: news ${CONFIG.limits?.daily_articles_max}, guides ${CONFIG.limits?.daily_guides_max}/day
Recently published:
${last || '(none yet)'}`;
}

// ===================================================================
// AZ "AGY" — manager-személyiség + akció-döntés egy hívásban
// ===================================================================
const CEO_PERSONA = `You are "a főnök" — the manager/CEO of AI World Co., an automated website that publishes AI news and beginner-friendly how-to GUIDES for everyday people (audience: Australia, plain English). You report to the OWNER (Pacsai), who chats with you on Telegram.

WHO YOU ARE: a sharp, warm, proactive right-hand manager. You speak HUNGARIAN to the owner. Keep replies short and human (usually 1-4 sentences), a little personality and the odd emoji is fine — never robotic, never templated, never a wall of text. You genuinely understand the business and the live numbers you're given.

WHAT YOU CAN ACTUALLY DO (set "action"):
- "write_guide" — the owner wants a new how-to guide. Extract: topic (what it's about), company (a tool's maker or ""), tool (the product or ""), audience ("personal"|"business"|"both"). The guide gets written, checked, illustrated and published automatically (~1-2 min).
- "run_pipeline" — fetch the latest news now and publish/refresh the site.
- "none" — EVERYTHING ELSE: questions, status, budget, ideas, opinions, explanations, small talk, OR things not wired yet (changing design / schedule / sources / code is coming in a later phase). For "none", put your FULL, helpful, natural answer in "reply", grounded in the live data below.

RULES:
- News is only written from official company sources — you can't fabricate a news story on an arbitrary topic. If they ask for "news about X", offer a GUIDE on X, or run the pipeline for the latest real news. Explain briefly, don't just refuse.
- If they ask for something not yet possible (e.g. "change the colours", "post every 2 hours"), say it's coming in the next phase, and offer what you CAN do now. Be helpful, not dismissive.
- Use the real numbers when asked about status/spend/coverage. Don't invent figures.

OUTPUT: ONLY a JSON object:
{"action":"write_guide|run_pipeline|none","topic":"","company":"","tool":"","audience":"both","reply":"<your natural Hungarian reply>"}
For write_guide/run_pipeline, "reply" is a short, warm acknowledgement (the result will be sent after). For none, "reply" is the complete answer.`;

function parseJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

async function think(text) {
  const ctx = gatherContext();
  const r = await ask(
    `LIVE COMPANY DATA:\n${ctx}\n\nThe owner just wrote: "${text}"\n\nDecide the action and write your reply. JSON only.`,
    { agentName: 'boss', systemPrompt: CEO_PERSONA, maxTokens: 800, jsonMode: true }
  );
  return parseJson(r?.text) || { action: 'none', reply: 'Bocs, ezt most nem értettem tisztán — átfogalmaznád? 🙂' };
}

// ===================================================================
// AKCIÓK
// ===================================================================
async function buildAndDeploy() {
  await node('website/build.js');
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    await sh('npx', ['--yes', 'wrangler', 'pages', 'deploy', 'website/public',
      '--project-name=aiworldco', '--branch=main', '--commit-dirty=true']);
  } else {
    console.log('ℹ️  Deploy kihagyva (nincs CLOUDFLARE_API_TOKEN) — csak build.');
  }
}

async function doWriteGuide(p) {
  const topic = (p.topic || '').trim();
  if (!topic) return '🤔 Miről írjak útmutatót? Mondj egy témát, pl. „az AI-adóbevallásról".';

  const title = topic.length > 70 ? topic.slice(0, 70) : topic;
  const base = slugify('req-' + topic);
  const store = JSON.parse(readFileSync(TOPICS_PATH, 'utf-8'));
  let uid = base, n = 2; while (store.topics.some(t => t.id === uid)) uid = `${base}-${n++}`;
  store.topics.push({
    id: uid, company: p.company || '', tool: p.tool || '',
    title: title[0] ? title[0].toUpperCase() + title.slice(1) : title,
    audience: ['personal', 'business', 'both'].includes(p.audience) ? p.audience : 'both',
    level: 'beginner',
    angle: `Requested by the owner via Telegram: ${topic}. Make it genuinely practical for a beginner.`,
    status: 'todo', icon: '⭐', priority: 'requested',
    requested_at: new Date().toISOString(), proposed_by: 'telegram-owner'
  });
  writeFileSync(TOPICS_PATH, JSON.stringify(store, null, 2), 'utf-8');

  await node('agents/guide/agent.js', ['--id', uid]);
  await node('agents/ellenorzo/agent.js');
  await node('agents/designer/agent.js');
  await buildAndDeploy();

  const published = existsSync(join(ARTICLES_DIR, `ARTICLE_GUIDE_${uid}.json`));
  const page = (p.company || p.tool) ? `${SITE_URL}/tools` : `${SITE_URL}/guides`;
  if (published) return `✅ Kész, megírtam és kiraktam: *${title}*\n👉 ${page}\nKéred még valamiről? 🙂`;
  return `📝 Megírtam (*${title}*), de az ellenőrzőn még csiszolni kell — a következő körben élesedik. (${page})`;
}

async function doRunPipeline() {
  const r = await node('agents/ceo/agent.js');
  const m = r.out.match(/(\d+)\s*hír\s*\+\s*(\d+)\s*útmutató élesben/i);
  if (m) return `✅ Lefuttattam: ${m[1]} hír + ${m[2]} útmutató élesben.\n👉 ${SITE_URL}`;
  if (/LIMIT ELÉRVE|keret is betelt/i.test(r.out)) return `ℹ️ Lefutott, de a mai keret már betelt — holnap újra termel. 👉 ${SITE_URL}`;
  return `✅ Lefuttattam a pipeline-t. 👉 ${SITE_URL}`;
}

// ===================================================================
// FŐ
// ===================================================================
async function main() {
  console.log('👔 FŐNÖK (intelligens) — parancs:', TEXT || '(üres)');
  if (!TEXT) { await sendMessage('Szia! Itt a főnök 👔 Mit csináljunk? (pl. „mi a helyzet?", „írj útmutatót X-ről", „fuss most")'); return; }

  const brain = await think(TEXT);
  console.log('🧠 Döntés:', JSON.stringify({ action: brain.action, topic: brain.topic, company: brain.company }));

  let reply;
  if (brain.action === 'write_guide' && (brain.topic || '').trim()) {
    reply = await doWriteGuide(brain);
  } else if (brain.action === 'run_pipeline') {
    reply = await doRunPipeline();
  } else {
    reply = brain.reply || 'Itt vagyok — mondd, mit csináljunk! 🙂';
  }
  await sendMessage(reply);
  console.log('💬 Válasz:', reply.slice(0, 100));
}

main().catch(async (e) => {
  console.error('💥 FŐNÖK HIBA:', e);
  await sendMessage(`⚠️ Hiba történt: ${e.message}. Próbáld újra, vagy fogalmazd át. 🙏`);
  process.exit(1);
});
