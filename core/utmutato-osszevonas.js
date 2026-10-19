// ===================================================================
// ÚTMUTATÓ-ÖSSZEVONÁS — AUTOMATA (2026-10-19)
// ===================================================================
// User (10-19): „de ne csak a híreket vonja össze hanem az útmutatókat is!" →
// „Magától, utána szóljon". A témaismétlés-őr (core/topic-dedup.js +
// core/repeat-guard.js) az ÚJ útmutatót a megírás pillanatában szűri, a már
// kint lévő régi ismétléseket viszont senki nem vonta össze — ezek nagy része
// 08-25 előtt készült, amikor az őr beágyazása némán halott volt.
//
// A 10-19-i KÉZI összevonás (63d4a661) szabályai gépesítve:
//   • ismétlés = a cím ÉS a tartalom eleje is erősen egyezik (eszköznév nélkül);
//   • két KÜLÖNBÖZŐ eszköz változata SOHA nem vonódik össze (user: „csak a
//     valódi ismétléseket" — az /tools oldal épp ezekre épül);
//   • megmarad az ÁLTALÁNOS („bármelyik MI-vel") változat, annak híján a legtöbbet olvasott;
//   • a régi cím 301-gyel a megmaradóra visz (content/slug-history.json → _redirects);
//   • hetente egyszer, legfeljebb MAX_HETI db; Telegram-jelentés utána.
// A törölt fájl a git-történetben megmarad → visszahozható.
//
// Futtatás: KIZÁRÓLAG a CI (auto.yml, a build ELŐTT): node core/utmutato-osszevonas.js --auto
// Helyben csak: --dry (megmutatja a tervet, semmit nem ír). Importja biztonságos.
// ===================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NAPLO = join(ROOT, 'content', 'osszevonas-naplo.json');
const HIST = join(ROOT, 'content', 'slug-history.json');

/** Hetente legfeljebb ennyi összevonás. */
export const MAX_HETI = 5;
/** Ennyi nap után fut újra. */
export const HET_NAP = 6;

const STOP = new Set('a an the to for with in on of and or your you how use using any into from by at is it its that this one get gets make step steps guide beginner beginners minutes minute quick quickly simple easy free ai chatbot assistant assistants app apps tool tools new set setup turn ask first under without like more all can do best way ways about everyday daily'.split(' '));
const ESZKOZ = new Set('chatgpt gemini claude copilot perplexity alexa meta deepseek qwen mistral le chat grok cohere hugging face huggingface picsart canva midjourney suno zapier notion google microsoft openai anthropic echo amazon chatrtx nvidia'.split(' '));
const tokenek = s => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
  .filter(w => w.length > 2 && !STOP.has(w) && !ESZKOZ.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, '')));
const jac = (a, b) => { let k = 0; for (const x of a) if (b.has(x)) k++; return k / (a.size + b.size - k || 1); };

/** Hasonlósági pontok: cím (eszköznév nélkül) és a tartalom eleje. */
export function pontok(a, b) {
  return { c: jac(tokenek(a.cim), tokenek(b.cim)), b: jac(tokenek(a.torzs), tokenek(b.torzs)) };
}

/** Ismétlés-e (a 10-19-i elemzés küszöbei: erős cím + közepes tartalom, vagy közepes cím + erős tartalom). */
export function hasonlo(a, b) {
  const p = pontok(a, b);
  return (p.c >= 0.5 && p.b >= 0.2) || (p.c >= 0.34 && p.b >= 0.35);
}

const sz = x => String(x || '').trim().toLowerCase();
/** Tiltott pár: két különböző (kitöltött) eszköz, vagy a heti összefoglaló. */
export function kizarva(a, b) {
  if (/^this-week-in-ai-/.test(a.slug || '') || /^this-week-in-ai-/.test(b.slug || '')) return true;
  const ta = sz(a.tool), tb = sz(b.tool);
  return !!(ta && tb && ta !== tb);
}

/** A csoport megmaradó tagja: általános változat (a legolvasottabb), annak híján a legolvasottabb. */
export function megtartott(csoport) {
  const rend = (x, y) => (y.olv || 0) - (x.olv || 0) || String(x.pub || '').localeCompare(String(y.pub || ''));
  const alt = csoport.filter(x => !sz(x.tool)).sort(rend);
  return alt[0] || [...csoport].sort(rend)[0];
}

/** Az összevonási terv: [{ from, to, pont }] — legfeljebb MAX_HETI, a legerősebb egyezések elöl. */
export function osszevonasiTerv(utmutatok) {
  const u = (Array.isArray(utmutatok) ? utmutatok : []).filter(x => x && x.slug);
  const p = u.map((_, i) => i); const gy = i => p[i] === i ? i : (p[i] = gy(p[i]));
  for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) {
    if (!kizarva(u[i], u[j]) && hasonlo(u[i], u[j])) p[gy(i)] = gy(j);
  }
  const cs = new Map();
  u.forEach((x, i) => { const r = gy(i); if (!cs.has(r)) cs.set(r, []); cs.get(r).push(x); });
  const terv = [];
  for (const csoport of cs.values()) {
    if (csoport.length < 2) continue;
    const to = megtartott(csoport);
    for (const from of csoport) {
      if (from === to || kizarva(from, to) || !hasonlo(from, to)) continue;   // csak KÖZVETLEN egyezés a megmaradóval
      const pt = pontok(from, to);
      terv.push({ from, to, pont: pt.c + pt.b });
    }
  }
  return terv.sort((a, b) => b.pont - a.pont).slice(0, MAX_HETI);
}

/** Esedékes-e a heti futás. */
export function esedekes(utolso, ma = new Date().toISOString()) {
  if (!utolso || !Number.isFinite(Date.parse(utolso))) return true;
  return (Date.parse(ma) - Date.parse(utolso)) / 864e5 >= HET_NAP;
}

// ---------- I/O (csak a CI; --dry helyben) ----------

function betolt() {
  const olv = new Map();
  try {
    const tl = JSON.parse(readFileSync(join(ROOT, 'memory', 'traffic-log.json'), 'utf-8')).days || {};
    for (const sorok of Object.values(tl)) for (const r of sorok) {
      const m = String(r.path).match(/\/article\/([^/?#.]+)/); if (m) olv.set(m[1], (olv.get(m[1]) || 0) + (r.visits || 0));
    }
  } catch { /* nincs napló — olvasottság nélkül is megy */ }
  const ki = [];
  for (const f of readdirSync(join(ROOT, 'content', 'articles'))) {
    if (!f.includes('_GUIDE_') || !f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(readFileSync(join(ROOT, 'content', 'articles', f), 'utf-8')); const m = j._meta || {}; const md = j.article_markdown || '';
      if (!m.slug) continue;
      const cim = ((md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1]) || m.slug;
      ki.push({ f, slug: m.slug, cim, tool: m.tool || '', olv: olv.get(m.slug) || 0, pub: m.published_at || '',
        torzs: md.replace(/^---[\s\S]*?---/, '').slice(0, 1500) });
    } catch { /* sérült fájl */ }
  }
  return ki;
}

async function fut({ dry }) {
  const naplo = existsSync(NAPLO) ? JSON.parse(readFileSync(NAPLO, 'utf-8')) : { tortenet: [] };
  if (!dry && !esedekes(naplo.utolso)) { console.log(`💤 útmutató-összevonás: legutóbb ${naplo.utolso} — jövő héten esedékes`); return; }
  const terv = osszevonasiTerv(betolt());
  console.log(`🔗 útmutató-összevonás: ${terv.length} db${dry ? ' (PRÓBA — semmit nem írok)' : ''}`);
  for (const x of terv) console.log(`   ${x.from.cim} (${x.from.olv} olv, ${x.from.tool || 'általános'})  →  ${x.to.cim} (${x.to.olv} olv)`);
  if (dry) return;

  const hist = JSON.parse(readFileSync(HIST, 'utf-8'));
  const most = new Date().toISOString();
  for (const x of terv) {
    if (!hist[x.from.slug]) hist[x.from.slug] = x.to.slug;
    for (const dir of ['articles', 'translations']) {
      const ut = join(ROOT, 'content', dir, x.from.f);
      if (existsSync(ut)) unlinkSync(ut);
    }
    naplo.tortenet.push({ at: most, from: x.from.slug, to: x.to.slug, from_cim: x.from.cim, to_cim: x.to.cim });
  }
  writeFileSync(HIST, JSON.stringify(hist, null, 2) + '\n', 'utf-8');
  naplo.utolso = most;
  naplo.tortenet = naplo.tortenet.slice(-200);
  writeFileSync(NAPLO, JSON.stringify(naplo, null, 2) + '\n', 'utf-8');

  if (terv.length) {
    const { sendMessage } = await import('./telegram.js');
    await sendMessage(`🔗 Útmutató-összevonás (heti): ${terv.length} ismétlés összevonva — a régi cím a megmaradóra visz.\n`
      + terv.map(x => `• ${x.from.cim} → ${x.to.cim}`).join('\n')
      + '\nHa valamelyik nem tetszik, szólj Claude-nak: a git-történetből visszahozható.');
  }
}

const kozvetlen = process.argv[1] && process.argv[1].endsWith('utmutato-osszevonas.js');
if (kozvetlen && (process.argv.includes('--auto') || process.argv.includes('--dry'))) {
  fut({ dry: process.argv.includes('--dry') }).catch(e => { console.log('útmutató-összevonás hiba: ' + e.message); });
}
