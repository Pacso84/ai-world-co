// ===================================================================
// A HÍRÍRÓ FORRÁSSZÖVEGE (2026-11-01) — a gyökérhiba javítása
//
// MIÉRT: az író (agents/iro) eddig a vázlat `content_snippet`-jéből kapott legfeljebb 1500 karaktert —
// ez valójában a hírfolyam 1–2 mondatos összefoglalója (mérve 11-01, 17 vázlaton: 121–500 karakter).
// A forrásoldalt SOHA nem töltötte le, és a hírfolyam teljes szövegét (`content_full`; az NVIDIA,
// Microsoft Research, Picsart, Snowflake, Brave… hírfolyama 5–25 ezer karaktert ad) sem kapta meg →
// 10 nap alatt legalább 12 hírben írta, hogy „a forrás nem közli a lépéseket / az árat”, holott közölte.
// Most vázlatonként:
//   (a) a hírfolyam teljes szövege, ha tisztítva ≥ MIN_FORRAS — nincs letöltés;
//   (b) különben letöltjük a forrásoldalt (core/forras-letoltes.js — OpenAI, Apple, Amazon, Zapier: ott
//       a hírfolyam is csak kivonat);
//   (c) különben a régi kivonat. Hálózati hiba / lassú forrás SOHA nem állítja meg az írót.
// A prompt vázlatonként legfeljebb DRAFT_FORRAS_MAX, összevont cikknél együtt OSSZEVONT_FORRAS_MAX
// karaktert kap — és PONTOSAN ezt kapja a bíró is (core/truth-gate.js), különben a bíró a hosszabb
// forrásból jött HELYES részletet „kitaláltnak” hinné.
// ⚠️ A SZÖVEG SEHOL NEM KERÜL GIT-KÖVETETT FÁJLBA (11-01, koordinátor-döntés): se a vázlatba, se a cikk
// `_meta`-jába — a repó nyilvános (más kiadók teljes szövege = szerzői jogi kockázat, ~13 MB/év). A szöveg
// a git-en kívüli gyorsítótárba megy (core/forras-cache.js), a `_meta`-ba csak a kulcs, a hossz és a fajta.
// Hálózat és lemez nélkül tesztelhető (az agents/ alól nem lehet importálni: feltétel nélküli main()).
// ===================================================================

import { forrasLetoltes, tisztaUrl, htmlSzoveg } from './forras-letoltes.js';
import { MIN_FORRAS } from './friss-tenyellenorzes.js';
import { forrasKulcs, hirfolyamSzovegOlvas, vazlatKivonat } from './forras-cache.js';

/**
 * 🔌 VÉSZKAPCSOLÓ — kód-konstans, NEM config-mező (a config `enabled` mezője ebben a repóban magától
 * semmit nem kapcsol ki). false → az író semmit nem tölt le; a hírfolyam teljes szövege (a) és a
 * régi kivonat (c) marad. A teszt őrzi, hogy kikapcsolva tényleg nincs letöltés.
 */
export const FORRAS_LETOLTES_BE = true;

export const DRAFT_FORRAS_MAX = 6000;       // egy hír forrásszövege a promptban (~1500 token)
export const OSSZEVONT_FORRAS_MAX = 9000;   // összevont (több hírből álló) cikk forrásai együtt
export const LETOLTES_MAX = 8000;           // ennyit tölt le / tisztít egy forrásból
export const LETOLTES_KERET_MS = 150000;    // futásonkénti letöltési időkeret: ha elfogy, a többi hír a kivonatból készül
export const ATFEDES_FIGYELMEZTET = 15;     // ennyi egymást követő közös szótól NAPLÓSOR (nem blokkol)

const ELVALASZTO = '\n\n---\n\n';           // ugyanaz, mint a régi source_snippet-ben

/** Vázlatonkénti plafon a promptban: 1 hír → 6000; több hír → együtt legfeljebb 9000. */
export function forrasKeret(db) {
  const n = Math.max(1, Math.floor(Number(db) || 1));
  return Math.min(DRAFT_FORRAS_MAX, Math.floor(OSSZEVONT_FORRAS_MAX / n));
}

/**
 * Egy vázlat forrásszövege, (a) → (b) → (c) sorrendben. A vázlat-objektumot NEM módosítja.
 * @returns {Promise<{text: string, via: 'hirfolyam'|'html'|'rss'|'kivonat', letoltes: object|null}>}
 *   `letoltes`: a MOST lefutott forrasLetoltes() eredménye (sikeres vagy sikertelen), különben null.
 */
export async function vazlatForras(d, { letoltesBe = FORRAS_LETOLTES_BE, letolto = forrasLetoltes, opciok = {}, hirfolyamOlvas = hirfolyamSzovegOlvas } = {}) {
  // (a) A hírfolyam teljes szövege — 11-02 óta a git-en KÍVÜLI tárból (core/forras-cache.js); a vázlat régi
  // `content_full` mezője csak visszafelé-kompatibilitás (a vázlat a NYILVÁNOS gitben van, oda már nem kerül).
  let nyers = d?.content_full || '';
  if (!nyers && d?.link) { try { nyers = hirfolyamOlvas(d.link) || ''; } catch { nyers = ''; } }
  const teljes = htmlSzoveg(nyers, LETOLTES_MAX);
  if (teljes.length >= MIN_FORRAS) return { text: teljes, via: 'hirfolyam', letoltes: null };

  let letoltes = null;
  const link = tisztaUrl(d?.link);
  if (letoltesBe && link) {
    try {
      letoltes = await letolto(link, { maxChars: LETOLTES_MAX, ...opciok });
    } catch (e) {
      letoltes = { ok: false, url: link, status: null, via: null, text: '', hiba: 'váratlan hiba: ' + String(e?.message || e).slice(0, 60) };
    }
    if (letoltes?.ok && String(letoltes.text || '').length >= MIN_FORRAS) {
      return { text: letoltes.text, via: letoltes.via === 'rss' ? 'rss' : 'html', letoltes };
    }
  }
  // (c) A régi kivonat — hacsak a hírfolyam (rövid) teljes szövege nem hosszabb nála.
  const kivonat = String(vazlatKivonat(d) || '');   // 🔒 11-03: a régi mező vagy a privát tár
  return teljes.length > kivonat.trim().length
    ? { text: teljes, via: 'hirfolyam', letoltes }
    : { text: kivonat, via: 'kivonat', letoltes };
}

/**
 * Egy cikk (1..N vázlat) forrásai a prompthoz — vázlatonként a keretre vágva. A vázlatokat NEM módosítja
 * (semmit nem ment vissza beléjük: a content/drafts a gitben van).
 * @param {object[]} lista  a vázlatok (a cikk sorrendjében)
 * @param {{maradekMs: number}} ido  a FUTÁS letöltési időkerete — a hívó egyszer hozza létre, ez fogyasztja
 * @returns {Promise<{reszek: {text, via, hiba, letoltve}[], osszes: string}>}
 *   `osszes`: a cikk teljes forrásszövege (a gyorsítótárba megy, a bíró ezt kapja).
 */
export async function cikkForrasai(lista, { ido = { maradekMs: LETOLTES_KERET_MS }, letoltesBe = FORRAS_LETOLTES_BE, letolto = forrasLetoltes, opciok = {}, most = Date.now } = {}) {
  const vazlatok = Array.isArray(lista) ? lista : [];
  const keret = forrasKeret(vazlatok.length);
  const reszek = [];
  for (let i = 0; i < vazlatok.length; i++) {
    const szabad = letoltesBe && !(ido.maradekMs <= 0);
    const t0 = most();
    const f = await vazlatForras(vazlatok[i], { letoltesBe: szabad, letolto, opciok });
    if (f.letoltes) ido.maradekMs -= Math.max(0, most() - t0);
    // `hiba` = MIÉRT maradt rövid a forrás (a naplóba megy); teljes szövegnél null.
    let hiba = null;
    if (String(f.text || '').length < MIN_FORRAS) {
      if (f.letoltes && !f.letoltes.ok) hiba = f.letoltes.hiba || 'ismeretlen hiba';
      else if (!letoltesBe) hiba = 'a letöltés ki van kapcsolva';
      else if (!szabad) hiba = 'elfogyott a futás letöltési időkerete';
      else if (!tisztaUrl(vazlatok[i]?.link)) hiba = 'nincs http(s) link';
    }
    const letoltve = !!f.letoltes?.ok && (f.via === 'html' || f.via === 'rss');   // a letöltött szöveg került a promptba
    reszek.push({ text: String(f.text || '').slice(0, keret).trimEnd(), via: f.via, hiba, letoltve });
  }
  return { reszek, osszes: forrasOsszefuz(reszek.map(r => r.text)) };
}

/**
 * A megírt cikk `_meta`-jának FORRÁS-mezői (a régi mezők változatlanul + kis metaadat).
 * ⚠️ MAGA A FORRÁSSZÖVEG NEM KERÜL BELE (11-01, koordinátor-döntés): a cikk a content/ alá, a nyilvános
 * gitbe megy. A szöveg a git-en kívüli gyorsítótárban van (core/forras-cache.js) — a `source_text_key`
 * a kulcsa, a bíró és az átdolgozás ezzel keresi meg. A teszt őrzi, hogy a szöveg ide nem szivárog.
 * @param {object[]} lista  a vázlatok (a cikk sorrendjében)
 * @param {{reszek: {text, via}[], osszes: string}|null} forras  a cikkForrasai() eredménye
 */
export function cikkForrasMeta(lista, forras) {
  const vazlatok = Array.isArray(lista) ? lista : [lista];
  const fo = vazlatok[0] || {};
  const linkek = vazlatok.map(d => tisztaUrl(d?.link) || d?.link).filter(Boolean);
  return {
    // ✂️ LEVÁGVA (11-01): a Dropbox hírfolyama „  https://… " alakban adja a linket — mind a 10 Dropbox-hírünk
    // így került be, és a bíró / a tény-ellenőrző `^https?://` szűrője emiatt a forrást kihagyta.
    source_link: tisztaUrl(fo.link) || fo.link,
    // ÖSSZEVONÁS (2026-08-18): MINDEN felhasznált forrás. A forrás-zár ezt is
    // nézi — enélkül a beolvasztott hír később külön cikként újra megíródna.
    source_links: linkek,
    // A HIVATALOS KIVONAT (2026-09-27): a bíró régi cikknél / más futásban ezt kapja, az útmutató-író (800 kar.)
    // és a Főnök-asztal tömör összefoglalónak használja. 🔒 2026-11-03 (JOGTISZTA FORRÁSOK): maga a szöveg a
    // PRIVÁT TÁRBA megy (az író: cikkKivonatIr(meta, cikkKivonatSzoveg(lista))), ide csak a hossza.
    source_snippet_len: cikkKivonatSzoveg(vazlatok).length,
    // 🔎 Kis metaadat a forrásszövegről (11-01) — maga a szöveg a gyorsítótárban.
    source_text_via: vazlatok.map((_, i) => forras?.reszek?.[i]?.via || 'kivonat'),
    source_text_len: String(forras?.osszes || '').length,
    source_text_key: forrasKulcs(linkek)
  };
}

/** A cikk rövid kivonata (a vázlatok kivonatai, ≤1500 / vázlat, együtt ≤3000) — a privát tárba megy, NEM a cikkbe. */
export function cikkKivonatSzoveg(lista) {
  const vazlatok = Array.isArray(lista) ? lista : [lista];
  return vazlatok.map(d => String(vazlatKivonat(d) || '').slice(0, 1500)).filter(Boolean).join(ELVALASZTO).slice(0, 3000);
}

/** A cikk forrásszövege EGY sztringben — a `_meta.source_text` és a bíró ezt kapja. */
export function forrasOsszefuz(szovegek) {
  // A darabok már a keretre vágva jönnek (cikkForrasai) → ez csak védőkorlát (+ az elválasztók helye).
  return (szovegek || []).map(s => String(s || '').trim()).filter(Boolean).join(ELVALASZTO).slice(0, OSSZEVONT_FORRAS_MAX + 200);
}

// ── EREDETISÉG: szó szerinti átfedés a cikk és a forrás között ──────
// (2026-11-01) Hosszabb forrásszövegnél nő a kísértés a másolásra. A prompt tiltja (saját szavak,
// 8+ szavas szakasz sem), ez pedig MÉRI: a leghosszabb közös, egymást követő szósorozat. Olcsó (szó-szintű
// dinamikus programozás, ~2 ezer × 1,5 ezer szó → néhány ms), csak NAPLÓSOR, nem blokkol.

const szavakra = s => String(s || '').toLowerCase().replace(/[’‘`´]/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) || [];
const frontmatterNelkul = md => String(md || '').replace(/^﻿?---[\s\S]*?\n---[^\n]*\n?/, '');
const MAX_SZO = 5000;   // védőkorlát: ennél hosszabb bemenetet levágunk (25 M lépés felett lassulna)

/**
 * A cikk (markdown, frontmatter nélkül) és a forrás leghosszabb közös, egymást követő szósorozata.
 * Kis-nagybetű és írásjel nem számít. @returns {{szavak: number, minta: string}}
 */
export function leghosszabbKozosSzosor(cikkMd, forras) {
  const a = szavakra(frontmatterNelkul(cikkMd)).slice(0, MAX_SZO);
  const b = szavakra(forras).slice(0, MAX_SZO);
  if (!a.length || !b.length) return { szavak: 0, minta: '' };
  const kodok = new Map();
  const kod = w => { let v = kodok.get(w); if (v === undefined) { v = kodok.size; kodok.set(w, v); } return v; };
  const A = Int32Array.from(a, kod), B = Int32Array.from(b, kod);
  let elozo = new Int32Array(B.length + 1), akt = new Int32Array(B.length + 1);
  let legjobb = 0, veg = 0;
  for (let i = 1; i <= A.length; i++) {
    const x = A[i - 1];
    for (let j = 1; j <= B.length; j++) {
      const v = x === B[j - 1] ? elozo[j - 1] + 1 : 0;
      akt[j] = v;
      if (v > legjobb) { legjobb = v; veg = i; }
    }
    const csere = elozo; elozo = akt; akt = csere;
  }
  return { szavak: legjobb, minta: a.slice(veg - legjobb, veg).join(' ') };
}
