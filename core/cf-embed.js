// ===================================================================
// CLOUDFLARE-BEÁGYAZÁS — tiszta logika (2026-11-26)
// ===================================================================
// MIÉRT: 11-25 estétől MINDKÉT beágyazó szolgáltató fizetést kér —
//   Mistral: 402 „You need a subscription” (billing_no_api_budget_configured),
//   Google:  402 „Your prepayment credits are depleted”.
// A témaismétlés-őr ezzel a Jaccard-tartalékra esett (15 ismétlésből 1-et fog).
// User 11-26: „rádbízom! … minél több olvasót vonzzon” → Cloudflare Workers AI,
// a MEGLÉVŐ fiókkal és kulccsal (ugyanaz, mint a borítóképeké), ingyenes keretből.
//
// MODELL: @cf/google/embeddinggemma-300m (768 dim, Matryoshka) → az ELSŐ 512 elem,
// újranormálva. MIÉRT 512: a rendszer a vektor HOSSZÁBÓL tudja, melyik szolgáltató
// tere (Google 768, Mistral 1024 — core/topic-dedup.js vecFor); 512 egyikkel sem
// ütközik, így a régi gyorsítótár-bejegyzés soha nem keveredhet az újjal.
//
// KÜSZÖB-ÁTVÁLTÁS (MÉRVE 11-26): a küszöbök a kódban Mistral-skálán élnek (0,88
// témaismétlés, 0,92 hír-ismétlés — mindkettő Mistral-vektorokon mérve). Az új tér
// pontszámai alacsonyabbak, ezért 512 dimenziónál a KALIBRACIO tábla vált át.
// Módszer: 46 cím (a helyi gyorsítótár Mistral-vektorai) 1035 párja mindkét
// modellel; azonos arányú (kvantilis) megfeleltetés. Spearman ρ = 0,826.
// Ellenpróba: a 86 korábbi témaismétlés-elutasításból 0,82-nél 75 (87%) fogva
// (a Jaccard-tartalék: 7%). A kalibráló szkript a 11-26-i beszélgetés scratchpadjében.
// ===================================================================

export const CF_EMBED_MODELL = '@cf/google/embeddinggemma-300m';
export const CF_DIM = 512;
export const CF_ELOTAG = 'task: sentence similarity | query: ';

/** [Mistral-küszöb, azonos arányú EmbeddingGemma-512 küszöb] — 11-26 mérés. */
export const KALIBRACIO = [[0.85, 0.773], [0.88, 0.821], [0.90, 0.855], [0.92, 0.888], [0.94, 0.904]];

/** A Workers AI nyers 768-as vektorából a 512-es, egységnyi hosszú vektor; hibás bemenet → null. */
export function cfVektor(nyers) {
  if (!Array.isArray(nyers) || nyers.length < CF_DIM) return null;
  const v = nyers.slice(0, CF_DIM).map(Number);
  if (v.some(x => !Number.isFinite(x))) return null;
  const n = Math.hypot(...v);
  return n > 0 ? v.map(x => x / n) : null;
}

/** Egy Mistral-skálás küszöb a vektor terében: 512 dimenziónál átváltva, máshol változatlan. */
export function terKuszob(k, dim) {
  if (dim !== CF_DIM) return k;
  const K = KALIBRACIO;
  let i = K.findIndex(([m]) => m >= k);
  if (i === -1) i = K.length - 1; else if (i === 0) i = 1;
  const [[m0, g0], [m1, g1]] = [K[i - 1], K[i]];
  if (k === m1) return g1;
  if (k === m0) return g0;
  return Math.min(0.999, g0 + (k - m0) * (g1 - g0) / (m1 - m0));
}

export default { CF_EMBED_MODELL, CF_DIM, CF_ELOTAG, KALIBRACIO, cfVektor, terKuszob };
