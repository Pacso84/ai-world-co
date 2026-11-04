// ===================================================================
// A TÉNY-ELLENŐRZŐ HÍR-FORRÁSA (2026-11-01)
//
// MIÉRT: a tény-ellenőrző (agents/fact-check) eddig SAJÁT, robot-azonosítós fetch-csel töltötte le a hír
// forrását. 10-21 – 10-31: 13 kihagyásból 7 az OpenAI 403 robot-tiltása, 4 a Workspace-blog gyors bukása volt,
// és a kihagyás oka nem mondta meg a HTTP-státuszt. Most:
//   1) ELŐSZÖR a híríró gyorsítótára (core/forras-cache.js) — friss cikknél ugyanabban a CI-futásban ott van a
//      teljes forrásszöveg, letöltés nélkül. Csak akkor használjuk, ha MINDEN forrás teljes szövegként került be
//      (nem a rövid kivonat): a hiányzó forrásrészből jövő helyes adatot a modell „kitaláltnak” hinné (10-21 Picsart).
//   2) Különben linkenként a közös letöltő (core/forras-letoltes.js: böngésző-fejléc, újrapróba, Blogger-tartalék).
//   3) Ha akár EGY forrás is hiányzik, nem ítélünk; a kihagyás oka a státusszal: „a forrás nem olvasható (1/2: HTTP 403)”.
// Hálózatot CSAK a `letolto`-n, lemezt CSAK a `cacheOlvaso`-n át ér el → a teszt hálózat és lemez nélkül fut.
// (Külön modul, mert a forras-letoltes.js a friss-tenyellenorzes.js-ből importál → onnan körkörös import lenne.)
// ===================================================================

import { forrasLetoltes } from './forras-letoltes.js';
import { cikkForrasSzovege } from './forras-cache.js';
import { forrasLinkek, MIN_FORRAS } from './friss-tenyellenorzes.js';

/** Az összes forrás együtt legfeljebb ennyi karakter a promptban (ugyanannyi, mint a régi saját letöltésnél). */
export const OSSZ_FORRAS_MAX = 24000;
// A híríró (core/iro-forras.js) ezzel fűzi össze a forrásrészeket a gyorsítótárban.
const ELVALASZTO = '\n\n---\n\n';
// Teljes szövegű forrásrész: hírfolyam teljes szövege, letöltött oldal vagy Blogger-RSS. A 'kivonat' NEM az.
const TELJES_VIA = new Set(['html', 'rss', 'hirfolyam']);

/**
 * A gyorsítótárban lévő szöveg forrásonkénti darabjai — vagy null, ha nem használható (nincs, nem minden forrás
 * teljes szövegű, más a darabszám, vagy valamelyik darab rövidebb a MIN_FORRAS-nál).
 */
export function cacheDarabok(meta, szoveg, urls) {
  const via = meta?.source_text_via;
  if (!String(szoveg || '').trim() || !urls?.length) return null;
  if (!Array.isArray(via) || via.length !== urls.length || !via.every(v => TELJES_VIA.has(v))) return null;
  const reszek = String(szoveg).split(ELVALASZTO).map(r => r.trim());
  if (reszek.length !== urls.length || reszek.some(r => r.length < MIN_FORRAS)) return null;
  const keret = Math.floor(OSSZ_FORRAS_MAX / urls.length);
  return reszek.map((r, i) => ({ url: urls[i], szoveg: r.slice(0, keret) }));
}

/** A modellnek szóló forrásblokk (több forrásnál sorszámozva). */
export const forrasBlokk = darabok => darabok.map((d, i) => `--- SOURCE ${i + 1} (${d.url}) ---\n${d.szoveg}`).join('\n\n');

/**
 * Egy hír forrásszövege a tény-ellenőrzéshez.
 * @returns {Promise<{forras: string|null, skip: string|null, status: number|null, via: 'cache'|'letoltes'|null}>}
 *   `skip` = miért nem ítélünk (magyar, a sikeres/összes forrás számával és a hibával); `status` = az első
 *   sikertelen forrás HTTP-státusza (ha volt).
 */
export async function hirForrasa(meta, { letolto = forrasLetoltes, cacheOlvaso = cikkForrasSzovege, opciok = {} } = {}) {
  const urls = forrasLinkek(meta);
  if (!urls.length) return { forras: null, skip: 'a forrás nem olvasható (0/0: nincs http(s) forráslink)', status: null, via: null };

  let cache = '';
  try { cache = cacheOlvaso(meta) || ''; } catch { cache = ''; }
  const cd = cacheDarabok(meta, cache, urls);
  if (cd) return { forras: forrasBlokk(cd), skip: null, status: null, via: 'cache' };

  const keret = Math.floor(OSSZ_FORRAS_MAX / urls.length);
  const darabok = [], hibak = [];
  let status = null;
  for (const url of urls) {
    let r;
    try { r = await letolto(url, { maxChars: keret, ...opciok }); }
    catch (e) { r = { ok: false, status: null, text: '', hiba: 'váratlan hiba: ' + String(e?.message || e).slice(0, 60) }; }
    const text = String(r?.text || '');
    if (r?.ok && text.length >= MIN_FORRAS) darabok.push({ url, szoveg: text.slice(0, keret) });
    else {
      hibak.push(r?.hiba || (r?.ok ? `túl rövid szöveg (${text.length} karakter)` : 'ismeretlen hiba'));
      if (status == null && r?.status) status = Number(r.status) || null;
    }
  }
  if (hibak.length) {
    const ok = `a forrás nem olvasható (${darabok.length}/${urls.length}: ${[...new Set(hibak)].join('; ')})`;
    return { forras: null, skip: ok.length > 240 ? ok.slice(0, 239) + '…)' : ok, status, via: 'letoltes' };
  }
  return { forras: forrasBlokk(darabok), skip: null, status: null, via: 'letoltes' };
}
