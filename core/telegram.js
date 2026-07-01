// ===================================================================
// TELEGRAM HELPER — üzenetküldés a boton keresztül
// ===================================================================
// A bot a felhasználóval (a "főnök gazdájával") kommunikál. A token és a
// tulajdonos chat-ID-ja KIZÁRÓLAG környezeti változóból jön (secret), SOHA
// nem a repóból — így a bot kódból nem gyengíthető a hozzáférési zár.
//
//   TELEGRAM_BOT_TOKEN      — a @BotFather által adott token
//   TELEGRAM_OWNER_CHAT_ID  — a tulajdonos chat-ID-ja (ide megy a válasz)
// ===================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const API = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

// ---------- BESZÉLGETÉS-MEMÓRIA ----------
// Minden bot-üzenet ide is bekerül (memory/chat-history.json), hogy a főnök
// "agya" lássa az előzményeket — így érti a rövid válaszokat is ("mindet",
// "igen", "az elsőt"). A workflow visszacommitolja, tehát futások közt megmarad.
const HISTORY_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'memory', 'chat-history.json');
const HISTORY_MAX = 40;

export function loadChatHistory() {
  try { return JSON.parse(readFileSync(HISTORY_PATH, 'utf-8')); } catch { return []; }
}
export function appendChatHistory(from, text) {
  try {
    const dir = dirname(HISTORY_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const h = loadChatHistory();
    h.push({ at: new Date().toISOString(), from, text: String(text).slice(0, 600) });
    writeFileSync(HISTORY_PATH, JSON.stringify(h.slice(-HISTORY_MAX), null, 2), 'utf-8');
  } catch { /* a memória-napló sosem törheti el a küldést */ }
}

// Egy üzenet küldése. Ha nincs token/chat-id, csendben kihagyja (pl. helyi futás).
export async function sendMessage(text, opts = {}) {
  appendChatHistory('bot', text);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = opts.chatId || process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!token || !chatId) {
    console.log('ℹ️  Telegram kihagyva (nincs TELEGRAM_BOT_TOKEN / chat-id). Üzenet lett volna:\n' + text);
    return { ok: false, skipped: true };
  }
  // Telegram üzenethossz-limit ~4096; biztonságból vágunk
  const body = {
    chat_id: chatId,
    text: String(text).slice(0, 3900),
    parse_mode: 'Markdown',
    disable_web_page_preview: false
  };
  try {
    const r = await fetch(API(token, 'sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!j.ok) {
      // Markdown-hiba esetén újra, formázás nélkül
      const r2 = await fetch(API(token, 'sendMessage'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 3900) })
      });
      return await r2.json();
    }
    return j;
  } catch (e) {
    console.log('⚠️  Telegram küldés hiba: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// "Gépel..." státusz (szép UX, opcionális)
export async function sendTyping(opts = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = opts.chatId || process.env.TELEGRAM_OWNER_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(API(token, 'sendChatAction'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' })
    });
  } catch { /* nem kritikus */ }
}
