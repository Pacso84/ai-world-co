// ===================================================================
// CEO AGENT (Orchestrator)
// ===================================================================
//
// FELADAT:
//   Az AI World Co. "főnöke". Nem ír cikket, nem scraping-el.
//   ÖSSZEKÖTI a 3 dolgozó agentet egy működő pipeline-ná:
//
//     RSS Scraper → Író → Ellenőrző → Publikálás
//
//   + ellenőrzi a napi limit-eket (cikkek max, költség max)
//   + naplót készít minden futtatásról
//   + jelentést készít a felhasználónak (később Telegram-ra is)
//
// FUTTATÁS:
//   node agents/ceo/agent.js              -- teljes pipeline
//   node agents/ceo/agent.js --skip-scrape -- csak Író + Ellenőrző
//   node agents/ceo/agent.js --report      -- csak napi jelentés
//   node agents/ceo/agent.js --dry-run     -- mit csinálnék, nem futtat
//
// FŐ ELV:
//   "A CEO felelős a budget-ért és minőségért — nem a mennyiségért."
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { addTask, setTaskStatus, notify } from '../../core/ops.js';

// ===================================================================
// SETUP
// ===================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

const ARTICLES_DIR = join(PROJECT_ROOT, 'content', 'articles');
const REJECTED_DIR = join(PROJECT_ROOT, 'content', 'rejected');
const DRAFTS_DIR = join(PROJECT_ROOT, 'content', 'drafts');
const LOGS_DIR = join(PROJECT_ROOT, 'logs');

const CONFIG_PATH = join(PROJECT_ROOT, 'config.json');
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));

const LIMITS = config.limits;
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ===================================================================
// PARANCSSORI ARGUMENTUMOK
// ===================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    skipScrape: args.includes('--skip-scrape'),
    skipWrite: args.includes('--skip-write'),
    skipReview: args.includes('--skip-review'),
    skipDesign: args.includes('--skip-design'),
    skipSeo: args.includes('--skip-seo'),
    skipPublish: args.includes('--skip-publish'),
    reportOnly: args.includes('--report'),
    dryRun: args.includes('--dry-run')
  };
}

// ===================================================================
// AGENT FUTTATÁS (child process-ként)
// ===================================================================
// Egy másik Node script futtatása. Visszaadja a kimenetet és exit kódot.
// ===================================================================

function runAgent(agentPath, args = []) {
  return new Promise((resolve) => {
    const fullPath = join(PROJECT_ROOT, agentPath);
    const label = agentPath.split('/')[1] || agentPath;
    console.log(`\n┌─ Indítás: ${agentPath} ${args.join(' ')}`);
    console.log(`│`);

    // Kanban: feladat létrehozása + "doing"
    const taskId = addTask('Run ' + label, { agent: label });
    setTaskStatus(taskId, 'doing');

    const proc = spawn('node', [fullPath, ...args], {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe']
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdoutBuffer += text;
      text.split('\n').forEach(line => {
        if (line.trim()) console.log(`│ ${line}`);
      });
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderrBuffer += text;
      text.split('\n').forEach(line => {
        if (line.trim()) console.log(`│ ⚠️  ${line}`);
      });
    });

    proc.on('close', (code) => {
      console.log(`└─ Befejezve, exit code: ${code}\n`);
      setTaskStatus(taskId, 'done');
      resolve({ code, stdout: stdoutBuffer, stderr: stderrBuffer });
    });

    proc.on('error', (err) => {
      console.log(`└─ HIBA: ${err.message}\n`);
      setTaskStatus(taskId, 'done');
      notify('alert', `Pipeline lépés hiba: ${label} — ${err.message}`, { agent: 'ceo' });
      resolve({ code: -1, error: err.message });
    });
  });
}

// ===================================================================
// NAPI STATISZTIKA
// ===================================================================

function countTodayArticles() {
  if (!existsSync(ARTICLES_DIR)) return 0;
  const files = readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.json'));
  return files.filter(f => {
    try {
      const data = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      const publishedDate = (data._meta?.published_at || '').slice(0, 10);
      return publishedDate === TODAY;
    } catch {
      return false;
    }
  }).length;
}

function calculateTodayCost() {
  if (!existsSync(LOGS_DIR)) return 0;
  const files = readdirSync(LOGS_DIR);
  let totalCost = 0;
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    if (!f.includes(TODAY)) continue;
    try {
      const log = JSON.parse(readFileSync(join(LOGS_DIR, f), 'utf-8'));
      totalCost += log.total_cost_usd || log.ai_cost_usd || 0;
    } catch { /* ignore */ }
  }
  return totalCost;
}

function countDrafts() {
  if (!existsSync(DRAFTS_DIR)) return { scraper: 0, writer: 0 };
  const files = readdirSync(DRAFTS_DIR);
  return {
    scraper: files.filter(f => f.endsWith('.json') && !f.startsWith('WRITER_')).length,
    writer: files.filter(f => f.startsWith('WRITER_')).length
  };
}

// ===================================================================
// NAPI JELENTÉS
// ===================================================================

function generateReport() {
  const todayArticles = countTodayArticles();
  const todayCost = calculateTodayCost();
  const drafts = countDrafts();
  const rejectedToday = existsSync(REJECTED_DIR)
    ? readdirSync(REJECTED_DIR).filter(f => f.includes(TODAY.replace(/-/g, '-'))).length
    : 0;

  return {
    date: TODAY,
    articles_published_today: todayArticles,
    drafts_awaiting_writer: drafts.scraper,
    drafts_awaiting_review: drafts.writer,
    rejected_today: rejectedToday,
    total_cost_today_usd: todayCost,
    daily_limit_articles: LIMITS.daily_articles_max,
    daily_limit_cost_usd: LIMITS.daily_api_cost_usd_max,
    cost_remaining_usd: Math.max(0, LIMITS.daily_api_cost_usd_max - todayCost),
    articles_remaining: Math.max(0, LIMITS.daily_articles_max - todayArticles)
  };
}

function printReport(report) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  📊 AI WORLD CO. — NAPI JELENTÉS                          ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Dátum:                ${report.date}                            ║`);
  console.log('║                                                            ║');
  console.log(`║  ✅ Publikálva ma:     ${String(report.articles_published_today).padEnd(3)} / ${LIMITS.daily_articles_max} cikk                       ║`);
  console.log(`║  ❌ Elutasítva ma:     ${String(report.rejected_today).padEnd(3)} cikk                                ║`);
  console.log(`║  💰 Költség ma:        $${report.total_cost_today_usd.toFixed(4)} / $${LIMITS.daily_api_cost_usd_max.toFixed(2)}                ║`);
  console.log('║                                                            ║');
  console.log(`║  📥 Draft (Scraper-ből):  ${String(report.drafts_awaiting_writer).padEnd(3)} vár az Íróra                ║`);
  console.log(`║  📝 Draft (Író-ból):      ${String(report.drafts_awaiting_review).padEnd(3)} vár az Ellenőrzőre          ║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');
}

// ===================================================================
// LIMIT ELLENŐRZÉS
// ===================================================================

function checkLimits(report) {
  const blockers = [];
  if (report.articles_published_today >= LIMITS.daily_articles_max) {
    blockers.push(`Napi cikk limit elérve: ${report.articles_published_today}/${LIMITS.daily_articles_max}`);
  }
  if (report.total_cost_today_usd >= LIMITS.daily_api_cost_usd_max) {
    blockers.push(`Napi költség limit elérve: $${report.total_cost_today_usd.toFixed(4)}/$${LIMITS.daily_api_cost_usd_max}`);
  }
  return blockers;
}

// ===================================================================
// LOG MENTÉS (CEO session)
// ===================================================================

function saveCeoLog(sessionData) {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logfile = join(LOGS_DIR, `ceo_${timestamp}.json`);
  writeFileSync(logfile, JSON.stringify(sessionData, null, 2), 'utf-8');
  return logfile;
}

// ===================================================================
// FŐ FUTTATÁS
// ===================================================================

async function main() {
  const args = parseArgs();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  👔 CEO AGENT — AI World Co. Orchestrator                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const session = {
    started_at: new Date().toISOString(),
    date: TODAY,
    mode: args.dryRun ? 'dry-run' : (args.reportOnly ? 'report-only' : 'full-pipeline'),
    stages: {}
  };

  // 1. ELŐ-JELENTÉS
  const preReport = generateReport();
  printReport(preReport);
  session.pre_report = preReport;

  // Ha csak jelentés kellett
  if (args.reportOnly) {
    console.log('✓ Csak jelentés módban futott. Vége.');
    return;
  }

  // 2. LIMIT ELLENŐRZÉS
  const blockers = checkLimits(preReport);
  if (blockers.length > 0) {
    console.log('🚫 LIMIT ELÉRVE — pipeline NEM indul el:');
    blockers.forEach(b => console.log(`   • ${b}`));
    console.log('\n💡 Holnap újra próbálkozhatunk.');
    session.blocked = true;
    session.blockers = blockers;
    saveCeoLog(session);
    return;
  }

  // 3. DRY RUN ESETÉN
  if (args.dryRun) {
    console.log('🧪 DRY RUN — mit csinálnék (de nem futtatok semmit):');
    if (!args.skipScrape) console.log('   1. RSS Scraper futtatása');
    if (!args.skipWrite) console.log('   2. Író agent futtatása');
    if (!args.skipReview) console.log('   3. Ellenőrző agent futtatása');
    if (!args.skipDesign) console.log('   4. Designer agent (fejlécképek)');
    if (!args.skipSeo) console.log('   5. SEO agent (meta-leírás, kulcsszavak)');
    if (!args.skipPublish) console.log('   6. Publikáló agent (weboldal build + deploy)');
    console.log('\n✓ Dry run vége.');
    return;
  }

  // 4. PIPELINE FUTTATÁS

  // 4a. RSS Scraper
  if (!args.skipScrape) {
    console.log('\n━━━ 1. LÉPÉS: RSS SCRAPER ━━━');
    const result = await runAgent('agents/rss-scraper/agent.js');
    session.stages.scraper = { exit_code: result.code };
  } else {
    console.log('⏭️  RSS Scraper kihagyva (--skip-scrape)');
  }

  // 4b. Író
  if (!args.skipWrite) {
    console.log('\n━━━ 2. LÉPÉS: ÍRÓ AGENT ━━━');
    // Limit átadása: maximum ennyi cikket írjon ma
    const remaining = LIMITS.daily_articles_max - preReport.articles_published_today;
    const result = await runAgent('agents/iro/agent.js', ['--limit', String(remaining)]);
    session.stages.writer = { exit_code: result.code, limit_used: remaining };
  } else {
    console.log('⏭️  Író kihagyva (--skip-write)');
  }

  // 4c. Ellenőrző
  if (!args.skipReview) {
    console.log('\n━━━ 3. LÉPÉS: ELLENŐRZŐ AGENT ━━━');
    const result = await runAgent('agents/ellenorzo/agent.js');
    session.stages.reviewer = { exit_code: result.code };
  } else {
    console.log('⏭️  Ellenőrző kihagyva (--skip-review)');
  }

  // 4d. Designer (fejlécképek)
  if (!args.skipDesign) {
    console.log('\n━━━ 4. LÉPÉS: DESIGNER AGENT ━━━');
    const result = await runAgent('agents/designer/agent.js');
    session.stages.designer = { exit_code: result.code };
  } else {
    console.log('⏭️  Designer kihagyva (--skip-design)');
  }

  // 4e. SEO (meta-leírás, kulcsszavak)
  if (!args.skipSeo) {
    console.log('\n━━━ 5. LÉPÉS: SEO AGENT ━━━');
    const result = await runAgent('agents/seo/agent.js');
    session.stages.seo = { exit_code: result.code };
  } else {
    console.log('⏭️  SEO kihagyva (--skip-seo)');
  }

  // 4f. Publikáló (weboldal build + deploy)
  if (!args.skipPublish) {
    console.log('\n━━━ 6. LÉPÉS: PUBLIKÁLÓ AGENT ━━━');
    const result = await runAgent('agents/publisher/agent.js');
    session.stages.publisher = { exit_code: result.code };
  } else {
    console.log('⏭️  Publikáló kihagyva (--skip-publish)');
  }

  // 5. UTÓ-JELENTÉS
  const postReport = generateReport();
  session.post_report = postReport;
  session.finished_at = new Date().toISOString();
  session.duration_seconds = (new Date(session.finished_at) - new Date(session.started_at)) / 1000;

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  ✨ PIPELINE BEFEJEZVE — UTÓ-JELENTÉS                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  printReport(postReport);

  // Mit változott a futtatás közben?
  const articlesNew = postReport.articles_published_today - preReport.articles_published_today;
  const costSpent = postReport.total_cost_today_usd - preReport.total_cost_today_usd;

  console.log(`📈 Ebben a futtatásban:`);
  console.log(`   ✨ ${articlesNew} új cikk publikálva`);
  console.log(`   💸 $${costSpent.toFixed(4)} elköltve`);
  console.log(`   ⏱️  ${session.duration_seconds.toFixed(1)}s teljes időtartam`);

  // 6. CEO log
  const logfile = saveCeoLog(session);
  console.log(`\n📋 Session log: ${logfile}`);

  // 7. Üzenet + ÉRTESÍTÉS (heartbeat) a brand-szabály szerint
  if (articlesNew === 0) {
    console.log('\n💤 Ma nem publikáltunk semmit — ez OK.');
    console.log('   "Üres nap jobb mint gyenge nap." (brand szabály)');
    notify('info', 'Pipeline lefutott — ma nem volt publikálható új tartalom.', { agent: 'ceo' });
  } else {
    console.log(`\n🎉 ${articlesNew} új cikk élesben!`);
    notify('success', `${articlesNew} új cikk publikálva (költség: $${costSpent.toFixed(4)}).`, { agent: 'ceo' });
  }
}

// ===================================================================
// INDÍTÁS
// ===================================================================

main().catch(error => {
  console.error('💥 CEO KRITIKUS HIBA:', error);
  process.exit(1);
});
