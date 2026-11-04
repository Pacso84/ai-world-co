// ===================================================================
// FEED-LINKEK — a cikk törzse a hírolvasóban is működjön
// ===================================================================
//
// 2026-08-09: a teljes cikkszöveg bekerült a feedbe (<content:encoded>), mert
// a kivonatos feedet a Flipboard elutasította volna. A hírolvasóban viszont a
// cikk a SAJÁT domainjükön jelenik meg, tehát a relatív "/tools" rájuk
// mutatna, nem ránk — ezért abszolutizálunk.
//
// 2026-08-10: kiderült, hogy ezzel .html-es, ÁTIRÁNYÍTÓ URL-ek kerültek ki.
// A SEO-őrszem jelezte is ("feed.xml: 10 db .html-es saját URL"), de a lelet
// csak az állapotfájlban ült. A törzs linkjei a LEMEZEN .html-esek — ez
// szándékos döntés —, a kanonikus alakunk viszont .html NÉLKÜLI, és a feedbe
// az való: minden .html-es link egy felesleges 301-en át visz a cikkhez.
//
// ⚠️ A .html-t CSAK a saját URL-jeinkről vágjuk le. A hivatkozott hivatalos
// források közt van .html-es cím (gyártói dokumentáció); ha ahhoz nyúlnánk,
// halott linket gyártanánk — amit a truth-gate jogosan blokkolna.
// ===================================================================

/**
 * A cikk-HTML linkjeit abszolúttá teszi, és a saját cikk-URL-ekről levágja
 * a .html végződést. A CDATA-lezárót ("]]>") kettévágja, hogy az XML ne
 * törjön el — egy nyers ]]> miatt a hírolvasók az EGÉSZ feedet eldobják.
 *
 * @param {string} html   a cikk törzse (relatív linkekkel)
 * @param {string} siteUrl  pl. 'https://aiworldhq.com'
 * @returns {string}
 */
export function absolutizeFeedLinks(html, siteUrl) {
  const s = String(html || '');
  if (!s) return '';
  const base = String(siteUrl || '').replace(/\/+$/, '');

  return s
    // 1) relatív → abszolút (csak a saját, "/"-rel kezdődő útvonalak)
    .replace(/\b(href|src)="\/([^"]*)"/g, `$1="${base}/$2"`)
    // 2) a SAJÁT cikk-URL-ekről le a .html — a külsőkhöz nem nyúlunk,
    //    mert a minta a saját domainhez van kötve
    .replace(new RegExp(`(href="${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"]*)\\.html"`, 'g'), '$1"')
    // 3) a CDATA-szakasz lezárása nem kerülhet nyersen a tartalomba
    .split(']]>').join(']]]]><![CDATA[>');
}

export default { absolutizeFeedLinks };
