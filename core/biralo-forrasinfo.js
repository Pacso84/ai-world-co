// ===================================================================
// Az ellenőrző (agents/ellenorzo) AI-bírálatának „SOURCE METADATA” blokkja
// ===================================================================
// MIÉRT (2026-11-06): a „Gemini Omni 1.2 Flash now in Picsart” hírt az
// ellenőrző AI-bírálata „kitalált modellnév” miatt utasította el — pedig a
// hivatalos forrás címében szó szerint ez állt (és a Google is bejelentette).
// A hiteles névlistát (website/tool-links.json) és a „forrás frissebb a
// tudásodnál” szabályt eddig csak a hitelesség-kapu (core/truth-gate.js)
// kapta meg; az ellenőrző a saját, elavult tudásához mért. Ugyanaz a hiba,
// mint 2026-09-23-án (Claude Opus 5.5 az AWS-en) és 11-05-én (Gemini Notebook).
// A szabály szövege szándékosan a truth-gate.js-ével egyezik.
//
// 2026-11-12 (TÉNYKÖZPONT 0d): ugyanez a téves kifogás ÚTMUTATÓNÁL is: az útmutató
// `source_link`-je üres, így a cím és a szöveg nem igazolt semmit — a bíró a „Gemini 4 Carbon”-t
// (Gemini Models súgó + blog.google hír) és a „Workspace Studio”-t (a forrás-hír címe) is
// „kitaláltnak” mondta. Az `utmutatoNevForras` az útmutató valódi forrásait (a forrás-hírt és a
// hivatalos súgót) adja ugyanabban az alakban, amit a `tevesNevKifogas` vár.
// ===================================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { knownRealNames, LETEZES_RX, ARAS_RX, FELULET_RX, norm, idezettNevek } from './truth-gate.js';
import { cikkForrasSzovege, cikkKivonat } from './forras-cache.js';

const ARTICLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'articles');

// ---------------------------------------------------------------
// KÓD-BIZTOSÍTÉK (user 11-06: „a hibák ne forduljanak többet elő”)
// ---------------------------------------------------------------
// Az AI-utasítás (lent, biraloForrasInfo) nem garancia: a bíró a saját,
// elavult tudásából MÉGIS „kitaláltnak” mondhat egy valódi, új nevet. Ha ez a
// kifogás bennmarad, három kár is jön belőle: (1) elutasítás, (2) az átdolgozó
// „vedd ki a nevet” utasítást kap (a Gemini Notebooknál így ment ki a RÉGI
// név), (3) hamis lecke kerül a memóriába. Ezért a kód veszi ki.
//
// Egy kifogás akkor TÉVES, ha:
//   (a) azt állítja, hogy valami nem létezik / kitalált / nem ellenőrizhető,
//   (b) MINDEN idézett neve igazolt: a hivatalos forrás címében, URL-jében vagy
//       teljes szövegében áll, VAGY pontosan egyezik egy hiteles listás névvel
//       (website/tool-links.json — csak PONTOS egyezés: „Gemini Omni Ultra” ≠ „Gemini Omni”),
//   (c) nem árról és nem felületről (gomb/menü) szól — ugyanaz a két kizárás,
//       mint a hitelesség-kapuban (core/truth-gate.js forrasVisszaigazol).
// Az idézet nélküli „unverified model name” kifogás csak akkor esik ki, ha
// ugyanabban a bírálatban volt igazolt név-kifogás (annak a következménye).
// 11-12: „does not appear in the verified-real names list” — a bíró így is „kitaláltnak” minősít (Gemini 4 Carbon).
const NEM_ELLENORIZHETO_RX = /unverif|cannot be (?:independently )?verified|could not be (?:independently )?verified|hallucinat|fictional|fictitious|non-?existent|(?:does not|doesn't|do not|did not|not) appear\b[^.;]{0,40}\b(?:verified|known|official|approved)\b/i;
const NEV_KOVETKEZMENY_RX = /\b(?:unverified|invented|fabricated|hallucinated|made[- ]up|fake) (?:model |product |tool |brand )?names?\b|\bnames?\b[^.;]{0,40}\b(?:cannot|could not|can't) be (?:independently )?verified/i;

// IDÉZŐJEL NÉLKÜLI NÉV (11-12, fix 1): a valódi Workspace Studio-bírálat így szólt: „Product name Workspace Studio cannot be
// independently verified as a real Google product…” — nincs idézőjel, az `idezettNevek` (truth-gate) nem lát benne nevet.
// TARTALÉK, CSAK ha a mondatban nincs idézett név: a Nagybetűs / számjegyes szavak leghosszabb sorozatai a jelöltek
// („Workspace Studio”, „Gemini 5 Ultra”); az elöl álló általános szavak (Product, Name, The, Tool, Feature, App, Model)
// lekerülnek, az üres sorozat kimarad. Ugyanaz a szabály, mint az idézett nevekre: MINDEN jelöltnek igazoltnak kell
// lennie (forrás-cím / URL / szöveg, vagy hiteles lista). A truth-gate viselkedése nem változik.
const ALTALANOS_SZAVAK = new Set(['product', 'name', 'the', 'tool', 'feature', 'app', 'model']);
const NAGYBETUS_SOROZAT_RX = /\p{Lu}[\p{L}\p{N}]*(?:[ \t]+(?:\p{Lu}[\p{L}\p{N}]*|\d+(?:\.\d+)*))*/gu;

function idezetlenNevek(szoveg) {
  const ki = [];
  for (const m of String(szoveg).matchAll(NAGYBETUS_SOROZAT_RX)) {
    const szavak = m[0].split(/\s+/);
    while (szavak.length && ALTALANOS_SZAVAK.has(szavak[0].toLowerCase())) szavak.shift();
    if (szavak.length) ki.push(szavak.join(' '));
  }
  return ki;
}

function letezesKifogas(szoveg) {
  return (LETEZES_RX.test(szoveg) || NEM_ELLENORIZHETO_RX.test(szoveg)) && !ARAS_RX.test(szoveg) && !FELULET_RX.test(szoveg);
}

/**
 * @param {{issues?: string[], verdict?: string}} review  az ellenőrző AI-bírálata
 * @param {{ originalTitle?: string, sourceUrl?: string, sourceText?: string, known?: string[] }} forras
 * @returns {{ teves: string[], maradt: string[], nevek: string[], verdictTeves: boolean }}
 */
export function tevesNevKifogas(review, { originalTitle = '', sourceUrl = '', sourceText = '', known } = {}) {
  const lista = (known || knownRealNames()).map(n => norm(n));
  // Külső forrás-URL nélkül (útmutató) a CÍM nem igazol: az útmutató `original_title`-je a SAJÁT
  // (gép választotta) témánk, nem hivatalos bejelentés — ugyanígy, mint a truth-gate forrasVisszaigazol-jában.
  // Ilyenkor csak a hiteles lista (pontos egyezés) igazolhat.
  let forras = ' ';
  if (/^https?:\/\//i.test(sourceUrl || '')) {
    let urlResz = '';
    try { urlResz = new URL(sourceUrl).pathname; } catch { urlResz = ''; }
    forras = norm(`${originalTitle} ${urlResz} ${sourceText}`);
  }
  const igazolt = n => { const k = norm(n); return k.trim() !== '' && (forras.includes(k) || lista.includes(k)); };

  const nevek = new Set();
  const egyIgazolt = szoveg => {
    let idezett = idezettNevek(szoveg);
    if (!idezett.length && letezesKifogas(szoveg)) idezett = idezetlenNevek(szoveg);   // tartalék: idézőjel nélküli név
    if (!idezett.length || !letezesKifogas(szoveg) || !idezett.every(igazolt)) return false;
    idezett.forEach(n => nevek.add(n));
    return true;
  };

  const issues = Array.isArray(review?.issues) ? review.issues : [];
  const elso = issues.map(i => egyIgazolt(String(i)));
  const verdictTeves = egyIgazolt(String(review?.verdict || ''));
  const voltIgazolt = elso.some(Boolean) || verdictTeves;

  const teves = [], maradt = [];
  issues.forEach((i, k) => {
    const s = String(i);
    const kovetkezmeny = voltIgazolt && !idezettNevek(s).length && NEV_KOVETKEZMENY_RX.test(s) && !ARAS_RX.test(s) && !FELULET_RX.test(s);
    (elso[k] || kovetkezmeny ? teves : maradt).push(i);
  });
  return { teves, maradt, nevek: [...nevek], verdictTeves };
}

/** A forrás-hír beolvasása content/articles/<file>-ból. Hiba / hiány → null, SOSEM dob. */
function alapHirBetolt(file) {
  try {
    const nev = basename(String(file || ''));
    if (!nev || !nev.endsWith('.json')) return null;
    return JSON.parse(readFileSync(join(ARTICLES_DIR, nev), 'utf-8'));
  } catch { return null; }
}

/**
 * Az ÚTMUTATÓ forrásai a név-igazoláshoz (11-12): a forrás-hír (`_meta.source_news` → content/articles) és a
 * hivatalos súgó. A hír eredeti címe + a súgócikkek címe, a hír privát-tárbeli szövege (vagy kivonata) + a
 * letöltött súgószövegek igazolnak; a forrás-URL a hír linkje, ennek híján az első hivatalos súgó URL-je.
 *
 * @param {object} meta  az útmutató _meta-ja
 * @param {{ hirBetolt?: (file: string) => object|null, sugoSzovegek?: string[] }} [opt]  tesztekhez / a hívó adja a súgót
 * @returns {{ originalTitle: string, sourceUrl: string, sourceText: string }}
 */
export function utmutatoNevForras(meta, { hirBetolt = alapHirBetolt, sugoSzovegek = [] } = {}) {
  const m = meta || {};
  const sn = m.source_news;
  const file = typeof sn === 'string' ? sn : (sn && sn.file) || '';
  let hir = null;
  if (file) { try { hir = hirBetolt(file) || null; } catch { hir = null; } }

  const hirMeta = hir && typeof hir === 'object' ? (hir._meta || {}) : {};
  const sugok = (Array.isArray(m.official_sources) ? m.official_sources : [])
    .map(x => (typeof x === 'string' ? { url: x, title: '' } : { url: String(x?.url || ''), title: String(x?.title || '') }));

  const hirLink = String(hirMeta.source_link || '').trim();
  const sugoUrl = (sugok.find(x => /^https?:\/\//i.test(x.url)) || {}).url || '';
  const sourceUrl = /^https?:\/\//i.test(hirLink) ? hirLink : sugoUrl;

  const originalTitle = [hir?.original_title, ...sugok.map(x => x.title)].filter(Boolean).join(' ');

  let hirSzoveg = '';
  if (hir) { try { hirSzoveg = String(cikkForrasSzovege(hirMeta) || cikkKivonat(hirMeta) || ''); } catch { hirSzoveg = ''; } }
  const sourceText = [hirSzoveg, ...(Array.isArray(sugoSzovegek) ? sugoSzovegek : [])].filter(Boolean).join('\n\n');

  return { originalTitle, sourceUrl, sourceText };
}

/**
 * ÁTDOLGOZÓ ELŐTTI SZŰRÉS (2026-11-06, user: „örülnék, ha nem lenne több ilyen tévedés!").
 * A fenti biztosíték csak az ÚJ bírálatot szűri. A már ELMENTETT elutasításban (REJECTED_…_meta.ai_review,
 * _meta.reason) a téves kifogás bennmaradt — 11-06-án a 15:37-kor (a javítás előtt) elutasított Gemini Omni-hírt
 * az átdolgozó 21 órakor ebből javította: szót fogadott, és a VALÓDI modellnevet kivette a cikkből.
 * Ez a függvény az átdolgozó (agents/iro, agents/guide) elé teszi ugyanazt a szűrést.
 *
 * @param {object} meta  az elutasított cikk _meta-ja
 * @param {{ originalTitle?: string, sourceText?: string, sourceUrl?: string, known?: string[] }} forras
 *   sourceUrl: ha meg van adva, felülírja a meta.source_link-et (útmutatónál: utmutatoNevForras)
 * @returns {{ meta: object, kivett: string[], nevek: string[], csakTevesNev: boolean }}
 *   meta = a szűrt _meta (a téves kifogások nélkül); csakTevesNev = az AI-bírálatnak a téves
 *   név-kifogáson kívül nem maradt oka (→ átírás helyett változatlan újrabírálat, 0 költség).
 */
export function atdolgozoMeta(meta, { originalTitle = '', sourceText = '', sourceUrl, known } = {}) {
  const review = meta?.ai_review;
  const ures = { meta, kivett: [], nevek: [], csakTevesNev: false };
  if (!review || typeof review !== 'object') return ures;
  const forras = { originalTitle, sourceUrl: String(sourceUrl || meta?.source_link || '').trim(), sourceText, known };
  const r = tevesNevKifogas(review, forras);
  // A _meta.reason rendszerint a verdict másolata — ugyanúgy mérjük.
  const reason = String(meta?.reason || '');
  const reasonTeves = !!reason && ((r.verdictTeves && reason === String(review.verdict || '')) || tevesNevKifogas({ issues: [reason] }, forras).teves.length > 0);
  if (!r.teves.length && !r.verdictTeves && !reasonTeves) return ures;

  const ujReview = { ...review, issues: r.maradt };
  if (r.verdictTeves) delete ujReview.verdict;
  const ujMeta = { ...meta, ai_review: ujReview };
  if (reasonTeves) delete ujMeta.reason;
  const kivett = [...r.teves, ...(r.verdictTeves ? [review.verdict] : []), ...(reasonTeves && reason !== review.verdict ? [reason] : [])];
  const nevek = r.nevek.length ? r.nevek : idezettNevek(reason);
  ujMeta.nev_kifogas_kivetve = { at: new Date().toISOString(), nevek, kifogasok: kivett };
  return { meta: ujMeta, kivett, nevek, csakTevesNev: !r.maradt.length && !ujReview.verdict && !ujMeta.reason };
}

/** Az újrabírálathoz fűzött javító megjegyzés (angolul — a bíró promptja angol). */
export function nevJavitoMegjegyzes(nevek) {
  return `

=== CORRECTION FROM THE EDITOR (code-verified) ===
A previous review wrongly called these names invented or unverifiable: ${nevek.map(n => `"${n}"`).join(', ')}.
They are REAL: each appears in the official source (title, URL or text) or on our verified-names list. Your training data predates them.
Do NOT treat their existence as an issue, do NOT ask to remove or rename them, and do NOT lower the score because of them. Re-evaluate the article on everything else.`;
}

/**
 * @param {object} writerData  az író vázlata ({ original_title, _meta: { source_name, source_id, source_link } })
 * @param {{ known?: string[], today?: string }} [opt]  tesztekhez felülírható
 * @returns {string}
 */
export function biraloForrasInfo(writerData, opt = {}) {
  const meta = writerData?._meta || {};
  const known = opt.known || knownRealNames();
  const today = opt.today || new Date().toISOString().slice(0, 10);
  const url = meta.source_link || '';

  let s = `
Source: ${meta.source_name} (${meta.source_id})
URL: ${url}
Original title: ${writerData?.original_title}
Today's date: ${today}
`;
  if (/^https?:\/\//i.test(url)) {
    s += `This source is NEWER than your training data. Names, models, products and version numbers that appear in the original title or the URL are REAL — never flag them as invented. Flag only specifics the article ADDS that the source does not support.
`;
  }
  if (known.length) {
    s += `
=== VERIFIED-REAL NAMES (do NOT flag their existence as invented) ===
${known.join(', ')}
`;
  }
  return s;
}
