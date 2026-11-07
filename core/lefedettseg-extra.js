// ===================================================================
// 🏢 CÉG-LEFEDETTSÉG +1 HELY — naponta 1 extra útmutató a 0 útmutatós cégeknek
// ===================================================================
// MIÉRT (2026-11-07, user: „Napi +1 hely”): a 10-30-án felvett 6 cég (Kimi, MiniMax Code,
// Z.ai, Duck.ai, Brave Leo, Lumo) „Getting started” témája 11-06 óta „todo”, de egy sem
// íródott meg: a napi 2 útmutató-hely (1 középszintű + 1 trend, agents/guide/agent.js
// pickTopics) mindig foglalt, a coverage-téma csak trend nélküli napon jutna sorra.
//
// MŰKÖDÉS: a CEO (agents/ceo/agent.js, 3i3. lépés) naponta EGY coverage-témát kioszt
// (topic.extra_slot = mai dátum), és `--id`-vel megíratja. Az útmutató _meta.extra_slot-ot
// kap, ezért a RENDES napi keretbe (config limits.daily_guides_max = 2) NEM számít bele.
// Ha nincs több todo coverage-téma, extraTemaMa() null → magától visszaáll napi 2-re.
//
// KIKAPCSOLÁS: LEFEDETTSEG_EXTRA_BE = false (kézi kill-switch; a config `enabled` mezői
// nem kapcsolnak ki semmit). Teszt: core/lefedettseg-extra.test.js
// ===================================================================

import { megszuntTema } from './megszunt-eszkozok.js';

export const LEFEDETTSEG_EXTRA_BE = true;

/** A ma kiosztható extra coverage-téma, vagy null (ma már volt / nincs több / kikapcsolva). */
export function extraTemaMa(topics, maNap) {
  if (!LEFEDETTSEG_EXTRA_BE || !Array.isArray(topics)) return null;
  if (topics.some(t => t && t.extra_slot === maNap)) return null;
  return topics.find(t => t && t.priority === 'coverage' && t.status === 'todo' && !megszuntTema(t)) || null;
}

/** Extra helyen született útmutató-e (a _meta alapján)? */
export function extraUtmutato(meta) {
  return !!(meta && meta.extra_slot);
}
