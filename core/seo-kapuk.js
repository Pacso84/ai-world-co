// ===================================================================
// SEO KERESŐCÍM-KAPUK (2026-11-25) — spec: docs/superpowers/specs/2026-11-25-kereso-cim-design.md
// ===================================================================
// MIÉRT: az SEO-agent július óta minden cikkre írt meta-leírást, de egy sem jutott
// ki (a build `seo.description`-t olvasott, az agent `meta_description`-t írt).
// User 11-25: „azért volt a seo agent! nem azért hogy tippeket adjon!”
//
// Ez a modul az EGY igazság arról, hogy egy keresőcím + leírás kimehet-e:
//   - seoKapuk(): az AI javaslatát ellenőrzi (hossz, ár, összehasonlítás,
//     kattintásvadászat, sablon, ígéret-fedezet) — bukásnál a hibák visszamennek az AI-nak;
//   - keresoFej(): a build ezzel dönti el, mi kerül a <title>-be és a meta-leírásba
//     (csak angol oldal, csak élő v2-es, és a MOSTANI szövegen újraellenőrzött ígérettel);
//   - SEO_ELES_BE: a kapcsoló — false-nál a build a régi viselkedést adja (egy mozdulat vissza).
// ===================================================================

import { vanAr } from './ar-tilalom.js';
import { eszkozNevek } from './forras-tema.js';
import { cimTag } from './title-tag.js';

/** A KAPCSOLÓ. 1. rész: KI (a user a 10 minta jóváhagyása után kapcsolja be — 2. rész). */
export const SEO_ELES_BE = false;

export const CIM_MIN = 25;
export const CIM_MAX = 60;
export const LEIRAS_MIN = 120;
export const LEIRAS_MAX = 158;

const OSSZEHASONLITAS = /\b(best|vs\.?|versus|better than|compared|comparison|alternatives?|top \d+)\b|#1\b/i;
const SABLON = /\bour (step-by-step|easy|simple|complete|beginner'?s?|quick)\b|\bwith our guide\b|\bin this guide\b/i;
const VADASZ = /!|you won'?t believe|\bshocking\b|\bsecret\b/i;
const NAGYBETU_KIVETEL = new Set(['AI', 'PDF', 'USB', 'FAQ', 'API', 'GPT', 'CEO', 'HTML', 'CSS', 'RTX', 'NVIDIA', 'IBM',
  'AWS', 'SQL', 'URL', 'MCP', 'LLM', 'LLMS', 'GPU', 'CPU', 'PC', 'TV', 'SMS', 'NPU', 'SEO', 'UK', 'US', 'USA', 'HDR', 'IOS',
  'RSS', 'VPN', 'PIN', 'QR', 'OCR', 'CSV', 'JSON', 'MP3', 'MP4', 'HD', 'HQ', 'DIY', 'ID', 'NBA', 'NFL', 'BBC', 'NASA', 'DALL']);
const TILTOSZO = new Set(['how', 'what', 'your', 'with', 'from', 'that', 'this', 'into', 'when', 'where', 'which', 'guide',
  'using', 'step', 'steps', 'simple', 'easy', 'free', 'more', 'make', 'made', 'help', 'tips', 'ways', 'does', 'have', 'will',
  'they', 'them', 'their', 'about', 'without', 'there', 'here', 'than', 'then', 'just', 'also', 'each', 'every', 'need',
  'know', 'should', 'could', 'would', 'want', 'like', 'some', 'most', 'much', 'many', 'only', 'over', 'after', 'before',
  'while', 'beginner', 'beginners', 'quick', 'quickly', 'better', 'start', 'started', 'getting', 'today', 'home']);

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const szohatarral = (szoveg, szo) => new RegExp('(^|[^a-z0-9])' + esc(szo.toLowerCase()) + '(?![a-z0-9])').test(szoveg);
/** A cikk szövege kisbetűsen, markdown-jelek nélkül (az ígéret-méréshez). */
const tisztaSzoveg = md => String(md || '').toLowerCase().replace(/[*_`#>\[\]()]/g, ' ').replace(/[’]/g, "'");

/** Csak az ígéret-fedezet kapui: a cím ne ígérjen olyat, ami a cikkben nincs. A build is ezt hívja. */
export function igeretKapuk(cim, cikkMd) {
  const hibak = [];
  const c = String(cim || '');
  const sz = tisztaSzoveg(cikkMd);
  const cKis = c.toLowerCase();
  const hianyzoEszkoz = eszkozNevek().filter(n => szohatarral(cKis, n) && !szohatarral(sz, n));
  if (hianyzoEszkoz.length) hibak.push(`IGERET_ESZKOZ: a cím olyan eszközt említ, ami a cikkben nincs (${hianyzoEszkoz.join(', ')})`);
  const szavak = [...new Set((cKis.replace(/[’]/g, "'").match(/[a-z][a-z0-9'-]*/g) || [])
    .map(w => w.replace(/'s$/, '').replace(/^'+|'+$/g, ''))
    .filter(w => w.length >= 4 && !TILTOSZO.has(w)))];
  if (szavak.length) {
    const hiany = szavak.filter(w => !szohatarral(sz, w));
    if ((szavak.length - hiany.length) / szavak.length < 0.8) {
      hibak.push(`IGERET_SZAVAK: a cím szavai közül ezek nincsenek a cikkben: ${hiany.join(', ')} — csak azt ígérd, amit a cikk megad`);
    }
  }
  return hibak;
}

/**
 * Az AI keresőcím-javaslatának összes kapuja.
 * @returns {string[]} „KÓD: magyarázat” sorok; üres = mehet
 */
export function seoKapuk({ cim, leiras, cikkMd, regiCim, regiLeiras } = {}) {
  const hibak = [];
  const c = String(cim || '').trim(), l = String(leiras || '').trim();
  if (c.length < CIM_MIN || c.length > CIM_MAX) hibak.push(`CIM_HOSSZ: a cím ${c.length} karakter (${CIM_MIN}–${CIM_MAX} kell)`);
  if (l.length < LEIRAS_MIN || l.length > LEIRAS_MAX) hibak.push(`LEIRAS_HOSSZ: a leírás ${l.length} karakter (${LEIRAS_MIN}–${LEIRAS_MAX} kell)`);
  const mindketto = `${c}\n${l}`;
  if (vanAr(`title: ${c}\ndescription: ${l}`) || /\b\d[\d,.]*\s*credits?\b/i.test(mindketto)) hibak.push('AR: árat vagy kreditszámot tartalmaz — árat nem közlünk');
  if (OSSZEHASONLITAS.test(mindketto)) hibak.push('OSSZEHASONLITAS: összehasonlító vagy felsőfokú szó (best, vs, compared, alternative, top N) — tilos');
  const nagy = (c.match(/\b[A-Z]{3,}\b/g) || []).filter(w => !NAGYBETU_KIVETEL.has(w));
  if (VADASZ.test(mindketto) || nagy.length) hibak.push(`KATTINTASVADASZ: kattintásvadász elem (${nagy.length ? 'CSUPA NAGY: ' + nagy.join(', ') : 'felkiáltójel / bulvár-kifejezés'})`);
  if (SABLON.test(mindketto)) hibak.push('SABLON: sablonos önreklám („with our guide”, „our step-by-step”) — mondd ki, mit kap az olvasó');
  hibak.push(...igeretKapuk(c, cikkMd));
  if (regiCim && c === String(regiCim).trim() && regiLeiras && l === String(regiLeiras).trim()) hibak.push('VALTOZATLAN: ugyanaz, mint a mostani cím és leírás');
  return hibak;
}

/**
 * A buildnek: mi kerüljön a <title>-be és a meta-leírásba ezen a lapon? null = a régi viselkedés.
 * A MOSTANI cikkszövegen újraellenőrzi az ígéretet (ha a cikket azóta átírták — spec 6.6b).
 */
export function keresoFej(meta, { lang, cikkMd, be = SEO_ELES_BE } = {}) {
  const s = meta?.seo;
  if (!be || lang !== 'en' || !s || s.v !== 2 || s.eles === false || s.megtartva) return null;
  if (!s.seo_title || !s.meta_description) return null;
  if (igeretKapuk(s.seo_title, cikkMd).length) return null;
  return { cim: s.seo_title, leiras: s.meta_description };
}

/** A build `withBrand`-je egy helyen: „Cím — AI World HQ”, ha belefér; különben a cím magában. */
export function withBrand(t, siteName = 'AI World HQ', max = 60) {
  const full = `${t} — ${siteName}`;
  return full.length <= max ? full : t;
}

/** A lap fejléce: keresőcím nélkül a régi (title, description), vele a keresőcím + -leírás. */
export function fejCimEsLeiras({ title, description, kereso }) {
  if (!kereso) return { titleTag: cimTag(title), metaDesc: description };
  return { titleTag: cimTag(withBrand(kereso.cim)), metaDesc: kereso.leiras };
}

export default { SEO_ELES_BE, seoKapuk, igeretKapuk, keresoFej, fejCimEsLeiras, withBrand };
