// ===================================================================
// ⚓ SÚGÓ-HORGONY — egy útmutató-TÉMA rögzítése a cég hivatalos súgójának EGY cikkéhez (tényközpont 1d)
// ===================================================================
// MIÉRT: a mérés szerint az útmutatók nagy része forrás nélkül, emlékezetből készül. A horgony előbb megkeresi
// a témához a jóváhagyott súgó (core/sugo-index.js) egy cikkét; csak ebből lehet az útmutatót megírni.
//
// MŰKÖDÉS (ez a fájl a TISZTA, hálózat nélküli fele; az async keresés és a bekötés a következő feladatokban jön):
//   1. indexSzukites — a súgó teljes cikklistájából a témához leginkább illő cikkcímek (a prompt hossza véges).
//   2. valasztoPromptTema / valasztoValasz — az AI SORSZÁMOT választ a listából (kitalált URL nem lehet).
//   3. ellenorzoPromptTema / ellenorzoValaszTema — második AI-lépés: a kiválasztott cikk szövege alapján
//      írható-e belőle hétköznapi felhasználónak szóló útmutató; a cím csak SZŰKÜLHET, témát nem válthat.
//
// Mintája: core/sugo-parositas.js (hírre), itt TÉMÁRA általánosítva; a közös részt onnan importáljuk.
// KIKAPCSOLÁS: HORGONY_BE = false → a mai működés (horgony nélkül is ír). A config `enabled` NEM kapcsoló.
// Teszt: core/sugo-horgony.test.js
// ===================================================================

import { INDEX_MAX, MIN_SUGO_SZOVEG, szavak, jsonKibont, valasztoValasz } from './sugo-parositas.js';

export const HORGONY_BE = true;
/** Futásonként legfeljebb ennyi horgony-próba (költség-fék: témánként ≤ 2 AI-hívás). */
export const FUTAS_MAX_PROBA = 6;
/** Sikertelen próba után ennyi nap múlva próbáljuk újra ugyanazt a témát. */
export const UJRAPROBA_NAP = 14;

// A választó válasz-értelmezése változatlanul ugyanaz, mint a hírnél: csak a listából, csak engedélyezett URL.
export { valasztoValasz, MIN_SUGO_SZOVEG };

const tiszta = s => String(s || '').replace(/\s+/g, ' ').trim();

/** Tartalmi szavak: a szöveg szavai az eszköz és a cég neve nélkül (azok minden cikkben „közösek”, nem jelentenek egyezést). */
function tartalmiSzavak(szoveg, tema) {
  // (a szavak() a párosítóé: kisbetű, nem [a-z0-9] mentén vágva, 3+ karakter, STOP-szavak nélkül)
  const nevek = new Set([...szavak(tema?.tool), ...szavak(tema?.company)]);
  return [...szavak(szoveg)].filter(w => !nevek.has(w));
}

/**
 * A súgó cikklistájának szűkítése a témához: pontszám = a téma címének és szögének szavai közül hány szerepel
 * a cikk címében. Csökkenő pontszám szerint rendez, egyenlőségnél az eredeti sorrend marad. Ha a lista nem
 * hosszabb a keretnél, változatlan sorrendű másolatot ad.
 */
export function indexSzukites(tema, index, max = INDEX_MAX) {
  const lista = Array.isArray(index) ? index : [];
  if (lista.length <= max) return lista.slice();
  const kulcsok = new Set(tartalmiSzavak(`${tema?.title || ''} ${tema?.angle || ''}`, tema));
  const pont = c => { let n = 0; for (const w of szavak(c?.cim)) if (kulcsok.has(w)) n++; return n; };
  return lista
    .map((c, i) => ({ c, i, p: pont(c) }))
    .sort((a, b) => b.p - a.p || a.i - b.i)   // stabil: azonos pontnál az eredeti sorrend
    .slice(0, max)
    .map(x => x.c);
}

/** A választó promptja: a téma + a súgó számozott cikkcímei; a válasz egy sorszám (0 = egyik sem). */
export function valasztoPromptTema(tema, index) {
  const lista = (index || []).slice(0, INDEX_MAX).map((c, i) => `${i + 1}. ${tiszta(c.cim).slice(0, 110)}`).join('\n');
  return {
    rendszer: `You match a GUIDE TOPIC for everyday users to ONE article of the company's OFFICIAL HELP CENTER.
Pick the help article that explains to an ordinary user how to use the feature named in the topic.
Pick 0 if no article is clearly about that exact feature (a neighbouring or unrelated feature is NOT a match).
Admin-only, developer/API-only or billing articles are NOT a match.
A generic "getting started" article matches ONLY a topic that itself is "Getting started with ...".
Output ONLY JSON: {"pick": <number>, "reason": "one short sentence"}`,
    felhasznalo: `GUIDE TOPIC: "${tiszta(tema?.title)}"
TOOL: ${tiszta(tema?.tool)} (${tiszta(tema?.company)})
ANGLE: ${tiszta(tema?.angle).slice(0, 300)}

HELP CENTER ARTICLES:
${lista}

Which ONE article explains how to use this feature? Output ONLY the JSON.`
  };
}

/**
 * Az ellenőrző promptja: a téma + a súgócikk szövege → írható-e belőle hétköznapi útmutató, és milyen címmel.
 * szint === 'reszleges': a forrás csak a funkció LÉTÉT igazolja → az útmutatóban nem lesz gomb-/menünév.
 */
export function ellenorzoPromptTema(tema, sugo, { szint } = {}) {
  const reszleges = szint === 'reszleges'
    ? `\nThe source level is PARTIAL: the help article only proves the feature EXISTS, so the guide will name no buttons, menus or icons — judge only whether a useful guide can be written without them.`
    : '';
  return {
    rendszer: `You decide whether an OFFICIAL HELP ARTICLE lets us write a step-by-step GUIDE for everyday people about a given TOPIC. Be STRICT.
Say ok = TRUE only if ALL hold:
1. The help article is about the SAME feature as the topic (not a neighbouring or older feature).
2. It describes steps an ordinary person (not an admin, not a developer, not an API user) can follow today.
3. A guide could be written using ONLY what the help article says — nothing invented.
Otherwise ok = FALSE.
If ok, the guide title must stay the SAME topic: either keep the topic title as is, or make it narrower so it promises ONLY what the help article covers. Never switch to a different topic. The title is "How to ..." or "Getting started with ...".${reszleges}
Output ONLY JSON: {"ok": true|false, "reason": "one short sentence", "title": "How to ..."}`,
    felhasznalo: `GUIDE TOPIC: "${tiszta(tema?.title)}"
TOOL: ${tiszta(tema?.tool)} (${tiszta(tema?.company)})
ANGLE: ${tiszta(tema?.angle).slice(0, 300)}

OFFICIAL HELP ARTICLE: "${tiszta(sugo?.cim)}" (${sugo?.url || ''})
${String(sugo?.szoveg || '').slice(0, 6000)}

Output ONLY the JSON.`
  };
}

/**
 * Az ellenőrző válasza → { ok:true, title, reason } vagy { ok:false, reason }.
 * A cím „How to …” vagy „Getting started with …” alakú, legfeljebb 110 karakter, és legalább egy tartalmi szót
 * megtart a téma eredeti címéből (11-12-i Workspace-eset: csendes témaváltás nincs).
 */
export function ellenorzoValaszTema(szoveg, tema) {
  const j = jsonKibont(szoveg);
  if (!j || j.ok !== true) return { ok: false, reason: tiszta(j?.reason) || 'nem értelmezhető válasz' };
  const title = tiszta(j.title);
  if (!/^(How to|Getting started with)\s+\S/i.test(title) || title.length > 110) {
    return { ok: false, reason: 'a javasolt cím nem „How to …” / „Getting started with …” alakú' };
  }
  const eredeti = new Set(tartalmiSzavak(tema?.title, tema));
  if (eredeti.size > 0 && !tartalmiSzavak(title, tema).some(w => eredeti.has(w))) {
    return { ok: false, reason: 'a javasolt cím más témáról szól, mint az eredeti téma' };
  }
  return { ok: true, title, reason: tiszta(j.reason).slice(0, 200) };
}

export default {
  HORGONY_BE, FUTAS_MAX_PROBA, UJRAPROBA_NAP,
  indexSzukites, valasztoPromptTema, valasztoValasz, ellenorzoPromptTema, ellenorzoValaszTema
};
