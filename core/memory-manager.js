// ===================================================================
// MEMÓRIA-KEZELŐ (Marveen-stílusú, projektünkhöz szabva)
// ===================================================================
//
// Rétegzett, kereshető, idővel halványuló (salience decay) memória.
//   - HOT / WARM / COLD rétegek (salience alapján)
//   - salience: használatkor erősödik, idővel halványul
//   - SOHA nem töröl (a cold réteg örökre megmarad)
//   - keresés: kulcsszó-alapú (később Gemini embeddings = szemantikus)
//
// HASZNÁLAT (agentekben):
//   import { remember, recall, decay, stats } from '../core/memory-manager.js';
//   remember('iro', 'Article rejected: missing section', { tags:['rejection'] });
//   const hits = recall('rejection mistakes', { scope:'iro', limit:8 });
//
// Tárolás: memory/store.json (egy fájl, minden emlék)
// ===================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = join(__dirname, '..', 'memory');
const STORE_PATH = join(MEMORY_DIR, 'store.json');

// Réteg-küszöbök (salience 0..1)
const TIER = { HOT: 0.6, WARM: 0.3 };           // >=0.6 hot, >=0.3 warm, else cold
const ACCESS_BOOST = 0.15;                        // mennyit erősödik használatkor
const DECAY_PER_DAY = 0.04;                       // naponta ennyit halványul

// ---------- tárolás ----------
function load() {
  if (!existsSync(STORE_PATH)) return { _meta: { note: 'AI World rétegzett memória (hot/warm/cold, salience decay).' }, items: [] };
  try { return JSON.parse(readFileSync(STORE_PATH, 'utf-8')); }
  catch { return { _meta: {}, items: [] }; }
}
function save(store) {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
  store._meta.updated = new Date().toISOString();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function tierOf(salience) {
  if (salience >= TIER.HOT) return 'hot';
  if (salience >= TIER.WARM) return 'warm';
  return 'cold';
}

function daysSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

// ---------- REMEMBER ----------
// Új emlék mentése. Ha (scope+text) már létezik, csak erősíti (nem duplikál).
export function remember(scope, text, opts = {}) {
  const store = load();
  const norm = (text || '').trim();
  if (!norm) return;

  const existing = store.items.find(it => it.scope === scope && it.text === norm);
  if (existing) {
    existing.salience = Math.min(1, existing.salience + ACCESS_BOOST);
    existing.lastAccessed = new Date().toISOString();
    existing.accessCount++;
    existing.tier = tierOf(existing.salience);
  } else {
    const now = new Date().toISOString();
    store.items.push({
      id: 'm' + Date.now() + Math.floor(Math.random() * 1000),
      scope,                               // pl. 'iro', 'shared'
      text: norm,
      tags: opts.tags || [],
      created: now,
      lastAccessed: now,
      accessCount: 0,
      salience: 1.0,
      tier: 'hot'
    });
  }
  save(store);
}

// ---------- RECALL (kulcsszó-keresés + salience) ----------
export function recall(query, opts = {}) {
  const store = load();
  const { scope = null, limit = 8 } = opts;
  const terms = (query || '').toLowerCase().split(/\W+/).filter(t => t.length > 2);

  let candidates = store.items.filter(it => !scope || it.scope === scope);

  const scored = candidates.map(it => {
    const hay = (it.text + ' ' + (it.tags || []).join(' ')).toLowerCase();
    const overlap = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
    // relevancia = kulcsszó-egyezés * salience (+ kis recency bónusz)
    const recency = 1 / (1 + daysSince(it.lastAccessed));
    const score = overlap * 2 + it.salience + recency * 0.5;
    return { it, score, overlap };
  }).filter(s => s.overlap > 0 || !query)   // ha nincs query, mindent visszaadhat
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Visszahívott emlékek erősödnek
  const now = new Date().toISOString();
  for (const s of scored) {
    s.it.accessCount++;
    s.it.lastAccessed = now;
    s.it.salience = Math.min(1, s.it.salience + ACCESS_BOOST);
    s.it.tier = tierOf(s.it.salience);
  }
  if (scored.length) save(store);

  return scored.map(s => ({ text: s.it.text, tags: s.it.tags, tier: s.it.tier, scope: s.it.scope }));
}

// ---------- SZEMANTIKUS RECALL (Gemini embeddings + salience) ----------
// Jelentés alapján keres, nem csak szó szerinti egyezésre. Ha az embedding
// nem érhető el (nincs Google kulcs / hálózati hiba), átáll a kulcsszavas
// recall()-ra — így sosem bukik el.
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export async function recallSemantic(query, opts = {}) {
  const { scope = null, limit = 8 } = opts;

  // Embedding-függvény lazy betöltése (ne terhelje a dashboardot, ami csak stats-ot hív)
  let embedText = null;
  try { ({ embedText } = await import('./ai-router.js')); } catch { /* nincs router */ }

  const qVec = embedText ? await embedText(query) : null;
  if (!qVec) return recall(query, opts); // nincs embedding → kulcsszó-fallback

  const store = load();
  const candidates = store.items.filter(it => !scope || it.scope === scope);
  if (!candidates.length) return [];

  // Hiányzó emlék-embeddingek pótlása (egyszer, cache-elve a store-ba)
  let dirty = false;
  for (const it of candidates) {
    if (!Array.isArray(it.embedding)) {
      const v = await embedText(it.text);
      if (v) { it.embedding = v; dirty = true; }
    }
  }

  const scored = candidates
    .filter(it => Array.isArray(it.embedding))
    .map(it => {
      const recency = 1 / (1 + daysSince(it.lastAccessed));
      return { it, score: cosineSim(qVec, it.embedding) * (0.5 + 0.5 * it.salience) + recency * 0.1 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!scored.length) { if (dirty) save(store); return recall(query, opts); }

  // Visszahívott emlékek erősödnek (mint a kulcsszavas recall-nál)
  const now = new Date().toISOString();
  for (const s of scored) {
    s.it.accessCount++;
    s.it.lastAccessed = now;
    s.it.salience = Math.min(1, s.it.salience + ACCESS_BOOST);
    s.it.tier = tierOf(s.it.salience);
  }
  save(store);
  return scored.map(s => ({ text: s.it.text, tags: s.it.tags, tier: s.it.tier, scope: s.it.scope, _semantic: true }));
}

// ---------- DECAY (időszakos halványítás, soha nem töröl) ----------
export function decay() {
  const store = load();
  let moved = 0;
  for (const it of store.items) {
    const days = daysSince(it.lastAccessed);
    const before = it.tier;
    it.salience = Math.max(0.05, it.salience - DECAY_PER_DAY * days);
    it.tier = tierOf(it.salience);
    if (it.tier !== before) moved++;
  }
  save(store);
  return { total: store.items.length, moved };
}

// ---------- LIST (dashboardhoz — emlékek listája salience szerint) ----------
export function list(opts = {}) {
  const store = load();
  const { limit = 12, scope = null } = opts;
  return store.items
    .filter(it => !scope || it.scope === scope)
    .sort((a, b) => b.salience - a.salience)
    .slice(0, limit)
    .map(it => ({ text: it.text, tier: it.tier, scope: it.scope, tags: it.tags, salience: Math.round(it.salience * 100) }));
}

// ---------- STATS (dashboardhoz) ----------
export function stats() {
  const store = load();
  const s = { total: store.items.length, hot: 0, warm: 0, cold: 0, byScope: {} };
  for (const it of store.items) {
    s[it.tier]++;
    s.byScope[it.scope] = (s.byScope[it.scope] || 0) + 1;
  }
  return s;
}

export default { remember, recall, recallSemantic, decay, stats };
