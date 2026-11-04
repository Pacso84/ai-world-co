// ===================================================================
// TELEGRAM-ÜZENETKÜLDŐ — közös modul (worker fetch-ág, ügyfélszolgálat,
// email-ág, őrkutya).
// ===================================================================
// 🔑 A KÜLDÉS EREDMÉNYT AD (2026-08-30). A régi változat `await fetch(...)`-et
// hívott, a választ el sem olvasta, és semmit nem adott vissza:
//
//   • egy 403 („Forbidden: bot was blocked by the user"), egy 400 („chat not
//     found") vagy egy 429 pontosan úgy nézett ki, mint a sikeres küldés;
//   • a hívó nem tudhatta, kiment-e — így a kapcsolat-űrlap {ok:true}-t
//     ígért a látogatónak olyan üzenetre, amiről a tulajdonos SOHA nem
//     értesült, az őrkutya pedig „riasztottam"-ot jegyzett fel némaság után.
//
// ⚠️ A TELEGRAM KÉTFÉLEKÉPP HIBÁZIK, és a kettő FÜGGETLEN:
//     a) HTTP-státusz (4xx/5xx), b) a törzsben `{ok:false, description:"…"}`.
//   Ezért MINDKETTŐT nézzük — csak az `r.ok` vizsgálata a hibák egy részét
//   ugyanúgy sikernek látná. (Minden mérce IRÁNYA számít.)
//
// ⚠️ SZERZŐDÉS: EZ A FÜGGVÉNY SOHA NEM DOB. A hívók (`ctx.waitUntil`,
// őrkutya, cs-routes) erre építenek — egy eldobott hiba ott némán elveszne.
// A hiba a VISSZATÉRÉSI ÉRTÉKBEN jön, nem kivételként.
//
// @returns {Promise<{ok: boolean, status: number, description: string}>}
//          — a `description` a Telegram indoklása (vagy a hálózati hiba
//            szövege), rövidítve. TOKENT SOHA nem tartalmaz: a hívók
//            Telegram-üzenetbe és napi riportba teszik.
// ===================================================================
export async function tg(env, chatId, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });

    // A törzs olvasása SOSEM dönthet el egy küldést: proxy-hiba HTML-t is
    // adhat vissza HTTP 200-zal. Olyankor a státusz marad az egyetlen jel.
    let j = null;
    try { if (typeof r?.json === 'function') j = await r.json(); } catch { /* nem-JSON törzs */ }

    const status = Number(r?.status) || (r?.ok ? 200 : 0);
    if (!r?.ok || j?.ok === false) {
      const description = String(j?.description || `HTTP ${status}`).slice(0, 200);
      console.log('Telegram küldés hiba', status, description);
      return { ok: false, status, description };
    }
    return { ok: true, status, description: '' };
  } catch (e) {
    // Hálózati hiba / hiányzó env — a hívó ugyanúgy „nem ment ki"-t lát.
    console.log('Telegram küldés hiba', e);
    return { ok: false, status: 0, description: String(e?.message || e).slice(0, 200) };
  }
}
