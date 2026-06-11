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

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, rmSync, cpSync } from 'fs';
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
  'ai-news':  { label: 'AI News',  cls: 'cat-news',     icon: '📰' },
  'how-to':   { label: 'How-To',   cls: 'cat-howto',    icon: '🛠️' },
  'business': { label: 'Business', cls: 'cat-business', icon: '📈' },
  'work':     { label: 'Work',     cls: 'cat-work',     icon: '💡' },
  'creative': { label: 'Creative', cls: 'cat-creative', icon: '🎨' },
  'other':    { label: 'AI',       cls: 'cat-other',    icon: '✨' }
};

// Célhasználat (audience) — hova építhető be
const AUDIENCES = {
  'personal': { label: 'Everyday life', icon: '🏠', cls: 'aud-personal' },
  'business': { label: 'Business',      icon: '💼', cls: 'aud-business' },
  'both':     { label: 'Life & Business', icon: '🔄', cls: 'aud-both' }
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
  const fm = { title: '', subtitle: '', category: 'other', audience: 'both', read_time_minutes: 3, tags: [] };
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

      // Van valódi kép a slug-hoz? (Designer agent generálta)
      const imgFile = ['jpg', 'png', 'jpeg', 'webp'].map(ext => `${slug}.${ext}`)
        .find(name => existsSync(join(ASSETS_SRC, 'images', name)));

      articles.push({
        slug,
        image: imgFile || null,
        title: meta.title || data.original_title || 'Untitled',
        subtitle: meta.subtitle || '',
        category: meta.category || 'other',
        audience: ['personal', 'business', 'both'].includes(meta.audience) ? meta.audience : 'both',
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
  <link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:ital,wght@0,400..900;1,400..700&family=Hanken+Grotesk:wght@400..700&display=swap" rel="stylesheet">
  <link rel="icon" type="image/svg+xml" href="${cssPath.replace('style.css', 'logo.svg')}">
  <link rel="stylesheet" href="https://unpkg.com/aos@2.3.4/dist/aos.css">
  <link rel="stylesheet" href="${cssPath}">
</head>
<body>
  ${isArticle ? '<div class="progress-bar" id="progressBar"></div>' : ''}
  <header class="navbar" id="navbar">
    <div class="navbar__inner">
      <a href="${homePath}" class="navbar__logo"><img src="${cssPath.replace('style.css', 'logo.svg')}" alt="" class="navbar__mark">${SITE.name}<span class="navbar__dot">.</span></a>
      <nav class="navbar__nav">
        <a href="${homePath}#all" data-nav="all">Latest</a>
        <a href="${homePath}#personal" data-nav="personal">🏠 Everyday life</a>
        <a href="${homePath}#business" data-nav="business">💼 Business</a>
      </nav>
      <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode" title="Light / dark">
        <span class="theme-toggle__icon">☾</span>
      </button>
    </div>
  </header>${isArticle ? '' : `
  <section class="intro">
    <div class="intro__inner">
      <p class="intro__kicker">Issue 01 · Australian Edition · ${formatDate(new Date().toISOString())}</p>
      <h1 class="intro__title">Everyday AI, <em>explained simply.</em></h1>
      <p class="intro__tagline">${SITE.tagline}</p>
    </div>
  </section>`}
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
  <script src="https://unpkg.com/aos@2.3.4/dist/aos.js"></script>
  <script src="${cssPath.replace('style.css', 'app.js')}"></script>
</body>
</html>`;
}

// Borító: valódi kép (ha van), különben lágy gradiens borító kategória-ikonnal
function coverHtml(a, pathPrefix, cls) {
  const cat = CATEGORIES[a.category] || CATEGORIES.other;
  if (a.image) {
    return `<div class="${cls}"><img src="${pathPrefix}assets/images/${a.image}" alt="${escapeHtml(a.title)}" loading="lazy"></div>`;
  }
  return `<div class="${cls} cover--gen ${cat.cls}"><span class="cover__icon">${cat.icon}</span></div>`;
}

function articleCard(a, featured = false) {
  const cat = CATEGORIES[a.category] || CATEGORIES.other;
  const aud = AUDIENCES[a.audience] || AUDIENCES.both;
  const cls = featured ? 'card card--featured' : 'card';
  const aos = featured ? 'zoom-in' : 'fade-up';
  return `<article class="${cls}" data-audience="${a.audience}" data-category="${a.category}" data-aos="${aos}">
    <a href="article/${a.slug}.html" class="card__link">
      ${coverHtml(a, '', 'card__cover')}
      <div class="card__meta">
        <span class="aud ${aud.cls}">${aud.icon} ${aud.label}</span>
        <span class="card__read">${a.readTime} min read</span>
      </div>
      <h2 class="card__title">${escapeHtml(a.title)}</h2>
      <p class="card__subtitle">${escapeHtml(a.subtitle)}</p>
      <div class="card__foot">
        <span class="tag ${cat.cls}">${cat.label}</span>
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
    <span class="pill">Cover Story</span>
    ${articleCard(featured, true)}
  </section>`;

  // Célhasználat (audience) szűrő chipek — ez a fő tengely
  const chipsHtml = rest.length > 1 ? `<div class="filters" id="filters">
      <button class="chip chip--active" data-filter="all">All</button>
      <button class="chip" data-filter="personal">🏠 Everyday life</button>
      <button class="chip" data-filter="business">💼 Business</button>
    </div>` : '';

  const grid = rest.length > 0 ? `<section class="grid-section">
    <div class="section-head">
      <span class="pill">The Edit</span>
      <h2 class="section-title">Latest <span class="muted-word">stories</span></h2>
    </div>
    ${chipsHtml}
    <div class="grid" id="grid">
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
  const aud = AUDIENCES[a.audience] || AUDIENCES.both;
  const tagsHtml = a.tags.length
    ? `<div class="article__tags">${a.tags.map(t => `<span class="minitag">#${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  const body = `<article class="article">
    ${coverHtml(a, '../', 'article__cover')}
    <div class="article__head">
      <div class="article__badges">
        <span class="aud ${aud.cls}">${aud.icon} ${aud.label}</span>
        <span class="tag ${cat.cls}">${cat.label}</span>
      </div>
      <h1 class="article__title">${escapeHtml(a.title)}</h1>
      <p class="article__subtitle">${escapeHtml(a.subtitle)}</p>
      <div class="article__meta">
        <span>${a.readTime} min read</span>
        <span class="dot">·</span>
        <span>${formatDate(a.publishedAt)}</span>
      </div>
    </div>
    <div class="article__body">
      ${a.bodyHtml}
    </div>
    ${tagsHtml}
    <div class="article__foot">
      <p class="ai-disclosure">✦ Original guide written by AI World Co.'s own AI editorial team. Reviewed for accuracy and clarity.</p>
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

  // Asset-ek másolása (CSS + JS + logó)
  for (const asset of ['style.css', 'app.js', 'logo.svg']) {
    const src = join(ASSETS_SRC, asset);
    if (existsSync(src)) {
      copyFileSync(src, join(OUT_ASSETS_DIR, asset));
      console.log(`✅ ${asset} másolva`);
    } else {
      console.warn(`⚠️  Nincs ${asset} az assets/-ben!`);
    }
  }

  // Képek mappa másolása (ha van)
  const imagesSrc = join(ASSETS_SRC, 'images');
  if (existsSync(imagesSrc)) {
    cpSync(imagesSrc, join(OUT_ASSETS_DIR, 'images'), { recursive: true });
    const imgCount = readdirSync(imagesSrc).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).length;
    console.log(`✅ ${imgCount} kép másolva`);
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
