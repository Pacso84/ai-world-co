// /scams gyűjtőoldal (2026-11-27; terv: docs/superpowers/plans/2026-11-21-csalas-figyelo.md 8. rész,
// spec: docs/superpowers/specs/2026-11-21-csalas-figyelo-design.md 8.6).
//
// Sorrend: papírlapos fejléc (a build adja) → Latest scam alerts (legújabb elöl, kicsinyített rajzolt kép +
// egymondatos leírás) → 1 hirdetés → Know the signs (a 9. részben hivatalos forrásból átnézett útmutatók) →
// Report a scam doboz (ic3.gov, reportfraud.ftc.gov + országfüggetlen mondat) → MI-címke (EU AI Act).
// Nincs töltelék: 0 hírrel is teljes (útmutatók + bejelentő doboz).
//
// Az oldal CSAK bekapcsolt CSALAS_FIGYELO_BE mellett készül (website/build.js) — kikapcsolva nincs menüpont,
// lábléc-link, scams.html és sitemap-sor sem.

import { lapHtml } from './lap-hero.js';
import { BEJELENTES, ORSZAGFUGGETLEN } from './csalas-vedekezes.js';

// A 9. részben (11-21/22) en/hu/es hivatalos forrásból átnézett útmutatók (fact_human_ok). A „check if a
// suspicious message is a scam by pasting it into an AI” (09-17) NINCS köztük: alapötletét hivatalos forrás
// nem támasztja alá, 11-22-én 301-gyel a phishing-útmutatóra került (dbd48101).
export const CSALAS_UTMUTATOK = Object.freeze([
  'how-to-spot-a-phishing-email-or-scam-text-before-you-click',
  'how-to-spot-an-ai-scam-call-fake-email-or-deepfake-voice-today',
  'how-to-spot-a-deepfake-video-or-voice-clone-before-you-share-it',
  'how-to-spot-ai-scams-deepfakes-and-fake-content',
  'how-to-fact-check-a-suspicious-text-or-link-before-forwarding-it',
]);

// Feliratok (a build a UI-táblába fésüli; a nem angol oldalon angol mondat nincs — core/sablon-nyelv.test.js).
export const CSALAS_UI = Object.freeze({
  en: {
    scNav: 'Scams', scTitle: 'Scam alerts', scBadge: 'Scam alert',
    scTag: 'New scams aimed at everyday people, taken from official warnings — each with a clearly labeled example, the warning signs, and what to do.',
    scHeroBadge: 'From official warnings · updated daily',
    scLatest: 'Latest scam alerts', scSigns: 'Know the signs',
    scSignsLead: 'Step-by-step guides, checked against official consumer-protection advice.',
    scReport: 'Report a scam', scReportLead: 'In the US, report it here:', scCountry: ORSZAGFUGGETLEN,
    scEmpty: 'No new scam alerts right now. The guides below show the most common tricks.',
    scMore: 'See all scam alerts', scImgAlt: 'example of a scam message, not real', scLapFej: 'Latest example',
    scAi: 'The scam alerts on this page are written by AI from official warnings. They passed automated fact and quality checks, and our editor spot-checks published articles every day.',
    scFull: 'Full details and how to protect yourself',
    scEarlier: 'Earlier official warnings from 2026', scWarnFrom: '{f} warning',
  },
  hu: {
    scNav: 'Csalások', scTitle: 'Csalás-figyelő', scBadge: 'Csalásriasztás',
    scTag: 'Új, hétköznapi embereket célzó csalások hivatalos figyelmeztetések alapján — mindegyikhez jelölt példa, a gyanús jelek és a teendők.',
    scHeroBadge: 'Hivatalos figyelmeztetésekből · naponta frissül',
    scLatest: 'Legfrissebb csalásriasztások', scSigns: 'Ismerd fel a jeleket',
    scSignsLead: 'Lépésről lépésre útmutatók, hivatalos fogyasztóvédelmi tanácsok alapján átnézve.',
    scReport: 'Csalás bejelentése', scReportLead: 'Az Egyesült Államokban itt jelentheted:',
    scCountry: 'Az Egyesült Államokon kívül fordulj a helyi rendőrséghez vagy a fogyasztóvédelmi hatósághoz.',
    scEmpty: 'Most nincs új csalásriasztás. Az alábbi útmutatók a leggyakoribb trükköket mutatják be.',
    scMore: 'Az összes csalásriasztás', scImgAlt: 'példa egy csalóüzenetre, nem valódi', scLapFej: 'Legutóbbi példa',
    scAi: 'Az oldalon lévő csalásriasztásokat mesterséges intelligencia írta hivatalos figyelmeztetések alapján. Automatikus tény- és minőség-ellenőrzésen mentek át, és a szerkesztőnk naponta szúrópróbaszerűen átnézi a megjelent cikkeket.',
    scFull: 'Teljes leírás és védekezés',
    scEarlier: 'Korábbi hivatalos figyelmeztetések 2026-ból', scWarnFrom: '{f}-figyelmeztetés',
  },
  es: {
    scNav: 'Estafas', scTitle: 'Alertas de estafas', scBadge: 'Alerta de estafa',
    scTag: 'Nuevas estafas dirigidas a personas comunes, a partir de avisos oficiales: cada una con un ejemplo señalado, las señales de alerta y qué hacer.',
    scHeroBadge: 'De avisos oficiales · se actualiza cada día',
    scLatest: 'Últimas alertas de estafas', scSigns: 'Aprende a reconocer las señales',
    scSignsLead: 'Guías paso a paso, revisadas con los consejos oficiales de protección al consumidor.',
    scReport: 'Denuncia una estafa', scReportLead: 'En EE. UU., denúnciala aquí:',
    scCountry: 'Fuera de EE. UU., contacta con la policía local o con la autoridad de protección al consumidor.',
    scEmpty: 'Ahora no hay alertas nuevas. Las guías de abajo muestran los trucos más comunes.',
    scMore: 'Ver todas las alertas de estafas', scImgAlt: 'ejemplo de un mensaje de estafa, no es real', scLapFej: 'Último ejemplo',
    scAi: 'Las alertas de esta página fueron escritas por IA a partir de avisos oficiales. Pasaron controles automáticos de datos y calidad, y nuestro editor comprueba cada día una muestra de los artículos publicados.',
    scFull: 'Descripción completa y cómo protegerte',
    scEarlier: 'Avisos oficiales anteriores de 2026', scWarnFrom: '{f} · aviso oficial',
  },
});

// A bejelentő helyek neve a megjelenítés nyelvén (az URL ugyanaz — core/csalas-vedekezes.js BEJELENTES).
const BEJELENTES_NEV = {
  hu: ['Az FBI internetes bűnügyi panaszközpontja (IC3)', 'Az FTC bejelentő oldala (ReportFraud.ftc.gov)'],
  es: ['Centro de Denuncias de Delitos en Internet del FBI (IC3)', 'Portal de denuncias de la FTC (ReportFraud.ftc.gov)'],
};
export function bejelentesNyelven(lang) {
  const nevek = BEJELENTES_NEV[lang];
  return BEJELENTES.map((b, i) => ({ nev: nevek ? nevek[i] : b.nev, url: b.url }));
}

// A hírkártya/cikk borítója: a hu/es oldalon a nyelvi 16:9 kép (core/csalas-kepek.js), ha elkészült —
// a <slug>.jpg angol feliratú. `letezik(relUt)` a website/assets/images alatti útra felel.
export function csalasBorito(a, lang, letezik) {
  if (lang !== 'en') {
    const ut = `csalas/${a.slug}-${lang}-16x9.jpg`;
    if (letezik(ut)) return ut;
  }
  return a.image;
}

// ── 12. rész (2026-11-28, user: „a csalásokat a híreknél is lehozzuk! de a teljes leírást és védekezést az új
// oldalon fejtjük ki!”) ── A Hírek közötti /article/<slug> a RÖVID változat: minden, ami a 3. H2 („How to protect
// yourself”) ELŐTT áll — H1, „In short”, bevezető, „What's happening”, „Warning signs” a példával és a 3 jellel.
// A teljes cikk a /scams/<slug> oldalon. POZÍCIÓ szerint vágunk, nem fejléc-szöveg szerint: a hu/es fejléc fordított.
// Kevesebb mint 3 H2 (nem sablonos szöveg) → a teljes szöveg marad (nincs csonka hír).
const H2_SOR = /^##\s+\S/;
export function csalasRovidMd(md) {
  const sorok = String(md ?? '').split('\n');
  let h2 = 0, vege = -1, kodban = false;
  for (let i = 0; i < sorok.length; i++) {
    if (/^\s*```/.test(sorok[i])) kodban = !kodban;
    if (kodban || !H2_SOR.test(sorok[i])) continue;
    if (++h2 === 3) { vege = i; break; }
  }
  if (vege < 0) return String(md ?? '');
  return sorok.slice(0, vege).join('\n').replace(/\s+$/, '') + '\n';
}

/** A csalás-hír teljes oldalának útja (a nyelvi előtag NÉLKÜL) — build, sitemap, IndexNow, /scams kártyák. */
export const csalasTeljesUt = slug => `scams/${slug}`;

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const legujabbElol = hirek => [...hirek].sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')));
const kepImg = (h, sz) => `<img src="${esc(h.kep)}" alt="${esc(`${h.title} — ${sz.scImgAlt}`)}" width="1080" height="1350" loading="lazy" decoding="async">`;

function bejelentoLista(bejelentes) {
  return `<ul class="sc-report__list">${bejelentes.map(b => `<li><a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.nev)}</a></li>`).join('')}</ul>`;
}

/** A papírlapos fejléc „lapja”: a legutóbbi képes csalás-hír 4:5 képe; ha nincs, a bejelentő lista. */
export function csalasFejlecLap({ hirek = [], sz, bejelentes }) {
  const kepes = legujabbElol(hirek).find(h => h.kep);
  if (kepes) {
    return lapHtml({ ikon: '🛡️', fej: sz.scLapFej,
      torzs: `<a class="sc-lap-kep" href="${esc(csalasTeljesUt(kepes.slug))}">${kepImg(kepes, sz)}</a>` });
  }
  return lapHtml({ ikon: '🛡️', fej: sz.scReport,
    torzs: `${bejelentoLista(bejelentes)}<p class="sc-lap-orszag">${esc(sz.scCountry)}</p>` });
}

/** A /scams oldal törzse (a pageShell bodyContent-je). `datumSzoveg` az ISO dátumot írja ki a lap nyelvén. */
export function csalasOldalHtml({ hirek = [], utmutatok = [], sz, bejelentes, hirdetes = '', fejlec = '', datumSzoveg = iso => String(iso || '').slice(0, 10) }) {
  // 🗂️ archív (2026-11-28, core/csalas-archiv.js): a `forras`-os elem a 2026-ban már közzétett figyelmeztetés —
  // külön szakaszba, a friss hírek alá, „FBI warning · <eredeti dátum>” címkével.
  const kartya = h => `<li class="sc-card"><a href="${esc(csalasTeljesUt(h.slug))}">
        ${h.kep ? `<span class="sc-card__kep">${kepImg(h, sz)}</span>` : ''}
        <span class="sc-card__badge">🛡️ ${esc(sz.scBadge)}</span>
        <h3 class="sc-card__t">${esc(h.title)}</h3>
        ${h.summary ? `<p class="sc-card__s">${esc(h.summary)}</p>` : ''}
        ${h.datum ? `<time datetime="${esc(h.datum)}">${h.forras ? `${esc(sz.scWarnFrom.replace('{f}', h.forras))} · ` : ''}${esc(datumSzoveg(h.datum))}</time>` : ''}
      </a></li>`;
  const friss = legujabbElol(hirek.filter(h => !h.forras));
  const korabbi = legujabbElol(hirek.filter(h => h.forras));
  const kartyak = friss.length
    ? `<ul class="sc-cards">${friss.map(kartya).join('')}</ul>`
    : `<p class="sc-empty">${esc(sz.scEmpty)}</p>`;
  const korabbiSzakasz = korabbi.length
    ? `<section class="sc-sec sc-earlier"><h2>${esc(sz.scEarlier)}</h2><ul class="sc-cards">${korabbi.map(kartya).join('')}</ul></section>`
    : '';
  const utm = utmutatok.length
    ? `<section class="sc-sec sc-signs"><h2>${esc(sz.scSigns)}</h2><p class="sc-sec__lead">${esc(sz.scSignsLead)}</p>
      <ul class="sc-guides">${utmutatok.map(u => `<li><a href="article/${esc(u.slug)}">${esc(u.title)} →</a></li>`).join('')}</ul></section>`
    : '';
  return `${fejlec}
  <section class="sc-sec sc-latest"><h2>${esc(sz.scLatest)}</h2>${kartyak}</section>
  ${korabbiSzakasz}
  ${hirdetes}
  ${utm}
  <section class="sc-report"><h2>${esc(sz.scReport)}</h2><p>${esc(sz.scReportLead)}</p>${bejelentoLista(bejelentes)}
    <p class="sc-report__country">${esc(sz.scCountry)}</p></section>
  <p class="ai-disclosure">${esc(sz.scAi)}</p>`;
}
