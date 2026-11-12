# TÉNYKÖZPONT 0. fázis — FÉK — megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ne készülhessen új útmutató olyan eszközről, amelynek nincs jóváhagyott hivatalos súgója; súgó nélküli útmutató ne állíthasson konkrét gomb-/menünevet; a valódi új nevek ne bukjanak téves „kitalált név” kifogáson útmutatónál sem.

**Architecture:** Egy új leképező modul (`core/forras-szint.js`) mondja meg bármely `tool`/`company` párra a forrásszintet. Erre épül a fék-szűrő (`core/fek.js`), amit az útmutató-agent minden téma-/átírás-útja hív, és egy új elutasító ellenőrző-kód (`GUIDE_UI_NO_HELP`). A téves névkifogás-őr útmutatónál a forrás-hír és a súgó szövegével igazol.

**Tech Stack:** Node.js ESM, saját mini tesztkeret (`assert/strict` + `t()` minta, `core/*.test.js`, `node core/run-tests.js`).

**Spec:** `docs/superpowers/specs/2026-11-12-tenykozpont-design.md` (5. pont 0a–0d, 8. és 9. pont).

## Global Constraints

- Kiadói (súgó/forrás) szöveg SOHA nem kerül a nyilvános repóba; csak `_forrasok/` (privát tár) vagy futásidejű letöltés.
- Minden új gát kézi kill-switch-csel (`export const …_BE = true`) a `core/` oldalon + teszt, ami a kapcsoló értékét is rögzíti. A config `enabled` mező NEM kapcsoló.
- Minden új ellenőrző-kódhoz lecke-szöveg (angol, szám nélkül) + magyar név a `core/auto-check-codes.js`-ben (az őr-teszt megköveteli).
- Kód-kommentek és konzol-/riport-sorok MAGYARUL, nem-technikus olvasónak érthetően.
- Tesztek futtatása: `node core/run-tests.js > <scratchpad>/teszt.txt 2>&1` (kimenet FÁJLBA, soha csővezeték); egyes teszt: `node core/<név>.test.js`.
- Build-próba csak scratchpad-másolatban (`build.js` SOHA nem a repóban) + `node core/output-guard.js`.
- Commit csak az adott feladat fájljaival; a commit-üzenet végén: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fizetős AI-hívás a tesztekben TILOS (hálózat nélküli tesztek).
- A fék SOHA nem töröl témát/cikket és nem állít át státuszt: menet közben szűr, így egy súgó jóváhagyása után magától felszabadul. (Ez felülírja a spec 0b „status: 'fek'” mondatát — Claude döntése: kevesebb írás a témafájlba, nincs ragadt állapot.)
- Olvasó-védelem (spec 9.): a 0. fázis élő szöveget nem ír át; publikált oldal nem változik.

## Review Focus

- `tool` üres, de `company` ki van töltve (pl. „Google / -”) → a cég súgó-szintjét kapja, nem „cégfüggetlen”-t (Task 1 teszt).
- Kis-/nagybetű, „+”, szóköz, „.ai” változatok („Alexa+”, „alexa”, „Perplexity AI”, „DeepSeek Chat”, „Hugging Face Spaces”) → ugyanarra a szintre (Task 1 teszt).
- A forrás-hír fájlja (`source_news.file`) már nem létezik / hibás JSON → a névőr nem dob, csak a névlistával igazol (Task 2 teszt).
- Cégfüggetlen útmutató, ahol a magabiztos felület-állítás hedge-elt („if you don't see…”) → NEM bukik (Task 3 teszt a meglévő `confidentUiClaims` szabályaira épít).
- A fékezett téma kézi `--id`-vel kérve → akkor is fékezett, és a napló megmondja, miért (Task 4 teszt).

---

### Task 1: Forrásszint-leképezés (spec 0a)

**Files:**
- Create: `core/forras-szint.js`
- Test: `core/forras-szint.test.js`

**Interfaces:**
- Produces:
  - `export const SZINT = Object.freeze({ TELJES: 'teljes', RESZLEGES: 'reszleges', NINCS: 'nincs', CEGFUGGETLEN: 'cegfuggetlen' })`
  - `export function forrasSzint(tool: string, company: string): { szint: string, eszkoz: string|null, ok: string }` — `eszkoz` a kanonikus név (pl. `'Grok'`), `ok` egy rövid magyar indoklás a naplóhoz.
  - `export const ESZKOZ_SZINT` — a táblázat (kanonikus név → `{ szint, aliasok: string[], cegek: string[], sugo: string[] }`), teszteléshez exportálva.

- [ ] **Step 1: Írd meg a failing tesztet** `core/forras-szint.test.js` (a `core/sugo-parositas.test.js` `t()` mintájával):
  - `forrasSzint('ChatGPT','OpenAI').szint === 'teljes'`; ugyanígy `Claude`, `Gemini`, `Gemini Notebook`, `NotebookLM`, `Google Photos`, `Microsoft Copilot`/`Copilot`, `Le Chat`, `Apple Intelligence`, `Image Playground`, `Siri`, `Alexa+`, `Alexa` (spec 4.1 „már jóváhagyott”).
  - Új jóváhagyottak `'teljes'`: `Grok`(xAI), `Perplexity`, `Perplexity AI`/`Perplexity`, `GitHub Copilot`, `Hugging Face`, `Hugging Face Spaces`, `Cohere`, `Duck.ai`, `Lumo`, `Z.ai`, `ElevenLabs`.
  - `'reszleges'`: `DeepSeek`, `DeepSeek Chat`, `Kimi`, `MiniMax Code`, `Brave Leo`.
  - `'nincs'`: `Meta AI`, `Qwen`, `Qwen Chat`, `Alibaba Cloud`, `Midjourney`, `Picsart`, `Suno.ai`, `Kling`, `Recraft`, `Ideogram`, `Zapier`, `Galaxy Ring`, `Upscayl`, `Project Genie`, és egy ismeretlen `'FooBot'/'Foo Inc'`.
  - `forrasSzint('','').szint === 'cegfuggetlen'`; `forrasSzint('-','')` is az.
  - Csak cég: `forrasSzint('', 'Google')` → `'teljes'` (Gemini-súgó), `forrasSzint('', 'Meta')` → `'nincs'`.
  - Kisbetű/szóköz: `forrasSzint(' alexa+ ', 'amazon').szint === 'teljes'`.
  - Valódi adat-teszt: a `content/articles/ARTICLE_GUIDE_*.json` frontmatter `tool`/`company` párjai közül egy sem ad `undefined` szintet, és a 11-12-i számlálás szerint a `nincs` szintű útmutatók száma 20–45 között van (Meta 12, Qwen ~16, Midjourney 4, egyéb 1-esek) — ha a táblázat elcsúszik, ez fog bukni.
- [ ] **Step 2:** `node core/forras-szint.test.js` → FAIL (nincs modul).
- [ ] **Step 3:** Implementáld. Normalizálás: kisbetű, `+` megtartva, szóközök összevonva, `.ai`/` ai` végződés a cégnél levágva. Elsőként a `tool` alias egyezik; ha a tool üres vagy `-`, a `company`-t nézi a `cegek` listákban; ha egyik sincs → `cegfuggetlen`, ha van tool/cég de nincs a táblában → `nincs` (`ok: 'nincs jóváhagyott hivatalos súgó'`). A fájl fejléc-kommentje idézze a user 11-12-i döntését és a spec 4.1 táblát (forrás-URL-ekkel). Kill-switch itt nincs (tiszta leképezés).
- [ ] **Step 4:** `node core/forras-szint.test.js` → mind ✅.
- [ ] **Step 5: Commit** `git add core/forras-szint.js core/forras-szint.test.js && git commit -m "Forrásszint-leképezés: melyik eszköznek van jóváhagyott hivatalos súgója (TÉNYKÖZPONT 0a)"`

### Task 2: Téves „kitalált név” kifogás útmutatónál (spec 0d)

**Files:**
- Modify: `core/biralo-forrasinfo.js` (új függvény + `atdolgozoMeta` opció)
- Modify: `agents/ellenorzo/agent.js:~903-912` (a `nevForras` összeállítása)
- Modify: `agents/guide/agent.js:~1019` (átdolgozó előtti szűrés)
- Test: `core/biralo-forrasinfo.test.js` (bővítés; ha a fájl máshogy hívják, a meglévő tesztfájl)

**Interfaces:**
- Consumes: `cikkForrasSzovege(meta)`, `cikkKivonat(meta)` (`core/forras-cache.js`).
- Produces:
  - `export function utmutatoNevForras(meta: object, { hirBetolt?: (file:string)=>object|null, sugoSzovegek?: string[] } = {}): { originalTitle: string, sourceUrl: string, sourceText: string }`
    — `sourceUrl`: a forrás-hír `_meta.source_link`-je, ha http(s); különben az első `official_sources[].url`; különben `''`. `originalTitle`: a forrás-hír `original_title` + az `official_sources` címek szóközzel. `sourceText`: a forrás-hír privát-tárbeli szövege (vagy kivonata) + a `sugoSzovegek`. `hirBetolt` alapértéke a `content/articles/<file>` beolvasása; hiba/hiány → `null`, sosem dob.
  - `atdolgozoMeta(meta, { originalTitle, sourceText, sourceUrl, known })` — ÚJ opcionális `sourceUrl`; ha meg van adva, felülírja a `meta.source_link`-et.

- [ ] **Step 1: Failing teszt** (valódi 11-12-i esettel, hálózat nélkül, injektált `hirBetolt`):
  - Útmutató-meta: `{ type:'guide', source_link:'', source_news:{ file:'X.json', title:'Gemini 4 Carbon is now available' }, official_sources:[{url:'https://support.google.com/gemini/answer/18648722', title:'About Gemini models - Computer'}], sugo_alapu:true }`; `hirBetolt` → `{ original_title:'Gemini 4 Carbon is now available', _meta:{ source_link:'https://blog.google/products/gemini/gemini-4-carbon/' } }`.
  - `tevesNevKifogas({ issues:[], verdict:"refers to 'Gemini 4 Carbon' which does not appear in the verified-real names list" }, utmutatoNevForras(meta,{hirBetolt, sugoSzovegek:['Gemini 4 Carbon: Our strongest model…']}))` → `verdictTeves === true`, `nevek` tartalmazza `'Gemini 4 Carbon'`-t.
  - „Workspace Studio” eset: forrás-hír címe `'Pause and schedule automated workflows with the new Workspace Studio'`, a bírálat `"the core product name Workspace Studio cannot be independently verified"` → téves.
  - Ellenpróba: ugyanez a bírálat `'Gemini 5 Ultra'` névvel (nincs a forrásban) → NEM téves.
  - `hirBetolt` `null`-t ad / dob → nem dob, `sourceUrl` a súgó URL-je, a súgószövegben álló név még igazolódik.
  - `atdolgozoMeta(rejectedMeta, { sourceUrl:'https://support.google.com/…', sourceText:'… Gemini 4 Carbon …' })` → `kivett.length > 0`.
- [ ] **Step 2:** a teszt FAIL.
- [ ] **Step 3:** implementáld `utmutatoNevForras`-t és az `atdolgozoMeta` opciót a `core/biralo-forrasinfo.js`-ben (fejléc-komment: 11-12-i lelet, a két valódi eset). Bekötés:
  - `agents/ellenorzo/agent.js`: ha `writerData._meta?.type === 'guide'`, a `nevForras = utmutatoNevForras(writerData._meta, { sugoSzovegek })`, ahol `sugoSzovegek` a súgó-mérésnél (~856–866. sor) már letöltött szövegek — emeld ki a `szovegek` tömböt a `try` blokk elé, hogy mindkét hely használja. Hírnél a mostani viselkedés változatlan.
  - `agents/guide/agent.js` (~1019): `atdolgozoMeta(data._meta, { originalTitle, ...utmutatoNevForras(data._meta, { sugoSzovegek }) })`, ahol `sugoSzovegek` a `sugoForrasok(data._meta)` cikkeinek `cikkSzoveg()`-gel letöltött szövege (csak `sugo_alapu`-nál; hiba → üres).
- [ ] **Step 4:** a teszt ✅; `node core/run-tests.js > …/teszt.txt` → 0 bukott.
- [ ] **Step 5: Commit** `git commit -m "Útmutatónál is a forrás-hír és a súgó igazolja a nevet (Gemini 4 Carbon, Workspace Studio téves elutasítás, TÉNYKÖZPONT 0d)"`

### Task 3: Súgó nélküli útmutató nem állíthat gombnevet — `GUIDE_UI_NO_HELP` (spec 0c, 8.1)

**Files:**
- Modify: `core/guide-claims.js` (új függvény)
- Modify: `core/auto-check-codes.js` (`BLOCKING_CODES`, `LESSON_TEXT`, magyar név)
- Modify: `agents/ellenorzo/agent.js` (a súgó-mérés után)
- Test: `core/guide-claims.test.js` (vagy a meglévő guide-claims tesztfájl) + az auto-check-codes őr-tesztje magától ellenőrzi a leckét/nevet

**Interfaces:**
- Consumes: `forrasSzint(tool, company)` (Task 1); `confidentUiClaims(markdown)` (meglévő); `MIN_HIANYZO_FELIRAT` (=2, `core/forras-tema.js`).
- Produces: `export function sugoNelkuliFeluletJelzes(markdown: string, { szint: string, vanSugoSzoveg: boolean }): string|null` — `null`, ha nem ítél; különben `"GUIDE_UI_NO_HELP: …"` (a feliratok első 4-e a jelzésben).
- Kill-switch: `export const SUGO_NELKULI_FELULET_BE = true` a `core/guide-claims.js`-ben.

- [ ] **Step 1: Failing teszt:**
  - `szint:'cegfuggetlen', vanSugoSzoveg:false`, markdown 2 magabiztos gombnévvel (pl. `Click **Schedule send**` és `Tap **Compose**`) → jelzés `GUIDE_UI_NO_HELP`-pel kezdődik.
  - Ugyanez csak 1 gombnévvel → `null` (küszöb = `MIN_HIANYZO_FELIRAT` = 2).
  - Ugyanez hedge-elve („if you don't see **Compose**, look for…”) → `null`.
  - `szint:'reszleges'` és `'nincs'` → ítél; `szint:'teljes', vanSugoSzoveg:false` → `null` (0. fázisban a teljes súgós eszköz még nem bukik — spec 8.1); `vanSugoSzoveg:true` → `null` (ott a `GUIDE_UI_NOT_IN_HELP` mér).
  - `SUGO_NELKULI_FELULET_BE === true`.
  - `isBlocking('GUIDE_UI_NO_HELP: x') === true`; `lessonFor(...)` nem üres; magyar név: „súgó nélkül leírt gomb- és menünevek”.
  - KORPUSZ-teszt (valódi adat): a publikált cégfüggetlen útmutatók közül legfeljebb 20 kapna jelzést (11-12-i mérés: 14 db ≥2 magabiztos felirattal a 108-ból) — védi a túlfékezést (anti-cél).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementáld. Lecke-szöveg (angol, szám nélkül): a guide named specific buttons/menus but there is no official help article for this tool (or it is a general guide) → describe the action without naming on-screen labels; tell the reader the app's own help center has the exact steps. Bekötés az ellenőrzőben, a súgó-mérés után, CSAK `type === 'guide'`-ra: `szint = forrasSzint(tool, company).szint` (a frontmatterből, mint a `runAutoCheck`), `vanSugoSzoveg = szovegek.length > 0` (Task 2-ben kiemelt tömb). Konzolsor: `🧯 súgó nélküli felület-mérés: ✅ nincs konkrét gombnév` / `❌ …`.
- [ ] **Step 4:** tesztek ✅, teljes futtatás 0 bukott.
- [ ] **Step 5: Commit** `git commit -m "GUIDE_UI_NO_HELP: súgó nélküli útmutató nem nevezhet meg gombot/menüt (TÉNYKÖZPONT 0c)"`

### Task 4: A fék minden útmutató-úton (spec 0b)

**Files:**
- Create: `core/fek.js`
- Test: `core/fek.test.js`
- Modify: `agents/guide/agent.js` — `pickTopics` (~125. sor), `listRejectedGuidesForRework` (~899), `runUpgradeMode` jelöltlista (~1129), a téma-felvevő helyek (`addCompanyCoverage` ~238, balance ~354, `proposeNewTopics` ~538)
- Modify: `agents/iro/upgrade-howtos.js` (hírből útmutató — a jelöltszűrés helyén)

**Interfaces:**
- Consumes: `forrasSzint` (Task 1).
- Produces:
  - `export const FEK_BE = true`
  - `export function fekezett(x: {tool?:string, company?:string, title?:string}): { fek: boolean, szint: string, eszkoz: string|null, ok: string }` — `fek` igaz, ha `FEK_BE` és a szint `'nincs'`. (`'reszleges'` és `'cegfuggetlen'` NEM fékezett: azokat a Task 3 kapuja fogja.)
  - `export function fekSzuro(lista: object[]): { mehet: object[], fekezett: object[] }` — stabil sorrend.
  - `export function fekAllapotIr(fekezett: object[], { fajl = 'memory/fek-allapot.json', most = new Date() } = {}): void` — `{ at, db, eszkozok: { [eszkoz]: db }, minta: [{id,title,eszkoz}] (max 10) }`; hiba nem dob.

- [ ] **Step 1: Failing teszt:** `fekezett({tool:'Meta AI',company:'Meta'}).fek === true`; `{tool:'ChatGPT'}` → false; `{tool:'DeepSeek'}` → false (részleges — a 0c kapu fogja); `{}` → false; `FEK_BE === true`; `fekSzuro` megtartja a sorrendet és szétválaszt; `fekAllapotIr` ideiglenes fájlba ír, a `db` és `eszkozok` helyes; kill-switch próba: a `fekezett` logika `FEK_BE` nélkül false-t ad (a függvény kapjon `{ be = FEK_BE }` opciót, hogy tesztelhető legyen).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementáld a `core/fek.js`-t, majd kösd be:
  - `pickTopics`: a `megszuntTema` szűrés mellett `fekSzuro(store.topics)` → a `fekezett` a `--id`/`--title` kérésre is vonatkozik; minden futás egyszer írja a `fekAllapotIr`-t (a `todo` státuszú fékezettekről) és egy konzolsort: `🧯 Fék: N téma vár hivatalos súgóra (Meta AI 2, Qwen 1…)`.
  - Téma-felvétel (`addCompanyCoverage`, balance, `proposeNewTopics`): fékezett eszközre NEM vesz fel új témát (konzol: `🧯 kihagyva: … — nincs jóváhagyott súgó`). Az `--ideas` prompt-szövegét NEM kell most módosítani (1. fázis).
  - `listRejectedGuidesForRework`: fékezett eszköz elutasított útmutatóját nem dolgozza át (a fájl marad, nem töröl).
  - `runUpgradeMode`: fékezett eszköz publikált útmutatóját nem írja át emlékezetből (kimarad a jelöltekből, naplósor).
  - `agents/iro/upgrade-howtos.js`: a cél-útmutató eszköze fékezett → nem ír át.
- [ ] **Step 4:** `node core/fek.test.js` ✅; teljes futtatás 0 bukott; egy száraz próba: `node --input-type=module -e` szkripttel a valódi `guides/guide-topics.json`-on hívd a `fekSzuro`-t, és írd ki, hány `todo` téma fékeződne (várható: néhány; ha >30%, állj meg és jelezd).
- [ ] **Step 5: Commit** `git commit -m "Fék: jóváhagyott súgó nélküli eszközről nincs új/átírt útmutató (TÉNYKÖZPONT 0b)"`

### Task 5: Telegram-sor a fékről + élesítés-ellenőrzés

**Files:**
- Modify: `core/report-lines.js` (új `fekLine`), `core/daily-report.js` (bekötés a többi sor mellé)
- Test: a report-lines meglévő tesztfájlja (vagy `core/fek-riport.test.js`)

**Interfaces:**
- Consumes: `memory/fek-allapot.json` (Task 4 formátuma).
- Produces: `export function fekLine(allapot: object|null, maNap: string): string|null` — `null`, ha nincs fájl vagy `db === 0`, vagy az `at` nem a mai/tegnapi napé; különben pl. `🧯 Fék: 3 útmutató-téma vár hivatalos súgóra (Meta AI 2, Qwen 1) — ezekről addig nem írunk.`

- [ ] **Step 1: Failing teszt:** `fekLine(null)` → null; `db:0` → null; régi `at` → null; `{db:3, eszkozok:{'Meta AI':2,'Qwen':1}}` → a fenti szöveg (a sorrend a darabszám szerint csökkenő).
- [ ] **Step 2:** FAIL. **Step 3:** implementáld + kösd be a `daily-report.js`-be a 🏢 cég-lefedettség sor mintájára. **Step 4:** ✅, teljes futtatás 0 bukott.
- [ ] **Step 5: Build-próba** scratchpad-másolatban (`build.js` + `node core/output-guard.js`) → OK (a 0. fázis nem változtat lapot; ez biztonsági próba).
- [ ] **Step 6: Commit + push** `git commit -m "Telegram 🧯 Fék-sor (TÉNYKÖZPONT 0. fázis)" && git pull --ff-only && git push`
- [ ] **Step 7: Élesítés-ellenőrzés a következő CI-futás után** (`aiworld-allapot` + `gh run view <id> --log`): a naplóban `🧯` sorok; nincs új útmutató `nincs` szintű eszközről; a Telegram-riportban a 🧯 sor (ha volt fékezett téma); a tesztek zöldek; az aznapi útmutatószám nem esett 0-ra (anti-cél). Az eredményt a teendőlistába.
