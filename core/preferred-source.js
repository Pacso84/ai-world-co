// ===================================================================
// GOOGLE „KEDVENC FORRÁS" GOMB (2026-10-10)
// ===================================================================
// User: a hvg.hu-n látta („Állítsd be, hogy a HVG cikkeit mindig az elsők
// között lásd a Google keresőben") — „ilyet hogyan tudnánk berakni?".
// A Google hivatalos funkciója (Preferred Sources), 2026 tavasza óta minden
// országban és nyelven. Hivatalos mélylink-formátum (Search Central):
//   https://www.google.com/preferences/source?q=<domain>
// Saját dizájn — a Google kifejezetten engedi; a Google-logót NEM használjuk.
// Ez nem lájk/megosztás-kérés (az tiltott), hanem „kövess minket"-jellegű.
// ===================================================================

export const SZOVEG = {
  en: { gomb: 'Add AI World HQ as a preferred source on Google', magyaraz: 'See our stories first in Google Top Stories.' },
  hu: { gomb: 'Add hozzá az AI World HQ-t a kedvenc Google-forrásaidhoz', magyaraz: 'Így a Google Kiemelt hírei között előbb látod a cikkeinket.' },
  es: { gomb: 'Añade AI World HQ como fuente preferida en Google', magyaraz: 'Verás antes nuestras noticias en las Noticias destacadas de Google.' }
};

/** A hivatalos mélylink. Csak a domain (aldomain nélkül, útvonal nélkül) számít. */
export function kedvencUrl(siteUrl) {
  let host = '';
  try { host = new URL(String(siteUrl)).hostname.replace(/^www\./, ''); } catch { host = ''; }
  return host ? `https://www.google.com/preferences/source?q=${encodeURIComponent(host)}` : '';
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A cikk aljára kerülő kis gomb — vagy üres, ha nincs érvényes oldalcím. */
export function kedvencForrasHtml(siteUrl, lang) {
  const url = kedvencUrl(siteUrl);
  if (!url) return '';
  const s = SZOVEG[lang] || SZOVEG.en;
  return `<p class="pref-src"><a class="pref-src__btn" href="${esc(url)}" target="_blank" rel="noopener">⭐ ${esc(s.gomb)}</a>`
    + `<span class="pref-src__note">${esc(s.magyaraz)}</span></p>`;
}

export default { SZOVEG, kedvencUrl, kedvencForrasHtml };
