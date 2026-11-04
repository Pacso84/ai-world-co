// ===================================================================
// HÍR-CSOPORTOSÍTÁS — a korlátok, amiket az AI döntésére ráhúzunk
// ===================================================================
//
// USER-KÉRÉS (2026-08-18): „ne több nézőpontból legyen több cikk, hanem több
// hírből egy cikk."
//
// MIÉRT AI DÖNTI EL A ROKONSÁGOT: mérve, gépi mércével nem megy. A ROKON
// Midjourney-ötös (V8 Alpha, V8.1 Updates, Web Updates…) cím-hasonlósága
// 0,056; a FÜGGETLEN OpenAI-ötösé (igazgatótanács, incidens, tudomány…) 0,022.
// A két eset megkülönböztethetetlen — a Midjourney-hírek rokonsága
// TERMÉKISMERETBŐL látszik, nem szóegyezésből.
//
// EZ A MODUL NEM DÖNT ROKONSÁGRÓL. Azt tartatja be, hogy az AI döntése ne
// mehessen félre: legyen valódi közös téma, ne legyen túl nagy a csoport, és
// minden hír pontosan egyszer szerepeljen.
//
// A LEGFONTOSABB SZABÁLY: üres vagy értelmezhetetlen válasz → NINCS csoport,
// tehát minden hír külön cikk lesz, pontosan úgy, ahogy ma. Az összevonás
// soha nem kötelező, csak lehetőség.
// ===================================================================

export const MAX_CLUSTER = 5;    // efölött a cikk elveszti a fókuszt
export const MIN_CLUSTER = 2;    // egy elem nem csoport
export const MIN_THEME_LEN = 8;  // ennél rövidebb téma nem érdemi

// Rovatnév, nem közös téma. Ha ezeket elfogadnánk, az ítélet a nap összes
// hírét egyetlen cikké gyúrhatná — pont az ellenkezőjét annak, amit akarunk.
const ALTALANOS = new Set([
  'ai', 'ai news', 'news', 'general', 'updates', 'update', 'misc',
  'other', 'various', 'tech', 'tech news', 'announcements', 'ai updates'
]);

/** Rovatnév-e a téma (vagy üres / túl rövid)? */
export function isGenericTheme(theme) {
  const t = String(theme == null ? '' : theme).trim().toLowerCase();
  if (!t || t.length < MIN_THEME_LEN) return true;
  return ALTALANOS.has(t.replace(/[^a-z ]+/g, '').trim());
}

/**
 * Az ítélet válaszából érvényes csoportok.
 * @param {any} parsed     amit az extractJsonArray adott (bármi lehet)
 * @param {string[]} validIds  a ténylegesen függőben lévő draftok azonosítói
 * @returns {{theme: string, ids: string[]}[]}  hibánál ÜRES tömb
 */
export function parseClusterReply(parsed, validIds) {
  if (!Array.isArray(parsed)) return [];
  const ervenyes = new Set(Array.isArray(validIds) ? validIds : []);
  const felhasznalt = new Set();
  const out = [];

  for (const g of parsed) {
    if (!g || typeof g !== 'object') continue;
    const theme = String(g.theme || g.topic || '').trim();
    if (isGenericTheme(theme)) continue;

    const ids = [];
    for (const raw of Array.isArray(g.ids) ? g.ids : []) {
      const id = String(raw);
      if (!ervenyes.has(id) || felhasznalt.has(id) || ids.includes(id)) continue;
      ids.push(id);
      if (ids.length >= MAX_CLUSTER) break;      // a többi külön cikk lesz
    }
    if (ids.length < MIN_CLUSTER) continue;
    ids.forEach(id => felhasznalt.add(id));
    out.push({ theme, ids });
  }
  return out;
}

/**
 * Az írás terve: előbb a csoportok, aztán a magukban maradók.
 * MINDEN azonosító pontosan egyszer szerepel.
 * @returns {{theme: string|null, ids: string[]}[]}
 */
export function planWriteOrder(allIds, groups) {
  const mind = Array.isArray(allIds) ? allIds : [];
  const csoportos = new Set((groups || []).flatMap(g => g.ids));
  const terv = (groups || []).map(g => ({ theme: g.theme, ids: [...g.ids] }));
  for (const id of mind) if (!csoportos.has(id)) terv.push({ theme: null, ids: [id] });
  return terv;
}

export default {
  MAX_CLUSTER, MIN_CLUSTER, MIN_THEME_LEN,
  isGenericTheme, parseClusterReply, planWriteOrder
};
