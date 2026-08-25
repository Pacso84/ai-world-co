// ===================================================================
// KÖZÉP-DOBOZ AZ ÚTMUTATÓKBAN (2026-08-25)
// ===================================================================
// A MÉRÉS, ami kiváltotta (23 nap forgalmi napló, 1047 belépő):
//   • a látogatók 63%-a ÚTMUTATÓRA érkezik (656 belépő), 26%-a hírre,
//   • 359 útmutatóból 0 kapott közép-dobozt, 437 hírből 397 igen,
//   • 359 útmutatóból 328 (91%) törzse EGYETLEN másik cikkünkre sem mutat,
//   • az olvasási mélység három hete moccanatlan 1,04 oldal/látogató.
//
// A közép-doboz 2026-08-03-án épült, pontosan a "miért nem olvasnak tovább"
// kérdésre — de a website/build.js-ben a HÍRNEK és az ÚTMUTATÓNAK KÜLÖN
// SABLONJA van (buildArticlePage / buildGuidePage), és a javítás csak az
// előbbibe került. Senki nem döntött úgy, hogy az útmutató kimaradjon:
// a kérdés fel sem merült. Kívülről a rendszer zöldnek látszott, mert a
// mérce ("van közép-doboz") a hírekre nézve teljesült.
//
// MIÉRT KÜLÖN MODUL A HÍRÉTŐL (withMidRead):
// A hír folyószöveg — ott a <h2>-ket kell megkeresni, és a felezőpontot a
// LÁTHATÓ SZÓSZÁM szerint. Az útmutató LÉPÉSSOR: a blokkok határa eleve
// pontosan ismert (`<div class="g-step" id="step-N">`), tehát itt nincs
// szükség becslésre. Ez nem másolat, hanem más feladat.
//
// ⚠️ SOHA NEM LÉPÉS KÖZEPÉN. Aki a 3. lépésnél tart, egy feladat közben van;
// a mondat közepén megszólítani rosszabb, mint kihagyni. A doboz mindig két
// lépés KÖZÉ kerül, és mindig CSAK EGY.
//
// A felirat a meglévő `midRead` kulcs ("Read this next" / "Ezt olvasd utána"
// / "Lee esto después") — az már eleve KÖVETKEZŐT ígér, nem eltérítést, és
// mind a három élő nyelven le van fordítva.
// ===================================================================

// Ennyi lépés alatt nem szakítjuk meg. Mérve: mind a 359 élő útmutatónak
// 4–11 lépése van, tehát ez a küszöb ma egyet sem zár ki — de megvéd attól,
// hogy egy jövőbeli 2-3 lépéses útmutató közepébe is beleírjunk.
export const MIN_LEPES = 4;

/**
 * Hányadik lépés ELÉ kerüljön a doboz? 0 = ne kerüljön sehova.
 * 4→3, 5→3, 6→4, 7→4, 11→6 — vagyis mindig a 40-50% közötti sávba.
 */
export function midStepNo(stepCount) {
  if (!Number.isInteger(stepCount) || stepCount < MIN_LEPES) return 0;
  return Math.floor(stepCount / 2) + 1;
}

/**
 * Beszúrja a dobozt a lépéssorba. Ha BÁRMI nem stimmel (nincs doboz, kevés
 * lépés, nem találjuk a határt), VÁLTOZATLANUL adja vissza a törzset —
 * a hiányzó doboz elviselhető, az elrontott útmutató nem.
 */
export function insertMidGuide(blocksHtml, stepCount, boxHtml) {
  if (typeof blocksHtml !== 'string' || !blocksHtml) return blocksHtml;
  if (typeof boxHtml !== 'string' || !boxHtml) return blocksHtml;
  const no = midStepNo(stepCount);
  if (!no) return blocksHtml;

  const marker = `<div class="g-step" id="step-${no}">`;
  const at = blocksHtml.indexOf(marker);
  // Nem találjuk → nem tippelünk. Ez akkor fordulhat elő, ha a lépés-blokk
  // felépítése megváltozik; olyankor inkább ne legyen doboz, mint rossz helyen.
  if (at < 0) return blocksHtml;

  return blocksHtml.slice(0, at) + boxHtml + blocksHtml.slice(at);
}
