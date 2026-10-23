// ===================================================================
// „🔥 OLVASÓINK KEDVENCE” — AUTOMATIKUS KIEMELÉS (2026-10-23)
// ===================================================================
//
// MIÉRT: a terv eredetileg Telegram-gombos „Szerkesztő ajánlja” jelölést
// írt (E rész); a user: „a kiemelés az olvasott cikkeknél legyen automatikus,
// akkor nem nekem kell eldönteni … azt ajánljuk, aminek van megtekintése,
// legalább a top 10-et!” → az elmúlt 30 nap 10 legolvasottabb útmutatója.
//
// A FELIRAT SZÁNDÉKOSAN NEM „szerkesztő ajánlja”: nem ember választotta
// (hitelesség-szabály) — az „Olvasóink kedvence” pontosan igaz.
//
// Adat: memory/traffic-log.json `days` ({ 'YYYY-MM-DD': [{ path, visits }] },
// a CI írja, robotszűrővel). A /hu/ NEM számít — az főleg a tulaj böngészése
// (memória-szabály: a /hu/-t a mérésből kizárjuk). Hibavédelem: ha a 30 napos
// ablakban 14-nél kevesebb adatos nap van, nincs kiemelés (két hétnél rövidebb
// naplóból nem következtetünk).
// ===================================================================

export const KEDVENC_DB = 10;
const NAP = 864e5;
const UT = /^\/(?:es\/)?article\/([^/?#]+)/;   // /hu/ szándékosan kimarad

/** Az utolsó `napok` nap legolvasottabb útmutatói (legfeljebb `db`, csak >0 olvasóval), csökkenő sorrendben. */
export function olvasoiKedvencek(days, utmutatoSlugok, { now = Date.now(), napok = 30, db = KEDVENC_DB, minNap = 14 } = {}) {
  if (!days || typeof days !== 'object') return [];
  const tol = new Date(now - napok * NAP).toISOString().slice(0, 10);
  const olvaso = new Map();
  let adatosNap = 0;
  for (const [nap, sorok] of Object.entries(days)) {
    if (nap < tol || !Array.isArray(sorok)) continue;
    adatosNap++;
    for (const r of sorok) {
      const m = String(r?.path || '').match(UT);
      if (!m || !utmutatoSlugok?.has(m[1])) continue;
      olvaso.set(m[1], (olvaso.get(m[1]) || 0) + (Number(r.visits) || 0));
    }
  }
  if (adatosNap < minNap) return [];
  return [...olvaso.entries()].filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, db).map(([s]) => s);
}

export default { olvasoiKedvencek, KEDVENC_DB };
