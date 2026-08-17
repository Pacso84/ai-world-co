// ===================================================================
// ESZKÖZ-FAJTÁK — mert a /tools "asszisztenst" ígért, és képgenerátort adott
// ===================================================================
//
// ELŐZMÉNY (2026-08-17, a user vette észre): a /tools oldal fejléce azt
// ígérte, "Pick your assistant for tool-specific how-tos" — alatta viszont
// a ChatGPT, a Gemini és a Claude MELLETT ott ült a **Midjourney**, ami nem
// asszisztens, hanem képgenerátor. A user szabálya: "az llm-nél nem lehet
// csak llm modellek" — vagyis az LLM-fejléc alatt CSAK valódi LLM lehet.
//
// AZ OK NEM ELÍRÁS VOLT. A /tools a cikkek `company` mezője szerint csoportosít,
// és a lap SEMMIT nem tudott arról, MIFÉLE eszközről szól egy útmutató. Amíg
// kizárólag chat-asszisztensekről írtunk, az "eszköz = asszisztens" feltevés
// igaznak LÁTSZOTT, és láthatatlan maradt; az ELSŐ nem-chat eszköz (Midjourney)
// visszamenőleg megdöntötte. Ugyanaz az alak, mint a core/auto-check-codes.js
// "auto-hiba = komoly baj" feltevésénél: egy implicit feltevés ott dőlt meg,
// ahol már senki nem nézte.
//
// ⚠️ A MÁSODIK ESET, AMIT SENKI NEM JELZETT: a besoroláskor kiderült, hogy a
// **Hugging Face** (modell-tárhely, nem chatbot) is az "asszisztens"-ígéret
// alatt állt. Egy hiba, amit észrevesznek, ritkán van egyedül.
//
// 🚫 AZ ISMERETLEN NEM ASSZISZTENS. A kézenfekvő alapértelmezés ("amit nem
// ismerünk, az biztos egy chatbot") PONTOSAN a javított hibát gyártaná újra,
// csak csendben. Ezért: ismeretlen név → `other`. Ha új eszközről írunk, azt
// valakinek ide be KELL sorolnia — a core/tool-kinds.test.js addig bukik.
// (Ez ugyanaz az elv, mint az article-length.js-nél: minden mérce IRÁNYA
// számít. Itt a "tévedjünk lefelé" irány a biztonságos.)
//
// A Databricks BENT MARAD, pedig az egyetlen útmutatóját 2026-08-17-én
// visszavontuk: ha holnap új Databricks-útmutató születik, ne az "asszisztens"
// fejléc alatt bukkanjon fel újra.
// ===================================================================

import { readdirSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { canonicalChip } from './quality-guard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** A négy fajta. Ennél többet ne vezess be indoklás nélkül. */
export const KINDS = Object.freeze({
  ASSISTANT: 'assistant',   // LLM chat-asszisztens — EZ mehet az "asszisztens" fejléc alá
  IMAGE: 'image',           // kép- és videógenerálás
  DATA: 'data',             // vállalati adat / BI platform
  OTHER: 'other'            // minden más — ÉS minden, amit nem ismerünk
});

/** Ismeretlen névre EZ jár. SOHA nem `assistant` — lásd a fenti indoklást. */
export const DEFAULT_KIND = KINDS.OTHER;

/** Megjelenítési sorrend a /tools oldalon: előbb a chat, aztán az alkotó eszközök. */
export const KIND_ORDER = Object.freeze([KINDS.ASSISTANT, KINDS.IMAGE, KINDS.DATA, KINDS.OTHER]);

// -------------------------------------------------------------------
// A NYILVÁNTARTÁS
// -------------------------------------------------------------------
// CÉGEK és ESZKÖZÖK egyaránt. Azért mindkettő, mert a /tools CÉG szerint
// szekcionál (a `#c-<cégslug>` horgony máshonnan linkelve van, nem mozdítható),
// az útmutató csempéje viszont ESZKÖZ-nevet mutat — a két névtér külön él,
// és mind a kettőnek besorolhatónak kell lennie.
//
// A cég fajtája a FŐ TERMÉKÉÉ: a Google-nál a Gemini (13 útmutató) dönt, nem
// a Project Genie (1). Ezért kerül a Google az asszisztensek közé akkor is, ha
// egy-két szekción belüli útmutatója képgenerálásról szól. A szigorúbb megoldás
// (a cég-szekció szétvágása fajtánként) új horgonyt igényelne, azt pedig a
// `hub:` mezőn és élő URL-eken keresztül máshol is elrontanánk.
//
// A lista alján a HOZZÁADÁS SZABÁLYA áll — olvasd el, mielőtt bővítesz.

/** Valódi LLM chat-asszisztensek (cégek + eszközök). */
const ASSISTANT_NAMES = [
  // cégek
  'Alibaba', 'Amazon', 'Anthropic', 'Apple', 'Cohere', 'DeepSeek', 'GitHub',
  'Google', 'Meta', 'Microsoft', 'Mistral', 'NVIDIA', 'OpenAI', 'Perplexity',
  'Perplexity AI', 'xAI',
  // eszközök
  'Alexa', 'Alexa+', 'Apple Intelligence', 'ChatGPT', 'ChatRTX', 'Claude',
  'Copilot', 'DeepSeek Chat', 'Gemini', 'GitHub Copilot', 'Grok', 'Le Chat',
  'Meta AI', 'Mistral AI', 'NotebookLM', 'Qwen', 'Qwen Chat'
];

/** Kép- és videógenerálás. Ezek NEM asszisztensek. */
const IMAGE_NAMES = [
  // cégek
  'Midjourney', 'Picsart',
  // eszközök
  'Image Playground',   // Apple Intelligence képgenerátora — nem chat (2026-08-17)
  'Project Genie',      // Google DeepMind világ-/videómodell — nem chat
  'Stable Diffusion',   // Hugging Face-en futtatva, de képmodell
  'Upscayl'             // AI-képfelnagyító
];

/** Vállalati adat / BI. Ma NINCS élő útmutatónk ide — szándékosan bent marad. */
const DATA_NAMES = [
  'Databricks'          // az egyetlen útmutatóját 2026-08-17-én visszavontuk
];

/**
 * Minden más: platform, tárhely, fiók-komponens, zene- és fotóalkalmazás.
 * Fontos: ide EXPLICIT besorolással kerülnek, nem az alapértelmezés miatt —
 * így látszik, hogy valaki tényleg megnézte őket.
 */
const OTHER_NAMES = [
  // cégek
  'Hugging Face',       // modell- és adathalmaz-tárhely, nem chatbot
  'Suno.ai', 'Suno',    // zenegenerálás — se nem chat, se nem kép
  // eszközök
  'Alibaba Cloud',                    // felhőplatform
  'Credential Provider for Windows',  // Windows-bejelentkezés, nem is AI-eszköz
  'Google Photos',                    // fotótár AI-szerkesztéssel, nem generátor
  'Hugging Face Spaces'
];

const REGISTRY = new Map();
const addAll = (names, kind) => {
  for (const n of names) {
    const k = normalize(n);
    if (REGISTRY.has(k) && REGISTRY.get(k).kind !== kind) {
      throw new Error(`tool-kinds: "${n}" két fajtában is szerepel`);
    }
    REGISTRY.set(k, { name: n, kind });
  }
};

/**
 * Névre normalizálás. Kis-nagybetű és a többszörös szóköz NEM különbség —
 * a frontmatterbe emberi kéz és AI is ír, "GitHub  Copilot" is előfordult.
 */
function normalize(name) {
  return String(name == null ? '' : name).trim().replace(/\s+/g, ' ').toLowerCase();
}

addAll(ASSISTANT_NAMES, KINDS.ASSISTANT);
addAll(IMAGE_NAMES, KINDS.IMAGE);
addAll(DATA_NAMES, KINDS.DATA);
addAll(OTHER_NAMES, KINDS.OTHER);

/** A teljes nyilvántartás olvasható alakban: megjelenített név → fajta. */
export const TOOL_KINDS = Object.freeze(
  Object.fromEntries([...REGISTRY.values()].map(v => [v.name, v.kind]))
);

/**
 * Egy cég- vagy eszköznév fajtája.
 * Ismeretlen (és üres) névre `other` — SOHA nem `assistant`.
 *
 * @param {string} companyOrTool
 * @returns {'assistant'|'image'|'data'|'other'}
 */
export function kindOf(companyOrTool) {
  const hit = REGISTRY.get(normalize(companyOrTool));
  return hit ? hit.kind : DEFAULT_KIND;
}

/** Van-e KIMONDOTT besorolása? (A `kindOf` ismeretlenre is választ ad — ez nem.) */
export function isClassified(companyOrTool) {
  return REGISTRY.has(normalize(companyOrTool));
}

/** Valódi LLM chat-asszisztens-e? Ez dönti el, mi mehet az "asszisztens" fejléc alá. */
export function isAssistant(companyOrTool) {
  return kindOf(companyOrTool) === KINDS.ASSISTANT;
}

/** A listából azok, amiknek NINCS kimondott besorolása — a teszt ezt kéri számon. */
export function unclassified(names) {
  const out = [];
  const seen = new Set();
  for (const n of (Array.isArray(names) ? names : [])) {
    const k = normalize(n);
    if (!k || seen.has(k) || REGISTRY.has(k)) continue;
    seen.add(k);
    out.push(String(n).trim());
  }
  return out.sort((a, b) => a.localeCompare(b));
}

// -------------------------------------------------------------------
// A VALÓSÁG BEOLVASÁSA — nehogy a nyilvántartás elváljon a cikkektől
// -------------------------------------------------------------------
// A tesztnek tudnia kell, MELYIK nevek élnek ma tényleg megjelent
// útmutatókban. A frontmatter az elsődleges (az író VÉGSŐ eszköz-választása),
// a `_meta` a tartalék, az eszköznév pedig a `canonicalChip`-en megy át —
// különben a "NVIDIA ChatRTX" és a "ChatRTX" két külön besorolást követelne.
//
// ⚠️ EZ SZÁNDÉKOSAN BŐVEBB, MINT AMIT A BUILD MA LÁT. A build.js
// `parseFrontmatter()`-e csak azokat a kulcsokat tartja meg, amik már benne
// vannak az alapértelmezett objektumban (`else if (fm.hasOwnProperty(key))`) —
// és a `company`/`tool`/`level` NINCS benne. Vagyis a mellette álló komment
// ("a frontmatter az elsődleges") ma NEM igaz: a /tools valójában a `_meta`-ból
// épül. Ezért nem jelenik meg a Suno.ai útmutatója a /tools oldalon (a
// frontmatterében ott a cég, a `_meta`-jában nincs). Ez KÜLÖN hiba, nem ezé a
// modulé — de a besorolásnak MOST kell bírnia: ha valaki megjavítja a
// frontmatter-olvasást, ne akkor derüljön ki, hogy pár név besorolatlan.
// Ezért olvassuk mind a kettőt: tévedni a "túl sokat sorolunk be" irányba
// olcsó, a másikba nem.
//
// ⚠️ Ez NEM importál semmit az agents/ alól: 25-ből 21 agent-modul a fájl
// végén feltétel nélkül hívja a `main()`-t, tehát a puszta import pénzt
// költene és publikálna. Csak `fs`.

const DEFAULT_ARTICLES_DIR = join(__dirname, '..', 'content', 'articles');

/** A frontmatter első pár mezője — teljes YAML-elemző nélkül, ahogy a build is. */
function frontmatterOf(markdown) {
  const m = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

/**
 * A megjelent útmutatókban ELŐFORDULÓ cég- és eszköznevek.
 *
 * @param {string} [articlesDir]
 * @returns {{companies: string[], tools: string[]}} ábécésorrendben, egyszer-egyszer
 */
export function scanGuideToolNames(articlesDir = DEFAULT_ARTICLES_DIR) {
  const companies = new Map(), tools = new Map();
  if (!existsSync(articlesDir)) return { companies: [], tools: [] };

  for (const f of readdirSync(articlesDir)) {
    if (!f.startsWith('ARTICLE_') || !f.endsWith('.json')) continue;
    let data;
    try { data = JSON.parse(readFileSync(join(articlesDir, f), 'utf-8')); } catch { continue; }
    const meta = data._meta || {};
    const fm = frontmatterOf(data.article_markdown);
    const isGuide = meta.type === 'guide' || fm.category === 'guide';
    if (!isGuide) continue;
    if (meta.status && meta.status !== 'published') continue;

    const company = String(fm.company || meta.company || '').trim();
    if (!company) continue;                       // általános útmutató — a /guides oldalé
    const tool = canonicalChip(String(fm.tool || meta.tool || ''), company);
    if (!companies.has(normalize(company))) companies.set(normalize(company), company);
    if (tool && !tools.has(normalize(tool))) tools.set(normalize(tool), tool);
  }
  const sorted = m => [...m.values()].sort((a, b) => a.localeCompare(b));
  return { companies: sorted(companies), tools: sorted(tools) };
}

// -------------------------------------------------------------------
// HOZZÁADÁS SZABÁLYA (ha a teszt "besorolatlan"-t jelez):
//   1) Chat-ablak, amibe emberi nyelven írsz, és LLM válaszol → assistant.
//   2) Képet/videót ELŐÁLLÍT → image. (Szerkeszt, de nem állít elő → other.)
//   3) Vállalati adat / BI → data.
//   4) Minden más — platform, tárhely, zene, hangfelismerés, fiókkezelés →
//      other. HA BIZONYTALAN VAGY, az `other` a helyes válasz: az "asszisztens"
//      fejléc alá kerülő téves név a user által jelzett HIBA, a fordítottja
//      csak egy szem eszköz egy visszafogottabb fejléc alatt.
// -------------------------------------------------------------------

export default {
  KINDS, KIND_ORDER, DEFAULT_KIND, TOOL_KINDS,
  kindOf, isClassified, isAssistant, unclassified, scanGuideToolNames
};
