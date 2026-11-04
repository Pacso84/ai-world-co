// ===================================================================
// A FORRÁSSZÖVEG GYORSÍTÓTÁRA — GIT-EN KÍVÜL (2026-11-01, koordinátor-döntés)
//
// MIÉRT: a híríró a hivatalos forrás teljes szövegéből ír (core/iro-forras.js), és a bírónak
// (core/truth-gate.js) UGYANAZT kell látnia. A szöveget a content/ alatt (vázlat, cikk-_meta) tárolni
// NEM SZABAD: a repó NYILVÁNOS — más kiadók teljes cikkszövege szerzői jogi kockázat, és hírenként
// ~9 KB-tal (évente ~13 MB) hízlalná a repót. Ezért az agents/iro/cache/forras/ alá kerül
// (.gitignore: `agents/*/cache/` — a teszt őrzi). A cikk `_meta`-jába csak a kulcs
// (`source_text_key`), a hossz és a forrás fajtája megy.
//
// 🔒 2026-11-03 (JOGTISZTA FORRÁSOK, user: „igen holnap megcsináljuk!”): MINDEN kiadói szöveg — a letöltött
// forrás, a hírfolyam teljes szövege ÉS a rövid kivonat (vázlat `content_snippet`, cikk `_meta.source_snippet`) —
// a PRIVÁT FORRÁS-TÁRBA kerül: `_forrasok/` (.gitignore), a CI-ban a Pacso84/ai-world-co-forrasok privát repó
// kicsekkolva (deploy key: FORRAS_TAR_SSH_KEY), a futás végén visszatolva. Alap: EU szöveg- és adatbányászati
// kivétel — gépi elemzéshez tárolható, közzétenni nem. A tár hiánya SOHA nem állít meg semmit (üres szöveg).
// Ezért a régi „futás végéig” élettartam már csak akkor igaz, ha a tár nem jött le (lásd lent).
//
// ÉLETTARTAM (régi, tár nélkül): a CI-ban a futás végéig. Az író, az ellenőrző (benne a bíró) és az átdolgozás
// UGYANABBAN a jobban, ugyanazon a gépen fut (az agents/ceo/agent.js egymás után indítja őket).
// A következő futás tiszta gépen indul: ha egy cikket ott bírálnak, a bíró a régi kivonatot
// (source_snippet) kapja — ez a régi viselkedés.
// Hiba (nincs mappa / fájl, írási hiba, rossz kulcs) SOHA nem állít meg semmit: üres szöveg / false.
// ===================================================================

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { linkKulcs, tisztaUrl } from './forras-letoltes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** A PRIVÁT FORRÁS-TÁR gyökere (git-en kívül, .gitignore: `_forrasok/`). Teszt / más hely: FORRAS_TAR_DIR. */
export const FORRAS_TAR_DIR = join(__dirname, '..', '_forrasok');
const tar = () => process.env.FORRAS_TAR_DIR || FORRAS_TAR_DIR;

/** A letöltött / összefűzött forrásszöveg mappája. Teszt: a FORRAS_CACHE_DIR környezeti változó vagy a `dir` opció. */
export const FORRAS_CACHE_DIR = join(FORRAS_TAR_DIR, 'forras');
const mappa = dir => dir || process.env.FORRAS_CACHE_DIR || join(tar(), 'forras');

// A kulcs a _meta-ból (JSON-ból) is jöhet → csak pontosan 16 hexa mehet fájlnévbe (nincs „../" trükk).
const JO_KULCS = /^[0-9a-f]{16}$/;

/**
 * A cikk forrásainak kulcsa: a linkek (levágva; protokoll, query, záró perjel nélkül) a cikk
 * sorrendjében → sha256 első 16 hexa jegye. Link nélkül null.
 */
export function forrasKulcs(linkek) {
  const kulcsok = (Array.isArray(linkek) ? linkek : [linkek])
    .map(l => linkKulcs(tisztaUrl(l) || l))
    .filter(Boolean);
  if (!kulcsok.length) return null;
  return createHash('sha256').update(kulcsok.join('\n')).digest('hex').slice(0, 16);
}

/** A szöveg a gyorsítótárba. @returns {boolean} sikerült-e (hiba esetén false, kivétel soha). */
export function forrasCacheIr(kulcs, szoveg, { dir } = {}) {
  if (!JO_KULCS.test(String(kulcs || '')) || !String(szoveg || '').trim()) return false;
  try {
    const d = mappa(dir);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, `${kulcs}.txt`), String(szoveg), 'utf-8');
    return true;
  } catch { return false; }
}

/** A gyorsítótárból; ha nincs (vagy rossz a kulcs), üres sztring. */
export function forrasCacheOlvas(kulcs, { dir } = {}) {
  if (!JO_KULCS.test(String(kulcs || ''))) return '';
  try { return readFileSync(join(mappa(dir), `${kulcs}.txt`), 'utf-8'); } catch { return ''; }
}

/**
 * Egy cikk (`_meta`) forrásszövege a gyorsítótárból: előbb a tárolt `source_text_key`, különben a
 * linkekből (`source_links`, ennek híján `source_link`) számolt kulcs. Nincs találat → '' (a hívó
 * ilyenkor a régi `source_snippet`-re esik vissza).
 */
export function cikkForrasSzovege(meta, { dir } = {}) {
  const m = meta || {};
  const tarolt = forrasCacheOlvas(m.source_text_key, { dir });
  if (tarolt) return tarolt;
  const linkek = Array.isArray(m.source_links) && m.source_links.length ? m.source_links : [m.source_link];
  const szamolt = forrasKulcs(linkek.filter(Boolean));
  return szamolt && szamolt !== m.source_text_key ? forrasCacheOlvas(szamolt, { dir }) : '';
}

// ── A HÍRFOLYAM TELJES SZÖVEGE — szintén git-en KÍVÜL (2026-11-02, user: „a kiadók szövegét ne tartalmazza”) ──
// Eddig a hírgyűjtő (agents/rss-scraper) a vázlatba (content/drafts/*.json, NYILVÁNOS git) írta a hírfolyam teljes
// szövegét (`content_full`, mérve 11-02: 4 vázlatban 2,8–28 ezer karakter — NVIDIA, Microsoft Research, Google
// Workspace). Most ide kerül, a link kulcsával; a vázlatba csak a hossza (`content_full_len`). Az író ugyanabban a
// CI-futásban innen olvassa (a hírgyűjtő és az író egy jobban, egymás után fut). Egy későbbi futásban (tiszta gép)
// nincs meg → az író a hivatalos oldalt tölti le (core/iro-forras.js (b) ág), ennek híján a rövid kivonat marad.
export const HIRFOLYAM_CACHE_DIR = join(FORRAS_TAR_DIR, 'hirfolyam');
const hfMappa = dir => dir || process.env.HIRFOLYAM_CACHE_DIR || join(tar(), 'hirfolyam');

/** A hírfolyam teljes szövege a git-en kívüli tárba, a link kulcsával. @returns {boolean} (hiba: false, kivétel soha) */
export function hirfolyamSzovegIr(link, szoveg, { dir } = {}) {
  return forrasCacheIr(forrasKulcs([link]), szoveg, { dir: hfMappa(dir) });
}

/** A link hírfolyam-szövege a git-en kívüli tárból; ha nincs, üres sztring. */
export function hirfolyamSzovegOlvas(link, { dir } = {}) {
  const kulcs = forrasKulcs([link]);
  return kulcs ? forrasCacheOlvas(kulcs, { dir: hfMappa(dir) }) : '';
}

// ── A RÖVID KIVONAT IS A PRIVÁT TÁRBA (2026-11-03, JOGTISZTA FORRÁSOK) ──
// Eddig a vázlat `content_snippet`-je (≤1500 kar. hírfolyam-összefoglaló) és a cikk `_meta.source_snippet`-je
// (≤3000; 11-03-án 145 cikkben) a NYILVÁNOS gitben volt. Most a tárban, a linkek kulcsával (egyhírű cikknél a
// kulcs = a vázlaté, a szöveg is ugyanaz → egy fájl). A fájlban csak a hossz marad (`content_snippet_len`,
// `source_snippet_len`). OLVASÁS MINDIG EZEKKEL a függvényekkel: előbb a régi mező (régi fájl, teszt), utána a tár.
export const KIVONAT_CACHE_DIR = join(FORRAS_TAR_DIR, 'kivonat');
const kvMappa = dir => dir || process.env.KIVONAT_CACHE_DIR || join(tar(), 'kivonat');

/** A cikk kivonatának kulcsa: a tárolt `source_text_key` (ha érvényes), különben a linkekből számolva. */
export function cikkKivonatKulcs(meta) {
  const m = meta || {};
  if (JO_KULCS.test(String(m.source_text_key || ''))) return m.source_text_key;
  const linkek = Array.isArray(m.source_links) && m.source_links.length ? m.source_links : [m.source_link];
  return forrasKulcs(linkek.filter(Boolean));
}

/** A cikk kivonata a tárba. @returns {boolean} (hiba: false, kivétel soha) */
export function cikkKivonatIr(meta, szoveg, { dir } = {}) {
  return forrasCacheIr(cikkKivonatKulcs(meta), szoveg, { dir: kvMappa(dir) });
}

/** A cikk kivonata: a régi `_meta.source_snippet`, ennek híján a tárból; ha sehol, üres sztring. */
export function cikkKivonat(meta, { dir } = {}) {
  const regi = String(meta?.source_snippet || '');
  if (regi.trim()) return regi;
  const kulcs = cikkKivonatKulcs(meta);
  return kulcs ? forrasCacheOlvas(kulcs, { dir: kvMappa(dir) }) : '';
}

/** A vázlat kivonata a tárba, a link kulcsával. @returns {boolean} */
export function vazlatKivonatIr(link, szoveg, { dir } = {}) {
  return forrasCacheIr(forrasKulcs([link]), szoveg, { dir: kvMappa(dir) });
}

/** A vázlat kivonata: a régi `content_snippet`, ennek híján a tárból (a link kulcsával); ha sehol, üres sztring. */
export function vazlatKivonat(d, { dir } = {}) {
  const regi = String(d?.content_snippet || '');
  if (regi.trim()) return regi;
  const kulcs = d?.link ? forrasKulcs([d.link]) : null;
  return kulcs ? forrasCacheOlvas(kulcs, { dir: kvMappa(dir) }) : '';
}
