// ===================================================================
// HIRDETÉS-KAPCSOLÓ — Google AdSense (2026-10-01)
// ===================================================================
// A user döntése: „senki nem támogat! rakjunk ki reklámokat, jó lenne, ha
// eltartaná magát". Előtte kimérve és a user elé téve: ~1600 oldalmegtekintés/hó
// mellett ~$2–6/hó várható, a Google $100-nál fizet ki. A választott változat
// a LEGKEVÉSBÉ KOCKÁZATOS: EGY hirdetés, a cikk LEGALJÁN, a szöveg után.
//
// ⚠️ MIÉRT CSAK EGY, ÉS MIÉRT ALUL: a forgalom 82%-a Facebook, és a Meta
// visszaveszi az elérést azoktól a linkektől, amelyek hirdetéssel teli
// oldalra visznek. Az automatikus hirdetéseket (Auto ads) az AdSense-ben
// KI kell hagyni — azok annyit raknak ki, amennyit a Google jónak lát.
//
// KÉT SZAKASZ, a config.json `website.ads` blokkjából:
//   1) enabled + client  → fejléc-kód + ads.txt: a Google ebből igazolja az
//      oldalt, de LÁTHATÓ hirdetés még nincs (nincs egység).
//   2) + slot            → a cikkek alján megjelenik az egyetlen egység.
// Hibás azonosító NEM kapcsol be semmit: egy elgépelés ne vigyen ki törött
// kódot 3000 oldalra.
//
// Az azonosító (ca-pub-…) NEM titok: minden hirdetéses oldal HTML-jében
// látszik, ezért mehet a nyilvános configba.
// ===================================================================

const KLIENS_MINTA = /^ca-pub-\d{16}$/;
const SLOT_MINTA = /^\d{6,20}$/;

/** A hirdetés jelölése — az olvasó lássa, hogy ez nem a mi tartalmunk. */
export const CIMKE = { en: 'Advertisement', hu: 'Hirdetés', es: 'Publicidad' };

/** A config.json `website` blokkjából: be van-e kapcsolva, és mivel. */
export function hirdetesBeallitas(web) {
  const a = (web && web.ads) || {};
  const kliens = String(a.client || '').trim();
  const slot = String(a.slot || '').trim();
  const be = a.enabled === true && KLIENS_MINTA.test(kliens);
  return { be, kliens: be ? kliens : '', slot: be && SLOT_MINTA.test(slot) ? slot : '' };
}

/** A <head>-be: a Google betöltője + a fiók-igazoló meta. */
export function fejKod(h) {
  if (!h || !h.be) return '';
  return `<meta name="google-adsense-account" content="${h.kliens}">\n`
    + `  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${h.kliens}" crossorigin="anonymous"></script>`;
}

// ── ÜRES DOBOZ NEM MARADHAT (2026-10-14, user: „csak töltve látszódjon") ──
// Élőben mérve: a személyazonosság-igazolásig a Google 280 px-t lefoglalt, de hirdetést
// nem küldött, így minden cikk alján üres „ADVERTISEMENT” sáv állt. A Google az <ins>
// `data-ad-status` attribútumában jelzi az eredményt („filled” / „unfilled”) — de igazolás
// előtt SEMMIT nem ír, ezért kell az időkorlát is. A dobozt NEM rejtjük el előre: rejtett
// helyre a Google nem kér hirdetést. Csak a címke és a vonal vár a megérkezésre (style.css).
/** Ennyi ideig vár a látogató képernyőjén a hirdetésre, mielőtt az üres dobozt elrejti. */
export const URES_VARAS_MS = 8000;

/** Az EGYETLEN hirdetés-egység a cikk aljára — vagy üres, ha nincs egység. */
export function hirdetesBlokk(h, lang) {
  if (!h || !h.be || !h.slot) return '';
  const cimke = CIMKE[lang] || CIMKE.en;
  return `<aside class="ad-slot" aria-label="${cimke}">
      <p class="ad-slot__label">${cimke}</p>
      <ins class="adsbygoogle" style="display:block" data-ad-client="${h.kliens}" data-ad-slot="${h.slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>
      <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
      <script>(function(a){if(!a||!window.MutationObserver)return;var i=a.querySelector('ins.adsbygoogle');if(!i)return;`
    + `function nez(){var s=i.getAttribute('data-ad-status');if(s==='filled'){a.classList.add('ad-slot--tele');a.classList.remove('ad-slot--ures');}else if(s==='unfilled'){a.classList.add('ad-slot--ures');}}`
    + `new MutationObserver(nez).observe(i,{attributes:true,attributeFilter:['data-ad-status']});nez();`
    + `function var_(){setTimeout(function(){if(!a.classList.contains('ad-slot--tele'))a.classList.add('ad-slot--ures');},${URES_VARAS_MS});}`
    + `if(window.IntersectionObserver){var o=new IntersectionObserver(function(e){if(e[0]&&e[0].isIntersecting){o.disconnect();var_();}});o.observe(a);}else var_();`
    + `})(document.currentScript&&document.currentScript.parentNode);</script>
    </aside>`;
}

/** Az ads.txt tartalma (a Google hivatalos sora; az f08c… a Google állandó azonosítója). */
export function adsTxt(h) {
  if (!h || !h.be) return '';
  return `google.com, ${h.kliens.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`;
}
