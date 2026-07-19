// ===================================================================
// CS-EMAIL-RULES — az email-ág tiszta, függőség nélküli szabályai.
// KÜLÖN fájlban, mert a cs-email.js 'cloudflare:email' importját a
// node-teszt nem tudja betölteni — ezt a fájlt viszont igen.
// ===================================================================
export const SUPPORT_ADDR = 'support@aiworldhq.com';
const OWN_ADDRS = [SUPPORT_ADDR, 'news@aiworldhq.com'];

// Hurok-védelem döntése: szabad-e automatikusan válaszolni?
export function shouldAutoReply({ autoSubmitted, from, todayCount }) {
  if (autoSubmitted && autoSubmitted.toLowerCase() !== 'no') return { ok: false, reason: 'auto-submitted' };
  const f = String(from || '').toLowerCase();
  if (OWN_ADDRS.some(a => f.includes(a)) || f.endsWith('@aiworldhq.com')) return { ok: false, reason: 'own-address' };
  if (todayCount >= 2) return { ok: false, reason: 'daily-cap' };
  return { ok: true, reason: '' };
}

const FOOT = {
  en: '\n\n—\nThis is an automated reply from AI World HQ support. If it did not help, just reply to this email and a human will read it.',
  hu: '\n\n—\nEz az AI World HQ automata válasza. Ha nem segített, válaszolj erre a levélre, és egy ember is elolvassa.'
};
const FORWARDED = {
  en: 'Thanks for writing to AI World HQ! Your message has been forwarded to the team — a human will reply as soon as possible.',
  hu: 'Köszönjük a leveledet! Az üzenetedet továbbítottuk a csapatnak — hamarosan ember válaszol rá.'
};

// Motor-eredmény → levél-szöveg (eszkalációnál „továbbítottuk” sablon).
export function replyText(engineResult, lang) {
  const foot = FOOT[lang] || FOOT.en;
  if (engineResult.escalate || !engineResult.text) return (FORWARDED[lang] || FORWARDED.en) + foot;
  return engineResult.text + foot;
}
