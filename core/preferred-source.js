// ===================================================================
// GOOGLE „KEDVENC FORRÁS" KÁRTYA (2026-10-10)
// ===================================================================
// User: a hvg.hu-n látta („Állítsd be, hogy a HVG cikkeit mindig az elsők
// között lásd a Google keresőben") — „ilyet hogyan tudnánk berakni?".
// A Google hivatalos funkciója (Preferred Sources), 2026 tavasza óta minden
// országban és nyelven. Hivatalos mélylink-formátum (Search Central):
//   https://www.google.com/preferences/source?q=<domain>
// Saját dizájn — a Google kifejezetten engedi; a Google-logót NEM használjuk.
// Ez nem lájk/megosztás-kérés (az tiltott), hanem „kövess minket"-jellegű.
//
// 10-10 user: „lehetne feltűnőbb és szebb — így nem akad meg rajta a szem".
// → a cikk ELEJÉRE került (a cím/alcím/AI-jelölés alá), négyszínű kerettel,
// csillag-jelvénnyel és kék gombbal; az EGÉSZ kártya kattintható.
// ===================================================================

export const SZOVEG = {
  en: { cim: 'See AI World HQ first on Google', alcim: 'Add us as a preferred source and our stories show up higher in Google’s Top Stories.', gomb: 'Add on Google' },
  hu: { cim: 'Lásd elsőként az AI World HQ cikkeit a Google-ban', alcim: 'Jelölj meg kedvenc forrásként, és a Google Kiemelt hírei között előrébb látod a cikkeinket.', gomb: 'Hozzáadás' },
  es: { cim: 'Ve primero AI World HQ en Google', alcim: 'Añádenos como fuente preferida y verás nuestras noticias antes en las Noticias destacadas de Google.', gomb: 'Añadir en Google' }
};

/** A hivatalos mélylink. Csak a domain (aldomain nélkül, útvonal nélkül) számít. */
export function kedvencUrl(siteUrl) {
  let host = '';
  try { host = new URL(String(siteUrl)).hostname.replace(/^www\./, ''); } catch { host = ''; }
  return host ? `https://www.google.com/preferences/source?q=${encodeURIComponent(host)}` : '';
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Saját csillag (nem a Google-logó): egyszerű ötágú alak, a jelvény négyszínű háttér előtt.
const CSILLAG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">'
  + '<path fill="#fff" d="M12 2.6l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.6l-5.4 2.9 1-6.1L3.2 9.1l6.1-.9z"/></svg>';

/** A cikk elejére kerülő kártya — vagy üres, ha nincs érvényes oldalcím. */
export function kedvencForrasHtml(siteUrl, lang) {
  const url = kedvencUrl(siteUrl);
  if (!url) return '';
  const s = SZOVEG[lang] || SZOVEG.en;
  return `<a class="pref-src" href="${esc(url)}" target="_blank" rel="noopener">`
    + `<span class="pref-src__badge">${CSILLAG}</span>`
    + `<span class="pref-src__txt"><strong class="pref-src__cim">${esc(s.cim)}</strong>`
    + `<span class="pref-src__alcim">${esc(s.alcim)}</span></span>`
    + `<span class="pref-src__btn">${esc(s.gomb)}</span></a>`;
}

export default { SZOVEG, kedvencUrl, kedvencForrasHtml };
