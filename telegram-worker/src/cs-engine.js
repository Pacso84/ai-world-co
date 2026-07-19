// ===================================================================
// CS-ENGINE — az automata ügyfélszolgálat közös válasz-motorja.
// kb.json (site-ról, KV-cache 6h) → kulcsszavas találatok → Workers AI.
// Szabályok a promptban: hatókör, nyelv, LINK CSAK A KB-BÓL, [ESCALATE].
// Spec: docs/superpowers/specs/2026-07-19-auto-ugyfelszolgalat-design.md
// ===================================================================
import { searchKb } from './kb-retrieval.js';

export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const SITE = 'https://aiworldhq.com';
const KB_TTL = 21600; // 6 óra

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

SCOPE — you may ONLY discuss: (a) this website (content, newsletter, error reports, support page), (b) practical AI-tool questions covered by our guides. For ANYTHING else (personal data, payments, legal/medical advice, coding help, homework, politics, other companies' support), start your reply with the exact marker [ESCALATE] and add one polite sentence suggesting the contact form.

HONESTY — answer ONLY from the KNOWLEDGE list below. NEVER invent tools, features, prices or URLs. Every link you give MUST be copied verbatim from the KNOWLEDGE list. If the list has no answer, start with [ESCALATE] and say honestly that you are not sure.

STYLE — ${LANG_RULE[lang] || LANG_RULE.en} Max ~120 words. Plain, warm, beginner-friendly. When a guide is relevant, recommend it with its link.

KNOWLEDGE:
${kbBlock}`;
}

// Fő belépő: {message, lang, fetchFn?} → {text, escalate, links}
export async function answer(env, { message, lang, fetchFn = fetch }) {
  try {
    const kb = await loadKb(env, lang === 'auto' ? 'en' : lang, fetchFn);
    const hits = searchKb(message, kb, 4);
    const res = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt(lang, hits) },
        { role: 'user', content: String(message).slice(0, 500) }
      ],
      max_tokens: 600
    });
    let text = String(res.response || '').trim();
    const escalate = text.startsWith('[ESCALATE]');
    text = text.replace(/^\[ESCALATE\]\s*/, '').trim();
    // Csak a kb-találatokban szereplő linkeket adjuk vissza kattinthatóként —
    // ha a modell mást írna, az a szövegben marad, de a UI-ban nem lesz gomb.
    const links = hits.filter(h => text.includes(h.u)).map(h => ({ t: h.t, u: h.u }));
    return { text, escalate, links };
  } catch (e) {
    console.log('cs-engine hiba', e && e.message);
    return { text: '', escalate: true, links: [] };
  }
}
