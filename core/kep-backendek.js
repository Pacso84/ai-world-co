// ===================================================================
// BORÍTÓKÉP-BACKENDEK — két ingyenes Cloudflare Workers AI modell, fallback-kel
// ===================================================================
// A designer (agents/designer/agent.js) ezt a listát próbálja sorra: az első,
// amelyik képet ad, nyer. Külön modulban, mert az agent-fájlt NEM lehet
// importálni (feltétel nélküli main()), így a sorrend és a kérésforma tesztelhető
// (core/kep-backendek.test.js).
//
// 2026-11-20 (user: „rád bízom!”) — VAK PRÓBA 3 jelenet × 2 modell, ugyanazzal a
// prompttal és vágással: a FLUX.2 klein 4B 2 témánál egyértelműen jobban adta át
// a témát (tisztább kompozíció, nincs halandzsa „felirat” a tárgyakon), 1-nél
// döntetlen. Ráadásul NATÍVAN 16:9-et rajzol (1280×720), míg a schnell négyzetet,
// amiből a compressImage levágja a tetejét/alját.
//   → FŐ: klein 4B · TARTALÉK: schnell (más modell → egy modell kiesése nem
//     hagyja borító nélkül a cikket).
//
// A RÉGI TARTALÉK (Hugging Face) HALOTT VOLT: az api-inference.huggingface.co
// megszűnt (DNS), és az ingyenes HF-fiók 0 kreditet kap. Emiatt 11-20 délután
// egy egyszeri Cloudflare 400 után a „Remove Personal Details…” útmutató borító
// nélkül maradt (ugyanaz a jelenet a próbában mindkét modellel átment).
//
// KERET (hivatalos árlap, 10 000 neuron/nap ingyen): klein ~100 neuron/kép
// (~90 kép/nap), schnell ~60 (~160/nap). Mi futásonként max ~12 borítót kérünk
// (új + --refresh 8), napi 3 futás → ≤ ~36. Ha a klein kerete fogy, a schnell
// ugrik be magától.
//
// KIKAPCSOLÁS: KLEIN_FO_MODELL = false → a schnell kerül elöl (a klein marad
// tartaléknak). A config.json `enabled` mezője NEM kapcsol ki semmit — ez igen.
// ===================================================================

export const KLEIN_FO_MODELL = true;

export const KLEIN_W = 1280, KLEIN_H = 720;

// A klein lassú (mérve 10–16 mp/kép). Ha beragad, ne egye meg a lépés 10 perces
// keretét: 90 mp után feladjuk, és a schnell próbálkozik.
const KLEIN_IDOKORLAT_MS = 90_000;

const MODELL_URL = (acct, modell) =>
  `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/black-forest-labs/${modell}`;

async function kepAValaszbol(r, nev) {
  // A törzset IS olvassuk: a puszta „HTTP 400” miatt 08-14-én vakon találgattunk.
  if (!r.ok) throw new Error(`${nev} HTTP ${r.status}: ` + (await r.text().catch(() => '')).slice(0, 160));
  const j = await r.json();
  const b64 = j?.result?.image;
  if (!b64) throw new Error(`${nev}: nincs kép a válaszban`);
  return Buffer.from(b64, 'base64');
}

/**
 * A designer kép-routerének listája, sorrendben.
 * @param {object} env  process.env (CLOUDFLARE_FLUX_TOKEN + CLOUDFLARE_ACCOUNT_ID)
 * @param {Function} fetchFn  teszthez cserélhető
 * @param {{kleinFo?: boolean}} opt
 * @returns {{name: string, fn: (prompt: string) => Promise<Buffer|null>}[]}
 */
export function kepBackendek(env = process.env, fetchFn = fetch, { kleinFo = KLEIN_FO_MODELL } = {}) {
  const token = env.CLOUDFLARE_FLUX_TOKEN, acct = env.CLOUDFLARE_ACCOUNT_ID;

  // FLUX.2 klein 4B — CSAK multipart/form-data bemenetet fogad (JSON-ra 400:
  // „required properties at '/' are 'multipart'”), és elfogadja a méretet.
  const klein = {
    name: 'Cloudflare FLUX.2 klein 4B',
    fn: async (prompt) => {
      if (!token || !acct) return null;
      const fd = new FormData();
      fd.append('prompt', prompt);
      fd.append('width', String(KLEIN_W));
      fd.append('height', String(KLEIN_H));
      const r = await fetchFn(MODELL_URL(acct, 'flux-2-klein-4b'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }, // a határolót a FormData teszi
        body: fd,
        signal: AbortSignal.timeout(KLEIN_IDOKORLAT_MS),
      });
      return kepAValaszbol(r, 'Cloudflare klein');
    },
  };

  // FLUX.1 schnell — JSON; a width/height-et a Cloudflare 2026-08-14-én
  // KIVEZETTE („Additional properties '/width, /height' not allowed”) →
  // négyzetes képet ad, a 16:9-et a designer compressImage-e vágja ki.
  const schnell = {
    name: 'Cloudflare FLUX.1 schnell',
    fn: async (prompt) => {
      if (!token || !acct) return null;
      const r = await fetchFn(MODELL_URL(acct, 'flux-1-schnell'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      return kepAValaszbol(r, 'Cloudflare schnell');
    },
  };

  return kleinFo ? [klein, schnell] : [schnell, klein];
}
