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
import { sendMessage, loadChatHistory, appendChatHistory } from '../../core/telegram.js';
import { budgetStatus } from '../../core/budget.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const TOPICS_PATH = join(ROOT, 'guides', 'guide-topics.json');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const DISCOVERED_PATH = join(ROOT, 'agents', 'source-scout', 'discovered-sources.json');
const FEEDS_PATH = join(ROOT, 'sources', 'rss-feeds.json');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
const SITE_URL = (CONFIG.company?.website_url || 'https://aiworldhq.com').replace(/\/$/, '');

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

  // Jóváhagyásra váró forrás-javaslatok (a Forráskutatótól) — hogy az agy
  // tudja, mire vonatkozhat egy "vedd fel / mindet / az elsőt" válasz.
  let pendingSources = '(none)';
  try {
    const ds = JSON.parse(readFileSync(DISCOVERED_PATH, 'utf-8')).discovered_sources || [];
    if (ds.length) pendingSources = ds.map(d => `${d.name.replace(/\s*\(hivatalos\)$/, '')} [${d.reliability_score}/100]`).join(', ');
  } catch { /* nincs fájl */ }

  // VÉSZHÁLÓ-BIZONYÍTÉK (2026-07-22): ha egy CSAK-FIZETŐS agent ingyenes kulccsal
  // ment, az kemény jel, hogy a fizetős provider elesett. Enélkül a főnök korábban
  // azt válaszolta a tulajdonosnak, hogy "a fizetős kulcsok rendben működnek" —
  // miközben a Google-egyenleg épp kimerült. Bizonyíték nélkül ne állítson ilyet.
  let emergencyNote = 'no fallback recorded (no evidence of a paid-provider outage)';
  try {
    const em = JSON.parse(readFileSync(join(ROOT, 'memory', 'emergency-fallback-state.json'), 'utf-8'));
    if (em?.last_alert) {
      emergencyNote = `LAST ON ${em.last_alert}: agent "${em.agent}" ran on FREE ${em.provider}/${em.model}`;
    }
  } catch { /* nincs fájl = nem volt vészháló */ }

  return `Site: ${SITE_URL}
Published — news: ${news}, guides: ${guides}, today: ${today}
PENDING SOURCE SUGGESTIONS (found by Forráskutató, awaiting the owner's approval): ${pendingSources}
Guides per company: ${perCo}
Guide backlog (queued, not yet written): ${backlog}
Daily limits: news ${CONFIG.limits?.daily_articles_max}, guides ${CONFIG.limits?.daily_guides_max}/day

=== BUDGET / "keret" ===
Paid AI spend today: $${b.today.toFixed(2)} (by provider: ${provToday})
Paid AI spend this month: $${b.month.toFixed(2)}
Paid-key status: ${paidStatus}
Emergency fallback (a PAID-only agent was forced onto a FREE key — strong evidence the paid provider failed): ${emergencyNote}
IMPORTANT — paid setup as of 2026-07-22: the ONLY paid provider is OpenRouter (MiniMax M3), used by the 8 content agents. Gemini/Google was fully retired (the owner does not pay for it). Everything else runs on free keys. The $${b.monthHardCap}/month figure is ONLY a safety stop, not "how much is left"; top-ups happen at openrouter.ai → Credits.
HONESTY RULE: you can NOT see provider balances. NEVER claim a key "works fine" or "has balance" — you have no such data. If the owner asks whether a balance ran out, answer from EVIDENCE only (today's spend per provider above + the emergency-fallback line). If there is no evidence either way, say plainly that you cannot check the balance from here and tell them where to look.

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
  { key: 'social', name: 'Közösségi média', emoji: '📣', role: 'Facebook + Pinterest posztokat ír' },
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

CONVERSATION MEMORY (very important):
- You also receive the RECENT CONVERSATION (owner + bot messages, oldest first). SHORT owner replies almost always react to the LAST bot message: "mindet"/"az összeset" = ALL items just offered; "igen"/"jó"/"mehet"/"oké" = do the thing just proposed; "az elsőt"/"a másodikat" = that item from the last list; "azt is"/"a többit is" = extend the previous action.
- Resolve these from the conversation and ACT (set the proper action + params). NEVER reply "nem értettem" when the conversation makes the intent clear.
- Example: bot listed pending source suggestions, owner replies "mindet" → action "approve_source" with source "all".

ACTIONS the team can actually perform now (set "action"):
- "write_guide" (Útmutató-író): write a new how-to guide. params: topic, company, tool, audience.
- "run_pipeline" (Hírgyűjtő/Újságíró/Főnök): fetch latest news + publish now.
- "translate" (Fordító): translate more articles into the other languages now.
- "find_sources" (Forráskutató): research NEW reliable, official news sources now. Use when the owner asks to look for / discover new sources/feeds. params: none.
- "approve_source" (Forráskutató): the owner APPROVES discovered source suggestion(s) to be added live. Use when they say things like "vedd fel a(z) X", "hagyd jóvá X-et", "jó lesz az X", "add hozzá X forrást". "source" param: the source name, SEVERAL names comma-separated, or "all" if they want every pending suggestion ("mindet", "az összeset", "vedd fel mindet", "mehet mind").
- "status" / "budget" / "team" (Főnök): the answer is in "reply" (use live data; for "team" list the members).
- "post_now" (Social): send the freshest article posts to our Facebook page NOW. Use for "posztolj", "rakd ki FB-re", "menjen poszt a Facebookra".
- "set_limit" (Főnök): change a DAILY content limit. Use for "állítsd a hír-limitet 30-ra", "napi 8 útmutató legyen". Params: "topic" = "news" or "guides", "tool" = the new NUMBER as string.
- "report_now" (Főnök): send today's daily self-report now. Use when the owner asks for the daily report / "mi történt ma a cégnél, küldd a jelentést".
- "none": anything else — questions, ideas, explanations, small talk, or not-yet-wired requests (changing design/schedule/code is a later phase). Put the full answer in "reply".

BUDGET note: the paid Gemini plan is pay-as-you-go — NO fixed "remaining" number; report what we've SPENT (today/month) + that we auto-switch to free keys; the $80/month is only a safety stop.
News is only from official sources — for an arbitrary topic, offer a GUIDE or run the pipeline.
ACCURACY: do NOT invent specific article titles, examples, company names or numbers you weren't given in the live data. If you don't have a concrete detail, speak generally about your role instead of making something up.

OUTPUT ONLY a JSON object:
{"agent":"<member key>","action":"write_guide|run_pipeline|translate|find_sources|approve_source|post_now|set_limit|report_now|status|budget|team|none","topic":"","company":"","tool":"","source":"","audience":"both","reply":"<Hungarian reply in that member's voice>"}
For write_guide/run_pipeline/translate/find_sources/approve_source/post_now/set_limit/report_now, "reply" is a short warm acknowledgement (the result follows). Otherwise "reply" is the full answer.`;

function parseJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

async function think(text) {
  const ctx = gatherContext();

  // BESZÉLGETÉS-ELŐZMÉNY: az utolsó ~10 üzenetváltás, hogy a rövid válaszok
  // ("mindet", "igen", "az elsőt") is érthetők legyenek.
  const history = loadChatHistory().slice(-10)
    .map(h => `${h.from === 'owner' ? 'OWNER' : 'BOT'}: ${h.text.replace(/\n+/g, ' ').slice(0, 300)}`)
    .join('\n') || '(no previous messages)';

  const prompt = `LIVE COMPANY DATA:\n${ctx}\n\nRECENT CONVERSATION (oldest first):\n${history}\n\nThe owner just wrote: "${text}"\n\nDecide which team member answers + the action, and write the reply. JSON only.`;

  // 2 próba: ha az első válasz nem érvényes JSON, szigorúbb emlékeztetővel újra.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await ask(
      attempt === 1 ? prompt : prompt + '\n\nREMINDER: Output ONLY the raw JSON object, no markdown, no extra text.',
      { agentName: 'boss', systemPrompt: TEAM_PERSONA, maxTokens: 800, jsonMode: true }
    );
    const parsed = parseJson(r?.text);
    if (parsed) return parsed;
  }

  // 3. PRÓBA JSON NÉLKÜL (2026-07-22, user-lelet a Telegram-előzményből): a
  // "nem értettem" üzenet eddig NEM értés-hiba volt, hanem JSON-parse hiba —
  // a bot értette a kérdést, csak a formátum bukott, és ezt a userre fogta.
  // Ilyenkor inkább kérünk EGY SIMA MONDATOT: a user kapjon valódi választ.
  const plain = await ask(
    `${prompt}\n\nNow answer the owner in ONE short, friendly Hungarian message (plain text, no JSON, no markdown fences). Do not mention formats or errors.`,
    { agentName: 'boss', systemPrompt: TEAM_PERSONA, maxTokens: 800 }
  );
  const txt = (plain?.text || '').trim();
  if (txt) return { agent: 'ceo', action: 'none', reply: txt };

  // Ha még ez sem ment: ŐSZINTE hibaüzenet — ne a userre fogjuk.
  return { agent: 'ceo', action: 'none', reply: '😕 Most technikai hiba miatt nem tudtam válaszolni (nem veled van a baj). Próbáld újra egy perc múlva!' };
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
  const raw = (p.source || p.company || p.topic || p.tool || '').trim();
  if (!raw) return '🤔 Melyik forrást vegyem fel? Mondd a nevét („vedd fel az IBM Research-t") vagy: „vedd fel mindet".';

  let disc;
  try { disc = JSON.parse(readFileSync(DISCOVERED_PATH, 'utf-8')); }
  catch { return 'Most nincs jóváhagyható javaslat-listám. Írd: „keress új forrásokat", és körülnézek. 🧭'; }
  const list = disc.discovered_sources || [];
  if (list.length === 0) return 'Üres a javaslat-lista (mindent feldolgoztunk már). Írd: „keress új forrásokat", és hozok újakat. 🧭';

  // MIND? ("all" az agytól, vagy magyarul: mindet / összes / mindegyik)
  const wantAll = /^(all|mind(et|egyik(et)?)?|az\s*összes(et)?|összes(et)?)$/i.test(raw.replace(/[.!]/g, '').trim());
  // Több név vesszővel / "és"-sel elválasztva is jöhet
  const wanted = wantAll ? null : raw.split(/,|\bés\b/i).map(s => normCompany(s)).filter(Boolean);

  const picks = list.filter(d => {
    if (wantAll) return true;
    const n = normCompany(d.name), id = normCompany(d.suggested_id);
    return wanted.some(w => n.includes(w) || w.includes(id) || id === w);
  });
  if (picks.length === 0) {
    const names = list.map(d => '„' + d.name.replace(/\s*\(hivatalos\)$/, '') + '"').join(', ');
    return `Nem találom ezt a listámban. Amit jóvá tudsz hagyni: ${names} — vagy mondd: „vedd fel mindet". 🙂`;
  }

  const feeds = JSON.parse(readFileSync(FEEDS_PATH, 'utf-8'));
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const added = [], skipped = [];

  for (const pick of picks) {
    if (feeds.sources.some(s => host(s.url) === host(pick.url))) { skipped.push(pick); continue; }
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
    added.push(pick);
  }
  writeFileSync(FEEDS_PATH, JSON.stringify(feeds, null, 2), 'utf-8');

  // A feldolgozottak (felvett + már meglévő) kikerülnek a javaslatok közül
  disc.discovered_sources = list.filter(d => !picks.includes(d));
  writeFileSync(DISCOVERED_PATH, JSON.stringify(disc, null, 2), 'utf-8');

  const clean = d => d.name.replace(/\s*\(hivatalos\)$/, '');
  if (added.length === 0) return `Ezek már mind a forrásaink között vannak — nincs teendő. ✅`;
  const lines = added.map(d => `• ${clean(d)}`).join('\n');
  const extra = skipped.length ? `\n(${skipped.map(clean).join(', ')} már megvolt.)` : '';
  return added.length === 1
    ? `✅ Felvettem és élesítettem: *${clean(added[0])}*\n${added[0].url}\nA következő hírgyűjtéskor már innen is figyelek! 🗞️${extra}`
    : `✅ Felvettem mind a ${added.length} forrást:\n${lines}${extra}\nA következő hírgyűjtéskor már ezekből is dolgozom! 🗞️`;
}

// TELEGRAM 2. FÁZIS (2026-07-08): posztolás / limit-állítás / azonnali riport
async function doPostNow() {
  if (!process.env.MAKE_WEBHOOK_URL) return 'ℹ️ A posztoló webhook (MAKE_WEBHOOK_URL) nincs beállítva ebben a futásban — szólj a fejlesztőnek.';
  await node('agents/social/agent.js', ['--limit', '6']);
  const r = await node('agents/social/poster.js', ['--limit', '2']);
  const m = r.out.match(/(\d+)\s*kiküldve/);
  const n = m ? parseInt(m[1], 10) : 0;
  return n > 0
    ? `📘 Kiküldtem ${n} friss posztot a Facebook-oldalunkra! Pár percen belül kint van. ✅`
    : '📭 Most nincs kiküldhető friss poszt — minden 7 napon belüli cikk posztja kiment már. A következő új cikknél megy magától!';
}

async function doSetLimit(p) {
  const kindTxt = `${p.topic || ''} ${p.tool || ''} ${p.source || ''}`;
  const kind = /guide|útmutat/i.test(kindTxt) ? 'guides' : 'news';
  const num = parseInt(String(p.tool || p.source || p.topic || '').replace(/\D+/g, ''), 10);
  if (!num) return '🤔 Mennyire állítsam? Mondd számmal, pl.: „napi útmutató-limit legyen 8".';
  // Biztonsági sáv: Telegramról ne lehessen elszabadítani a költést
  const [min, max] = kind === 'guides' ? [1, 10] : [5, 40];
  const v = Math.max(min, Math.min(max, num));
  const cfgPath = join(ROOT, 'config.json');
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
  const key = kind === 'guides' ? 'daily_guides_max' : 'daily_articles_max';
  const old = cfg.limits[key];
  cfg.limits[key] = v;
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8');
  const capped = v !== num ? ` (a kért ${num} helyett — a biztonsági sáv ${min}–${max})` : '';
  return `✅ Átállítottam: napi ${kind === 'guides' ? 'útmutató' : 'hír'}-keret ${old} → *${v}*${capped}. A következő futástól így termelünk.`;
}

async function doReportNow() {
  await node('core/daily-report.js', ['--force']);
  return '📊 Elküldtem a mai jelentést külön üzenetben — görgess fel egyet! ☝️';
}

// ===================================================================
// FŐ
// ===================================================================
async function main() {
  console.log('🗣️  CSAPAT-BOT — parancs:', TEXT || '(üres)');
  if (!TEXT) { await sendMessage('Szia! 👋 A csapat itt van — szólíthatsz bárkit név szerint (pl. „Fordító", „Útmutató-író", „Ellenőr"), vagy csak mondd, mit csináljunk. „kik vagytok?" → bemutatkozunk.'); return; }

  appendChatHistory('owner', TEXT);   // a beszélgetés-memóriába (a bot-válaszokat a sendMessage naplózza)
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
  } else if (brain.action === 'post_now') {
    reply = await doPostNow();
  } else if (brain.action === 'set_limit') {
    reply = await doSetLimit(brain);
  } else if (brain.action === 'report_now') {
    reply = await doReportNow();
  } else {
    reply = brain.reply || 'Itt vagyok — mondd, mit csináljunk! 🙂';
  }
  // a megszólított csapattag nevével/emojijával jelöljük, ki válaszol
  // (ha az agy már maga elé írta a nevét, ne duplázzuk)
  reply = (reply || '').replace(new RegExp('^(?:' + who.emoji + '\\s*)?\\*' + who.name + ':?\\*:?\\s*'), '');
  const out = `${who.emoji} *${who.name}:* ${reply}`;
  await sendMessage(out);
  console.log('💬 Válasz:', out.slice(0, 100));
}

main().catch(async (e) => {
  console.error('💥 FŐNÖK HIBA:', e);
  await sendMessage(`⚠️ Hiba történt: ${e.message}. Próbáld újra, vagy fogalmazd át. 🙏`);
  process.exit(1);
});
