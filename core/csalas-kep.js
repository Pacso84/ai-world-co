// Csalás-képrajzoló (2026-11-23; terv: docs/superpowers/plans/2026-11-21-csalas-figyelo.md 4. rész,
// spec: docs/superpowers/specs/2026-11-21-csalas-figyelo-design.md — „kép = sablonból rajzolt megjelölt csaló üzenet”).
//
// A cikk „## Warning signs” alatti KITALÁLT példaüzenetéből (core/csalas-sablon.js peldaBlokk) MI NÉLKÜL, sablonból
// rajzol egy megjelölt képet: telefon / e-mail-ablak / csevegés / bejövő hívás, a jelölt részek piros szaggatott
// keretben ①②③ számmal, alatta a jelmagyarázat, ferdén a vízjel, alul a „kitalált példa” lábjegyzet — MINDEN felirat
// a cikk nyelvén (nem angol oldalon nincs angol mondat). Stílus: memoria/mintak/csalas-minta.mjs (user-jóváhagyás 11-19).
//
// KÉP-ŐR: rajzolás előtt peldaBiztonsag() — valódi márka, nem example.com domain vagy nem 555-01xx szám → DOB, kép
// nem készül. Ismeretlen nyelv vagy formátum → DOB (nem rajzol csendben angol feliratot).
//
// BETŰ: ugyanaz a család, mint a core/motion-reel.js-ben (BETU_CSALAD). A címek 900-as vastagsága a CI-ben telepített
// statikus fájlból jön; az üzenet-szöveg normál (500) vastagsága a VÁLTOZTATHATÓ vastagságú fájlból
// (shared/fonts/schibsted-grotesk-var.ttf), amit a CI CSAK erre a lépésre telepít (a Reel-gyártás előtt eltávolítja).
// A betu­Allapot() méri, hogy tényleg megjött-e — a lelet a memory/csalas-guard.json-ba megy (a napi riport olvassa).
//
// SZÉLESSÉG: a 900-as betű karaktertáblája (core/short-video.js horogSzeles) FELSŐ becslés a vékonyabb szövegre is:
// így a tördelés soha nem lóg ki, legfeljebb kicsit korábban tör. Ékezetes betű az alapbetű szélességével számít.

import { BETU_CSALAD } from './video-font.js';
import { horogSzeles } from './short-video.js';
import { peldaBiztonsag, PELDA_VIZJEL } from './csalas-sablon.js';

// A rajz változásakor EMELD — a CLI (core/csalas-kepek.js) minden képet újrarajzol.
export const RAJZ_V = 1;

export const KEP_SZ = {
  en: {
    cim: 'What this scam looks like', vizjel: PELDA_VIZJEL.en, lab: 'Made-up example to help you spot it · aiworldhq.com',
    felado: 'From', targy: 'Subject', bejovo: 'Incoming call', mondja: 'They say:',
  },
  hu: {
    cim: 'Így néz ki ez a csalás', vizjel: PELDA_VIZJEL.hu, lab: 'Kitalált példa a felismeréshez · aiworldhq.com',
    felado: 'Feladó', targy: 'Tárgy', bejovo: 'Bejövő hívás', mondja: 'Ezt mondja:',
  },
  es: {
    cim: 'Así se ve esta estafa', vizjel: PELDA_VIZJEL.es, lab: 'Ejemplo inventado para ayudarte a reconocerla · aiworldhq.com',
    felado: 'De', targy: 'Asunto', bejovo: 'Llamada entrante', mondja: 'Te dice:',
  },
};

export const FORMATUMOK = { '4x5': { w: 1080, h: 1350 }, '16x9': { w: 1280, h: 720 } };

const SABLON = { sms: 'sms', email: 'email', chat: 'chat', call: 'call', social: 'chat', web: 'email' };
export function rajzSablon(csatorna) {
  return SABLON[csatorna] ?? null;
}

// ── színek, alapelemek ──────────────────────────────────────────────────────
const PAPIR = '#f4efe6', TINTA = '#1f2937', PIROS = '#e11d48', SZURKE = '#6b7280', LINK = '#2563eb';
const KERET_SZIN = '#111827', BUBOREK = '#e5e7eb';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = n => Number(n.toFixed(1));
const JEL_RE = /\[\[([1-9])\|(.+?)\]\]/g;
const jelNelkul = s => String(s ?? '').replace(JEL_RE, '$2');

const alapBetu = s => String(s).normalize('NFD').replace(/\p{M}/gu, '');
// Vastagság-szorzó a 900-as táblához (kimérve 11-23, 32 px: Schibsted 500 ≤ 0,931, 700 ≤ 0,963; Arial 500 ≤ 0,89,
// 700 ≤ 0,956) — mindegyik a mért legnagyobb arány fölött, tehát a becslés felső korlát marad.
const SULY_SZORZO = { 500: 0.94, 700: 0.97, 800: 0.98, 900: 1 };
export const szeles = (s, meret, suly = 900) => horogSzeles(alapBetu(s), meret) * (SULY_SZORZO[suly] ?? 1);
const LINK_RE = /\.example\.com/i;

function szoveg(x, y, s, { meret, suly = 500, szin = TINTA, anchor = '' } = {}) {
  return `<text x="${f1(x)}" y="${f1(y)}" font-size="${meret}" font-family="${BETU_CSALAD}" font-weight="${suly}" fill="${szin}"${anchor ? ` text-anchor="${anchor}"` : ''}>${esc(s)}</text>`;
}
const keret = (x, y, w, h) => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="12" fill="none" stroke="${PIROS}" stroke-width="5" stroke-dasharray="14 8"/>`;
function kor(x, y, n, r = 30) {
  return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${PIROS}"/>`
    + szoveg(x, y + r * 0.36, String(n), { meret: Math.round(r * 1.1), suly: 900, szin: '#ffffff', anchor: 'middle' });
}

// ── tördelés ────────────────────────────────────────────────────────────────
// Egy túl hosszú szó (URL) a . / - után tör; ha egy darab még így is hosszú, karakterenként.
function szoTores(szo, meret, max, suly) {
  if (szeles(szo, meret, suly) <= max) return [szo];
  const darabok = szo.match(/[^./-]+[./-]*|[./-]+/g) || [szo];
  const ki = [];
  let most = '';
  for (const d of darabok) {
    if (!most || szeles(most + d, meret, suly) <= max) { most += d; continue; }
    ki.push(most);
    most = d;
  }
  if (most) ki.push(most);
  return ki.flatMap(x => {
    if (szeles(x, meret, suly) <= max) return [x];
    const r = [];
    let m = '';
    for (const ch of x) { if (m && szeles(m + ch, meret, suly) > max) { r.push(m); m = ch; } else m += ch; }
    if (m) r.push(m);
    return r;
  });
}

export function tordel(s, meret, max, suly = 500) {
  const szavak = String(s ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).flatMap(w => szoTores(w, meret, max, suly));
  const sorok = [];
  let most = '';
  for (const w of szavak) {
    if (most && szeles(most + ' ' + w, meret, suly) <= max) most += ' ' + w;
    else { if (most) sorok.push(most); most = w; }
  }
  if (most) sorok.push(most);
  return sorok;
}

// Az üzenet sorai képsorokra: a jelölt rész ([[n|…]]) MINDIG új sorban kezdődik és saját sorban végződik — így a
// keret bal széle pontosan a szöveg elejére esik (a szélesség-becslés csak a jobb szélen ad egy kis ráhagyást).
export function kepTordel(uzenetSorok, meret, max) {
  const ki = [];
  (uzenetSorok || []).forEach((sor, sorIdx) => {
    const s = String(sor ?? '');
    let utolso = 0;
    const darabok = [];
    for (const m of s.matchAll(JEL_RE)) {
      darabok.push({ szoveg: s.slice(utolso, m.index), jel: null });
      darabok.push({ szoveg: m[2], jel: m[1] });
      utolso = m.index + m[0].length;
    }
    darabok.push({ szoveg: s.slice(utolso), jel: null });
    for (const d of darabok) {
      // a link-szín és a vastagság a TELJES darabra szól (egy kettétört webcím második fele is kék marad)
      const link = LINK_RE.test(d.szoveg);
      const suly = d.jel && !link ? 700 : 500;
      const csoport = ++csoportSzamlalo;
      const sorok = tordel(d.szoveg, meret, max, suly);
      sorok.forEach((x, i) => ki.push({ szoveg: x, jel: d.jel, elso: i === 0, sor: sorIdx, link, suly, csoport }));
    }
  });
  return ki;
}
let csoportSzamlalo = 0;

// Egy jelölt darab (akár több sor) EGY közös keretet kap; a ①②③ kör a keret első sorához igazodik.
function csoportKeret(sorokPoz, meret, max) {
  const w = Math.min(Math.max(...sorokPoz.map(p => p.w)) + 22, max + 22);
  const elso = sorokPoz[0], utolso = sorokPoz[sorokPoz.length - 1];
  const kx = elso.anchorKozep ? elso.x - w / 2 : elso.x - 11;
  const ky = elso.alap - meret * 0.98;
  const kh = utolso.alap - elso.alap + meret * 1.36;
  return { svg: keret(kx, ky, w, kh), jel: { x2: kx + w, y: ky + meret * 0.68 } };
}

// Képsorok kirajzolása egy szövegdobozba. Visszaadja a magasságot és a jelek helyét (a ①②③ körökhöz).
function sorokRajz(sorok, x, y0, meret, max, { szin = TINTA } = {}) {
  const lh = meret * 1.42, bekezdesKoz = meret * 0.38;
  const r = [];
  const csoportok = new Map();
  let y = y0;
  let elozoSor = null;
  for (const s of sorok) {
    if (elozoSor !== null && s.sor !== elozoSor) y += bekezdesKoz;
    elozoSor = s.sor;
    const alap = y + meret;
    r.push(szoveg(x, alap, s.szoveg, { meret, suly: s.suly, szin: s.link ? LINK : szin }));
    if (s.jel) {
      if (!csoportok.has(s.csoport)) csoportok.set(s.csoport, { n: s.jel, poz: [] });
      csoportok.get(s.csoport).poz.push({ x, alap, w: szeles(s.szoveg, meret, s.suly) });
    }
    y += lh;
  }
  const jelek = [];
  for (const c of csoportok.values()) {
    const k = csoportKeret(c.poz, meret, max);
    r.push(k.svg);
    jelek.push({ n: c.n, ...k.jel });
  }
  return { svg: r.join(''), h: y - y0, jelek };
}

// Egysoros (vagy tördelt) fejléc-érték keretezése: a feladó / tárgy.
function fejlecErtek(nyers, x, alap, meret, max, { suly = 500, szin = TINTA, anchor = '' } = {}) {
  const jel = (String(nyers ?? '').match(/\[\[([1-9])\|/) || [])[1] || null;
  const sorok = tordel(jelNelkul(nyers), meret, max, suly);
  const r = [];
  const poz = [];
  sorok.forEach((s, i) => {
    const y = alap + i * meret * 1.3;
    r.push(szoveg(x, y, s, { meret, suly, szin, anchor }));
    poz.push({ x, alap: y, w: szeles(s, meret, suly), anchorKozep: anchor === 'middle' });
  });
  const jelek = [];
  if (jel && poz.length) {
    // középre igazított, több soros értéknél a keret a legszélesebb sorhoz igazodik (közép marad)
    const k = csoportKeret(poz, meret, max);
    r.push(k.svg);
    jelek.push({ n: jel, ...k.jel });
  }
  return { svg: r.join(''), h: sorok.length * meret * 1.3, jelek };
}

// Fér-e minden szó egészben egy sorba ezzel a betűmérettel? (a méret-választás ezt előnyben részesíti: így egy
// webcím vagy hosszú szó nem törik ketté, ha kisebb betűvel egészben kiférne)
function szavakFernek(p, meret, max) {
  const szavak = [...(p.sorok || []), p.felado || '', p.targy || ''].map(jelNelkul).join(' ').split(/\s+/).filter(Boolean);
  return szavak.every(w => szeles(w, meret, 700) <= max);
}

// A ①②③ körök egy oszlopban (korX), átfedés nélkül; ha egy kört lejjebb kellett tolni, vékony vonal köti a kerethez.
function korokRajz(jelek, korX, r = 30) {
  const ki = [];
  let elozo = -Infinity;
  for (const j of [...jelek].sort((a, b) => a.y - b.y)) {
    const y = Math.max(j.y, elozo + r * 2 + 8);
    elozo = y;
    if (j.x2 < korX - r - 4 || Math.abs(y - j.y) > 1) {
      ki.push(`<path d="M${f1(j.x2)} ${f1(j.y)} L${f1(korX - r)} ${f1(y)}" stroke="${PIROS}" stroke-width="4" fill="none"/>`);
    }
    ki.push(kor(korX, y, j.n, r));
  }
  return ki.join('');
}

// ── eszköz-sablonok (saját, 900 px széles koordináta-dobozban) ────────────────
const DOBOZ_W = 900;
const TEL = { x: 100, w: 700, kepX: 125, kepW: 650, teto: 60 };

function telefonKeret(h, kepernyo = '#ffffff') {
  return `<rect x="${TEL.x}" y="0" width="${TEL.w}" height="${f1(h)}" rx="56" fill="${KERET_SZIN}"/>`
    + `<rect x="${TEL.kepX}" y="${TEL.teto}" width="${TEL.kepW}" height="${f1(h - TEL.teto - 30)}" rx="30" fill="${kepernyo}"/>`
    + `<rect x="${450 - 60}" y="24" width="120" height="12" rx="6" fill="#374151"/>`;
}

function smsRajz(p, meret) {
  const fej = fejlecErtek(p.felado, 450, TEL.teto + 52, 28, 560, { szin: SZURKE, anchor: 'middle' });
  const bx = 155, bw = 560, pad = 28, by = TEL.teto + 52 + fej.h + 10;
  const sorok = kepTordel(p.sorok, meret, bw - pad * 2);
  const test = sorokRajz(sorok, bx + pad, by + 22, meret, bw - pad * 2);
  const bh = test.h + 44;
  const h = by + bh + 110;
  const svg = telefonKeret(h)
    + `<rect x="${bx}" y="${f1(by)}" width="${bw}" height="${f1(bh)}" rx="28" fill="${BUBOREK}"/>`
    + fej.svg + test.svg + korokRajz([...fej.jelek, ...test.jelek], 800);
  return { svg, h };
}

function chatRajz(p, meret) {
  const nev = jelNelkul(p.felado || '');
  const kezdo = [...nev.replace(/[^\p{L}\p{N}]/gu, '')][0]?.toUpperCase() || '?';
  const fejH = 96;
  const fej = fejlecErtek(p.felado, 225, TEL.teto + 58, 30, 520, { suly: 700 });
  const fejMag = Math.max(fejH, fej.h + 40);
  let y = TEL.teto + fejMag + 26;
  const r = [];
  const jelek = [...fej.jelek];
  const pad = 22, maxBelso = 560 - pad * 2;
  p.sorok.forEach((sor) => {
    const sorok = kepTordel([sor], meret, maxBelso);
    const legszelesebb = Math.max(...sorok.map(s => szeles(s.szoveg, meret, s.suly) + (s.jel ? 22 : 0)));
    const bw = Math.min(560, legszelesebb + pad * 2 + 6);
    const t = sorokRajz(sorok, 155 + pad, y + 16, meret, maxBelso);
    const bh = t.h + 30;
    r.push(`<rect x="155" y="${f1(y)}" width="${f1(bw)}" height="${f1(bh)}" rx="26" fill="${BUBOREK}"/>`, t.svg);
    jelek.push(...t.jelek);
    y += bh + 16;
  });
  const h = y + 90;
  const svg = telefonKeret(h)
    + `<rect x="${TEL.kepX}" y="${TEL.teto}" width="${TEL.kepW}" height="${fejMag}" fill="#f3f4f6"/>`
    + `<line x1="${TEL.kepX}" y1="${TEL.teto + fejMag}" x2="${TEL.kepX + TEL.kepW}" y2="${TEL.teto + fejMag}" stroke="#d1d5db" stroke-width="2"/>`
    + `<circle cx="180" cy="${TEL.teto + fejMag / 2}" r="28" fill="#94a3b8"/>`
    + szoveg(180, TEL.teto + fejMag / 2 + 10, kezdo, { meret: 28, suly: 900, szin: '#ffffff', anchor: 'middle' })
    + fej.svg + r.join('') + korokRajz(jelek, 800);
  return { svg, h };
}

function emailRajz(p, meret, sz) {
  const W = 860, bal = 40, tetoH = 56;
  const r = [];
  const jelek = [];
  let y = tetoH + 30;
  const sorFej = (cimke, ertek, suly) => {
    if (!ertek) return;
    const cimkeSz = cimke + ':';
    const cw = szeles(cimkeSz, 26, 500) + 14;
    r.push(szoveg(bal, y + 28, cimkeSz, { meret: 26, szin: SZURKE }));
    const e = fejlecErtek(ertek, bal + cw, y + 28, 28, W - bal * 2 - cw, { suly });
    r.push(e.svg);
    jelek.push(...e.jelek);
    y += Math.max(44, e.h + 12);
  };
  sorFej(sz.felado, p.felado, 500);
  sorFej(sz.targy, p.targy, 700);
  y += 10;
  r.push(`<line x1="${bal}" y1="${f1(y)}" x2="${W - bal}" y2="${f1(y)}" stroke="#d1d5db" stroke-width="2"/>`);
  y += 24;
  const t = sorokRajz(kepTordel(p.sorok, meret, W - bal * 2 - 30), bal, y, meret, W - bal * 2 - 30);
  r.push(t.svg);
  jelek.push(...t.jelek);
  const h = y + t.h + 44;
  const svg = `<rect x="0" y="0" width="${W}" height="${f1(h)}" rx="24" fill="#ffffff" stroke="#d1d5db" stroke-width="2"/>`
    + `<path d="M0 24 a24 24 0 0 1 24 -24 h${W - 48} a24 24 0 0 1 24 24 v${tetoH - 24} h-${W} z" fill="${BUBOREK}"/>`
    + [0, 1, 2].map(i => `<circle cx="${34 + i * 30}" cy="${tetoH / 2}" r="9" fill="${['#f87171', '#fbbf24', '#34d399'][i]}"/>`).join('')
    + r.join('') + korokRajz(jelek, W);
  return { svg, h };
}

function hivasRajz(p, meret, sz) {
  const r = [];
  const T = TEL.teto;
  r.push(szoveg(450, T + 48, sz.bejovo, { meret: 26, szin: '#94a3b8', anchor: 'middle' }));
  r.push(`<circle cx="450" cy="${T + 112}" r="42" fill="#334155"/>`,
    `<circle cx="450" cy="${T + 99}" r="16" fill="#94a3b8"/>`,
    `<path d="M423 ${T + 143} a27 24 0 0 1 54 0 z" fill="#94a3b8"/>`);
  const fej = fejlecErtek(p.felado, 450, T + 200, 34, 540, { suly: 700, szin: '#ffffff', anchor: 'middle' });
  r.push(fej.svg);
  const bx = 155, bw = 560, pad = 28, by = T + 200 + fej.h + 18;
  const sorok = kepTordel(p.sorok, meret, bw - pad * 2);
  const t = sorokRajz(sorok, bx + pad, by + 52, meret, bw - pad * 2);
  const bh = t.h + 70;
  const gombY = by + bh + 66;
  const h = gombY + 40 + 56;
  // kagyló-ikon (Material Icons „call” / „call_end”, Apache-2.0), 24-es rácsból 2× nagyítva
  const kagylo = (cx, cy, d) => `<path d="${d}" fill="#ffffff" transform="translate(${cx - 24} ${f1(cy - 24)}) scale(2)"/>`;
  const FELVESZ = 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z';
  const LETESZ = 'M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z';
  const svg = telefonKeret(h, '#0f172a')
    + r.join('')
    + `<rect x="${bx}" y="${f1(by)}" width="${bw}" height="${f1(bh)}" rx="26" fill="#ffffff"/>`
    + `<path d="M${bx + 60} ${f1(by)} l18 -22 l18 22 z" fill="#ffffff"/>`
    + szoveg(bx + pad, by + 36, sz.mondja, { meret: 24, szin: SZURKE })
    + t.svg
    + `<circle cx="300" cy="${f1(gombY)}" r="40" fill="#dc2626"/>` + kagylo(300, gombY, LETESZ)
    + `<circle cx="600" cy="${f1(gombY)}" r="40" fill="#16a34a"/>` + kagylo(600, gombY, FELVESZ)
    + korokRajz([...fej.jelek, ...t.jelek], 800);
  return { svg, h };
}

function eszkoz(pelda, meret, sz) {
  switch (rajzSablon(pelda.csatorna)) {
    case 'sms': return smsRajz(pelda, meret);
    case 'chat': return chatRajz(pelda, meret);
    case 'email': return emailRajz(pelda, meret, sz);
    case 'call': return hivasRajz(pelda, meret, sz);
    default: throw new Error(`ismeretlen csatorna: ${pelda.csatorna}`);
  }
}

// ── jelmagyarázat ───────────────────────────────────────────────────────────
// Sorai: a félkövér címke + „ — ” + a magyarázat, tördelve; a címke szavai félkövérek maradnak a tördelés után is.
function jelmagyarazat(p, x0, y0, max, meret) {
  const lh = meret * 1.36, koz = meret * 0.85;
  const r = [];
  let y = y0;
  p.magyarazat.forEach((m, i) => {
    const cimkeSzavak = m.cimke ? m.cimke.split(/\s+/).filter(Boolean).length : 0;
    const teljes = m.cimke ? `${m.cimke} — ${m.szoveg}` : m.szoveg;
    const sorok = tordel(teljes, meret, max - 60, 800);
    r.push(kor(x0 + 28, y + meret * 0.62, i + 1, 30));
    let szoIdx = 0;
    sorok.forEach((s, k) => {
      // az azonos vastagságú szomszédos szavak egy tspan-be (a kép szövege kereshető és rövidebb marad)
      const csoport = [];
      for (const w of s.split(' ')) {
        const suly = szoIdx++ < cimkeSzavak ? 800 : 500;
        const ut = csoport[csoport.length - 1];
        if (ut && ut.suly === suly) ut.szavak.push(w); else csoport.push({ suly, szavak: [w] });
      }
      const tsp = csoport.map(c => `<tspan font-weight="${c.suly}">${esc(c.szavak.join(' '))}</tspan>`).join(' ');
      r.push(`<text x="${f1(x0 + 82)}" y="${f1(y + meret * 0.95 + k * lh)}" font-size="${meret}" font-family="${BETU_CSALAD}" fill="${TINTA}">${tsp}</text>`);
    });
    y += Math.max(sorok.length * lh, 64) + koz;
  });
  return { svg: r.join(''), h: y - y0 - koz };
}

function vizjel(sz, cx, cy, szog, max, maxMeret, atl = 0.2) {
  const meret = Math.min(maxMeret, Math.floor(max / Math.max(1, szeles(sz.vizjel, 1))));
  return `<g transform="rotate(${szog} ${cx} ${cy})" opacity="${atl}">`
    + szoveg(cx, cy + meret * 0.35, sz.vizjel, { meret, suly: 900, szin: PIROS, anchor: 'middle' }) + '</g>';
}

// A cím legfeljebb 2 sorban; ha 2 sor kell, kiegyensúlyozva (ne maradjon egy szó egyedül a második sorban).
function cimSorok(cim, meret, max) {
  let m = meret;
  while (m > 30 && szeles(cim, m) > max * 2) m -= 2;
  if (szeles(cim, m) <= max) return { meret: m, sorok: [cim] };
  const szavak = cim.split(/\s+/);
  let legjobb = null;
  for (let i = 1; i < szavak.length; i++) {
    const a = szavak.slice(0, i).join(' '), b = szavak.slice(i).join(' ');
    const w = Math.max(szeles(a, m), szeles(b, m));
    if (w <= max && (!legjobb || w < legjobb.w)) legjobb = { w, sorok: [a, b] };
  }
  return { meret: m, sorok: legjobb ? legjobb.sorok : tordel(cim, m, max, 900).slice(0, 2) };
}

// A sablon szövegdobozának szélessége (a szavakFernek-hez).
const SZOVEG_MAX = { sms: 504, call: 504, chat: 516, email: 750 };

// A legnagyobb üzenet-betűméret, amivel (1) az eszköz kifér, és (2) egy szó sem törik ketté; ha a (2) sehol nem
// teljesül, a legnagyobb, amivel kifér; ha az sem, a legkisebb.
function eszkozMeretre(p, sz, { tol, ig, fer }) {
  const max = SZOVEG_MAX[rajzSablon(p.csatorna)];
  let tartalek = null, e = null;
  for (let m = tol; m >= ig; m -= 2) {
    e = eszkoz(p, m, sz);
    if (!fer(e)) continue;
    if (szavakFernek(p, m, max)) return e;
    tartalek = tartalek || e;
  }
  return tartalek || e;
}

// ── összerakás ──────────────────────────────────────────────────────────────
function kep4x5(p, sz) {
  const W = 1080, H = 1350, TETO = 136, ALJ = 1258, KOZ = 56;
  let jm = null;
  for (const m of [32, 30, 28]) { jm = jelmagyarazat(p, 80, 0, 920, m); if (jm.h <= 330) break; }
  const e = eszkozMeretre(p, sz, { tol: 36, ig: 22, fer: x => TETO + x.h + KOZ + jm.h <= ALJ });
  // rövid üzenetnél az eszköz legfeljebb 1,12×-esre nő (a 900-as doboz így is 36 px-re marad a vászon szélétől)
  const s = Math.min(1.12, (ALJ - TETO - KOZ - jm.h) / e.h);
  const tomb = e.h * s + KOZ + jm.h;
  const eltol = Math.max(0, (ALJ - TETO - tomb) / 2);
  const ey = TETO + eltol;
  const jy = ey + e.h * s + KOZ;
  const cim = cimSorok(sz.cim, 46, 960);
  const cimSvg = cim.sorok.map((c, i) => szoveg(W / 2, 84 + i * cim.meret * 1.1 - (cim.sorok.length - 1) * cim.meret * 0.5, c, { meret: cim.meret, suly: 900, anchor: 'middle' })).join('');
  const ex = 90 + (DOBOZ_W - DOBOZ_W * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" data-jelmagyarazat-alja="${f1(jy + jm.h)}">`
    + `<rect width="${W}" height="${H}" fill="${PAPIR}"/>`
    + cimSvg
    + `<g transform="translate(${f1(ex)} ${f1(ey)}) scale(${f1(s * 1000) / 1000})">${e.svg}</g>`
    + `<g transform="translate(0 ${f1(jy)})">${jm.svg}</g>`
    + vizjel(sz, W / 2, ey + e.h * s * 0.45, -24, 1250, 120)
    + szoveg(W / 2, 1306, sz.lab, { meret: 25, szin: SZURKE, anchor: 'middle' })
    + '</svg>';
}

function kep16x9(p, sz) {
  const W = 1280, H = 720;
  const e = eszkozMeretre(p, sz, { tol: 34, ig: 22, fer: x => x.h <= 1100 });
  const s = Math.min(600 / DOBOZ_W, 664 / e.h);
  const ex = 24 + (600 - DOBOZ_W * s) / 2, ey = (H - e.h * s) / 2;
  // jobb oszlop: cím + a három jel címkéje
  const X = 660, MAX = 580;
  const cim = cimSorok(sz.cim, 50, MAX);
  const cimkek = p.magyarazat.map(m => tordel(m.cimke || m.szoveg, 36, MAX - 70, 800)[0] || '');
  const oszlopH = cim.sorok.length * cim.meret * 1.12 + 40 + cimkek.length * 84;
  let y = (H - oszlopH) / 2 + cim.meret;
  const r = [];
  cim.sorok.forEach(c => { r.push(szoveg(X, y, c, { meret: cim.meret, suly: 900 })); y += cim.meret * 1.12; });
  y += 40 - cim.meret * 0.12;
  cimkek.forEach((c, i) => {
    r.push(kor(X + 28, y + 10, i + 1, 28), szoveg(X + 76, y + 22, c, { meret: 36, suly: 800 }));
    y += 84;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
    + `<rect width="${W}" height="${H}" fill="${PAPIR}"/>`
    + `<g transform="translate(${f1(ex)} ${f1(ey)}) scale(${f1(s * 1000) / 1000})">${e.svg}</g>`
    + r.join('')
    // a vízjel csak az eszközön fut át — a jobb oldali feliratok tiszták maradnak
    + vizjel(sz, ex + DOBOZ_W * s / 2, H / 2, -28, 640, 96, 0.2)
    + szoveg(X + MAX / 2, 694, sz.lab, { meret: 20, szin: SZURKE, anchor: 'middle' })
    + '</svg>';
}

export function csalasKepSvg(pelda, { lang = 'en', format = '4x5' } = {}) {
  const sz = KEP_SZ[lang];
  if (!sz) throw new Error(`ismeretlen nyelv: ${lang}`);
  if (!FORMATUMOK[format]) throw new Error(`ismeretlen formátum: ${format}`);
  if (!pelda) throw new Error('nincs példablokk');
  if (!rajzSablon(pelda.csatorna)) throw new Error(`ismeretlen csatorna: ${pelda.csatorna}`);
  if ((pelda.magyarazat || []).length !== 3) throw new Error('nem 3 magyarázat');
  return format === '4x5' ? kep4x5(pelda, sz) : kep16x9(pelda, sz);
}

// ── 13. rész (2026-11-28): CSAK az üzenet-kártya a Reelhez (core/csalas-reel.js) ──────────────────────────────
// A kamu üzenet a ①②③ jelekkel + a „PÉLDA — CSALÁS” vízjel, ÁTLÁTSZÓ háttéren (a Reel sötét alapján ül). A cím és a
// jelmagyarázat NEM kerül rá: azt a Reel szövege és hangja mondja el. A vízjel kötelező — a kártya mindig példa.
// A ①②③ körök a doboz jobb szélén ülnek (a 12 px-es margóval együtt DOBOZ_W + 30 a vászon).
export const KARTYA_SZEL = DOBOZ_W + 30;
export function csalasKartyaSvg(pelda, { lang = 'en', maxMag = 1100 } = {}) {
  const sz = KEP_SZ[lang];
  if (!sz) throw new Error(`ismeretlen nyelv: ${lang}`);
  if (!pelda) throw new Error('nincs példablokk');
  if (!rajzSablon(pelda.csatorna)) throw new Error(`ismeretlen csatorna: ${pelda.csatorna}`);
  if ((pelda.magyarazat || []).length !== 3) throw new Error('nem 3 magyarázat');
  const e = eszkozMeretre(pelda, sz, { tol: 40, ig: 24, fer: x => x.h <= maxMag });
  const W = KARTYA_SZEL, H = Math.ceil(e.h + 24);
  return {
    w: W, h: H,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
      + `<g transform="translate(12 12)">${e.svg}</g>`
      + vizjel(sz, 12 + DOBOZ_W / 2, 12 + e.h * 0.5, -20, 760, 96)
      + '</svg>',
  };
}

export async function rajzolCsalasKep(pelda, { lang = 'en', format = '4x5', sharpModul = null } = {}) {
  if (!pelda) throw new Error('nincs példablokk');
  const baj = peldaBiztonsag(pelda);
  if (baj.length) throw new Error(`nem biztonságos példa: ${baj.join('; ')}`);
  const svg = csalasKepSvg(pelda, { lang, format });
  const sharp = sharpModul || (await import('sharp')).default;
  return await sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}

// ── betű-mérés (lásd core/video-font.js: a betű NEVE kérés, nem garancia) ─────
// Megjött-e a normál vastagság? Három renderelés + önhitelesítés:
//   500 ≠ 900 (a változtatható betű tényleg más vastagságot ad), 500 ≠ nem létező család (nem esett vissza),
//   és a nem létező család két mérete különbözik (a mérő egyáltalán lát szöveget).
// SOHA NEM DOB: ok true / false / null (= nem mérhető, okkal).
const NINCS_ILYEN = 'Zzqqx Nincsilyenbetu';
async function proba(sharpModul, csalad, suly, meret) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="110"><rect width="320" height="110" fill="#ffffff"/>`
    + `<text x="8" y="72" font-size="${meret}" font-family="${esc(csalad)}" font-weight="${suly}" fill="#000000">Waggon 01</text></svg>`;
  return await sharpModul(Buffer.from(svg)).raw().toBuffer();
}

export async function betuAllapot(sharpModul) {
  const nemTudom = miert => ({ ok: null, reason: 'a betű nem mérhető meg: ' + miert });
  if (typeof sharpModul !== 'function') return nemTudom('nincs sharp modul');
  try {
    const normal = await proba(sharpModul, 'Schibsted Grotesk', 500, 40);
    const vastag = await proba(sharpModul, 'Schibsted Grotesk', 900, 40);
    const alap = await proba(sharpModul, NINCS_ILYEN, 500, 40);
    const kontroll = await proba(sharpModul, NINCS_ILYEN, 500, 28);
    if (alap.equals(kontroll)) return nemTudom('a mérő a betűméret változását sem látja (nem rajzol szöveget)');
    if (normal.equals(alap)) return { ok: false, reason: 'a „Schibsted Grotesk” nincs telepítve — az üzenet-szöveg tartalék betűvel készül' };
    if (normal.equals(vastag)) return { ok: false, reason: 'a normál (500) vastagság nem jött meg (shared/fonts/schibsted-grotesk-var.ttf) — az üzenet-szöveg is 900-as, vastag betűvel készül' };
    return { ok: true, reason: '' };
  } catch (e) {
    return nemTudom('a renderelés hibára futott: ' + String(e?.message || e).split('\n')[0]);
  }
}
