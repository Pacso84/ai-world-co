// ===================================================================
// FORGATÓKÖNYV-ŐR — szabad-e küldeni erre a Make-forgatókönyvre?
// ===================================================================
//
// A MEGOLDOTT PROBLÉMA (mérve 2026-07-27, megismételve 08-09):
// A Make webhookja MINDIG „Accepted" 200-at ad, ha a cím létezik — akkor is,
// ha a forgatókönyv nincs elmentve, ki van kapcsolva, vagy nincs benne
// kimeneti modul. A poszterünk ilyenkor sikernek veszi, `posted_*: true`
// jelölést ír a fájlba, és a cikk SOHA TÖBBÉ nem kerül sorra.
// Így veszett el 38 pin júliusban.
//
// 2026-08-09-én élesben újra láttuk: egy frissen másolt webhook-cím
// „Accepted"-et adott, miközben a fiókban EGYETLEN forgatókönyv sem volt
// mögötte — a Make ugyanis a sorba teszi az adatot, akkor is, ha senki nem
// dolgozza fel.
//
// ⚠️ ELTÉRÉS a régi pinterest-poster viselkedésétől: ott hiba esetén a
// „küldj inkább" elv volt. ÚJ csatornánál ez rossz: a téves küldés VÉGLEGES
// veszteség, a blokkolás viszont visszafordítható (beállítod az azonosítót,
// és megy tovább). Ezért ha a forgatókönyv-azonosító hiányzik, NEM küldünk.
// ===================================================================

// Ezek önmagukban nem visznek sehova posztot — segéd-/vezérlőmodulok.
const HELPER_PACKAGES = ['gateway', 'http', 'json', 'tools', 'builtin', 'util'];

/**
 * Tiszta döntés. Nem hálózik, nem olvas fájlt — ezért tesztelhető.
 * @param {object|null} scenario  a Make /scenarios/<id> válaszának scenario mezője
 * @param {string} requiredPackage  a kimeneti modul csomagneve (pl. 'threads')
 * @param {boolean} hasId  be van-e állítva a forgatókönyv-azonosító
 * @param {boolean} [apiFailed]  a Make API nem válaszolt / hibázott
 * @param {boolean} [noToken]  nincs MAKE_API_TOKEN
 * @returns {{send: boolean, reason: string}}
 */
export function scenarioVerdict({ scenario, requiredPackage, hasId, apiFailed, noToken }) {
  if (!hasId) {
    return {
      send: false,
      reason: 'nincs beállítva a forgatókönyv-azonosító, így nem tudom ellenőrizni, '
        + 'hogy a poszt tényleg kijut-e — inkább nem küldök (a sor érintetlen marad)'
    };
  }
  // Az azonosító megvan → a csatornát egyszer már felvetted. Egy monitorozási
  // hiba (hálózat, jogosultság) ne állítsa meg a működő terjesztést.
  if (noToken) return { send: true, reason: 'nincs MAKE_API_TOKEN — az ellenőrzés kimarad' };
  if (apiFailed || !scenario) return { send: true, reason: 'a Make API nem válaszolt — az ellenőrzés kimarad' };

  if (scenario.isActive === false || scenario.isPaused === true) {
    return {
      send: false,
      reason: 'a forgatókönyv INAKTÍV vagy szünetel — kapcsold vissza: '
        + 'eu1.make.com → Scenarios → kapcsoló a sor végén'
    };
  }
  const pkgs = scenario.usedPackages || [];
  if (!pkgs.includes(requiredPackage)) {
    const helpersOnly = pkgs.filter(p => !HELPER_PACKAGES.includes(p));
    return {
      send: false,
      reason: `hiányzik a kimeneti modul (${requiredPackage}) — csak ezek vannak benne: `
        + `[${pkgs.join(', ') || '—'}]${helpersOnly.length ? '' : ' (mind segédmodul)'}. `
        + 'A webhook 200-at adna, de a poszt SEHOVA nem kerülne ki.'
    };
  }
  return { send: true, reason: 'a forgatókönyv aktív és van benne kimeneti modul' };
}
