// ===================================================================
// „🔧 HA ELAKADSZ” DOBOZ — jelöltek, prompt, válasz-ellenőrzés (2026-10-24)
// ===================================================================
//
// MIÉRT: a user: „de a megoldást az útmutatókba rakjuk!” — az útmutató végére 2–4 tétel kerül
// (tünet → miért → megoldás → forrás), KIZÁRÓLAG hivatalos súgócikkekből (core/sugo-index.js).
// Terv: docs/superpowers/specs/2026-10-23-utmutato-segitseg-csomag-design.md (D) ·
//       docs/superpowers/plans/2026-10-24-ha-elakadsz-2a-meres.md (Task 2)
//
// A MÉRCE IRÁNYA: kitalált hibaelhárítás NEM mehet ki. Ezért a modell válaszát a kód is ellenőrzi:
//   • a forrás-URL a megadott cikkek egyike ÉS az engedélylistán van;
//   • a „miért” + „megoldás” mondatainak ≥60%-át a súgó szövege alátámasztja (forrasAlatamasztja);
//   • a „Common mistakes” megismétlése kiesik;
//   • 2-nél kevesebb maradó tétel → nincs doboz (nem hiba, a régi nézet marad).
// Tiszta modul: se AI-hívás, se hálózat, se lemez → tesztelhető (core/elakadas.test.js).
// ===================================================================

import { engedelyezett } from './sugo-index.js';
import { forrasAlatamasztja, mondatSzam } from './friss-tenyellenorzes.js';

/** KILL-SWITCH (spec D/8): false → nincs doboz (a generálás és a megjelenítés is erre néz). */
export const ELAKADAS_BE = true;

const STOP = new Set(('the and for with without your you yours how what why when where which who whom whose that this these those ' +
  'from into onto about use using used get gets getting can could does did doing done not are was were will would should ' +
  'its his her their them they our ours out all any more most some such than then there here has have had just also only ' +
  'very too each other over under after before cant dont isnt wont youre step steps guide way ways new instead ' +
  'may might must let lets via per one yet still own same both much many off now see').split(' '));

/** Kisbetű, írásjelek ki, ≥3 karakteres, stopszó nélküli szavak (ismétlődéssel). */
const tokenek = s => String(s || '').toLowerCase().replace(/[’']/g, '').split(/[^\p{L}\p{N}]+/u)
  .filter(w => w.length >= 3 && !STOP.has(w));

/**
 * Súgócikk-jelöltek: a cikkcímek kulcsszó-egyezése az útmutató címével és lépés-címsoraival.
 * Az eszköz nevének szavai 0,3 súllyal számítanak (a „ChatGPT” szinte minden OpenAI-cikkben ott van).
 * @param {{cim: string, eszkoz: string, lepesek: string[], hibak: string}} utm
 * @param {{url: string, cim: string}[]} index
 * @returns {{url: string, cim: string}[]} a legjobb n, 0 pontos nincs, csökkenő, stabil
 */
export function jeloltCikkek(utm, index, n = 4) {
  const kerdes = new Set(tokenek([utm?.cim, ...(utm?.lepesek || [])].join(' ')));
  const eszkoz = new Set(tokenek(utm?.eszkoz));
  return (index || [])
    .filter(c => c && engedelyezett(c.url))
    .map((c, i) => {
      let pont = 0;
      for (const w of new Set(tokenek(c.cim))) if (kerdes.has(w)) pont += eszkoz.has(w) ? 0.3 : 1;
      return { c, pont, i };
    })
    .filter(x => x.pont > 0)
    .sort((a, b) => b.pont - a.pont || a.i - b.i)
    .slice(0, n)
    .map(x => x.c);
}

/**
 * A modell promptja: CSAK a megadott súgócikkekből, SZIGORÚ JSON-kimenettel.
 * @param {{cim: string, eszkoz: string, lepesek: string[], hibak: string}} utm
 * @param {{url: string, cim: string, szoveg: string}[]} cikkek
 * @returns {{rendszer: string, felhasznalo: string}}
 */
export function promptEpit(utm, cikkek) {
  const eszkoz = String(utm?.eszkoz || '').trim();
  const eszkozSzabaly = eszkoz
    ? `- Every item is about ${eszkoz}.`
    : '- This guide is not tied to one tool. Every item MUST name the tool it applies to at the start of "fix" (e.g. "In ChatGPT: …", "In Gemini: …", "In Claude: …").';
  const rendszer = `You write the "If you get stuck" box for a how-to guide on AI World HQ.
Use ONLY the official help articles given in the user message. Your own memory is NOT a source.

Output STRICT JSON only (no prose, no code fence):
{"items":[{"symptom":"...","why":"...","fix":"...","prompt":"...","source":"..."}]}

Rules:
- 2 to 4 items.
- "symptom": how a reader would describe the problem in their own words (a question or a short sentence), max 90 characters.
- "why": the cause, at most 2 sentences.
- "fix": concrete steps, at most 3 sentences.
- "prompt" is optional: a copyable prompt the reader can paste. It must start with a straight quote ("). It may use [square brackets] for the reader's own details. Leave the field out if no prompt helps.
- "source" MUST be exactly one of the given article URLs: the article that supports the item.
- Do NOT repeat the guide's "Common mistakes" (given in the user message); add new problems only.
- If no article is relevant to the guide, return {"items":[]}.
${eszkozSzabaly}
- Never invent menus, buttons, settings, limits or features that are not in the article.
- US English.`;

  const lepesek = (utm?.lepesek || []).map(l => '- ' + l).join('\n');
  const cikkSzoveg = (cikkek || []).map((c, i) => `[${i + 1}] ${c.url}\n${c.cim}\n${c.szoveg}`).join('\n\n');
  const felhasznalo = `GUIDE TITLE: ${utm?.cim || ''}
TOOL: ${eszkoz || '(none — a general guide)'}
STEP HEADINGS:
${lepesek || '(none)'}

COMMON MISTAKES (already in the guide — do not repeat):
${String(utm?.hibak || '').trim() || '(none)'}

HELP ARTICLES:
${cikkSzoveg}`;
  return { rendszer, felhasznalo };
}

const szovegMezo = (v, max) => typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null;

/** A JSON kibontása: ```json burok → nyers szöveg → az első „{” és az utolsó „}” közötti rész. */
function jsonKibont(szoveg) {
  const s = String(szoveg || '').trim();
  const burok = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jeloltek = [burok ? burok[1] : null, s];
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) jeloltek.push(s.slice(a, b + 1));
  for (const j of jeloltek) {
    if (!j) continue;
    try { return JSON.parse(j); } catch { /* következő jelölt */ }
  }
  return null;
}

/**
 * A modell válaszának ellenőrzése: mezők, hosszak, és a forrás a megadott cikkek egyike + engedélyezett.
 * A rossz „prompt” mező törlődik, a tétel marad.
 * @returns {{symptom: string, why: string, fix: string, prompt?: string, source: string}[]}
 */
export function valaszErtelmez(szoveg, cikkek) {
  const j = jsonKibont(szoveg);
  if (!j || !Array.isArray(j.items)) return [];
  const urlek = new Set((cikkek || []).map(c => c?.url));
  const ki = [];
  for (const it of j.items) {
    if (!it || typeof it !== 'object') continue;
    const symptom = szovegMezo(it.symptom, 120), why = szovegMezo(it.why, 400), fix = szovegMezo(it.fix, 600);
    const source = typeof it.source === 'string' ? it.source.trim() : '';
    if (!symptom || !why || !fix || !urlek.has(source) || !engedelyezett(source)) continue;
    const tetel = { symptom, why, fix, source };
    const prompt = szovegMezo(it.prompt, 400);
    if (prompt && /^["“„]/.test(prompt)) tetel.prompt = prompt;
    ki.push(tetel);
  }
  return ki;
}

/**
 * A „miért” + „megoldás” mondatainak ≥60%-át a súgó szövege alátámasztja-e?
 * A bontás és a mondatonkénti mérce a forrasAlatamasztja-é (≥4 szavas mondatok; minden szám és a
 * tartalomszavak ≥60%-a a forrásban). 0 mondat → false.
 */
export function alatamasztott(item, forrasSzoveg) {
  const szoveg = `${item?.why || ''} ${item?.fix || ''}`.trim();
  const ossz = mondatSzam(szoveg);
  if (!ossz) return false;
  return forrasAlatamasztja(szoveg, '', forrasSzoveg || '').length / ossz >= 0.6;
}

/** A tünet tartalomszavainak ≥60%-a megvan-e az útmutató „Common mistakes” részében? */
export function ismetliHibat(item, hibak) {
  const w = tokenek(item?.symptom);
  if (!w.length) return false;
  const h = new Set(tokenek(hibak));
  return w.filter(x => h.has(x)).length / w.length >= 0.6;
}

/**
 * A kész doboz: alátámasztott és nem ismétlő tételek, a sorrend marad, legfeljebb 4.
 * @param {object[]} items          valaszErtelmez kimenete
 * @param {Record<string,string>} forrasok  URL → a súgócikk szövege
 * @param {string} hibak            az útmutató „Common mistakes” szövege
 * @param {boolean} [be]            kill-switch (teszthez)
 * @returns {{items: object[]} | null}  null = nincs doboz
 */
export function dobozKeszit(items, forrasok, hibak, be = ELAKADAS_BE) {
  if (!be) return null;
  const marad = (items || []).filter(it => alatamasztott(it, forrasok?.[it?.source]) && !ismetliHibat(it, hibak));
  return marad.length >= 2 ? { items: marad.slice(0, 4) } : null;
}
