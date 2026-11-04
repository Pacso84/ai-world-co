// ===================================================================
// SKILL FACTORY (Marveen-stílus) — újrahasznosítható "receptek"
// ===================================================================
//
// Az agentek a tapasztalatból (mi vált be, mi bukott) rövid, újra-
// használható recepteket ("skill") desztillálnak. Ezek később az
// agentek promptjába kerülhetnek, vagy a felhasználó beépítheti.
//
// Tárolás: skills/skills.json
// ===================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '..', 'skills');
const SKILLS_PATH = join(SKILLS_DIR, 'skills.json');

function load() {
  if (!existsSync(SKILLS_PATH)) return { _meta: { note: 'Önírt skillek (receptek) a tapasztalatból.' }, skills: [] };
  try { return JSON.parse(readFileSync(SKILLS_PATH, 'utf-8')); } catch { return { _meta: {}, skills: [] }; }
}
function save(s) {
  if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true });
  s._meta.updated = new Date().toISOString();
  writeFileSync(SKILLS_PATH, JSON.stringify(s, null, 2), 'utf-8');
}

// Skill hozzáadása/frissítése (cím alapján dedup)
export function addSkill(title, recipe, opts = {}) {
  const s = load();
  const existing = s.skills.find(k => k.title === title);
  if (existing) {
    existing.recipe = recipe;
    existing.updated = new Date().toISOString();
    existing.uses = (existing.uses || 0);
  } else {
    s.skills.push({
      id: 'sk' + Date.now() + Math.floor(Math.random() * 100),
      title, recipe,
      scope: opts.scope || 'shared',
      created: new Date().toISOString(),
      uses: 0
    });
  }
  if (s.skills.length > 200) s.skills = s.skills.slice(-200);
  save(s);
}
export function listSkills(scope = null) {
  const s = load();
  return s.skills.filter(k => !scope || k.scope === scope);
}
export function skillStats() {
  return { total: load().skills.length };
}

// ---- SEED: alap készségek betöltése (csak a HIÁNYZÓKAT, nem ír felül) -------
// Az alapokat a skills/default-skills.json tartalmazza. Újrafuttatható:
// a már létező (scope+title) készségeket MEGŐRZI (a kézi módosításaid maradnak),
// csak az újakat veszi fel. Így bármikor bővíthető a default-lista.
export function seedDefaults(defaults = []) {
  const s = load();
  let added = 0;
  for (const d of defaults) {
    if (!d.title || !d.recipe) continue;
    const exists = s.skills.find(k => k.scope === (d.scope || 'shared') && k.title === d.title);
    if (exists) continue; // megőrizzük a meglévőt (lehet, hogy módosítottad)
    s.skills.push({
      id: 'sk' + Date.now() + Math.floor(Math.random() * 100000),
      scope: d.scope || 'shared',
      title: d.title,
      recipe: d.recipe,
      source: 'default',
      enabled: true,
      created: new Date().toISOString(),
      uses: 0
    });
    added++;
  }
  if (added) save(s);
  return added;
}

// Egy készség be-/kikapcsolása törlés nélkül (id alapján)
export function setEnabled(id, enabled) {
  const s = load();
  const k = s.skills.find(x => x.id === id);
  if (!k) return false;
  k.enabled = enabled;
  save(s);
  return true;
}

// PROMPT-BLOKK: az adott scope (+ 'shared') AKTÍV készségei, promptba fűzve.
// Minden AI-agent ezt hívja, hogy a saját készségei tényleg hassanak a munkára.
export function skillsBlock(scope, { record = true, max = 10 } = {}) {
  const all = [...listSkills(scope), ...listSkills('shared')].filter(k => k.enabled !== false);
  if (!all.length) return '';
  if (record) recordUse(all.map(k => k.id));
  const lines = all.slice(0, max).map(k => `- ${k.title}: ${String(k.recipe).slice(0, 400)}`);
  return `\n\nYOUR SKILLS — proven recipes for your role (follow them):\n${lines.join('\n')}`;
}

// Megjelöli, hogy egy-egy skillt TÉNYLEGESEN használt egy agent (uses++).
// Így a dashboardon látszik, mely receptek hatnak valóban a munkára.
export function recordUse(ids = []) {
  if (!ids.length) return;
  const s = load();
  let changed = false;
  for (const k of s.skills) {
    if (ids.includes(k.id)) {
      k.uses = (k.uses || 0) + 1;
      k.lastUsed = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) save(s);
}

export default { addSkill, listSkills, skillStats, recordUse, seedDefaults, setEnabled, skillsBlock };
