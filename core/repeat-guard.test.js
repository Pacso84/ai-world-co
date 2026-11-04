// ===================================================================
// ISMÉTLÉS-ŐR — tesztek
// ===================================================================
//
// ELŐZMÉNY (2026-08-25, a user vette észre): „van cikk agent több cikkben
// is szerepel". Mérve: 797 cikkből 4-5% ismétel egy korábbit. A hír-íróban
// EGYÁLTALÁN nem volt ismétlés-ellenőrzés, az útmutató-őr referenciája meg
// csak más útmutató volt.
//
// ⚠️ AZ IRÁNY ITT DÖNTŐ. A hír romlandó, és ugyanarról a témáról egy valódi
// FEJLEMÉNY jogos hír, nem ismétlés:
//     08-11  „ChatGPT Is Testing Ads"
//     08-19  „ChatGPT Ads Are Expanding Across Europe"
// Túl szigorú kapu pont ezeket némítaná el. Ezért a hasonlóság ELŐTT három
// kizárás fut, mind a SAJÁT METAADATUNKBÓL — nem találgatásból.
//
// MÉRVE 42 kézzel osztályozott páron (13 valódi ismétlés, 29 jogos):
//   a három kizárás a 29 jogosból 15-öt kiejt, a 13 ismétlésből EGYET SEM
//   utána cosine 0.92: 12/12 ismétlés elkapva, 2 hamis riasztás
// ===================================================================

import assert from 'assert/strict';
import { kizart, isDigest, REPEAT_COSINE } from './repeat-guard.js';

let pass = 0;
const t = (n, f) => { f(); pass++; console.log('  ✅ ' + n); };
console.log('🧪 ismétlés-őr\n');

const cikk = (o = {}) => ({ slug: 'a-slug', cim: 'Egy cím', tool: '', type: 'news', source_news: '', ...o });

// ── 1. KIZÁRÁS: heti összefoglaló ───────────────────────────────────
//
// A heti digest címe SZÁNDÉKOSAN mindig ugyanaz, csak a dátum más. Mérve:
// a beágyazás 0.989-et adott két digestre — a LEGMAGASABB pontszámot az
// egész halmazban. Enélkül a kizárás nélkül minden héten elnémítanánk.

t('a heti összefoglalót felismeri a slugból és a címből is', () => {
  assert.ok(isDigest(cikk({ slug: 'this-week-in-ai-the-5-stories-that-matter-august-16-2026' })));
  assert.ok(isDigest(cikk({ slug: 'valami', cim: 'This Week in AI: The Stories That Matter (August 23, 2026)' })));
});

t('a rendes cikket NEM nézi összefoglalónak', () => {
  assert.ok(!isDigest(cikk({ slug: 'what-is-agentic-ai', cim: 'What Is Agentic AI?' })));
  assert.ok(!isDigest(cikk({ cim: 'AI News This Week Explained for Beginners' })), 'a puszta „this week" kevés');
});

t('🚫 két heti összefoglaló SOHA nem ismétlés', () => {
  const a = cikk({ slug: 'this-week-in-ai-12-july', cim: 'This Week in AI: The 5 Stories That Matter (12 July 2026)' });
  const b = cikk({ slug: 'this-week-in-ai-19-july', cim: 'This Week in AI: The 5 Stories That Matter (19 July 2026)' });
  assert.equal(kizart(a, b), 'heti összefoglaló');
});

// ── 2. KIZÁRÁS: eltérő eszköz ───────────────────────────────────────
//
// „Practice Job Interview Questions with DeepSeek" / „…with Grok" / „…with
// Qwen" — ez SZÁNDÉKOS: a /tools oldal erre épül, és a user 08-17-én
// kimondta, hogy a nem-LLM útmutatók is maradnak. Ezeket törölni a saját
// rendszerünket rontaná el.

t('🚫 ugyanaz a feladat MÁS eszközzel nem ismétlés', () => {
  const a = cikk({ tool: 'DeepSeek', cim: 'Practice Job Interview Questions with DeepSeek' });
  const b = cikk({ tool: 'Grok', cim: 'Practice job interview questions with Grok' });
  assert.equal(kizart(a, b), 'eltérő eszköz');
});

t('az eszköz-összevetés nem érzékeny a kis/nagybetűre és a szóközre', () => {
  assert.equal(kizart(cikk({ tool: ' ChatGPT ' }), cikk({ tool: 'chatgpt' })), null,
    'ugyanaz az eszköz → NINCS kizárás, mehet a hasonlóság-vizsgálat');
});

t('⚠️ HIÁNYZÓ eszköz-mező nem kizárás — a hiány nem bizonyíték', () => {
  // Ha az egyik cikknél nincs kitöltve a tool, abból NEM következik, hogy
  // más eszközről szól. A kizárás csak akkor jár, ha MINDKETTŐ ki van
  // töltve ÉS eltér. (Ugyanaz az elv, mint a beágyazásnál: a „nem tudom"
  // nem lehet „nem".)
  assert.equal(kizart(cikk({ tool: '' }), cikk({ tool: 'Grok' })), null);
  assert.equal(kizart(cikk({ tool: 'Grok' }), cikk({ tool: '' })), null);
  assert.equal(kizart(cikk({ tool: '' }), cikk({ tool: '' })), null);
});

// ── 3. KIZÁRÁS: szándékos hír+útmutató páros ────────────────────────
//
// A párosító agent SZÁNDÉKOSAN ír útmutatót egy híshez, és a kapcsolatot
// a `_meta.source_news` mező RÖGZÍTI. Ez nem heurisztika: pontos hivatkozás.

// ⚠️ ELSŐRE ELVÉTETTEM: azt hittem, a `source_news` a forrás SLUGJA. Valójában
// objektum, a forrás-cikk FÁJLNEVÉVEL: { file: "ARTICLE_...json", title: "..." }.
// Az összevetésem sosem talált, és a Picsart-páros hamis riasztást kapott.
// A `title` az EREDETI forrás-cím, nem a mi átírt címünk — arra hasonlítani
// szintén nem szabad. A `file` a pontos hivatkozás.
t('🚫 a párosított hír+útmutató nem ismétlés (source_news OBJEKTUM)', () => {
  const F = 'ARTICLE_2026-08-14T01-01-38-197Z_picsart_Picsart_AI_Playground.json';
  const hir = cikk({ slug: 'picsart-brings-ai-playground', file: F, type: 'news' });
  const utm = cikk({
    slug: 'how-to-use-picsart-ai-playground', type: 'guide',
    source_news: { file: F, title: 'Picsart AI Playground is now on desktop for Mac and Windows' }
  });
  assert.equal(kizart(hir, utm), 'szándékos hír+útmutató páros');
  assert.equal(kizart(utm, hir), 'szándékos hír+útmutató páros', 'a sorrend ne számítson');
});

t('a régi, sima szöveges source_news is működik', () => {
  const hir = cikk({ slug: 'valami-hir', type: 'news' });
  const utm = cikk({ slug: 'valami-utmutato', type: 'guide', source_news: 'valami-hir' });
  assert.equal(kizart(hir, utm), 'szándékos hír+útmutató páros');
});

t('két FÜGGETLEN cikk nem lesz párossá attól, hogy az egyik útmutató', () => {
  const hir = cikk({ slug: 'valami-hir', file: 'A.json', type: 'news' });
  const utm = cikk({ slug: 'valami-utmutato', type: 'guide', source_news: { file: 'MAS.json', title: 'Más' } });
  assert.equal(kizart(hir, utm), null);
});

t('📌 a HÍR-ÍRÓ kikapcsolja a párosítás-kizárást — mérve jobb úgy', () => {
  // A hír ELŐBB születik, mint a hozzá írt útmutató, tehát visszafelé mutató
  // párosítás ott nem jelent semmit. Mérve hír-jelöltekre:
  //   párosítás-kizárással: 8/9 elkapva · kizárás NÉLKÜL: 9/9 · ugyanannyi hamis
  const F = 'ARTICLE_forras.json';
  const hir = cikk({ slug: 'hir', file: F, type: 'news' });
  const utm = cikk({ slug: 'utm', type: 'guide', source_news: { file: F, title: 'x' } });
  assert.equal(kizart(hir, utm), 'szándékos hír+útmutató páros');
  assert.equal(kizart(hir, utm, { pairing: false }), null, 'kikapcsolva nem zár ki');
});

t('a kikapcsolás CSAK a párosítást érinti, a másik kettőt nem', () => {
  const a = cikk({ slug: 'this-week-in-ai-1' }), b = cikk({ slug: 'this-week-in-ai-2' });
  assert.equal(kizart(a, b, { pairing: false }), 'heti összefoglaló');
  assert.equal(kizart(cikk({ tool: 'Grok' }), cikk({ tool: 'Qwen' }), { pairing: false }), 'eltérő eszköz');
});

t('⚠️ az EREDETI forrás-cím nem elég a párosításhoz', () => {
  // A source_news.title a forrás sajtóközleményének címe; a mi cikkünk címe
  // átírt. Ha a cím alapján párosítanánk, sosem egyeznének — vagy rosszul.
  const hir = cikk({ slug: 'picsart-brings-ai-playground', file: 'A.json', cim: 'Picsart Brings Its AI Playground to Your Desktop' });
  const utm = cikk({ slug: 'utm', type: 'guide', source_news: { file: 'B.json', title: 'Picsart Brings Its AI Playground to Your Desktop' } });
  assert.equal(kizart(hir, utm), null, 'a fájlnév dönt, nem a cím');
});

// ── ami NEM kizárás ─────────────────────────────────────────────────

t('két hasonló hír kizárás nélkül átmegy a hasonlóság-vizsgálatra', () => {
  const a = cikk({ slug: 'what-agentic-ai-means', cim: "What 'Agentic AI' Means for Your Work" });
  const b = cikk({ slug: 'what-is-agentic-ai', cim: 'What Is Agentic AI? A Plain-English Guide' });
  assert.equal(kizart(a, b), null);
});

t('hiányzó/hibás bemenetre nem borul', () => {
  for (const x of [null, undefined, {}]) {
    assert.doesNotThrow(() => kizart(x, cikk()));
    assert.doesNotThrow(() => kizart(cikk(), x));
  }
});

// ── a küszöb ────────────────────────────────────────────────────────

t('📌 a küszöb MÉRT érték, és egy helyen él', () => {
  // 42 kézzel osztályozott páron mérve. 0.92-nél: 12/12 ismétlés elkapva,
  // 2 hamis riasztás 14-ből. 0.94-nél már 4 valódi ismétlés csúszna át.
  assert.equal(REPEAT_COSINE, 0.92);
});

console.log('\n✅ repeat-guard.test: mind a ' + pass + ' eset rendben');
