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
async function describeScene(title, subtitle) {
  const prompt = `Article title: "${title}"
Subtitle: "${subtitle}"

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
const IMAGE_BACKENDS = [
  { name: 'Cloudflare', fn: viaCloudflare },
  { name: 'HuggingFace', fn: viaHuggingFace },
  { name: 'Gemini', fn: viaGemini }
];

// Opcionális kép-tömörítés (sharp) — ha nincs telepítve, sima mentés.
// Így a friss képek is KICSIK (max 1000px, JPEG q72) → gyors oldalbetöltés.
let _sharp = null, _sharpTried = false;
async function compressImage(buf) {
  if (!_sharpTried) { _sharpTried = true; try { _sharp = (await import('sharp')).default; } catch { _sharp = null; } }
  if (!_sharp) return buf;
  try { return await _sharp(buf).resize({ width: 1000, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer(); }
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

  const files = readdirSync(ARTICLES_DIR).filter(f => f.startsWith('ARTICLE_') && f.endsWith('.json'));
  let generated = 0, skipped = 0, failed = 0;

  for (const file of files) {
    let data;
    try { data = JSON.parse(readFileSync(join(ARTICLES_DIR, file), 'utf-8')); }
    catch { continue; }

    const meta = parseMeta(data.article_markdown);
    const slug = slugify(meta.title || data.original_title || file);
    const imgPath = join(IMAGES_DIR, `${slug}.jpg`);

    if (ONLY && !slug.includes(ONLY)) { skipped++; continue; }
    if (existsSync(imgPath) && !FORCE && !ONLY) {
      skipped++;
      continue;
    }

    console.log(`🖼️  ${meta.title.slice(0, 55)}...`);
    const scene = await describeScene(meta.title, meta.subtitle);
    console.log(`   🎬 Jelenet: ${scene.slice(0, 70)}`);
    const prompt = buildPrompt(scene);
    try {
      const { size, backend } = await generateImage(prompt, imgPath);
      console.log(`   ✅ Kép mentve: ${slug}.jpg (${(size/1024).toFixed(0)} KB, ${backend})`);
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
