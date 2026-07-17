// ===================================================================
// MÁRKAJEL-LETÖLTŐ (2026-07-18, user: "a hivatalos cégek logói jelenjenek
// meg a csempéken")
//
// A cégek HIVATALOS márkajelét (egyszínű SVG) tölti le a simple-icons
// nyílt, KÖZKINCS (CC0) készletéből, és HELYBEN tárolja (website/assets/
// logos/) — az oldal elve: 0 külső hivatkozás futásidőben. A védjegyek a
// megfelelő tulajdonosoké; szerkesztői/azonosító (nominatív) használat.
//
// NEM a pipeline része — kézzel futtatjuk, ha frissíteni kell:
//   node core/fetch-brand-logos.js
// A letöltött SVG-k STATIKUSAK (kis fájl), commitolva vannak.
// ===================================================================

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'website', 'assets', 'logos');

// Cég → simple-icons slug. CSAK a forrásban létező, EGYÉRTELMŰ márkajelek.
// (xAI és Cohere nincs a készletben → emoji-tartalék marad a build.js-ben;
// "x" NEM xAI, ezért nem használjuk.)
const SLUGS = {
  'OpenAI': 'openai', 'Google': 'google', 'Anthropic': 'anthropic',
  'Microsoft': 'microsoft', 'Meta': 'meta', 'Perplexity': 'perplexity',
  'Alibaba': 'alibabacloud', 'Mistral': 'mistralai', 'DeepSeek': 'deepseek',
  'Amazon': 'amazon', 'Apple': 'apple', 'Hugging Face': 'huggingface',
  'NVIDIA': 'nvidia', 'GitHub': 'github', 'Suno.ai': 'suno', 'Suno': 'suno'
};

const companySlug = (c) => c.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// A letöltött SVG-t tintelhetővé + hozzáférhetővé tesszük:
//  - <title> ki (a csempén a cégnév amúgy is ott van) + aria-hidden
//  - fill="currentColor" a <svg>-n → a CSS a márkaszínre festi
function normalize(svg) {
  return svg
    .replace(/<title>.*?<\/title>/s, '')
    .replace(/<svg /, '<svg aria-hidden="true" focusable="false" fill="currentColor" ')
    .trim();
}

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  let ok = 0, fail = 0;
  for (const [company, slug] of Object.entries(SLUGS)) {
    try {
      const r = await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg`, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) { console.log(`❌ ${company} (${slug}): HTTP ${r.status}`); fail++; continue; }
      const raw = await r.text();
      if (!raw.includes('<path')) { console.log(`❌ ${company}: nem SVG-nek tűnik`); fail++; continue; }
      writeFileSync(join(OUT, `${companySlug(company)}.svg`), normalize(raw), 'utf-8');
      console.log(`✅ ${company} → assets/logos/${companySlug(company)}.svg`);
      ok++;
    } catch (e) {
      console.log(`❌ ${company}: ${String(e.message || e).slice(0, 60)}`);
      fail++;
    }
  }
  console.log(`\n📊 Kész: ${ok} letöltve, ${fail} kihagyva (emoji-tartalék marad).`);
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 LOGÓ-LETÖLTŐ HIBA:', e); process.exit(1); });
