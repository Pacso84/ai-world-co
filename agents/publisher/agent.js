// ===================================================================
// PUBLIKÁLÓ AGENT (Publisher / Deploy)
// ===================================================================
//
// A pipeline UTOLSÓ láncszeme. Feladata:
//   1. Újraépíti a weboldalt (website/build.js) — a publikált cikkekből
//   2. Frissíti a Mission Control dashboardot
//   3. FELTÖLTI az élő tárhelyre (deploy) — konfigtól függően
//
// FUTTATÁS:
//   node agents/publisher/agent.js            (build + deploy a config szerint)
//   node agents/publisher/agent.js --build-only   (csak build, nincs feltöltés)
//
// DEPLOY CÉLOK (config.json -> infrastructure.deploy.method):
//   "none"           - csak helyi build (alapértelmezett, amíg nincs tárhely)
//   "cloudflare"     - Cloudflare Pages (wrangler kell) [future]
//   "github-pages"   - git push a gh-pages branch-re [future]
//   "ftp"            - FTP feltöltés InfinityFree-szerű tárhelyre [future]
//
// ELV: "csak akkor élesítünk, ha minden agent kész és minden be van kötve."
// Ezért a deploy most biztonságosan 'none' — a build viszont teljesen működik.
// ===================================================================

import 'dotenv/config';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { ask } from '../../core/ai-router.js';
import { notify } from '../../core/ops.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));

function parseArgs() {
  const args = process.argv.slice(2);
  return { buildOnly: args.includes('--build-only') };
}

// Egy build-script futtatása gyermekfolyamatként
function runScript(relPath, label) {
  return new Promise((resolve) => {
    console.log(`\n┌─ ${label}: ${relPath}`);
    const proc = spawn('node', [join(ROOT, relPath)], { cwd: ROOT, env: process.env, stdio: ['inherit', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', d => { out += d; d.toString().split('\n').forEach(l => l.trim() && console.log(`│ ${l}`)); });
    proc.stderr.on('data', d => d.toString().split('\n').forEach(l => l.trim() && console.log(`│ ⚠️ ${l}`)));
    proc.on('close', code => { console.log(`└─ exit ${code}`); resolve(code === 0); });
    proc.on('error', e => { console.log(`└─ HIBA: ${e.message}`); resolve(false); });
  });
}

// ===================================================================
// DEPLOY DISPATCHER
// ===================================================================

async function deploy(method) {
  const publicDir = join(ROOT, 'website', 'public');
  const fileCount = existsSync(publicDir)
    ? readdirSync(publicDir, { recursive: true }).filter(f => String(f).endsWith('.html')).length
    : 0;

  switch (method) {
    case 'none':
      console.log('\n📦 DEPLOY: "none" — csak helyi build (még nincs élesítés).');
      console.log(`   A kész oldal itt van: website/public/ (${fileCount} HTML oldal)`);
      console.log('   Amikor lesz tárhely, állítsd: config.json -> infrastructure.deploy.method');
      return true;

    case 'cloudflare':
      // FUTURE: wrangler pages deploy website/public --project-name=...
      console.log('\n☁️  DEPLOY: Cloudflare Pages — még nincs bekötve.');
      console.log('   Teendő: npm i -g wrangler; wrangler login; majd ide a deploy parancs.');
      return false;

    case 'github-pages':
      // FUTURE: git subtree push / gh-pages branch
      console.log('\n🐙 DEPLOY: GitHub Pages — még nincs bekötve.');
      return false;

    case 'ftp':
      // FUTURE: FTP upload (basic-ftp csomag) - InfinityFree, kulcsok a .env-ben
      console.log('\n📡 DEPLOY: FTP — még nincs bekötve (kulcsok kellenek a .env-be).');
      return false;

    default:
      console.log(`\n❓ Ismeretlen deploy method: "${method}" — kihagyom.`);
      return false;
  }
}

// ===================================================================
// AI FŐSZERKESZTŐI ZÁRÓ-ELLENŐRZÉS (kész-e a kiadásra?)
// ===================================================================

async function editorialReview() {
  const dir = join(ROOT, 'content', 'articles');
  const titles = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json')).slice(-10)) {
      try {
        const d = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
        const m = (d.article_markdown || '').match(/^title:\s*"?(.+?)"?\s*$/m);
        titles.push(m ? m[1] : (d.original_title || f));
      } catch {}
    }
  }
  if (titles.length === 0) {
    notify('warn', 'Publikáló: nincs publikálható cikk — üres kiadás.', { agent: 'publisher' });
    return;
  }

  const prompt = `You are the editor-in-chief of AI World Co. (Australian AI news for everyday people).
The site is about to be published with these articles:
${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

In 2-3 sentences, write a short publish summary for the owner: is the line-up coherent and ready, and any concern to note? Be concise and friendly.`;

  const res = await ask(prompt, { agentName: 'publisher', systemPrompt: 'You are a concise editor-in-chief. 2-3 sentences only.', maxTokens: 300 });
  if (res) {
    console.log(`\n📰 Főszerkesztői összefoglaló:\n   ${res.text.trim()}\n`);
    notify('success', `Kiadás kész (${titles.length} cikk). ${res.text.trim().slice(0, 200)}`, { agent: 'publisher' });
  }
}

// ===================================================================
// FŐ
// ===================================================================

async function main() {
  const args = parseArgs();
  console.log('🚀 PUBLIKÁLÓ AGENT INDUL');
  console.log('─'.repeat(60));

  // 0. AI főszerkesztői záró-ellenőrzés (kész-e a kiadásra)
  try { await editorialReview(); } catch (e) { console.log('⚠️  Főszerkesztői review kihagyva: ' + e.message); }

  // 1. Weboldal build
  const webOk = await runScript('website/build.js', 'Weboldal build');
  // 2. Dashboard build
  const dashOk = await runScript('dashboard/build-dashboard.js', 'Dashboard build');

  if (!webOk) {
    console.log('\n💥 A weboldal build elesett — NEM publikálok.');
    process.exit(1);
  }

  // 3. Deploy (ha nem --build-only)
  const method = CONFIG.infrastructure?.deploy?.method || 'none';
  if (args.buildOnly) {
    console.log('\n⏭️  --build-only: feltöltés kihagyva.');
  } else {
    await deploy(method);
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`✅ PUBLIKÁLÁS KÉSZ — web: ${webOk ? 'OK' : 'HIBA'}, dashboard: ${dashOk ? 'OK' : 'HIBA'}, deploy: ${method}`);
}

main().catch(e => { console.error('💥 KRITIKUS HIBA:', e); process.exit(1); });
