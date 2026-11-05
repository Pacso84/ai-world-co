// CÉG-LEFEDETTSÉG ŐRSZEM (2026-11-05; user: „ezek a hibák többet ne ismétlődjenek meg!”).
// A hiba: a 10-30-án felvett 6 cég (Kimi, MiniMax Code, Z.ai, Duck.ai, Brave Leo, Lumo) 6 napig
// EGY témát sem kapott, mert a --cover egy olyan ágban ült, ami sosem futott le — és ezt semmi
// nem jelezte. Mostantól a --cover MINDEN futásban ide ír (memory/ceg-lefedettseg.json), a napi
// riport pedig szól, ha (1) egy katalógus-cégnek nincs se útmutatója, se témája, (2) egy
// coverage-téma ELAKADT (7 napnál régebben vár), vagy (3) maga a lépés nem futott (frissesség-őr).
// Tiszta függvények, lemez nélkül. Hívó: agents/guide/agent.js runCoverMode; olvasó: core/daily-report.js

export const ELAKADT_NAP = 7;
const NAP = 86400000;
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * @param {{topics: object[]}} store   guides/guide-topics.json
 * @param {{company: string, tool: string}[]} katalogus   COMPANY_CATALOG
 */
export function cegLefedettseg(store, katalogus, now = Date.now()) {
  const temak = store?.topics || [];
  const van = new Set(temak.map(t => norm(t.company)).filter(Boolean));
  const hianyzo = (katalogus || []).filter(c => !van.has(norm(c.company))).map(c => c.tool || c.company);
  const elakadt = temak
    .filter(t => t.priority === 'coverage' && t.status !== 'done')
    .map(t => ({ tool: t.tool || t.company, napja: Math.floor((now - Date.parse(t.proposed_at || '')) / NAP) }))
    .filter(x => Number.isFinite(x.napja) && x.napja >= ELAKADT_NAP);
  const problems = [];
  if (hianyzo.length) problems.push({ code: 'CEG_TEMA_NELKUL', uzenet: `${hianyzo.length} cégnek se útmutatója, se témája: ${hianyzo.join(', ')}` });
  if (elakadt.length) problems.push({ code: 'CEG_TEMA_ELAKADT', uzenet: `${elakadt.length} „Getting started” téma ${ELAKADT_NAP}+ napja vár: ${elakadt.map(x => `${x.tool} (${x.napja} n.)`).join(', ')}` });
  return { at: new Date(now).toISOString(), katalogus: (katalogus || []).length, hianyzo, elakadt, problems };
}

/** A napi riport sora — CSENDES, ha minden rendben (a frissességet a guard-freshness nézi). */
export function cegLefedettsegSor(j) {
  const p = j?.problems || [];
  return p.length ? `🏢 CÉG-LEFEDETTSÉG: ${p.map(x => x.uzenet).join(' · ')}` : null;
}
