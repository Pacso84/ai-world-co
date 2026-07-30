// ===================================================================
// DESIGNER AGENT (kép-generáló)
// ===================================================================
//
// FELADAT:
//   Minden publikált cikkhez generál egy LÁGY, illusztratív fejlécképet,
//   ha még nincs neki. TÖBB-BACKENDES kép-router fallback-kel:
//     Cloudflare Workers AI (Flux, 10k/nap ingyen) -> Hugging Face (Flux)
//     -> Gemini (gemini-2.5-flash-image, szűk kvóta)
//   Kulcsok a .env-ben: CLOUDFLARE_API_TOKEN+CLOUDFLARE_ACCOUNT_ID, HF_API_KEY, GOOGLE_API_KEY
//   Ha egyik backendnek sincs kulcsa/mind elesik -> a build LÁGY GRADIENS borítót tesz.
//   A képet HELYBEN menti (website/assets/images/<slug>.jpg).
//
// FUTTATÁS:
//   node agents/designer/agent.js
//   node agents/designer/agent.js --force   (meglévő képeket is újragenerálja)
//
// STÍLUS: a brand-hez illő — meleg, minimál, lágy, szöveg nélkül.
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GoogleGenAI } from '@google/genai';
import { ask } from '../../core/ai-router.js';
import { skillsBlock } from '../../core/skills.js';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const IMAGE_MODEL = 'gemini-2.5-flash-image';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const IMAGES_DIR = join(ROOT, 'website', 'assets', 'images');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
// --only <részlet>: csak az egyező slugú cikkek képét generálja újra (force-szal)
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx !== -1 && args[onlyIdx + 1] ? args[onlyIdx + 1].toLowerCase() : null;
// --refresh N: N db RÉGI borítókép cseréje az új (szövegből dolgozó) módszerrel
const refreshIdx = args.indexOf('--refresh');
const REFRESH = refreshIdx !== -1 && args[refreshIdx + 1] ? (parseInt(args[refreshIdx + 1], 10) || 0) : 0;

// Ugyanaz a slug-képzés mint a build.js-ben (egyezniük kell!)
function slugify(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

// Minimál frontmatter olvasás (title + subtitle + category)
function parseMeta(markdown) {
  const m = (markdown || '').match(/^---\n([\s\S]*?)\n---/);
  const meta = { title: '', subtitle: '', category: 'other' };
  if (m) {
    for (const line of m[1].split('\n')) {
      const mm = line.match(/^(\w+):\s*(.*)$/);
      if (!mm) continue;
      const v = mm[2].trim().replace(/^["']|["']$/g, '');
      if (mm[1] === 'title') meta.title = v;
      if (mm[1] === 'subtitle') meta.subtitle = v;
      if (mm[1] === 'category') meta.category = v;
    }
  }
  return meta;
}

// ART DIRECTOR: a cikkből konkrét vizuális jelenetet ír (hogy a kép kapcsolódjon a tartalomhoz)
//
// 2026-07-30 (user: "jó lenne, ha a képek az aktuális cikkről szólnának"):
// EDDIG CSAK A CÍMET ÉS AZ ALCÍMET LÁTTA. A cikk törzsét soha nem olvasta,
// ezért egy általános című cikkhez ("Mit jelent az AI a munkádban?") csak
// általános jelenetet tudott kitalálni. Most kap egy kivonatot a SZÖVEGBŐL is:
// abban ott vannak a konkrét eszköznevek, képernyők, műveletek — vagyis épp
// az, amiből felismerhető kép lesz.
async function describeScene(title, subtitle, body = '') {
  // A törzs eleje + a lépés-címsorok: ezekben vannak a kézzelfogható dolgok.
  const plain = String(body).replace(/^---[\s\S]*?---/, '').replace(/[#*>`]/g, ' ').replace(/\s+/g, ' ').trim();
  const steps = (String(body).match(/^##\s+.+$/gm) || []).slice(0, 6).map(s => s.replace(/^##\s*/, '')).join(' · ');
  const excerpt = plain.slice(0, 700);

  const prompt = `Article title: "${title}"
Subtitle: "${subtitle}"
${steps ? `Sections: ${steps}\n` : ''}${excerpt ? `Article opening: ${excerpt}\n` : ''}
Base the scene on what the article ACTUALLY talks about (the tools, screens and
actions named above) — not on the title alone.

Describe ONE concrete visual scene for the cover image. STRICT RULES:
- The scene MUST show the article's actual SUBJECT as instantly recognizable objects
  (photo analysis -> "a smartphone displaying a photo, scanned by a glowing magnifying lens";
   customer-service bot -> "a friendly robot with a headset behind a help desk counter").
- Name 2-4 specific objects and what they are DOING; the main object dominates the frame.
- FORBIDDEN: landscapes, hills, balloons, cloud scenery, abstract blobs, people's faces, text/letters.
Reply with ONLY the scene description, max 30 words.
${skillsBlock('designer')}`;
  try {
    const r = await ask(prompt, { agentName: 'designer', systemPrompt: 'You are an art director. Reply with one vivid, concrete visual scene description only. The scene must make the article topic instantly recognizable — never a generic landscape.', maxTokens: 200 });
    const t = (r && r.text || '').trim().replace(/^["']|["']$/g, '');
    if (t.length >= 15) return t;   // csak ha értelmes hosszúságú
  } catch { /* fallback */ }
  // Tartalék: a témát TÁRGYAKKÁ fordítjuk (nehogy tájkép legyen!)
  return `A close-up 3D still life of concrete objects representing: ${title}`.slice(0, 160);
}

// A brand vizuális stílusa a prompthoz — SZÍNES 3D RENDER
const STYLE = 'vibrant colorful 3D render, glossy soft rounded shapes, playful modern tech illustration, soft studio lighting, smooth materials, clean minimal background, depth of field, high quality octane render, 4k, no text no words no letters';

function buildPrompt(scene) {
  // A jelenet (art-director által) adja a tárgyat, a STYLE a konzisztens 3D megjelenést.
  // FONTOS: a "landscape" szó TILOS a promptban — a képgenerátor tájképnek érti,
  // ebből lettek a semmitmondó dombos-lufis borítók (2026-07-02 user-jelzés).
  const s = scene.replace(/["']/g, '').slice(0, 160);
  return `3D rendered illustration, 16:9 wide format: ${s}. The subject is large, centered and instantly recognizable. ${STYLE}`;
}

// ===================================================================
// KÉP-BACKENDEK (több szolgáltató, fallback-kel — mint a szöveg-router)
// ===================================================================

// Fekvő (landscape) méret — illeszkedik a borító-keretekhez (16:9)
const IMG_W = 1280, IMG_H = 720;

// 1) Cloudflare Workers AI (Flux) — INGYEN 10k neuron/nap. Kell: CLOUDFLARE_FLUX_TOKEN + CLOUDFLARE_ACCOUNT_ID
//    (FLUX külön név, hogy NE ütközzön a wrangler/Pages OAuth-jával a deploynál)
async function viaCloudflare(prompt) {
  const token = process.env.CLOUDFLARE_FLUX_TOKEN, acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !acct) return null;
  const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, width: IMG_W, height: IMG_H }) });
  if (!r.ok) throw new Error('Cloudflare HTTP ' + r.status);
  const j = await r.json();
  const b64 = j?.result?.image;
  if (!b64) throw new Error('Cloudflare: nincs kép');
  return Buffer.from(b64, 'base64');
}

// 2) Hugging Face Inference (Flux/SD) — INGYEN (rate limit). Kell: HF_API_KEY
async function viaHuggingFace(prompt) {
  const key = process.env.HF_API_KEY;
  if (!key) return null;
  const r = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs: prompt, parameters: { width: IMG_W, height: IMG_H } })
  });
  if (!r.ok) throw new Error('HuggingFace HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

// 3) Gemini (gemini-2.5-flash-image) — szűk ingyenes kvóta. Kell: GOOGLE_API_KEY
async function viaGemini(prompt) {
  if (!process.env.GOOGLE_API_KEY) return null;
  const res = await ai.models.generateContent({ model: IMAGE_MODEL, contents: prompt, config: { responseModalities: ['IMAGE', 'TEXT'] } });
  const img = (res.candidates?.[0]?.content?.parts || []).find(p => p.inlineData);
  if (!img) throw new Error('Gemini: nincs kép a válaszban');
  return Buffer.from(img.inlineData.data, 'base64');
}

// Kép-router: sorra próbálja a backendeket (a legbőkezűbb ingyenes elöl)
// 2026-07-22 (user-döntés: "nem fizetek a Geminiért"): a Gemini kép-backend KIVÉVE.
// Ez volt a rejtett ~$37/hó szivárgás (a Flux-kvóta kimerülésekor a FIZETŐS Geminire
// esett, a költség-plafon megkerülésével). Marad az INGYENES Cloudflare Flux (+HF, ha
// van kulcs). Ha egyik sem ad képet: a cikk borító nélkül marad (a main() try/catch-eli).
const IMAGE_BACKENDS = [
  { name: 'Cloudflare', fn: viaCloudflare },
  { name: 'HuggingFace', fn: viaHuggingFace }
];

// Opcionális kép-tömörítés (sharp) — ha nincs telepítve, sima mentés.
//
// SZÉLESSÉG 1000 → 1280 (2026-07-29, Google Discover).
//
// A Discover — az a hírfolyam, ami magától tolja ki a cikkeket a telefonokra —
// LEGALÁBB 1200 px széles képet kér, különben a cikk fel sem merül benne.
// Eddig 1000 px-re vágtuk vissza sebesség-okokból, és ezzel önként kizártuk
// magunkat egy ingyenes forgalmi forrásból.
//
// A GENERÁTOR EGYÉBKÉNT IS 1280×720-at ad (IMG_W/IMG_H fent) — vagyis a
// nagy kép mindig megvolt, csak mi dobtuk el. Ezért itt UGYANAZT az IMG_W-t
// használjuk: így a szokásos úton NINCS átméretezés (nincs újramintavétel =
// élesebb kép), és egyetlen szám marad igazságforrásnak. A withoutEnlargement
// biztosít arról, hogy kisebb forrást soha ne nagyítsunk fel — a felnagyítás
// nem ad részletet, csak elmossa.
//
// A fájlméretet a q72 → q70 tartja kordában (nagyobb kép, közel azonos méret).
const IMG_WIDTH = IMG_W;
let _sharp = null, _sharpTried = false;
async function compressImage(buf) {
  if (!_sharpTried) { _sharpTried = true; try { _sharp = (await import('sharp')).default; } catch { _sharp = null; } }
  if (!_sharp) return buf;
  try { return await _sharp(buf).resize({ width: IMG_WIDTH, withoutEnlargement: true }).jpeg({ quality: 70, mozjpeg: true }).toBuffer(); }
  catch { return buf; }
}

async function generateImage(prompt, destPath) {
  let lastErr = 'nincs elérhető kép-backend (adj hozzá CLOUDFLARE/HF/GOOGLE kulcsot)';
  for (const b of IMAGE_BACKENDS) {
    try {
      let buf = await b.fn(prompt);
      if (!buf) continue;                 // nincs kulcs ehhez a backendhez -> tovább
      if (buf.length < 1000) { lastErr = `${b.name}: gyanúsan kicsi kép`; continue; }
      buf = await compressImage(buf);     // kicsinyítés + tömörítés (ha van sharp)
      writeFileSync(destPath, buf);
      return { size: buf.length, backend: b.name };
    } catch (e) {
      lastErr = `${b.name}: ${e.message}`;
    }
  }
  throw new Error(lastErr);
}

async function main() {
  console.log('🎨 DESIGNER AGENT INDUL');
  console.log('─'.repeat(60));

  if (!existsSync(IMAGES_DIR)) mkdirSync(IMAGES_DIR, { recursive: true });
  if (!existsSync(ARTICLES_DIR)) { console.log('Nincs cikk.'); return; }

  let files = readdirSync(ARTICLES_DIR).filter(f => f.startsWith('ARTICLE_') && f.endsWith('.json'));

  // ── FOKOZATOS BORÍTÓKÉP-FELÚJÍTÁS (--refresh N, 2026-07-30) ──────────
  // A 2026-07-30 előtti képek úgy készültek, hogy az "art director" CSAK a
  // címet és az alcímet látta. Ebből félrevezető borítók lettek: egy
  // "Chatbot Brain" című útmutatóhoz robot-KOPONYA elektródákkal, pedig a
  // cikk arról szól, hogyan jelentkezz be és kérj API-kulcsot.
  //
  // Az új képek már a cikk SZÖVEGÉBŐL készülnek. A régieket fokozatosan
  // cseréljük (a kép-generálás ingyenes, a jelenet-leírás ~$0,0005/db),
  // ÚTMUTATÓKKAL KEZDVE: azok evergreenek, azokat pineljük, és a user
  // kifejezetten őket kérte. A hír borítója amúgy is elavul.
  if (REFRESH > 0) {
    files = files
      .map(f => { try { return { f, d: JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8')) }; } catch { return null; } })
      .filter(x => x && x.d._meta?.published_at && (x.d._meta.image_v || 0) < 2)
      .sort((a, b) => {
        const ag = a.d._meta.type === 'guide' ? 0 : 1;   // útmutató előre
        const bg = b.d._meta.type === 'guide' ? 0 : 1;
        return ag - bg || String(a.d._meta.published_at).localeCompare(String(b.d._meta.published_at));
      })
      .slice(0, REFRESH)
      .map(x => x.f);
    console.log(`♻️  FELÚJÍTÁS: ${files.length} borítókép cseréje a cikk szövegéből (útmutatók előre)`);
  }

  let generated = 0, skipped = 0, failed = 0;

  for (const file of files) {
    let data;
    try { data = JSON.parse(readFileSync(join(ARTICLES_DIR, file), 'utf-8')); }
    catch { continue; }

    const meta = parseMeta(data.article_markdown);
    // A RÖGZÍTETT slug az igazság (2026-07-30) — ugyanaz a hiba, mint a
    // közösségi agentnél volt: a CÍMBŐL számolt név egy újracímzés után
    // ELTÉR attól, amit a build keres (`${slug}.jpg`), és a cikk NÉMÁN
    // borítókép nélkül marad. Mérve: 567-ből 7 cikknél már ma is eltérne.
    const slug = data._meta?.slug || slugify(meta.title || data.original_title || file);
    const imgPath = join(IMAGES_DIR, `${slug}.jpg`);

    if (ONLY && !slug.includes(ONLY)) { skipped++; continue; }
    if (existsSync(imgPath) && !FORCE && !ONLY && !REFRESH) {
      skipped++;
      continue;
    }

    console.log(`🖼️  ${meta.title.slice(0, 55)}...`);
    const scene = await describeScene(meta.title, meta.subtitle, data.article_markdown);
    console.log(`   🎬 Jelenet: ${scene.slice(0, 70)}`);
    const prompt = buildPrompt(scene);
    try {
      const { size, backend } = await generateImage(prompt, imgPath);
      console.log(`   ✅ Kép mentve: ${slug}.jpg (${(size/1024).toFixed(0)} KB, ${backend})`);
      // Megjelöljük, hogy ez a kép MÁR a cikk szövegéből készült (image_v: 2).
      // Enélkül a felújító körbe-körbe ugyanazokat cserélgetné.
      try {
        data._meta = { ...data._meta, image_v: 2, image_at: new Date().toISOString() };
        writeFileSync(join(ARTICLES_DIR, file), JSON.stringify(data, null, 2), 'utf-8');
      } catch { /* a kép akkor is megvan */ }
      generated++;
    } catch (e) {
      const short = e.message.includes('429') ? 'KVÓTA elfogyott (próbáld később)' : e.message.slice(0, 60);
      console.log(`   ❌ ${short}`);
      failed++;
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log('📊 ÖSSZEFOGLALÓ:');
  console.log(`   🆕 Generált kép: ${generated}`);
  console.log(`   ⏭️  Már megvolt: ${skipped}`);
  console.log(`   ❌ Sikertelen: ${failed}`);
  console.log('─'.repeat(60));
  if (generated > 0) console.log('✨ Új képek a website/assets/images/ mappában');
}

main().catch(e => { console.error('💥 KRITIKUS HIBA:', e); process.exit(1); });
