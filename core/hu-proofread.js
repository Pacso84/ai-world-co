// ===================================================================
// MAGYAR HELYESÍRÁS — 2. LÉPCSŐ: a bíró és a döntés-tár
// ===================================================================
//
// A `core/hu-spellcheck.js` ingyen leszűkíti a 2325 szavas cikket néhány
// jelöltre. Itt dől el, melyik közülük valódi hiba.
//
// MIÉRT OLCSÓ: a bíró NEM a cikket kapja, hanem a néhány szót a mondatával —
// pár száz token. Az első lépcső végezte el a nehezét.
//
// AMI EGYSZER KIDERÜLT, AZ TÖBBÉ NEM KERÜL PÉNZBE. Minden ítélet a döntés-
// tárba kerül: a jó szó engedélylistára (többé meg sem kérdezzük), a rossz
// a tiltólistára — azt onnantól a `badFormsIn()` fogja meg, ingyen, AI nélkül.
// Ezért a költség idővel a nullához tart, ahogy a tár telítődik.
//
// ⚠️ A HALLGATÁS A BIZTONSÁGOS IRÁNY. Ha a bíró nem válaszol, értelmetlent
// mond, vagy a hálózat elszáll: NINCS ítélet. Egy téves „rossz" miatt a
// fordítás elbukna, és ANGOL szöveg maradna kint a magyar oldalon — az
// rosszabb, mint a hiba, amit javítunk.
// ===================================================================

import { extractJsonArray } from './extract-json.js';

/** Egy hívásban ennyi szót ítéltetünk meg — a hosszú lista pontatlanná tesz. */
export const BATCH = 40;

export const HU_JUDGE_PROMPT = `You are a Hungarian proofreader. For each word below, decide whether it is a VALID Hungarian word form in its sentence.

A word is INVALID only if it is not a real Hungarian form: a wrong suffix, broken vowel harmony, a missing or wrong accent, a typo, or a made-up inflection.

A word is VALID (ok: true) when it is:
- a correct Hungarian word, however rare or long (compounds count as valid),
- a technical or foreign loanword commonly written this way in Hungarian tech writing,
- an English term quoted inside Hungarian text,
- a product, brand or company name.

Respond with {"words": [{"word": "<exact word as given>", "ok": true|false, "correct": "<the correct Hungarian form>"}]}.
Include "correct" ONLY when ok is false. Judge every word you were given, and no others.
When unsure, answer ok: true — a wrong "invalid" verdict throws away a good translation.`;

/**
 * Csak az ÉKEZETEKBEN tér el a két alak?
 *
 * ⚠️ EZ A LEGSZIGORÚBB ZÁR, és ez dönti el, mihez nyúlhat a gép magától.
 * Az ékezet-helyreállítás bizonyíthatóan ártalmatlan: ugyanaz a szó, ugyanaz a
 * rag, csak a vesszők hiányoztak („kezdo" → „kezdő"). Bármi más a MONDATOT is
 * érintheti, és a bíró csak a szót látja — élesben ilyet adott:
 *   „anny" → „annyit"   → „annyit ideig tartott" (rossz)
 *   „biokra" → „biogra" → nem is szó
 * A fordítónk mért fő hibája épp az ékezet-vesztés, tehát ez a szűk kapu a
 * valódi hibák 59%-át fedi le.
 */
export function isAccentOnly(a, b) {
  const le = w => String(w == null ? '' : w).toLowerCase()
    .replace(/[áa]/g, 'a').replace(/[ée]/g, 'e').replace(/[íi]/g, 'i')
    .replace(/[óöőo]/g, 'o').replace(/[úüűu]/g, 'u');
  const x = le(a), y = le(b);
  return !!x && x === y;
}

/** Üres döntés-tár. `fix` = biztonsággal cserélhető, `review` = emberi szem kell. */
export function emptyStore() { return { ok: [], fix: {}, review: {} }; }

/**
 * Behelyettesíthető-e a javaslat?
 *
 * ⚠️ EZ A BIZTONSÁGI ZÁR. Ami ide bekerül, azt a gép MAGÁTÓL kicseréli az élő
 * szövegben. Ezért szigorú: egyetlen szó, csak betűkből — se szóköz, se
 * idézőjel, se „vagy". Élesben mindhárom előfordult már az első 80 ítéletben
 * (2026-08-20): «askolsz vagy „túl tág kérdéseket teszel fel».
 */
export function isFixable(correct) {
  const c = String(correct == null ? '' : correct).trim();
  if (!c || c.length > 40) return false;
  if (/\s/.test(c)) return false;
  if (/\bvagy\b|\bor\b/i.test(c)) return false;
  if (/[^A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű-]/.test(c)) return false;
  return true;
}

/**
 * A jelöltek megítélése.
 * @returns {Promise<{verdicts: {word,ok,correct?}[], costUsd: number}>} hibánál ÜRES
 */
export async function judgeWords({ candidates, ask, enabled = true, batch = BATCH }) {
  const ures = { verdicts: [], costUsd: 0 };

  // 🔌 VÉSZKAPCSOLÓ. A core/ai-router.js NEM nézi az agents.<név>.enabled
  // mezőt — a configban álló „enabled: false" magától SEMMIT nem kapcsol ki
  // (2026-08-19). Ezért itt, a core oldalán, teszttel őrizve.
  if (enabled === false) return ures;

  const lista = (Array.isArray(candidates) ? candidates : []).filter(c => c && c.word).slice(0, batch);
  if (!lista.length || typeof ask !== 'function') return ures;

  const kerdezett = new Set(lista.map(c => String(c.word)));
  const felsorolas = lista
    .map((c, i) => `${i + 1}. "${c.word}" — sentence: ${String(c.context || '').slice(0, 200)}`)
    .join('\n');

  let valasz;
  try {
    valasz = await ask(`Judge these ${lista.length} Hungarian words.\n\n${felsorolas}`,
      { agentName: 'proofread', systemPrompt: HU_JUDGE_PROMPT, maxTokens: 2000, jsonMode: true });
  } catch { return ures; }
  if (!valasz) return ures;

  // A tokent akkor is kifizettük, ha a válasz használhatatlan.
  const costUsd = Number(valasz.costUsd) || 0;
  let nyers;
  try { nyers = extractJsonArray(valasz.text); } catch { return { verdicts: [], costUsd }; }

  const verdicts = [];
  for (const v of Array.isArray(nyers) ? nyers : []) {
    if (!v || typeof v !== 'object') continue;
    const word = String(v.word || '');
    // Csak arról fogadunk el döntést, amit KÉRDEZTÜNK — a modell kitalálhat szavakat.
    if (!kerdezett.has(word)) continue;
    if (v.ok === true) { verdicts.push({ word, ok: true }); continue; }
    const correct = String(v.correct || '').trim();
    // Javaslat nélküli „rossz" ítélettel nem tudunk mit kezdeni. Eldobjuk.
    if (v.ok !== false || !correct || correct.toLowerCase() === word.toLowerCase()) continue;
    // AUTO-JAVÍTHATÓ-E? Élesben a bíró ilyet is adott:
    //   asksz → «askolsz vagy „túl tág kérdéseket teszel fel»
    // Ezt behelyettesíteni értelmetlen szöveget adna. Az ilyen a `review`
    // vödörbe megy: jelezzük, de magunktól nem nyúlunk hozzá.
    verdicts.push({ word, ok: false, correct, fixable: isFixable(correct) });
  }
  return { verdicts, costUsd };
}

/**
 * Az ítéletek beolvasztása a tárba. Tiszta függvény: ugyanaz be, ugyanaz ki.
 * A jó szó engedélylistára; a rossz vagy az AUTO-JAVÍTÓ térképbe, vagy —
 * ha a javaslat nem behelyettesíthető — az emberi szemet kérő listára.
 */
export function applyVerdicts(store, verdicts) {
  const s = {
    ok: [...new Set((store?.ok || []).map(w => String(w).toLowerCase()))],
    fix: { ...(store?.fix || {}) },
    review: { ...(store?.review || {}) }
  };
  const ma = new Date().toISOString().slice(0, 10);
  for (const v of Array.isArray(verdicts) ? verdicts : []) {
    if (!v || !v.word) continue;
    const w = String(v.word).toLowerCase();
    if (v.ok === true) {
      if (!s.fix[w] && !s.review[w] && !s.ok.includes(w)) s.ok.push(w);
      continue;
    }
    if (!v.correct) continue;
    // ⚠️ CSAK az ékezet-helyreállítás javul MAGÁTÓL. Minden más emberi szemet kér.
    // Élesben, MIELŐTT lefutott volna: „anny" → „annyit" a mondatból
    // „annyit ideig tartott"-ot csinált volna, a „biokra" → „biogra" pedig
    // nem is szó. A bíró a SZÓT nézi, a nyelvtan viszont a MONDATÉ.
    const cel = (v.fixable === true && isAccentOnly(v.word, v.correct)) ? s.fix : s.review;
    cel[w] = { correct: String(v.correct), at: ma };
    const i = s.ok.indexOf(w);
    if (i >= 0) s.ok.splice(i, 1);        // egy szó nem lehet egyszerre jó és rossz
  }
  return s;
}

/**
 * A MÁR MEGÍTÉLT hibák javítása a szövegben — ingyen, AI nélkül, idempotensen.
 *
 * MIÉRT JAVÍTUNK ÉS NEM BLOKKOLUNK (2026-08-20): a blokkolás azt jelentené,
 * hogy a fordítás elbukik és újrapróbál — és ha újra elbukik, ANGOL szöveg
 * marad kint a magyar oldalon. Az rosszabb, mint a hiba, amit javítunk.
 * A csere viszont mindig sikerül, és a régi cikkeket is rendbe teszi.
 * Ugyanez a ház bevált mintája a brit→amerikai helyesírásnál (us-spelling.js).
 *
 * ⚠️ SZÓHATÁRON cserél, SOHA nem előtagra. A helyesírás-szótárnál ez a csapda
 * KÉTSZER megfogott (az „analysis"-ből „analyzis" lett): az „almafa" nem az
 * „alma" hibája.
 *
 * @returns {{text: string, fixed: {word: string, correct: string}[]}}
 */
export function applyFixes(text, store) {
  const eredeti = String(text == null ? '' : text);
  const fix = store?.fix;
  if (!eredeti || !fix) return { text: eredeti, fixed: [] };

  let t = eredeti;
  const fixed = [];
  for (const [w, adat] of Object.entries(fix)) {
    const correct = adat?.correct;
    if (!correct) continue;
    let db = 0, kis = t.toLowerCase(), i = kis.indexOf(w);
    while (i >= 0) {
      if (!betu(kis[i - 1]) && !betu(kis[i + w.length])) {
        // A nagy kezdőbetűt megtartjuk: mondat elején is jó maradjon.
        const csere = /^[A-ZÁÉÍÓÖŐÚÜŰ]/.test(t[i])
          ? correct.charAt(0).toUpperCase() + correct.slice(1)
          : correct;
        t = t.slice(0, i) + csere + t.slice(i + w.length);
        kis = t.toLowerCase();
        db++;
        i = kis.indexOf(w, i + csere.length);
      } else {
        i = kis.indexOf(w, i + 1);
      }
    }
    if (db) fixed.push({ word: w, correct });
  }
  return { text: t, fixed };
}

/** Amit a gép NEM javíthat magától — ez megy a napi riportba. */
export function needsReview(store) {
  return Object.entries(store?.review || {}).map(([word, d]) => ({ word, correct: d?.correct || '' }));
}

/**
 * Szó része-e ez a karakter?
 *
 * A magyar ékezetes betűk IS azok — enélkül a szóhatár félrevágna.
 * ⚠️ A KÖTŐJEL IS SZÓ RÉSZE (2026-08-20, éles lelet): a bíró a „PDF-jéből"
 * szóból a „jéből" TÖREDÉKET kapta, és arra azt mondta, „PDF-ből". Ha a
 * kötőjelet szóhatárnak vennénk, a javítás „PDF-PDF-ből"-t csinálna belőle.
 */
function betu(ch) {
  return !!ch && /[-A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]/.test(ch);
}

export default {
  BATCH, HU_JUDGE_PROMPT, emptyStore, isFixable, isAccentOnly,
  judgeWords, applyVerdicts, applyFixes, needsReview
};
