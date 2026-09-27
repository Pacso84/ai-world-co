// ===================================================================
// AZ ÚTMUTATÓ TÉNYANYAGA: a SAJÁT, már ellenőrzött híreink (2026-09-27)
// ===================================================================
//
// MIÉRT: az útmutató-író EGYETLEN tényt sem kapott — csak a címet és egy
// mondatnyi irányt. 489 témából 45 kötődött hírhez, de még azok sem kapták
// meg a hír szövegét (`source_news` csak azonosító volt). A gombokat,
// menüket, elérhetőséget a modell a saját, elavult tudásából írta
// (08-17: 321 útmutatóból 321 forrás nélkül, 48% konkrét gombot nevezett).
// A 08-17-i irány: „ne szigorúbb ellenőrzés — az útmutató-készítő kapja meg
// a SAJÁT híreinket". User 09-27: „1 mehet".
//
// A hírek már átmentek a hitelesség-kapun, és 09-27 óta a hivatalos
// kivonat (`_meta.source_snippet`) is mellettük van.
//
// Tiszta függvény: a fájlolvasás a hívóé (agents/guide/agent.js).
// ===================================================================

const NAP = 24 * 60 * 60 * 1000;
export const HIR_MAX = 2;
export const HIR_KOR_NAP = 90;   // = a hír-megőrzés (config news_keep_days: 90) — régebbi hír úgysem létezik
const TORZS_MAX = 1100;
const KIVONAT_MAX = 800;

const esc = s => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const MIN_KOZOS = 1;   // a címben/Röviden-dobozban egy tartalmas közös szó már erős jel
const STOP = new Set(['with', 'your', 'from', 'that', 'this', 'into', 'what', 'when', 'using', 'how', 'use', 'for', 'the', 'and',
  'minutes', 'minute', 'first', 'easy', 'quick', 'simple', 'free', 'step', 'steps', 'guide', 'beginner', 'beginners', 'everyday',
  'without', 'about', 'more', 'less', 'just', 'make', 'get', 'can', 'will', 'them', 'they', 'their', 'there', 'where', 'which',
  'app', 'apps', 'tool', 'tools', 'assistant', 'using', 'help', 'helps', 'turn', 'into', 'new', 'now', 'best', 'every',
  // 09-27: általános igék/szavak, amik szinte minden hírben ott vannak („plain English", „explain")
  'read', 'write', 'writing', 'explain', 'explained', 'plain', 'english', 'long', 'draft', 'answer', 'answers', 'question',
  'questions', 'daily', 'task', 'tasks', 'work', 'phone', 'does', 'mean', 'means', 'practical', 'today', 'people', 'like',
  'need', 'know', 'things', 'thing', 'ways', 'start', 'started', 'getting', 'work']);

/** A téma tartalmas szavai (≥4 betű, stop-szó és az eszköz/cég neve nélkül), egyszerű tővel. */
function kulcsszavak(szoveg, kizart = []) {
  // A név MINDEN szava kiesik („Hugging Face" → hugging, face) — különben a
  // kétszavas eszköznév egymagában két „közös szót" adna minden hírrel.
  const ki = new Set(kizart.filter(Boolean).flatMap(s => s.toLowerCase().split(/[^a-z0-9+]+/)).filter(Boolean));
  return [...new Set(String(szoveg).toLowerCase().match(/[a-z][a-z0-9+-]{3,}/g) || [])]
    .filter(w => !STOP.has(w) && !ki.has(w))
    .map(w => w.replace(/(ing|ers|er|es|s)$/, ''))
    .filter(w => w.length >= 4);
}

const ISMERT_HOSSZABB = ['GitHub Copilot', 'Microsoft 365 Copilot', 'Copilot Studio', 'Google Photos', 'Gemini Live', 'Meta AI glasses'];

/** A cím egy MÁSIK, hosszabb nevű termékről szól-e („GitHub Copilot" a „Copilot" témánál)? */
function masikTermek(cim, tool, hosszabbNevek) {
  const c = String(cim || '').toLowerCase();
  if (!hosszabbNevek.some(n => c.includes(n.toLowerCase()))) return false;
  // ha a cím a sima nevet is önállóan említi, maradhat
  const maradek = hosszabbNevek.reduce((s, n) => s.split(n.toLowerCase()).join(' '), c);
  return !new RegExp(`(^|[^a-z0-9])${esc(tool.toLowerCase())}([^a-z0-9]|$)`).test(maradek);
}

/** A hír „In short" doboza (a lényeg egy mondatban). */
function rovidenDoboz(md) {
  return (String(md || '').match(/^>\s*\*\*In short:?\*\*:?\s*(.+)$/mi) || [])[1] || '';
}

/** Hány témaszó fordul elő a hír szövegében. */
function kozosSzo(szavak, szoveg) {
  const s = String(szoveg).toLowerCase();
  return szavak.filter(w => s.includes(w)).length;
}

/** A cikk törzse frontmatter és kép nélkül, röviden. */
function torzs(md) {
  return String(md || '')
    .replace(/^---[\s\S]*?---\s*/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * A témához illő hírek (legfeljebb HIR_MAX), a legrelevánsabb elöl.
 * @param {object} topic   útmutató-téma ({ title, tool, company, source_news })
 * @param {Array}  hirek   [{ file, title, tool, company, publishedAt, md, snippet }] — CSAK hírek
 * @param {number} most    időbélyeg (teszthez)
 */
export function valasztHireket(topic, hirek, most = Date.now(), minKozos = MIN_KOZOS) {
  const lista = Array.isArray(hirek) ? hirek : [];
  const ki = [];
  // 1) a párosított hír (a pairing agent kötötte hozzá) — kortól függetlenül
  const par = topic?.source_news && (typeof topic.source_news === 'string' ? topic.source_news : topic.source_news.file);
  if (par) {
    const h = lista.find(x => x.file === par);
    if (h) ki.push(h);
  }
  // 2) ugyanarról az eszközről/cégről szóló friss hírek — DE csak ha a TÉMÁHOZ
  //    is közük van (09-27: a „LinkedIn-poszt Claude-dal" témához az „Claude
  //    új enzimet talált" hír jött — ugyanaz az eszköz, semmi köze a témához).
  const tool = String(topic?.tool || '').trim();
  const ceg = String(topic?.company || '').trim();
  const temaSzavak = kulcsszavak(`${topic?.title || ''} ${topic?.angle || ''}`, [tool, ceg]);
  // A hírekben előforduló, a mi eszközünk nevét MAGÁBAN FOGLALÓ hosszabb nevek
  // („GitHub Copilot", „Microsoft 365 Copilot") — ezek MÁSIK termékek.
  const hosszabbNevek = [...new Set([...lista.map(x => String(x.tool || '')), ...ISMERT_HOSSZABB])]
    .filter(n => n && tool && n.toLowerCase() !== tool.toLowerCase() && n.toLowerCase().includes(tool.toLowerCase()));
  if (tool || ceg) {
    const rx = tool ? new RegExp(`(^|[^A-Za-z0-9])${esc(tool)}([^A-Za-z0-9]|$)`, 'i') : null;
    const jeloltek = lista
      .filter(x => !ki.includes(x))
      .filter(x => most - Date.parse(x.publishedAt || 0) <= HIR_KOR_NAP * NAP)
      // PONTOSAN ugyanaz az eszköz („Copilot" ≠ „GitHub Copilot"; a címbeli
      // előfordulás csak akkor számít, ha a hírnek nincs saját eszköz-mezője)
      .filter(x => (tool && (String(x.tool).toLowerCase() === tool.toLowerCase()
        || (!x.tool && rx && rx.test(x.title) && !masikTermek(x.title, tool, hosszabbNevek))))
        || (!tool && ceg && String(x.company).toLowerCase() === ceg.toLowerCase()))
      // a közös szó a hír CÍMÉBEN vagy RÖVIDEN-dobozában legyen, ne a szöveg mélyén
      .map(x => ({ x, pont: kozosSzo(temaSzavak, `${x.title} ${rovidenDoboz(x.md)}`) }))
      .filter(o => o.pont >= minKozos)
      .sort((a, b) => b.pont - a.pont || String(b.x.publishedAt).localeCompare(String(a.x.publishedAt)))
      .map(o => o.x);
    for (const j of jeloltek) { if (ki.length >= HIR_MAX) break; ki.push(j); }
  }
  return ki.slice(0, HIR_MAX);
}

/** A promptba kerülő blokk; ha nincs illő hír, üres szöveg. */
export function hirBlokk(valasztott) {
  if (!valasztott || !valasztott.length) return '';
  const reszek = valasztott.map((h, i) => {
    const kiv = String(h.snippet || '').trim().slice(0, KIVONAT_MAX);
    return `[${i + 1}] "${h.title}" (published ${String(h.publishedAt || '').slice(0, 10)})\n`
      + `${torzs(h.md).slice(0, TORZS_MAX)}`
      + (kiv ? `\nOfficial announcement excerpt: ${kiv}` : '');
  });
  return `\n\nOUR OWN VERIFIED NEWS ABOUT THIS TOOL (your FACT BASE):
Use these for facts — feature names, what it can do, who can use it, availability, plans.
Name a button, menu or screen ONLY if these texts name it; otherwise describe it generically ("look for …").
Do not copy sentences; do not link or cite them.

${reszek.join('\n\n')}`;
}

/**
 * A HÍREK betöltése (csak hír, útmutató nem) — EGY példány, az útmutató-író és
 * a frissítő is ezt hívja. A fájlrendszert a hívó adja (tesztelhető).
 */
export function hirekBetolt({ dir, fs, join, utmutatoE }) {
  const fm = (md, k) => ((String(md || '').split('\n').find(l => l.startsWith(k + ':')) || '')
    .slice(k.length + 1).trim().replace(/^["']|["']$/g, ''));
  const ki = [];
  let fajlok = [];
  try { fajlok = fs.readdirSync(dir).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json')); } catch { return ki; }
  for (const f of fajlok) {
    try {
      const d = JSON.parse(fs.readFileSync(join(dir, f), 'utf-8'));
      if (utmutatoE(f, d)) continue;
      const md = d.article_markdown || '';
      ki.push({
        file: f, title: fm(md, 'title') || d.original_title || '',
        tool: d._meta?.tool || fm(md, 'tool'), company: d._meta?.company || fm(md, 'company'),
        publishedAt: d._meta?.published_at || '', md, snippet: d._meta?.source_snippet || ''
      });
    } catch { /* sérült cikk: kihagyjuk */ }
  }
  return ki;
}

/**
 * „MI ÚJSÁG MOST" blokk a TÉMAVÁLASZTÓNAK (2026-09-27). A 56 napos forgalmi
 * naplóban a leghosszabb életű útmutató (13 nap, 33 belépő) egy ÉPP DIVATOS
 * dologról szólt; a többi 1–2 nap alatt elhalt. A témaválasztó eddig csak
 * „örökzöld" témát kért, és a friss híreinket nem is látta.
 * @returns {string} üres, ha nincs friss hír
 */
export function trendBlokk(hirek, most = Date.now(), { napok = 14, db = 8 } = {}) {
  const frissek = (hirek || [])
    .filter(h => most - Date.parse(h.publishedAt || 0) <= napok * NAP)
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .slice(0, db);
  if (!frissek.length) return '';
  const sorok = frissek.map(h => {
    const rov = (String(h.md || '').match(/^>\s*\*\*In short:?\*\*:?\s*(.+)$/mi) || [])[1] || '';
    return `- ${h.title}${h.tool ? ` [${h.tool}]` : ''}${rov ? ` — ${rov.slice(0, 160)}` : ''}`;
  });
  return `\n\nWHAT IS NEW RIGHT NOW (our own verified news from the last ${napok} days):
${sorok.join('\n')}
Make 1-2 of your topics a hands-on "try this new thing" guide built on one of these (use the tool/company it names, and only what the news says it can do); keep the rest evergreen.`;
}

export default { valasztHireket, hirBlokk, hirekBetolt, trendBlokk, HIR_MAX, HIR_KOR_NAP };
