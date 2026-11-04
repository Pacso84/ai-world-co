// ===================================================================
// RÉGI PROMPTOK KITÖLTHETŐVÉ TÉTELE — a BIZTONSÁGOS MAG (2026-10-29)
// ===================================================================
//
// MIÉRT (user 10-23, „mindegyik legyen ilyen vagy hasonló”): a kitölthető prompt (core/kitoltheto-prompt.js)
// csak ott működik, ahol az író [szögletes] helykitöltőt hagyott — a régi útmutatók promptjaiban konkrét
// példaszó áll („Plan a 3-day trip to Lisbon…”). A gép (core/kitoltheto-regi-gen.js) promptonként megjelöli
// a személyre szabható részeket; ez a modul ELLENŐRZI és MEGJELENÍTI őket.
//
// A SZÖVEG NEM VÁLTOZIK. A jelölés külön fájlban él (content/kitoltheto/<slug>.json), a mező ALAPBÓL az
// eredeti példaszót mutatja (value), így aki nem ír bele semmit, betűre ugyanazt a promptot másolja ki,
// mint eddig. KÓD-BIZTOSÍTÉK (mezokEllenoriz): csak az a mező marad, amelynek az eredeti szava PONTOSAN
// EGYSZER szerepel a promptban, nem fedi át a másikat, és a helyére visszaírva betűre az eredeti prompt jön
// ki. Ami nem felel meg, kiesik — a hiányzó mező jobb, mint a hibás (a mérce iránya).
//
// KILL-SWITCH: REGI_KITOLTHETO_BE = false → a következő buildtől a régi nézet, a generátor sem fut.
// ===================================================================
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { igaziHelykitolto, promptJelolt } from './kitoltheto-prompt.js';

export const REGI_KITOLTHETO_BE = true;
export const MAX_MEZO = 3;

const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const VAN_HELYKITOLTO = /\[([^\]\n]{0,60})\](?!\()/g;

/** A prompt azonosítója: a szöveg (szóköz-normalizálva) rövid hash-e — nyelvenként és útmutatónként tárolva. */
export function promptKulcs(szoveg) {
  return createHash('sha1').update(String(szoveg || '').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 12);
}

/** Van-e már igazi [helykitöltő] a promptban? (Akkor a meglévő mechanizmus kezeli, ide nem kell.) */
export function marKitoltheto(szoveg) {
  for (const m of String(szoveg || '').matchAll(VAN_HELYKITOLTO)) if (igaziHelykitolto(m[1])) return true;
  return false;
}

// A website/build.js guideSectionHtml két 💬-szabályának pontos mása (a (0) kódblokkos és a (2) egysoros).
// A bekötés-teszt (kitoltheto-regi.test.js) a build forrásából ellenőrzi, hogy a két regex ugyanaz maradt.
export const KODBLOKK_RX = /^[ \t>]*💬[ \t]*(?:\*\*[^*\n]{1,40}\*\*[ \t]*:?[ \t]*|(?:example|p[ée]lda(?:[ \t]*prompt)?|ejemplo|beispiel|exemple)[ \t]*:?[ \t]*)?[ \t]*\n+[ \t]*```[^\n]*\n([\s\S]*?)\n[ \t]*```[ \t]*$/gmi;
export const EGYSOR_RX = /^[ \t>]*💬[ \t]*(?:\*\*[^*\n]{1,40}\*\*[ \t]*:?[ \t]*|(?:example|p[ée]lda(?:[ \t]*prompt)?|ejemplo|beispiel|exemple)[ \t]*:?[ \t]*)?(.+)$/gmi;
const CIMKE_FUZES_RX = /^([ \t>]*💬[^\n]*:\*{0,2})[ \t]*\n+[ \t]*(?=[^\s`])/gm;

/**
 * Az útmutató-markdown BEÍRANDÓ promptjai, abban az alakban, ahogy a build a dobozba teszi
 * (a kódblokkos: a behúzás nélküli törzs; az egysoros: a promptJelolt szövege). A „Példa” dobozok kimaradnak.
 * @returns {{szoveg: string, tipus: 'kod'|'sor'}[]}
 */
export function promptokKinyer(bodyMd) {
  const ki = [];
  let pre = String(bodyMd || '').replace(/\[([^\]]+)\]\(\1\)/g, '$1');
  pre = pre.replace(KODBLOKK_RX, (m, body) => { ki.push({ szoveg: body.replace(/^[ \t]{1,8}/gm, ''), tipus: 'kod' }); return '\n'; });
  pre = pre.replace(CIMKE_FUZES_RX, '$1 ');
  for (const m of pre.matchAll(EGYSOR_RX)) {
    const { prompt, szoveg } = promptJelolt(m[1]);
    if (prompt) ki.push({ szoveg, tipus: 'sor' });
  }
  return ki;
}

const elofordulas = (szoveg, resz) => { let n = 0, i = -1; while ((i = szoveg.indexOf(resz, i + 1)) >= 0) n++; return n; };

/**
 * A KÓD-BIZTOSÍTÉK: a modell javaslataiból csak a biztonságos mezők maradnak, a promptbeli sorrendjükben.
 * @param {string} szoveg  az eredeti prompt
 * @param {{eredeti: string, hely: string}[]} mezok  a modell javaslata
 */
export function mezokEllenoriz(szoveg, mezok) {
  const s = String(szoveg || '');
  if (!s || marKitoltheto(s)) return [];
  const jo = [];
  for (const m of Array.isArray(mezok) ? mezok : []) {
    const eredeti = typeof m?.eredeti === 'string' ? m.eredeti : '';
    const hely = typeof m?.hely === 'string' ? m.hely.trim() : '';
    if (eredeti.trim().length < 2 || eredeti.length > 60 || /[\n[\]<>]/.test(eredeti)) continue;
    if (eredeti !== eredeti.trim()) continue;                       // szóköz a szélén → a csere szétesne
    if (!igaziHelykitolto(hely) || /[\n[\]<>"]/.test(hely) || hely.toLowerCase() === eredeti.toLowerCase()) continue;   // a hely nem lehet zárójeles/HTML
    if (elofordulas(s, eredeti) !== 1) continue;                    // pontosan EGYSZER
    const kezd = s.indexOf(eredeti), veg = kezd + eredeti.length;
    if (jo.some(x => kezd < x.veg && x.kezd < veg)) continue;      // átfedés
    jo.push({ eredeti, hely, kezd, veg });
    if (jo.length >= MAX_MEZO) break;
  }
  jo.sort((a, b) => a.kezd - b.kezd);
  // visszaírás-próba: a sablon [hely]-eibe az eredeti szavakat téve betűre az eredeti prompt
  let sablon = '', poz = 0;
  for (const x of jo) { sablon += s.slice(poz, x.kezd) + `\u0000${jo.indexOf(x)}\u0000`; poz = x.veg; }
  sablon += s.slice(poz);
  const vissza = sablon.replace(/\u0000(\d+)\u0000/g, (_, i) => jo[Number(i)].eredeti);
  if (vissza !== s) return [];
  return jo.map(({ eredeti, hely }) => ({ eredeti, hely }));
}

/**
 * Megjelenítés: a doboz HTML-jében az eredeti szavak helyére előre kitöltött mező kerül (value = az eredeti szó).
 * `escaped`: a doboz szövege már escape-elt-e (a kódblokkos igen, az egysoros nem — lásd build.js).
 * Ha egy szó a dobozban nem pontosan egyszer szerepel, az a mező kimarad.
 */
export function mezosites(boxHtml, mezok, { escaped = true, be = REGI_KITOLTHETO_BE } = {}) {
  let h = String(boxHtml || '');
  if (!be || !Array.isArray(mezok) || !mezok.length) return h;
  for (const { eredeti, hely } of mezok) {
    const cel = escaped ? esc(eredeti) : eredeti;
    if (elofordulas(h, cel) !== 1) continue;
    const e = esc(eredeti), hh = esc(hely);
    h = h.replace(cel, `<input class="g-fill g-fill--regi" type="text" value="${e}" placeholder="${hh}" aria-label="${hh}" size="${Math.max(6, eredeti.length)}" data-h="${hh}" data-o="${e}">`);
  }
  return h;
}

/** A kész jelölések betöltése egy útmutatóhoz (content/kitoltheto/<slug>.json) → { kulcs: [mezok] } vagy null. */
export function regiBetolt(root, slug) {
  try {
    const ut = join(root, 'content', 'kitoltheto', slug + '.json');
    if (!existsSync(ut)) return null;
    const j = JSON.parse(readFileSync(ut, 'utf-8'));
    return j && typeof j.promptok === 'object' ? j.promptok : null;
  } catch { return null; }
}
