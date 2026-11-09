// ===================================================================
// 📕 PDF-CSOMAGOK FRISSESSÉGE (2026-11-08)
// ===================================================================
// ELŐZMÉNY (user 11-08: „a régi könyveket megnézted? … amiket törlünk, az már
// nincs fenn!!!”): a 18 ingyenes PDF (website/assets/free/) 10-19-én készült
// EGYSZER, a fejlesztő gépén (a CI-ban nincs Chrome). Azóta 39 benne lévő
// útmutató lekerült az oldalról (0 olvasós törlés, összevonás, megszűnt
// eszköz), 26 pedig hivatalos forrásból JAVULT — a PDF-ben viszont a régi,
// hibás szöveg maradt. Semmi nem jelezte: ugyanaz az alak, mint a
// „feltételes ágban ülő lépés”-nél — ami nem a CI-ban készül, arról a CI-nak
// külön kell tudnia.
//
// MEGOLDÁS: a gyártás (core/ebook-build.js --mind) a PDF-ek mellé leírja,
// MELY útmutatók vannak benne és MIKOR készült (website/assets/free/tartalom.json).
// A napi riport ebből számolja, hány útmutató tűnt el / javult azóta, és szól,
// ha újra kell gyártani. Tiszta függvények, lemez nélkül tesztelhetők.
// ===================================================================

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { utmutatoE } from './guide-kind.js';   // „útmutató-e?” — közös szabály, nincs saját másolat

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TARTALOM_UT = join(ROOT, 'website', 'assets', 'free', 'tartalom.json');
export const UJRAGYARTAS = 'node core/ebook-build.js --mind --pdf';
// Ennyi javult útmutatótól már ⚠️ (törölt útmutatónál MÁR 1-től — az a PDF-ben
// olyan oldalra mutat, ami nincs fenn).
export const JAVULT_KUSZOB = 5;

const nap = x => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x)) ? x.slice(0, 10) : '';

/** A PDF szempontjából számító utolsó TARTALMI módosítás napja (a „Ha elakadsz” doboz nincs a PDF-ben). */
export function pdfModositasNap(meta) {
  const m = meta || {};
  return [m.howto_upgraded_at, m.fresh_updated_at, m.fact_check_flag ? null : m.fact_checked_at]
    .map(nap).filter(Boolean).sort().pop() || '';
}

/**
 * @param {{gyartva:string, utmutatok:string[]}} tartalom  a gyártáskori lista
 * @param {Map<string,object>} elo  a mostani útmutatók: slug → _meta
 * @returns {{torolt:string[], javult:string[], gyartva:string}}
 */
export function pdfFrissesseg(tartalom, elo) {
  const gy = nap(tartalom?.gyartva);
  const torolt = [], javult = [];
  for (const s of tartalom?.utmutatok || []) {
    const m = elo.get(s);
    if (!m) { torolt.push(s); continue; }
    const mod = pdfModositasNap(m);
    if (gy && mod && mod > gy) javult.push(s);
  }
  return { torolt, javult, gyartva: gy };
}

/** A napi riport sora. Hiányzó listánál is szól (különben a hiány némán „rendben” lenne). */
// 🗓️ HETI ÁTNÉZÉS (user 11-09: „egész nap csak újragyártod a pdf-eket!” → „szólsz hetente, hogy át
// kell nézni, és te majd megcsinálod!”): a riport CSAK VASÁRNAP (UTC) kéri az átnézést; a hét többi
// napján a változást csak tájékoztatásul írja ki, parancs nélkül — így nem gyártjuk újra minden javítás után.
export const ATNEZES_NAP = 0; // vasárnap (Date#getUTCDay)

export function pdfFrissessegSor(tartalom, elo, ma = new Date()) {
  if (!tartalom || !Array.isArray(tartalom.utmutatok))
    return `📕 PDF-csomagok: ⚠️ nincs tartalomlista (website/assets/free/tartalom.json) — gyártsd újra: ${UJRAGYARTAS}`;
  const { torolt, javult, gyartva } = pdfFrissesseg(tartalom, elo);
  const fej = `📕 PDF-csomagok (gyártva ${gyartva.slice(5)}, ${tartalom.utmutatok.length} útmutató)`;
  if (!torolt.length && !javult.length) return `${fej}: ✅ naprakészek`;
  const reszek = [];
  if (torolt.length) reszek.push(`${torolt.length} már NINCS FENN az oldalon`);
  if (javult.length) reszek.push(`${javult.length} javult azóta`);
  if (ma.getUTCDay() !== ATNEZES_NAP) return `${fej}: ℹ️ ${reszek.join(', ')} — vasárnap szólok, addig nem kell vele foglalkozni`;
  return `${fej}: ⚠️ HETI ÁTNÉZÉS ESEDÉKES — ${reszek.join(', ')} → szólj Claude-nak: „nézd át a PDF-eket” (${UJRAGYARTAS})`;
}

/** A mostani útmutatók slug → _meta térképe (a content/articles-ből). */
export function eloUtmutatok(dir = join(ROOT, 'content', 'articles')) {
  const ki = new Map();
  if (!existsSync(dir)) return ki;
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(dir, f), 'utf-8').replace(/^﻿/, ''));
      if (utmutatoE(f, d) && d?._meta?.slug && d._meta.status !== 'rejected') ki.set(d._meta.slug, d._meta);
    } catch { /* sérült fájl — más őr jelzi */ }
  }
  return ki;
}

export function tartalomBeolvas(ut = TARTALOM_UT) {
  try { return JSON.parse(readFileSync(ut, 'utf-8')); } catch { return null; }
}

/** A gyártó hívja: a PDF-ek mellé leírja, mi van bennük. */
export function tartalomIr(utmutatok, gyartva = new Date().toISOString(), ut = TARTALOM_UT) {
  const lista = [...new Set(utmutatok)].sort();
  writeFileSync(ut, JSON.stringify({ gyartva, utmutatok: lista }, null, 2) + '\n', 'utf-8');
  return lista.length;
}
