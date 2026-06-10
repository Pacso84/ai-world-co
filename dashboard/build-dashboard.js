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
  'publisher':    { icon: '🚀', name: 'Publisher', role: 'Builds & deploys the website' }
};
const TODAY = new Date().toISOString().slice(0, 10);

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
    const meta = AGENT_META[id] || { icon: '🤖', name: id, role: '' };
    const cfg = CONFIG.agents[id];
    return { id, ...meta, enabled: cfg.enabled !== false,
      model: cfg.primary_model ? cfg.primary_model.model : (cfg.deterministic ? 'deterministic' : '?') };
  });

  return {
    published, draftsScraper, draftsWriter, rejected,
    sources, costToday, costTotal, activity, agents,
    memory: memStats(), memories: memList({ limit: 14 }),
    deploy: CONFIG.infrastructure?.deploy?.method || 'none',
    limits: CONFIG.limits || {}
  };
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

function panelTeam(d) {
  return `<div class="panel"><div class="panel__h">🤖 The team — ${d.agents.length} agents</div>
    ${d.agents.map(a => `<div class="agent">
      <div class="agent__i">${a.icon}</div>
      <div class="agent__info"><div class="agent__n">${a.name} <span class="st ${a.enabled ? 'on' : 'off'}">${a.enabled ? 'active' : 'off'}</span></div>
      <div class="agent__r">${a.role}</div></div>
      <div class="agent__m">${a.model}</div></div>`).join('')}
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
  return `<div class="panel"><div class="panel__h">⚙️ Settings</div>
    ${row('Deploy method', d.deploy + (d.deploy === 'none' ? ' (local build only — not live yet)' : ''))}
    ${row('Max articles / day', d.limits.daily_articles_max ?? '?')}
    ${row('Max AI cost / day', '$' + (d.limits.daily_api_cost_usd_max ?? '?'))}
    ${row('Monthly budget target', '$' + (d.limits.monthly_budget_usd_target ?? '?'))}
    ${row('Boss model (CEO)', d.agents.find(a => a.id === 'ceo')?.model || '?')}
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
    ['memory', '🧠', 'Memory'],
    ['sources', '📚', 'Sources'],
    ['content', '📦', 'Content'],
    ['logs', '⚡', 'Activity'],
    ['settings', '⚙️', 'Settings']
  ];
  const panels = {
    overview: panelOverview(d), team: panelTeam(d), memory: panelMemory(d),
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
.st.on{background:#e2efe7;color:#3d7a5f}.st.off{background:#efe7e4;color:#9a6a5a}
.agent__r{color:var(--soft);font-size:12.5px}.agent__m{font-size:10.5px;color:var(--muted);font-family:monospace;background:var(--card);padding:3px 7px;border-radius:6px;border:1px solid var(--line)}
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
main();
