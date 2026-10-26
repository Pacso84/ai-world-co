// core/elakadas-html.js — a „🔧 Ha elakadsz” doboz MEGJELENÍTÉSE az útmutatókban (2026-10-26, 2b bekötés, 3. lépés).
//
// A doboz tartalmát a core/elakadas-gen.js írja a content/elakadas/<slug>.json fájlba (Task 1); ez a tiszta modul
// csak betölti és HTML-lé alakítja. Hálózat nélküli, ingyenes, a build is ezt hívja.
//
// A MÉRCE IRÁNYA: a hiányzó doboz jobb, mint a hibás. Ezért:
//   • fájl nélkül / sérült fájllal / kill-switch mellett SEMMI sem jelenik meg (az oldal bájtra a régi);
//   • a megjelenítés MÉG EGYSZER ellenőrzi a forrást (engedelyezett): csak hivatalos súgó-link kerülhet ki;
//   • kevesebb mint 2 jó tétel = nincs doboz (egyetlen „elakadás” nem doboz, hanem találgatás);
//   • minden szöveget ez a modul escape-el, a hívónak nem kell rá gondolnia (a felirat is escape-elődik);
//   • a CSS-osztályok mind g- előtagúak: a kimenet-őr műfaji (útmutató-specifikus) elemnek veszi.
// Fájlalak: { slug, probalva, doboz: null | { keszult, enHash, forrasok: {url: cím}, en: Item[], hu: Item[]|null, es: Item[]|null } }

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engedelyezett } from './sugo-index.js';
import { ELAKADAS_BE } from './elakadas.js';

const MIN_TETEL = 2;
const NYELVEK = ['en', 'hu', 'es'];

/** HTML-escape (a build saját escapeHtml-jétől függetlenül: ez a modul önmagában is biztonságos). */
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Nem üres szöveg-e. */
function szoveg(x) { return typeof x === 'string' && x.trim() !== ''; }

/**
 * A slug doboz-fájlja, vagy null (hiányzó / sérült / nem objektum fájl → null, SOHA nem dob).
 * @param {string} ROOT  a projekt gyökere
 * @param {string} slug
 */
export function elakadasBetolt(ROOT, slug) {
  try {
    if (!szoveg(slug) || /[\\/]|\.\./.test(slug)) return null;   // útvonal-szökés ellen
    const j = JSON.parse(readFileSync(join(ROOT, 'content', 'elakadas', slug + '.json'), 'utf-8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : null;
  } catch { return null; }
}

// A szolgáltató neve a súgó gazdagépéből (a core/sugo-index.js ENGEDELY listája). Nem angol oldalon a link szövege
// ebből készül: a súgócikk eredeti, ANGOL címe nem kerülhet magyar/spanyol oldalra („nem angol oldalon nincs angol mondat”).
const SZOLGALTATO = {
  'help.openai.com': 'OpenAI', 'support.claude.com': 'Anthropic', 'support.anthropic.com': 'Anthropic',
  'support.google.com': 'Google', 'support.microsoft.com': 'Microsoft', 'support.apple.com': 'Apple',
  'help.mistral.ai': 'Mistral', 'www.amazon.com': 'Amazon'
};
const FORRAS_SZOVEG = { hu: n => `${n} súgó (angol nyelvű)`, es: n => `Ayuda de ${n} (en inglés)` };

/** A forrás-link szövege és (csak angolul) a súgócikk címe. */
function forrasLink(url, forrasok, lang) {
  let host = '';
  try { host = new URL(url).hostname; } catch { /* a hívó már engedelyezett()-et ellenőrzött */ }
  if (lang !== 'en') {
    const nev = SZOLGALTATO[host];
    return { szoveg: nev && FORRAS_SZOVEG[lang] ? FORRAS_SZOVEG[lang](nev) : host, cim: '' };
  }
  const c = forrasok && typeof forrasok === 'object' ? forrasok[url] : '';
  return szoveg(c) ? { szoveg: c.trim(), cim: c.trim() } : { szoveg: host, cim: '' };
}

/**
 * A doboz HTML-je, vagy '' (kill-switch ki / nincs doboz / a nyelv hiányzik / < 2 engedélyezett forrású tétel).
 * @param {object|null} fajl  elakadasBetolt kimenete
 * @param {'en'|'hu'|'es'} lang
 * @param {{cim: string, miert: string, mitTegyel: string, forras: string}} felirat
 * @param {boolean} [be]  kill-switch (teszthez)
 */
export function elakadasHtml(fajl, lang, felirat, be = ELAKADAS_BE) {
  if (!be || !fajl || !fajl.doboz || typeof fajl.doboz !== 'object' || !felirat) return '';
  if (!NYELVEK.includes(lang)) return '';
  const lista = fajl.doboz[lang];
  if (!Array.isArray(lista)) return '';
  const forrasok = fajl.doboz.forrasok;
  const jok = lista.filter(it => it && szoveg(it.symptom) && szoveg(it.why) && szoveg(it.fix) &&
    szoveg(it.source) && engedelyezett(it.source));
  if (jok.length < MIN_TETEL) return '';
  const tetelek = jok.map(it => {
    const l = forrasLink(it.source, forrasok, lang);
    return `<div class="g-elakad__t"><h3>${esc(it.symptom)}</h3>` +
      `<p><b>${esc(felirat.miert)}</b> ${esc(it.why)}</p>` +
      `<p><b>${esc(felirat.mitTegyel)}</b> ${esc(it.fix)}</p>` +
      `<p class="g-elakad__forras">${esc(felirat.forras)} <a href="${esc(it.source)}" rel="noopener" target="_blank"${l.cim ? ` title="${esc(l.cim)}"` : ''}>${esc(l.szoveg)}</a></p></div>`;
  }).join('');
  return `<section class="g-elakad"><h2 class="g-elakad__cim">${esc(felirat.cim)}</h2>${tetelek}</section>`;
}

export default { elakadasBetolt, elakadasHtml };
