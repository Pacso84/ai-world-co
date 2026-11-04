# „🔧 Ha elakadsz” 2b — bekötés, fordítás, megjelenítés — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a 2a-ban kész, ellenőrzött „Ha elakadsz” doboz napi gépi gyártása a CI-ban (költségkerettel), fordítása hu/es-re, és megjelenítése az útmutatók lépései után — élesítés csak a user előnézet-jóváhagyása után.

**Architecture:** új CI-lépés (`core/elakadas-gen.js`) útmutatónként egy `content/elakadas/<slug>.json`-t ír (2a: `core/sugo-index.js` + `core/elakadas.js` ellenőrzése, hívás a `core/ai-router.js` `ask()`-on át). A build (`website/build.js` `buildGuidePage`) ebből rajzolja ki a dobozt egy tiszta HTML-függvénnyel (`core/elakadas-html.js`). A doboz első megjelenése `_meta.elakadas_at` → `valodiModositas()` („Frissítve”).

**Tech Stack:** Node ESM, saját tesztfuttató (`node core/run-tests.js`, kimenet FÁJLBA), GitHub Actions (`auto.yml`), OpenRouter az `ai-router.js`-en át.

**Spec:** `docs/superpowers/specs/2026-10-23-utmutato-segitseg-csomag-design.md` — D és F rész (az F-sor `g-tovabb` már él, 10-23).

## Global Constraints

- Kitalált hibaelhárítás TILOS: csak a 2a-ellenőrzésen (`dobozKeszit` → `igazoltResz`, `tunetIllik`, `ismetliHibat`, `cikkreUtal`) átment tétel kerülhet ki. Az ellenőrző kódhoz ez a terv NEM nyúl.
- Saját napi plafon **$0,10**; ha a nap addigi költése már elérte a **$0,60**-at, aznap kimarad (a $1/nap, $25/hó keret így sosem sérül).
- „Nem angol oldalon nincs angol mondat”: ha a hu/es fordítás hiányzik vagy hibás, azon a nyelven NINCS doboz.
- Kill-switch: `ELAKADAS_BE` (`core/elakadas.js`) — kikapcsolva se generálás, se megjelenítés (teszt őrzi).
- A régi útmutatók törzsszövegét gép nem írja át; a doboz külön fájlban él. A cikk-JSON-ba csak a `_meta.elakadas_at` kerül.
- A 💬 prompt mező NEM jelenik meg a dobozban *(Claude döntése: a prompt nincs forrás-ellenőrizve, a doboz csak igazolt tényt mutat)*.
- Build és deploy csak a CI-ban; helyben `website/build.js`, `core/daily-report.js`, `agents/*` FUTTATÁSA TILOS. Tesztkimenet fájlba, soha csővezetékbe.
- CRLF/LF fájlonként megtartva; a repó publikus — kulcs sehol.
- Élesítés (Task 5, az `auto.yml`-lépés) CSAK a user előnézet-jóváhagyása után.

## Review Focus

1. A fordítás kevesebb/több tételt ad, üres mezőt vagy angolul hagyott szöveget → azon a nyelven nincs doboz, angol szöveg nem kerül hu/es oldalra (Task 1 teszt: `forditasErtelmez`).
2. Sérült vagy hiányzó `content/elakadas/<slug>.json` → a build nem áll meg, a régi nézet marad (Task 3 teszt: `elakadasBetolt`).
3. Menet közben elfogy a keret ($0,10 vagy a napi $0,60) → a futás leáll, az addig kész fájlok épek (atomi írás), az állapot mentve (Task 1 teszt: `keretOk` + `feldolgoz` keret-ág).
4. HTML/idézőjel a súgócímben vagy a modell szövegében → escape-elve jelenik meg (Task 3 teszt).
5. A tárolt fájlban nem engedélyezett forrás-URL (régi/kézzel szerkesztett fájl) → az a tétel nem jelenik meg; 2 alatt nincs doboz (Task 3 teszt).

---

### Task 1: A generátor — `core/elakadas-gen.js` (tiszta logika + CI-futtató)

**Files:**
- Create: `core/elakadas-gen.js`, `core/elakadas-gen.test.js`
- Modify: `core/elakadas-meres.mjs` (a `utmutato()` és `cikkSzoveg()` innen importálva, duplikáció nélkül), `config.json` (új agent)

**Interfaces:**
- Consumes: `szolgaltatok`, `indexLetolt` (`core/sugo-index.js`); `ELAKADAS_BE`, `jeloltCikkek`, `promptEpit`, `valaszErtelmez`, `dobozKeszit` (`core/elakadas.js`); `ask(prompt, {agentName, systemPrompt, maxTokens})` → `{text, costUsd} | null` (`core/ai-router.js`); `spentToday()` (`core/budget.js`); `loadLog()` (`core/traffic-log.js`), `latogatasok(days, ig, ablakNap)` (`core/guide-prune.js`); `utmutatoE` (`core/guide-kind.js`); `bodyLooksUntranslated` (`core/translation-guard.js`); `forrasSzoveg` (`core/friss-tenyellenorzes.js`).
- Produces (Task 3, 4 és a mérés használja):
  - `export const NAPI_PLAFON = 0.10, NAPI_HATAR = 0.60, FUTASONKENT_MAX = 10, UJRAPROBA_NAP = 30, UJ_NAP = 3, NYELVEK = ['hu', 'es']`
  - `export function utmutatoAdat(cikkJson) → {slug, tool, company, cim, eszkoz, lepesek: string[], hibak: string}` (a mérés `utmutato()`-jának logikája, fájlolvasás nélkül)
  - `export async function cikkSzoveg(url, fetchFn = fetch) → {szoveg, cim} | null`
  - `export function sorrend({utmutatok, kesz, latogatas, now, n}) → {slug, feladat: 'general'|'fordit'}[]`
  - `export function forditasPrompt(items, lang) → {rendszer, felhasznalo}`
  - `export function forditasErtelmez(szoveg, items) → items | null`
  - `export function dobozHash(items) → string` (sha1 hex az en tételek `symptom|why|fix|source` sorain)
  - `export function keretOk({napiOsszes, elakadasMa}) → boolean`
  - A tárolt fájl alakja (`content/elakadas/<slug>.json`):
    `{ slug, probalva: ISO, doboz: null | { keszult: ISO, enHash, forrasok: {[url]: cim}, en: Item[], hu: Item[]|null, es: Item[]|null } }`, ahol `Item = {symptom, why, fix, source}`.
  - Állapot: `memory/elakadas-state.json` → `{ nap: 'YYYY-MM-DD', koltseg: number, uj: number, forditva: number, kimaradt: string }` (a napi riport olvassa).

- [ ] **Step 1: Tesztek (`core/elakadas-gen.test.js`, a repó szokásos `t(nev, fn)` mintájával)**
  - `sorrend`: (a) az UJ_NAP-nál frissebb, fájl nélküli útmutató elöl; (b) utána a fájl nélküliek látogatás szerint csökkenőben; (c) `doboz` meglévő fájl kimarad; (d) `doboz: null` és `probalva` < 30 nap → kimarad, ≥ 30 nap → újra `general`; (e) `doboz` megvan, de `hu` vagy `es` null → `fordit` (a generálandók UTÁN, mert olcsóbb); (f) legfeljebb `n` elem.
  - `forditasErtelmez`: helyes JSON azonos darabszámmal → tételek (a `source` az eredetiből jön, nem a modellből); eltérő darabszám → null; üres mező → null; URL/`<` a szövegben → null; angolul maradt szöveg (`bodyLooksUntranslated` igaz az összefűzött why+fix-re) → null; ```json burok → elfogadva.
  - `dobozHash`: ugyanarra azonos, egy betű változásra más.
  - `keretOk`: `napiOsszes >= 0.60` → false; `elakadasMa >= 0.10` → false; `0.59 / 0.09` → true.
  - Bekötés-teszt (forrásszöveg): a `main` a `ELAKADAS_BE`-t nézi, és `false`-nál nem hív `ask`-ot; a fájlírás atomi (ideiglenes fájl + `renameSync`).
- [ ] **Step 2: Futtasd — elbukik** (`node core/elakadas-gen.test.js > <scratch>/eg.txt 2>&1`; „Cannot find module” / hiányzó export).
- [ ] **Step 3: Megvalósítás**
  - `forditasPrompt`: rendszerprompt angolul, a célnyelv (`hu`: magyar, `es`: spanyol) megnevezésével; kimenet SZIGORÚ JSON `{"items":[{"symptom","why","fix"}]}` ugyanannyi elemmel és sorrendben; termék- és menünevek eredetiben maradhatnak; semmit nem tehet hozzá.
  - `feldolgoz(slug, ...)` (belső): `general` → jelöltek → cikkek letöltése (`cikkSzoveg`, >400 karakter) → `ask({agentName: 'elakadas'})` → `valaszErtelmez` → `dobozKeszit(..., ELAKADAS_BE, utm)` → ha van doboz: fordítás mindkét nyelvre (`ask({agentName: 'translator'})`) → fájlírás; ha nincs: `{doboz: null, probalva}`. `fordit` → csak a hiányzó nyelv(ek). Minden hívás előtt `keretOk`, minden hívás `costUsd`-je az állapotba.
  - Új doboz első megjelenésekor a cikk-JSON `_meta.elakadas_at = now` (a cikk fájl eredeti sorvégével és `JSON.stringify(j, null, 2)` alakkal, ahogy a `reel-post.js` is írja).
  - `main()`: `--limit N` (alap `FUTASONKENT_MAX`), csak közvetlen futtatáskor (`process.argv[1]` vizsgálat — agent-modult importálni tilos, ez a minta). Napló: `🔧 Ha elakadsz: N új doboz, M fordítás, $X (kimaradt: …)`.
  - `config.json` `agents.elakadas`: a `guide` agent modelljeivel (`openrouter` `anthropic/claude-haiku-5.5`, fallback `minimax/minimax-m3`), `routing: 'paid-only'`.
  - `core/elakadas-meres.mjs`: a saját `utmutato()`/`cikkSzoveg()` helyett ezeket importálja (viselkedés változatlan).
- [ ] **Step 4: Futtasd — zöld** (`node core/elakadas-gen.test.js` és `node core/run-tests.js`, kimenet fájlba; „MIND A … TESZT RENDBEN”).
- [ ] **Step 5: Commit** — `feat(elakadas): napi generátor költségkerettel + fordítás (még nincs a CI-ban)`.

### Task 2: „Frissítve” — `valodiModositas` ismeri a dobozt

**Files:**
- Modify: `core/sitemap-lastmod.js:50-54`; Test: a meglévő `core/sitemap-lastmod*.test.js` (ha nincs, `core/sitemap-lastmod.test.js`)

**Interfaces:** Produces: `valodiModositas(meta)` a `meta.elakadas_at`-t is figyelembe veszi.

- [ ] **Step 1: Teszt** — `valodiModositas({published_at: '2026-10-01T…', elakadas_at: '2026-10-27T…'})` → az `elakadas_at`; `elakadas_at` hiányában a régi eredmény változatlan.
- [ ] **Step 2: Elbukik** → **Step 3:** a tömbbe `m.elakadas_at` → **Step 4: zöld** (`node core/run-tests.js`) → **Step 5: Commit** — `feat(frissitve): a Ha elakadsz doboz megjelenése valódi módosítás`.

### Task 3: Megjelenítés — `core/elakadas-html.js` + build + CSS

**Files:**
- Create: `core/elakadas-html.js`, `core/elakadas-html.test.js`
- Modify: `website/build.js` (betöltés a cikk-objektumba ~1170–1195 körül; beszúrás a `buildGuidePage`-ben a `<div class="g-steps">` és a `<nav class="g-tovabb">` közé, ~2600. sor; 3 nyelvű feliratok a `tr`-táblákban), `website/assets/style.css`

**Interfaces:**
- Consumes: a Task 1 fájlalakja; `engedelyezett(url)` (`core/sugo-index.js`); `ELAKADAS_BE`.
- Produces:
  - `export function elakadasBetolt(ROOT, slug) → fájlobjektum | null` (hiányzó/sérült fájl → null, soha nem dob)
  - `export function elakadasHtml(fajl, lang, felirat) → string` — `felirat = {cim, miert, mitTegyel, forras}`; üres string, ha: kill-switch ki, nincs doboz, a nyelv tételei hiányoznak, vagy az engedélyezett forrású tételek száma < 2.
  - Feliratok (`tr`): en `🔧 If you get stuck` / `Why:` / `What to do:` / `Source:`; hu `🔧 Ha elakadsz` / `Miért:` / `Mit tegyél:` / `Forrás:`; es `🔧 Si te atascas` / `Por qué:` / `Qué hacer:` / `Fuente:`.
  - Jelölés (minden osztály `g-` előtagú → a kimenet-őr műfaji elemnek veszi): `<section class="g-elakad"><h2 class="g-elakad__cim">…</h2>` tételenként `<div class="g-elakad__t"><h3>tünet</h3><p><b>Miért:</b> …</p><p><b>Mit tegyél:</b> …</p><p class="g-elakad__forras">Forrás: <a href="URL" rel="noopener" target="_blank">súgócím</a></p></div></section>`. A forrás-link a súgócikk címét mutatja (`forrasok[url]`), annak híján a domaint.

- [ ] **Step 1: Tesztek** — (a) 2 engedélyezett tétel → `class="g-elakad"`, mindkét h3 tünet, a nyelvi feliratok; (b) `lang: 'hu'` és `hu: null` → `''`; (c) `<script>`/`"` a tünetben és a súgócímben → escape-elve, nyers `<script` nincs; (d) egyik tétel forrása `https://example.com/x` → kimarad, 1 marad → `''`; (e) `ELAKADAS_BE=false` (paraméterrel) → `''`; (f) `elakadasBetolt`: hiányzó fájl és sérült JSON → null; (g) bekötés (a `website/build.js` forrása): az `elakadasHtml(` hívás a `g-steps` és a `g-tovabb` között áll, és csak a `buildGuidePage`-ben.
- [ ] **Step 2: Elbukik** → **Step 3: Megvalósítás** (a `buildGuidePage` a cikk `a.elakadas` mezőjét kapja a betöltéskor; CSS: a meglévő `--card`, `--line`, `--accent` változókkal, világos/sötét módban, 390 px-en egy oszlop; a doboz nem hirdetés-hely, az oldalankénti egy hirdetés nem változik) → **Step 4: zöld** (`node core/run-tests.js`, köztük `template-parity.test.js`) → **Step 5: Commit** — `feat(elakadas): a doboz megjelenítése az útmutató lépései után (fájl nélkül nincs doboz)`.

### Task 4: Napi riport-sor + előnézet a usernek

**Files:**
- Modify: `core/report-lines.js` (új `elakadasLine(allapot, maNap) → string | null`), `core/daily-report.js` (a sor bekötése), a `core/report-lines*.test.js`
- Előnézet (nem a repóba): scratchpad

- [ ] **Step 1: Teszt** — mai állapot `{nap: ma, uj: 2, forditva: 4, koltseg: 0.012}` → `🔧 Ha elakadsz: 2 új doboz, 4 fordítás ($0.012)`; `kimaradt` nem üres → a sor végén `· kimaradt: <ok>`; tegnapi/hiányzó állapot → null.
- [ ] **Step 2–4:** elbukik → megvalósítás → zöld.
- [ ] **Step 5: Előnézet** — helyben, a Task 1 generátorral (`node core/elakadas-gen.js --limit 3`, a valódi kulccsal, ~$0,01) 3 útmutatóra fájl; a `website/build.js` HELYETT egy scratchpad-szkript az ÉLŐ útmutató-HTML-t letölti, a `elakadasHtml()` kimenetét a `g-tovabb` elé szúrja, a `style.css` új részét hozzáadja; helyi szerver → Chrome: asztali + 390 px mobil-iframe, en + hu + es. A helyben létrejött `content/elakadas/*.json` és `_meta.elakadas_at` változásokat a commit ELŐTT vissza kell állítani (`git checkout -- content/`), mert a CI-nek kell gyártania.
- [ ] **Step 6: A user elé** — képernyőképek + költség + darabszám → **jóváhagyásra várni.**
- [ ] **Step 7: Commit** (csak a riport-sor) — `feat(riport): Ha elakadsz napi sor`.

### Task 5: Élesítés a CI-ban (CSAK a user jóváhagyása után)

**Files:**
- Modify: `.github/workflows/auto.yml` — új lépés a „Fordítás” UTÁN és a „Weboldal build” ELŐTT: `node core/elakadas-gen.js --limit 10 || true`, `if: always()`, `env: OPENROUTER_API_KEY`.
- Test: egy bekötés-teszt (pl. `core/elakadas-gen.test.js`): az `auto.yml`-ben a lépés a fordítás után és a build előtt áll, `|| true`-val.

- [ ] **Step 1: Teszt → elbukik → lépés hozzáadása → zöld** (`node core/run-tests.js`).
- [ ] **Step 2: Commit + push** — `feat(ci): Ha elakadsz napi gyártás (max 10/futás, $0,10/nap)`.
- [ ] **Step 3: Élő ellenőrzés a következő futás után** — a CI-naplóban a `🔧 Ha elakadsz:` sor; egy elkészült útmutató élő HTML-jében en/hu/es alatt a `g-elakad` doboz, és hu/es oldalon egyetlen angol mondat sincs; a napi riport sora.
