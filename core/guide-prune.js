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
// 🛡️ 2026-11-28 (csalás-figyelő 12. rész): a csalás-hír TELJES leírása a /scams/<slug> lapon van — aki ott olvassa,
// az is a hír olvasója (különben a 90 napos hír-törlés egy olvasott csalás-hírt is kivenne). Útmutató sosincs ott.
const UTVONAL_RX = /^\/(?:hu\/|es\/)?(?:article|scams)\/([^/?#]+)/;
const GYANUS_ARANY = 0.6;
export const CSONKA_SOR = 1000;  // a core/traffic-log.js ennyi útvonalat kér naponta (NAPI_LIMIT; 10-22 előtt 200)
const SZEGENY_ARANY = 0.25;      // ennél kevesebb sor a szokásoshoz képest = hibás naplónap (10-16)
const SZOMSZED_NAP = 7;          // a „szokásos” a nap ±7 napos környezetéből (11-24: nő a forgalom)
// BECSÜLT NAP (10-26, user: „csináld!”): a Cloudflare a 10-23-at órásan is csak mintavételezve adta; kimaradt
// napként a törlést ~januárig leállította volna. A becsült nap jelen lévőnek számít (ami azon a napon olvasott,
// olvasott marad), ugyanazzal a szegény-nap alsó határral, mint a pontos napok — és ablakonként legfeljebb
// ennyi lehet, különben nincs törlés.
export const MAX_BECSULT = 2;
const becsultNap = sorok => Array.isArray(sorok) && sorok.some(r => r && r.becsult);
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
  const hosszak = [], becsultek = [];
  for (let i = 0; i < ablakNap; i++) {
    const nap = datum(Date.parse(ig) - i * NAP);
    if (!Array.isArray(days[nap]) || !days[nap].length) return { ok: false, ok_ok: `hiányzó nap a forgalmi naplóban: ${nap}`, ig };
    // 10-14 végső átnézés: a core/traffic-log.js napi 200 útvonalat kér — a levágott nap olvasott
    // útmutatót is „olvasatlannak" mutatna.
    if (days[nap].length >= CSONKA_SOR) return { ok: false, ok_ok: `a forgalmi napló ${nap} napja csonka lehet (${CSONKA_SOR}+ sor — a Cloudflare-lekérés határa)`, ig };
    if (becsultNap(days[nap])) { becsultek.push([nap, days[nap].length]); continue; }
    hosszak.push([nap, days[nap].length]);
  }
  if (becsultek.length > MAX_BECSULT)
    return { ok: false, ok_ok: `túl sok becsült (mintavételezett) nap az ablakban: ${becsultek.length} (legfeljebb ${MAX_BECSULT}: ${becsultek.map(b => b[0]).join(', ')})`, ig };
  // 10-16 élesben: a Cloudflare egy futásban napi 1 sort adott a szokásos ~40 helyett — az ilyen
  // napon olvasott útmutató is „olvasatlannak" látszana. A szokásos sorszám negyede alatt: nincs törlés.
  // 11-24 élesben: a „szokásos” a nap KÖRNYEZETE (±SZOMSZED_NAP nap mediánja, a becsült napok nélkül), nem az egész
  // ablaké — a forgalom nő (aug. napi 10–20 sor → nov. 50–250), és a 08-29 (10 sor, szomszédai 12/15) az ablak ~41-es
  // mediánja miatt 11-22 óta megállította a hír-törlést. A hibás válasz (1 sor) a saját környezetében is kirí.
  const szokasos = nap => {
    const t0 = Date.parse(nap);
    const kornyek = hosszak.filter(([n]) => n !== nap && Math.abs(Date.parse(n) - t0) <= SZOMSZED_NAP * NAP)
      .map(h => h[1]).sort((a, b) => a - b);
    return kornyek[Math.floor((kornyek.length - 1) / 2)] || 0;   // ALSÓ medián: egy forgalmi ugrás határán se riasszon
  };
  const szegeny = hosszak.find(([nap, n]) => n < SZEGENY_ARANY * szokasos(nap));
  if (szegeny) return { ok: false, ok_ok: `a forgalmi napló ${szegeny[0]} napja gyanúsan kevés sort tartalmaz (${szegeny[1]}, a környező napokon szokásos ~${szokasos(szegeny[0])}) — hibás Cloudflare-válasz lehet`, ig };
  // a becsült napra is ugyanez az alsó határ (független átnézés 10-26): a 10-16-i „1 sor, 100 látogató” hibás
  // válasz különben „becsültként” átmenne, és a csak aznap olvasott cikk törlődne. (A 10-23 becsülten 106 sor.)
  const szegenyB = becsultek.find(([nap, n]) => n < SZEGENY_ARANY * szokasos(nap));
  if (szegenyB) return { ok: false, ok_ok: `a becsült ${szegenyB[0]} nap gyanúsan kevés sort tartalmaz (${szegenyB[1]}, a környező napokon szokásos ~${szokasos(szegenyB[0])})`, ig };
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

/**
 * UTÓTAKARÍTÁSHOZ (2026-10-24): a törölt-listák (hírek + útmutatók) azon slugjai, amelyek MÁR NEM élnek,
 * ismétlés nélkül. A házmester minden futásban kiveszi a rájuk mutató linkeket — ha egy korábbi körben
 * valami kimaradt (10-24: a képre tett link a heti összefoglalóban), a következő pótolja.
 */
export function toroltHalottak(listak, eloSlugok) {
  const ki = [];
  for (const l of Array.isArray(listak) ? listak : []) {
    for (const x of Array.isArray(l) ? l : []) {
      const s = x?.slug;
      if (s && !eloSlugok?.has(s) && !ki.includes(s)) ki.push(s);
    }
  }
  return ki;
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
