// ===================================================================
// SEO — BING-GYŐZTES OLDALAK VÉDELME (2026-11-25) — spec: docs/superpowers/specs/2026-11-25-kereso-cim-design.md (0.)
// ===================================================================
// MIÉRT: a tömeges SEO-átírás ne rontsa el azt, ami MÁR működik. Mérve 11-25: a Stable Diffusion-oldal
// 1565 Bing-megjelenésből 150 kattintást kap (9,6%) — ehhez mérés nélkül nem nyúlunk. A védett oldalakat
// csak a 4. rész (heti, Bing-mért csiszolás) kezelheti, visszaméréssel.
// Védett: angol cikkoldal, az utolsó 4 hét ≥ 100 megjelenés ÉS kattintási arány ≥ az angol cikkoldalak átlaga.
//
// CLI: node core/seo-vedett.js   (env BING_WM_API_KEY) → memory/seo-vedett.json { at, atlagArany, vedett }
// ===================================================================

const NAP = 86400000;
const CIKK = /^https:\/\/aiworldhq\.com\/article\/([^/?#]+?)(?:\.html)?\/?$/;
const datum = s => { const m = /Date\((\d+)/.exec(String(s || '')); return m ? Number(m[1]) : NaN; };

/** @returns {{atlagArany:number, vedett:string[]}} */
export function vedettLista(rows, { most = Date.now(), hetek = 4, minMegj = 100 } = {}) {
  const tol = most - hetek * 7 * NAP;
  const oldal = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const d = datum(r?.Date);
    const m = CIKK.exec(String(r?.Query || ''));
    if (!m || !Number.isFinite(d) || d < tol || d > most) continue;
    const x = oldal.get(m[1]) || { megj: 0, katt: 0 };
    x.megj += Number(r.Impressions) || 0; x.katt += Number(r.Clicks) || 0;
    oldal.set(m[1], x);
  }
  let megj = 0, katt = 0;
  for (const x of oldal.values()) { megj += x.megj; katt += x.katt; }
  const atlagArany = megj ? katt / megj : 0;
  const vedett = [...oldal].filter(([, x]) => x.megj >= minMegj && x.katt / x.megj >= atlagArany).map(([s]) => s);
  return { atlagArany, vedett };
}

const kozvetlen = Boolean(process.argv[1]) && String(process.argv[1]).replace(/\\/g, '/').endsWith('core/seo-vedett.js');
if (kozvetlen) {
  await import('dotenv/config');
  const { writeFileSync } = await import('fs');
  const { join, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const kulcs = process.env.BING_WM_API_KEY;
  if (!kulcs) { console.log('⚠️ BING_WM_API_KEY hiányzik — a védett-lista nem frissül'); process.exit(0); }
  try {
    const r = await fetch(`https://ssl.bing.com/webmaster/api.svc/json/GetPageStats?siteUrl=${encodeURIComponent('https://aiworldhq.com/')}&apikey=${kulcs}`, { signal: AbortSignal.timeout(30000) });
    const j = await r.json();
    if (!r.ok || !Array.isArray(j?.d)) { console.log(`⚠️ Bing GetPageStats: HTTP ${r.status} — a védett-lista nem frissül`); process.exit(0); }
    const ki = { at: new Date().toISOString(), ...vedettLista(j.d) };
    writeFileSync(join(ROOT, 'memory', 'seo-vedett.json'), JSON.stringify(ki, null, 2) + '\n', 'utf-8');
    console.log(`🛡️ SEO védett oldalak: ${ki.vedett.length} (átlagos kattintási arány ${(100 * ki.atlagArany).toFixed(1)}%)`);
    for (const s of ki.vedett) console.log('   · ' + s);
  } catch (e) { console.log('⚠️ Bing-hiba, a védett-lista nem frissül: ' + String(e.message).slice(0, 120)); }
  process.exit(0);
}

export default { vedettLista };
