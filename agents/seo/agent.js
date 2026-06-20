// ===================================================================
// SEO AGENT (kereső-optimalizálás)
// ===================================================================
//
// FELADAT:
//   Minden publikált cikkhez optimalizál: meta-leírás (~155 karakter,
//   kattintásra csábító, kulcsszavas), kulcsszavak, SEO-pontszám + tippek.
//   Az eredményt a cikk JSON _meta.seo mezőjébe írja → a build.js
//   ezt teszi a <meta description>, og:description, JSON-LD mezőkbe.
//
// FUTTATÁS:
//   node agents/seo/agent.js            (csak ahol még nincs SEO)
//   node agents/seo/agent.js --force    (mindet újraoptimalizálja)
//
// (A technikai SEO-t — sitemap, robots, OG, structured data — a build.js adja.)
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { skillsBlock } from '../../core/skills.js';
import { notify } from '../../core/ops.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const AGENT_NAME = 'seo';
const FORCE = process.argv.includes('--force');

const SEO_SYSTEM_PROMPT = `You are an SEO specialist for AI World Co. (AI news & how-to in plain language).
Given an article, produce search-optimised metadata.

Respond ONLY with JSON (no markdown):
{
  "meta_description": "150-160 char compelling summary with the main keyword, encourages clicks",
  "keywords": ["5-8", "relevant", "search", "terms"],
  "seo_score": 1-10,
  "suggestions": ["1-3 short, concrete SEO improvement tips for this article"]
}
Rules: meta_description MUST be 150-160 characters, natural, not clickbait. keywords are realistic search phrases people type.`;

function extractMeta(markdown) {
  const m = (markdown || '').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta = { title: '', subtitle: '' };
  let body = markdown || '';
  if (m) {
    body = m[2];
    for (const line of m[1].split('\n')) {
      const mm = line.match(/^(\w+):\s*(.*)$/);
      if (mm && mm[1] === 'title') meta.title = mm[2].trim().replace(/^["']|["']$/g, '');
      if (mm && mm[1] === 'subtitle') meta.subtitle = mm[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return { meta, body };
}

async function optimise(title, subtitle, body) {
  const prompt = `Title: ${title}
Subtitle: ${subtitle}
Article (excerpt): ${body.replace(/[#*>\-]/g, ' ').slice(0, 700)}
${skillsBlock('seo')}

Produce the SEO JSON.`;
  // retry max 2x (a rövid/hibás JSON ellen)
  for (let i = 1; i <= 2; i++) {
    const r = await ask(prompt, { agentName: AGENT_NAME, systemPrompt: SEO_SYSTEM_PROMPT, maxTokens: 500, jsonMode: true });
    if (!r) continue;
    try {
      let t = r.text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      const s = t.indexOf('{'), e = t.lastIndexOf('}');
      if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
      const j = JSON.parse(t);
      if (j.meta_description) return { ...j, _cost: r.costUsd };
    } catch { /* retry */ }
  }
  return null;
}

async function main() {
  console.log('🔍 SEO AGENT INDUL');
  console.log('─'.repeat(60));
  if (!existsSync(ARTICLES_DIR)) { console.log('Nincs cikk.'); return; }

  const files = readdirSync(ARTICLES_DIR).filter(f => f.startsWith('ARTICLE_') && f.endsWith('.json'));
  let done = 0, skipped = 0, totalCost = 0, scoreSum = 0;

  for (const file of files) {
    const path = join(ARTICLES_DIR, file);
    let data; try { data = JSON.parse(readFileSync(path, 'utf-8')); } catch { continue; }

    if (data._meta?.seo && !FORCE) { skipped++; continue; }

    const { meta, body } = extractMeta(data.article_markdown);
    console.log(`🔎 ${meta.title.slice(0, 55)}...`);
    const seo = await optimise(meta.title, meta.subtitle, body);
    if (!seo) { console.log('   ❌ Nem sikerült (AI).'); continue; }

    totalCost += seo._cost || 0;
    delete seo._cost;
    data._meta = data._meta || {};
    data._meta.seo = { ...seo, optimised_at: new Date().toISOString() };
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');

    scoreSum += seo.seo_score || 0;
    done++;
    console.log(`   ✅ SEO pont: ${seo.seo_score}/10 | "${(seo.meta_description || '').slice(0, 60)}..."`);
    if (seo.suggestions?.length) console.log(`   💡 ${seo.suggestions[0]}`);
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`📊 ÖSSZEFOGLALÓ: ${done} optimalizálva, ${skipped} kihagyva (már volt). Átlag SEO: ${done ? (scoreSum / done).toFixed(1) : '-'}/10. Költség: $${totalCost.toFixed(4)}`);
  if (done > 0) notify('info', `SEO: ${done} cikk optimalizálva (átlag ${done ? (scoreSum / done).toFixed(1) : '-'}/10).`, { agent: 'seo' });
}

main().catch(e => { console.error('💥 KRITIKUS HIBA:', e); process.exit(1); });
