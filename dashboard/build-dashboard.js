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
import { listTasks, listNotifications } from '../core/ops.js';
import { listSkills } from '../core/skills.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));

const AGENT_META = {
  'ceo':          { icon: '👔', name: 'CEO', role: 'Orchestrates the whole pipeline' },
  'rss-scraper':  { icon: '🛰️', name: 'Scraper', role: 'Monitors official AI sources' },
  'iro':          { icon: '✍️', name: 'Writer', role: 'Writes original articles' },
  'ellenorzo':    { icon: '🔎', name: 'Reviewer', role: 'Quality & accuracy gate' },
  'source-scout': { icon: '🔭', name: 'Source Scout', role: 'Discovers new official sources' },
  'designer':     { icon: '🎨', name: 'Designer', role: 'Generates article cover images' },
  'analyst':      { icon: '📊', name: 'Analyst', role: 'Learns from results, suggests improvements' },
  'publisher':    { icon: '🚀', name: 'Publisher', role: 'Editor-in-chief check + builds & deploys' }
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
  { provider: 'cerebras', model: 'llama-3.3-70b' },
  { provider: 'openrouter', model: 'deepseek/deepseek-chat' }
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
    skills: listSkills()
  };
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
  if (filename.startsWith('scrape_')) { icon = '🛰️'; text = `Scraper: ${log.items_saved ?? '?'} relevant saved`; }
  else if (filename.startsWith('writer_')) { icon = '✍️'; text = `Writer: ${log.articles_written ?? '?'} written`; }
  else if (filename.startsWith('reviewer_')) { icon = '🔎'; text = `Reviewer: ${log.passed ?? '?'} published, ${log.failed ?? '?'} rejected`; }
  else if (filename.startsWith('ceo_')) { icon = '👔'; text = `CEO: pipeline run`; }
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
    ${stat(d.agents.filter(a => a.enabled).length + '/' + d.agents.length, 'Agents', 'active / total')}
    ${stat(d.published, 'Published', 'articles live')}
    ${stat(d.sources.length, 'Sources', 'official only')}
    ${stat('$' + d.costTotal.toFixed(3), 'AI cost', `$${d.costToday.toFixed(3)} today`)}
    ${stat(d.memory.total, 'Memories', `${d.memory.hot}🔥 ${d.memory.warm}🌤️ ${d.memory.cold}❄️`)}
  </div>
  <div class="panel">
    <div class="panel__h">📦 Content pipeline</div>
    <div class="pipe">
      <div class="pstep"><div class="pn">${d.draftsScraper}</div><div class="pl">Topics found</div></div><span class="parr">→</span>
      <div class="pstep"><div class="pn">${d.draftsWriter}</div><div class="pl">Awaiting review</div></div><span class="parr">→</span>
      <div class="pstep"><div class="pn">${d.published}</div><div class="pl">Published</div></div>
    </div>
    <div class="muted" style="margin-top:8px">${d.rejected} rejected (sent back to learn from)</div>
  </div>`;
}

function modelLabel(provider, model) {
  const map = {
    'claude-haiku-4-5': 'Claude Haiku 4.5', 'claude-sonnet-4-6': 'Claude Sonnet 4.6', 'claude-opus-4-8': 'Claude Opus 4.8',
    'gemini-flash-latest': 'Gemini Flash (latest)', 'gemini-2.5-flash': 'Gemini 2.5 Flash', 'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash-image': 'Gemini Flash Image', 'llama-3.3-70b-versatile': 'Groq Llama 3.3 70B',
    'llama-3.3-70b': 'Cerebras Llama 3.3 70B', 'deepseek/deepseek-chat': 'OpenRouter DeepSeek'
  };
  return map[model] || `${provider}/${model}`;
}

function panelTeam(d) {
  const opts = (selProvider, selModel) => MODEL_OPTIONS.map(o =>
    `<option value="${o.provider}|${o.model}" ${o.provider === selProvider && o.model === selModel ? 'selected' : ''}>${modelLabel(o.provider, o.model)}</option>`).join('');

  const modelSelectOptions = MODEL_OPTIONS.map(o => `<option value="${o.provider}|${o.model}">${modelLabel(o.provider, o.model)}</option>`).join('');

  return `<div class="panel"><div class="panel__h">🤖 The team — ${d.agents.length} agents</div>
    <div class="muted" style="margin-bottom:12px">Choose each agent's model version (what your API keys allow) and toggle it on/off. Saves via Control Panel server.</div>
    ${d.agents.map(a => `<div class="agent" data-agent="${a.id}">
      <div class="agent__i">${a.icon}</div>
      <div class="agent__info">
        <div class="agent__n">${a.name} ${a.custom ? '<span class="st cust">custom</span>' : ''}</div>
        <div class="agent__r">${a.role}</div>
      </div>
      <div class="agent__ctrl">
        ${a.deterministic
          ? `<span class="agent__det">deterministic (no AI)</span>`
          : `<select class="agent__model">${opts(a.provider, a.model)}</select>`}
        <label class="tgl"><input type="checkbox" class="agent__en" ${a.enabled ? 'checked' : ''}><span>on</span></label>
        ${a.deterministic ? '' : `<button class="agent__save">Save</button>`}
      </div>
    </div>`).join('')}
    <div id="agentMsg" class="keymsg"></div>
  </div>
  <div class="panel"><div class="panel__h">➕ Create a new agent</div>
    <div class="muted" style="margin-bottom:12px">Give it a name, an avatar, a job, and instructions (its "personality"). It joins the team and can be run with: <code>node agents/custom-runner.js &lt;id&gt; "input"</code></div>
    <div class="newform">
      <div class="nf__row">
        <input id="naId" placeholder="id (e.g. translator)" maxlength="28">
        <input id="naIcon" placeholder="icon 🌐" maxlength="4" style="max-width:70px">
        <input id="naName" placeholder="Name (e.g. Translator)">
      </div>
      <input id="naRole" placeholder="Short role (e.g. Translates articles to other languages)">
      <select id="naModel">${modelSelectOptions}</select>
      <textarea id="naInstr" rows="4" placeholder="Instructions (the agent's job & personality). E.g. 'You translate AI articles into clear, friendly Hungarian for everyday readers…'"></textarea>
      <button id="naCreate">Create agent</button>
      <div id="naMsg" class="keymsg"></div>
    </div>
  </div>`;
}

function panelMemory(d) {
  return `<div class="stats">
    <div class="stat"><div class="stat__n">${d.memory.hot}</div><div class="stat__l">🔥 Hot</div></div>
    <div class="stat"><div class="stat__n">${d.memory.warm}</div><div class="stat__l">🌤️ Warm</div></div>
    <div class="stat"><div class="stat__n">${d.memory.cold}</div><div class="stat__l">❄️ Cold</div></div>
    <div class="stat"><div class="stat__n">${d.memory.total}</div><div class="stat__l">Total</div></div>
  </div>
  <div class="panel"><div class="panel__h">🧠 Memories (by salience)</div>
    ${d.memories.length ? d.memories.map(m => `<div class="mem">${tierBadge(m.tier)}<span class="mem__t">${esc(m.text)}</span><span class="mem__s">${m.salience}%</span></div>`).join('')
      : '<div class="muted">No memories yet. They appear as the Reviewer learns from rejections.</div>'}
  </div>`;
}

function panelSources(d) {
  return `<div class="panel"><div class="panel__h">📚 Official sources — ${d.sources.length}</div>
    ${d.sources.map(s => `<div class="src"><span class="dotc" style="background:${catColor[s.category] || '#999'}"></span>
      <span class="src__n">${esc(s.name)}</span><span class="src__c">${s.country || ''}</span></div>`).join('')}
  </div>`;
}

function panelContent(d) {
  return `<div class="stats">
    <div class="stat"><div class="stat__n">${d.draftsScraper}</div><div class="stat__l">Topics</div></div>
    <div class="stat"><div class="stat__n">${d.draftsWriter}</div><div class="stat__l">Awaiting review</div></div>
    <div class="stat"><div class="stat__n">${d.published}</div><div class="stat__l">Published</div></div>
    <div class="stat"><div class="stat__n">${d.rejected}</div><div class="stat__l">Rejected</div></div>
  </div>
  <div class="panel"><div class="panel__h">📦 Flow</div>
  <div class="pipe">
    <div class="pstep"><div class="pn">🛰️</div><div class="pl">Scrape</div></div><span class="parr">→</span>
    <div class="pstep"><div class="pn">✍️</div><div class="pl">Write</div></div><span class="parr">→</span>
    <div class="pstep"><div class="pn">🔎</div><div class="pl">Review</div></div><span class="parr">→</span>
    <div class="pstep"><div class="pn">🎨</div><div class="pl">Design</div></div><span class="parr">→</span>
    <div class="pstep"><div class="pn">🚀</div><div class="pl">Publish</div></div>
  </div></div>`;
}

function panelLogs(d) {
  return `<div class="panel"><div class="panel__h">⚡ Recent activity</div>
    ${d.activity.length ? d.activity.map(x => `<div class="act"><span class="act__i">${x.icon}</span><span class="act__t">${x.text}</span><span class="act__time">${x.time}</span></div>`).join('')
      : '<div class="muted">No activity yet. Run the pipeline.</div>'}
  </div>`;
}

function panelSettings(d) {
  const row = (k, v) => `<div class="setrow"><span class="setk">${k}</span><span class="setv">${v}</span></div>`;
  const keyRows = d.keys.map(k => `<div class="keyrow">
      <span class="key__dot ${k.set ? 'on' : 'off'}"></span>
      <span class="key__l">${k.label} ${k.free ? '<span class="freeb">free</span>' : ''}</span>
      <span class="key__v">${k.set ? k.masked : '<span class="muted">not set</span>'}</span>
    </div>`).join('');
  // dedup env szerint + "Egyéb (saját)" opció a listán kívüli kulcsokhoz
  const seenEnv = new Set();
  const keyOptions = d.keys.filter(k => { if (seenEnv.has(k.env)) return false; seenEnv.add(k.env); return true; })
    .map(k => `<option value="${k.env}">${k.label}</option>`).join('')
    + `<option value="__custom__">➕ Other (type a custom name)…</option>`;

  const exhaustedHtml = d.exhausted.length
    ? `<div class="panel"><div class="panel__h">🚦 Quota status — auto-rerouting</div>
        <div class="muted" style="margin-bottom:8px">These models hit their limit today — the boss automatically routes around them:</div>
        ${d.exhausted.map(e => `<div class="keyrow"><span class="key__dot off"></span><span class="key__l">${e.model}</span><span class="key__v">${e.daily ? 'until tomorrow' : 'few minutes'}</span></div>`).join('')}
      </div>`
    : `<div class="panel"><div class="panel__h">🚦 Quota status</div><div class="muted">All models have quota available. ✅</div></div>`;

  return exhaustedHtml + `<div class="panel"><div class="panel__h">🔑 API keys</div>
    ${keyRows}
    <div class="keyform" id="keyform">
      <div class="muted" style="margin:14px 0 8px">Add or update a key (saved locally to .env):</div>
      <div class="keyform__row">
        <select id="keyProvider">${keyOptions}</select>
        <input id="keyCustomName" placeholder="ENV_NAME_API_KEY" style="display:none;text-transform:uppercase">
        <input id="keyValue" type="password" placeholder="paste API key…" autocomplete="off">
        <button id="keySave">Save</button>
      </div>
      <div id="keyMsg" class="keymsg"></div>
      <div class="muted" style="margin-top:8px;font-size:12px">⚠️ Only works via the Control Panel server (node dashboard/server.js). Keys stay on your computer.</div>
    </div>
  </div>
  <div class="panel"><div class="panel__h">⚙️ System</div>
    ${row('Deploy method', d.deploy + (d.deploy === 'none' ? ' (local build only — not live yet)' : ''))}
    ${row('Max articles / day', d.limits.daily_articles_max ?? '?')}
    ${row('Max AI cost / day', '$' + (d.limits.daily_api_cost_usd_max ?? '?'))}
    ${row('Monthly budget target', '$' + (d.limits.monthly_budget_usd_target ?? '?'))}
    ${row('Boss model (CEO)', d.agents.find(a => a.id === 'ceo')?.model || '?')}
  </div>`;
}

function panelTasks(d) {
  const col = (title, items, cls) => `<div class="kcol"><div class="kcol__h ${cls}">${title} <span>${items.length}</span></div>
    ${items.length ? items.map(t => `<div class="kcard">${esc(t.title)}${t.agent ? `<span class="kcard__a">${t.agent}</span>` : ''}</div>`).join('') : '<div class="muted" style="font-size:12px">—</div>'}</div>`;
  return `<div class="panel"><div class="panel__h">📋 Task board (Kanban)</div>
    <div class="kanban">
      ${col('To do', d.tasks.todo, 'k-todo')}
      ${col('Doing', d.tasks.doing, 'k-doing')}
      ${col('Done', d.tasks.done, 'k-done')}
    </div>
  </div>`;
}

function panelNotifications(d) {
  const icon = l => ({ info: 'ℹ️', success: '✅', warn: '⚠️', alert: '🚨' }[l] || '•');
  return `<div class="panel"><div class="panel__h">🔔 Notifications (heartbeat)</div>
    <div class="muted" style="margin-bottom:10px">🚨 alerts are the "loud" ones — these go to Telegram once it's connected.</div>
    ${d.notifications.length ? d.notifications.map(n => `<div class="noti noti--${n.level}">
      <span class="noti__i">${icon(n.level)}</span><span class="noti__t">${esc(n.text)}</span>
      <span class="noti__time">${new Date(n.at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}</span></div>`).join('')
      : '<div class="muted">No notifications yet.</div>'}
  </div>`;
}

function panelSkills(d) {
  return `<div class="panel"><div class="panel__h">🛠️ Skill Factory — ${d.skills.length} skills</div>
    <div class="muted" style="margin-bottom:10px">Reusable recipes the agents distil from experience.</div>
    ${d.skills.length ? d.skills.map(s => `<details class="skill"><summary>${esc(s.title)} <span class="skill__sc">${s.scope}</span></summary>
      <div class="skill__body">${esc(s.recipe).slice(0, 600)}</div></details>`).join('')
      : '<div class="muted">No skills yet. The Analyst creates them as the company learns.</div>'}
  </div>`;
}

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ===================================================================
// RENDER (sidebar app)
// ===================================================================
function render(d) {
  const NAV = [
    ['overview', '📊', 'Overview'],
    ['team', '🤖', 'Team'],
    ['tasks', '📋', 'Tasks'],
    ['notifications', '🔔', 'Notifications'],
    ['memory', '🧠', 'Memory'],
    ['skills', '🛠️', 'Skills'],
    ['sources', '📚', 'Sources'],
    ['content', '📦', 'Content'],
    ['logs', '⚡', 'Activity'],
    ['settings', '⚙️', 'Settings']
  ];
  const panels = {
    overview: panelOverview(d), team: panelTeam(d), tasks: panelTasks(d),
    notifications: panelNotifications(d), memory: panelMemory(d), skills: panelSkills(d),
    sources: panelSources(d), content: panelContent(d), logs: panelLogs(d), settings: panelSettings(d)
  };
  const nav = NAV.map(([id, ic, label], i) =>
    `<button class="nav ${i === 0 ? 'nav--active' : ''}" data-p="${id}">${ic} <span>${label}</span></button>`).join('');
  const panelHtml = NAV.map(([id], i) =>
    `<section class="pane ${i === 0 ? 'pane--active' : ''}" data-pane="${id}">${panels[id]}</section>`).join('');

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI World — Mission Control</title>
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
.skill{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:var(--card)}
.skill summary{cursor:pointer;font-weight:700;font-size:13px}
.skill__sc{font-size:10px;color:var(--muted);font-family:monospace;margin-left:6px}
.skill__body{margin-top:8px;font-size:12.5px;color:var(--soft);white-space:pre-wrap;line-height:1.5}
@media(max-width:680px){.app{grid-template-columns:1fr}.side{display:flex;flex-wrap:wrap;gap:4px;border-right:none;border-bottom:1px solid var(--line)}.brand{width:100%}.nav{width:auto}.nav span{display:none}}
</style></head>
<body>
<div class="win">
  <div class="bar"><span class="d r"></span><span class="d y"></span><span class="d g"></span><span class="bar__t">AI World Co. · Mission Control</span></div>
  <div class="app">
    <aside class="side">
      <div class="brand">AI WORLD<span class="a">.</span></div>
      ${nav}
    </aside>
    <main class="main">
      <div class="h1">Mission Control</div>
      <div class="sub">Generated ${new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</div>
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
    if(env==='__custom__'||!env){msg.className='keymsg err';msg.textContent='Type a custom key name (e.g. MISTRAL_API_KEY).';return;}
    if(!val){msg.className='keymsg err';msg.textContent='Paste a key first.';return;}
    msg.className='keymsg';msg.textContent='Saving…';
    try{
      var r=await fetch('/api/key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({env:env,value:val})});
      var j=await r.json();
      if(j.ok){msg.className='keymsg ok';msg.textContent='✅ Saved '+env+'. Reload to see status.';document.getElementById('keyValue').value='';}
      else{msg.className='keymsg err';msg.textContent='❌ '+(j.error||'failed');}
    }catch(e){msg.className='keymsg err';msg.textContent='❌ Not running via Control Panel server. Start: node dashboard/server.js';}
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
      msg.className='keymsg';msg.textContent='Saving '+id+'…';
      try{
        var r=await fetch('/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        var j=await r.json();
        if(j.ok){msg.className='keymsg ok';msg.textContent='✅ Saved '+id+' ('+(payload.model||'on/off')+')';}
        else{msg.className='keymsg err';msg.textContent='❌ '+(j.error||'failed');}
      }catch(e){msg.className='keymsg err';msg.textContent='❌ Start the Control Panel server: node dashboard/server.js';}
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
    if(!payload.id||!payload.name||!payload.instructions){msg.className='keymsg err';msg.textContent='Fill in id, name and instructions.';return;}
    msg.className='keymsg';msg.textContent='Creating…';
    try{
      var r=await fetch('/api/create-agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      var j=await r.json();
      if(j.ok){msg.className='keymsg ok';msg.textContent='✅ Created "'+payload.name+'"! Reload to see it in the team.';}
      else{msg.className='keymsg err';msg.textContent='❌ '+(j.error||'failed');}
    }catch(e){msg.className='keymsg err';msg.textContent='❌ Start the Control Panel server: node dashboard/server.js';}
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
