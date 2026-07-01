// ===================================================================
// FORDÍTÓ AGENT (translator) — a publikált cikkek/útmutatók fordítása
// ===================================================================
//
// Minden publikált ARTICLE_* markdownját lefordítja a cél-nyelvekre, és
// GYORSÍTÓTÁRAZZA (content/translations/<ARTICLE...>.json = { hu:"md", es:"md", ... }).
// Idempotens: csak a HIÁNYZÓ (még le nem fordított) párokat fordítja, ezért
// minden futáskor az új cikkekkel halad. A build.js innen veszi a fordításokat;
// ami még nincs lefordítva, ott angol fallback megy.
//
// FUTTATÁS:
//   node agents/translator/agent.js               -- max LIMIT pár/futás
//   node agents/translator/agent.js --limit 30
//   node agents/translator/agent.js --lang hu     -- csak egy nyelv
//   node agents/translator/agent.js --force       -- meglévőket is újrafordít
//
// CÉL-NYELVEK: magyar + nagy világnyelvek (angol a FORRÁS, azt nem fordítjuk).
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const TRANS_DIR = join(ROOT, 'content', 'translations');
const AGENT_NAME = 'translator';

// Cél-nyelvek (kód → emberi név az LLM-promptnak). Az 'en' a forrás.
export const LANGS = {
  hu: 'Hungarian',
  es: 'Spanish',
  de: 'German',
  fr: 'French'
};

function parseArgs() {
  const a = process.argv.slice(2);
  const p = { limit: 16, force: false, lang: null };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--limit' && a[i + 1]) p.limit = parseInt(a[++i], 10) || 16;
    else if (a[i] === '--force') p.force = true;
    else if (a[i] === '--lang' && a[i + 1]) p.lang = a[++i];
  }
  return p;
}

function loadCache(file) {
  const p = join(TRANS_DIR, file);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return {}; }
}
function saveCache(file, data) {
  if (!existsSync(TRANS_DIR)) mkdirSync(TRANS_DIR, { recursive: true });
  writeFileSync(join(TRANS_DIR, file), JSON.stringify(data, null, 2), 'utf-8');
}

const SYSTEM = `You are a professional translator for a friendly AI-news + how-to website for everyday people. Translate faithfully and naturally (warm, clear — not robotic). Do NOT translate brand/product names (ChatGPT, Gemini, Claude, Copilot, etc.) or code. In the BODY keep all Markdown intact (## headings, lists, **bold**, emojis, line breaks) and translate only the human text.

Output EXACTLY this format, nothing else (keep the three labels in English, each on its own line):
TITLE: <translated title>
SUBTITLE: <translated subtitle>
BODY:
<the full translated body in Markdown>`;

// Frontmatter szétválasztás + érték-kiolvasás
function splitFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  return m ? { fm: m[1], body: m[2] } : null;
}
function fmValue(fm, key) {
  const m = fm.match(new RegExp('^' + key + ':\\s*(.*)$', 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
}

// Egy cikk fordítása: cím+alcím+törzs LLM-mel, de a FRONTMATTERT MI állítjuk
// össze (az angolból, lecserélt title/subtitle-lel) → a záró --- mindig megvan,
// így a build mindig ki tudja olvasni a fordított címet.
async function translateMarkdown(markdown, langName) {
  const parts = splitFrontmatter(markdown);
  if (!parts) return null;
  const enTitle = fmValue(parts.fm, 'title');
  const enSub = fmValue(parts.fm, 'subtitle');

  const prompt = `Translate the following into ${langName}. Use the exact output format (TITLE / SUBTITLE / BODY).\n\nTITLE: ${enTitle}\nSUBTITLE: ${enSub}\nBODY:\n${parts.body}`;
  const r = await ask(prompt, { agentName: AGENT_NAME, systemPrompt: SYSTEM, maxTokens: 6000 });
  if (!r || !r.text) return null;

  const t = r.text;
  const tm = t.match(/TITLE:\s*(.+)/);
  const sm = t.match(/SUBTITLE:\s*(.+)/);
  const bm = t.match(/BODY:\s*\n?([\s\S]*)$/);
  const title = (tm ? tm[1] : enTitle).trim().replace(/^["']|["']$/g, '');
  const sub = (sm ? sm[1] : enSub).trim().replace(/^["']|["']$/g, '');
  const body = (bm ? bm[1] : '').trim();
  if (body.length < 80) return null;
  // CSONKULÁS-VÉDELEM: ha a fordítás gyanúsan rövidebb az angolnál (kifutott
  // a token-keretből), NE mentsük el félbevágva — inkább következő körben újra.
  if (body.length < parts.body.length * 0.35) return null;

  const fm = parts.fm
    .replace(/^title:\s*.*$/m, `title: "${title.replace(/"/g, '')}"`)
    .replace(/^subtitle:\s*.*$/m, `subtitle: "${sub.replace(/"/g, '')}"`);
  return { text: `---\n${fm}\n---\n\n${body}`, cost: r.costUsd || 0 };
}

function looksValid(md) {
  // Kötelező: nyitó ÉS záró frontmatter delimiter + értelmes hossz
  return md && /^---\n[\s\S]*?\n---/.test(md.trimStart()) && md.length > 160;
}

async function main() {
  const args = parseArgs();
  const targetLangs = args.lang ? [args.lang] : Object.keys(LANGS);
  console.log('🌍 FORDÍTÓ AGENT — nyelvek:', targetLangs.join(', '));
  console.log('─'.repeat(60));

  if (!existsSync(ARTICLES_DIR)) { console.log('Nincs cikk.'); return; }
  // PRIORITÁS: a published_at szerint LEGFRISSEBB tartalom fordul először —
  // így a címlapon lévő friss HÍREK minden nyelven hamar megjelennek.
  // (A korábbi fájlnév-rendezés az ARTICLE_GUIDE_* fájlokat vette mindig előre
  // — 'G' > '2026' — ezért a hírek SOSEM kerültek sorra. 2026-07-01 tanulság.)
  const files = readdirSync(ARTICLES_DIR)
    .filter(f => f.startsWith('ARTICLE_') && f.endsWith('.json'))
    .map(f => {
      let pub = '';
      try { pub = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'))._meta?.published_at || ''; } catch { /* skip */ }
      return { f, pub };
    })
    .sort((a, b) => (b.pub || '').localeCompare(a.pub || ''))
    .map(x => x.f);

  let done = 0, cost = 0, skipped = 0, failed = 0;
  outer:
  for (const file of files) {
    let data; try { data = JSON.parse(readFileSync(join(ARTICLES_DIR, file), 'utf-8')); } catch { continue; }
    const md = data.article_markdown;
    if (!md) continue;
    const cache = loadCache(file);

    for (const code of targetLangs) {
      if (!LANGS[code]) continue;
      if (cache[code] && !args.force) { skipped++; continue; }
      if (done >= args.limit) { console.log(`\n⏸️  Elértem a futás-limitet (${args.limit}). A többit a következő futás fordítja.`); break outer; }

      process.stdout.write(`🔤 ${code} ← ${file.slice(0, 48)}… `);
      const res = await translateMarkdown(md, LANGS[code]);
      if (res && looksValid(res.text)) {
        cache[code] = res.text.trim();
        saveCache(file, cache);
        cost += res.cost; done++;
        console.log(`✅ ($${res.cost.toFixed(4)})`);
      } else {
        failed++;
        console.log('❌ (sikertelen / érvénytelen)');
      }
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`📊 Fordítva: ${done} | már megvolt: ${skipped} | sikertelen: ${failed} | költség $${cost.toFixed(4)}`);
}

main().catch(e => { console.error('💥 FORDÍTÓ HIBA:', e); process.exit(1); });
