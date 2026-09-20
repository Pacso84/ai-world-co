// ===================================================================
// CSOMAG-REKLÁM REEL — önálló videó, nem cikkből (2026-09-20, user-kérés)
// ===================================================================
// „uj reel videóban legyen népszerüsitve ami csak erröl szó és nincs köze
//  a hirekhez utmutatokhoz. de árak ne jelenjenek meg a reel videokban"
//
// A napi Reel egy ÚTMUTATÓBÓL készül (core/short-video.js cardsFromGuide).
// Ez a modul ugyanazt a vásznat és ugyanazt a papír-dizájnt használja, de a
// kártyákat KÉZZEL adja — mert nincs mögötte cikk.
//
// ⚠️ ÁR NEM JELENHET MEG. A user kifejezett kérése, és a `packs-reel.test.js`
// őrzi: se `$`, se „dollar", se „USD" egyik kártyán sem. A szám önmagában
// megengedett (az első tábla az útmutatók DARABSZÁMÁT mondja) — a tiltás az
// ÁRRA szól, nem a számjegyre.
//
// ⚠️ AZ ELSŐ TÁBLA SZÁMA NEM BEÉGETETT. A valódi útmutató-számot kapja
// kívülről; egy beégetett „449" fél év múlva hazugság lenne.
//
// 🔑 AZ ELSŐ TÁBLA KIMONDJA, HOGY AZ ÚTMUTATÓK INGYENESEK. Ár nélkül
// reklámozni egy fizetős terméket csak akkor tisztességes, ha nem keltjük
// azt a látszatot, hogy a csomag maga ingyen van. A videó azt mondja el,
// MI a termék; az árat az oldal mondja meg, egy kattintásra.
//
// ⚠️ HETI EGY, ÉS ELVISZI A NAPI HELYET. A Reel-sáv napi EGY videó (a Make
// keretéből 2 művelet), és a `memory/reel-pending.json` egyetlen tételt
// hordoz. Két Reel egy napon átépítést kívánna egy jól bejáratott, kényes
// úton — cserébe a két videó ugyanazon a napon egymással versenyezne a
// Facebook ajánlómotorjánál. Ezért a reklám-Reel a VASÁRNAPI helyet veszi el.
// Az ára: heti egy útmutató-Reel, mérve ~4,2 látogató.
// ===================================================================
import { tordel } from './short-video.js';

/** A hét melyik napján megy a reklám-Reel (0 = vasárnap, UTC). */
export const PROMO_NAP = 0;

/** A videó fájlneve — nem cikk-slug, ezért fix. */
export const PROMO_SLUG = 'packs';

/** Két reklám-Reel között legalább ennyi nap teljen el. */
export const PROMO_SZUNET_NAP = 6;

/** Az eladó oldal címe — ide visz a felirat linkje. */
export const PROMO_UT = '/packs';

const nap = (iso) => (typeof iso === 'string' && iso.length >= 10) ? iso.slice(0, 10) : '';

/**
 * Menjen-e MA a reklám-Reel?
 *
 * Tiszta függvény, hogy a teszt ne fájlokon keresztül kérdezze. Mind a négy
 * feltételnek teljesülnie kell:
 *   • a bolt ÉL (packs.json live:true) — különben üres boltot reklámoznánk
 *   • ma a promó napja van
 *   • ma még nem ment reklám-Reel
 *   • az előző reklám-Reel óta eltelt a szünet
 *
 * @param {{live:boolean, now:number, utolso?:string}} o
 * @returns {{kell:boolean, ok:string}}
 */
export function promoKell({ live, now = Date.now(), utolso = '' }) {
  if (!live) return { kell: false, ok: 'a bolt még nincs élesítve (packs.json live:false)' };
  const d = new Date(now);
  if (d.getUTCDay() !== PROMO_NAP) return { kell: false, ok: 'ma nem a promó napja' };
  const ma = d.toISOString().slice(0, 10);
  if (nap(utolso) === ma) return { kell: false, ok: 'ma már ment reklám-Reel' };
  if (utolso) {
    const eltelt = (now - Date.parse(utolso)) / 86400000;
    // A NaN (olvashatatlan időbélyeg) NEM akadály: inkább menjen ki egy
    // videó, mint hogy egy elrontott mező örökre elnémítsa a csatornát.
    if (Number.isFinite(eltelt) && eltelt < PROMO_SZUNET_NAP) {
      return { kell: false, ok: 'csak ' + eltelt.toFixed(1) + ' nap telt el az előző óta' };
    }
  }
  return { kell: true, ok: '' };
}

/**
 * A reklám-Reel kártyái.
 *
 * A 2–4. tábla három VALÓDI témánk — mindhárom benne van a csomagokban
 * (munka/email, biztonság, otthon). Kitalált képességet nem hirdetünk.
 *
 * @param {{utmutatoDb:number}} o a publikált útmutatók valódi száma
 */
export function promoKartyak({ utmutatoDb }) {
  const db = Number(utmutatoDb);
  // Szám nélkül nincs videó: a „AI guides, in plain English" hook szám
  // nélkül üresen konkrét, és a hallgatás a biztonságos irány.
  if (!Number.isFinite(db) || db < 1) return { cards: null, reason: 'nincs útmutató-szám' };

  const nyers = [
    { nagy: db + ' free AI guides', kicsi: 'Written for people in a hurry',
      mond: db + ' free AI guides, written for people in a hurry.' },
    { nagy: 'Reply to a hard email', kicsi: 'Without sounding angry',
      mond: 'Reply to a hard email, without sounding angry.' },
    { nagy: 'Spot a scam text', kicsi: 'Before you tap the link',
      mond: 'Spot a scam text before you tap the link.' },
    { nagy: 'Plan a week of dinners', kicsi: 'From what is in the fridge',
      mond: 'Plan a week of dinners from what is already in the fridge.' },
    { nagy: 'Now in PDF packs', kicsi: 'By subject, in reading order',
      mond: 'And now they come in PDF packs, by subject, in reading order.' },
    { nagy: 'Read them offline', kicsi: 'On a plane, or printed on paper',
      mond: 'Read them offline, on a plane, or printed on paper.' }
  ];

  const cards = nyers.map(k => ({ cimke: '', nagy: tordel(k.nagy), kicsi: k.kicsi, mond: k.mond }));
  cards.push({
    cimke: '',
    // A záró tábla NEM megy tördelőn: a cím kézzel tört, hogy a `.com/packs`
    // egyben maradjon. (A napi Reel ugyanígy csinálja.)
    nagy: 'aiworldhq\n.com/packs',
    kicsi: 'The guides are still free',
    // ⚠️ A felolvasó a pontot és a perjelet nem mondja ki.
    mond: 'Find the packs at aiworldhq dot com.'
  });
  return { cards, reason: '' };
}

/** A Reel alá kerülő szöveg. A link a poszt egyetlen célja. */
export function promoCaption({ site = 'https://aiworldhq.com', utmutatoDb = 0 } = {}) {
  const db = Number(utmutatoDb);
  const elso = Number.isFinite(db) && db > 0
    ? `We write plain-English AI guides for everyday life — ${db} of them, free to read.`
    : 'We write plain-English AI guides for everyday life, free to read.';
  return `${elso} Now also grouped by subject into PDF packs you can keep.`
    + `\n\n👉 ${String(site).replace(/\/$/, '')}${PROMO_UT}`;
}

export default { promoKell, promoKartyak, promoCaption, PROMO_NAP, PROMO_SLUG, PROMO_UT, PROMO_SZUNET_NAP };
