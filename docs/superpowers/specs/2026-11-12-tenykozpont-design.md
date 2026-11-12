# TÉNYKÖZPONT — a kitalált felületek és funkciók elleni átfogó terv

**Dátum:** 2026-11-12 · **Állapot:** tervezet, user-jóváhagyásra vár
**Előzmény:** `memoria/project-aiworld-kitalacio-gyokerok.md` (mérések 11-11), teendőlista „TÉNYKÖZPONT” tétele.

---

## 1. Miért (a user szavaival)

11-11 este: *„most már elegem van a hibákból! a kitalált dolgokból! … elvileg nem kéne ennyit hallucinálnia egyik
agentnek sem! … de átgondoltan! … aggódom, hogy elveszítjük az olvasóink egy részét.”*
11-12: *„keresünk hozzájuk hivatalos súgót! ez a legmegbízhatóbb megoldás!”* · *„így hitelesek maradunk, nem vezetünk
senkit félre!”* · a sorrendről: *„a tied jobban tetszik … csináljuk úgy, ahogy te mondtad!”*

**A mért gyökérok (11-11):**
- A hír 469/469 forrásból készül; utólag javítani kellett 25-öt (5%).
- Az útmutató 377-ből **345 mögött nincs hivatalos forrás**; utólag javítani kellett 142-t (**38%**, ~7× több).
- A kitalált útmutatókat 4 különböző modell írta, a bíráló 8–9/10-et adott → **MÓDSZER-hiba, nem modell-hiba**:
  a témajavasló, az író, a bíráló és a tényellenőrző is EMLÉKEZETBŐL dolgozik.
- Az ismert tévedések két gyökérre esnek: ~18 **kitalált** (13 felület/gomb/ikon, 3 funkció, 2 név) és ~15
  **elavult tudás** (régi név/verzió, élő terméket „megszűntnek” mondott — ezt többször maga az ellenőrző tette).
- Az útmutató-olvasók **90%-a** forrás nélküli régi útmutatón van; a legolvasottabb 80 = az olvasók 54%-a.
- 11-11-től élő bizonyíték, hogy a súgó-út működik: a súgóból írt Gemini-útmutató (11-12) en/hu/es pontos, a magyar
  feliratok betűre a Google magyar súgójából.

## 2. Célok, nem-célok, anti-célok

**Cél:** az olvasó ne kapjon kitalált gombot, menüt, ikont, képernyő-szöveget, funkciót, elérhetőséget vagy elavult
nevet. Ne egy-egy hibát foltozzunk, hanem a lánc minden lépése hivatalos forráshoz mérjen.

**Siker mérhetően:**
- Új eszköz-útmutató 100%-a jóváhagyott súgóra épül (vagy egyáltalán nem állít felületet).
- A 80 legolvasottabb régi útmutató ~3 héten belül súgóhoz mérve átnézve, a hibásak javítva (en/hu/es).
- Az új útmutatók utólagos javítási aránya a hírekéhez közelít (~5%).
- A napi Telegram-jelentés mutatja: hány % forrásolt, mennyi a fék miatt kimaradt, hol akadt el valami.

**Nem-cél:**
- Erősebb/drágább modell (nem oldja meg — mérve).
- Gépileg nem olvasható súgók (Meta AI, Qwen, Midjourney, Picsart, Suno, Kling, ElevenLabs-help, Brave-support)
  megkerülése (Cloudflare-kijátszás, Googlebot-álcázás, harmadik fél proxy) vagy Chrome-os kézi mentése — most NEM.
- Régi útmutató levétele user-döntés nélkül.

**Anti-cél (ami kudarc, még ha „működik” is):**
- A fék a cégfüggetlen útmutatókat is megállítja → feleslegesen csökken a kínálat. (107 útmutató cégfüggetlen.)
- „Hiteles, de használhatatlan” útmutatók: fejlesztői/admin súgóból írt szöveg a hétköznapi olvasónak.
- Kiadói (súgó-)szöveg a NYILVÁNOS repóba kerül, vagy a súgó mondatai szó szerint az útmutatóba.
- A CI-perckeret (~1950/2000 havi) vagy a büdzsé (napi $1, havi $25) átlépése.
- Ár megjelenése bármely szövegben (user-szabály, `core/ar-tilalom.js`).

## 3. Kemény korlátok (a projekt szabályai)

- Kiadói szöveg CSAK a privát forrás-tárban (`_forrasok/`, Pacso84/ai-world-co-forrasok; `core/forras-cache.js`).
  A tár hiánya SOHA nem állít meg futást — de súgó nélkül súgó-alapú útmutató sem készül (a téma vár).
- Új súgóforrás CSAK user-jóváhagyással — a 2026-11-12-i lista (6. pont) jóváhagyva.
- Költség: napi $1 / havi $25 kemény plafon (10-18 óta átlag ~$0,27/nap). CI: napi 3 futás. **Javítás 11-12
  (builder-ellenőrzés):** a repó NYILVÁNOS → a GitHub szabványos futói ingyenesek, perckeret NINCS (az „~1950/2000”
  a privát repóra vonatkozó becslés volt) → a 2. fázis és a próbák külön jobban/workflow-ban is futhatnak; a
  korlát a pénzbeli büdzsé és a futásidő (a pipeline `--max-minutes 42`).
- Minden kikapcsolható legyen a `core/` oldalon kézi kill-switch-csel + teszttel (a config `enabled` NEM kapcsol ki
  semmit — user-szabály).
- Minden élő szövegváltozás en/hu/es; nem angol oldalon nincs angol mondat (kivéve a súgó szerinti angol
  feliratot, ha a nyelv nem támogatott — lásd Apple-eset).
- Tesztek: `node core/run-tests.js` kimenet fájlba; build-próba csak scratchpad-másolatban + `core/output-guard.js`.
- A Telegram-riport sorai magyarul, nem-technikus olvasónak.
- Ismert tévedés → `core/ismert-tevedesek.js` (forrás + `javitas` + pozitív/negatív teszt).

## 4. A megoldás alakja (a user által eldöntött részek)

### 4.1 Forrásszintek (user 11-12)
| Szint | Mit jelent | Kik |
|---|---|---|
| **Teljes súgó** | felhasználói súgó, lépések/feliratok igazolhatók | OpenAI, Anthropic, Google (Gemini, Gemini Notebook, Photos), Microsoft, Mistral, Apple, Amazon (már jóváhagyott) + ÚJ: **xAI Grok** (docs.x.ai), **Perplexity** (perplexity.ai/help-center), **GitHub Copilot** (docs.github.com/en/copilot), **Hugging Face** (huggingface.co/docs), **Cohere** (docs.cohere.com), **Duck.ai** (duckduckgo.com/duckduckgo-help-pages), **Lumo** (proton.me/support/lumo), **Z.ai** (docs.z.ai), **ElevenLabs** (elevenlabs.io/docs) |
| **Részleges** | csak a funkció LÉTEZÉSE igazolható, a felület nem → útmutató **gomb-/menü-/ikonnév NÉLKÜL**, és csak azt állíthatja, ami a forrásban szó szerint áll | **DeepSeek** (api-docs.deepseek.com: API + hivatalos hírek), **Kimi** (platform.kimi.ai/docs), **MiniMax** (platform.minimax.io/docs), **Brave Leo** (brave.com/leo) |
| **Nincs (fék)** | gépileg nem olvasható → új eszköz-útmutató NEM készül; a régi fennmarad | Meta AI, Qwen, Midjourney, Picsart, Suno, Kling, minden más jóváhagyás nélküli eszköz |

Felderítés 11-12, helyi gépről (scratchpad `sugoproba*.mjs`). **A CI amerikai gépéről is igazolni kell** (lásd 1. fázis).

### 4.2 Fék — mire vonatkozik (Claude javaslata, user jóváhagyta)
- CSAK az **eszközhöz kötött** útmutatóra (frontmatter `tool`/`company` egy konkrét termék). Ha az eszköznek nincs
  jóváhagyott súgója → az új téma nem kerül a sorba / nem íródik meg (napló + riport-sor).
- A **cégfüggetlen** („hogyan írj follow-up e-mailt MI-vel”) útmutató mehet súgó nélkül is, de **nem állíthat konkrét
  felületet** (gombnév, menüút, ikon, képernyő-szöveg) — ezt az Ellenőrző kódból méri (`core/guide-claims.js`
  `confidentUiClaims`), és ELUTASÍT (ma a UI_CLAIMS_UNSOURCED csak tanácsadó).
- A „részleges” szintű eszközre ugyanez a szabály: felület-állítás = elutasítás.

### 4.3 Sorrend (Claude javaslata, user jóváhagyta 11-12: a legolvasottabb régiek ELŐRE)
| Fázis | Tartalom |
|---|---|
| **0. FÉK** | 4.2 szabály + az új útmutatók minden útja csak súgóval (vagy felület nélkül) mehet; téves „kitalált név” kifogás javítása útmutatóra |
| **1. TUDÁSTÁR + SÚGÓBÓL ÍRÁS** | új súgók bekötése (index + szöveg a privát tárba), termék-adatlap, a témajavasló és az író minden útja súgóhoz horgonyoz, a bíráló súgóhoz mér |
| **2. TOP-80 RÉGI ÚTMUTATÓ** | olvasottság szerint, súgóhoz mérve átnézni → javítani en/hu/es; súgó nélküliekről user-döntés |
| **3. EGY KAPU MINDEN ÚTON + KARBANTARTÁS** | minden szövegíró út ugyanazon a kapun; származtatott szöveg ⊆ szülő cikk; heti újraletöltés, változásnál újraellenőrzés |
| **4. MARADÉK + ÁTLÁTHATÓSÁG + MÉRÉS** | a többi ~265 régi útmutató; „Források” doboz; olvasói hibajelző gomb; napi 🧪 sor + heti vak szúrópróba |

Ez a dokumentum a **0–2. fázist** részletezi építhető mélységben; a 3–4. fázis irány, külön terv készül hozzá.

## 5. Részletek

### 0. fázis — FÉK

**0a. Eszköz → forrásszint leképezés, EGY helyen.** Ma a `core/sugo-index.js` `szolgaltatok(tool, company)` csak 7
szolgáltatót ismer, a `core/sugo-parositas.js` `FORRAS_SUGO` csak hírforrásokat. Kell egy függvény, ami bármely
útmutató `tool`/`company` párjára megmondja: `teljes` / `reszleges` / `nincs` + mely súgó-kulcs(ok). (A frontmatter
`tool` értékei mért listája: lásd 11-12-i számlálás — „Alexa+”, „Grok”, „Perplexity”, „DeepSeek Chat”, „Hugging Face
Spaces” stb.; aliasok kellenek.)

**0b. Hol fékez.** Minden útmutató-TÉMA keletkezési helyén és az írás előtt is (kettős zár):
- témakeletkezés: `agents/guide/agent.js` `--ideas`, `--general`, `--cover`, `--balance`, a napi trend-téma
  (`core/trend-kutato.js`), `agents/pairing/agent.js` (hír→útmutató), `core/lefedettseg-extra.js`;
- írás/átírás: `writeGuide`, `reworkGuide`, `upgradeGuide` (`--upgrade`), `agents/iro/upgrade-howtos.js`
  (hírből útmutató), a tényellenőrző átíró ága (`agents/fact-check`).
- Fékezett téma: `status: 'fek'` (nem törlődik, a súgó jóváhagyása után magától felszabadul), riport-sor:
  „🧯 Fék: N téma vár hivatalos súgóra (Meta AI 2, Qwen 1…)”.

**0c. Felület-állítás elutasít, ha nincs mihez mérni.** UI_CLAIMS_UNSOURCED → elutasító kód útmutatónál, ha az
útmutatónak nincs súgószövege (cégfüggetlen vagy részleges szint). Meglévő küszöbök (`core/guide-claims.js`) maradnak;
a mérés előtt korpuszon kell nézni, hány élő útmutatót fogna (téves riasztás-arány), és ha sokat, a küszöb a builder
dolga — a cél: konkrét, magabiztos felület-állítás ne menjen ki forrás nélkül. Lecke-szöveg + magyar név kötelező
(`core/auto-check-codes.js` őr-teszt).

**0d. Téves „kitalált név” kifogás útmutatónál (11-12-i lelet).** `core/biralo-forrasinfo.js` `tevesNevKifogas` /
`atdolgozoMeta` útmutatónál (üres `source_link`) ma csak a `website/tool-links.json`-nal igazol. Útmutatónál a név
igazolható legyen (1) a `_meta.source_news` hír forrásából (annak `source_link`, cím, privát-tárbeli szöveg) és
(2) az `official_sources` súgószövegéből. Bekötés: `agents/ellenorzo/agent.js` (~900. sor) és `agents/guide/agent.js`
(~1019. sor). Teszt a 11-12-i valódi esettel (Gemini 4 Carbon, Workspace Studio).

### 1. fázis — TUDÁSTÁR + SÚGÓBÓL ÍRÁS

**1a. Új súgók bekötése** (`core/sugo-index.js` `ENGEDELY` + `FORRASOK`):
- Felderítve 11-12: Perplexity sitemap (`/help-center/sitemap.xml`, 288 `/en/articles/`), docs.x.ai sitemap (Grok
  fogyasztói rész: `/grok/*`, `/x-subscription/*`; a `/developers`, `/build`, `/console`, `/cookbook`, `/grok-bot` és
  vállalati részek KIZÁRVA), GitHub `docs.github.com/api/pagelist/en/free-pro-team@latest` (571 `/copilot/` oldal),
  docs.cohere.com sitemap (314), Duck.ai help-pages sitemap (294, a Duck.ai / AI-részek), docs.z.ai sitemap (65),
  api-docs.deepseek.com sitemap (57), huggingface.co/docs (index-lap), proton.me/support/lumo, elevenlabs.io/docs,
  platform.kimi.ai/docs, platform.minimax.io/docs, brave.com/leo.
- Amazon (`amazon.com/gp/help/customer/display.html?nodeId=…` — 11-12-én közvetlenül 200; tartalék tükör:
  `digprjsurvey.amazon.com/csad/help/node/<id>`) és Apple (iPhone User Guide tartalomjegyzéke) cikklistája.
- **CI-próba kötelező** (a CI az USA-ból fut, más a viselkedés): egy `$0`-s kézi workflow (minta:
  `forras-proba.yml`) minden új súgóra: index-letöltés + 1 cikk szövege. Ami a CI-ből nem megy, az „nincs” szintre
  kerül, a user tájékoztatva.
- **Fejlesztői szűrés:** a GitHub, Cohere, Hugging Face, Grok, Z.ai, Kimi, MiniMax doksi nagy része fejlesztőknek
  szól. A súgó-választó (`core/sugo-parositas.js` mintájára) csak hétköznapi felhasználónak szóló cikket választhat;
  a Cohere esetében (cégeknek/fejlesztőknek szóló platform) **új útmutató csak akkor**, ha van hétköznapi felhasználói
  cikk — különben gyakorlatilag fék.

**1b. Súgószöveg a privát tárban.** Ma a súgószöveg csak a futás idejére töltődik le (`core/elakadas-gen.js`
`cikkSzoveg`, max 6000 kar.). Új: `_forrasok/sugo/<szolgaltato>/<kulcs>.txt` + `meta` (url, cím, letöltve, hash).
Cél: a bíráló/átdolgozó/tényellenőrző későbbi futásban is ugyanazt lássa, és a 3. fázis heti újraletöltése a
hash-változást észlelje. A tár elérhetetlensége → élő letöltés, ha az sem → az adott útmutató vár (nem ír emlékezetből).

**1c. Termék-adatlap (tudástár mag).** Egy nyilvános, kiadói szöveget NEM tartalmazó adatfájl eszközönként: pontos
név, régi nevek, státusz (él / megszűnt + dátum + forrás), forrásszint (4.1), súgó-kulcsok, elérhetőségi megjegyzés
forráslinkkel. **Claude döntése:** az 1. fázisban ez egy HOMLOKZAT (egy modul, amit minden agent kérdez), ami a
meglévő listákra épül (`website/tool-links.json`, `core/megszunt-eszkozok.js`, `core/ismert-tevedesek.js`, súgó-index)
— nem költöztetjük át őket most (kockázatos, sok teszt függ tőlük). Az összeolvasztás a 3. fázis feladata.

**1d. Téma csak létező funkcióról.** Minden eszközhöz kötött új téma kap egy horgonyt: a súgó-index egy cikkét
(`official_sources` + `sugo_alapu: true`), a mai súgó-párosítás mintájára (AI a cikklistából választ → letöltés → AI
dönt: hétköznapi felhasználónak elmagyarázza-e a funkciót). Ha nincs illő súgócikk → nincs téma. A témajavasló
(`IDEAS_SYSTEM_PROMPT`) eszköz-témát csak a súgó cikkcímeiből javasolhat.

**1e. Az író csak a súgóból.** A már élő `sugoBlokk` szabály (minden lépés, gomb, menü, csomag, elérhetőség a súgóból;
saját szavakkal; nincs ár) minden eszköz-útmutatóra. A régi „saját hír tényanyag” blokk maradhat kiegészítőnek, de
felület-állítás csak a súgóból jöhet.

**1f. A bíráló a súgóhoz mér.** A `GUIDE_UI_NOT_IN_HELP` (ma csak `sugo_alapu`-ra) minden súgós útmutatóra. Az
AI-bíráló promptja a súgószöveget kapja (ne emlékezetből ítéljen létezésről/elérhetőségről). Az átdolgozó is.

**1g. Napi Telegram-sor (a 4. fázis mérésének előfutára):** pl. „📘 Útmutatók forrása ma: 3/3 hivatalos súgóból ·
🧯 fék: 2 téma vár (Meta AI, Qwen) · ⚠️ súgó nem jött le: 0”.

### 2. fázis — A 80 LEGOLVASOTTABB RÉGI ÚTMUTATÓ

- **Lista:** forrás nélküli (`official_sources` üres) útmutatók 30 napos olvasottság szerint (`/hu/` nélkül, a
  forgalmi napló szabályai szerint), top 80. A cégfüggetlenek közül csak azok, amelyek felületet állítanak.
- **Lépésenként:** (1) súgócikk keresése a jóváhagyott indexből (AI választ a címekből, mint 1d) → (2) KÓD összeveti
  a magabiztos felület-állításokat a súgószöveggel → (3) besorolás: `rendben` / `javítandó` (hiányzó feliratok
  listája) / `nincs súgó` (fék-szintű eszköz) → (4) a javítandók átírása a súgóból (a meglévő `--upgrade` úton, a
  súgó az egyetlen forrás), URL marad, en/hu/es, `official_sources` beírva → (5) ismétlődő tévedés →
  `core/ismert-tevedesek.js`.
- **„Nincs súgó” csoport:** jelentés a usernek (cím, olvasottság, a gyanús állítások) → user dönt: marad /
  felület nélkülire írjuk át / levesszük 301-gyel.
- **Ütem és költség:** naponta legfeljebb N útmutató (builder javasol N-t a büdzsé alapján: írás ~$0,005 +
  fordítás + bírálat; napi plafon $1 — a többi pipeline ~$0,27). A PDF-csomagokat NEM gyártjuk újra naponta (user:
  csak vasárnapi átnézés).
- **Hol fut:** a CI-ben (a privát tár és az élő letöltés ott van), saját kill-switch-csel; vagy kötegenként helyben
  Claude-dal, ha a user úgy kéri (eddig a 6 kitaláció-keresési rész így ment). **Claude döntése:** CI-ben, napi
  kötegben — nem igényel munkamenetet, és a 3. fázis karbantartása ugyanezt a gépezetet használja.

### 3–4. fázis — irány (külön terv)
- Egy kapu minden szövegíró úton (`iro`, `guide`, `fact-check`, `translator`, `core/hu-proofread`, `digest`, `video`,
  `social`, `seo`, `core/elakadas-gen`, `core/kitoltheto-regi-gen`, `core/trend-kutato`) + őr-teszt, hogy új út ne
  kerülhesse meg; származtatott szöveg (poszt, heti összefoglaló, híradó-szkript) csak a szülő cikkben álló állítást
  tartalmazhat.
- Heti súgó-újraletöltés, hash-változásnál az érintett útmutatók újraellenőrzése; 90 napos ciklus.
- Termék-adatlap összeolvasztása (tool-links, megszűnt eszközök, ismert tévedések, súgó-index).
- „Források” doboz a cikk alján („utoljára összevetve: …”), olvasói „nem ezt látom a képernyőn” gomb.
- Napi 🧪 mérőszám + heti vak szúrópróba hibaaránnyal.

## 6. Amit a builder dönt el
- Fájl- és függvénynevek, modulhatárok, a homlokzat API-ja.
- A felület-állítás küszöbei (0c), a fékezett témák pontos tárolása, a napi köteg mérete (2. fázis) a büdzsén belül.
- Melyik fejlesztői doksiból mely útvonalminták számítanak „hétköznapi felhasználói” cikknek (1a), méréssel.
- A CI-próba workflow részletei.

## 7. Claude döntései (a user ellenőrizheti)
- A termék-adatlap az 1. fázisban homlokzat a meglévő listák fölött, nem költöztetés.
- A 2. fázis a CI-ben, napi kötegben fut.
- A súgószöveg a privát tárba kerül hash-sel (1b), nem csak futás idejére.
- A fék a témát `fek` állapotba teszi, nem törli.
- A Cohere-re „hétköznapi cikk nélkül nincs új útmutató” szabály.

## 8. A builder-ellenőrzés kérdései (11-12) és a válaszok

1. **A 0. fázis fékje eszköz- vagy útmutató-szintű?** (Claude döntése) ESZKÖZ-szintű: a 0. fázis a „nincs” és
   „részleges” szintű eszközöket fékezi + a súgó nélküli felület-állítást utasítja el (0c). A „teljes” súgós eszköz
   (pl. ChatGPT) témája a 0. fázisban még a régi úton megy, DE a 0c miatt a súgóban nem szereplő felületet nem
   állíthat (mert a súgóval mérünk, ha van illő súgócikk — ha nincs, súgó nélkülinek számít). Az 1. fázis teszi
   kötelezővé a súgó-horgonyt. A 0. és 1. fázis között legfeljebb néhány nap teljen el.
2. **Honnan jönnek a magyar/spanyol feliratok?** (Claude döntése, a 11-09-i Apple-eset gyakorlata szerint, amit a
   user jóváhagyott): ha a cégnek van az adott nyelvű hivatalos súgója (Google, Microsoft, Apple, Amazon es…), a
   fordítás AZ OTT álló feliratot használja (a súgót nyelvenként is letöltjük, a tárban nyelvenként); ha nincs
   (pl. a magyar nem támogatott nyelv, vagy csak angol súgó van), a felirat ANGOLUL marad idézőjelben, rövid
   magyarázattal („az alkalmazás angol feliratát idézzük”). A fordító nem találhat ki lefordított feliratot. Ez a
   felirat nem „angol mondat” a nyelvi szabály szerint.
3. **A 2. fázis a nem-felület állításokat is nézze?** (Claude döntése) IGEN: az ismert hibák fele elavult tudás
   (név, elérhetőség, „megszűnt”). A KÓD-mérés (feliratok) mellé egy olcsó AI-összevetés kerül a súgószöveggel
   (létezés, elérhetőség, név) — ítélni CSAK a súgószövegből szabad, emlékezetből nem; bizonytalan → jelölés,
   nem átírás.
4. **A 2. fázis javításai automatikusan élesednek, vagy jóváhagyásra várnak?** → USER-DÖNTÉS 11-12 (*„rád bízom,
   de nem veszíthetünk olvasókat, úgy csináld! azért csináljuk a javításokat, mert az olvasói bizalmat próbáljuk
   erősíteni!”*) → a KÖZTES megoldás:
   - **Automatikusan élesedik**, ha MINDEN gépi feltétel teljesül: a javított szöveg minden magabiztos
     felület-állítása szó szerint a súgóban áll (0 hiányzó), a bíráló ≥ 8/10, nincs KNOWN_FALSE_CLAIM, ár nincs,
     a cím és a téma nem változik, és az OLVASÓ-VÉDELEM (lent) minden pontja teljesül. A napi Telegram-jelentés
     sorolja a javított címeket linkkel.
   - **User-jóváhagyás kell** (Telegram/beszélgetés, kötegben): címváltozás vagy témaváltás; „nincs súgó” csoport
     (marad / felület nélkülire írjuk / levétel 301-gyel); bármilyen levétel.

## 9. OLVASÓ-VÉDELEM (user 11-12: „nem veszíthetünk olvasókat!”) — minden fázisra kötelező
A javítás célja a bizalom ERŐSÍTÉSE; egy javítás sem ronthatja az olvasó élményét vagy a megtalálhatóságot.
- **Az URL soha nem változik** (`_meta.slug` rögzített), oldal nem tűnik el; levétel csak user-döntéssel, 301-gyel
  a legközelebbi rokon útmutatóra.
- **A javított útmutató nem lehet soványabb**: a lépések száma és a szöveg hossza nem eshet érdemben az eredeti alá
  (a küszöb a builderé, méréssel), a meglévő értékek megmaradnak: kitölthető prompt-mezők
  (`content/kitoltheto`), „🔧 Ha elakadsz” doboz, „Read this next”, hirdetés-hely, kép, egy H1 — a kimenet-őr
  és a sablon-paritás-őr fogja.
- **Ugyanarra a kérdésre válaszol**: a cím ígérete (style-guide §3b) teljesül; ha a súgó szerint a cím ígérete nem
  teljesíthető (a funkció nem létezik), az user-döntés, nem csendes témaváltás (a 11-12-i Workspace-eset tanulsága).
- **Látható „Frissítve”** csak valódi változásnál (`valodiModositas()`), IndexNow-bejelentés a javítás után.
- **Mérés javításonként**: a javított útmutató 14 napos olvasottsága a javítás előtti 14 naphoz képest (forgalmi
  napló, `/hu/` nélkül) — ha a javított útmutatók összesítve érdemben esnek, a riport szól, és a gépezet megáll
  (kill-switch), amíg Claude és a user meg nem nézi.
- **Hangnem és nyelv változatlan**: tegezés (hu), amerikai angol, nincs készüléknév, nincs ár, nincs összehasonlítás.
5. **A „részleges” források adhatnak-e új útmutatót?** (Claude döntése, a user 11-12-i jóváhagyásán belül) IGEN,
   de ugyanaz a hétköznapi-felhasználó szűrő érvényes, mint a Cohere-nél: csak olyan funkcióról, amit a hivatalos
   hír / termékoldal a hétköznapi felhasználónak mutat be (pl. DeepSeek „Search” az alkalmazásban), és felület-név
   nélkül. API-leírásból fogyasztói útmutató nem készül.
6. **CI-perckeret?** Nincs (nyilvános repó) — lásd 3. pont.
