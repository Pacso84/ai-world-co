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
  if (s.skills.length > 40) s.skills = s.skills.slice(-40);
  save(s);
}
export function listSkills(scope = null) {
  const s = load();
  return s.skills.filter(k => !scope || k.scope === scope);
}
export function skillStats() {
  return { total: load().skills.length };
}

export default { addSkill, listSkills, skillStats };
