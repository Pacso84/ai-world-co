# Csalás-archív Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A 2026-os FBI/Google csalás-figyelmeztetésekből Claude által írt 6–8 cikk a /scams listán és a saját /scams/<slug> oldalán, a Hírek/social/Reel/hírlevél útjain KÍVÜL.

**Architecture:** Külön mappa (`content/csalas-archiv/`), önálló fájlok beépített hu/es fordítással. Egy közös betöltő+ellenőrző modul (`core/csalas-archiv.js`); a build, a csalás-képek és az IndexNow ezt hívja. Minden más program a content/articles-t olvassa, így az archívot nem látja.

**Tech Stack:** Node ESM, a projekt saját tesztfuttatója (`node core/run-tests.js`, `*.test.js` = sima assert-szkript).

**Spec:** docs/superpowers/specs/2026-11-28-csalas-archiv-design.md

## Global Constraints
- Csak 2026-os forrás (`forras_datum` 2026-01-01…ma); forrás csak `https://www.ic3.gov/PSA/2026/…` vagy `https://blog.google/…`.
- Árat/kárösszeget NEM írunk (core/ar-tilalom.js `vanAr` = false minden nyelven).
- Példa-domain csak RFC 2606 (`*.example.com`); valódi cégnév/logó a példaüzenetben tilos.
- Amerikai angol (core/us-spelling.js `findBritish` üres); hu/es-ben NINCS angol mondat; laponként EGY H1.
- Lájkot/megosztást nem kérünk; EU AI Act címke marad (a lap sablonja adja).
- build.js-t CSAK scratchpad-másolatban futtatni (útvonalban „buildpro”); tesztkimenet fájlba.

## Review Focus
- Fordítás hiányzik egy nyelven → a lap angolul jelenik meg, a validátor BUKJON (test: `ellenoriz` hiányzó `forditas.es`-re hibát ad).
- Ugyanaz a slug a content/articles-ben is létezik (később élő hír lesz belőle) → kettős /scams/<slug> (test: build-oldali ütközésnél az ÉLŐ nyer, az archív kimarad + figyelmeztetés).
- Hibás JSON az archív mappában → a build NEM bukik el, kihagyja (test: `csalasArchivBetolt` rossz fájlt átugrik).
- A /scams sorrend: az archív a friss hírek MÖGÖTT (régi forrásdátum szerint rendezve) (test a csalas-oldal tesztben).
- A példablokk mindhárom nyelven elemezhető (különben nincs kép) (test: `ellenoriz` → peldaBlokk null = hiba).

---

### Task 1: `core/csalas-archiv.js` — betöltő + validátor

**Files:**
- Create: `core/csalas-archiv.js`, `core/csalas-archiv.test.js`, `content/csalas-archiv/.gitkeep`

**Interfaces:**
- Produces:
  - `ARCHIV_MAPPA = 'content/csalas-archiv'`
  - `csalasArchivBetolt(ROOT) → Array<{ file: string, data: object }>` (csak `ARTICLE_SCAM_*.json`, hibás JSON kihagyva)
  - `csalasArchivMd(data, lang) → string|null` (en: `data.article_markdown`, más: `data.forditas?.[lang]`)
  - `csalasArchivEllenoriz(data, { ma = new Date() } = {}) → string[]` (hibalista, üres = jó)
  - `csalasArchivAdat(meta) → { forrasNev: string, forrasDatum: 'YYYY-MM-DD' } | null` (a `meta.csalas_archiv` normalizálva)

- [ ] Step 1: teszt — `csalasArchivEllenoriz` hibát ad: hiányzó `forditas.es`; `forras_datum` 2025-ös; nem ic3.gov/blog.google forrás; nincs `_meta.csalas`; hu-ban `peldaBlokk` null; `vanAr` igaz; slug nem `^[a-z0-9][a-z0-9-]*$`. Jó fixture-re (core/fixtures/csalas-ic3-valasztas.json-ból összerakva) üres lista.
- [ ] Step 2: teszt — `csalasArchivBetolt` temp mappában: 1 jó + 1 hibás JSON + 1 nem ARTICLE_SCAM fájl → 1 elem.
- [ ] Step 3: teszt — MINDEN valódi fájl a `content/csalas-archiv/`-ban átmegy a validátoron (üres mappánál 0 fájl, a teszt zöld).
- [ ] Step 4: futtatás → bukik. Step 5: megvalósítás (ellenőrzések: core/ar-tilalom.js `vanAr`, core/us-spelling.js `findBritish` az en-re, core/csalas-sablon.js `peldaBlokk` mindhárom nyelvre, legalább 3 H2 mindhárom nyelven). Step 6: zöld. Step 7: commit.

### Task 2: build — /scams lista + /scams/<slug>, a Hírekből kívül

**Files:**
- Modify: `website/build.js` (`loadArticles` ~1140, `localizeArticle` ~924, main ~3823/3847/3910/3971/4003, `buildScamsPage` ~3430, `buildArticlePage` ~2225)
- Modify: `core/csalas-oldal.js` (+UI kulcs `scWarnFrom`: en `'{f} warning'`, hu `'{f}-figyelmeztetés'`, es `'Aviso de {f}'`; a listaelem `forras` mezője a dátum elé kerül)
- Test: `core/csalas-oldal.test.js`, `core/csalas-archiv.test.js` (forrás-minta őr)

**Interfaces:**
- Consumes: Task 1 `csalasArchivBetolt`, `csalasArchivMd`.
- Produces: cikk-objektum új mezői: `csalasArchiv: { forrasNev, forrasDatum } | null`, `forditas: object|null`.

- [ ] Step 1: teszt (csalas-oldal) — `csalasOldalHtml` egy `{ forras: 'FBI warning', datum: '2026-09-17' }` elemre kiírja „FBI warning · <dátum>”; hu UI-ban „FBI-figyelmeztetés”; régi dátumú elem a friss mögé kerül.
- [ ] Step 2: forrás-minta őr (csalas-archiv.test) — build.js-ben: `loadArticles(` az archív mappára is hívva; az archív lista CSAK `buildScamsPage(` és a `csalasCikkek` sorában szerepel; `buildIndex(news)` sorában nem.
- [ ] Step 3: bukik. Step 4: megvalósítás — `loadArticles(dir = ARTICLES_DIR, { archiv = false })`; archívnál `forditas` + `csalasArchiv` mező; `localizeArticle`: `a.forditas?.[lang] ?? loadTranslation(a.file)[lang]`; mainben `archivCsalas` külön (slug-ütközésnél az élő nyer, `console.warn`); nyelvenként `locArchiv`; `buildScamsPage([...loc, ...locArchiv])`; `csalasCikkek` + sitemap kiegészül; teljes lapon a cím alatt `🗓️ {scWarnFrom} · {dátum}` sor. /article/<slug> archívra NEM készül.
- [ ] Step 5: zöld + teljes tesztsor fájlba. Step 6: commit.

### Task 3: csalás-képek + IndexNow az archív mappára

**Files:**
- Modify: `core/csalas-kepek.js` (a `fajlok` ciklus mellé az archív fájlok, `md = csalasArchivMd(d, lang)`), `core/indexnow.js` (archív slugokra csak `/scams/<slug>`, friss-szűrő ugyanaz)
- Test: `core/csalas-kep.test.js`, `core/indexnow.test.js` (ha van; különben csalas-archiv.test forrás-minta)

- [ ] Step 1: teszt — temp ROOT-ban 1 archív fájl → 4:5/16:9/kártya képek elkészülnek mindhárom nyelvre (kártya csak en); IndexNow listában `/scams/<slug>` van, `/article/<slug>` nincs.
- [ ] Step 2: bukik. Step 3: megvalósítás. Step 4: zöld. Step 5: commit.

### Task 4: MINTACIKK + előnézet

- [ ] Step 1: PSA260917 („Scammers Impersonating Law Enforcement and Government Officials”) letöltése, elolvasása.
- [ ] Step 2: `content/csalas-archiv/ARTICLE_SCAM_<slug>.json` (en + hu + es, a fixture szerkezetével; `_meta`: slug, csalas{csatorna, ok, forras_id:'ic3-psa'}, csalas_archiv{forras_datum, forras_nev:'FBI'}, source_link, source_name, published_at=most).
- [ ] Step 3: Task 1 validátor zöld; build-próba scratchpadben (+ képek a csalas-kepek futtatásával a próbában) + `node core/output-guard.js`.
- [ ] Step 4: Chrome-előnézet: /scams és /scams/<slug> en/hu/es, asztali + 390 px → user-jóváhagyás.

### Task 5: a többi cikk + élesítés
- [ ] Minden 2026-os PSA elolvasva; kiválasztás a spec szerint; cikkenként Task 4 Step 2–3. Teljes tesztsor, push. Másnap: élő /scams ellenőrzés, a Hírek között NINCS archív, social-sorban NINCS archív.
- [ ] Memória: progress.md + teendok-lista + MEMORY.md sor.
