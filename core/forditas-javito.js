// ===================================================================
// FORDÍTÁS-JAVÍTÓ (2026-10-20, user: „nem minden magyar, és szerintem ez vonatkozik a spanyolra
// is!” → „oké csináld”). A fordító szabálya (agents/translator) ELŐÍRJA, hogy a promptokat is
// lefordítsa, a modell mégis néha angolul hagyja őket — főleg idézőjelben, kódblokkban, `…`-ben.
// Az ellenőrző (core/translation-guard.js) a cikk EGÉSZÉT nézi, az egyes darabokat nem: 10-20-án
// ~38 magyar és ~20 spanyol fordításban maradt angol prompt, több angol bekezdés, főcím, sőt két
// spanyol cím/alcím is.
//
// Ez a modul MEGKERESI az angolul maradt darabokat (cím, alcím, fejezetcím, prompt, idézet,
// bekezdés, képfelirat) és KICSERÉLI őket a fordításukra. A fordítást a fordító kéri (rövid
// hívás, JSON-tömb válasz). Hálózat és lemez nélkül számol → tesztelhető.
// A szándékosan idegen nyelvű mondatot (nyelvtanulós cikk: „Alexa, speak Spanish…”) a modell
// változatlanul adja vissza; az ilyet megjegyezzük (`kihagyas`), hogy ne kérdezzük újra.
// ===================================================================

const EN = /\b(the|and|your|you|with|for|this|that|please|what|how|from|into|our|we|is|are|of|to|it|in|on|can|will|get|now|my|me|i)\b/gi;
const HELYI = {
  hu: /[áéíóöőúüű]|\b(és|egy|hogy|nem|az|ezt|vagy|meg|is|ha|mint|már|csak|nekem|kérlek)\b/gi,
  es: /[ñáéíóú¿¡]|\b(el|la|los|las|que|para|con|por|una|un|del|de|en|es|tu|su|se|lo|al|no|si|como|más|y)\b/gi
};
/** Egy futásban legfeljebb ennyi (cikk, nyelv) pár javul. */
export const MAX_FUTASONKENT = 30;

// A linkek CÉLJA és a nyers URL angol szavakból áll (slug) — az nem szöveg.
const tisztaSzoveg = s => String(s || '').replace(/\]\([^)]*\)/g, ']').replace(/https?:\/\/\S+/g, ' ').replace(/[`*_>#]/g, ' ');

/** Angolul maradt-e a darab a megjelenítés nyelvén? (`min`: legalább ennyi angol funkciószó) */
export function angolDarab(s, nyelv, min = 3) {
  const t = tisztaSzoveg(s);
  const e = (t.match(EN) || []).length;
  const h = (t.match(HELYI[nyelv] || /$^/) || []).length;
  return e >= min && e > h * 2;
}

function keresKiveteleken(md, re, tipus, min, nyelv, ki, foglalt) {
  for (const m of md.matchAll(re)) {
    const szoveg = m.groups?.t ?? m[1];
    const start = m.index + m[0].indexOf(szoveg);
    const end = start + szoveg.length;
    if (!szoveg || szoveg.trim().length < 12) continue;
    if (foglalt.some(([a, b]) => start < b && end > a)) continue;      // már egy nagyobb darab része
    if (!angolDarab(szoveg, nyelv, min)) continue;
    foglalt.push([start, end]);
    ki.push({ tipus, szoveg, start, end });
  }
}

/**
 * Az angolul maradt darabok egy fordított markdownban (frontmatterrel együtt).
 * @returns {{tipus: string, szoveg: string, start: number, end: number}[]} pozíció szerint
 */
export function angolDarabok(md, nyelv, mdEn = '') {
  if (typeof md !== 'string' || !md || !HELYI[nyelv]) return [];
  const ki = [], foglalt = [];
  // A kód-blokkok, a frontmatter címei és a fejezetcímek elöl: ezek a legnagyobb egységek.
  keresKiveteleken(md, /^title:\s*["']?(?<t>.+?)["']?\s*$/gm, 'cím', 2, nyelv, ki, foglalt);
  keresKiveteleken(md, /^subtitle:\s*["']?(?<t>.+?)["']?\s*$/gm, 'alcím', 3, nyelv, ki, foglalt);
  keresKiveteleken(md, /```[a-z]*\n(?<t>[\s\S]*?)\n?```/g, 'prompt', 3, nyelv, ki, foglalt);
  keresKiveteleken(md, /^#{1,4} (?<t>.+)$/gm, 'fejezetcím', 2, nyelv, ki, foglalt);
  // 2026-10-21: a rövid fejezetcímben („Before you start”) kevés az angol funkciószó → a számláló
  // nem látja. Ha megvan az angol eredeti, a vele SZÓ SZERINT egyező (legalább kétszavas) cím fordítatlan.
  if (mdEn) {
    const enCimek = new Set([...String(mdEn).matchAll(/^#{1,4} (.+)$/gm)].map(m => m[1].trim()));
    for (const m of md.matchAll(/^#{1,4} (?<t>.+)$/gm)) {
      const szoveg = m.groups.t;
      if (!enCimek.has(szoveg.trim()) || !/[a-z]{2,}\s+[a-z]{2,}/i.test(szoveg)) continue;
      const start = m.index + m[0].indexOf(szoveg), end = start + szoveg.length;
      if (foglalt.some(([a, b]) => start < b && end > a)) continue;
      foglalt.push([start, end]);
      ki.push({ tipus: 'fejezetcím', szoveg, start, end });
    }
  }
  keresKiveteleken(md, /!\[(?<t>[^\]\n]{12,})\]\(/g, 'képfelirat', 2, nyelv, ki, foglalt);
  keresKiveteleken(md, /`(?<t>[^`\n]{25,})`/g, 'prompt', 3, nyelv, ki, foglalt);
  keresKiveteleken(md, /["“„](?<t>[^"”“„*\n]{25,})["”]/g, 'idézet', 3, nyelv, ki, foglalt);
  // Bekezdés / idézet-blokk / felsorolás-sor: a sor szövege (jelölők nélkül), ha még nem foglalt.
  keresKiveteleken(md, /^(?:>\s*|[-*]\s+|\d+\.\s+)?(?<t>[^\n]{40,})$/gm, 'bekezdés', 5, nyelv, ki, foglalt);
  return ki.sort((a, b) => a.start - b.start);
}

/** A darabok kicserélése a fordításukra (hátulról előre, hogy a pozíciók érvényesek maradjanak). */
export function csere(md, darabok, forditasok) {
  let ki = md;
  const parok = darabok.map((d, i) => [d, forditasok[i]]).sort((a, b) => b[0].start - a[0].start);
  for (const [d, f] of parok) {
    if (typeof f !== 'string' || !f.trim()) continue;
    let uj = f.trim();
    // a frontmatter egy sor: idézőjel és sortörés nem kerülhet bele
    if (d.tipus === 'cím' || d.tipus === 'alcím') uj = uj.replace(/[\r\n]+/g, ' ').replace(/"/g, '”');
    if (d.tipus !== 'prompt' && d.tipus !== 'bekezdés') uj = uj.replace(/[\r\n]+/g, ' ');
    ki = ki.slice(0, d.start) + uj + ki.slice(d.end);
  }
  return ki;
}

/** A modell JSON-tömb válasza → tömb (azonos hossz); hibásra null. */
export function valaszFeldolgoz(szoveg, db) {
  const s = String(szoveg || '');
  const m = s.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const a = JSON.parse(m[0]);
    return Array.isArray(a) && a.length === db && a.every(x => typeof x === 'string') ? a : null;
  } catch { return null; }
}

/** Egyszerű, stabil ujjlenyomat (a kihagyás-listához). */
export function ujjlenyomat(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h.toString(36);
}

const NYELV = { hu: 'Hungarian', es: 'Spanish' };
const MEGSZOLITAS = {
  hu: 'Hungarian: INFORMAL (tegeződés) — "írd", "kattints", never "Ön".',
  es: 'Spanish: INFORMAL "tú" — never "usted".'
};

/** A javító kérés szövege (a fordító küldi el). */
export function javitoPrompt(darabok, nyelv) {
  return `These text segments come from an article on a friendly AI how-to website. The article is already translated into ${NYELV[nyelv]}, but these segments were left in English by mistake. Translate each segment into natural ${NYELV[nyelv]}.
Rules:
- ${MEGSZOLITAS[nyelv]}
- Example prompts and messages a reader would TYPE TO AN AI ASSISTANT must be translated too (keep them as something the reader can paste).
- Keep brand/product names (ChatGPT, Gemini, Alexa, Copilot…), real code, commands, file names and URLs unchanged. Keep [bracketed placeholders] but translate the words inside.
- Keep inline Markdown (**bold**, \`code\`, links) as it is.
- A quoted on-screen label of an English-only app (button, menu): translate it and keep the original in parentheses, e.g. „Írd le, mit szeretnél” (Describe what you want).
- Image-generator prompts: translate the description, keep technical parameters such as --ar 16:9 unchanged.
- If a segment is DELIBERATELY in a foreign language (e.g. the reader is practicing that language, or it is real program code), return it UNCHANGED.
Return ONLY a JSON array of ${darabok.length} strings, in the same order.

${JSON.stringify(darabok.map(d => d.szoveg), null, 1)}`;
}
