// ===================================================================
// ŐRSZEM-FRISSESSÉG — lefagyott-e valamelyik őrszem? (2026-08-29)
// ===================================================================
// MI A BAJ: a `core/daily-report.js` NYOLC őrszem-állapotfájlt olvas be
// (`memory/*-guard.json`), de mindegyikből CSAK a `problems` tömböt — az `at`
// időbélyeget EGYIKBŐL SEM nézi meg.
//
// 🔑 EZÉRT A LEFAGYOTT ŐRSZEM ZÖLDNEK LÁTSZIK. Ha egy őrszem elhasal, a
// lemezen ott marad az ELŐZŐ futás `problems: []`-je, és a riport azt
// „minden rendben"-ként olvassa. Konkrét út odáig, a kódból:
//   • `core/seo-guard.js:337` — bukott buildnél VISSZATÉR az állapot kiírása előtt
//   • `core/live-guard.js` main() — kivételnél szintén nem ír
// Ugyanaz a mintázat, ami a témaismétlés-őrnél HÓNAPOKIG rejtve maradt: a
// „nem volt dolga" és a „elromlott" kívülről egyformán néz ki.
//
// ⚠️ A DÖNTÉS AZÉRT VAN ITT: a `daily-report.js` feltétel nélkül hívja a
// `main()`-t, tehát importálni sem lehet — tesztelni sem. Ugyanaz a
// szétválasztás, mint a `report-window.js`-nél és a `pipeline-watchdog.js`-nél.
// ===================================================================

/**
 * Ennél régebbi állapotfájl már gyanús.
 *
 * A pipeline 8 óránként fut (00/08/16 UTC), és a pipeline-őrkutya legfeljebb
 * ~11 órás rést enged. 26 óra tehát legalább HÁROM kihagyott futást jelent —
 * jóval a normál ingadozás fölött, de még nem kell hozzá napokat várni.
 */
export const ELAVULT_ORA = 26;

const ORA = 3600e3;

/**
 * Melyik őrszem nem frissült túl régóta?
 *
 * @param {Record<string, {at?: string}>} guards  név → beolvasott állapotfájl
 * @param {number} [now]
 * @returns {Array<{nev: string, kor: number|null}>}  `kor` = null, ha ISMERETLEN
 */
export function elavultOrszemek(guards, now = Date.now()) {
  if (!guards || typeof guards !== 'object' || Array.isArray(guards)) return [];
  const ki = [];
  for (const [nev, g] of Object.entries(guards)) {
    const t = Date.parse(g?.at ?? '');
    // ⚠️ A HIÁNYZÓ IDŐBÉLYEG NEM „FRISS". Ha nem derül ki, mikor futott, azt
    // KÜLÖN jelöljük (`kor: null`) — se néma jóváhagyás, se kitalált szám.
    if (!Number.isFinite(t)) { ki.push({ nev, kor: null }); continue; }
    const kor = (now - t) / ORA;
    // A JÖVŐBELI bélyeg (óra-eltérés) magától kiesik: negatív kor sosem nagyobb
    // a küszöbnél. Volt itt egy külön `if (kor < 0) continue;` sor — a mutációs
    // próba mutatta ki, hogy HALOTT KÓD: a törlésével egyetlen teszt sem bukott.
    // Egy komment, ami nem létező védelmet állít, pont az a hibaosztály, amit
    // ez a modul is javítani hivatott.
    if (kor > ELAVULT_ORA) ki.push({ nev, kor });
  }
  return ki;
}

/**
 * Egyetlen riport-sor a lefagyott őrszemekről.
 *
 * ⚠️ ⚠️-vel kezdődik, mert a `core/report-noise.js` vészjelzés-mintája erre
 * illeszkedik — ezt a sort semmilyen zajszűrő nem némíthatja el.
 */
export function frissessegSor(elavultak) {
  if (!Array.isArray(elavultak) || !elavultak.length) return '';
  const reszek = elavultak.map(x => x.kor === null
    ? `${x.nev} (nincs időbélyeg)`
    : `${x.nev} (${Math.round(x.kor)} órája)`);
  return `⚠️ LEFAGYOTT ŐRSZEM: ${reszek.join(' · ')} — a leletük ELAVULT, `
    + 'a „nincs probléma" tőlük most nem bizonyíték.';
}
