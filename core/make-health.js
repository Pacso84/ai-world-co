// ===================================================================
// MAKE-EGÉSZSÉG  —  hány poszt bukott el, és miért
// ===================================================================
//
// MIÉRT KELL:
// A poszter a webhook HTTP 200-ára írja rá a "kiküldve" jelölést — de az
// csak annyit jelent, hogy a Make ÁTVETTE a kérést, nem azt, hogy a poszt
// megjelent. Ha a kimeneti modul (facebook-pages / pinterest:createPin)
// elbukik, a poszt SOHA nem jelenik meg, és a rendszer nem tud róla:
// a sorunk kiküldöttnek hiszi, és többé nem próbálja.
//
// Élesben mérve 2026-08-05: a Pinterest 8 futása bukott el egyetlen nap
// alatt ("Sorry we could not fetch the image"), mind "kiküldve"-ként
// jelölve nálunk. A hibát a USER kérdésére találtam meg, kézzel — pont
// ezt a kézi nyomozást váltja ki ez a modul.
//
// A NAPI RIPORT ebből egyetlen sort ír, és CSAK akkor, ha van bukás.
// ===================================================================

// A Make futás-státuszai: 1 = sikeres. Minden más bukás — a 2
// ("befejezetlen") is, mert a kimeneti modul ott sem futott le; élesben
// pontosan ezen a státuszon állt le a Pinterest-forgatókönyv.
const SUCCESS = 1;

/**
 * Egy forgatókönyv futásainak összegzése egy időablakra.
 *
 * @param {Array}  logs     a Make /scenarios/{id}/logs válasza
 * @param {string} sinceIso ettől az időponttól számolunk
 * @returns {{ok:number, failed:number, topReason:string}}
 */
export function summarizeRuns(logs, sinceIso) {
  const since = Date.parse(sinceIso);
  let ok = 0, failed = 0;
  const reasons = new Map();

  for (const row of (logs || [])) {
    // A Make a bukás mellé külön "warning" sort is ír, status mező NÉLKÜL.
    // Az nem külön futás — ha beleszámolnánk, duplán jelentenénk.
    if (typeof row?.status !== 'number') continue;
    const at = Date.parse(row.timestamp || '');
    if (!Number.isFinite(at) || at < since) continue;

    if (row.status === SUCCESS) { ok++; continue; }
    failed++;
    const msg = String(row.error?.message || row.detail?.reason || '').trim();
    if (msg) reasons.set(msg, (reasons.get(msg) || 0) + 1);
  }

  const topReason = [...reasons].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  return { ok, failed, topReason };
}

// A Make hibaüzenete nyers JSON-t tartalmaz:
//   [400] {"code":1,"message":"Sorry we could not fetch the image."}
// A riportba az EMBERI mondat kell, nem a burok.
function humanReason(raw) {
  if (!raw) return '';
  const m = String(raw).match(/"message"\s*:\s*"([^"]+)"/);
  const text = m ? m[1] : String(raw).replace(/^\[\d+\]\s*/, '');
  return text.replace(/\s+/g, ' ').trim().slice(0, 90);
}

/**
 * Egyetlen riport-sor — vagy null, ha nincs mit jelenteni.
 * Hibátlan napról SEMMIT nem írunk: a riport akkor hasznos, ha a benne
 * lévő sorok mind jelentenek valamit.
 */
export function describeFailures(name, summary) {
  if (!summary || !summary.failed) return null;
  const why = humanReason(summary.topReason);
  const total = summary.ok + summary.failed;
  return `⚠️ ${name}: ${summary.failed}/${total} poszt ELBUKOTT ma`
    + (why ? ` — "${why}"` : '')
    + '. A Make hibasorában megvan, újrajátszható.';
}
