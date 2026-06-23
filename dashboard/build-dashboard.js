// ===================================================================
// MISSION CONTROL DASHBOARD ÉPÍTŐ (sidebar-os app, Marveen-stílus)
// ===================================================================
// Kezelőfelület az AI World Co. agent-céghez. Bal sidebar + váltható
// panelek (Áttekintés, Csapat, Emlékek, Források, Tartalom, Naplók,
// Beállítások). A VALÓDI adatokból generálva.
//
// FUTTATÁS: node dashboard/build-dashboard.js  ->  dashboard/index.html
// ===================================================================

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { stats as memStats, list as memList } from '../core/memory-manager.js';
import { listTasks, listNotifications, listMessages } from '../core/ops.js';
import { listSkills } from '../core/skills.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));

const AGENT_META = {
  'ceo':          { icon: '👔', name: 'CEO', role: 'A teljes folyamatot vezényli' },
  'rss-scraper':  { icon: '🛰️', name: 'Gyűjtő', role: 'Hivatalos AI-forrásokat figyel' },
  'iro':          { icon: '✍️', name: 'Író', role: 'Eredeti cikkeket ír' },
  'guide':        { icon: '📘', name: 'Útmutató', role: 'Lépésről-lépésre gyakorlati útmutatókat ír' },
  'ellenorzo':    { icon: '🔎', name: 'Ellenőrző', role: 'Minőségi és pontossági kapu' },
  'fact-check':   { icon: '🕵️', name: 'Tény-ellenőrző', role: 'A publikált útmutatókat frissen tartja — a valótlant eltávolítja' },
  'pairing':      { icon: '🔗', name: 'Párosító', role: 'Eldönti, mely hírhez kell útmutató, és összekapcsolja őket' },
  'source-scout': { icon: '🔭', name: 'Forrás-kutató', role: 'Új hivatalos forrásokat keres' },
  'designer':     { icon: '🎨', name: 'Tervező', role: 'Cikk-borítóképeket készít' },
  'web-designer': { icon: '🖥️', name: 'Honlap-szerkesztő', role: 'A weboldal elrendezése (layout) + design-szabályok' },
  'analyst':      { icon: '📊', name: 'Elemző', role: 'Tanul az eredményekből, javaslatokat tesz' },
  'seo':          { icon: '🔍', name: 'SEO', role: 'Keresőoptimalizálja a cikkeket' },
  'social':       { icon: '📣', name: 'Közösségi', role: 'Közösségi posztok (terv)' },
  'api-expert':   { icon: '🧠', name: 'API-szakértő', role: 'A legjobb elérhető modellt rendeli minden agenthez' },
  'publisher':    { icon: '🚀', name: 'Publikáló', role: 'Főszerkesztői ellenőrzés + build és közzététel' }
};
const TODAY = new Date().toISOString().slice(0, 10);

// Választható modellek (provider/model) az agent-beállításhoz
const MODEL_OPTIONS = [
  { provider: 'anthropic', model: 'claude-haiku-4-5' },
  { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  { provider: 'anthropic', model: 'claude-opus-4-8' },
  { provider: 'google', model: 'gemini-flash-latest' },
  { provider: 'google', model: 'gemini-2.5-flash' },
  { provider: 'google', model: 'gemini-2.5-pro' },
  { provider: 'google', model: 'gemini-2.5-flash-image' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'cerebras', model: 'gpt-oss-120b' },
  { provider: 'cerebras', model: 'zai-glm-4.7' },
  { provider: 'mistral', model: 'mistral-small-latest' },
  { provider: 'mistral', model: 'mistral-large-latest' },
  { provider: 'openrouter', model: 'deepseek/deepseek-chat:free' }
];

function countFiles(dir, fn) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return 0;
  return readdirSync(full).filter(fn).length;
}

function gather() {
  const published = countFiles('content/articles', f => f.startsWith('ARTICLE_') && f.endsWith('.json'));
  const draftsScraper = countFiles('content/drafts', f => f.endsWith('.json') && !f.startsWith('WRITER_'));
  const draftsWriter = countFiles('content/drafts', f => f.startsWith('WRITER_'));
  const rejected = countFiles('content/rejected', f => f.endsWith('.json'));

  const feeds = JSON.parse(readFileSync(join(ROOT, 'sources', 'rss-feeds.json'), 'utf-8'));
  const sources = feeds.sources.filter(s => s.enabled).map(s => ({ name: s.name, category: s.category, country: s.country }));

  const logsDir = join(ROOT, 'logs');
  let costToday = 0, costTotal = 0;
  const activity = [];
  if (existsSync(logsDir)) {
    const logFiles = readdirSync(logsDir).filter(f => f.endsWith('.json'))
      .map(f => ({ f, mtime: statSync(join(logsDir, f)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
    for (const { f } of logFiles) {
      try {
        const log = JSON.parse(readFileSync(join(logsDir, f), 'utf-8'));
        const c = log.total_cost_usd || log.ai_cost_usd || 0;
        costTotal += c; if (f.includes(TODAY)) costToday += c;
      } catch {}
    }
    for (const { f } of logFiles.slice(0, 12)) {
      try { activity.push(summariseLog(f, JSON.parse(readFileSync(join(logsDir, f), 'utf-8')))); } catch {}
    }
  }

  const agents = Object.keys(CONFIG.agents).map(id => {
    const cfg = CONFIG.agents[id];
    // Beépített agentnek AGENT_META; custom agentnek a config saját mezői
    const meta = cfg.type === 'custom'
      ? { icon: cfg.icon || '🤖', name: cfg.name || id, role: cfg.role || '' }
      : (AGENT_META[id] || { icon: '🤖', name: id, role: '' });
    return { id, ...meta, enabled: cfg.enabled !== false,
      custom: cfg.type === 'custom',
      deterministic: !!cfg.deterministic,
      provider: cfg.primary_model?.provider || '',
      model: cfg.primary_model ? cfg.primary_model.model : (cfg.deterministic ? 'deterministic' : '?') };
  });

  return {
    published, draftsScraper, draftsWriter, rejected,
    sources, costToday, costTotal, activity, agents,
    memory: memStats(), memories: memList({ limit: 14 }),
    deploy: CONFIG.infrastructure?.deploy?.method || 'none',
    limits: CONFIG.limits || {},
    keys: gatherKeys(),
    exhausted: gatherExhausted(),
    tasks: listTasks(),
    notifications: listNotifications(15),
    messages: listMessages(40),
    skills: listSkills(),
    org: loadOrg()
  };
}

// Szervezeti felépítés (core/org.json) — hierarchia, döntési jogkörök, visszacsatolások
function loadOrg() {
  const p = join(ROOT, 'core', 'org.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; }
}

// Kimerült modellek (kvóta) — a router quota-state.json-jából
function gatherExhausted() {
  const qp = join(ROOT, 'core', 'quota-state.json');
  if (!existsSync(qp)) return [];
  try {
    const q = JSON.parse(readFileSync(qp, 'utf-8'));
    return Object.entries(q)
      .filter(([, v]) => new Date(v.until) > new Date())
      .map(([model, v]) => ({ model, daily: v.daily }));
  } catch { return []; }
}

// API kulcsok állapota (.env-ből, MASZKOLVA — sosem mutatjuk a teljes kulcsot)
function gatherKeys() {
  const envPath = join(ROOT, '.env');
  const env = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  }
  // Ismert providerek (label-ekhez). Bővíthető — de bármilyen kulcs is mehet.
  const known = [
    { label: 'Claude (Anthropic)', env: 'ANTHROPIC_API_KEY', free: false },
    { label: 'Gemini (Google)', env: 'GOOGLE_API_KEY', free: true },
    { label: 'Groq', env: 'GROQ_API_KEY', free: true },
    { label: 'Cerebras', env: 'CEREBRAS_API_KEY', free: true },
    { label: 'OpenRouter', env: 'OPENROUTER_API_KEY', free: true },
    { label: 'OpenAI', env: 'OPENAI_API_KEY', free: false },
    { label: 'Mistral', env: 'MISTRAL_API_KEY', free: true },
    { label: 'Cohere', env: 'COHERE_API_KEY', free: true },
    { label: 'DeepSeek', env: 'DEEPSEEK_API_KEY', free: false },
    { label: 'Together AI', env: 'TOGETHER_API_KEY', free: true },
    { label: 'Hugging Face (képek is)', env: 'HF_API_KEY', free: true },
    { label: 'Cloudflare AI token (képek)', env: 'CLOUDFLARE_API_TOKEN', free: true },
    { label: 'Cloudflare account ID', env: 'CLOUDFLARE_ACCOUNT_ID', free: true },
    { label: 'xAI (Grok)', env: 'XAI_API_KEY', free: false },
    { label: 'Telegram Bot', env: 'TELEGRAM_BOT_TOKEN', free: true }
  ];
  const knownEnvs = new Set(known.map(k => k.env));

  // .env-ben TÉNYLEG jelen lévő, kulcs-szerű nevek (akár egyedi is)
  const extraFromEnv = Object.keys(env)
    .filter(name => /(_API_KEY|_TOKEN|_KEY)$/.test(name) && !knownEnvs.has(name))
    .map(name => ({ label: name.replace(/_API_KEY|_TOKEN|_KEY/g, '').replace(/_/g, ' ') + ' (custom)', env: name, free: false }));

  return [...known, ...extraFromEnv].map(k => {
    const val = env[k.env] || '';
    const set = val.length > 0;
    return { ...k, set, masked: set ? (val.slice(0, 4) + '…' + val.slice(-3)) : '' };
  });
}

function summariseLog(filename, log) {
  const when = log.finished_at || log.started_at || '';
  const time = when ? new Date(when).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) : '';
  let icon = '•', text = filename;
  if (filename.startsWith('scrape_')) { icon = '🛰️'; text = `Gyűjtő: ${log.items_saved ?? '?'} releváns mentve`; }
  else if (filename.startsWith('writer_')) { icon = '✍️'; text = `Író: ${log.articles_written ?? '?'} cikk megírva`; }
  else if (filename.startsWith('reviewer_')) { icon = '🔎'; text = `Ellenőrző: ${log.passed ?? '?'} publikálva, ${log.failed ?? '?'} elutasítva`; }
  else if (filename.startsWith('ceo_')) { icon = '👔'; text = `CEO: folyamat lefutott`; }
  return { icon, text, time };
}

// ===================================================================
// PANELEK
// ===================================================================
const tierBadge = t => `<span class="tb tb-${t}">${t === 'hot' ? '🔥' : t === 'warm' ? '🌤️' : '❄️'} ${t}</span>`;
const catColor = { 'ai-company-official': '#5f8a76', community: '#5b7a9d', 'tech-media': '#b5694a', 'ai-research': '#8a6a93' };

function panelOverview(d) {
  const stat = (n, l, s = '') => `<div class="stat"><div class="stat__n">${n}</div><div class="stat__l">${l}</div>${s ? `<div class="stat__s">${s}</div>` : ''}</div>`;
  return `<div class="stats">
    ${stat(d.agents.filter(a => a.enabled).length + '/' + d.agents.length, 'Agentek', 'aktív / összes')}
    ${stat(d.published, 'Publikálva', 'élő cikk')}
    ${stat(d.sources.length, 'Források', 'csak hivatalos')}
    ${stat('$' + d.costTotal.toFixed(3), 'AI költség', `$${d.costToday.toFixed(3)} ma`)}
    ${stat(d.memory.total, 'Emlékek', `${d.memory.hot}🔥 ${d.memory.warm}🌤️ ${d.memory.cold}❄️`)}
  </div>
  <div class="panel">
    <div class="panel__h">📦 Tartalom-folyamat</div>
    <div class="pipe">
      <div class="pstep"><div class="pn">${d.draftsScraper}</div><div class="pl">Talált téma</div></div><span class="parr">→</span>
      <div class="pstep"><div class="pn">${d.draftsWriter}</div><div class="pl">Ellenőrzésre vár</div></div><span class="parr">→</span>
      <div class="pstep"><div class="pn">${d.published}</div><div class="pl">Publikálva</div></div>
    </div>
    <div class="muted" style="margin-top:8px">${d.rejected} elutasítva (visszaküldve tanulásra)</div>
  </div>`;
}

function modelLabel(provider, model) {
  const map = {
    'claude-haiku-4-5': 'Claude Haiku 4.5', 'claude-sonnet-4-6': 'Claude Sonnet 4.6', 'claude-opus-4-8': 'Claude Opus 4.8',
    'gemini-flash-latest': 'Gemini Flash (latest)', 'gemini-2.5-flash': 'Gemini 2.5 Flash', 'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash-image': 'Gemini Flash Image', 'llama-3.3-70b-versatile': 'Groq Llama 3.3 70B',
    'gpt-oss-120b': 'Cerebras GPT-OSS 120B', 'zai-glm-4.7': 'Cerebras GLM 4.7', 'deepseek/deepseek-chat:free': 'OpenRouter DeepSeek (free)',
    'mistral-small-latest': 'Mistral Small', 'mistral-large-latest': 'Mistral Large'
  };
  return map[model] || `${provider}/${model}`;
}

function panelTeam(d) {
  const opts = (selProvider, selModel) => MODEL_OPTIONS.map(o =>
    `<option value="${o.provider}|${o.model}" ${o.provider === selProvider && o.model === selModel ? 'selected' : ''}>${modelLabel(o.provider, o.model)}</option>`).join('');

  const modelSelectOptions = MODEL_OPTIONS.map(o => `<option value="${o.provider}|${o.model}">${modelLabel(o.provider, o.model)}</option>`).join('');

  return `<div class="panel"><div class="panel__h">🤖 A csapat — ${d.agents.length} agent</div>
    <div class="muted" style="margin-bottom:12px">Állítsd be agentenként a modell-verziót (amit az API-kulcsaid engednek), és kapcsold be/ki. Mentés a Vezérlőpult-szerveren keresztül.</div>
    ${d.agents.map(a => `<div class="agent" data-agent="${a.id}">
      <div class="agent__i">${a.icon}</div>
      <div class="agent__info">
        <div class="agent__n">${a.name} ${a.custom ? '<span class="st cust">saját</span>' : ''}</div>
        <div class="agent__r">${a.role}</div>
      </div>
      <div class="agent__ctrl">
        ${a.deterministic
          ? `<span class="agent__det">determinisztikus (nincs AI)</span>`
          : `<select class="agent__model">${opts(a.provider, a.model)}</select>`}
        <label class="tgl"><input type="checkbox" class="agent__en" ${a.enabled ? 'checked' : ''}><span>be</span></label>
        ${a.deterministic ? '' : `<button class="agent__save">Mentés</button>`}
      </div>
    </div>`).join('')}
    <div id="agentMsg" class="keymsg"></div>
  </div>
  <div class="panel"><div class="panel__h">➕ Új agent létrehozása</div>
    <div class="muted" style="margin-bottom:12px">Adj neki nevet, ikont, feladatot és utasításokat (a „személyiségét"). Csatlakozik a csapathoz, és így futtatható: <code>node agents/custom-runner.js &lt;id&gt; "input"</code></div>
    <div class="newform">
      <div class="nf__row">
        <input id="naId" placeholder="id (pl. forditó)" maxlength="28">
        <input id="naIcon" placeholder="ikon 🌐" maxlength="4" style="max-width:70px">
        <input id="naName" placeholder="Név (pl. Fordító)">
      </div>
      <input id="naRole" placeholder="Rövid szerep (pl. Cikkeket fordít más nyelvekre)">
      <select id="naModel">${modelSelectOptions}</select>
      <textarea id="naInstr" rows="4" placeholder="Utasítások (az agent feladata és személyisége). Pl. „Te AI-cikkeket fordítasz világos, barátságos magyarra a hétköznapi olvasóknak…"></textarea>
      <button id="naCreate">Agent létrehozása</button>
      <div id="naMsg" class="keymsg"></div>
    </div>
  </div>`;
}

function panelMemory(d) {
  return `<div class="stats">
    <div class="stat"><div class="stat__n">${d.memory.hot}</div><div class="stat__l">🔥 Forró</div></div>
    <div class="stat"><div class="stat__n">${d.memory.warm}</div><div class="stat__l">🌤️ Langyos</div></div>
    <div class="stat"><div class="stat__n">${d.memory.cold}</div><div class="stat__l">❄️ Hideg</div></div>
    <div class="stat"><div class="stat__n">${d.memory.total}</div><div class="stat__l">Összes</div></div>
  </div>
  <div class="panel"><div class="panel__h">🧠 Emlékek (fontosság szerint)</div>
    ${d.memories.length ? d.memories.map(m => `<div class="mem">${tierBadge(m.tier)}<span class="mem__t">${esc(m.text)}</span><span class="mem__s">${m.salience}%</span></div>`).join('')
      : '<div class="muted">Még nincs emlék. Akkor jelennek meg, ahogy az Ellenőrző tanul az elutasításokból.</div>'}
  </div>`;
}

function panelSources(d) {
  return `<div class="panel"><div class="panel__h">📚 Hivatalos források — ${d.sources.length}</div>
    ${d.sources.map(s => `<div class="src"><span class="dotc" style="background:${catColor[s.category] || '#999'}"></span>
      <span class="src__n">${esc(s.name)}</span><span class="src__c">${s.country || ''}</span></div>`).join('')}
  </div>`;
}

function panelContent(d) {
  return `<div class="stats">
    <div class="stat"><div class="stat__n">${d.draftsScraper}</div><div class="stat__l">Témák</div></div>
    <div class="stat"><div class="stat__n">${d.draftsWriter}</div><div class="stat__l">Ellenőrzésre vár</div></div>
    <div class="stat"><div class="stat__n">${d.published}</div><div class="stat__l">Publikálva</div></div>
    <div class="stat"><div class="stat__n">${d.rejected}</div><div class="stat__l">Elutasítva</div></div>
  </div>
  <div class="panel"><div class="panel__h">📦 Folyamat</div>
  <div class="pipe">
    <div class="pstep"><div class="pn">🛰️</div><div class="pl">Gyűjtés</div></div><span class="parr">→</span>
    <div class="pstep"><div class="pn">✍️</div><div class="pl">Írás</div></div><span class="parr">→</span>
    <div class="pstep"><div class="pn">🔎</div><div class="pl">Ellenőrzés</div></div><span class="parr">→</span>
    <div class="pstep"><div class="pn">🎨</div><div class="pl">Tervezés</div></div><span class="parr">→</span>
    <div class="pstep"><div class="pn">🚀</div><div class="pl">Közzététel</div></div>
  </div></div>`;
}

function panelLogs(d) {
  return `<div class="panel"><div class="panel__h">⚡ Legutóbbi tevékenység</div>
    ${d.activity.length ? d.activity.map(x => `<div class="act"><span class="act__i">${x.icon}</span><span class="act__t">${x.text}</span><span class="act__time">${x.time}</span></div>`).join('')
      : '<div class="muted">Még nincs tevékenység. Futtasd a folyamatot.</div>'}
  </div>`;
}

function panelSettings(d) {
  const row = (k, v) => `<div class="setrow"><span class="setk">${k}</span><span class="setv">${v}</span></div>`;
  const keyRows = d.keys.map(k => `<div class="keyrow">
      <span class="key__dot ${k.set ? 'on' : 'off'}"></span>
      <span class="key__l">${k.label} ${k.free ? '<span class="freeb">ingyen</span>' : ''}</span>
      <span class="key__v">${k.set ? k.masked : '<span class="muted">nincs beállítva</span>'}</span>
    </div>`).join('');
  // dedup env szerint + "Egyéb (saját)" opció a listán kívüli kulcsokhoz
  const seenEnv = new Set();
  const keyOptions = d.keys.filter(k => { if (seenEnv.has(k.env)) return false; seenEnv.add(k.env); return true; })
    .map(k => `<option value="${k.env}">${k.label}</option>`).join('')
    + `<option value="__custom__">➕ Egyéb (saját név megadása)…</option>`;

  const exhaustedHtml = d.exhausted.length
    ? `<div class="panel"><div class="panel__h">🚦 Kvóta-állapot — automatikus átirányítás</div>
        <div class="muted" style="margin-bottom:8px">Ezek a modellek ma elérték a limitjüket — a főnök automatikusan kikerüli őket:</div>
        ${d.exhausted.map(e => `<div class="keyrow"><span class="key__dot off"></span><span class="key__l">${e.model}</span><span class="key__v">${e.daily ? 'holnapig' : 'pár perc'}</span></div>`).join('')}
      </div>`
    : `<div class="panel"><div class="panel__h">🚦 Kvóta-állapot</div><div class="muted">Minden modellnek van szabad kvótája. ✅</div></div>`;

  return exhaustedHtml + `<div class="panel"><div class="panel__h">🔑 API-kulcsok</div>
    ${keyRows}
    <div class="keyform" id="keyform">
      <div class="muted" style="margin:14px 0 8px">Kulcs hozzáadása vagy frissítése (helyben mentve a .env-be):</div>
      <div class="keyform__row">
        <select id="keyProvider">${keyOptions}</select>
        <input id="keyCustomName" placeholder="ENV_NEV_API_KEY" style="display:none;text-transform:uppercase">
        <input id="keyValue" type="password" placeholder="illeszd be az API-kulcsot…" autocomplete="off">
        <button id="keySave">Mentés</button>
      </div>
      <div id="keyMsg" class="keymsg"></div>
      <div class="muted" style="margin-top:8px;font-size:12px">⚠️ Csak a Vezérlőpult-szerveren át működik (node dashboard/server.js). A kulcsok a gépeden maradnak.</div>
    </div>
  </div>
  <div class="panel"><div class="panel__h">⚙️ Rendszer</div>
    ${row('Közzététel módja', d.deploy + (d.deploy === 'none' ? ' (csak helyi build — még nem éles)' : ''))}
    ${row('Max cikk / nap', d.limits.daily_articles_max ?? '?')}
    ${row('Max AI költség / nap', '$' + (d.limits.daily_api_cost_usd_max ?? '?'))}
    ${row('Havi költségkeret-cél', '$' + (d.limits.monthly_budget_usd_target ?? '?'))}
    ${row('Főnök modellje (CEO)', d.agents.find(a => a.id === 'ceo')?.model || '?')}
  </div>`;
}

function panelTasks(d) {
  const col = (title, items, cls) => `<div class="kcol"><div class="kcol__h ${cls}">${title} <span>${items.length}</span></div>
    ${items.length ? items.map(t => `<div class="kcard">${esc(t.title)}${t.agent ? `<span class="kcard__a">${t.agent}</span>` : ''}</div>`).join('') : '<div class="muted" style="font-size:12px">—</div>'}</div>`;
  return `<div class="panel"><div class="panel__h">📋 Feladattábla (Kanban)</div>
    <div class="kanban">
      ${col('Teendő', d.tasks.todo, 'k-todo')}
      ${col('Folyamatban', d.tasks.doing, 'k-doing')}
      ${col('Kész', d.tasks.done, 'k-done')}
    </div>
  </div>`;
}

function panelComms(d) {
  const meta = {
    problem:  { i: '⚠️', label: 'Hiba',   cls: 'c-problem' },
    fix:      { i: '🔧', label: 'Javítás', cls: 'c-fix' },
    need:     { i: '🙋', label: 'Kell',   cls: 'c-need' },
    decision: { i: '👔', label: 'Döntés', cls: 'c-decision' },
    info:     { i: '✅', label: 'Rendben', cls: 'c-info' }
  };
  const name = a => ({ ellenorzo: 'Ellenőrző', guide: 'Útmutató', iro: 'Író', ceo: 'Főnök', human: 'Te', team: 'Csapat',
    'rss-scraper': 'Scraper', designer: 'Designer', 'web-designer': 'Honlap-szerkesztő', 'fact-check': 'Tény-ellenőrző', pairing: 'Párosító', seo: 'SEO', publisher: 'Publikáló' }[a] || a || '?');
  const msgs = d.messages || [];
  const openNeeds = msgs.filter(m => m.kind === 'need' && m.open);

  const needsBar = openNeeds.length
    ? `<div class="muted" style="margin-bottom:10px">🙋 <b>${openNeeds.length} nyitott kérés</b> (hiányzó adat / befejezetlen munka) vár megoldásra.</div>`
    : `<div class="muted" style="margin-bottom:10px">Itt látod, ahogy az agentek átadják egymásnak a munkát, és elmondják mi a baj vagy mi hiányzik.</div>`;

  return `<div class="panel"><div class="panel__h">💬 Csapat-kommunikáció</div>
    ${needsBar}
    ${msgs.length ? msgs.map(m => {
      const mm = meta[m.kind] || meta.info;
      const open = m.kind === 'need' && m.open ? ' <span class="cmsg__open">nyitott</span>' : '';
      return `<div class="cmsg ${mm.cls}">
        <span class="cmsg__k">${mm.i} ${mm.label}</span>
        <span class="cmsg__who">${esc(name(m.from))} → ${esc(name(m.to))}${open}</span>
        <span class="cmsg__t">${esc(m.text)}</span>
        <span class="cmsg__time">${new Date(m.at).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })}</span>
      </div>`;
    }).join('') : '<div class="muted">Még nincs üzenet. Az első rework/ellenőrzés után itt megjelenik a beszélgetés.</div>'}
  </div>`;
}

function panelNotifications(d) {
  const icon = l => ({ info: 'ℹ️', success: '✅', warn: '⚠️', alert: '🚨' }[l] || '•');
  return `<div class="panel"><div class="panel__h">🔔 Értesítések (heartbeat)</div>
    <div class="muted" style="margin-bottom:10px">🚨 A riasztások a „hangos" értesítések — ezek a Telegramra mennek, amint be lesz kötve.</div>
    ${d.notifications.length ? d.notifications.map(n => `<div class="noti noti--${n.level}">
      <span class="noti__i">${icon(n.level)}</span><span class="noti__t">${esc(n.text)}</span>
      <span class="noti__time">${new Date(n.at).toLocaleString('hu-HU', { dateStyle: 'short', timeStyle: 'short' })}</span></div>`).join('')
      : '<div class="muted">Még nincs értesítés.</div>'}
  </div>`;
}

function panelSkills(d) {
  // Scope (agent) szerint csoportosítva
  const groups = {};
  for (const s of d.skills) (groups[s.scope] = groups[s.scope] || []).push(s);
  const order = Object.keys(groups).sort();

  const groupHtml = order.map(scope => {
    const meta = AGENT_META[scope] || { icon: scope === 'shared' ? '🌐' : '🤖', name: scope };
    const items = groups[scope].map(s => {
      const off = s.enabled === false ? ' <span class="skill__off">(ki)</span>' : '';
      const uses = s.uses ? ` <span class="skill__sc">${s.uses}×</span>` : '';
      return `<details class="skill"><summary>${esc(s.title)}${uses}${off}</summary>
        <div class="skill__body">${esc(s.recipe).slice(0, 600)}</div></details>`;
    }).join('');
    return `<div class="skillgrp"><div class="skillgrp__h">${meta.icon} ${esc(meta.name)} <span class="skill__sc">${groups[scope].length}</span></div>${items}</div>`;
  }).join('');

  return `<div class="panel"><div class="panel__h">🛠️ Készség-gyár — ${d.skills.length} készség, ${order.length} agent</div>
    <div class="muted" style="margin-bottom:12px">Minden agent a saját készségeit (receptjeit) követi. Bármikor szerkeszthető a <code>skills/skills.json</code>-ban (vagy vegyél fel újat a <code>skills/default-skills.json</code>-ba és seedelj újra). Az Elemző tapasztalatból is gyárt újakat.</div>
    ${d.skills.length ? groupHtml : '<div class="muted">Még nincs készség. Futtasd: <code>node core/seed-skills.js</code>.</div>'}
  </div>`;
}

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Agent-azonosító → ikon + név (a hierarchia-kártyákhoz)
function agentChip(id) {
  const m = AGENT_META[id] || (CONFIG.agents[id]?.type === 'custom'
    ? { icon: CONFIG.agents[id].icon || '🤖', name: CONFIG.agents[id].name || id }
    : { icon: '🤖', name: id });
  return `<span class="ochip"><span class="ochip__i">${m.icon}</span>${esc(m.name)}</span>`;
}

function panelOrg(d) {
  const org = d.org;
  if (!org) return `<div class="panel"><div class="panel__h">🏢 Szervezet</div><div class="muted">core/org.json nem található.</div></div>`;

  // id → chip (ismert agent), egyébként külső szereplő (pl. human, fájl)
  const node = x => AGENT_META[x] ? agentChip(x) : `<span class="ochip ochip--ext">${esc(x)}</span>`;
  const roster = org.roster || {};
  const depts = org.departments || org.hierarchy?.departments || {};

  // ALÁ-FÖLÉ: CEO + részlegek (vezető + csapat, kinek jelentenek)
  const deptCards = Object.entries(depts).map(([key, dep]) => {
    const lead = dep.lead;
    const members = (dep.members || []).filter(m => m !== lead);
    return `<div class="odept">
      <div class="odept__h">${esc(dep.label || key)}</div>
      <div class="orole">👑 Vezető <span class="muted">— jelent: 👔 CEO</span></div>
      <div class="orow">${agentChip(lead)}</div>
      <div class="orole">Csapat <span class="muted">— jelentenek a vezetőnek; egymással mellérendeltek</span></div>
      <div class="orow">${members.map(agentChip).join('') || '<span class="muted">—</span>'}</div>
    </div>`;
  }).join('');

  // MELLÉRENDELTSÉG: egyenrangú csoportok
  const peers = (org.peer_groups || []).map(g => `<div class="opeer">
      <div class="opeer__h">↔️ ${esc(g.label)}</div>
      <div class="orow">${(g.members || []).map(node).join('')}</div>
      ${g.note ? `<div class="oloop__b">${esc(g.note)}</div>` : ''}
    </div>`).join('');

  // MUNKAÁTADÁS (lateral): ki adja kinek
  const handoffs = (org.handoff_rules || []).map(h =>
    `<div class="ohand">${node(h.from)} <span class="oarr">→</span> ${node(h.to)}<div class="oloop__b">${esc(h.what)}</div></div>`).join('');

  const decisions = (org.decision_rights || []).map(r =>
    `<div class="setrow"><span class="setk">${esc(r.who)}</span><span class="setv" style="max-width:62%;text-align:right;font-weight:500">${esc(r.decides)}</span></div>`).join('');

  const loops = (org.feedback_loops || []).map(l =>
    `<div class="oloop">
      <div class="oloop__h">${esc(l.from)} <span class="oarr">↩︎ →</span> ${esc(l.to)}${l.max_rounds ? ` <span class="obadge">max ${l.max_rounds}×</span>` : ''}</div>
      <div class="oloop__b"><b>Mikor:</b> ${esc(l.trigger)}</div>
      <div class="oloop__b"><b>Hogyan:</b> ${esc(l.mechanism)}</div>
      ${l.give_up ? `<div class="oloop__b"><b>Feladás:</b> ${esc(l.give_up)}</div>` : ''}
    </div>`).join('');

  const wf = org.workflows?.['daily-news'];
  const flow = wf ? wf.steps.map((s, i) =>
    `<div class="ostep${s.conditional ? ' ostep--cond' : ''}">
       <div class="ostep__n">${agentChip(s.agent)}</div>
       <div class="ostep__a">${esc(s.action)}</div>
       ${s.decides ? `<div class="ostep__d">⚖️ dönt: ${esc(s.decides)}</div>` : ''}
       ${s.conditional ? `<div class="ostep__c">↩︎ ${esc(s.conditional)}</div>` : ''}
     </div>${i < wf.steps.length - 1 ? '<div class="oflowarr">↓</div>' : ''}`).join('') : '';

  const ceoRep = roster.ceo?.reports_to || 'human';

  return `
  <div class="panel"><div class="panel__h">🏢 Alá-fölé rendeltség — ki kinek jelent</div>
    <div class="oceo">${agentChip('ceo')}<span class="oceo__r">jelent neki: 🧑 ${esc(ceoRep === 'human' ? 'Tulajdonos' : ceoRep)}</span></div>
    <div class="oceo__arr">irányítja a 3 részlegvezetőt ↓</div>
    <div class="odepts">${deptCards}</div>
  </div>

  <div class="panel"><div class="panel__h">↔️ Mellérendeltség — kik egyenrangúak</div>
    <div class="muted" style="margin-bottom:12px">Az egyenrangúak nem utasítják egymást — egyeztetnek és laterálisan adják át a munkát.</div>
    ${peers || '<div class="muted">—</div>'}
  </div>

  <div class="panel"><div class="panel__h">📨 Munkaátadás — ki adja kinek</div>
    <div class="muted" style="margin-bottom:12px">A tiszta átadási pontok megakadályozzák a kavarodást a munkafolyamatban.</div>
    ${handoffs || '<div class="muted">—</div>'}
  </div>

  <div class="panel"><div class="panel__h">⚖️ Döntési jogkörök — ki mit dönt</div>
    ${decisions || '<div class="muted">—</div>'}
  </div>

  <div class="panel"><div class="panel__h">🔁 Visszacsatolások — a munka visszaadása</div>
    <div class="muted" style="margin-bottom:12px">Ha valami nem elég jó, visszamegy — ez csapat, nem egyirányú futószalag.</div>
    ${loops || '<div class="muted">—</div>'}
  </div>

  <div class="panel"><div class="panel__h">📋 Napi hír-folyamat — ${esc(wf?.label || '')}</div>
    <div class="oflow">${flow}</div>
  </div>`;
}

// ===================================================================
// RENDER (sidebar app)
// ===================================================================
function render(d) {
  const NAV = [
    ['overview', '📊', 'Áttekintés'],
    ['team', '🤖', 'Csapat'],
    ['org', '🏢', 'Szervezet'],
    ['tasks', '📋', 'Feladatok'],
    ['comms', '💬', 'Kommunikáció'],
    ['notifications', '🔔', 'Értesítések'],
    ['memory', '🧠', 'Memória'],
    ['skills', '🛠️', 'Készségek'],
    ['sources', '📚', 'Források'],
    ['content', '📦', 'Tartalom'],
    ['logs', '⚡', 'Tevékenység'],
    ['settings', '⚙️', 'Beállítások']
  ];
  const panels = {
    overview: panelOverview(d), team: panelTeam(d), org: panelOrg(d), tasks: panelTasks(d),
    comms: panelComms(d),
    notifications: panelNotifications(d), memory: panelMemory(d), skills: panelSkills(d),
    sources: panelSources(d), content: panelContent(d), logs: panelLogs(d), settings: panelSettings(d)
  };
  const nav = NAV.map(([id, ic, label], i) =>
    `<button class="nav ${i === 0 ? 'nav--active' : ''}" data-p="${id}">${ic} <span>${label}</span></button>`).join('');
  const panelHtml = NAV.map(([id], i) =>
    `<section class="pane ${i === 0 ? 'pane--active' : ''}" data-pane="${id}">${panels[id]}</section>`).join('');

  return `<!DOCTYPE html><html lang="hu"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI World — Irányítóközpont</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400..900&family=Hanken+Grotesk:wght@400..700&display=swap" rel="stylesheet">
<style>
:root{--paper:#f2ede4;--card:#fbf9f4;--p2:#eae3d6;--ink:#1c1a16;--soft:#6f6a60;--muted:#9a9388;--line:#e4ddd0;--line2:#d3cabb;--accent:#5f8a76}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#e7e0d2;color:var(--ink);font-family:'Hanken Grotesk',sans-serif;font-size:14.5px;line-height:1.55;padding:24px}
.win{max-width:1180px;margin:0 auto;background:var(--card);border:1px solid var(--line2);border-radius:16px;overflow:hidden;box-shadow:0 40px 90px -50px rgba(0,0,0,.5)}
.bar{display:flex;align-items:center;gap:8px;padding:13px 18px;border-bottom:1px solid var(--line);background:var(--p2)}
.d{width:11px;height:11px;border-radius:50%}.d.r{background:#e0795f}.d.y{background:#e3b341}.d.g{background:#7aa37f}
.bar__t{margin-left:10px;font-weight:700;font-size:12.5px;color:var(--soft);letter-spacing:.04em}
.app{display:grid;grid-template-columns:210px 1fr;min-height:560px}
.side{background:var(--p2);border-right:1px solid var(--line);padding:20px 14px}
.brand{font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-size:20px;letter-spacing:-.02em;padding:0 8px 18px}
.brand .a{color:var(--accent)}
.nav{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:none;cursor:pointer;
  font-family:inherit;font-size:14px;font-weight:600;color:var(--soft);padding:10px 12px;border-radius:9px;margin-bottom:3px;transition:.15s}
.nav:hover{background:var(--card);color:var(--ink)}
.nav--active{background:var(--ink);color:var(--paper)}
.main{padding:28px 30px;overflow:auto}
.h1{font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-size:24px;letter-spacing:-.02em;margin-bottom:4px}
.sub{color:var(--soft);margin-bottom:22px;font-size:13px}
.pane{display:none;animation:f .3s ease}.pane--active{display:block}
@keyframes f{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:14px;margin-bottom:22px}
.stat{background:var(--paper);border:1px solid var(--line);border-radius:11px;padding:16px}
.stat__n{font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-size:30px;line-height:1;letter-spacing:-.02em}
.stat__l{color:var(--soft);font-weight:600;margin-top:6px;font-size:12.5px}.stat__s{color:var(--muted);font-size:11.5px;margin-top:2px}
.panel{background:var(--paper);border:1px solid var(--line);border-radius:11px;padding:20px;margin-bottom:18px}
.panel__h{font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-size:15px;margin-bottom:14px}
.muted{color:var(--muted);font-size:13px}
.agent{display:flex;align-items:center;gap:13px;padding:11px 0;border-bottom:1px solid var(--line)}.agent:last-child{border:none}
.agent__i{font-size:20px;width:30px;text-align:center}.agent__info{flex:1}.agent__n{font-weight:700}
.st{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;padding:2px 7px;border-radius:100px;margin-left:6px}
.st.on{background:#e2efe7;color:#3d7a5f}.st.off{background:#efe7e4;color:#9a6a5a}.st.cust{background:#e6ddef;color:#7a3b8a}
.newform{display:flex;flex-direction:column;gap:9px}
.nf__row{display:flex;gap:9px;flex-wrap:wrap}.nf__row input{flex:1;min-width:90px}
.newform input,.newform select,.newform textarea{font-family:inherit;font-size:13px;padding:9px 11px;border:1px solid var(--line2);border-radius:8px;background:var(--card);width:100%}
.newform textarea{resize:vertical}
.newform button{font-family:inherit;font-size:13px;font-weight:700;padding:10px 18px;border:none;border-radius:8px;background:var(--ink);color:var(--paper);cursor:pointer;align-self:flex-start}
.newform button:hover{background:var(--accent)}
.agent__r{color:var(--soft);font-size:12.5px}.agent__m{font-size:10.5px;color:var(--muted);font-family:monospace;background:var(--card);padding:3px 7px;border-radius:6px;border:1px solid var(--line)}
.agent__ctrl{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.agent__model{font-family:inherit;font-size:12px;padding:6px 8px;border:1px solid var(--line2);border-radius:7px;background:var(--card);max-width:170px}
.agent__det{font-size:11px;color:var(--muted);font-style:italic}
.tgl{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--soft);cursor:pointer}
.agent__save{font-family:inherit;font-size:12px;font-weight:700;padding:6px 12px;border:none;border-radius:7px;background:var(--ink);color:var(--paper);cursor:pointer}
.agent__save:hover{background:var(--accent)}
@media(max-width:680px){.agent{flex-wrap:wrap}.agent__ctrl{width:100%;padding-left:43px}}
.pipe{display:flex;align-items:center;justify-content:space-between;gap:6px}
.pstep{flex:1;text-align:center;background:var(--card);border:1px solid var(--line);border-radius:9px;padding:13px 6px}
.pn{font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-size:22px}.pl{font-size:11px;color:var(--soft);margin-top:3px}.parr{color:var(--muted)}
.act{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}.act:last-child{border:none}
.act__i{width:20px;text-align:center}.act__t{flex:1}.act__time{color:var(--muted);font-size:12px;white-space:nowrap}
.mem{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px}.mem:last-child{border:none}
.mem__t{flex:1}.mem__s{color:var(--muted);font-size:12px;font-family:monospace}
.tb{font-size:10px;font-weight:700;padding:2px 8px;border-radius:100px;white-space:nowrap}
.tb-hot{background:#f5e0d8;color:#b5694a}.tb-warm{background:#f0ead8;color:#9a7a2b}.tb-cold{background:#dde6ec;color:#5b7a9d}
.src{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}.src:last-child{border:none}
.dotc{width:9px;height:9px;border-radius:50%;flex-shrink:0}.src__n{flex:1}.src__c{color:var(--muted);font-size:12px}
.setrow{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line)}.setrow:last-child{border:none}
.setk{color:var(--soft);font-weight:600}.setv{font-weight:600}
.keyrow{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)}.keyrow:last-child{border:none}
.key__dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}.key__dot.on{background:#7aa37f}.key__dot.off{background:#d3b0a0}
.key__l{flex:1;font-weight:600}.key__v{font-family:monospace;font-size:12px;color:var(--soft)}
.freeb{font-size:9px;font-weight:700;background:#e2efe7;color:#3d7a5f;padding:1px 6px;border-radius:100px;text-transform:uppercase;letter-spacing:.05em}
.keyform__row{display:flex;gap:8px;flex-wrap:wrap}
.keyform select,.keyform input{font-family:inherit;font-size:13px;padding:9px 11px;border:1px solid var(--line2);border-radius:8px;background:var(--card)}
.keyform input{flex:1;min-width:180px}
.keyform button{font-family:inherit;font-size:13px;font-weight:700;padding:9px 18px;border:none;border-radius:8px;background:var(--ink);color:var(--paper);cursor:pointer}
.keyform button:hover{background:var(--accent)}
.keymsg{margin-top:10px;font-size:13px;font-weight:600}.keymsg.ok{color:#3d7a5f}.keymsg.err{color:#b5694a}
.kanban{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
@media(max-width:680px){.kanban{grid-template-columns:1fr}}
.kcol__h{font-weight:800;font-size:13px;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid var(--line2)}
.kcol__h span{float:right;color:var(--muted)}
.k-todo{color:var(--soft)}.k-doing{color:#b5894a}.k-done{color:#3d7a5f}
.kcard{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:9px 11px;margin-bottom:7px;font-size:13px}
.kcard__a{display:block;font-size:10.5px;color:var(--muted);margin-top:3px;font-family:monospace}
.noti{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}.noti:last-child{border:none}
.noti__i{width:20px;text-align:center}.noti__t{flex:1}.noti__time{color:var(--muted);font-size:11.5px;white-space:nowrap}
.noti--alert .noti__t{color:#b5694a;font-weight:600}.noti--warn .noti__t{color:#9a7a2b}
.cmsg{display:grid;grid-template-columns:92px 150px 1fr auto;gap:10px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px}.cmsg:last-child{border:none}
.cmsg__k{font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;text-align:center;white-space:nowrap}
.cmsg__who{color:var(--soft);font-weight:600;font-size:12px}.cmsg__t{color:var(--ink)}.cmsg__time{color:var(--muted);font-size:11px;white-space:nowrap}
.cmsg__open{color:#9a7a2b;font-weight:700;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;margin-left:4px}
.c-problem .cmsg__k{background:#f6e2da;color:#b5694a}.c-fix .cmsg__k{background:#e2ecf6;color:#3a6ea5}
.c-need .cmsg__k{background:#f6efd6;color:#9a7a2b}.c-decision .cmsg__k{background:#e7e0f2;color:#6b53a3}.c-info .cmsg__k{background:#dceee0;color:#3f7a55}
@media(max-width:680px){.cmsg{grid-template-columns:1fr;gap:2px}.cmsg__time{font-size:10px}}
.skill{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:var(--card)}
.skill summary{cursor:pointer;font-weight:700;font-size:13px}
.skill__sc{font-size:10px;color:var(--muted);font-family:monospace;margin-left:6px}
.skill__body{margin-top:8px;font-size:12.5px;color:var(--soft);white-space:pre-wrap;line-height:1.5}
.skill__off{font-size:10px;color:#b5694a;font-weight:700}
.skillgrp{margin-bottom:18px}
.skillgrp__h{font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-size:13.5px;margin:0 0 8px;padding-bottom:5px;border-bottom:1px solid var(--line2)}
.panel__h code,.muted code{font-family:monospace;font-size:11.5px;background:var(--p2);padding:1px 5px;border-radius:5px}
@media(max-width:680px){.app{grid-template-columns:1fr}.side{display:flex;flex-wrap:wrap;gap:4px;border-right:none;border-bottom:1px solid var(--line)}.brand{width:100%}.nav{width:auto}.nav span{display:none}}
.ochip{display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--line2);border-radius:100px;padding:4px 11px 4px 5px;font-size:12.5px;font-weight:600;margin:3px 5px 3px 0}
.ochip__i{font-size:14px}
.oceo{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center;background:var(--ink);color:var(--paper);border-radius:11px;padding:13px 18px}
.oceo .ochip{background:var(--paper);border-color:transparent;font-size:14px}
.oceo__r{font-size:12px;opacity:.85}
.oceo__arr{text-align:center;color:var(--muted);font-size:12px;font-weight:700;margin:8px 0}
.odepts{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
@media(max-width:680px){.odepts{grid-template-columns:1fr}}
.odept{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.odept__h{font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-size:13px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.orole{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:8px 0 4px}
.orow{display:flex;flex-wrap:wrap}
.ochip--ext{background:var(--p2);border-style:dashed;color:var(--soft);font-weight:700}
.opeer{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:10px}
.opeer__h{font-weight:800;font-size:13px;margin-bottom:6px}
.ohand{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:10px 13px;margin-bottom:8px;display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.ohand .oloop__b{flex-basis:100%}
.oloop{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:12px 14px;margin-bottom:10px}
.oloop__h{font-weight:700;font-size:13.5px;margin-bottom:6px}
.oarr{color:var(--accent);font-weight:800}
.obadge{font-size:9.5px;font-weight:700;background:#f0ead8;color:#9a7a2b;padding:2px 7px;border-radius:100px;text-transform:uppercase;letter-spacing:.05em}
.oloop__b{font-size:12.5px;color:var(--soft);margin-top:3px}
.oflow{display:flex;flex-direction:column;align-items:stretch}
.ostep{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:11px 14px}
.ostep--cond{border-style:dashed;border-color:var(--line2);background:var(--paper)}
.ostep__a{font-size:12.5px;color:var(--soft);margin-top:3px}
.ostep__d{font-size:11.5px;color:#9a7a2b;font-weight:600;margin-top:4px}
.ostep__c{font-size:11px;color:var(--accent);font-style:italic;margin-top:3px}
.oflowarr{text-align:center;color:var(--muted);font-weight:800;font-size:14px;margin:4px 0}
</style></head>
<body>
<div class="win">
  <div class="bar"><span class="d r"></span><span class="d y"></span><span class="d g"></span><span class="bar__t">AI World Co. · Irányítóközpont</span></div>
  <div class="app">
    <aside class="side">
      <div class="brand">AI WORLD<span class="a">.</span></div>
      ${nav}
    </aside>
    <main class="main">
      <div class="h1">Irányítóközpont</div>
      <div class="sub">Generálva: ${new Date().toLocaleString('hu-HU', { dateStyle: 'medium', timeStyle: 'short' })}</div>
      ${panelHtml}
    </main>
  </div>
</div>
<script>
  document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.nav').forEach(x=>x.classList.remove('nav--active'));
    document.querySelectorAll('.pane').forEach(x=>x.classList.remove('pane--active'));
    b.classList.add('nav--active');
    document.querySelector('.pane[data-pane="'+b.dataset.p+'"]').classList.add('pane--active');
  }));
  // API kulcs mentés (csak a Control Panel szerver alatt működik)
  var keyProv=document.getElementById('keyProvider');
  var keyCustom=document.getElementById('keyCustomName');
  if(keyProv&&keyCustom){keyProv.addEventListener('change',function(){
    keyCustom.style.display = keyProv.value==='__custom__' ? '' : 'none';
  });}
  var saveBtn=document.getElementById('keySave');
  if(saveBtn){saveBtn.addEventListener('click',async function(){
    var env=document.getElementById('keyProvider').value;
    if(env==='__custom__'){ env=(keyCustom.value||'').trim().toUpperCase().replace(/[^A-Z0-9_]/g,'_'); }
    var val=document.getElementById('keyValue').value.trim();
    var msg=document.getElementById('keyMsg');
    if(env==='__custom__'||!env){msg.className='keymsg err';msg.textContent='Adj meg egy saját kulcs-nevet (pl. MISTRAL_API_KEY).';return;}
    if(!val){msg.className='keymsg err';msg.textContent='Előbb illeszd be a kulcsot.';return;}
    msg.className='keymsg';msg.textContent='Mentés…';
    try{
      var r=await fetch('/api/key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({env:env,value:val})});
      var j=await r.json();
      if(j.ok){msg.className='keymsg ok';msg.textContent='✅ Mentve: '+env+'. Töltsd újra az állapothoz.';document.getElementById('keyValue').value='';}
      else{msg.className='keymsg err';msg.textContent='❌ '+(j.error||'sikertelen');}
    }catch(e){msg.className='keymsg err';msg.textContent='❌ Nem a Vezérlőpult-szerveren fut. Indítsd: node dashboard/server.js';}
  });}
  // Agent beállítás mentés (modell + on/off)
  document.querySelectorAll('.agent').forEach(function(row){
    var id=row.dataset.agent;
    var saveBtn=row.querySelector('.agent__save');
    var modelSel=row.querySelector('.agent__model');
    var enChk=row.querySelector('.agent__en');
    var msg=document.getElementById('agentMsg');
    async function save(){
      var payload={id:id, enabled:enChk.checked};
      if(modelSel){var pm=modelSel.value.split('|');payload.provider=pm[0];payload.model=pm[1];}
      msg.className='keymsg';msg.textContent='Mentés: '+id+'…';
      try{
        var r=await fetch('/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        var j=await r.json();
        if(j.ok){msg.className='keymsg ok';msg.textContent='✅ Mentve: '+id+' ('+(payload.model||'be/ki')+')';}
        else{msg.className='keymsg err';msg.textContent='❌ '+(j.error||'sikertelen');}
      }catch(e){msg.className='keymsg err';msg.textContent='❌ Indítsd a Vezérlőpult-szervert: node dashboard/server.js';}
    }
    if(saveBtn)saveBtn.addEventListener('click',save);
    if(enChk&&!saveBtn)enChk.addEventListener('change',save);
  });
  // Új agent létrehozása
  var naBtn=document.getElementById('naCreate');
  if(naBtn){naBtn.addEventListener('click',async function(){
    var msg=document.getElementById('naMsg');
    var pm=document.getElementById('naModel').value.split('|');
    var payload={
      id:document.getElementById('naId').value.trim(),
      icon:document.getElementById('naIcon').value.trim(),
      name:document.getElementById('naName').value.trim(),
      role:document.getElementById('naRole').value.trim(),
      provider:pm[0], model:pm[1],
      instructions:document.getElementById('naInstr').value.trim()
    };
    if(!payload.id||!payload.name||!payload.instructions){msg.className='keymsg err';msg.textContent='Töltsd ki: id, név és utasítások.';return;}
    msg.className='keymsg';msg.textContent='Létrehozás…';
    try{
      var r=await fetch('/api/create-agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      var j=await r.json();
      if(j.ok){msg.className='keymsg ok';msg.textContent='✅ Létrehozva: „'+payload.name+'"! Töltsd újra, hogy lásd a csapatban.';}
      else{msg.className='keymsg err';msg.textContent='❌ '+(j.error||'sikertelen');}
    }catch(e){msg.className='keymsg err';msg.textContent='❌ Indítsd a Vezérlőpult-szervert: node dashboard/server.js';}
  });}
</script>
</body></html>`;
}

function main() {
  console.log('🎛️  MISSION CONTROL DASHBOARD ÉPÍTÉS');
  const d = gather();
  writeFileSync(join(__dirname, 'index.html'), render(d), 'utf-8');
  console.log(`✅ Kész: dashboard/index.html`);
  console.log(`   Agentek: ${d.agents.filter(a => a.enabled).length}/${d.agents.length} | Publikált: ${d.published} | Forrás: ${d.sources.length} | Emlékek: ${d.memory.total} | Költség: $${d.costTotal.toFixed(4)}`);
}

export { gather, render };

// Csak közvetlen futtatáskor generáljuk a statikus fájlt
import { argv } from 'process';
if (argv[1] && argv[1].endsWith('build-dashboard.js')) main();
