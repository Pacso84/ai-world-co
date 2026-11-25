# SEO 1. rész — bekötés + kapuk + SEO-agent v2 + őrök — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Az SEO-agent minden angol cikkre ellenőrzött keresőcímet (`<title>`) + meta-leírást gyártson, ami a buildben TÉNYLEG kikerül (kapcsolóval, ma még KI), és két őr garantálja, hogy ez többé ne szakadhasson meg némán.

**Architecture:** A döntési logika a `core/`-ban él (tesztelhető, a build és az agent vékony): `core/seo-kapuk.js` (kapuk + kapcsoló + fejléc-választás), `core/seo-iro.js` (prompt, válasz-értelmezés, sorrend), `core/seo-vedett.js` (Bing → védett oldalak). Az `agents/seo/agent.js` csak összeköt (feltétel nélküli `main()` → NEM importáljuk tesztből).

**Tech Stack:** Node.js ESM, `node --test` (core/run-tests.js), OpenRouter a `core/ai-router.js` `ask()`-on át, Bing Webmaster JSON API.

**Spec:** docs/superpowers/specs/2026-11-25-kereso-cim-design.md (0. szakasz, 1. rész; kapuk: 6.5)

## Global Constraints
- `SEO_ELES_BE = false` ebben a részben (a user a 10 minta után kapcsolja be — 2. rész).
- Cím 25–60 karakter; leírás 120–158 karakter.
- Tilos a címben/leírásban: ár (core/ar-tilalom.js) és „\d+ credits”; `best|vs\.?|versus|better than|compared|alternative|top \d+|#1`; `!`; 3+ betűs CSUPA NAGY szó (kivétel-lista: AI, PDF, USB, FAQ, API, GPT, CEO, HTML, CSS, RTX, NVIDIA, IBM, AWS, SQL, URL, iOS-t nem érinti); „you won't believe”; sablon: `our (step-by-step|easy|simple|complete|beginner)|with our guide|in this guide`.
- Ígéret-fedezet: a cím minden `eszkozNevek()`-beli neve szerepel a cikkben; a cím ≥4 betűs, nem tiltószó tartalmi szavainak ≥80%-a szó szerint (kisbetűsítve, szóhatárral) a cikkben. Előtag-illesztés TILOS.
- Csak angol (`lang === 'en'`) cikkoldal; og:*, twitter:*, JSON-LD, H1, hu/es változatlan.
- `valodiModositas()` nem változik; a „Frissítve” nem mozdul.
- Modell: `config.json` `agents.seo` = primary `anthropic/claude-haiku-5.5`, fallback `minimax/minimax-m3` (mint az `iro`).
- Helyben build SOHA; build-próba scratchpad `buildproba` másolatban + `node core/output-guard.js`. Tesztkimenet FÁJLBA.
- A repó nyilvános: naplóba csak slug, szám, cím mehet.

## Review Focus
1. Idézőjel / `&` / `<` a címben → a buildelt `<title>` és meta escape-elve, az őr ugyanígy hasonlít (Task 3 teszt).
2. Üres / nem-JSON AI-válasz → NEM ír `v:2`-t (a következő futás újrapróbálja); ez más, mint a kapu-bukás (`eles:false`) (Task 4 teszt).
3. A cikk szövege a csere után megváltozik → `keresoFej` a MOSTANI szövegen újraellenőrzi az ígéretet, bukásnál null (Task 1 teszt).
4. hu/es lap soha nem kap angol keresőcímet (Task 2 teszt).
5. Védett oldal (Bing-győztes) a tömeges körben NEM kap AI-hívást, csak `megtartva:true` (Task 4 teszt).

---

### Task 1: `core/seo-kapuk.js` — kapuk, kapcsoló, fejléc-választás

**Files:**
- Create: `core/seo-kapuk.js`, `core/seo-kapuk.test.js`

**Interfaces:**
- Consumes: `vanAr(md)` (core/ar-tilalom.js), `eszkozNevek()` (core/forras-tema.js), `cimTag` (core/title-tag.js).
- Produces:
  - `SEO_ELES_BE: boolean`, `CIM_MIN=25, CIM_MAX=60, LEIRAS_MIN=120, LEIRAS_MAX=158`
  - `seoKapuk({ cim, leiras, cikkMd, regiCim?, regiLeiras? }) → string[]` — kódok: `CIM_HOSSZ, LEIRAS_HOSSZ, AR, OSSZEHASONLITAS, KATTINTASVADASZ, SABLON, IGERET_ESZKOZ, IGERET_SZAVAK, VALTOZATLAN`; mindegyik `"KÓD: magyarázat"` (az agent újrapróbánál visszaadja az AI-nak).
  - `igeretKapuk(cim, cikkMd) → string[]` (csak az IGERET_* kódok; a build is ezt hívja).
  - `keresoFej(meta, { lang, cikkMd, be = SEO_ELES_BE }) → { cim, leiras } | null` — null, ha `!be`, `lang!=='en'`, `meta.seo?.v!==2`, `eles===false`, `megtartva`, hiányzó mező, vagy `igeretKapuk` nem üres.
  - `withBrand(t, siteName = 'AI World HQ', max = 60) → string` — `${t} — ${siteName}`, ha ≤ max, különben `t` (a build is EZT használja — egy igazság).
  - `fejCimEsLeiras({ title, description, kereso }) → { titleTag, metaDesc }` — `kereso` null → `{titleTag: cimTag(title), metaDesc: description}`; különben `{titleTag: cimTag(withBrand(kereso.cim)), metaDesc: kereso.leiras}`.

- [ ] **Step 1: Write the failing tests** (`core/seo-kapuk.test.js`, a VALÓDI Google Meet-cikk JSON-jából olvasva: `git grep -l '"slug": "how-to-find-your-google-meet-recordings-transcripts-and-notes"' content/articles`)
  - `jó cím+leírás → []`: cím „Where to Find Google Meet Recordings, Transcripts and Notes” (59), egy 140 karakteres leírás a cikk tényeiből.
  - egy-egy teszt kódonként: 61 karakteres cím → `CIM_HOSSZ`; 119/159 karakteres leírás → `LEIRAS_HOSSZ`; „$9.99” → `AR`; „10 credits” → `AR`; „Best Way to…” → `OSSZEHASONLITAS`; „!” → `KATTINTASVADASZ`; „FREE” → `KATTINTASVADASZ`, de „AI”/„PDF” nem; „with our guide” → `SABLON`; „Zoom” a címben (a cikk nem említi) → `IGERET_ESZKOZ`; „Export Recordings to Dropbox Automatically” → `IGERET_SZAVAK`; ugyanaz, mint `regiCim` → `VALTOZATLAN`.
  - `igeret: előtag nem számít`: a cikkben „record” van, a címben „recording” → nem találat (ha a cikkben csak „record” van).
  - `keresoFej`: `be:false` → null; `lang:'hu'` → null; `v:1` → null; `eles:false` → null; `megtartva:true` → null; jó v2 + `be:true` → `{cim, leiras}`; jó v2, de `cikkMd`-ből kivágtuk a címben szereplő eszközt → null (Review Focus 3).
  - `fejCimEsLeiras`: kereso null → az eredeti; kereso adott → `titleTag === cimTag(withBrand(cim))`, `metaDesc === leiras`.
  - `SEO_ELES_BE === false` (őr-teszt; a 2. rész állítja át, a tesztet is).
- [ ] **Step 2:** `node --test core/seo-kapuk.test.js > <scratch>/t-kapuk.txt 2>&1` → FAIL (nincs modul).
- [ ] **Step 3:** Implement. Szóhatár: `new RegExp('(^|[^a-z0-9])' + escape(szo) + '($|[^a-z0-9])')` a kisbetűs, markdown-jel nélküli cikkszövegen; tiltószavak: how, what, your, with, from, that, this, into, when, where, guide, using, step, steps, simple, easy, free, new, more, best (ez úgyis bukik), make, made, help, tips, ways, does, have, will, they, them, their, about, without. Eszköznév: az `eszkozNevek()` listából, ami a címben szóhatárral előfordul.
- [ ] **Step 4:** a teszt PASS.
- [ ] **Step 5:** Commit: `SEO 1/1: core/seo-kapuk.js — keresőcím-kapuk, kapcsoló (KI), fejléc-választás`

### Task 2: Build-bekötés (KI kapcsolóval semmi nem változik)

**Files:**
- Modify: `website/build.js` (betöltő ~1184: `seoDescription`; `localizeArticle` ~907; `pageShell` ~1492/1552–1553; `buildArticlePage` ~2249; útmutató-oldal ~2732)
- Test: `core/seo-kapuk.test.js` (bővítés) + build-próba

**Interfaces:**
- Consumes: `keresoFej`, `fejCimEsLeiras` (Task 1).
- Produces: cikk-objektum `a.kereso: {cim, leiras} | null`; `pageShell({ ..., kereso })`.

- [ ] **Step 1: Write the failing test** — `build.js bekötés (forrás-szintű őr)`: a `website/build.js` szövegében (a) NINCS `_meta?.seo?.description` (a halott olvasás kikerül: `seoDescription: meta.subtitle || ''`); (b) a `pageShell` `fejCimEsLeiras(`-t hív; (c) a `localizeArticle` visszatérése `kereso: null`-t tartalmaz; (d) az og:title/twitter:title sor továbbra is `${escapeHtml(title)}` (nem a keresőcím).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement: betöltőben `kereso: keresoFej(data._meta, { lang: 'en', cikkMd: body })`; `localizeArticle` → `kereso: null`; mindkét oldalépítő `pageShell({..., kereso: a.kereso})`; `pageShell`-ben `const { titleTag, metaDesc } = fejCimEsLeiras({ title, description, kereso })`; a build saját `withBrand`-je a core-ból importáltra cserélve (`withBrand(t, SITE.name, SERP_TITLE_MAX)`) → `<title>${escapeHtml(titleTag)}</title>`, `<meta name="description" content="${escapeHtml(metaDesc)}">`; og/twitter/JSON-LD érintetlen.
- [ ] **Step 4:** teszt PASS + build-próba (scratchpad `buildproba`): `node website/build.js` exit 0, `node core/output-guard.js` zöld; egy cikk `<title>`/leírás AZONOS a mostani élővel (KI kapcsoló → nincs változás), KIVÉVE hogy a leírás eddig is az alcím volt (`seo.description` sosem létezett) → bájtra azonos.
- [ ] **Step 5:** Commit: `SEO 1/2: build — keresőcím/-leírás bekötve (kapcsoló KI), halott seo.description olvasás ki`

### Task 3: Őrök — „minden olvasott mezőnek van írója” + kimenet-őr SEO_FEJ_ELTER

**Files:**
- Create: `core/meta-mezo-iro.test.js`
- Modify: `core/output-guard.js` (+ `seoFejEllenorzes`), `core/output-guard.test.js` (ha van; különben a meglévő teszt mellé), `core/auto-check-codes.js` NEM (ez nem Ellenőrző-kód)

**Interfaces:**
- Consumes: `keresoFej` (Task 1), `escapeHtml`-egyenértékű escape (a buildével azonos: `& < > " '`).
- Produces: `seoFejEllenorzes(lapok: {f,h}[], elvart: Map<slug,{titleTag,metaDesc}>) → lelet|null`, kód `SEO_FEJ_ELTER`, üzenet magyarul: „🔎 N cikkoldalon nem az SEO-agent címe/leírása van kint — a keresőoptimalizálás nem jut ki! pl. …”.

- [ ] **Step 1: Write the failing tests**
  - `meta-mezo-iro.test.js`: kigyűjti a `website/build.js` + `core/*.js` (nem teszt) `_meta?.a(?.b)` olvasásait; mindegyiknek léteznie kell legalább 1 valódi `content/articles` JSON-ban, VAGY a kivétel-listában (indokkal): `csalas` (csalás-cikk, még nincs), `fact_check_flag` (csak gyanúnál), `handback_from` (csak visszaadásnál), `source_snippet`, `source_text` (régi vázlat-mezők), `slug.slice`, `tags`, `updated`, `dim`, `provider` (mind: nem cikk-`_meta`, vagy feltételes — a tesztíró ellenőrzi és indokolja). `seo.description` NEM lehet a listán. Ellenpróba-teszt: egy kitalált `_meta?.seo?.descriptoin` olvasást tartalmazó szövegre a gyűjtő-függvény jelez.
  - `seoFejEllenorzes`: egyező lap → null; eltérő `<title>` → `SEO_FEJ_ELTER`; `&`-t tartalmazó cím escape-elve egyezik → null (Review Focus 1); üres `elvart` → null.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement; a CLI-ágban az `elvart` a `content/articles` élő v2-es angol cikkeiből (`keresoFej(meta, {lang:'en', cikkMd})` → `fejCimEsLeiras`).
- [ ] **Step 4:** PASS; `node core/run-tests.js > <scratch>/osszes.txt` → mind zöld.
- [ ] **Step 5:** Commit: `SEO 1/3: őrök — olvasott _meta mezőnek író kell + kimenet-őr SEO_FEJ_ELTER`

### Task 4: SEO-agent v2 (`core/seo-iro.js` + `agents/seo/agent.js` + config)

**Files:**
- Create: `core/seo-iro.js`, `core/seo-iro.test.js`
- Modify: `agents/seo/agent.js` (teljes átírás), `config.json` (`agents.seo`)

**Interfaces:**
- Consumes: `seoKapuk` (Task 1), `memory/seo-vedett.json` (Task 5 formátuma: `{ at, atlagArany, vedett: string[] }`), `memory/traffic-log.json` (`days[nap][] {path, visits}`).
- Produces:
  - `seoBemenet(markdown) → { cim, alcim, roviden, h2k: string[], torzs: string }` (torzs ≤ 2500 kar., markdown-jel nélkül)
  - `seoPrompt(bemenet, { hibak?: string[], regi?: {cim, leiras} }) → string`
  - `seoValasz(text) → { seo_title, meta_description, keywords } | null` (kódblokk-burkolás tűrése; hiányzó mező → null)
  - `atirasSorrend(cikkek: {slug, v}[], forgalom, vedett: Set) → { sor: slug[], megtartva: slug[] }` — v<2, a 30 napos látogatás szerint csökkenő; védett → `megtartva`.
  - `vedettFriss(vedettJson, most) → boolean` (≤ 14 nap)
  - agent CLI: alap (csak `seo.v !== 2` és ma publikált — az új cikkek), `--atiras N`, `--dry --minta N [--slug s]` (kiír régi vs új, NEM ír fájlt).
  - Írt mező: `_meta.seo = { keywords, seo_title, meta_description, v: 2, eles: true|false, kapu_hibak?: string[], optimised_at }` (a `suggestions` és `seo_score` kikerül; a régi `keywords` marad, ha az új válasz nem ad).

- [ ] **Step 1: Write the failing tests** (`core/seo-iro.test.js`, valódi cikk-markdownnal)
  - `seoBemenet` a Meet-cikkből: `cim` egyezik a frontmatterrel, `roviden` az „In short” szövege, `h2k.length > 0`, `torzs.length <= 2500`.
  - `seoPrompt` tartalmazza: a 25–60 / 120–158 határokat, „no prices”, „no comparisons”, „only facts stated in the article”, és újrapróbánál a `hibak` sorait.
  - `seoValasz`: ```` ```json {…}``` ```` → objektum; `"{}"` → null; `""` → null (Review Focus 2).
  - `atirasSorrend`: 3 cikk (forgalom 50/5/0), a középső védett → `sor = [50-es, 0-s]`, `megtartva = [5-ös]`; v=2 cikk kimarad (Review Focus 5).
  - `vedettFriss`: 13 napos → true, 15 napos → false, hiányzó → false.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement `core/seo-iro.js`; írd át `agents/seo/agent.js`-t: cikkenként `ask(seoPrompt(...), { agentName: 'seo', maxTokens: 400, jsonMode: true })` → `seoValasz` → `seoKapuk` → bukásnál 1 újrapróba `hibak`-kal → (a) érvényes: `v:2, eles:true`; (b) kétszer kapu-bukás: `v:2, eles:false, kapu_hibak`; (c) AI-hiba/üres kétszer: NEM ír. `--atiras` védett-lista nélkül vagy elavulttal: kiírja „⏭️ nincs friss védett-lista — a tömeges kör nem indul” és kilép 0-val. Összefoglaló sor: `📊 SEO: N kész · K kapun elbukott (régi marad) · M védett · költség $x`. `config.json` `agents.seo` → Haiku 5.5 / M3 (a meglévő `iro` bejegyzés mintájára, `_model_comment`-tel: 11-25 user „azért volt a seo agent!”).
- [ ] **Step 4:** PASS; teljes tesztsor zöld.
- [ ] **Step 5:** Commit: `SEO 1/4: SEO-agent v2 — teljes cikkből keresőcím + leírás, kapukkal; tippek ki`

### Task 5: `core/seo-vedett.js` — Bing-győztesek védelme

**Files:**
- Create: `core/seo-vedett.js`, `core/seo-vedett.test.js`; output: `memory/seo-vedett.json`

**Interfaces:**
- Produces: `vedettLista(rows, { most, hetek = 4, minMegj = 100 }) → { atlagArany, vedett: string[] }` — rows a GetPageStats `d` tömbje (`{Query: url, Date: "/Date(ms)/", Impressions, Clicks}`); csak `https://aiworldhq.com/article/<slug>` (nem /hu/, /es/); az utolsó `hetek` heti sor; átlag = az angol cikkoldalak összes kattintás / összes megjelenés; védett: megj ≥ minMegj ÉS arány ≥ átlag. CLI: `node core/seo-vedett.js` (env `BING_WM_API_KEY`) → `memory/seo-vedett.json` `{ at, atlagArany, vedett }`; kulcs nélkül: „⚠️ BING_WM_API_KEY hiányzik” és nem ír.

- [ ] **Step 1: Write the failing test** — rögzített mintasorok (a 11-25-i valódi számokkal: Stable Diffusion 1565/150, Meet 1659/37, Gemini 1696/94, egy /es/ sor, egy 5 hetes régi sor) → `vedett` = [stable-diffusion…, gemini…] (a Gemini 5,5% > átlag), a Meet NEM, az /es/ és a régi sor nem számít.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS + helyben `node core/seo-vedett.js` (valódi kulccsal) → a fájl megvan, a lista kiírva.
- [ ] **Step 5:** Commit (a `memory/seo-vedett.json`-nal együtt): `SEO 1/5: Bing-győztes oldalak védelme (memory/seo-vedett.json)`

### Task 6: 10 minta a user elé + feltöltés

- [ ] **Step 1:** `node agents/seo/agent.js --dry --minta 10` (a 10 legolvasottabb nem védett cikk; ~$0,02) → kimenet fájlba.
- [ ] **Step 2:** teljes tesztsor zöld (fájlba), build-próba + kimenet-őr zöld.
- [ ] **Step 3:** `git pull --rebase` → push (kapcsoló KI → élesben semmi nem változik; az új cikkek már v2-es mezőket kapnak).
- [ ] **Step 4:** A 10 mintát táblázatban (régi `<title>` / új cím, régi leírás / új leírás, hossz) a user elé, magyar magyarázattal; jóváhagyás → 2. rész (kapcsoló BE + tömeges kör).
- [ ] **Step 5:** napló + teendőlista frissítése.
