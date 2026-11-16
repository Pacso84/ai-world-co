// HETI ÖSSZEFOGLALÓ ÜTEMEZÉSE (2026-11-16) — agents/digest/agent.js használja
//
// MIÉRT VAN: a heti cikk vasárnap készül, és a „már készült ezen a héten” jelzőt a FUTÁS napjának ISO-hetével írta.
// Egy hétfői pótlás (11-16: a vasárnapi heti cikk kétszer is elbukott) így a KÖVETKEZŐ hetet jelölte volna késznek
// → a 11-22-i vasárnapi heti cikk csendben kimaradt volna. Ezért a jelző mostantól a LEGUTÓBBI VASÁRNAP hete
// (vasárnap ez ugyanaz, mint eddig — a megszokott működés nem változik).
//
// PÓTLÁS: a memory/digest-state.json `potlas_nap: "ÉÉÉÉ-HH-NN"` mezője EGY napra (UTC) engedi a futást akkor is,
// ha nem vasárnap van, vagy ha erre a hétre már írt (elbukott) vázlatot. Kézzel kell beírni, magától nem keletkezik.
// Ingyenes, hálózat nélküli.

export function isoHet(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + String(Math.ceil((((t - y) / 86400000) + 1) / 7)).padStart(2, '0');
}

/** A legutóbbi vasárnap (vasárnap: maga a nap) ISO-hete — ehhez a heti cikkhez tartozik a futás. */
export function hetKulcs(most = new Date()) {
  const v = new Date(Date.UTC(most.getUTCFullYear(), most.getUTCMonth(), most.getUTCDate()));
  v.setUTCDate(v.getUTCDate() - v.getUTCDay());
  return isoHet(v);
}

/** @returns {{fut:boolean, ok:string, potlas:boolean}} */
export function digestFuthat(allapot, most = new Date()) {
  const s = allapot && typeof allapot === 'object' ? allapot : {};
  const potlas = s.potlas_nap === most.toISOString().slice(0, 10);
  if (potlas) return { fut: true, ok: `pótlás (${s.potlas_nap})`, potlas: true };
  if (most.getUTCDay() !== 0) return { fut: false, ok: 'nem vasárnap van', potlas: false };
  if (s.last_week === hetKulcs(most)) return { fut: false, ok: 'ezen a héten már készült', potlas: false };
  return { fut: true, ok: 'vasárnap', potlas: false };
}
