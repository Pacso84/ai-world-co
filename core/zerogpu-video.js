// ===================================================================
// INGYENES MI-VIDEÓKLIP — Hugging Face ZeroGPU Space, Gradio REST (2026-10-09)
// ===================================================================
// User: „a TikTokon MI-animációkat néznek, nem a táblás videóinkat" + „ingyenes
// legyen". Kutatás: reports/Ingyenes automatikus MI videókészítés.md (memoria).
// Ismétlődő INGYENES, kereskedelmi célra is szabad MI-videó API NINCS; az
// egyetlen napi $0 út a Hugging Face ZeroGPU: ingyenes fiók = 5 GPU-perc/nap,
// TÚLFIZETÉS NEM LEHETSÉGES (ingyenes fiók nem vehet extra időt) — a júliusi
// Gemini-csapda (csendes fizetős tartalék, ~$37/hó) itt nem ismétlődhet.
//
// Modell: Lightricks LTX-2.3 (licenc: ingyenes kereskedelmi célra $10M
// éves bevétel alatt). Élő próba 10-09 (fiók nélkül, helyi gépről): 576×1024,
// 4 mp, hanggal, 53 mp alatt kész.
//
// ⚠️ A „SIKER" A LETÖLTÖTT MP4, nem a 200-as válasz (munkamódszer-szabály:
// a lánc végét mérd). A kvóta-hiba külön üzenet — az „elfogyott a keret" és az
// „elromlott" kívülről egyformának látszana.
// ===================================================================

export const LTX_SPACE = 'https://lightricks-ltx-2-3.hf.space';

/** A Gradio SSE-válaszból az események: [[esemény, adat], …]. */
export function sseEsemenyek(szoveg) {
  return [...String(szoveg || '').matchAll(/event: (\w+)\r?\ndata: (.*)/g)].map(m => [m[1], m[2]]);
}

/** Kvóta-hiba-e az üzenet? (A ZeroGPU így jelzi: „You have exceeded your GPU quota…") */
export function kvotaHibaE(uzenet) {
  return /exceeded your (?:free )?GPU quota|GPU quota|quota exceeded/i.test(String(uzenet || ''));
}

/** A kész esemény adatából az MP4 URL-je (vagy null). */
export function mp4Url(completeAdat) {
  const m = String(completeAdat || '').match(/"url":\s*"([^"]+\.mp4[^"]*)"/);
  return m ? m[1] : null;
}

/** A /generate_video hívás adatsora (sorrend a Space /gradio_api/info szerint, 10-09). */
export function ltxAdat({ prompt, mp = 4, magas = 1024, szeles = 576, seed = 10 } = {}) {
  const ms = Math.max(1, Math.min(10, Number(mp) || 4));
  // A méretnek 32-vel oszthatónak kell lennie (LTX-szabály).
  const k32 = x => Math.max(256, Math.round((Number(x) || 0) / 32) * 32);
  return [null, String(prompt || ''), ms, false, seed, true, k32(magas), k32(szeles)];
}

/**
 * Egy klip legyártása. Visszatér: { ok, buf?, mp, kvota?, hiba? }.
 * @param {object} o  { prompt, token, base, fetchFn, mp, magas, szeles }
 */
export async function zerogpuKlip(o = {}) {
  const base = o.base || LTX_SPACE;
  const f = o.fetchFn || fetch;
  const fej = { 'Content-Type': 'application/json' };
  if (o.token) fej.Authorization = 'Bearer ' + o.token;
  const t0 = Date.now();
  const mp = () => Math.round((Date.now() - t0) / 1000);
  try {
    const r = await f(`${base}/gradio_api/call/generate_video`, { method: 'POST', headers: fej, body: JSON.stringify({ data: ltxAdat(o) }) });
    if (!r.ok) return { ok: false, mp: mp(), hiba: 'POST HTTP ' + r.status };
    const { event_id } = await r.json();
    if (!event_id) return { ok: false, mp: mp(), hiba: 'nincs event_id' };
    const s = await f(`${base}/gradio_api/call/generate_video/${event_id}`, { headers: o.token ? { Authorization: fej.Authorization } : {} });
    const esemenyek = sseEsemenyek(await s.text());
    const hibaE = esemenyek.find(([e]) => e === 'error');
    if (hibaE) return { ok: false, mp: mp(), kvota: kvotaHibaE(hibaE[1]), hiba: String(hibaE[1]).slice(0, 300) };
    const kesz = esemenyek.find(([e]) => e === 'complete');
    const url = kesz && mp4Url(kesz[1]);
    if (!url) return { ok: false, mp: mp(), hiba: 'nincs kész videó' };
    const v = await f(url, { headers: o.token ? { Authorization: fej.Authorization } : {} });
    if (!v.ok) return { ok: false, mp: mp(), hiba: 'letöltés HTTP ' + v.status };
    const buf = Buffer.from(await v.arrayBuffer());
    // Egy valódi MP4 'ftyp' dobozzal kezdődik a 4. bájttól — nem HTML-hibaoldal.
    if (buf.length < 10000 || buf.subarray(4, 8).toString('latin1') !== 'ftyp') return { ok: false, mp: mp(), hiba: 'nem MP4 jött vissza' };
    return { ok: true, buf, mp: mp() };
  } catch (e) {
    return { ok: false, mp: mp(), hiba: String(e && e.message || e).slice(0, 200) };
  }
}

export default { LTX_SPACE, sseEsemenyek, kvotaHibaE, mp4Url, ltxAdat, zerogpuKlip };
