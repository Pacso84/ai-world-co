// ===================================================================
// WEBOLDAL ÉPÍTŐ (static site generator)
// ===================================================================
//
// NEM AI agent - determinisztikus build script.
// A content/articles/ JSON cikkekből statikus HTML oldalt generál.
//
// FUTTATÁS:
//   node website/build.js
//
// KIMENET:
//   website/public/index.html          - főoldal
//   website/public/article/<slug>.html - cikk oldalak
//   website/public/assets/style.css    - stílus (másolva)
// ===================================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const ARTICLES_DIR = join(PROJECT_ROOT, 'content', 'articles');
const OUT_DIR = join(__dirname, 'public');
const OUT_ARTICLE_DIR = join(OUT_DIR, 'article');
const OUT_ASSETS_DIR = join(OUT_DIR, 'assets');
const ASSETS_SRC = join(__dirname, 'assets');

const SITE = {
  name: 'AI WORLD',
  tagline: 'Australian AI news, in plain language',
  description: 'AI news and how-to guides for everyday Australians — fresh, friendly, jargon-free.'
};

// Kategória -> megjelenítendő név + CSS osztály (szín)
const CATEGORIES = {
  'ai-news':  { label: 'AI News',  cls: 'cat-news' },
  'how-to':   { label: 'How-To',   cls: 'cat-howto' },
  'business': { label: 'Business', cls: 'cat-business' },
  'work':     { label: 'Work',     cls: 'cat-work' },
  'creative': { label: 'Creative', cls: 'cat-creative' },
  'other':    { label: 'AI',       cls: 'cat-other' }
};

// ===================================================================
// SEGÉDEK
// ===================================================================

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Egyszerű frontmatter parser (--- ... --- blokk a markdown tetején)
function parseFrontmatter(markdown) {
  const fm = { title: '', subtitle: '', category: 'other', read_time_minutes: 3, tags: [] };
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: fm, body: markdown };

  const [, fmBlock, body] = match;
  for (const line of fmBlock.split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    // idézőjelek le
    val = val.replace(/^["']|["']$/g, '');
    if (key === 'tags') {
      // ["a", "b"] formátum
      try { fm.tags = JSON.parse(m[2].trim()); }
      catch { fm.tags = m[2].replace(/[\[\]"]/g, '').split(',').map(s => s.trim()).filter(Boolean); }
    } else if (key === 'read_time_minutes') {
      fm.read_time_minutes = parseInt(val, 10) || 3;
    } else if (fm.hasOwnProperty(key)) {
      fm[key] = val;
    }
  }
  return { meta: fm, body };
}

// A "What this means for you" szekciót kiemelt dobozba csomagolja
function wrapImpactSection(html) {
  // h2 "What this means for you" -> a következő h2-ig (vagy végéig) aside-ba
  const re = /<h2[^>]*>\s*What this means for you\s*<\/h2>([\s\S]*?)(?=<h2|<hr|$)/i;
  return html.replace(re, (full, inner) => {
    return `<aside class="impact">
      <div class="impact__label">What this means for you</div>
      ${inner}
    </aside>`;
  });
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ===================================================================
// CIKKEK BETÖLTÉSE
// ===================================================================

function loadArticles() {
  if (!existsSync(ARTICLES_DIR)) return [];
  const files = readdirSync(ARTICLES_DIR).filter(f => f.startsWith('ARTICLE_') && f.endsWith('.json'));
  const articles = [];

  for (const file of files) {
    try {
      const data = JSON.parse(readFileSync(join(ARTICLES_DIR, file), 'utf-8'));
      const { meta, body } = parseFrontmatter(data.article_markdown);
      const slug = slugify(meta.title || data.original_title || file);

      articles.push({
        slug,
        title: meta.title || data.original_title || 'Untitled',
        subtitle: meta.subtitle || '',
        category: meta.category || 'other',
        readTime: meta.read_time_minutes || 3,
        tags: meta.tags || [],
        bodyHtml: wrapImpactSection(marked.parse(body)),
        publishedAt: data._meta?.published_at || '',
        sourceName: data._meta?.source_name || '',
        sourceLink: data._meta?.source_link || '',
        reviewScore: data._meta?.ai_review?.overall_score || null
      });
    } catch (e) {
      console.warn(`⚠️  Hiba a(z) ${file} feldolgozásakor: ${e.message}`);
    }
  }

  // Legújabb előre
  articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return articles;
}

// ===================================================================
// HTML SABLONOK
// ===================================================================

function pageShell({ title, description, bodyContent, isArticle = false }) {
  const cssPath = isArticle ? '../assets/style.css' : 'assets/style.css';
  const homePath = isArticle ? '../index.html' : 'index.html';
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..900;1,9..144,400..700&family=Hanken+Grotesk:wght@400..800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${cssPath}">
</head>
<body>
  <header class="masthead">
    <div class="masthead__inner">
      <div class="masthead__top">
        <span class="masthead__edition">Australian Edition</span>
        <span class="masthead__date">${formatDate(new Date().toISOString())}</span>
      </div>
      <a href="${homePath}" class="masthead__logo">${SITE.name}<span class="masthead__dot">.</span></a>
      <p class="masthead__tagline">${SITE.tagline}</p>
    </div>
    <div class="masthead__rule"></div>
  </header>
  <main class="wrap">
    ${bodyContent}
  </main>
  <footer class="site-footer">
    <div class="wrap">
      <p class="site-footer__brand">${SITE.name}<span class="masthead__dot">.</span></p>
      <p class="site-footer__note">${escapeHtml(SITE.description)}</p>
      <p class="site-footer__fine">Written and curated by autonomous AI agents · Reviewed for accuracy · © ${year} AI World Co.</p>
    </div>
  </footer>
</body>
</html>`;
}

function articleCard(a, featured = false) {
  const cat = CATEGORIES[a.category] || CATEGORIES.other;
  const cls = featured ? 'card card--featured' : 'card';
  return `<article class="${cls}">
    <a href="article/${a.slug}.html" class="card__link">
      <div class="card__meta">
        <span class="tag ${cat.cls}">${cat.label}</span>
        <span class="card__read">${a.readTime} min read</span>
      </div>
      <h2 class="card__title">${escapeHtml(a.title)}</h2>
      <p class="card__subtitle">${escapeHtml(a.subtitle)}</p>
      <div class="card__foot">
        <span class="card__source">${escapeHtml(a.sourceName)}</span>
        <span class="card__arrow">→</span>
      </div>
    </a>
  </article>`;
}

function buildIndex(articles) {
  if (articles.length === 0) {
    const empty = `<div class="empty">
      <h1 class="empty__title">No stories yet</h1>
      <p>Our AI newsroom is gathering the latest. Check back soon.</p>
    </div>`;
    return pageShell({ title: `${SITE.name} — ${SITE.tagline}`, description: SITE.description, bodyContent: empty });
  }

  const [featured, ...rest] = articles;
  const featuredHtml = `<section class="hero">
    ${articleCard(featured, true)}
  </section>`;

  const grid = rest.length > 0 ? `<section class="grid-section">
    <h2 class="section-label">Latest stories</h2>
    <div class="grid">
      ${rest.map(a => articleCard(a)).join('\n')}
    </div>
  </section>` : '';

  return pageShell({
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    bodyContent: featuredHtml + grid
  });
}

function buildArticlePage(a) {
  const cat = CATEGORIES[a.category] || CATEGORIES.other;
  const tagsHtml = a.tags.length
    ? `<div class="article__tags">${a.tags.map(t => `<span class="minitag">#${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  const body = `<article class="article">
    <div class="article__head">
      <span class="tag ${cat.cls}">${cat.label}</span>
      <h1 class="article__title">${escapeHtml(a.title)}</h1>
      <p class="article__subtitle">${escapeHtml(a.subtitle)}</p>
      <div class="article__meta">
        <span>${a.readTime} min read</span>
        <span class="dot">·</span>
        <span>${formatDate(a.publishedAt)}</span>
        ${a.sourceName ? `<span class="dot">·</span><span>Source: ${escapeHtml(a.sourceName)}</span>` : ''}
      </div>
    </div>
    <div class="article__body">
      ${a.bodyHtml}
    </div>
    ${tagsHtml}
    <div class="article__foot">
      ${a.sourceLink ? `<a href="${escapeHtml(a.sourceLink)}" class="source-link" target="_blank" rel="noopener">Read the original source →</a>` : ''}
      <p class="ai-disclosure">✦ Written and edited by AI World Co.'s autonomous AI agents. Reviewed for accuracy by our editorial system.</p>
      <a href="../index.html" class="back-link">← Back to all stories</a>
    </div>
  </article>`;

  return pageShell({ title: `${a.title} — ${SITE.name}`, description: a.subtitle, bodyContent: body, isArticle: true });
}

// ===================================================================
// FŐ BUILD
// ===================================================================

function main() {
  console.log('🌐 WEBOLDAL ÉPÍTÉS INDUL');
  console.log('─'.repeat(60));

  // Tiszta kimenet
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_ARTICLE_DIR, { recursive: true });
  mkdirSync(OUT_ASSETS_DIR, { recursive: true });

  // CSS másolás
  const cssSrc = join(ASSETS_SRC, 'style.css');
  if (existsSync(cssSrc)) {
    copyFileSync(cssSrc, join(OUT_ASSETS_DIR, 'style.css'));
    console.log('✅ style.css másolva');
  } else {
    console.warn('⚠️  Nincs style.css az assets/-ben!');
  }

  // Cikkek
  const articles = loadArticles();
  console.log(`📰 ${articles.length} publikált cikk betöltve`);

  // Index
  writeFileSync(join(OUT_DIR, 'index.html'), buildIndex(articles), 'utf-8');
  console.log('✅ index.html generálva');

  // Cikk oldalak
  for (const a of articles) {
    writeFileSync(join(OUT_ARTICLE_DIR, `${a.slug}.html`), buildArticlePage(a), 'utf-8');
  }
  console.log(`✅ ${articles.length} cikk oldal generálva`);

  console.log('─'.repeat(60));
  console.log(`✨ Kész! Nyisd meg: website/public/index.html`);
}

main();
