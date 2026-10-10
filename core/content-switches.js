// ===================================================================
// TARTALOM-KAPCSOLÓK — config.json → content.* (2026-09-29)
// ===================================================================
// A user kérése: „vissza lehessen állítani". Két tartalmi változás, mindkettő
// egy-egy mezővel kikapcsolható (false → a következő futástól a régi viselkedés):
//   • content.intermediate_guides — naponta 1 KÖZÉPSZINTŰ útmutató a 2-ből
//     (agents/guide/agent.js: ötletelés + témasorrend + író-utasítás)
//   • content.news_if_you_use — a hír „What this means for you" részében egy
//     4. pont: „If you already use it" (agents/iro/agent.js)
//
// ⚠️ A config `enabled` mezői máshol NEM kapcsolnak semmit (lásd memória:
// feedback-a-config-enabled-mezo-nem-kapcsol-ki) — ezért itt EXPLICIT olvassuk,
// és a teszt őrzi, hogy a két író tényleg ezt a modult kérdezi.
// Hiányzó config / mező → BEKAPCSOLVA (a user döntése az alapállapot).
// ===================================================================
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {{kozepUtmutato:boolean, hirHalado:boolean}} */
export function tartalomKapcsolok(configUt = join(ROOT, 'config.json')) {
  let c = {};
  try { c = JSON.parse(readFileSync(configUt, 'utf-8')).content || {}; } catch { c = {}; }
  return {
    kozepUtmutato: c.intermediate_guides !== false,
    hirHalado: c.news_if_you_use !== false
  };
}

// ── KÖZÉPSZINTŰ ÚTMUTATÓ: napi 1 a 2-ből ─────────────────────────────
export const KOZEP_NAPI = 1;

/**
 * Hány középszintű útmutató íródott MA (drafts + articles, a _meta alapján).
 * @param {Array<object>} metak  a mai nap szempontjából releváns cikkek _meta-i
 * @param {string} ma            'YYYY-MM-DD'
 */
export function maiKozepDb(metak, ma) {
  return (Array.isArray(metak) ? metak : [])
    .filter(m => m && m.level === 'intermediate' && String(m.written_at || '').startsWith(ma)).length;
}

/**
 * A témasor átrendezése a szint szerint:
 *   • ha ma még nincs meg a középszintű kvóta → az ELSŐ középszintű téma előre kerül;
 *   • ha megvan → a középszintűek kimaradnak mára (holnap jönnek);
 *   • kikapcsolva → a középszintűek egyáltalán nem kerülnek sorra.
 * A többi téma sorrendje változatlan.
 */
// Kezdőknek szóló cím — ebből NEM lesz középszintű útmutató.
export const KEZDO_CIM = /\b(?:getting started|beginners?|first steps?|basics|for dummies|introduction to|what is)\b/i;

export function szintSorrend(topics, { maiKozep = 0, be = true, cel = KOZEP_NAPI } = {}) {
  const T = Array.isArray(topics) ? topics : [];
  const kozepE = (t) => t && t.level === 'intermediate';
  if (!be || maiKozep >= cel) return T.filter(t => !kozepE(t));
  const i = T.findIndex(kozepE);
  if (i === 0) return T.slice();
  if (i > 0) return [T[i], ...T.slice(0, i), ...T.slice(i + 1)];
  // NINCS középszintű téma a sorban (élő eset 09-30: a témák a hír-párosítóból
  // jönnek, alapból kezdő szintűek, az ötletelő pedig csak szabad helynél fut —
  // így a napi középszintű SOSEM került volna sorra). Az első NEM kezdő című
  // téma lesz ma középszintű. MÁSOLAT: a témasorban a téma nem íródik át.
  const j = T.findIndex(t => t && !KEZDO_CIM.test(String(t.title || '')));
  if (j < 0) return T.slice();
  return [{ ...T[j], level: 'intermediate' }, ...T.slice(0, j), ...T.slice(j + 1)];
}

export default { tartalomKapcsolok, maiKozepDb, szintSorrend, KOZEP_NAPI };
