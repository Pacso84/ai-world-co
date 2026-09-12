// ===================================================================
// TESZT — közösségi sor: cikk-egyeztetés + frissesség (két poszter, egy példány)
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// A MIÉRT: az agents/social/poster.js (Facebook) és az
// agents/social/buffer-poster.js (Threads · Instagram) ugyanazt a
// slug-egyeztetést és frissesség-vágást KARAKTERRE LEMÁSOLVA hordta.
// A slug-egyeztetés egyszer már 18 friss posztot nyelt el némán (2026-08-02).
// Részletek: core/social-published.js fejléce.
//
// HÁROM RÉSZ:
//   (a) egységteszt kis mintákon — köztük a „rögzített slug ≠ címből képzett"
//       eset, ami a 18 posztot elvitte;
//   (b) futás a VALÓDI content/articles + content/social fájlokon (csak olvas);
//   (c) BEKÖTÉS-ŐR forrás-szinten: MINDKÉT poszter a közös modult hívja, és
//       egyik sem tart saját másolatot.
//
// ⚠️ Az `agents/` alatti fájlokat FUTTATNI/IMPORTÁLNI TILOS (a puszta import
// posztot küld és pénzt költ), ezért a bekötést a FORRÁS szövegén nézzük.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  FRESH_DAYS, FRESH_MS, isArticleFile, matchSlug,
  buildPublishedMap, realSlug, findPublished, queueStatus
} from './social-published.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
const fails = [];
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✅ ' + name); }
  catch (e) {
    fails.push(name);
    const sorok = String(e?.message || e).split('\n').map(s => s.trim()).filter(Boolean).slice(0, 4);
    console.log('  ❌ ' + name + '\n       ' + sorok.join(' '));
  }
};

console.log('🧪 közösségi sor — cikk-egyeztetés + frissesség\n');

// ---------- minták ----------
const MOST = Date.parse('2026-09-12T12:00:00.000Z');
const iso = ms => new Date(ms).toISOString();
// SZÁNDÉKOSAN ABSZOLÚT 7 nap, NEM a modul FRESH_MS-e: ha valaki a vágást
// átírja, a határ-esetek a régi 7 napot kérik számon.
const HET_NAP = 7 * 24 * 3600e3;

const cikk = (file, { slug, type, at, title, originalTitle } = {}) => ({
  file,
  data: {
    _meta: { ...(slug ? { slug } : {}), ...(type ? { type } : {}), ...(at ? { published_at: at } : {}) },
    article_markdown: title ? `---\ntitle: "${title}"\n---\n\nSzöveg.` : '',
    ...(originalTitle ? { original_title: originalTitle } : {})
  }
});
const poszt = (slug, url) => ({ slug, url, facebook: 'Szöveg ' + url });
const URL = s => `https://aiworldhq.com/article/${s}`;

// ===================================================================
// (a) EGYSÉGTESZT
// ===================================================================

t('🔴 a RÖGZÍTETT _meta.slug-gal talál — akkor is, ha a címből MÁS slug jönne', () => {
  // A 2026-08-02-i eset: cím-átírás / brit→amerikai javítás után a cím slugja
  // eltér a kint lévő URL-től. A címből visszafejtve NEM talált, a kor
  // „végtelen" lett, és 18 FRISS poszt némán elavultnak jelölődött.
  const title = 'How to Organise Your Photos with AI Tools';
  const rogzitett = 'how-to-organize-photos-with-ai';
  assert.notEqual(matchSlug(title), rogzitett, 'a minta értelmetlen: a két slug egyezik');

  const map = buildPublishedMap([cikk('ARTICLE_organise.json', { slug: rogzitett, at: iso(MOST - 3600e3), title })]);
  const st = queueStatus(map, poszt(rogzitett, URL(rogzitett)), MOST);
  assert.ok(st, '🔴 a friss poszt nem talált cikket — a _meta.slug-kulcs hiányzik a térképből');
  assert.equal(st.stale, false, '🔴 egy órás hír elavultnak jelölve — ez vitte el a 18 posztot');
  assert.equal(st.isFresh, true);
  assert.equal(st.isGuide, false);
});

t('🔴 csonka (60 karakteres) social-slug: az URL-ből vett slug nyer', () => {
  const title = 'A Very Long Headline About Everyday AI Assistants That Keeps Going And Going';
  const rogzitett = 'everyday-ai-assistants-long-headline';
  const csonka = matchSlug(title).slice(0, 60);
  const map = buildPublishedMap([cikk('ARTICLE_long.json', { slug: rogzitett, at: iso(MOST - 3600e3), title })]);
  assert.equal(map[csonka], undefined, 'a minta értelmetlen: a csonka slug is kulcs');
  const p = poszt(csonka, URL(rogzitett + '.html'));
  assert.equal(realSlug(p), rogzitett, '🔴 a `slug` mező (csonka maradvány) nyert az URL előtt');
  assert.ok(queueStatus(map, p, MOST), '🔴 a csonka slugú poszt nem talált cikket');
});

t('tartalék-kulcs: rögzített slug nélküli régi cikk a címéből is megtalálható', () => {
  const map = buildPublishedMap([cikk('ARTICLE_old.json', { at: iso(MOST), title: 'Old Title: Still Live!' })]);
  assert.ok(map['old-title-still-live'], 'a frontmatter-címből képzett kulcs hiányzik');
  const map2 = buildPublishedMap([cikk('ARTICLE_old2.json', { at: iso(MOST), originalTitle: 'Only Original Title' })]);
  assert.ok(map2['only-original-title'], 'frontmatter nélkül az original_title a tartalék');
  const map3 = buildPublishedMap([cikk('ARTICLE_bare.json', { at: iso(MOST) })]);
  assert.ok(map3['article-bare-json'], 'cím nélkül a fájlnév a végső tartalék');
});

t('🔴 a tartalék-kulcs SOHA nem írja felül a rögzített slugot (mindkét sorrendben)', () => {
  const A = cikk('ARTICLE_a.json', { slug: 'kozos-slug', at: '2026-09-01T00:00:00.000Z', title: 'Egeszen Mas Cim' });
  const B = cikk('ARTICLE_b.json', { at: '2026-01-01T00:00:00.000Z', title: 'Kozos Slug' });
  assert.equal(buildPublishedMap([A, B])['kozos-slug'].at, '2026-09-01T00:00:00.000Z',
    '🔴 egy későbbi cikk CÍMBŐL képzett kulcsa felülírta a rögzített slugot');
  assert.equal(buildPublishedMap([B, A])['kozos-slug'].at, '2026-09-01T00:00:00.000Z',
    '🔴 a rögzített slug nem írta felül a korábbi tartalék-kulcsot');
});

t('tartalék-kulcsnál az ELSŐ nyer, rögzített slugnál az UTOLSÓ (readdir-sorrend)', () => {
  const X = cikk('ARTICLE_x.json', { at: 'elso', title: 'Same Title' });
  const Y = cikk('ARTICLE_y.json', { at: 'masodik', title: 'Same Title' });
  assert.equal(buildPublishedMap([X, Y])['same-title'].at, 'elso');
  const P = cikk('ARTICLE_p.json', { slug: 'ugyanaz', at: 'elso' });
  const Q = cikk('ARTICLE_q.json', { slug: 'ugyanaz', at: 'masodik' });
  assert.equal(buildPublishedMap([P, Q])['ugyanaz'].at, 'masodik');
});

t('útmutató-felismerés: _meta.type VAGY ARTICLE_GUIDE fájlnév', () => {
  const map = buildPublishedMap([
    cikk('ARTICLE_GUIDE_one.json', { slug: 'g-fajlnev', at: iso(MOST) }),
    cikk('ARTICLE_two.json', { slug: 'g-tipus', type: 'guide', at: iso(MOST) }),
    cikk('ARTICLE_three.json', { slug: 'hir', type: 'news', at: iso(MOST) })
  ]);
  assert.equal(map['g-fajlnev'].guide, true, '🔴 az ARTICLE_GUIDE fájlnév nem jelent útmutatót');
  assert.equal(map['g-tipus'].guide, true);
  assert.equal(map['hir'].guide, false);
  assert.equal(buildPublishedMap([cikk('ARTICLE_n.json', { slug: 'n' })])['n'].at, '', 'hiányzó dátum → üres string');
});

t('hibás cikk nem dönti el a térképet (és ami a hiba előtt bekerült, bent marad)', () => {
  const map = buildPublishedMap([
    { file: 'ARTICLE_null.json', data: null },
    { file: 'ARTICLE_half.json', data: { _meta: { slug: 'fel-kesz' }, article_markdown: 42 } },
    cikk('ARTICLE_ok.json', { slug: 'rendben', at: iso(MOST) })
  ]);
  assert.ok(map['rendben'], 'a hibás cikk után a jó már nem került be');
  assert.ok(map['fel-kesz'], 'a korábbi viselkedés: a rögzített kulcs a dobás ELŐTT bekerült');
  assert.deepEqual(Object.keys(map).sort(), ['article-ok-json', 'fel-kesz', 'rendben']);
  assert.deepEqual(buildPublishedMap(undefined), {});
});

t('realSlug: URL elöl, .html / query / hash le, tartalék a `slug` mező', () => {
  assert.equal(realSlug({ url: URL('abc.html'), slug: 'zzz' }), 'abc');
  assert.equal(realSlug({ url: URL('abc?x=1#top'), slug: 'zzz' }), 'abc');
  // ⚠️ A KORÁBBI VISELKEDÉS, VÁLTOZATLANUL: a `.html` levágása a query ELŐTT
  // fut, így `abc.html?x` → `abc.html`. Valódi adatban nincs ilyen URL
  // (2026-09-12: 974 posztból 0); ha lesz, ITT kell dönteni, nem csendben.
  assert.equal(realSlug({ url: URL('abc.html?utm=x'), slug: 'zzz' }), 'abc.html');
  assert.equal(realSlug({ url: 'https://aiworldhq.com/tools', slug: 'xyz' }), 'xyz', 'nem cikk-URL → a slug mező');
  assert.equal(realSlug({ slug: 'csak-slug.html' }), 'csak-slug');
  assert.equal(realSlug({}), '');
});

t('findPublished: először az URL-slug, utána a `slug` mező', () => {
  const map = { 'url-slug': { at: 'u', guide: false }, 'mezo-slug': { at: 'm', guide: false } };
  assert.equal(findPublished(map, { url: URL('url-slug'), slug: 'mezo-slug' }).at, 'u');
  assert.equal(findPublished(map, { url: URL('nincs-ilyen'), slug: 'mezo-slug' }).at, 'm');
  assert.equal(findPublished(map, { url: URL('nincs-ilyen'), slug: 'nincs' }), undefined);
});

t('nincs élő cikk → null (VÁRUNK, nem dobjuk el)', () => {
  assert.equal(queueStatus({}, poszt('x', URL('x')), MOST), null);
});

t('🔴 a frissesség-vágás PONTOSAN 7 nap — a határ mindkét oldalán', () => {
  assert.equal(FRESH_DAYS, 7, '🔴 a vágás elmozdult');
  assert.equal(FRESH_MS, HET_NAP);
  const map = buildPublishedMap([
    cikk('ARTICLE_h1.json', { slug: 'hir-hataron', at: iso(MOST - HET_NAP) }),
    cikk('ARTICLE_h2.json', { slug: 'hir-tul', at: iso(MOST - HET_NAP - 1) }),
    cikk('ARTICLE_GUIDE_u1.json', { slug: 'utm-tul', at: iso(MOST - HET_NAP - 1) }),
    cikk('ARTICLE_GUIDE_u2.json', { slug: 'utm-friss', at: iso(MOST - 1000) })
  ]);
  const st = s => queueStatus(map, poszt(s, URL(s)), MOST);
  assert.deepEqual(st('hir-hataron'), { pubAt: iso(MOST - HET_NAP), isGuide: false, stale: false, isFresh: true },
    '🔴 a PONTOSAN 7 napos hír már nem friss / elavult');
  assert.deepEqual(st('hir-tul'), { pubAt: iso(MOST - HET_NAP - 1), isGuide: false, stale: true, isFresh: false },
    '🔴 a 7 napnál 1 ms-mal régebbi hír nem avult el');
  assert.deepEqual(st('utm-tul'), { pubAt: iso(MOST - HET_NAP - 1), isGuide: true, stale: false, isFresh: false },
    '🔴 az örökzöld útmutató elavultnak jelölve');
  assert.equal(st('utm-friss').isFresh, true);
});

t('furcsa dátumok: hiányzó, olvashatatlan, jövőbeli (a korábbi viselkedés)', () => {
  const map = buildPublishedMap([
    cikk('ARTICLE_nd.json', { slug: 'hir-datum-nelkul' }),
    cikk('ARTICLE_GUIDE_nd.json', { slug: 'utm-datum-nelkul' }),
    cikk('ARTICLE_bad.json', { slug: 'hir-rossz-datum', at: 'nem-datum' }),
    cikk('ARTICLE_fut.json', { slug: 'hir-jovo', at: iso(MOST + 3600e3) })
  ]);
  const st = s => queueStatus(map, poszt(s, URL(s)), MOST);
  assert.deepEqual([st('hir-datum-nelkul').stale, st('hir-datum-nelkul').isFresh], [true, false], 'dátum nélküli hír = végtelen kor');
  assert.deepEqual([st('utm-datum-nelkul').stale, st('utm-datum-nelkul').isFresh], [false, false]);
  assert.deepEqual([st('hir-rossz-datum').stale, st('hir-rossz-datum').isFresh], [false, false], 'olvashatatlan dátum: se nem elavult, se nem friss');
  assert.deepEqual([st('hir-jovo').stale, st('hir-jovo').isFresh], [false, true]);
});

t('isArticleFile és matchSlug', () => {
  assert.equal(isArticleFile('ARTICLE_x.json'), true);
  assert.equal(isArticleFile('ARTICLE_GUIDE_x.json'), true);
  assert.equal(isArticleFile('x.json'), false);
  assert.equal(isArticleFile('ARTICLE_x.json.bak'), false);
  assert.equal(isArticleFile('article_x.json'), false);
  assert.equal(matchSlug('Hello, World!'), 'hello-world');
  assert.equal(matchSlug(''), '');
  assert.equal(matchSlug(null), '');
  assert.equal(matchSlug('a'.repeat(200)).length, 70);
});

// ===================================================================
// (b) VALÓDI ADAT — content/articles + content/social, CSAK OLVAS
// ===================================================================

const ART = join(ROOT, 'content', 'articles');
const SOC = join(ROOT, 'content', 'social');

if (!existsSync(ART) || !existsSync(SOC)) {
  console.log('  ⏭️  nincs content/articles vagy content/social — a valódi-adat rész kimarad');
} else {
  t('📊 valódi adat: minden rögzített slug a térképben, a posztok megtalálják a cikküket', () => {
    // Ugyanúgy olvasunk, ahogy a két poszter (loadArticles).
    const entries = [];
    for (const file of readdirSync(ART).filter(isArticleFile)) {
      try { entries.push({ file, data: JSON.parse(readFileSync(join(ART, file), 'utf-8')) }); } catch { /* kihagyjuk */ }
    }
    const map = buildPublishedMap(entries);

    // Rögzített slug → az UTOLSÓ ilyen slugú cikk (a térkép szabálya).
    const rogzitett = new Map();
    for (const { data } of entries) if (data?._meta?.slug) rogzitett.set(data._meta.slug, data);
    for (const [slug, d] of rogzitett) {
      assert.ok(map[slug], `🔴 a rögzített slug hiányzik a térképből: ${slug}`);
      assert.equal(map[slug].at, d._meta.published_at || '', `🔴 a(z) ${slug} kulcs MÁSIK cikkre mutat`);
    }

    const now = Date.now();
    let osszes = 0, ervenyes = 0, talalt = 0, rogzitettAlapjan = 0, nincs = 0;
    const fb = { friss: 0, hatralek: 0, elavult: 0, egyeb: 0 };
    for (const f of readdirSync(SOC).filter(x => x.endsWith('.json'))) {
      let post; try { post = JSON.parse(readFileSync(join(SOC, f), 'utf-8')); } catch { continue; }
      osszes++;
      if (!post || !post.facebook || !post.url) continue;
      ervenyes++;
      const st = queueStatus(map, post, now);
      if (!st) { nincs++; continue; }
      talalt++;
      if (rogzitett.has(realSlug(post))) {
        rogzitettAlapjan++;
        assert.equal(findPublished(map, post), map[realSlug(post)]);
      }
      if (!post.posted_fb) {
        if (st.stale) fb.elavult++; else if (st.isFresh) fb.friss++; else if (st.isGuide) fb.hatralek++; else fb.egyeb++;
      }
    }
    console.log(`       cikk: ${entries.length} (rögzített slug: ${rogzitett.size}) · térkép-kulcs: ${Object.keys(map).length}`);
    console.log(`       social-fájl: ${osszes} · küldhető: ${ervenyes} · cikket talált: ${talalt} `
      + `(rögzített sluggal: ${rogzitettAlapjan}) · nincs élő cikk: ${nincs}`);
    console.log(`       Facebook-sor most: friss ${fb.friss} · örökzöld hátralék ${fb.hatralek} · `
      + `lezárandó (elavult hír) ${fb.elavult} · egyéb ${fb.egyeb}`);
    if (entries.length && ervenyes) {
      assert.ok(talalt > 0, '🔴 egyetlen poszt sem talált cikket — a slug-egyeztetés elromlott');
      // A 2026-08-02 előtti hibánál 407-ből 210 poszt NEM talált (52%).
      assert.ok(talalt / ervenyes >= 0.5,
        `🔴 a posztok ${Math.round(100 * nincs / ervenyes)}%-a nem talál élő cikket — a slug-egyeztetés gyanús`);
    }
  });
}

// ===================================================================
// (c) BEKÖTÉS-ŐR — MINDKÉT poszter, forrás-szinten
// ===================================================================

// A teljes soros `//` kommentek KI: egy kommentben említett függvénynév ne
// adjon hamis bizonyítékot (se hamis riasztást).
const forras = p => readFileSync(join(ROOT, p), 'utf-8').replace(/\r\n/g, '\n')
  .split('\n').filter(sor => !/^\s*\/\//.test(sor)).join('\n');

const importNevek = s => {
  const m = s.match(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/\.\.\/core\/social-published\.js'/);
  return m ? m[1].split(',').map(x => x.trim()).filter(Boolean) : null;
};

const NEVEK = 'slugify|matchSlug|publishedMap|buildPublishedMap|realSlug|findPublished|queueStatus|FRESH_DAYS|FRESH_MS';
const SAJAT_DEF = new RegExp(`\\bfunction\\s+(${NEVEK})\\s*\\(|\\b(?:const|let|var)\\s+(${NEVEK})\\s*=`, 'g');

const POSZTEREK = {
  'agents/social/poster.js': ['isArticleFile', 'buildPublishedMap', 'queueStatus'],
  'agents/social/buffer-poster.js': ['isArticleFile', 'buildPublishedMap', 'queueStatus', 'realSlug']
};

for (const [p, kell] of Object.entries(POSZTEREK)) {
  t(`🔌 ${p}: a közös modult importálja és hívja`, () => {
    const s = forras(p);
    const nevek = importNevek(s);
    assert.ok(nevek, '🔴 nincs import a core/social-published.js-ből');
    for (const n of kell) assert.ok(nevek.includes(n), `🔴 hiányzik az importból: ${n}`);
    assert.ok(/\.filter\(isArticleFile\)/.test(s), '🔴 a cikk-fájl szűrő nem a közös');
    assert.ok(/buildPublishedMap\(loadArticles\(\)\)/.test(s), '🔴 a térképet nem a közös függvény építi');
    assert.ok(/const st = queueStatus\(pub, post, now\);/.test(s), '🔴 a sor-döntést nem a közös függvény hozza');
    assert.ok(/if \(st\.stale\) \{/.test(s), '🔴 az elavult-jelölés nem a közös döntést követi');
    assert.ok(/isFresh: st\.isFresh \}/.test(s), '🔴 a frissesség nem a közös döntésből jön');
  });

  t(`🔴 ${p}: NEM tart saját másolatot (slugify / publishedMap / realSlug / vágás)`, () => {
    const s = forras(p);
    const sajat = [...s.matchAll(SAJAT_DEF)].map(m => m[1] || m[2]);
    assert.deepEqual(sajat, [], `🔴 saját definíció maradt vagy került vissza: ${sajat.join(', ')}`);
    assert.ok(!/\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9\]\+\/g/.test(s), '🔴 saját slug-képlet');
    assert.ok(!/map\[d\._meta\.slug\]/.test(s), '🔴 saját térkép-építés');
    assert.ok(!/pub\[realSlug\(/.test(s), '🔴 saját slug-keresés a térképben');
    assert.ok(!/new Date\([\w.]*pubAt\)|3600e3|864e5/.test(s), '🔴 saját kor-számítás / frissesség-vágás');
  });
}

t('🔌 buffer-poster: a CTA és a kép a közös realSlug()-ból', () => {
  const s = forras('agents/social/buffer-poster.js');
  assert.ok(/const slug = realSlug\(item\.post\);/.test(s), '🔴 a poszt slugja nem a közös realSlug()');
});

t('🔌 poster.js: a link kiszedése a közös stripUrl()', () => {
  // core/social-text.js kérte: „a kettő ne szakadjon el". 974 valódi poszton
  // mérve (2026-09-12) a beírt másolat és a stripUrl() kimenete azonos volt.
  const s = forras('agents/social/poster.js');
  assert.ok(/import \{[^}]*\bstripUrl\b[^}]*\} from '\.\.\/\.\.\/core\/social-text\.js'/.test(s), '🔴 nincs stripUrl import');
  assert.ok(/const message = stripUrl\(post\.facebook, post\.url\);/.test(s), '🔴 nem a stripUrl() adja az üzenetet');
  assert.ok(!/\.split\(post\.url\)\.join\(''\)/.test(s), '🔴 visszakerült a beírt link-kiszedés');
});

if (fails.length) {
  console.log(`\n❌ ${fails.length} BUKOTT: ${fails.join(' | ')}`);
  process.exit(1);
}
console.log(`\n✅ ${pass} teszt rendben`);
