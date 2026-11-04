// ===================================================================
// FELÚJÍTÁS-KAPU (2026-09-08) — mi engedi ÉLŐ cikk lecserélését?
// ===================================================================
// Az `agents/iro/upgrade-howtos.js` PUBLIKÁLT cikkeket ír át: naponta három
// futásban kettőt-kettőt, eddig 79-et. A csere feltétele 2026-09-08-ig NÉGY
// SZERKEZETI ellenőrzés volt — ép frontmatter, van `title:`, elég szó és
// lépés, megvan a brand-szekció. Mind azt kérdezi, hogy MEGVAN-E A FORMA.
// Egyik sem azt, hogy IGAZ-E, és egyik sem azt, hogy EGÉSZ-E.
//
// A prompt KÉRI a modelltől, hogy ne találjon ki menüt („NEVER invent a menu
// name") — de semmi nem ellenőrizte. A hitelesség-kapu valódi naplójában
// pedig pont ilyen blokkok állnak: „a 'Settings → Extensions → Google apps'
// menüútvonal KITALÁLT", „a 'Gemini Omni' nem tűnik valódi Google terméknek".
//
// ⚠️ MIÉRT ITT VAN, ÉS NEM AZ AGENTBEN. Az `agents/` alól semmit nem lehet
// importálni (25-ből 21 modul a fájl végén feltétel nélkül hívja a `main()`-t
// → a puszta import pénzt költ és publikál), tehát ami ott belül van, azt
// SOHA nem lehet tesztelni. A projekt szabálya (CLAUDE.md): a tesztelhető
// logika a `core/`-ba megy.
//
// ⚠️ AMI SZÁNDÉKOSAN NINCS ITT:
//   • AZ AI-BÍRÓ. Ez a modul INGYENES és hálózat nélküli — ez a szerződése.
//     A fizetős `truthGate()` a hívó dolga, és csak AKKOR fut, ha ez a kapu
//     átengedett: szerkezetileg rossz szövegre kifizetni a bírót veszteség.
//   • AMERIKAI HELYESÍRÁS. A `core/quality-guard.js --fix` a CI-ban később
//     fut (auto.yml:457), ingyen és idempotensen. Ide másolni felesleges.
//   • AZ ÍGÉRET-FEDEZET. Azt a hívó méri (`coversPromise`), mert a szabály
//     az Ellenőrzővel közös, és ott már van egy dokumentált másolata. Ide
//     behozni HARMADIK példányt csinálna belőle — „egy szám, ami több helyre
//     van kimásolva, matematikai biztonsággal szétcsúszik".
//     Ezért kapja PARAMÉTERKÉNT (`fedez`).
// ===================================================================

import { looksTruncated } from './truncation-guard.js';
import { eltuntIsmertNevek } from './name-guard.js';

/**
 * Van-e kifogás az ÚJ szöveg ellen? (ingyenes rétegek)
 *
 * A sorrend az OLCSÓTÓL a DRÁGA felé megy, és az ELSŐ kifogás nyer — a hívó
 * így egyetlen, olvasható indokot tud kiírni a naplóba.
 *
 * @param {object} p
 * @param {string} p.regiMd  a MOST kint lévő cikk (a névzár alapja)
 * @param {string} p.ujMd    amit be akarunk írni helyette
 * @param {boolean} p.fedez  fedezi-e az új szöveg a cím ígéretét
 * @param {string} [p.fedezIndok] mit írjunk ki, ha nem fedezi (pl. „412 szó / 2 lépés")
 * @returns {null|{kod:string, indok:string}} null = mehet tovább a fizetős kapura
 */
export function felujitasKifogas({ regiMd, ujMd, fedez, fedezIndok = '' } = {}) {
  const uj = String(ujMd == null ? '' : ujMd);
  const regi = String(regiMd == null ? '' : regiMd);

  // ⚠️ ÜRES VÁLASZ NEM SIKER. Ha nincs mit megnézni, az NEM „rendben" —
  // enélkül a modell néma bukása csendben lecserélné a cikket a semmire.
  if (!uj.trim()) return { kod: 'URES', indok: 'a modell nem adott szöveget' };

  // 1) ÉP FRONTMATTER. Nyitó ÉS záró határoló, saját sorban.
  // A 2026-07-28-i lecke: a `startsWith('---')` NEM volt elég — a „---title:"
  // alak átment rajta, a `coversPromise` pedig ilyenkor nem találta meg a
  // címet, így „nincs ígéret → nincs mit fedezni" alapon TÉVESEN átengedte.
  if (!/^---\r?\n[\s\S]*?\r?\n---/.test(uj.trimStart())) {
    return { kod: 'FRONTMATTER', indok: 'sérült frontmatter' };
  }
  if (!/^title:\s*\S/m.test(uj)) return { kod: 'NINCS_CIM', indok: 'nincs title mező' };

  // 2) ÍGÉRET-FEDEZET — a hívó mérte, mi csak beépítjük a sorrendbe.
  if (!fedez) return { kod: 'NEM_FEDEZ', indok: fedezIndok || 'nem fedezi a cím ígéretét' };

  // 3) A KÖTELEZŐ BRAND-SZEKCIÓ.
  if (!/what this means for you/i.test(uj)) {
    return { kod: 'NINCS_BRAND', indok: 'hiányzik a brand-szekció' };
  }

  // 4) CSONKA-ŐR. A fedezet-vizsgálat SZÓSZÁMOT néz, ezért egy 900 szavas,
  // mondat közepén elvágott szöveg átmegy rajta. Élesben 53 ilyen szöveg ment
  // ki (2026-08-26). Itt külön súlyos: siker esetén a hívó TÖRLI a fordítást,
  // tehát a csonka angol két további nyelvre is kimenne.
  if (looksTruncated(uj)) {
    return { kod: 'CSONKA', indok: '✂️ ELVÁGOTT SZÖVEG — mondat közepén ér véget' };
  }

  // 5) NÉV-ZÁR. Eltűnt-e a cikk TÁRGYA az átírásból? Ez a 2026-09-05-i eset
  // alakja (ChatRTX → „NVIDIA Chat"), csak itt az író követné el.
  // ⚠️ A `nameLockObjection()` NEM használható: az a `tool:`/`company:` mezőre
  // épül, azok pedig ezeken a cikkeken NINCSENEK (kimérve: 0/79). Ezért megy
  // a névlistából dolgozó változat — az a 79-ből 68-on (86%) tényleg fog.
  const eltunt = eltuntIsmertNevek(regi, uj);
  if (eltunt.length) {
    return {
      kod: 'NEV_ELTUNT',
      indok: '🔒 NÉV-ZÁR: eltűnt a cikkből: ' + eltunt.map(x => `${x.nev} (${x.volt}×)`).join(', ')
    };
  }

  return null;
}

export default { felujitasKifogas };
