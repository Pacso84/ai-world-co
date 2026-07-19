// ===================================================================
// KB-RETRIEVAL — kulcsszavas keresés a kb.json tudáscsomagban (tiszta modul)
// NINCS embedding, NINCS függőség — offline tesztelhető (spec: 2026-07-19).
// ===================================================================

// Gyakori funkciószavak (5 nyelv, ékezet-levágott alak) — cím-pontozásra
// értéktelenek, kiszűrjük, különben pl. a "with" teljes találat-súlyt kapna.
const STOP = new Set([
  // en
  'the','and','with','for','how','you','your','are','was','this','that','can','use','what','from','not','get','all','does','about',
  // hu
  'hogyan','hogy','egy','mit','nem','van','lehet','kell','mire','mivel','miert','ezt','azt','is',
  // es
  'como','para','con','que','los','las','del','por','una','uno','este','esta','puedo','hacer',
  // de
  'wie','und','mit','fur','der','die','das','den','ein','eine','ich','kann','was','auf',
  // fr
  'comment','pour','avec','les','des','une','dans','quoi','est','peut','faire','sur','mon','votre'
]);

// Kisbetű + ékezet-levágás (é→e, ű→u…), 3+ karakteres egyedi szavak, stopszavak kiszűrve.
export function tokenize(str) {
  return [...new Set(
    String(str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 3 && !STOP.has(w))
  )];
}

// Egy kb-elem pontszáma a kérdés tokenjeihez képest.
// Cím/kérdés-találat 3 pontot ér, törzs-találat 1-et — a cím a legerősebb jel.
function scoreItem(qTokens, titleTokens, bodyTokens) {
  let s = 0;
  for (const t of qTokens) {
    if (titleTokens.includes(t)) s += 3;
    else if (bodyTokens.includes(t)) s += 1;
  }
  return s;
}

// kb = {site:[{q,a,u}], guides:[{t,s,u,c}], terms:[{t,d,u}]} → top-N releváns elem.
export function searchKb(query, kb, topN = 4) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];
  const scored = [];
  for (const it of kb.site || []) {
    const s = scoreItem(qTokens, tokenize(it.q), tokenize(it.a));
    if (s >= 2) scored.push({ t: it.q, s: it.a, u: it.u, kind: 'site', score: s });
  }
  for (const it of kb.guides || []) {
    const s = scoreItem(qTokens, tokenize(it.t + ' ' + (it.c || '')), tokenize(it.s));
    if (s >= 2) scored.push({ t: it.t, s: it.s, u: it.u, c: it.c, kind: 'guide', score: s });
  }
  for (const it of kb.terms || []) {
    const s = scoreItem(qTokens, tokenize(it.t), tokenize(it.d));
    if (s >= 3) scored.push({ t: it.t, s: it.d, u: it.u, kind: 'term', score: s });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, topN);
}
