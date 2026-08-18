# Hír-összevonás és forrás-zár — implementációs terv

> **Ügynök-munkatársnak:** KÖTELEZŐ AL-SKILL: `superpowers:subagent-driven-development`
> (ajánlott) vagy `superpowers:executing-plans` a terv feladatonkénti végrehajtásához.
> A lépések jelölőnégyzetes (`- [ ]`) formában követhetők.

**Cél:** Ugyanabból a forrás-URL-ből soha ne szülessen két cikk, és több összefüggő
hírből egy cikk legyen — ne több cikk több nézőpontból.

**Architektúra:** Két független mechanizmus. (A) Ingyenes, determinisztikus
forrás-zár tiszta `core/` modulban, amit az író és a CEO-desk is használ. (B) AI-ítélet
csoportosítja a függőben lévő drafteket, a csoportból egy cikk lesz. Bármelyik hiba
esetén a rendszer a MAI viselkedésre esik vissza.

**Technológia:** Node.js ESM, függőség nélkül. Tesztek: `core/*.test.js`,
futtató `node core/run-tests.js` (`npm test`), `assert/strict`.

**Spec:** `docs/superpowers/specs/2026-08-18-hir-osszevonas-design.md`

## Globális megkötések

- **SOHA ne importálj és ne futtass semmit az `agents/` mappából.** 25-ből 21 agent a
  fájl végén feltétel nélkül hívja a `main()`-t → a puszta `import` valódi pénzt költ,
  publikál és posztol. Az `agents/` fájlokat **szerkeszteni szabad**, importálni nem.
  Teszt SOHA nem importálhat `agents/` alól.
- **Minden teszt INGYENES és hálózat nélküli.** Nincs API-hívás, nincs `fetch`.
- **A repó PUBLIKUS** — kulcs, token, titok nem kerülhet bele.
- **Hibatűrés alapszabálya:** bármilyen hiba (AI nem válaszol, rossz JSON, időtúllépés)
  → **a mai viselkedés**: minden draft külön cikk. Az összevonás soha nem kötelező.
- **Csoport-korlátok:** max 5, min 2, kötelező érdemi közös téma.
- **A saját domain** (`aiworldhq.com`) nem kerülhet a zárolt kulcsok közé.
- **A meglévő fájlok CRLF sorvégűek.** Sor-alapú szerkesztésnél a sorvéget meg kell
  tartani, különben az egész fájl diffje megváltozik.
- **Kommentek magyarul, és a MIÉRT-et írják le, ne a mit.** Ez a ház stílusa.
- **Commit-üzenet:** ékezet nélküli magyar (a repó szokása), a végén
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 1: `core/source-lock.js` — a forrás-zár tiszta magja

**Fájlok:**
- Létrehoz: `core/source-lock.js`
- Létrehoz: `core/source-lock.test.js`

**Interfészek:**
- Fogyaszt: semmit (tiszta modul)
- Előállít:
  - `normalizeSourceUrl(url: string) => string`
  - `normalizeSourceTitle(title: string) => string`
  - `isOwnDomain(url: string) => boolean`
  - `publishedSourceKeys(articles: object[]) => { urls: Set<string>, titles: Set<string> }`
  - `isAlreadyWritten(draft: object, keys: {urls,titles}) => boolean`
  - `MIN_TITLE_KEY_LEN: number`

- [ ] **1. lépés: Írd meg a bukó tesztet**

Hozd létre: `core/source-lock.test.js`

```js
// ===================================================================
// TESZT — forrás-zár
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT: 2026-08-18-án öt sztoriról derült ki, hogy két-két cikkünk van róla.
// Négyet azonos forrás-URL azonosít, egyet csak az azonos eredeti cím — annál
// a forrás átírta a SAJÁT linkje kötőjelezését (gemini-36-flash vs
// gemini-3-6-flash), amit semmilyen ésszerű URL-normalizálás nem hoz közös
// kulcsra. Ezért kétkulcsos a zár.
// ===================================================================

import assert from 'assert/strict';
import {
  normalizeSourceUrl, normalizeSourceTitle, isOwnDomain,
  publishedSourceKeys, isAlreadyWritten, MIN_TITLE_KEY_LEN
} from './source-lock.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 Forrás-zár\n');

t('az URL-normalizálás a jelentéktelen eltéréseket vágja le', () => {
  const k = 'openai.com/index/gpt-red';
  assert.equal(normalizeSourceUrl('https://openai.com/index/gpt-red'), k);
  assert.equal(normalizeSourceUrl('http://www.openai.com/index/gpt-red/'), k);
  assert.equal(normalizeSourceUrl('https://openai.com/index/gpt-red?utm_source=rss'), k);
  assert.equal(normalizeSourceUrl('https://openai.com/index/gpt-red#top'), k);
  assert.equal(normalizeSourceUrl('  HTTPS://OpenAI.com/index/GPT-Red  '), k);
  assert.equal(normalizeSourceUrl(''), '');
  assert.equal(normalizeSourceUrl(null), '');
});

t('⚠️ az útvonal-eltérést NEM tünteti el (ezért kell a cím-kulcs)', () => {
  // A Gemini-pár valódi esete. Ha ez a két kulcs valaha egyenlő lenne, az azt
  // jelentené, hogy a normalizálás túl agresszív, és külön cikkeket olvasztana.
  const a = normalizeSourceUrl('https://deepmind.google/blog/introducing-gemini-36-flash-35-flash-lite/');
  const b = normalizeSourceUrl('https://deepmind.google/blog/introducing-gemini-3-6-flash-3-5-flash-lite/');
  assert.notEqual(a, b, 'az URL-kulcs itt bizonyítottan nem elég');
});

t('a cím-kulcs a központozástól és kisbetűtől független', () => {
  assert.equal(
    normalizeSourceTitle('Introducing Gemini 3.6 Flash, 3.5 Flash-Lite, and 3.5 Flash Cyber'),
    normalizeSourceTitle('introducing gemini 3 6 flash  3 5 flash lite and 3 5 flash cyber'));
  assert.equal(normalizeSourceTitle(null), '');
});

t('a saját domain felismerése', () => {
  assert.equal(isOwnDomain('https://aiworldhq.com'), true);
  assert.equal(isOwnDomain('https://www.aiworldhq.com/article/valami'), true);
  assert.equal(isOwnDomain('https://openai.com/index/x'), false);
});

t('🚫 a saját domain NEM kerül a zárolt kulcsok közé', () => {
  // Kilenc szerkesztőségi cikkünk (heti digest, összehasonlítás) source_link-je
  // a saját domainünk. Ha bekerülne, a digest legközelebb önmagát zárná ki.
  const keys = publishedSourceKeys([
    { _meta: { source_link: 'https://aiworldhq.com' }, original_title: 'This Week in AI' }
  ]);
  assert.equal(keys.urls.size, 0, 'a saját domain nem lehet kulcs');
});

t('📌 a négy VALÓDI azonos-URL-es duplikátum meg lett volna előzve', () => {
  const publikalt = [
    { _meta: { source_link: 'https://aws.amazon.com/blogs/machine-learning/built-technologies-builds-an-ai-powered-document-intelligence-solution-on-aws/' }, original_title: 'Built Technologies builds an AI-powered document intelligence solution on AWS' },
    { _meta: { source_link: 'https://openai.com/index/unlocking-self-improvement-gpt-red' }, original_title: 'GPT-Red: Unlocking Self-Improvement for Robustness' },
    { _meta: { source_link: 'https://openai.com/index/safety-alignment-long-horizon-models' }, original_title: 'Safety and alignment in an era of long-horizon models' },
    { _meta: { source_link: 'https://blogs.nvidia.com/blog/siggraph-news-2026/' }, original_title: 'At SIGGRAPH, NVIDIA Advances Graphics and Simulation' }
  ];
  const keys = publishedSourceKeys(publikalt);
  // A draftban a mező neve `link`, NEM `source_link` — ez az író adja neki később.
  for (const a of publikalt) {
    const draft = { link: a._meta.source_link, title: 'teljesen mas cim amit meg nem irtunk' };
    assert.equal(isAlreadyWritten(draft, keys), true, a._meta.source_link);
  }
});

t('📌 a Gemini-párt a CÍM-kulcs fogja meg', () => {
  const keys = publishedSourceKeys([{
    _meta: { source_link: 'https://deepmind.google/blog/introducing-gemini-36-flash-35-flash-lite-and-35-flash-cyber/' },
    original_title: 'Introducing Gemini 3.6 Flash, 3.5 Flash-Lite, and 3.5 Flash Cyber'
  }]);
  const draft = {
    link: 'https://deepmind.google/blog/introducing-gemini-3-6-flash-3-5-flash-lite-and-3-5-flash-cyber/',
    title: 'Introducing Gemini 3.6 Flash, 3.5 Flash-Lite, and 3.5 Flash Cyber'
  };
  assert.equal(isAlreadyWritten(draft, keys), true, 'az URL más, a cím ugyanaz');
});

t('🔗 az ÖSSZEVONT cikk minden forrása zárolva van', () => {
  // Enélkül a beolvasztott hír később külön cikként újra megíródna.
  const keys = publishedSourceKeys([{
    _meta: {
      source_link: 'https://midjourney.com/updates/v8-alpha',
      source_links: [
        'https://midjourney.com/updates/v8-alpha',
        'https://midjourney.com/updates/v8-1-updates',
        'https://midjourney.com/updates/web-updates'
      ]
    },
    original_title: 'V8 Alpha'
  }]);
  for (const l of ['https://midjourney.com/updates/v8-1-updates', 'https://midjourney.com/updates/web-updates']) {
    assert.equal(isAlreadyWritten({ link: l, title: 'mas cim teljesen' }, keys), true, l);
  }
});

t('az ÚJ hír átmegy', () => {
  const keys = publishedSourceKeys([
    { _meta: { source_link: 'https://openai.com/index/regi' }, original_title: 'Regi hir cime itt' }
  ]);
  assert.equal(isAlreadyWritten({ link: 'https://openai.com/index/uj', title: 'Teljesen uj hir cime' }, keys), false);
});

t('a túl rövid cím NEM zárol (ütközés-védelem)', () => {
  // Egy 3 karakteres cím véletlenül is egyezhet — abból nem csinálunk zárat.
  const rovid = 'V8';
  assert.ok(normalizeSourceTitle(rovid).length < MIN_TITLE_KEY_LEN);
  const keys = publishedSourceKeys([{ _meta: {}, original_title: rovid }]);
  assert.equal(keys.titles.size, 0);
  assert.equal(isAlreadyWritten({ link: 'https://uj.com/x', title: rovid }, keys), false);
});

t('hiányzó adat nem borít fel semmit', () => {
  const keys = publishedSourceKeys([]);
  assert.equal(isAlreadyWritten({}, keys), false);
  assert.equal(isAlreadyWritten({ link: 'https://x.com/a' }, null), false);
  assert.equal(publishedSourceKeys(null).urls.size, 0);
});

console.log('\n✅ source-lock.test: mind a ' + pass + ' eset rendben');
```

- [ ] **2. lépés: Futtasd, hogy lásd a bukást**

Futtasd: `node core/source-lock.test.js`
Várt: `ERR_MODULE_NOT_FOUND` — nincs `core/source-lock.js`.

- [ ] **3. lépés: Írd meg a minimális megvalósítást**

Hozd létre: `core/source-lock.js`

```js
// ===================================================================
// FORRÁS-ZÁR — ugyanabból a hírből ne szülessen két cikk
// ===================================================================
//
// MIÉRT: 2026-08-18-án öt sztoriról derült ki, hogy két-két cikkünk van róla,
// mind 2026 júliusából. A cikkek tartalmilag KÜLÖNBÖZŐEK (0,091–0,409
// hasonlóság), mert az író promptja szerint a hír csak JELZÉS, nem alapanyag —
// a modell ugyanabból a forrásból két különböző témát tanított. Ezért sem
// tartalom-, sem cím-hasonlósággal nem lehet őket kiszűrni; a forrás-URL
// viszont egyértelműen azonosítja őket.
//
// MIÉRT KÉTKULCSOS: az egyik párnál a forrás a SAJÁT linkje kötőjelezését írta
// át (gemini-36-flash vs gemini-3-6-flash). Ezt semmilyen ésszerű
// URL-normalizálás nem hozza közös kulcsra — az agresszívabb normalizálás
// viszont valódi, különböző cikkeket olvasztana össze. Ezért a cím a második
// kulcs. Ugyanezt csinálja az agents/ceo/desk.js isDuplicate()-je 2026 óta,
// csak normalizálás nélkül és rossz helyen (a beragadt cikkeken) — azt erre a
// modulra állítjuk át, hogy ne éljen két duplikátum-fogalom egyszerre.
//
// MIÉRT ROBUSZTUSABB, MINT A SCRAPER EMLÉKEZETE: a scraper saveDraft()-ja
// azonnal lemezre ír, a saveSeenItems() viszont csak a futás VÉGÉN fut le. Ha
// egy futás félbeszakad, a draftok ott vannak, de egyetlen link sem lesz
// „látott" → a következő futás újra lementi őket. Ez a zár a PUBLIKÁLT
// cikkekből épül, tehát nem függ attól, sikerült-e a futás végén menteni.
// ===================================================================

/** A saját domainjeink — ezek sosem zárolnak. */
export const OWN_DOMAINS = Object.freeze(['aiworldhq.com']);

/**
 * Ennyi karakternél rövidebb normalizált címből nem csinálunk kulcsot.
 * Egy „V8" cím véletlenül is egyezhet két független hírnél.
 */
export const MIN_TITLE_KEY_LEN = 12;

/**
 * A jelentéktelen eltérések levágása: protokoll, www., query, horgony, záró per.
 * SZÁNDÉKOSAN nem nyúl az útvonalhoz — lásd a fejlécben a Gemini-esetet.
 */
export function normalizeSourceUrl(url) {
  const s = String(url == null ? '' : url).trim().toLowerCase();
  if (!s) return '';
  return s.replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/[?#].*$/, '')
          .replace(/\/+$/, '');
}

/** Cím-kulcs: kisbetű, csak betű/szám, egy szóköz. */
export function normalizeSourceTitle(title) {
  return String(title == null ? '' : title)
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** A saját domainünk-e? (A digest/compare source_link-je a saját oldalunk.) */
export function isOwnDomain(url) {
  const n = normalizeSourceUrl(url);
  if (!n) return false;
  return OWN_DOMAINS.some(d => n === d || n.startsWith(d + '/'));
}

/**
 * A publikált cikkekből a zárolt kulcsok.
 * @param {object[]} articles  a content/articles/*.json beolvasott tartalma
 * @returns {{urls: Set<string>, titles: Set<string>}}
 */
export function publishedSourceKeys(articles) {
  const urls = new Set(), titles = new Set();
  for (const a of Array.isArray(articles) ? articles : []) {
    const m = a?._meta || {};
    const linkek = [m.source_link, ...(Array.isArray(m.source_links) ? m.source_links : [])];
    for (const l of linkek) {
      if (!l || isOwnDomain(l)) continue;
      const k = normalizeSourceUrl(l);
      if (k) urls.add(k);
    }
    const t = normalizeSourceTitle(a?.original_title);
    if (t.length >= MIN_TITLE_KEY_LEN) titles.add(t);
  }
  return { urls, titles };
}

/**
 * Írtunk már ebből a draftból cikket?
 * ⚠️ A draftban a forrás-URL mezőjének neve `link` (a `source_link` nevet az
 * író adja neki: agents/iro/agent.js saveWrittenArticle()).
 */
export function isAlreadyWritten(draft, keys) {
  if (!keys || !draft) return false;
  const url = draft.link || draft._meta?.source_link || '';
  if (url && !isOwnDomain(url)) {
    const k = normalizeSourceUrl(url);
    if (k && keys.urls?.has(k)) return true;
  }
  const t = normalizeSourceTitle(draft.title || draft.original_title);
  return !!(t.length >= MIN_TITLE_KEY_LEN && keys.titles?.has(t));
}

export default {
  OWN_DOMAINS, MIN_TITLE_KEY_LEN,
  normalizeSourceUrl, normalizeSourceTitle, isOwnDomain,
  publishedSourceKeys, isAlreadyWritten
};
```

- [ ] **4. lépés: Futtasd a tesztet**

Futtasd: `node core/source-lock.test.js`
Várt: PASS, „mind a 11 eset rendben".

- [ ] **5. lépés: Futtasd a teljes tesztsort**

Futtasd: `npm test`
Várt: 36 teszt, mind zöld (35 volt + az új).

- [ ] **6. lépés: Commit**

```bash
git add core/source-lock.js core/source-lock.test.js
git commit -F- <<'EOF'
feat(forras-zar): ugyanabbol a hirbol ne szulessen ket cikk — a tiszta mag

Ketkulcsos: normalizalt forras-URL VAGY normalizalt eredeti cim. A cim azert
kell, mert az egyik valodi duplikatum-parnal a forras a SAJAT linkje
kotojelezeset irta at (gemini-36-flash vs gemini-3-6-flash) — azt semmilyen
esszeru URL-normalizalas nem hozza kozos kulcsra.

A sajat domain (aiworldhq.com, 9 szerkesztosegi cikken) kimarad a kulcsokbol,
kulonben a digest onmagat zarna ki. A 12 karakternel rovidebb cimbol nincs
kulcs (utkozes-vedelem).

Teszt: a negy valodi azonos-URL-es par + a Gemini-par + az osszevont cikk
source_links[] mezoje.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: A zár bekötése az íróba

**Fájlok:**
- Módosít: `agents/iro/agent.js` (import-blokk; a `main()` draft-ciklusa a `for (const draftFilename of toProcess)` körül, ~656. sor)

**Interfészek:**
- Fogyaszt: `publishedSourceKeys`, `isAlreadyWritten` a `core/source-lock.js`-ből (Task 1)
- Előállít: `stats.skipped_duplicate` szám a futás-naplóban

- [ ] **1. lépés: Add hozzá az importot és a betöltő segédfüggvényt**

Az `agents/iro/agent.js` import-blokkjához (a többi `core/` import mellé):

```js
import { publishedSourceKeys, isAlreadyWritten } from '../../core/source-lock.js';
```

A fájl segédfüggvényei közé (a `listUnprocessedDrafts` fölé):

```js
// A PUBLIKÁLT cikkek forrás-kulcsai. Miért innen és nem a scraper
// seen-items.json-jából: az azonnal írt draft és a csak futás VÉGÉN mentett
// „látott" lista között van egy rés — félbeszakadt futás után a draftok ott
// vannak, de egy link sem számít látottnak, és a következő futás újra lementi
// őket. A publikált cikkekből épített kulcshalmaz ettől független.
function loadPublishedSourceKeys() {
  const dir = join(PROJECT_ROOT, 'content', 'articles');
  if (!existsSync(dir)) return publishedSourceKeys([]);
  const cikkek = [];
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    try { cikkek.push(JSON.parse(readFileSync(join(dir, f), 'utf-8'))); } catch { /* skip */ }
  }
  return publishedSourceKeys(cikkek);
}
```

- [ ] **2. lépés: Szűrd ki a már megírt drafteket a ciklus ELŐTT**

⚠️ **A zár a cikluson KÍVÜL fut, nem belül.** Ez szándékos: a Task 7 ide teszi
majd az összevonást is, aminek már a megtisztított listát kell látnia. Így a
Task 7-nek nem kell semmit visszabontania.

A `main()`-ben a jelenlegi kód ebben a sorrendben áll:

```js
  const toProcess = args.limit ? drafts.slice(0, args.limit) : drafts;
  console.log(`📋 ${drafts.length} feldolgozatlan draft található`);
  console.log(`🎯 Most feldolgozandó: ${toProcess.length}\n`);

  // 3. Statisztika
  const stats = {
    started_at: new Date().toISOString(),
    drafts_total: toProcess.length,
    articles_written: 0,
    articles_failed: 0,
    total_cost_usd: 0,
    by_article: []
  };
```

⚠️ A `stats` a `toProcess` UTÁN jön létre, a szűrésnek viszont már írnia kell
bele. Ezért a `stats` felkerül a szűrés ELÉ. Cseréld le a fenti EGÉSZ blokkot
erre:

```js
  // 3. Statisztika (FELJEBB KERÜLT: a forrás-zár már ír bele)
  const stats = {
    started_at: new Date().toISOString(),
    drafts_total: 0,
    articles_written: 0,
    articles_failed: 0,
    skipped_duplicate: 0,
    total_cost_usd: 0,
    by_article: []
  };

  // FORRÁS-ZÁR: amiről már van cikkünk, azt nem írjuk meg újra — sem más
  // szemszögből. (2026-08-18: öt sztoriról volt két-két cikkünk.) A szűrés a
  // ciklus ELŐTT fut, hogy a már megírt hír AI-hívásig se jusson el, és hogy a
  // Task 7 összevonása már a megtisztított listát lássa.
  const sourceKeys = loadPublishedSourceKeys();
  const elo = [];
  for (const f of drafts) {
    let d;
    try { d = JSON.parse(readFileSync(join(DRAFTS_DIR, f), 'utf-8')); } catch { continue; }
    if (isAlreadyWritten(d, sourceKeys)) {
      console.log(`   ⏭️  Már írtunk erről a hírről — eldobom: ${f.slice(0, 50)}`);
      stats.skipped_duplicate++;
      try { unlinkSync(join(DRAFTS_DIR, f)); } catch { /* már nincs ott */ }
      continue;
    }
    elo.push(f);
  }

  const toProcess = args.limit ? elo.slice(0, args.limit) : elo;
  stats.drafts_total = toProcess.length;
  console.log(`📋 ${drafts.length} draft · ${elo.length} a zár után`);
  console.log(`🎯 Most feldolgozandó: ${toProcess.length}\n`);
```

- [ ] **3. lépés: Ellenőrizd, hogy a fájl szintaktikailag ép**

Futtasd: `node --check agents/iro/agent.js`
Várt: nincs kimenet (ez CSAK szintaxis-ellenőrzés, NEM futtatja a fájlt).

⚠️ SOHA ne futtasd `node agents/iro/agent.js`-ként — az valódi pénzt költene.

- [ ] **4. lépés: Futtasd a teljes tesztsort**

Futtasd: `npm test`
Várt: 36 teszt, mind zöld.

- [ ] **5. lépés: Commit**

```bash
git add agents/iro/agent.js
git commit -F- <<'EOF'
feat(forras-zar): az iro eldobja a mar megirt hirt

A draft feldolgozasa elott kerdez a core/source-lock.js-tol. Ha mar van
cikkunk errol a forrasrol, a draft torlodik es NEM koltunk ra AI-hivast.

A kulcshalmaz a PUBLIKALT cikkekbol epul, nem a scraper seen-items.json-jabol:
a saveDraft() azonnal ir, a saveSeenItems() csak a futas vegen — felbeszakadt
futas utan a draftok ott vannak, de egy link sem "latott".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: A CEO-desk átállítása a közös modulra

**Fájlok:**
- Módosít: `agents/ceo/desk.js:124-136` (`isDuplicate`)

**Interfészek:**
- Fogyaszt: `publishedSourceKeys`, `isAlreadyWritten` a `core/source-lock.js`-ből (Task 1)
- Előállít: semmit (a `isDuplicate(d)` szignatúra változatlan marad)

- [ ] **1. lépés: Add hozzá az importot**

Az `agents/ceo/desk.js` import-blokkjához:

```js
import { publishedSourceKeys, isAlreadyWritten } from '../../core/source-lock.js';
```

- [ ] **2. lépés: Cseréld le az `isDuplicate` törzsét**

Az `agents/ceo/desk.js`-ben a teljes `function isDuplicate(d) { … }` helyére:

```js
// A duplikátum-fogalom EGY helyen él: core/source-lock.js (2026-08-18).
// Korábban itt volt egy saját változat, ami szó szerint (===) hasonlított,
// tehát a „https://x.com/a" és a „https://x.com/a/" különbözőnek látszott.
// Két, egymástól eltérően normalizáló duplikátum-fogalom rosszabb, mint egy.
//
// ⚠️ SZÁNDÉKOSAN NINCS GYORSÍTÓTÁR: a desk futása közben ÚJ cikk publikálódhat,
// és a következő hívásnak azt is látnia kell. Az eredeti változat is minden
// híváskor frissen olvasott — a sebességért nem cserélünk helyességet.
function isDuplicate(d) {
  if (!existsSync(ARTICLES_DIR)) return false;
  const cikkek = [];
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.endsWith('.json'))) {
    try { cikkek.push(JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'))); } catch { /* skip */ }
  }
  return isAlreadyWritten(d, publishedSourceKeys(cikkek));
}
```

⚠️ A `d` itt egy `WRITER_*` fájl tartalma, aminek a forrás-URL-je
`d._meta.source_link` és a címe `d.original_title` — az `isAlreadyWritten`
mindkét mezőnevet ismeri.

- [ ] **3. lépés: Ellenőrizd a szintaxist**

Futtasd: `node --check agents/ceo/desk.js`
Várt: nincs kimenet.

- [ ] **4. lépés: Futtasd a teljes tesztsort**

Futtasd: `npm test`
Várt: 36 teszt, mind zöld.

- [ ] **5. lépés: Commit**

```bash
git add agents/ceo/desk.js
git commit -F- <<'EOF'
refactor(desk): a duplikatum-fogalom egy helyen eljen

A desk.js sajat isDuplicate()-je szo szerint (===) hasonlitott, tehat a zaro
per vagy egy ?utm_source mar kulonbozonek mutatta ugyanazt a hirt. Most a
core/source-lock.js-t hasznalja, ugyanazzal a normalizalassal, mint az iro.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: `core/extract-json.js` — a JSON-kihámozás egy helyre

**Fájlok:**
- Létrehoz: `core/extract-json.js`
- Létrehoz: `core/extract-json.test.js`
- Módosít: `agents/rss-scraper/agent.js:209-227` (a helyi `extractJsonArray` törlése + import)
- Módosít: `agents/guide/agent.js:352` környéke (a helyi másolat törlése + import)

**Interfészek:**
- Fogyaszt: semmit
- Előállít: `extractJsonArray(text: string) => any[]` (hibánál `throw`)

- [ ] **1. lépés: Írd meg a bukó tesztet**

Hozd létre: `core/extract-json.test.js`

```js
// ===================================================================
// TESZT — JSON-tömb kihámozása a modell válaszából
// ===================================================================
// INGYENES, hálózat nélküli.
//
// MIÉRT KÖZÖS MODUL: ez a függvény 2026-08-18-ig KÉTSZER volt lemásolva
// (agents/rss-scraper/agent.js és agents/guide/agent.js), core-ban sehol.
// A harmadik másolat helyett ide kerül — és így végre van rá teszt is.
// ===================================================================

import assert from 'assert/strict';
import { extractJsonArray } from './extract-json.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 JSON-kihámozás\n');

t('sima tömb', () => {
  assert.deepEqual(extractJsonArray('[{"a":1}]'), [{ a: 1 }]);
});

t('markdown-kerítésben', () => {
  assert.deepEqual(extractJsonArray('```json\n[{"a":1}]\n```'), [{ a: 1 }]);
  assert.deepEqual(extractJsonArray('```\n[1,2]\n```'), [1, 2]);
});

t('fecsegés a tömb körül', () => {
  assert.deepEqual(extractJsonArray('Itt a valasz:\n[1,2,3]\nRemelem jo!'), [1, 2, 3]);
});

t('🔑 objektum-borítékból is kiszedi a tömböt', () => {
  // A JSON-mód (Cerebras/GLM-4.7) legfelül objektumot kényszerít. 2026-07-16-án
  // ezen bukott el a scraper 3 napra: "results is not iterable".
  assert.deepEqual(extractJsonArray('{"decisions":[{"index":0}]}'), [{ index: 0 }]);
  assert.deepEqual(extractJsonArray('{"groups":[{"theme":"x"}]}'), [{ theme: 'x' }]);
});

t('egyetlen döntés-objektumot tömbbe csomagol', () => {
  assert.deepEqual(extractJsonArray('{"index":0,"keep":true}'), [{ index: 0, keep: true }]);
});

t('szemétre HIBÁT dob (a hívó erre esik vissza)', () => {
  assert.throws(() => extractJsonArray('semmi ertelmes'));
  assert.throws(() => extractJsonArray(''));
  assert.throws(() => extractJsonArray('{"a":1}'));   // se tömb, se index
});

console.log('\n✅ extract-json.test: mind a ' + pass + ' eset rendben');
```

- [ ] **2. lépés: Futtasd, hogy lásd a bukást**

Futtasd: `node core/extract-json.test.js`
Várt: `ERR_MODULE_NOT_FOUND`.

- [ ] **3. lépés: Hozd létre a modult**

Hozd létre: `core/extract-json.js`

```js
// ===================================================================
// JSON-TÖMB KIHÁMOZÁSA A MODELL VÁLASZÁBÓL
// ===================================================================
//
// A modell néha markdown-kerítésbe teszi (```json), néha szöveget ír köré,
// JSON-módban pedig legfelül objektumot kényszerít.
//
// MIÉRT ITT: 2026-08-18-ig ez a függvény KÉTSZER volt lemásolva
// (agents/rss-scraper/agent.js:209 és agents/guide/agent.js:352), core-ban
// sehol — tehát tesztje sem volt. A 2026-07-16-i „results is not iterable"
// hiba 3 napra megállította a hírbeszerzést; egy közös, tesztelt függvényben
// az ilyen javítás egyszer kell.
// ===================================================================

/**
 * @param {string} text a modell nyers válasza
 * @returns {any[]}
 * @throws ha nincs benne értelmezhető tömb — a hívó ilyenkor a biztonságos
 *         alapértelmezésre esik vissza, nem próbál okoskodni
 */
export function extractJsonArray(text) {
  let t = String(text == null ? '' : text).trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) t = t.slice(start, end + 1);

  const parsed = JSON.parse(t);
  if (Array.isArray(parsed)) return parsed;

  // JSON-objektum-mód: {"decisions":[...]} boríték vagy egyetlen objektum.
  if (parsed && typeof parsed === 'object') {
    for (const v of Object.values(parsed)) if (Array.isArray(v)) return v;
    if ('index' in parsed) return [parsed];
  }
  throw new Error('A válaszban nincs JSON-tömb');
}

export default { extractJsonArray };
```

⚠️ A `JSON.parse('')` magától dob — ez a kívánt viselkedés, nem kell külön ág.

- [ ] **4. lépés: Futtasd a tesztet**

Futtasd: `node core/extract-json.test.js`
Várt: PASS, „mind a 6 eset rendben".

- [ ] **5. lépés: Állítsd át a két meglévő hívót**

`agents/rss-scraper/agent.js`: töröld a helyi `function extractJsonArray(text) { … }`
definíciót (a fölötte lévő magyarázó kommenttel együtt), és tedd az import-blokkba:

```js
import { extractJsonArray } from '../../core/extract-json.js';
```

Ugyanez `agents/guide/agent.js`-ben a helyi másolattal.

- [ ] **6. lépés: Ellenőrizd, hogy egy másolat sem maradt**

Futtasd:
```bash
grep -rn "function extractJsonArray" --include=*.js core/ agents/
```
Várt: pontosan EGY találat, `core/extract-json.js`-ben.

Futtasd: `node --check agents/rss-scraper/agent.js && node --check agents/guide/agent.js`
Várt: nincs kimenet.

- [ ] **7. lépés: Futtasd a teljes tesztsort**

Futtasd: `npm test`
Várt: 37 teszt, mind zöld.

- [ ] **8. lépés: Commit**

```bash
git add core/extract-json.js core/extract-json.test.js agents/rss-scraper/agent.js agents/guide/agent.js
git commit -F- <<'EOF'
refactor(json): a valasz-kihamozas egy helyre, teszttel

Ez a fuggveny ketszer volt lemasolva (rss-scraper es guide), core-ban sehol,
tehat tesztje sem volt. A 2026-07-16-i "results is not iterable" hiba 3 napra
megallitotta a hirbeszerzest — kozos fuggvenyben az ilyen javitas egyszer kell.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: `core/draft-clusters.js` — a csoportosítás tiszta magja

**Fájlok:**
- Létrehoz: `core/draft-clusters.js`
- Létrehoz: `core/draft-clusters.test.js`

**Interfészek:**
- Fogyaszt: semmit (tiszta modul)
- Előállít:
  - `MAX_CLUSTER: number` (5), `MIN_CLUSTER: number` (2), `MIN_THEME_LEN: number` (8)
  - `isGenericTheme(theme: string) => boolean`
  - `parseClusterReply(parsed: any, validIds: string[]) => {theme: string, ids: string[]}[]`
  - `planWriteOrder(allIds: string[], groups: {theme,ids}[]) => {theme: string|null, ids: string[]}[]`

- [ ] **1. lépés: Írd meg a bukó tesztet**

Hozd létre: `core/draft-clusters.test.js`

```js
// ===================================================================
// TESZT — hír-csoportosítás korlátai
// ===================================================================
// INGYENES, hálózat nélküli.
//
// MIÉRT: user-kérés (2026-08-18): „ne több nézőpontból legyen több cikk, hanem
// több hírből egy cikk". A rokonságot AI dönti el, mert gépi mérce nem tudja:
// a ROKON Midjourney-ötös cím-hasonlósága 0,056, a FÜGGETLEN OpenAI-ötösé
// 0,022 — megkülönböztethetetlen. Ez a modul NEM dönt rokonságról; azt tartatja
// be, hogy az AI döntése ne mehessen félre.
// ===================================================================

import assert from 'assert/strict';
import {
  parseClusterReply, planWriteOrder, isGenericTheme,
  MAX_CLUSTER, MIN_CLUSTER, MIN_THEME_LEN
} from './draft-clusters.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 Hír-csoportosítás\n');

const ID = ['a.json', 'b.json', 'c.json', 'd.json', 'e.json', 'f.json'];

t('a jó választ elfogadja', () => {
  const g = parseClusterReply([{ theme: 'Midjourney V8 rollout', ids: ['a.json', 'b.json'] }], ID);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].ids, ['a.json', 'b.json']);
});

t('📌 a Midjourney-ötös ÖSSZEVONHATÓ', () => {
  const g = parseClusterReply([{ theme: 'Midjourney V8 release and web updates', ids: ID.slice(0, 5) }], ID);
  assert.equal(g.length, 1);
  assert.equal(g[0].ids.length, 5);
});

t('📌 az OpenAI-ötös NEM vonható össze — az ítélet külön hagyja őket', () => {
  // Ez a legfontosabb teszt. Ha az ítélet nem ad csoportot, MINDEN hír külön
  // cikk marad — pontosan úgy, ahogy ma. Az összevonás soha nem kötelező.
  const g = parseClusterReply([], ID);
  assert.deepEqual(g, []);
  const terv = planWriteOrder(ID.slice(0, 5), g);
  assert.equal(terv.length, 5, 'öt független bejelentés → öt cikk');
  terv.forEach(x => assert.equal(x.ids.length, 1));
});

t('🚫 az általános téma NEM csoport', () => {
  // „AI news" nem közös téma, hanem a rovat neve. Ha ezt elfogadnánk, az ítélet
  // a nap összes hírét egyetlen cikké gyúrhatná.
  assert.equal(isGenericTheme('AI news'), true);
  assert.equal(isGenericTheme('news'), true);
  assert.equal(isGenericTheme('   '), true);
  assert.equal(isGenericTheme('Midjourney V8 rollout'), false);
  for (const rossz of ['AI', 'news', 'updates', 'various', '']) {
    assert.deepEqual(parseClusterReply([{ theme: rossz, ids: ['a.json', 'b.json'] }], ID), []);
  }
});

t('a túl rövid téma sem csoport', () => {
  assert.ok('AI x'.length < MIN_THEME_LEN);
  assert.deepEqual(parseClusterReply([{ theme: 'AI x', ids: ['a.json', 'b.json'] }], ID), []);
});

t(`a csoport max ${MAX_CLUSTER} elemű — a többi külön cikk lesz`, () => {
  const g = parseClusterReply([{ theme: 'Nagyon sok Midjourney hir', ids: ID }], ID);
  assert.equal(g[0].ids.length, MAX_CLUSTER);
  const terv = planWriteOrder(ID, g);
  assert.equal(terv.length, 2, '5-ös csoport + a kimaradt egy külön');
  assert.equal(terv[1].ids.length, 1);
});

t(`az egyelemű „csoport" nem csoport (min ${MIN_CLUSTER})`, () => {
  assert.deepEqual(parseClusterReply([{ theme: 'Valami rendes tema', ids: ['a.json'] }], ID), []);
});

t('az ismeretlen azonosítót kidobja', () => {
  const g = parseClusterReply([{ theme: 'Valami rendes tema', ids: ['a.json', 'NINCS.json', 'b.json'] }], ID);
  assert.deepEqual(g[0].ids, ['a.json', 'b.json']);
});

t('egy hír csak EGY csoportba kerülhet', () => {
  // A második csoport a `b.json` nélkül marad, így egyelemű lenne → kiesik.
  const g = parseClusterReply([
    { theme: 'Elso rendes tema', ids: ['a.json', 'b.json'] },
    { theme: 'Masodik rendes tema', ids: ['b.json', 'c.json'] }
  ], ID);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].ids, ['a.json', 'b.json']);
});

t('🛟 SZEMÉT VÁLASZ → minden hír külön cikk (a mai viselkedés)', () => {
  for (const szemet of [null, undefined, 'szoveg', {}, [1, 2, 3], [{ nincs: 'ids' }]]) {
    assert.deepEqual(parseClusterReply(szemet, ID), [], JSON.stringify(szemet));
  }
  const terv = planWriteOrder(ID, parseClusterReply(null, ID));
  assert.equal(terv.length, ID.length);
});

t('a terv MINDEN híre pontosan egyszer szerepel', () => {
  const g = parseClusterReply([{ theme: 'Midjourney V8 rollout', ids: ['a.json', 'b.json', 'c.json'] }], ID);
  const terv = planWriteOrder(ID, g);
  const mind = terv.flatMap(x => x.ids);
  assert.equal(mind.length, ID.length);
  assert.equal(new Set(mind).size, ID.length);
});

t('a csoportok elöl vannak a tervben', () => {
  const g = parseClusterReply([{ theme: 'Midjourney V8 rollout', ids: ['e.json', 'f.json'] }], ID);
  const terv = planWriteOrder(ID, g);
  assert.equal(terv[0].ids.length, 2, 'a csoport megy elsőként');
  assert.ok(terv[0].theme);
});

console.log('\n✅ draft-clusters.test: mind a ' + pass + ' eset rendben');
```

- [ ] **2. lépés: Futtasd, hogy lásd a bukást**

Futtasd: `node core/draft-clusters.test.js`
Várt: `ERR_MODULE_NOT_FOUND`.

- [ ] **3. lépés: Írd meg a modult**

Hozd létre: `core/draft-clusters.js`

```js
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
```

- [ ] **4. lépés: Futtasd a tesztet**

Futtasd: `node core/draft-clusters.test.js`
Várt: PASS, „mind a 12 eset rendben".

- [ ] **5. lépés: Futtasd a teljes tesztsort**

Futtasd: `npm test`
Várt: 38 teszt, mind zöld.

- [ ] **6. lépés: Commit**

```bash
git add core/draft-clusters.js core/draft-clusters.test.js
git commit -F- <<'EOF'
feat(osszevonas): a csoportositas korlatai — tiszta mag

Ez a modul NEM dont rokonsagrol (azt AI donti el, mert gepi mercevel merve nem
megy: a ROKON Midjourney-otos cim-hasonlosaga 0,056, a FUGGETLEN OpenAI-otose
0,022 — megkulonboztethetetlen). Azt tartatja be, hogy az AI dontese ne
mehessen felre: valodi kozos tema, max 5 elem, minden hir pontosan egyszer.

A legfontosabb teszt: ures vagy szemet valasz -> NINCS csoport, tehat minden
hir kulon cikk lesz, pontosan ugy, ahogy ma.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Az összevonó ítélet bekötése

**Fájlok:**
- Módosít: `config.json` (`agents` blokk — új `cluster` bejegyzés)
- Módosít: `agents/iro/agent.js` (új `clusterDrafts()` függvény)

**Interfészek:**
- Fogyaszt: `extractJsonArray` (Task 4), `parseClusterReply` + `MAX_CLUSTER` (Task 5),
  `ask` a `core/ai-router.js`-ből
- Előállít: `async clusterDrafts(draftFilenames: string[]) => {groups, costUsd}`

- [ ] **1. lépés: Vedd fel a `cluster` agentet a configba**

A `config.json` `agents` objektumába, a `rss-scraper` mellé:

```json
    "cluster": {
      "primary_model": {
        "provider": "openrouter",
        "model": "minimax/minimax-m2.5"
      },
      "fallback_model": {
        "provider": "openrouter",
        "model": "minimax/minimax-m2.7"
      },
      "enabled": true,
      "comment": "HIR-OSSZEVONAS (2026-08-18, user: 'tobb hirbol egy cikk'). Gepies dontes: melyik fuggoben levo hirek szolnak ugyanarrol. Ezert M2.5, a legolcsobb mukodo fizetos tier. A bemenet csak cim + kivonat, par szaz token; napi ~1,3 csoportnyi forgalom. HIBA ESETEN NINCS CSOPORT: minden hir kulon cikk lesz, ahogy ma.",
      "routing": "paid-only"
    },
```

- [ ] **2. lépés: Ellenőrizd, hogy a config ép maradt**

Futtasd:
```bash
node -e "const c=require('./config.json'); console.log('cluster modell:', c.agents.cluster.primary_model.model)"
```
Várt: `cluster modell: minimax/minimax-m2.5`

- [ ] **3. lépés: Írd meg a `clusterDrafts()` függvényt**

Az `agents/iro/agent.js` import-blokkjához:

```js
import { extractJsonArray } from '../../core/extract-json.js';
import { parseClusterReply, planWriteOrder, MAX_CLUSTER } from '../../core/draft-clusters.js';
```

A `writeArticle` fölé:

```js
// ===================================================================
// ÖSSZEVONÓ ÍTÉLET — melyik függőben lévő hírek szólnak ugyanarról?
// ===================================================================
// A rokonságot AI dönti el, mert gépi mércével nem megy (a ROKON
// Midjourney-ötös cím-hasonlósága 0,056, a FÜGGETLEN OpenAI-ötösé 0,022).
// MINDEN forrás draftja EGYSZERRE megy be: a Claude Opus 5-öt három forrás is
// bejelentette ugyanazon a napon, abból három cikkünk lett.
//
// ⚠️ HIBÁNÁL ÜRES TÖMB — vagyis a mai viselkedés: minden hír külön cikk.
const CLUSTER_SYSTEM_PROMPT = `You group tech-news items that are about THE SAME underlying story or product release.

Group items ONLY when a single article could cover them together without losing focus.
Do NOT group items just because they come from the same company or the same day.
Five unrelated announcements from one company are FIVE topics, not one.

Respond with {"groups": [...]}. Each group: {"theme": "<short specific shared topic>", "ids": ["<id>", ...]}.
- "theme" must name the actual shared subject (e.g. "Midjourney V8 release"), never a section name like "AI news".
- Include at most ${MAX_CLUSTER} ids per group, at least 2.
- Items that do not clearly belong with another item MUST be left out entirely.
- If nothing belongs together, respond with {"groups": []}.`;

async function clusterDrafts(draftFilenames) {
  if (!Array.isArray(draftFilenames) || draftFilenames.length < 2) {
    return { groups: [], costUsd: 0 };
  }

  const tetelek = [];
  for (const f of draftFilenames) {
    try {
      const d = JSON.parse(readFileSync(join(DRAFTS_DIR, f), 'utf-8'));
      tetelek.push({ id: f, title: d.title || '', snippet: (d.content_snippet || '').slice(0, 180),
                     source: d._meta?.source_name || '' });
    } catch { /* olvashatatlan draft: kihagyjuk a csoportosításból */ }
  }
  if (tetelek.length < 2) return { groups: [], costUsd: 0 };

  const lista = tetelek.map(it =>
    `id: ${it.id}\n  source: ${it.source}\n  title: ${it.title}\n  summary: ${it.snippet}`
  ).join('\n\n');

  const response = await ask(
    `Group these ${tetelek.length} news items.\n\n${lista}`,
    { agentName: 'cluster', systemPrompt: CLUSTER_SYSTEM_PROMPT, maxTokens: 2000, jsonMode: true }
  );
  if (!response) return { groups: [], costUsd: 0 };

  try {
    const groups = parseClusterReply(extractJsonArray(response.text), tetelek.map(t => t.id));
    return { groups, costUsd: response.costUsd };
  } catch {
    // Értelmezhetetlen válasz: NEM okoskodunk, a mai viselkedésre esünk vissza.
    return { groups: [], costUsd: response.costUsd };
  }
}
```

⚠️ Ha az `ask` nincs még importálva az `agents/iro/agent.js`-ben, ellenőrizd
(`grep -n "import.*ai-router" agents/iro/agent.js`) — a `writeArticle` már
használja, tehát ott kell lennie.

- [ ] **4. lépés: Ellenőrizd a szintaxist**

Futtasd: `node --check agents/iro/agent.js`
Várt: nincs kimenet.

- [ ] **5. lépés: Futtasd a teljes tesztsort**

Futtasd: `npm test`
Várt: 38 teszt, mind zöld.

- [ ] **6. lépés: Commit**

```bash
git add config.json agents/iro/agent.js
git commit -F- <<'EOF'
feat(osszevonas): az itelet bekotese (M2.5, paid-only)

Minden forras draftja EGYSZERRE megy be: a Claude Opus 5-ot harom forras is
bejelentette ugyanazon a napon, abbol harom cikkunk lett — a kereszt-forrasu
csoportositas igy ingyen adodik.

A prompt kimondja, hogy az egy cegtol egy napon jott ot fuggetlen bejelentes
OT tema, nem egy. Hibanal / ertelmezhetetlen valasznal ures tomb, vagyis a
mai viselkedes: minden hir kulon cikk.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Összevont írás — a `--limit` cikket jelent, és a `_meta` viszi a forrásokat

**Fájlok:**
- Módosít: `agents/iro/agent.js` (`writeArticle`, `saveWrittenArticle`, a `main()` ciklusa)

**Interfészek:**
- Fogyaszt: `clusterDrafts` (Task 6), `planWriteOrder` (Task 5), `isAlreadyWritten` (Task 1)
- Előállít: `_meta.source_links: string[]`, `_meta.merged_from: number` a `WRITER_*` fájlokban

- [ ] **1. lépés: Alakítsd át a `writeArticle`-t több draftra**

Az `agents/iro/agent.js`-ben a `async function writeArticle(draft, brandContext) {`
szignatúrát cseréld erre, és a `topicSignal` felépítését is:

```js
async function writeArticle(drafts, brandContext, theme = null) {
  // TÖBB HÍRBŐL EGY CIKK (2026-08-18, user-kérés). A `drafts` mindig tömb —
  // egyelemű is lehet, akkor a viselkedés pontosan a régi.
  const lista = Array.isArray(drafts) ? drafts : [drafts];
  const fo = lista[0];

  // A scraped cikk CSAK témajelzés — NEM átírandó forrás!
  const jelzesek = lista.map((d, i) => `
[${i + 1}] What is currently timely (use ONLY as a hint of the subject — do NOT rewrite it):
"${d.title}"
Extra context to understand the subject (background only, never copy):
${(d.content_snippet || '').slice(0, 600)}`).join('\n');

  const kozos = lista.length > 1 ? `
⚠️ THESE ${lista.length} SIGNALS ARE ABOUT ONE SHARED SUBJECT: "${theme}".
Write ONE article about that shared subject — a single arc with one lesson.
Do NOT write a section per signal, and do NOT list them as separate news items.
The signals are evidence that this subject matters right now; the article is still
our own original, practical piece for everyday people.
` : '';

  const topicSignal = `
Topic area: ${fo._meta.relevance?.category || 'AI'}
${kozos}${jelzesek}
`;
```

A függvény többi része változatlan (a `topicSignal` innentől ugyanúgy használódik).

- [ ] **2. lépés: Bővítsd a `saveWrittenArticle`-t**

Az `agents/iro/agent.js` `saveWrittenArticle` függvényét cseréld erre:

```js
function saveWrittenArticle(originalDraftFilename, drafts, articleResponse, theme = null) {
  const lista = Array.isArray(drafts) ? drafts : [drafts];
  const fo = lista[0];
  const newFilename = 'WRITER_' + originalDraftFilename;
  const newPath = join(DRAFTS_DIR, newFilename);

  const writerOutput = {
    _meta: {
      written_at: new Date().toISOString(),
      writer_provider: articleResponse.provider,
      writer_model: articleResponse.model,
      writer_cost_usd: articleResponse.costUsd,
      original_draft: originalDraftFilename,
      source_id: fo._meta.source_id,
      source_name: fo._meta.source_name,
      source_link: fo.link,
      // ÖSSZEVONÁS (2026-08-18): MINDEN felhasznált forrás. A forrás-zár ezt is
      // nézi — enélkül a beolvasztott hír később külön cikként újra megíródna.
      source_links: lista.map(d => d.link).filter(Boolean),
      merged_from: lista.length,
      merged_theme: theme || null,
      status: 'awaiting-review'
    },
    article_markdown: normalizeArticleMarkdown(articleResponse.text),
    original_title: fo.title
  };

  writeFileSync(newPath, JSON.stringify(writerOutput, null, 2), 'utf-8');

  // A MEGÍRT draftokat töröljük — mindegyiket, amiből a cikk készült.
  for (const f of lista) {
    try { unlinkSync(join(DRAFTS_DIR, f.__filename)); } catch { /* már nincs ott */ }
  }
  return newFilename;
}
```

- [ ] **3. lépés: Írd át a `main()` ciklusát: a `--limit` CIKKET jelent**

⚠️ **Ez a terv legfontosabb viselkedés-változása.** Ma az `agents/ceo/agent.js:495`
a `--limit N`-t adja át, az író pedig `drafts.slice(0, args.limit)`-tel DRAFTOT
vág. Összevonás után ez kevesebb cikket eredményezne — pont az ellenkezőjét
annak, amit akarunk.

A Task 2 már létrehozta a `sourceKeys` szűrést és az `elo` listát a ciklus
előtt — **azokhoz ne nyúlj.** Csak az utánuk következő három sort cseréld:

```js
  const toProcess = args.limit ? elo.slice(0, args.limit) : elo;
  stats.drafts_total = toProcess.length;
  console.log(`📋 ${drafts.length} draft · ${elo.length} a zár után`);
  console.log(`🎯 Most feldolgozandó: ${toProcess.length}\n`);
```

erre (és utána a teljes `for` ciklust az alábbi ciklusra):

```js
  // A --limit CIKKET jelent, nem draftot (2026-08-18). A CEO amúgy is így érti:
  // agents/ceo/agent.js articles_remaining = 8 − a ma megírt hírek száma.
  const maxCikk = args.limit || elo.length;

  // ÖSSZEVONÁS: melyik hírek szólnak ugyanarról?
  const { groups, costUsd: clusterCost } = await clusterDrafts(elo);
  stats.total_cost_usd += clusterCost;
  stats.clusters_found = groups.length;
  if (groups.length) {
    console.log(`🔗 ${groups.length} téma-csoport: ` +
      groups.map(g => `"${g.theme}" (${g.ids.length})`).join(', '));
  }

  const terv = planWriteOrder(elo, groups).slice(0, maxCikk);
  stats.drafts_total = terv.reduce((s, e) => s + e.ids.length, 0);
  console.log(`📋 ${drafts.length} draft · ${elo.length} zár után · ${terv.length} cikk készül\n`);

  for (const egyseg of terv) {
    const lista = [];
    for (const f of egyseg.ids) {
      try {
        const d = JSON.parse(readFileSync(join(DRAFTS_DIR, f), 'utf-8'));
        d.__filename = f;                       // a törléshez kell
        lista.push(d);
      } catch { /* közben eltűnt */ }
    }
    if (!lista.length) continue;

    const cimke = lista.length > 1
      ? `🔗 ${lista.length} hír egy cikkbe: "${egyseg.theme}"`
      : `📰 Feldolgozás: ${egyseg.ids[0].slice(0, 60)}...`;
    console.log(cimke);

    const startTime = Date.now();
    const response = await writeArticle(lista, brandContext, egyseg.theme);
    const elapsedMs = Date.now() - startTime;

    if (!response) {
      console.log(`   ❌ Sikertelen (AI router nem válaszolt)\n`);
      stats.articles_failed++;
      stats.by_article.push({ draft: egyseg.ids[0], success: false, error: 'AI router returned null' });
      continue;
    }

    const writerFilename = saveWrittenArticle(egyseg.ids[0], lista, response, egyseg.theme);
    stats.total_cost_usd += response.costUsd;
    stats.articles_written++;
    stats.merged_total += lista.length > 1 ? 1 : 0;

    const previewMatch = response.text.match(/^#\s+(.+)$/m);
    const previewTitle = previewMatch ? previewMatch[1] : '(no title found)';
    console.log(`   ✅ Cikk megírva: "${previewTitle.slice(0, 70)}..."`);
    console.log(`   💰 Költség: $${response.costUsd.toFixed(4)} | ⏱️  ${(elapsedMs / 1000).toFixed(1)}s`);
    console.log(`   💾 Mentve: ${writerFilename}\n`);

    stats.by_article.push({ draft: egyseg.ids[0], success: true, merged_from: lista.length });
  }
```

⚠️ A `stats` objektumhoz vedd fel: `clusters_found: 0,` és `merged_total: 0,`.

- [ ] **4. lépés: Ellenőrizd a szintaxist és a zár épségét**

Futtasd: `node --check agents/iro/agent.js`
Várt: nincs kimenet.

Futtasd: `grep -c "isAlreadyWritten" agents/iro/agent.js`
Várt: `2` — egy import, egy hívás. Ha **1**, véletlenül kitörölted a Task 2
forrás-zárát; ha **3**, kétszer fut.

- [ ] **5. lépés: Futtasd a teljes tesztsort**

Futtasd: `npm test`
Várt: 38 teszt, mind zöld.

- [ ] **6. lépés: Commit**

```bash
git add agents/iro/agent.js
git commit -F- <<'EOF'
feat(osszevonas): tobb hirbol egy cikk + a --limit mostantol CIKKET jelent

A --limit eddig DRAFTOT vagott (drafts.slice), miközben a CEO cikkben gondolja
(articles_remaining = 8 - a ma megirt hirek). Ma egybeesett, mert 1 draft =
1 cikk. Osszevonas utan nem: 8 draftbol 5 cikk lenne, vagyis az osszevonas
CSOKKENTETTE volna a napi cikkszamot — pont az ellenkezoje a celnak.

Mostantol az iro addig vesz draftokat, amig N cikket meg nem irt. Ugyanannyi
cikk szuletik, de tobb hirt dolgoznak fel.

A _meta.source_links[] MINDEN felhasznalt forrast viszi, kulonben a beolvasztott
hir kesobb kulon cikkkent ujra megirodna.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Láthatóság — az összevonás és a zár jelenjen meg a napi riportban

**Fájlok:**
- Módosít: `core/report-lines.js` (új sor-építő)
- Módosít: `core/report-lines.test.js` (teszt az új sorra)
- Módosít: `core/daily-report.js` (a sor beillesztése)

**Interfészek:**
- Fogyaszt: `_meta.merged_from` a publikált cikkekből
- Előállít: `mergeLine(articles: object[], days: number) => string`

- [ ] **1. lépés: Írd meg a bukó tesztet**

A `core/report-lines.test.js` végére, a záró `console.log` ELÉ:

```js
t('🔗 az összevonás száma kimegy a riportba', () => {
  // MIÉRT KELL: ha az ítélet sosem von össze semmit, azt CSAK ebből lehet
  // észrevenni. A szám nélkül az „elkészült" és a „működik" nem különbözik.
  const cikkek = [
    { _meta: { merged_from: 3, published_at: '2026-08-18T01:00:00Z' } },
    { _meta: { merged_from: 1, published_at: '2026-08-18T02:00:00Z' } },
    { _meta: { published_at: '2026-08-18T03:00:00Z' } }
  ];
  const sor = mergeLine(cikkek, 1);
  assert.match(sor, /🔗/);
  assert.match(sor, /1/, 'egy összevont cikk');
  assert.match(sor, /3/, 'három hírből');
});

t('összevonás nélkül is ad értelmes sort', () => {
  const sor = mergeLine([{ _meta: { published_at: '2026-08-18T01:00:00Z' } }], 1);
  assert.ok(typeof sor === 'string' && sor.length > 0);
  assert.match(sor, /nem volt|0/);
});

t('hiányzó adatra nem borul', () => {
  assert.ok(typeof mergeLine(null, 1) === 'string');
  assert.ok(typeof mergeLine([], 1) === 'string');
});
```

Az import-sort a fájl tetején egészítsd ki `mergeLine`-nal.

- [ ] **2. lépés: Futtasd, hogy lásd a bukást**

Futtasd: `node core/report-lines.test.js`
Várt: FAIL — `mergeLine is not a function`.

- [ ] **3. lépés: Írd meg a `mergeLine`-t**

A `core/report-lines.js` végére, az `export default` ELÉ:

```js
/**
 * 🔗 Hír-összevonás — hány cikk készült több hírből az elmúlt N napban.
 *
 * MIÉRT KELL EZ A SOR: az összevonás legvalószínűbb csendes hibája nem az,
 * hogy rosszul csoportosít, hanem hogy SOSEM csoportosít. Az ítélet
 * visszaeshet üres válaszra, a korlátok lehetnek túl szigorúak — és minden
 * „működni" látszana, mert a cikkek elkészülnek. Ez a szám a különbség az
 * „elkészült" és a „működik" között.
 */
export function mergeLine(articles, days = 1) {
  const lista = Array.isArray(articles) ? articles : [];
  const hatar = Date.now() - days * 86400000;
  let cikk = 0, hir = 0;
  for (const a of lista) {
    const at = Date.parse(a?._meta?.published_at || '');
    if (!Number.isFinite(at) || at < hatar) continue;
    const n = Number(a?._meta?.merged_from) || 1;
    if (n > 1) { cikk++; hir += n; }
  }
  return cikk
    ? `🔗 Összevonás: ${cikk} cikk ${hir} hírből (${days} nap)`
    : `🔗 Összevonás: nem volt (0 cikk, ${days} nap)`;
}
```

- [ ] **4. lépés: Futtasd a tesztet**

Futtasd: `node core/report-lines.test.js`
Várt: PASS.

- [ ] **5. lépés: Illeszd be a sort a napi riportba**

A `core/daily-report.js` **24. során** egészítsd ki a meglévő importot:

```js
import { describePosts, describeRepeat, describeTranslationGaps, mergeLine } from './report-lines.js';
```

A **150-152. sor** környékén már van egy ciklus, ami a MAI cikkeket olvassa
(`const artDir = join(ROOT, 'content', 'articles');`). Ne olvasd be újra a
fájlokat — gyűjtsd össze ugyanabban a ciklusban. A `let news = 0, guides = 0;
const titles = [];` sort egészítsd ki:

```js
  let news = 0, guides = 0; const titles = []; const maiCikkek = [];
```

A cikluson belül, közvetlenül a `published_at` szűrő (`continue`) UTÁN:

```js
        maiCikkek.push(d);
```

Ezt a tömböt add vissza a riport-adatok közt (ugyanott, ahol a `news`/`guides`
számok visszaadódnak — a függvény `return` objektumához vedd fel:
`maiCikkek,`), majd a sorok összeállításánál, a **360. sor** körüli
„Ismétlődő téma kiszűrve" sor MELLÉ:

```js
    lines.push(mergeLine(r.maiCikkek, 1));
```

⚠️ Ha a `r` objektum neve a te kódrészletedben más, használd az ott érvényeset —
a `grep -n "r.pendingSources" core/daily-report.js` megmutatja.

- [ ] **6. lépés: Futtasd a teljes tesztsort**

Futtasd: `npm test`
Várt: 38 teszt, mind zöld.

- [ ] **7. lépés: Commit**

```bash
git add core/report-lines.js core/report-lines.test.js core/daily-report.js
git commit -F- <<'EOF'
feat(riport): az osszevonas szama menjen ki a napi jelentesbe

Az osszevonas legvaloszinubb csendes hibaja nem az, hogy rosszul csoportosit,
hanem hogy SOSEM csoportosit — es akkor minden "mukodni" latszik, mert a
cikkek elkeszulnek. Ez a szam a kulonbseg az "elkeszult" es a "mukodik" kozott.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Az elkészülés után

Egy hét múlva nézd meg (a spec 8. szakasza kéri):

1. Hány cikk született `merged_from > 1`-gyel? Ha **nulla**, az ítélet vagy a
   korlátok túl szigorúak — nem az a baj, hogy nincs mit összevonni.
2. Hányszor fogott a forrás-zár? (`stats.skipped_duplicate` a futás-naplókban.)
3. Futtasd újra a duplikáció-mérést: keletkezett-e új azonos-forrású pár.
