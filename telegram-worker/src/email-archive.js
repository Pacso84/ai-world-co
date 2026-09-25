// ===================================================================
// A BEJÖVŐ SUPPORT-LEVÉL TELJES SZÖVEGE — 30 napig a KV-ban (2026-09-25)
// ===================================================================
// MIÉRT: a Telegramra csak a levél első 600 karaktere megy ki, a teljes
// szöveg SEHOL nem maradt meg. A user egy Ko-fi-levélnek csak a töredékét
// látta, és senki nem tudta elolvasni a többit.
//
// Olvasás (helyben, a tulajdonosnak):
//   npx wrangler kv key list --binding FEEDBACK --prefix cs:email: --remote
//   npx wrangler kv key get  --binding FEEDBACK "cs:email:<ts>" --remote
//
// ⚠️ SOHA NEM DOB: a mentés hibája nem akaszthatja meg a Telegram-értesítést
// és az automata választ. A visszatérési érték a kulcs, vagy null.
// ===================================================================

export const EMAIL_KV_PREFIX = 'cs:email:';
export const EMAIL_TTL_MP = 30 * 24 * 3600;      // 30 nap
export const EMAIL_MAX_KAR = 20000;               // a KV-érték bőven elbírja
export const TG_ELONEZET = 600;

/** A teljes levél elmentése. @returns {Promise<string|null>} a kulcs */
export async function levelArchival(env, { from, subject, text, ts }) {
  try {
    if (!env || !env.FEEDBACK) return null;
    const kulcs = EMAIL_KV_PREFIX + ts;
    const rec = { kind: 'email', email: from, subject, message: String(text || '').slice(0, EMAIL_MAX_KAR), ts };
    await env.FEEDBACK.put(kulcs, JSON.stringify(rec), { expirationTtl: EMAIL_TTL_MP });
    return kulcs;
  } catch (e) {
    console.log('email-archív hiba', e && e.message);
    return null;
  }
}

/** A Telegram-értesítés szövege: ha a levél hosszabb, jelzi, hogy a teljes megvan. */
export function tgLevelSzoveg({ from, subject, text }, kulcs) {
  const t = String(text || '');
  let s = `📧 ÚJ SUPPORT-EMAIL\nFeladó: ${from}\nTárgy: ${subject}\n\n${t.slice(0, TG_ELONEZET)}`;
  if (t.length > TG_ELONEZET) {
    s += kulcs
      ? `\n\n… (${t.length} karakter — a TELJES levél 30 napig megvan: ${kulcs})`
      : `\n\n… (${t.length} karakter — a teljes levelet NEM sikerült elmenteni)`;
  }
  return s;
}
