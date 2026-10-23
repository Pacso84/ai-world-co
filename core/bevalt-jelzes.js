// ===================================================================
// „BEVÁLT?” — A NAPI TELEGRAM-RIPORT SORA (2026-10-23)
// ===================================================================
//
// A promptok alatti „Bevált? 👍 👎” jelzést a Worker számolja
// (telegram-worker/src/bevalt-szamlalo.js → export `__fbp`:
// { 'YYYY-MM-DD': { slug: { up, down } } }, hibánál { error: true }).
// Terv: docs/superpowers/specs/2026-10-23-utmutato-segitseg-csomag-design.md (C).
//
// Csend: ha 7 napja egyetlen szavazat sem jött → nincs sor. Ha a lekérdezés
// bukott → KÜLÖN mondat, mert az „elromlott” és a „senki nem szavazott”
// kívülről egyforma lenne (ugyanaz a szabály, mint a 📚 PDF-sornál).
// Ha egy útmutató 7 nap alatt legalább 3 👎-t kap, név szerint is látszik:
// ott valószínűleg rossz vagy elavult a lépés.
// ===================================================================

const SOK_LE = 3;
const nap = (now, vissza) => new Date(now - vissza * 864e5).toISOString().slice(0, 10);

export function bevaltSor(fbp, now = Date.now()) {
  if (!fbp || typeof fbp !== 'object') return '';
  if (fbp.error) return '👍 Bevált-jelzés: a számlálót nem sikerült lekérdezni.';
  let tu = 0, td = 0, hu = 0, hd = 0;
  const leSlug = {};
  for (let i = 1; i <= 7; i++) {
    for (const [slug, r] of Object.entries(fbp[nap(now, i)] || {})) {
      const up = Number(r?.up) || 0, down = Number(r?.down) || 0;
      hu += up; hd += down;
      if (i === 1) { tu += up; td += down; }
      leSlug[slug] = (leSlug[slug] || 0) + down;
    }
  }
  if (hu + hd === 0) return '';
  const rosszak = Object.entries(leSlug).filter(([, d]) => d >= SOK_LE).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([s, d]) => `${s} (${d})`).join(', ');
  return `👍 Bevált? tegnap: ${tu}👍 ${td}👎 · 7 nap: ${hu}👍 ${hd}👎` + (rosszak ? ` · ⚠️ sok 👎: ${rosszak}` : '');
}

export default { bevaltSor };
