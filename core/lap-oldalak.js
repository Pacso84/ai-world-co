// 📄 PAPÍRLAPOS FEJLÉC — a menüoldalak lapjai (2026-10-28, a lap-hero.js folytatása).
// Minden lap az oldal SAJÁT adatát mutatja (nem díszítés): útmutató-belepillantás,
// a nap eszköze, hónap-mutató, a kvíz kérdései, az aranyszabályok. A build.js adja
// az adatot, itt csak HTML lesz belőle. Tiszta függvények — lap-oldalak.test.js.
import { lapHtml } from './lap-hero.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NYIL = '<span aria-hidden="true">→</span>';

export const LAPO_SZ = {
  en: {
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
