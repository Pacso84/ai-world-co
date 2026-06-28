// ===================================================================
// FŐNÖK PARANCS-ÉRTELMEZŐ (instruct.js) — Telegram → CEO
// ===================================================================
//
// A felhasználó Telegram-üzenetét (szabad szöveg) ÉRTELMEZI, a megfelelő
// agentre/akcióra osztja, végrehajtja, majd Telegramon VISSZAÍR az eredménnyel.
// A GitHub Action (telegram-command.yml) hívja, a parancs szövegével.
//
// FUTTATÁS:
//   node agents/ceo/instruct.js "írj útmutatót az AI-adóbevallásról"
//   TELEGRAM_TEXT="mi a helyzet?" node agents/ceo/instruct.js
//
// FÁZISOK: most az 1. (tartalom + futás + állapot + súgó). A 2-3. fázis
//   (beállítás- és kód-parancsok + biztonsági háló) ide épül rá később.
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { ask } from '../../core/ai-router.js';
import { sendMessage } from '../../core/telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const TOPICS_PATH = join(ROOT, 'guides', 'guide-topics.json');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
const SITE_URL = (CONFIG.company?.website_url || 'https://aiworldco.pages.dev').replace(/\/$/, '');

// A parancs szövege: argv vagy env
const TEXT = (process.argv.slice(2).join(' ').trim()) || (process.env.TELEGRAM_TEXT || '').trim();

function slugify(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// Gyerek-folyamat futtatása (agent vagy parancs), kimenet visszaadva
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
// SZÁNDÉK-ÉRTELMEZÉS (LLM)
// ===================================================================
const INTERPRET_SYSTEM = `You are the CEO of AI World Co. (an AI-news + guides website). The owner sends you short instructions in Hungarian or English. Classify the instruction into ONE intent and extract parameters. Reply ONLY with JSON.

Intents:
- "write_guide": write a step-by-step GUIDE. params: topic (string, the guide subject), company (string or ""), tool (string or ""), audience ("personal"|"business"|"both").
- "run_pipeline": run the full pipeline now (find news + write + publish). no params.
- "status": report what's going on (counts, last run). no params.
- "help": the owner asks what they can do, or is just greeting. no params.
- "other": anything else (config/design/code changes) — NOT yet supported in this phase. params: note (short restatement).

Examples:
"írj útmutatót az AI-adóbevallásról" -> {"intent":"write_guide","topic":"using AI to help with tax returns","company":"","tool":"","audience":"both"}
"csinálj egy ChatGPT kezdő útmutatót" -> {"intent":"write_guide","topic":"ChatGPT for beginners","company":"OpenAI","tool":"ChatGPT","audience":"both"}
"fuss most" -> {"intent":"run_pipeline"}
"mi a helyzet?" -> {"intent":"status"}
"szia" -> {"intent":"help"}
"írd át a főoldal színeit kékre" -> {"intent":"other","note":"change homepage colors to blue"}

Output EXACTLY one JSON object, no prose.`;

function parseJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

async function interpret(text) {
  const r = await ask(`Instruction: "${text}"\n\nClassify and extract. Output JSON only.`,
    { agentName: 'ceo', systemPrompt: INTERPRET_SYSTEM, maxTokens: 300, jsonMode: true });
  return parseJson(r?.text) || { intent: 'help' };
}

// ===================================================================
// SEGÉD: build + deploy (a tartalom élesre tétele)
// ===================================================================
async function buildAndDeploy() {
  await node('website/build.js');
  // Cloudflare Pages deploy (a workflow adja a CLOUDFLARE_API_TOKEN-t)
  if (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) {
    await sh('npx', ['--yes', 'wrangler', 'pages', 'deploy', 'website/public',
      '--project-name=aiworldco', '--branch=main', '--commit-dirty=true']);
  } else {
    console.log('ℹ️  Deploy kihagyva (nincs CLOUDFLARE_API_TOKEN) — csak build.');
  }
}

// ===================================================================
// INTENT HANDLEREK
// ===================================================================

async function handleWriteGuide(p) {
  const topic = (p.topic || '').trim();
  if (!topic) return '🤔 Nem értettem, miről írjak útmutatót. Próbáld pl.: „írj útmutatót az AI-adóbevallásról".';

  const title = topic.length > 70 ? topic.slice(0, 70) : topic;
  const id = slugify('req-' + topic);
  const store = JSON.parse(readFileSync(TOPICS_PATH, 'utf-8'));
  // ha már van ilyen id, egyedivé tesszük
  let uid = id, n = 2; while (store.topics.some(t => t.id === uid)) uid = `${id}-${n++}`;
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

  // megírás → ellenőrzés → kép → build+deploy
  await node('agents/guide/agent.js', ['--id', uid]);
  await node('agents/ellenorzo/agent.js');
  await node('agents/designer/agent.js');
  await buildAndDeploy();

  // publikálódott-e? (ARTICLE_GUIDE_<id>.json a content/articles-ban)
  const published = existsSync(join(ARTICLES_DIR, `ARTICLE_GUIDE_${uid}.json`));
  const page = (p.company || p.tool) ? `${SITE_URL}/tools` : `${SITE_URL}/guides`;
  if (published) {
    return `✅ Kész! Megírtam és kiraktam az útmutatót: *${title}*\n👉 ${page}`;
  }
  return `📝 Megírtam: *${title}*, de az ellenőrzőn még finomítani kell — a következő körben élesedik. (Nézd: ${page})`;
}

async function handleRunPipeline() {
  await sendMessage('⏳ Indítom a teljes pipeline-t (hírkeresés + írás + publikálás)… ez pár perc.');
  const r = await node('agents/ceo/agent.js');
  // próbáljuk kiolvasni az eredményt a kimenetből
  const m = r.out.match(/(\d+)\s*hír\s*\+\s*(\d+)\s*útmutató élesben/i);
  if (m) return `✅ Pipeline kész: ${m[1]} hír + ${m[2]} útmutató élesben.\n👉 ${SITE_URL}`;
  if (/LIMIT ELÉRVE|keret is betelt/i.test(r.out)) return `ℹ️ A pipeline lefutott, de a mai keret már betelt — holnap újra termel. 👉 ${SITE_URL}`;
  return `✅ Lefuttattam a pipeline-t. 👉 ${SITE_URL}`;
}

function handleStatus() {
  let news = 0, guides = 0, today = 0;
  const TODAY = new Date().toISOString().slice(0, 10);
  if (existsSync(ARTICLES_DIR)) {
    for (const f of readdirSync(ARTICLES_DIR).filter(x => x.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
        if (d._meta?.type === 'guide') guides++; else news++;
        if ((d._meta?.published_at || '').slice(0, 10) === TODAY) today++;
      } catch {}
    }
  }
  return `📊 *AI World Co. — állapot*\n• Hírek: ${news}\n• Útmutatók: ${guides}\n• Ma publikálva: ${today}\n• Élő oldal: ${SITE_URL}\n\nA felhő naponta többször magától dolgozik. Írj parancsot, és intézem! 👔`;
}

function handleHelp() {
  return `👔 *Szia! A főnök vagyok* — mondd, mit csináljunk:\n\n` +
    `• „*írj útmutatót <témáról>*" — pl. az AI-adóbevallásról\n` +
    `• „*írj egy kezdő útmutatót a ChatGPT-hez*"\n` +
    `• „*fuss most*" — azonnal keresek hírt és publikálok\n` +
    `• „*mi a helyzet?*" — összefoglaló\n\n` +
    `_(Hamarosan: dizájn, ütemezés és bármi más állítása is — szóban.)_`;
}

// ===================================================================
// FŐ
// ===================================================================
async function main() {
  console.log('👔 FŐNÖK PARANCS-ÉRTELMEZŐ');
  console.log('Parancs:', TEXT || '(üres)');
  if (!TEXT) { await sendMessage(handleHelp()); return; }

  const intent = await interpret(TEXT);
  console.log('🎯 Szándék:', JSON.stringify(intent));

  let reply;
  switch (intent.intent) {
    case 'write_guide':   reply = await handleWriteGuide(intent); break;
    case 'run_pipeline':  reply = await handleRunPipeline(); break;
    case 'status':        reply = handleStatus(); break;
    case 'help':          reply = handleHelp(); break;
    case 'other':
      reply = `🛠️ Ezt értem: „${intent.note || TEXT}". Ezt a fajta módosítást (dizájn/ütemezés/kód) a *2-3. fázisban* kötjük be — épp építjük. Addig tartalmat és futtatást kérhetsz.`;
      break;
    default:              reply = handleHelp();
  }
  await sendMessage(reply);
  console.log('💬 Válasz elküldve:', reply.slice(0, 80));
}

main().catch(async (e) => {
  console.error('💥 INSTRUCT HIBA:', e);
  await sendMessage(`⚠️ Hiba történt a parancs közben: ${e.message}. Próbáld újra, vagy fogalmazd át.`);
  process.exit(1);
});
