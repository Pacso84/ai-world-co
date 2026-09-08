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
import { bumpCs, globalLimitReached, dayKey, markUnsent, uzenetAzonosito } from './cs-routes.js';
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
  // ===================================================================
  // 📮 A TELEGRAM AZ EGYETLEN ÉRTESÍTÉSI ÚT — 2026-09-08
  // ===================================================================
  // Eddig ez a sor `await tg(...)` volt, a visszatérési érték ELDOBVA. A
  // `tg()` viszont SOHA NEM DOB: hiba esetén `{ok:false, description}`-t ad.
  // Vagyis egy bukott Telegram-küldés pontosan úgy nézett ki, mint a sikeres.
  //
  // 🔑 ÉS ITT SÚLYOSABB, MINT AZ ŰRLAPNÁL. Az űrlap-ág a `cs:msg:` kulcsba
  // menti a szöveget, tehát utólag elő lehet venni. Az EMAIL-ág SEMMIT nem
  // mentett — a levél nyomtalanul elveszett volna, és senki nem tud róla.
  // Ugyanaz a hiba, amit 2026-08-29-én az űrlapon már megjavítottunk; csak
  // ezen az ágon maradt bent. („Ha ilyet találsz, keresd meg a többit.")
  //
  // ⚠️ NEM ÍRUNK KÜLÖN `cs:msg:` ARCHÍVUMOT. Azt a kulcsot a saját kódunk
  // szerint SEMMI NEM OLVASSA — egy második, olvasatlan másolat nem véd
  // semmitől. A `markUnsent()` a TELJES rekordot elteszi, oda, ahonnan a
  // `/feedback-export` felviszi a napi riportba: ahol tényleg ránézel.
  const ts = Date.now();
  const rec = { kind: 'email', email: from, subject, message: text.slice(0, 4000), ts };
  const kuldes = await tg(env, env.OWNER_CHAT_ID,
    `📧 ÚJ SUPPORT-EMAIL\nFeladó: ${from}\nTárgy: ${subject}\n\n${text.slice(0, 600)}`);
  if (!kuldes?.ok) {
    // ⚠️ SZÁNDÉKOSAN NINCS try/catch. Ha a nyom írása IS elbukik, nincs
    // semmink: se értesítés, se másolat. Olyankor a kivétel kifut a
    // handleEmail-ből, az Email Routing pedig visszapattintja a levelet —
    // a feladó legalább MEGTUDJA, hogy nem ért célba. Ez ugyanaz az elv,
    // mint az űrlap 503-a: inkább őszinte hiba, mint hamis „megkaptuk".
    // Ezért áll ez a sor az auto-válasz ELŐTT is: nem ígérhetünk emberi
    // választ egy levélre, amit épp most vesztettünk el.
    await markUnsent(env, uzenetAzonosito(ts), rec, kuldes?.description);
  }

  const sh = await senderHash(from);
  const countKey = `cs:mailrl:${sh}:${dayKey()}`;
  const todayCount = parseInt(await env.FEEDBACK.get(countKey) || '0', 10);
  const gate = shouldAutoReply({ autoSubmitted: message.headers.get('Auto-Submitted') || '', from, todayCount });
  if (!gate.ok) { console.log('nincs auto-válasz:', gate.reason); return; }

  // ÜRES/OLVASHATATLAN LEVÉL (2026-07-22 audit): ha a MIME-feldolgozás elhasalt,
  // a tárgy és a törzs is üres marad — ilyenkor NINCS mit megválaszolni. Eddig
  // mégis elment egy AI-hívás üres kontextussal (elpocsékolt napi keret + a feladó
  // értelmetlen választ kapott). Most egyenesen a "továbbítottuk" sablon megy.
  const unreadable = !subject.replace('(no subject)', '').trim() && !text.trim();

  let engineResult = { text: '', escalate: true, links: [] };
  if (!unreadable && !(await globalLimitReached(env))) {
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
    // ⚠️ EZ EDDIG NÉMÁN NYELTE A HIBÁT — és 2026-09-08-án élesben meg is
    // történt: a `cs:mailrl:` kulcs hiánya árulta el, hogy ez a blokk dobott.
    // Kideríteni viszont NEM lehetett, mert a `console.log` sehova nem jut el
    // (a Worker-naplózás akkor nem volt bekapcsolva), a feladó pedig azt
    // hitte, kapott választ. A hibaüzenet mostantól napi számlálóba megy,
    // onnan a `/feedback-export`-on át a napi Telegram-riportba.
    const ok = String((e && e.message) || e || 'ismeretlen').slice(0, 160);
    console.log('email reply hiba', ok);
    try {
      await bumpCs(env, 'replyfail');
      // Az OK-ot külön kulcsba, hogy a riport meg tudja mondani, MIÉRT.
      // Egy szám önmagában nem javítható hiba.
      await env.FEEDBACK.put(`cs:replyfailwhy:${dayKey()}`, ok, { expirationTtl: 172800 });
    } catch { /* a naplózás hibája nem ronthatja el a levél feldolgozását */ }
  }
}
