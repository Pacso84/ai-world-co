// ===================================================================
// „KÖVETKEZŐ ÚTMUTATÓ" — egyetlen kiemelt ajánlat az utolsó lépés után (2026-09-29)
// ===================================================================
//
// MIÉRT: a mérés szerint (project-aiworld-olvasasi-melyseg-bizonyitekok) aki
// 2 oldalt olvas, az ~3× nagyobb eséllyel tér vissza (22% vs 8%). A lap végén
// eddig is volt „Kapcsolódó" lista, de a GYIK UTÁN — messze attól a ponttól,
// ahol az olvasó épp végzett. Ez a kártya KÖZVETLENÜL az utolsó lépés után áll.
//
// A választás (sorrendben):
//   1. UGYANAZ AZ ESZKÖZ (az olvasó épp azt tanulja) — a rokonsági rangsor
//      szerint az első, különben a legfrissebb;
//   2. különben a rangsor első útmutatója.
// Kimarad: maga a cikk és a két beékelt ajánló (rel[0], rel[1]) — ugyanazt
// ne ajánljuk harmadszor. (A szintet NEM nézzük: 467-ből 464 „beginner".)
// Vészkapcsoló: config.json → website.next_guide = false.
// ===================================================================

const kis = (s) => String(s || '').trim().toLowerCase();

/**
 * @param {object} a       az aktuális cikk ({slug, tool, isGuide})
 * @param {Array}  rel     a cikk rokonsági rangsora (RELATED.get(a.file)), legerősebb elöl
 * @param {Array}  osszes  az összes cikk
 * @returns {object|null}
 */
export function kovetkezoUtmutato(a, rel = [], osszes = []) {
  if (!a || !a.slug) return null;
  const R = Array.isArray(rel) ? rel.filter(Boolean) : [];
  const kizart = new Set([a.slug, R[0]?.slug, R[1]?.slug].filter(Boolean));
  const jo = (x) => x && x.isGuide && x.slug && !kizart.has(x.slug);

  const eszkoz = kis(a.tool);
  if (eszkoz) {
    const rokon = R.find(x => jo(x) && kis(x.tool) === eszkoz);
    if (rokon) return rokon;
    const tobbi = (Array.isArray(osszes) ? osszes : [])
      .filter(x => jo(x) && kis(x.tool) === eszkoz)
      .sort((p, q) => String(q.publishedAt || '').localeCompare(String(p.publishedAt || '')));
    if (tobbi.length) return tobbi[0];
  }
  return R.find(jo) || null;
}

export default { kovetkezoUtmutato };
