// ===================================================================
// CS-EMAIL — support@aiworldhq.com automata válasz (2026-07-20).
// Cloudflare Email Routing → email handler → közös motor → message.reply().
// HUROK-VÉDELEM: cs-email-rules.js (Auto-Submitted / saját cím / 2/nap/feladó).
// Minden bejövőről Telegram-másolat a tulajdonosnak.
// ===================================================================
import PostalMime from 'postal-mime';
import { createMimeMessage } from 'mimetext';
import { EmailMessage } from 'cloudflare:email';
import { answer } from './cs-engine.js';
import { tg } from './tg.js';
import { bumpCs, globalLimitReached, dayKey } from './cs-routes.js';
import { SUPPORT_ADDR, shouldAutoReply, replyText } from './cs-email-rules.js';

async function senderHash(from) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cs-mail:' + from.toLowerCase()));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export async function handleEmail(message, env) {
  if (env.CS_ENABLED !== 'true') return; // kill-switch: csendben eldob (a CF Routing naplózza)
  const from = message.from || '';
  let subject = '', text = '';
  try {
    const parsed = await PostalMime.parse(message.raw);
    subject = parsed.subject || '(no subject)';
    text = (parsed.text || '').trim() || (parsed.html || '').replace(/<[^>]+>/g, ' ').trim();
  } catch (e) {
    console.log('email parse hiba', e && e.message);
  }
  // Telegram-másolat MINDIG (ez a biztonsági háló, ha az auto-válasz nem megy ki)
  await tg(env, env.OWNER_CHAT_ID, `📧 ÚJ SUPPORT-EMAIL\nFeladó: ${from}\nTárgy: ${subject}\n\n${text.slice(0, 600)}`);

  const sh = await senderHash(from);
  const countKey = `cs:mailrl:${sh}:${dayKey()}`;
  const todayCount = parseInt(await env.FEEDBACK.get(countKey) || '0', 10);
  const gate = shouldAutoReply({ autoSubmitted: message.headers.get('Auto-Submitted') || '', from, todayCount });
  if (!gate.ok) { console.log('nincs auto-válasz:', gate.reason); return; }

  let engineResult = { text: '', escalate: true, links: [] };
  if (!(await globalLimitReached(env))) {
    engineResult = await answer(env, { message: `${subject}\n\n${text}`.slice(0, 1500), lang: 'auto' });
    await bumpCs(env, 'global'); // a 300/nap sapka KÖZÖS: chat+email AI-hívás együtt számít
    await bumpCs(env, 'mail');
    if (engineResult.escalate) await bumpCs(env, 'esc');
  } else {
    await bumpCs(env, 'esc');
  }

  const msg = createMimeMessage();
  msg.setSender({ name: 'AI World HQ Support', addr: SUPPORT_ADDR });
  msg.setRecipient(from);
  msg.setSubject('Re: ' + subject);
  const inReplyTo = message.headers.get('Message-ID');
  if (inReplyTo) msg.setHeader('In-Reply-To', inReplyTo);
  msg.setHeader('Auto-Submitted', 'auto-replied'); // más robotok ne válaszolgassanak nekünk
  msg.addMessage({ contentType: 'text/plain', data: replyText(engineResult, 'en') });
  try {
    await message.reply(new EmailMessage(SUPPORT_ADDR, from, msg.asRaw()));
    await env.FEEDBACK.put(countKey, String(todayCount + 1), { expirationTtl: 172800 });
  } catch (e) {
    console.log('email reply hiba', e && e.message);
  }
}
