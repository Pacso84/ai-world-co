// ===================================================================
// A SÚGÓCIKKEK SZÖVEGE A PRIVÁT TÁRBAN — GIT-EN KÍVÜL (tényközpont 1b, 2026-11-14)
//
// MIÉRT: a súgóból író, bíráló, átdolgozó és tényellenőrző lépések eddig mind külön letöltötték a súgócikket
// (core/elakadas-gen.js cikkSzoveg), ezért nem biztos, hogy ugyanazt a szöveget látták — és egy későbbi futás
// sem tudta, mit látott az előző. Most az első letöltés után a szöveg a PRIVÁT FORRÁS-TÁRBA kerül
// (`_forrasok/sugo/`, .gitignore; a CI-ban a privát repó kicsekkolva, a futás végén visszatolva — ugyanúgy,
// mint a core/forras-cache.js-nél), a szöveg lenyomatával (hash) együtt. Így (1) minden lépés ugyanazt olvassa,
// (2) a 3. fázis a lenyomatból észreveszi, ha a kiadó átírta a súgócikket (`valtozott` dátum a .json-ban).
//
// 🔒 A kiadói szöveg CSAK ide, a privát tárba mehet — a repó NYILVÁNOS, ezért a content/ alá soha. Csak a
// jóváhagyott súgókat (core/sugo-index.js ENGEDELY) tároljuk; más címről a szöveg csak továbbmegy, tárolás nélkül.
//
// A tár hiánya vagy írási hibája SOHA nem állít meg semmit: `false` / `null`, kivétel nincs. Ha a friss tár
// és az élő letöltés is hiányzik, a régi tárolt szöveg is jobb a semminél (`regi-tar`).
//
// KAPCSOLÓ: SUGO_TAR_BE = false → a sugoSzoveg tiszta továbbítás (régi viselkedés), a tárhoz nem nyúl.
// ===================================================================

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { FORRAS_TAR_DIR } from './forras-cache.js';
import { engedelyezett } from './sugo-index.js';
import { cikkSzoveg } from './elakadas-gen.js';

/** Kill-switch: false → nincs tár, a súgószöveg mindig élőben jön (a config `enabled` mező NEM kapcsol ki semmit). */
export const SUGO_TAR_BE = true;
/** Ennyi napig számít frissnek a tárolt szöveg — addig nem töltjük le újra. */
export const SUGO_FRISS_NAP = 7;

const NAP_MS = 86400000;

// A tár gyökere ugyanúgy, mint a core/forras-cache.js-ben (FORRAS_TAR_DIR vagy <repó>/_forrasok), alatta `sugo/`.
// Teszt / más hely: SUGO_TAR_DIR.
const tarGyoker = () => process.env.FORRAS_TAR_DIR || FORRAS_TAR_DIR;
const mappa = dir => dir || process.env.SUGO_TAR_DIR || join(tarGyoker(), 'sugo');

const sha16 = s => createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

/** Normalizált URL: https, kisbetűs host, query és # nélkül, záró perjel nélkül. Nem https / hibás → null. */
function normalizalt(url) {
  try {
    const p = new URL(String(url || '').trim());
    if (p.protocol !== 'https:') return null;
    return { host: p.hostname.toLowerCase(), ut: p.pathname.replace(/\/+$/, '') };
  } catch { return null; }
}

/** A súgócikk tár-kulcsa: a normalizált URL sha256-jának első 16 hexa jegye. Nem https URL → null. */
export function sugoTarKulcs(url) {
  const n = normalizalt(url);
  return n ? sha16(n.host + n.ut) : null;
}

// A host a `new URL`-ból jön (csak betű, szám, pont, kötőjel), de a fájlnévbe kerülés előtt még egyszer szűrjük.
const JO_HOST = /^[a-z0-9.-]+$/;
function utak(url, dir) {
  const n = normalizalt(url);
  if (!n || !JO_HOST.test(n.host)) return null;
  const kulcs = sha16(n.host + n.ut);
  const d = join(mappa(dir), n.host);
  return { d, txt: join(d, `${kulcs}.txt`), json: join(d, `${kulcs}.json`) };
}

/**
 * A súgócikk a privát tárba. Csak jóváhagyott súgó URL-re ír. Ha a korábbi tárolt szöveg lenyomata eltér az újétól,
 * a `valtozott` mezőbe a mostani idő kerül (azonos újraletöltés a régi `valtozott`-at megtartja).
 * @returns {boolean} sikerült-e (hiba esetén false, kivétel soha)
 */
export function sugoTarIr(url, { cim, szoveg } = {}, { dir, most = Date.now() } = {}) {
  try {
    if (!engedelyezett(url) || !String(szoveg || '').trim()) return false;
    const u = utak(url, dir);
    if (!u) return false;
    const ido = new Date(most).toISOString();
    const hash = sha16(szoveg);
    let regi = null;
    try { regi = JSON.parse(readFileSync(u.json, 'utf-8')); } catch { /* nincs / sérült → nincs mihez hasonlítani */ }
    const meta = { url: String(url), cim: String(cim || ''), letoltve: ido, hash, hossz: String(szoveg).length };
    if (regi?.hash && regi.hash !== hash) meta.valtozott = ido;
    else if (regi?.valtozott) meta.valtozott = regi.valtozott;
    mkdirSync(u.d, { recursive: true });
    writeFileSync(u.txt, String(szoveg), 'utf-8');
    writeFileSync(u.json, JSON.stringify(meta, null, 2), 'utf-8');
    return true;
  } catch { return false; }
}

/**
 * A tárolt súgócikk. Nincs / sérült meta / hiányzó vagy a lenyomatnak nem megfelelő szöveg → null.
 * @returns {{szoveg: string, cim: string, letoltve: string, hash: string} | null}
 */
export function sugoTarOlvas(url, { dir } = {}) {
  try {
    const u = utak(url, dir);
    if (!u) return null;
    const meta = JSON.parse(readFileSync(u.json, 'utf-8'));
    const szoveg = readFileSync(u.txt, 'utf-8');
    if (!szoveg.trim() || !meta?.hash || sha16(szoveg) !== meta.hash) return null;
    return { szoveg, cim: String(meta.cim || ''), letoltve: String(meta.letoltve || ''), hash: meta.hash };
  } catch { return null; }
}

/**
 * A súgócikk szövege, sorrendben: friss tár (≤ frissNap) → élő letöltés (siker: tárba ír) → régi tár → null.
 * Nem jóváhagyott URL (vagy kikapcsolt tár): csak élő letöltés, tárolás nélkül.
 * @returns {Promise<{szoveg: string, cim: string, honnan: 'tar'|'elo'|'regi-tar'} | null>}
 */
export async function sugoSzoveg(url, { fetchFn = fetch, dir, most = Date.now(), frissNap = SUGO_FRISS_NAP } = {}) {
  if (!SUGO_TAR_BE || !engedelyezett(url)) {
    const r = await cikkSzoveg(url, fetchFn);
    return r ? { szoveg: r.szoveg, cim: r.cim, honnan: 'elo' } : null;
  }
  const tarolt = sugoTarOlvas(url, { dir });
  const kor = tarolt ? most - Date.parse(tarolt.letoltve) : NaN;
  if (tarolt && kor <= frissNap * NAP_MS) return { szoveg: tarolt.szoveg, cim: tarolt.cim, honnan: 'tar' };
  const r = await cikkSzoveg(url, fetchFn);
  if (r && String(r.szoveg || '').trim()) {
    sugoTarIr(url, r, { dir, most });
    return { szoveg: r.szoveg, cim: r.cim, honnan: 'elo' };
  }
  return tarolt ? { szoveg: tarolt.szoveg, cim: tarolt.cim, honnan: 'regi-tar' } : null;
}
