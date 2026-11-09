// 📬 HÍRLEVÉL-FELIRATKOZÓ DOBOZ (2026-10-30, user: „csináljuk”). A 07-12-i, bevált doboz visszaépítve (d403b617 előtt),
// de most VAN mögötte küldés: core/hirlevel.js (Kit). A doboz a Worker /subscribe végpontjára küld (api.aiworldhq.com),
// a Kit-kulcs a Workerben marad — SOHA nem kerül a böngészőbe. Dupla megerősítés: a Kit küld megerősítő levelet.
//
// ⚠️ 07-27 TANULSÁG: a doboz HETEKIG kint volt, a küldés pedig sosem indult el — 2–3 feliratkozó soha nem kapott semmit.
// Ezért a doboz CSAK akkor jelenik meg, ha a küldés is be van kapcsolva (config.newsletter.enabled === true ÉS
// signup === true) — a kettő nem válhat szét.
// CSAK ANGOL oldalon: a levél angol; magyar/spanyol olvasónak nem ígérünk angol levelet a saját nyelvén kérve.
// Olvasói élmény: egy csendes doboz a cikk alján (nem felugró), honeypot spam-védelem, alert nélkül.
//
// 📬 SÁV A FŐOLDAL TETEJÉN (2026-11-09, user: „fel kéne hívni rá a figyelmet!” → „elég csak a főoldalra! ez így
// sok”): a doboz 10-30 óta csak a lapok LEGALJÁN volt — ~2000 látogatásból 0 külső feliratkozás. Mostantól a
// főoldal tetején (a fejléc-blokk alatt) egy vékony, NEM felugró sáv van; a cikkek alján a doboz marad.
// ⛔ A cikkek tetejére és a menübe NEM kell (user elvetette, túl sok) — ne tedd vissza.

const SZ = {
  cim: 'The week’s AI, in your inbox',
  szoveg: 'One friendly email every Sunday — the 5 stories that mattered, in plain English. No spam, unsubscribe anytime.',
  ph: 'your@email.com', gomb: 'Sign me up',
  kesz: 'Almost done! Check your inbox for a confirmation email.',
  hiba: 'That didn’t work — mind trying again?',
  savCim: 'The 5 AI stories that mattered —', savSzoveg: 'one free, plain-English email every Sunday.'
};
export const VEGPONT = 'https://api.aiworldhq.com/subscribe';

/** A config.json gyökeréből: megjelenhet-e a doboz? (küldés ÉS feliratkozás is be kell legyen kapcsolva) */
export function dobozBe(cfg) {
  const n = (cfg && cfg.newsletter) || {};
  return n.enabled === true && n.signup === true;
}

/** A közös űrlap + kliens-szkript (a doboz és a sáv is ezt használja; a szkript a saját szülő-elemén belül keres). */
function urlap() {
  return `<form class="nl__form">
        <input type="text" name="web" class="nl__hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <input type="email" name="email" required placeholder="${SZ.ph}" aria-label="Email address">
        <button type="submit">${SZ.gomb}</button>
      </form>
      <p class="nl__msg" role="status" hidden></p>
      <script>(function(b){if(!b)return;var f=b.querySelector('.nl__form'),m=b.querySelector('.nl__msg');`
    + `f.addEventListener('submit',function(e){e.preventDefault();var g=f.querySelector('button'),em=(f.email.value||'').trim();if(!em)return;g.disabled=true;`
    + `fetch('${VEGPONT}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,web:f.web.value})})`
    + `.then(function(r){if(!r.ok)throw 0;f.hidden=true;m.textContent=${JSON.stringify(SZ.kesz)};m.hidden=false;})`
    + `.catch(function(){g.disabled=false;m.textContent=${JSON.stringify(SZ.hiba)};m.hidden=false;});});`
    + `})(document.currentScript&&document.currentScript.parentNode);</script>`;
}

/** A doboz HTML-je (cikkek alja) — üres, ha nincs bekapcsolva vagy nem angol az oldal. */
export function hirlevelDoboz(be, lang) {
  if (!be || lang !== 'en') return '';
  return `<section class="nl" aria-labelledby="nl-t">
      <h2 class="nl__t" id="nl-t">📬 ${SZ.cim}</h2>
      <p class="nl__p">${SZ.szoveg}</p>
      ${urlap()}
    </section>`;
}

/** Vékony sáv a főoldal tetejére — üres, ha nincs bekapcsolva vagy nem angol az oldal. */
export function hirlevelSav(be, lang) {
  if (!be || lang !== 'en') return '';
  return `<aside class="nls" id="newsletter" aria-label="Newsletter">
      <p class="nls__t">📬 <strong>${SZ.savCim}</strong> ${SZ.savSzoveg}</p>
      ${urlap()}
    </aside>`;
}
