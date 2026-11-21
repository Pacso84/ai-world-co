# Csalás-figyelő + /scams oldal — megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Két jóváhagyott hivatalos forrásból (FBI IC3, Google Safety & Security) a gép kiválogatja az új, magánembereket célzó csalásokat, napi +1 külön helyen csalás-sablonos hírt ír róluk saját rajzolt (példa)képpel en/hu/es, és a /scams oldal gyűjti őket a régi, átnézett csalásos útmutatókkal.

**Architecture:** Új tiszta `core/` modulok (figyelő-logika, sablon + példablokk, védekezés-tár, képrajzoló, gyűjtőoldal), az agentekben csak a bekötés. A kép adatai egy fordítható markdown-blokkban élnek a cikk törzsében (a fordító a frontmattert NEM fordítja). Minden egy kézi kill-switch (`CSALAS_FIGYELO_BE`, alapból `false`) mögött érkezik; a user az előnézet után kapcsolja be.

**Tech Stack:** Node 22 ESM, `sharp` + SVG (mint core/motion-reel.js), `marked`, a meglévő `core/ai-router.js` `ask()`; tesztek: `node core/<nev>.test.js`, teljes sor `node core/run-tests.js > fájl`.

**Spec:** docs/superpowers/specs/2026-11-21-csalas-figyelo-design.md (user-jóváhagyás 11-21: „mehet”). A builder a speccel együtt olvassa.

## Global Constraints
- Kill-switch: `CSALAS_FIGYELO_BE` a `core/csalas-figyelo.js`-ben, kézi, teszttel; a config `enabled` mezői NEM kapcsolnak ki semmit. `false` = nincs csalás-gyűjtés, 0 csalás-hely, nincs /scams oldal, nincs menüpont.
- Napi csalás-hely: `CSALAS_EXTRA_NAPI = 1`; NEM számít a napi 4 hírbe (`config.limits.daily_articles_max`) és a termék-extrába (`_meta.termek_extra`).
- Frissesség: a forrás tétele legfeljebb **7 nap** (`CSALAS_MAX_KOR_NAP = 7`).
- Forrás: CSAK `https://www.ic3.gov/PSA/RSS` és `https://blog.google/technology/safety-security/rss/` (user 11-21). A csalás-forrás „nem” tétele eldobódik, NEM rendes hír.
- Kép: link CSAK `example.com` / `*.example.com`; telefonszám CSAK `555-01xx`; valódi cég-, márka- vagy hivatalnév a képen SOHA; vízjel: en „EXAMPLE – SCAM”, hu „PÉLDA – CSALÁS”, es „EJEMPLO – ESTAFA”; „Example — not a real message” jelölés.
- Ár: termékár tilos (core/ar-tilalom.js); kárösszeg csak a forrásból. Készüléknév tilos. EU AI Act címke, amerikai angol, nem angol oldalon nincs angol mondat, 1 hirdetés / oldal, 1 H1 / oldal, papírlapos fejléc (core/lap-hero.js).
- USA-specifikus csalás mehet 3 nyelven (user 11-21), a trükk és a védekezés általánosan megírva.
- Soha ne importálj `agents/` alól (a `main()` feltétel nélkül fut). Tesztelhető logika a `core/`-ba.
- Új blokkoló ellenőrző-kódhoz `LESSON_TEXT` (állandó szöveg) + `HU_NEV` kötelező (core/auto-check-codes.js).
- Build-próba CSAK scratchpad-másolatban (+ `node core/output-guard.js`); tesztkimenet fájlba; `npm run router-smoke` TILOS.
- Commit-üzenet vége: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; push a main-re a user szabálya szerint (a kapcsoló `false`, élesben nem látszik semmi).

## Review Focus
1. **A fordító elrontja a példablokkot** (kihagyja a `[[n|…]]` jelet, lefordítja a domaint/számot, angolul hagyja) → a hu/es fordítás NEM mentődik (újrapróba), a build pedig sosem tesz ki törött vagy angol blokkot. Teszt: Task 2 `forditasEgyezik` + Task 7.
2. **Valódi márka vagy domain a példában** („Amazon”, „paypal.com”, „+1 (800) …”) → az ellenőrző elutasít, kép nem készül. Teszt: Task 2 `peldaBiztonsag`.
3. **Nincs aznap csalás, vagy kevés a rendes vázlat** → a csalás-vázlat SOHA nem foglal rendes helyet, a rendes 4 hír változatlan. Teszt: Task 6 `csalasSzetvalaszt`.
4. **7 napnál régebbi vagy már látott csalás-tétel** → nincs belőle vázlat; dupla csalás-tételből egy hír. Teszt: Task 1 `csalasFriss` + a meglévő ismétlés-őr.
5. **Kikapcsolt kapcsoló** → nincs menüpont, nincs /scams, nincs sitemap-sor, a hírgyűjtő a csalás-forrásokat kihagyja. Teszt: Task 8 + Task 5.

---

### Task 1: Csalás-figyelő alapmodul (kapcsoló, hely, frissesség, szűrő)

**Files:**
- Create: `core/csalas-figyelo.js`, `core/csalas-figyelo.test.js`

**Interfaces:**
- Produces:
  - `export const CSALAS_FIGYELO_BE = false; export const CSALAS_EXTRA_NAPI = 1; export const CSALAS_MAX_KOR_NAP = 7;`
  - `export const CSATORNAK = ['sms','email','chat','call','social','web'];` (kép-sablon csak az első 4-hez; `social` → `chat`, `web` → `email` rajz)
  - `csalasForras(feedConfig) -> boolean` (`feedConfig.csalas === true`)
  - `csalasFriss(item, now = Date.now()) -> boolean` (pubDate/isoDate ≤ 7 nap; hiányzó/hibás dátum → false)
  - `csalasExtraMaradek(maCsalasDb) -> number` (`BE` false → 0; `max(0, 1 − maCsalasDb)`)
  - `csalasHir(meta) -> boolean` (`!!meta?.csalas`), `csalasExtraHir(meta) -> boolean` (`!!meta?.csalas_extra`)
  - `CSALAS_SZURO_RENDSZER: string` (system prompt), `csalasSzuroPrompt(tetelek: {title, snippet}[]) -> string`
  - `csalasDontesek(text: string, n: number) -> {index, csalas: boolean, csatorna: string|null, ok: string}[] | null` (a `{"decisions":[…]}` borítékot és a csupasz tömböt is elfogadja; ismeretlen csatorna → `null`; hibás JSON → `null`)

- [ ] **Step 1: Write the failing tests** (`core/csalas-figyelo.test.js`, a projekt `await t(név, fn)` mintájával, mint core/lefedettseg-extra.test.js):
  - `csalasExtraMaradek(0) === 0` amíg `CSALAS_FIGYELO_BE === false`; egy bekapcsolt-változatot tesztelő segéd nélkül is: `assert.equal(CSALAS_FIGYELO_BE, false)` (őr: élesítés előtt ne kapcsoljon be véletlenül — az élesítő task ezt a sort írja át `true`-ra).
  - `csalasFriss({ pubDate: <most−6 nap> }) === true`, `<most−8 nap>` → false, `{}` → false, `{ pubDate: 'nem dátum' }` → false.
  - `csalasForras({ csalas: true }) === true`, `{}` → false.
  - `csalasDontesek('{"decisions":[{"index":0,"csalas":true,"csatorna":"sms","ok":"x"},{"index":1,"csalas":false,"csatorna":null,"ok":"y"}]}', 2)` → 2 elem, az első `csatorna: 'sms'`; `csatorna: 'fax'` → `null`; `'nem json'` → `null`.
  - `csalasSzuroPrompt([{title:'A',snippet:'b'}])` tartalmazza: `[0] Title: A`.
- [ ] **Step 2:** `node core/csalas-figyelo.test.js` → FAIL (nincs modul).
- [ ] **Step 3: Implement** `core/csalas-figyelo.js`. A `CSALAS_SZURO_RENDSZER` a spec 8.2 határait mondja ki angolul: „igen” = konkrét, magánembereket célzó csalás (ki, milyen csatornán, mit kér); „nem” = tisztviselőknek/cégeknek szóló, sérülékenység (CVE, „vulnerability alert”), általános tippgyűjtemény konkrét csalás nélkül, új csalásvédelmi termékfunkció bejelentése. Válasz: `{"decisions":[{"index":0,"csalas":true,"csatorna":"sms|email|chat|call|social|web","ok":"brief"}]}`.
- [ ] **Step 4:** a teszt PASS.
- [ ] **Step 5: Commit** — `git add core/csalas-figyelo.js core/csalas-figyelo.test.js` · „Csalás-figyelő alapmodul (kikapcsolva)”.

### Task 2: Csalás-sablon és a példablokk

**Files:**
- Create: `core/csalas-sablon.js`, `core/csalas-sablon.test.js`

**Interfaces:**
- Produces:
  - `CSALAS_FEJEZETEK = ["What's happening", 'Warning signs', 'How to protect yourself', 'If it already happened', 'What this means for you']` (pontos H2-szövegek, angolul).
  - **A példablokk formátuma** (a „## Warning signs” alatt, közvetlenül utána egy 3 elemű számozott lista):
    ```
    > 🧪 [sms]
    > 👤 [[1|+1 (555) 010-0199]]
    > Your package is on hold because the address is incomplete.
    > [[2|It will be deleted in 24 hours!]]
    > Confirm here: [[3|parcel-track.example.com]]

    1. **Unknown number** — real delivery companies don't text like this.
    2. **Pressure** — so you don't have time to think.
    3. **Odd link** — it's not the company's own address.
    ```
    Szabály: az első sor `> 🧪 [<csatorna>]` (csatorna a Task 1 `CSATORNAK`-ból, mindig angolul); `> 👤` = feladó; e-mailnél opcionális `> 📌` = tárgy; a többi `> ` sor az üzenet (2–5 sor); `[[1|…]]`, `[[2|…]]`, `[[3|…]]` pontosan egyszer-egyszer.
  - `peldaBlokk(md) -> { csatorna, felado, targy: string|null, sorok: string[], jelek: {1:string,2:string,3:string}, magyarazat: {cimke, szoveg}[] } | null`
  - `peldaBlokkNelkul(md) -> string` — a blokkot és a 3 elemű listát egyetlen sorra cseréli: `> (Illustrative example message — fictional, clearly labeled; not a factual claim.)`
  - `csalasSzerkezetHiba(md) -> string[]` — hiányzó H2-k és a példablokk hibái (`'nincs példablokk'`, `'nem 3 jel'`, `'nem 3 magyarázat'`, `'ismeretlen csatorna'`).
  - `peldaBiztonsag(pelda) -> string[]` — üres = biztonságos. Hibák: domain nem `example.com`/`*.example.com`; telefonszám nem `555-01\d\d` mintájú; tiltott név (lista: a `website/tool-links.json` kulcsai + `MARKA_TILTOTT` = Amazon, UPS, FedEx, USPS, DHL, PayPal, Venmo, Zelle, Cash App, Chase, Wells Fargo, Bank of America, Citi, Capital One, Apple, Google, Microsoft, Meta, Facebook, Instagram, WhatsApp, Netflix, Walmart, Target, eBay, Coinbase, IRS, Social Security, SSA, Medicare, FBI, FTC; szóhatáros, kisbetű-érzéketlen).
  - `forditasEgyezik(enMd, trMd) -> boolean` — ha az angolban van példablokk: a fordításban is van, ugyanaz a csatorna, 3 jel, 3 magyarázat, és a jelekben lévő domainek/telefonszámok betűre azonosak. Ha az angolban nincs: `true`.
  - `peldaBlokkCsere(md, { kepUt, alt }) -> string` — a blokk + lista helyére `<figure class="csalas-pelda"><img src="${kepUt}" alt="${alt}" width="1080" height="1350" loading="lazy"><figcaption>…3 magyarázat…</figcaption></figure>` kerül (HTML-blokk a markdownban, hogy a `marked` átengedje); `kepUt` üres → a blokk szöveges, jelölt változata marad (`<div class="csalas-pelda csalas-pelda--szoveg">`), angol szöveg nélkül a nem angol oldalon (a blokk maga a fordított szöveg).
- [ ] **Step 1: Write the failing tests**, valódi szövegből: a fenti blokk egy teljes csalás-cikkben (en) és a magyar fordítása (`> 🧪 [sms]`, `> 👤 [[1|+1 (555) 010-0199]]`, „Erősítsd meg itt: [[3|parcel-track.example.com]]”).
  - `peldaBlokk(en).jelek[3] === 'parcel-track.example.com'`, `magyarazat.length === 3`, `csatorna === 'sms'`.
  - `csalasSzerkezetHiba(en)` üres; a „## If it already happened” nélküli változat → tartalmazza a hiányzó fejezetet.
  - `peldaBiztonsag` → hiba: `[[3|paypal-help.com]]`, `Amazon` a szövegben, `+1 (800) 555-1234`; üres a mintára.
  - `forditasEgyezik(en, hu) === true`; a `[[2|…]]`-t elhagyó és a domaint `pelda.hu`-ra fordító magyar → `false`.
  - `peldaBlokkNelkul(en)` nem tartalmazza: `parcel-track`, tartalmazza: `Illustrative example`.
  - `peldaBlokkCsere(en, { kepUt: '/x.jpg', alt: 'a' })` tartalmazza `<figure class="csalas-pelda">`, és nem tartalmazza `[[`.
- [ ] **Step 2:** FAIL. **Step 3:** implementálás. **Step 4:** PASS.
- [ ] **Step 5: Commit** — „Csalás-sablon + példablokk (formátum, őr, fordítás-egyezés)”.

### Task 3: Védekezés-tár (kézzel, hivatalos forrásból)

**Files:**
- Create: `core/csalas-vedekezes.js`, `core/csalas-vedekezes.test.js`

**Interfaces:**
- Produces: `VEDEKEZES: { [csatorna]: { lepes: string, forras: string }[] }` (mind a 6 csatorna, csatornánként 3–6 lépés, angolul, amerikai angol); `vedekezesCsatornara(csatorna) -> {lepes, forras}[]`; `BEJELENTES: {nev, url}[]` = ic3.gov, reportfraud.ftc.gov (+ `ORSZAGFUGGETLEN` mondat: „Outside the US, contact your local police or consumer protection agency.”).

- [ ] **Step 1: Kutatás** — a lépéseket hivatalos oldalról olvasd ki, Chrome-mal, mert a consumer.ftc.gov géppel 404-et ad: FTC consumer advice (consumer.ftc.gov — pl. „How To Recognize and Avoid Phishing Scams”, „How To Recognize and Report Spam Text Messages”, „Phone Scams”, „Imposter scams”), FBI IC3 (ic3.gov), CISA Secure Our World (cisa.gov/secure-our-world). Minden lépés mellé a konkrét oldal URL-je. Kitalált lépés TILOS; ár nem lehet benne.
- [ ] **Step 2: Write the failing test**: minden csatornán 3–6 lépés; minden `forras` `https://` és a hostja ezek egyike: `consumer.ftc.gov`, `reportfraud.ftc.gov`, `www.ftc.gov`, `www.ic3.gov`, `www.fbi.gov`, `www.cisa.gov`; `arAllitasok(lepes)` üres minden lépésre (core/ar-tilalom.js); `BEJELENTES` URL-jei pontosan `https://www.ic3.gov` és `https://reportfraud.ftc.gov`.
- [ ] **Step 3:** FAIL → **Step 4:** a tár kitöltése → PASS.
- [ ] **Step 5: Commit** — „Csalás védekezés-tár hivatalos forrásokból”.

### Task 4: Képrajzoló + CI-lépés + a designer kihagyja a csalás-hírt

**Files:**
- Create: `core/csalas-kep.js`, `core/csalas-kep.test.js`, `core/csalas-kepek.js` (CLI)
- Modify: `agents/designer/agent.js` (a fájlválogatás, 218–240. sor körül: a `_meta.csalas` cikk kimarad, az új borítós és a `--refresh` ágon is), `.github/workflows/auto.yml` (új lépés a „Reel — napi videó gyártása” után, a „Weboldal build” előtt: `node core/csalas-kepek.js || true`, `if: always()`)

**Interfaces:**
- Consumes: `peldaBlokk`, `peldaBiztonsag` (Task 2); `csalasHir` (Task 1).
- Produces:
  - `KEP_SZ = { en: {cim:'What this scam looks like', vizjel:'EXAMPLE – SCAM', lab:'Made-up example to help you spot it · aiworldhq.com'}, hu: {cim:'Így néz ki ez a csalás', vizjel:'PÉLDA – CSALÁS', lab:'Kitalált példa a felismeréshez · aiworldhq.com'}, es: {cim:'Así se ve esta estafa', vizjel:'EJEMPLO – ESTAFA', lab:'Ejemplo inventado para ayudarte a reconocerla · aiworldhq.com'} }`
  - `async rajzolCsalasKep(pelda, { lang, format: '4x5' | '16x9' }) -> Buffer` (JPEG; 4x5 = 1080×1350, 16x9 = 1280×720); ha `peldaBiztonsag(pelda).length` → `throw`.
  - CLI `core/csalas-kepek.js`: `CSALAS_FIGYELO_BE` false → kilép 0-val. Különben minden `content/articles` csalás-cikkre és nyelvre (en + a `content/translations` hu/es-e) → `website/assets/images/csalas/<slug>-<lang>.jpg` (4x5), és az angolból `website/assets/images/<slug>.jpg` (16x9 borító). Hibánál a többit folytatja, és a hibát a `memory/csalas-guard.json` `kep_hibak` tömbjébe írja.
- [ ] **Step 1: Write the failing tests**: a Task 2 mintapéldájából `rajzolCsalasKep(..., {lang:'hu', format:'4x5'})` → `sharp(buf).metadata()` 1080×1350, jpeg; `16x9` → 1280×720; nem biztonságos példa → reject. Mind a 4 csatorna-sablon (sms, email, chat, call) rajzol; a `social` és a `web` a chat és az email rajzot kapja.
- [ ] **Step 2:** FAIL. **Step 3:** megvalósítás. A rajz a memoria/mintak/csalas-minta.mjs stílusát követi (telefonkeret, buborék, piros szaggatott keret + ①②③, ferde vízjel, jelmagyarázat, lábjegyzet), és ugyanazt a betűkészletet használja, mint a core/motion-reel.js. E-mailnél fejléc + tárgy, hívásnál bejövő hívás képernyő + hívó + 2–3 soros „mit mond” buborék. **Step 4:** PASS, a 4 csatorna 4x5 képét a scratchpadbe mentve szemmel is megnézni.
- [ ] **Step 5: Commit** — „Csalás-képrajzoló + CI-lépés; a designer kihagyja a csalás-hírt”.

### Task 5: Csalás-források és a hírgyűjtő bekötése + őrszem-fájl

**Files:**
- Modify: `sources/rss-feeds.json` (2 új forrás: `ic3-psa` és `google-safety`, `category: 'scam-official'`, `csalas: true`, `enabled: true`, `country: 'US'`, `language: 'en'`, `comment` a 11-21-i user-jóváhagyással), `agents/rss-scraper/agent.js`
- Test: `core/csalas-figyelo.test.js` (a forrásfájl-őr) — a scraper agent, tehát logikát nem oda teszünk.

**Interfaces:**
- Consumes: `csalasForras`, `csalasFriss`, `CSALAS_SZURO_RENDSZER`, `csalasSzuroPrompt`, `csalasDontesek`, `CSALAS_FIGYELO_BE` (Task 1).
- Produces: csalás-vázlat a `content/drafts/`-ban, a rendes `saveDraft` alakjában + `_meta.csalas = { csatorna, ok, forras_id }`, `_meta.relevance = { relevant: true, score: 10, category: 'scam', reason }`. Őrszem: `memory/csalas-guard.json` = `{ at, jelolt, csalas, eldobva: [{cim, ok}], kep_hibak? }` (minden futás felülírja; `kep_hibak`-ot a Task 4 CLI teszi hozzá).

- [ ] **Step 1: Write the failing test**: `sources/rss-feeds.json`-ban pontosan ez a két `csalas: true` forrás van, a két jóváhagyott URL-lel (más csalás-forrás user-jóváhagyás nélkül ne kerülhessen be).
- [ ] **Step 2:** FAIL → **Step 3:** források felvétele → PASS.
- [ ] **Step 4: Scraper bekötése** (a 343. sornál kezdődő forrásciklusban): ha `csalasForras(feedConfig)`:
  - `CSALAS_FIGYELO_BE` false → a forrást kihagyja, és nem jelöli látottnak;
  - egyébként: a régi vagy nem friss tétel (`!csalasFriss`) látott lesz és kimarad;
  - a kulcsszó-szűrő, a közönség-kapu és a készülék-kapu NEM fut rá;
  - a tétel a külön `csalasJeloltek` listába kerül.
  
  A 2. fázis után egy (köteg-) hívás: `ask(csalasSzuroPrompt(...), { agentName: AGENT_NAME, systemPrompt: CSALAS_SZURO_RENDSZER, maxTokens: 2000, jsonMode: true })`. A „csalás” tétel `saveDraft(item, feedConfig, relevance, { csalas })` lesz: a `saveDraft` kap egy 4. opcionális `extraMeta` paramétert, amit a `_meta`-ba terít. A „nem” tétel csak a guard `eldobva` listájába kerül, és látott lesz. Sikertelen hívásnál semmi sem lesz látott, a következő futás újrapróbálja. A végén `memory/csalas-guard.json`, a feltétel nélküli részben, hogy a „nem futott” látszódjon.
- [ ] **Step 5:** `node core/run-tests.js > "$TEMP/rt.txt"` → mind zöld. A scraper szintaxisa: `node --check agents/rss-scraper/agent.js`.
- [ ] **Step 6: Commit** — „Csalás-források (ic3 PSA, Google Safety) + hírgyűjtő-ág + őrszem”.

### Task 6: CEO-keret + az író csalás-ága

**Files:**
- Modify: `agents/ceo/agent.js` (keret 230–335. és 540–555. sor körül), `agents/iro/agent.js` (`parseArgs` 109–135, `main` 940–1060, új `writeScamArticle`, `saveWrittenArticle` 561–632)
- Modify: `core/csalas-figyelo.js` (+ teszt) — a szétválasztó tiszta függvény ide kerül.

**Interfaces:**
- Consumes: Task 1, 2, 3.
- Produces:
  - `csalasSzetvalaszt(ids: string[], info: (id) => {csalas: boolean}) -> { rendes: string[], csalas: string[] }` (`core/csalas-figyelo.js`).
  - `csalasIroUtasitas({ csatorna, vedekezes, bejelentes }) -> string` (`core/csalas-sablon.js`). Az író promptjához fűzött angol utasítás, ami kimondja:
    - a 5 kötelező H2-t;
    - a példablokk pontos formátumát;
    - hogy a ①②③ jel CSAK a forrásban megnevezett csalás-jegy lehet;
    - hogy a védekezés csak a forrásból vagy a megadott tár-lépésekből jöhet (azokat listázza);
    - a bejelentő helyeket + az országfüggetlen mondatot;
    - az USA-specifikus hivatal megnevezhető, de a trükk és a védekezés általános;
    - kárösszeg csak a forrásból, ár nem;
    - nyugodt hangnem, nincs riogató cím.
  - Író CLI: `--csalas-extra N`. Cikk-meta: `_meta.csalas = { csatorna, forras_id }`, és extra helyen `_meta.csalas_extra: true`.
- [ ] **Step 1: Write the failing test** (`core/csalas-figyelo.test.js`):
  - `csalasSzetvalaszt(['a','b','c'], id => ({ csalas: id === 'b' }))` → `{ rendes: ['a','c'], csalas: ['b'] }`;
  - üres bemenetre üres listák;
  - `csalasIroUtasitas({csatorna:'sms', vedekezes:[{lepes:'X',forras:'u'}], bejelentes:[…]})` tartalmazza: `## Warning signs`, `> 🧪 [sms]`, és `X`.
- [ ] **Step 2:** FAIL → **Step 3:** megvalósítás → **Step 4:** PASS.
- [ ] **Step 5: Bekötés — CEO:**
  - a `byType` számlálásnál `csalasExtraHir(_meta)` → `out.newsCsalas++`; a csalás-hír NEM `news++` a rendes keretben, és nem `newsExtra`;
  - a váró `WRITER_` csalás-vázlat is levonódik;
  - `csalas_extra_remaining: csalasExtraMaradek(publikált + váró)`;
  - az Író hívása: `['--limit', String(remaining), '--termek-extra', String(termekExtra), '--csalas-extra', String(csalasExtra)]`;
  - a `newsBlocked` csak akkor igaz, ha a csalás-hely is 0;
  - napló-sor: „+ max N csalás-hír”.
- [ ] **Step 6: Bekötés — Író:**
  - a forrás-zár után `csalasSzetvalaszt(elo, f => ({ csalas: !!vazlatMeta(f).csalas }))` (`vazlatMeta` = a vázlat `_meta`-ja, a meglévő `draftInfo` gyorsítótáras mintájára olvasva);
  - a rendes ág a `rendes` listával fut, a csalás-vázlat sosem kerül az összevonásba vagy a `valogat`-ba;
  - utána a `csalas` listából legfeljebb `args.csalasExtra` darab, a legfrissebb elöl, egyenként a `writeScamArticle(draft, brandContext, forras)`-szal: a rendes `writeArticle` userPrompt-ja + `csalasIroUtasitas`;
  - szerkezet-ellenőrzés: `csalasSzerkezetHiba(md).length === 0`, különben 1 újrapróba nyomatékkal;
  - ugyanaz az ismétlés-őr és mentés, `extraMeta = { csalas: {...}, csalas_extra: true }`;
  - `stats.csalas_irt` szám;
  - ha `args.csalasExtra === 0`, a csalás-vázlat érintetlenül vár (a 7 napos romlás a meglévő `DRAFT_MAX_AGE_DAYS`).
- [ ] **Step 7:** `node --check agents/ceo/agent.js agents/iro/agent.js`; teljes tesztsor zöld.
- [ ] **Step 8: Commit** — „CEO-keret + író: napi +1 csalás-hely, csalás-sablonos írás”.

### Task 7: Ellenőrző és fordító — a csalás-hír kapui

**Files:**
- Modify: `core/auto-check-codes.js` (+ teszt), `agents/ellenorzo/agent.js` (a 4a. auto check körül, 843–880. sor), `agents/translator/agent.js` (`SYSTEM` 99–119, `translateMarkdown` 143–210, a FAIL-kódok definíciója)

**Interfaces:**
- Consumes: `csalasSzerkezetHiba`, `peldaBlokk`, `peldaBiztonsag`, `peldaBlokkNelkul`, `forditasEgyezik` (Task 2), `vedekezesCsatornara` (Task 3), `csalasHir` (Task 1).
- Produces:
  - blokkoló kódok `SCAM_TEMPLATE_MISSING`, `SCAM_EXAMPLE_UNSAFE`;
  - `LESSON_TEXT`: SCAM_TEMPLATE_MISSING = „A scam alert must have the five sections (What's happening, Warning signs, How to protect yourself, If it already happened, What this means for you) and one example block in the exact 🧪 format with three [[n|…]] marks and three numbered explanations.”; SCAM_EXAMPLE_UNSAFE = „The example scam message may only use example.com links, 555-01xx phone numbers and no real company, brand or agency names.”;
  - `HU_NEV`: „hiányos csalás-sablon”, „nem biztonságos csalás-példa”;
  - fordító: új hibaok `SCAM_BLOCK`.
- [ ] **Step 1: Write the failing test** (`core/auto-check-codes.test.js`): mindkét kód `isBlocking`, van `lessonFor` szövegük és magyar nevük (a meglévő „minden kódnak van lecke + magyar név” őr is lefedi).
- [ ] **Step 2:** FAIL → **Step 3:** kódok felvétele → **Step 4:** PASS.
- [ ] **Step 5: Ellenőrző:** ha `csalasHir(writerData._meta)`:
  - (a) `csalasSzerkezetHiba(markdown)` → `SCAM_TEMPLATE_MISSING: …`;
  - (b) `peldaBiztonsag(peldaBlokk(markdown))` → `SCAM_EXAMPLE_UNSAFE: …`;
  - (c) a forrás-kapuk (`forrasHirJelzesek`), a truth-gate és az AI-bíró a `peldaBlokkNelkul(markdown)` szöveget kapják;
  - (d) az AI-bíró promptjához csalás-hírnél egy kiegészítés:
    - a 3 figyelmeztető jelet és a védekezési lépéseket a forrásszöveggel és a mellékelt `vedekezesCsatornara(csatorna)` listával vesse össze;
    - forrásban vagy listában nem szereplő lépés = elutasítás.
  
  Nem csalás-hírnél semmi nem változik.
- [ ] **Step 6: Fordító:**
  - a `SYSTEM` kap egy bekezdést: a `> 🧪 [sms]` sor betűre marad; a `👤` és `📌` jelölő és a `[[n|…]]` keret marad, a szöveg benne fordítandó; a domain és a telefonszám nem fordítható; a számozott 3 magyarázat fordítandó;
  - mentés előtt `if (!forditasEgyezik(parts.body, body)) return { reason: FAIL.SCAM_BLOCK, cost }` (újrapróbálható ok, mint a `TRUNCATED`).
- [ ] **Step 7:** `node --check` a két agentre; teljes tesztsor zöld.
- [ ] **Step 8: Commit** — „Ellenőrző + fordító: csalás-sablon és példablokk kapui”.

### Task 8: Build — kép a cikkben, „Scam alert” címke, /scams oldal, menü, sitemap

**Files:**
- Create: `core/csalas-oldal.js`, `core/csalas-oldal.test.js`
- Modify: `website/build.js` (`loadArticles` ~1186 és ~1212, `localizeArticle` 907–920, `articleCard` 1693, `buildArticlePage` 2184, menü 1600–1610, lábléc ~1643, oldalírás ~3834, sitemap ~3915, UI-feliratok ~559), `website/assets/style.css` (vagy ahol a cikk/kártya CSS él; a mobil fejléc CSS a web-designer agent konstansában)

**Interfaces:**
- Consumes: `peldaBlokkCsere`, `peldaBlokk` (Task 2); `BEJELENTES`, `ORSZAGFUGGETLEN` (Task 3); `CSALAS_FIGYELO_BE`, `csalasHir` (Task 1); `lapHeroHtml` (core/lap-hero.js), `hirdetesBlokk` (core/ads.js).
- Produces:
  - `CSALAS_UTMUTATOK: string[]` — a /scams-on listázott útmutató-slugok (Task 9 után véglegesítve; a 09-17-i „pasting it into an AI” csak akkor, ha a Task 9 hivatalos forrással alátámasztja).
  - `csalasOldalHtml({ hirek: {slug, title, summary, kep, datum}[], utmutatok: {slug, title}[], sz, bejelentes, hirdetes, fejlec }) -> string`.
  - Feliratok (`sc*` kulcsok, en/hu/es):
    - scNav: „🛡️ Scams / 🛡️ Csalások / 🛡️ Estafas”;
    - scTitle: „Scam alerts” / „Csalás-figyelő” / „Alertas de estafas”;
    - scBadge: „Scam alert” / „Csalásriasztás” / „Alerta de estafa”;
    - scLatest, scSigns, scReport, scEmpty, scMore — mindhárom nyelven, angol szó nélkül a nem angol oldalon.
- [ ] **Step 1: Write the failing tests** (`core/csalas-oldal.test.js`):
  - 0 hírrel is van útmutató-szakasz és bejelentő doboz, `scEmpty` szöveggel;
  - 2 hírnél a legújabb van elöl;
  - a kimenetben pontosan 1 `<h1` (a fejlécből) és pontosan 1 hirdetés-hely;
  - a bejelentő dobozban az ic3.gov és a reportfraud.ftc.gov link, plusz az országfüggetlen mondat.
- [ ] **Step 2:** FAIL → **Step 3:** `core/csalas-oldal.js` → **Step 4:** PASS.
- [ ] **Step 5: build.js:**
  - `a.csalas = !!data._meta?.csalas`;
  - a cikk-markdownban a `marked.parse` ELŐTT `peldaBlokkCsere(body, { kepUt: létezik(website/assets/images/csalas/<slug>-<lang>.jpg) ? '/assets/images/csalas/<slug>-<lang>.jpg' : '', alt: <a cikk nyelvén: a csalás + „example of a scam message, not real”> })` (en: ~1186; hu/es: `localizeArticle`);
  - `articleCard` és `buildArticlePage`: csalás-hírnél `<span class="tag tag--scam">🛡️ ${tr('scBadge')}</span>`, és a cikk végén link a /scams-ra;
  - ha `CSALAS_FIGYELO_BE`:
    - menüpont a 🔥 Felkapott után, lábléc-link;
    - `scams.html` minden nyelvre a `buildTrendingPage` mintájára (papírlapos fejléc: a legutóbbi csalás 4x5 képe a „lap”; ha nincs, a bejelentő lista; `noIntro`, `pagePath: 'scams.html'`);
    - sitemap-sor `${lp}/scams`;
  - kikapcsolva ezek egyike sem jelenik meg.
- [ ] **Step 6: Build-próba** scratchpad-másolatban:
  1. két menetben (`CSALAS_FIGYELO_BE` false, majd a másolatban `true`), egy kézzel összerakott csalás-cikkel (a Task 2 mintájából, en+hu+es fordítással, a Task 4 CLI képeivel);
  2. utána `node website/build.js && node core/output-guard.js` a másolatban.
  
  Elvárt:
  - mindkét menet zöld;
  - kikapcsolva nincs `scams.html`, és a menüben nincs „Scams”;
  - bekapcsolva a /scams és a cikk: 1 H1, 1 hirdetés, a hu/es oldalon nincs angol mondat (`node website/check-i18n.js`).
- [ ] **Step 7: Commit** — „Build: csalás-kép a cikkben, Scam alert címke, /scams oldal (kapcsoló mögött)”.

### Task 9: A régi csalásos útmutatók átnézése (en/hu/es)

**Files:**
- Modify: `content/articles/ARTICLE_GUIDE_{how-to-spot-ai-scams-deepfakes-and-fake-content, how-to-spot-a-deepfake-video-or-voice-clone-before-you-share-it, how-to-spot-a-phishing-email-or-scam-text-before-you-click, how-to-spot-an-ai-scam-call-fake-email-or-deepfake-voice-today, how-to-check-if-a-suspicious-message-is-a-scam-by-pasting-it-into-an-a*, how-to-fact-check-a-suspicious-text-or-link-before-forwarding-it}.json` + a `content/translations/` párjuk (a valódi fájlnév a `_meta.slug` alapján keresendő)

- [ ] **Step 1:** Minden útmutatót vess össze hivatalos fogyasztóvédelmi forrással:
  - FTC consumer advice (Chrome-mal), FBI IC3, CISA, és ahol egy eszköz szerepel, annak hivatalos súgója;
  - a kitalált részlet (képernyő-szöveg, felület, statisztika, ár) kikerül vagy helyesre cserélődik;
  - az URL és a `_meta.slug` marad;
  - a `_meta.official_sources` lista és a `fact_human_ok` bekerül.
- [ ] **Step 2:** Ugyanez a hu/es fordításban kézzel (a fordítás-gyorsítótár nem fordít újra).
- [ ] **Step 3:** A „pasting it into an AI” útmutató alapötletét vesd össze a hivatalos forrásokkal:
  - ha nem támasztják alá, kerüljön bele a hivatalos óvatosság (pl. ne másolj be személyes adatot), és maradjon ki a `CSALAS_UTMUTATOK`-ból;
  - levétel vagy 301 csak user-döntéssel (jelentsd).
- [ ] **Step 4:** `node core/run-tests.js` zöld (ismert tévedések, ár-tilalom, korpusz); build-próba + output-guard a másolatban.
- [ ] **Step 5: Commit** — „6 csalásos útmutató átnézve hivatalos forrásból (en/hu/es)” + a `CSALAS_UTMUTATOK` véglegesítése.

### Task 10: Napi Telegram-sor

**Files:**
- Modify: `core/report-lines.js` (+ teszt), `core/daily-report.js` (a 517. sor környéki sorlista)

**Interfaces:**
- Consumes: `memory/csalas-guard.json` (Task 5/4), a ma publikált `_meta.csalas` cikkek.
- Produces: `csalasLine(guard, maiCsalasCimek: string[], now) -> string`.
  - Kikapcsolva: `'🛡️ Csalás-figyelő: kikapcsolva'`.
  - 24 óránál régebbi `at` vagy hiányzó fájl: `'🛡️ Csalás-figyelő: ⚠️ NEM FUTOTT'`.
  - Különben: `'🛡️ Csalás-figyelő: N új tétel · K csalás · M megírva'`, alatta legfeljebb 3 „eldobva: <cím> — <ok>” sor, és ha van, `🖼️ képhiba: N`.
- [ ] **Step 1: Write the failing tests** a négy esetre (kikapcsolva / nem futott / normál / képhibával). **Step 2:** FAIL. **Step 3:** implementálás + bekötés a daily-reportba. **Step 4:** PASS, teljes sor zöld.
- [ ] **Step 5: Commit** — „Telegram: 🛡️ csalás-figyelő sor”.

### Task 11: Előnézet a usernek → élesítés

- [ ] **Step 1:** Scratchpad-másolatban `CSALAS_FIGYELO_BE = true`, egy valódi, friss FBI/Google-tételből készült próba-csalás-cikk. Ez a valódi író-ágon készül a másolatban (`node agents/iro/agent.js --file <vázlat> --csalas-extra 1`, ~$0,02), majd fordítás, képek és build.
- [ ] **Step 2:** Helyi szerver; Chrome: a cikk és a /scams oldal en/hu/es, asztali és 390 px mobil-iframe, sötét mód. Ellenőrizni kell:
  - a menü mobilon nem törik két sorba;
  - a képen nincs valódi név;
  - 1 hirdetés van.
  
  Képernyőképek a usernek.
- [ ] **Step 3:** User-jóváhagyás után: `CSALAS_FIGYELO_BE = true` + a Task 1 őr-sorának átírása, teljes tesztsor, commit, push. A teendőlistába: a következő CI-futás ellenőrzése (🛡️ sor, csalás-vázlat, kép), és a mérés ~4 hét múlva (spec 8.8).
