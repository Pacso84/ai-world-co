// ===================================================================
// AMAZON PARTNERLINK — PRÓBA (2026-10-09)
// ===================================================================
// A user ötlete: „kézzelfogható MI-eszközök, megvásárlási lehetőséggel".
// Kimérve (10-09): az olvasók 57%-a USA → Amazon.com; Xiaomi-nak nincs
// US-programja. A PRÓBA: a meglévő Alexa+ útmutatók (19 db, az eszköz
// `tool: 'Alexa+'`) aljára EGY jelölt Echo-link + kattintásszámláló, 4 hét.
//
// ⚠️ AZ AMAZON SZABÁLYAI (hivatalos oldalakon ellenőrizve, 10-09):
//   - A link KÖZVETLENÜL az amazon.com-ra mutat. Átirányító (köztes oldalon
//     át menő) link vásárlása NEM jár jutalékkal → a kattintást NEM
//     átirányítással számoljuk, hanem a háttérben (app.js → Worker /aff-hit).
//   - Árat NEM írunk ki (csak API-ból + időbélyeggel volna szabad).
//   - Kötelező mondat: „As an Amazon Associate I earn from qualifying purchases."
//   - PDF-be, nyomtatott anyagba Amazon-link NEM kerülhet.
//
// KAPCSOLÓ: config.json `website.affiliate.amazon` { enabled, tag }.
// Hibás vagy hiányzó azonosító NEM kapcsol be semmit (mint a core/ads.js).
// Az azonosító (…-20) NEM titok: minden linkben látszik.
//
// A LÁNC (a PDF-számláló mintájára, core/pdf-download.js):
//   website/build.js          → partnerDoboz() / partnerJelzes() a cikkbe
//   website/assets/app.js     → kattintáskor POST Worker /aff-hit {p}
//   telegram-worker aff-hit   → KV `aff:<UTC-nap>:<p>` (affKulcs)
//   core/daily-report.js      → partnerKattintasSor() a napi riportba
// TISZTA modul (nincs fs, nincs hálózat): a Worker is importálja.
// ===================================================================

/** Az amerikai Amazon partner-azonosító alakja (pl. aiworldhq-20). */
export const TAG_MINTA = /^[a-z0-9][a-z0-9-]{1,40}-20$/;

/**
 * Melyik útmutatóhoz melyik termékcsoport. A kulcs a cikk `tool` mezője
 * (a hivatalos név, website/tool-links.json). Keresés-link, nem termékoldal:
 * így nem kell kitalálni termékazonosítót, és nem avul el egy modellváltáskor.
 */
export const TERMEKEK = {
  'Alexa+': { id: 'echo', kereses: 'amazon echo' }
};
const TERMEK_IDK = new Set(Object.values(TERMEKEK).map(t => t.id));

export const SZOVEG = {
  en: {
    cimke: 'Affiliate link',
    szoveg: 'Alexa+ also runs on Amazon’s Echo speakers and displays.',
    gomb: 'See Echo devices on Amazon',
    kotelezo: 'As an Amazon Associate I earn from qualifying purchases.',
    magyaraz: 'If you buy through this link, AI World HQ gets a small commission. It costs you nothing extra.',
    jelzes: 'This guide contains an affiliate link (Amazon).'
  },
  hu: {
    cimke: 'Partnerlink',
    szoveg: 'Az Alexa+ az Amazon Echo hangszóróin és kijelzőin is fut.',
    gomb: 'Echo eszközök az Amazonon',
    kotelezo: 'As an Amazon Associate I earn from qualifying purchases.',
    magyaraz: 'Ha ezen a linken át vásárolsz, az AI World HQ kis jutalékot kap. Neked ez nem kerül többe.',
    jelzes: 'Ez az útmutató partnerlinket tartalmaz (Amazon).'
  },
  es: {
    cimke: 'Enlace de afiliado',
    szoveg: 'Alexa+ también funciona en los altavoces y pantallas Echo de Amazon.',
    gomb: 'Ver dispositivos Echo en Amazon',
    kotelezo: 'As an Amazon Associate I earn from qualifying purchases.',
    magyaraz: 'Si compras a través de este enlace, AI World HQ recibe una pequeña comisión. No te cuesta nada más.',
    jelzes: 'Esta guía contiene un enlace de afiliado (Amazon).'
  }
};

/** A config.json `website` blokkjából: be van-e kapcsolva, és melyik azonosítóval. */
export function partnerBeallitas(web) {
  const a = (web && web.affiliate && web.affiliate.amazon) || {};
  const tag = String(a.tag || '').trim();
  const be = a.enabled === true && TAG_MINTA.test(tag);
  return { be, tag: be ? tag : '' };
}

/** A cikkhez tartozó termékcsoport — vagy null. */
export function termekFor(cikk) {
  return (cikk && Object.prototype.hasOwnProperty.call(TERMEKEK, cikk.tool)) ? TERMEKEK[cikk.tool] : null;
}

/** A közvetlen amazon.com keresés-link a partner-azonosítóval. */
export function amazonUrl(termek, tag) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(termek.kereses).replace(/%20/g, '+')}&tag=${encodeURIComponent(tag)}`;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sz = lang => SZOVEG[lang] || SZOVEG.en;

/** A doboz a lépések után — vagy üres, ha ki van kapcsolva / nem ilyen útmutató. */
export function partnerDoboz(beall, cikk, lang) {
  const t = termekFor(cikk);
  if (!beall || !beall.be || !t) return '';
  const s = sz(lang);
  return `<aside class="aff" data-aff="${t.id}" aria-label="${esc(s.cimke)}">
      <p class="aff__label">🛒 ${esc(s.cimke)}</p>
      <p class="aff__text">${esc(s.szoveg)}</p>
      <a class="aff__btn" href="${esc(amazonUrl(t, beall.tag))}" target="_blank" rel="sponsored nofollow noopener">${esc(s.gomb)} ↗</a>
      <p class="aff__note">${esc(s.kotelezo)} ${esc(s.magyaraz)}</p>
    </aside>`;
}

/** Rövid jelzés a cikk TETEJÉN (a jogi szabályunk: a cikk elején is jelölni kell). */
export function partnerJelzes(beall, cikk, lang) {
  if (!beall || !beall.be || !termekFor(cikk)) return '';
  return `<p class="aff-note">🛒 ${esc(sz(lang).jelzes)}</p>`;
}

/** A KV-kulcs: aff:<UTC-nap>:<termék-id>. Ismeretlen termékre null. */
export function affKulcs(p, now = Date.now()) {
  const id = String(p || '');
  if (!TERMEK_IDK.has(id)) return null;
  return `aff:${new Date(now).toISOString().slice(0, 10)}:${id}`;
}

const nap = (now, vissza) => new Date(now - vissza * 864e5).toISOString().slice(0, 10);

/**
 * A napi riport sora a Worker `__aff` exportjából ({ 'YYYY-MM-DD': { id: db } }
 * vagy { error: true }). A PDF-sor szabályai: 7 nap csend → nincs sor; a
 * lekérdezés hibája KÜLÖN mondat (az „elromlott" ≠ „senki nem kattintott").
 */
export function partnerKattintasSor(aff, now = Date.now()) {
  if (!aff || typeof aff !== 'object') return '';
  if (aff.error) return '🛒 Amazon-kattintások: a számlálót nem sikerült lekérdezni.';
  const osszeg = o => Object.values(o || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  let het = 0;
  for (let i = 1; i <= 7; i++) het += osszeg(aff[nap(now, i)]);
  if (het === 0) return '';
  return `🛒 Amazon-kattintás tegnap: ${osszeg(aff[nap(now, 1)])} · 7 nap: ${het}`;
}

export default { TAG_MINTA, TERMEKEK, SZOVEG, partnerBeallitas, termekFor, amazonUrl, partnerDoboz, partnerJelzes, affKulcs, partnerKattintasSor };
