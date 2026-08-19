// ===================================================================
// ÖSSZEVONÓ FUTTATÓ — több hírből egy cikk
// ===================================================================
//
// USER-KÉRÉS (2026-08-18): „ne több nézőpontból legyen több cikk, hanem több
// hírből egy cikk."
//
// MIÉRT A core/-BAN (2026-08-19, user kérdésére): ez a rész eredetileg az
// agents/iro/agent.js-ben volt, ahol NEM lehet tesztelni — az agents/ alól
// tilos importálni, mert 21 agent feltétel nélkül hívja a main()-t, tehát a
// puszta import valódi pénzt költene és publikálna. Így épp az a 45 sor
// maradt fedezetlenül, ami NÉMÁN üres tömböt adhat örökre.
//
// Az AI-hívás és a lemezolvasás ezért PARAMÉTER. A modul maga nem tud sem a
// fájlrendszerről, sem az OpenRouterről — ezért végigjárható hálózat és pénz
// nélkül.
//
// A ROKONSÁGOT AI DÖNTI EL, mert gépi mércével nem megy: a ROKON Midjourney-ötös
// cím-hasonlósága 0,056, a FÜGGETLEN OpenAI-ötösé 0,022 — megkülönböztethetetlen.
// A korlátokat viszont NEM az AI szabja: azok a core/draft-clusters.js-ben élnek.
//
// ⚠️ ALAPSZABÁLY: BÁRMILYEN hiba → üres csoport, vagyis a MAI viselkedés
// (minden hír külön cikk). Az összevonás soha nem kötelező, csak lehetőség.
// ===================================================================

import { extractJsonArray } from './extract-json.js';
import { parseClusterReply, MAX_CLUSTER } from './draft-clusters.js';

const SNIPPET_MAX = 180;   // a döntéshez a cím + pár sor elég; a tokent nem szórjuk

export const CLUSTER_SYSTEM_PROMPT = `You group tech-news items that are about THE SAME underlying story or product release.

Group items ONLY when a single article could cover them together without losing focus.
Do NOT group items just because they come from the same company or the same day.
Five unrelated announcements from one company are FIVE topics, not one.

Respond with {"groups": [...]}. Each group: {"theme": "<short specific shared topic>", "ids": ["<id>", ...]}.
- "theme" must name the actual shared subject (e.g. "Midjourney V8 release"), never a section name like "AI news".
- Include at most ${MAX_CLUSTER} ids per group, at least 2.
- Items that do not clearly belong with another item MUST be left out entirely.
- If nothing belongs together, respond with {"groups": []}.`;

/**
 * Melyik függőben lévő hírek szólnak ugyanarról?
 *
 * @param {object}   o
 * @param {string[]} o.ids        a függőben lévő draftok azonosítói (fájlnevek)
 * @param {(id:string)=>object} o.readDraft  egy draft beolvasása; DOBHAT, ha nincs meg
 * @param {Function} o.ask        a modell-hívó (core/ai-router.js `ask`-je)
 * @param {boolean} [o.enabled]   VÉSZKAPCSOLÓ — false esetén AI-hívás sincs
 * @returns {Promise<{groups: {theme:string, ids:string[]}[], costUsd: number}>}
 */
export async function clusterDrafts({ ids, readDraft, ask, enabled = true }) {
  const ures = { groups: [], costUsd: 0 };

  // 🔌 VÉSZKAPCSOLÓ. MIÉRT ITT: a core/ai-router.js NEM nézi az
  // agents.<név>.enabled mezőt — a config „enabled: false"-a magától SEMMIT nem
  // kapcsol ki. A háznál minden kill-switch kézzel van bekötve (vö.
  // agents/video/agent.js:49). Enélkül a mező csak dísz lenne.
  if (enabled === false) return ures;

  const lista = Array.isArray(ids) ? ids : [];
  if (lista.length < 2) return ures;             // egy hírt nincs mivel összevonni

  const tetelek = [];
  for (const id of lista) {
    try {
      const d = readDraft(id);
      tetelek.push({
        id,
        title: d?.title || '',
        snippet: (d?.content_snippet || '').slice(0, SNIPPET_MAX),
        source: d?._meta?.source_name || ''
      });
    } catch { /* olvashatatlan draft: kimarad a csoportosításból */ }
  }
  if (tetelek.length < 2) return ures;

  // A FORRÁS IS BEMEGY: ugyanazt a bejelentést több forrás is hozhatja — a
  // Claude Opus 5-öt három forrás jelentette be ugyanazon a napon, abból három
  // cikkünk lett. A kereszt-forrású csoportosítás így ingyen adódik.
  const felsorolas = tetelek.map(it =>
    `id: ${it.id}\n  source: ${it.source}\n  title: ${it.title}\n  summary: ${it.snippet}`
  ).join('\n\n');

  let valasz;
  try {
    valasz = await ask(
      `Group these ${tetelek.length} news items.\n\n${felsorolas}`,
      { agentName: 'cluster', systemPrompt: CLUSTER_SYSTEM_PROMPT, maxTokens: 2000, jsonMode: true }
    );
  } catch {
    return ures;                                  // hálózati hiba: írunk tovább, ahogy ma
  }
  if (!valasz) return ures;

  // A KÖLTSÉG AKKOR IS JÁR, HA A VÁLASZ SZEMÉT: a tokent kifizettük. Elnyelni
  // annyi lenne, mint eltitkolni a költést — a napi keret-őr pont ezen múlik.
  const costUsd = Number(valasz.costUsd) || 0;
  try {
    const groups = parseClusterReply(extractJsonArray(valasz.text), tetelek.map(t => t.id));
    return { groups, costUsd };
  } catch {
    return { groups: [], costUsd };               // NEM okoskodunk: mai viselkedés
  }
}

export default { clusterDrafts, CLUSTER_SYSTEM_PROMPT };
