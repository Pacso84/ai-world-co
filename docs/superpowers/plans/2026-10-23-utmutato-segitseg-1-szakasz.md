# Útmutató-segítség 1. szakasz (A+B+C+F) — végrehajtási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cél, hogy minden útmutató-oldalon:
- a `[helykitöltős]` promptok kitölthetők legyenek;
- a Másolás után „Bevált? 👍 👎” jelzés kérdezzen, amelyet a Worker számol, és a napi riport mutat;
- a ✅ siker-doboz közvetlenül a prompt után álljon;
- a lépések után továbbvezető sor mutasson a varázslóra és a Promptépítőre.

**Architecture:**
- Két tiszta `core/` modul: `kitoltheto-prompt.js` (HTML-átalakítás + kill-switch) és `bevalt-jelzes.js` (riport-sor).
- Egy Worker-modul: `telegram-worker/src/bevalt-szamlalo.js` (POST `/fbp-hit` + export `__fbp`).
- A `website/build.js` és a `website/assets/app.js` csak bekötést kap.
- A szöveg nem változik, csak a megjelenés.

**Tech Stack:** Node 24 ESM, Cloudflare Worker (KV `FEEDBACK`), vanilla JS a böngészőben, `node:assert` tesztek (`node core/run-tests.js`).

**Spec:** `docs/superpowers/specs/2026-10-23-utmutato-segitseg-csomag-design.md` (A, B, C, F rész).

## Global Constraints

- **Futtatás:**
  - helyben SOHA ne futtasd: `website/build.js`, `core/daily-report.js`, `agents/*`, `npm run router-smoke`;
  - a módosított fájlokat `node --check <fájl>` ellenőrzi;
  - tesztek: `node core/run-tests.js > <scratchpad>/teszt.txt 2>&1`, csak fájlba, SOHA csővezetékbe.
- **Sorvégek:** a `website/assets/style.css` CRLF, ezt megtartjuk; a többi fájl sorvégét is megőrizzük.
- **Szöveg és nyelv:**
  - minden új felirat 3 nyelven (en/hu/es), a hu/es oldalon nincs angol szöveg;
  - a feliratok a build.js meglévő `tr()` szótárába kerülnek (en ~301., hu ~322., es ~340. sor);
  - a promptok szövege nem változik; a régi útmutatók markdownjához nem nyúlunk.
- **Adatvédelem:** csak számláló, azt nem tároljuk, ki szavazott. Az adatvédelmi oldal 👍/👎 kártyája egy mondattal bővül.
- **Worker:**
  - deploy kézzel (`npx wrangler deploy` a `telegram-worker/`-ben);
  - a `workers_dev = false` és a `preview_urls = false` a wrangler.toml-ban maradjon kiírva;
  - CORS: csak `https://aiworldhq.com`.
- **Oldal:** oldalanként egy hirdetés (nem változik); mobilon (390 px) nincs vízszintes görgetés.
- **Nyilvánosság:** a repó publikus — kulcs, név vagy azonosító nem kerülhet bele.

## Review Focus

1. **A prompt helykitöltő nélkül:** ma 369-ből ~329 ilyen. A doboz pontosan a mostani marad, mező nélkül, és a Másolás ugyanazt a szöveget adja, mint eddig. → Task 1 teszt: `kitolthetoHtml('Summarize this.')` változatlan.
2. **Álhelykitöltő:** `[REDACTED]`, `[=====>]`, `[1200, 350, 80]`, 50 karakternél hosszabb. Ezekből nem lehet mező, szöveg marad. → Task 1 tesztek.
3. **Üresen hagyott mező:** a Másolás az eredeti `[helykitöltő]`-t adja, nem üres lyukat. → Task 2: a másoló-logika tiszta függvénye (`kitoltottSzoveg`) tesztelve.
4. **Szemét a Worker felé:** rossz slug, rossz szavazat, GET-kérés, áradat. 400/405/429 a válasz, és a KV-be nem kerül szemét. → Task 3 tesztek.
5. **Elérhetetlen vagy hibás export:** a riport külön mondatot ír („nem sikerült lekérdezni”), és nem mutat 0-t. → Task 4 teszt.

---

### Task 1: Kitölthető prompt — tiszta modul + kill-switch

**Files:**
- Create: `core/kitoltheto-prompt.js`
- Test: `core/kitoltheto-prompt.test.js`

**Interfaces:**
- Produces:
  - `export const KITOLTHETO_BE = true`
  - `export function igaziHelykitolto(belso: string): boolean`: a zárójelek NÉLKÜLI tartalmat kapja.
  - `export function kitolthetoHtml(escapedSzoveg: string, be = KITOLTHETO_BE): string`: a már escape-elt dobozszövegben minden igazi `[x]`-et erre cserél: `<input class="g-fill" type="text" placeholder="x" aria-label="x" size="N" data-h="x">`, ahol N = max(6, x.length).
  - `export function kitoltottSzoveg(sablon: string, ertekek: string[]): string`: a sablon igazi `[x]` darabjait sorban az értékekre cseréli; üres vagy szóköz értéknél `[x]` marad.

- [ ] **Step 1: Write the failing test** (`core/kitoltheto-prompt.test.js`, a `core/affiliate.test.js` stílusában, `node:assert/strict`):

```js
// változatlan, ha nincs helykitöltő
assert.equal(kitolthetoHtml('Summarize this file.'), 'Summarize this file.');
// igazi helykitöltő → mező
const h = kitolthetoHtml('Write to [name] about [topic].');
assert.equal((h.match(/<input class="g-fill"/g) || []).length, 2);
assert.match(h, /placeholder="name"/);
// álhelykitöltők szövegként maradnak
for (const x of ['REDACTED', '===============================>', '1200, 350, 80, 45', 'x'.repeat(51), 'A', ''])
  assert.equal(igaziHelykitolto(x), false, x);
for (const x of ['meeting name', 'paste job ad here', 'oszlop neve', 'nombre'])
  assert.equal(igaziHelykitolto(x), true, x);
// markdown-link nem helykitöltő
assert.equal(kitolthetoHtml('see [docs](https://x.example)'), 'see [docs](https://x.example)');
// kill-switch
assert.equal(kitolthetoHtml('Hi [name]', false), 'Hi [name]');
// másolás: üres mező → eredeti helykitöltő marad
assert.equal(kitoltottSzoveg('Hi [name], re [topic].', ['Ann', '  ']), 'Hi Ann, re [topic].');
assert.equal(kitoltottSzoveg('No fields.', []), 'No fields.');
// HTML-befecskendezés: a placeholder escape-elt marad (a bemenet már escape-elt szöveg)
assert.ok(!kitolthetoHtml('[a&quot;b]').includes('"b"'));
```

- [ ] **Step 2: Run** `node core/kitoltheto-prompt.test.js`. Expected: FAIL (a modul nem létezik).
- [ ] **Step 3: Implement** `core/kitoltheto-prompt.js`. `igaziHelykitolto` szabályai: 2–50 karakter; tartalmaz betűt (`\p{L}`); NEM csupa nagybetűs egyetlen szó, ha az a `REDACTED|PII|NAME \d` stoplistán van (pontosan: `/^(REDACTED|PII)$/i`); nem tartalmaz `=`, `>` vagy `<` jelet; nem számlista (`/^[\d\s,.\-%$]+$/`). A link-kizárás a `(?!\()` lookahead a minta után. A fájl fejléc-kommentje magyar, a `core/` többi moduljának stílusában (MIÉRT + dátum + user-idézet).
- [ ] **Step 4: Run** `node core/kitoltheto-prompt.test.js`. Expected: kilép 0-val.
- [ ] **Step 5: Commit:** `git add core/kitoltheto-prompt.js core/kitoltheto-prompt.test.js && git commit -m "feat(utmutato): kitölthető prompt modul + kill-switch"`

### Task 2: Bekötés az útmutató-oldalba (B + A + F + a „Bevált?” gomb HTML-je)

**Files:**
- Modify:
  - `website/build.js`
    - `guideSectionHtml` (~2434–2456): mindkét `isPrompt` ágban a `content` / `txt` → `kitolthetoHtml(...)`;
    - `masolGomb` (~2362): a gomb után a rejtett szavazó;
    - `buildGuidePage` (~2489–2490): a `g-ok` a `g-diff` ELÉ;
    - `buildGuidePage` (~2610): a `<div class="g-steps">` UTÁN a továbbvezető sor;
    - `tr()` szótár: új kulcsok;
    - `privFbP`: plusz egy mondat.
  - `website/assets/app.js` (~256–285, a „Másolás” blokk)
  - `website/assets/style.css` (a `.g-copy` szabályok után, ~1004)
- Test: `core/kitoltheto-prompt.test.js` (bekötés-őr: a forrásfájlok szövegét olvassa, ahogy a `core/ingyenes-eszkozok.test.js` teszi)

**Interfaces:**
- Consumes: `kitolthetoHtml`, `kitoltottSzoveg` (Task 1)
- Produces:
  - **HTML-szerződés:** `<span class="g-vote" hidden data-thanks="…">…<button class="g-vote__btn" data-v="up">👍</button><button class="g-vote__btn" data-v="down">👎</button></span>` a `.g-copy` gomb után;
  - **továbbvezető sor:** `<nav class="g-tovabb">` két linkkel: `../wizard` és `../prompt-builder`;
  - a Task 3 ezt a végpontot hívja: `POST https://api.aiworldhq.com/fbp-hit {slug, lang, v}`.

**Új `tr()` kulcsok (pontos szöveg):**

| kulcs | en | hu | es |
|---|---|---|---|
| `voteQ` | `Worked?` | `Bevált?` | `¿Te funcionó?` |
| `voteThanks` | `Thanks! 💛` | `Köszönjük! 💛` | `¡Gracias! 💛` |
| `fillHint` | `Type your own details into the dashed boxes, then copy.` | `A szaggatott keretes mezőkbe írd a saját adataidat, aztán másold ki.` | `Escribe tus datos en los recuadros punteados y luego copia.` |
| `tovWiz` | `Using a different AI? <b>Find the right one for you</b>` | `Nem ezt az MI-t használod? <b>Melyik való neked?</b>` | `¿Usas otra IA? <b>Encuentra la tuya</b>` |
| `tovPb` | `Want your own prompt? <b>Prompt Builder</b>` | `Saját promptot raknál össze? <b>Promptépítő</b>` | `¿Quieres tu propio prompt? <b>Creador de prompts</b>` |

**`privFbP` kiegészítés** (a meglévő mondat után):
- en: ` The “Worked?” button under prompts works the same way.`
- hu: ` A promptok alatti „Bevált?” gomb ugyanígy működik.`
- es: ` El botón «¿Te funcionó?» bajo los prompts funciona igual.`

- [ ] **Step 1: Write the failing wiring test** (a `core/kitoltheto-prompt.test.js` végére):

```js
const build = readFileSync(join(ROOT, 'website/build.js'), 'utf8');
const app = readFileSync(join(ROOT, 'website/assets/app.js'), 'utf8');
assert.match(build, /import \{[^}]*kitolthetoHtml[^}]*\} from '\.\.\/core\/kitoltheto-prompt\.js'/);
assert.equal((build.match(/kitolthetoHtml\(/g) || []).length, 2, 'mindkét prompt-ágban kell');
assert.match(build, /class="g-vote" hidden/);
assert.match(build, /class="g-tovabb"/);
assert.ok(build.indexOf("reszek.siker ?") < build.indexOf("reszek.maskepp ?"), 'a ✅ a 🔄 elé kerüljön');
for (const k of ['voteQ', 'voteThanks', 'fillHint', 'tovWiz', 'tovPb']) assert.equal((build.match(new RegExp(k + ':', 'g')) || []).length, 3, k + ' mindhárom nyelven');
assert.match(app, /fbp-hit/); assert.match(app, /\.g-fill/); assert.match(app, /g-vote/);
// a böngészős másoló ugyanazt a szabályt használja, mint a tesztelt kitoltottSzoveg
assert.match(app, /kitoltottSzoveg|\[\$\{|data-h/);
```

- [ ] **Step 2: Run** `node core/kitoltheto-prompt.test.js`. Expected: FAIL az első bekötés-assertnél.

- [ ] **Step 3: build.js módosítás**
  - a) Import a többi `core/` import mellé.
  - b) Mindkét prompt-ágban: `kitolthetoHtml(content)` / `kitolthetoHtml(txt)`. A mező csak `isPrompt` dobozban legyen; a „Példa” dobozban nem.
  - c) Ha a doboz kapott mezőt (`includes('g-fill')`), a címke utáni `<span class="g-fill__tip">` kiírja a `tr('fillHint')`-et.
  - d) `masolGomb(isPrompt)`: a gomb után a `g-vote` span. Szövege `tr('voteQ')`, `data-thanks` = `tr('voteThanks')`, escape-elve.
  - e) `buildGuidePage`: a két sor sorrendcseréje, és a lépések után:
    ```
    <nav class="g-tovabb"><a href="../wizard">🧭 ${tr('tovWiz')}</a><a href="../${ESZKOZ_UTAK.pb}">🧩 ${tr('tovPb')}</a></nav>
    ```
    A `tr` értéke `<b>`-t tartalmaz, de saját, megbízható szöveg, ezért nem escape-eljük; ezt egy komment jelzi.
  - f) Az új `tr` kulcsok és a `privFbP` kiegészítés.
  - g) `node --check website/build.js`

- [ ] **Step 4: app.js módosítás.** A „Másolás” blokkban, a `clone` helyett: ha a dobozban van `.g-fill`, a szöveget a `kitoltottSzoveg` böngészős másolata adja.
  - **Másolat:** a függvény ~6 sor, és egy komment mondja ki, hogy a `core/kitoltheto-prompt.js`-sel azonos szabály. A sablon a doboz szövege, ahol minden mező helyére `[data-h]` kerül.
  - **Siker után:** a `kesz()` levenni a `hidden`-t a `.g-prompt` saját `.g-vote`-járól, de csak ha a localStorage-ban nincs `fbp:<slug>`.
  - **Új kattintás-figyelő a `.g-vote__btn`-re:**
    - a slug a `.fb[data-slug]`-ból, a nyelv ugyanúgy, mint a 👍/👎 blokkban (~216. sor);
    - `fetch('https://api.aiworldhq.com/fbp-hit', {method:'POST', headers JSON, body {slug, lang, v}})`, a hiba néma;
    - `lsSet('fbp:'+slug, v)`;
    - az OLDAL összes `.g-vote` eleme a `data-thanks` szövegre vált.
  - `node --check website/assets/app.js`

- [ ] **Step 5: style.css (CRLF!), új szabályok a `.g-copy` blokk után:**
  - `.g-fill`: inline mező, 1.5px szaggatott `var(--gc,var(--accent))` keret, radius 8px, `var(--card)` háttér; fókuszban és kitöltve folytonos keret + 10%-os `--gc` árnyalat.
  - `.g-prompt__box`: `line-height:2.1`, ha mezőt tartalmaz (`:has(.g-fill)`).
  - `.g-fill__tip`: 13px, `var(--ink-soft)`.
  - `.g-vote`: inline-flex, gap 6px, margin-left 10px; **`.g-vote[hidden]{display:none}`**.
  - `.g-vote__btn`: kerek, 1px `var(--line)` keret.
  - `.g-step__body .g-prompt ~ .g-ok`: felül egy kis ↓ jelző `::before`-ral, középre igazítva, `var(--muted)`. Ez a „prompt → eredmény” lánc.
  - `.g-tovabb`: 2 oszlopos rács, 1px `var(--line)` hézag-háttér, radius 16px, a linkek `var(--card)` háttérrel, 14px; ≤560px-en egy oszlop.

  Az előnézetben (`hx-` osztályok) jóváhagyott megjelenést kövesd.

- [ ] **Step 6: Run** `node core/kitoltheto-prompt.test.js`, majd a teljes tesztsor fájlba: `node core/run-tests.js > $SCRATCH/teszt.txt 2>&1`, utána a `teszt.txt` végét kell elolvasni. Expected: 0 hibás fájl. Különösen figyelni kell a `sablon-nyelv.test.js`, a `ket-sablon` paritás-őr és a `kimenet-or` tesztekre.
- [ ] **Step 7: Commit:** `git commit -m "feat(utmutato): kitölthető prompt, Bevált?-gomb, ✅ a prompt után, továbbvezető sor"`

### Task 3: Worker — `/fbp-hit` számláló + `__fbp` export

**Files:**
- Create: `telegram-worker/src/bevalt-szamlalo.js`
- Modify: `telegram-worker/src/worker.js` (import a 45. sor mellé; útvonal a 110. sor mellé; `out.__fbp` a 95. sor mellé)
- Test: `telegram-worker/test/fbp-hit.test.js` (a `pdf-dl.test.js` hamis KV-mintájával)

**Interfaces:**
- Produces:
  - `export const NAPI_PLAFON = 300`: kulcsonként és naponta.
  - `export async function handleFbpHit(request, env, now = Date.now()): Response`:
    - POST `{slug, lang, v}`;
    - slug `/^[a-z0-9-]{3,80}$/`, lang ∈ en/hu/es, v ∈ up/down, különben 400; nem POST → 405; OPTIONS → 204 CORS-szal;
    - kulcs `fbp:<UTC-nap>:<slug>:<v>`, egész számláló, `expirationTtl` 400 nap;
    - plafon felett 429;
    - minden válaszon `Access-Control-Allow-Origin: https://aiworldhq.com`.
  - `export async function fbpExport(env, now = Date.now(), napok = 14)`: `{ 'YYYY-MM-DD': { slug: { up, down } } }`, hibánál `{ error: true }`.

- [ ] **Step 1: Write the failing test**, ezekkel az esetekkel:
  - 3 érvényes `up` → `fbp:2026-10-08:my-guide:up` = '3', és a TTL > 300 nap;
  - rossz bemenetek: `slug:'../x'`, `slug:'A'`, `v:'maybe'`, `lang:'de'`, GET → 400/405, és `kv.tar.size === 0`;
  - plafon → 429;
  - OPTIONS → 204, a CORS-fejléc értéke `https://aiworldhq.com`;
  - az export csak az utolsó 14 nap kulcsait adja;
  - a dobó KV mellett az export `{error:true}`.
- [ ] **Step 2: Run** `node telegram-worker/test/fbp-hit.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** a modult a `forras-szamlalo.js` mintájára (fejléc-komment: MIÉRT, 10-23, user-idézet), és kösd be a `worker.js`-be.
- [ ] **Step 4: Run** a Worker-tesztet, aztán a teljes `core/run-tests.js`-t fájlba. Expected: 0 hiba.
- [ ] **Step 5: Commit:** `git commit -m "feat(worker): /fbp-hit Bevált?-számláló + __fbp export"`
- [ ] **Step 6: Deploy** (kézzel, a push ELŐTT, hogy a gomb élesedésekor a végpont már éljen):
  1. `cd telegram-worker && npx wrangler deploy`.
  2. Ellenőrzés: `curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"slug":"x","lang":"en","v":"up"}' https://api.aiworldhq.com/fbp-hit` → 400, mert a slug túl rövid. Ezzel nem kerül szemét a KV-be.
  3. `curl https://api.aiworldhq.com/` → „OK”.
  4. A wrangler.toml-ban továbbra is `workers_dev = false`.

### Task 4: Napi riport-sor

**Files:**
- Create: `core/bevalt-jelzes.js`
- Modify: `core/daily-report.js` (~989., a `partnerKattintasSor` sor elé)
- Test: `core/bevalt-jelzes.test.js`

**Interfaces:**
- Consumes: `__fbp` (Task 3 formátum)
- Produces: `export function bevaltSor(fbp, now = Date.now()): string`
  - `null` / nem objektum → `''`;
  - `{error:true}` → `'👍 Bevált-jelzés: a számlálót nem sikerült lekérdezni.'`;
  - 7 napon át 0 → `''`;
  - egyébként `` `👍 Bevált? tegnap: ${tu}👍 ${td}👎 · 7 nap: ${hu}👍 ${hd}👎` ``;
  - ha valamelyik slug 7 nap alatt legalább 3 👎-t kapott, utótag: `` ` · ⚠️ sok 👎: ${slug} (${db})` `` (a legrosszabb 3, vesszővel).

- [ ] **Step 1: Write the failing test** (rögzített `NOW = Date.parse('2026-10-24T08:00:00Z')`):
  - csend 0-nál;
  - hibás export mondata;
  - tegnap = 2026-10-23;
  - 8 napnál régebbi nem számít;
  - a ⚠️ utótag 3 👎-nél megjelenik, 2-nél nem.
- [ ] **Step 2: Run** `node core/bevalt-jelzes.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement**, és a `daily-report.js`-ben: `const bevalt = bevaltSor(exp.__fbp); if (bevalt) lines.push(bevalt);`. Utána `node --check core/daily-report.js`.
- [ ] **Step 4: Run** a teljes tesztsort fájlba. Expected: 0 hiba.
- [ ] **Step 5: Commit:** `git commit -m "feat(riport): Bevált?-jelzés sor a napi Telegram-riportban"`

### Task 5: Előnézet a usernek → élesítés

**Files:**
- Create: `<scratchpad>/utmutato-elonezet.mjs`. Nem a repó része.

- [ ] **Step 1: Előnézet-szkript**
  1. Letölti az élő `https://aiworldhq.com/hu/article/how-to-analyse-files-and-spreadsheets-with-chatgpt` oldalt, plusz egy olyan útmutatót, amelynek promptjában `[helykitöltő]` van (a 40 közül egy magyarat).
  2. A meglévő `g-prompt__box` tartalmakra lefuttatja a `kitolthetoHtml`-t, hozzáteszi a `g-vote` spant, a továbbvezető sort és a repó friss `style.css` + `app.js` fájlját.
  3. Kiírja a `fxprev/site/hu/` alá.
  4. Kiszolgálás a már futó 8765-ös helyi szerverről; a mobilnézet iframe-ben, 390 px-en.
- [ ] **Step 2: Ellenőrzés Chrome-ban:**
  - a mező kitölthető;
  - a Másolás a kitöltött szöveget adja; üres mezőnél a `[x]` marad;
  - a „Bevált?” csak a Másolás után látszik;
  - 390 px-en nincs vízszintes görgetés;
  - nincs angol szöveg a hu oldalon.

  Képernyőkép a usernek.
- [ ] **Step 3: User-jóváhagyás** az előnézetre (a jóváhagyás-kapu marad).
- [ ] **Step 4: Push:** `git pull --rebase && git push`. A CI építi és élesíti; a futás közbeni memory-commitok miatt a rebase szükséges.
- [ ] **Step 5: Élő ellenőrzés a deploy után:**
  - az élő hu útmutatón van `g-fill`, `g-vote` és `g-tovabb`;
  - az export válaszában megjelenik a `__fbp` kulcs (üres objektum is jó);
  - saját teszt-szavazatot NEM adunk le, hogy ne torzítsa a mérést.

  A user megkapja: HOL, MI, HOGYAN néz ki, MIKOR élesedett.
