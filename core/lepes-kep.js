// ===================================================================
// A LÉPÉS MELLETTI IKON KIVÁLASZTÁSA (2026-10-23)
// ===================================================================
//
// MIÉRT: a user: „a képek valahogy jobban tükrözzék a lépéseket, valahol
// céltábla van! … nézd meg az »Így fogod csinálni« részt is, mert nem minden
// kép illik bele a lépésbe!” Mérve 10-23 (2141 lépés): 53% kóddal rajzolt
// vázlatot kap (core/guide-sketch.js — az marad), 32% odaillő ikont, 15%
// (327) KÉNYSZER-ikont: ha a cím nem illett semmire, sorban kiosztott ikon
// jött (az első a céltábla), és az oldalon belüli ismétlés-tiltás az odaillő
// ikont is lecserélte („Verify facts” → céltábla a ✅ helyett).
//
// AZ ÚJ SZABÁLY: odaillő ikon, vagy SEMMI. Ismétlődhet (két ellenőrző lépés
// mellett két ✅ — ez igaz), de kitalált kép nem kerül ki. Ha a cím nem
// dönt, a lépés ELSŐ MONDATA dönt — de ott csak a konkrét cselekvés-szabályok
// számítanak (a „start”, „know”, „goal” szavak egy mondatban bármit jelenthetnek).
// null → a lépés mellett nincs kép (a szöveg kitölti a helyet), a felső
// „Így fogod csinálni” sávban a lépés sorszáma áll.
// Korábban a website/build.js-ben élt (stepArtKey + STEP_ART_CYCLE).
// ===================================================================

// Lépéscím → ikon (specifikusabb előbb!). A `cim` jelölésűek CSAK a címre érvényesek.
const SZABALYOK = [
  [/voice|speak|talk|audio|listen|record|dictat|sound|microphone/i, 'mic'],
  [/image|picture|photo|visual|drawing|artwork|illustrat|generate an image|create an image/i, 'image'],
  // 10-24 este — ÚJ IKONOK (a meglévő 14 mellé; Cloudflare Flux, ugyanabban a 3D stílusban): élőben a
  // „Compare two options” csúszkát, a „Plan a trip as a … table” céltáblát kapott
  [/compar|side by side|side-by-side|\bvs\.?\s(?!code)|versus|pros and cons|weigh (up )?(the |your )?options/i, 'compare'],
  [/\btables?\b|\bgrid\b|\bcharts?\b|\bgraph\b|columns?\b|spreadsheet layout/i, 'table'],
  [/\bweek(ly)?\b|\bdaily\b|schedule|calendar|day-by-day|routine|itinerary|timeline|\bplan (a|your|the) (week|day|month|trip|meals|dinners)/i, 'calendar'],
  [/search|find\b|explore|browse|discover|look up|look for|locate|\bspot\b|research|sources?/i, 'search'],
  [/privac|secur|safe|protect|your data|be careful|permission|consent|sensitive/i, 'shield'],
  [/api key|secret key|\bkey\b|password|token/i, 'login'],
  [/setting|configur|option|preferenc|customi|control|toggle|enable|turn (it )?on|choose a model|pick a model|\bpick (?!what)|\bselect\b/i, 'sliders'],
  [/save|export|download|share|copy|publish|send it to/i, 'download'],
  [/send|run\b|submit|generat|press enter|hit enter|press send|get your (answer|result|response)/i, 'plane'],
  [/review|check|refine|edit\b|improve|fix\b|adjust|iterate|verif|proofread|polish|double-check/i, 'check'],
  [/upload|attach|\bfiles?\b|document|\bpdf\b|spreadsheet|\bsheet\b|excel|\bcsv\b/i, 'doc'],
  [/format|structure|outline|template|organi|layout|section|make a list|bullet|summar/i, 'doc'],
  // a „list” csak CÍMBEN dönt: egy mondatban („type a short list…”) a fő cselekvés más lehet
  [/\blists?\b|inventory|checklist|shopping/i, 'doc', 'cim'],
  [/context|detail|background|be specific|example|describe|explain|add (more )?|include|provide|give it/i, 'layers'],
  [/type|write|prompt|ask\b|message|enter your|chat|\btell\b|input|conversation|question|your request|paste/i, 'chat'],
  [/define|goal|what you want|decide|choose what|pick what|plan\b|aim\b|outcome|result you|identify/i, 'target', 'cim'],
  [/tip|note|remember|understand|learn|know\b|why\b|what (it|this) means|matters|brainstorm|\bideas?\b/i, 'bulb', 'cim'],
  [/open\b|start\b|begin|sign ?up|sign ?in|account|log ?in|install|get started|access|set ?up|first/i, 'login', 'cim'],
];

// Többnyelvű kulcsszavak (hu/es) — a fordított fejlécekhez is témára találjon
const SZABALYOK_I18N = [
  [/hang\b|mikrofon|diktál|hangosan|\bvoz\b|dicta/i, 'mic'],
  [/\bkép|fotó|\bimagen|\bfoto\b/i, 'image'],
  [/hasonlítsd|összehasonl|egymás mellett|compara|comparar|lado a lado/i, 'compare'],
  [/\brács|diagram|\btabla\b|cuadrícula|gráfico/i, 'table'],
  [/\bheti\b|\bhét\b|naptár|napirend|ütemterv|menetrend|\bsemana|calendario|horario|itinerario/i, 'calendar'],
  [/keres|kutat|búsq|busca/i, 'search'],
  [/bizton|adatvéd|privát|magánél|segur|privacidad/i, 'shield'],
  [/beállít|testreszab|kapcsold|ajusta/i, 'sliders'],
  [/ments|mentsd|letölt|megoszt|másold át|másold ki|guarda|descarg|comparte|\bcopia/i, 'download'],
  [/küldd?\b|futtat|envía|enviar/i, 'plane'],
  [/ellenőriz|finomít|javítsd|szerkeszt|átnéz|revisa|corrig/i, 'check'],
  [/feltölt|töltsd fel|fájl|dokumentum|táblázat|\bsube\b|subir|archivo|documento|hoja de cálculo/i, 'doc'],
  [/formáz|szerkezet|vázlat|sablon|listá|estructura|formato|plantilla/i, 'doc'],
  [/csevegés|beszélget|írd be|gépeld|írj\b|mondd el|mondd meg|kérd meg|kérdezd|másold be|illeszd be|escribe|conversac|\bdile\b|pídele|pregunta|\bpega/i, 'chat'],
  [/fiók|belép|jelentkez|kulcs\b|cuenta|inicia sesión/i, 'login', 'cim'],
  [/ötlet|\bidea/i, 'bulb', 'cim'],
  [/\bcél|objetivo/i, 'target', 'cim']
];

function keres(szoveg, csakCselekves) {
  const s = String(szoveg || '');
  if (!s.trim()) return null;
  for (const lista of [SZABALYOK, SZABALYOK_I18N]) {
    for (const [re, k, hatokor] of lista) {
      if (csakCselekves && hatokor === 'cim') continue;
      if (re.test(s)) return k;
    }
  }
  return null;
}

/** Odaillő ikon-kulcs a lépés címéből, annak híján az első mondatából — vagy null. */
export function lepesKepKulcs(cim, elsoMondatSzoveg = '') {
  return keres(cim, false) || keres(elsoMondatSzoveg, true);
}

/** Csak az első mondatból (konkrét cselekvés-szabályok) — az ismétlés-töréshez. */
export function elsoMondatKulcs(mondat) {
  return keres(mondat, true);
}

/**
 * LEGFELJEBB 2 EGYFORMA EGYMÁS UTÁN (10-24 este, élőben: a vacsoraterv-útmutató sávjában 5× 💬).
 * A harmadik egyformától az `alternativak[i]` (a lépés első mondatából) lép a helyére, HA van és MÁS;
 * különben marad az ismétlés — kitalált kép soha. A null (nincs kép) nem számít ismétlésnek.
 */
export function ismetlesTores(kulcsok, alternativak = []) {
  const ki = [...(kulcsok || [])];
  for (let i = 2; i < ki.length; i++) {
    if (ki[i] && ki[i] === ki[i - 1] && ki[i] === ki[i - 2]) {
      const alt = alternativak[i];
      if (alt && alt !== ki[i]) ki[i] = alt;
    }
  }
  return ki;
}

/** A lépés-markdown első mondata, jelölések nélkül. */
export function elsoMondat(md) {
  const s = String(md || '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^.*?[.!?](?=\s|$)/);
  return m ? m[0] : s;
}

export default { lepesKepKulcs, elsoMondat, elsoMondatKulcs, ismetlesTores };
