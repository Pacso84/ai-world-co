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
// Kereső-igazoló kódok (Google Search Console / Bing Webmaster) — a config
// company.google_site_verification / bing_site_verification mezőiből; ha üres,
// nem kerül meta-tag az oldalba.
let VERIFY = { google: '', bing: '' };
try {
  const company = JSON.parse(readFileSync(join(PROJECT_ROOT, 'config.json'), 'utf-8')).company || {};
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
const SITE_LANGS = ['en', 'hu', 'es', 'de', 'fr'];   // en = forrás/gyökér
const HTML_LANG = { en: 'en-AU', hu: 'hu', es: 'es', de: 'de', fr: 'fr' };
const LANG_NAME = { en: 'English', hu: 'Magyar', es: 'Español', de: 'Deutsch', fr: 'Français' };

// UI-szótár (a honlap "váza" — menü, hero, feliratok). A cikkek tartalmát a
// fordító agent fordítja; ezek a fix felületi szövegek.
const UI = {
  en: { news: 'News', guides: '📘 Guides', tools: '🧰 AI tools', support: '☕ Support',
        heroKicker: 'Issue 01', heroTitle: 'Everyday AI, <em>explained simply.</em>',
        minRead: 'min read', stepByStep: 'Step-by-step',
        guidesTitle: 'Everyday AI <em>skills</em>', guidesTag: 'Plain-language how-tos that work with any assistant — ChatGPT, Gemini, Claude or others.',
        toolsTitle: 'Guides by <em>AI tool</em>', toolsTag: 'Pick your assistant for tool-specific how-tos.',
        footerNote: 'Written and curated by autonomous AI agents · Reviewed for accuracy', back: '← Back', language: 'Language' },
  hu: { news: 'Hírek', guides: '📘 Útmutatók', tools: '🧰 AI eszközök', support: '☕ Támogatás',
        heroKicker: '01. szám', heroTitle: 'A hétköznapi AI, <em>érthetően.</em>',
        minRead: 'perc olvasás', stepByStep: 'Lépésről lépésre',
        guidesTitle: 'Hétköznapi AI <em>készségek</em>', guidesTag: 'Közérthető útmutatók, amelyek bármelyik asszisztenssel működnek — ChatGPT, Gemini, Claude és társai.',
        toolsTitle: 'Útmutatók <em>AI eszköz</em> szerint', toolsTag: 'Válaszd ki az asszisztensed az eszköz-specifikus útmutatókhoz.',
        footerNote: 'Önálló AI-ügynökök írják és gondozzák · Pontosságra ellenőrizve', back: '← Vissza', language: 'Nyelv' },
  es: { news: 'Noticias', guides: '📘 Guías', tools: '🧰 Herramientas IA', support: '☕ Apóyanos',
        heroKicker: 'Número 01', heroTitle: 'La IA cotidiana, <em>explicada fácil.</em>',
        minRead: 'min de lectura', stepByStep: 'Paso a paso',
        guidesTitle: 'Habilidades de <em>IA cotidiana</em>', guidesTag: 'Guías en lenguaje claro que funcionan con cualquier asistente — ChatGPT, Gemini, Claude y más.',
        toolsTitle: 'Guías por <em>herramienta de IA</em>', toolsTag: 'Elige tu asistente para guías específicas.',
        footerNote: 'Escrito y curado por agentes de IA autónomos · Revisado para mayor precisión', back: '← Volver', language: 'Idioma' },
  de: { news: 'News', guides: '📘 Anleitungen', tools: '🧰 KI-Tools', support: '☕ Unterstützen',
        heroKicker: 'Ausgabe 01', heroTitle: 'Alltags-KI, <em>einfach erklärt.</em>',
        minRead: 'Min. Lesezeit', stepByStep: 'Schritt für Schritt',
        guidesTitle: 'Alltags-<em>KI-Können</em>', guidesTag: 'Verständliche Anleitungen für jeden Assistenten — ChatGPT, Gemini, Claude und mehr.',
        toolsTitle: 'Anleitungen nach <em>KI-Tool</em>', toolsTag: 'Wähle deinen Assistenten für tool-spezifische Anleitungen.',
        footerNote: 'Geschrieben und kuratiert von autonomen KI-Agenten · Auf Richtigkeit geprüft', back: '← Zurück', language: 'Sprache' },
  fr: { news: 'Actus', guides: '📘 Guides', tools: '🧰 Outils IA', support: '☕ Soutenir',
        heroKicker: 'Numéro 01', heroTitle: "L'IA au quotidien, <em>expliquée simplement.</em>",
        minRead: 'min de lecture', stepByStep: 'Pas à pas',
        guidesTitle: 'Compétences <em>IA du quotidien</em>', guidesTag: 'Des guides clairs qui marchent avec tout assistant — ChatGPT, Gemini, Claude et autres.',
        toolsTitle: 'Guides par <em>outil IA</em>', toolsTag: 'Choisissez votre assistant pour des guides dédiés.',
        footerNote: 'Écrit et curé par des agents IA autonomes · Vérifié pour l’exactitude', back: '← Retour', language: 'Langue' }
};

// További felületi feliratok (homepage + cikk-chrome)
const UI_EXTRA = {
  en: { coverStory: 'Cover Story', edit: 'The Edit', latestNews: 'Latest <span class="muted-word">news</span>', all: 'All', personal: '🏠 Everyday life', business: '💼 Business', ctaTitle: 'New to AI? Start with our step-by-step guides', ctaText: 'Browse practical how-tos by tool and task — everyday and business.', backStories: '← Back to all stories', noStories: 'No stories yet', noStoriesNote: 'Our AI newsroom is gathering the latest. Check back soon.' },
  hu: { coverStory: 'Címlapsztori', edit: 'A válogatás', latestNews: 'Friss <span class="muted-word">hírek</span>', all: 'Mind', personal: '🏠 Hétköznapok', business: '💼 Üzlet', ctaTitle: 'Új vagy az AI-ban? Kezdd a lépésről-lépésre útmutatókkal', ctaText: 'Böngéssz gyakorlati útmutatókat eszköz és feladat szerint — hétköznapi és üzleti.', backStories: '← Vissza a hírekhez', noStories: 'Még nincs cikk', noStoriesNote: 'Az AI-szerkesztőségünk épp gyűjti a legfrissebbeket. Nézz vissza hamarosan.' },
  es: { coverStory: 'Portada', edit: 'La selección', latestNews: 'Últimas <span class="muted-word">noticias</span>', all: 'Todo', personal: '🏠 Día a día', business: '💼 Negocios', ctaTitle: '¿Nuevo en la IA? Empieza con nuestras guías paso a paso', ctaText: 'Explora guías prácticas por herramienta y tarea — cotidianas y de negocio.', backStories: '← Volver a las noticias', noStories: 'Aún no hay artículos', noStoriesNote: 'Nuestra redacción de IA está recopilando lo último. Vuelve pronto.' },
  de: { coverStory: 'Titelstory', edit: 'Die Auswahl', latestNews: 'Aktuelle <span class="muted-word">News</span>', all: 'Alle', personal: '🏠 Alltag', business: '💼 Business', ctaTitle: 'Neu bei KI? Starte mit unseren Schritt-für-Schritt-Anleitungen', ctaText: 'Durchstöbere praktische Anleitungen nach Tool und Aufgabe — Alltag und Business.', backStories: '← Zurück zu den News', noStories: 'Noch keine Beiträge', noStoriesNote: 'Unsere KI-Redaktion sammelt gerade das Neueste. Schau bald wieder vorbei.' },
  fr: { coverStory: 'À la une', edit: 'La sélection', latestNews: 'Dernières <span class="muted-word">actus</span>', all: 'Tout', personal: '🏠 Quotidien', business: '💼 Pro', ctaTitle: "Nouveau dans l'IA ? Commencez par nos guides pas à pas", ctaText: 'Parcourez des guides pratiques par outil et tâche — quotidien et pro.', backStories: '← Retour aux actus', noStories: 'Pas encore d’articles', noStoriesNote: 'Notre rédaction IA rassemble les dernières infos. Revenez bientôt.' }
};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_EXTRA[l] || {});

// Útmutató-oldalak + cikk-lábléc feliratai (a user jelezte: angolul maradtak)
const UI_GUIDES = {
  en: { tagline: 'AI news, in plain language', forEveryone: 'For everyone',
        lvl_beginner: 'beginner', lvl_intermediate: 'intermediate', lvl_advanced: 'advanced',
        guideWordOne: 'guide', guideWordMany: 'guides',
        pickTool: 'Pick the AI tool you use to jump to its step-by-step guides.',
        companyGuides: '{c} <span class="muted-word">guides</span>',
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
        comingSoon: 'Las guías están en camino — vuelve pronto.',
        audPersonal: 'Día a día', audBusiness: 'Negocios', audBoth: 'Vida y negocios',
        aiSkills: 'Habilidades de IA', coverSub: 'Para el día a día', exampleLabel: 'Ejemplo', tryTyping: 'Escribe esto', xrefNews: 'La noticia detrás de esta guía', xrefGuide: '¿Quieres probarlo? Guía paso a paso',
        disclosureNews: '✦ Artículo original escrito por el equipo editorial de IA de AI World HQ Revisado para mayor precisión y claridad.',
        disclosureGuide: '✦ Guía original paso a paso del equipo editorial de IA de AI World HQ Escrita en lenguaje claro y revisada para mayor precisión.' },
  de: { tagline: 'KI-News, verständlich erklärt', forEveryone: 'Für alle',
        lvl_beginner: 'Einsteiger', lvl_intermediate: 'Mittelstufe', lvl_advanced: 'Profi',
        guideWordOne: 'Anleitung', guideWordMany: 'Anleitungen',
        pickTool: 'Wähle dein KI-Tool und spring direkt zu seinen Schritt-für-Schritt-Anleitungen.',
        companyGuides: '{c}-<span class="muted-word">Anleitungen</span>',
        comingSoon: 'Die Anleitungen sind unterwegs — schau bald wieder vorbei.',
        audPersonal: 'Alltag', audBusiness: 'Business', audBoth: 'Alltag & Business',
        aiSkills: 'KI-Können', coverSub: 'Für den Alltag', exampleLabel: 'Beispiel', tryTyping: 'Tipp das ein', xrefNews: 'Die News hinter dieser Anleitung', xrefGuide: 'Ausprobieren? Schritt-für-Schritt-Anleitung',
        disclosureNews: '✦ Originalartikel, geschrieben vom KI-Redaktionsteam von AI World HQ Auf Richtigkeit und Klarheit geprüft.',
        disclosureGuide: '✦ Original-Schritt-für-Schritt-Anleitung vom KI-Redaktionsteam von AI World HQ Verständlich geschrieben, auf Richtigkeit geprüft.' },
  fr: { tagline: "L'actu IA, en langage clair", forEveryone: 'Pour tous',
        lvl_beginner: 'débutant', lvl_intermediate: 'intermédiaire', lvl_advanced: 'avancé',
        guideWordOne: 'guide', guideWordMany: 'guides',
        pickTool: "Choisissez l'outil IA que vous utilisez pour accéder à ses guides pas à pas.",
        companyGuides: '<span class="muted-word">Guides</span> {c}',
        comingSoon: 'Les guides arrivent — revenez bientôt.',
        audPersonal: 'Quotidien', audBusiness: 'Pro', audBoth: 'Perso & pro',
        aiSkills: 'Compétences IA', coverSub: 'Pour tous les jours', exampleLabel: 'Exemple', tryTyping: 'Essayez ceci', xrefNews: "L'actu derrière ce guide", xrefGuide: "Envie d'essayer ? Guide pas à pas",
        disclosureNews: "✦ Article original rédigé par l'équipe éditoriale IA d'AI World HQ Vérifié pour l'exactitude et la clarté.",
        disclosureGuide: "✦ Guide original pas à pas de l'équipe éditoriale IA d'AI World HQ Rédigé en langage clair, vérifié pour l'exactitude." }
};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_GUIDES[l] || {});

// Nap-feliratok a 7 napos hír-archívumhoz
const UI_DAYS = {
  en: { past7: 'Past 7 days', today: 'Today', yesterday: 'Yesterday' },
  hu: { past7: 'Az elmúlt 7 nap', today: 'Ma', yesterday: 'Tegnap' },
  es: { past7: 'Últimos 7 días', today: 'Hoy', yesterday: 'Ayer' },
  de: { past7: 'Letzte 7 Tage', today: 'Heute', yesterday: 'Gestern' },
  fr: { past7: '7 derniers jours', today: "Aujourd'hui", yesterday: 'Hier' }
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
  de: { siteDesc: 'KI-News und Anleitungen für alle — frisch, freundlich, ohne Fachchinesisch.',
        supPill: 'Unterstütze uns', supTitle: 'Halte Alltags-KI <em>für alle kostenlos</em>',
        supLead: 'AI World ist ein kleines, unabhängiges Projekt — ein Team aus KI-Agenten und einem einzigen Menschen —, das klare, jargonfreie Anleitungen rund um KI veröffentlicht. Die Seite bleibt kostenlos und fast werbefrei. Wenn sie dir hilft, kannst du etwas zu den laufenden Kosten beisteuern.',
        supCard1h: 'Hosting &amp; Domain', supCard1p: 'Damit die Seite online, schnell und für alle erreichbar bleibt.',
        supCard2h: 'Die KI-Redaktion', supCard2p: 'Die Modelle, die jeden Artikel recherchieren, schreiben, prüfen und verbessern.',
        supCard3h: 'Eigene Illustrationen', supCard3p: 'Das individuelle Titelbild zu jeder Geschichte.',
        supThanksH: 'An alle, die etwas beisteuern — danke. 💛',
        supThanksP: 'Dank dir bleibt AI World kostenlos, werbearm und offen für alle. Jeder Kaffee hilft beim Hosting und treibt die kleine KI-Redaktion hinter jedem Artikel an. Wir sind ein winziges unabhängiges Team — es bedeutet uns wirklich viel.',
        supNote: 'Uns zu unterstützen ist völlig freiwillig — die Seite bleibt so oder so kostenlos. Wir sind ein kleines unabhängiges Projekt und keine eingetragene Wohltätigkeitsorganisation; dein Beitrag ist ein freundliches <strong>freiwilliges Trinkgeld</strong>, keine steuerlich absetzbare Spende. Danke fürs Lesen. 💛',
        supSoon: 'bald verfügbar', supMetaTitle: 'Unterstützen',
        supMetaDesc: 'Hilf mit, dass AI World kostenlos und werbearm bleibt. Ein kleines freiwilliges Trinkgeld deckt Hosting und die KI hinter jedem Artikel.' },
  fr: { siteDesc: 'Actus et guides IA pour tous — clairs, chaleureux, sans jargon.',
        supPill: 'Soutenez-nous', supTitle: "Gardons l'IA du quotidien <em>gratuite pour tous</em>",
        supLead: "AI World est un petit projet indépendant — une équipe d'agents IA et un seul humain — qui publie des guides clairs et sans jargon sur l'IA. Le site reste gratuit et presque sans publicité. S'il vous est utile, vous pouvez contribuer aux frais de fonctionnement.",
        supCard1h: 'Hébergement &amp; domaine', supCard1p: 'Garder le site en ligne, rapide et accessible à tous.',
        supCard2h: 'La rédaction IA', supCard2p: 'Les modèles qui recherchent, écrivent, vérifient et améliorent chaque article.',
        supCard3h: 'Illustrations originales', supCard3p: "L'image de couverture créée pour chaque article.",
        supThanksH: 'À tous ceux qui contribuent — merci. 💛',
        supThanksP: "Grâce à vous, AI World reste gratuit, peu publicitaire et ouvert à tous. Chaque café aide à couvrir l'hébergement et fait tourner la petite rédaction IA derrière chaque article. Nous sommes une toute petite équipe indépendante — cela compte énormément.",
        supNote: "Nous soutenir est entièrement facultatif — le site reste gratuit quoi qu'il arrive. Nous sommes un petit projet indépendant, pas une association caritative enregistrée : votre contribution est un <strong>pourboire volontaire</strong>, pas un don déductible des impôts. Merci de nous lire. 💛",
        supSoon: 'bientôt disponible', supMetaTitle: 'Soutenir',
        supMetaDesc: "Aidez AI World à rester gratuit et presque sans publicité. Un petit pourboire volontaire couvre l'hébergement et l'IA qui écrit chaque article." }
};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_SUPPORT[l] || {});

// Folyamat-térkép feliratok (útmutató-oldal tetején lévő lépés-áttekintő)
const UI_MAP = {
  en: { mapTitle: 'Your roadmap', mapSteps: 'steps' },
  hu: { mapTitle: 'Így fogod csinálni', mapSteps: 'lépés' },
  es: { mapTitle: 'Así lo harás', mapSteps: 'pasos' },
  de: { mapTitle: 'So gehst du vor', mapSteps: 'Schritte' },
  fr: { mapTitle: 'Votre parcours', mapSteps: 'étapes' }
};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_MAP[l] || {});

// VALÓDI lapszám: hány külön napon jelent meg tartalom (a main() számolja ki).
// A user jelezte: fixen "Issue 01"-et írt a dátum mellett — az nem igaz.
let ISSUE_NO = 1;

// Aktuális nyelv-állapot (a build ciklus állítja nyelvenként)
let LANG = 'en';
let LP = '';            // útvonal-prefix: '' (en) vagy '/hu' stb.
let T = UI.en;          // aktuális UI-szótár
function tr(k) { return (T && T[k] != null) ? T[k] : (UI.en[k] != null ? UI.en[k] : ''); }

function langPrefix(l) { return l === 'en' ? '' : `/${l}`; }

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
    bodyHtml: wrapTables(wrapImpactSection(marked.parse(body))),
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

const DATE_LOCALES = { en: 'en-AU', hu: 'hu-HU', es: 'es-ES', de: 'de-DE', fr: 'fr-FR' };
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(DATE_LOCALES[LANG] || 'en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
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
    return `<aside class="xref xref--news"><span class="xref__lbl">📰 ${tr('xrefNews')}</span>
      <a class="xref__link" href="${news.slug}.html"><span class="xref__t">${escapeHtml(news.title)}</span><span class="xref__arrow">→</span></a></aside>`;
  }
  // hír → kapcsolódó útmutató
  const guide = a.relatedGuideTopic ? XREF.guideByTopic.get(a.relatedGuideTopic) : null;
  if (!guide) return '';
  return `<aside class="xref xref--guide"><span class="xref__lbl">📘 ${tr('xrefGuide')}</span>
    <a class="xref__link" href="${guide.slug}.html"><span class="xref__t">${escapeHtml(guide.title)}</span><span class="xref__arrow">→</span></a></aside>`;
}

// ===================================================================
// HTML SABLONOK
// ===================================================================

function pageShell({ title, description, bodyContent, isArticle = false, noIntro = false, ogImage = '', keywords = '', jsonld = null, pagePath = '' }) {
  // ABSZOLÚT útvonalak (gyökértől) — így a /hu/article/... mélységnél is jók.
  const homePath = `${LP}/`;
  const supportPath = `${LP}/support.html`;
  const guidesPath = `${LP}/guides.html`;
  const toolsPath = `${LP}/tools.html`;
  const year = new Date().getFullYear();
  const url = `${SITE.url}${LP}/${pagePath}`;
  const img = ogImage || (SITE.url + '/assets/logo.svg');
  // hreflang + nyelvváltó (minden oldalnak ugyanaz a pagePath-ja minden nyelven)
  const hreflang = SITE_LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${SITE.url}${langPrefix(l)}/${pagePath}">`).join('\n  ')
    + `\n  <link rel="alternate" hreflang="x-default" href="${SITE.url}/${pagePath}">`;
  const langSwitcher = `<select class="lang-select" onchange="if(this.value)location.href=this.value" aria-label="${T.language}" style="background-color:var(--card);color:var(--ink);border:1px solid var(--line-strong);border-radius:8px;font:inherit;font-size:13px;padding:7px 6px;cursor:pointer;color-scheme:light dark">
        ${SITE_LANGS.map(l => `<option value="${SITE.url}${langPrefix(l)}/${pagePath}" ${l === LANG ? 'selected' : ''} style="background-color:var(--card);color:var(--ink)">${LANG_NAME[l]}</option>`).join('')}
      </select>`;
  return `<!DOCTYPE html>
<html lang="${HTML_LANG[LANG] || 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  ${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
  <link rel="canonical" href="${escapeHtml(url)}">
  ${hreflang}
  <!-- Open Graph (közösségi megosztás) -->
  <meta property="og:type" content="${isArticle ? 'article' : 'website'}">
  <meta property="og:site_name" content="${SITE.name}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(img)}">
  <meta property="og:locale" content="${(HTML_LANG[LANG] || 'en').replace('-', '_')}">
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(img)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:ital,wght@0,400..900;1,400..700&family=Hanken+Grotesk:wght@400..700&display=swap" rel="stylesheet">
  <link rel="icon" type="image/svg+xml" href="/assets/logo.svg">
  <link rel="stylesheet" href="https://unpkg.com/aos@2.3.4/dist/aos.css">
  <link rel="stylesheet" href="/assets/style.css?v=${ASSET_V}">
  <link rel="alternate" type="application/rss+xml" title="${escapeHtml(SITE.name)} RSS" href="/feed.xml">
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
        <a href="${homePath}">${T.news}</a>
        <a href="${guidesPath}">${T.guides}</a>
        <a href="${toolsPath}">${T.tools}</a>
        ${SUPPORT.enabled ? `<a href="${supportPath}" class="navbar__support">${T.support}</a>` : ''}
      </nav>
      ${langSwitcher}
      <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode" title="Light / dark">
        <span class="theme-toggle__icon">☾</span>
      </button>
      <button class="navbar__burger" id="navBurger" aria-label="Menu" aria-expanded="false" aria-controls="navMenu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </header>${(isArticle || noIntro) ? '' : `
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
      ${SUPPORT.enabled ? `<p class="site-footer__support"><a href="${supportPath}">${T.support}</a></p>` : ''}
      <p class="site-footer__fine">${T.footerNote} · © ${year} AI World HQ</p>
    </div>
  </footer>
  <script src="https://unpkg.com/aos@2.3.4/dist/aos.js"></script>
  <script src="/assets/app.js?v=${ASSET_V}"></script>
</body>
</html>`;
}

// Borító: valódi kép (ha van), különben lágy gradiens borító kategória-ikonnal
function coverHtml(a, pathPrefix, cls) {
  const cat = CATEGORIES[a.category] || CATEGORIES.other;
  if (a.image) {
    return `<div class="${cls}"><img src="/assets/images/${a.image}" alt="${escapeHtml(a.title)}" loading="lazy" decoding="async" width="1000" height="563"></div>`;
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
  let recent = articles.filter(a => { const t = new Date(a.publishedAt).getTime(); return t && t >= cutoff; });
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

  const guidesCta = `<a class="guides-cta" href="guides.html">
    <span class="guides-cta__i">📘</span>
    <span class="guides-cta__t"><strong>${tr('ctaTitle')}</strong><br>${tr('ctaText')}</span>
    <span class="guides-cta__arrow">→</span></a>`;

  return pageShell({
    title: `${SITE.name} — ${tr('tagline')}`,
    description: SITE.description,
    ogImage: articles[0]?.image ? `${SITE.url}/assets/images/${articles[0].image}` : '',
    jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: SITE.url, description: SITE.description },
    bodyContent: featuredHtml + guidesCta + grid,
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
  return `<a class="gtile" href="article/${a.slug}.html" data-audience="${a.audience}" style="--gc:${color}">
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
    title: `Everyday AI guides — ${SITE.name}`,
    description: 'Plain-language, step-by-step guides to everyday AI skills: writing prompts, summarising, fact-checking, staying safe and more. Works with any assistant.',
    noIntro: true, pagePath: 'guides.html',
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
  const cnt = n => `${n} ${n > 1 ? tr('guideWordMany') : tr('guideWordOne')}`;

  const brandTile = (c) => `<a class="brandtile" href="#c-${companySlug(c)}" style="--gc:${GUIDE_COVER_COLORS[c] || '#4f7a86'}">
      <span class="brandtile__i">${COMPANY_ICONS[c] || '🤖'}</span>
      <span class="brandtile__n">${escapeHtml(c)}</span><span class="brandtile__c">${cnt(groups[c].length)}</span></a>`;
  const brandRow = companies.length ? `<section class="brandpick">
      <p class="section-note">${tr('pickTool')}</p>
      <div class="brandtiles">${companies.map(brandTile).join('')}</div></section>` : '';
  const companySection = (c) => `<section class="grid-section" id="c-${companySlug(c)}">
      <div class="section-head"><span class="pill">${COMPANY_ICONS[c] || '🤖'} ${escapeHtml(c)}</span>
        <h2 class="section-title">${tr('companyGuides').replace('{c}', escapeHtml(c))}</h2></div>
      <div class="gtiles">${groups[c].map(guideTile).join('')}</div></section>`;

  const header = `<section class="guides-hero">
    <p class="intro__kicker">${tr('stepByStep')}</p>
    <h1 class="guides-hero__title">${tr('toolsTitle')}</h1>
    <p class="guides-hero__tag">${tr('toolsTag')}</p>
  </section>`;
  const empty = `<p class="muted" style="color:var(--ink-soft)">${tr('comingSoon')}</p>`;
  const body = designStyleBlock() + header + (companyGuides.length ? (brandRow + companies.map(companySection).join('')) : empty);
  return pageShell({
    title: `AI tool guides — ${SITE.name}`,
    description: 'Step-by-step guides for specific AI tools: ChatGPT, Gemini, Claude, Copilot, Perplexity and more. Pick your tool and learn what you need.',
    noIntro: true, pagePath: 'tools.html',
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
    <div class="article__body">
      ${a.bodyHtml}
    </div>
    ${tagsHtml}
    ${xrefBox(a)}
    <div class="article__foot">
      <p class="ai-disclosure">${tr('disclosureNews')}</p>
      <a href="../index.html" class="back-link">${tr('backStories')}</a>
    </div>
  </article>`;

  const canonical = `${SITE.url}${LP}/article/${a.slug}.html`;
  const ogImage = a.image ? `${SITE.url}/assets/images/${a.image}` : '';
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: a.title, description: a.seoDescription || a.subtitle,
    image: ogImage || undefined,
    datePublished: a.publishedAt || undefined,
    inLanguage: HTML_LANG[LANG] || 'en',
    author: { '@type': 'Organization', name: SITE.name },
    publisher: { '@type': 'Organization', name: SITE.name },
    mainEntityOfPage: canonical,
    keywords: a.seoKeywords || undefined
  };
  return pageShell({
    title: `${a.title} — ${SITE.name}`,
    description: a.seoDescription || a.subtitle,
    keywords: a.seoKeywords,
    ogImage, jsonld, pagePath: `article/${a.slug}.html`,
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
function guideSectionHtml(bodyMd) {
  // a 💬-vel kezdődő sorokat markdown ELŐTT blokk-szintű dobozzá alakítjuk
  // (1) csak-címke 💬 sor ("💬 **Példa prompt:**") → fűzzük hozzá a következő sort
  let pre = (bodyMd || '').replace(/^([ \t>]*💬[^\n]*:\*{0,2})[ \t]*\n+[ \t]*(?=\S)/gm, '$1 ');
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
  const blocks = sections.map(s => {
    const t = s.title;
    if (STEP_RX.test(t)) {
      stepNo++;
      const heading = t.replace(STEP_RX, '');
      return `<div class="g-step" id="step-${stepNo}"><div class="g-step__no">${stepNo}</div>
        <div class="g-step__grid">
          <div class="g-step__body"><h3 class="g-step__h">${escapeHtml(heading)}</h3>${guideSectionHtml(s.body)}</div>
          ${stepArtHtml(artKeys[stepNo - 1])}
        </div></div>`;
    }
    if (/before you start|before we start|prerequisit|miel[őo]tt elkezd|kezd[ée]s el[őo]tt|antes de (?:empezar|comenzar)|bevor (?:du|sie) (?:loslegst|beginn)|vorbereitung|avant de commencer/i.test(t))
      return `<div class="g-prereq"><div class="g-block__h">✅ ${escapeHtml(t)}</div>${guideSectionHtml(s.body)}</div>`;
    if (/common mistakes|watch out|pitfalls|gyakori hib|err(?:ores|eurs) (?:comunes|frecuentes|courantes|fr[ée]quentes)|h[äa]ufige fehler|pi[èe]ges/i.test(t))
      return `<div class="g-mistakes"><div class="g-block__h">⚠️ ${escapeHtml(t)}</div>${guideSectionHtml(s.body)}</div>`;
    if (/what this means for you|mit jelent (?:ez )?(?:neked|ez neked)|mi ez neked|qu[ée] significa (?:esto )?para ti|was (?:das|dies) f[üu]r (?:dich|sie) bedeutet|ce que cela signifie pour (?:vous|toi)/i.test(t))
      return `<aside class="impact"><div class="impact__label">${escapeHtml(t)}</div>${guideSectionHtml(s.body)}</aside>`;
    if (/try it now|your turn|next step/i.test(t))
      return `<div class="g-try"><div class="g-block__h">🚀 ${escapeHtml(t)}</div>${guideSectionHtml(s.body)}</div>`;
    return `<div class="g-section"><h2>${escapeHtml(t)}</h2>${guideSectionHtml(s.body)}</div>`;
  }).join('\n');

  const toolChip = (a.company || a.tool)
    ? `<span class="g-tool">📘 ${escapeHtml([a.company, a.tool].filter(Boolean).join(' · '))}</span>` : '';
  const levelChip = a.level ? `<span class="g-level">${escapeHtml(a.level)}</span>` : '';
  const stepsTotal = stepHeadings.length;   // többnyelvű STEP_RX-ből (régen csak "Step N"-t értett)

  const body = `<article class="article guide" style="--gc:${GUIDE_COVER_COLORS[a.company] || '#4f7a86'}">
    ${guideCoverHtml(a, 'article__cover')}
    <div class="article__head">
      <div class="article__badges">
        <span class="tag ${cat.cls}">📘 Step-by-step guide</span>
        ${toolChip}${levelChip}
        <span class="aud ${aud.cls}">${aud.icon} ${tr(aud.key)}</span>
      </div>
      <h1 class="article__title">${escapeHtml(a.title)}</h1>
      <p class="article__subtitle">${escapeHtml(a.subtitle)}</p>
      <div class="article__meta"><span>${a.readTime} ${tr('minRead')}</span><span class="dot">·</span><span>${formatDate(a.publishedAt)}</span></div>
    </div>
    ${guideMapHtml(stepHeadings, artKeys)}
    ${intro ? `<div class="g-intro">${guideSectionHtml(intro)}</div>` : ''}
    <div class="g-steps">${blocks}</div>
    ${xrefBox(a)}
    <div class="article__foot">
      <p class="ai-disclosure">${tr('disclosureGuide')}</p>
      <a href="../index.html" class="back-link">${tr('backStories')}</a>
    </div>
  </article>`;

  const canonical = `${SITE.url}${LP}/article/${a.slug}.html`;
  const ogImage = a.image ? `${SITE.url}/assets/images/${a.image}` : '';
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'HowTo',
    name: a.title, description: a.seoDescription || a.subtitle,
    image: ogImage || undefined,
    inLanguage: HTML_LANG[LANG] || 'en',
    // többnyelvű STEP_RX: a nem-angol oldalak HowTo jelölése eddig ÜRES volt
    step: stepHeadings.map(h => ({ '@type': 'HowToStep', name: h }))
  };
  return pageShell({
    title: `${a.title} — ${SITE.name}`,
    description: a.seoDescription || a.subtitle,
    keywords: a.seoKeywords, ogImage, jsonld, pagePath: `article/${a.slug}.html`,
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

    <a href="index.html" class="back-link">${tr('backStories')}</a>
  </section>`;

  return pageShell({
    title: `${tr('supMetaTitle')} — ${SITE.name}`,
    description: tr('supMetaDesc'),
    noIntro: true, pagePath: 'support.html',
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

  // Lépés-illusztrációk mappa másolása (ha van)
  const artSrc = join(ASSETS_SRC, 'art');
  if (existsSync(artSrc)) {
    cpSync(artSrc, join(OUT_ASSETS_DIR, 'art'), { recursive: true });
    console.log('✅ art/ (lépés-illusztrációk) másolva');
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
    const generalGuides = guides.filter(g => !g.company);
    const companyGuides = guides.filter(g => g.company);
    const guideCounts = { everyday: generalGuides.length, tool: companyGuides.length };

    writeFileSync(join(outBase, 'index.html'), buildIndex(news), 'utf-8');
    writeFileSync(join(outBase, 'guides.html'), buildGuidesPage(generalGuides, guideCounts), 'utf-8');
    writeFileSync(join(outBase, 'tools.html'), buildToolsPage(companyGuides, guideCounts), 'utf-8');
    for (const a of loc) {
      const html = a.isGuide ? buildGuidePage(a) : buildArticlePage(a);
      writeFileSync(join(outArticle, `${a.slug}.html`), html, 'utf-8');
    }
    if (SUPPORT.enabled) writeFileSync(join(outBase, 'support.html'), buildSupportPage(), 'utf-8');

    // sitemap (nyelvenként)
    const lp = langPrefix(lang);
    sitemapUrls.push({ loc: `${SITE.url}${lp}/`, date: today });
    if (generalGuides.length) sitemapUrls.push({ loc: `${SITE.url}${lp}/guides.html`, date: today });
    if (companyGuides.length) sitemapUrls.push({ loc: `${SITE.url}${lp}/tools.html`, date: today });
    if (SUPPORT.enabled) sitemapUrls.push({ loc: `${SITE.url}${lp}/support.html`, date: today });
    for (const a of loc) sitemapUrls.push({ loc: `${SITE.url}${lp}/article/${a.slug}.html`, date: (a.publishedAt || '').slice(0, 10) || today });

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
  writeFileSync(join(OUT_DIR, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\n`, 'utf-8');
  console.log(`✅ sitemap.xml (${sitemapUrls.length} URL) + robots.txt generálva`);

  // feed.xml — VALÓDI RSS 2.0 hírfolyam (aggregátorok: Feedly, Flipboard stb.
  // + hírlevél-eszközök is ebből tudnak dolgozni). A 40 legfrissebb tartalom,
  // angolul (a fő kiadás); a guid a cikk URL-je, így nem duplikálódik.
  const xmlEsc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const feedItems = articles
    .slice()
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .slice(0, 40)
    .map(a => {
      const url = `${SITE.url}/article/${a.slug}.html`;
      const pub = a.publishedAt ? new Date(a.publishedAt).toUTCString() : new Date().toUTCString();
      return `    <item>
      <title>${xmlEsc(a.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${xmlEsc(a.subtitle)}</description>
      <pubDate>${pub}</pubDate>
      <category>${a.isGuide ? 'Guide' : 'News'}</category>
    </item>`;
    }).join('\n');
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEsc(SITE.name)} — AI news, in plain language</title>
    <link>${SITE.url}/</link>
    <atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>AI news and step-by-step guides for everyday people — fresh, friendly and jargon-free.</description>
    <language>en-au</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${feedItems}
  </channel>
</rss>`;
  writeFileSync(join(OUT_DIR, 'feed.xml'), feed, 'utf-8');
  console.log(`✅ feed.xml generálva (${Math.min(articles.length, 40)} elem)`);

  // llms.txt — az AI-keresők/asszisztensek (Perplexity, ChatGPT stb.) számára
  // készült tömör oldal-térkép (llmstxt.org konvenció). Segít, hogy az AI-válaszok
  // minket találjanak meg és idézzenek a kezdőbarát útmutatókhoz.
  const topGuides = articles
    .filter(a => a.isGuide)
    .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
    .slice(0, 15)
    .map(a => `- [${a.title}](${SITE.url}/article/${a.slug}.html): ${a.subtitle}`)
    .join('\n');
  const llms = `# ${SITE.name}

> AI news and step-by-step how-to guides for everyday people, written in plain English (no jargon). Every technical term is explained; every guide is written so a complete beginner can follow it. Also available in Hungarian (/hu/), Spanish (/es/), German (/de/) and French (/fr/).

## Main sections

- [Latest AI news](${SITE.url}/): daily plain-language news about ChatGPT, Gemini, Claude, Copilot and other AI tools
- [Everyday guides](${SITE.url}/guides.html): practical how-to guides for daily life (email, study, travel, safety, work)
- [AI tool guides](${SITE.url}/tools.html): beginner guides organised by tool — ChatGPT, Gemini, Claude, Copilot, Perplexity and more
- [RSS feed](${SITE.url}/feed.xml)
- [Sitemap](${SITE.url}/sitemap.xml)

## Recent guides

${topGuides}

## About

Original content by ${SITE.name} — written and quality-checked by an autonomous editorial system, following a strict beginner-clarity rulebook (every step says what to do, what you'll see, and what to do if your screen looks different). When quoting, please link back to the article.
`;
  writeFileSync(join(OUT_DIR, 'llms.txt'), llms, 'utf-8');
  console.log('✅ llms.txt generálva (AI-kereső oldal-térkép)');

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
  writeFileSync(join(OUT_DIR, '_redirects'), `${verifyRule}https://aiworldco.pages.dev/* ${SITE.url}/:splat 301\n`, 'utf-8');
  console.log('✅ _redirects generálva (pages.dev → saját domain, 301)');

  // 404.html — KRITIKUS SEO-elem: enélkül a Cloudflare Pages "egyoldalas app"
  // módban MINDEN ismeretlen címre a főoldalt adja 200-zal (soft-404, a Google
  // bünteti). Ha van 404.html a gyökérben, a Pages valódi 404-et szolgál ki.
  // Csak abszolút útvonalak (/assets/...), mert bármilyen mélységű URL-en jelenhet meg.
  const notFoundBody = `<section class="guides-hero" style="text-align:center">
    <p class="intro__kicker">404</p>
    <h1 class="guides-hero__title">This page has wandered off</h1>
    <p class="guides-hero__tag">The link may be old, or the address has a typo. No worries — everything useful is one tap away.</p>
    <p style="margin-top:22px"><a class="support__btn" style="display:inline-block" href="/">← Back to the homepage</a></p>
    <p style="margin-top:14px"><a href="/guides.html">Everyday guides</a> · <a href="/tools.html">AI tool guides</a></p>
    <p style="margin-top:26px;font-size:13px;color:var(--ink-soft)">
      <a href="/hu/">Magyar</a> · <a href="/es/">Español</a> · <a href="/de/">Deutsch</a> · <a href="/fr/">Français</a>
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
