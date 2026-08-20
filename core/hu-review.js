// ===================================================================
// MAGYAR HELYESÍRÁS-ÁTVIZSGÁLÁS — a két lépcső összekötése
// ===================================================================
//
// FUTTATÁS:
//   node core/hu-review.js                   a legutóbbi 12 fordítás átnézése
//   node core/hu-review.js --all             mind a 760
//   node core/hu-review.js --all --dry       csak a jelöltek száma, $0
//   node core/hu-review.js --fix             a MEGÍTÉLT hibák javítása, $0
//   node core/hu-review.js --report          a tár állapota, $0
//
// ⚠️ EZ A FÁJL AZ IMPORTRA NEM INDUL EL. 25-ből 21 agent a fájl végén
// feltétel nélkül hívja a main()-t → a puszta import pénzt költ és publikál
// (2026-08-06). A core/daily-report.js is ilyen (2026-08-19). Itt őrszem van.
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadHuChecker } from './hu-dictionaries.js';
import { extractCandidates } from './hu-spellcheck.js';
import { judgeWords, applyVerdicts, applyFixes, needsReview, emptyStore, BATCH } from './hu-proofread.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TRANS_DIR = join(ROOT, 'content', 'translations');
export const STORE_PATH = join(ROOT, 'memory', 'hu-word-verdicts.json');

export function loadStore() {
  try {
    const s = JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
    return { ok: s.ok || [], fix: s.fix || {}, review: s.review || {} };
  } catch { return emptyStore(); }
}
export function saveStore(s) {
  writeFileSync(STORE_PATH,
    JSON.stringify({ ok: [...s.ok].sort(), fix: s.fix, review: s.review }, null, 2), 'utf-8');
}

/** A config vészkapcsolója. Config-hiba esetén BEKAPCSOLVA maradunk. */
export function proofreadEnabled() {
  try {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
    return cfg.agents?.proofread?.enabled !== false;
  } catch { return true; }
}

const magyarFajlok = () => existsSync(TRANS_DIR)
  ? readdirSync(TRANS_DIR).filter(f => f.endsWith('.json')) : [];
const olvas = f => { try { return JSON.parse(readFileSync(join(TRANS_DIR, f), 'utf-8')); } catch { return null; } };

/** A megítélt hibák javítása MINDEN magyar fordításban. $0, idempotens. */
function javit(store) {
  let erintett = 0, csere = 0;
  for (const f of magyarFajlok()) {
    const d = olvas(f);
    if (!d?.hu) continue;
    const r = applyFixes(d.hu, store);
    if (!r.fixed.length) continue;
    d.hu = r.text;
    writeFileSync(join(TRANS_DIR, f), JSON.stringify(d, null, 2), 'utf-8');
    erintett++; csere += r.fixed.length;
    console.log('   🔧 ' + f.slice(30, 70) + ' — ' + r.fixed.map(x => x.word + '→' + x.correct).join(', '));
  }
  console.log('\n✅ ' + erintett + ' cikk javítva, ' + csere + ' szóalak. Költség: $0');
}

async function main() {
  const args = process.argv.slice(2);
  const store = loadStore();

  if (args.includes('--report')) {
    console.log('📋 döntés-tár: ' + store.ok.length + ' rendben · '
      + Object.keys(store.fix).length + ' auto-javítható · '
      + Object.keys(store.review).length + ' emberi szem kell');
    for (const [w, d] of Object.entries(store.fix)) console.log('   🔧 ' + w + ' → ' + d.correct + '  (' + d.at + ')');
    for (const x of needsReview(store)) console.log('   👀 ' + x.word + ' → ' + x.correct);
    return;
  }
  if (args.includes('--fix')) { javit(store); return; }

  const mind = args.includes('--all');
  const limit = Number((args.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity;
  const dry = args.includes('--dry');
  const { isKnownWord } = await loadHuChecker();

  // A jelöltek a TELJES halmazon egyszer: ugyanaz a szó több cikkben is
  // előfordul, a bírót ne fizessük ki érte többször.
  const fajlok = mind ? magyarFajlok() : magyarFajlok().slice(-12);
  const jeloltek = new Map();
  for (const f of fajlok) {
    const d = olvas(f);
    if (!d?.hu) continue;
    for (const c of extractCandidates(d.hu, { isKnownWord, allowlist: new Set(store.ok) })) {
      const k = c.word.toLowerCase();
      if (!store.fix[k] && !store.review[k] && !jeloltek.has(k)) jeloltek.set(k, c);
    }
  }
  const lista = [...jeloltek.values()];
  console.log('🔎 ' + fajlok.length + ' magyar cikk · ' + lista.length + ' megítélendő szóalak');
  if (dry) { console.log('   (--dry: itt megállunk, AI-hívás nem volt)'); return; }
  if (!lista.length) { console.log('✅ nincs új megítélendő szó.'); return; }
  if (!proofreadEnabled()) { console.log('⏸️  Helyesírás-bíró: KIKAPCSOLVA (config) — kihagyom.'); return; }

  const { ask } = await import('./ai-router.js');
  let s = store, koltseg = 0, megitelt = 0, ujFix = 0, ujReview = 0;
  for (let i = 0; i < lista.length && i / BATCH < limit; i += BATCH) {
    const r = await judgeWords({ candidates: lista.slice(i, i + BATCH), ask, enabled: true });
    koltseg += r.costUsd; megitelt += r.verdicts.length;
    for (const v of r.verdicts) {
      if (v.ok) continue;
      if (v.fixable) { ujFix++; console.log('   🔧 ' + v.word + ' → ' + v.correct); }
      else { ujReview++; console.log('   👀 ' + v.word + ' → ' + String(v.correct).slice(0, 50)); }
    }
    s = applyVerdicts(s, r.verdicts);
    saveStore(s);                    // menet közben mentünk: a félbeszakadt futás sem vész kárba
    console.log('   …' + Math.min(i + BATCH, lista.length) + '/' + lista.length + ' · $' + koltseg.toFixed(4));
  }
  console.log('\n✅ ' + megitelt + ' ítélet · ' + ujFix + ' auto-javítható · ' + ujReview
    + ' emberi szem kell · összesen $' + koltseg.toFixed(4));
  console.log('📋 tár: ' + s.ok.length + ' rendben · ' + Object.keys(s.fix).length + ' fix · '
    + Object.keys(s.review).length + ' review');
}

const kozvetlen = process.argv[1] && process.argv[1].endsWith('hu-review.js');
if (kozvetlen) main().catch(e => { console.error('💥 hu-review hiba:', e.message); process.exit(1); });
