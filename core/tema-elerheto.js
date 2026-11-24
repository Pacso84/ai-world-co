// ===================================================================
// MELY ÚTMUTATÓ-TÉMA VÁR TÉNYLEG MEGÍRÁSRA? (2026-11-24, user: „javítani kell!”)
// ===================================================================
// ÉLES ESET 11-24: csak 1 útmutató készült a napi 2 helyett, ezért a 2. Reel is elmaradt.
// A téma-tárban 29 nyitott téma volt: 6 fékezett (nincs jóváhagyott súgó) és 17 PARKOLT
// (a súgó-horgony nem talált illő cikket → 14 napig nem próbáljuk újra, core/sugo-horgony.js
// horgonyVar). A CEO a fékezetteket már kivonta, a parkoltakat NEM → 23 „várakozót” látott
// (cél: 16), ezért nem indította az ötletelőt (agents/guide/agent.js --ideas), pedig
// november óta az adta a legtöbb sikeres útmutatót. Az író közben mind a 23-at átugrotta.
// Ugyanez a trend-útmutatónál (core/trend-kutato.js trendFelvetelKell): a 11-20-i trend-téma
// parkolt, „várónak” számított → 11-20 óta egyetlen új trend-téma sem jött.
// A MÉRCE: vár = nem kész, nem fékezett, és nem parkol (a horgony-kapu be van kapcsolva).
// ===================================================================
import { fekezett as fekezettAlap } from './fek.js';
import { horgonyVar, HORGONY_BE } from './sugo-horgony.js';

/** Megírható-e MOST a téma? (`fekezett` csak a teszthez cserélhető) */
export function elerhetoTemaE(tema, most = Date.now(), { fekezett = fekezettAlap, horgonyBe = HORGONY_BE } = {}) {
  if (!tema || tema.status === 'done') return false;
  if (fekezett(tema).fek) return false;
  if (horgonyBe && horgonyVar(tema, most)) return false;
  return true;
}

/** A megírható témák száma (a CEO téma-puffere ehhez mér). */
export function elerhetoTemaDb(temak, most = Date.now(), opt = {}) {
  return (Array.isArray(temak) ? temak : []).filter(t => elerhetoTemaE(t, most, opt)).length;
}

/** Vár-e már egy megírható trend-téma? (ha igen, ma nem veszünk fel újat) */
export function varoTrendTemaE(tema, most = Date.now(), opt = {}) {
  return tema?.priority === 'trend' && elerhetoTemaE(tema, most, opt);
}
