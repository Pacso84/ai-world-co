// ===================================================================
// CS-ENGINE — az automata ügyfélszolgálat közös válasz-motorja.
// kb.json (site-ról, KV-cache 6h) → kulcsszavas találatok → Workers AI.
// Szabályok a promptban: hatókör, nyelv, LINK CSAK A KB-BÓL, [ESCALATE].
// Spec: docs/superpowers/specs/2026-07-19-auto-ugyfelszolgalat-design.md
// ===================================================================
import { searchKb } from './kb-retrieval.js';

export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const SITE = 'https://aiworldhq.com';
const KB_TTL = 900; // 15 perc — a chatbot MINDIG a legfrissebb híreket lássa (2026-07-26).
// (Volt 6 óra; a kb.json minden pipeline-futáskor frissül a 40 legújabb hírrel, de
// a hosszú cache akár 6 óráig régi verziót szolgált ki. 15 perc = gyakorlatilag
// mindig friss, a chat kis forgalma mellett elhanyagolható extra kb.json-lekérés.)

export async function loadKb(env, lang, fetchFn = fetch) {
  const l = ['en', 'hu', 'es', 'de', 'fr'].includes(lang) ? lang : 'en';
  const key = `cs:kb:${l}`;
  const cached = await env.FEEDBACK.get(key);
  if (cached) { try { return JSON.parse(cached); } catch { /* újratöltés */ } }
  const url = l === 'en' ? `${SITE}/kb.json` : `${SITE}/${l}/kb.json`;
  const r = await fetchFn(url);
  if (!r.ok) throw new Error('kb fetch ' + r.status);
  const kb = await r.json();
  await env.FEEDBACK.put(key, JSON.stringify(kb), { expirationTtl: KB_TTL });
  return kb;
}

// A megszólítás-norma (2026-07-14) a promptban: hu=tegezés, de=du, es=tú, fr=vous.
const LANG_RULE = {
  en: 'Reply in English.',
  hu: 'Válaszolj magyarul, tegeződve (te).',
  es: 'Responde en español, tuteando (tú).',
  de: 'Antworte auf Deutsch, in der Du-Form.',
  fr: 'Répondez en français, en vouvoyant (vous).',
  auto: 'Reply in the same language the visitor wrote in.'
};

function systemPrompt(lang, hits) {
  const kbBlock = hits.length
    ? hits.map(h => `- ${h.t}: ${h.s} [${h.u}]`).join('\n')
    : '(no matching knowledge items)';
  return `You are the friendly automated support assistant of AI World HQ (${SITE}), a free news+guides site that helps everyday people use AI.

SCOPE — you may discuss: (a) this website (content, newsletter, error reports, support page), and (b) everyday AI questions: what AI tools do, how beginners can start, which of our guides helps. Use the exact marker [ESCALATE] at the START of your reply ONLY for genuinely off-topic or personal matters: someone's account/payment/personal data, legal or medical advice, writing their homework or essays, politics, or another company's customer support. Add one polite sentence pointing to the contact form.

HONESTY — this is the most important rule. Name an AI product ONLY if it appears in the KNOWLEDGE list below. Features, prices and links MUST also come from that list; NEVER invent a URL, a product, a price or a feature, and never guess a link's address — write a link only by copying it character-for-character from the list. If the KNOWLEDGE list has no specific answer, DO NOT escalate for that reason alone: give a short, genuinely useful general answer in plain language (no invented specifics), and point the visitor to our guides page ${SITE}/guides.html. Escalate only if the question is off-topic or you truly cannot help.

STYLE — ${LANG_RULE[lang] || LANG_RULE.en} Max ~120 words. Plain, warm, beginner-friendly. When a guide or a recent news article is relevant, recommend it with its link.

KNOWLEDGE:
${kbBlock}`;
}

// ===================================================================
// KITALÁLT-URL ŐR (2026-07-21, éles lelet a helyi próbán): a modell hihető, de
// NEM LÉTEZŐ címet írt ("aiworldhq.com/contact"). A cég alapszabálya: kitalált
// URL TILOS — a promptban kérni kevés, ezért determinisztikusan is kivágjuk.
// Ami nincs benne a kb.json-ban, az nem mehet ki az olvasóhoz.
// ===================================================================
// Az oldal ÁLLANDÓ menüoldalai — ezeket a build mindig legyártja, tehát valódiak.
// (Enélkül az őr a saját promptunk által ajánlott /guides.html-t is kivágta.)
const SITE_PAGES = ['', '/guides.html', '/tools.html', '/start.html', '/glossary.html', '/wizard.html', '/about.html', '/archive.html', '/support.html', '/feed.xml'];

// Egységes alak az összehasonlításhoz: kisbetű, záró írásjel/perjel nélkül,
// www nélkül, hiányzó séma pótolva. (2026-07-21 audit: e nélkül a NAGYBETŰS
// "HTTPS://…" és a séma nélküli "aiworldhq.com/contact" simán átcsúszott,
// a valódi ".../about.html/" alakot pedig tévesen kivágta a záró perjel miatt.)
function normUrl(u) {
  let s = String(u).trim().toLowerCase().replace(/[.,;:!?)\]]+$/, '').replace(/\/+$/, '');
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  return 'https://' + s;
}

function knownUrls(kb) {
  const set = new Set();
  const add = (u) => { if (u) set.add(normUrl(u)); };
  for (const g of kb.guides || []) add(g.u);
  for (const n of kb.news || []) add(n.u);
  for (const s of kb.site || []) add(s.u);
  for (const t of kb.terms || []) add(t.u);
  const lp = (kb.lang && kb.lang !== 'en') ? '/' + kb.lang : '';
  for (const p of SITE_PAGES) add(SITE + lp + p);
  return set;
}

// Séma nélküli saját-domain hivatkozást is elkapunk — a modell így írta a kamu címet.
const URL_RX = /(?:https?:\/\/[^\s<>()[\]"'*]+)|(?:(?:www\.)?aiworldhq\.com[^\s<>()[\]"'*]*)/gi;

export function stripUnknownUrls(text, kb) {
  const ok = knownUrls(kb);
  return String(text || '')
    .replace(URL_RX, (u) => (ok.has(normUrl(u)) ? u : ''))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

// Fő belépő: {message, lang, fetchFn?} → {text, escalate, links}
export async function answer(env, { message, lang, fetchFn = fetch }) {
  try {
    const kb = await loadKb(env, lang === 'auto' ? 'en' : lang, fetchFn);
    // 6 jelölt (2026-07-21: 4 volt) — a modell maga szűri, mi releváns; a laza
    // tő-egyezés miatt több a jelölt, és jobb, ha van miből válogatnia.
    const hits = searchKb(message, kb, 6);
    const res = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt(lang, hits) },
        { role: 'user', content: String(message).slice(0, 500) }
      ],
      max_tokens: 600
    });
    let text = String(res.response || '').trim();
    let escalate = text.startsWith('[ESCALATE]');
    text = text.replace(/^\[ESCALATE\]\s*/, '').trim();
    // Üres AI-válasz (sikeres hívás, de nincs tartalom) = degradált kimenet →
    // eszkaláció, hogy a hívó a fallback-útra tegye, ne üres buborék menjen ki.
    if (!text) escalate = true;
    // KITALÁLT URL kivágása MÉG a linkek számítása előtt (2026-07-21): ami nincs
    // a kb.json-ban, az ki sem kerül a szövegbe — így gomb sem lesz belőle.
    text = stripUnknownUrls(text, kb);
    if (!text) escalate = true;
    // Csak a kb-találatokban szereplő linkek lesznek kattintható gombok.
    const links = hits.filter(h => text.includes(h.u)).map(h => ({ t: h.t, u: h.u }));
    return { text, escalate, links };
  } catch (e) {
    console.log('cs-engine hiba', e && e.message);
    return { text: '', escalate: true, links: [] };
  }
}
