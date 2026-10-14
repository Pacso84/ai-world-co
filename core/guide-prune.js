// ===================================================================
// NÉZETLEN ÚTMUTATÓK TÖRLÉSE — a DÖNTÉS (2026-10-14, user: „ha 60 napig nem volt
// olvasó, akkor minek tartjuk!" · „ne csak átirányítás legyen, teljes törlés!")
// ===================================================================
// A törlést a Házmester végzi (core/housekeeping.js pruneUnreadGuides), a hírtörlés
// mintájára. Ez a modul csak SZÁMOL, hálózat és lemez nélkül — ezért tesztelhető.
//
// 🔑 A LEGFONTOSABB A HÁROM KAPU. A törlés nem vonható vissza egyszerűen, és egy
// mérési hiba itt MINDENT vinne: ha a forgalmi napló hiányos, vagy megváltozik az
// útvonal-formátum, a gép minden útmutatót „olvasatlannak" látna. Ilyenkor INKÁBB
// NEM TÖRÖL — egy kimaradt nap semmibe nem kerül, a tömeges törlés igen.
//   1. lefedettség: az ablak minden napja megvan, és a napló friss;
//   2. van egyáltalán cikk-látogatás az ablakban (különben a mérés vak);
//   3. a régi útmutatóknak legfeljebb 60%-a lehet jelölt (10-14-én 37% volt).
// Terv: docs/superpowers/specs/2026-10-14-trendkutato-es-utmutato-torles-design.md
// ===================================================================
import { halottLinkTorles } from './guide-links.js';

export const SITE = 'https://aiworldhq.com';
const NAP = 864e5;
const UTVONAL_RX = /^\/(?:hu\/|es\/)?article\/([^/?#]+)/;
const GYANUS_ARANY = 0.6;
export const CSONKA_SOR = 200;   // a core/traffic-log.js ennyi útvonalat kér naponta (limit: 200)
const datum = t => new Date(t).toISOString().slice(0, 10);

/** config.json content.guide_prune → { be, napok, max }. Csak a kifejezett false kapcsol ki. */
export function pruneBeallitas(cfg) {
  const p = cfg?.content?.guide_prune || {};
  // 30 nap alá NEM engedünk: egy elgépelt „6" egy futás alatt mindent vinne.
  const napok = Number.isFinite(p.days) && p.days >= 30 ? p.days : 60;
  const max = Number.isFinite(p.max_per_run) && p.max_per_run > 0 ? Math.min(p.max_per_run, 100) : 25;
  return { be: p.enabled !== false, napok, max };
}

/** Az `ig` napig visszamenő `ablakNap` nap belépői slugonként — a 3 nyelvi útvonal EGYÜTT. */
export function latogatasok(days, ig, ablakNap) {
  const tol = datum(Date.parse(ig) - (ablakNap - 1) * NAP);
  const v = new Map();
  for (const [nap, sorok] of Object.entries(days || {})) {
    if (nap < tol || nap > ig) continue;
    for (const r of Array.isArray(sorok) ? sorok : []) {
      const m = String(r?.path || '').match(UTVONAL_RX);
      if (m) v.set(m[1], (v.get(m[1]) || 0) + (Number(r.visits) || 0));
    }
  }
  return v;
}

/** Megbízható-e a napló az utolsó `ablakNap` napra? (a napló utolsó napjától visszafelé) */
export function lefedettseg(days, now, ablakNap) {
  const napok = Object.keys(days || {}).sort();
  if (!napok.length) return { ok: false, ok_ok: 'üres a forgalmi napló', ig: null };
  const ig = napok[napok.length - 1];
  if (ig < datum(now - 2 * NAP)) return { ok: false, ok_ok: `a forgalmi napló elavult (utolsó nap: ${ig})`, ig };
  for (let i = 0; i < ablakNap; i++) {
    const nap = datum(Date.parse(ig) - i * NAP);
    if (!Array.isArray(days[nap]) || !days[nap].length) return { ok: false, ok_ok: `hiányzó nap a forgalmi naplóban: ${nap}`, ig };
    // 10-14 végső átnézés: a core/traffic-log.js napi 200 útvonalat kér — a levágott nap olvasott
    // útmutatót is „olvasatlannak" mutatna.
    if (days[nap].length >= CSONKA_SOR) return { ok: false, ok_ok: `a forgalmi napló ${nap} napja csonka lehet (${CSONKA_SOR}+ sor — a Cloudflare-lekérés határa)`, ig };
  }
  return { ok: true, ok_ok: '', ig };
}

/**
 * Mely útmutatók törlendők? A `cikkek` CSAK útmutató legyen (a hívó szűr: utmutatoE).
 * @returns {{ok: boolean, ok_ok: string, jeloltek: object[], torlendo: object[]}}
 */
export function torlendok({ cikkek, days, now = Date.now(), ablakNap = 60, max = 25 }) {
  const ures = { jeloltek: [], torlendo: [] };
  const lf = lefedettseg(days, now, ablakNap);
  if (!lf.ok) return { ok: false, ok_ok: lf.ok_ok, ...ures };
  const v = latogatasok(days, lf.ig, ablakNap);
  if (!v.size) return { ok: false, ok_ok: 'a forgalmi naplóban egyetlen cikk-látogatás sincs az ablakban (útvonal-formátum változott?)', ...ures };
  const korHatar = now - ablakNap * NAP;
  const regiek = (cikkek || []).filter(c => {
    const t = Date.parse(c?.published_at || '');
    return c?.slug && Number.isFinite(t) && t <= korHatar;
  });
  const jeloltek = regiek.filter(c => !(v.get(c.slug) > 0))
    .sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)));
  if (regiek.length && jeloltek.length / regiek.length > GYANUS_ARANY) {
    return { ok: false, ok_ok: `a régi útmutatók ${Math.round(100 * jeloltek.length / regiek.length)}%-a lenne törlendő (határ: 60%) — mérési hibára gyanús`, ...ures };
  }
  return { ok: true, ok_ok: '', jeloltek, torlendo: jeloltek.slice(0, max) };
}

/** A slug minden URL-alakja, amivel más cikkek hivatkozhatnak rá. */
export function linkAlakok(slug, site = SITE) {
  const ki = [];
  for (const ny of ['', '/hu', '/es']) ki.push(`${site}${ny}/article/${slug}`, `${ny}/article/${slug}`, `${site}${ny}/article/${slug}.html`, `${ny}/article/${slug}.html`);
  return ki;
}

/** Hány útmutatót töröltünk MA (UTC)? A napi keret a CI napi 3 futására együtt vonatkozik. */
export function maiToroltDb(lista, now = Date.now()) {
  const ma = new Date(now).toISOString().slice(0, 10);
  return (Array.isArray(lista) ? lista : []).filter(x => String(x?.at || '').startsWith(ma)).length;
}

/** A törölt útmutatókra mutató linkek kivétele egy markdownból — a linkszöveg marad. */
export function linkekKi(md, slugok, site = SITE) {
  return halottLinkTorles(md, (slugok || []).flatMap(s => linkAlakok(s, site)));
}

/** A törölt-lista frissítése: az új bejegyzések be, a `megorzesNap`-nál régebbiek ki. */
export function toroltListaFrissit(lista, ujSlugok, now = Date.now(), megorzesNap = 30) {
  const hatar = now - megorzesNap * NAP;
  const regi = (Array.isArray(lista) ? lista : []).filter(x => x?.slug && Date.parse(x.at) >= hatar);
  const at = new Date(now).toISOString();
  return [...regi, ...(ujSlugok || []).map(slug => ({ slug, at }))];
}

/** IndexNow-hoz: az utóbbi `oraHatar` órában törölt útmutatók URL-jei, nyelvi előtagonként. */
export function toroltUrlek(lista, site, nyelvek, now = Date.now(), oraHatar = 48) {
  const hatar = now - oraHatar * 3600e3;
  const ki = [];
  for (const x of Array.isArray(lista) ? lista : []) {
    if (!x?.slug || !(Date.parse(x.at) >= hatar)) continue;
    for (const lp of nyelvek || []) ki.push(`${site}${lp}/article/${x.slug}`);
  }
  return ki;
}
