// ===================================================================
// DESIGNER AGENT (kép-generáló)
// ===================================================================
//
// FELADAT:
//   Minden publikált cikkhez generál egy LÁGY, illusztratív fejlécképet,
//   ha még nincs neki. INGYENES (Pollinations.ai, kulcs nélkül).
//   A képet HELYBEN menti (website/assets/images/<slug>.jpg), így a
//   weboldal nem függ futásidőben a külső szolgáltatótól.
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

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const IMAGE_MODEL = 'gemini-2.5-flash-image';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const IMAGES_DIR = join(ROOT, 'website', 'assets', 'images');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');

// Ugyanaz a slug-képzés mint a build.js-ben (egyezniük kell!)
function slugify(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

// Minimál frontmatter olvasás (title + category)
function parseMeta(markdown) {
  const m = (markdown || '').match(/^---\n([\s\S]*?)\n---/);
  const meta = { title: '', category: 'other' };
  if (m) {
    for (const line of m[1].split('\n')) {
      const mm = line.match(/^(\w+):\s*(.*)$/);
      if (!mm) continue;
      if (mm[1] === 'title') meta.title = mm[2].trim().replace(/^["']|["']$/g, '');
      if (mm[1] === 'category') meta.category = mm[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return meta;
}

// A brand vizuális stílusa a prompthoz (lágy, meleg, minimál)
const STYLE = 'soft warm minimalist editorial illustration, cream and sage green palette, gentle shapes, flat modern, friendly, calm, no text, no words, no letters';

function buildPrompt(title, category) {
  // A cím + kategória adja a témát, a STYLE a konzisztens megjelenést
  const topic = title.replace(/[:?!"']/g, '').slice(0, 90);
  return `${topic}, ${category} concept, ${STYLE}`;
}

// Gemini képgenerálás (gemini-2.5-flash-image) — a választ base64 képként adja
async function generateImage(prompt, destPath) {
  const res = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: prompt,
    config: { responseModalities: ['IMAGE', 'TEXT'] }
  });
  const parts = res.candidates?.[0]?.content?.parts || [];
  const img = parts.find(p => p.inlineData);
  if (!img) throw new Error('nem érkezett kép a válaszban');
  const buf = Buffer.from(img.inlineData.data, 'base64');
  if (buf.length < 1000) throw new Error('gyanúsan kicsi kép');
  writeFileSync(destPath, buf);
  return buf.length;
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

    if (existsSync(imgPath) && !FORCE) {
      skipped++;
      continue;
    }

    const prompt = buildPrompt(meta.title, meta.category);

    console.log(`🖼️  ${meta.title.slice(0, 55)}...`);
    try {
      const size = await generateImage(prompt, imgPath);
      console.log(`   ✅ Kép mentve: ${slug}.jpg (${(size/1024).toFixed(0)} KB)`);
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
