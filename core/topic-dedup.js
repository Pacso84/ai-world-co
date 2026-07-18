// ===================================================================
// KÖZELI-TÉMA-ŐR (2026-07-18, user: "egy cikk csak egyszer jelenjen,
// ne legyen ismétlés")
//
// A szó szerinti duplikátumot a slug-őr (quality-guard) fogja; EZ a
// JELENTÉS-beli közelséget: "Meeting Notes into Clear Action Plans" ≈
// "Meeting Notes into Action Plans". Új útmutató-téma születése ELŐTT
// hívjuk (pairing / guide --ideas / company-coverage / --balance).
//
// OLCSÓ ÉS GYORS: előbb kulcsszó-előszűrés (csak a néhány gyanús meglévő
// címet tartjuk meg), és CSAK azokat + a jelöltet ágyazzuk be (embedText,
// gemini-embedding-001, INGYEN), cache-elve. Embedding nélkül a Jaccard-
// szó-átfedés a tartalék — így a pipeline sosem akad meg.
// Spec: docs/superpowers/specs/2026-07-18-kozeli-tema-or-design.md
// ===================================================================

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_PATH = join(ROOT, 'guides', 'topic-embeddings.json');
const LOG_PATH = join(ROOT, 'memory', 'topic-dedup-log.json');

export const COSINE_THRESHOLD = 0.88;   // efölött = jelentésben közeli
export const JACCARD_THRESHOLD = 0.7;   // embedding-tartalék küszöb
const STOP = new Set(['the', 'and', 'for', 'with', 'your', 'you', 'how', 'from', 'this', 'that', 'into', 'using', 'use', 'about', 'a', 'an', 'to', 'of', 'in', 'on']);

function words(t) {
  return new Set(String(t || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)));
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
export function normTitle(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function loadCache() { try { return JSON.parse(readFileSync(CACHE_PATH, 'utf-8')); } catch { return {}; } }
function saveCache(c) { try { writeFileSync(CACHE_PATH, JSON.stringify(c, null, 0), 'utf-8'); } catch { /* cache-hiba nem kritikus */ } }

// A jelölt címet összeveti a meglévőkkel. embedFn injektálható (teszthez).
// Visszaad: { duplicate:boolean, closest:{title,score,by}|null }
export async function isNearDuplicateTitle(candidate, existingTitles, opts = {}) {
  const { embedFn, cosineThreshold = COSINE_THRESHOLD, jaccardThreshold = JACCARD_THRESHOLD } = opts;
  const cand = String(candidate || '').trim();
  if (!cand || !existingTitles?.length) return { duplicate: false, closest: null };

  const cw = words(cand);
  // 1) KULCSSZÓ-ELŐSZŰRÉS: csak a legalább 2 jelentős szót osztó címek gyanúsak
  const suspects = [];
  for (const t of existingTitles) {
    if (normTitle(t) === normTitle(cand)) return { duplicate: true, closest: { title: t, score: 1, by: 'exact' } };
    const tw = words(t);
    let overlap = 0; for (const w of cw) if (tw.has(w)) overlap++;
    if (overlap >= 2) suspects.push({ title: t, tw, jac: jaccard(cw, tw) });
  }
  if (!suspects.length) return { duplicate: false, closest: null };

  // 2) EMBEDDING (ha van): a jelöltet + a gyanúsakat beágyazzuk (cache-elve).
  // A HÍVÓ szándéka számít: undefined = töltsd be az élest; null = NINCS
  // embedding (Jaccard-tartalék) — a teszt így tud tisztán offline maradni.
  let embed = embedFn;
  if (embed === undefined) { try { ({ embedText: embed } = await import('./ai-router.js')); } catch { embed = null; } }

  if (embed) {
    const cache = loadCache();
    const vecFor = async (title) => {
      const key = normTitle(title);
      if (cache[key]) return cache[key];
      const v = await embed(title);
      if (v) cache[key] = v;
      return v;
    };
    const cv = await vecFor(cand);
    if (cv) {
      let best = null;
      for (const s of suspects) {
        const sv = await vecFor(s.title);
        const score = sv ? cosine(cv, sv) : 0;
        if (!best || score > best.score) best = { title: s.title, score, by: 'embedding' };
      }
      saveCache(cache);
      if (best && best.score >= cosineThreshold) return { duplicate: true, closest: best };
      // embedding megvolt, de nem elég közeli → NEM duplikátum (a Jaccard-ra
      // nem esünk vissza, mert az embedding a megbízhatóbb jel)
      return { duplicate: false, closest: best };
    }
  }

  // 3) TARTALÉK (nincs embedding): Jaccard-szó-átfedés
  let best = null;
  for (const s of suspects) if (!best || s.jac > best.score) best = { title: s.title, score: s.jac, by: 'jaccard' };
  return { duplicate: !!(best && best.score >= jaccardThreshold), closest: best };
}

// A projekt ÖSSZES meglévő útmutató-címe: kész guide-ok frontmatter title +
// a guide-topics.json témái (done + todo). Ez a duplikáció-referencia.
export function allExistingGuideTitles() {
  const titles = new Set();
  try {
    const t = JSON.parse(readFileSync(join(ROOT, 'guides', 'guide-topics.json'), 'utf-8'));
    for (const x of t.topics || []) if (x.title) titles.add(x.title);
  } catch { /* nincs témalista */ }
  try {
    const dir = join(ROOT, 'content', 'articles');
    if (existsSync(dir)) for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
      try {
        const d = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
        if (d._meta?.type !== 'guide') continue;
        const m = (d.article_markdown || '').match(/^title:\s*["']?(.+?)["']?\s*$/m);
        if (m) titles.add(m[1]);
      } catch { /* egy hibás fájl ne állítsa meg */ }
    }
  } catch { /* nincs cikk-mappa */ }
  return [...titles];
}

// LEVETT TÉMA? (2026-07-19, SkillOpt-zombi tanulsága): amit audit/kézi
// döntés levett (guide-topics status:'removed'), azt SEM a rework, SEM az
// Ellenőrző nem élesztheti újra — a rejected-ben maradt példány különben
// addig fogalmazódik át, míg átcsúszik a kapun (3. próbára megtörtént!).
export function isRemovedTopic(meta = {}, title = '') {
  try {
    const t = JSON.parse(readFileSync(join(ROOT, 'guides', 'guide-topics.json'), 'utf-8'));
    const removed = (t.topics || []).filter(x => x.status === 'removed');
    if (!removed.length) return false;
    const id = meta.guide_topic_id || '';
    const nt = normTitle(title || meta.title || '');
    return removed.some(x => (id && x.id === id) || (nt && normTitle(x.title) === nt));
  } catch { return false; }
}

// Napló a napi riporthoz (nap-kulcsos, 14 nap)
export function logDedup(entry) {
  let log = {};
  try { log = JSON.parse(readFileSync(LOG_PATH, 'utf-8')); } catch { /* első futás */ }
  const day = new Date().toISOString().slice(0, 10);
  log[day] = [...(log[day] || []), { at: new Date().toISOString(), ...entry }];
  const keep = Object.keys(log).sort().slice(-14);
  try { writeFileSync(LOG_PATH, JSON.stringify(Object.fromEntries(keep.map(k => [k, log[k]])), null, 2), 'utf-8'); } catch { /* nem kritikus */ }
}
