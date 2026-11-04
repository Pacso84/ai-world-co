// 📄 PAPÍRLAPOS FEJLÉC — a menüoldalak lapjai (2026-10-28, a lap-hero.js folytatása).
// Minden lap az oldal SAJÁT adatát mutatja (nem díszítés): útmutató-belepillantás,
// a nap eszköze, hónap-mutató, a kvíz kérdései, az aranyszabályok. A build.js adja
// az adatot, itt csak HTML lesz belőle. Tiszta függvények — lap-oldalak.test.js.
import { lapHtml } from './lap-hero.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NYIL = '<span aria-hidden="true">→</span>';

export const LAPO_SZ = {
  en: {
    pdfPecset: 'Free PDF', oldal: n => `${n} pp.`, egyFajl: 'All in one file', letolt: 'Download the full collection',
    keresFej: 'What people searched this week', ma: 'Today', megvalaszolva: n => `${n} answered`, trendBadge: 'Updated every day · last 7 days',
    promptFej: 'A prompt to fill in', promptPecset: 'Copy-ready', utmutatobol: 'From the guide:',
    ujUtmutato: d => `Newest guide · ${d}`, ujMa: 'New today', ujFriss: 'Fresh', megnyit: 'Open the guide',
    tobbLepes: n => `+ ${n} more step${n > 1 ? 's' : ''}`,
    utmutatoDb: n => `Step-by-step · ${n} guides`,
    eszkozDb: n => `Step-by-step · ${n} AI tools`, napEszkoze: 'Tool of the day', eszkUtm: n => `${n} step-by-step guide${n > 1 ? 's' : ''}`,
    eszkPecset: n => `${n} guide${n > 1 ? 's' : ''}`, hivatalos: 'Official sites:', kezdd: 'Start with', mind: n => `All ${n} guides`,
    temaElso: 'Start with this guide',
    archBadge: 'News archive', honapok: 'Stories by month', hirDb: n => `${n} stories`,
    rolunk: 'About us', elsoNap: 'Day one',
    kviz: '1-minute quiz', kerdesek: n => `The ${n} questions`, perc: 'About 1 minute', valasz: n => `${n} answers to pick from`, kezdes: 'Start with question 1'
  },
  hu: {
    pdfPecset: 'Ingyenes PDF', oldal: n => `${n} old.`, egyFajl: 'Mind egy fájlban', letolt: 'A teljes gyűjtemény letöltése',
    keresFej: 'Amit a héten kerestek', ma: 'Ma', megvalaszolva: n => `${n} megválaszolva`, trendBadge: 'Naponta frissül · az elmúlt 7 nap',
    promptFej: 'Kitölthető prompt', promptPecset: 'Másolásra kész', utmutatobol: 'Az útmutatóból:',
    ujUtmutato: d => `Legújabb útmutató · ${d}`, ujMa: 'Ma új', ujFriss: 'Friss', megnyit: 'Az útmutató megnyitása',
    tobbLepes: n => `+ még ${n} lépés`,
    utmutatoDb: n => `Lépésről lépésre · ${n} útmutató`,
    eszkozDb: n => `Lépésről lépésre · ${n} AI-eszköz`, napEszkoze: 'A nap eszköze', eszkUtm: n => `${n} lépésről lépésre útmutató`,
    eszkPecset: n => `${n} útmutató`, hivatalos: 'Hivatalos oldalak:', kezdd: 'Kezdd ezzel', mind: n => `Összes útmutató: ${n}`,
    temaElso: 'Kezdd ezzel az útmutatóval',
    archBadge: 'Hírarchívum', honapok: 'Cikkek hónaponként', hirDb: n => `${n} cikk`,
    rolunk: 'Rólunk', elsoNap: 'Első nap',
    kviz: '1 perces kvíz', kerdesek: n => `A kvíz ${n} kérdése`, perc: 'Kb. 1 perc', valasz: n => `${n} válasz közül választhatsz`, kezdes: 'Kezdd az 1. kérdéssel'
  },
  es: {
    pdfPecset: 'PDF gratis', oldal: n => `${n} pág.`, egyFajl: 'Todo en un archivo', letolt: 'Descarga la colección completa',
    keresFej: 'Lo que se buscó esta semana', ma: 'Hoy', megvalaszolva: n => `${n} respondidas`, trendBadge: 'Se actualiza cada día · últimos 7 días',
    promptFej: 'Un prompt para completar', promptPecset: 'Listo para copiar', utmutatobol: 'De la guía:',
    ujUtmutato: d => `Guía más reciente · ${d}`, ujMa: 'Nueva hoy', ujFriss: 'Reciente', megnyit: 'Abrir la guía',
    tobbLepes: n => `+ ${n} paso${n > 1 ? 's' : ''} más`,
    utmutatoDb: n => `Paso a paso · ${n} guías`,
    eszkozDb: n => `Paso a paso · ${n} herramientas de IA`, napEszkoze: 'Herramienta del día', eszkUtm: n => `${n} guía${n > 1 ? 's' : ''} paso a paso`,
    eszkPecset: n => `${n} guía${n > 1 ? 's' : ''}`, hivatalos: 'Sitios oficiales:', kezdd: 'Empieza con', mind: n => `Todas las guías de ${n}`,
    temaElso: 'Empieza con esta guía',
    archBadge: 'Archivo de noticias', honapok: 'Artículos por mes', hirDb: n => `${n} artículos`,
    rolunk: 'Sobre nosotros', elsoNap: 'Primer día',
    kviz: 'Test de 1 minuto', kerdesek: n => `Las ${n} preguntas`, perc: 'Aprox. 1 minuto', valasz: n => `${n} respuestas para elegir`, kezdes: 'Empieza con la pregunta 1'
  }
};
export const lapoSz = lang => LAPO_SZ[lang] || LAPO_SZ.en;

/** Útmutató-belepillantás: cím + az első 4 lépés címe + „még N lépés” + link. */
export function utmutatoLapHtml({ lang, fej, pecset, href, cim, lepesek = [] }) {
  const s = lapoSz(lang);
  const lat = lepesek.slice(0, 4), tobb = lepesek.length - lat.length;
  return lapHtml({ fej, pecset, torzs: `<p class="lh-lap-cim"><a href="${esc(href)}">${esc(cim)}</a></p>
      ${lat.length ? `<ol class="lh-ma lh-ma--suru">${lat.map(l => `<li><span class="lh-t">${esc(l)}</span></li>`).join('')}</ol>` : ''}
      ${tobb > 0 ? `<p class="lh-tobb">${esc(s.tobbLepes(tobb))}</p>` : ''}
      <a class="lh-lap-link" href="${esc(href)}">${esc(s.megnyit)} ${NYIL}</a>` });
}

/** A nap eszköze: a dátumból számolt index (a napi 3 build ugyanazt adja). */
export function napIndex(n, datum = new Date()) {
  if (!n) return -1;
  return Math.floor(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()) / 864e5) % n;
}

/** Eszköz-lap: { nev, logo (kész, megbízható SVG), db, hivatalos:[{href, felirat}], elso:{href, cim}, horgony } */
export function eszkozLapHtml({ lang, nev, logo = '', db, hivatalos = [], elso = null, horgony }) {
  const s = lapoSz(lang);
  return lapHtml({ fej: s.napEszkoze, pecset: s.eszkPecset(db), torzs: `<div class="lh-eszk"><span class="lh-eszk-logo" aria-hidden="true">${logo}</span><div><p class="lh-eszk-n">${esc(nev)}</p><p class="lh-eszk-db">${esc(s.eszkUtm(db))}</p></div></div>
      ${hivatalos.length ? `<p class="lh-hiv">${esc(s.hivatalos)} ${hivatalos.map(h => `<a href="${esc(h.href)}" target="_blank" rel="noopener">${esc(h.felirat)} ↗</a>`).join(' ')}</p>` : ''}
      ${elso ? `<p class="lh-kezdd">${esc(s.kezdd)}<a href="${esc(elso.href)}">${esc(elso.cim)}</a></p>` : ''}
      <a class="lh-lap-link" href="#${esc(horgony)}">${esc(s.mind(nev))} ${NYIL}</a>` });
}

/** Hónap-mutató (archívum): [{ id, nev, db }] */
export function honapLapHtml({ lang, honapok }) {
  const s = lapoSz(lang);
  const ossz = honapok.reduce((a, m) => a + m.db, 0);
  return lapHtml({ fej: s.honapok, pecset: s.hirDb(ossz), torzs: `<ol class="lh-toc">${honapok.map(m => `<li><a class="lh-toc-t" href="#${esc(m.id)}">${esc(m.nev)}</a><span class="lh-toc-n">${m.db}</span></li>`).join('')}</ol>` });
}
export const honapId = kulcs => `m-${kulcs}`;   // „2026-10” → „m-2026-10”

/** A kvíz kérdései: [{ t, db }] */
export function kerdesLapHtml({ lang, kerdesek }) {
  const s = lapoSz(lang);
  return lapHtml({ fej: s.kerdesek(kerdesek.length), pecset: s.perc, torzs: `<ol class="lh-ma lh-ma--suru">${kerdesek.map(q => `<li><span class="lh-t">${esc(q.t)}<small>${esc(s.valasz(q.db))}</small></span></li>`).join('')}</ol>` });
}

/** Szöveges lap (pl. az aranyszabályok): a meglévő, lefordított szövegből. */
export function szovegLapHtml({ fej, szoveg, pecset }) {
  return lapHtml({ fej, pecset, torzs: `<p class="lh-szo-def">${esc(szoveg)}</p>` });
}

// A témaoldalak címkéjének ikonja (core/topics.js azonosítói szerint).
export const TEMA_IKON = { safe: '🛡️', money: '💰', home: '🏠', create: '🎨', learn: '📚', work: '💼', explain: '💡', automate: '⚙️' };
export const nagyKezdo = s => (s ? s[0].toUpperCase() + s.slice(1) : '');

/** PDF-tartalomjegyzék: tetelek [{ nev, href, oldal }], egyben { oldal, href } — pontozott vezetővel. */
export function pdfLapHtml({ lang, fej, tetelek, egyben = null }) {
  const s = lapoSz(lang);
  const nev = t => t.href ? `<a class="lh-toc-t" href="${esc(t.href)}" target="_blank" rel="noopener">${esc(t.nev)}</a>` : `<span class="lh-toc-t">${esc(t.nev)}</span>`;
  return lapHtml({ ikon: 'PDF', fej, pecset: s.pdfPecset, torzs: `<ol class="lh-toc">${tetelek.map(t => `<li>${nev(t)}<span class="lh-toc-n">${esc(s.oldal(t.oldal))}</span></li>`).join('')}</ol>
      ${egyben ? `<p class="lh-toc-ossz"><span>${esc(s.egyFajl)}</span><span>${esc(s.oldal(egyben.oldal))}</span></p>
      ${egyben.href ? `<a class="lh-lap-link" href="${esc(egyben.href)}" target="_blank" rel="noopener">${esc(s.letolt)} ${NYIL}</a>` : ''}` : ''}` });
}
/** A csomagnév rövid alakja a tartalomjegyzékbe („Work and Email: The AI Pack” → „Work and Email”). */
export const csomagRovid = cim => String(cim || '').split(/:\s| — /)[0].trim();

const KERES_IKON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
/** A hét keresései (Felkapott): tetelek [{ kerdes, nap (YYYY-MM-DD), napFelirat }]; a mai nap „Ma”; a lap a nap horgonyára ugrik. */
export function keresesLapHtml({ lang, tetelek, ma, megvalaszolva }) {
  const s = lapoSz(lang);
  return lapHtml({ fej: s.keresFej, pecset: s.megvalaszolva(megvalaszolva), torzs: `<ul class="lh-q">${tetelek.map(t => `<li><a href="#d-${esc(t.nap)}">${KERES_IKON}<span class="lh-q-t">${esc(t.kerdes)}</span><span class="lh-q-d${t.nap === ma ? ' lh-q-d--ma' : ''}">${esc(t.nap === ma ? s.ma : t.napFelirat)}</span></a></li>`).join('')}</ul>` });
}

/** Kitölthető prompt a lapon: a szöveg chat-buborékban, a [helyek] kiemelve; alatta a forrás-útmutató. */
export function promptLapHtml({ lang, szoveg, cim, href }) {
  const s = lapoSz(lang);
  const buborek = esc(szoveg).replace(/\[[^\]\n]{2,80}\]/g, m => `<span class="pl-fill">${m}</span>`);
  return lapHtml({ fej: s.promptFej, pecset: s.promptPecset, torzs: `<div class="pl-bubble"><pre class="pl-text">${buborek}</pre></div>
      <p class="lh-lap-meta">${esc(s.utmutatobol)} <a href="${esc(href)}">${esc(cim)}</a></p>` });
}
