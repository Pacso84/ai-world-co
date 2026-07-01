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
const DISCOVERED_PATH = join(ROOT, 'agents', 'source-scout', 'discovered-sources.json');
const FEEDS_PATH = join(ROOT, 'sources', 'rss-feeds.json');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
const SITE_URL = (CONFIG.company?.website_url || 'https://aiworldco.pages.dev').replace(/\/$/, '');

const TEXT = (process.argv.slice(2).join(' ').trim()) || (process.env.TELEGRAM_TEXT || '').trim();

function slugify(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function normCompany(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// Gyerek-folyamat futtatása (agent vagy parancs) — ŐRKUTYÁVAL: ha a folyamat
// beragad (pl. lógó hálózati kapcsolat), 30 perc után leállítjuk, hogy a
// Telegram-válasz és a visszacommit akkor is megtörténjen (2026-07-01 tanulság).
const SH_TIMEOUT_MS = 30 * 60 * 1000;
function sh(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd: ROOT, env: process.env, shell: false });
    let out = '';
    const watchdog = setTimeout(() => {
      out += '\n⏱️ IDŐTÚLLÉPÉS — a beragadt folyamatot leállítottam.';
      console.log('⏱️  IDŐTÚLLÉPÉS (' + (SH_TIMEOUT_MS / 60000) + ' perc) — leállítom: ' + cmd + ' ' + args.join(' '));
      try { proc.kill('SIGKILL'); } catch { /* már nem él */ }
    }, SH_TIMEOUT_MS);
    proc.stdout.on('data', d => { const s = d.toString(); out += s; process.stdout.write(s); });
    proc.stderr.on('data', d => { const s = d.toString(); out += s; process.stderr.write(s); });
    proc.on('close', code => { clearTimeout(watchdog); resolve({ code, out }); });
    proc.on('error', e => { clearTimeout(watchdog); resolve({ code: -1, out: out + '\n' + e.message }); });
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

  // Fizetős költés providerenként (ma) + a paid kulcs limit-állapota (quota-state)
  const provToday = Object.entries(b.byProviderToday || {}).map(([p, v]) => `${p} $${Number(v).toFixed(3)}`).join(', ') || 'semmi fizetős ma';
  let limited = [];
  try {
    const q = JSON.parse(readFileSync(join(ROOT, 'core', 'quota-state.json'), 'utf-8'));
    const now = Date.now();
    limited = Object.entries(q).filter(([, v]) => v && new Date(v.until).getTime() > now).map(([m]) => m);
  } catch { /* */ }
  const paidStatus = limited.length
    ? `right now these models are rate-limited and skipped (so we're on free keys): ${limited.join(', ')}`
    : `the paid key is running fine, not rate-limited right now`;

  return `Site: ${SITE_URL}
Published — news: ${news}, guides: ${guides}, today: ${today}
Guides per company: ${perCo}
Guide backlog (queued, not yet written): ${backlog}
Daily limits: news ${CONFIG.limits?.daily_articles_max}, guides ${CONFIG.limits?.daily_guides_max}/day

=== BUDGET / "keret" ===
Paid AI spend today: $${b.today.toFixed(2)} (by provider: ${provToday})
Paid AI spend this month: $${b.month.toFixed(2)}
Paid-key status: ${paidStatus}
IMPORTANT: the paid Gemini plan is PAY-AS-YOU-GO — there is NO fixed "remaining quota" number we can see. We simply use it until it rate-limits, then auto-switch to the free keys. The $${b.monthHardCap}/month figure is ONLY a safety stop, not "how much is left".

Recently published:
${last || '(none yet)'}`;
}

// ===================================================================
// A CSAPAT — szerep-nevek; a Telegramon NÉV SZERINT szólíthatók
// ===================================================================
const TEAM = [
  { key: 'ceo', name: 'Főnök', emoji: '👔', role: 'irányít, delegál, összefoglal, dönt' },
  { key: 'rss-scraper', name: 'Hírgyűjtő', emoji: '📰', role: 'hivatalos forrásokból friss hírt gyűjt' },
  { key: 'iro', name: 'Újságíró', emoji: '✍️', role: 'a hírekből érthető cikket ír' },
  { key: 'guide', name: 'Útmutató-író', emoji: '📘', role: 'lépésről-lépésre útmutatókat ír' },
  { key: 'ellenorzo', name: 'Ellenőr', emoji: '🔍', role: 'minőség és pontosság ellenőrzése' },
  { key: 'designer', name: 'Grafikus', emoji: '🎨', role: 'fejlécképeket készít' },
  { key: 'web-designer', name: 'Honlap-szerkesztő', emoji: '🖥️', role: 'az oldal elrendezése/dizájnja' },
  { key: 'translator', name: 'Fordító', emoji: '🌍', role: 'a cikkeket lefordítja magyar/spanyol/német/francia nyelvre' },
  { key: 'fact-check', name: 'Tényellenőr', emoji: '✅', role: 'kiszűri a valótlan vagy elavult állításokat' },
  { key: 'pairing', name: 'Párosító', emoji: '🔗', role: 'hírhez kapcsolódó útmutatót párosít' },
  { key: 'seo', name: 'SEO-szakértő', emoji: '🔎', role: 'meta-leírás, kulcsszavak, keresőoptimalizálás' },
  { key: 'social', name: 'Közösségi média', emoji: '📣', role: 'Facebook/Instagram posztokat ír' },
  { key: 'api-expert', name: 'API-szakértő', emoji: '🔌', role: 'API-kulcsok, költség, üzemeltetés' },
  { key: 'analyst', name: 'Elemző', emoji: '📊', role: 'számok, trendek, javaslatok' },
  { key: 'source-scout', name: 'Forráskutató', emoji: '🧭', role: 'új hírforrásokat keres' },
  { key: 'publisher', name: 'Publikáló', emoji: '🚀', role: 'élesre teszi az oldalt (build + deploy)' }
];
const TEAM_BY_KEY = Object.fromEntries(TEAM.map(a => [a.key, a]));
const teamList = TEAM.map(a => `- ${a.key} = ${a.emoji} ${a.name}: ${a.role}`).join('\n');

// ===================================================================
// AZ "AGY" — csapat-tudatos: felismeri a megszólított agentet, az ő hangján felel
// ===================================================================
const TEAM_PERSONA = `You are the whole AI World Co. TEAM, answering the OWNER (Pacsai) on Telegram in HUNGARIAN. AI World Co. is an automated website publishing AI news + beginner how-to GUIDES for everyday people.

THE TEAM (the owner can address any member BY NAME/role):
${teamList}

HOW TO ANSWER:
- Figure out WHICH member the owner is talking to: if they address one by name/role (e.g. "Fordító, ...", "Útmutató-író, ...", "Ellenőr, ..."), that member answers. If they don't address anyone specific, the most relevant member answers; for general/strategy/status it's the Főnök. Set "agent" to that member's key.
- Reply in FIRST PERSON as that member, in their voice/expertise, Hungarian, short and human (1-4 sentences, a little personality, the odd emoji). Never robotic. Use the live data below; never invent numbers.

ACTIONS the team can actually perform now (set "action"):
- "write_guide" (Útmutató-író): write a new how-to guide. params: topic, company, tool, audience.
- "run_pipeline" (Hírgyűjtő/Újságíró/Főnök): fetch latest news + publish now.
- "translate" (Fordító): translate more articles into the other languages now.
- "find_sources" (Forráskutató): research NEW reliable, official news sources now. Use when the owner asks to look for / discover new sources/feeds. params: none.
- "approve_source" (Forráskutató): the owner APPROVES one of the discovered source suggestions to be added live. Use when they say things like "vedd fel a(z) X", "hagyd jóvá X-et", "jó lesz az X", "add hozzá X forrást". Put the source name in the "source" param.
- "status" / "budget" / "team" (Főnök): the answer is in "reply" (use live data; for "team" list the members).
- "none": anything else — questions, ideas, explanations, small talk, or not-yet-wired requests (changing design/schedule/code is a later phase). Put the full answer in "reply".

BUDGET note: the paid Gemini plan is pay-as-you-go — NO fixed "remaining" number; report what we've SPENT (today/month) + that we auto-switch to free keys; the $80/month is only a safety stop.
News is only from official sources — for an arbitrary topic, offer a GUIDE or run the pipeline.
ACCURACY: do NOT invent specific article titles, examples, company names or numbers you weren't given in the live data. If you don't have a concrete detail, speak generally about your role instead of making something up.

OUTPUT ONLY a JSON object:
{"agent":"<member key>","action":"write_guide|run_pipeline|translate|find_sources|approve_source|status|budget|team|none","topic":"","company":"","tool":"","source":"","audience":"both","reply":"<Hungarian reply in that member's voice>"}
For write_guide/run_pipeline/translate/find_sources/approve_source, "reply" is a short warm acknowledgement (the result follows). Otherwise "reply" is the full answer.`;

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
    `LIVE COMPANY DATA:\n${ctx}\n\nThe owner just wrote: "${text}"\n\nDecide which team member answers + the action, and write the reply. JSON only.`,
    { agentName: 'boss', systemPrompt: TEAM_PERSONA, maxTokens: 800, jsonMode: true }
  );
  return parseJson(r?.text) || { agent: 'ceo', action: 'none', reply: 'Bocs, ezt most nem értettem tisztán — átfogalmaznád? 🙂' };
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

async function doTranslate() {
  const r = await node('agents/translator/agent.js', ['--limit', '40']);
  await buildAndDeploy();
  const m = r.out.match(/Ford[íi]tva:\s*(\d+)/i);
  return `Haladtam a fordítással — ${m ? m[1] : 'néhány'} új fordítás kész, kiraktam. 🌍\n👉 ${SITE_URL}`;
}

async function doFindSources() {
  // --force: most azonnal kutasson (a throttle-t átugorja)
  await node('agents/source-scout/agent.js', ['--force']);
  let found = [];
  try { found = JSON.parse(readFileSync(DISCOVERED_PATH, 'utf-8')).discovered_sources || []; }
  catch { /* nincs fájl */ }

  if (found.length === 0) {
    return '🧭 Körülnéztem, de most nem találtam a megbízhatósági küszöböt elérő ÚJ hivatalos forrást — a meglévők lefedik a nagyokat. Később újra megnézem.';
  }
  const top = found.slice(0, 6)
    .map(d => `• *${d.name.replace(/\s*\(hivatalos\)$/, '')}* — megbízhatóság ${d.reliability_score}/100${d.last_post_age_days != null ? `, utolsó cikk ${d.last_post_age_days} napja` : ''}`)
    .join('\n');
  return `🧭 Találtam ${found.length} ÚJ, megbízható hivatalos forrást (csak elsődleges, ellenőrzött):\n${top}\n\nEgyiket sem kapcsoltam be magamtól — szólj, melyiket vegyem fel a forrásokhoz, és élesítem. ✅`;
}

async function doApproveSource(p) {
  const want = normCompany(p.source || p.company || p.topic || p.tool || '');
  if (!want) return '🤔 Melyik forrást vegyem fel? Mondd a nevét, pl. „vedd fel az IBM Research-t".';

  let disc;
  try { disc = JSON.parse(readFileSync(DISCOVERED_PATH, 'utf-8')); }
  catch { return 'Most nincs jóváhagyható javaslat-listám. Írd: „keress új forrásokat", és körülnézek. 🧭'; }
  const list = disc.discovered_sources || [];
  if (list.length === 0) return 'Üres a javaslat-lista. Írd: „keress új forrásokat", és hozok újakat. 🧭';

  // Egyezés normalizált név / id / domain-címke alapján (rugalmasan)
  const pick = list.find(d => {
    const n = normCompany(d.name), id = normCompany(d.suggested_id);
    return n.includes(want) || want.includes(id) || id === want || (id && want.includes(id));
  });
  if (!pick) {
    const names = list.map(d => '„' + d.name.replace(/\s*\(hivatalos\)$/, '') + '"').join(', ');
    return `Nem találom ezt a listámban. Amit jóvá tudsz hagyni: ${names}. Melyik legyen? 🙂`;
  }

  const feeds = JSON.parse(readFileSync(FEEDS_PATH, 'utf-8'));
  const dup = feeds.sources.some(s => {
    try { return new URL(s.url).hostname.replace(/^www\./, '') === new URL(pick.url).hostname.replace(/^www\./, ''); }
    catch { return false; }
  });
  if (dup) {
    disc.discovered_sources = list.filter(d => d !== pick);
    writeFileSync(DISCOVERED_PATH, JSON.stringify(disc, null, 2), 'utf-8');
    return `A(z) *${pick.name.replace(/\s*\(hivatalos\)$/, '')}* már a forrásaink között van — nincs teendő. ✅`;
  }

  feeds.sources.push({
    id: pick.suggested_id,
    name: pick.name,
    url: pick.url,
    category: pick.category || 'ai-company-official',
    priority: pick.priority || 3,
    language: pick.language || 'en',
    country: pick.country || '?',
    comment: `Telegramon JÓVÁHAGYVA (${new Date().toISOString().slice(0, 10)}), megbízhatóság ${pick.reliability_score || '?'}/100.`,
    enabled: true
  });
  writeFileSync(FEEDS_PATH, JSON.stringify(feeds, null, 2), 'utf-8');

  // Kivesszük a javaslatok közül (már élesítve)
  disc.discovered_sources = list.filter(d => d !== pick);
  writeFileSync(DISCOVERED_PATH, JSON.stringify(disc, null, 2), 'utf-8');

  const clean = pick.name.replace(/\s*\(hivatalos\)$/, '');
  return `✅ Felvettem és élesítettem: *${clean}*\n${pick.url}\nA következő hírgyűjtéskor már innen is figyelek! 🗞️`;
}

// ===================================================================
// FŐ
// ===================================================================
async function main() {
  console.log('🗣️  CSAPAT-BOT — parancs:', TEXT || '(üres)');
  if (!TEXT) { await sendMessage('Szia! 👋 A csapat itt van — szólíthatsz bárkit név szerint (pl. „Fordító", „Útmutató-író", „Ellenőr"), vagy csak mondd, mit csináljunk. „kik vagytok?" → bemutatkozunk.'); return; }

  const brain = await think(TEXT);
  const who = TEAM_BY_KEY[brain.agent] || TEAM_BY_KEY.ceo;
  console.log('🧠 Döntés:', JSON.stringify({ agent: brain.agent, action: brain.action, topic: brain.topic }));

  let reply;
  if (brain.action === 'write_guide' && (brain.topic || '').trim()) {
    reply = await doWriteGuide(brain);
  } else if (brain.action === 'run_pipeline') {
    reply = await doRunPipeline();
  } else if (brain.action === 'translate') {
    reply = await doTranslate();
  } else if (brain.action === 'find_sources') {
    reply = await doFindSources();
  } else if (brain.action === 'approve_source') {
    reply = await doApproveSource(brain);
  } else {
    reply = brain.reply || 'Itt vagyok — mondd, mit csináljunk! 🙂';
  }
  // a megszólított csapattag nevével/emojijával jelöljük, ki válaszol
  const out = `${who.emoji} *${who.name}:* ${reply}`;
  await sendMessage(out);
  console.log('💬 Válasz:', out.slice(0, 100));
}

main().catch(async (e) => {
  console.error('💥 FŐNÖK HIBA:', e);
  await sendMessage(`⚠️ Hiba történt: ${e.message}. Próbáld újra, vagy fogalmazd át. 🙏`);
  process.exit(1);
});
