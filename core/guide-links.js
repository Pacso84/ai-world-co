// ===================================================================
// HAVI LINK-ELLENŐRZÉS AZ ÚTMUTATÓKBAN (2026-09-27, user: „rádbízom")
// ===================================================================
//
// MIÉRT: az útmutató örökzöld (sosem törlődik), a külső oldalak viszont
// eltűnnek vagy költöznek. 463 útmutatóból 41 linkel külső oldalra; ezeket
// eddig SENKI nem ellenőrizte a megjelenés után (a hitelesség-kapu csak az
// ÚJ szövegen fut).
//
// SZABÁLYOK:
//   • ingyenes: a truth-gate link-próbáját használja (dead = nem létezik /
//     404 / 410; a 403-at, a robot-kitiltást ÉLŐNEK veszi)
//   • halottnak CSAK a KÉTSZER egymás után elérhetetlen link számít (egy
//     pillanatnyi hálózati hiba miatt ne nyúljunk semmihez)
//   • javítás: a halott linket kivesszük, a SZÖVEG marad ([x](url) → x) —
//     a cikkben és a fordításokban is; a puszta (nem markdown) URL-hez nem
//     nyúlunk, csak jelezzük
//   • útmutatónként 30 naponta egyszer, futásonként legfeljebb LINK_KOTEG
// ===================================================================

const NAP = 24 * 60 * 60 * 1000;
export const LINK_SZUNET_NAP = 30;
export const LINK_KOTEG = 8;

const escRx = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Van-e külső (http/https) markdown link a szövegben? */
export function vanKulsoLink(md) {
  return /\]\(https?:\/\/[^)\s]+\)/.test(String(md || ''));
}

/** A 30 napja nem ellenőrzött, külső linket tartalmazó útmutatók — a legrégebben ellenőrzött elöl. */
export function linkEllenorzendok(utmutatok, most = Date.now(), db = LINK_KOTEG) {
  return (utmutatok || [])
    .filter(u => vanKulsoLink(u.md))
    .filter(u => {
      const t = Date.parse(u.meta?.links_checked_at || '');
      return !Number.isFinite(t) || most - t >= LINK_SZUNET_NAP * NAP;
    })
    .sort((a, b) => (Date.parse(a.meta?.links_checked_at || 0) || 0) - (Date.parse(b.meta?.links_checked_at || 0) || 0))
    .slice(0, db);
}

/**
 * A halott linkek kivétele: [szöveg](halott-url) → szöveg. A puszta URL marad.
 * @returns {{ md: string, db: number }}
 */
export function halottLinkTorles(md, halottak) {
  let s = String(md || '');
  let db = 0;
  for (const url of halottak || []) {
    const rx = new RegExp(`\\[([^\\]]+)\\]\\(${escRx(url)}\\/?\\)`, 'g');
    s = s.replace(rx, (_, szoveg) => { db++; return szoveg; });
  }
  return { md: s, db };
}

/**
 * Második vélemény BÖNGÉSZŐKÉNT (teljes GET, böngésző-azonosító). 09-27, élesben:
 * az account.microsoft.com a robot-azonosítójú HEAD/GET-re 404-et adott, böngészőre
 * 200-at — a sima kétszeri próba ezt halottnak vette volna.
 * @returns {Promise<'dead'|'ok'|'warn'>}
 */
export async function bongeszoVelemeny(url, fetchFn = fetch) {
  try {
    const r = await fetchFn(url, {
      redirect: 'follow', signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (r.status === 404 || r.status === 410) return 'dead';
    return r.status >= 500 ? 'warn' : 'ok';
  } catch (e) {
    const kod = String(e?.cause?.code || e?.name || '');
    return /Timeout|Abort/i.test(kod) ? 'warn' : 'dead';   // nem létező domain → dead
  }
}

/**
 * Kétlépcsős próba: csak az a link halott, amelyik a robot-próbán ÉS a
 * böngészős második véleményen is halott.
 * @param {Function} probe      a truth-gate probeUrl-je (tesztben hamis)
 * @param {Function} masodik    bongeszoVelemeny (tesztben hamis)
 */
export async function megerositettHalottak(urls, probe, masodik = bongeszoVelemeny) {
  const ki = [];
  for (const u of urls || []) {
    const r1 = await probe(u);
    if (r1.status !== 'dead') continue;
    if ((await masodik(u)) === 'dead') ki.push(u);
  }
  return ki;
}

export default { vanKulsoLink, linkEllenorzendok, halottLinkTorles, megerositettHalottak, LINK_SZUNET_NAP, LINK_KOTEG };
