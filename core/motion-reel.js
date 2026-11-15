// ===================================================================
// MOTION DESIGN REEL — rövid, mozgó „egy trükk” videó egy útmutatóból (2026-11-15)
// ===================================================================
//
// MIÉRT VAN: a 11-15-i mérés (memoria/reports/Reelek és posztok — kutatás (2026-11-15).md) szerint a
// Facebookon a néző átlagosan 1,7 mp-et néz a 28–34 mp-es, állóképes táblás Reeljeinkből, és a 3 mp-es
// nézés aránya 8,3%. A Meta és a TikTok saját leírása szerint a fő jel a VÉGIGNÉZÉS, és mindkettő
// lefokozza az egyforma, tömeges tartalmat. A user 11-15-én a motion designt választotta
// („rád bízom a döntést! de jó lenne több megtekintő!”).
//
// MIT CSINÁL (a régi core/short-video.js-hez NEM nyúl):
//   • 12–18 mp: a horog (a cím ígérete) + az első 3 lépés + a webcím. Nem a teljes útmutató.
//   • az ELSŐ KÉPKOCKÁN már ott a teljes ígéret, és már mozog (nincs beúszás, nincs csend):
//     a hang a 0. mp-ben indul.
//   • SZAVANKÉNT SZINKRON FELIRAT: a Microsoft-felolvasó szóidőzítéséből (WordBoundary) — sokan hang
//     nélkül görgetnek.
//   • 3 VÁLTAKOZÓ SABLON (tinta / borito / papir) — hogy ne legyen minden Reel egyforma.
//   • HUROK: az utolsó ~0,4 mp pontosan az első képkocka → a lejátszó újraindításakor nincs vágás.
//
// KAPCSOLÓ: MOTION_REEL_BE = false → az éles gyártás (core/reel-post.js) a RÉGI Reelt gyártja.
// Élesíteni csak a user előnézet utáni jóváhagyásával szabad.
//
// ⚠️ IMPORTRA NEM INDUL EL (őrszem a fájl végén) — ugyanaz a szabály, mint a short-video.js-ben.
// ===================================================================

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BETU_CSALAD, betuRendben } from './video-font.js';
import { horogCimbol, horogSzeles, W, H, SAV_FELSO } from './short-video.js';

// ✅ BE (user, 11-15, az előnézet után: „rád bízom, de úgy válassz, hogy amelyik a legtöbb nézőt hozhatja!”).
// A döntés: mindhárom sablon váltakozva megy, 2 hét mérés után a győztes(ek) maradnak (cikkenként _meta.video_sablon).
// ⛔ VISSZA A RÉGI REELRE: false → a core/reel-post.js minden útmutató-videót a régi short-video.js-sel gyárt.
export const MOTION_REEL_BE = true;

export const FPS = 30;
export const LEPES_DB = 3;                // az útmutatóból ennyi lépés kerül a videóba
export const SZUNET_MP = 0.22;            // szegmensek közti levegő (a régi Reelben 0,45)
export const HUROK_MP = 0.4;              // a végén az első képkocka ennyi ideig → varrat nélküli hurok
export const CEL_MIN_MP = 12, CEL_MAX_MP = 18;
export const SZO_PER_MP = 2.5;            // becsléshez (Ava a CI-ban 11-15: ~2,9 szó/mp + mondatvégi szünetek)
export const SABLONOK = ['tinta', 'borito', 'papir'];
export const MARKA_URL = 'aiworldhq.com';

const SZIN = {
  tinta: '#1c1a16', papir: '#f2ede4', zsalya: '#5f8a76', sarga: '#f5d547', menta: '#9cc7b2', feher: '#ffffff'
};

// A szöveges terület: a felső Facebook-sáv (SAV_FELSO) alatt, a leírás-sáv fölött.
export const SZOVEG_X = 90, SZOVEG_SZELES = 1080 - 90 - 170;   // jobb oldalon a FB-gombok sávja szabad
// tinta/papir: fent a borító-ablak, alatta a szöveg; borito: a szöveg a kép közepén
export const ABLAK_TETO = SAV_FELSO + 120, ABLAK_MAG = 400;      // 370…770
export const SZOVEG_ELRENDEZES = {
  // lepesMaxMag: a lépés alatt a pöttysor is elfér (alja + ~90 px ≤ 1290)
  ablakos: { kozepY: 1060, maxMag: 380, lepesMaxMag: 280 },    // 870…1250 (a leírás-sáv 1290-nél kezdődik)
  borito:  { kozepY: 860, maxMag: 600, lepesMaxMag: 600 }
};
export const SOR_TAV = 1.14;
export const SZOKOZ_SZORZO = 1.3;     // a kiemelő „pirula” ne érjen a szomszéd szóhoz

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const szavak = s => String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
/** Hány szót mond ki a felolvasó (a csak írásjelből álló „szó” nem számít). */
export const kimondottDb = s => szavak(s).filter(w => /[\p{L}\p{N}]/u.test(w)).length;

function cimFm(md) {
  const m = String(md).match(/^title:\s*"?(.*?)"?\s*$/m);
  return m ? m[1].replace(/\\"/g, '"').trim() : '';
}

/** A lépés-fejléc rövid alakja: legfeljebb 8 szó (a „—”/„:” utáni magyarázat nélkül). */
const LOGO_VEG = /^(a|an|the|and|or|for|to|of|in|on|with|by|from|your|any)$/i;
export const LEPES_MAX_SZO = 7;
export function lepesRovid(l) {
  let s = String(l).replace(/\s*[—–:(].*$/, '').replace(/[.!]+$/, '').trim();
  // hosszú lépés: az első tagmondat (az „and” előtti rész) — „Open a new chat and check for…” → „Open a new chat”
  if (szavak(s).length > LEPES_MAX_SZO - 1 && /\s(and|then)\s/i.test(s)) {
    const elso = s.split(/\s(?:and|then)\s/i)[0].trim();
    if (szavak(elso).length >= 2) s = elso;
  }
  let sz = szavak(s);
  if (sz.length > LEPES_MAX_SZO) {
    sz = sz.slice(0, LEPES_MAX_SZO);
    while (sz.length > 2 && LOGO_VEG.test(sz[sz.length - 1])) sz.pop();   // ne lógjon a végén „for an”
    s = sz.join(' ');
  }
  return s;
}

/**
 * A szkript: szegmensek, mindegyikben a KIMONDOTT szöveg (`mond`) és a KÉPEN látszó (`kep`).
 * `elotag` = a kimondott szöveg elején ennyi szó NEM látszik a képen (pl. a „Two.” sorszám).
 */
export function trukkSzkript(md) {
  if (typeof md !== 'string' || !md.trim()) return { szegmensek: null, reason: 'nincs szöveg' };
  const cim = cimFm(md);
  if (!cim) return { szegmensek: null, reason: 'nincs cím' };
  const lepesek = [...md.matchAll(/^##\s*Step\s*\d+\s*[—–:-]\s*(.+)$/gim)].map(m => m[1].trim());
  if (lepesek.length < LEPES_DB) return { szegmensek: null, reason: `csak ${lepesek.length} lépés` };

  const horog = horogCimbol(cim).replace(/[.:]\s*$/, '').trim();
  const db = LEPES_DB;
  const szegmensek = [{
    tipus: 'horog', kep: horog, elotag: 0,
    // 11-15 CI-minta: a mondatvégi szünetek (~0,4 mp) holt időt adtak → rövid zárás, a „3 QUICK STEPS” a képen látszik
    mond: `${horog}. Here's how.`
  }];
  lepesek.slice(0, db).forEach((l, i) => {
    const r = lepesRovid(l);
    // a sorszám CSAK a képen („STEP 1 / 3”): kimondva („One.”) utána ~0,4 mp csend jött, üres képpel
    szegmensek.push({ tipus: 'lepes', szam: i + 1, db, kep: r, elotag: 0, mond: `${r}.` });
  });
  // ⚠️ A felolvasó a pontot nem mondja ki — ezért „dot com” (ugyanaz, mint a régi Reelben).
  szegmensek.push({ tipus: 'vege', kep: 'Full guide: ' + MARKA_URL, elotag: 0, mond: 'Full guide at aiworldhq dot com.' });
  return { szegmensek, reason: '' };
}

/** Becsült hossz (mp) a tényleges hang nélkül. */
export function becsultHossz(szegmensek) {
  const sz = szegmensek.reduce((a, s) => a + kimondottDb(s.mond), 0);
  return sz / SZO_PER_MP + szegmensek.length * SZUNET_MP + HUROK_MP;
}

/** A becsült szóidőzítés (ha nincs valódi): egyenletesen a szegmens hosszán. */
export function becsultSzavak(mond) {
  const n = kimondottDb(mond), hossz = n / SZO_PER_MP;
  return { hossz, szavak: Array.from({ length: n }, (_, i) => ({ t: i * hossz / n, d: hossz / n })) };
}

/**
 * Az idővonal: szegmensenként kezdet/vég, és a KÉPEN látszó szavak indulási ideje.
 * @param hangok [{hossz, szavak:[{t,d}]}] — szegmensenként a felolvasó mért adatai (mp, a szegmens elejétől)
 */
export function idovonal(szegmensek, hangok) {
  let t0 = 0;
  const ki = szegmensek.map((s, i) => {
    const h = hangok[i];
    const kepSzavak = szavak(s.kep);
    const kimondott = h.szavak || [];
    const elvart = kimondottDb(s.mond);
    // 1:1 megfeleltetés, ha a felolvasó pont annyi szót jelzett, amennyit vártunk; különben arányos.
    const egyezik = kimondott.length === elvart && elvart > 0;
    const kepDb = kepSzavak.length;
    const kezdet = j => {
      if (!kimondott.length) return t0 + j * h.hossz / Math.max(1, kepDb);
      if (egyezik) {
        // a képen látszó j. szó = a kimondott (elotag + j.) szó; a „Full guide:” stb. írásjelei nem számítanak
        const k = Math.min(kimondott.length - 1, s.elotag + j);
        return t0 + kimondott[k].t;
      }
      const k = Math.min(kimondott.length - 1, Math.floor((j + s.elotag) * kimondott.length / (kepDb + s.elotag)));
      return t0 + kimondott[k].t;
    };
    const seg = { ...s, kezd: t0, veg: t0 + h.hossz + SZUNET_MP, szavak: kepSzavak.map((w, j) => ({ w, t: kezdet(j) })) };
    t0 = seg.veg;
    return seg;
  });
  return { szegmensek: ki, hangVege: t0, osszes: t0 + HUROK_MP };
}

// ── TÖRDELÉS ────────────────────────────────────────────────────────
/** Mohó sortördelés: a sorok a szavak indexeivel. */
export function tordelSzavak(ws, meret, max = SZOVEG_SZELES) {
  const sorok = [[]];
  let sz = 0;
  const ur = horogSzeles(' ', meret) * SZOKOZ_SZORZO;
  ws.forEach((w, i) => {
    const ww = horogSzeles(w, meret);
    const cur = sorok[sorok.length - 1];
    if (cur.length && sz + ur + ww > max) { sorok.push([i]); sz = ww; } else { cur.push(i); sz += (cur.length > 1 ? ur : 0) + ww; }
  });
  return sorok;
}

/** A legnagyobb betűméret, amivel a szöveg kifér (szélesség + magasság). */
export function illesztes(ws, { maxMeret = 112, minMeret = 60, maxMag = 380, max = SZOVEG_SZELES } = {}) {
  for (let m = maxMeret; m >= minMeret; m -= 4) {
    const sorok = tordelSzavak(ws, m, max);
    const tulSzeles = ws.some(w => horogSzeles(w, m) > max);
    if (!tulSzeles && sorok.length * m * SOR_TAV <= maxMag) return { meret: m, sorok };
  }
  return { meret: minMeret, sorok: tordelSzavak(ws, minMeret, max) };
}

// ── MOZGÁS ──────────────────────────────────────────────────────────
const korlat = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const kiKifut = x => 1 - Math.pow(1 - korlat(x), 3);                       // ease-out cubic
const tulLendul = x => { x = korlat(x); const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

/** Az adott időpont állapota (tiszta függvény, a hurok-vég az első képkocka állapotát adja). */
export function allapot(iv, t) {
  const segs = iv.szegmensek;
  if (t >= iv.hangVege) return { seg: segs[0], si: 0, lt: 0, t: 0, hurok: true };   // a kocka = a t=0 kocka
  let si = segs.findIndex(s => t < s.veg);
  if (si < 0) si = segs.length - 1;
  return { seg: segs[si], si, lt: t - segs[si].kezd, t, hurok: false };
}

/** Egy szó megjelenése: látszik-e, mekkora (pop), aktív-e. */
export function szoAllapot(seg, j, t) {
  const sz = seg.szavak[j];
  const kov = seg.szavak[j + 1];
  // A HOROG az első képkockától TELJESEN látszik (az ígéret azonnal olvasható); a többi szegmensben
  // a szó akkor jelenik meg, amikor elhangzik.
  const lathato = seg.tipus === 'horog' || seg.tipus === 'vege' || t >= sz.t - 0.04;
  // a horog első szava az első képkockától ki van emelve (a felolvasó ~0,1 mp csenddel kezd) → a hurok-vég is ezt mutatja
  const elsoHorog = seg.tipus === 'horog' && j === 0;
  const aktiv = (elsoHorog || t >= sz.t - 0.04) && (!kov || t < kov.t - 0.04) && t < seg.veg - SZUNET_MP + 0.1;
  const kor = t - sz.t;
  const skala = seg.tipus === 'horog' ? (kor >= 0 && kor < 0.18 ? 1 + 0.08 * (1 - kiKifut(kor / 0.18)) : 1)
    : (kor < 0 ? 0.6 : 0.6 + 0.4 * tulLendul(kor / 0.2));
  return { lathato, skala, aktiv, mult: t >= (kov ? kov.t : seg.veg) };
}

// ── KÉPKOCKA (SVG RÉTEG) ────────────────────────────────────────────
const SABLON_STILUS = {
  tinta:  { szoveg: SZIN.papir, aktiv: SZIN.sarga, halvany: 'rgba(242,237,228,0.55)', cimke: SZIN.menta, pirula: null },
  borito: { szoveg: SZIN.feher, aktiv: SZIN.tinta, halvany: 'rgba(255,255,255,0.7)', cimke: SZIN.sarga, pirula: SZIN.sarga },
  papir:  { szoveg: SZIN.tinta, aktiv: SZIN.zsalya, halvany: 'rgba(28,26,22,0.55)', cimke: SZIN.zsalya, pirula: null, alahuz: true }
};

function szovegBlokk(seg, t, st, { kozepY, tipusMeret } = {}) {
  const ws = seg.szavak.map(s => s.w);
  const { meret, sorok } = illesztes(ws, tipusMeret || {});
  const sorMag = meret * SOR_TAV;
  const teteje = kozepY - (sorok.length * sorMag) / 2;
  const ur = horogSzeles(' ', meret) * SZOKOZ_SZORZO;
  const ki = [];
  sorok.forEach((sor, si) => {
    const szelek = sor.map(i => horogSzeles(ws[i], meret));
    const teljes = szelek.reduce((a, b) => a + b, 0) + ur * (sor.length - 1);
    let x = SZOVEG_X + (SZOVEG_SZELES - teljes) / 2;
    const alap = teteje + si * sorMag + meret * 0.86;
    sor.forEach((i, k) => {
      const a = szoAllapot(seg, i, t);
      const sz = szelek[k];
      if (a.lathato) {
        const cx = x + sz / 2, cy = alap - meret * 0.35;
        const tr = a.skala !== 1 ? ` transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${a.skala.toFixed(3)}) translate(${(-cx).toFixed(1)} ${(-cy).toFixed(1)})"` : '';
        let fill = st.szoveg;
        if (seg.tipus !== 'horog' && seg.tipus !== 'vege' && !a.aktiv && !a.mult) fill = st.halvany;
        if (a.aktiv && st.pirula) {
          ki.push(`<rect x="${(x - 10).toFixed(1)}" y="${(alap - meret * 0.86).toFixed(1)}" width="${(sz + 20).toFixed(1)}" height="${(meret * 1.08).toFixed(1)}" rx="${(meret * 0.22).toFixed(1)}" fill="${st.pirula}"${tr}/>`);
          fill = st.aktiv;
        } else if (a.aktiv) fill = st.aktiv;
        if (a.aktiv && st.alahuz) ki.push(`<rect x="${x.toFixed(1)}" y="${(alap + meret * 0.14).toFixed(1)}" width="${sz.toFixed(1)}" height="${Math.round(meret * 0.1)}" rx="4" fill="${SZIN.zsalya}"/>`);
        ki.push(`<text x="${x.toFixed(1)}" y="${alap.toFixed(1)}" font-size="${meret}" font-family="${BETU_CSALAD}" font-weight="900" fill="${fill}"${tr}>${esc(ws[i])}</text>`);
      }
      x += sz + ur;
    });
  });
  return { svg: ki.join('\n'), teteje, alja: teteje + sorok.length * sorMag, meret };
}

/** A teljes rárajzolt réteg egy képkockához. */
export function kockaSvg(iv, t, sablon) {
  const st = SABLON_STILUS[sablon] || SABLON_STILUS.tinta;
  const a = allapot(iv, t);
  const { seg, hurok } = a;
  const tt = hurok ? 0 : t;
  const r = [];
  // fejléc: márka + MI-jelölés (EU AI Act — minden felületen)
  const fejY = SAV_FELSO + 56;
  r.push(`<text x="${SZOVEG_X}" y="${fejY}" font-size="40" letter-spacing="1" font-family="${BETU_CSALAD}" font-weight="900" fill="${st.szoveg}" fill-opacity="0.92">AI WORLD HQ<tspan fill="${st.cimke}">.</tspan></text>`);
  r.push(`<rect x="${W - 170 - 96}" y="${fejY - 40}" width="96" height="54" rx="10" fill="${sablon === 'papir' ? SZIN.tinta : SZIN.papir}"/>`);
  r.push(`<text x="${W - 170 - 48}" y="${fejY - 1}" text-anchor="middle" font-size="36" font-family="${BETU_CSALAD}" font-weight="900" fill="${sablon === 'papir' ? SZIN.papir : SZIN.tinta}">AI</text>`);
  // haladásjelző: a teljes videó hosszán fut (a hurok-végen üres → az első kockával egyezik)
  const halad = hurok ? 0 : korlat(t / iv.hangVege);
  r.push(`<rect x="${SZOVEG_X}" y="${fejY + 34}" width="${SZOVEG_SZELES}" height="8" rx="4" fill="${st.szoveg}" fill-opacity="0.2"/>`);
  if (halad > 0) r.push(`<rect x="${SZOVEG_X}" y="${fejY + 34}" width="${(SZOVEG_SZELES * halad).toFixed(1)}" height="8" rx="4" fill="${st.cimke}"/>`);

  // a szöveg „beúszása” szegmensváltáskor (a horog NEM úszik: az első kockán a helyén van)
  const be = (seg.tipus === 'horog' || hurok) ? 1 : kiKifut(a.lt / 0.22);
  const eltol = (1 - be) * 70;
  const elr = sablon === 'borito' ? SZOVEG_ELRENDEZES.borito : SZOVEG_ELRENDEZES.ablakos;
  const blokk = szovegBlokk(seg, tt, st, {
    kozepY: elr.kozepY + eltol,
    tipusMeret: { maxMag: seg.tipus === 'lepes' ? elr.lepesMaxMag : elr.maxMag, ...(seg.tipus === 'horog' ? { maxMeret: 112, minMeret: 60 } : seg.tipus === 'vege' ? { maxMeret: 96, minMeret: 60 } : { maxMeret: 104, minMeret: 60 }) }
  });
  const kiBe = seg.tipus === 'horog' || hurok ? 1 : be;
  // címke a szöveg fölött
  let cimke = '';
  if (seg.tipus === 'horog') cimke = `${LEPES_DB} QUICK STEPS`;
  else if (seg.tipus === 'lepes') cimke = `STEP ${seg.szam} / ${seg.db}`;
  else cimke = 'THE FULL STEP-BY-STEP GUIDE';
  r.push(`<g opacity="${kiBe.toFixed(3)}">`);
  r.push(`<text x="${SZOVEG_X + SZOVEG_SZELES / 2}" y="${(blokk.teteje - 34).toFixed(1)}" text-anchor="middle" font-size="40" letter-spacing="4" font-family="${BETU_CSALAD}" font-weight="900" fill="${st.cimke}">${esc(cimke)}</text>`);
  r.push(blokk.svg);
  r.push('</g>');
  // lépés-pöttyök a szöveg alatt
  if (seg.tipus === 'lepes') {
    const pY = blokk.alja + 70, d = 22, tav = 44;
    const x0 = SZOVEG_X + SZOVEG_SZELES / 2 - ((seg.db - 1) * tav) / 2;
    for (let k = 1; k <= seg.db; k++) r.push(`<circle cx="${x0 + (k - 1) * tav}" cy="${pY.toFixed(1)}" r="${d / 2}" fill="${st.cimke}" fill-opacity="${k <= seg.szam ? 1 : 0.25}"/>`);
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">\n${r.join('\n')}\n</svg>`);
}

// ⚠️ A sharp a composite utáni raw-kimenetet `premultiplied: true` jelzéssel adja vissza; ha ezt továbbadjuk,
// a 3 csatornás képet „visszaosztja”, és a színek kiégnek (11-15-i próba: sárga, poszteres borító). Csak a méret megy tovább.
export const nyers = i => ({ width: i.width, height: i.height, channels: i.channels });

// ── HÁTTÉR ──────────────────────────────────────────────────────────
// A mozgás a háttérben is folyamatos (lassú nagyítás + úszás) — az első kockától.
export function kameraAllas(t, osszes, hurok) {
  const x = hurok ? 0 : korlat(t / osszes);
  return { zoom: 1 + 0.1 * x, dx: 0.5 + 0.18 * (x - 0.5), dy: 0.5 - 0.08 * (x - 0.5) };
}

async function hatterKeszito(sharp, sablon, kepUt) {
  const van = kepUt && existsSync(kepUt);
  if (sablon === 'borito' && van) {
    // teljes képernyős borító, alul-középen sötétítés a felirat alá
    const nagy = await sharp(kepUt).resize(Math.round(W * 1.12), Math.round(H * 1.12), { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });
    const sotet = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="0.3" stop-color="#000" stop-opacity="0.25"/><stop offset="0.5" stop-color="#000" stop-opacity="0.6"/><stop offset="1" stop-color="#000" stop-opacity="0.85"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`)).png().toBuffer();
    return async (t, osszes, hurok) => {
      const k = kameraAllas(t, osszes, hurok);
      const ww = Math.round(nagy.info.width / k.zoom), hh = Math.round(nagy.info.height / k.zoom);
      const left = Math.round((nagy.info.width - ww) * k.dx), top = Math.round((nagy.info.height - hh) * k.dy);
      const ki = await sharp(nagy.data, { raw: nyers(nagy.info) }).extract({ left, top, width: ww, height: hh }).resize(W, H).composite([{ input: sotet }]).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      return ki;
    };
  }
  // tinta / papir: egyszínű alap + a borító egy mozgó „ablakban” a szöveg fölött
  const alapSzin = sablon === 'papir' ? SZIN.papir : SZIN.tinta;
  const ablak = sablon === 'papir'
    ? { x: 0, y: ABLAK_TETO, w: W, h: ABLAK_MAG, rx: 0 }
    : { x: SZOVEG_X, y: ABLAK_TETO, w: SZOVEG_SZELES, h: ABLAK_MAG, rx: 36 };
  const alap = await sharp({ create: { width: W, height: H, channels: 3, background: alapSzin } }).png().toBuffer();
  if (!van) { const k = await sharp(alap).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return async () => k; }
  const kep = await sharp(kepUt).resize(Math.round(ablak.w * 1.2), Math.round(ablak.h * 1.2), { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });
  const maszk = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${ablak.w}" height="${ablak.h}"><rect width="${ablak.w}" height="${ablak.h}" rx="${ablak.rx}" fill="#fff"/></svg>`);
  return async (t, osszes, hurok) => {
    const k = kameraAllas(t, osszes, hurok);
    const z = 1 + (k.zoom - 1) * 1.5;
    const ww = Math.round(kep.info.width / z), hh = Math.round(kep.info.height / z);
    const left = Math.round((kep.info.width - ww) * k.dx), top = Math.round((kep.info.height - hh) * k.dy);
    const ablakKep = await sharp(kep.data, { raw: nyers(kep.info) }).extract({ left, top, width: ww, height: hh }).resize(ablak.w, ablak.h)
      .composite([{ input: maszk, blend: 'dest-in' }]).png().toBuffer();
    return sharp(alap).composite([{ input: ablakKep, left: ablak.x, top: ablak.y }]).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  };
}

/** A hang vágási határai a szóidőzítésből: kevés levegő az első szó előtt és az utolsó után. */
export function vagasHatarok(szavak, teljes, { elotte = 0.04, utana = 0.12 } = {}) {
  if (!szavak?.length) return { tol: 0, ig: teljes };
  const utolso = szavak[szavak.length - 1];
  return { tol: Math.max(0, szavak[0].t - elotte), ig: Math.min(teljes, utolso.t + utolso.d + utana) };
}

// ── HANG ────────────────────────────────────────────────────────────
function hangHossz(ut) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', ut], { encoding: 'utf-8' }).trim());
}

/** Egy szegmens hangja + szóidőzítése a Microsoft-felolvasóval (újrapróbával, mint core/edge-tts.js). */
async function felolvas(et, kesz, voice, szoveg, dir, nev) {
  for (let proba = 0; ; proba++) {
    try {
      const tts = new kesz.MsEdgeTTS();
      await tts.setMetadata(voice, kesz.OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
      const alDir = join(dir, nev);
      mkdirSync(alDir, { recursive: true });
      const { audioFilePath, metadataFilePath } = await tts.toFile(alDir, szoveg);
      tts.close?.();
      const sz = [];
      if (metadataFilePath && existsSync(metadataFilePath)) {
        const j = JSON.parse(readFileSync(metadataFilePath, 'utf-8'));
        for (const m of (j.Metadata || [])) {
          if (m?.Type === 'WordBoundary' && m.Data?.text?.Text) sz.push({ t: m.Data.Offset / 1e7, d: m.Data.Duration / 1e7, w: m.Data.text.Text });
        }
      }
      return { mp3: audioFilePath, szavak: sz };
    } catch (e) {
      if (proba >= et.VARASOK_MS.length || !et.TULTERHELES_RX.test(String(e?.message || e))) throw e;
      console.log(`   ⏳ felolvasó túlterhelt — ${et.VARASOK_MS[proba] / 1000} mp múlva újra`);
      await new Promise(r => setTimeout(r, et.VARASOK_MS[proba]));
    }
  }
}

/**
 * A videó legyártása.
 * @param {{out:string, workDir:string, kepUt?:string, sablon?:string, voice?:string, nema?:boolean}} o
 *   nema = true → NINCS felolvasás (helyi dizájn-próba): becsült szóidőzítés + csend.
 */
export async function renderMotionReel(szegmensek, { out, workDir, kepUt = '', sablon = 'tinta', voice = 'en-US-AvaMultilingualNeural', nema = false, csakKockak = null }) {
  const sharp = (await import('sharp')).default;
  // a betű-őrszem (core/video-font.js) ugyanúgy mér, mint a régi Reelnél → memory/reel-guard.json → napi riport
  const betu = await betuRendben(sharp);
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  // 1) hang + szóidőzítés szegmensenként
  const hangok = [];
  const darabok = [];
  if (nema) {
    for (const s of szegmensek) hangok.push(becsultSzavak(s.mond));
  } else {
    const et = await import('./edge-tts.js');
    const kesz = await et.edgeTts();
    for (let i = 0; i < szegmensek.length; i++) {
      const { mp3, szavak: sz } = await felolvas(et, kesz, voice, szegmensek[i].mond, workDir, 'h' + i);
      // a felolvasó csendjét levágjuk az első szó előtt és az utolsó után (11-15: 18,5–19,3 mp lett a becsült 15–16 helyett)
      const { tol, ig } = vagasHatarok(sz, hangHossz(mp3));
      const vagott = join(workDir, `t${i}.wav`), pad = join(workDir, `p${i}.wav`);
      execFileSync('ffmpeg', ['-y', '-i', mp3, '-ss', tol.toFixed(3), '-to', ig.toFixed(3), '-af', 'aresample=48000', '-ac', '1', vagott], { stdio: 'pipe' });
      const hossz = hangHossz(vagott);
      hangok.push({ hossz, szavak: sz.map(w => ({ ...w, t: Math.max(0, w.t - tol) })) });
      execFileSync('ffmpeg', ['-y', '-i', vagott, '-af', `apad=pad_dur=${SZUNET_MP}`, pad], { stdio: 'pipe' });
      darabok.push(`p${i}.wav`);   // ⚠️ a concat-lista a SAJÁT mappájához képest old fel → csak a fájlnév
    }
  }
  const iv = idovonal(szegmensek, hangok);

  // 2) képkockák
  const hatter = await hatterKeszito(sharp, sablon, kepUt);
  if (Array.isArray(csakKockak)) {   // dizájn-próba: csak a kért időpontok PNG-ben, videó nélkül
    const kepek = [];
    for (const t of csakKockak) {
      const ut = out.replace(/.mp4$/, '') + `-${t}s.png`;
      const h = await hatter(t, iv.osszes, t >= iv.hangVege);
      await sharp(h.data, { raw: nyers(h.info) }).composite([{ input: kockaSvg(iv, t, sablon) }]).png().toFile(ut);
      kepek.push(ut);
    }
    return { kepek, idovonal: iv, seconds: iv.osszes };
  }
  const kockaDb = Math.ceil(iv.osszes * FPS);
  for (let f = 0; f < kockaDb; f++) {
    const t = f / FPS;
    const hurok = t >= iv.hangVege;
    const h = await hatter(t, iv.osszes, hurok);
    await sharp(h.data, { raw: nyers(h.info) }).composite([{ input: kockaSvg(iv, t, sablon) }])
      .jpeg({ quality: 88 }).toFile(join(workDir, `f${String(f).padStart(5, '0')}.jpg`));
  }

  // 3) hang összefűzése (+ csend a hurok-végre)
  const hang = join(workDir, 'hang.wav');
  if (nema) {
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', iv.osszes.toFixed(3), hang], { stdio: 'pipe' });
  } else {
    writeFileSync(join(workDir, 'hangok.txt'), darabok.map(d => `file '${d}'`).join('\n'), 'utf-8');
    execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', join(workDir, 'hangok.txt'),
      '-af', `apad=pad_dur=${HUROK_MP + 0.2}`, '-t', iv.osszes.toFixed(3), hang], { stdio: 'pipe' });
  }

  // 4) összerakás
  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', join(workDir, 'f%05d.jpg'), '-i', hang,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-vf', `scale=${W}:${H}:out_range=tv,format=yuv420p`, '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', out], { stdio: 'pipe' });

  return { file: out, seconds: iv.osszes, kockak: kockaDb, idovonal: iv, betu, sablon };
}

/**
 * Egy útmutató sablonja: a megjelenés napjából és az aznapi útmutatók közti sorszámából. Ugyanarra a cikkre
 * MINDIG ugyanazt adja — a videót naponta többször újragyártjuk (a videók gitignore-oltak), és a mérésnek is
 * rögzített sablon kell. A nap útmutatói más-más sablont kapnak, napról napra eltolva.
 */
export function sablonCikkhez(cikk, cikkek = []) {
  const nap = String(cikk?.published_at || '').slice(0, 10) || '1970-01-01';
  const aznapiak = cikkek.filter(c => c && c.type === 'guide' && String(c.published_at || '').slice(0, 10) === nap)
    .sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)) || String(a.slug).localeCompare(String(b.slug)));
  const i = aznapiak.findIndex(c => c.slug === cikk?.slug);
  return sablonValaszt(nap, i < 0 ? aznapiak.length : i);
}

/** Hány lépést mutat a videó (a Reel-leírás ne ígérjen mást) — null, ha ebből az útmutatóból nem lesz motion Reel. */
export function motionLepesDb(md) {
  return MOTION_REEL_BE && trukkSzkript(md).szegmensek ? LEPES_DB : null;
}

/** Sablon-forgatás: napról napra és Reelenként más (determinisztikus, a dátumból és a sorszámból). */
export function sablonValaszt(datum, sorszam = 0) {
  const nap = Math.floor(new Date(datum).getTime() / 86400000);
  return SABLONOK[((nap * 2 + sorszam) % SABLONOK.length + SABLONOK.length) % SABLONOK.length];
}

// ── CLI (előnézet) ──────────────────────────────────────────────────
//   node core/motion-reel.js <slug>[:sablon] ... --ki <mappa> [--nema] [--dry]
async function main() {
  const { fileURLToPath } = await import('node:url');
  const { dirname } = await import('node:path');
  const { findArticleBySlug } = await import('./frontmatter.js');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const nema = args.includes('--nema'), dry = args.includes('--dry');
  const kiI = args.indexOf('--ki');
  const kkI = args.indexOf('--kockak');
  const csakKockak = kkI >= 0 ? args[kkI + 1].split(',').map(Number) : null;
  const kiDir = kiI >= 0 ? args[kiI + 1] : join(ROOT, '.motion-minta');
  const celok = args.filter((a, i) => !a.startsWith('--') && !(kiI >= 0 && i === kiI + 1) && !(kkI >= 0 && i === kkI + 1));
  if (!celok.length) { console.log('Használat: node core/motion-reel.js <slug>[:tinta|borito|papir] ... [--ki mappa] [--nema] [--dry]'); return; }
  mkdirSync(kiDir, { recursive: true });
  let hiba = 0;
  for (const [n, cel] of celok.entries()) {
    const [kulcs, sab] = cel.split(':');
    const sablon = SABLONOK.includes(sab) ? sab : SABLONOK[n % SABLONOK.length];
    const talalt = findArticleBySlug(join(ROOT, 'content', 'articles'), kulcs);
    if (!talalt) { console.log('❌ nincs ilyen cikk: ' + kulcs); hiba++; continue; }
    const slug = talalt.article._meta?.slug || kulcs;
    const { szegmensek, reason } = trukkSzkript(talalt.article.article_markdown || '');
    if (!szegmensek) { console.log('⏭️  ' + slug + ' — ' + reason); continue; }
    console.log(`🎬 ${slug} [${sablon}] — becsült ${becsultHossz(szegmensek).toFixed(1)} mp`);
    for (const s of szegmensek) console.log('   «' + s.mond + '»');
    if (dry) continue;
    try {
      const r = await renderMotionReel(szegmensek, {
        out: join(kiDir, `${sablon}-${slug.slice(0, 40)}.mp4`), workDir: join(kiDir, '.munka-' + n), sablon, nema, csakKockak,
        kepUt: join(ROOT, 'website', 'assets', 'images', slug + '.jpg')
      });
      rmSync(join(kiDir, '.munka-' + n), { recursive: true, force: true });
      console.log(r.kepek ? '🖼️  ' + r.kepek.length + ' kocka' : `✅ ${r.file} — ${r.seconds.toFixed(1)} mp, ${r.kockak} kocka`);
    } catch (e) { hiba++; console.log('💥 ' + slug + ': ' + e.message.slice(0, 300)); }
  }
  if (hiba) process.exit(1);
}

const kozvetlen = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('core/motion-reel.js');
if (kozvetlen) main().catch(e => { console.error('💥 motion-reel hiba:', e.message); process.exit(1); });

export default { trukkSzkript, idovonal, kockaSvg, renderMotionReel, sablonValaszt, sablonCikkhez, motionLepesDb, becsultHossz, MOTION_REEL_BE };
