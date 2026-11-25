// ===================================================================
// SEO AGENT v2 (kereső-optimalizálás) — 2026-11-25
// ===================================================================
//
// MIÉRT ÍRTUK ÁT: a v1 július óta minden cikkre írt meta-leírást, de egy sem jutott ki
// (a build `seo.description`-t olvasott, ez az agent `meta_description`-t írt), a „tippjei”
// (suggestions) pedig csak a naplóba mentek. User 11-25: „azért volt a seo agent! nem azért
// hogy tippeket adjon!” → most a TELJES cikkből ír keresőcímet + leírást, kód-kapukkal,
// és a build TÉNYLEG kiteszi (core/seo-kapuk.js keresoFej, SEO_ELES_BE kapcsoló).
//
// FUTTATÁS:
//   node agents/seo/agent.js                    új cikkek (nincs SEO, vagy 48 órán belül megjelent és még nem v2)
//   node agents/seo/agent.js --atiras 100       tömeges átírás: a legolvasottabb v1-es cikkek (védett-lista kell)
//   node agents/seo/agent.js --dry --minta 10 [--slug x] [--ki fajl.json]
//                                               előnézet: régi vs új, cikkfájlt NEM ír
//
// Írt mező: _meta.seo = { keywords, seo_title, meta_description, v: 2, eles, kapu_hibak?, megtartva?, optimised_at }
// Spec: docs/superpowers/specs/2026-11-25-kereso-cim-design.md (0. szakasz)
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { notify } from '../../core/ops.js';
import { seoKapuk, withBrand } from '../../core/seo-kapuk.js';
import { seoBemenet, seoPrompt, seoValasz, forgalom30, atirasSorrend, vedettFriss } from '../../core/seo-iro.js';
import { cimTag } from '../../core/title-tag.js';
import { buildMetaDescription } from '../../core/meta-description.js';
import { toUS } from '../../core/us-spelling.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const AGENT_NAME = 'seo';
const argv = process.argv.slice(2);
const ertek = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const DRY = argv.includes('--dry');
const ATIRAS = ertek('--atiras') ? Math.max(0, parseInt(ertek('--atiras'), 10) || 0) : 0;
const MINTA = ertek('--minta') ? Math.max(1, parseInt(ertek('--minta'), 10) || 10) : 0;
const SLUG = ertek('--slug');
const KI = ertek('--ki');
const UJ_ABLAK_ORA = 48;

const SYSTEM = 'You are a careful SEO editor. You only state facts that are in the article. You answer with JSON only.';

const olvas = p => { try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; } };
const torzsBol = md => String(md || '').replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n?/, '');

/** Egy cikk optimalizálása: 1 hívás + legfeljebb 1 újrapróba a kapu-hibákkal. */
async function optimalizal(data) {
  const md = data.article_markdown || '';
  const b = seoBemenet(md);
  const regi = { cim: cimTag(withBrand(b.cim)), leiras: buildMetaDescription(b.alcim, torzsBol(md)) };
  let hibak = [], koltseg = 0, utolso = null, valaszVolt = false;
  for (let kor = 1; kor <= 2; kor++) {
    const r = await ask(seoPrompt(b, { hibak, regi }), { agentName: AGENT_NAME, systemPrompt: SYSTEM, maxTokens: 1500, jsonMode: true });
    koltseg += r?.costUsd || 0;
    const v = seoValasz(r?.text);
    if (!v) continue;                                   // üres / nem JSON → újra (nem kapu-bukás)
    valaszVolt = true;
    v.seo_title = toUS(v.seo_title).text; v.meta_description = toUS(v.meta_description).text;
    hibak = seoKapuk({ cim: v.seo_title, leiras: v.meta_description, cikkMd: torzsBol(md), regiCim: b.cim, regiLeiras: regi.leiras });
    utolso = v;
    if (!hibak.length) return { ok: true, v, koltseg, regi };
  }
  return valaszVolt ? { ok: false, v: utolso, hibak, koltseg, regi } : { ok: null, koltseg, regi };
}

function cikkek() {
  if (!existsSync(ARTICLES_DIR)) return [];
  return readdirSync(ARTICLES_DIR).filter(f => f.startsWith('ARTICLE_') && f.endsWith('.json'))
    .map(f => ({ f, path: join(ARTICLES_DIR, f), data: olvas(join(ARTICLES_DIR, f)) }))
    .filter(c => c.data?._meta?.status === 'published' && c.data._meta.slug);
}

function ir(c, seo) {
  c.data._meta.seo = seo;
  writeFileSync(c.path, JSON.stringify(c.data, null, 2), 'utf-8');
}

async function main() {
  console.log('🔍 SEO AGENT v2 INDUL' + (DRY ? ' (előnézet — cikkfájlt nem ír)' : ATIRAS ? ` (tömeges átírás: ${ATIRAS})` : ''));
  console.log('─'.repeat(60));
  const minden = cikkek();
  const vedettJson = olvas(join(ROOT, 'memory', 'seo-vedett.json'));
  const vedett = new Set(vedettJson?.vedett || []);
  const forgalom = forgalom30(olvas(join(ROOT, 'memory', 'traffic-log.json')) || {});

  let lista, megtartva = [];
  if (DRY) {
    const sor = atirasSorrend(minden.map(c => ({ slug: c.data._meta.slug, v: c.data._meta.seo?.v })), forgalom, vedett).sor;
    const slugok = SLUG ? [SLUG] : sor.slice(0, MINTA || 10);
    lista = slugok.map(s => minden.find(c => c.data._meta.slug === s)).filter(Boolean);
  } else if (ATIRAS) {
    if (!vedettFriss(vedettJson)) { console.log('⏭️  nincs friss védett-lista (memory/seo-vedett.json, ≤14 nap) — a tömeges kör nem indul'); return; }
    const r = atirasSorrend(minden.map(c => ({ slug: c.data._meta.slug, v: c.data._meta.seo?.v })), forgalom, vedett);
    megtartva = r.megtartva.map(s => minden.find(c => c.data._meta.slug === s)).filter(Boolean);
    lista = r.sor.slice(0, ATIRAS).map(s => minden.find(c => c.data._meta.slug === s)).filter(Boolean);
  } else {
    const hatar = new Date(Date.now() - UJ_ABLAK_ORA * 3600000).toISOString();
    lista = minden.filter(c => !c.data._meta.seo || (c.data._meta.seo.v !== 2 && String(c.data._meta.published_at || '') >= hatar));
  }

  for (const c of megtartva) {
    ir(c, { ...(c.data._meta.seo || {}), v: 2, megtartva: true, optimised_at: new Date().toISOString() });
    console.log(`🛡️ védett (a Bingen jól teljesít — nem nyúlunk hozzá): ${c.data._meta.slug}`);
  }

  let kesz = 0, bukott = 0, hiba = 0, koltseg = 0;
  const mintak = [];
  for (const c of lista) {
    console.log(`🔎 ${c.data._meta.slug.slice(0, 70)}`);
    const r = await optimalizal(c.data);
    koltseg += r.koltseg || 0;
    if (r.ok === null) { hiba++; console.log('   ❌ nem jött érvényes válasz — a következő futás újrapróbálja'); continue; }
    const regiSeo = c.data._meta.seo || {};
    const seo = {
      keywords: (r.v.keywords?.length ? r.v.keywords : regiSeo.keywords) || [],
      seo_title: r.v.seo_title, meta_description: r.v.meta_description,
      v: 2, eles: r.ok, ...(r.ok ? {} : { kapu_hibak: r.hibak }),
      optimised_at: new Date().toISOString()
    };
    if (r.ok) { kesz++; console.log(`   ✅ „${seo.seo_title}” (${seo.seo_title.length}) · leírás ${seo.meta_description.length} kar.`); }
    else { bukott++; console.log(`   ⛔ kapun elbukott, a régi marad: ${r.hibak.map(h => h.split(':')[0]).join(', ')}`); }
    if (DRY) mintak.push({ slug: c.data._meta.slug, latogatas30: forgalom.get(c.data._meta.slug) || 0, regi: r.regi, uj: { cim: seo.seo_title, leiras: seo.meta_description }, ok: r.ok, hibak: r.hibak || [] });
    else ir(c, seo);
  }

  if (DRY && KI) writeFileSync(KI, JSON.stringify(mintak, null, 2), 'utf-8');
  console.log('\n' + '─'.repeat(60));
  console.log(`📊 SEO: ${kesz} kész · ${bukott} kapun elbukott (régi marad) · ${megtartva.length} védett · ${hiba} válasz nélkül · költség $${koltseg.toFixed(4)}`);
  if (!DRY && kesz + bukott > 0) notify('info', `SEO: ${kesz} cikk új keresőcímet kapott, ${bukott} kapun elbukott.`, { agent: 'seo' });
}

main().catch(e => { console.error('💥 KRITIKUS HIBA:', e); process.exit(1); });
