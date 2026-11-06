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
// ===================================================================

import { knownRealNames } from './truth-gate.js';

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
