// ===================================================================
// KINT VAN-E A CIKK? — poszt csak ÉLŐ cikkre (2026-11-13)
// ===================================================================
// 11-13 15:46: a Cloudflare a feltöltés utolsó lépésénél 503-at adott → az új
// oldalverzió nem élesedett, a délután kiadott Word-útmutató 404-et adott.
// A Facebook-posztoló ezt nem nézte: a poszt KIMENT a nem létező oldalra, aki
// rákattintott, hibaoldalt kapott. (A TikTok-poszter a képet már ellenőrizte —
// „a kép nincs kint, kihagyom” —, a FB-poszter nem.)
//
// Szabály: a poszt-küldés ELŐTT a cikk címe 200-at kell adjon. Ha nem (404,
// 5xx, hálózati hiba, időtúllépés) → a poszt a sorban MARAD, a következő futás
// (a sikeres deploy után) viszi ki. Egy elmaradt poszt olcsóbb, mint egy 404-re
// vezető, ami ráadásul a Meta szemében is rossz jel.
// ===================================================================

/** A cikk-URL gyorsítótár-kerülő változata (az él-cache ne a régi 404-et/200-at adja). */
export function friss(url) {
  const u = String(url || '');
  return u + (u.includes('?') ? '&' : '?') + 'elo=' + Date.now();
}

/**
 * true, ha a cikk ÉL (HTTP 200, átirányítás után is). Minden más → false.
 * @param {string} url  a poszt `url` mezője (a cikk kanonikus címe)
 * @param {Function} fetchFn  tesztben cserélhető
 */
export async function cikkKint(url, fetchFn = fetch) {
  if (!/^https?:\/\//.test(String(url || ''))) return false;
  try {
    const r = await fetchFn(friss(url), { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
    return r && r.status === 200;
  } catch {
    return false;
  }
}
