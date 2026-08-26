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

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, rmSync, cpSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { marked } from 'marked';
import { canonicalChip } from '../core/quality-guard.js';
import { toolRegex } from '../core/tool-regex.js';
import { absolutizeFeedLinks } from '../core/feed-links.js';
import { buildMetaDescription } from '../core/meta-description.js';
import { legacyRedirect } from '../core/legacy-urls.js';
import { rankRelated } from '../core/related.js';
import { kindOf, KIND_ORDER, KINDS } from '../core/tool-kinds.js';
import { langSentence } from '../core/llms-txt.js';
import { insertMidGuide } from '../core/mid-guide.js';
import { RETIRED_LANGS } from '../core/retired-langs.js';

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
// Kereső-igazoló kódok (Google Search Console / Bing Webmaster) — a config
// company.google_site_verification / bing_site_verification mezőiből; ha üres,
// nem kerül meta-tag az oldalba.
let VERIFY = { google: '', bing: '' };
// Cloudflare Web Analytics token (látogatás-számláló) — NYILVÁNOS by design
// (minden oldal HTML-jében látszik), ezért mehet a configba. Ha üres, nincs mérés.
let CF_BEACON = '';
// Ügyfélszolgálati chat-doboz kapcsoló + Worker-végpont (Task 3 config: customer_service.*).
// enabled csak akkor igaz, ha a config engedélyezi ÉS van Turnstile site-key.
let CS = { enabled: false, base: '', key: '' };
try {
  const rawConfig = JSON.parse(readFileSync(join(PROJECT_ROOT, 'config.json'), 'utf-8'));
  const company = rawConfig.company || {};
  CF_BEACON = (company.cf_beacon_token || '').trim();
  SITE_URL = (company.website_url || SITE_URL).replace(/\/$/, '');
  SUPPORT = {
    enabled: company.support_enabled !== false,
    url: (company.support_url || '').trim(),
    label: company.support_label || 'Buy us a coffee'
  };
  VERIFY = {
    google: (company.google_site_verification || '').trim(),
    bing: (company.bing_site_verification || '').trim(),
    // Google FÁJLOS igazolás (Search Console "HTML file" módszer): a build minden
    // futáskor újrateremti a gyökérben, így a deploy sosem veszíti el.
    googleFile: (company.google_site_verification_file || '').trim(),
    // IndexNow kulcs — SZÁNDÉKOSAN nyilvános (a protokoll így igazolja a
    // tulajdonjogot: a kulcsfájlt a webhelyen kell kiszolgálni). Nem titok!
    indexnow: (company.indexnow_key || '').trim()
  };
  const cs = rawConfig.customer_service || {};
  CS = {
    enabled: cs.enabled === true && !!cs.turnstile_site_key,
    base: (cs.worker_base || '').replace(/\/$/, ''),
    key: cs.turnstile_site_key || ''
  };
} catch {}

const SITE = {
  name: 'AI WORLD HQ',   // a megjelenő márkanév — egyezik a domainnel (aiworldhq.com)
  tagline: 'AI news, in plain language',
  description: 'AI news and how-to guides for everyday people — fresh, friendly, jargon-free.',
  url: SITE_URL
};

// LAYOUT-KONFIG — a Honlap-szerkesztő (web-designer) agent állítja (website/design.json).
// A build innen veszi a guides-oldal csempe-elrendezését (oszlopszám, méret).
let DESIGN = {
  brandtiles: { desktop: 6, tablet: 4, mobile: 3 },
  guidetiles: { basis: 230, max: 300, justify: 'center' },
  align: 'center',
  mobileCss: ''   // a web-designer agent tölti fel (reszponzív mobil blokk)
};
try {
  const d = JSON.parse(readFileSync(join(__dirname, 'design.json'), 'utf-8'));
  DESIGN = {
    brandtiles: { ...DESIGN.brandtiles, ...(d.brandtiles || {}) },
    guidetiles: { ...DESIGN.guidetiles, ...(d.guidetiles || {}) },
    align: d.align || DESIGN.align,
    mobileCss: d.mobileCss || ''
  };
} catch {}

// ===================================================================
// TÖBBNYELVŰSÉG (i18n) — angol a forrás, a többit a fordító agent adja
// ===================================================================
const TRANS_DIR = join(__dirname, '..', 'content', 'translations');
// ===================================================================
// NYELVEK (2026-07-31: német és francia KIVEZETVE)
// ===================================================================
// MÉRÉS 8 hét után: hu 290 · en 150 · es 20 · de 0 · fr 0 látogató.
// A német és a francia együtt 1158 oldal volt — a honlap 40%-a — NULLA
// látogatóért. Közben a Search Console szerint 1546 oldalunk "feltérképezve,
// de nincs indexelve": vagyis a Google-nak túl sok, egymáshoz hasonló oldalt
// adtunk. Kevesebb, de erősebb oldallal könnyebb bizalmat építeni.
//
// A spanyol MARAD: 20 látogató kevés, DE NEM NULLA — a Google egyáltalán
// megmutat minket spanyolul. A német/franciánál nyolc hét alatt egyszer sem.
//
// NEM TÖRLÜNK: a /de/ és /fr/ címek 301-gyel az angol cikkre mennek (joker-
// szabály a _redirects végén), tehát nulla 404. A meglévő fordítások a
// lemezen MARADNAK — ez a döntés percek alatt visszafordítható: elég ide
// visszaírni a két nyelvet.
const SITE_LANGS = ['en', 'hu', 'es'];   // en = forrás/gyökér
// A kivezetett nyelvek EGYETLEN forrása: core/retired-langs.js (sírkő).
const FB_URL = 'https://www.facebook.com/profile.php?id=61591788804540';   // FB-oldal (követés + JSON-LD sameAs)
const IG_URL = 'https://www.instagram.com/aiworldhq/';                    // Instagram (Bufferrel posztolunk rá)
const TH_URL = 'https://www.threads.com/@aiworldhq';                      // Threads (Bufferrel posztolunk rá)
// X/Twitter SZÁNDÉKOSAN NINCS: a Buffer nem ismer ilyen csatornát, tehát nem
// létező profilra nem linkelünk. Ha bekötjük, ide kerül — és a sameAs-be is.
const FOLLOW = { en: 'Follow us', hu: 'Kövess minket', es: 'Síguenos', };
// A márkajelek a simple-iconsból valók (CC0 közkincs), ugyanabból a forrásból,
// amit a core/fetch-brand-logos.js is használ. KITALÁLT LOGÓ SOHA.
const ICON = {
  fb: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  ig: 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
  th: 'M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z'
};
const HTML_LANG = { en: 'en-US', hu: 'hu', es: 'es', };
const LANG_NAME = { en: 'English', hu: 'Magyar', es: 'Español', };

// UI-szótár (a honlap "váza" — menü, hero, feliratok). A cikkek tartalmát a
// fordító agent fordítja; ezek a fix felületi szövegek.
const UI = {
  en: { news: 'News', guides: 'Guides', tools: 'AI tools', support: 'Support',
        heroKicker: 'Issue 01', heroTitle: 'Everyday AI, <em>explained simply.</em>',
        minRead: 'min read', stepByStep: 'Step-by-step',
        guidesTitle: 'Everyday AI <em>skills</em>', guidesTag: 'Plain-language how-tos that work with any assistant — ChatGPT, Gemini, Claude or others.',
        // ⚠️ A TAGLINE NEM ÍGÉRHET ASSZISZTENST (2026-08-17, user jelezte): eddig
        // "Pick your assistant" állt itt, miközben az oldalon a Midjourney (kép)
        // és a Hugging Face (tárhely) is szerepelt. Az "asszisztens" szó lement
        // oda, ahol IGAZ: a fajta-fejlécbe (kindAssistant). Lásd core/tool-kinds.js.
        toolsTitle: 'Guides by <em>AI tool</em>', toolsTag: 'Pick your AI tool for step-by-step, tool-specific how-tos.',
        // KERESŐ-LEÍRÁS (2026-08-04): a Google találatban a cím alatti mondat.
        // Külön kulcs a *Tag-tól, mert az oldalon látszó alcím rövidebb lehet,
        // a keresőnek viszont 120-160 karakter a hasznos hossz.
        guidesMetaDesc: 'Plain-language, step-by-step guides to everyday AI skills: writing prompts, summarizing, fact-checking, staying safe and more. Works with any assistant.',
        toolsMetaDesc: 'Step-by-step guides for specific AI tools: ChatGPT, Gemini, Claude, Copilot, Perplexity and more. Pick your tool and learn what you need.',
        footerNote: 'Written and curated by autonomous AI agents · Reviewed for accuracy', back: '← Back', language: 'Language' },
  hu: { news: 'Hírek', guides: 'Útmutatók', tools: 'AI eszközök', support: 'Támogatás',
        heroKicker: '01. szám', heroTitle: 'A hétköznapi AI, <em>érthetően.</em>',
        minRead: 'perc olvasás', stepByStep: 'Lépésről lépésre',
        guidesTitle: 'Hétköznapi AI <em>készségek</em>', guidesTag: 'Közérthető útmutatók, amelyek bármelyik asszisztenssel működnek — ChatGPT, Gemini, Claude és társai.',
        toolsTitle: 'Útmutatók <em>AI eszköz</em> szerint', toolsTag: 'Válaszd ki az AI-eszközöd az eszköz-specifikus, lépésről lépésre útmutatókhoz.',
        guidesMetaDesc: 'Közérthető, lépésről lépésre útmutatók a hétköznapi AI-hoz: promptírás, összefoglalás, tényellenőrzés, biztonság. Bármelyik asszisztenssel működik.',
        toolsMetaDesc: 'Lépésről lépésre útmutatók konkrét AI-eszközökhöz: ChatGPT, Gemini, Claude, Copilot, Perplexity és társaik. Válaszd ki az eszközöd, és vágj bele.',
        footerNote: 'Önálló AI-ügynökök írják és gondozzák · Pontosságra ellenőrizve', back: '← Vissza', language: 'Nyelv' },
  es: { news: 'Noticias', guides: 'Guías', tools: 'Herramientas IA', support: 'Apóyanos',
        heroKicker: 'Número 01', heroTitle: 'La IA cotidiana, <em>explicada fácil.</em>',
        minRead: 'min de lectura', stepByStep: 'Paso a paso',
        guidesTitle: 'Habilidades de <em>IA cotidiana</em>', guidesTag: 'Guías en lenguaje claro que funcionan con cualquier asistente — ChatGPT, Gemini, Claude y más.',
        toolsTitle: 'Guías por <em>herramienta de IA</em>', toolsTag: 'Elige tu herramienta de IA para guías paso a paso específicas.',
        guidesMetaDesc: 'Guías paso a paso en lenguaje claro sobre IA cotidiana: escribir prompts, resumir, verificar datos y usarla con seguridad. Funciona con cualquier asistente.',
        toolsMetaDesc: 'Guías paso a paso para herramientas de IA concretas: ChatGPT, Gemini, Claude, Copilot, Perplexity y más. Elige tu herramienta y aprende lo que necesitas.',
        footerNote: 'Escrito y curado por agentes de IA autónomos · Revisado para mayor precisión', back: '← Volver', language: 'Idioma' },

};

// További felületi feliratok (homepage + cikk-chrome)
const UI_EXTRA = {
  en: { coverStory: 'Cover Story', edit: 'The Edit', latestNews: 'Latest <span class="muted-word">news</span>', all: 'All', personal: '🏠 Everyday life', business: '💼 Business', ctaTitle: 'New to AI? Start with our step-by-step guides', ctaText: 'Browse practical how-tos by tool and task — everyday and business.', backStories: '← Back to all stories', noStories: 'No stories yet', noStoriesNote: 'Our AI newsroom is gathering the latest. Check back soon.' },
  hu: { coverStory: 'Címlapsztori', edit: 'A válogatás', latestNews: 'Friss <span class="muted-word">hírek</span>', all: 'Mind', personal: '🏠 Hétköznapok', business: '💼 Üzlet', ctaTitle: 'Új vagy az AI-ban? Kezdd a lépésről-lépésre útmutatókkal', ctaText: 'Böngéssz gyakorlati útmutatókat eszköz és feladat szerint — hétköznapi és üzleti.', backStories: '← Vissza a hírekhez', noStories: 'Még nincs cikk', noStoriesNote: 'Az AI-szerkesztőségünk épp gyűjti a legfrissebbeket. Nézz vissza hamarosan.' },
  es: { coverStory: 'Portada', edit: 'La selección', latestNews: 'Últimas <span class="muted-word">noticias</span>', all: 'Todo', personal: '🏠 Día a día', business: '💼 Negocios', ctaTitle: '¿Nuevo en la IA? Empieza con nuestras guías paso a paso', ctaText: 'Explora guías prácticas por herramienta y tarea — cotidianas y de negocio.', backStories: '← Volver a las noticias', noStories: 'Aún no hay artículos', noStoriesNote: 'Nuestra redacción de IA está recopilando lo último. Vuelve pronto.' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_EXTRA[l] || {});

// Útmutató-oldalak + cikk-lábléc feliratai (a user jelezte: angolul maradtak)
const UI_GUIDES = {
  en: { tagline: 'AI news, in plain language', forEveryone: 'For everyone',
        lvl_beginner: 'beginner', lvl_intermediate: 'intermediate', lvl_advanced: 'advanced',
        guideWordOne: 'guide', guideWordMany: 'guides',
        pickTool: 'Pick the AI tool you use to jump to its step-by-step guides.',
        companyGuides: '{c} <span class="muted-word">guides</span>',
        // ESZKÖZ-FAJTA FEJLÉCEK (2026-08-17) — a fajtákat a core/tool-kinds.js
        // dönti el. Az "asszisztens" szó CSAK a kindAssistant alatt igaz, ezért
        // került le ide a lap tagline-jából; a többi fejléc szándékosan NEM
        // mondja, hogy asszisztens lenne.
        kindAssistant: 'AI assistants you <span class="muted-word">chat with</span>',
        kindImage: 'Image and video <span class="muted-word">generators</span>',
        kindData: 'Data and analytics <span class="muted-word">platforms</span>',
        kindOther: 'Other <span class="muted-word">AI tools</span>',
        comingSoon: 'Guides are on their way — check back shortly.',
        audPersonal: 'Everyday life', audBusiness: 'Business', audBoth: 'Life & Business',
        aiSkills: 'AI skills', coverSub: 'For everyday people', exampleLabel: 'Example', tryTyping: 'Try typing this', xrefNews: 'What prompted this guide', xrefGuide: 'Want to try it? Step-by-step guide',
        disclosureNews: "✦ Original guide written by AI World HQ's own AI editorial team. Reviewed for accuracy and clarity.",
        disclosureGuide: "✦ Original step-by-step guide by AI World HQ's AI editorial team. Written in plain language, reviewed for accuracy." },
  hu: { tagline: 'AI-hírek, közérthetően', forEveryone: 'Mindenkinek',
        lvl_beginner: 'kezdő', lvl_intermediate: 'középhaladó', lvl_advanced: 'haladó',
        guideWordOne: 'útmutató', guideWordMany: 'útmutató',
        pickTool: 'Válaszd ki az AI-eszközt, amit használsz — és ugorj a lépésről lépésre útmutatóihoz.',
        companyGuides: '{c} <span class="muted-word">útmutatók</span>',
        kindAssistant: 'AI-asszisztensek, <span class="muted-word">amikkel beszélgetsz</span>',
        kindImage: 'Kép- és videó<span class="muted-word">generátorok</span>',
        kindData: 'Adat- és <span class="muted-word">elemzőplatformok</span>',
        kindOther: 'Egyéb <span class="muted-word">AI-eszközök</span>',
        comingSoon: 'Az útmutatók úton vannak — nézz vissza hamarosan.',
        audPersonal: 'Hétköznapok', audBusiness: 'Üzlet', audBoth: 'Otthon és munka',
        aiSkills: 'AI-készségek', coverSub: 'Hétköznapi embereknek', exampleLabel: 'Példa', tryTyping: 'Írd be ezt', xrefNews: 'Ebből a hírből született az útmutató', xrefGuide: 'Kipróbálnád? Lépésről lépésre útmutató',
        disclosureNews: '✦ Az AI World HQ saját AI-szerkesztősége által írt eredeti cikk. Pontosságra és érthetőségre ellenőrizve.',
        disclosureGuide: '✦ Az AI World HQ AI-szerkesztőségének eredeti, lépésről lépésre útmutatója. Közérthetően írva, pontosságra ellenőrizve.' },
  es: { tagline: 'Noticias de IA, en lenguaje claro', forEveryone: 'Para todos',
        lvl_beginner: 'principiante', lvl_intermediate: 'intermedio', lvl_advanced: 'avanzado',
        guideWordOne: 'guía', guideWordMany: 'guías',
        pickTool: 'Elige la herramienta de IA que usas para ir a sus guías paso a paso.',
        companyGuides: '<span class="muted-word">Guías de</span> {c}',
        kindAssistant: 'Asistentes de IA <span class="muted-word">para chatear</span>',
        kindImage: '<span class="muted-word">Generadores de</span> imagen y vídeo',
        kindData: '<span class="muted-word">Plataformas de</span> datos y analítica',
        kindOther: 'Otras <span class="muted-word">herramientas de IA</span>',
        comingSoon: 'Las guías están en camino — vuelve pronto.',
        audPersonal: 'Día a día', audBusiness: 'Negocios', audBoth: 'Vida y negocios',
        aiSkills: 'Habilidades de IA', coverSub: 'Para el día a día', exampleLabel: 'Ejemplo', tryTyping: 'Escribe esto', xrefNews: 'La noticia detrás de esta guía', xrefGuide: '¿Quieres probarlo? Guía paso a paso',
        disclosureNews: '✦ Artículo original escrito por el equipo editorial de IA de AI World HQ Revisado para mayor precisión y claridad.',
        disclosureGuide: '✦ Guía original paso a paso del equipo editorial de IA de AI World HQ Escrita en lenguaje claro y revisada para mayor precisión.' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_GUIDES[l] || {});

// Nap-feliratok a 7 napos hír-archívumhoz
const UI_DAYS = {
  en: { past7: 'Past 7 days', today: 'Today', yesterday: 'Yesterday' },
  hu: { past7: 'Az elmúlt 7 nap', today: 'Ma', yesterday: 'Tegnap' },
  es: { past7: 'Últimos 7 días', today: 'Hoy', yesterday: 'Ayer' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_DAYS[l] || {});

// Támogatói oldal + lábléc-leírás (user-jelzés 2026-07-03: ezek beégetett
// angol szövegek voltak — a support.html minden nyelven angolul jelent meg)
const UI_SUPPORT = {
  en: { siteDesc: 'AI news and how-to guides for everyday people — fresh, friendly, jargon-free.',
        supPill: 'Support us', supTitle: 'Keep everyday AI <em>free for everyone</em>',
        supLead: 'AI World is a small, independent project — a team of AI agents and one human — publishing clear, jargon-free guides about AI. We keep it free and ad-light. If you find it useful, you can chip in to help cover the running costs.',
        supCard1h: 'Hosting &amp; domain', supCard1p: 'Keeping the site online, fast and reachable for everyone.',
        supCard2h: 'The AI newsroom', supCard2p: 'The models that research, write, fact-check and improve every article.',
        supCard3h: 'Original artwork', supCard3p: 'The custom cover image generated for each story.',
        supThanksH: 'To everyone who chips in — thank you. 💛',
        supThanksP: "You keep AI World free, ad-light and open to everyone. Every coffee helps cover our hosting and powers the little AI newsroom behind every article. We're a tiny independent team, so it genuinely means the world to us.",
        supNote: 'Supporting us is completely optional — the site stays free either way. We\'re a small independent project, not a registered charity, so your contribution is a friendly <strong>voluntary tip</strong>, not a tax-deductible donation. Thank you for reading. 💛',
        supSoon: 'coming soon', supMetaTitle: 'Support',
        supMetaDesc: 'Help keep AI World free and ad-light. A small voluntary tip covers our hosting and the AI that writes each article.' },
  hu: { siteDesc: 'AI-hírek és útmutatók hétköznapi embereknek — frissen, barátságosan, szakzsargon nélkül.',
        supPill: 'Támogass minket', supTitle: 'Maradjon a hétköznapi AI <em>mindenkinek ingyenes</em>',
        supLead: 'Az AI World egy kicsi, független projekt — egy csapatnyi AI-ügynök és egyetlen ember —, amely közérthető, szakzsargon-mentes útmutatókat készít az AI-ról. Ingyen adjuk, alig van rajta hirdetés. Ha hasznosnak találod, bedobhatsz egy kávéra valót a működési költségekhez.',
        supCard1h: 'Tárhely és domain', supCard1p: 'Hogy az oldal online, gyors és mindenki számára elérhető maradjon.',
        supCard2h: 'Az AI-szerkesztőség', supCard2p: 'A modellek, amelyek minden cikket kutatnak, megírnak, tényellenőriznek és csiszolnak.',
        supCard3h: 'Eredeti grafikák', supCard3p: 'Minden cikkhez egyedi borítókép készül.',
        supThanksH: 'Mindenkinek, aki beszáll — köszönjük. 💛',
        supThanksP: 'Neked köszönhető, hogy az AI World ingyenes, alig hirdetéses és mindenki előtt nyitva áll. Minden kávé a tárhelyet fedezi, és a cikkek mögötti kis AI-szerkesztőséget hajtja. Pici, független csapat vagyunk — tényleg sokat jelent.',
        supNote: 'A támogatás teljesen önkéntes — az oldal enélkül is ingyenes marad. Kicsi, független projekt vagyunk, nem bejegyzett jótékonysági szervezet, ezért a hozzájárulásod baráti <strong>önkéntes borravaló</strong>, nem adóból leírható adomány. Köszönjük, hogy olvasol. 💛',
        supSoon: 'hamarosan', supMetaTitle: 'Támogatás',
        supMetaDesc: 'Segíts, hogy az AI World ingyenes és hirdetésmentes-közeli maradjon. Egy kis önkéntes borravaló fedezi a tárhelyet és a cikkeket író AI-t.' },
  es: { siteDesc: 'Noticias y guías de IA para gente común — frescas, cercanas y sin jerga.',
        supPill: 'Apóyanos', supTitle: 'Mantén la IA cotidiana <em>gratis para todos</em>',
        supLead: 'AI World es un proyecto pequeño e independiente — un equipo de agentes de IA y una sola persona — que publica guías claras y sin jerga sobre la IA. Lo mantenemos gratis y casi sin anuncios. Si te resulta útil, puedes aportar algo para cubrir los costes.',
        supCard1h: 'Alojamiento y dominio', supCard1p: 'Mantener el sitio en línea, rápido y accesible para todos.',
        supCard2h: 'La redacción de IA', supCard2p: 'Los modelos que investigan, escriben, verifican y mejoran cada artículo.',
        supCard3h: 'Ilustraciones originales', supCard3p: 'La imagen de portada creada para cada historia.',
        supThanksH: 'A todos los que aportan: gracias. 💛',
        supThanksP: 'Gracias a ti, AI World sigue siendo gratuito, con pocos anuncios y abierto a todos. Cada café ayuda a cubrir el alojamiento y alimenta la pequeña redacción de IA detrás de cada artículo. Somos un equipo diminuto e independiente, así que significa muchísimo.',
        supNote: 'Apoyarnos es totalmente opcional: el sitio seguirá siendo gratuito de todos modos. Somos un pequeño proyecto independiente, no una organización benéfica registrada, así que tu aportación es una <strong>propina voluntaria</strong>, no un donativo desgravable. Gracias por leernos. 💛',
        supSoon: 'muy pronto', supMetaTitle: 'Apóyanos',
        supMetaDesc: 'Ayuda a que AI World siga siendo gratuito y casi sin anuncios. Una pequeña propina voluntaria cubre el alojamiento y la IA que escribe cada artículo.' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_SUPPORT[l] || {});

// ===================================================================
// ÜGYFÉLSZOLGÁLAT GYIK (2026-07-20) — a kb.json „site” szekciója.
// A chat-motor CSAK innen + a guide-listából adhat linket (kitalált URL tilos).
// ===================================================================
const CS_FAQ = {
  en: [
    { q: 'What is AI World HQ?', a: 'An automated, independent news + guides site that helps everyday people use AI. Content is produced by an AI newsroom with honesty checks, in 5 languages.', p: '/about' },
    { q: 'How do I report a mistake in an article?', a: 'Use the 👍/👎 buttons under the article, or send us a message — genuine errors get corrected and republished.', p: '/about' },
    { q: 'Is the site free? How can I support it?', a: 'Everything is free. If you want, you can leave a voluntary tip on the Support page.', p: '/support' },
    { q: 'Where do I find beginner guides?', a: 'The Start page lists the first 5 guides to read, and the Guides page has all of them by topic.', p: '/start' },
    { q: 'What do AI words like prompt or token mean?', a: 'Our AI glossary explains the most common terms in plain language.', p: '/glossary' },
    { q: 'Is there an RSS feed?', a: 'Yes — every language has its own feed.', p: '/feed.xml' },
    { q: 'How do I contact you / reach a human?', a: 'Use the message form at the bottom of the About page, or write to support@aiworldhq.com — a human reads every message.', p: '/about#contact' }
  ],
  hu: [
    { q: 'Mi az AI World HQ?', a: 'Automata, független hír- és útmutató-oldal, ami a hétköznapi AI-használatban segít. A tartalmat AI-szerkesztőség készíti őszinteség-ellenőrzéssel, 5 nyelven.', p: '/about' },
    { q: 'Hogyan jelezhetek hibát egy cikkben?', a: 'A cikk alatti 👍/👎 gombokkal, vagy írj nekünk — a valódi hibákat javítjuk és újra kiadjuk.', p: '/about' },
    { q: 'Ingyenes az oldal? Hogyan támogathatom?', a: 'Minden ingyenes. Ha szeretnéd, a Támogatás oldalon önkéntes borravalót adhatsz.', p: '/support' },
    { q: 'Hol találom a kezdő útmutatókat?', a: 'A Kezdés oldal az első 5 ajánlott útmutatót mutatja, az Útmutatók oldalon pedig az összes megvan téma szerint.', p: '/start' },
    { q: 'Mit jelentenek az AI-szavak, pl. prompt vagy token?', a: 'Az AI-kisszótárunk közérthetően elmagyarázza a leggyakoribb fogalmakat.', p: '/glossary' },
    { q: 'Van RSS?', a: 'Igen — minden nyelvnek saját feedje van.', p: '/feed.xml' },
    { q: 'Hogyan tudlak elérni titeket / élő embert?', a: 'A Rólunk oldal alján lévő üzenet-űrlappal, vagy írj a support@aiworldhq.com címre — minden üzenetet elolvas egy ember.', p: '/about#contact' }
  ],
  es: [
    { q: '¿Qué es AI World HQ?', a: 'Un sitio automático e independiente de noticias y guías que te ayuda a usar la IA en el día a día. El contenido lo produce una redacción de IA con controles de honestidad, en 5 idiomas.', p: '/about' },
    { q: '¿Cómo aviso de un error en un artículo?', a: 'Con los botones 👍/👎 bajo el artículo, o escríbenos — los errores reales se corrigen y se vuelven a publicar.', p: '/about' },
    { q: '¿El sitio es gratis? ¿Cómo puedo apoyarlo?', a: 'Todo es gratis. Si quieres, puedes dejar una propina voluntaria en la página de Apoyo.', p: '/support' },
    { q: '¿Dónde están las guías para principiantes?', a: 'La página Empezar muestra las 5 primeras guías recomendadas, y en Guías están todas por tema.', p: '/start' },
    { q: '¿Qué significan palabras como prompt o token?', a: 'Nuestro pequeño glosario de IA explica los términos más comunes en lenguaje claro.', p: '/glossary' },
    { q: '¿Hay RSS?', a: 'Sí — cada idioma tiene su propio feed.', p: '/feed.xml' },
    { q: '¿Cómo os contacto / hablo con una persona?', a: 'Usa el formulario al final de la página Sobre nosotros, o escribe a support@aiworldhq.com — una persona lee todos los mensajes.', p: '/about#contact' }
  ],

};

// Chat-doboz + űrlap UI-szövegei (megszólítás-norma: hu=te, de=du, es=tú, fr=vous)
const UI_CHAT = {
  en: { csOpen: 'Questions? Chat with us', csTitle: 'AI World HQ assistant', csHello: 'Hi! Ask me about the site or any of our AI guides. 😊', csPlaceholder: 'Type your question…', csSend: 'Send', csHuman: 'I need a human', csFormT: 'Message the team', csName: 'Name (optional)', csEmail: 'Your email', csMsg: 'Your message', csSubmit: 'Send message', csOk: 'Thanks! We got your message and will reply by email.', csErr: 'Something went wrong — please try again or email support@aiworldhq.com.', csPrivacy: 'We only use your email to reply; messages are deleted after 30 days.', csThinking: 'Thinking…' },
  hu: { csOpen: 'Kérdésed van? Írj nekünk', csTitle: 'AI World HQ asszisztens', csHello: 'Szia! Kérdezz az oldalról vagy bármelyik AI-útmutatónkról. 😊', csPlaceholder: 'Írd ide a kérdésed…', csSend: 'Küldés', csHuman: 'Emberi segítséget kérek', csFormT: 'Üzenet a csapatnak', csName: 'Név (nem kötelező)', csEmail: 'Email-címed', csMsg: 'Üzeneted', csSubmit: 'Üzenet küldése', csOk: 'Köszönjük! Megkaptuk az üzeneted, emailben válaszolunk.', csErr: 'Valami hiba történt — próbáld újra, vagy írj a support@aiworldhq.com címre.', csPrivacy: 'Az email-címedet csak a válaszhoz használjuk; az üzenetek 30 nap után törlődnek.', csThinking: 'Gondolkodom…' },
  es: { csOpen: '¿Preguntas? Chatea con nosotros', csTitle: 'Asistente de AI World HQ', csHello: '¡Hola! Pregúntame sobre el sitio o cualquiera de nuestras guías de IA. 😊', csPlaceholder: 'Escribe tu pregunta…', csSend: 'Enviar', csHuman: 'Quiero hablar con una persona', csFormT: 'Mensaje al equipo', csName: 'Nombre (opcional)', csEmail: 'Tu correo', csMsg: 'Tu mensaje', csSubmit: 'Enviar mensaje', csOk: '¡Gracias! Recibimos tu mensaje y te responderemos por correo.', csErr: 'Algo salió mal — inténtalo de nuevo o escribe a support@aiworldhq.com.', csPrivacy: 'Solo usamos tu correo para responderte; los mensajes se borran a los 30 días.', csThinking: 'Pensando…' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_CHAT[l] || {});

// Folyamat-térkép feliratok (útmutató-oldal tetején lévő lépés-áttekintő)
const UI_MAP = {
  en: { mapTitle: 'Your roadmap', mapSteps: 'steps' },
  hu: { mapTitle: 'Így fogod csinálni', mapSteps: 'lépés' },
  es: { mapTitle: 'Así lo harás', mapSteps: 'pasos' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_MAP[l] || {});

// Lépés-kipipálás felfedezhetőség (2026-07-08): a user jelezte, nem derül ki,
// hogy a lépés SZÁMÁRA kattintva késznek jelölhető. Ez a tipp-sor elmondja.
const UI_STEPTIP = {
  en: { stepTipLabel: 'Tip', stepTip: 'tap a step’s number when you finish it — a green tick appears and your browser remembers how far you got.' },
  hu: { stepTipLabel: 'Tipp', stepTip: 'kattints egy lépés számára, ha kész vagy — zöld pipa jelenik meg, és a böngésződ megjegyzi, meddig jutottál.' },
  es: { stepTipLabel: 'Consejo', stepTip: 'toca el número de un paso cuando lo termines — aparece una marca verde y tu navegador recuerda hasta dónde llegaste.' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_STEPTIP[l] || {});

// Kereső feliratok (navbar kereső-overlay, 2026-07-07)
// Kapcsolódó cikkek + Kezdd itt feliratok
const UI_REL = {
  en: { relatedTitle: 'Keep reading', startHere: 'Start here', midRead: 'Read this next' },
  hu: { relatedTitle: 'Olvass tovább', startHere: 'Kezdd itt!', midRead: 'Ezt olvasd utána' },
  es: { relatedTitle: 'Sigue leyendo', startHere: 'Empieza aquí', midRead: 'Lee esto después' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_REL[l] || {});

// "Kezdd itt!" oldal szövegei (teljesen kezdő látogatóknak, 2026-07-07)
const UI_START = {
  en: { startTitle: 'New to AI? Start here.', startTag: 'No jargon, no pressure — just the first small steps, in the right order.',
        startS1h: 'What is this site?', startS1p: 'AI World HQ explains artificial intelligence for everyday people: fresh news in plain language, and step-by-step guides a complete beginner can follow. Every technical word is explained the first time it appears.',
        startS2h: 'How to begin', startS2p: 'Pick the first guide below and simply follow the steps — each one tells you what to do, what you should see on your screen, and what to do if yours looks different. Tick off the steps as you go!',
        startS3h: 'Stay safe from day one', startS3p: 'Two golden rules: never paste passwords, ID numbers or bank details into an AI chat, and always double-check important facts — AI assistants sound confident even when they are wrong.',
        startPickH: 'Your first 5 guides', startMore: 'Browse all guides' },
  hu: { startTitle: 'Új vagy az AI-ban? Kezdd itt!', startTag: 'Se szakzsargon, se nyomás — csak az első kis lépések, jó sorrendben.',
        startS1h: 'Mi ez az oldal?', startS1p: 'Az AI World HQ hétköznapi embereknek magyarázza a mesterséges intelligenciát: friss hírek közérthetően, és lépésről lépésre útmutatók, amiket egy teljesen kezdő is követni tud. Minden szakszót megmagyarázunk az első előfordulásakor.',
        startS2h: 'Így indulj el', startS2p: 'Válaszd ki lent az első útmutatót, és egyszerűen kövesd a lépéseket — mindegyik megmondja, mit csinálj, mit kell látnod a képernyőn, és mit tegyél, ha nálad máshogy néz ki. A lépéseket ki is pipálhatod!',
        startS3h: 'Biztonság az első naptól', startS3p: 'Két aranyszabály: soha ne írj jelszót, személyes azonosítót vagy bankadatot AI-csevegésbe, és a fontos tényeket mindig ellenőrizd — az AI magabiztosan beszél akkor is, amikor téved.',
        startPickH: 'Az első 5 útmutatód', startMore: 'Az összes útmutató' },
  es: { startTitle: '¿Nuevo en la IA? Empieza aquí.', startTag: 'Sin jerga y sin presión: solo los primeros pasos, en el orden correcto.',
        startS1h: '¿Qué es este sitio?', startS1p: 'AI World HQ explica la inteligencia artificial para gente común: noticias en lenguaje claro y guías paso a paso que cualquier principiante puede seguir. Cada término técnico se explica la primera vez que aparece.',
        startS2h: 'Cómo empezar', startS2p: 'Elige la primera guía de abajo y sigue los pasos: cada uno te dice qué hacer, qué deberías ver en tu pantalla y qué hacer si la tuya se ve diferente. ¡Puedes ir marcando los pasos!',
        startS3h: 'Seguridad desde el primer día', startS3p: 'Dos reglas de oro: nunca pegues contraseñas, documentos o datos bancarios en un chat de IA, y verifica siempre los datos importantes: la IA suena segura incluso cuando se equivoca.',
        startPickH: 'Tus primeras 5 guías', startMore: 'Ver todas las guías' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_START[l] || {});

// Olvasói visszajelzés feliratok (2026-07-07)
const UI_FB = {
  en: { fbQ: 'Was this helpful?', fbThanks: 'Thanks for the feedback! 💛' },
  hu: { fbQ: 'Hasznos volt?', fbThanks: 'Köszönjük a visszajelzést! 💛' },
  es: { fbQ: '¿Te ha resultado útil?', fbThanks: '¡Gracias por tu opinión! 💛' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_FB[l] || {});

const UI_SEARCH = {
  en: { searchLabel: 'Search', searchPh: 'Search articles and guides…', noResults: 'No results — try another word' },
  hu: { searchLabel: 'Keresés', searchPh: 'Keress a cikkek és útmutatók közt…', noResults: 'Nincs találat — próbálj más szót' },
  es: { searchLabel: 'Buscar', searchPh: 'Busca artículos y guías…', noResults: 'Sin resultados — prueba otra palabra' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_SEARCH[l] || {});

// AI-kisszótár feliratok (2026-07-08)
const UI_GLOSS = {
  en: { glossNav: 'Dictionary', glossTitle: 'The little AI dictionary', glossTag: 'Every AI word you keep seeing — explained in one breath, no jargon.' },
  hu: { glossNav: 'Kisszótár', glossTitle: 'AI-kisszótár', glossTag: 'Minden AI-szó, amivel folyton találkozol — egy szuszra, szakzsargon nélkül elmagyarázva.' },
  es: { glossNav: 'Diccionario', glossTitle: 'El pequeño diccionario de la IA', glossTag: 'Todas las palabras de IA que ves por todas partes — explicadas de un tirón, sin jerga.' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_GLOSS[l] || {});

// "Melyik AI való neked?" varázsló feliratok (2026-07-08)
const UI_WIZ = {
  en: { wizTitle: 'Which AI is right for you?', wizTag: 'Four quick questions — and we point you to the assistant that fits your life.',
        wizStep: 'Question', wizResultH: 'Your best match', wizAlso: 'Also worth a look', wizCta: 'See our guides for it', wizAgain: 'Start over',
        wizBanner: 'Not sure which AI to pick? Take the 1-minute quiz →' },
  hu: { wizTitle: 'Melyik AI való neked?', wizTag: 'Négy gyors kérdés — és megmutatjuk, melyik asszisztens illik az életedhez.',
        wizStep: 'Kérdés', wizResultH: 'A te eszközöd', wizAlso: 'Ezt is érdemes megnézni', wizCta: 'Nézd meg az útmutatóinkat hozzá', wizAgain: 'Újrakezdem',
        wizBanner: 'Nem tudod, melyik AI-t válaszd? 1 perces teszt →' },
  es: { wizTitle: '¿Qué IA es la adecuada para ti?', wizTag: 'Cuatro preguntas rápidas — y te indicamos el asistente que encaja con tu vida.',
        wizStep: 'Pregunta', wizResultH: 'Tu mejor opción', wizAlso: 'También vale la pena', wizCta: 'Ver nuestras guías', wizAgain: 'Empezar de nuevo',
        wizBanner: '¿No sabes qué IA elegir? Test de 1 minuto →' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_WIZ[l] || {});

// "Rólunk / Hogyan dolgozunk" bizalmi oldal (2026-07-10) — E-E-A-T: a Google
// és az olvasó lássa, ki áll az oldal mögött és hogyan készül a tartalom.
// ŐSZINTESÉG: nyíltan vállaljuk, hogy AI-agentek írják, minőség-kapuval.
const UI_ABOUT = {
  en: { aboutNav: 'About us', aboutTitle: 'About AI World HQ', aboutTag: 'Who we are, how our articles are made, and the rules we never break.',
        aboutWhoH: 'What is AI World HQ?', aboutWhoP: 'A small, independent site that explains artificial intelligence for everyday people — fresh news in plain language and step-by-step guides a complete beginner can follow, in five languages.',
        aboutHowH: 'How our content is made', aboutHowP: 'Our newsroom is run by AI agents — openly. They read the official announcements, write a plain-language article, and every piece must pass an automated quality gate that checks clarity and honesty before it can go live. A human owner oversees the system, reads your feedback and keeps tightening the rules.',
        aboutSrcH: 'Where the news comes from', aboutSrcP: 'Only official, first-party sources: the newsrooms and blogs of the AI companies themselves — OpenAI, Google, Microsoft, Anthropic, Meta, NVIDIA, Mistral and more. No rumours, no anonymous “insiders”. If a company didn’t announce it, we don’t report it.',
        aboutHonH: 'Our honesty rules', aboutHonP: 'Every article carries an AI-disclosure note. We never invent facts, screenshots or prices — anything that changes over time points you to the official site instead. Technical words are explained the first time they appear, and our AI dictionary covers the rest.',
        aboutFixH: 'Spotted a mistake?', aboutFixP: 'Tell us with the 👍/👎 buttons under any article, or reach us via the Support page. Genuine errors get corrected and the fixed article is republished — that’s a promise.' },
  hu: { aboutNav: 'Rólunk', aboutTitle: 'Az AI World HQ-ról', aboutTag: 'Kik vagyunk, hogyan készülnek a cikkeink, és melyek a szabályok, amiket sosem szegünk meg.',
        aboutWhoH: 'Mi az AI World HQ?', aboutWhoP: 'Egy kis, független oldal, amely hétköznapi embereknek magyarázza a mesterséges intelligenciát — friss hírek közérthetően és lépésről lépésre útmutatók, amelyeket egy teljesen kezdő is követni tud, öt nyelven.',
        aboutHowH: 'Hogyan készül a tartalom?', aboutHowP: 'A szerkesztőségünket AI-agentek működtetik — nyíltan vállalva. Elolvassák a hivatalos bejelentéseket, közérthető cikket írnak, és minden írásnak át kell mennie egy automatikus minőség-kapun, amely az érthetőséget és az őszinteséget ellenőrzi, mielőtt élesbe kerülhet. A rendszert emberi tulajdonos felügyeli: olvassa a visszajelzéseidet és folyamatosan szigorítja a szabályokat.',
        aboutSrcH: 'Honnan jönnek a hírek?', aboutSrcP: 'Kizárólag hivatalos, elsődleges forrásokból: maguknak az AI-cégeknek a hírrovataiból és blogjairól — OpenAI, Google, Microsoft, Anthropic, Meta, NVIDIA, Mistral és társaik. Se pletyka, se névtelen „bennfentes”. Ha egy cég nem jelentette be, mi nem írjuk meg.',
        aboutHonH: 'Őszinteség-szabályaink', aboutHonP: 'Minden cikken ott az AI-közreműködés jelölése. Sosem találunk ki tényt, képernyőképet vagy árat — ami idővel változik, ahhoz a hivatalos oldalra irányítunk. A szakszavakat az első előfordulásukkor elmagyarázzuk, a többit pedig az AI-kisszótárunk fedi le.',
        aboutFixH: 'Hibát találtál?', aboutFixP: 'Jelezd a cikkek alatti 👍/👎 gombokkal, vagy írj a Támogatás oldalon keresztül. A valódi hibákat kijavítjuk, és a javított cikket újra kiadjuk — ez ígéret.' },
  es: { aboutNav: 'Quiénes somos', aboutTitle: 'Sobre AI World HQ', aboutTag: 'Quiénes somos, cómo se hacen nuestros artículos y las reglas que nunca rompemos.',
        aboutWhoH: '¿Qué es AI World HQ?', aboutWhoP: 'Un sitio pequeño e independiente que explica la inteligencia artificial para gente común: noticias frescas en lenguaje claro y guías paso a paso que cualquier principiante puede seguir, en cinco idiomas.',
        aboutHowH: 'Cómo se hace el contenido', aboutHowP: 'Nuestra redacción la llevan agentes de IA — y lo decimos abiertamente. Leen los anuncios oficiales, escriben un artículo en lenguaje claro, y cada pieza debe pasar una puerta de calidad automática que comprueba claridad y honestidad antes de publicarse. Un propietario humano supervisa el sistema, lee tus comentarios y endurece las reglas continuamente.',
        aboutSrcH: 'De dónde vienen las noticias', aboutSrcP: 'Solo fuentes oficiales y de primera mano: las salas de prensa y blogs de las propias empresas de IA — OpenAI, Google, Microsoft, Anthropic, Meta, NVIDIA, Mistral y más. Sin rumores ni “fuentes anónimas”. Si una empresa no lo anunció, no lo publicamos.',
        aboutHonH: 'Nuestras reglas de honestidad', aboutHonP: 'Cada artículo lleva una nota de divulgación de IA. Nunca inventamos datos, capturas ni precios — lo que cambia con el tiempo te remite al sitio oficial. Las palabras técnicas se explican la primera vez que aparecen, y nuestro diccionario de IA cubre el resto.',
        aboutFixH: '¿Has visto un error?', aboutFixP: 'Dínoslo con los botones 👍/👎 bajo cualquier artículo, o contáctanos por la página de Apoyo. Los errores reales se corrigen y el artículo arreglado se vuelve a publicar — es una promesa.' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_ABOUT[l] || {});

// HIVATALOS ELÉRHETŐSÉGEK (2026-07-12, user: "ha már van útmutatója, legyen
// elérhetősége is") — CSAK stabil, hivatalos főoldalak; ahol nincs publikus
// oldal (pl. kutatási projekt), ott nincs link. Kitalált URL TILOS.
// A térkép KÖZÖS fájlban (website/tool-links.json) — a napi jelentés is innen
// olvassa, így az új, link nélküli eszközről a Főnök magától szól Telegramon.
let TOOL_LINKS = {}, COMPANY_LINKS = {};
try {
  const tl = JSON.parse(readFileSync(join(__dirname, 'tool-links.json'), 'utf-8'));
  TOOL_LINKS = tl.tools || {}; COMPANY_LINKS = tl.companies || {};
} catch { /* térkép nélkül nincs gomb — a build attól még fut */ }
const UI_OFFICIAL = {
  en: { officialSite: 'Official site', officialRow: 'Official sites' },
  hu: { officialSite: 'Hivatalos oldal', officialRow: 'Hivatalos oldalak' },
  es: { officialSite: 'Sitio oficial', officialRow: 'Sitios oficiales' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_OFFICIAL[l] || {});

// Orbit heti videó (2026-07-11): ha van friss weekly.json, a digest-cikk
// tetejére videó-lejátszó kerül (a mp4-et a core/video-compose.js gyártja).
let VIDEO_META = null;
try {
  const vm = JSON.parse(readFileSync(join(__dirname, 'assets', 'video', 'weekly.json'), 'utf-8'));
  if (vm.slug && (Date.now() - new Date(vm.created_at).getTime()) < 8 * 86400e3) VIDEO_META = vm;
} catch { /* nincs videó ezen a héten */ }

const UI_VID = {
  en: { vidNote: '▶ Orbit, our AI news anchor, sums up the week in about 90 seconds (English).' },
  hu: { vidNote: '▶ Orbit, az AI-hírbemondónk kb. 90 másodpercben összefoglalja a hetet (angolul).' },
  es: { vidNote: '▶ Orbit, nuestro presentador de IA, resume la semana en unos 90 segundos (en inglés).' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_VID[l] || {});

function videoBlock(a) {
  if (!VIDEO_META || VIDEO_META.slug !== a.slug) return '';
  // Kapcsolható feliratok (hu/es/de/fr) — az oldal nyelvén alapból BE
  const LANG_LABEL = { hu: 'Magyar', es: 'Español', };
  const tracks = ['hu', 'es']
    .filter(l => VIDEO_META.sentences?.some(x => x[l]))
    .map(l => `<track kind="subtitles" srclang="${l}" label="${LANG_LABEL[l]}" src="/assets/video/weekly-${VIDEO_META.week}.${l}.vtt"${l === LANG ? ' default' : ''}>`)
    .join('\n      ');
  return `<div class="vid">
    <video controls preload="metadata" crossorigin="anonymous" poster="/assets/video/weekly-poster.jpg" src="/assets/video/weekly-${VIDEO_META.week}.mp4">
      ${tracks}
    </video>
    <p class="ai-disclosure">${escapeHtml(tr('vidNote'))}</p>
  </div>`;
}

// GYIK-blokk az útmutatók végén (2026-07-11) — a MEGLÉVŐ, már lefordított
// tartalomból épül ($0 AI-költség): idő/eszköz templatelt válasz + az
// "Mielőtt elkezded" és "Gyakori hibák" szekciók újracsomagolva. A Google
// FAQPage-jelölést is kap → kinyíló kérdések a találati listában.
const UI_FAQ = {
  en: { faqTitle: 'Quick questions', faqQTime: 'How long does this take?', faqATime: 'About {min} minutes — the guide has {steps} steps, and you can tick each one off as you go.',
        faqQTool: 'Which tool do I need?', faqATool: 'This guide uses {tool} — but the approach works very similarly in other AI assistants.',
        faqQPrep: 'Do I need to prepare anything?', faqQMist: 'What mistakes should I avoid?' },
  hu: { faqTitle: 'Gyors kérdések', faqQTime: 'Mennyi időt vesz igénybe?', faqATime: 'Kb. {min} perc — az útmutató {steps} lépésből áll, és mindegyiket ki tudod pipálni, ahogy haladsz.',
        faqQTool: 'Milyen eszköz kell hozzá?', faqATool: 'Ez az útmutató a(z) {tool} eszközt használja — de a módszer nagyon hasonlóan működik más AI-asszisztensekben is.',
        faqQPrep: 'Kell valamit előkészítenem?', faqQMist: 'Milyen hibákat kerüljek el?' },
  es: { faqTitle: 'Preguntas rápidas', faqQTime: '¿Cuánto tiempo lleva?', faqATime: 'Unos {min} minutos — la guía tiene {steps} pasos y puedes ir marcándolos a medida que avanzas.',
        faqQTool: '¿Qué herramienta necesito?', faqATool: 'Esta guía usa {tool} — pero el método funciona de forma muy parecida en otros asistentes de IA.',
        faqQPrep: '¿Necesito preparar algo?', faqQMist: '¿Qué errores debo evitar?' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_FAQ[l] || {});

// "Minden hír" archívum-oldal feliratai (2026-07-11) — a régi hírek eddig
// csak a keresőből voltak elérhetők; az archívum lapozható + SEO-barát.
const UI_ARCH = {
  en: { archTitle: 'All news', archTag: 'Every story we have published — newest first, grouped by month.', archNav: 'Browse all news', archNavS: 'Archive' },
  hu: { archTitle: 'Minden hír', archTag: 'Az összes eddig megjelent hírünk — a legfrissebbtől, hónapok szerint.', archNav: 'Az összes hír böngészése', archNavS: 'Archívum' },
  es: { archTitle: 'Todas las noticias', archTag: 'Todas las historias que hemos publicado — las más recientes primero, agrupadas por mes.', archNav: 'Ver todas las noticias', archNavS: 'Archivo' },

};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_ARCH[l] || {});

// A varázsló kérdései + eredményei nyelvenként. A pontozás nyelvfüggetlen
// (s: eszköz→pont), a szöveg lokalizált. SZÁNDÉKOSAN óvatos megfogalmazás:
// nincs ár, nincs konkrét funkció-ígéret (az változik) — csak irány.
const WIZ_DATA = {
  en: {
    q: [
      { t: 'What would you mainly use AI for?', o: [
        { t: 'Writing help — emails, letters, ideas', s: { chatgpt: 2, claude: 2 } },
        { t: 'Learning and research — questions, explanations', s: { gemini: 2, chatgpt: 1 } },
        { t: 'Quick everyday help on my phone', s: { gemini: 2, chatgpt: 1 } },
        { t: 'Work documents — Word, Excel, Outlook', s: { copilot: 3 } }] },
      { t: 'Which digital world do you live in?', o: [
        { t: 'Google — Gmail, Android, Google Docs', s: { gemini: 2 } },
        { t: 'Microsoft — Windows, Office, Outlook', s: { copilot: 2 } },
        { t: 'Apple, mixed or neither', s: { chatgpt: 1, claude: 1 } }] },
      { t: 'Would you pay a monthly fee for AI?', o: [
        { t: 'No — free only for now', s: { gemini: 1 } },
        { t: 'Yes, if it earns its keep', s: { chatgpt: 1, claude: 1 } }] },
      { t: 'How confident are you with new apps?', o: [
        { t: 'Total beginner — keep it simple', s: { chatgpt: 1, gemini: 1 } },
        { t: 'Fairly confident', s: { claude: 1 } }] }
    ],
    r: {
      chatgpt: { n: 'ChatGPT (OpenAI)', w: 'The most popular all-rounder: strong at writing, brainstorming and everyday questions, with a generous free version and endless tutorials online. If you want the AI everyone talks about, start here.' },
      gemini:  { n: 'Gemini (Google)', w: 'Built right into the Google world: it plays nicely with Gmail and Google Docs, has a strong free version, and comes ready to use on many Android phones. A natural pick if you live in Google apps.' },
      claude:  { n: 'Claude (Anthropic)', w: 'Loved for thoughtful, careful writing and for handling long documents. A great companion for summarizing, drafting and getting honest, nuanced answers.' },
      copilot: { n: 'Copilot (Microsoft)', w: 'Lives inside Word, Excel and Outlook. If your day already runs on Microsoft Office, Copilot puts AI right where you work — no new app to learn.' }
    }
  },
  hu: {
    q: [
      { t: 'Mire használnád leginkább az AI-t?', o: [
        { t: 'Írás — e-mailek, levelek, ötletek', s: { chatgpt: 2, claude: 2 } },
        { t: 'Tanulás, kutatás — kérdések, magyarázatok', s: { gemini: 2, chatgpt: 1 } },
        { t: 'Gyors hétköznapi segítség a telefonon', s: { gemini: 2, chatgpt: 1 } },
        { t: 'Munka-dokumentumok — Word, Excel, Outlook', s: { copilot: 3 } }] },
      { t: 'Melyik digitális világban élsz?', o: [
        { t: 'Google — Gmail, Android, Google Dokumentumok', s: { gemini: 2 } },
        { t: 'Microsoft — Windows, Office, Outlook', s: { copilot: 2 } },
        { t: 'Apple, vegyes vagy egyik sem', s: { chatgpt: 1, claude: 1 } }] },
      { t: 'Fizetnél havidíjat egy AI-ért?', o: [
        { t: 'Nem — egyelőre csak ingyeneset', s: { gemini: 1 } },
        { t: 'Igen, ha megéri', s: { chatgpt: 1, claude: 1 } }] },
      { t: 'Mennyire vagy otthon az új appokban?', o: [
        { t: 'Teljesen kezdő vagyok — legyen egyszerű', s: { chatgpt: 1, gemini: 1 } },
        { t: 'Egész magabiztos', s: { claude: 1 } }] }
    ],
    r: {
      chatgpt: { n: 'ChatGPT (OpenAI)', w: 'A legnépszerűbb mindenes: erős írásban, ötletelésben és hétköznapi kérdésekben, bőkezű ingyenes változattal és rengeteg útmutatóval a neten. Ha azt az AI-t akarod, amiről mindenki beszél, itt kezdd.' },
      gemini:  { n: 'Gemini (Google)', w: 'A Google-világ beépített asszisztense: jól működik a Gmaillel és a Google Dokumentumokkal, erős az ingyenes változata, és sok Android-telefonon készen várja, hogy használd. Természetes választás, ha a Google-appokban élsz.' },
      claude:  { n: 'Claude (Anthropic)', w: 'A megfontolt, gondos írásáért és a hosszú dokumentumok kezeléséért szeretik. Remek társ összefoglaláshoz, fogalmazáshoz és őszinte, árnyalt válaszokhoz.' },
      copilot: { n: 'Copilot (Microsoft)', w: 'A Wordben, Excelben és Outlookban lakik. Ha a napod amúgy is a Microsoft Office-ban telik, a Copilot pont oda hozza az AI-t, ahol dolgozol — új appot sem kell tanulnod.' }
    }
  },
  es: {
    q: [
      { t: '¿Para qué usarías la IA principalmente?', o: [
        { t: 'Escribir — correos, cartas, ideas', s: { chatgpt: 2, claude: 2 } },
        { t: 'Aprender e investigar — preguntas, explicaciones', s: { gemini: 2, chatgpt: 1 } },
        { t: 'Ayuda rápida del día a día en el móvil', s: { gemini: 2, chatgpt: 1 } },
        { t: 'Documentos de trabajo — Word, Excel, Outlook', s: { copilot: 3 } }] },
      { t: '¿En qué mundo digital vives?', o: [
        { t: 'Google — Gmail, Android, Google Docs', s: { gemini: 2 } },
        { t: 'Microsoft — Windows, Office, Outlook', s: { copilot: 2 } },
        { t: 'Apple, mixto o ninguno', s: { chatgpt: 1, claude: 1 } }] },
      { t: '¿Pagarías una cuota mensual por la IA?', o: [
        { t: 'No — por ahora solo gratis', s: { gemini: 1 } },
        { t: 'Sí, si lo vale', s: { chatgpt: 1, claude: 1 } }] },
      { t: '¿Qué tal te manejas con las apps nuevas?', o: [
        { t: 'Principiante total — que sea sencillo', s: { chatgpt: 1, gemini: 1 } },
        { t: 'Bastante seguro/a', s: { claude: 1 } }] }
    ],
    r: {
      chatgpt: { n: 'ChatGPT (OpenAI)', w: 'El todoterreno más popular: fuerte en escritura, lluvia de ideas y preguntas cotidianas, con una versión gratuita generosa y tutoriales infinitos en la red. Si quieres la IA de la que todos hablan, empieza aquí.' },
      gemini:  { n: 'Gemini (Google)', w: 'Integrada en el mundo Google: se lleva bien con Gmail y Google Docs, tiene una versión gratuita potente y viene lista para usar en muchos móviles Android. La opción natural si vives en las apps de Google.' },
      claude:  { n: 'Claude (Anthropic)', w: 'Querida por su escritura cuidadosa y reflexiva y por manejar documentos largos. Una gran compañera para resumir, redactar y obtener respuestas honestas y matizadas.' },
      copilot: { n: 'Copilot (Microsoft)', w: 'Vive dentro de Word, Excel y Outlook. Si tu día ya transcurre en Microsoft Office, Copilot pone la IA justo donde trabajas — sin apps nuevas que aprender.' }
    }
  },

};

// VALÓDI lapszám: hány külön napon jelent meg tartalom (a main() számolja ki).
// A user jelezte: fixen "Issue 01"-et írt a dátum mellett — az nem igaz.
let ISSUE_NO = 1;

// Aktuális nyelv-állapot (a build ciklus állítja nyelvenként)
let LANG = 'en';
let LP = '';            // útvonal-prefix: '' (en) vagy '/hu' stb.
let T = UI.en;          // aktuális UI-szótár
function tr(k) { return (T && T[k] != null) ? T[k] : (UI.en[k] != null ? UI.en[k] : ''); }

// Átnevezett cikkek: EREDETI slug → MOSTANI slug (301-hez a _redirects-be)
const RENAMED_SLUGS = new Map();

function langPrefix(l) { return l === 'en' ? '' : `/${l}`; }

// ===================================================================
// KANONIKUS ÚTVONAL (2026-07-27) — a .html NÉLKÜLI alak az igazi cím.
// ===================================================================
// A Cloudflare Pages MAGÁTÓL 308-cal átirányítja a /valami.html címet a
// /valami alakra. Mi viszont a canonicalban, mind a 6 hreflangben, az
// og:url-ben ÉS a sitemapban a .html-es alakot hirdettük — vagyis azt
// állítottuk a Google-nak, hogy a végleges cím egy ÁTIRÁNYÍTÁS. A Search
// Console pontosan ezt jelentette vissza: 314 "átirányítást tartalmazó
// oldal", 109 "alternatív oldal kanonikus címkével", és nagyban ez rontja
// az indexelési bizalmat is (1546 "feltérképezve, nincs indexelve").
// Ez a függvény adja a VALÓDI, 200-at adó címet; a fájlok a lemezen
// továbbra is .html végűek maradnak (azokat a Cloudflare szolgálja ki).
//   'index.html'            → ''            (gyökér)
//   'guides.html'           → '/guides'
//   'article/foo-bar.html'  → '/article/foo-bar'
// A visszatérési érték MINDIG per-jellel kezdődik (vagy üres), így
// `${SITE.url}${langPrefix(l)}${canonicalPath(p)}` mindig ép URL-t ad.
// ===================================================================
function canonicalPath(pagePath) {
  const p = String(pagePath || '').replace(/^\/+/, '');
  if (p === '' || p === 'index.html') return '/';
  return '/' + p.replace(/\.html$/, '');
}

// Egy cikk fordítás-cache-e (content/translations/<ARTICLE...>.json = { hu:"md", ... })
function loadTranslation(file) {
  try { return JSON.parse(readFileSync(join(TRANS_DIR, file), 'utf-8')); } catch { return {}; }
}
// Cikk lokalizálása: a SLUG és a metaadatok maradnak (angolból), csak a
// megjelenő tartalom (cím/alcím/törzs) cserélődik. Ha nincs fordítás → angol.
function localizeArticle(a, lang) {
  if (lang === 'en') return a;
  const md = loadTranslation(a.file)[lang];
  if (!md) return a;   // fallback: angol
  const { meta, body } = parseFrontmatter(md);
  return {
    ...a,
    title: meta.title || a.title,
    subtitle: meta.subtitle || a.subtitle,
    seoDescription: meta.subtitle || a.seoDescription,
    bodyHtml: wrapTables(wrapInShort(wrapImpactSection(stripLeadH1(marked.parse(body))))),
    bodyMd: body
  };
}

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
  'personal': { label: 'Everyday life', key: 'audPersonal', icon: '🏠', cls: 'aud-personal' },
  'business': { label: 'Business',      key: 'audBusiness', icon: '💼', cls: 'aud-business' },
  'both':     { label: 'Life & Business', key: 'audBoth', icon: '🔄', cls: 'aud-both' }
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

// A lokalizált fejléc-szövegekben <em> van a kiemeléshez. A <title> tagbe és
// a JSON-LD-be CSAK sima szöveg mehet — a pageShell escapeHtml-t hív, ami a
// jelöléssel együtt a &lt;em&gt;-et is kiírná a böngésző fülére. (2026-08-04)
function plainText(s) {
  return (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
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
// ===================================================================
// RÖVIDEN-DOBOZ (2026-07-29) — a cikk elején álló egyenes válasz kiemelése
// ===================================================================
// A cikkek elbeszélő felütéssel indulnak ("Ott ültél egy megbeszélésen…").
// Embernek jó, DE a ChatGPT, a Perplexity és a Google kivonat-doboza az
// oldal TETEJÉT nézi — ha ott csak hangulatkeltés van, mást idéznek.
// Az írók ezért mostantól egy 1-2 mondatos egyenes választ tesznek a főcím
// után (shared/style-guide.md 2a); ez a függvény azt emeli ki vizuálisan.
//
// SZERKEZETRE illesztünk, NEM a címke szövegére ("In short"). Azt ugyanis a
// fordító lefordítja, és akkor a magyar/spanyol/német oldalon néma módon
// kimaradna a kiemelés. Ugyanez a hiba élt a HowTo-lépéseknél is, amíg a
// mintát nem tettük többnyelvűvé — ne csináljuk meg újra.
function wrapInShort(html) {
  // A doboz vagy a (törzsbeli) h1 után áll, vagy — a dupla-H1 javítás óta,
  // amikor a törzs h1-ét leszedjük — a törzs LEGELEJÉN. Mindkettőt kezeljük.
  const afterH1 = html.replace(/(<\/h1>\s*)<blockquote>([\s\S]*?)<\/blockquote>/,
    (_m, head, inner) => `${head}<aside class="lede">${inner}</aside>`);
  if (afterH1 !== html) return afterH1;
  return html.replace(/^(\s*)<blockquote>([\s\S]*?)<\/blockquote>/,
    (_m, lead, inner) => `${lead}<aside class="lede">${inner}</aside>`);
}

// DUPLA H1 (2026-07-31, Google-megfelelőségi audit lelete): a cikk címe
// KÉTSZER volt H1-ként minden oldalon — egyszer a sablon fejlécében, egyszer
// a markdown-törzsből ("# Cím") renderelve. 150 mintából 55-ön látszott
// (a többinél a cím írásjelei miatt nem egyezett a minta, de ott is dupla).
// A Google nem büntet több H1-ért, de az AZONOS szövegű dupla cím zavaros
// jelzés + a lapon vizuálisan is ismétlődött. A sablon H1-e marad (az a
// stílusozott), a TÖRZS elejéről vesszük le.
function stripLeadH1(html) {
  return html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/, '');
}

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

const DATE_LOCALES = { en: 'en-US', hu: 'hu-HU', es: 'es-ES' };
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(DATE_LOCALES[LANG] || 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
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
      // ===================================================================
      // RÖGZÍTETT SLUG (2026-07-27) — a megjelent URL ÖRÖKRE ugyanaz marad.
      // ===================================================================
      // Eddig az URL a CÍMBŐL készült, így valahányszor egy cikk címét
      // átdolgoztuk, az oldal ÁTKÖLTÖZÖTT, a régi cím pedig 404 lett — a
      // Google által már indexelt URL-lel együtt. A Search Console pontosan
      // ilyeneket jelentett (pl. /hu/article/automate-basic-email-replies-in-
      // outlook-with-meta-ai: a cikk ÉL, csak új címe lett). 232 útmutatóból
      // 197-nek tért el a mostani címéből képzett URL az eredetitől.
      // Mostantól a _meta.slug az igazság: ha egyszer megjelent, marad.
      // (A régi címekről a _redirects állít be 301-et — lásd lentebb.)
      const slug = data._meta?.slug || slugify(meta.title || data.original_title || file);
      // Az EREDETI (fájlnévbe fagyott) azonosító: erről CSAK AKKOR kell 301,
      // ha valaha nyilvános cím LEHETETT — vagyis pontosan a cím slugja.
      // ⚠️ 2026-08-15: eddig MINDEN eltérésre gyártottunk 301-et, és ezzel a
      // _redirects 1755 sorra hízott (a 2100-as Cloudflare-plafon 83%-a), napi
      // +22 sorral. A sorok ~85%-a téma-azonosítóra mutatott (`ai-cover-letter`)
      // vagy csonkolt fájlnévre (`...using-alibaba-`) — olyan címekre, amiket
      // a régi, CÍMBŐL képző séma elő sem tudott állítani. Részletes indoklás
      // és a Search Console-os megerősítés: core/legacy-urls.js.
      // ⚠️ Az EREDETI cím kell (`original_title`), NEM a `meta.title`: azt a
      // minőségi körök átírják, és a mostani címmel mérve 0 találat jön ki —
      // vagyis kidobnánk 18 VALÓDI 301-et. Lásd core/legacy-urls.js.
      const bornSlug = file.replace(/^ARTICLE_(GUIDE_)?/, '').replace(/\.json$/, '');
      const legacy = legacyRedirect({ bornSlug, slug, originalTitle: data.original_title });
      if (legacy) RENAMED_SLUGS.set(legacy.from, legacy.to);

      // Van valódi kép a slug-hoz? (Designer agent generálta)
      const imgFile = ['jpg', 'png', 'jpeg', 'webp'].map(ext => `${slug}.${ext}`)
        .find(name => existsSync(join(ASSETS_SRC, 'images', name)));

      // HETI ÖSSZEFOGLALÓ KABALA (2026-07-26): a weekly-digest cikkek FIX borítója
      // a cég arca (mascot-weekly.jpg), nem az automata-generált kép. A slug hetente
      // változik (dátumos cím), ezért a tag alapján irányítunk rá, nem slug szerint.
      const isWeeklyDigest = (meta.tags || []).includes('weekly-digest');
      const mascotCover = existsSync(join(ASSETS_SRC, 'images', 'mascot-weekly.jpg')) ? 'mascot-weekly.jpg' : null;

      articles.push({
        slug,
        file,
        guideTopicId: data._meta?.guide_topic_id || null,
        relatedGuideTopic: data._meta?.related_guide_topic || null,
        sourceNews: data._meta?.source_news || null,
        image: (isWeeklyDigest && mascotCover) ? mascotCover : (imgFile || null),
        title: meta.title || data.original_title || 'Untitled',
        subtitle: meta.subtitle || '',
        category: meta.category || 'other',
        audience: ['personal', 'business', 'both'].includes(meta.audience) ? meta.audience : 'both',
        readTime: meta.read_time_minutes || 3,
        tags: meta.tags || [],
        seoDescription: data._meta?.seo?.description || meta.subtitle || '',
        seoKeywords: (data._meta?.seo?.keywords || meta.tags || []).join(', '),
        bodyHtml: wrapTables(wrapInShort(wrapImpactSection(stripLeadH1(marked.parse(body))))),
        bodyMd: body,
        isGuide: (data._meta?.type === 'guide') || meta.category === 'guide',
        // Frontmatter az elsődleges (az író VÉGSŐ eszköz-választása), a _meta
        // (a párosító terve) csak tartalék; a canonicalChip a cégnév-előtagot
        // kódból vágja le (2026-07-13: "NVIDIA ChatRTX" átcsúszott a prompton).
        company: meta.company || data._meta?.company || '',
        tool: canonicalChip(meta.tool || data._meta?.tool || '', meta.company || data._meta?.company || ''),
        level: data._meta?.level || '',
        icon: data._meta?.icon || '',
        publishedAt: data._meta?.published_at || '',
        // VALÓDI módosítás-dátum (2026-08-01, kereső-barátság átvilágítás).
        // Eddig a dateModified = datePublished volt, vagyis a Google szerint
        // egyetlen cikkünk sem frissült SOHA — pedig a felújító (upgrade-howtos)
        // és a tény-ellenőrző rendszeresen újraírja őket. A frissesség a
        // rangsorolás egyik jelzése; a saját munkánkat titkoltuk el vele.
        modifiedAt: [data._meta?.published_at, data._meta?.howto_upgraded_at, data._meta?.fact_checked_at]
          .filter(Boolean).sort().pop() || data._meta?.published_at || '',
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
// ===================================================================
// MORZSAMENÜ (BreadcrumbList) — 2026-07-29
// ===================================================================
// MIÉRT: a Google a találati listában a csupasz URL helyett tagolt útvonalat
// mutat, ha megkapja ezt a jelölést:
//     aiworldhq.com › Útmutatók › ChatGPT…    helyett a hosszú nyers cím
// Ugyanannyi megjelenésből több kattintás — és a Google is jobban érti a
// szerkezetünket (mi tartozik hova), ami a fiatal domain indexelésénél számít.
//
// SZINTEK: Főoldal › Hírek (/archive) vagy Útmutatók (/guides) › a cikk címe.
// A középső szint LÉTEZŐ oldalra mutat — kitalált URL-t itt sem hirdetünk
// (ugyanaz az elv, mint a hitelesség-kapunál).
//
// NYELVHELYES: a nevek a nyelvi szótárból jönnek (tr), az URL-ek a nyelvi
// előtaggal (LP) — így a magyar oldalon "Főoldal › Útmutatók › …" lesz.
function breadcrumbSchema(a, canonical) {
  const listPath = a.isGuide ? `${LP}/guides` : `${LP}/archive`;
  const listName = a.isGuide ? tr('guides') : tr('news');
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: tr('home') || SITE.name, item: `${SITE.url}${LP}/` },
      { '@type': 'ListItem', position: 2, name: listName, item: `${SITE.url}${listPath}` },
      { '@type': 'ListItem', position: 3, name: a.title, item: canonical }
    ]
  };
}

// ===================================================================
// KAPCSOLÓDÓ CIKKEK (2026-07-07) — cikk alji "olvass tovább" ajánló.
// Rokonság: azonos cég (+3), közös címke (+1/db), azonos kategória (+1).
// EN-metaadatokból számoljuk EGYSZER; a címek renderkor lokalizálódnak.
// ===================================================================
let RELATED = new Map();
// A rangsorolás a core/related.js-ben él, tesztelve. Régen itt, helyben, a
// CÍMKE-ÁTFEDÉST pontoztuk — és élesben egy deepfake-csalásokról szóló cikk alá
// hétvégi autós utat és szülinapi ajándékötleteket tett, mert a két rokon cikk
// EGYETLEN címkén sem osztozott. Az indoklás és a mérés a modul fejlécében.
function buildRelated(articles) {
  RELATED = rankRelated(articles);
}
function relatedBox(a) {
  const rel = RELATED.get(a.file) || [];
  if (!rel.length) return '';
  const items = rel.map(r => {
    const lr = localizeArticle(r, LANG);
    return `<a class="rel__item" href="${r.slug}">
      <span class="rel__ico">${r.isGuide ? '📘' : '📰'}</span>
      <span><span class="rel__t">${escapeHtml(lr.title)}</span>
      ${lr.subtitle ? `<span class="rel__s">${escapeHtml(lr.subtitle)}</span>` : ''}</span></a>`;
  }).join('');
  return `<section class="rel"><h2 class="rel__h">${tr('relatedTitle')}</h2><div class="rel__grid">${items}</div></section>`;
}

// ===================================================================
// BEÉKELT TOVÁBBVEZETÉS (2026-08-03) — a user: "miért nem olvasnak tovább"
// ===================================================================
// A MÉRÉS, ami kiváltotta: a hétvégén 42 amerikai látogató 43 oldalt nézett
// meg (1,02 oldal/fő), és a Cloudflare szerint NULLA belső átkattintás volt
// (refererHost aiworldhq.com = 0). Az ok nem az volt, hogy nincs ajánlónk —
// van "Keep reading" blokk 6 cikkel, élő linkekkel. Az ok a HELYE:
//   • a cikk törzse ~1400 szó (≈6 perc olvasás),
//   • a törzsben NULLA link mutat másik cikkünkre (csak szótár-szavak),
//   • az első ajánlat a HTML 79%-ánál kezdődik.
// Aki félúton abbahagyja — a Facebookról érkező mobilos olvasó tipikusan ott
// hagyja abba — SOHA nem lát egyetlen továbbvezetést sem.
//
// Ez a doboz a szöveg KÖZEPÉN kínál EGY továbblépést. Szándékosan egyet:
// a törzsbe ékelt hirdetés-szerű blokk-lista rontaná az olvasást.
// SZEKCIÓ-HATÁRRA kerül (h2 elé), hogy ne vágjon ketté egy gondolatot.
const MIDREAD_MIN_WORDS = 600;   // rövid cikket nem szakítunk meg

function midReadBox(a) {
  const rel = RELATED.get(a.file) || [];
  if (!rel.length) return '';
  const r = rel[0];                       // a legerősebb kapcsolat
  const lr = localizeArticle(r, LANG);
  return `<aside class="midread"><span class="midread__lbl">${r.isGuide ? '📘' : '📰'} ${tr('midRead')}</span>`
    + `<a class="midread__link" href="${r.slug}">${escapeHtml(lr.title)}<span class="midread__arrow">→</span></a></aside>`;
}

// A törzs felénél lévő SZEKCIÓ-HATÁRRA szúrja be a dobozt.
// Ha nincs alkalmas h2 (rövid vagy tagolatlan cikk), NEM szúr be semmit —
// jobb kihagyni, mint a mondat közepén megtörni a szöveget.
function withMidRead(bodyHtml, a) {
  const box = midReadBox(a);
  if (!box || !bodyHtml) return bodyHtml;
  const plain = bodyHtml.replace(/<[^>]+>/g, ' ');
  if (plain.split(/\s+/).filter(Boolean).length < MIDREAD_MIN_WORDS) return bodyHtml;

  const heads = [...bodyHtml.matchAll(/<h2\b/gi)].map(m => m.index);
  if (heads.length < 2) return bodyHtml;
  // Az ELSŐ h2-t kihagyjuk (túl korán jönne), az utolsót is (túl közel a
  // végi ajánlóhoz — ott már úgyis ott a "Keep reading").
  const usable = heads.slice(1, -1);
  if (!usable.length) return bodyHtml;

  // A felezőpontot a LÁTHATÓ SZÖVEG szerint keressük, NEM a HTML hossza
  // szerint. A tagek sűrűsége szakaszonként eltér (táblázat, kép, idézet),
  // ezért a HTML-felezés rendszeresen későbbre csúszik — az első változat
  // mediánja így 64% lett 50% helyett, vagyis a doboz épp azoknak maradt
  // láthatatlan, akiknek szól.
  const wordsUpTo = i => bodyHtml.slice(0, i).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const half = wordsUpTo(bodyHtml.length) / 2;
  const at = usable.reduce((best, i) =>
    Math.abs(wordsUpTo(i) - half) < Math.abs(wordsUpTo(best) - half) ? i : best, usable[0]);
  return bodyHtml.slice(0, at) + box + bodyHtml.slice(at);
}

function xrefBox(a) {
  if (a.isGuide) {
    // útmutató → forrás-hír (a hivatkozott cikk CÍME is az aktuális nyelven!)
    const news = a.sourceNews?.file ? XREF.newsByFile.get(a.sourceNews.file) : null;
    if (!news) return '';
    const locNews = localizeArticle(news, LANG);
    return `<aside class="xref xref--news"><span class="xref__lbl">📰 ${tr('xrefNews')}</span>
      <a class="xref__link" href="${news.slug}"><span class="xref__t">${escapeHtml(locNews.title)}</span><span class="xref__arrow">→</span></a></aside>`;
  }
  // hír → kapcsolódó útmutató (fordított címmel)
  const guide = a.relatedGuideTopic ? XREF.guideByTopic.get(a.relatedGuideTopic) : null;
  if (!guide) return '';
  const locGuide = localizeArticle(guide, LANG);
  return `<aside class="xref xref--guide"><span class="xref__lbl">📘 ${tr('xrefGuide')}</span>
    <a class="xref__link" href="${guide.slug}"><span class="xref__t">${escapeHtml(locGuide.title)}</span><span class="xref__arrow">→</span></a></aside>`;
}

// ===================================================================
// HTML SABLONOK
// ===================================================================

// ===================================================================
// KÉPMÉRET A VALÓDI FÁJLBÓL (2026-07-29)
// ===================================================================
// Az og:image:width/height eddig FIXEN 1000×563 volt beégetve. Amint a
// képgyártó mérete megváltozik (most épp 1200-ra megy a Google Discover
// miatt), ez NÉMÁN hazudott volna a keresőknek és a közösségi felületeknek
// — pontosan az a hibafajta, ami hónapokig rejtve marad, mert "működik".
//
// Ezért a méretet a FÁJLBÓL olvassuk ki. A sharp csak aszinkron tud, a
// build viszont szinkron, ezért a fejlécet magunk fejtjük vissza: JPEG-nél
// az SOF-szegmensből, PNG-nél az IHDR-ből. Ez néhány bájt olvasása
// képenként, gyorsítótárazva — mérhetetlen költség.
const IMG_DIM_CACHE = new Map();
function imageDims(absUrl) {
  const rel = String(absUrl || '').replace(SITE.url, '');
  if (!rel.startsWith('/assets/')) return null;
  if (IMG_DIM_CACHE.has(rel)) return IMG_DIM_CACHE.get(rel);

  let dim = null;
  try {
    const buf = readFileSync(join(__dirname, rel.replace(/^\/assets\//, 'assets/')));
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      // JPEG: végigugrálunk a szegmenseken az első SOF-ig (ott a méret)
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xFF) { i++; continue; }
        const m = buf[i + 1];
        // SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15 = képméret-szegmensek
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
          dim = { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
          break;
        }
        i += 2 + buf.readUInt16BE(i + 2);      // ugrás a következő szegmensre
      }
    } else if (buf.readUInt32BE(0) === 0x89504E47) {
      dim = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };   // PNG IHDR
    }
  } catch { /* nincs meg a fájl — kihagyjuk a méret-címkéket */ }

  IMG_DIM_CACHE.set(rel, dim);
  return dim;
}

// ── CÍM A MÁRKANÉVVEL, HA VAN RÁ HELY (2026-08-01) ──────────────────
// A Google a találati címet ~60 karakternél elvágja. Nálunk MINDEN cikkcím
// megkapta a " — AI WORLD HQ" toldalékot (14 karakter), és élőben mérve
// 24/24 cikk címe túllógott: az átlag 77 karakter volt, vagyis a vágás nem
// a márkanevet nyeste le, hanem a CÍM VÉGÉT, gyakran szó közepén.
//
// MÉRÉS 580 cikken: márkanév nélkül a címek 43%-a fér ki teljesen, vele
// csak 15%. A toldalék elhagyása tehát majdnem megháromszorozza a teljesen
// látható címeket — a márka pedig nem vész el, mert a Google a találat
// fölött amúgy is kiírja a domaint.
//
// SZÁNDÉKOSAN NEM mindig hagyjuk el: ahol a cím rövid, ott a márkanév
// ingyen van és segít a felismerésben. Csak ott esik ki, ahol ára lenne.
const SERP_TITLE_MAX = 60;
function withBrand(title) {
  const full = `${title} — ${SITE.name}`;
  return full.length <= SERP_TITLE_MAX ? full : title;
}

function pageShell({ title, description, bodyContent, isArticle = false, noIntro = false, ogImage = '', keywords = '', jsonld = null, pagePath = '', articleMeta = null }) {
  // ABSZOLÚT útvonalak (gyökértől) — így a /hu/article/... mélységnél is jók.
  const homePath = `${LP}/`;
  const supportPath = `${LP}/support`;
  const guidesPath = `${LP}/guides`;
  const startPath = `${LP}/start`;
  const toolsPath = `${LP}/tools`;
  const glossaryPath = `${LP}/glossary`;
  const aboutPath = `${LP}/about`;
  const archivePath = `${LP}/archive`;
  const year = new Date().getFullYear();
  const cp = canonicalPath(pagePath);
  const url = `${SITE.url}${LP}${cp}`;
  // Tartalék megosztás-kép: JPG kell (az SVG-t a Facebook nem jeleníti meg!)
  const img = ogImage || (SITE.url + '/assets/og-default.jpg');
  // hreflang + nyelvváltó (minden oldalnak ugyanaz a pagePath-ja minden nyelven)
  const hreflang = SITE_LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${SITE.url}${langPrefix(l)}${cp}">`).join('\n  ')
    + `\n  <link rel="alternate" hreflang="x-default" href="${SITE.url}${cp}">`;
  const langSwitcher = `<select class="lang-select" onchange="if(this.value)location.href=this.value" aria-label="${T.language}" style="background-color:var(--card);color:var(--ink);border:1px solid var(--line-strong);border-radius:8px;font:inherit;font-size:13px;padding:7px 6px;cursor:pointer;color-scheme:light dark">
        ${SITE_LANGS.map(l => `<option value="${SITE.url}${langPrefix(l)}${cp}" ${l === LANG ? 'selected' : ''} style="background-color:var(--card);color:var(--ink)">${LANG_NAME[l]}</option>`).join('')}
      </select>`;
  // OpenGraph cikk-meták (2026-07-23, Google News/aggregátor-felkészítés): a
  // publikálás/módosítás ideje + rovat. A dátum a NewsArticle JSON-LD-ben már
  // benne van; ez a hír-aggregátoroknak és közösségi felületeknek is szól.
  const artMetaTags = (isArticle && articleMeta) ? [
    articleMeta.published ? `<meta property="article:published_time" content="${escapeHtml(articleMeta.published)}">` : '',
    articleMeta.modified ? `<meta property="article:modified_time" content="${escapeHtml(articleMeta.modified)}">` : '',
    articleMeta.section ? `<meta property="article:section" content="${escapeHtml(articleMeta.section)}">` : ''
  ].filter(Boolean).join('\n  ') : '';

  // AOS (Animate On Scroll) KIVÉVE — 2026-08-05.
  // A scroll-animáció díszítés volt, de az ára a teljes tartalom lehetett:
  // az aos.css a [data-aos^=fade] és [data-aos^=zoom] elemeket opacity:0-ra
  // tette, és KIZÁRÓLAG az aos.js tette őket láthatóvá (.aos-animate osztály).
  // Ha az a 15 KB nem tölt be — lassú mobilháló, Facebook in-app böngésző,
  // JS-hiba —, a főoldal MIND A 40 kártyája láthatatlan maradt. Fejetlen
  // böngészővel igazolva: a "COVER STORY" felirat alatt üres oldal.
  // A forgalom 82%-a mobil, nagyrészt a Facebook alkalmazásból.
  // A sebesség-nyereséget NEM sikerült kimérni (a helyi Lighthouse szórása
  // ±20 pont volt, nagyobb mint a keresett hatás) — a döntés a KOCKÁZATON
  // múlt, nem a sebességen.
  return `<!DOCTYPE html>
<html lang="${HTML_LANG[LANG] || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
  <link rel="canonical" href="${escapeHtml(url)}">
  <!-- GOOGLE DISCOVER (2026-07-29): a Discover az a hírfolyam, ami magától
       tolja ki a cikkeket a telefonokra — nem a keresési helyezésen múlik.
       KÉT feltétele van, és eddig EGYIK sem teljesült nálunk:
         1) ez a jelzés (max-image-preview:large) — enélkül a Google csak
            bélyegképet mutathat, és a Discover ki sem próbál minket;
         2) legalább 1200 px széles kép (lásd agents/designer/agent.js).
       A max-snippet:-1 és max-video-preview:-1 ugyanennek a családja: nem
       korlátozzuk, mennyit mutathat belőlünk. Ez NEM noindex — indexelést
       nem tilt, csak a megjelenítési korlátokat oldja fel. -->
  <meta name="robots" content="max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  ${hreflang}
  <!-- Open Graph (közösségi megosztás) -->
  <meta property="og:type" content="${isArticle ? 'article' : 'website'}">
  <meta property="og:site_name" content="${SITE.name}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(img)}">
  ${(() => { const d = imageDims(img); return d ? `<meta property="og:image:width" content="${d.w}">\n  <meta property="og:image:height" content="${d.h}">` : ''; })()}
  <meta property="og:locale" content="${(HTML_LANG[LANG] || 'en').replace('-', '_')}">
  ${artMetaTags}
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(img)}">
  <!-- Betűtípusok saját kiszolgálásból: nincs külső DNS/kapcsolat -->
  <link rel="preload" href="/assets/fonts/schibsted-grotesk-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/hanken-grotesk-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/fonts.css?v=${ASSET_V}">
  <link rel="icon" type="image/svg+xml" href="/assets/logo.svg">
  <link rel="stylesheet" href="/assets/style.css?v=${ASSET_V}">
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE.name)} RSS" href="${LP}/feed.xml">
  ${VERIFY.google ? `<meta name="google-site-verification" content="${escapeHtml(VERIFY.google)}">` : ''}
  ${VERIFY.bing ? `<meta name="msvalidate.01" content="${escapeHtml(VERIFY.bing)}">` : ''}
  ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
  ${DESIGN.mobileCss ? `<style id="responsive">${DESIGN.mobileCss}</style>` : ''}
</head>
<body>
  ${isArticle ? '<div class="progress-bar" id="progressBar"></div>' : ''}
  <header class="navbar" id="navbar">
    <div class="navbar__inner">
      <a href="${homePath}" class="navbar__logo"><img src="/assets/logo.svg" alt="" class="navbar__mark">${SITE.name}<span class="navbar__dot">.</span></a>
      <nav class="navbar__nav" id="navMenu">
        <a href="${startPath}" class="nav--star">⭐ ${tr('startHere')}</a>
        <a href="${homePath}">${T.news}</a>
        <a href="${archivePath}">${tr('archNavS')}</a>
        <a href="${guidesPath}">${T.guides}</a>
        <a href="${toolsPath}">${T.tools}</a>
        <a href="${glossaryPath}">${tr('glossNav')}</a>
        <a href="${aboutPath}">${tr('aboutNav')}</a>
        ${SUPPORT.enabled ? `<a href="${supportPath}" class="navbar__support">${T.support}</a>` : ''}
      </nav>
      ${langSwitcher}
      <button class="search-toggle" id="searchToggle" aria-label="${tr('searchLabel')}" title="${tr('searchLabel')}">🔍</button>
      <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode" title="Light / dark">
        <span class="theme-toggle__icon">☾</span>
      </button>
      <button class="navbar__burger" id="navBurger" aria-label="Menu" aria-expanded="false" aria-controls="navMenu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>
  <div class="search-overlay" id="searchOverlay" hidden>
    <div class="search-box">
      <input id="searchInput" type="search" placeholder="${escapeHtml(tr('searchPh'))}" autocomplete="off" aria-label="${tr('searchLabel')}">
      <div id="searchResults" class="search-results" data-noresults="${escapeHtml(tr('noResults'))}"></div>
    </div>
  </div>${(isArticle || noIntro) ? '' : `
  <section class="intro">
    <div class="intro__inner">
      <p class="intro__kicker">${tr('heroKicker').replace('01', String(ISSUE_NO).padStart(2, '0'))} · ${formatDate(new Date().toISOString())}</p>
      <h1 class="intro__title">${T.heroTitle}</h1>
      <p class="intro__tagline">${tr('tagline')}</p>
    </div>
  </section>`}
  <main class="wrap">
    ${bodyContent}
  </main>
  <footer class="site-footer">
    <div class="wrap">
      <p class="site-footer__brand">${SITE.name}<span class="masthead__dot">.</span></p>
      <p class="site-footer__note">${escapeHtml(tr('siteDesc') || SITE.description)}</p>
      <p class="site-footer__support"><a href="${LP}/about">${tr('aboutNav')}</a></p>
      ${SUPPORT.enabled ? `<p class="site-footer__support"><a href="${supportPath}">${T.support}</a></p>` : ''}
      <p class="site-footer__support"><a href="${LP}/feed.xml" title="RSS">📡 RSS</a></p>
      <p class="site-footer__socialt">${escapeHtml(FOLLOW[LANG] || FOLLOW.en)}</p>
      <p class="site-footer__social">
        <a href="${FB_URL}" target="_blank" rel="noopener me" title="Facebook" aria-label="Facebook"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="${ICON.fb}"/></svg></a>
        <a href="${IG_URL}" target="_blank" rel="noopener me" title="Instagram" aria-label="Instagram"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="${ICON.ig}"/></svg></a>
        <a href="${TH_URL}" target="_blank" rel="noopener me" title="Threads" aria-label="Threads"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="${ICON.th}"/></svg></a>
      </p>
      <p class="site-footer__fine">${T.footerNote} · © ${year} AI World HQ</p>
    </div>
  </footer>
  ${CS.enabled ? `<button id="cs-fab" class="cs-fab" aria-label="${escapeHtml(tr('csOpen'))}">💬<span class="cs-fab__t">${escapeHtml(tr('csOpen'))}</span></button>
  <script>window.__csCfg={base:'${CS.base}',key:'${CS.key}',lang:'${LANG}',ui:${JSON.stringify({ title: tr('csTitle'), hello: tr('csHello'), ph: tr('csPlaceholder'), send: tr('csSend'), human: tr('csHuman'), formT: tr('csFormT'), name: tr('csName'), email: tr('csEmail'), msg: tr('csMsg'), submit: tr('csSubmit'), ok: tr('csOk'), err: tr('csErr'), privacy: tr('csPrivacy'), thinking: tr('csThinking') }).replace(/</g, '\\u003c')}};</script>
  <script defer src="/assets/chat.js?v=${ASSET_V}"></script>` : ''}
  <script src="/assets/app.js?v=${ASSET_V}"></script>
  ${CF_BEACON ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${CF_BEACON}"}'></script>` : ''}
</body>
</html>`;
}

// Borító: valódi kép (ha van), különben lágy gradiens borító kategória-ikonnal
function coverHtml(a, pathPrefix, cls, eager = false) {
  const cat = CATEGORIES[a.category] || CATEGORIES.other;
  if (a.image) {
    // eager = a lap legnagyobb képe (címlap-sztori / cikk-borító): azonnali,
    // magas prioritású betöltés (LCP / Core Web Vitals, 2026-07-10)
    const load = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
    return `<div class="${cls}"><img src="/assets/images/${a.image}" alt="${escapeHtml(a.title)}" ${load} decoding="async" width="1000" height="563"></div>`;
  }
  return `<div class="${cls} cover--gen ${cat.cls}"><span class="cover__icon">${cat.icon}</span></div>`;
}

function articleCard(a, featured = false) {
  const cat = CATEGORIES[a.category] || CATEGORIES.other;
  const aud = AUDIENCES[a.audience] || AUDIENCES.both;
  const cls = featured ? 'card card--featured' : 'card';
  return `<article class="${cls}" data-audience="${a.audience}" data-category="${a.category}">
    <a href="article/${a.slug}" class="card__link">
      ${coverHtml(a, '', 'card__cover', featured)}
      <div class="card__meta">
        <span class="aud ${aud.cls}">${aud.icon} ${tr(aud.key)}</span>
        <span class="card__read">${a.readTime} ${tr('minRead')}</span>
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
      <h1 class="empty__title">${tr('noStories')}</h1>
      <p>${tr('noStoriesNote')}</p>
    </div>`;
    return pageShell({ title: `${SITE.name} — ${tr('tagline')}`, description: SITE.description, bodyContent: empty, pagePath: '' });
  }

  // 7 NAPOS ABLAK: a főoldal az elmúlt 7 nap híreit mutatja, napokra bontva.
  // A régebbiek lekerülnek a főoldalról (de a saját oldaluk + sitemap megmarad).
  const DAY = 86400000;
  const cutoff = Date.now() - 7 * DAY;

  // HETI ÖSSZEFOGLALÓ (2026-07-26): a legfrissebb weekly-digest MINDIG kiemelve
  // marad a főoldalon (a 7 napos ablaktól függetlenül), amíg a következő le nem
  // váltja — különben a heti recap egy hét után eltűnne a főoldalról (a user
  // panasza: "nem látom a híreknél az összefoglalót").
  const weeklyPin = articles
    .filter(a => (a.tags || []).includes('weekly-digest'))
    .sort((x, y) => (y.publishedAt || '').localeCompare(x.publishedAt || ''))[0] || null;

  let recent = articles.filter(a => {
    if (weeklyPin && a.slug === weeklyPin.slug) return false;   // a kiemelt digest ne duplázódjon a listában
    const t = new Date(a.publishedAt).getTime(); return t && t >= cutoff;
  });
  if (recent.length === 0) recent = articles.slice(0, 6);   // ne legyen üres nyugodt héten

  const [featured, ...rest] = recent;
  const featuredHtml = `<section class="hero">
    <span class="pill">${tr('coverStory')}</span>
    ${articleCard(featured, true)}
  </section>`;

  // TISZTA CSS szűrő (JS NÉLKÜL is működik): rejtett rádiók + címkék. A rádiók a
  // #newsfeed TESTVÉREI, így a CSS ~ szelektorral tudja rejteni a nem illő kártyákat.
  const chipsHtml = rest.length > 1 ? `<input type="radio" name="audflt" id="flt-all" class="flt-radio" checked>
    <input type="radio" name="audflt" id="flt-personal" class="flt-radio">
    <input type="radio" name="audflt" id="flt-business" class="flt-radio">
    <div class="filters" id="filters">
      <label class="chip" for="flt-all">${tr('all')}</label>
      <label class="chip" for="flt-personal">${tr('personal')}</label>
      <label class="chip" for="flt-business">${tr('business')}</label>
    </div>` : '';

  // Napokra bontás (legújabb nap elöl) — "Ma" / "Tegnap" / dátum fejlécekkel
  const todayKey = new Date().toISOString().slice(0, 10);
  const yKey = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  const dayLabel = (key) => key === todayKey ? tr('today') : (key === yKey ? tr('yesterday') : formatDate(key + 'T12:00:00Z'));
  const byDay = new Map();
  for (const a of rest) {
    const key = (a.publishedAt || '').slice(0, 10) || todayKey;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(a);
  }
  const dayGroups = [...byDay.entries()].map(([key, items]) => `<section class="day-group">
      <h3 class="day-head">${dayLabel(key)}</h3>
      <div class="grid">${items.map(a => articleCard(a)).join('\n')}</div>
    </section>`).join('\n');

  const grid = rest.length > 0 ? `<section class="grid-section">
    <div class="section-head">
      <span class="pill">${tr('edit')}</span>
      <h2 class="section-title">${tr('past7')}</h2>
    </div>
    ${chipsHtml}
    <div id="newsfeed">
      ${dayGroups}
    </div>
  </section>` : '';

  const guidesCta = `<a class="guides-cta" href="guides">
    <span class="guides-cta__i">📘</span>
    <span class="guides-cta__t"><strong>${tr('ctaTitle')}</strong><br>${tr('ctaText')}</span>
    <span class="guides-cta__arrow">→</span></a>`;

  // Kiemelt HETI ÖSSZEFOGLALÓ blokk (a kabalával) — a hero UTÁN, mindig látszik.
  const WEEKLY_LABEL = { en: 'This week in AI', hu: 'A hét összefoglalója', es: 'Esta semana en IA' };
  const weeklyHtml = weeklyPin ? `<section class="grid-section weekly-pin">
    <div class="section-head">
      <span class="pill">📅 ${escapeHtml(WEEKLY_LABEL[LANG] || WEEKLY_LABEL.en)}</span>
    </div>
    <div class="grid">${articleCard(weeklyPin, true)}</div>
  </section>` : '';

  return pageShell({
    title: `${SITE.name} — ${tr('tagline')}`,
    // A siteDesc MINDEN nyelven le van fordítva (UI_SUPPORT) — a főoldal
    // mégis a SITE.description angol konstansát használta, így a magyar és
    // spanyol találatban angol mondat állt a magyar cím alatt. (2026-08-04)
    description: tr('siteDesc') || SITE.description,
    ogImage: articles[0]?.image ? `${SITE.url}/assets/images/${articles[0].image}` : '',
    jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: SITE.url, description: tr('siteDesc') || SITE.description },
    bodyContent: featuredHtml + weeklyHtml + guidesCta + grid
      + `<p class="start__wizcta"><a href="archive">🗂️ ${escapeHtml(tr('archNav'))} →</a></p>`,
    pagePath: ''
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
// HIVATALOS MÁRKAJEL (2026-07-18): a cégekhez letöltött egyszínű SVG-logót
// build-időben BEÁGYAZZUK (currentColor → a csempe márkaszínére fest); amelyik
// céghez nincs helyi logó (xAI, Cohere), ott az emoji-ikon marad. A logókat a
// core/fetch-brand-logos.js tölti (CC0 simple-icons, védjegyek a tulajdonosoké).
const LOGO_DIR = join(__dirname, 'assets', 'logos');
const _logoCache = {};
function companyLogoSvg(c) {
  if (!c) return null;
  if (c in _logoCache) return _logoCache[c];
  const p = join(LOGO_DIR, companySlug(c) + '.svg');
  let svg = null;
  try { if (existsSync(p)) svg = readFileSync(p, 'utf-8').trim(); } catch { /* nincs logó */ }
  _logoCache[c] = svg;
  return svg;
}
// Tiszta MONOGRAM azoknak a cégeknek, amelyeknek nincs közkincs márkajele
// (xAI, Cohere, egyedi kis cégek) — márkaszínű betűk, NEM emoji, így minden
// csempe egységesen "logó-szerű". A monogram BETŰ (nem logó-rajz), tehát nem
// reprodukál védett grafikát.
const MONOGRAM_OVERRIDE = { 'xAI': 'xAI', 'Cohere': 'co', 'Perplexity AI': 'Px', 'Genie': 'Ge', 'SkillOpt': 'So' };
function companyMonogram(c) {
  if (MONOGRAM_OVERRIDE[c]) return MONOGRAM_OVERRIDE[c];
  const t = String(c || '').trim();
  if (!t) return 'AI';
  if (t.length <= 3) return t;
  const parts = t.split(/[\s.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return t.slice(0, 2).replace(/^./, s => s.toUpperCase());
}
// A csempe/pill ikon-tartalma: hivatalos logó ha van, különben márkaszín-monogram.
function companyGlyph(c) {
  return companyLogoSvg(c) || `<span class="brandtile__mono">${escapeHtml(companyMonogram(c))}</span>`;
}

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
  let focal = a.tool || a.company || tr('aiSkills');
  // Hosszú angol leíró frázis (nem márkanév) ne maradjon a nem-angol borítón
  if (LANG !== 'en' && focal.length > 24) focal = tr('aiSkills');
  const sub = (a.company && a.tool) ? a.company : tr('coverSub');
  return `<div class="${cls} guide-cover" style="--gc:${color}">
    <span class="guide-cover__rings" aria-hidden="true"></span>
    <div class="guide-cover__inner">
      <span class="guide-cover__eyebrow">${tr('stepByStep')}</span>
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
  const level = a.level ? `<span class="gtile__lvl">${escapeHtml(tr('lvl_' + a.level) || a.level)}</span>` : '';
  // Csak RÖVID márkanév mehet a csempe fejlécébe — a hosszú leíró frázis
  // (pl. "AI-powered customer service assistants") minden nyelven csúnya/angol.
  let brand = a.tool || a.company || tr('forEveryone');
  if (brand.length > 24) brand = a.company || tr('forEveryone');
  return `<a class="gtile" href="article/${a.slug}" data-audience="${a.audience}" style="--gc:${color}">
    <span class="gtile__head">
      <span class="gtile__rings" aria-hidden="true"></span>
      <span class="gtile__chip">${guideIcon(a)}</span>
      <span class="gtile__brand">${escapeHtml(brand)}</span>
    </span>
    <span class="gtile__body">
      <span class="gtile__title">${escapeHtml(a.title)}</span>
      ${a.subtitle ? `<span class="gtile__sub">${escapeHtml(a.subtitle)}</span>` : ''}
      <span class="gtile__meta"><span class="gtile__aud">${aud.icon} ${tr(aud.key)}</span>${level}</span>
    </span>
  </a>`;
}

// ÁLTALÁNOS (mindennapi) útmutatók — guides.html
function buildGuidesPage(generalGuides, counts) {
  const tiles = generalGuides.length
    ? `<div class="gtiles">${generalGuides.map(guideTile).join('')}</div>`
    : `<p class="muted" style="color:var(--ink-soft)">${tr('comingSoon')}</p>`;
  const header = `<section class="guides-hero">
    <p class="intro__kicker">${tr('stepByStep')}</p>
    <h1 class="guides-hero__title">${tr('guidesTitle')}</h1>
    <p class="guides-hero__tag">${tr('guidesTag')}</p>
  </section>`;
  const body = designStyleBlock() + header + tiles;
  return pageShell({
    // LOKALIZÁLT CÍM + LEÍRÁS (2026-08-04): eddig beégetett ANGOL szöveg ment
    // ki a magyar és spanyol változatra is — a Google találatban a cím és az
    // alatta lévő mondat is angolul jelent meg. A H1 már fordítva volt, a
    // keresőnek szóló jelzések nem. Ugyanez a /tools-on és a főoldalon.
    title: `${plainText(tr('guidesTitle'))} — ${SITE.name}`,
    description: tr('guidesMetaDesc'),
    noIntro: true, pagePath: 'guides.html',
    jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: plainText(tr('guidesTitle')), url: `${SITE.url}/guides` },
    bodyContent: body
  });
}

// CÉGES (eszköz-specifikus) útmutatók — tools.html
function buildToolsPage(companyGuides, counts) {
  // Cég-alias: ugyanaz a cég két néven ne adjon két csempét (2026-07-18)
  const COMPANY_ALIAS = { 'Perplexity AI': 'Perplexity', 'Suno': 'Suno.ai' };
  const groups = {};
  for (const g of companyGuides) { const k = COMPANY_ALIAS[g.company] || g.company || 'Other'; (groups[k] = groups[k] || []).push(g); }
  const ORDER = ['OpenAI', 'Google', 'Anthropic', 'Microsoft', 'Meta', 'Perplexity', 'Alibaba', 'xAI', 'Mistral', 'DeepSeek', 'Amazon', 'Apple', 'Hugging Face', 'NVIDIA', 'GitHub', 'Cohere'];
  // ⚠️ USER-SZABÁLY (2026-08-17): ITT CSAK LLM-ASSZISZTENS LEHET. A szűrés
  // NEM itt történik, hanem a hívónál, ahol a /guides–/tools szétosztás egyben
  // eldől — különben KÉT hely döntene ugyanarról, és pont ebből lett a baj:
  // az első változat itt szűrt, a szétosztás nem tudott róla, és 17 útmutató
  // egyik oldalra sem került. Ide már csak asszisztens-cég érkezik.
  const companies = [...ORDER.filter(c => groups[c]), ...Object.keys(groups).filter(c => c && !ORDER.includes(c))];
  const cnt = n => `${n} ${n > 1 ? tr('guideWordMany') : tr('guideWordOne')}`;

  const brandTile = (c) => `<a class="brandtile" href="#c-${companySlug(c)}" style="--gc:${GUIDE_COVER_COLORS[c] || '#4f7a86'}">
      <span class="brandtile__i">${companyGlyph(c)}</span>
      <span class="brandtile__n">${escapeHtml(c)}</span><span class="brandtile__c">${cnt(groups[c].length)}</span></a>`;
  const brandRow = companies.length ? `<section class="brandpick">
      <p class="section-note">${tr('pickTool')}</p>
      <div class="brandtiles">${companies.map(brandTile).join('')}</div></section>` : '';
  // Hivatalos linkek a szekció fejléce alatt (2026-07-12): az adott cég
  // eszközeinek hivatalos oldalai; ÚJ eszköznél automatikusan a cég oldala.
  const officialRow = (c) => {
    // URL-DEDUP (2026-07-12, user: "van duplikát link"): ugyanarra a címre
    // csak EGY chip mehet — pl. Perplexity eszköz + Perplexity cég ugyanoda
    // mutat, vagy ChatGPT + GPT-5.6 mindkettő a chatgpt.com-ra.
    const seen = new Set();
    const chips = [];
    const norm = (u) => u.replace(/\/+$/, '').toLowerCase();
    for (const t of [...new Set(groups[c].map(g => g.tool).filter(Boolean))]) {
      const u = TOOL_LINKS[t];
      if (!u || seen.has(norm(u))) continue;
      seen.add(norm(u));
      chips.push(`<a href="${u}" target="_blank" rel="noopener">${escapeHtml(t)} ↗</a>`);
    }
    const cu = COMPANY_LINKS[c];
    if (cu && !seen.has(norm(cu))) chips.push(`<a href="${cu}" target="_blank" rel="noopener">${escapeHtml(c)} ↗</a>`);
    return chips.length ? `<p class="official-row"><span class="official-row__l">${tr('officialRow')}:</span> ${chips.join(' ')}</p>` : '';
  };
  // A cég-szekció H3 (2026-08-17): fölé fajta-fejléc (H2) került, és a
  // címsor-sorrend nem ugorhat H1 → H2 → H2. A stílus osztály-alapú
  // (.section-title), ezért a kinézet változatlan.
  const companySection = (c) => `<section class="grid-section" id="c-${companySlug(c)}">
      <div class="section-head"><span class="pill"><span class="pill__i">${companyGlyph(c)}</span> ${escapeHtml(c)}</span>
        <h3 class="section-title">${tr('companyGuides').replace('{c}', escapeHtml(c))}</h3>${officialRow(c)}</div>
      <div class="gtiles">${groups[c].map(guideTile).join('')}</div></section>`;

  // ===================================================================
  // FAJTA SZERINTI CSOPORTOSÍTÁS (2026-08-17, user: "az llm-nél nem lehet
  // csak llm modellek")
  // ===================================================================
  // Eddig a lap "Pick your assistant"-ot ígért, és a ChatGPT/Gemini/Claude
  // MELLETT hozta a Midjourney-t (képgenerátor) és a Hugging Face-t (tárhely).
  // A besorolás EGY helyen él: core/tool-kinds.js. Ismeretlen cég → `other`,
  // SOHA nem `assistant` — különben csendben visszajönne ugyanez a hiba.
  //
  // ⚠️ A `#c-<cégslug>` HORGONY NEM MOZDULHAT: a cikkeken belüli "hub" linkek
  // (`/tools#c-openai`, lásd guideLinkMap) és élő, megosztott URL-ek mutatnak
  // rá. Ezért a szekciók VÁLTOZATLANUL maradnak, csak ÁTRENDEZZÜK őket a
  // fajta-fejlécek alá — a horgony és a szekció tartalma ugyanaz.
  const KIND_LABEL_KEY = {
    [KINDS.ASSISTANT]: 'kindAssistant', [KINDS.IMAGE]: 'kindImage',
    [KINDS.DATA]: 'kindData', [KINDS.OTHER]: 'kindOther'
  };
  const byKind = new Map(KIND_ORDER.map(k => [k, []]));
  for (const c of companies) byKind.get(kindOf(c) || KINDS.OTHER).push(c);
  const kindBlock = (k) => {
    const list = byKind.get(k);
    if (!list.length) return '';
    return `<div class="kindgroup" id="k-${k}">
      <h2 class="kindgroup__t">${tr(KIND_LABEL_KEY[k])}</h2>
    </div>${list.map(companySection).join('')}`;
  };
  const sections = KIND_ORDER.map(kindBlock).join('');

  const header = `<section class="guides-hero">
    <p class="intro__kicker">${tr('stepByStep')}</p>
    <h1 class="guides-hero__title">${tr('toolsTitle')}</h1>
    <p class="guides-hero__tag">${tr('toolsTag')}</p>
  </section>`;
  const empty = `<p class="muted" style="color:var(--ink-soft)">${tr('comingSoon')}</p>`;
  const body = designStyleBlock() + header + (companyGuides.length ? (brandRow + sections) : empty);
  return pageShell({
    title: `${plainText(tr('toolsTitle'))} — ${SITE.name}`,
    description: tr('toolsMetaDesc'),
    noIntro: true, pagePath: 'tools.html',
    jsonld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: plainText(tr('toolsTitle')), url: `${SITE.url}/tools` },
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
    ${coverHtml(a, '../', 'article__cover', true)}
    <div class="article__head">
      <div class="article__badges">
        <span class="aud ${aud.cls}">${aud.icon} ${tr(aud.key)}</span>
        <span class="tag ${cat.cls}">${cat.label}</span>
      </div>
      <h1 class="article__title">${escapeHtml(a.title)}</h1>
      <p class="article__subtitle">${escapeHtml(a.subtitle)}</p>
      <div class="article__meta">
        <span>${a.readTime} ${tr('minRead')}</span>
        <span class="dot">·</span>
        <span>${formatDate(a.publishedAt)}</span>
      </div>
    </div>
    ${videoBlock(a)}
    <div class="article__body">
      ${withMidRead(guideAutolink(glossAutolink(a.bodyHtml, { linked: new Set(), count: 0 }), a), a)}
    </div>
    ${tagsHtml}
    ${xrefBox(a)}
    ${relatedBox(a)}
    <div class="article__foot">
      <div class="fb" data-slug="${a.slug}" data-thanks="${escapeHtml(tr('fbThanks'))}"><span class="fb__q">${tr('fbQ')}</span><button class="fb__btn" data-vote="up" aria-label="👍">👍</button><button class="fb__btn" data-vote="down" aria-label="👎">👎</button></div>
      <p class="ai-disclosure">${tr('disclosureNews')}</p>
      <a href="../index" class="back-link">${tr('backStories')}</a>
    </div>
  </article>`;

  const canonical = `${SITE.url}${LP}/article/${a.slug}`;
  const ogImage = a.image ? `${SITE.url}/assets/images/${a.image}` : '';
  // NewsArticle a híreknek (2026-07-14, Google News/Discover-felkészítés);
  // a szerző/kiadó az About-oldalra mutat (átlátható AI-szerkesztőség = E-E-A-T).
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'NewsArticle',
    headline: a.title, description: buildMetaDescription(a.seoDescription || a.subtitle, a.bodyMd),
    image: ogImage || undefined,
    datePublished: a.publishedAt || undefined,
    dateModified: a.modifiedAt || a.publishedAt || undefined,   // VALÓDI frissítés (2026-08-01)
    inLanguage: HTML_LANG[LANG] || 'en',
    author: { '@type': 'Organization', name: SITE.name, url: `${SITE.url}/about` },
    publisher: {
      '@type': 'Organization', name: SITE.name, url: SITE.url,
      logo: { '@type': 'ImageObject', url: `${SITE.url}/assets/logo.svg` }
    },
    mainEntityOfPage: canonical,
    keywords: a.seoKeywords || undefined
  };
  return pageShell({
    title: withBrand(a.title),
    description: buildMetaDescription(a.seoDescription || a.subtitle, a.bodyMd),
    keywords: a.seoKeywords,
    ogImage, jsonld: [jsonld, breadcrumbSchema(a, canonical)], pagePath: `article/${a.slug}`,
    bodyContent: body, isArticle: true,
    articleMeta: { published: a.publishedAt, modified: a.modifiedAt || a.publishedAt, section: cat.label }
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

// Többnyelvű kulcsszavak (hu/es/de/fr) — a fordított fejlécekhez is témára találjon
const STEP_ART_RULES_I18N = [
  [/hang\b|mikrofon|diktál|hangosan|\bvoz\b|dicta|aufnahme|sprich|diktier|parle|dicte/i, 'mic'],
  [/\bkép|fotó|\bimagen|\bfoto\b|\bbild|\bphoto/i, 'image'],
  [/keres|kutat|búsq|busca|\bsuch|recherch|cherch/i, 'search'],
  [/bizton|adatvéd|privát|magánél|segur|privacidad|datenschutz|sicher|sécur|confidentialité/i, 'shield'],
  [/beállít|testreszab|kapcsold|ajusta|einstell|paramèt|réglage|personnalis/i, 'sliders'],
  [/ments|mentsd|letölt|megoszt|guarda|descarg|comparte|speicher|herunterlad|\bteilen|enregistr|télécharg|partag/i, 'download'],
  [/küldd?\b|futtat|envía|enviar|\bsende|ausführ|envoy|lance/i, 'plane'],
  [/ellenőriz|finomít|javítsd|szerkeszt|átnéz|revisa|corrig|prüf|überprüf|verbesser|vérif|améliore|peaufine/i, 'check'],
  [/formáz|szerkezet|vázlat|sablon|listá|estructura|formato|plantilla|gliederung|vorlage|modèle/i, 'doc'],
  [/csevegés|beszélget|írd be|gépeld|írj\b|escribe|conversac|tippe|eingabe|converse|saisis|écris/i, 'chat'],
  [/fiók|belép|jelentkez|kulcs\b|cuenta|inicia sesión|anmeld|konto\b|connexion|compte|clé\b/i, 'login'],
  [/ötlet|\bidea|einfall|idée/i, 'bulb'],
  [/\bcél|objetivo|\bziel|objectif/i, 'target']
];

// Többnyelvű lépés-fejléc felismerő: "Step 1 —", "1. lépés —", "Paso 1", "Schritt 1", "Étape 1"
// (a lépés-dobozok, a folyamat-térkép, a stepsTotal ÉS a HowTo jsonld közös alapja)
const STEP_RX = /^(?:(?:step|paso|schritt|[ée]tape)\s*\d*|\d+\s*\.?\s*l[ée]p[ée]s)\s*[—:–.-]?\s*/i;

// A lépéshez tartozó illusztráció KULCSA (téma-egyeztetés + oldalon belüli dedup).
// Determinisztikus: azonos cím-sorozatra azonos kulcs-sorozat → a folyamat-térkép
// és a lépés-dobozok ikonjai garantáltan egyeznek.
function stepArtKey(title, idx, used) {
  const t = title || '';
  let key = null;
  for (const [re, k] of STEP_ART_RULES) { if (re.test(t)) { key = k; break; } }
  if (!key) for (const [re, k] of STEP_ART_RULES_I18N) { if (re.test(t)) { key = k; break; } }
  if (!key) key = STEP_ART_CYCLE[idx % STEP_ART_CYCLE.length];
  // OLDALON BELÜLI DEDUP: ugyanaz az illusztráció ne ismétlődjön (zavaró volt)
  if (used) {
    if (used.has(key)) {
      const free = STEP_ART_CYCLE.find(k => !used.has(k));
      if (free) key = free;
    }
    used.add(key);
  }
  return key;
}

function stepArtHtml(key) {
  // Színes 3D illusztráció (a borítók stílusában) — ha létezik; különben SVG tartalék
  if (existsSync(join(__dirname, 'assets', 'art', key + '.jpg')))
    return `<div class="g-step__art"><img class="g-art__img" src="/assets/art/${key}.jpg" alt="" loading="lazy" decoding="async" width="640" height="480"></div>`;
  return `<div class="g-step__art">${GUIDE_ART[key] || GUIDE_ART.target}</div>`;
}

// FOLYAMAT-TÉRKÉP az útmutató tetejére (user-ötlet 2026-07-04): számozott,
// kattintható csomópontok a lépések 3D ikonjaival — a lépés-listából SZÁRMAZIK,
// ezért sosem avul el, és minden nyelven magától jó.
function guideMapHtml(headings, artKeys) {
  if (headings.length < 3) return '';   // 1-2 lépésnél nincs értelme térképnek
  const nodes = headings.map((h, i) => {
    const key = artKeys[i];
    const img = existsSync(join(__dirname, 'assets', 'art', key + '.jpg'))
      ? `<img class="g-map__img" src="/assets/art/${key}.jpg" alt="" loading="lazy" decoding="async" width="124" height="124">`
      : `<span class="g-map__img g-map__img--f" aria-hidden="true">${i + 1}</span>`;
    let label = h;
    if (label.length > 34) label = label.slice(0, 31).trimEnd() + '…';
    return `<a class="g-map__node" href="#step-${i + 1}">
      <span class="g-map__badge">${i + 1}</span>${img}
      <span class="g-map__lbl">${escapeHtml(label)}</span></a>`;
  }).join('<span class="g-map__arr" aria-hidden="true">➜</span>');
  return `<nav class="g-map" aria-label="${escapeHtml(tr('mapTitle'))}">
    <div class="g-map__head"><span class="g-map__kicker">🗺️ ${tr('mapTitle')}</span><span class="g-map__count">${headings.length} ${tr('mapSteps')}</span></div>
    <div class="g-map__row">${nodes}</div></nav>`;
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
// Lépés-CÍMSOR: inline markdown (link, félkövér) → HTML. (2026-07-21 audit-lelet:
// a címsor eddig csak escapeHtml volt, így a "[Hugging Face](https://…)" nyersen
// látszott az olvasónak 6 oldalon.) A parseInline nem csinál blokk-szintű <p>-t.
function inlineHeadingHtml(s) {
  return marked.parseInline(String(s || ''));
}
// Ugyanaz TISZTA SZÖVEGKÉNT a JSON-LD HowToStep.name-hez (ott nem lehet HTML/markdown):
// [szöveg](url) → szöveg, **x** → x, `x` → x.
function stripInlineMd(s) {
  return String(s || '')
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();
}

function guideSectionHtml(bodyMd) {
  // Fölösleges ön-hivatkozó markdown-link [X](X) → X (2026-07-21 audit): a modell
  // néha "[https://x](https://x)" alakot ír, ami a példa-dobozban nyersen látszott.
  // CSAK a szöveg==cím esetet vonjuk össze — a normál [szöveg](url) linket nem bántja.
  bodyMd = String(bodyMd || '').replace(/\[([^\]]+)\]\(\1\)/g, '$1');
  // a 💬-vel kezdődő sorokat markdown ELŐTT blokk-szintű dobozzá alakítjuk
  // (0) 💬 címke + KÖZVETLEN kódblokk → TÖBBSOROS példa-doboz (2026-07-16,
  // user-lelet: a ```text jelölő szó szerint látszott a dobozban 152 oldalon —
  // az (1) szabály a kerítés-sort ragasztotta a címkéhez, és a pár nélkül
  // maradt záró ``` a doboz utáni szöveget kódblokká nyelte)
  let pre = (bodyMd || '').replace(
    /^[ \t>]*💬[ \t]*(?:\*\*[^*\n]{1,40}\*\*[ \t]*:?[ \t]*|(?:example|p[ée]lda(?:[ \t]*prompt)?|ejemplo|beispiel|exemple)[ \t]*:?[ \t]*)?[ \t]*\n+[ \t]*```[^\n]*\n([\s\S]*?)\n[ \t]*```[ \t]*$/gmi,
    (m, body) => {
      // behúzott kerítés-tartalom (van író, aki 4 szóközzel tolja) → kihúzzuk
      body = body.replace(/^[ \t]{1,8}/gm, '');
      const isPrompt = /^[„“"'«‘]/.test(body.trim());
      const lbl = isPrompt ? tr('tryTyping') : tr('exampleLabel');
      const send = isPrompt ? '<span class="g-prompt__send">➤</span>' : '';
      const content = escapeHtml(body).replace(/\n/g, '<br>');
      return '\n\n<div class="g-prompt"><span class="g-prompt__lbl">💬 ' + lbl + '</span><span class="g-prompt__box">' + content + send + '</span></div>\n\n';
    });
  // (1) csak-címke 💬 sor ("💬 **Példa prompt:**") → fűzzük hozzá a következő
  // sort (kód-kerítést SOHA — azt a (0) kezeli)
  pre = pre.replace(/^([ \t>]*💬[^\n]*:\*{0,2})[ \t]*\n+[ \t]*(?=[^\s`])/gm, '$1 ');
  // (2) többnyelvű címke leszedése (Example/Példa/Ejemplo/Beispiel/Exemple, félkövérrel is)
  pre = pre.replace(/^[ \t>]*💬[ \t]*(?:\*\*[^*\n]{1,40}\*\*[ \t]*:?[ \t]*|(?:example|p[ée]lda(?:[ \t]*prompt)?|ejemplo|beispiel|exemple)[ \t]*:?[ \t]*)?(.+)$/gmi,
    (m, txt) => {
      // Idézőjellel kezdődik = tényleg beírandó prompt; különben csak példa-leírás
      const isPrompt = /^[„“"'«‘]/.test(txt.trim());
      const lbl = isPrompt ? tr('tryTyping') : tr('exampleLabel');
      const send = isPrompt ? '<span class="g-prompt__send">➤</span>' : '';
      return '\n\n<div class="g-prompt"><span class="g-prompt__lbl">💬 ' + lbl + '</span><span class="g-prompt__box">' + txt + send + '</span></div>\n\n';
    });
  return wrapTables(marked.parse(pre));
}

function buildGuidePage(a) {
  const cat = CATEGORIES.guide;
  const aud = AUDIENCES[a.audience] || AUDIENCES.both;
  const { intro, sections } = parseGuideSections(a.bodyMd);

  // ELŐSZÖR a lépés-címek + ikon-kulcsok (a térkép ÉS a dobozok közös forrása)
  const stepHeadings = sections.filter(s => STEP_RX.test(s.title)).map(s => s.title.replace(STEP_RX, ''));
  const artSet = new Set();
  const artKeys = stepHeadings.map((h, i) => stepArtKey(h, i, artSet));

  let stepNo = 0;
  let faqPrepBody = '', faqMistBody = '';   // GYIK-hoz: meglévő szekciók újracsomagolva
  const blocks = sections.map(s => {
    const t = s.title;
    if (STEP_RX.test(t)) {
      stepNo++;
      const heading = t.replace(STEP_RX, '');
      return `<div class="g-step" id="step-${stepNo}"><div class="g-step__no">${stepNo}</div>
        <div class="g-step__grid">
          <div class="g-step__body"><h3 class="g-step__h">${inlineHeadingHtml(heading)}</h3>${guideSectionHtml(s.body)}</div>
          ${stepArtHtml(artKeys[stepNo - 1])}
        </div></div>`;
    }
    if (/before you start|before we start|prerequisit|miel[őo]tt elkezd|kezd[ée]s el[őo]tt|antes de (?:empezar|comenzar)|bevor (?:du|sie) (?:loslegst|beginn)|vorbereitung|avant de commencer/i.test(t)) {
      faqPrepBody = s.body;
      return `<div class="g-prereq"><div class="g-block__h">✅ ${escapeHtml(t)}</div>${guideSectionHtml(s.body)}</div>`;
    }
    if (/common mistakes|watch out|pitfalls|gyakori hib|err(?:ores|eurs) (?:comunes|frecuentes|courantes|fr[ée]quentes)|h[äa]ufige fehler|pi[èe]ges/i.test(t)) {
      faqMistBody = s.body;
      return `<div class="g-mistakes"><div class="g-block__h">⚠️ ${escapeHtml(t)}</div>${guideSectionHtml(s.body)}</div>`;
    }
    if (/what this means for you|mit jelent (?:ez )?(?:neked|ez neked)|mi ez neked|qu[ée] significa (?:esto )?para ti|was (?:das|dies) f[üu]r (?:dich|sie) bedeutet|ce que cela signifie pour (?:vous|toi)/i.test(t))
      return `<aside class="impact"><div class="impact__label">${escapeHtml(t)}</div>${guideSectionHtml(s.body)}</aside>`;
    if (/try it now|your turn|next step/i.test(t))
      return `<div class="g-try"><div class="g-block__h">🚀 ${escapeHtml(t)}</div>${guideSectionHtml(s.body)}</div>`;
    return `<div class="g-section"><h2>${escapeHtml(t)}</h2>${guideSectionHtml(s.body)}</div>`;
  }).join('\n');

  // Kisszótár-autolink (2026-07-10): a bevezető ÉS a lépések közös állapottal —
  // egy fogalom az egész útmutatóban csak egyszer linkelődik (először a bevezetőben).
  const alState = { linked: new Set(), count: 0 };
  const introHtml = intro ? glossAutolink(guideSectionHtml(intro), alState) : '';
  // KÖZÉP-DOBOZ (2026-08-25): a látogatók 63%-a útmutatóra érkezik, és
  // 359 útmutatóból 0 kapott továbbvezetést a szöveg közepén — a hírek
  // 437-ből 397-et igen. Lásd core/mid-guide.js. Két LÉPÉS KÖZÉ kerül.
  const blocksLinked = insertMidGuide(
    glossAutolink(blocks, alState), stepHeadings.length, midReadBox(a));

  const toolChip = (a.company || a.tool)
    ? `<span class="g-tool">📘 ${escapeHtml([a.company, a.tool].filter(Boolean).join(' · '))}</span>` : '';
  // Hivatalos oldal gomb (2026-07-12): eszköz-link, új eszköznél AUTOMATIKUSAN
  // a cég hivatalos oldala (kitalált URL soha)
  const officialUrl = TOOL_LINKS[a.tool] || COMPANY_LINKS[a.company] || '';
  const officialBtn = officialUrl
    ? `<a class="g-official" href="${officialUrl}" target="_blank" rel="noopener">↗ ${escapeHtml(a.tool || a.company)} · ${tr('officialSite')}</a>` : '';
  // Szint-címke fordítva (lvl_beginner/intermediate/advanced — mint a csempéken)
  const levelChip = a.level ? `<span class="g-level">${escapeHtml(tr('lvl_' + a.level) || a.level)}</span>` : '';
  const stepsTotal = stepHeadings.length;   // többnyelvű STEP_RX-ből (régen csak "Step N"-t értett)

  // GYIK-blokk (2026-07-11): 2 templatelt kérdés (idő, eszköz) + max 2 a már
  // MEGLÉVŐ (lefordított) szekciókból — $0 AI-költség, Google FAQ-jelöléssel.
  const faqs = [];
  if (a.readTime && stepsTotal) faqs.push({ q: tr('faqQTime'), aHtml: `<p>${escapeHtml(tr('faqATime').replace('{min}', a.readTime).replace('{steps}', stepsTotal))}</p>` });
  const faqTool = [a.company, a.tool].filter(Boolean).join(' ');
  if (faqTool) faqs.push({ q: tr('faqQTool'), aHtml: `<p>${escapeHtml(tr('faqATool').replace('{tool}', faqTool))}</p>` });
  if (faqPrepBody) faqs.push({ q: tr('faqQPrep'), aHtml: guideSectionHtml(faqPrepBody) });
  if (faqMistBody) faqs.push({ q: tr('faqQMist'), aHtml: guideSectionHtml(faqMistBody) });
  const faqHtml = faqs.length >= 2 ? `<section class="g-faq"><h2 class="g-faq__h">❓ ${tr('faqTitle')}</h2>
    ${faqs.map(f => `<details class="g-faq__item"><summary>${escapeHtml(f.q)}</summary><div class="g-faq__a">${f.aHtml}</div></details>`).join('\n')}</section>` : '';
  const faqSchema = faqs.length >= 2 ? {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.aHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) }
    }))
  } : null;

  const body = `<article class="article guide" style="--gc:${GUIDE_COVER_COLORS[a.company] || '#4f7a86'}">
    ${guideCoverHtml(a, 'article__cover')}
    <div class="article__head">
      <div class="article__badges">
        <span class="tag ${cat.cls}">📘 ${tr('stepByStep')}</span>
        ${toolChip}${officialBtn}${levelChip}
        <span class="aud ${aud.cls}">${aud.icon} ${tr(aud.key)}</span>
      </div>
      <h1 class="article__title">${escapeHtml(a.title)}</h1>
      <p class="article__subtitle">${escapeHtml(a.subtitle)}</p>
      <div class="article__meta"><span>${a.readTime} ${tr('minRead')}</span><span class="dot">·</span><span>${formatDate(a.publishedAt)}</span></div>
    </div>
    ${guideMapHtml(stepHeadings, artKeys)}
    ${introHtml ? `<div class="g-intro">${introHtml}</div>` : ''}
    ${blocksLinked ? `<p class="g-steptip">💡 <strong>${tr('stepTipLabel')}:</strong> ${escapeHtml(tr('stepTip'))}</p>` : ''}
    <div class="g-steps">${blocksLinked}</div>
    ${faqHtml}
    ${xrefBox(a)}
    ${relatedBox(a)}
    <div class="article__foot">
      <div class="fb" data-slug="${a.slug}" data-thanks="${escapeHtml(tr('fbThanks'))}"><span class="fb__q">${tr('fbQ')}</span><button class="fb__btn" data-vote="up" aria-label="👍">👍</button><button class="fb__btn" data-vote="down" aria-label="👎">👎</button></div>
      <p class="ai-disclosure">${tr('disclosureGuide')}</p>
      <a href="../index" class="back-link">${tr('backStories')}</a>
    </div>
  </article>`;

  const canonical = `${SITE.url}${LP}/article/${a.slug}`;
  const ogImage = a.image ? `${SITE.url}/assets/images/${a.image}` : '';
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'HowTo',
    name: a.title, description: buildMetaDescription(a.seoDescription || a.subtitle, a.bodyMd),
    image: ogImage || undefined,
    // DÁTUM + SZERZŐ + KIADÓ (2026-08-01, kereső-barátság átvilágítás).
    // Ezek eddig CSAK a hír-cikkeken (NewsArticle) voltak meg; az útmutatókon
    // — vagyis a fő forgalomszerzőnkön, 254 cikken — nem. Élőben mérve:
    // 24 véletlen cikkből 10 volt dátum és szerző NÉLKÜL, és mind a 10 útmutató.
    // A HowTo a schema.org szerint CreativeWork, tehát mindezt szabályosan viszi.
    // Miért számít: a dátum a frissesség-jelzés (és ez jelenik meg a találatban),
    // a szerző/kiadó pedig az E-E-A-T jelzés — 100%-ban AI-tartalomnál a
    // hitelesség kimondottan fontos. A szerző SZÁNDÉKOSAN a szervezet, nem
    // kitalált ember: kamu emberi név helyett vállalt AI-szerkesztőség.
    datePublished: a.publishedAt || undefined,
    dateModified: a.modifiedAt || a.publishedAt || undefined,
    author: { '@type': 'Organization', name: SITE.name, url: `${SITE.url}/about` },
    publisher: {
      '@type': 'Organization', name: SITE.name, url: SITE.url,
      logo: { '@type': 'ImageObject', url: `${SITE.url}/assets/logo.svg` }
    },
    mainEntityOfPage: canonical,
    inLanguage: HTML_LANG[LANG] || 'en',
    // többnyelvű STEP_RX: a nem-angol oldalak HowTo jelölése eddig ÜRES volt
    step: stepHeadings.map(h => ({ '@type': 'HowToStep', name: stripInlineMd(h) }))
  };
  return pageShell({
    title: withBrand(a.title),
    description: buildMetaDescription(a.seoDescription || a.subtitle, a.bodyMd),
    keywords: a.seoKeywords, ogImage,
    // HowTo + FAQPage + morzsamenü együtt (a JSON-LD tömböt is érti a Google)
    jsonld: [jsonld, ...(faqSchema ? [faqSchema] : []), breadcrumbSchema(a, canonical)],
    pagePath: `article/${a.slug}`,
    bodyContent: body, isArticle: true,
    articleMeta: { published: a.publishedAt, modified: a.modifiedAt || a.publishedAt }
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
    : `<span class="support__btn support__btn--soon" aria-disabled="true">☕ ${escapeHtml(SUPPORT.label)} — ${tr('supSoon')}</span>`;

  const body = `<section class="support">
    <span class="pill">${tr('supPill')}</span>
    <h1 class="support__title">${tr('supTitle')}</h1>
    <p class="support__lead">${tr('supLead')}</p>

    <div class="support__cta">${cta}</div>

    <div class="support__cards">
      <div class="support__card"><span class="support__ico">🖥️</span><h3>${tr('supCard1h')}</h3><p>${tr('supCard1p')}</p></div>
      <div class="support__card"><span class="support__ico">🧠</span><h3>${tr('supCard2h')}</h3><p>${tr('supCard2p')}</p></div>
      <div class="support__card"><span class="support__ico">🎨</span><h3>${tr('supCard3h')}</h3><p>${tr('supCard3p')}</p></div>
    </div>

    <div class="support__thanks">
      <p class="support__thanks-h">${tr('supThanksH')}</p>
      <p>${tr('supThanksP')}</p>
    </div>

    <p class="support__note">${tr('supNote')}</p>

    <a href="index" class="back-link">${tr('backStories')}</a>
  </section>`;

  return pageShell({
    title: `${tr('supMetaTitle')} — ${SITE.name}`,
    description: tr('supMetaDesc'),
    noIntro: true, pagePath: 'support.html',
    bodyContent: body
  });
}

// ===================================================================
// "KEZDD ITT!" OLDAL — a teljesen kezdő látogató kapuja (2026-07-07)
// ===================================================================
const START_GUIDE_IDS = ['what-ai-is-good-for', 'prompt-basics', 'chatgpt-getting-started', 'ai-privacy-basics', 'fact-check-ai'];
function buildStartPage(allLoc) {
  const picks = [];
  for (const id of START_GUIDE_IDS) {
    const g = allLoc.find(a => a.isGuide && a.file.includes(id));
    if (g) picks.push(g);
  }
  for (const g of allLoc.filter(a => a.isGuide && !a.company)) {   // tartalék
    if (picks.length >= 5) break;
    if (!picks.includes(g)) picks.push(g);
  }
  const items = picks.map((g, i) => `<a class="start__pick" href="article/${g.slug}">
      <span class="start__num">${i + 1}</span>
      <span><span class="rel__t">${escapeHtml(g.title)}</span>
      ${g.subtitle ? `<span class="rel__s">${escapeHtml(g.subtitle)}</span>` : ''}</span></a>`).join('');
  const body = `<section class="guides-hero">
      <p class="intro__kicker">⭐ ${tr('startHere')}</p>
      <h1 class="guides-hero__title">${escapeHtml(tr('startTitle'))}</h1>
      <p class="guides-hero__tag">${escapeHtml(tr('startTag'))}</p>
    </section>
    <div class="start__cols">
      <div class="start__card"><h2>💡 ${tr('startS1h')}</h2><p>${tr('startS1p')}</p></div>
      <div class="start__card"><h2>👣 ${tr('startS2h')}</h2><p>${tr('startS2p')}</p></div>
      <div class="start__card"><h2>🛡️ ${tr('startS3h')}</h2><p>${tr('startS3p')}</p></div>
    </div>
    <p class="start__wizcta"><a href="wizard">🧭 ${escapeHtml(tr('wizBanner'))}</a></p>
    <section class="start__picks"><h2 class="rel__h">📘 ${tr('startPickH')}</h2>${items}
      <p style="margin-top:18px"><a class="back-link" href="guides">${tr('startMore')} →</a></p></section>`;
  return pageShell({
    title: `${tr('startTitle')} — ${SITE.name}`,
    // A LÁTHATÓ mottó (startTag) változatlan marad — csak a meta leírás
    // egészül ki a már meglévő, MINDEN nyelvre lefordított bevezetőből.
    // Így egyetlen új szöveget sem kell írni egyik nyelven sem.
    description: buildMetaDescription(tr('startTag'), tr('startS1p')),
    noIntro: true, pagePath: 'start.html', bodyContent: body
  });
}

// ===================================================================
// AI-KISSZÓTÁR — örökzöld fogalom-oldal (website/glossary-data.json)
// Kézzel karbantartott, 5 nyelven — nem AI-generált, nem kell Ellenőrző.
// ===================================================================
let GLOSSARY = [];
try { GLOSSARY = JSON.parse(readFileSync(join(__dirname, 'glossary-data.json'), 'utf-8')).terms || []; } catch { /* nincs szótár-adat */ }

// ===================================================================
// KISSZÓTÁR-AUTOLINK (2026-07-10) — a cikk-törzsben az AI-szakszavak ELSŐ
// előfordulása a kisszótárra linkel (title-ben a definícióval = tooltip).
// Biztonság: <a>/<h1-6>/<code>/<pre> belsejét kihagyja; max 8 link/cikk;
// egy fogalom cikkeként csak egyszer. A gyakori szavakat (AI, chatbot, API)
// szándékosan NEM linkeljük — csak a valódi szakszavakat.
// ===================================================================
const AUTOLINK_KW = {
  'prompt-engineering': { en: ['prompt engineering'], hu: ['prompt-írás', 'prompt engineering'], es: ['ingeniería de prompts'], },
  'machine-learning': { en: ['machine learning'], hu: ['gépi tanulás'], es: ['aprendizaje automático'], },
  'neural-network': { en: ['neural network'], hu: ['neurális hálózat', 'neurális háló'], es: ['red neuronal', 'redes neuronales'], },
  'context-window': { en: ['context window'], hu: ['kontextusablak'], es: ['ventana de contexto'], },
  'generative-ai': { en: ['generative AI'], hu: ['generatív AI'], es: ['IA generativa'], },
  'reasoning-model': { en: ['reasoning model'], hu: ['gondolkodó modell'], es: ['modelo de razonamiento'], },
  'knowledge-cutoff': { en: ['knowledge cut-off', 'knowledge cutoff'], hu: ['tudás-határnap'], es: ['fecha de corte de conocimiento'], },
  'training-data': { en: ['training data'], hu: ['tanítóadat'], es: ['datos de entrenamiento'], },
  'open-source-model': { en: ['open-source model', 'open source model'], hu: ['nyílt forráskódú modell'], es: ['modelo de código abierto'], },
  'voice-cloning': { en: ['voice cloning'], hu: ['hangklónozás'], es: ['clonación de voz'], },
  'image-generator': { en: ['image generator'], hu: ['képgenerátor'], es: ['generador de imágenes'], },
  'ai-agent': { en: ['AI agent'], hu: ['AI-ügynök'], es: ['agente de IA', 'agentes de IA'], },
  // 2026-08-01 (user: "szótárat bővítsük agent skill plugin"). SZÁNDÉKOSAN nem a
  // puszta "skill" a kulcsszó: a minta `(?<![\p{L}])kw[\p{L}]*` kis-nagybetűre
  // érzéketlen, tehát a "skill" ráugrana az "improve your skills"-re is, és a
  // szótárba vinné az olvasót egy teljesen hétköznapi szóról. A "plugin"
  // viszont önmagában is egyértelmű (a toldalékos "pluginek" is illeszkedik).
  // Az MCP betűszó → kis-nagybetű-érzékeny ág, magyar toldalékkal (MCP-t) is jó.
  'ai-skill': { en: ['AI skill'], hu: ['AI-készség'], es: ['habilidad de IA'], },
  'plugin': { en: ['plugin'], hu: ['plugin'], es: ['plugin'], },
  'mcp': { en: ['MCP'], hu: ['MCP'], es: ['MCP'], },
  'fine-tuning': { en: ['fine-tuning', 'fine-tuned', 'fine-tune'], hu: ['finomhangolás'], es: ['ajuste fino'], },
  'multimodal': { en: ['multimodal'], hu: ['multimodális'], es: ['multimodal'], },
  'hallucination': { en: ['hallucination'], hu: ['hallucináció'], es: ['alucinación'], },
  'deepfake': { en: ['deepfake'], hu: ['deepfake'], es: ['deepfake'], },
  'jailbreak': { en: ['jailbreak'], hu: ['jailbreak'], es: ['jailbreak'], },
  'benchmark': { en: ['benchmark'], hu: ['benchmark'], es: ['benchmark'], },
  'guardrails': { en: ['guardrails', 'guardrail'], hu: ['védőkorlát'], es: ['barreras de seguridad'], },
  'watermark': { en: ['AI watermark', 'watermark'], hu: ['vízjel'], es: ['marca de agua'], },
  'token': { en: ['token'], hu: ['token'], es: ['token'], },
  'prompt': { en: ['prompt'], hu: ['prompt'], es: ['prompt'], },
  'llm': { en: ['LLM', 'large language model'], hu: ['LLM', 'nagy nyelvi modell'], es: ['LLM', 'gran modelo de lenguaje'], },
  'agi': { en: ['AGI'], hu: ['AGI'], es: ['AGI'], },
  'chip-gpu': { en: ['GPU'], hu: ['GPU'], es: ['GPU'], },
  'gpt': { en: ['GPT'], hu: ['GPT'], es: ['GPT'], }
};
const AUTOLINK_MAX = 8;

// ===================================================================
// ÚTMUTATÓ-AUTOLINK (2026-08-03) — a user: "ne csak egy oldalt nézzenek meg"
// ===================================================================
// MÉRÉS, ami kiváltotta (7 nap, oldalanként): MINDEN cikknél a letöltés-szám
// PONTOSAN egyenlő a belépő-számmal, vagyis a cikkről SENKI nem lép tovább.
// A 122 "továbblapozott" megnyitás szinte mind a /hu/ ágról jött — az a
// tulajdonos saját böngészése. A külső olvasó tehát 1,00 oldalt néz meg.
// A cikk törzsében NULLA link mutatott másik cikkünkre (csak szótár-szavak).
//
// AMIT CSINÁLUNK: ha a szöveg megemlít egy terméket (ChatGPT, Copilot…),
// amiről VAN publikált útmutatónk, a terméknevet a szövegben odalinkeljük.
// Olvasás KÖZBEN kattinthat, nem a végén — oda ugyanis nem ér el.
// Mérve: 602 cikkből 272 (45%) említ legalább egy ilyen terméket.
//
// KORLÁTOK (szándékosan szigorúak, hogy ne linkfarm legyen):
//  • cikkenként max 2 útmutató-link, terméknevenként EGYSZER (az első említés)
//  • címsor / kód / meglévő link / szótár-link belseje KIMARAD (a glossAutolink
//    ugyanazt a skipDepth-védelmet használja — ez utána fut, így a szótár-link
//    szövegébe sem írunk bele)
//  • ÖNMAGÁRA SOHA: a ChatGPT-útmutató nem linkel ChatGPT-útmutatóra
//  • hosszabb név előbb: "GitHub Copilot" nyer a "Copilot" ellen
const GUIDE_LINK_MAX = 2;
let _guideLinkMap = null;

// Terméknév → a hozzá tartozó LEGJOBB útmutató. Prioritás: "kezdő/getting
// started" jellegű (az az általános belépő), különben a legfrissebb.
// A buildXref/buildRelated mintáját követi: EGYSZER épül, a fő belépésből.
function buildGuideLinks(articles) {
  _guideLinkMap = null;
  const byTool = new Map();
  for (const a of articles) {
    if (!a.isGuide || !a.slug) continue;
    const tool = String(a.tool || '').trim();
    // A túl rövid és a mondatszerű "terméknév" nem alkalmas horgonynak
    if (tool.length < 4 || tool.split(/\s+/).length > 3) continue;
    if (!byTool.has(tool)) byTool.set(tool, []);
    byTool.get(tool).push(a);
  }
  const out = [];
  for (const [tool, list] of byTool) {
    list.sort((x, y) => {
      const starter = s => /getting-started|beginner|first|basics/.test(s.slug || '') ? 0 : 1;
      return starter(x) - starter(y) || String(y.publishedAt).localeCompare(String(x.publishedAt));
    });
    // HOVA VIGYEN? (mérési megfontolás)
    //  • 3+ útmutatónál a /tools GYŰJTŐ-szekciójába (cég-horgony): ott az
    //    olvasó VÁLASZT — és a mérés szerint a gyűjtő-oldalakról tényleg
    //    kattintanak tovább (főoldal 17%, cikkoldal 0%). Ráadásul nálunk
    //    NINCS általános "ChatGPT kezdőknek" útmutató, csak 15 szűk témájú;
    //    egy véletlenszerűen kiválasztott ("hands-free voice") gyengébb
    //    találat, mint a teljes választék.
    //  • 1-2 útmutatónál nincs mit válogatni → egyenesen a cikkre.
    const company = list[0].company || '';
    // ⚠️ A hub-link CSAK oda mutathat, ami a /tools oldalon TÉNYLEG ott van.
    // 2026-08-17 óta az az oldal kizárólag LLM-asszisztenseket listáz, tehát
    // egy képgenerátor cég-horgonya (#c-midjourney) már nem létezik — az oda
    // mutató link a lap tetejére dobná az olvasót, némán. Ezért nem-asszisztens
    // eszköznél egyenesen a cikkre megyünk, ahogy 1-2 útmutatónál is.
    const useHub = list.length >= 3 && company && kindOf(company) === KINDS.ASSISTANT;
    out.push({
      tool,
      count: list.length,
      hub: useHub ? `/tools#c-${companySlug(company)}` : null,
      target: list[0],
      // Szóhatáron, kis-nagybetűre ÉRZÉKENYEN (a márkanevek nagybetűsek, és
      // így a "grok"/"claude" köznévi előfordulás nem lesz link).
      // KÉT minta épül, mert a magyar toldalék kötőjel nélkül tapad
      // ("Geminit", "Copilotot") — a szigorú szóhatár ezeket elvágta, és
      // ezzel a magyar linkek 12%-át (835 előfordulás). Részletek és
      // raglista: core/tool-regex.js. Nyelvenként EGYSZER épül, itt.
      rx: toolRegex(tool, 'en'),
      rxHu: toolRegex(tool, 'hu')
    });
  }
  // Hosszabb terméknév ELŐRE: enélkül a "GitHub Copilot"-ból csak a "Copilot"
  // linkelődne, és rossz útmutatóra vinne.
  out.sort((a, b) => b.tool.length - a.tool.length);
  _guideLinkMap = out;
  return out;
}

function guideAutolink(html, article) {
  if (!html || !_guideLinkMap) return html;
  const targets = _guideLinkMap;
  if (!targets.length) return html;
  const selfTool = String(article?.tool || '').trim();
  const parts = html.split(/(<[^>]+>)/);
  const OPEN = /^<(a|h[1-6]|code|pre|button|script|style)\b/i;
  const CLOSE = /^<\/(a|h[1-6]|code|pre|button|script|style)>/i;
  let skipDepth = 0, count = 0;
  const used = new Set();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith('<')) {
      if (CLOSE.test(p)) skipDepth = Math.max(0, skipDepth - 1);
      else if (OPEN.test(p)) skipDepth++;
      continue;
    }
    if (skipDepth > 0 || count >= GUIDE_LINK_MAX || p.trim().length < 4) continue;
    const found = [];
    for (const t of targets) {
      if (used.has(t.tool)) continue;
      if (t.tool === selfTool) continue;                 // önmagára nem
      if (t.target.slug === article?.slug) continue;      // ugyanaz az oldal
      // Magyarul a tapadó toldalékot is elfogadó mintát használjuk; a
      // TALÁLAT így is csak a terméknév, a rag a linken kívül marad.
      const m = (LANG === 'hu' ? t.rxHu : t.rx).exec(p);
      if (m) found.push({ t, idx: m.index, str: m[0] });
    }
    if (!found.length) continue;
    found.sort((a, b) => a.idx - b.idx);
    const accepted = []; let lastEnd = -1;
    for (const f of found) {
      if (f.idx < lastEnd) continue;
      if (count + accepted.length >= GUIDE_LINK_MAX) break;
      accepted.push(f); lastEnd = f.idx + f.str.length;
    }
    let text = p;
    for (const f of accepted.sort((a, b) => b.idx - a.idx)) {
      const href = f.t.hub
        ? `${LP}${f.t.hub}`
        : `${LP}/article/${f.t.target.slug}`;
      // A title MEGMONDJA, hova visz — gyűjtőnél a darabszámmal, hogy az
      // olvasó tudja: választék vár, nem egyetlen cikk.
      const title = f.t.hub
        ? `${f.t.count} ${f.t.count > 1 ? tr('guideWordMany') : tr('guideWordOne')} — ${f.t.tool}`
        : localizeArticle(f.t.target, LANG).title;
      text = text.slice(0, f.idx)
        + `<a class="guide-link" href="${href}" title="${escapeHtml(title)}">${f.str}</a>`
        + text.slice(f.idx + f.str.length);
      used.add(f.t.tool); count++;
    }
    parts[i] = text;
  }
  return parts.join('');
}

const _autolinkCache = {};
function getAutolinkTerms() {
  if (_autolinkCache[LANG]) return _autolinkCache[LANG];
  const out = [];
  for (const [id, langs] of Object.entries(AUTOLINK_KW)) {
    const g = GLOSSARY.find(t => t.id === id);
    if (!g) continue;
    const kws = langs[LANG] || langs.en || [];
    const rxs = kws.map(kw => {
      const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Betűszó (LLM/GPU/GPT…): kis-nagybetű-érzékeny; magyar toldalék kötőjellel
      // mehet (GPU-k), de modellnév-szám NEM (GPT-5) és szó belseje sem (ChatGPT).
      return /^[A-Z0-9-]+$/.test(kw)
        ? new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?:-[a-záéíóöőúüűß]{1,6})?(?!-)(?![\\p{L}\\p{N}])`, 'u')
        : new RegExp(`(?<![\\p{L}])${esc}[\\p{L}]*`, 'iu');
    });
    out.push({ id, rxs, def: (g[LANG] || g.en).def });
  }
  _autolinkCache[LANG] = out;
  return out;
}
function glossAutolink(html, state) {
  if (!html || !GLOSSARY.length) return html;
  const terms = getAutolinkTerms();
  const parts = html.split(/(<[^>]+>)/);
  const OPEN = /^<(a|h[1-6]|code|pre|button|script|style)\b/i;
  const CLOSE = /^<\/(a|h[1-6]|code|pre|button|script|style)>/i;
  let skipDepth = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith('<')) {
      if (CLOSE.test(p)) skipDepth = Math.max(0, skipDepth - 1);
      else if (OPEN.test(p)) skipDepth++;
      continue;
    }
    if (skipDepth > 0 || state.count >= AUTOLINK_MAX || p.trim().length < 4) continue;
    // Jelöltek az EREDETI szöveg-szeleten (átfedés-szűréssel), csere HÁTULRÓL —
    // így a beszúrt link title-jébe soha nem "linkelünk bele".
    const found = [];
    for (const t of terms) {
      if (state.linked.has(t.id)) continue;
      let m = null;
      for (const rx of t.rxs) { m = rx.exec(p); if (m) break; }
      if (m) found.push({ t, idx: m.index, str: m[0] });
    }
    if (!found.length) continue;
    found.sort((a, b) => a.idx - b.idx);
    const accepted = []; let lastEnd = -1;
    for (const f of found) {
      if (f.idx < lastEnd) continue;
      if (state.count + accepted.length >= AUTOLINK_MAX) break;
      accepted.push(f); lastEnd = f.idx + f.str.length;
    }
    let text = p;
    for (const f of accepted.sort((a, b) => b.idx - a.idx)) {
      text = text.slice(0, f.idx)
        + `<a class="gloss-link" href="${LP}/glossary#${f.t.id}" title="${escapeHtml(f.t.def)}">${f.str}</a>`
        + text.slice(f.idx + f.str.length);
      state.linked.add(f.t.id); state.count++;
    }
    parts[i] = text;
  }
  return parts.join('');
}

function buildGlossaryPage() {
  const cards = GLOSSARY.map(t => {
    const loc = t[LANG] || t.en;
    return `<div class="gloss__card" id="${t.id}">
      <h2 class="gloss__term">${escapeHtml(loc.term)}</h2>
      <p class="gloss__def">${escapeHtml(loc.def)}</p>
    </div>`;
  }).join('\n');
  const body = `<section class="guides-hero">
      <p class="intro__kicker">${tr('glossNav')}</p>
      <h1 class="guides-hero__title">${escapeHtml(tr('glossTitle'))}</h1>
      <p class="guides-hero__tag">${escapeHtml(tr('glossTag'))}</p>
    </section>
    <div class="gloss__grid">${cards}</div>
    <p class="start__wizcta"><a href="wizard">🧭 ${escapeHtml(tr('wizBanner'))}</a></p>`;
  return pageShell({
    title: `${tr('glossTitle')} — ${SITE.name}`,
    description: tr('glossTag'),
    noIntro: true, pagePath: 'glossary.html', bodyContent: body
  });
}

// ===================================================================
// "MINDEN HÍR" ARCHÍVUM (2026-07-11) — a régi hírek eddig csak keresőből
// voltak elérhetők; itt hónapok szerint, kompakt listában mind megvan.
// ===================================================================
function buildArchivePage(loc) {
  const news = loc.filter(a => !a.isGuide)
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const byMonth = new Map();
  for (const a of news) {
    const key = (a.publishedAt || '').slice(0, 7) || '????-??';
    if (!byMonth.has(key)) {
      const d = new Date((a.publishedAt || Date.now()));
      byMonth.set(key, { label: d.toLocaleDateString(DATE_LOCALES[LANG] || 'en-US', { year: 'numeric', month: 'long' }), items: [] });
    }
    byMonth.get(key).items.push(a);
  }
  const groups = [...byMonth.values()].map(g => `<section class="arch__month"><h2 class="arch__mh">${escapeHtml(g.label)}</h2>
    ${g.items.map(a => {
      const cat = CATEGORIES[a.category] || CATEGORIES.other;
      const day = a.publishedAt ? new Date(a.publishedAt).toLocaleDateString(DATE_LOCALES[LANG] || 'en-US', { day: 'numeric', month: 'short' }) : '';
      return `<a class="arch__row" href="article/${a.slug}"><span class="arch__d">${escapeHtml(day)}</span><span class="arch__i">${cat.icon}</span><span class="arch__t">${escapeHtml(a.title)}</span></a>`;
    }).join('\n')}</section>`).join('\n');
  const body = `<section class="guides-hero">
      <p class="intro__kicker">🗂️</p>
      <h1 class="guides-hero__title">${escapeHtml(tr('archTitle'))}</h1>
      <p class="guides-hero__tag">${escapeHtml(tr('archTag'))} (${news.length})</p>
    </section>
    <div class="arch">${groups}</div>`;
  return pageShell({
    title: `${tr('archTitle')} — ${SITE.name}`,
    // Ugyanaz az elv, mint a "Kezdd itt" oldalnál: a látható mottó marad,
    // a meta leírás a meglévő oldal-bemutatóból egészül ki.
    description: buildMetaDescription(tr('archTag'), tr('startS1p')),
    noIntro: true, pagePath: 'archive.html', bodyContent: body
  });
}

// ===================================================================
// "RÓLUNK / HOGYAN DOLGOZUNK" — bizalmi oldal (E-E-A-T, 2026-07-10)
// Organization schema + őszinte műhely-leírás. A Google és az olvasó
// bizalmát építi — a hirdetés-kampány előfeltétele.
// ===================================================================
function buildAboutPage() {
  const cards = [
    ['🌏', 'aboutWhoH', 'aboutWhoP'],
    ['⚙️', 'aboutHowH', 'aboutHowP'],
    ['📰', 'aboutSrcH', 'aboutSrcP'],
    ['🤝', 'aboutHonH', 'aboutHonP'],
    ['🔧', 'aboutFixH', 'aboutFixP']
  ].map(([icon, h, p]) => `<div class="gloss__card"><h2 class="gloss__term">${icon} ${escapeHtml(tr(h))}</h2><p class="gloss__def">${escapeHtml(tr(p))}</p></div>`).join('\n');
  // Kapcsolat-űrlap (ügyfélszolgálat, 2026-07-20) — CSAK ha a chat-doboz engedélyezve van.
  const csFormHtml = !CS.enabled ? '' : `
  <section class="cs-formbox" id="contact">
    <h2>${escapeHtml(tr('csFormT'))}</h2>
    <form id="cs-form" autocomplete="off">
      <input type="text" name="name" placeholder="${escapeHtml(tr('csName'))}" maxlength="80">
      <input type="email" name="email" placeholder="${escapeHtml(tr('csEmail'))}" required maxlength="120">
      <textarea name="message" placeholder="${escapeHtml(tr('csMsg'))}" required maxlength="2000" rows="4"></textarea>
      <input type="text" name="web" class="cs-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="cs-ts" id="cs-form-ts"></div>
      <button type="submit">${escapeHtml(tr('csSubmit'))}</button>
      <p class="cs-note">${escapeHtml(tr('csPrivacy'))}</p>
      <p class="cs-status" aria-live="polite"></p>
    </form>
  </section>`;
  const body = `<section class="guides-hero">
      <p class="intro__kicker">${escapeHtml(tr('aboutNav'))}</p>
      <h1 class="guides-hero__title">${escapeHtml(tr('aboutTitle'))}</h1>
      <p class="guides-hero__tag">${escapeHtml(tr('aboutTag'))}</p>
    </section>
    <div class="gloss__grid">${cards}</div>
    <p class="start__wizcta"><a href="start">⭐ ${escapeHtml(tr('startTitle'))}</a></p>
    ${csFormHtml}`;
  return pageShell({
    title: `${tr('aboutTitle')} — ${SITE.name}`,
    description: tr('aboutTag'),
    noIntro: true, pagePath: 'about.html', bodyContent: body,
    jsonld: {
      '@context': 'https://schema.org', '@type': 'Organization',
      name: SITE.name, url: SITE.url, logo: `${SITE.url}/assets/logo.svg`,
      description: SITE.description,
      sameAs: [FB_URL, IG_URL, TH_URL]
    }
  });
}

// ===================================================================
// "MELYIK AI VALÓ NEKED?" VARÁZSLÓ — 4 kérdés, kliens-oldali pontozás
// (WIZ_DATA nyelvenként; a pontozás nyelvfüggetlen s-térképekből megy)
// ===================================================================
function buildWizardPage() {
  const W = WIZ_DATA[LANG] || WIZ_DATA.en;
  const data = {
    q: W.q, r: W.r,
    ui: { step: tr('wizStep'), resultH: tr('wizResultH'), also: tr('wizAlso'), cta: tr('wizCta'), again: tr('wizAgain') }
  };
  const body = `<section class="guides-hero">
      <p class="intro__kicker">🧭</p>
      <h1 class="guides-hero__title">${escapeHtml(tr('wizTitle'))}</h1>
      <p class="guides-hero__tag">${escapeHtml(tr('wizTag'))}</p>
    </section>
    <div class="wiz">
      <p class="wiz__progress" id="wizProgress"></p>
      <div class="wiz__card" id="wizCard"></div>
    </div>
    <script>
    (function(){
      var D = ${JSON.stringify(data)};
      var ORDER = ['chatgpt','gemini','copilot','claude'];
      var i = 0, score = {chatgpt:0, gemini:0, claude:0, copilot:0};
      var card = document.getElementById('wizCard'), prog = document.getElementById('wizProgress');
      function esc(s){ var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
      function show(){
        if (i >= D.q.length) return result();
        var q = D.q[i];
        prog.textContent = D.ui.step + ' ' + (i + 1) + ' / ' + D.q.length;
        card.innerHTML = '<h2 class="wiz__q">' + esc(q.t) + '</h2>' + q.o.map(function(o, j){
          return '<button class="wiz__opt" data-j="' + j + '">' + esc(o.t) + '</button>';
        }).join('');
        card.querySelectorAll('.wiz__opt').forEach(function(b){
          b.addEventListener('click', function(){
            var s = D.q[i].o[+b.dataset.j].s;
            for (var k in s) score[k] += s[k];
            i++; show();
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        });
      }
      function result(){
        var sorted = ORDER.slice().sort(function(a, b){ return (score[b] - score[a]) || (ORDER.indexOf(a) - ORDER.indexOf(b)); });
        var top = D.r[sorted[0]], second = D.r[sorted[1]];
        prog.textContent = '';
        card.innerHTML = '<p class="wiz__kicker">🎯 ' + esc(D.ui.resultH) + '</p>'
          + '<h2 class="wiz__winner">' + esc(top.n) + '</h2>'
          + '<p class="wiz__why">' + esc(top.w) + '</p>'
          + '<p><a class="wiz__cta" href="tools">' + esc(D.ui.cta) + ' →</a></p>'
          + '<p class="wiz__also">' + esc(D.ui.also) + ': <strong>' + esc(second.n) + '</strong></p>'
          + '<p><button class="wiz__again" id="wizAgain">↺ ' + esc(D.ui.again) + '</button></p>';
        document.getElementById('wizAgain').addEventListener('click', function(){
          i = 0; score = {chatgpt:0, gemini:0, claude:0, copilot:0}; show();
        });
      }
      show();
    })();
    </script>`;
  return pageShell({
    title: `${tr('wizTitle')} — ${SITE.name}`,
    description: tr('wizTag'),
    noIntro: true, pagePath: 'wizard.html', bodyContent: body
  });
}

// ===================================================================
// RSS 2.0 HÍRFOLYAM — NYELVENKÉNT (user-kérés 2026-07-07)
// en → /feed.xml (gyökér), többi → /hu/feed.xml, /es/feed.xml stb.
// A cím/leírás/elem-címek az adott nyelven (a fordítás-cache-ből).
// ===================================================================
const xmlEsc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// KÉP A FEEDBE (2026-08-09): a Flipboard és a hírolvasók (Feedly stb.) képes
// kártyát mutatnak — kép nélkül a cikkeink szürke szövegdobozként jelennek meg.
// A <enclosure> a szabvány RSS 2.0 mező, a <media:content> a szélesebb körben
// támogatott Media RSS; mindkettőt kiadjuk, mert az olvasók eltérőt néznek.
//
// A SIMA borítót (assets/images/) adjuk, NEM a címes share/ képet: a Flipboard
// a saját címét írja a képre, a mi feliratunk ott dupla szöveg lenne. Ráadásul
// a share/ csak a 7 napnál frissebb cikkekhez létezik, a feedben 40 van.
//
// A length attribútum az RSS 2.0-ban KÖTELEZŐ és bájtban értendő — lemezről
// olvassuk. A 0 sok validátornál hibát ad, ezért ha nem tudjuk a méretet,
// inkább nem adunk ki enclosure-t.
// TELJES SZÖVEG A FEEDBE (2026-08-09) — a Flipboard három felvételi
// követelményének EGYIKE: „a feed legyen TELJES, ne csak cím vagy kivonat".
// Nálunk eddig a <description> az ALCÍM volt (átlag 116 karakter), ami
// kivonatnak számít → a beküldést elutasították volna.
//
// A <description> MARAD rövid: azt használják a listanézetek beharangozónak.
// A teljes szöveg a <content:encoded>-be megy — ez a bevett RSS-szokás.
//
// ⚠️ A relatív linkeket ABSZOLÚTRA kell írni: a hírolvasóban a cikk a saját
// domainjükön jelenik meg, ott a "/tools" a Flipboardra mutatna, nem ránk.
// A linkek abszolutizálása + a saját cikk-URL-ek kanonizálása (.html le):
// core/feed-links.js — 2026-08-10-ig itt .html-es, átirányító URL-ek mentek
// ki a feedbe, mert a lemezen a törzs linkjei .html-esek.
function feedContent(a) {
  return absolutizeFeedLinks(a?.bodyHtml, SITE.url);
}

const IMG_BYTES_CACHE = new Map();
function feedImage(a) {
  if (!a?.image) return null;
  if (IMG_BYTES_CACHE.has(a.image)) return IMG_BYTES_CACHE.get(a.image);
  let out = null;
  try {
    const bytes = statSync(join(__dirname, 'assets', 'images', a.image)).size;
    if (bytes > 0) out = { url: `${SITE.url}/assets/images/${a.image}`, bytes };
  } catch { /* nincs meg a fájl: kép nélküli tétel, nem hiba */ }
  IMG_BYTES_CACHE.set(a.image, out);
  return out;
}

// Közös RSS-építő. items = már rendezett/szűrt cikklista.
// (2026-07-23-tól paraméteres, mert akkor egy szűrt heti-feedet is épített a
// hírlevélhez; a hírlevél 2026-07-27-én megszűnt, de a forma jó maradt.)
function buildRss(items, lang, { selfPath, title, desc }) {
  const lp = langPrefix(lang);
  const rows = items.map(a => {
    const url = `${SITE.url}${lp}/article/${a.slug}`;
    const pub = a.publishedAt ? new Date(a.publishedAt).toUTCString() : new Date().toUTCString();
    const img = feedImage(a);
    const mime = /\.png$/i.test(a.image || '') ? 'image/png' : 'image/jpeg';
    const content = feedContent(a);
    return `    <item>
      <title>${xmlEsc(a.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${xmlEsc(a.subtitle)}</description>
      <pubDate>${pub}</pubDate>
      <category>${a.isGuide ? 'Guide' : 'News'}</category>${img ? `
      <enclosure url="${xmlEsc(img.url)}" type="${mime}" length="${img.bytes}"/>
      <media:content url="${xmlEsc(img.url)}" type="${mime}" medium="image"/>` : ''}${content ? `
      <content:encoded><![CDATA[${content}]]></content:encoded>` : ''}
    </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${xmlEsc(title)}</title>
    <link>${SITE.url}${lp}/</link>
    <atom:link href="${SITE.url}${lp}/${selfPath}" rel="self" type="application/rss+xml"/>
    <description>${xmlEsc(desc)}</description>
    <language>${(HTML_LANG[lang] || 'en').toLowerCase()}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rows}
  </channel>
</rss>`;
}

function feedXml(loc, lang) {
  const items = loc.slice()
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .slice(0, 40);
  return buildRss(items, lang, { selfPath: 'feed.xml', title: `${SITE.name} — ${tr('tagline')}`, desc: tr('siteDesc') });
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

  // Asset-ek másolása (CSS + JS + logó + saját betű-CSS + OG-alapkép)
  // og-default.jpg (2026-07-25): a kép nélküli oldalak OG-előnézete + a social/
  // pinterest poszterek VÉGSŐ tartalék-képe. Eddig kimaradt a másolásból → 404
  // élőben (kép nélküli megosztás/pin, ha valaha ez a tartalék jön).
  for (const asset of ['style.css', 'app.js', 'logo.svg', 'fonts.css', 'chat.js', 'og-default.jpg']) {
    const src = join(ASSETS_SRC, asset);
    if (existsSync(src)) {
      copyFileSync(src, join(OUT_ASSETS_DIR, asset));
      console.log(`✅ ${asset} másolva`);
    } else {
      console.warn(`⚠️  Nincs ${asset} az assets/-ben!`);
    }
  }

  // Saját kiszolgálású betűtípusok (2026-07-10, sebesség). A vendor/ mappa
  // 2026-08-05-ig az AOS-t vitte; azzal együtt kikerült.
  for (const dir of ['fonts']) {
    const p = join(ASSETS_SRC, dir);
    if (existsSync(p)) {
      cpSync(p, join(OUT_ASSETS_DIR, dir), { recursive: true });
      console.log(`✅ ${dir}/ másolva`);
    }
  }

  // Lépés-illusztrációk mappa másolása (ha van)
  const artSrc = join(ASSETS_SRC, 'art');
  if (existsSync(artSrc)) {
    cpSync(artSrc, join(OUT_ASSETS_DIR, 'art'), { recursive: true });
    console.log('✅ art/ (lépés-illusztrációk) másolva');
  }

  // Álló rövidvideók (Reels) másolása. FORRÁS-oldali fájlok, mert ez a build
  // ÜRÍTI a public/-ot: ami oda kerül, azt a következő futás eltörölné. A
  // Make ezekről a nyilvános URL-ekről tölti le a videót a Facebookra.
  const shortsSrc = join(ASSETS_SRC, 'video', 'shorts');
  if (existsSync(shortsSrc)) {
    cpSync(shortsSrc, join(OUT_ASSETS_DIR, 'video', 'shorts'), { recursive: true });
    const db = readdirSync(shortsSrc).filter(f => f.endsWith('.mp4')).length;
    console.log(`✅ ${db} álló rövidvideó másolva`);
  }

  // Képek mappa másolása (ha van)
  const imagesSrc = join(ASSETS_SRC, 'images');
  if (existsSync(imagesSrc)) {
    cpSync(imagesSrc, join(OUT_ASSETS_DIR, 'images'), { recursive: true });
    const imgCount = readdirSync(imagesSrc).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)).length;
    console.log(`✅ ${imgCount} kép másolva`);
  }

  // Cikkek betöltése (egyszer) + kereszthivatkozás-index
  const articles = loadArticles();
  buildXref(articles);
  buildRelated(articles);
  buildGuideLinks(articles);   // terméknév → útmutató térkép a szövegbeli linkeléshez
  // VALÓDI lapszám: ahány külön napon jelent meg tartalom
  ISSUE_NO = new Set(articles.map(a => (a.publishedAt || '').slice(0, 10)).filter(Boolean)).size || 1;
  console.log(`📰 ${articles.length} publikált cikk/útmutató — generálás ${SITE_LANGS.length} nyelven`);

  const today = new Date().toISOString().slice(0, 10);
  const sitemapUrls = [];

  // NYELVENKÉNT: en = gyökér, a többi /<lang>/ alkönyvtárban
  for (const lang of SITE_LANGS) {
    LANG = lang; LP = langPrefix(lang); T = UI[lang] || UI.en;
    const outBase = lang === 'en' ? OUT_DIR : join(OUT_DIR, lang);
    const outArticle = join(outBase, 'article');
    mkdirSync(outArticle, { recursive: true });

    const loc = articles.map(a => localizeArticle(a, lang));
    const news = loc.filter(a => !a.isGuide);
    const guides = loc.filter(a => a.isGuide);
    // ===================================================================
    // A KÉT ÚTMUTATÓ-OLDAL SZÉTOSZTÁSA — itt, EGY helyen
    // ===================================================================
    // A /guides és a /tools KIZÁRJA egymást: ami az egyiken van, a másikon
    // nincs. Ezért ennek a két sornak EGYÜTT le kell fednie MINDEN útmutatót.
    //
    // ⚠️ 2026-08-17: amikor a /tools-t leszűkítettem LLM-asszisztensekre, ezt
    // a szétosztást elfelejtettem hozzáigazítani — így a 17 nem-asszisztens
    // útmutató (Hugging Face, Midjourney, Picsart, Suno) EGYIK oldalra sem
    // került. Élt és elérhető volt közvetlen címen, de SEHONNAN nem lehetett
    // rákattintani. A user vette észre: „nem volt elérhető linkje sem."
    //
    // A helyes szabály: a /tools CSAK asszisztens-cég útmutatóit viszi, MINDEN
    // MÁS a /guides-ra megy — a cég nélküliek ÉS a nem-asszisztens cégeké is.
    // Így egy útmutató PONTOSAN az egyik oldalon van, sosem nullán.
    const toolsCeg = (c) => !!c && kindOf(c) === KINDS.ASSISTANT;
    const generalGuides = guides.filter(g => !toolsCeg(g.company));
    const companyGuides = guides.filter(g => toolsCeg(g.company));
    const guideCounts = { everyday: generalGuides.length, tool: companyGuides.length };

    // ŐRSZEM: MINDEN útmutató PONTOSAN EGY oldalon (2026-08-17).
    // Ez az invariáns némán dőlt meg — 17 útmutató sehonnan sem volt
    // elérhető, csak közvetlen címen, és a build ezt egy szóval sem jelezte.
    // A user vette észre. Mostantól hangosan szól, és állapotfájlba is megy,
    // mert a CI naplója senkihez nem jut el.
    if (lang === 'en') {
      const arva = generalGuides.length + companyGuides.length - guides.length;
      const problems = [];
      if (arva !== 0) {
        const hol = guides.filter(g => !generalGuides.includes(g) && !companyGuides.includes(g));
        problems.push({ code: 'GUIDES_ORPHANED', count: hol.length, slugs: hol.slice(0, 10).map(g => g.slug) });
        console.log(`   ⚠️  ${hol.length} ÚTMUTATÓ EGYIK OLDALON SINCS — sehonnan nem kattintható!`);
        for (const g of hol.slice(0, 10)) console.log(`        ${g.slug}`);
      } else {
        console.log(`   ✅ útmutató-lefedés: ${generalGuides.length} /guides + ${companyGuides.length} /tools = ${guides.length}`);
      }
      try {
        mkdirSync(join(PROJECT_ROOT, 'memory'), { recursive: true });
        writeFileSync(join(PROJECT_ROOT, 'memory', 'guide-coverage-guard.json'),
          JSON.stringify({ at: new Date().toISOString(), guides: guides.length, general: generalGuides.length, tools: companyGuides.length, problems }, null, 2), 'utf-8');
      } catch { /* a build ettől soha ne bukjon el */ }
    }

    writeFileSync(join(outBase, 'index.html'), buildIndex(news), 'utf-8');
    writeFileSync(join(outBase, 'guides.html'), buildGuidesPage(generalGuides, guideCounts), 'utf-8');
    writeFileSync(join(outBase, 'tools.html'), buildToolsPage(companyGuides, guideCounts), 'utf-8');
    writeFileSync(join(outBase, 'start.html'), buildStartPage(loc), 'utf-8');
    writeFileSync(join(outBase, 'glossary.html'), buildGlossaryPage(), 'utf-8');   // AI-kisszótár
    writeFileSync(join(outBase, 'wizard.html'), buildWizardPage(), 'utf-8');       // Melyik AI való neked?
    writeFileSync(join(outBase, 'about.html'), buildAboutPage(), 'utf-8');         // Rólunk (bizalmi oldal)
    writeFileSync(join(outBase, 'archive.html'), buildArchivePage(loc), 'utf-8');  // Minden hír (archívum)
    writeFileSync(join(outBase, 'feed.xml'), feedXml(loc, lang), 'utf-8');   // nyelvenkénti RSS
    // Kereső-index (villámkereső a navbarban): cím + alcím + márka + slug
    //
    // A KISSZÓTÁR IS BENNE VAN (2026-08-02). A user kétszer jelezte, hogy nem
    // találja a "skill" leírását — és igaza volt, csak nem úgy, ahogy hittem:
    // a fogalom OTT VAN a szótár-oldalon (46-ból a 13.), de a keresőmező, ami
    // ugyanazon az oldalon van, KIZÁRÓLAG cikkek közt keresett. Aki rákeresett,
    // két találomra vett cikket kapott — az egyik a SkillOpt, a levett kitalált
    // termék. Vagyis a szótár tartalma megvolt, csak megtalálhatatlan volt.
    // (Korábban tévesen a kb.json-t néztem bizonyítéknak: az a CHATBOT
    // tudásbázisa, nem a honlap keresője. Két külön fájl, két külön út.)
    //
    // A `p` mező = kész útvonal a horgonyra (a szótár-kártyáknak van id-juk),
    // az app.js ezt használja, ha van; enélkül marad a régi /article/<slug>.
    //
    // A SZÓTÁR VAN ELÖL, és ez szándékos. A pontozó (app.js) csak akkor ad
    // 0 pontot, ha a cím a keresett szóval KEZDŐDIK; az "AI-ügynök (agent)"
    // nem kezdődik az "ügynök" szóval, ezért ugyanannyi pontot kap, mint egy
    // cikk. Holtversenynél a sort megtartja az eredeti sorrendet — így ha a
    // szótár hátul volna, EGY szómagyarázat sem nyerne, hacsak nem pont a
    // keresett szó kezdi. Aki egyetlen szóra keres, a jelentését akarja.
    const searchIndex = GLOSSARY.map(t => {
      const g = t[lang] || t.en;
      return { t: g.term, s: g.def, b: '', u: '', g: 0, p: `/glossary#${t.id}` };
    }).concat(loc.map(a => ({
      t: a.title, s: a.subtitle || '', b: [a.company, a.tool].filter(Boolean).join(' '),
      u: a.slug, g: a.isGuide ? 1 : 0
    })));
    writeFileSync(join(outBase, 'search.json'), JSON.stringify(searchIndex), 'utf-8');
    // ÜGYFÉLSZOLGÁLAT kb.json (2026-07-20): guide-ok + GYIK + kisszótár — a
    // Worker chat-motorja ebből keres és CSAK ebből linkel (kitalált URL tilos).
    const kbGuides = loc.filter(a => a.isGuide).map(a => ({
      t: a.title, s: a.subtitle || '', u: `${SITE.url}${LP}/article/${a.slug}`, c: a.company || ''
    }));
    // FRISS HÍREK a chatbotnak (2026-07-26): a legutóbbi 40 hír (a hír nem
    // evergreen, ezért csak a legfrissebbek — loc dátum szerint csökkenő). Így a
    // chatbot a friss AI-fejleményekről is tud válaszolni és a cikkre linkelni.
    const kbNews = loc.filter(a => !a.isGuide).slice(0, 40).map(a => ({
      t: a.title, s: a.subtitle || '', u: `${SITE.url}${LP}/article/${a.slug}`, c: a.company || ''
    }));
    const kbSite = (CS_FAQ[lang] || CS_FAQ.en).map(f => ({
      q: f.q, a: f.a, u: `${SITE.url}${f.p === '/' ? (LP || '/') : LP + f.p}`
    }));
    const kbTerms = GLOSSARY.map(t => ({
      t: (t[lang] || t.en).term, d: (t[lang] || t.en).def, u: `${SITE.url}${LP}/glossary`
    }));
    writeFileSync(join(outBase, 'kb.json'),
      JSON.stringify({ v: 1, lang, site: kbSite, guides: kbGuides, news: kbNews, terms: kbTerms }), 'utf-8');
    for (const a of loc) {
      const html = a.isGuide ? buildGuidePage(a) : buildArticlePage(a);
      writeFileSync(join(outArticle, `${a.slug}.html`), html, 'utf-8');
    }
    if (SUPPORT.enabled) writeFileSync(join(outBase, 'support.html'), buildSupportPage(), 'utf-8');

    // sitemap (nyelvenként)
    const lp = langPrefix(lang);
    sitemapUrls.push({ loc: `${SITE.url}${lp}/`, date: today });
    if (generalGuides.length) sitemapUrls.push({ loc: `${SITE.url}${lp}/guides`, date: today });
    if (companyGuides.length) sitemapUrls.push({ loc: `${SITE.url}${lp}/tools`, date: today });
    if (SUPPORT.enabled) sitemapUrls.push({ loc: `${SITE.url}${lp}/support`, date: today });
    sitemapUrls.push({ loc: `${SITE.url}${lp}/start`, date: today });
    sitemapUrls.push({ loc: `${SITE.url}${lp}/glossary`, date: today });
    sitemapUrls.push({ loc: `${SITE.url}${lp}/wizard`, date: today });
    sitemapUrls.push({ loc: `${SITE.url}${lp}/about`, date: today });
    sitemapUrls.push({ loc: `${SITE.url}${lp}/archive`, date: today });
    for (const a of loc) sitemapUrls.push({ loc: `${SITE.url}${lp}/article/${a.slug}`, date: (a.publishedAt || '').slice(0, 10) || today });

    console.log(`✅ [${lang}] ${loc.length + 3} oldal generálva (${outBase === OUT_DIR ? 'gyökér' : lang + '/'})`);
  }
  // vissza angolra (a további futás biztonságához)
  LANG = 'en'; LP = ''; T = UI.en;

  // SEO: egyesített sitemap.xml + robots.txt
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${u.date}</lastmod></url>`).join('\n')}
</urlset>`;
  writeFileSync(join(OUT_DIR, 'sitemap.xml'), sitemap, 'utf-8');

  // GOOGLE NEWS SITEMAP (2026-07-14): csak a 48 óránál FRISSEBB hírek (EN) —
  // a Google News/Discover ebből indexel villámgyorsan. Útmutatók nem hírek.
  const newsArts = articles.filter(a => !a.isGuide && a.publishedAt &&
    (Date.now() - new Date(a.publishedAt).getTime()) < 48 * 3600e3);
  const newsSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${newsArts.map(a => `  <url><loc>${SITE.url}/article/${a.slug}</loc><news:news><news:publication><news:name>${escapeHtml(SITE.name)}</news:name><news:language>en</news:language></news:publication><news:publication_date>${a.publishedAt}</news:publication_date><news:title>${escapeHtml(a.title)}</news:title></news:news></url>`).join('\n')}
</urlset>`;
  writeFileSync(join(OUT_DIR, 'news-sitemap.xml'), newsSitemap, 'utf-8');

  writeFileSync(join(OUT_DIR, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\nSitemap: ${SITE.url}/news-sitemap.xml\n`, 'utf-8');
  console.log(`✅ sitemap.xml (${sitemapUrls.length} URL) + news-sitemap.xml (${newsArts.length} friss hír) + robots.txt generálva`);

  // feed.xml: NYELVENKÉNT készül a fő ciklusban (en=gyökér, /hu/feed.xml stb.)
  console.log(`✅ feed.xml minden nyelven generálva (gyökér + ${SITE_LANGS.filter(l=>l!=='en').map(l=>'/'+l).join(' ')})`);

  // llms.txt — az AI-keresők/asszisztensek (Perplexity, ChatGPT stb.) számára
  // készült tömör oldal-térkép (llmstxt.org konvenció). Segít, hogy az AI-válaszok
  // minket találjanak meg és idézzenek a kezdőbarát útmutatókhoz.
  // ── ESZKÖZ SZERINTI CSOPORTOSÍTÁS (2026-08-26) ────────────────────
  //
  // MIÉRT: az llms.txt eddig a 15 LEGFRISSEBB útmutatót sorolta fel a 365-ből
  // (4%). A "friss" viszont annak a mércéje, ami NEKÜNK számít — az AI-kereső
  // nem dátum szerint keres, hanem ESZKÖZ és FELADAT szerint: "hogyan
  // csináljam ezt ChatGPT-vel". Az útmutatóink pont így oszlanak el: 20 cég,
  // egyenként 16-20 útmutatóval.
  //
  // MIÉRT ÉPP MOST: mérve (28 nap) a Bing 832 megjelenést és 11 kattintást
  // hozott, a Google 108-at és 1-et — és a Bing indexéből dolgozik a ChatGPT
  // keresője is. 2026-08-25-én a Perplexity ELŐSZÖR küldött hozzánk látogatót.
  // Ez a fájl tehát már nem elméleti.
  //
  // ⚠️ A HASZNA NINCS MÉRVE. Nem tudjuk, ki olvassa ezt a fájlt — a .txt-n
  // nincs mérőkódunk. A döntés az ÁRON áll, nem a bizonyítékon: a generálás
  // ingyenes és determinisztikus. Ne állítsuk, hogy ettől jönnek a látogatók.
  const guideList = articles.filter(a => a.isGuide);
  const sorrend = (a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '');
  const sor = a => `- [${a.title}](${SITE.url}/article/${a.slug})`;

  const cegek = new Map();
  for (const a of guideList) {
    const c = a.company || a.tool || '';
    if (!c) continue;
    if (!cegek.has(c)) cegek.set(c, []);
    cegek.get(c).push(a);
  }
  // KÉT FÁJL, ahogy a konvenció (llmstxt.org) kéri:
  //   llms.txt       — TÖMÖR térkép, eszközönként 5 példa (~12 KB)
  //   llms-full.txt  — a TELJES útmutató-lista (~45 KB)
  // Az elsőt az olvassa, aki gyorsan tájékozódna; a másodikat az, aki
  // mindent akar. Egyetlen 45 KB-os fájllal mindkettőt rosszul szolgálnánk:
  // a tömörséget kérőnek túl sok, és a csonkolás kockázatát is vállalnánk.
  const toolBlokk = max => [...cegek]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([c, lista]) => `### ${c}\n`
      + lista.sort(sorrend).slice(0, max).map(sor).join('\n')
      + (lista.length > max ? `\n- [… and ${lista.length - max} more ${c} guides](${SITE.url}/tools)` : ''))
    .join('\n\n');
  const byTool = toolBlokk(5);
  const byToolFull = toolBlokk(Infinity);

  // A cég nélküli, általános útmutatók (e-mail, tanulás, utazás, biztonság).
  const general = guideList.filter(a => !(a.company || a.tool)).sort(sorrend).slice(0, 30);
  const topGuides = general.map(a => `- [${a.title}](${SITE.url}/article/${a.slug}): ${a.subtitle}`).join('\n');

  const latestNews = articles.filter(a => !a.isGuide).sort(sorrend).slice(0, 12)
    .map(a => `- [${a.title}](${SITE.url}/article/${a.slug})`).join('\n');
  const llms = `# ${SITE.name}

> AI news and step-by-step how-to guides for everyday people, written in plain English (no jargon). Every technical term is explained; every guide is written so a complete beginner can follow it.${langSentence(SITE_LANGS)}

## Main sections

- [Latest AI news](${SITE.url}/): daily plain-language news about ChatGPT, Gemini, Claude, Copilot and other AI tools
- [Everyday guides](${SITE.url}/guides): practical how-to guides for daily life (email, study, travel, safety, work)
- [AI tool guides](${SITE.url}/tools): beginner guides organized by tool — ChatGPT, Gemini, Claude, Copilot, Perplexity and more
- [RSS feed](${SITE.url}/feed.xml)
- [Sitemap](${SITE.url}/sitemap.xml)
- [Full guide list](${SITE.url}/llms-full.txt): every guide we have published, grouped by tool

## Guides by AI tool

Step-by-step guides grouped by the tool they teach. Every guide is written for
a complete beginner: what to click, what you will see, and what to do if your
screen looks different.

${byTool}

## Everyday guides (no specific tool)

${topGuides}

## Latest news

${latestNews}

## About

Original content by ${SITE.name} — written and quality-checked by an autonomous editorial system, following a strict beginner-clarity rulebook (every step says what to do, what you'll see, and what to do if your screen looks different). When quoting, please link back to the article.
`;
  writeFileSync(join(OUT_DIR, 'llms.txt'), llms, 'utf-8');

  // A TELJES lista: ugyanaz a fejléc, de eszközönként MINDEN útmutató, és
  // az összes cég nélküli is. A hírek innen kimaradnak — azok 90 nap után
  // törlődnek, a térképnek az ÖRÖKZÖLD tartalmat érdemes tükröznie.
  const llmsFull = llms
    .replace('## Guides by AI tool', '## All guides by AI tool')
    .replace(byTool, byToolFull)
    .replace(topGuides, guideList.filter(a => !(a.company || a.tool)).sort(sorrend)
      .map(a => `- [${a.title}](${SITE.url}/article/${a.slug})`).join('\n'));
  writeFileSync(join(OUT_DIR, 'llms-full.txt'), llmsFull, 'utf-8');
  console.log(`✅ llms.txt (${Math.round(llms.length / 1024)} KB) + llms-full.txt (${Math.round(llmsFull.length / 1024)} KB) generálva`);

  // IndexNow kulcsfájl (a .txt-t a szép-URL nem irányítja át, sima 200)
  if (VERIFY.indexnow) {
    writeFileSync(join(OUT_DIR, `${VERIFY.indexnow}.txt`), VERIFY.indexnow, 'utf-8');
    console.log('✅ IndexNow kulcsfájl generálva');
  }

  // Google Search Console fájlos igazolás (a fájl TARTALMA kötelezően ez a formátum).
  // A .html-t a Pages "szép URL"-je 308-cal átirányítaná (a Google pontos 200-at
  // vár), ezért a tartalmat .txt MÁSOLATBAN is kitesszük, és a _redirects a
  // .html címet arra rewrite-olja (200, cím-változás nélkül).
  if (VERIFY.googleFile) {
    const verifyBody = `google-site-verification: ${VERIFY.googleFile}`;
    writeFileSync(join(OUT_DIR, VERIFY.googleFile), verifyBody, 'utf-8');
    writeFileSync(join(OUT_DIR, 'google-verify.txt'), verifyBody, 'utf-8');
    console.log(`✅ ${VERIFY.googleFile} (Search Console igazolás)`);
  }

  // _redirects — a pages.dev "ál-domain" ELTÜNTETÉSE (user-kérés 2026-07-03):
  // aki a régi aiworldco.pages.dev címen jön, 301-gyel a saját domainre kerül.
  // A 301 a Google-nek is szól: a rangsor-erő átköltözik az új címre.
  // FIGYELEM: csak akkor élesíthető, ha a custom domain már AKTÍV a Pages-en!
  // + A Google-igazoló fájlt a "szép URL" 308-as átirányítása ALÓL kivesszük
  //   (200-as rewrite önmagára): a Search Console pontos 200-at vár.
  const verifyRule = VERIFY.googleFile ? `/${VERIFY.googleFile} /google-verify.txt 200\n` : '';

  // ===================================================================
  // ÁTNEVEZETT CIKKEK 301-e (2026-07-27) — a Search Console 404-jeinek oka.
  // ===================================================================
  // Az URL korábban a CÍMBŐL készült, ezért egy átdolgozás (új cím) némán
  // ELKÖLTÖZTETTE az oldalt, és a Google által már indexelt régi cím 404 lett.
  // Példa a GSC-ből: /hu/article/automate-basic-email-replies-in-outlook-with-
  // meta-ai — a cikk ÉL, csak "Turn a short note into a polished email reply…"
  // címmel. A 404 nem csak elveszett látogató: elveszett rangsor-erő is.
  // Ezért minden EREDETI (fájlnévbe fagyott) slugról 301-et adunk a mostanira,
  // mind az 5 nyelven. A .html-es alakot a Cloudflare előbb 308-cal levágja,
  // úgyhogy elég a kiterjesztés nélküli szabály.
  // (Cloudflare Pages korlát: 2100 statikus szabály — ezért figyeljük a számot.)
  // MINDKÉT alakra kell szabály: a Cloudflare csak LÉTEZŐ fájlnál vágja le a
  // .html-t 308-cal — egy megszűnt címnél nem, az simán 404. A Google pedig
  // mindkét formát indexelte (a GSC-példák közt .html-es és anélküli is van).
  const rule = (from, to) => SITE_LANGS.flatMap(l => {
    const lp = langPrefix(l);
    return [`${lp}/article/${from} ${lp}/article/${to} 301`,
            `${lp}/article/${from}.html ${lp}/article/${to} 301`];
  });

  // ELSŐ HELYEN a BIZONYÍTOTT régi címek: a content/slug-history.json a git
  // -történetből gyűjtött CÍMEKBŐL készült, márpedig a build MINDIG a címből
  // képezte az URL-t — tehát ezek tényleg ÉLTEK. (A GSC két valódi 404-es
  // példáját is ez fedi le.) A fájlnév ezzel szemben sokszor csak belső
  // téma-azonosító, ami sosem volt nyilvános cím — az csak "hátha" tipp,
  // ezért kerül a lista VÉGÉRE: ha a plafon miatt vágni kell, az essen ki.
  const redirectLines = [];
  const covered = new Set();
  try {
    const hist = JSON.parse(readFileSync(join(PROJECT_ROOT, 'content', 'slug-history.json'), 'utf-8'));
    for (const [from, to] of Object.entries(hist)) {
      if (from === to) continue;
      redirectLines.push(...rule(from, to));
      covered.add(from);
    }
    console.log(`✅ ${Object.keys(hist).length} bizonyított régi cím a git-történetből`);
  } catch { /* nincs slug-history — csak a fájlnév-alapú tippek mennek ki */ }

  for (const [from, to] of RENAMED_SLUGS) {
    if (covered.has(from)) continue;
    redirectLines.push(...rule(from, to));
  }
  // Cloudflare Pages: 2100 statikus szabály a plafon. Biztonsági vágás kell:
  // inkább maradjon ki néhány régi átirányítás, mint hogy az EGÉSZ _redirects
  // érvénytelen legyen (a pages.dev-szabállyal együtt, ami a domain-egyesítést
  // végzi). A BIZONYÍTOTT címek elöl vannak, tehát a vágás a tippeket éri.
  const CAP = 2000;
  const nyers = redirectLines.length;
  if (nyers > CAP) {
    console.log(`   ⚠️  ${nyers} átirányítás > ${CAP} — a lista vágva (Cloudflare-korlát 2100).`);
    redirectLines.length = CAP;
  }
  // ŐRSZEM (2026-08-15). Ez a szám egyszer már ÉSZREVÉTLENÜL kúszott a plafon
  // 83%-áig, napi +22 sorral. A vágás figyelmeztetése CSAK a CI naplójába ment
  // volna — ugyanaz a minta, mint a 08-10-i i18n-őrszemnél: **az őrszem csak
  // akkor őr, ha oda szól, ahol a user néz.** Ezért állapotfájl megy a napi
  // riportba, és NEM a szakadéknál szólal meg, hanem 75%-nál — hogy legyen idő.
  try {
    const arany = nyers / CAP;
    const problems = [];
    if (nyers > CAP) problems.push({ code: 'REDIRECTS_TRUNCATED', count: nyers, cap: CAP });
    else if (arany >= 0.75) problems.push({ code: 'REDIRECTS_NEAR_CAP', count: nyers, cap: CAP, pct: Math.round(arany * 100) });
    mkdirSync(join(PROJECT_ROOT, 'memory'), { recursive: true });
    writeFileSync(join(PROJECT_ROOT, 'memory', 'redirect-guard.json'),
      JSON.stringify({ at: new Date().toISOString(), count: nyers, cap: CAP, problems }, null, 2), 'utf-8');
  } catch { /* a build ettől soha ne bukjon el */ }
  const renameRules = redirectLines.length ? redirectLines.join('\n') + '\n' : '';
  if (RENAMED_SLUGS.size) console.log(`✅ ${RENAMED_SLUGS.size} átnevezett cikk 301-e (${redirectLines.length} szabály, 5 nyelv)`);
  // KIVEZETETT NYELVEK (2026-07-31): a /de/… és /fr/… címek az ANGOL cikkre
  // mennek. Joker-szabállyal, tehát 1158 oldal helyett KÉT sor — ez fontos,
  // mert a Cloudflare-korlát 2100, és a slug-történet már 2000-et elvisz.
  // A ":splat" a csillag helyére illeszkedő részt teszi vissza, így
  // /de/article/valami → /article/valami.
  // A régi (301-es) címek így SOSEM adnak 404-et, és a linkerő is átmegy.
  const retiredLangRules = RETIRED_LANGS.map(l => `/${l}/* /:splat 301`).join('\n') + '\n';

  // HOST-EGYESÍTÉS (www + pages.dev → fő domain): NEM ITT történik!
  //
  // 2026-07-31, KINTRŐL MÉRVE derült ki: a Cloudflare Pages az ABSZOLÚT CÍMES
  // forrás-szabályt (https://www.… /* → …) NÉMÁN FIGYELMEN KÍVÜL HAGYJA.
  // A régi "https://aiworldco.pages.dev/* → …" sorunk is halott volt a
  // kezdetektől — a pages.dev végig 200-zal szolgált ki, csak senki nem mérte
  // meg kintről. A szabály megléte nem bizonyíték; csak a mért 301 az.
  //
  // A MŰKÖDŐ út: functions/_middleware.js (a repó gyökerében) — minden nem
  // fő-domaines kérést 301-gyel átküld. A halott sorokat kivettük, hogy ne
  // keltsenek hamis biztonságérzetet. Az őrszem: core/live-guard.js kintről
  // méri a www-t ÉS a pages.dev-et minden futásban.
  writeFileSync(join(OUT_DIR, '_redirects'), `${verifyRule}${renameRules}${retiredLangRules}`, 'utf-8');
  console.log('✅ _redirects generálva (pages.dev → saját domain, 301)');

  // _headers — biztonsági fejlécek (CF Security Center javaslat, 2026-07-11):
  // HSTS (1 év, aldomainekkel) + alap védelmi fejlécek. A Pages ezt a fájlt
  // minden válaszhoz hozzáfűzi.
  writeFileSync(join(OUT_DIR, '_headers'), `/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
`, 'utf-8');
  console.log('✅ _headers generálva (HSTS + biztonsági fejlécek)');

  // security.txt — szabványos biztonsági kapcsolat-fájl (RFC 9116; a CF
  // Security Center hiányolta). Kapcsolat: a support-oldal (nem személyes e-mail).
  const swkDir = join(OUT_DIR, '.well-known');
  mkdirSync(swkDir, { recursive: true });
  const expires = new Date(Date.now() + 365 * 86400e3).toISOString();
  writeFileSync(join(swkDir, 'security.txt'), `Contact: ${SITE.url}/support.html
Expires: ${expires}
Preferred-Languages: en, hu, es, de, fr
Canonical: ${SITE.url}/.well-known/security.txt
`, 'utf-8');
  console.log('✅ .well-known/security.txt generálva');

  // 404.html — KRITIKUS SEO-elem: enélkül a Cloudflare Pages "egyoldalas app"
  // módban MINDEN ismeretlen címre a főoldalt adja 200-zal (soft-404, a Google
  // bünteti). Ha van 404.html a gyökérben, a Pages valódi 404-et szolgál ki.
  // Csak abszolút útvonalak (/assets/...), mert bármilyen mélységű URL-en jelenhet meg.
  const notFoundBody = `<section class="guides-hero" style="text-align:center">
    <p class="intro__kicker">404</p>
    <h1 class="guides-hero__title">This page has wandered off</h1>
    <p class="guides-hero__tag">The link may be old, or the address has a typo. No worries — everything useful is one tap away.</p>
    <p style="margin-top:22px"><a class="support__btn" style="display:inline-block" href="/">← Back to the homepage</a></p>
    <p style="margin-top:14px"><a href="/guides">Everyday guides</a> · <a href="/tools">AI tool guides</a></p>
    <p style="margin-top:26px;font-size:13px;color:var(--ink-soft)">
      ${SITE_LANGS.filter(l => l !== 'en').map(l => `<a href="/${l}/">${LANG_NAME[l]}</a>`).join(' · ')}
    </p>
  </section>`;
  writeFileSync(join(OUT_DIR, '404.html'), pageShell({
    title: `Page not found — ${SITE.name}`,
    description: 'This page does not exist. Head back to the homepage for fresh AI news and guides.',
    noIntro: true, pagePath: '404.html',
    bodyContent: notFoundBody
  }), 'utf-8');
  console.log('✅ 404.html generálva (soft-404 megszüntetve)');

  console.log('─'.repeat(60));
  console.log(`✨ Kész! Nyisd meg: website/public/index.html`);
}

main();
