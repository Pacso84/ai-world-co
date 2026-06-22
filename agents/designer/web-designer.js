// ===================================================================
// HONLAP-SZERKESZTŐ AGENT (Web Designer) — a weboldal ELRENDEZÉSE
// ===================================================================
//
// FELADAT:
//   A weboldal VIZUÁLIS LAYOUT-jáért felel (nem a fejlécképekért — az a
//   sima designer agent dolga). A döntéseit a website/design.json-ba írja,
//   amit a build.js olvas. Így a kinézetet az AGENT állítja, nem kézzel.
//
//   Most a guides-oldal csempe-elrendezését szabályozza:
//     • cég-csempék oszlopszáma (desktop/tablet/mobil)
//     • útmutató-csempék mérete / igazítása
//
// MEMÓRIA (a felhasználó kérése: "jegyezze meg az agent a szabályt"):
//   A tervezési SZABÁLYOKAT a rétegzett memóriában tartja (scope:'designer',
//   tag:'design-rule'), MINDEN futáskor előhívja és betartja. Új szabály:
//     node agents/designer/web-designer.js --rule "..."
//
// FUTTATÁS:
//   node agents/designer/web-designer.js            -- újratervezi a layout-ot
//   node agents/designer/web-designer.js --rule "…" -- új design-szabályt tanul
//   node agents/designer/web-designer.js --dry      -- csak megmutatja, nem ír
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { remember, recall } from '../../core/memory-manager.js';
import { skillsBlock } from '../../core/skills.js';
import { message } from '../../core/ops.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const DESIGN_PATH = join(ROOT, 'website', 'design.json');
const LOGS_DIR = join(ROOT, 'logs');
const AGENT_NAME = 'designer';

// KIINDULÓ design-szabályok — ha még nincsenek a memóriában, ezeket jegyzi meg.
const DEFAULT_RULES = [
  'Tiles and cards must form even, balanced rows. Pick a column count that divides the number of tiles (e.g. 12 tiles → 6 desktop / 4 tablet / 3 mobile) so no row is left ragged with more on top than bottom. Center any partial last row instead of left-aligning it.',
  'When the layout is centered (centered tiles/cards), the page heading and intro text must also be centered, so the whole page feels consistent — do not leave the title or tagline left-aligned.'
];

function parseArgs() {
  const a = process.argv.slice(2);
  const p = { rule: null, dry: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--rule' && a[i + 1]) p.rule = a[++i];
    else if (a[i] === '--dry') p.dry = true;
  }
  return p;
}

// A megjegyzett design-szabályok előhívása (scope:'designer')
function loadDesignRules() {
  const hits = recall('website layout tiles cards rows columns alignment spacing balance design rule', { scope: 'designer', limit: 20 });
  return [...new Set(hits.filter(h => (h.tags || []).includes('design-rule')).map(h => h.text))];
}

// Útmutató-csempék számolása cégenként (a content/articles guide-jaiból)
function countGuides() {
  const perCompany = {};
  let general = 0;
  if (existsSync(ARTICLES_DIR)) {
    for (const f of readdirSync(ARTICLES_DIR).filter(x => x.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
        if (d._meta?.type !== 'guide') continue;
        const c = d._meta?.company || '';
        if (c) perCompany[c] = (perCompany[c] || 0) + 1; else general++;
      } catch {}
    }
  }
  return { companies: Object.keys(perCompany).length, perCompany, general };
}

// Determinisztikus garancia a szabályra: oszlopszám, ami OSZTJA az elemszámot,
// a preferált értékhez legközelebb (desktop~6, tablet~4, mobil~3). Ha nincs
// pontos osztó, a legteltebb utolsó sort adó értéket választja.
function bestColumns(n, lo, hi, pref) {
  if (n <= 1) return 1;
  if (n <= pref) return n;
  const exact = [];
  for (let c = lo; c <= hi; c++) if (n % c === 0) exact.push(c);
  if (exact.length) return exact.reduce((a, b) => Math.abs(b - pref) < Math.abs(a - pref) ? b : a);
  let best = pref, score = -Infinity;
  for (let c = lo; c <= hi; c++) { const rem = n % c; const s = rem - Math.abs(c - pref) * 0.01; if (s > score) { score = s; best = c; } }
  return best;
}

function parseJson(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

const SYSTEM_PROMPT = `You are the Web Designer for AI World Co.'s website. You decide the visual LAYOUT of tiles/cards so the page looks clean, balanced and intentional on desktop, tablet and mobile.

You MUST obey the team's remembered DESIGN RULES (given below). Output ONLY JSON — no prose, no code fence.`;

async function decideLayout(counts, rules, skills) {
  const userPrompt = `Decide the tile layout for the Guides page.

NUMBERS:
- Tool/brand tiles (one per company): ${counts.companies}
- General guide tiles (top section): ${counts.general}
- Guides per company: ${JSON.stringify(counts.perCompany)}

REMEMBERED DESIGN RULES (must follow):
${rules.map((r, i) => `${i + 1}. ${r}`).join('\n') || '(none yet)'}
${skills}

Choose:
- brandtiles columns for desktop / tablet / mobile (the ${counts.companies} tool tiles must form EVEN, FULL rows — pick counts that divide ${counts.companies} cleanly).
- guidetiles sizing: flex "basis" px (~200-260), "max" px (~280-320), and "justify" ("center" so partial rows are centered, not left-aligned).

- page "align": "center" or "left" — whether the page heading and intro text should be centered. If the tiles are centered, this should be "center" too (consistency rule).

Output EXACTLY:
{"brandtiles":{"desktop":N,"tablet":N,"mobile":N},"guidetiles":{"basis":N,"max":N,"justify":"center"},"align":"center","rationale":"one short sentence (Hungarian) explaining the choice"}`;

  const response = await ask(userPrompt, { agentName: AGENT_NAME, systemPrompt: SYSTEM_PROMPT, maxTokens: 500, jsonMode: true });
  const parsed = parseJson(response?.text) || {};
  return { response, parsed };
}

// A szabály betartatása. A cég-csempék kicsik (ikon + név), ezért desktopon
// SŰRŰN, teli sorba pakoljuk — fix ideális preferencia (6/4/3) felé húzunk,
// de mindig OSZTÓRA igazítva (egyenletes sorok). Az LLM száma csak felső
// korlátként számít (ne legyen több az ideálisnál), de a sor maradjon teli.
function enforce(parsed, counts) {
  const n = counts.companies || 1;
  const desktop = bestColumns(n, 4, 8, 6);
  const tablet = bestColumns(n, 3, 5, 4);
  const mobile = bestColumns(n, 2, 4, 3);
  const gt = parsed.guidetiles || {};
  const guidetiles = {
    basis: Math.min(280, Math.max(190, Number(gt.basis) || 230)),
    max: Math.min(340, Math.max(260, Number(gt.max) || 300)),
    justify: gt.justify === 'flex-start' ? 'flex-start' : 'center'
  };
  // SZABÁLY: ha az elrendezés középre igazított, a felirat/szöveg is középen.
  const align = (parsed.align === 'left' && guidetiles.justify === 'flex-start') ? 'left' : 'center';
  return { brandtiles: { desktop, tablet, mobile }, guidetiles, align, rationale: parsed.rationale || '' };
}

async function main() {
  const args = parseArgs();
  console.log('🎨 HONLAP-SZERKESZTŐ AGENT (layout)');
  console.log('─'.repeat(60));

  // ÚJ SZABÁLY TANULÁSA
  if (args.rule) {
    remember('designer', args.rule.slice(0, 240), { tags: ['design-rule'] });
    message('designer', 'team', 'info', `Megjegyeztem egy új design-szabályt: "${args.rule.slice(0, 90)}"`);
    console.log(`✅ Új design-szabály elmentve a memóriába (scope:designer):\n   "${args.rule}"`);
    console.log('   (A következő layout-tervezéskor automatikusan alkalmazom.)');
    return;
  }

  // SZABÁLYOK — a hiányzó alap-szabályokat bevezetjük (az agent "megjegyzi")
  let rules = loadDesignRules();
  const missing = DEFAULT_RULES.filter(r => !rules.includes(r));
  if (missing.length) {
    missing.forEach(r => remember('designer', r, { tags: ['design-rule'] }));
    rules = loadDesignRules();
    console.log(`🧠 ${missing.length} alap-szabályt megjegyeztem (egyenletes sorok + középre igazítás).`);
  }
  console.log(`🧠 ${rules.length} megjegyzett design-szabály alapján tervezek.`);

  const counts = countGuides();
  console.log(`📊 Csempék: ${counts.companies} cég · ${counts.general} általános`);

  const { response, parsed } = await decideLayout(counts, rules, skillsBlock('designer'));
  const design = enforce(parsed, counts);

  console.log(`🎯 Döntés: cég-csempék ${design.brandtiles.desktop}/${design.brandtiles.tablet}/${design.brandtiles.mobile} (desktop/tablet/mobil)`);
  console.log(`           útmutató-csempe: ${design.guidetiles.basis}px (max ${design.guidetiles.max}px), igazítás: ${design.guidetiles.justify}`);
  console.log(`           felirat/szöveg igazítás: ${design.align}`);
  if (design.rationale) console.log(`💭 Indok: ${design.rationale}`);

  if (args.dry) { console.log('\n(--dry: nem írtam ki a design.json-t.)'); return; }

  const out = {
    _comment: 'A Honlap-szerkesztő (web-designer) agent írja. A build.js innen veszi a guides-oldal csempe-elrendezését. NE szerkeszd kézzel — futtasd: node agents/designer/web-designer.js',
    updated_at: new Date().toISOString(),
    updated_by: `web-designer (${response?.model || 'fallback'})`,
    brandtiles: design.brandtiles,
    guidetiles: design.guidetiles,
    align: design.align,
    rationale: design.rationale,
    based_on: { companies: counts.companies, general: counts.general }
  };
  writeFileSync(DESIGN_PATH, JSON.stringify(out, null, 2), 'utf-8');

  remember('designer', `Applied layout: ${counts.companies} brand tiles → ${design.brandtiles.desktop}/${design.brandtiles.tablet}/${design.brandtiles.mobile} cols (even rows).`, { tags: ['design', 'layout'] });
  message('designer', 'team', 'fix', `Rendbe raktam a csempéket: ${counts.companies} cég → ${design.brandtiles.desktop}/${design.brandtiles.tablet}/${design.brandtiles.mobile} oszlop, egyenletes sorok. ${design.rationale}`, { ref: 'guides.html' });

  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  writeFileSync(join(LOGS_DIR, `webdesign_${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(out, null, 2), 'utf-8');

  console.log(`\n✅ website/design.json frissítve. Most futtasd: node website/build.js`);
}

main().catch(e => { console.error('💥 HONLAP-SZERKESZTŐ HIBA:', e); process.exit(1); });
