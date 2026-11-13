// ===================================================================
// FORRÁSSZINT-LEKÉPEZÉS — melyik eszköznek van jóváhagyott hivatalos súgója (TÉNYKÖZPONT 0a, 2026-11-12)
// ===================================================================
//
// MIÉRT: 11-11-i mérés: 345/377 útmutató forrás nélkül, emlékezetből készült → kitalált felületek (gombnevek,
// menüutak). A user 11-12-én jóváhagyta a forrásszinteket és a féket: ha az eszköznek nincs jóváhagyott, gépileg
// olvasható hivatalos súgója, ÚJ eszköz-útmutató nem készül (a régi fennmarad).
// Terv: docs/superpowers/specs/2026-11-12-tenykozpont-design.md (4.1 és 4.2, 0a)
//
// SPEC 4.1 — FORRÁSSZINTEK:
//   TELJES     — felhasználói súgó, lépések/feliratok igazolhatók. Már jóváhagyott: OpenAI, Anthropic, Google (Gemini,
//                Gemini Notebook, Photos), Microsoft, Mistral, Apple, Amazon (core/sugo-index.js ENGEDELY).
//                ÚJ 11-12: xAI Grok (docs.x.ai) · Perplexity (perplexity.ai/help-center) · GitHub Copilot
//                (docs.github.com/en/copilot) · Hugging Face (huggingface.co/docs) · Cohere (docs.cohere.com) ·
//                Duck.ai (duckduckgo.com/duckduckgo-help-pages) · Lumo (proton.me/support/lumo) · Z.ai (docs.z.ai) ·
//                ElevenLabs (elevenlabs.io/docs)
//   RÉSZLEGES  — csak a funkció LÉTEZÉSE igazolható, a felület nem → útmutató gomb-/menü-/ikonnév NÉLKÜL:
//                DeepSeek (api-docs.deepseek.com) · Kimi (platform.kimi.ai/docs) · MiniMax (platform.minimax.io/docs) ·
//                Brave Leo (brave.com/leo)
//   NINCS      — gépileg nem olvasható → új eszköz-útmutató NEM készül: Meta AI, Qwen, Midjourney, Picsart, Suno,
//                Kling, minden más jóváhagyás nélküli eszköz (a leképezésben a táblán kívüli név is ide esik).
//   CÉGFÜGGETLEN — se eszköz, se cég a frontmatterben („hogyan írj follow-up e-mailt MI-vel”): mehet súgó nélkül,
//                de felületet nem állíthat (ezt az Ellenőrző méri, nem ez a modul).
//
// SZABÁLY: az ESZKÖZ-egyezés erősebb a cégnél (Project Genie / Google → nincs, mert a Genie nem Gemini-súgós);
// a cég csak akkor számít, ha az eszköz üres vagy „-”. Tiszta leképezés, nincs kill-switch, nincs hálózat.
// A már élő eszköznév-illesztést a core/sugo-index.js szolgaltatok() adja — az nem változik; itt a TELJES
// piacra bővített, szintet is mondó párja van.
// ===================================================================

export const SZINT = Object.freeze({ TELJES: 'teljes', RESZLEGES: 'reszleges', NINCS: 'nincs', CEGFUGGETLEN: 'cegfuggetlen' });

const NINCS_OK = 'nincs jóváhagyott hivatalos súgó';

// kanonikus név → { szint, aliasok (kisbetűs eszköznevek), cegek (kisbetűs, .ai / " ai" nélküli cégnevek), sugo (URL-előtagok) }
// A cegek sorrendje számít a „csak cég” keresésnél: az első találat a cég fő terméke.
export const ESZKOZ_SZINT = {
  // ── TELJES: már jóváhagyott (core/sugo-index.js ENGEDELY) ─────────────────────────────────────────
  'ChatGPT':           { szint: SZINT.TELJES, aliasok: ['chatgpt', 'codex', 'sora', 'chatgpt atlas' /* a Codex, a Sora és a ChatGPT Atlas az OpenAI jóváhagyott súgójában (help.openai.com) dokumentált */], cegek: ['openai'], sugo: ['https://help.openai.com/'] },
  'Claude':            { szint: SZINT.TELJES, aliasok: ['claude', 'claude code' /* a Claude Code az Anthropic jóváhagyott súgójában (support.claude.com) dokumentált */], cegek: ['anthropic'], sugo: ['https://support.claude.com/', 'https://support.anthropic.com/'] },
  'Gemini':            { szint: SZINT.TELJES, aliasok: ['gemini', 'gemini live' /* a Gemini Live a jóváhagyott Gemini-súgóban (support.google.com/gemini) dokumentált */], cegek: ['google'], sugo: ['https://support.google.com/gemini/'] },
  'Gemini Notebook':   { szint: SZINT.TELJES, aliasok: ['gemini notebook', 'notebooklm'], cegek: [], sugo: ['https://support.google.com/gemininotebook/', 'https://support.google.com/notebooklm/'] },
  'Google Photos':     { szint: SZINT.TELJES, aliasok: ['google photos'], cegek: [], sugo: ['https://support.google.com/photos/'] },
  'Microsoft Copilot': { szint: SZINT.TELJES, aliasok: ['microsoft copilot', 'copilot', 'microsoft 365 copilot'], cegek: ['microsoft'], sugo: ['https://support.microsoft.com/'] },
  'Le Chat':           { szint: SZINT.TELJES, aliasok: ['le chat', 'le chat (mistral)', 'mistral', 'mistral ai'], cegek: ['mistral'], sugo: ['https://help.mistral.ai/'] },
  'Apple Intelligence': { szint: SZINT.TELJES, aliasok: ['apple intelligence', 'image playground', 'siri'], cegek: ['apple'], sugo: ['https://support.apple.com/'] },
  'Alexa+':            { szint: SZINT.TELJES, aliasok: ['alexa+', 'amazon alexa+', 'alexa', 'amazon alexa'], cegek: ['amazon'], sugo: ['https://www.amazon.com/gp/help/'] },

  // ── TELJES: új jóváhagyás 11-12 ─────────────────────────────────────────────────────────────────
  'Grok':              { szint: SZINT.TELJES, aliasok: ['grok'], cegek: ['xai'], sugo: ['https://docs.x.ai/'] },
  'Perplexity':        { szint: SZINT.TELJES, aliasok: ['perplexity', 'perplexity ai'], cegek: ['perplexity'], sugo: ['https://www.perplexity.ai/help-center/'] },
  'GitHub Copilot':    { szint: SZINT.TELJES, aliasok: ['github copilot'], cegek: ['github'], sugo: ['https://docs.github.com/en/copilot/'] },
  'Hugging Face':      { szint: SZINT.TELJES, aliasok: ['hugging face', 'hugging face spaces'], cegek: ['hugging face'], sugo: ['https://huggingface.co/docs/'] },
  'Cohere':            { szint: SZINT.TELJES, aliasok: ['cohere'], cegek: ['cohere'], sugo: ['https://docs.cohere.com/'] },
  'Duck.ai':           { szint: SZINT.TELJES, aliasok: ['duck.ai'], cegek: ['duckduckgo'], sugo: ['https://duckduckgo.com/duckduckgo-help-pages/'] },
  'Lumo':              { szint: SZINT.TELJES, aliasok: ['lumo'], cegek: ['proton'], sugo: ['https://proton.me/support/lumo'] },
  'Z.ai':              { szint: SZINT.TELJES, aliasok: ['z.ai'], cegek: ['z'], sugo: ['https://docs.z.ai/'] },
  'ElevenLabs':        { szint: SZINT.TELJES, aliasok: ['elevenlabs', 'scribe', 'scribe v3'] /* Scribe = az ElevenLabs beszéd-szöveg modellje, az elevenlabs.io/docs leírja */, cegek: ['elevenlabs'], sugo: ['https://elevenlabs.io/docs/'] },

  // ── RÉSZLEGES: csak a funkció léte igazolható — útmutató felület-név nélkül ────────────────────────
  'DeepSeek':          { szint: SZINT.RESZLEGES, aliasok: ['deepseek', 'deepseek chat'], cegek: ['deepseek'], sugo: ['https://api-docs.deepseek.com/'] },
  'Kimi':              { szint: SZINT.RESZLEGES, aliasok: ['kimi'], cegek: ['moonshot'], sugo: ['https://platform.kimi.ai/docs'] },
  'MiniMax Code':      { szint: SZINT.RESZLEGES, aliasok: ['minimax code', 'minimax'], cegek: ['minimax'], sugo: ['https://platform.minimax.io/docs'] },
  'Brave Leo':         { szint: SZINT.RESZLEGES, aliasok: ['brave leo'], cegek: ['brave'], sugo: ['https://brave.com/leo/'] },

  // ── NINCS: ismert, de jóváhagyott súgó nélküli eszközök (a táblán kívüli név is „nincs”) ───────────
  'Meta AI':           { szint: SZINT.NINCS, aliasok: ['meta ai'], cegek: ['meta'], sugo: [] },
  'Qwen':              { szint: SZINT.NINCS, aliasok: ['qwen', 'qwen chat'], cegek: ['alibaba'], sugo: [] },
  'Alibaba Cloud':     { szint: SZINT.NINCS, aliasok: ['alibaba cloud'], cegek: [], sugo: [] },
  'Midjourney':        { szint: SZINT.NINCS, aliasok: ['midjourney'], cegek: ['midjourney'], sugo: [] },
  'Picsart':           { szint: SZINT.NINCS, aliasok: ['picsart'], cegek: ['picsart'], sugo: [] },
  'Suno':              { szint: SZINT.NINCS, aliasok: ['suno', 'suno.ai'], cegek: ['suno'], sugo: [] },
  'Kling':             { szint: SZINT.NINCS, aliasok: ['kling'], cegek: ['kling'], sugo: [] },
  'Recraft':           { szint: SZINT.NINCS, aliasok: ['recraft'], cegek: ['recraft'], sugo: [] },
  'Ideogram':          { szint: SZINT.NINCS, aliasok: ['ideogram'], cegek: ['ideogram'], sugo: [] },
  'Zapier':            { szint: SZINT.NINCS, aliasok: ['zapier'], cegek: ['zapier'], sugo: [] },
  'Galaxy Ring':       { szint: SZINT.NINCS, aliasok: ['galaxy ring'], cegek: [], sugo: [] },
  'Upscayl':           { szint: SZINT.NINCS, aliasok: ['upscayl'], cegek: [], sugo: [] },
  'Project Genie':     { szint: SZINT.NINCS, aliasok: ['project genie'], cegek: [], sugo: [] }   // Google Labs — NEM Gemini-súgós
};

// Eszköznév: kisbetű, szóközök összevonva, a „+” megmarad. Üres és „-” = nincs megadva.
const eszkozNorm = s => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
// Cégnév: ugyanez, és a végi „.ai” / „ ai” levágva (Perplexity AI, Moonshot AI, Suno.ai, Z.ai).
const cegNorm = s => eszkozNorm(s).replace(/(\.ai| ai)$/, '').trim();
const ures = s => s === '' || s === '-';

/**
 * Egy útmutató `tool`/`company` párjára: milyen forrásszintje van.
 * Visszaad: { szint, eszkoz (kanonikus név vagy null), ok (rövid magyar indoklás a naplóhoz) }
 */
export function forrasSzint(tool, company) {
  const t = eszkozNorm(tool), c = cegNorm(company);
  const tVan = !ures(t), cVan = !ures(c);
  if (!tVan && !cVan) return { szint: SZINT.CEGFUGGETLEN, eszkoz: null, ok: 'nincs eszköz és cég megadva (cégfüggetlen útmutató)' };

  const talalat = nev => {
    const e = ESZKOZ_SZINT[nev];
    return {
      szint: e.szint, eszkoz: nev,
      ok: e.szint === SZINT.NINCS ? NINCS_OK
        : (e.szint === SZINT.TELJES ? 'teljes hivatalos súgó: ' : 'részleges hivatalos forrás: ') + e.sugo.join(', ')
    };
  };

  if (tVan) {
    // az eszköz-egyezés erősebb a cégnél: ismeretlen eszköz ismert cégnél is „nincs”
    const nev = Object.keys(ESZKOZ_SZINT).find(n => ESZKOZ_SZINT[n].aliasok.includes(t));
    return nev ? talalat(nev) : { szint: SZINT.NINCS, eszkoz: null, ok: NINCS_OK };
  }
  const nev = Object.keys(ESZKOZ_SZINT).find(n => ESZKOZ_SZINT[n].cegek.includes(c));
  return nev ? talalat(nev) : { szint: SZINT.NINCS, eszkoz: null, ok: NINCS_OK };
}

export default { SZINT, forrasSzint, ESZKOZ_SZINT };
