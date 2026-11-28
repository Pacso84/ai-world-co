// ===================================================================
// CSALÁS-REEL — a csalás-hírből rövid, mozgó videó (13. rész, 2026-11-28)
// ===================================================================
//
// MIÉRT: a user 11-28-án: „jöjjenek le a social médiában is! vagy mint poszt vagy reel! de lehet hogy a reel
// jobb lenne!”. A Reel eddig CSAK útmutatóból készült (core/reel-queue.js: type === 'guide'), a csalás-hír sima
// képes posztként ment volna. A mérés (memoria/reports/Reelek és posztok — kutatás (2026-11-15).md): a videó
// ≫ fotó, a fő jel a végignézés.
//
// MIT MUTAT (~18–22 mp, a meglévő mozgóképes motorral — core/motion-reel.js, „csalas” elrendezés):
//   fent végig a cikk KITALÁLT példaüzenete a ①②③ jelekkel és a „PÉLDA — CSALÁS” vízjellel
//   (core/csalas-kep.js csalasKartyaSvg — ugyanaz a rajz, ami a cikkben van), alatta szavanként szinkron felirat:
//   1. SCAM ALERT — a cím (horog)            2–4. WARNING SIGN 1/3…3/3 — a cikk 3 jelének címkéje + rövid magyarázat
//   5. WHAT TO DO — a védekezés első lépése  6. FULL DETAILS — aiworldhq.com/scams
// Csak a cikk ANGOL szövegéből (a Reelek amerikai közönségnek mennek). A tartalom a már ellenőrzött cikkből jön
// (igazság-kapu, kép-őr) — a videó nem állít semmi újat.
//
// SOR: naponta legfeljebb 1 csalás-Reel, csak 2 napnál frissebb csalás-hírből, a rendes napi 2 útmutató-Reel
// MELLÉ (a csalás-hír ritka: 120 nap alatt 1 a 2 forrásból — a Make-keretet nem terheli érdemben).
// Jelölés a cikkben: `_meta.csalas_video_at` (a gyártás) és `_meta.csalas_reel_at` (a Facebook-küldés).
//
// Tiszta logika, hálózat és lemez nélkül (a gyártás és a küldés a core/reel-post.js-ben).
// ===================================================================

import { peldaBlokk } from './csalas-sablon.js';
import { CSALAS_FIGYELO_BE, csalasHir } from './csalas-figyelo.js';
import { trimToWords, AI_JELOLES } from './social-text.js';

export const CSALAS_REEL_FRISS_NAP = 2;
export const CSALAS_REEL_NAPI = 1;
export const CSALAS_REEL_URL = 'aiworldhq.com/scams';
export const MAGYARAZAT_MAX_SZO = 9;    // e fölött a jel magyarázata nem hangzik el (csak a címkéje) — a videó ne nyúljon
export const VEDEKEZES_MAX_SZO = 8;

const NAP = 864e5;
const napja = x => { const t = Date.parse(String(x || '')); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };
const szavak = s => String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
const tiszta = s => String(s || '').replace(/\*\*|__|`/g, '').replace(/\[\[\d\|(.+?)\]\]/g, '$1').replace(/\s+/g, ' ').trim();
const nagyKezdo = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const pontVeg = s => /[.!?]$/.test(s) ? s : s + '.';

function cimFm(md) {
  const m = String(md || '').match(/^title:\s*"?(.*?)"?\s*$/m);
  return m ? m[1].replace(/\\"/g, '"').trim() : '';
}

/** A jel magyarázatának első tagmondata — ha MAGYARAZAT_MAX_SZO-nál hosszabb, üres (csak a címke hangzik el). */
export function rovidMagyarazat(szoveg) {
  const elso = tiszta(szoveg).split(/\s*(?:[,;:]|\s[—–-]\s)\s*/)[0].replace(/[.!?]+$/, '').trim();
  return elso && szavak(elso).length <= MAGYARAZAT_MAX_SZO ? elso : '';
}

/**
 * A védekezés első lépésének rövid alakja: a 3. H2 (a sablonban „How to protect yourself”) első számozott
 * pontjának félkövér címkéje. POZÍCIÓ szerint (mint a rövid hírnél, core/csalas-oldal.js). Nincs → ''.
 */
export function elsoVedekezes(md) {
  const sorok = String(md || '').split('\n');
  let h2 = 0;
  for (let i = 0; i < sorok.length; i++) {
    if (/^##\s+\S/.test(sorok[i])) { h2++; continue; }
    if (h2 !== 3) continue;
    const m = sorok[i].match(/^\s*\d+[.)]\s+\*\*(.+?)\*\*/);
    if (!m) continue;
    const s = tiszta(m[1]).replace(/[.!]+$/, '');
    return s && szavak(s).length <= VEDEKEZES_MAX_SZO ? s : '';
  }
  return '';
}

/**
 * A Reel szegmensei (core/motion-reel.js renderMotionReel bemenete). `kep` = a képen látszó szöveg, `mond` = a
 * felolvasott szöveg; a képen látszó szavak a kimondott `elotag`-adik szótól indulnak.
 * @returns {{szegmensek: object[]|null, reason: string, pelda: object|null}}
 */
export function csalasReelSzkript(md) {
  if (typeof md !== 'string' || !md.trim()) return { szegmensek: null, reason: 'nincs szöveg', pelda: null };
  const cim = tiszta(cimFm(md));
  if (!cim) return { szegmensek: null, reason: 'nincs cím', pelda: null };
  const pelda = peldaBlokk(md);
  if (!pelda) return { szegmensek: null, reason: 'nincs példaüzenet', pelda: null };
  const jelek = (pelda.magyarazat || []).map(m => ({ cimke: tiszta(m.cimke), szoveg: m.szoveg }));
  if (jelek.length !== 3 || jelek.some(j => !j.cimke)) return { szegmensek: null, reason: 'nem 3 címkézett jel', pelda };

  const horog = cim.replace(/[.:!]\s*$/, '');
  // ⚠️ A felolvasó a pontot nem mondja ki — ezért „dot com” (mint az útmutató-Reelben).
  const sz = [{ tipus: 'horog', cimke: 'SCAM ALERT', kep: horog, elotag: 2, mond: `Scam alert. ${pontVeg(horog)}` }];
  jelek.forEach((j, i) => {
    const magy = rovidMagyarazat(j.szoveg);
    sz.push({ tipus: 'lepes', szam: i + 1, db: 3, cimke: `WARNING SIGN ${i + 1} / 3`, kep: nagyKezdo(j.cimke), elotag: 0,
      mond: pontVeg(nagyKezdo(j.cimke)) + (magy ? ' ' + pontVeg(nagyKezdo(magy)) : '') });
  });
  const ved = elsoVedekezes(md);
  if (ved) sz.push({ tipus: 'vege', cimke: 'WHAT TO DO', kep: nagyKezdo(ved), elotag: 0, mond: pontVeg(nagyKezdo(ved)) });
  sz.push({ tipus: 'vege', cimke: 'FULL DETAILS', kep: 'Full details: ' + CSALAS_REEL_URL, elotag: 0, mond: 'Full details at aiworldhq dot com.' });
  return { szegmensek: sz, reason: '', pelda };
}

// ── SOR ─────────────────────────────────────────────────────────────

/** Csalás-hír-e a sor-elem (a core/reel-post.js cikkekBetolt alakja: {slug, csalas, …})? */
const csalasElem = c => !!c && !!c.csalas && !!c.slug;   // a csalás-jelölés csak híren lehet (core/csalas-figyelo.js)

/** A MA gyártott csalás-videók cikkei (a korábbi elöl) — életben tartás + TikTok. */
export function maiCsalasVideok(cikkek, now = Date.now()) {
  if (!Array.isArray(cikkek)) return [];
  const ma = new Date(now).toISOString().slice(0, 10);
  return cikkek.filter(c => csalasElem(c) && napja(c.csalas_video_at) === ma)
    .sort((a, b) => String(a.csalas_video_at).localeCompare(String(b.csalas_video_at)));
}

/**
 * Melyik csalás-hírből készüljön MOST videó? null, ha senki. Kapcsoló KI → mindig null.
 * Naponta legfeljebb CSALAS_REEL_NAPI; csak a CSALAS_REEL_FRISS_NAP-nál frissebb, még videó nélküli hír; a régebbi elöl
 * (az van közelebb a kiöregedéshez). `alkalmas(c)` → a hívó dönti el, telik-e videó a szövegből.
 */
export function kovetkezoCsalasReel(cikkek, now = Date.now(), { be = CSALAS_FIGYELO_BE, alkalmas = () => true } = {}) {
  if (!be || !Array.isArray(cikkek)) return null;
  if (maiCsalasVideok(cikkek, now).length >= CSALAS_REEL_NAPI) return null;
  const hatar = now - CSALAS_REEL_FRISS_NAP * NAP;
  return cikkek
    .filter(c => csalasElem(c) && !napja(c.csalas_video_at) && !napja(c.csalas_reel_at)
      && napja(c.published_at) && Date.parse(c.published_at) >= hatar && alkalmas(c))
    .sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)))[0] || null;
}

// A videó gyártása után ennyi ideig várhat a Facebook-küldésre (a csalás-Reel nem megy egy futásban a rendes
// Reellel; ha a hír a nap UTOLSÓ futásában jött, a küldés másnapra marad — a videót addig újragyártjuk).
const VAR_MS = CSALAS_REEL_FRISS_NAP * NAP;
const kuldesreVar = (c, now) => csalasElem(c) && !napja(c.csalas_reel_at) && napja(c.csalas_video_at)
  && now - Date.parse(c.csalas_video_at) <= VAR_MS;

/** A Facebookra küldendő csalás-Reel: legyártva (≤ 2 napja), még nem ment ki; a régebbi elöl. KI → null. */
export function kuldendoCsalasReel(cikkek, now = Date.now(), { be = CSALAS_FIGYELO_BE } = {}) {
  if (!be || !Array.isArray(cikkek)) return null;
  return cikkek.filter(c => kuldesreVar(c, now))
    .sort((a, b) => String(a.csalas_video_at).localeCompare(String(b.csalas_video_at)))[0] || null;
}

/**
 * Melyik csalás-videónak KELL most a shorts/ mappában lennie? (A mappa gitignore-olt: minden CI-futás üresen indul,
 * a deploy pedig letörölné a reggeli videót — a 08-26-i lecke.) A ma gyártott (a TikTok a nap folyamán viszi) és a
 * még ki nem küldött (≤ 2 napos) videók. KI → üres.
 */
export function eletbenTartandoCsalasVideok(cikkek, now = Date.now(), { be = CSALAS_FIGYELO_BE } = {}) {
  if (!be || !Array.isArray(cikkek)) return [];
  const volt = new Set();
  return [...maiCsalasVideok(cikkek, now), ...cikkek.filter(c => kuldesreVar(c, now))]
    .filter(c => !volt.has(c.slug) && volt.add(c.slug));
}

/**
 * Kihagyja-e a Facebook-poszter a csalás-hír KÉPES posztját? Igen, ha a hírből videó készült (vagy már ment) —
 * a Reel a Facebook-formája (user: „vagy poszt vagy reel”). Ha a videó nem készült el, a képes poszt megy (tartalék).
 */
export function csalasFotoPosztHelyettReel(meta, { be = CSALAS_FIGYELO_BE } = {}) {
  return !!be && csalasHir(meta) && !!(napja(meta?.csalas_video_at) || napja(meta?.csalas_reel_at));
}

// ── LEÍRÁS ──────────────────────────────────────────────────────────

export const CSALAS_LINK_ELO = '🛡️ Full details and how to protect yourself: ';

/**
 * A csalás-Reel leírása (Facebook). A LINK az első sorban (a „Továbbiak” előtt csak ~100–125 karakter látszik —
 * ugyanaz a lecke, mint a core/reel-post.js reelCaption-jében), a teljes leírásra (/scams/<slug>) mutat.
 * Like/megosztás kérése nincs (user-szabály); az MI-jelölés és a „kitalált példa” mondat kötelező.
 */
export function csalasReelCaption({ slug, title, subtitle, jelek = [] }, { site = 'https://aiworldhq.com' } = {}) {
  if (!slug || !title) return '';
  const sorok = [`${CSALAS_LINK_ELO}${site}/scams/${slug}`, '', `Scam alert: ${tiszta(title)}`];
  if (subtitle) sorok.push('', trimToWords(tiszta(subtitle), 220));
  const cimkek = jelek.map(j => tiszta(j.cimke || j)).filter(Boolean).slice(0, 3);
  if (cimkek.length === 3) sorok.push('', 'Watch for:', ...cimkek.map((c, i) => `${['1️⃣', '2️⃣', '3️⃣'][i]} ${nagyKezdo(c)}`));
  sorok.push('', 'The message in the video is a made-up example.', '', AI_JELOLES);
  return sorok.join('\n');
}

export default { csalasReelSzkript, kovetkezoCsalasReel, kuldendoCsalasReel, maiCsalasVideok, csalasReelCaption, csalasFotoPosztHelyettReel };
