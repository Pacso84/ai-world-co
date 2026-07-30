// ===================================================================
// SOCIAL AGENT (Facebook + Pinterest poszt-gyártó)
// ===================================================================
//
// FELADAT:
//   Minden PUBLIKÁLT cikkhez/útmutatóhoz posztot ír:
//     • Facebook: 1-2 mondatos, barátságos, link + max 2 hashtag
//   A szöveget a Pinterest-poszter is ebből veszi.
//   Eredmény: content/social/<slug>.json (gépi) + content/social/feed.md
//   (ember által olvasható, kézzel is kiposztolható). A cikk _meta-ját
//   social:true-ra állítja, hogy ne dolgozzon kétszer (inkrementális).
//
// ── INSTAGRAM KIVEZETVE (2026-07-29, user: "instagramot vegyük ki") ──
//   407 Instagram-szöveg készült el, és EGYETLENEGY sem ment ki soha —
//   nem volt, ami kiküldje. Ráadásul az Instagram gyenge forgalomforrás
//   egy honlapnak: a posztban NEM lehet kattintható link (a saját
//   szövegeink is "Link in bio"-val végződtek). Márkajelenlétnek jó,
//   látogatószerzésnek nem — a cél pedig a forgalom.
//   A már legyártott mezőket is töröltük az adatfájlokból.
//
// FUTTATÁS:
//   node agents/social/agent.js            (csak ahol még nincs poszt)
//   node agents/social/agent.js --all      (mindet újragenerálja)
//   node agents/social/agent.js --limit 5
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { skillsBlock } from '../../core/skills.js';
import { message } from '../../core/ops.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const SOCIAL_DIR = join(ROOT, 'content', 'social');
const CONFIG_PATH = join(ROOT, 'config.json');
const AGENT_NAME = 'social';

const ALL = process.argv.includes('--all');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : 30; })();

function siteUrl() {
  try { return (JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')).company?.website_url || '').replace(/\/$/, ''); } catch { return ''; }
}
function slugify(t) { return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); }

function frontTitle(md) {
  const m = (md || '').match(/title:\s*["']?(.+?)["']?\s*$/m);
  return m ? m[1].trim() : '';
}

const SYS = `You are the social media writer for AI World Co. — AI news & how-to in plain language for everyday people (Australian English). Write posts that are warm, useful and NOT clickbait or spammy.

Given an article, return the Facebook post. Output ONLY JSON (no markdown, no code fence):
{
  "facebook": "1-2 friendly sentences that make a busy person want to read it. End with the link placeholder {LINK}. Max 2 relevant hashtags.",
  "image_idea": "one short sentence describing a simple, tasteful image for the post (no text-in-image)."
}
Rules: Australian English. Plain language. No ALL CAPS, no 'game-changer'/'revolutionary' hype, no emoji spam (1-3 max). Be specific about the benefit.`;

function loadArticles() {
  if (!existsSync(ARTICLES_DIR)) return [];
  const out = [];
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      if (!ALL && d._meta?.social) continue;
      out.push({ file: f, data: d });
    } catch {}
  }
  return out.slice(0, LIMIT);
}

function parseJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

async function main() {
  console.log('📣 SOCIAL AGENT — Facebook + Pinterest poszt-gyártó');
  console.log('─'.repeat(60));
  const items = loadArticles();
  if (!items.length) { console.log('💤 Nincs poszt nélküli cikk (--all az újrageneráláshoz).'); return; }
  console.log(`📝 ${items.length} cikkhez posztot írok\n`);

  if (!existsSync(SOCIAL_DIR)) mkdirSync(SOCIAL_DIR, { recursive: true });
  const base = siteUrl() || 'https://example.com';
  let done = 0, cost = 0;
  const feed = [];

  for (const it of items) {
    const md = it.data.article_markdown || '';
    const title = it.data.original_title || frontTitle(md) || it.file;
    // ===================================================================
    // A RÖGZÍTETT SLUG AZ IGAZSÁG (2026-07-29) — KÉT HIBA EGY SORBAN
    // ===================================================================
    // 1) A címből számolt slug 60 karakterre vágott, a build viszont 70-re
    //    (és 2026-07-27 óta a RÖGZÍTETT _meta.slug-ot használja). A 10 karakter
    //    különbség miatt 407 közösségi posztból 210 NEM LÉTEZŐ oldalra mutatott
    //    — élőben ellenőrizve: HTTP 404. Minden Facebook-poszt és Pinterest-pin
    //    ezekhez a cikkekhez a semmibe vitte az olvasót.
    // 2) A .html végződést a Cloudflare 308-cal átirányítja. A 07-27-i nagy
    //    kanonikus-javítás minden más kimenetet rendbe tett (sitemap, canonical,
    //    hreflang, IndexNow), de EZ A FÁJL KIMARADT.
    //
    // MIÉRT MARADT REJTVE: a poszt kiment, a webhook 200-at adott, a napi riport
    // "kiküldve"-t írt. Minden réteg sikert jelentett — csak a láncot senki nem
    // követte végig a linkig. Ugyanaz a minta, mint a Pinterest-modul hiányánál.
    const isGuide = it.data._meta?.type === 'guide';
    const slug = it.data._meta?.slug || slugify(frontTitle(md) || title);
    const url = `${base}/article/${slug}`;

    const prompt = `TYPE: ${isGuide ? 'step-by-step guide' : 'news article'}
TITLE: ${title}
EXCERPT: ${md.replace(/[#*>\-]/g, ' ').replace(/\s+/g, ' ').slice(0, 600)}
${skillsBlock('social')}
Write the post. Output the JSON only.`;

    // 1200 token: a "gondolkodó" fallback modelleknek (gemini-2.5-flash) is elég legyen a kimenetre
    const r = await ask(prompt, { agentName: AGENT_NAME, systemPrompt: SYS, maxTokens: 1200, jsonMode: true });
    cost += r?.costUsd || 0;
    const p = parseJson(r?.text);
    // Néhány modell beágyazza (pl. facebook:{post:...}) — string-re normalizáljuk
    const str = v => typeof v === 'string' ? v : (v && (v.post || v.text || v.caption || v.content)) || (v && typeof v === 'object' ? Object.values(v).filter(x => typeof x === 'string').join(' ') : '') || '';
    if (!p || !str(p.facebook)) { console.log(`⚠️  ${title.slice(0, 45)}… — nem sikerült`); continue; }
    p.facebook = str(p.facebook); p.image_idea = str(p.image_idea);

    const fb = (p.facebook || '').replace('{LINK}', url);
    const pack = { slug, title, url, type: isGuide ? 'guide' : 'news', facebook: fb, image_idea: p.image_idea || '', generated_at: new Date().toISOString() };
    writeFileSync(join(SOCIAL_DIR, `${slug}.json`), JSON.stringify(pack, null, 2), 'utf-8');

    // a cikket megjelöljük (inkrementális)
    it.data._meta = { ...it.data._meta, social: true, social_at: new Date().toISOString() };
    writeFileSync(join(ARTICLES_DIR, it.file), JSON.stringify(it.data, null, 2), 'utf-8');

    feed.push(`## ${title}\n**🔗 ${url}**\n\n**Facebook:**\n${fb}\n\n*Kép-ötlet: ${p.image_idea || '—'}*\n`);
    done++;
    console.log(`✅ ${title.slice(0, 50)}…`);
  }

  // ember által olvasható, kézzel posztolható gyűjtemény
  if (feed.length) {
    const header = `# AI World Co. — közösségi posztok\n\n*Generálva: ${new Date().toISOString()}. Ezeket kézzel kiposztolhatod, vagy élesítés után a Meta-publisher auto-küldi.*\n\n---\n\n`;
    let existing = '';
    const feedPath = join(SOCIAL_DIR, 'feed.md');
    if (existsSync(feedPath) && !ALL) existing = readFileSync(feedPath, 'utf-8').replace(/^#[\s\S]*?---\n\n/, '');
    writeFileSync(feedPath, header + feed.join('\n---\n\n') + (existing ? '\n---\n\n' + existing : ''), 'utf-8');
  }

  if (done) message('social', 'team', 'info', `${done} közösségi poszt megírva (Facebook). content/social/feed.md`);
  console.log('\n' + '─'.repeat(60));
  console.log(`📊 ${done} poszt-csomag megírva | költség $${cost.toFixed(4)}`);
  console.log(`📄 Olvasható gyűjtemény: content/social/feed.md  (kézzel posztolható)`);
  if (!siteUrl() || siteUrl().includes('example.com'))
    console.log(`ℹ️  A linkek a config.company.website_url-t használják — élesítéskor állítsd a valódi domainre.`);
}

main().catch(e => { console.error('💥 SOCIAL HIBA:', e); process.exit(1); });
