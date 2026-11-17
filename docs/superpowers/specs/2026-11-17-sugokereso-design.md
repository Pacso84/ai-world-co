# Súgókereső (felfedező) — design (2026-11-17)

Kapcsolódó: docs/superpowers/specs/2026-11-12-tenykozpont-design.md (tényközpont), terv/napló:
docs/superpowers/plans/2026-11-14-tenykozpont-1b-sugo-horgony.md, .superpowers/sdd/2026-11-14-tenykozpont-1b-sugo-horgony/progress.md.

## 1. Szándék — miért
A user (11-16 este): „ha nincs súgó, 14 napig nem jelenik meg az útmutató → csináljunk egy súgókeresőt!”
A súgó-horgony (core/sugo-horgony.js `horgonyKeres`) egy útmutató-témát csak akkor enged írni, ha a cég HIVATALOS
súgójában talál hozzá illő cikket; ha nem, a téma 14 napra félreáll. A súgók cikklistája most FIX
(core/sugo-index.js `FORRASOK`). Ha abban nincs a cég felhasználói súgója, a téma akkor is vár, ha a súgó létezik.

Mérve 11-17 (28 téma, a 2. javítókör után): 14 kudarc „nincs illő súgócikk”. Ebből:
- 7 = VAN felhasználói súgó, csak nincs a listánkban: Kimi (5 téma; www.kimi.com/help, a sitemapban 180 lap; nálunk
  csak a platform.kimi.ai API-dok) és MiniMax Code (2; agent.minimax.io/docs/user-guide; nálunk csak a platform-dok);
- 5 = valódi hiány: DeepSeek, Z.ai — csak fejlesztői dokumentáció létezik;
- 1 = Workspace Studio szüneteltetés — csak admin-cikk + hír van; 1 = ChatGPT színtípus — felhasználási ötlet.

## 2. Célok
- G1. Ha a fix listában nincs illő felhasználói súgócikk, a kód MAGÁTÓL felkutatja az eszköz hivatalos domainjén lévő
  súgólapokat, és ezek ugyanazon a szigorú úton mennek tovább (választó AI → letöltés → ellenőrző AI), mint ma.
- G2. A Kimi felhasználói súgója (www.kimi.com/help) MOST bekerül a fix listába (user 11-17: jóváhagyva).
- G3. A súgó-horgony két kis keretű AI-hívása (választó 200, ellenőrző 400 token) ne adjon üres választ.
  Mérve: a Haiku 5.5 a keretet gondolkodásra égeti → üres válasz (finish: length, 0 kar) a hívások ~felében → MiniMax-tartalék.
  Élesben máshol NINCS ilyen (11-17 17:11-es futás: 15 Haiku-hívás, 0 üres), ezért a javítás HELYI, nem a router-szintű.
- G4. A napi Telegram-jelentés szól, ha egy újonnan felfedezett súgó-forrást használtunk („🧭 új súgó-forrás: <host>”).

## 3. Nem cél
- Webes keresőszolgáltatás (OpenRouter/Exa stb.) — ELVETVE: fizetős, a találatok tele vannak klónoldallal
  (shapes.inc, minimax-ai.chat, chat-deep.ai, kimi-ai.chat), és a mostani esetekből egyet sem találna, amit a felfedező nem.
- A DeepSeek / Z.ai témák megmentése (nincs felhasználói súgójuk — a kapu helyesen tartja vissza őket).
- Az ellenőrző szigorúságának lazítása; a 14 napos várakozás hosszának módosítása.

## 4. Anti-célok (ha ez történik, akkor is kudarc, ha „működik”)
- Klón / harmadik féltől származó oldal súgóként (0 téves a cél).
- API-, fejlesztői-, árazási-, blog-, jogi lap felhasználói súgóként.
- AI-szöveg vagy súgóidézet nyilvános helyen (guide-topics.json, memory/*.json, CI-konzol — a repó és az Actions-napló NYILVÁNOS).
- Egy futás „ostromolja” a cég szerverét (lásd 6. korlátok).
- A már jóváhagyott, szándékosan SZŰKÍTETT források megkerülése (pl. proton.me/support csak a Lumo-cikkek: SZUKITES/LUMO_UT).

## 5. Megközelítések (a user 11-17-én az A-t választotta, a domain-őrnél az „1) automatikus” változatot)
- **A) Felfedező a hivatalos domain gépi tartalomjegyzékéből — VÁLASZTVA.** robots.txt → Sitemap-sorok → sitemap(index)
  → súgó-jellegű útvonalak; plusz llms.txt, ha van. $0, AI nélkül, determinisztikus. Hátrány: csak azt látja, ami a sitemapban/llms.txt-ben van.
- B) Webes keresőszolgáltatás domainre szűrve — elvetve (3. pont).
- C) Csak kézi listabővítés — elvetve mint fő út (minden új cégnél kézi munka), DE a Kimi kézi felvétele (G2) megmarad.
- Domain-őr: **1) automatikus** (user: „oké 1”): a felfedező csak az eszköz hivatalos címének domainjén/aldomainjein
  kereshet, utólagos Telegram-jelzéssel. (Elvetett: 2) javaslat + előzetes jóváhagyás — a téma addig várna.)
  ⚠️ Ez a user 11-12-i szabályának („új súgó-előtag CSAK user-jóváhagyással”) TUDATOS módosítása a felfedezett forrásokra:
  a jóváhagyás itt a tool-links.json hivatalos címlistája (amelyet korábban együtt állítottunk össze, csak hivatalos főoldalak).
  A sugo-index.js fejkommentjét ennek megfelelően frissíteni kell.

## 6. Ami el van döntve (a „hogyan” része)
### 6.1 Domain-őr
- Kiindulás: website/tool-links.json `tools[<eszköz>]` címe (ugyanaz a név, amit a core/forras-szint.js / termék-adatlap ad).
  Engedett hostok: a cím hostja és a regisztrálható domain (pl. www.kimi.com → kimi.com és minden *.kimi.com).
  CSAK a `tools` szekció — a `companies` nem (tágabb, pl. ai.google).
- Kizárás: ha az eszköz regisztrálható domainjén MÁR VAN jóváhagyott előtag a sugo-index.js `ENGEDELY`-ben
  (pl. google.com, proton.me, microsoft.com, apple.com, brave.com, elevenlabs.io, duckduckgo.com), ott NINCS felfedezés —
  a meglévő, gondosan szűkített lista az irányadó.
- https, port és felhasználónév nélkül; a „..”/„%2e%2e” védelem ugyanaz, mint az `engedelyezett()`-ben.

### 6.2 Felfedezés
- Források sorrendben: https://<host>/robots.txt `Sitemap:` sorai (a tool hostja, utána a regisztrálható domain www-je);
  sitemap-index rekurzió legfeljebb 2 szint; plusz https://<host>/llms.txt és https://<host>/docs/llms.txt (markdown-linkek).
- Súgó-jellegű útvonal: tartalmaz /help, /faq, /guide, /user-guide, /support, /docs szakaszt; KIZÁRVA: api, developer(s),
  platform, reference, sdk, cookbook, pricing, blog, news, legal, terms, privacy, careers. Angol: nyelvi előtag nélküli vagy /en/;
  más nyelvi előtag (pl. /zh/, /ja/, /en-cn/) kimarad, ha ugyanaz a cikk nyelvi előtag nélkül is megvan.
- Cím: a meglévő `slugCim(url)` (sugo-index.js) — a lap letöltése nélkül.
- Korlátok: futásonként és hostonként legfeljebb 12 HTTP-kérés, 30 mp-es időtúllépés, legfeljebb 5000 URL beolvasva,
  legfeljebb 400 jelölt tárolva. A sikeres felfedezés eredménye (csak URL + cím) memory/sugo-felfedezes.json-ba kerül
  hostonként `at` időbélyeggel, 7 napig friss — addig nincs újrafelfedezés. Hiba/üres eredmény = átmeneti, NEM 14 nap.

### 6.3 Bekötés a horgonyKeres-be
- Ha a fix listából a választó „nincs illő” választ ad (vagy a fix lista üres / csak fejlesztői), a felfedezett jelöltekkel
  EGY második választó-kör fut; ha az talál, ugyanaz a letöltés + ellenőrző (a 2. javítókör szabályaival) dönt.
- A második kör csak akkor, ha az eszközre van felfedezett jelölt (AI-hívás nem megy üres listára).
- Sikernél az `official_sources[0]` mellé `felfedezett: true`; a súgó-tár (core/sugo-tar.js), az útmutató-író,
  az ellenőrző (GUIDE_UI_NOT_IN_HELP) és a „Ha elakadsz” doboz ugyanúgy elfogadja ezt a forrást, mint a jóváhagyottat —
  ehhez az `engedelyezett()` mellé egy közös „felfedezett forrás-e” ellenőrzés kell, EGY helyen (a memory-fájl + domain-őr alapján).
- Kudarc-okok: a meglévők maradnak; ha a felfedezés is lefutott és sem a fix, sem a felfedezett lista nem adott illőt,
  az ok ugyanaz („nincs illő súgócikk”), tartós (14 nap).

### 6.4 Kimi kézi felvétel (G2)
- ENGEDELY + FORRASOK.kimi: a www.kimi.com súgó-sitemapja (robots.txt → sitemap-ug.xml → sitemap-ug-helpcenter*.xml),
  minta a /help/ útvonal; KIZÁRVA: /help/kimi-api/ (fejlesztői) és a nem angol változatok. A platform.kimi.ai sor marad.
- Darabszám helyben mérve a commit-üzenetbe; a CI-próba (gh workflow run sugo-proba.yml -f kulcsok="kimi") igazolja.

### 6.5 Haiku-keret (G3)
- sugo-horgony.js: választó 200 → 1500, ellenőrző 400 → 2000 maxTokens (csak felső határ, nem drágít).
  A router (core/ai-router.js) NEM változik.

### 6.6 Riport (G4)
- A core/report-lines.js horgony-sora kiegészül: ha a napi próbákban volt felfedezett forrású siker:
  „🧭 új súgó-forrás: <host> (N téma)”. Csak host és szám — AI-szöveg nem.

## 7. Siker és mérés
- Helyi mérés ugyanazon a 28 témán (scratchpad horgony-meres-kor2.mjs mintája; repóba nem ír), költséghatár $0,10.
- Elvárt: a Kimi/MiniMax-témák egy része horgonyt kap; 0 téves párosítás (minden sikert kézzel ellenőrzök a súgó ellen);
  0 üres AI-válasz a horgony-hívásokban.
- ⚠️ A régi push-feltétel („TELJES szinten ≥60%”) a felfedezéssel sem érhető el: a TELJES szint maradék kudarcai valódi hiányok
  (Z.ai, Workspace Studio-szünet, ChatGPT-ötlet) vagy ellenőrző-döntések. JAVASLAT a usernek az új feltételre: 0 téves +
  minden kudarc „valódi hiány” vagy indokolt ellenőrző-döntés kategóriába sorolva (nincs javítható hibánk). A push a user döntése.

## 8. A kivitelezőre hagyva
- A fájlbontás (új modul pl. core/sugo-felfedezo.js javasolt), a függvénynevek, a tesztek szerkezete (TDD, hamis fetch).
- A guard-registry besorolás a memory/sugo-felfedezes.json-ra (a meglévő horgony-allapot.json mintájára).
- A sitemap-értelmezéshez a meglévő `sitemapCikkek` / `linkCikkek` újrahasznosítása, ahol illik.
