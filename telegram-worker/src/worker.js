// ===================================================================
// AI WORLD — Telegram Worker (Cloudflare)
// ===================================================================
// A Telegram webhookját fogadja. Ellenőrzi, hogy a TULAJDONOS írt-e
// (chat-ID), azonnal nyugtáz, majd a GitHub Actions-t indítja
// (repository_dispatch) — a tényleges munkát (tartalom + deploy + válasz)
// a felhőben a főnök (instruct.js) végzi.
//
// SECRET-ek (wrangler secret put):
//   BOT_TOKEN       — a @BotFather token
//   OWNER_CHAT_ID   — a te chat-ID-d (csak te parancsolhatsz)
//   GH_TOKEN        — szűk jogú GitHub PAT (repo dispatch)
//   WEBHOOK_SECRET  — a Telegram webhook titok (kérés-hitelesítés)
// VARS (wrangler.toml):
//   GH_REPO         — pl. "Pacso84/ai-world-co"
// ===================================================================

export default {
  async fetch(request, env) {
    // Egészség-ellenőrzés / böngészős megnyitás
    if (request.method !== 'POST') {
      return new Response('AI World Telegram worker — OK', { status: 200 });
    }

    // A kérés tényleg a Telegramtól jön? (secret_token fejléc)
    if (env.WEBHOOK_SECRET) {
      const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (got !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
    }

    let update;
    try { update = await request.json(); } catch { return new Response('ok'); }

    const msg = update.message || update.edited_message;
    const text = (msg && msg.text || '').trim();
    const chatId = msg && msg.chat && msg.chat.id;
    if (!text || !chatId) return new Response('ok');

    // CSAK a tulajdonos parancsolhat
    if (String(chatId) !== String(env.OWNER_CHAT_ID)) {
      await tg(env, chatId, '⛔ Ez egy privát asszisztens — nincs jogosultságod a használatához.');
      return new Response('ok');
    }

    // Azonnali nyugta (jó UX), a munka a háttérben indul
    await tg(env, chatId, '👍 Megvan! Dolgozom rajta — pár perc és írok az eredménnyel.');

    // A nehéz munka a GitHub Actions-ben (repository_dispatch)
    const r = await fetch(`https://api.github.com/repos/${env.GH_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'aiworld-telegram-worker',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event_type: 'telegram-command',
        client_payload: { text, chat_id: chatId }
      })
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.log('GitHub dispatch hiba', r.status, detail);
      await tg(env, chatId, `⚠️ Nem sikerült elindítani a munkát (GitHub ${r.status}). Próbáld kicsit később.`);
    }

    return new Response('ok');
  }
};

async function tg(env, chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch (e) {
    console.log('Telegram küldés hiba', e);
  }
}
