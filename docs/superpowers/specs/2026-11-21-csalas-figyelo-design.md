# Csalás-figyelő + /scams oldal — design (2026-11-21)

Előzmény: a user 11-16-án kérte („holnap biztonsági oldalt csinálunk”); a brainstorming 11-19-én lezajlott, a döntések
ott születtek (lásd 4–5. fejezet). A terv írása 11-20-ról 11-21-re csúszott (user: „az holnap!”).
Mintakép (a user látta és megértette): memoria/mintak/csalas-minta.png, rajzoló: memoria/mintak/csalas-minta.mjs
(eldobható minta, a repón kívül).

## 1. Szándék — miért
Az oldal hétköznapi embereknek tanítja az MI használatát (US/nemzetközi közönség). Az MI-vel támogatott csalások
(hamis hívás klónozott hanggal, deepfake, csomagos SMS, „bankod vagyok” üzenet) épp ezt a közönséget érik. A user
azt kérte, hogy az oldal **időben figyelmeztessen** az új csalásokra, és **mutassa meg, hogyan lehet védekezni**.

A user szavai (11-19): „de a hírekben is publikálnánk!” — a csalás-figyelmeztetés hírként is jelenjen meg, ne csak
egy külön oldalon. A kép a user választása: „A lenne a legjobb!” = a saját kódunk rajzolja a megjelölt csaló üzenetet.

## 2. Célok
- G1. **Automata csalás-figyelő**: kijelölt hivatalos csalás-forrásokból a gép kiválogatja az ÚJ, hétköznapi embert
  érintő csalásokat, és mindegyikről csalás-sablonos hírt ír.
- G2. A csalás-hír a **hírek között** jelenik meg, naponta legfeljebb **+1 KÜLÖN helyen**: a napi 4 rendes hírből és a
  +2 termékhír-helyből NEM vesz el.
- G3. Minden csalás-hírnek van **saját rajzolt képe**: kitalált csaló üzenet (SMS / e-mail / cset / hívás-képernyő)
  ①②③ piros jelöléssel és jól látható „PÉLDA – CSALÁS” vízjellel, a cikk nyelvén (en/hu/es).
- G4. **/scams oldal** (en, /hu/scams, /es/scams): gyűjti az összes csalás-hírt és a régi csalásos útmutatókat,
  átnézve, hivatalos forrásból.
- G5. A régi csalásos útmutatók (6 db, mind forrás nélkül írva) átnézése hivatalos forrás alapján, en/hu/es.

## 3. Nem cél / anti-cél
- **Anti-cél: riogatás.** Kattintásvadász cím („Ez a csalás MINDENKIT elér!”) nincs; a hangnem nyugodt, gyakorlati.
- **Anti-cél: valódi cég utánzása a képen.** Valódi cégnév, logó, valódi domain, valódi telefonszám SOHA. Ha a kép
  igazi csaló üzenetként felhasználható lenne, az kudarc, akkor is, ha „működik”.
- **Anti-cél: kitalált védekezési lépés.** A védekezés lépései CSAK a hivatalos forrásból jöhetnek (nem a modell
  emlékezetéből) — ez a tényközpont (2026-11-12-tenykozpont-design.md) szabálya ide is.
- Képernyőkép a védekezésről (pl. „így kapcsold be a kéttényezős azonosítást” felület) NEM — kitalált felület veszélye.
- Céges (vállalati IT-) biztonsági hírek, sérülékenység-riasztások (CVE, „PHP core” stb.), választási tisztviselőknek
  szóló figyelmeztetések NEM csalás-hírek ebben az értelemben.
- Heti csalás-összefoglaló nem készül (3. megoldás, elvetve — lásd 4.).
- Interaktív csalás-kvíz / „bemásolod és megmondja” eszköz NEM (11-07-én elvetett ötletlista része).

## 4. Megközelítések (11-19, a user az 1-et választotta)
| | Megoldás | Előny | Hátrány |
|---|---|---|---|
| **1 ✅** | **Saját csalás-ág**: jelölt csalás-források → szűrő → csalás-sablonos hír napi +1 külön helyen + /scams gyűjtőoldal | Időben figyelmeztet, van védekezési rész és kép, nem szorítják ki a termékhírek | A legtöbb munka |
| 2 | Csak a rendes hírek közé, címkével | Kevesebb munka | A termékhír-elsőbbség miatt ritkán jutna be a napi 4 közé; a hírsablonban nincs védekezés |
| 3 | Heti csalás-összefoglaló vasárnap | Olcsó, jól ellenőrizhető | Nem friss: akár egy hetet késik |

A user indoka (11-19): az 1-es „pontosan azt adja, amit kértem: friss figyelmeztetés + védekezés + kép”.

## 5. Ami el van döntve (a user döntései)
- D1. **1. megoldás** (fent).
- D2. **Napi +1 KÜLÖN hely** a csalás-hírnek; a 4 hírből nem vesz el.
- D3. **A hírek között is megjelenik** (hírlistán, főoldalon, közösségi posztokban — mint bármely hír).
- D4. **Kép = „A”**: a gép rajzolja (sharp + SVG, ugyanaz az eszköz, mint a Motion Reel felirata, $0), MI-képgyártó
  nélkül. CSAK `example.com` alakú link, CSAK kitalált 555-01xx telefonszám, valódi cégnév/logó SOHA, jól látható
  „PÉLDA – CSALÁS” / „EXAMPLE – SCAM” / „EJEMPLO – ESTAFA” vízjel. Minden csalás saját képet kap a csatornája szerint
  (SMS, e-mail, cset, hívás-képernyő), mindhárom nyelven a cikk nyelvén.
- D5. **Csalás-sablon** (a 11-19-i vázlat):
  ```
  🚨 [Csalás neve] — mi történik?          ← rövid leírás a hivatalos forrásból
  [KÉP: megjelölt csaló üzenet ①②③]        ← „PÉLDA – CSALÁS” vízjellel
  ① … ② … ③ …                               ← a jelek magyarázata (a képpel egyezik)
  🛡️ Így védekezz — 1., 2., 3.               ← hivatalos forrásból
  🆘 Ha már megtörtént                      ← hová jelentsd (pl. ic3.gov)
  ```
- D6. **Külön /scams oldal** en/hu/es; a régi csalásos útmutatók ide kerülnek, hivatalos forrásból átnézve.
- D7. **Új forrás CSAK user-jóváhagyással** (állandó user-szabály; „100/100 és hasznos”).
- D8. Állandó szabályok érvényesek: **ár nincs** (core/ar-tilalom.js), **készüléknév nincs**, EU AI Act jelölés,
  amerikai angol, nem angol oldalon nincs angol mondat, oldalanként EGY hirdetés, papírlapos fejléc minden oldalon,
  egy H1 / lap, ismert tévedések (core/ismert-tevedesek.js), rögzített slug.

## 6. Mért tények (11-19 és 11-21)
- **Forrás-próba** (helyből 11-19, az USA-ból a CI-ben 11-21, `forras-proba.yml`, $0):
  - ✅ `https://www.ic3.gov/PSA/RSS` (FBI IC3 nyilvános figyelmeztetések) — CI-ből 200. Okt.: ~5 tétel, ebből hétköznapi
    csalás kb. 1–2 („Scammers Exploit 2026 U.S. Midterm Election…”); a többi tisztviselőknek / IT-nak szól
    („white powder letters”, „Critical Vulnerability Alert: PHP Core”).
  - ✅ `https://blog.google/technology/safety-security/rss/` (Google Safety & Security) — CI-ből 200; ~4 bejegyzés/hó,
    vegyes; csalás-hírt csak az ad, amelyik KONKRÉT csalást ír le (a „Cybersecurity tips and tools…” típusú általános
    tippgyűjtemény és a „Designing for privacy on intelligent eyewear” NEM — lásd 8.2).
  - ⚠️ `security.googleblog.com` — elérhető, de technikai, és az utolsó bejegyzés 2026-04-23 → nem javasolt.
  - ✅ `openai.com/news/rss.xml` — már figyeljük (néha „disrupting malicious uses” jelentés).
  - ❌ FTC (consumer.ftc.gov/consumer-alerts és minden próbált RSS-cím) — helyből ÉS az USA-ból is 404 (robotszűrő vagy
    cím) → automatikusan NEM használható. ❌ cisa.gov — főleg céges. ❌ FCC, Microsoft Security — 403.
- **KÖVETKEZMÉNY**: a jelenlegi forrásokkal a „napi +1 hely” várhatóan **havi ~2–6 csalás-hírt** ad, nem napit. A hely
  plafon, nem kvóta: ha nincs friss, valódi csalás, aznap nem készül csalás-hír (töltelék SOHA).
- **Régi csalásos útmutatók** (mind 0 hivatalos forrással):
  how-to-spot-ai-scams-deepfakes-and-fake-content (06-24) · how-to-spot-a-deepfake-video-or-voice-clone-before-you-share-it (08-10) ·
  how-to-spot-a-phishing-email-or-scam-text-before-you-click (08-12) · how-to-spot-an-ai-scam-call-fake-email-or-deepfake-voice-today (08-29) ·
  how-to-check-if-a-suspicious-message-is-a-scam-by-pasting-it-into-an-a… (09-17) · how-to-fact-check-a-suspicious-text-or-link-before-forwarding-it (11-01).
  Együtt 30 nap alatt ~35 belépő (11-19-i mérés).
- **Ár-őr és kárösszeg**: a core/ar-tilalom.js `arAllitasok()` a kárösszeget NEM jelzi („Americans reported losing
  $12.5 billion…”, „a $500 fee in gift cards”, „lost an average of $1,200”) — terméknév nélküli összeg, nem termékár.

## 7. A rendszer, ahogy ma működik (amire épül)
- Hírlánc: `agents/rss-scraper` (forrás: `sources/rss-feeds.json`, 72 forrás, `enabled`, `category`, `priority`) →
  vázlat `content/drafts/` → `agents/iro` (WRITER_SYSTEM_PROMPT, kötelező „## What this means for you”) →
  `agents/ellenorzo` (gépi kapuk core/auto-check-codes.js + AI-bíró + truth-gate + ismert tévedések) → `content/articles/`.
  A CEO (`agents/ceo/agent.js`) számolja a keretet (core/hir-keret.js `hirIroKeret`) és indítja az Írót
  `--limit N --termek-extra M` kapcsolókkal.
- **Az extra hely mintája már létezik**: core/hir-elsobbseg.js — `valogat()` n rendes + `extra` hely CSAK termékhírnek,
  `_meta.termek_extra`, `termekExtraMaradek()`, `nyitottExtraHely()`, kill-switch `HIR_ELSOBBSEG_BE`. Útmutatóknál
  ugyanez: core/lefedettseg-extra.js (`_meta.extra_slot`). A csalás-hely ugyanígy épüljön (külön modul, külön mező,
  külön kill-switch, teszt).
- Fordítás: `agents/translator` a TELJES markdownt (frontmatterrel együtt) fordítja → `content/translations/<fájl>.json`
  `{hu, es}`; a gyorsítótár fájl+nyelv kulcsú.
- Borító: `agents/designer/agent.js` → `website/assets/images/<slug>.jpg` (1280×720, FLUX.2 klein 4B, tartalék schnell);
  a build `${slug}.jpg`-t keres. Megosztás-kép: core/share-images.js. FB-kép 4:5.
- Gyűjtőoldal minta: /trending (core/trend-radar.js + website/build.js, menü + lábléc + sitemap), papírlapos fejléc
  (core/lap-hero.js, core/lap-oldalak.js), hirdetés (core/ads.js).
- Képrajzolás minta: core/motion-reel.js (sharp + SVG feliratok); a mintakép rajzolója memoria/mintak/csalas-minta.mjs.
- Őrszem minta: `memory/<nev>-guard.json` `{at, problems}` → core/daily-report.js → Telegram.

## 8. A megoldás
### 8.1 Csalás-források
- `sources/rss-feeds.json`-ban új jelölés a forráson (pl. `"csalas": true`); a jelölt forrás tételei a csalás-ágba mennek,
  NEM a rendes hírek közé (a rendes hírlánc ne írjon róluk rendes hírt is — dupla cikk tilos).
- Induló forráslista — **✅ USER JÓVÁHAGYTA 11-21** („Mindkettőt”): `https://www.ic3.gov/PSA/RSS` (FBI IC3) +
  `https://blog.google/technology/safety-security/rss/` (Google Safety & Security). Más új forrás továbbra is csak
  user-jóváhagyással (D7).
- **✅ USER-DÖNTÉS 11-21 — USA-specifikus csalás MEHET, 3 nyelven** („Igen, 3 nyelven”): a csalás-hír KIVÉTEL az
  „országspecifikus szolgáltatásra nem építünk cikket” szabály alól. Az amerikai hivatal (IRS, Social Security,
  választási szervek) megnevezhető, de a trükköt és a védekezést általánosan kell megírni, hogy a hu/es olvasónak is
  hasznos legyen; minden csalás-hír hu/es fordítást kap, mint bármely hír. (A kivétel CSAK a csalás-hírre szól.)
- Frissesség: csak a forrásban **legfeljebb 7 napos** tétel lehet csalás-hír (régi figyelmeztetés nem „időben”).

### 8.2 Szűrő („új, hétköznapi embert érintő csalás?”)
- Minden csalás-forrás új tételére egy olcsó besorolás: igen/nem + csatorna (sms / email / chat / call / social / web) +
  egysoros ok. **Igen** = a tétel egy KONKRÉT, magánembereket célzó csalást (vagy csalás-hullámot) ír le: ki a csaló,
  milyen csatornán, mit kér. **Nem**: tisztviselőknek/cégeknek szóló, sérülékenység, általános tippgyűjtemény konkrét
  csalás nélkül, és egy új csalásvédelmi TERMÉKFUNKCIÓ bejelentése is (pl. „csalásszűrés az üzenetküldőben”) — az
  termékhír, nem figyelmeztetés.
- *(Én döntöttem)* A csalás-forrás „nem” tétele ELDOBÓDIK, nem megy a rendes hírek közé (az új rendes forrás lenne,
  ahhoz külön user-jóváhagyás kell). A rendes forrásokból (pl. Google Workspace, OpenAI) jövő termékhírek útja változatlan.
- Ugyanarról a csalásról (pl. két forrás ugyanazt a választási csalást írja) csak EGY hír készül; korábbi csalás-hírünk
  témájának ismétlése is kimarad (core/tema-ismetles mintájára).
- Elutasított / kihagyott tételek okkal a naplóba (és a riport-sorba, 8.7).

### 8.3 A csalás-hír (sablon)
- A hír a rendes hírlánc része (ugyanaz az író, ellenőrző, fordító, közösségi lánc), de **csalás-sablonnal**:
  H1 cím → „In short” → **What's happening** (a hivatalos forrásból) → **[a rajzolt kép]** → **Warning signs** ①②③
  (szó szerint egyezik a kép jeleivel) → **How to protect yourself** (1-2-3, CSAK a forrásban szereplő vagy hivatalos
  fogyasztóvédelmi oldalon igazolt lépés) → **If it already happened** (bejelentés: ic3.gov, reportfraud.ftc.gov, a
  bank / kártyakibocsátó; plusz egy országfüggetlen mondat: „or your local police / consumer protection agency”) →
  a kötelező **What this means for you** (a szerkezet-kapu miatt; itt röviden: kit érint leginkább).
- `_meta.csalas = { csatorna, forras_id, … }` és `_meta.csalas_extra: true` (ha a külön helyen született).
- **Védekezési lépések forrása** *(én döntöttem)*: (1) ami a csalás forrásában áll; ha ott nincs elég, (2) egy KÉZZEL
  ellenőrzött, rögzített **védekezés-tár** (pl. `core/csalas-vedekezes.js`): csatornánként (sms / email / call / chat /
  social / web) 3–6 lépés, mindegyik mellett a hivatalos forrás URL-je (FTC consumer advice — böngészőből kézzel olvasva,
  mert a gép nem éri el —, FBI IC3, CISA „Secure Our World”), teszttel. Az író csak ezekből választhat (szó szerint vagy
  hű átírással); ha a csatornához nincs tár-tétel és a forrás sem ad lépést → nincs csalás-hír. A tár kibővítése kézi
  munka (új tétel = forrás + teszt), mint az ismert tévedéseknél.
- Pénzösszeg: **kárösszeg** (pl. „a csalók ajándékkártyában kérnek pénzt”, FBI-statisztika) CSAK a forrásból szó szerint;
  termékár továbbra is tilos (D8).
- Az oldalon a csalás-hír jelölést kap (pl. „🛡️ Scam alert” címke a hírkártyán és a cikk fejlécében).

### 8.4 A napi +1 hely
- Új modul (pl. `core/csalas-figyelo.js`): `CSALAS_FIGYELO_BE` kill-switch (kézi, `core/` oldalon, teszttel — a config
  `enabled` NEM kapcsol ki semmit), `CSALAS_EXTRA_NAPI = 1`, `csalasExtraMaradek()`, `csalasHir(meta)`.
- A CEO a rendes hír-keret és a termék-extra mellett ezt is számolja, és az Írónak külön adja át; a `_meta.csalas_extra`
  hír NEM számít a napi 4-be, sem a termék-extrába. A publikált + váró csalás-vázlat levonódik (a hir-keret.js-ben
  javított rés — 11-05 — itt ne ismétlődjön).
- Ha a csalás-hír elbukik az ellenőrzőn, ugyanaz az átdolgozás jár neki, mint bármely hírnek; ha végleg elbukik,
  aznap nincs csalás-hír.

### 8.5 A rajzolt kép
- Új modul (pl. `core/csalas-kep.js`), a mintakép rajzolójára építve, 4 csatorna-sablon: SMS, e-mail, cset, hívás.
- Bemenet: feladó, 2–5 soros üzenet, a 3 jelölt szövegrész és a 3 magyarázó mondat.
- **A példaüzenet KITALÁLT, és ezt vállaljuk** (a user 11-19-én így hagyta jóvá a mintaképet: „Kitalált példa a
  felismeréshez”): az író a forrásban leírt csalás alapján ír egy illusztratív üzenetet. Szabály: a ①②③ jel CSAK a
  forrásban megnevezett csalás-jegy lehet (pl. sürgetés, ajándékkártyás fizetés, furcsa link); az üzenet nem tulajdonít a
  forrásnak idézetet; a kép és a szöveg „Example — not a real message” jelölést kap. Az ellenőrző ezt a jelölt
  példablokkot nem kezeli forrásállításként (a UI_NOT_IN_SOURCE / truth-gate kivétel CSAK erre a blokkra), helyette a
  kép-őr (lent) és a ①②③ ↔ forrás-egyezés ellenőrzése fut rá.
- **Kép-őr (kód, nem prompt)**: link CSAK `*.example.com` / `example.com`; telefonszám CSAK 555-01xx; a szövegben nem
  lehet valódi márka- vagy cégnév (a tool-links.json, a forráslista cégei és egy alap márkalista — bank, futárcég,
  webshop — alapján); hiba esetén a kép nem készül, a hír kép nélkül NEM jelenik meg (vissza átdolgozásra).
- Méretek: a cikkbe és a Facebookra 4:5 (1080×1350, mint a minta); borítónak (hírkártya, megosztás) 16:9 változat
  ugyanabból a sablonból. A designer (MI-borító) a csalás-hírt kihagyja.
- Nyelv: a kép felirata (cím, üzenet, jelmagyarázat, vízjel, lábjegyzet) a cikk nyelvén — a hu/es kép a lefordított
  szövegből készül (a „nem angol oldalon nincs angol mondat” szabály a képre is áll).
- Alt-szöveg minden képen (a csalás leírása + „example of a scam message, not real”).

### 8.6 /scams oldal
- Útvonal: `/scams`, `/hu/scams`, `/es/scams`; sitemap, hreflang, canonical, mint a /trending-nél.
- Tartalom: papírlapos fejléc → **Latest scam alerts** (a csalás-hírek, legújabb elöl, a rajzolt kép kicsinyítve +
  egymondatos leírás) → **Know the signs** (az átnézett régi útmutatók) → **Report a scam** doboz (ic3.gov,
  reportfraud.ftc.gov + országfüggetlen mondat) → EU AI Act címke. Oldalanként 1 hirdetés.
- Elérés: link minden csalás-hírből a /scams-ra; *(én döntöttem)* menüpont „🛡️ Scams” (hu: „🛡️ Csalások”, es:
  „🛡️ Estafas”) a 🔥 Felkapott után + lábléc-link — a 10-18-i tanulság szerint a csak láblécben lévő oldal láthatatlan.
  Mobilon a fejléc nem törhet két sorba (a mobil CSS a web-designer agent konstansában él) — előnézetben ellenőrizni.
- Nincs töltelék: ha még csak 0–1 csalás-hír van, az oldal az útmutatókkal és a bejelentő dobozzal is teljes.

### 8.7 Régi útmutatók átnézése (G5)
- Mind a 6 útmutató en/hu/es átnézése hivatalos fogyasztóvédelmi forrás alapján (FTC consumer advice — kézzel, böngészőből
  olvasva, mert a gép nem éri el —, FBI IC3, a gyártók hivatalos súgói); `official_sources` és `fact_human_ok` a _metába.
- A kitalált részletek (képernyő-szöveg, felület, statisztika) ki; az URL marad.
- *(Én döntöttem)* Ha egy útmutató ALAPÖTLETÉT a hivatalos források nem támasztják alá (jelölt: „check if a suspicious
  message is a scam by pasting it into an AI” — 09-17), az útmutató nem kerül a /scams oldalra, és a hu/es/en szövegbe
  bekerül a hivatalos óvatosság (pl. személyes adatot ne másolj be); levétel / 301 csak külön user-döntéssel.

### 8.8 Jelentés és mérés
- Napi Telegram-sor: „🛡️ Csalás-figyelő: N új tétel · K csalás · M megírva / okok” (őrszem: `memory/csalas-guard.json`),
  és ha a feltétel nélkül futó lépés nem futott, „⚠️ NEM FUTOTT” (11-05-i tanulság: feltételes ágban ülő lépés = néma halál).
- Mérés ~4 héttel élesítés után: csalás-hírek átlagos látogatása vs. a hírátlag (5,1), FB-elérés, a /scams belépői.

### 8.9 Költség
- Szűrő: néhány olcsó hívás/nap (< $0,01); csalás-hír: mint egy rendes hír (~$0,01–0,02 + fordítás). Kép: $0.
  Belefér a napi $1 / havi $25 plafonba.

### 8.10 Élesítés
- Kill-switch-csel (`CSALAS_FIGYELO_BE`) érkezik; előnézet a usernek (helyi build scratchpad-másolatban, Chrome, 390 px
  mobil + sötét mód) egy próba-csalás-hírrel és a /scams oldallal → jóváhagyás → élesítés.

## 9. A builderre bízva / az én döntéseim (a user ellenőrizheti)
- *(Én döntöttem)* A kárösszeg megengedett, ha a forrásban szerepel — nem termékár (az ár-őr is átengedi).
- *(Én döntöttem)* 7 napos frissességi határ a forrás tételére.
- *(Én döntöttem)* „Scam alert” címke a hírkártyán; a /scams link minden csalás-hírben.
- *(Én döntöttem)* A „What this means for you” szakasz marad a csalás-sablonban is (a szerkezet-kapu és az impact-doboz miatt).
- *(Én döntöttem)* A bejelentési helyek: amerikai hivatalok + egy országfüggetlen mondat (US-közönség, de nem zárjuk ki a többit).
- A builderre: a szűrő pontos modellje és promptja (a router meglévő olcsó modelljei közül), a kép-bemenet átadásának módja
  (a fordítás a teljes markdownt fordítja — a szerkezetnek túl kell élnie a fordítást), a kép-sablonok pontos rajza a minta
  stílusában, a menühely technikai megvalósítása a mobil fejléc szabályai szerint (a mobil CSS a web-designer agent konstansában él).
