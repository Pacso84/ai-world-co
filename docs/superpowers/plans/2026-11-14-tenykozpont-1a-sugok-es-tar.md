# TÉNYKÖZPONT 1. fázis / A rész — ÚJ SÚGÓK + CI-PRÓBA + SÚGÓ-TÁR — megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 11-12-én jóváhagyott 13 új súgó cikklistája gépileg letölthető legyen (a CI amerikai gépéről igazolva), és minden letöltött súgószöveg a privát forrás-tárba kerüljön hash-sel, hogy a későbbi futások ugyanazt lássák.

**Architecture:** A `core/sugo-index.js` `FORRASOK` táblája új szolgáltatókat és két új forrásfajtát kap (szöveges oldallista, egyetlen lap), valamint egy fejlesztői kizáró mintát. A `core/forras-szint.js` minden eszközhöz megmondja, mely `FORRASOK`-kulcs(ok) tartoznak hozzá (`sugoKulcsok`). Egy $0-s kézi CI-próba (`core/sugo-proba.js` + workflow) minden kulcsra letölt egy indexet és két cikket. Ami a CI-ből nem megy, „nincs” szintre kerül. Az új `core/sugo-tar.js` a súgószöveget a `_forrasok/sugo/` alá menti. Minden agent ezen át kéri a súgószöveget, nem közvetlenül a `cikkSzoveg`-gel.

**Tech Stack:** Node.js ESM, saját tesztkeret (`assert/strict`, `core/*.test.js`, `node core/run-tests.js`), GitHub Actions (`workflow_dispatch`).

**Spec:** `docs/superpowers/specs/2026-11-12-tenykozpont-design.md` — 5. pont 1a és 1b, 3. pont (korlátok), 4.1 (forrásszintek), 9. pont (olvasó-védelem).

**Ez a rész NEM tartalmazza** (később, külön tervben): 1c termék-adatlap homlokzat · 1d téma csak súgó-horgonnyal · 1e író csak súgóból · 1f bíráló súgóhoz mér (+ ekkor a Word/Excel/Outlook/PowerPoint a Microsoft TELJES sorába) · 1g napi Telegram-sor · az Amazon- és az Apple-súgó cikklistája (11-14-i helyi próba: az Amazon `gp/help` lapján nincs gépileg kiolvasható cikklista, az Apple iPhone-útmutató tartalomjegyzéke külön feldolgozót igényel) · a súgó nyelvenkénti (hu/es) letöltése (spec 8.2) · a `szolgaltatok()` (Ha elakadsz doboz) bővítése az új súgókra.

## Global Constraints

- Kiadói (súgó) szöveg SOHA nem kerül a nyilvános repóba: csak `_forrasok/` (privát tár, `.gitignore`) vagy futásidő. A teszt-fixtúrák saját, kitalált mondatok, nem valódi súgószöveg.
- A tár hiánya vagy írási hibája SOHA nem állít meg futást (üres / `null` / `false`, kivétel nincs).
- Új súgó-előtag CSAK a spec 4.1 listájából (user-jóváhagyás 11-12). Más előtag nem kerülhet az `ENGEDELY`-be.
- Kill-switch a `core/` oldalon (`export const SUGO_TAR_BE = true`) + teszt, ami az értékét rögzíti. A config `enabled` mező NEM kapcsoló.
- Kód-kommentek, konzol- és riport-sorok MAGYARUL, nem-technikus olvasónak.
- Tesztek: `node core/run-tests.js > <scratchpad>/teszt.txt 2>&1` (kimenet FÁJLBA, soha csővezeték), egyes teszt: `node core/<név>.test.js`. Hálózat és fizetős AI-hívás a tesztekben TILOS (a `fetchFn` injektálva).
- Build-próba csak scratchpad-másolatban + `node core/output-guard.js` (ez a rész élő oldalt nem változtat, de az agent-bekötés után kötelező).
- Commit feladatonként, csak a feladat fájljaival; a commit-üzenet végén: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push a `main`-re a 6. feladat után (a CI épít; helyben build/deploy SOHA).
- Olvasó-védelem (spec 9.): ez a rész publikált szöveget nem ír át; a súgószöveg csak a gépeken belüli mérést/írást táplálja.

## Review Focus

- A sitemap helyett 200-as HTML-hibalap (Cloudflare-ellenőrzés, bejelentkezés) jön → 0 cikk, nincs kivétel (1. feladat tesztje).
- A fejlesztői kizáró minta (`kizar`) minden forrásfajtánál érvényes (sitemap, lap, lista), nem csak a sitemapnél (1. feladat tesztje).
- Ugyanaz a súgócikk `?hl=en`, `#szakasz`, záró perjel változatban → ugyanaz a tár-kulcs, nem lesz belőle három fájl (5. feladat tesztje).
- A tárban sérült a `.json` meta, vagy a tár mappája helyén egy fájl áll → élő letöltés, nincs kivétel (5. feladat tesztje).
- A régi, kézi `official_sources` nem jóváhagyott URL-lel → a szöveg továbbra is lejön (régi viselkedés), de a tárba NEM kerül (5. feladat tesztje).

---

### Task 1: Új súgóforrások a cikklistában (spec 1a)

**Files:**
- Modify: `core/sugo-index.js` (`ENGEDELY`, `FORRASOK`, `indexLetolt`, új `listaCikkek`)
- Test: `core/sugo-index.test.js`

**Interfaces:**
- Produces: `FORRASOK` új kulcsai: `perplexity`, `grok`, `githubcopilot`, `huggingface`, `cohere`, `duckai`, `lumo`, `zai`, `elevenlabs`, `deepseek`, `kimi`, `minimax`, `braveleo`. Forrás-elem alakja: `{ sitemap | lap | lista | egy, alap?, minta, kizar?, cim? }`.
- Produces: `listaCikkek(szoveg: string, alap: string, minta: RegExp, kizar?: RegExp) → {url, cim}[]` — soronként `/`-rel kezdődő útvonal-lista (GitHub pagelist).
- Produces: `indexLetolt(szolg, fetchFn)` változatlan aláírással; a `kizar` mintára illő URL kimarad; `egy` forrásnál `[{ url: egy, cim }]` letöltés nélkül.

- [ ] **Step 1: A régi tesztsor átírása + új tesztek**

A `core/sugo-index.test.js`-ben a `'https://www.perplexity.ai/help-center/en/x'` kikerül a „nem szabad elfogadni” listából, és átkerül az elfogadandók közé. A `szolgaltatok('Perplexity'…)` és a `szolgaltatok('GitHub Copilot'…)` sor VÁLTOZATLAN marad: a doboz-bővítés nem ennek a résznek a feladata. Új tesztek:

```js
// új előtagok (spec 4.1, user 11-12)
for (const u of ['https://www.perplexity.ai/help-center/en/articles/1-x', 'https://docs.x.ai/grok/x', 'https://docs.x.ai/x-subscription/x',
  'https://docs.github.com/en/copilot/get-started', 'https://huggingface.co/docs/hub', 'https://docs.cohere.com/docs/x',
  'https://duckduckgo.com/duckduckgo-help-pages/ai-features/x', 'https://proton.me/support/lumo-x', 'https://docs.z.ai/guides/x',
  'https://elevenlabs.io/docs/overview/x', 'https://api-docs.deepseek.com/news/x', 'https://platform.kimi.ai/docs/x',
  'https://platform.minimax.io/docs/x', 'https://brave.com/leo/'])
  assert.ok(engedelyezett(u), 'új jóváhagyott előtag: ' + u);
for (const u of ['https://docs.x.ai/developers/x', 'https://docs.x.ai/console/x', 'https://docs.github.com/en/actions/x', 'https://brave.com/search/'])
  assert.ok(!engedelyezett(u), 'jóváhagyáson kívüli rész: ' + u);

// lista-forrás (GitHub pagelist: soronként egy útvonal)
assert.deepEqual(listaCikkek('/en/copilot/get-started\n/en/actions/x\n/en/copilot/how-tos/chat\n', 'https://docs.github.com', /^\/en\/copilot\//).map(c => c.url),
  ['https://docs.github.com/en/copilot/get-started', 'https://docs.github.com/en/copilot/how-tos/chat']);
// kizáró minta minden forrásfajtánál
assert.equal(sitemapCikkek('<loc>https://docs.z.ai/api-reference/a</loc><loc>https://docs.z.ai/guides/b</loc>', /docs\.z\.ai\//, /\/api-reference\//).length, 1);
assert.equal(linkCikkek('<a href="/docs/_mintlify/x">Assets x</a><a href="/docs/guide/chat">Chat guide</a>', 'https://platform.kimi.ai', /^\/docs\//, /\/_mintlify\//).length, 1);
// 200-as HTML-hibalap sitemap helyett → 0 cikk, nincs kivétel
const hibalap = async () => ({ ok: true, text: async () => '<html><title>Just a moment...</title></html>' });
assert.deepEqual(await indexLetolt('perplexity', hibalap), []);
// egy-lapos forrás: letöltés nélkül az egy cikk
let hivas = 0;
assert.deepEqual(await indexLetolt('braveleo', async () => { hivas++; throw new Error('nem kéne'); }), [{ url: 'https://brave.com/leo/', cim: 'Brave Leo' }]);
assert.equal(hivas, 0);
// minden FORRASOK-elem forrás-URL-je https, és minden elem mintája RegExp
for (const [k, lista] of Object.entries(FORRASOK)) for (const f of lista) {
  assert.ok(String(f.sitemap || f.lap || f.lista || f.egy).startsWith('https://'), k);
  assert.ok(f.minta instanceof RegExp, k);
}
```

(A `sitemapCikkek` és a `linkCikkek` új, opcionális utolsó paramétere a `kizar`. A teszt importjába bekerül a `listaCikkek` és a `FORRASOK`.)

- [ ] **Step 2: A teszt futtatása — bukik**

Run: `node core/sugo-index.test.js`
Expected: FAIL (a `listaCikkek` nincs exportálva / a perplexity-előtag nincs engedélyezve).

- [ ] **Step 3: A megvalósítás a `core/sugo-index.js`-ben**

`ENGEDELY` új elemei, pontosan ezek (mind `/`-re végződik):
`https://www.perplexity.ai/help-center/`, `https://docs.x.ai/grok/`, `https://docs.x.ai/x-subscription/`, `https://docs.github.com/en/copilot/`, `https://huggingface.co/docs/`, `https://docs.cohere.com/`, `https://duckduckgo.com/duckduckgo-help-pages/`, `https://proton.me/support/`, `https://docs.z.ai/`, `https://elevenlabs.io/docs/`, `https://api-docs.deepseek.com/`, `https://platform.kimi.ai/docs/`, `https://platform.minimax.io/docs/`, `https://brave.com/leo/`.
Komment: a `proton.me/support/` tágabb a jóváhagyott `…/support/lumo`-nál, ezért a Lumo-index mintája szűkít a Lumóra. A fejléc-komment „Új előtag CSAK user-jóváhagyással” mondata mellé dátum: 11-12 (spec 4.1).

`FORRASOK` új sorai (a darabszám a 11-14-i helyi mérés; a CI-próba igazolja, 3–4. feladat):

| kulcs | forrás | minta | kizar |
|---|---|---|---|
| perplexity | `sitemap: https://www.perplexity.ai/help-center/sitemap.xml` | `/\/help-center\/en\/articles\//` (232) | — |
| grok | `sitemap: https://docs.x.ai/sitemap.xml` | `/docs\.x\.ai\/(grok\|x-subscription)\//` (42) | — |
| githubcopilot | `lista: https://docs.github.com/api/pagelist/en/free-pro-team@latest`, `alap: https://docs.github.com` | `/^\/en\/copilot\//` (571) | — |
| huggingface | `lap: https://huggingface.co/docs`, `alap: https://huggingface.co` | `/^\/docs\/[a-z0-9-]+$/` (31 gyűjtőlap) | — |
| cohere | `sitemap: https://docs.cohere.com/sitemap.xml` | `/docs\.cohere\.com\/docs\//` | `/\/reference\//` |
| duckai | `sitemap: https://duckduckgo.com/duckduckgo-help-pages/sitemap.xml` | `/\/duckduckgo-help-pages\/(ai-features\|duck-ai)\//` (17) | — |
| lumo | `lap: https://proton.me/support/lumo`, `alap: https://proton.me` | `/^\/support\/[a-z0-9-]*lumo[a-z0-9-]*$/` | — |
| zai | `sitemap: https://docs.z.ai/sitemap.xml` | `/docs\.z\.ai\//` | `/\/api-reference\//` |
| elevenlabs | `sitemap: https://elevenlabs.io/docs/sitemap-en.xml` | `/elevenlabs\.io\/docs\//` | `/\/docs\/(api-reference\|developers\|cookbooks?\|sdks?)\//` |
| deepseek | `sitemap: https://api-docs.deepseek.com/sitemap.xml` | `/api-docs\.deepseek\.com\//` | `/\/api\//` |
| kimi | `lap: https://platform.kimi.ai/docs`, `alap: https://platform.kimi.ai` | `/^\/docs\/[a-z0-9\/-]+$/` | `/\/(_mintlify\|mintlify-assets\|api)\//` |
| minimax | `lap: https://platform.minimax.io/docs`, `alap: https://platform.minimax.io` | `/^\/docs\/[a-z0-9\/-]+$/` (helyben 0 — a próba dönt) | `/\/api-reference\//` |
| braveleo | `egy: https://brave.com/leo/`, `cim: 'Brave Leo'` | `/./` | — |

`indexLetolt`: a `lista` forrást a `listaCikkek`-kel dolgozza fel, az `egy` forrást letöltés nélkül adja vissza, a `kizar`-t mindhárom feldolgozónak továbbadja. A cím a `slugCim`-ből jön, mint a sitemapnél.

- [ ] **Step 4: A teszt futtatása — zöld**

Run: `node core/sugo-index.test.js`
Expected: nincs kimenet hibával, kilépési kód 0.

- [ ] **Step 5: Commit**

```bash
git add core/sugo-index.js core/sugo-index.test.js
git commit -m "tényközpont 1a: 13 új jóváhagyott súgó a cikklistában (lista/egy forrás, fejlesztői kizárás)"
```

---

### Task 2: Eszköz → súgó-kulcsok egy helyen (spec 0a „+ mely súgó-kulcs(ok)”)

**Files:**
- Modify: `core/forras-szint.js` (minden `ESZKOZ_SZINT` elem új `kulcsok` mezőt kap, és van egy új `sugoKulcsok` export)
- Test: `core/forras-szint.test.js`

**Interfaces:**
- Consumes: `FORRASOK` kulcsai (1. feladat) — CSAK a tesztben importálva (a `forras-szint.js` NEM importálja a `sugo-index.js`-t, így nincs körkörös függés).
- Produces: `sugoKulcsok(tool: string, company: string) → string[]` — a `forrasSzint()` kanonikus eszközének `kulcsok` tömbje. `nincs` vagy `cegfuggetlen` szintnél `[]`.

- [ ] **Step 1: Failing test**

```js
import { FORRASOK } from './sugo-index.js';
assert.deepEqual(sugoKulcsok('ChatGPT', 'OpenAI'), ['openai']);
assert.deepEqual(sugoKulcsok('Perplexity AI', ''), ['perplexity']);
assert.deepEqual(sugoKulcsok('', 'xAI'), ['grok']);
assert.deepEqual(sugoKulcsok('DeepSeek Chat', 'DeepSeek'), ['deepseek']);
assert.deepEqual(sugoKulcsok('Meta AI', 'Meta'), []);
assert.deepEqual(sugoKulcsok('Word', 'Microsoft'), [], 'ismeretlen eszköz ismert cégnél: nincs (az 1f rész dönt a Wordről)');
assert.deepEqual(sugoKulcsok('', ''), []);
// tábla-épség: minden kulcs létezik; „nincs” szintnek nincs kulcsa; nincs árva FORRASOK-kulcs
const hasznalt = new Set();
for (const [nev, e] of Object.entries(ESZKOZ_SZINT)) {
  assert.ok(Array.isArray(e.kulcsok), nev + ': kulcsok mező kell');
  if (e.szint === SZINT.NINCS) assert.deepEqual(e.kulcsok, [], nev);
  for (const k of e.kulcsok) { assert.ok(FORRASOK[k], nev + ': ismeretlen kulcs ' + k); hasznalt.add(k); }
}
for (const k of Object.keys(FORRASOK)) assert.ok(hasznalt.has(k), 'árva FORRASOK-kulcs: ' + k);
```

- [ ] **Step 2: Run** `node core/forras-szint.test.js` → FAIL (`sugoKulcsok` nincs).

- [ ] **Step 3: Implement**

`kulcsok` értékek: ChatGPT `['openai']` · Claude `['claude']` · Gemini `['gemini']` · Gemini Notebook `['notebooklm']` · Google Photos `['photos']` · Microsoft Copilot `['microsoft']` · Le Chat `['mistral']` · Apple Intelligence `[]` · Alexa+ `[]` (a cikklista egy későbbi részben jön; a szint marad TELJES) · Grok `['grok']` · Perplexity `['perplexity']` · GitHub Copilot `['githubcopilot']` · Hugging Face `['huggingface']` · Cohere `['cohere']` · Duck.ai `['duckai']` · Lumo `['lumo']` · Z.ai `['zai']` · ElevenLabs `['elevenlabs']` · DeepSeek `['deepseek']` · Kimi `['kimi']` · MiniMax Code `['minimax']` · Brave Leo `['braveleo']` · minden NINCS elem `[]`. A `default` export is megkapja a `sugoKulcsok`-ot.

- [ ] **Step 4: Run** `node core/forras-szint.test.js` és `node core/fek.test.js` → mindkettő zöld (a fék viselkedése nem változhat).

- [ ] **Step 5: Commit** — `git add core/forras-szint.js core/forras-szint.test.js` · üzenet: `tényközpont 1a: eszközönkénti súgó-kulcsok (sugoKulcsok)`.

---

### Task 3: CI-próba minden súgóra (spec 1a „CI-próba kötelező”)

**Files:**
- Create: `core/sugo-proba.js`
- Create: `core/sugo-proba.test.js`
- Create: `.github/workflows/sugo-proba.yml`

**Interfaces:**
- Consumes: `FORRASOK`, `indexLetolt` (1. feladat); `cikkSzoveg(url, fetchFn) → {szoveg, cim} | null` (`core/elakadas-gen.js`, változatlan).
- Produces: `probaKulcs(kulcs: string, { fetchFn, cikkSzovegFn, n = 2 }) → Promise<{ kulcs, cikkek: number, minta: {url, cim, hossz}[], ok: boolean, miert: string }>`. Az `ok` igaz, ha `cikkek > 0` ÉS legalább egy mintacikk szövege legalább `MIN_HOSSZ = 300` karakter. A `miert` magyar mondat („0 cikk a listában”, „a cikkek szövege nem jött le”, „rendben”).
- CLI: `node core/sugo-proba.js --proba [kulcs …]` (kulcs nélkül: mind). Kulcsonként egy sor (`✅ perplexity: 232 cikk, minta 2/2 olvasható`), a végén egy sor: `PROBA_JSON ` + a tömb JSON-ja. A kilépési kód mindig 0 (a próba nem „bukik”, hanem jelent).

- [ ] **Step 1: Failing test** (`core/sugo-proba.test.js`, hálózat nélkül)

```js
const index = async () => ({ ok: true, text: async () => '<loc>https://www.perplexity.ai/help-center/en/articles/1-a</loc><loc>https://www.perplexity.ai/help-center/en/articles/2-b</loc>' });
const hosszu = async url => ({ szoveg: 'x'.repeat(400), cim: url });
const ures = async () => null;
let r = await probaKulcs('perplexity', { fetchFn: index, cikkSzovegFn: hosszu });
assert.equal(r.ok, true); assert.equal(r.cikkek, 2); assert.equal(r.minta.length, 2);
r = await probaKulcs('perplexity', { fetchFn: index, cikkSzovegFn: ures });
assert.equal(r.ok, false); assert.match(r.miert, /szöveg/);
r = await probaKulcs('perplexity', { fetchFn: async () => { throw new Error('403'); }, cikkSzovegFn: hosszu });
assert.equal(r.ok, false); assert.equal(r.cikkek, 0);
r = await probaKulcs('nincs-ilyen', { fetchFn: index, cikkSzovegFn: hosszu });
assert.equal(r.ok, false);
```

- [ ] **Step 2: Run** `node core/sugo-proba.test.js` → FAIL (nincs modul).

- [ ] **Step 3: Implement** — a `core/sugo-proba.js` csak akkor futtatja a CLI-t, ha `process.argv[1]` erre a fájlra végződik (importáláskor nincs mellékhatás). A mintacikkek a lista elejéről és közepéről jönnek (`n = 2`: az első és a középső), hogy ne csak egy gyűjtőlapot nézzünk.

Workflow (`.github/workflows/sugo-proba.yml`) a `forras-proba.yml` mintájára: `workflow_dispatch`, opcionális `kulcsok` bemenet (env-en át, idézőjelben), `permissions: contents: read`, `timeout-minutes: 15`, `actions/checkout@v4` + `actions/setup-node@v4` (22) + `npm ci` (az `elakadas-gen.js` függőségei miatt) + `node core/sugo-proba.js --proba $KULCSOK`. Titkos kulcs, AI-hívás és commit nincs. Fejléc-komment magyarul: mire való, költsége $0, hogyan kell indítani.

- [ ] **Step 4: Run** `node core/sugo-proba.test.js` → zöld · helyben élesben: `node core/sugo-proba.js --proba > <scratchpad>/sugo-proba-helyi.txt 2>&1` → a fájlban 22 sor + `PROBA_JSON`.

- [ ] **Step 5: Commit + push** — `git add core/sugo-proba.js core/sugo-proba.test.js .github/workflows/sugo-proba.yml` · üzenet: `tényközpont 1a: $0-s CI-próba minden jóváhagyott súgóra` · `git push` (a workflow csak a `main`-ről indítható).

---

### Task 4: A CI-próba lefuttatása és az eredmény beépítése

**Files:**
- Modify: `core/forras-szint.js` (csak a CI-ből nem működő súgók sora)
- Modify: `core/sugo-index.js` (a nem működő súgó `FORRASOK`-sora kikerül, az `ENGEDELY`-előtag marad)
- Modify: `core/forras-szint.test.js`, `core/sugo-index.test.js` (az érintett várt értékek)

**Interfaces:**
- Consumes: `PROBA_JSON` a CI-naplóból (3. feladat).
- Produces: a 2. feladat tábla-épség tesztje továbbra is zöld (árva kulcs nincs).

- [ ] **Step 1: Indítás** — `gh workflow run sugo-proba.yml`, majd a futás azonosítója: `gh run list --workflow sugo-proba.yml -L 1`. A befejezést a futás állapotával kell figyelni, nem találgatni.
- [ ] **Step 2: Napló** — `gh run view <id> --log > <scratchpad>/sugo-proba-ci.txt` (fájlba). Kigyűjtendő: kulcsonként `ok`, `cikkek`, `miert`, a helyi eredmény mellé téve.
- [ ] **Step 3: Döntés kulcsonként** (spec 1a: „Ami a CI-ből nem megy, az »nincs« szintre kerül”):
  - CI `ok: true` → marad.
  - CI `ok: false` → a `forras-szint.js`-ben az eszköz `szint: SZINT.NINCS`, `kulcsok: []`, komment: `// CI-próba 2026-11-1x: <miert> (helyben: <helyi eredmény>)`. A `FORRASOK`-sor kikerül. A teszt várt értékei ehhez igazodnak.
  - A Hugging Face, ha csak gyűjtőlapokat ad (a mintacikk egy fejezet-tartalomjegyzék, nincs benne lépés): marad, de a komment rögzíti, hogy a súgó-választónak (1d) kell lépésenként a fejezetbe mennie.
- [ ] **Step 4: Run** `node core/run-tests.js > <scratchpad>/teszt.txt 2>&1` → a fájl végén minden teszt zöld (a darabszám a 11-14-i 211 + a most hozzáadottak).
- [ ] **Step 5: Commit** — üzenet: `tényközpont 1a: a CI-ből nem olvasható súgók „nincs” szintre (próba <run-id>)`. **A usernek** magyarul: melyik súgó ment, melyik nem, és ez mit jelent (a nem működőről továbbra sem készül új útmutató).

---

### Task 5: Súgószöveg a privát tárban (spec 1b)

**Files:**
- Create: `core/sugo-tar.js`
- Create: `core/sugo-tar.test.js`

**Interfaces:**
- Consumes: `engedelyezett(url)` (`core/sugo-index.js`); `cikkSzoveg(url, fetchFn)` (`core/elakadas-gen.js`); a tár gyökere ugyanúgy, mint a `core/forras-cache.js`-ben (`process.env.FORRAS_TAR_DIR || <repó>/_forrasok`).
- Produces:
  - `SUGO_TAR_BE = true` (kill-switch; `false` → a `sugoSzoveg` tiszta `cikkSzoveg`-továbbítás, tár nélkül).
  - `SUGO_FRISS_NAP = 7`.
  - `sugoTarKulcs(url: string) → string | null` — sha256 első 16 hexa jegye a normalizált URL-ből (query és `#` nélkül, záró perjel nélkül, kisbetűs host). Nem `https` URL esetén `null`.
  - `sugoTarIr(url, { cim, szoveg }, { dir, most }) → boolean` — fájlok: `<dir>/<host>/<kulcs>.txt` (szöveg) és `<dir>/<host>/<kulcs>.json` (`{ url, cim, letoltve, hash, hossz, valtozott? }`; a `hash` a szöveg sha256 16 hexája; a `valtozott` ISO-dátum, ha a hash eltér a korábbitól). Csak `engedelyezett(url)` URL-re ír. Hibánál `false`.
  - `sugoTarOlvas(url, { dir }) → { szoveg, cim, letoltve, hash } | null`.
  - `sugoSzoveg(url, { fetchFn, dir, most, frissNap = SUGO_FRISS_NAP }) → Promise<{ szoveg, cim, honnan: 'tar' | 'elo' | 'regi-tar' } | null>` — sorrend: friss tár (`most - letoltve ≤ frissNap`) → élő letöltés (siker: tárba ír, `'elo'`) → régi tár (`'regi-tar'`) → `null`. Nem jóváhagyott URL: élő letöltés, tárba írás nélkül.
- A `dir` alapértéke: `process.env.SUGO_TAR_DIR || join(<tár gyökere>, 'sugo')`.

- [ ] **Step 1: Failing test** (`core/sugo-tar.test.js`, ideiglenes mappa a `os.tmpdir()`-ben, a végén törölve)

```js
assert.equal(SUGO_TAR_BE, true);
const U = 'https://support.claude.com/en/articles/1-x';
assert.equal(sugoTarKulcs(U), sugoTarKulcs(U + '/'));
assert.equal(sugoTarKulcs(U), sugoTarKulcs(U + '?hl=en#lepesek'));
assert.equal(sugoTarKulcs('http://support.claude.com/x'), null);
const elo = async () => ({ ok: true, text: async () => '<html><title>Cím</title><body>' + 'Saját tesztmondat. '.repeat(40) + '</body></html>' });
const halott = async () => { throw new Error('nincs net'); };
const most = Date.parse('2026-11-14T12:00:00Z');
// 1. élő → tárba ír
let r = await sugoSzoveg(U, { fetchFn: elo, dir, most });
assert.equal(r.honnan, 'elo'); assert.ok(sugoTarOlvas(U, { dir }));
// 2. friss tár → nincs letöltés
r = await sugoSzoveg(U, { fetchFn: halott, dir, most: most + 3 * 864e5 });
assert.equal(r.honnan, 'tar');
// 3. elavult tár + halott net → régi tár
r = await sugoSzoveg(U, { fetchFn: halott, dir, most: most + 30 * 864e5 });
assert.equal(r.honnan, 'regi-tar');
// 4. nem jóváhagyott URL → szöveg jön, tárba nem kerül
r = await sugoSzoveg('https://example.com/help', { fetchFn: elo, dir, most });
assert.equal(r.honnan, 'elo'); assert.equal(sugoTarOlvas('https://example.com/help', { dir }), null);
// 5. sérült meta → élő letöltés, nincs kivétel
writeFileSync(join(dir, 'support.claude.com', sugoTarKulcs(U) + '.json'), '{rossz');
r = await sugoSzoveg(U, { fetchFn: elo, dir, most });
assert.equal(r.honnan, 'elo');
// 6. a tár helyén fájl áll → az írás false, a szöveg mégis megjön
const fajlDir = join(dir, 'fajl'); writeFileSync(fajlDir, 'x');
r = await sugoSzoveg(U, { fetchFn: elo, dir: fajlDir, most });
assert.equal(r.honnan, 'elo');
// 7. változás-jelzés: más szöveg ugyanarra az URL-re → valtozott kitöltve
// (a 7. lépés a 30 nappal későbbi élő letöltéssel, eltérő tartalmú elo2-vel; assert: a .json-ban van `valtozott`)
```

- [ ] **Step 2: Run** `node core/sugo-tar.test.js` → FAIL (nincs modul).
- [ ] **Step 3: Implement** `core/sugo-tar.js` a fenti interfész szerint. A fejléc-komment magyarul: MIÉRT (spec 1b: a bíráló, az átdolgozó és a tényellenőrző későbbi futásban is ugyanazt lássa; a 3. fázis a hash-ből észleli a változást), és hogy a szöveg CSAK a privát tárba kerül.
- [ ] **Step 4: Run** `node core/sugo-tar.test.js` → zöld · `git check-ignore _forrasok/sugo/x.txt` → a `.gitignore` miatt ki van zárva (a parancs kiírja az utat).
- [ ] **Step 5: Commit** — `git add core/sugo-tar.js core/sugo-tar.test.js` · üzenet: `tényközpont 1b: súgószöveg a privát tárban hash-sel (sugo-tar)`.

---

### Task 6: Minden agent a tárból kéri a súgót

**Files:**
- Modify: `agents/ellenorzo/agent.js` (~863. sor), `agents/guide/agent.js` (~977., ~1058., ~1329. sor), `agents/pairing/agent.js` (~155. sor), `core/elakadas-gen.js` (~481. sor, a `ctx.cikkSzoveg`)
- Create: `core/sugo-tar-or.test.js` (őr-teszt)

**Interfaces:**
- Consumes: `sugoSzoveg(url, opts)` (5. feladat) — ugyanazt a `{ szoveg, cim }` alakot adja, mint a `cikkSzoveg`, plusz `honnan`. A hívók csak a `szoveg`-et és a `cim`-et használják, a logika nem változik.

- [ ] **Step 1: Failing őr-teszt** — `core/sugo-tar-or.test.js`: beolvassa a három agent-fájlt és a `core/elakadas-gen.js`-t. Állítás: `agents/**` fájlban nincs `cikkSzoveg(` hívás, és nincs `cikkSzoveg` import. A `core/elakadas-gen.js`-ben a `cikkSzoveg` CSAK a definícióban és a `core/sugo-tar.js` importjában szerepelhet, a `ctx`-ben a `sugoSzoveg` áll. A hibaüzenet magyarul mondja meg, melyik fájl melyik sora sérti.
- [ ] **Step 2: Run** `node core/sugo-tar-or.test.js` → FAIL (5 találat).
- [ ] **Step 3: Implement** — a hívásokat `sugoSzoveg(url)`-re cserélni, az importokat `../../core/sugo-tar.js`-re. A `core/elakadas-gen.js` `ctx`-ében `cikkSzoveg: sugoSzoveg` (a `feldolgoz` belseje változatlan). Körkörös import ellenőrzése: a `sugo-tar.js` importálja az `elakadas-gen.js`-t, ezért az `elakadas-gen.js` a `sugoSzoveg`-et a `main` ágban DINAMIKUS importtal (`await import('./sugo-tar.js')`) veszi. Ha ez bonyolult, a `cikkSzoveg` átköltözik a `core/sugo-tar.js`-be, az `elakadas-gen.js` pedig onnan exportálja tovább (a régi import-út a tesztek miatt megmarad).
- [ ] **Step 4: Ellenőrzés**
  - `node core/sugo-tar-or.test.js` → zöld.
  - `node core/run-tests.js > <scratchpad>/teszt.txt 2>&1` → minden zöld.
  - Build-próba scratchpad-másolatban + `node core/output-guard.js` → OK (élő kimenet nem változhat).
  - Az agentek importja nem dob: `node --input-type=module -e "await import('./agents/pairing/agent.js')"` HELYETT (feltétel nélküli `main()` veszélye, memória-szabály) csak `node --check` a három agent-fájlra.
- [ ] **Step 5: Commit + push** — üzenet: `tényközpont 1b: az ellenőrző, az útmutató-író és a párosító a súgó-tárból olvas` · `git push`. **Élesítés-ellenőrzés a következő CI-futás után:** a `_forrasok` mentés-lépés naplójában `🔒 forrás-tár mentve:` sor, a privát repóban megjelenik a `sugo/` mappa (`gh api repos/Pacso84/ai-world-co-forrasok/contents/sugo` → nem 404), a napi útmutató-szám nem esik 0-ra, és a 📘 súgó-mérés sorok megvannak.

---

## Önellenőrzés (writing-plans)

- **Spec-lefedés:** 1a új előtagok (1. feladat) · 1a CI-próba (3–4.) · 1a fejlesztői szűrés: az index-szintű kizárás itt van (1.), a „hétköznapi cikk” AI-szűrése az 1d részé · 1b tár + hash + tár nélküli élő út + „ha az sem → vár” (5.: `null` → a hívó a meglévő módon nem ír/nem ítél) · 0a „mely súgó-kulcs(ok)” (2.). Az Amazon/Apple index, a nyelvenkénti súgó, 1c–1g: tudatosan későbbi rész (lásd fent).
- **Típus-egyezés:** `sugoSzoveg` visszatérési alakja = `cikkSzoveg` + `honnan` (5–6.) · `FORRASOK` kulcsnevei azonosak az 1., 2., 4. feladatban.
- **Arány:** ~6 feladat; a kód nagy része kis, tiszta függvény, a terv nem írja meg helyettük.
