# Kereső-cím csiszoló (adatvezérelt SEO-javítás) — design (2026-11-25)

## 0. ⚠️ BŐVÍTÉS (user 11-25 este — ez az ELSŐDLEGES, a lenti 1–8. a 4. rész)
User: „jó lenne optimalizálni az összes mindent amit írtunk! azért volt a seo agent! nem azért hogy tippeket adjon!” →
a bővített tervre: „oké csináld!”. Az SEO-agent munkája július óta nem jutott ki (`meta_description` ↔ build
`seo.description`); a 924 élő cikk mindegyikéhez van leírás (814 jó hosszú, 1 áras, 11 összehasonlító szavas, 4 sablonos);
644 cím > 60 karakter, ebből 402-nél a `<title>` csonkolt.

**Részek (egyszerre 1):**
1. **Bekötés + kapuk + új SEO-agent + őrök (kapcsoló KI)** → 10 minta a user elé.
   - `core/seo-kapuk.js`: a 6.5 kapui KÖZÖS modulban (a 4. rész is ezt használja) + „with our guide”-sablon tiltás.
   - SEO-agent v2: a TELJES cikkből (cím, alcím, In short, H2-k, első ~2500 kar.) `seo_title` (25–60) + `meta_description`
     (120–158) — tippek NINCSENEK. Modell: az író modellje (Claude Haiku 5.5, minőség-először). `_meta.seo.v = 2`.
     Kapu-bukás → 1 újrapróba a hibával → ha úgy is bukik: `seo.v = 2, seo.eles = false` (az oldal a régi marad), riport-szám.
   - Tömeges mód: `--atiras N` (v<2 cikkek, legolvasottabb elöl), új cikk a megjelenéskor magától v2.
   - VÉDETT oldalak: Bing ≥100 megjelenés ÉS átlag feletti kattintási arány (ma pl. Stable Diffusion 9,6%) → a tömeges kör
     NEM nyúl hozzájuk (`seo.megtartva = true`), őket csak a 4. rész mért csiszolása kezelheti.
     Lista: `memory/seo-vedett.json` (a Bing-lekérő írja; ha nincs friss lista, a tömeges kör nem indul).
   - build: angol cikkoldalon, ha `SEO_ELES_BE` (core/seo-kapuk.js) és `seo.v === 2 && seo.eles !== false && !seo.megtartva`
     → `<title>` = cimTag(seo_title), `<meta name="description">` = meta_description. og:*, twitter:*, JSON-LD, H1,
     hu/es változatlan. (A 4. rész élő köre ezt felülírja.)
   - ŐRÖK: (a) állandó teszt: minden `_meta` mező, amit a build/core olvas, a valódi cikkekben vagy egy író kódjában létezik
     (a `seo.description` ma ezen bukott volna); (b) kimenet-őr: élő v2-es angol cikk buildelt `<title>`/leírása = az elvárt.
2. **Kapcsoló BE + tömeges angol kör a CI-ben** (100 cikk / futás → ~3 nap, ~$2; napi $1 plafon alatt).
3. **hu/es**: a fordító lefordítja a `seo_title` + `meta_description` párt (nem angol oldalon nincs angol mondat).
4. **Heti Bing-mért csiszolás** a top oldalakra (a lenti 1–8. pont).

## 1. Szándék — miért
A user (11-25): „örülnék, ha az SEO-javítások javítások lennének, ne csak tárolások!” Majd: „hogy a leghatékonyabb?” →
a javasolt 1. utat választotta („oké”).

Mai állapot (mérve 11-25):
- Az SEO-agent (agents/seo/agent.js) minden cikkhez `_meta.seo` = { meta_description, keywords, seo_score, suggestions }.
  - **`meta_description` SOHA nem kerül ki:** a build a `_meta.seo.description` mezőt olvassa (website/build.js ~1184),
    az agent `meta_description` néven ír. Élőben mindenhol az alcím a leírás (Google Meet-oldalon ellenőrizve).
  - **`suggestions`** (2706 db) csak a CI-naplóba megy. Mérve: ~250 már megvan (FAQPage/HowTo/Breadcrumb a buildben),
    ~200 ár/összehasonlítás (tilos), ~550 „írj bele több konkrétumot” (kitalálás-veszély: az agent csak 700 karaktert lát),
    sok kulcsszó-tömés. Gépies végrehajtásuk ártana.
- Bing (10-26–11-20, GetPageStats, heti bontás): 126 oldal, ~8000 megjelenés, 360 kattintás (4,5%); a top 20 oldal adja a
  megjelenés 95%-át, átl. pozíció 5–6 (első oldal). Nagy a szórás a kattintási arányban: Stable Diffusion 9,6%,
  Gemini-képek 5,5%, Google Meet 2,2% (1659 megj.), Hugging Face Spaces 2,1% („hugging face spaces”: 445 megj. / 2 katt.),
  Copilot Teams 0,7%, Perplexity Spaces 0% (191).

A tét: az első oldalon ülő, sokat mutatott, de keveset kattintott oldalak keresőben látszó CÍME és LEÍRÁSA a valódi
keresőszavakhoz igazodjon. Várható hatás: a 4 gyenge oldal az átlagra (4,5%) → ~havi +60–80 Bing-kattintás. Kicsi, de
ingyenes, önjáró, és visszamérhető.

## 2. Célok
- G1. Hetente egyszer a kód kiválasztja a legtöbb elveszett kattintású angol cikkoldalakat (Bing-adatból), és ezekre
  új kereső-címet (`<title>`) + meta-leírást ír a cikk tényleges tartalmából és a valódi keresőszavakból.
- G2. Az új cím/leírás ÉLESEN megjelenik (build), de a látható cikk (H1, szöveg), a Facebook-előnézet (og:*), a hu/es oldal
  és a „Frissítve” dátum NEM változik.
- G3. Minden változtatás visszamérve: 3 teljes hét után az új kattintási arány vs. a régi; ha rosszabb → magától vissza.
- G4. Az SEO-agent ne gyártson tovább felhasználatlan tippeket (suggestions ki a sémából → kevesebb token).
- G5. A napi Telegram-jelentés magyarul szól, amikor csere vagy értékelés történt.

## 3. Nem cél
- A cikk szövegének, H1-ének, alcímének módosítása (a user 11-25-i kérdésére a „csak cím + leírás” utat javasoltam, ezt fogadta el).
- A hu/es oldalak (mérve: elhanyagolható Bing-forgalom; a /hu/ ki is van zárva a mérésből).
- Google-adat (Search Console API nincs bekötve; a Google a forgalom ~2%-ánál is kevesebb).
- Belső linkek a top oldalakra — külön, 2. kör (a 3 hónapos kereső-tervben).
- ~~Az SEO-agent `meta_description` mezőjének globális bekötése~~ → FELÜLÍRVA a 0. bővítéssel (user: minden cikk).

## 4. Anti-célok (ha ez történik, akkor is kudarc)
- A cím/leírás olyat ígér, amit a cikk nem ad meg (ÍGÉRET-FEDEZET, style-guide §3b).
- Ár, csomagár, kreditszám a címben/leírásban (ár-tilalom, core/ar-tilalom.js).
- Összehasonlítás / felsőfok („best”, „vs”, „better than”, „alternative to”) — user 09-26 tilalma.
- Kattintásvadász cím (felkiáltójel, CSUPA NAGY, „you won't believe”).
- A „Frissítve” dátum vagy a sitemap lastmod hamis léptetése a cím-csere miatt.
- A Facebook-poszt/-előnézet címe megváltozik.
- Ugyanaz a gyenge oldal hétről hétre újraírva (pörgetés), vagy egyszerre sok oldal → mérhetetlen.
- Hiba esetén néma kiesés (a lépés feltételes ágban hal meg, senki nem tudja).

## 5. Megközelítések
- **A) Adatvezérelt kereső-cím csiszolás (VÁLASZTOTT, user 11-25 „oké”).** Bing-adatból kiválasztott ≤3 oldal/hét,
  AI ír címet + leírást a cikkből és a keresőszavakból, kód-kapuk, 3 hetes visszamérés, automatikus visszaállítás.
  Kicsi kockázat (a szöveg nem változik, egy mező törlése visszaállít), mérhető, olcsó.
- B) Belső linkek a top oldalakra — a helyezést javíthatja (5–6. → feljebb), de lassabb és nehezebben mérhető → 2. kör.
- C) A tárolt tippek végrehajtása a cikkszövegben — ELVETVE: kitalált tartalom, ár, összehasonlítás, kulcsszó-tömés.

Saját döntés (a user nem kérdezett rá): az SEO-agent régi `meta_description` mezőit NEM kötjük be mind a ~900 oldalra.
Ok: mérés nélküli tömeges csere, és a minták többsége sablonos („with our step-by-step guide”). Ha az A) visszamérése
jó, egy későbbi körben kiterjeszthető.

## 6. A megoldás

### 6.1 Új modul: `core/kereso-cim.js` (+ `core/kereso-cim.test.js`)
- Kapcsoló: `export const KERESO_CIM_BE` (első feltöltéskor `false`, lásd 6.8b) — `false` esetén a heti futás semmit nem csinál ÉS a build sem használja
  a `_meta.kereso` mezőt (egy mozdulattal minden oldal visszaáll). Teszt őrzi.
- CLI: `node core/kereso-cim.js --heti` (CI), `--dry` (helyben, csak kiír, nem ír fájlt, nem hív AI-t ha `--no-ai`).

### 6.2 Ütemezés
- Az auto.yml MINDEN futásában lefut (feltétel nélküli lépés, `|| true`), és maga dönti el, hogy ezen a héten (ISO-hét)
  volt-e már futás: állapot `memory/kereso-cim.json` → `utolso_het`. Így nem hal meg néma halállal egy kimaradt futás miatt.
- A lépés MINDIG ír őrszem-mezőt (`at`, `eredmeny`: „lefutott / már volt a héten / kikapcsolva / Bing-hiba”) a riportnak.
- A deploy ELŐTT fut (a build már az új mezőt használja ugyanabban a futásban).

### 6.3 Kiválasztás (Bing GetPageStats, heti sorok)
- Ablak: az utolsó 4 teljes Bing-hét.
- Jelölt: angol cikkoldal (`/article/<slug>`, nem /hu/, /es/), ablakbeli megjelenés ≥ 100, átl. pozíció ≤ 10,
  kattintási arány < az ablak teljes oldal-átlaga (ma 4,5%).
- Kizárva: mérés alatt álló oldal; 12 héten belül visszaállított oldal; 8 héten belül már „marad”-ra értékelt oldal;
  nem élő slug; útmutató/hír egyaránt mehet.
- Rangsor: elveszett kattintás = megjelenés × (átlag arány − saját arány). Hetente legfeljebb **3** oldal.

### 6.4 Az új cím és leírás megírása
- Bemenet: a cikk angol szövege (cím, alcím, „In short”, H2-k, az első ~2500 karakter), a jelenlegi `<title>` és leírás,
  és az oldal top 15 keresőszava (GetPageQueryStats, ablakbeli megjelenés/kattintás).
- AI: `ask(..., { agentName: 'seo-cim' })` — config.json-ban saját bejegyzés (alap: az író modellje, Claude Haiku 5.5,
  a tartalékláncot a router adja). Kimenet JSON: `{ "cim": "...", "leiras": "..." }`.
- Prompt-szabályok: csak a cikkben szereplő állítás; a leggyakoribb keresési szándék szavai a cím elején; amerikai angol;
  ár/összehasonlítás/felsőfok/kattintásvadászat tilos; a cím ≤ 60 karakter, a leírás 120–158 karakter.

### 6.5 Kód-kapuk (mind kötelező; bukás → 1 újrapróba a hibaüzenettel, aztán az oldal kimarad a héten)
1. Hossz: cím 25–60, leírás 120–158 karakter.
2. Ár: core/ar-tilalom.js felismerője (cím + leírás), + kreditszám („\d+ credits”).
3. Összehasonlítás/felsőfok: `best`, `vs`, `versus`, `better than`, `compared`, `alternative`, `top \d`, `#1`.
4. Kattintásvadászat: `!`, 3+ betűs CSUPA NAGY szó (kivéve ismert rövidítések: AI, PDF, iPhone stb. listából), „you won't believe”.
5. Ígéret-fedezet: a cím minden eszköz-/terméknevének (core/forras-tema.js `eszkozNevek()`) szerepelnie kell a cikk
   szövegében; a cím tartalmi szavai (≥ 4 betű, nem tiltószó) közül legalább 80% szó szerint (kis-nagybetű nélkül)
   szerepeljen a cikkben. Szóalak-egyezés explicit, NEM előtag-illesztés.
6. Amerikai helyesírás: core/us-spelling.js javít (nem blokkol).
7. Nem egyezhet a jelenlegi címmel/leírással.

### 6.6 Hol él: `_meta.kereso` (a cikk JSON-jában) — körök listája (saját döntés, builder-check 2. kérdés)
```
{ korok: [                              // időrendben; az ÉLŐ kör = az utolsó 'meres' vagy 'marad' státuszú
    { cim, leiras, at,                  // a kör kereső-címe és -leírása, a csere ideje
      szoveg_ujjlenyomat,               // a cikk angol markdownjának hash-e a csere pillanatában
      alap: { tol, ig, megj, katt, arany, poz },   // a csere előtti 4 hét (az akkor ÉLŐ címmel)
      statusz: 'meres' | 'marad' | 'visszaallitva' | 'ervenytelen',
      ertekeles: { tol, ig, megj, katt, arany, poz, at, ok } } ] }
```
- Az élő kereső-cím: a legutolsó `meres`/`marad` kör. Ha nincs ilyen → a cikk saját címe és alcíme.
  Így egy 2. kör vesztése a NYERTES 1. körre áll vissza, nem az eredeti címre; a régi körök naplóként megmaradnak.
- build.js: angol cikkoldalon, ha `KERESO_CIM_BE` és van élő kör: `<title>` = cimTag(kor.cim),
  `<meta name="description">` = kor.leiras. A layout ma EGY title/description változót oszt meg a `<title>`, meta, og:* és
  twitter:* között (build.js ~1552–1580) → szét kell választani: CSAK a `<title>` és a `<meta name="description">` kapja
  a kereső-változatot; og:*, twitter:*, JSON-LD (headline, description), H1, hu/es változatlan.

### 6.6b Ha a cikk szövege közben változik (saját döntés, builder-check 1. kérdés)
Más munkák élő cikket írnak át (upgrade-howtos: cím/alcím/törzs; tény-ellenőrző; frissítő; összevonó/törlő).
- Minden heti futás (és minden build) újraellenőrzi az élő kör ígéret-fedezetét (6.5 / 5. kapu) a MOSTANI szövegen;
  bukásnál a kör → `ervenytelen` (ok: „a cikk változott, a cím már nem fedezett”), a build az előző érvényes kört /
  a cikk saját címét mutatja. A buildben ez tiszta, hálózat nélküli függvény (AI nincs).
- Ha `meres` alatt a `szoveg_ujjlenyomat` eltér a mostanitól → a mérés `ervenytelen` (ok: „a tartalom is változott,
  a mérés nem tiszta”); a kereső-cím ettől még élhet, ha a fedezet-kapu átmegy, de értékelés nem lesz, és az oldal a
  következő héten újra jelölt lehet (friss alappal).
- Törölt / 301-gyel levett cikknél nincs teendő (a fájl eltűnik).
- `valodiModositas()` NEM nézi a `_meta.kereso`-t → a „Frissítve” és a sitemap lastmod nem mozdul.
- IndexNow: a core/indexnow.js a szokásos frissek mellé bejelenti azokat az URL-eket is, amelyek `_meta.kereso.at`-ja
  az ő ablakán belül van (a Bing gyorsabban újraolvassa).

### 6.7 Visszamérés (a heti futás első lépése, a kiválasztás előtt)
- Értékelhető: `statusz === 'meres'` és a csere hete UTÁN már legalább 3 teljes Bing-hét van.
- Ha az értékelő ablakban a megjelenés < 100: vár (legfeljebb 6 hétig a csere után; utána a meglévő adatból értékel).
- `uj_arany >= alap.arany` → `marad`; különben → `visszaallitva` (a build a régit mutatja; `regi` megmarad naplónak).
- A pozíció-változást naplózza (ha > 1,5 helyet mozdult, a riport megjegyzi: „a helyezés is változott, az eredmény bizonytalan”),
  de a döntés a kattintási arányon áll.

### 6.8 Riport (core/daily-report.js, magyarul, csak ha történt valami)
- Csere: „🔎 Kereső-cím: 3 oldal új címet kapott a Bing-keresések alapján (pl. „Where to Find Google Meet Recordings…”) — 3 hét múlva visszamérem.”
- Értékelés: „🔎 Kereső-cím visszamérve: ✅ 2 marad (2,1% → 4,0%) · ↩️ 1 visszaállítva.”
- Hiba: „⚠️ Kereső-cím: a Bing-adat nem jött le — a héten kimaradt.” (egyszer, nem naponta).

### 6.8b Élesítés előnézettel (saját döntés a user állandó szabálya szerint: „élesítés előtt ELŐNÉZET”; builder-check 3.)
- A kód `KERESO_CIM_BE = false`-szal kerül fel. Helyben `node core/kereso-cim.js --dry` (valódi Bing-adat, ≤3 AI-hívás,
  ~$0,003; fájlt NEM ír) → a 3 javasolt cím + leírás a régi mellett a user elé, magyar magyarázattal.
- Csak a user jóváhagyása után: `KERESO_CIM_BE = true` (külön commit) → a következő heti futástól önjáró.

### 6.8c Apró döntések (saját döntés)
- Az átlagos kattintási arány (küszöb) CSAK az angol cikkoldalakból számol (nem a főoldal, nem hu/es).
- Ha egy jelölt a kapukon kétszer elbukik, a következő rangsorolt jelölt jön (amíg 3 nincs, vagy elfogy a lista).
- Bing-hiba esetén a hét NEM számít lefutottnak → a következő futás (aznap vagy másnap) újrapróbálja; a riport-hibasor
  hetente egyszer megy ki.

### 6.9 SEO-agent: tippek ki
- agents/seo/agent.js: a `suggestions` mező kikerül a sémából és a promptból; a naplósor is. A már tárolt mezők maradnak
  (nem kell tömeges fájlírás).

## 7. Korlátok
- Költség: ≤ 3 oldal × ≤ 2 hívás / hét, kb. $0,01 / hét — a napi $1 / havi $25 plafon alatt bőven.
- Bing API: a `BING_WM_API_KEY` secret MEGVAN (2026-07-06 óta; auto.yml 962/978. sor két lépésnek adja) → az új lépés
  env-jébe is fel kell venni. Hiányzó kulcsnál a lépés „Bing-kulcs hiányzik” őrszemet ír.
- A repó és az Actions-napló NYILVÁNOS: a naplóba csak slug + számok + az új cím mehet (ez úgyis nyilvános), kulcs soha.
- Helyben build SOHA: build-próba scratchpad `buildpro…` másolatban + `node core/output-guard.js`.
- Tesztek a VALÓDI adat-alakból (rögzített Bing-válasz minta a tesztben, valódi cikk-JSON).

## 8. A builderre bízva
- A pontos Bing-hét határ kezelése (a Date mező péntek-kulcsú hét) és a dátum-parszolás.
- A prompt pontos szövege a 6.4 szabályaival.
- Hogy a GetPageQueryStats hívás oldalanként mikor fusson (csak a kiválasztott ≤3 oldalra).
- A tesztek felépítése (TDD: kiválasztás, kapuk, értékelés, build-mező, kapcsoló, őrszem).
