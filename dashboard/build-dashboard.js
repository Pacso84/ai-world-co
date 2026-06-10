// ===================================================================
// MISSION CONTROL DASHBOARD ÉPÍTŐ
// ===================================================================
//
// Kezelőfelület az AI World Co. agent-céghez (Marveen-stílusú).
// A VALÓDI adatokból generál egy statikus HTML dashboardot:
//   - agentek + állapot, modell
//   - tartalom pipeline (draft -> írva -> publikálva)
//   - költség, források, friss aktivitás
//
// FUTTATÁS:
//   node dashboard/build-dashboard.js
// KIMENET:
//   dashboard/index.html  (nyisd meg böngészőben)
// ===================================================================

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));

// Agent meta (név, ikon, szerep)
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

function countFiles(dir, filterFn) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return 0;
  return readdirSync(full).filter(filterFn).length;
}

function gather() {
  // tartalom
  const published = countFiles('content/articles', f => f.startsWith('ARTICLE_') && f.endsWith('.json'));
  const draftsScraper = countFiles('content/drafts', f => f.endsWith('.json') && !f.startsWith('WRITER_'));
  const draftsWriter = countFiles('content/drafts', f => f.startsWith('WRITER_'));
  const rejected = countFiles('content/rejected', f => f.endsWith('.json'));

  // források
  const feeds = JSON.parse(readFileSync(join(ROOT, 'sources', 'rss-feeds.json'), 'utf-8'));
  const sourcesActive = feeds.sources.filter(s => s.enabled).length;

  // költség (logokból)
  const logsDir = join(ROOT, 'logs');
  let costToday = 0, costTotal = 0;
  const activity = [];
  if (existsSync(logsDir)) {
    const logFiles = readdirSync(logsDir).filter(f => f.endsWith('.json'))
      .map(f => ({ f, mtime: statSync(join(logsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const { f } of logFiles) {
      try {
        const log = JSON.parse(readFileSync(join(logsDir, f), 'utf-8'));
        const c = log.total_cost_usd || log.ai_cost_usd || 0;
        costTotal += c;
        if (f.includes(TODAY)) costToday += c;
      } catch { /* skip */ }
    }

    // friss aktivitás (utolsó 8 log emberi összefoglalóval)
    for (const { f } of logFiles.slice(0, 8)) {
      try {
        const log = JSON.parse(readFileSync(join(logsDir, f), 'utf-8'));
        activity.push(summariseLog(f, log));
      } catch { /* skip */ }
    }
  }

  // agentek
  const agents = Object.keys(CONFIG.agents).map(id => {
    const meta = AGENT_META[id] || { icon: '🤖', name: id, role: '' };
    const cfg = CONFIG.agents[id];
    return {
      id, ...meta,
      enabled: cfg.enabled !== false,
      model: cfg.primary_model ? `${cfg.primary_model.model}` : (cfg.deterministic ? 'deterministic' : '?')
    };
  });

  return { published, draftsScraper, draftsWriter, rejected, sourcesActive, costToday, costTotal, activity, agents };
}

function summariseLog(filename, log) {
  const when = log.finished_at || log.started_at || '';
  const time = when ? new Date(when).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) : '';
  let icon = '•', text = filename;
  if (filename.startsWith('scrape_')) {
    icon = '🛰️'; text = `Scraper: ${log.items_saved ?? '?'} relevant saved (${log.candidates_for_ai ?? '?'} checked)`;
  } else if (filename.startsWith('writer_')) {
    icon = '✍️'; text = `Writer: ${log.articles_written ?? '?'} articles written`;
  } else if (filename.startsWith('reviewer_')) {
    icon = '🔎'; text = `Reviewer: ${log.passed ?? '?'} published, ${log.failed ?? '?'} rejected`;
  } else if (filename.startsWith('ceo_')) {
    icon = '👔'; text = `CEO: pipeline run (${log.mode || 'full'})`;
  }
  return { icon, text, time };
}

// ===================================================================
// HTML
// ===================================================================

function statCard(num, label, sub = '') {
  return `<div class="stat">
    <div class="stat__num">${num}</div>
    <div class="stat__label">${label}</div>
    ${sub ? `<div class="stat__sub">${sub}</div>` : ''}
  </div>`;
}

function render(d) {
  const agentRows = d.agents.map(a => `
    <div class="agent">
      <div class="agent__icon">${a.icon}</div>
      <div class="agent__info">
        <div class="agent__name">${a.name} <span class="agent__status ${a.enabled ? 'on' : 'off'}">${a.enabled ? 'active' : 'off'}</span></div>
        <div class="agent__role">${a.role}</div>
      </div>
      <div class="agent__model">${a.model}</div>
    </div>`).join('');

  const activityRows = d.activity.length
    ? d.activity.map(x => `<div class="act"><span class="act__icon">${x.icon}</span><span class="act__text">${x.text}</span><span class="act__time">${x.time}</span></div>`).join('')
    : '<div class="act act--empty">No activity logged yet. Run the pipeline to see it here.</div>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI World — Mission Control</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400..900&family=Hanken+Grotesk:wght@400..700&display=swap" rel="stylesheet">
<style>
:root{
  --paper:#f2ede4;--card:#fbf9f4;--paper2:#eae3d6;--ink:#1c1a16;--soft:#6f6a60;
  --muted:#9a9388;--line:#e4ddd0;--line2:#d3cabb;--accent:#5f8a76;--blue:#5b7a9d;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--paper);color:var(--ink);font-family:'Hanken Grotesk',sans-serif;font-size:15px;line-height:1.55}
.shell{max-width:1180px;margin:0 auto;padding:28px 22px 60px}
.win{background:var(--card);border:1px solid var(--line2);border-radius:16px;overflow:hidden;box-shadow:0 30px 70px -40px rgba(0,0,0,.4)}
.win__bar{display:flex;align-items:center;gap:8px;padding:14px 18px;border-bottom:1px solid var(--line);background:var(--paper2)}
.dot{width:11px;height:11px;border-radius:50%}
.dot.r{background:#e0795f}.dot.y{background:#e3b341}.dot.g{background:#7aa37f}
.win__title{margin-left:10px;font-weight:700;font-size:13px;color:var(--soft);letter-spacing:.04em}
.win__body{padding:30px 32px}
h1{font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-size:30px;letter-spacing:-.02em}
h1 .dot-accent{color:var(--accent)}
.sub{color:var(--soft);margin-top:4px;margin-bottom:26px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin-bottom:30px}
.stat{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:20px}
.stat__num{font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-size:38px;line-height:1;letter-spacing:-.03em}
.stat__label{color:var(--soft);font-weight:600;margin-top:8px;font-size:13px}
.stat__sub{color:var(--muted);font-size:12px;margin-top:2px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}
@media(max-width:760px){.cols{grid-template-columns:1fr}}
.panel{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:22px}
.panel__h{font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-size:16px;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.agent{display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--line)}
.agent:last-child{border-bottom:none}
.agent__icon{font-size:22px;width:34px;text-align:center}
.agent__info{flex:1}
.agent__name{font-weight:700}
.agent__status{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:2px 8px;border-radius:100px;margin-left:6px}
.agent__status.on{background:#e2efe7;color:#3d7a5f}
.agent__status.off{background:#efe7e4;color:#9a6a5a}
.agent__role{color:var(--soft);font-size:13px}
.agent__model{font-size:11px;color:var(--muted);font-family:monospace;background:var(--card);padding:4px 8px;border-radius:6px;border:1px solid var(--line)}
.pipe{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px}
.pipe__step{flex:1;text-align:center;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 8px}
.pipe__n{font-family:'Schibsted Grotesk',sans-serif;font-weight:800;font-size:26px}
.pipe__l{font-size:11px;color:var(--soft);margin-top:3px}
.pipe__arrow{color:var(--muted);font-size:18px}
.act{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13px}
.act:last-child{border-bottom:none}
.act__icon{width:22px;text-align:center}
.act__text{flex:1}
.act__time{color:var(--muted);font-size:12px;white-space:nowrap}
.act--empty{color:var(--muted);font-style:italic}
.foot{margin-top:22px;color:var(--muted);font-size:12px;text-align:center}
</style>
</head>
<body>
<div class="shell">
  <div class="win">
    <div class="win__bar">
      <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
      <span class="win__title">AI World Co. · Mission Control</span>
    </div>
    <div class="win__body">
      <h1>Mission Control<span class="dot-accent">.</span></h1>
      <p class="sub">Your AI company at a glance — generated ${new Date().toLocaleString('en-AU',{dateStyle:'medium',timeStyle:'short'})}</p>

      <div class="stats">
        ${statCard(d.agents.filter(a=>a.enabled).length, 'Active agents', `of ${d.agents.length} total`)}
        ${statCard(d.published, 'Published', 'articles live')}
        ${statCard(d.sourcesActive, 'Sources', 'official only')}
        ${statCard('$'+d.costTotal.toFixed(3), 'Total AI cost', `$${d.costToday.toFixed(3)} today`)}
      </div>

      <div class="cols">
        <div class="panel">
          <div class="panel__h">🤖 The team</div>
          ${agentRows}
        </div>
        <div>
          <div class="panel" style="margin-bottom:24px">
            <div class="panel__h">📦 Content pipeline</div>
            <div class="pipe">
              <div class="pipe__step"><div class="pipe__n">${d.draftsScraper}</div><div class="pipe__l">Topics found</div></div>
              <span class="pipe__arrow">→</span>
              <div class="pipe__step"><div class="pipe__n">${d.draftsWriter}</div><div class="pipe__l">Awaiting review</div></div>
              <span class="pipe__arrow">→</span>
              <div class="pipe__step"><div class="pipe__n">${d.published}</div><div class="pipe__l">Published</div></div>
            </div>
            <div style="color:var(--muted);font-size:12px;margin-top:8px">${d.rejected} rejected (sent back for rewrite)</div>
          </div>
          <div class="panel">
            <div class="panel__h">⚡ Recent activity</div>
            ${activityRows}
          </div>
        </div>
      </div>

      <p class="foot">AI World Co. — autonomous AI news team · Mission Control is a local tool · refresh by running <code>node dashboard/build-dashboard.js</code></p>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ===================================================================
function main() {
  console.log('🎛️  MISSION CONTROL DASHBOARD ÉPÍTÉS');
  const data = gather();
  const html = render(data);
  writeFileSync(join(__dirname, 'index.html'), html, 'utf-8');
  console.log(`✅ Kész: dashboard/index.html`);
  console.log(`   Agentek: ${data.agents.filter(a=>a.enabled).length}/${data.agents.length} | Publikált: ${data.published} | Forrás: ${data.sourcesActive} | Költség: $${data.costTotal.toFixed(4)}`);
}

main();
