// Telegram-üzenetküldő — közös modul (worker fetch-ág + ügyfélszolgálat email-ág).
export async function tg(env, chatId, text) {
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
