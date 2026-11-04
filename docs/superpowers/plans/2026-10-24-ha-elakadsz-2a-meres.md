# „🔧 Ha elakadsz” — 2a. szakasz: index + generátor + mérés 3 útmutatón

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** a doboz gépi elkészítése hivatalos súgócikkekből, ellenőrzéssel. Mérés 3 valódi útmutatón (költség + minőség) → a usernek bemutatni. A CI-bekötés, a fordítás és a honlapon megjelenítés a **2b**-ben jön, a user jóváhagyása után.

**Spec:** `docs/superpowers/specs/2026-10-23-utmutato-segitseg-csomag-design.md` (D rész).

**Architecture:**
- `core/sugo-index.js`:
  - engedélylista;
  - eszköz → szolgáltató;
  - tiszta sitemap- és link-elemzők;
  - letöltő.
- `core/elakadas.js` (tiszta, AI és hálózat nélkül):
  - jelölt-választás;
  - prompt;
  - válasz-ellenőrzés;
  - forrás-alátámasztás;
  - kill-switch.
- `core/elakadas-meres.mjs`: CLI. Helyben futtatja a mérést közvetlen OpenRouter-hívással (`usage.include`), hogy a router állapotfájljait ne írja. Az eredményt a scratchpadba írja.

## Global Constraints

- **Források:** csak az engedélylistán lévő URL-előtagok (spec D):
  - `help.openai.com/`
  - `support.claude.com/`, `support.anthropic.com/`
  - `support.google.com/gemini/`, `support.google.com/notebooklm/`, `support.google.com/photos/`
  - `support.microsoft.com/`
  - `support.apple.com/`
  - `help.mistral.ai/`
  - `www.amazon.com/gp/help/`
- **Tartalom:**
  - kitalált hibaelhárítás TILOS: minden tétel forrás-URL-je a megadott cikkek közül való legyen;
  - a tétel mondatainak legalább 60%-a átmegy a `forrasAlatamasztja` vizsgálaton;
  - 2-nél kevesebb tétel esetén nincs doboz.
  - angolul készül; a fordítás a 2b-ben jön.
- **Futtatás és költség:**
  - a tesztek ingyenesek és hálózat nélküliek; fizetős hívás csak a mérő CLI-ben;
  - helyben nem fut agents/, build.js, daily-report.js; a `core/ai-router.js`-t a mérés nem hívja (állapotfájlt írna);
  - a modell: `anthropic/claude-haiku-5.5` (config agents.guide.primary_model).
- **Licenc és nyilvánosság:** a súgócikkek szövegét nem tároljuk a repóban, csak URL-t és címet.

## Tasks

### Task 1: `core/sugo-index.js` + teszt

**Produces:**
- `ENGEDELY: string[]`
- `engedelyezett(url): boolean`
- `szolgaltatok(tool, company): string[]`: ChatGPT → ['openai']; Claude → ['claude']; Gemini/NotebookLM/Google Photos → ['gemini'|'notebooklm'|'photos']; Copilot/Microsoft 365 Copilot → ['microsoft']; Apple Intelligence/Image Playground → ['apple']; Alexa+ → ['amazon']; Le Chat/Mistral → ['mistral']; eszköz nélkül → ['openai','gemini','claude']; más → [].
- `sitemapCikkek(xml, minta: RegExp): {url, cim}[]`: a cím a slugból („8983675-why-does-chatgpt-stop” → „Why does chatgpt stop”).
- `linkCikkek(html, alap, minta): {url, cim}[]`: a cím a link szövegéből, egyedi URL-ek.
- `async indexLetolt(szolg, fetchFn): {url, cim}[]`: szolgáltatónkénti forrás (lent).

**Szolgáltatónkénti forrás** (élőben ellenőrizve 10-24):

| szolgáltató | forrás |
|---|---|
| claude | support.claude.com/sitemap.xml `/en/articles/` (364) |
| mistral | help.mistral.ai/sitemap.xml `/en/articles/` (43) |
| openai | a help.openai.com/en/collections/3742473-chatgpt (és a többi collection) linkjei `/en/articles/\d+` (197) |
| gemini | support.google.com/gemini/?hl=en `/gemini/answer/\d+` (102) |
| notebooklm, photos | ugyanígy, a saját súgójuk főoldaláról |
| microsoft | a Copilot súgó-gyűjtőoldal linkjei (support.microsoft.com/en-us/copilot) |
| apple | support.apple.com/guide/iphone/… Apple Intelligence-oldalak linkjei |
| amazon | az Alexa+ súgó-csomópont linkjei |

Ha egy forrás nem tölthető le, üres listát ad, hibát nem dob.

**Tesztek** (`core/sugo-index.test.js`, beágyazott minta-XML és -HTML):
- engedély igen/nem (például `https://help.openai.com.evil.example/` → nem);
- szolgáltató-leképezés;
- slug → cím;
- a link-elemző duplikátumot és külső linket nem ad.

### Task 2: `core/elakadas.js` + teszt

**Produces:**
- `ELAKADAS_BE = true`
- `jeloltCikkek(utm: {cim, eszkoz, lepesek: string[], hibak: string}, index, n = 4)`: kulcsszó-pontozás (stopszavak nélkül, az eszköz neve kisebb súllyal), a legjobb n, 0 pontos nem.
- `promptEpit(utm, cikkek: {url, cim, szoveg}[]): {rendszer, felhasznalo}`: SZIGORÚ JSON-kimenet `{items:[{symptom, why, fix, prompt?, source}]}`.
  - csak a megadott cikkekből;
  - 2–4 tétel;
  - a tünet a felhasználó szavaival;
  - ne ismételje a „Common mistakes”-et;
  - ha nincs releváns: `{"items":[]}`;
  - eszköz nélküli útmutatónál a tétel nevezze meg az eszközt („In ChatGPT: …”).
- `valaszErtelmez(szoveg, cikkek): items[]`:
  - JSON kibontása (a ```json burkot is);
  - mezők és hosszak ellenőrzése;
  - a `source` a cikkek URL-je és engedélyezett.
- `alatamasztott(item, forrasSzoveg): boolean`: a `why` + `fix` mondataiból `forrasAlatamasztja(szoveg, '', forras)`, és az arány legalább 0,6.
- `ismetliHibat(item, hibak): boolean`: a tünet tartalomszavainak legalább 60%-a megvan a „Common mistakes”-ben.
- `dobozKeszit(items, forrasok, hibak): {items} | null`: szűrés; 2-nél kevesebb tétel → null.

**Tesztek:**
- a jelölt-pontozás a releváns cikket teszi előre;
- a kitalált URL-es tétel kiesik;
- a forrás nélküli állítás kiesik;
- 1 tétel → null;
- a ```json burok kibontása;
- kill-switch.

### Task 3: mérő CLI + futtatás 3 útmutatón

`core/elakadas-meres.mjs <slug>...`:
1. index letöltése (a szükséges szolgáltatóké);
2. jelöltek;
3. a cikkek letöltése (`forrasSzoveg`, 6000 karakter/cikk);
4. OpenRouter-hívás (`usage.include`);
5. `dobozKeszit`;
6. kiírás a scratchpadba (`elakadas-meres.json`) + költség.

**A 3 útmutató:**
- `how-to-analyse-files-and-spreadsheets-with-chatgpt` (ChatGPT);
- egy Alexa+ útmutató;
- egy eszköz nélküli útmutató.

**Utána:** előnézet (a jóváhagyott hx-dizájnnal, az elakad-gen.mjs mintájára, adatból) + mérési jegyzőkönyv a usernek.
