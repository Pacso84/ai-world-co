// ===================================================================
// ÚTMUTATÓ-FÓKUSZ — egy eszköz ideiglenes elsőbbsége (2026-10-09)
// ===================================================================
// User: „először legyen eladásunk". Mérve 10-09: a 19 Alexa+ útmutató (ezeken
// van az Amazon-partnerlink, core/affiliate.js) 14 nap alatt 6 látogatást
// kapott — a szűk keresztmetszet a FORGALOM, nem a link. A választott terv
// (user: „igen" a „mindkettő együtt"-re):
//   1) a napi 2 útmutatóból 1 a FÓKUSZ-eszközről szóljon (témasor-elsőbbség);
//   2) ha fogynak a fókusz-témák, az ötletelő célzottan újat kér (--focus);
//   3) a videós sorban (Reels → TikTok) naponta 1 fókusz-útmutató előre megy.
// A „csak friss útmutatóból Reel" szabály (user, 09-27) NEM sérül: a régi 19
// útmutatóból nem lesz videó, csak az újakból.
//
// KAPCSOLÓ: config.json content.guide_focus { tool, company, until, per_day,
// keywords }. Lejárt `until` vagy enabled:false → MINDEN a régi viselkedés.
// (A config enabled-mezője máshol nem kapcsol semmit — itt EXPLICIT olvassuk,
// és a teszt őrzi, hogy a hívók ezt a modult kérdezik.)
// ===================================================================
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { KEZDO_CIM, KOZEP_NAPI } from './content-switches.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Ennyi várakozó fókusz-téma alatt kér az ötletelő újat. */
export const FOKUSZ_TARTALEK = 3;

const ki = { be: false, tool: '', company: '', perDay: 0, until: '', keywords: [] };

/**
 * @param {object} content  a config.json `content` blokkja
 * @param {string} ma       'YYYY-MM-DD' (UTC)
 */
export function fokuszBeallitas(content, ma = new Date().toISOString().slice(0, 10)) {
  const f = (content && content.guide_focus) || {};
  const tool = String(f.tool || '').trim();
  const until = String(f.until || '').trim();
  const be = f.enabled !== false && !!tool && /^\d{4}-\d{2}-\d{2}$/.test(until) && String(ma) <= until;
  if (!be) return { ...ki, until };
  const kw = (Array.isArray(f.keywords) ? f.keywords : []).map(s => String(s).trim()).filter(Boolean);
  return {
    be: true, tool, until,
    company: String(f.company || '').trim(),
    perDay: Math.max(1, Math.min(2, parseInt(f.per_day, 10) || 1)),
    keywords: kw.length ? kw : [tool.replace(/[^A-Za-z0-9 ]/g, '').trim()].filter(Boolean)
  };
}

/** A config.json-ból olvasva (hiányzó / hibás fájl → kikapcsolva). */
export function fokuszConfigbol(configUt = join(ROOT, 'config.json'), ma) {
  let c = {};
  try { c = JSON.parse(readFileSync(configUt, 'utf-8')).content || {}; } catch { c = {}; }
  return fokuszBeallitas(c, ma);
}

// „Alexa+" és „Amazon Alexa+" ugyanaz az eszköz (a cég-katalógus a hosszabbat írja).
const norm = s => String(s || '').toLowerCase().replace(/^amazon\s+/, '').replace(/[^a-z0-9+]/g, '');
export function azonosEszkoz(a, b) {
  const x = norm(a), y = norm(b);
  return !!x && x === y;
}

/** Hány fókusz-útmutató íródott MA (a _meta.written_at alapján). */
export function maiFokuszDb(metak, beall, ma) {
  if (!beall || !beall.be) return 0;
  return (Array.isArray(metak) ? metak : [])
    .filter(m => m && azonosEszkoz(m.tool, beall.tool) && String(m.written_at || '').startsWith(ma)).length;
}

/**
 * A témasorból az ELSŐ fókusz-téma kiemelése. A többi sorrendje változatlan.
 * @returns {{tema: object|null, tobbi: object[]}}
 */
export function fokuszElore(topics, beall) {
  const T = Array.isArray(topics) ? topics : [];
  if (!beall || !beall.be) return { tema: null, tobbi: T.slice() };
  const i = T.findIndex(t => t && azonosEszkoz(t.tool, beall.tool));
  if (i < 0) return { tema: null, tobbi: T.slice() };
  return { tema: T[i], tobbi: [...T.slice(0, i), ...T.slice(i + 1)] };
}

/**
 * A NAP ELSŐ útmutató-helye: a fókusz-téma ELŐRE, és ha ma még nincs
 * középszintű, AZ legyen a középszintű is (egy útmutató, két szabály).
 *
 * MIÉRT (élő eset 10-10): a reggeli futás --limit 1-gyel ír, és a helyet a
 * középszintű (user, 09-29: napi 1 a 2-ből) mindig elvitte — a fókusz-ág csak
 * UTÁNA jött, így az első napon EGY Alexa-útmutató sem készült, a napi keret
 * pedig betelt. Kezdő című fókusz-téma kezdő marad (nem lesz hamis középszint).
 *
 * @returns {{tema: object|null, tobbi: object[], maiKozep: number}}
 *          maiKozep = a mai középszintű darab, a most kiválasztottal együtt
 */
export function fokuszElsoHely(topics, beall, { maiFok = 0, maiKozep = 0, kozepBe = true } = {}) {
  const T = Array.isArray(topics) ? topics : [];
  if (!beall || !beall.be || maiFok >= beall.perDay) return { tema: null, tobbi: T.slice(), maiKozep };
  const { tema, tobbi } = fokuszElore(T, beall);
  if (!tema) return { tema: null, tobbi, maiKozep };
  if (tema.level === 'intermediate') return { tema, tobbi, maiKozep: maiKozep + 1 };
  const kozepKell = kozepBe && maiKozep < KOZEP_NAPI && !KEZDO_CIM.test(String(tema.title || ''));
  return kozepKell
    ? { tema: { ...tema, level: 'intermediate' }, tobbi, maiKozep: maiKozep + 1 }
    : { tema, tobbi, maiKozep };
}

/** Hány új fókusz-téma kell, hogy a tartalék meglegyen (0 = elég van / ki van kapcsolva). */
export function fokuszHiany(topics, beall) {
  if (!beall || !beall.be) return 0;
  const van = (Array.isArray(topics) ? topics : [])
    .filter(t => t && t.status === 'todo' && azonosEszkoz(t.tool, beall.tool)).length;
  return Math.max(0, FOKUSZ_TARTALEK - van);
}

/** Az ötletelő kérésének kiegészítése fókusz-módban. */
export function fokuszOtletPrompt(beall) {
  if (!beall || !beall.be) return '';
  return `\n\nFOCUS — EVERY idea must be a practical how-to for ${beall.tool}`
    + (beall.company ? ` (company: ${beall.company})` : '')
    + `. Set "company" to "${beall.company}" and "tool" to "${beall.tool}" on every item, and put one of these words in each title: ${beall.keywords.join(', ')}.`
    + ' Think of everyday home, kitchen, family, accessibility and work-from-home tasks. Never compare products, never recommend what to buy, never mention prices.';
}

/** Az ötlet címe tényleg a fókusz-eszközről szól-e? (Az MI néha elkalandozik.) */
export function fokuszCimOk(title, beall) {
  if (!beall || !beall.be) return true;
  const t = String(title || '').toLowerCase();
  return beall.keywords.some(k => t.includes(String(k).toLowerCase()));
}

export default { FOKUSZ_TARTALEK, fokuszBeallitas, fokuszConfigbol, azonosEszkoz, maiFokuszDb, fokuszElore, fokuszElsoHely, fokuszHiany, fokuszOtletPrompt, fokuszCimOk };
