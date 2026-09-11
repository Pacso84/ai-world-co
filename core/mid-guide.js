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
// ===================================================================
// MÁSODIK DOBOZ (2026-09-11) — a hír-ág után az útmutató-ág is
// ===================================================================
// 2026-09-10-én a HÍR-sablon megkapta a második ajánlót, az útmutató nem.
// Ugyanaz a gyökérok, mint 2026-08-25-én: a build.js-ben KÉT sablon van,
// és a javítás csak az egyikbe került. A mérés, ami eldöntötte:
//   • 40 nap forgalma: a belépők 61%-a ÚTMUTATÓRA érkezik, 31% hírre,
//   • 429 élő útmutatóból 388 (90%) elég hosszú — a hírekből csak 19%,
//   • az útmutató ÖRÖKZÖLD, a hír 90 nap múlva törlődik.
// Vagyis a tegnapi javítás az oldal kisebbik, lejáró felét érte el.
//
// 🔑 ÉS AMIT A TÖRZS MA KÍNÁL: 8 élő útmutatót megnézve a szövegben
// PONTOSAN EGY belső cikk-link van, és az UGYANARRA mutat, mint a végi
// rács első kártyája. További 5 releváns útmutató ott ül 83%-nál, ahova
// a medián olvasó (görgetés ~50%) sosem ér el.
//
// ⚠️ AZ ELSŐ ÖTLETEM TÉVES VOLT: „nincs hely, 86% csak 5-6 lépéses".
// Megmérve az élő oldalakon a lépések SZÓ-pozícióját, a lépések
// egyenletesen oszlanak el, ezért az utolsó lépés elé tett doboz:
//   1. doboz 40-47% · 2. doboz 56-66% · távolság MEDIÁN 19 százalékpont
// A hír-ágon 21 pontot fogadtam el — vagyis ez ugyanaz a sűrűség.
// A lépésszám megvezetett; a SZÓ-pozíció mondta meg az igazat.
// ===================================================================

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

// Ennyi lépés VÁLASSZA EL a két dobozt. A szabályt szándékosan TÁVOLSÁGBAN
// fogalmazzuk meg, nem lépésszámban: ha egyszer változik a lépés-elrendezés,
// a szabály magától helyes marad. 2 lépés = ~19 százalékpont olvasott szöveg.
export const MASODIK_MIN_TAVOLSAG = 2;

/**
 * Hányadik lépés ELÉ kerüljön a MÁSODIK doboz? 0 = ne kerüljön sehova.
 * Az UTOLSÓ lépés elé — de csak ha elég messze van az elsőtől.
 * 4→0 (a kettő egymás mellé esne), 5→5, 6→6, 7→7, 11→11.
 * Mérve: ez 429 élő útmutatóból 415-öt (97%) érint; a 14 négylépéses
 * szándékosan marad egy dobozzal.
 */
export function masodikStepNo(stepCount) {
  const elso = midStepNo(stepCount);
  if (!elso) return 0;
  return stepCount - elso >= MASODIK_MIN_TAVOLSAG ? stepCount : 0;
}

/**
 * Beszúrja a dobozt a lépéssorba. Ha BÁRMI nem stimmel (nincs doboz, kevés
 * lépés, nem találjuk a határt), VÁLTOZATLANUL adja vissza a törzset —
 * a hiányzó doboz elviselhető, az elrontott útmutató nem.
 */
export function insertMidGuide(blocksHtml, stepCount, boxHtml, box2Html = '') {
  if (typeof blocksHtml !== 'string' || !blocksHtml) return blocksHtml;
  if (typeof boxHtml !== 'string' || !boxHtml) return blocksHtml;
  const no = midStepNo(stepCount);
  if (!no) return blocksHtml;

  const hatar = (n) => blocksHtml.indexOf(`<div class="g-step" id="step-${n}">`);
  const at = hatar(no);
  // Nem találjuk → nem tippelünk. Ez akkor fordulhat elő, ha a lépés-blokk
  // felépítése megváltozik; olyankor inkább ne legyen doboz, mint rossz helyen.
  if (at < 0) return blocksHtml;

  // MÁSODIK DOBOZ (2026-09-11) — csak ha KAPTUNK ilyet (a hívó dolga, hogy
  // MÁSIK cikkre mutasson: ugyanarra mutató két doboz rosszabb, mint egy).
  const no2 = (typeof box2Html === 'string' && box2Html) ? masodikStepNo(stepCount) : 0;
  const at2 = no2 ? hatar(no2) : -1;

  // ⚠️ HÁTULRÓL ELŐRE. Ha előbb az ELSŐ dobozt szúrnánk be, az eltolná a
  // második pozícióját, és a doboz egy lépés KÖZEPÉRE kerülne. Ugyanez a
  // csapda a hír-ágon is megvolt (website/build.js, withMidRead).
  let ki = blocksHtml;
  if (at2 > at) ki = ki.slice(0, at2) + box2Html + ki.slice(at2);
  return ki.slice(0, at) + boxHtml + ki.slice(at);
}
