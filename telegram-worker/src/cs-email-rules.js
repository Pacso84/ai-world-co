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
  en: '\n\n—\nThis reply was written by AI (the AI World HQ support assistant). If it did not help, just reply to this email — the site owner reads every message.',
  hu: '\n\n—\nEzt a választ MI írta (az AI World HQ ügyfélszolgálati asszisztense). Ha nem segített, válaszolj erre a levélre — az oldal tulajdonosa minden levelet elolvas.',
  es: '\n\n—\nEsta respuesta la ha escrito una IA (el asistente de soporte de AI World HQ). Si no te ha ayudado, responde a este correo: el responsable del sitio lee todos los mensajes.'
};
const FORWARDED = {
  en: 'Thanks for writing to AI World HQ! Your message has been passed on to the site owner, who reads every message.',
  hu: 'Köszönjük a leveledet! Az üzenetedet továbbítottuk az oldal tulajdonosának, aki minden levelet elolvas.',
  es: '¡Gracias por escribir a AI World HQ! Tu mensaje se ha pasado al responsable del sitio, que lee todos los mensajes.'
};

// Motor-eredmény → levél-szöveg (eszkalációnál „továbbítottuk” sablon).
export function replyText(engineResult, lang) {
  const foot = FOOT[lang] || FOOT.en;
  if (engineResult.escalate || !engineResult.text) return (FORWARDED[lang] || FORWARDED.en) + foot;
  return engineResult.text + foot;
}
