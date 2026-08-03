# AI World Co. — Jogi szabályok

> **Ez az Ellenőrző-Agent legfontosabb ellenőrzési pontja.**
> Minden cikk megjelenés előtt ezen átmegy.
> Ha bármelyik szabály sérül → automatikus elutasítás, javítás kérése.

> ⚠️ **FIGYELEM**: Ez nem teljes jogi védelem, csak gyakorlati kockázatcsökkentés.
> Komoly esetekben (per, hatósági levél) **ÜGYVÉD KELL**, nem agent.

---

## 1. Jogi keret (amit ismernünk kell)

> **Frissítve 2026-08-03** (a közönség-váltás után). Korábban ausztrál
> törvényekre hivatkoztunk (Privacy Act 1988, Australian Consumer Law,
> Spam Act 2003…) — az olvasóink 2026-07-31 óta **túlnyomórészt amerikaiak**,
> az üzemeltető pedig **EU-ban (Magyarország)**. Az ausztrál keret ezért már
> nem vonatkozik ránk.

**KÉT jogrendszer érint minket egyszerre:**

| Hol | Mi | Mire vonatkozik |
|---|---|---|
| 🇺🇸 az OLVASÓINK | **FTC** megtévesztő-reklám szabályok | Hamis/megalapozatlan állítás, rejtett hirdetés |
| 🇺🇸 | **FTC Endorsement Guides** | Ha valaha fizetett ajánlást teszünk közzé, JELÖLNI kell |
| 🇺🇸 | **DMCA** (szerzői jog) | Más szövegének/képének átvétele |
| 🇺🇸 | **COPPA** | 13 év alattiak adatai — nálunk nincs regisztráció, de figyelni kell |
| 🇺🇸 | tagállami rágalmazási jog | Cégekről/emberekről tett valótlan állítás |
| 🇪🇺 az ÜZEMELTETŐ | **GDPR** | A visszajelzés/chat adatai, IP-cím kezelése |
| 🇪🇺 | EU fogyasztóvédelem | Megtévesztő kereskedelmi gyakorlat |

### A mi főkockázatunk változatlanul 3 dolog

A jogi keret más lett, a VESZÉLY ugyanaz — ezért a gyakorlati szabályok
(2-6. szakasz) érvényben maradnak:

1. **Megtévesztő tartalom** (FTC / EU fogyasztóvédelem) — az AI hibás
   állítást ír, az olvasó kárt szenved. Ez a leggyakoribb és legvalósabb
   kockázatunk; a hitelesség-kapu (core/truth-gate.js) pontosan ez ellen véd.
2. **Rágalmazás** — valakiről vagy egy cégről valótlant/sértőt írunk.
3. **Szerzői jog** (DMCA) — más cikkét lemásoljuk vagy közel szó szerint
   átfogalmazzuk.

---

## 2. Tényellenőrzés — KÖTELEZŐ szabályok

### Minden konkrét állításnak **forrása kell**

| Állítás típus | Példa | Mit kell ellenőrizni |
|---|---|---|
| **Számok** | "GPT-5 has 175 billion parameters" | Hivatalos forrás link kötelező |
| **Idézetek** | "Sam Altman said..." | Eredeti idézet, eredeti link |
| **Tények** | "Anthropic raised $50B" | 2+ független forrás |
| **Funkciók** | "Claude can now read PDFs" | Hivatalos dokumentáció link |
| **Árak** | "$20/month for ChatGPT Plus" | Hivatalos árlista |

### TILOS állítások forrás nélkül

- ❌ "Studies show that..." (melyik study?)
- ❌ "Experts say..." (melyik szakértő?)
- ❌ "It is well known that..." (kinek?)
- ❌ "Recent reports indicate..." (link nélkül NEM)

### Bizonytalanság jelölése
Ha az AI nem 100%-ban biztos egy tényben:
- ✅ "According to early reports..." (jelzi hogy lehet pontatlan)
- ✅ "OpenAI has not yet confirmed..." (őszinte)
- ✅ "Based on leaked information..." (forrás jellege jelölve)

---

## 3. Cégekről / termékekről írás — Veszélyes terület!

### Mit **SZABAD** (biztonságos):

- ✅ **Tényekről írni** (mi a termék, mikor jött ki, mit tud)
- ✅ **Hivatalos infókat** idézni a cég blogjából
- ✅ **Funkciókat bemutatni** ("how to use it")
- ✅ **Saját tapasztalatot** leírni ("when I tested this...")

### Mit **NEM SZABAD** (kockázatos):

- ❌ **"X cég csaló"** — rágalmazás, perelhető
- ❌ **"Y termék rosszabb mint Z"** — összehasonlító állítás, megalapozatlanul megtévesztő
- ❌ **"X cég pénzügyileg bukik"** — befektetési tanácsadás határa
- ❌ **Belső infók** idézése ("a leaked email shows...") — kivéve nagy hírek megerősített forrással
- ❌ **Magánéleti dolgok** CEO-król, alkalmazottakról

### Példa: **JÓ vs ROSSZ** megfogalmazás

> ❌ ROSSZ: *"Claude is better than ChatGPT for coding."*
> ✅ JÓ: *"Claude has specific features designed for code, like extended context windows. Here's what they can do for you."*

> ❌ ROSSZ: *"OpenAI's recent issues show they're losing direction."*
> ✅ JÓ: *"OpenAI announced [specific change] on [date]. Here's what it means for users."*

---

## 4. Személyekről írás — Rágalmazás veszély!

### Híres emberek (CEO-k, kutatók, stb.)

A `company-info.md` szerint **mi NEM írunk híres emberekről** általában. De ha mégis kell (pl. egy cég CEO-ja bejelent valamit):

#### ✅ SZABAD:
- Hivatalos nyilatkozatait idézni (linkkel!)
- Hivatalos szerepét említeni ("Sam Altman, CEO of OpenAI...")
- Hivatalos cselekedeteit leírni ("Altman announced that...")

#### ❌ NEM SZABAD:
- Magánéleti dolgok ("Altman's relationship...")
- Spekuláció ("Altman likely is planning...")
- Negatív karakterfestés ("the controversial CEO...")
- Pletyka tovább terjesztése ("rumors suggest...")

### Olvasói kommentek / X posztok

Ha olvasói reakciókat idézünk:
- ✅ **Nyilvános** poszt kell (X/Twitter, hivatalos blog)
- ✅ **Eredeti link** mellette
- ❌ **Privát üzenet, magánbeszélgetés** TILOS

---

## 5. Szerzői jog — Tartalom másolás

### **TILOS** szóról-szóra másolni más cikkből!

#### Hogyan idézzünk helyesen?

**A) Rövid idézet (max 1-2 mondat):**
> *"According to TechCrunch, 'OpenAI's new model represents a significant leap forward.'"* [link]

**B) Saját szavakkal átfogalmazás (legjobb!):**
> Eredeti: *"OpenAI's revenue grew 50% year-over-year, reaching $5 billion in Q3 2026."*
>
> Mi: *"OpenAI's business is growing fast — they brought in around $5 billion in the third quarter of 2026, up 50% from the year before."* [link a forrásra]

**C) Adatok / statisztikák:**
> Tényadatok **NEM szerzői joggal védettek**, csak az kifejezés mód.
> Tehát: "OpenAI revenue was $5B" — ezt szabadon írhatjuk, **DE link a forrásra**.

#### Képek és vizuálok

- ❌ Más cég képét **engedély nélkül NEM** használjuk
- ✅ **Saját generált képek** (Gemini Imagen, Flux) — OK
- ✅ **Hivatalos press kit** képek (cég megengedi) — OK linkkel
- ✅ **CC0 / Public Domain** képek (pl. Unsplash) — OK
- ⚠️ **Screenshot-ok cikkből / app-ból** — limitált használat, fair use territory

---

## 6. Affiliate és szponzor — Transzparencia KÖTELEZŐ!

### Affiliate linkek

Az **FTC** (amerikai fogyasztóvédelmi hatóság) szigorú — az Endorsement Guides szerint a fizetett ajánlást EGYÉRTELMŰEN jelölni kell:
- ✅ **Cikk elején** kötelező jelölés: *"This article contains affiliate links."*
- ✅ Minden affiliate link mellett: *"(affiliate)"* vagy ikon
- ❌ **TILOS** rejteni a kapcsolatot
- ❌ **TILOS** "objektívnek" tűnni miközben jutalék jár

### Szponzorált tartalom

- ✅ **Cikk teteje, félkövéren**: *"Sponsored — This article is brought to you by [Company]."*
- ✅ **URL-ben is**: pl. `/sponsored/` mappa
- ❌ **TILOS** "regular cikknek" álcázni
- ❌ **TILOS** szponzor cégről hamis pozitív állítás

### Példa rossz vs jó

> ❌ ROSSZ: *"Looking for the best AI tool? We recommend X."* (rejtett affiliate)
> ✅ JÓ: *"**Sponsored** by X. Here's how their AI tool works."* (transzparens)

---

## 7. AI által írt — Transzparencia szabályok

### 2026-ban ez világszerte fejlődő terület (US és EU egyaránt). Mi proaktívak vagyunk:

- ✅ **Minden cikk alján**: *"Written and edited by AI World Co.'s autonomous AI agents."*
- ✅ **About oldalon**: részletes leírás hogyan dolgoznak az agentek
- ✅ **Forrás transzparencia**: minden hír forrása linkelve

### Miért fontos?
- Az AI-tartalom jelölése egyre szigorúbb elvárás (US állami törvények, platform-szabályok)
- Az **EU AI Act** KÖZVETLENÜL vonatkozik ránk: az üzemeltető EU-ban van
- Az **olvasói bizalom** alapja

---

## 8. Felhasználói adatok — GDPR (az üzemeltető EU-ban van)

> **Frissítve 2026-08-03.** A régi szöveg ausztrál Privacy Act-re és Google
> Analyticsre hivatkozott, és azt írta, hogy "nincs semmilyen adatgyűjtés" —
> ez azóta nem pontos. Az alábbi a MOSTANI állapot.

### Amink VAN, és mit kezel

| Mi | Adat | Hogyan |
|---|---|---|
| **Cloudflare Web Analytics** | oldalletöltés, ország, hivatkozó | süti NÉLKÜL, nem személyazonosít |
| **👍/👎 visszajelzés** | szavazat + cikk-azonosító | névtelen |
| **Ügyfélszolgálat** (chat / űrlap / support@) | amit a látogató ír + **hashelt** IP | az IP csak a napi limit miatt, hasítva |

### Amink NINCS (és ez tudatos)

- Nincs regisztráció, nincs felhasználói fiók
- Nincs komment szekció
- **Nincs hírlevél** — 2026-07-27-én teljesen kivezettük
- Nincs Google Analytics, nincs hirdetési követő
- Nincs sütiket használó nyomkövetés → **cookie-banner sem kell**

### Amire figyelni kell (GDPR)

- A chatben a látogató **véletlenül is írhat személyes adatot** — ezt nem
  hasznosítjuk, nem adjuk tovább
- **Adattörlési kérés**: a support@ címen kérhető, teljesíteni kell
- Ha valaha LESZ regisztráció vagy hírlevél: adatvédelmi tájékoztató,
  kifejezett hozzájárulás és leiratkozási lehetőség KÖTELEZŐ (GDPR + a
  US-oldalon a CAN-SPAM)

---

## 9. AI hallucináció — A LEGNAGYOBB kockázat!

### Mi a hallucináció?
Az AI **magabiztosan kitalál** dolgokat — pl. nem létező idézetet, hamis számot, nem létező papírt idéz.

### Ez **megtévesztő tartalom** — FTC-ügy az olvasóink, EU-ügy a mi oldalunkon!

### Ellenőrző-Agent **kötelező** ellenőrzései:

1. ✅ **Minden szám / százalék** — forrásban tényleg ott van?
2. ✅ **Minden idézet** — szóról-szóra megegyezik a forrással?
3. ✅ **Minden név** — tényleg ezt a személyt nevezi a forrás?
4. ✅ **Minden URL** — működik, a megfelelő oldalra vezet?
5. ✅ **Minden dátum** — egyezik a forrással?

### Ha nem ellenőrizhető → **NEM publikálunk**!

---

## 10. Kritikus témák — extra óvatosság

### Ezek a témák **EXTRA ellenőrzést** igényelnek:

| Téma | Miért veszélyes | Mit csinálunk |
|---|---|---|
| **Új cég bejelentés** | Lehet hamis hír / spekuláció | 2+ forrás kötelező |
| **Tőzsdei mozgás** | Pénzügyi tanácsnak tűnhet | Csak tény, nincs "buy/sell" javaslat |
| **Biztonság/hack** | Hamis riasztás kár | Hivatalos megerősítés kell |
| **Konkurens kritizálás** | Defamation | Ne csináljuk |
| **AI baleset / hiba** | Spekuláció veszélyes | Csak megerősített tények |

---

## 11. Ellenőrző-Agent ellenőrzőlista (cikkenként!)

Minden cikkre az Ellenőrző-Agent **kötelezően** lefuttatja:

### ✅ Tartalmi ellenőrzések:
- [ ] Minden konkrét szám/idézet forrással alátámasztva?
- [ ] Minden link működik és releváns oldalra mutat?
- [ ] Nincs spekulatív / "úgy hallom" állítás?
- [ ] Nincs összehasonlító negatív állítás más cégről?
- [ ] Nincs híres személyről pletyka?
- [ ] Nincs orvosi / pénzügyi / jogi tanács?
- [ ] Amerikai angol használva? (color/organize/center — NEM colour/organise/centre)

### ✅ Jelölések:
- [ ] Affiliate link → jelölve cikk tetején + linkek mellett?
- [ ] Sponsored → félkövér jelölés cikk tetején?
- [ ] AI által írt → jelölés a cikk alján?
- [ ] Kép forrás → alt text + forrás megadva?

### ✅ Brand:
- [ ] Tanító + barátságos + magyarázó hangnem?
- [ ] Minden szakszó magyarázva?
- [ ] "Mit jelent ez számodra?" szekció megvan?
- [ ] Nem ítélkező / nem lejárató?

### ❌ Ha bármelyik FAILED → vissza Íróhoz módosításra!

---

## 12. Eszkalációs útvonal

### Mikor szól az agent a felhasználónak (neked!)?

| Helyzet | Mit csinál az agent |
|---|---|
| **Hivatalos panasz email** érkezik | Telegram értesítés azonnal |
| **Jogi felszólítás** (cease and desist) | Telegram + cikk **azonnali eltávolítása** |
| **Tartalom-vita** olvasóval | Telegram értesítés, te döntesz |
| **Bizonytalan jogi helyzet** | Telegram, NEM publikál addig |
| **Új törvény hírek** | Telegram összefoglaló |

---

*Készült: 2026-06-04, pacsi84 + Claude.*
*Ezt a fájlt évente felül kell vizsgálni (vagy ha új törvény jön).*
