// 🛡️ CSALÁS-ARCHÍV (2026-11-28; spec: docs/superpowers/specs/2026-11-28-csalas-archiv-design.md)
//
// A hivatalos források 2026-ban MÁR közzétett csalás-figyelmeztetései (user 11-28: „össze szedni amiket közzétettek
// és publikálni de nem kell lehozni a hirekben csak az ujjaket” · „csak 2026-ost” · „gondoltam te megirod!”).
//
// MIÉRT KÜLÖN MAPPA (content/csalas-archiv/): ~40 program olvassa a content/articles-t (social, Reel, hírlevél,
// prune, videó, SEO, házmester — az utóbbi a content/translations árva fájljait TÖRLI). Egyenkénti szűrő helyett
// ezek EGYIKE sem látja az archívot; a fordítás a fájlon BELÜL van (`forditas: { hu, es }`).
// Csak a website/build.js (/scams + /scams/<slug>), a core/csalas-kepek.js és a core/indexnow.js olvassa.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { peldaBlokk, csalasSzerkezetHiba, peldaBiztonsag, forditasEgyezik } from './csalas-sablon.js';
import { vanAr } from './ar-tilalom.js';
import { findBritish } from './us-spelling.js';

export const ARCHIV_MAPPA = join('content', 'csalas-archiv');
export const ARCHIV_NYELVEK = ['hu', 'es'];
const FAJL_RX = /^ARTICLE_SCAM_[a-z0-9][a-z0-9-]*\.json$/;
const SLUG_RX = /^[a-z0-9][a-z0-9-]*$/;
const FORRAS_RX = /^https:\/\/(?:www\.ic3\.gov\/PSA\/2026\/|blog\.google\/)/;

/** Az archív fájlok ({ file, data }); hibás JSON / más nevű fájl kimarad — a build ettől soha nem bukik el. */
export function csalasArchivBetolt(ROOT) {
  const dir = join(ROOT, ARCHIV_MAPPA);
  if (!existsSync(dir)) return [];
  const ki = [];
  for (const file of readdirSync(dir).filter(f => FAJL_RX.test(f)).sort()) {
    try { ki.push({ file, data: JSON.parse(readFileSync(join(dir, file), 'utf-8')) }); } catch { /* rossz fájl kihagyva */ }
  }
  return ki;
}

/** A cikk markdownja a kért nyelven (en: article_markdown; hu/es: a beépített fordítás) — hiányzónál null. */
export function csalasArchivMd(data, lang) {
  const md = lang === 'en' ? data?.article_markdown : data?.forditas?.[lang];
  return typeof md === 'string' && md.trim() ? md : null;
}

/** A forrás neve és EREDETI dátuma (a /scams ezt mutatja: „FBI warning · Sep 17, 2026”), vagy null. */
export function csalasArchivAdat(meta) {
  const a = meta?.csalas_archiv;
  if (!a || typeof a !== 'object') return null;
  const forrasDatum = String(a.forras_datum || '');
  const forrasNev = String(a.forras_nev || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(forrasDatum) || !forrasNev) return null;
  return { forrasNev, forrasDatum };
}

const torzs = md => String(md).replace(/^---\n[\s\S]*?\n---\n?/, '');

/** Hibalista (üres = jó). A teszt MINDEN valódi archív fájlra lefuttatja (core/csalas-archiv.test.js). */
export function csalasArchivEllenoriz(data, { ma = new Date() } = {}) {
  const h = [];
  const m = data?._meta || {};
  if (!SLUG_RX.test(String(m.slug || ''))) h.push('érvénytelen _meta.slug');
  if (!m.csalas || typeof m.csalas !== 'object') h.push('nincs _meta.csalas');
  const adat = csalasArchivAdat(m);
  if (!adat) h.push('nincs érvényes _meta.csalas_archiv (forras_datum + forras_nev)');
  else if (!adat.forrasDatum.startsWith('2026-') || adat.forrasDatum > ma.toISOString().slice(0, 10)) h.push(`nem 2026-os (vagy jövőbeli) forrásdátum: ${adat.forrasDatum}`);
  if (!FORRAS_RX.test(String(m.source_link || ''))) h.push(`nem jóváhagyott forrás: ${m.source_link || '—'}`);
  if (!m.published_at) h.push('nincs _meta.published_at');

  const en = csalasArchivMd(data, 'en');
  if (!en) { h.push('nincs angol szöveg'); return h; }
  for (const lang of ['en', ...ARCHIV_NYELVEK]) {
    const md = csalasArchivMd(data, lang);
    if (!md) { h.push(`[${lang}] hiányzó fordítás`); continue; }
    if ((torzs(md).match(/^# /gm) || []).length !== 1) h.push(`[${lang}] nem pontosan 1 H1`);
    if (vanAr(md)) h.push(`[${lang}] árat/összeget tartalmaz`);
    const pelda = peldaBlokk(md);
    if (!pelda) { h.push(`[${lang}] nincs (elemezhető) példablokk`); continue; }
    for (const x of peldaBiztonsag(pelda)) h.push(`[${lang}] ${x}`);
    if (lang === 'en') for (const x of csalasSzerkezetHiba(md)) h.push(`[en] ${x}`);
    else {
      if ((torzs(md).match(/^## /gm) || []).length < 3) h.push(`[${lang}] kevesebb mint 3 H2`);
      if (!forditasEgyezik(en, md)) h.push(`[${lang}] a példablokk nem egyezik az angollal (vagy angolul maradt)`);
    }
  }
  const brit = findBritish(en);
  if (brit.length) h.push(`[en] brit helyesírás: ${brit.slice(0, 3).join(', ')}`);
  return h;
}
