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

// Site URL + támogatás a config-ból (canonical/OG/sitemap + Support gomb).
let SITE_URL = 'https://aiworld.example.com';
let SUPPORT = { enabled: false, url: '', label: 'Buy us a coffee' };
try {
  const company = JSON.parse(readFileSync(join(PROJECT_ROOT, 'config.json'), 'utf-8')).company || {};
  SITE_URL = (company.website_url || SITE_URL).replace(/\/$/, '');
  SUPPORT = {
    enabled: company.support_enabled !== false,
    url: (company.support_url || '').trim(),
    label: company.support_label || 'Buy us a coffee'
  };
} catch {}

const SITE = {
  name: 'AI WORLD',
  tagline: 'AI news, in plain language',
  description: 'AI news and how-to guides for everyday people — fresh, friendly, jargon-free.',
  url: SITE_URL
};

// LAYOUT-KONFIG — a Honlap-szerkesztő (web-designer) agent állítja (website/design.json).
// A build innen veszi a guides-oldal csempe-elrendezését (oszlopszám, méret).
let DESIGN = {
  brandtiles: { desktop: 6, tablet: 4, mobile: 3 },
  guidetiles: { basis: 230, max: 300, justify: 'center' },
  align: 'center'
};
try {
  const d = JSON.parse(readFileSync(join(__dirname, 'design.json'), 'utf-8'));
  DESIGN = {
    brandtiles: { ...DESIGN.brandtiles, ...(d.brandtiles || {}) },
    guidetiles: { ...DESIGN.guidetiles, ...(d.guidetiles || {}) },
    align: d.align || DESIGN.align
  };
} catch {}

// A design-konfigból generált <style> blokk (a guides-oldal fejébe injektáljuk,
// így az agent döntése felülírja a style.css alapértelmezett rács-beállításait).
function designStyleBlock() {
  const b = DESIGN.brandtiles, g = DESIGN.guidetiles;
  const heroCenter = DESIGN.align === 'center'
    ? `.guides-hero{text-align:center}
.guides-hero__tag{margin-left:auto;margin-right:auto}`
    : '';
  return `<style id="design-tokens">
.brandtiles{grid-template-columns:repeat(${b.desktop},1fr)}
@media(max-width:900px){.brandtiles{grid-template-columns:repeat(${b.tablet},1fr)}}
@media(max-width:560px){.brandtiles{grid-template-columns:repeat(${b.mobile},1fr)}}
.gtiles{display:flex;flex-wrap:wrap;justify-content:${g.justify};gap:16px}
.gtile{flex:1 1 ${g.basis}px;max-width:${g.max}px}
${heroCenter}
</style>`;
}

// Cache-busting verzió: minden build új érték -> a böngésző mindig friss CSS/JS-t tölt
const ASSET_V = Date.now();

// Kategória -> megjelenítendő név + CSS osztály (szín)
const CATEGORIES = {
  'ai-news':  { label: 'AI News',  cls: 'cat-news',     icon: '📰' },
  'how-to':   { label: 'How-To',   cls: 'cat-howto',    icon: '🛠️' },
  'business': { label: 'Business', cls: 'cat-business', icon: '📈' },
  'work':     { label: 'Work',     cls: 'cat-work',     icon: '💡' },
  'creative': { label: 'Creative', cls: 'cat-creative', icon: '🎨' },
  'guide':    { label: 'Guide',    cls: 'cat-guide',    icon: '📘' },
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

// A markdown táblázatokat görgethető burokba tesszük (mobil + stílus)
function wrapTables(html) {
  return html
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>');
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
        file,
        guideTopicId: data._meta?.guide_topic_id || null,
        relatedGuideTopic: data._meta?.related_guide_topic || null,
        sourceNews: data._meta?.source_news || null,
        image: imgFile || null,
        title: meta.title || data.original_title || 'Untitled',
        subtitle: meta.subtitle || '',
        category: meta.category || 'other',
        audience: ['personal', 'business', 'both'].includes(meta.audience) ? meta.audience : 'both',
        readTime: meta.read_time_minutes || 3,
        tags: meta.tags || [],
        seoDescription: data._meta?.seo?.description || meta.subtitle || '',
        seoKeywords: (data._meta?.seo?.keywords || meta.tags || []).join(', '),
        bodyHtml: wrapTables(wrapImpactSection(marked.parse(body))),
        bodyMd: body,
        isGuide: (data._meta?.type === 'guide') || meta.category === 'guide',
        company: data._meta?.company || '',
        tool: data._meta?.tool || '',
        level: data._meta?.level || '',
        icon: data._meta?.icon || '',
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

// ---- KERESZTHIVATKOZÁS (hír ↔ útmutató) -----------------------------
// A párosító agent kötötte össze őket: a hír _meta.related_guide_topic →
// útmutató (guide_topic_id), az útmutató _meta.source_news.file → hír (file).
// A build itt oldja fel mindkét irányt a tényleg PUBLIKÁLT párra.
let XREF = { guideByTopic: new Map(), newsByFile: new Map() };
function buildXref(articles) {
  XREF = { guideByTopic: new Map(), newsByFile: new Map() };
  for (const a of articles) {
    if (a.isGuide && a.guideTopicId) XREF.guideByTopic.set(a.guideTopicId, a);
    if (!a.isGuide && a.file) XREF.newsByFile.set(a.file, a);
  }
}
function xrefBox(a) {
  if (a.isGuide) {
    // útmutató → forrás-hír
    const news = a.sourceNews?.file ? XREF.newsByFile.get(a.sourceNews.file) : null;
    if (!news) return '';
    return `<aside class="xref xref--news"><span class="xref__lbl">📰 What prompted this guide</span>
      <a class="xref__link" href="${news.slug}.html"><span class="xref__t">${escapeHtml(news.title)}</span><span class="xref__arrow">→</span></a></aside>`;
  }
  // hír → kapcsolódó útmutató
  const guide = a.relatedGuideTopic ? XREF.guideByTopic.get(a.relatedGuideTopic) : null;
  if (!guide) return '';
  return `<aside class="xref xref--guide"><span class="xref__lbl">📘 Want to try it? Step-by-step guide</span>
    <a class="xref__link" href="${guide.slug}.html"><span class="xref__t">${escapeHtml(guide.title)}</span><span class="xref__arrow">→</span></a></aside>`;
}

// ===================================================================
// HTML SABLONOK
// ===================================================================

function pageShell({ title, description, bodyContent, isArticle = false, noIntro = false, canonical = '', ogImage = '', keywords = '', jsonld = null }) {
  const cssPath = isArticle ? '../assets/style.css' : 'assets/style.css';
  const homePath = isArticle ? '../index.html' : 'index.html';
  const supportPath = isArticle ? '../support.html' : 'support.html';
  const guidesPath = isArticle ? '../guides.html' : 'guides.html';
  const toolsPath = isArticle ? '../tools.html' : 'tools.html';
  const year = new Date().getFullYear();
  const url = canonical || SITE.url;
  const img = ogImage || (SITE.url + '/assets/logo.svg');
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
  <link rel="canonical" href="${escapeHtml(url)}">
  <!-- Open Graph (közösségi megosztás) -->
  <meta property="og:type" content="${isArticle ? 'article' : 'website'}">
  <meta property="og:site_name" content="${SITE.name}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(img)}">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(img)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:ital,wght@0,400..900;1,400..700&family=Hanken+Grotesk:wght@400..700&display=swap" rel="stylesheet">
  <link rel="icon" type="image/svg+xml" href="${cssPath.replace('style.css', 'logo.svg')}">
  <link rel="stylesheet" href="https://unpkg.com/aos@2.3.4/dist/aos.css">
  <link rel="stylesheet" href="${cssPath}?v=${ASSET_V}">
  ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head>
<body>
  ${isArticle ? '<div class="progress-bar" id="progressBar"></div>' : ''}
  <header class="navbar" id="navbar">
    <div class="navbar__inner">
      <a href="${homePath}" class="navbar__logo"><img src="${cssPath.replace('style.css', 'logo.svg')}" alt="" class="navbar__mark">${SITE.name}<span class="navbar__dot">.</span></a>
      <nav class="navbar__nav">
        <a href="${homePath}">News</a>
        <a href="${guidesPath}">📘 Guides</a>
        <a href="${toolsPath}">🧰 AI tools</a>
        ${SUPPORT.enabled ? `<a href="${supportPath}" class="navbar__support">☕ Support</a>` : ''}
      </nav>
      <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode" title="Light / dark">
        <span class="theme-toggle__icon">☾</span>
      </button>
    </div>
  </header>${(isArticle || noIntro) ? '' : `
  <section class="intro">
    <div class="intro__inner">
      <p class="intro__kicker">Issue 01 · ${formatDate(new Date().toISOString())}</p>
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
      ${SUPPORT.enabled ? `<p class="site-footer__support"><a href="${supportPath}">☕ ${escapeHtml(SUPPORT.label)}</a> — help keep AI World free &amp; ad-light</p>` : ''}
      <p class="site-footer__fine">Written and curated by autonomous AI agents · Reviewed for accuracy · © ${year} AI World Co.</p>
    </div>
  </footer>
  <script src="https://unpkg.com/aos@2.3.4/dist/aos.js"></script>
  <script src="${cssPath.replace('style.css', 'app.js')}?v=${ASSET_V}"></script>
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

  // Célhasználat (audience) szűrő chipek — a "both" cikkek mindkét szűrőben látszanak
  const chipsHtml = rest.length > 1 ? `<div class="filters" id="filters">
      <button class="chip chip--active" data-filter="all">All</button>
      <button class="chip" data-filter="personal">🏠 Everyday life</button>
      <button class="chip" data-filter="business">💼 Business</button>
    </div>` : '';

  const grid = rest.length > 0 ? `<section class="grid-section">
    <div class="section-head">
      <span class="pill">The Edit</span>
      <h2 class="section-title">Latest <span class="muted-word">news</span></h2>
    </div>
    ${chipsHtml}
    <div class="grid" id="grid">
      ${rest.map(a => articleCard(a)).join('\n')}
    </div>
  </section>` : '';

  const guidesCta = `<a class="guides-cta" href="guides.html">
    <span class="guides-cta__i">📘</span>
    <span class="guides-cta__t"><strong>New to AI? Start with our step-by-step guides</strong><br>Browse practical how-tos by tool and task — everyday and business.</span>
    <span class="guides-cta__arrow">→</span></a>`;

  return pageShell({
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    canonical: SITE.url,
    ogImage: articles[0]?.image ? `${SITE.url}/assets/images/${articles[0].image}` : '',
    jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: SITE.url, description: SITE.description },
    bodyContent: featuredHtml + guidesCta + grid
  });
}

// ===================================================================
// ÚTMUTATÓK OLDAL — funkció szerinti, IKONOS CSEMPÉS böngésző
// ===================================================================
// Két szekció: 🏠 Mindennapi és 💼 Üzleti. Minden útmutató egy csempe
// (ikon + cím + eszköz/szint), hogy az olvasó a KERESETT funkciót
// gyorsan megtalálja. (Nem hír — ezért külön oldalon.)
// ===================================================================

const COMPANY_ICONS = {
  'OpenAI': '💬', 'Google': '✨', 'Anthropic': '📝', 'Microsoft': '🪟',
  'Meta': '🟢', 'Perplexity': '🔎', 'Alibaba': '🌏', 'xAI': '⚡',
  'Mistral': '🌀', 'DeepSeek': '🐋', 'Amazon': '🔊', 'Apple': '🍎',
  'Hugging Face': '🤗', 'NVIDIA': '🎮', 'GitHub': '🐙', 'Cohere': '🔵'
};
function guideIcon(a) {
  if (a.icon) return a.icon;                       // explicit (a témából)
  if (a.company && COMPANY_ICONS[a.company]) return COMPANY_ICONS[a.company];
  const t = (a.title || '').toLowerCase();
  if (t.includes('prompt')) return '✍️';
  if (t.includes('fact')) return '🔍';
  if (t.includes('privacy') || t.includes('safe')) return '🔒';
  if (t.includes('which') || t.includes('explained') || t.includes('overview') || t.includes('best at')) return '🧭';
  if (t.includes('task')) return '🧰';
  return '📘';
}

function companySlug(c) { return c ? c.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'general'; }

// Egy útmutató-csempe: ikon + cím + (kinek + szint). data-audience a szűréshez.
// Megtervezett (NEM AI-fotó) útmutató-borító: márka-szín + app-ikon badge + eszköz.
const GUIDE_COVER_COLORS = {
  'OpenAI': '#10a37f', 'Google': '#4285f4', 'Anthropic': '#cc785c', 'Microsoft': '#0a7bd0',
  'Meta': '#0866ff', 'Perplexity': '#20808d', 'Alibaba': '#ff6a00', 'xAI': '#2a2a2a',
  'Mistral': '#fa5310', 'DeepSeek': '#4d6bfe', 'Amazon': '#ff9900', 'Apple': '#555555',
  'Hugging Face': '#ff9d00', 'NVIDIA': '#76b900', 'GitHub': '#6e40c9', 'Cohere': '#39594d'
};
function guideCoverHtml(a, cls) {
  const color = GUIDE_COVER_COLORS[a.company] || '#4f7a86';
  const focal = a.tool || a.company || 'AI skills';
  const sub = (a.company && a.tool) ? a.company : 'For everyday people';
  return `<div class="${cls} guide-cover" style="--gc:${color}">
    <span class="guide-cover__rings" aria-hidden="true"></span>
    <div class="guide-cover__inner">
      <span class="guide-cover__eyebrow">Step-by-step guide</span>
      <div class="guide-cover__row">
        <span class="guide-cover__chip">${guideIcon(a)}</span>
        <span class="guide-cover__focal">${escapeHtml(focal)}</span>
      </div>
      <span class="guide-cover__sub">${escapeHtml(sub)}</span>
    </div>
  </div>`;
}

function guideTile(a) {
  const color = GUIDE_COVER_COLORS[a.company] || '#4f7a86';
  const aud = AUDIENCES[a.audience] || AUDIENCES.both;
  const level = a.level ? `<span class="gtile__lvl">${escapeHtml(a.level)}</span>` : '';
  const brand = a.tool || a.company || 'For everyone';
  return `<a class="gtile" href="article/${a.slug}.html" data-audience="${a.audience}" style="--gc:${color}">
    <span class="gtile__head">
      <span class="gtile__rings" aria-hidden="true"></span>
      <span class="gtile__chip">${guideIcon(a)}</span>
      <span class="gtile__brand">${escapeHtml(brand)}</span>
    </span>
    <span class="gtile__body">
      <span class="gtile__title">${escapeHtml(a.title)}</span>
      <span class="gtile__meta"><span class="gtile__aud">${aud.icon} ${aud.label}</span>${level}</span>
    </span>
  </a>`;
}

// ÁLTALÁNOS (mindennapi) útmutatók — guides.html
function buildGuidesPage(generalGuides, counts) {
  const tiles = generalGuides.length
    ? `<div class="gtiles">${generalGuides.map(guideTile).join('')}</div>`
    : `<p class="muted" style="color:var(--ink-soft)">Everyday guides are on their way — check back shortly.</p>`;
  const header = `<section class="guides-hero">
    <p class="intro__kicker">Step-by-step</p>
    <h1 class="guides-hero__title">Everyday AI <em>skills</em></h1>
    <p class="guides-hero__tag">Plain-language how-tos that work with any assistant — ChatGPT, Gemini, Claude or others. For tool-specific guides, see <a href="tools.html">AI tools</a>.</p>
  </section>`;
  const body = designStyleBlock() + header + tiles;
  return pageShell({
    title: `Everyday AI guides — ${SITE.name}`,
    description: 'Plain-language, step-by-step guides to everyday AI skills: writing prompts, summarising, fact-checking, staying safe and more. Works with any assistant.',
    canonical: `${SITE.url}/guides.html`, noIntro: true,
    jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Everyday AI Guides', url: `${SITE.url}/guides.html` },
    bodyContent: body
  });
}

// CÉGES (eszköz-specifikus) útmutatók — tools.html
function buildToolsPage(companyGuides, counts) {
  const groups = {};
  for (const g of companyGuides) { const k = g.company || 'Other'; (groups[k] = groups[k] || []).push(g); }
  const ORDER = ['OpenAI', 'Google', 'Anthropic', 'Microsoft', 'Meta', 'Perplexity', 'Alibaba', 'xAI', 'Mistral', 'DeepSeek', 'Amazon', 'Apple', 'Hugging Face', 'NVIDIA', 'GitHub', 'Cohere'];
  const companies = [...ORDER.filter(c => groups[c]), ...Object.keys(groups).filter(c => c && !ORDER.includes(c))];
  const cnt = n => `${n} guide${n > 1 ? 's' : ''}`;

  const brandTile = (c) => `<a class="brandtile" href="#c-${companySlug(c)}" style="--gc:${GUIDE_COVER_COLORS[c] || '#4f7a86'}">
      <span class="brandtile__i">${COMPANY_ICONS[c] || '🤖'}</span>
      <span class="brandtile__n">${escapeHtml(c)}</span><span class="brandtile__c">${cnt(groups[c].length)}</span></a>`;
  const brandRow = companies.length ? `<section class="brandpick">
      <p class="section-note">Pick the AI tool you use to jump to its step-by-step guides.</p>
      <div class="brandtiles">${companies.map(brandTile).join('')}</div></section>` : '';
  const companySection = (c) => `<section class="grid-section" id="c-${companySlug(c)}">
      <div class="section-head"><span class="pill">${COMPANY_ICONS[c] || '🤖'} ${escapeHtml(c)}</span>
        <h2 class="section-title">${escapeHtml(c)} <span class="muted-word">guides</span></h2></div>
      <div class="gtiles">${groups[c].map(guideTile).join('')}</div></section>`;

  const header = `<section class="guides-hero">
    <p class="intro__kicker">Step-by-step</p>
    <h1 class="guides-hero__title">Guides by <em>AI tool</em></h1>
    <p class="guides-hero__tag">Pick your assistant for tool-specific how-tos. For skills that work everywhere, see <a href="guides.html">Everyday skills</a>.</p>
  </section>`;
  const empty = `<p class="muted" style="color:var(--ink-soft)">Tool guides are on their way — check back shortly.</p>`;
  const body = designStyleBlock() + header + (companyGuides.length ? (brandRow + companies.map(companySection).join('')) : empty);
  return pageShell({
    title: `AI tool guides — ${SITE.name}`,
    description: 'Step-by-step guides for specific AI tools: ChatGPT, Gemini, Claude, Copilot, Perplexity and more. Pick your tool and learn what you need.',
    canonical: `${SITE.url}/tools.html`, noIntro: true,
    jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'AI Tool Guides', url: `${SITE.url}/tools.html` },
    bodyContent: body
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
    ${xrefBox(a)}
    <div class="article__foot">
      <p class="ai-disclosure">✦ Original guide written by AI World Co.'s own AI editorial team. Reviewed for accuracy and clarity.</p>
      <a href="../index.html" class="back-link">← Back to all stories</a>
    </div>
  </article>`;

  const canonical = `${SITE.url}/article/${a.slug}.html`;
  const ogImage = a.image ? `${SITE.url}/assets/images/${a.image}` : '';
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: a.title, description: a.seoDescription || a.subtitle,
    image: ogImage || undefined,
    datePublished: a.publishedAt || undefined,
    author: { '@type': 'Organization', name: SITE.name },
    publisher: { '@type': 'Organization', name: SITE.name },
    mainEntityOfPage: canonical,
    keywords: a.seoKeywords || undefined
  };
  return pageShell({
    title: `${a.title} — ${SITE.name}`,
    description: a.seoDescription || a.subtitle,
    keywords: a.seoKeywords,
    canonical, ogImage, jsonld,
    bodyContent: body, isArticle: true
  });
}

// ===================================================================
// ÚTMUTATÓ OLDAL (lépésről-lépésre, prezentáció-érzet)
// ===================================================================
// A guide markdownt szekciókra bontjuk (## fejlécek mentén), és a
// lépéseket számozott kártyaként, a többi szekciót (Before you start,
// Common mistakes, What this means for you, Try it now) saját stílussal
// jelenítjük meg. A 💬 példák kiemelt dobozba kerülnek.
// ===================================================================

// ---- Lépés-illusztrációk (tervezett vektor / SVG) -----------------
// Minden motívum currentColor-t használ → a .g-step__art a --gc márka-
// színt adja rá, így EGY készletből minden cég saját színt kap.
// Nincs AI-fotó, nincs screenshot: tiszta, lapos, egységes vektor.
const ART_FRAME = (inner) =>
  `<svg class="g-art__svg" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
  `<rect x="3" y="3" width="194" height="144" rx="22" fill="currentColor" opacity="0.07"/>` +
  `<g fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${inner}</g>` +
  `</svg>`;

const GUIDE_ART = {
  // cél / mit szeretnél elérni
  target: ART_FRAME(`
    <circle cx="86" cy="84" r="40"/>
    <circle cx="86" cy="84" r="24" opacity=".5"/>
    <circle cx="86" cy="84" r="9" fill="currentColor" stroke="none"/>
    <path d="M168 30 L96 78"/>
    <path d="M96 78 l22 -1 M96 78 l1 -22"/>`),
  // gépelés / prompt / kérdés beírása
  chat: ART_FRAME(`
    <rect x="34" y="36" width="132" height="70" rx="16"/>
    <path d="M60 106 l0 18 l18 -18"/>
    <line x1="52" y1="60" x2="148" y2="60" opacity=".45"/>
    <line x1="52" y1="74" x2="124" y2="74" opacity=".45"/>
    <line x1="52" y1="88" x2="100" y2="88" opacity=".45"/>
    <rect x="104" y="82" width="4" height="14" rx="2" fill="currentColor" stroke="none"/>`),
  // kontextus / részletek / hozzáadás (rétegezett kártyák)
  layers: ART_FRAME(`
    <rect x="44" y="34" width="100" height="62" rx="12" opacity=".4"/>
    <rect x="56" y="48" width="100" height="62" rx="12" opacity=".7"/>
    <rect x="68" y="62" width="100" height="62" rx="12"/>
    <line x1="80" y1="82" x2="150" y2="82" opacity=".45"/>
    <line x1="80" y1="96" x2="134" y2="96" opacity=".45"/>
    <line x1="80" y1="110" x2="148" y2="110" opacity=".45"/>`),
  // formátum / lista / felépítés (dokumentum)
  doc: ART_FRAME(`
    <rect x="58" y="24" width="84" height="102" rx="10"/>
    <rect x="72" y="40" width="56" height="10" rx="5" fill="currentColor" stroke="none"/>
    <circle cx="77" cy="68" r="3.5" fill="currentColor" stroke="none"/><line x1="88" y1="68" x2="128" y2="68" opacity=".45"/>
    <circle cx="77" cy="84" r="3.5" fill="currentColor" stroke="none"/><line x1="88" y1="84" x2="128" y2="84" opacity=".45"/>
    <circle cx="77" cy="100" r="3.5" fill="currentColor" stroke="none"/><line x1="88" y1="100" x2="116" y2="100" opacity=".45"/>`),
  // ellenőrzés / finomítás / szerkesztés (jelölőlista pipákkal)
  check: ART_FRAME(`
    <rect x="54" y="34" width="92" height="100" rx="12"/>
    <rect x="82" y="26" width="36" height="16" rx="6" fill="currentColor" stroke="none"/>
    <path d="M68 64 l9 9 l17 -19"/>
    <line x1="104" y1="64" x2="132" y2="64" opacity=".45"/>
    <path d="M68 96 l9 9 l17 -19"/>
    <line x1="104" y1="96" x2="132" y2="96" opacity=".45"/>`),
  // küldés / futtatás / generálás (papírrepülő)
  plane: ART_FRAME(`
    <path d="M162 40 L40 108 L104 92 L120 122 Z"/>
    <path d="M162 40 L104 92" opacity=".5"/>
    <path d="M34 126 q22 -8 44 -4" stroke-dasharray="2 11" opacity=".5"/>`),
  // beállítások / testreszabás (csúszkák)
  sliders: ART_FRAME(`
    <line x1="46" y1="52" x2="154" y2="52"/><circle cx="122" cy="52" r="11" fill="currentColor" stroke="none"/>
    <line x1="46" y1="82" x2="154" y2="82"/><circle cx="78" cy="82" r="11" fill="currentColor" stroke="none"/>
    <line x1="46" y1="112" x2="154" y2="112"/><circle cx="132" cy="112" r="11" fill="currentColor" stroke="none"/>`),
  // mentés / export / megosztás (tálca + nyíl)
  download: ART_FRAME(`
    <path d="M100 34 L100 98"/>
    <path d="M76 76 L100 102 L124 76"/>
    <path d="M50 104 L50 126 L150 126 L150 104"/>`),
  // hang / beszéd / felvétel (mikrofon + hullámok)
  mic: ART_FRAME(`
    <rect x="84" y="32" width="32" height="58" rx="16"/>
    <path d="M68 80 a32 32 0 0 0 64 0"/>
    <line x1="100" y1="112" x2="100" y2="128"/>
    <line x1="84" y1="128" x2="116" y2="128"/>
    <path d="M140 52 a18 18 0 0 1 0 40" opacity=".5"/>
    <path d="M152 42 a30 30 0 0 1 0 60" opacity=".3"/>`),
  // keresés / felfedezés (nagyító)
  search: ART_FRAME(`
    <circle cx="90" cy="74" r="34"/>
    <line x1="116" y1="100" x2="146" y2="130"/>
    <line x1="76" y1="66" x2="106" y2="66" opacity=".45"/>
    <line x1="76" y1="80" x2="98" y2="80" opacity=".45"/>`),
  // kép / vizuál / design (keret + nap + hegyek)
  image: ART_FRAME(`
    <rect x="44" y="38" width="112" height="86" rx="12"/>
    <circle cx="74" cy="64" r="9" fill="currentColor" stroke="none"/>
    <path d="M50 118 L84 84 L106 104 L128 80 L150 110"/>`),
  // adatvédelem / biztonság (pajzs + pipa)
  shield: ART_FRAME(`
    <path d="M100 28 L150 48 V86 C150 112 128 126 100 134 C72 126 50 112 50 86 V48 Z"/>
    <path d="M82 80 l12 12 l24 -28"/>`),
  // tipp / megértés / tanulás (villanykörte + sugarak)
  bulb: ART_FRAME(`
    <circle cx="100" cy="62" r="32"/>
    <path d="M88 96 h24"/><path d="M90 108 h20"/><path d="M93 120 h14"/>
    <line x1="100" y1="14" x2="100" y2="24" opacity=".5"/>
    <line x1="148" y1="36" x2="139" y2="45" opacity=".5"/>
    <line x1="52" y1="36" x2="61" y2="45" opacity=".5"/>
    <line x1="160" y1="74" x2="148" y2="74" opacity=".5"/>
    <line x1="40" y1="74" x2="52" y2="74" opacity=".5"/>`),
  // megnyitás / fiók / belépés (böngészőablak + profil)
  login: ART_FRAME(`
    <rect x="40" y="34" width="120" height="86" rx="12"/>
    <line x1="40" y1="56" x2="160" y2="56"/>
    <circle cx="54" cy="45" r="3" fill="currentColor" stroke="none"/>
    <circle cx="66" cy="45" r="3" fill="currentColor" stroke="none"/>
    <circle cx="78" cy="45" r="3" fill="currentColor" stroke="none"/>
    <circle cx="100" cy="83" r="13"/>
    <path d="M80 110 a20 20 0 0 1 40 0"/>`),
};

// Lépéscím → illusztráció kulcs (specifikusabb előbb!)
const STEP_ART_RULES = [
  [/voice|speak|talk|audio|listen|record|dictat|sound|microphone/i, 'mic'],
  [/image|picture|photo|visual|drawing|artwork|illustrat|generate an image|create an image/i, 'image'],
  [/search|find\b|explore|browse|discover|look up|research|sources?/i, 'search'],
  [/privac|secur|safe|protect|your data|be careful|permission|consent|sensitive/i, 'shield'],
  [/setting|configur|option|preferenc|customi|control|toggle|enable|turn (it )?on|choose a model|pick a model/i, 'sliders'],
  [/save|export|download|share|copy|publish|send it to/i, 'download'],
  [/send|run\b|submit|generat|press enter|hit enter|press send|get your (answer|result|response)/i, 'plane'],
  [/review|check|refine|edit\b|improve|fix\b|adjust|iterate|verif|proofread|polish|double-check/i, 'check'],
  [/format|structure|outline|template|organi|layout|section|make a list|bullet/i, 'doc'],
  [/context|detail|background|be specific|example|describe|explain|add (more )?|include|provide|give it/i, 'layers'],
  [/type|write|prompt|ask\b|message|enter your|chat|tell it|input|conversation|question|your request/i, 'chat'],
  [/define|goal|what you want|decide|choose what|pick what|plan\b|aim\b|outcome|result you|identify/i, 'target'],
  [/tip|note|remember|understand|learn|know\b|why\b|what (it|this) means|matters/i, 'bulb'],
  [/open\b|start\b|begin|sign ?up|sign ?in|account|log ?in|install|get started|access|set ?up|first/i, 'login'],
];
const STEP_ART_CYCLE = ['target', 'chat', 'layers', 'doc', 'check', 'plane', 'sliders', 'search'];

function stepArt(title, idx) {
  const t = title || '';
  let key = null;
  for (const [re, k] of STEP_ART_RULES) { if (re.test(t)) { key = k; break; } }
  if (!key) key = STEP_ART_CYCLE[idx % STEP_ART_CYCLE.length];
  return `<div class="g-step__art">${GUIDE_ART[key] || GUIDE_ART.target}</div>`;
}

function parseGuideSections(bodyMd) {
  const md = (bodyMd || '').replace(/^#\s+.*$/m, '').trim(); // a H1 címet a metából rakjuk ki
  const parts = md.split(/\n(?=##\s+)/);
  let intro = '';
  const sections = [];
  for (const p of parts) {
    const m = p.match(/^##\s+([^\n]+)\n?([\s\S]*)$/);
    if (m) sections.push({ title: m[1].trim(), body: (m[2] || '').trim() });
    else intro += p + '\n';
  }
  return { intro: intro.trim(), sections };
}

// egy szekció HTML-je: a 💬 példákat (külön soron) kiemelt dobozba tesszük
function guideSectionHtml(bodyMd) {
  // a 💬-vel kezdődő sorokat markdown ELŐTT blokk-szintű dobozzá alakítjuk
  const pre = (bodyMd || '').replace(/^[ \t>]*💬[ \t]*(?:example:?\s*)?(.+)$/gmi,
    '\n\n<div class="g-prompt"><span class="g-prompt__lbl">💬 Try typing this</span><span class="g-prompt__box">$1<span class="g-prompt__send">➤</span></span></div>\n\n');
  return wrapTables(marked.parse(pre));
}

function buildGuidePage(a) {
  const cat = CATEGORIES.guide;
  const aud = AUDIENCES[a.audience] || AUDIENCES.both;
  const { intro, sections } = parseGuideSections(a.bodyMd);

  let stepNo = 0;
  const blocks = sections.map(s => {
    const t = s.title;
    if (/^step\s*\d*\s*[—:-]?/i.test(t)) {
      stepNo++;
      const heading = t.replace(/^step\s*\d*\s*[—:-]?\s*/i, '');
      return `<div class="g-step"><div class="g-step__no">${stepNo}</div>
        <div class="g-step__grid">
          <div class="g-step__body"><h3 class="g-step__h">${escapeHtml(heading)}</h3>${guideSectionHtml(s.body)}</div>
          ${stepArt(heading, stepNo - 1)}
        </div></div>`;
    }
    if (/before you start|before we start|prerequisit/i.test(t))
      return `<div class="g-prereq"><div class="g-block__h">✅ ${escapeHtml(t)}</div>${guideSectionHtml(s.body)}</div>`;
    if (/common mistakes|watch out|pitfalls/i.test(t))
      return `<div class="g-mistakes"><div class="g-block__h">⚠️ ${escapeHtml(t)}</div>${guideSectionHtml(s.body)}</div>`;
    if (/what this means for you/i.test(t))
      return `<aside class="impact"><div class="impact__label">${escapeHtml(t)}</div>${guideSectionHtml(s.body)}</aside>`;
    if (/try it now|your turn|next step/i.test(t))
      return `<div class="g-try"><div class="g-block__h">🚀 ${escapeHtml(t)}</div>${guideSectionHtml(s.body)}</div>`;
    return `<div class="g-section"><h2>${escapeHtml(t)}</h2>${guideSectionHtml(s.body)}</div>`;
  }).join('\n');

  const toolChip = (a.company || a.tool)
    ? `<span class="g-tool">📘 ${escapeHtml([a.company, a.tool].filter(Boolean).join(' · '))}</span>` : '';
  const levelChip = a.level ? `<span class="g-level">${escapeHtml(a.level)}</span>` : '';
  const stepsTotal = sections.filter(s => /^step\s*\d/i.test(s.title)).length;

  const body = `<article class="article guide" style="--gc:${GUIDE_COVER_COLORS[a.company] || '#4f7a86'}">
    ${guideCoverHtml(a, 'article__cover')}
    <div class="article__head">
      <div class="article__badges">
        <span class="tag ${cat.cls}">📘 Step-by-step guide</span>
        ${toolChip}${levelChip}
        <span class="aud ${aud.cls}">${aud.icon} ${aud.label}</span>
      </div>
      <h1 class="article__title">${escapeHtml(a.title)}</h1>
      <p class="article__subtitle">${escapeHtml(a.subtitle)}</p>
      <div class="article__meta"><span>${a.readTime} min read</span><span class="dot">·</span><span>${stepsTotal} steps</span><span class="dot">·</span><span>${formatDate(a.publishedAt)}</span></div>
    </div>
    ${intro ? `<div class="g-intro">${guideSectionHtml(intro)}</div>` : ''}
    <div class="g-steps">${blocks}</div>
    ${xrefBox(a)}
    <div class="article__foot">
      <p class="ai-disclosure">✦ Original step-by-step guide by AI World Co.'s AI editorial team. Written in plain language, reviewed for accuracy.</p>
      <a href="../index.html" class="back-link">← Back to all stories</a>
    </div>
  </article>`;

  const canonical = `${SITE.url}/article/${a.slug}.html`;
  const ogImage = a.image ? `${SITE.url}/assets/images/${a.image}` : '';
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'HowTo',
    name: a.title, description: a.seoDescription || a.subtitle,
    image: ogImage || undefined,
    step: sections.filter(s => /^step\s*\d/i.test(s.title)).map(s => ({
      '@type': 'HowToStep', name: s.title.replace(/^step\s*\d*\s*[—:-]?\s*/i, '')
    }))
  };
  return pageShell({
    title: `${a.title} — ${SITE.name}`,
    description: a.seoDescription || a.subtitle,
    keywords: a.seoKeywords, canonical, ogImage, jsonld,
    bodyContent: body, isArticle: true
  });
}

// ===================================================================
// SUPPORT OLDAL (önkéntes támogatás — magánszemélyként is)
// ===================================================================
// A config.company.support_url-ből épül. Ha üres, "coming soon" gomb.
// Hangnem: átlátszó, barátságos, nem tolakodó (brand szabály).
// ===================================================================

function buildSupportPage() {
  const cta = SUPPORT.url
    ? `<a class="support__btn" href="${escapeHtml(SUPPORT.url)}" target="_blank" rel="noopener noreferrer">☕ ${escapeHtml(SUPPORT.label)}</a>`
    : `<span class="support__btn support__btn--soon" aria-disabled="true">☕ ${escapeHtml(SUPPORT.label)} — coming soon</span>`;

  const body = `<section class="support">
    <span class="pill">Support us</span>
    <h1 class="support__title">Keep everyday AI <em>free for everyone</em></h1>
    <p class="support__lead">AI World is a small, independent project — a team of AI agents and one human — publishing clear, jargon-free guides about AI. We keep it free and ad-light. If you find it useful, you can chip in to help cover the running costs.</p>

    <div class="support__cta">${cta}</div>

    <div class="support__cards">
      <div class="support__card"><span class="support__ico">🖥️</span><h3>Hosting &amp; domain</h3><p>Keeping the site online, fast and reachable for everyone.</p></div>
      <div class="support__card"><span class="support__ico">🧠</span><h3>The AI newsroom</h3><p>The models that research, write, fact-check and improve every article.</p></div>
      <div class="support__card"><span class="support__ico">🎨</span><h3>Original artwork</h3><p>The custom cover image generated for each story.</p></div>
    </div>

    <div class="support__thanks">
      <p class="support__thanks-h">To everyone who chips in — thank you. 💛</p>
      <p>You keep AI World free, ad-light and open to everyone. Every coffee helps cover our hosting and powers the little AI newsroom behind every article. We're a tiny independent team, so it genuinely means the world to us.</p>
    </div>

    <p class="support__note">Supporting us is completely optional — the site stays free either way. We're a small independent project, not a registered charity, so your contribution is a friendly <strong>voluntary tip</strong>, not a tax-deductible donation. Thank you for reading. 💛</p>

    <a href="index.html" class="back-link">← Back to all stories</a>
  </section>`;

  return pageShell({
    title: `Support — ${SITE.name}`,
    description: 'Help keep AI World free and ad-light. A small voluntary tip covers our hosting and the AI that writes each article.',
    canonical: `${SITE.url}/support.html`,
    noIntro: true,
    bodyContent: body
  });
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

  // Cikkek — hírek (főoldal) és útmutatók (külön oldal) szétválasztva
  const articles = loadArticles();
  buildXref(articles);  // hír ↔ útmutató kereszthivatkozás-index
  const news = articles.filter(a => !a.isGuide);
  const guides = articles.filter(a => a.isGuide);
  const generalGuides = guides.filter(g => !g.company);
  const companyGuides = guides.filter(g => g.company);
  const guideCounts = { everyday: generalGuides.length, tool: companyGuides.length };
  console.log(`📰 ${articles.length} publikált (${news.length} hír, ${guides.length} útmutató: ${generalGuides.length} mindennapi + ${companyGuides.length} céges)`);

  // Főoldal = CSAK hírek
  writeFileSync(join(OUT_DIR, 'index.html'), buildIndex(news), 'utf-8');
  console.log('✅ index.html generálva (hírek)');

  // Útmutatók KÉT KÜLÖN OLDALON: guides.html = mindennapi, tools.html = céges
  writeFileSync(join(OUT_DIR, 'guides.html'), buildGuidesPage(generalGuides, guideCounts), 'utf-8');
  console.log(`✅ guides.html generálva (${generalGuides.length} mindennapi útmutató)`);
  writeFileSync(join(OUT_DIR, 'tools.html'), buildToolsPage(companyGuides, guideCounts), 'utf-8');
  console.log(`✅ tools.html generálva (${companyGuides.length} céges útmutató)`);

  // Cikk + útmutató oldalak
  let guideCount = 0;
  for (const a of articles) {
    const html = a.isGuide ? buildGuidePage(a) : buildArticlePage(a);
    if (a.isGuide) guideCount++;
    writeFileSync(join(OUT_ARTICLE_DIR, `${a.slug}.html`), html, 'utf-8');
  }
  console.log(`✅ ${articles.length} oldal generálva (${guideCount} útmutató)`);

  // Support (támogatás) oldal
  if (SUPPORT.enabled) {
    writeFileSync(join(OUT_DIR, 'support.html'), buildSupportPage(), 'utf-8');
    console.log(`✅ support.html generálva${SUPPORT.url ? '' : ' (link még nincs beállítva — "coming soon")'}`);
  }

  // SEO: sitemap.xml + robots.txt
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: SITE.url + '/', date: today },
    ...(generalGuides.length ? [{ loc: `${SITE.url}/guides.html`, date: today }] : []),
    ...(companyGuides.length ? [{ loc: `${SITE.url}/tools.html`, date: today }] : []),
    ...(SUPPORT.enabled ? [{ loc: `${SITE.url}/support.html`, date: today }] : []),
    ...articles.map(a => ({ loc: `${SITE.url}/article/${a.slug}.html`, date: (a.publishedAt || '').slice(0, 10) || today }))
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.date}</lastmod></url>`).join('\n')}
</urlset>`;
  writeFileSync(join(OUT_DIR, 'sitemap.xml'), sitemap, 'utf-8');
  writeFileSync(join(OUT_DIR, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\n`, 'utf-8');
  console.log('✅ sitemap.xml + robots.txt generálva');

  console.log('─'.repeat(60));
  console.log(`✨ Kész! Nyisd meg: website/public/index.html`);
}

main();
