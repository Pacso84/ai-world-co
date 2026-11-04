// ===================================================================
// ÚTMUTATÓ-FRISSÍTÉS, HA AZ ESZKÖZ VÁLTOZIK (2026-09-27)
// ===================================================================
//
// MIÉRT: egy útmutató a megírása napján igaz — de az eszközök változnak
// (új funkció, új modell, más elérhetőség), a mi útmutatónk pedig nem.
// Közben a saját HÍREINK pontosan jelzik, mikor változott valami.
// User 09-27 („oké"): ha új hír jön egy eszközről, a róla szóló régi
// útmutató frissüljön az új tényekkel.
//
// A döntés itt lakik (tiszta függvény, tesztelhető); a végrehajtás
// (írás + kapuk + csere) az agents/iro/upgrade-howtos.js-ben, ugyanazokkal
// a kapukkal, mint a vékony „hogyan"-cikkek felújítása.
//
// KORLÁTOK (a költség miatt): naponta legfeljebb FRISS_NAPI útmutató;
// ugyanazt 30 napon belül nem frissítjük újra; csak ≤30 napos hír indít
// frissítést, és csak az, ami a guide-sources relevancia-szűrőjén átmegy
// (ugyanaz az eszköz + témaszó a hír címében/Röviden-dobozában).
// ===================================================================
import { valasztHireket } from './guide-sources.js';

const NAP = 24 * 60 * 60 * 1000;
export const FRISS_NAPI = 1;
export const FRISS_SZUNET_NAP = 30;
export const HIR_FRISS_NAP = 30;
export const FRISS_MIN_KOZOS = 2;
export const REGI_NAP = 90;        // ennyi napja nem változott útmutató „régi"
export const REGI_HIR_NAP = 90;    // a régi útmutatónál ennyi napos hír is számít (= a hír-megőrzés)

/** Mikor változott utoljára az útmutató szövege (megjelenés / felújítás / frissítés). */
export function utolsoValtozas(meta = {}) {
  return [meta.published_at, meta.howto_upgraded_at, meta.fresh_updated_at, meta.fresh_checked_at]
    .map(x => Date.parse(x || '')).filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0);
}

/** Ma (UTC-nap) hány útmutató frissült már? */
export function maiFrissitesek(utmutatok, most = Date.now()) {
  const nap = new Date(most).toISOString().slice(0, 10);
  return (utmutatok || []).filter(u => String(u.meta?.fresh_updated_at || '').slice(0, 10) === nap).length;
}

/**
 * A frissítendő útmutatók, a legfrissebb hír szerint elöl.
 * @param {Array} utmutatok  [{ file, title, tool, company, meta }]
 * @param {Array} hirek      a guide-sources hírlistája
 * @returns {Array} [{ utmutato, hirek: [...] }] — legfeljebb a mai keret maradéka
 */
export function frissitendok(utmutatok, hirek, most = Date.now()) {
  const keret = Math.max(0, FRISS_NAPI - maiFrissitesek(utmutatok, most));
  if (!keret) return [];
  const ki = [];
  for (const u of utmutatok || []) {
    const utolso = utolsoValtozas(u.meta);
    if (u.meta?.fresh_updated_at && most - Date.parse(u.meta.fresh_updated_at) < FRISS_SZUNET_NAP * NAP) continue;
    // csak az útmutató utolsó változása UTÁN megjelent hírek számítanak. A hír-ablak
    // 30 nap — de a RÉGI (≥90 napja nem változott) útmutatónál a teljes megőrzött
    // hír-állomány (90 nap), hogy ne avuljon el (user 09-27: „nehogy elavultak legyenek").
    const ablak = (most - utolso >= REGI_NAP * NAP) ? REGI_HIR_NAP : HIR_FRISS_NAP;
    const ujabb = (hirek || []).filter(h => {
      const t = Date.parse(h.publishedAt || '');
      return Number.isFinite(t) && t > utolso && most - t <= ablak * NAP;
    });
    if (!ujabb.length) continue;
    // SZIGORÚBB egyezés (2 közös témaszó): a frissítés drágább és kockázatosabb, mint egy új útmutató
    // tényanyaga (09-27: 1 szóval „Zoom-jegyzőkönyv Grokkal" ← „Grok Imagine képgenerátor" lett volna).
    const v = valasztHireket({ title: u.title, tool: u.tool, company: u.company, angle: '' }, ujabb, most, FRISS_MIN_KOZOS);
    if (v.length) ki.push({ utmutato: u, hirek: v });
  }
  ki.sort((a, b) => String(b.hirek[0].publishedAt).localeCompare(String(a.hirek[0].publishedAt)));
  return ki.slice(0, keret);
}

/** A modell válasza azt jelzi-e, hogy a hír NEM változtat az útmutatón. */
export function nincsValtozas(szoveg) {
  return /^\s*NO[_ ]CHANGE\b/i.test(String(szoveg || ''));
}

export default { frissitendok, maiFrissitesek, utolsoValtozas, nincsValtozas, FRISS_NAPI };
