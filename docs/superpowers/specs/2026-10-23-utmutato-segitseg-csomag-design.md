# Útmutató-segítség csomag — terv (2026-10-23)

## Cél és miért

A user egy külső elemzés (Gemini) alapján két hiányt jelölt meg:

- **„Feladatalapú és problémamegoldó formátumok! ez hiányzik nálunk!”** A 373 útmutatóból csak **4** problémamegoldó. A többi feladatból indul („Írj X-et Y-nal”), és nem segít, ha az olvasó **elakad**.
- **„Emberi kontextus és minőségbiztosítás … ezt is jó lenne bevezetni, csak a mi szabályaink szerint!”** Az olvasót az is érdekli, mennyire megbízható az eszköz, mik a korlátai, és mikor hibázik.

A csomag minden meglévő és új útmutatót **használhatóbbá** tesz, nem ír új cikkfajtát. Két mérhető cél:

- több oldal/látogatás (alap: 1,04–1,06);
- keresésből érkező olvasó a problémás kérdésekre („ChatGPT stops mid-answer”). Ezt a GYIK-jelölés hozza.

## A user döntései (a beszélgetésben, 10-23)

| Kérdés | Döntés |
|---|---|
| Külön „Megoldás” útmutató-fajta vagy az útmutatókba? | **Az útmutatókba:** „de a megoldást az útmutatókba rakjuk! … a mostanira kéne szabni!” |
| Régi útmutatók is? | **Igen**, a mostaniakra szabva. |
| Súgóoldalak forrásként | **„a súgóoldalakat használni az jó ötlet!”** Jóváhagyottnak a 7 hivatalos súgót vesszük (lent). Más oldal csak külön user-jóváhagyással. |
| Mi kerüljön bele? | **„az előzőeket is csináljuk! amiket írtál!”** Kitölthető prompt, „Működött?” jelzés, valódi olvasói visszajelzés, „Szerkesztő ajánlja”, lépés-dizájn (előtte → utána), plusz külön projektként katalógus-beküldés és hírlevél. |

## Szabályok, amelyek a csomagra is vonatkoznak

- **Hitelesség:**
  - SOHA nem írjuk, hogy „kipróbáltuk / teszteltük / ember nézte át”, ha nem így volt;
  - az EU MI-rendelet szerinti jelölés marad;
  - a meglévő címke: „our editor spot-checks published articles every day”.
- **Élő szöveg:** a meglévő útmutatók TÖRZSSZÖVEGÉT nem írja át gép (feedback-gepi-javitas-elo-szovegen). Az új tartalom **külön mezőben** él.
- **Nyelv:** nem angol oldalon nincs angol mondat. A doboz is lefordítva jelenik meg, vagy sehogy.
- **Büdzsé:** napi $1 / havi $25. Az utólagos generálás napi adagokban megy, és mérve indul.
- **Forrás:** kitalált hibaelhárítás TILOS. A doboz minden állítása egy hivatalos súgócikkből jön, linkkel.
- **Működés:**
  - kill-switch a `core/` oldalon, teszttel (a config `enabled` önmagában nem kapcsol ki semmit);
  - build/deploy csak a CI-ban;
  - oldalanként egy hirdetés;
  - mobil (390 px) előnézet élesítés előtt.
- **Tilos:** összehasonlító tartalom.

## Részek

### A. Lépés-kártya: előtte → utána ($0, csak sablon + CSS)

A meglévő lépésben már megvannak a részek, csak bekezdés-folyamban:

- a teendő;
- a 💬 prompt (`g-prompt`);
- a „ha másképp néz ki” (`g-diff`);
- a ✅ siker-mondat (`g-ok`).

Az új nézetben ezek egy **láncot** alkotnak: amit beírsz (prompt-buborék) → amit kapsz (siker-mondat: „✓ Kész, ha ezt látod”) → ha nem így van (🔄). **A szöveg nem változik, csak a helye és a formája.** Ugyanazt a `lepesReszek()` bontást használja.

### B. Kitölthető prompt ($0)

- Ha a 💬 promptban `[szögletes]` helykitöltő van, az a dobozban **beírható mezővé** válik.
- A „Másolás” a kitöltött szöveget másolja. Az üresen hagyott mező `[eredeti]` alakban marad.
- Lefedettség:
  - ma 40 útmutatóban van ilyen;
  - az **útmutató-író promptja** megkapja a szabályt: a személyes részek `[helykitöltő]` alakban kerüljenek a 💬 promptba, és a modellnek a helykitöltő a mérce, nem a kitalált példa;
  - a régi szövegekhez nem nyúlunk.
- Hamis helykitöltő nem lehet mező: `[REDACTED]`, `[=====>]`, számlisták és 50 karakternél hosszabb tartalom kimarad.

### C. „Bevált?” jelzés a prompt mellett (Worker + napi riport)

- **A kérdés a „Másolás” megnyomása UTÁN jelenik meg**, a prompt-doboz alján: „Bevált? 👍 👎”. Így csak az kérdezzük meg, aki ténylegesen használta a promptot.
  - Miért itt: a meglévő 👍/👎 a cikk alján eddig összesen 2 szavazatot kapott.
- **Tárolás:** Worker KV, napi számláló **útmutatónként**: `fbp:<UTC-nap>:<slug>:<up|down>`. *(Claude döntése a tervírásnál: a promptonkénti kulcs fölösleges, mert a riport és a felirat is útmutatónként összesít, az átszámozás kérdése így meg sem jelenik.)* Böngészőnként és útmutatónként egy szavazat (localStorage). Ugyanaz az adatvédelmi szint, mint a meglévő 👍/👎: csak számláló, nem tároljuk, ki szavazott. Az adatvédelmi oldal szövege kiegészül.
- **Export:** `/feedback-export` → `__fbp`.
  - Napi riport: „👍 Bevált-jelzés tegnap: N (7 nap: M)”.
  - Ha egy útmutató 7 nap alatt legalább 3 👎-t kap, név szerint is megjelenik.
- **Nyilvános felirat — ELHALASZTVA** *(Claude döntése a tervírásnál: ma egyetlen útmutató sem érné el a 10 szavazatot, és a build-lépésnek nincs export-kulcsa. Akkor építjük meg, amikor a napi riport szerint egy útmutató a 10 felé közelít.)* Az eredeti szándék: „Olvasóink X/Y-ának bevált” csak **legalább 10 szavazatnál** jelenik meg, **útmutatónként** összesítve (az összes prompt-szavazat együtt, a cikk fejlécében), a build idején kiszámolva. A build a CI-ban a meglévő export-kulccsal olvassa a `/feedback-export`-ot. Ha az olvasás hibás, nincs felirat; régi számot nem írunk ki. Előre láthatóan sokáig sehol, és ez így rendben van: kitalált számot nem írunk ki.
- **Worker-deploy kézzel**, a `workers_dev = false` és a `preview_urls = false` maradjon kiírva.

### D. „🔧 Ha elakadsz” doboz (fizetős generálás, kis összeg)

**HOL:** a lépések után, a „Következő útmutató” kártya előtt.

**Keresés** *(Claude döntése az ellenőrzés után)*:
- A Google 2023 óta szinte csak állami és egészségügyi oldalaknál mutat GYIK-kibontót a találatban, ezért a FAQPage-jelölésre NEM építünk.
- A problémás keresést maga a látható oldal hozza: minden tétel tünete **látható kérdés-címsor** (h3) az oldalon. A Bing ezt is olvassa.
- A tételek ettől függetlenül bekerülhetnek a meglévő GYIK-blokkba.
- A doboz elsősorban az olvasónak készül; a user ezt kifejezetten kérte.

**MI:** 2–4 tétel, mindegyiknél:

- **tünet** (a kérdés, ahogy az olvasó keresné);
- **miért**, egy mondatban;
- **megoldás**, konkrét lépés, opcionálisan 💬 prompttal;
- **forrás:** link a hivatalos súgócikkre.

A doboz alján egy sor a meglévő Útmutató-varázslóra (`/wizard`) és a Promptépítőre („Nem ez a te eszközöd?”). Ez az F rész.

**Jóváhagyott források** (user 10-23; a letölthetőség ellenőrizve 10-23):

| Szolgáltató | Súgó | Útmutató |
|---|---|---|
| Amazon (Alexa+) | amazon.com/gp/help | 25 |
| OpenAI (ChatGPT) | help.openai.com | 21 |
| Google (Gemini, NotebookLM, Photos) | support.google.com | 26 |
| Anthropic (Claude) | support.anthropic.com | 17 |
| Microsoft (Copilot) | support.microsoft.com | 18 |
| Apple (Apple Intelligence) | support.apple.com | 16 |
| Mistral (Le Chat) | help.mistral.ai (a Le Chat súgója; a docs.mistral.ai fejlesztői doksi NEM) | 10 |

**Engedélylista** *(Claude döntése)*: a forrás-ellenőrző kód csak ezeket az URL-előtagokat fogadja el:
- `help.openai.com/`
- `support.anthropic.com/` (és ha oda irányít át, `support.claude.com/`)
- `support.google.com/gemini/`, `support.google.com/notebooklm/`, `support.google.com/photos/`
- `support.microsoft.com/`
- `support.apple.com/`
- `help.mistral.ai/`
- `www.amazon.com/gp/help/`

Ami nem ezekkel kezdődik, az kiesik. Új előtag csak user-jóváhagyással kerülhet a listára.

- **Perplexity:** 403-at ad gépi letöltésre, ezért nincs doboz.
- **Egyéb eszközök** (Qwen, Grok, Meta AI, DeepSeek, Hugging Face, GitHub Copilot, Cohere, NVIDIA…): nincs doboz, amíg a user egyenként jóvá nem hagy egy hivatalos súgót.
- **Az eszköz nélküli, általános útmutatók** (105): a doboz a nagy asszisztensek (ChatGPT / Gemini / Claude) súgójából épül, és **minden tétel megnevezi az eszközt** („In ChatGPT: …”). *(Builder-döntés, a user ellenőrizheti.)*

**HOGYAN készül** (új modul, `core/` + egy agent-lépés a CI-ban):

1. **Súgócikk-jelöltek keresése:** a szolgáltató súgójának cikklistájából (sitemap vagy kereső) cím-egyezéssel az útmutató eszközére és feladatára. Ha nincs releváns cikk, **nincs doboz**. Ez nem hiba.
2. **Generálás:** 1–3 súgócikk szövege → a modell (az útmutató-író modellje) CSAK ezekből ír tételeket. Minden tételhez a forrás URL-je.
3. **Ellenőrzés:** minden tételt a meglévő forrás-alátámasztás logika (`core/friss-tenyellenorzes.js` → `forrasAlatamasztja`) vizsgál. Ami nincs alátámasztva, kiesik. Ha 2-nél kevesebb tétel marad, nincs doboz.
4. **Átfedés-szűrés:** ha egy tétel az útmutató meglévő „Gyakori hibák” részét ismétli, kiesik.
5. **Fordítás:** csak a doboz megy hu/es-re a meglévő fordítóval, a doboz tartalmának hash-ével cache-elve. Az útmutató többi részét nem fordítjuk újra.
6. **Tárolás:** külön fájl a cikk mellett: `content/elakadas/<slug>.json` → `{ forrasok, en: [...], hu: [...], es: [...], keszult }`. A build ebből rajzolja ki a dobozt. Ha a fájl hiányzik, nincs doboz, a régi nézet marad.
7. **Ütemezés:**
   - **új útmutató:** a megjelenéskor;
   - **régiek:** futásonként legfeljebb N darab, a legolvasottabbal kezdve;
   - N értékét a 3 útmutatós mérés után a büdzsé szerint állítjuk be.
8. **Kill-switch:** a `core/` modulban, teszttel. Kikapcsolva se generálás, se megjelenítés.
9. **Saját költségkeret** *(Claude döntése)*:
   - a D a napi tartalom-futás (hírek, útmutatók, fordítás) **UTÁN** fut;
   - saját napi plafonja **$0,10**;
   - ha a nap addigi költése már elérte a **$0,60**-at, aznap kimarad.
   Így a doboz soha nem állíthatja le a napi tartalmat a $1-os plafonnal.
10. **„Frissítve” dátum** *(Claude döntése, a user ellenőrizheti)*:
    - a doboz megjelenése **valódi tartalmi változás**, ezért a `valodiModositas()` frissítésnek számolja (fejléc, sitemap, IndexNow ugyanazt mondja, a 10-20-i szabály szerint);
    - a napi adag-korlát miatt ez naponta csak N útmutatót érint, nem mind a 373-at egyszerre;
    - a doboz fordítása önmagában NEM számít új frissítésnek.

**Mérés indulás előtt:** 3 valódi útmutatón (1 ChatGPT, 1 Alexa+, 1 általános) a költség és a minőség. Az eredmény és az előnézet a userhez kerül; jóváhagyás után indul az utólagos sor.

### E. „✍️ Szerkesztő ajánlja” (Telegram + Worker + build)

- A napi Telegram-riport alján megjelenik a nap új útmutatóinak listája, mindegyiknél egy **„⭐ Ajánlom”** gombbal (Telegram inline gomb → Worker `callback_query`). A link a **magyar** változatra mutat.
- A Worker a KV-ba írja: `ed:<slug>` → dátum. Export: `__ed`.
- A build kiteszi a címkét az útmutató fejlécébe: „✍️ A szerkesztő ajánlja”. Opcionálisan egy sort a főoldalra.
- **A szöveg csak azt állítja, ami igaz:** a tulajdonos kiválasztotta. Nem állít tesztelést.
- **Ha a user nem nyom gombot, semmi nem jelenik meg.** Nem kötelező feladat.
- **Visszavonás** *(Claude döntése)*:
  - a gomb kapcsoló, a második nyomás leveszi a jelölést; a gomb felirata mutatja az állapotot (⭐ Ajánlom / ✅ Ajánlva — visszavon);
  - régebbi útmutatót a `/ajanl <slug>` paranccsal lehet jelölni, illetve levenni.
- A gomb csak a user Telegram-csevegőjéből fogad el jelölést (a Worker már ellenőrzi a webhook-titkot és a chat-azonosítót).

### F. Továbbvezetés a meglévő eszközökre ($0)

A „🔧 Ha elakadsz” doboz alján, vagy doboz nélküli útmutatóban a lépések után, egy sor: „Nem ezt az eszközt használod? → Melyik MI való neked?” (`/wizard`) · „Saját promptot raknál össze? → Promptépítő”. Ma a varázsló csak a Rólunk oldalról érhető el.

## Külön projektek (később, saját egyeztetéssel)

- **Katalógus-beküldés** (Biztonságos bemásolás, Promptépítő): MI-eszközgyűjtő oldalak, a visszamutató linkért.
  - A fiókot a **user** hozza létre; Claude nem regisztrálhat.
  - Claude összegyűjti a jelölteket árral és feltételekkel, és megírja a beküldési szövegeket.
  - Minden beküldés user-jóváhagyással megy.
- **Hírlevél:** előbb hivatalos dokumentációból ellenőrizzük, hogy a Brevo ingyen tud-e automatikusan küldeni. Utána user-döntés. Az adatvédelmi oldalt frissíteni kell.

## Sorrend

1. **A + B + C + F:** sablon, CSS, kis JS, Worker-végpont, napi riport-sor. $0. Előnézet (helyi szerver + 390 px) → user-jóváhagyás → élesítés.
2. **D:** modul + teszt → mérés 3 útmutatón → előnézet és költség a usernek → jóváhagyás → új útmutatók + napi adag a régiekből.
3. **E:** Telegram-gomb + címke.

## Nem cél / tilos

- új „Megoldás” cikkfajta (user: az útmutatókba);
- a régi útmutatók törzsszövegének gépi átírása;
- jóvá nem hagyott forrás, kitalált hibaelhárítás, kitalált szavazatszám;
- „teszteltük”-típusú állítás;
- második hirdetés az oldalon;
- angol szöveg a hu/es oldalon.

## A builderre bízva

- a CSS/vizuális részletek (a meglévő `g-` stílusrendszerben, „ne gagyi”, előnézettel);
- a súgócikk-kereső pontos módja szolgáltatónként (sitemap vagy kereső);
- a GYIK-ba kerülő tételek száma (a meglévő GYIK legfeljebb 4 kérdés + a doboz tételei, a Google-irányelv szerint).
