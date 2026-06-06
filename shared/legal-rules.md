# AI World Co. — Jogi szabályok

> **Ez az Ellenőrző-Agent legfontosabb ellenőrzési pontja.**
> Minden cikk megjelenés előtt ezen átmegy.
> Ha bármelyik szabály sérül → automatikus elutasítás, javítás kérése.

> ⚠️ **FIGYELEM**: Ez nem teljes jogi védelem, csak gyakorlati kockázatcsökkentés.
> Komoly esetekben (per, hatósági levél) **ÜGYVÉD KELL**, nem agent.

---

## 1. Ausztrál jogi keret (amit ismernünk kell)

### Fő törvények amik vonatkoznak ránk:

| Törvény | Mire vonatkozik |
|---|---|
| **Privacy Act 1988** (2024 módosítás) | Személyes adatok kezelése |
| **Australian Consumer Law (ACL)** | Megtévesztő tartalom, hamis állítások |
| **Spam Act 2003** | Email marketing, hírlevél |
| **Online Safety Act 2021** | Káros tartalom, kiskorúak védelme |
| **Copyright Act 1968** | Tartalom-másolás, idézés |
| **Defamation Act (állam-specifikus)** | Rágalmazás, becsületsértés |

### A mi főkockázatunk: 3 dolog

1. **Megtévesztő tartalom** (ACL) — AI hibás állítást ír, olvasó kárt szenved
2. **Rágalmazás** (Defamation) — valakiről írunk valami sértőt vagy hamisat
3. **Szerzői jog** (Copyright) — más cikkét lemásoljuk

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
- ❌ **"Y termék rosszabb mint Z"** — összehasonlító állítás, az ACL hatálya
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

Az **ACCC** (Ausztrál fogyasztóvédelmi hatóság) szigorú:
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

### 2026-ban Ausztráliában ez fejlődő terület. Mi proaktívak vagyunk:

- ✅ **Minden cikk alján**: *"Written and edited by AI World Co.'s autonomous AI agents."*
- ✅ **About oldalon**: részletes leírás hogyan dolgoznak az agentek
- ✅ **Forrás transzparencia**: minden hír forrása linkelve

### Miért fontos?
- Az **Online Safety Act** módosítások (2025+) egyre szigorúbbak a generált tartalomra
- A **EU AI Act** is hat ausztrál cégekre amik EU-ba szolgáltatnak
- Az **olvasói bizalom** alapja

---

## 8. Felhasználói adatok — Privacy Act

### Mi NEM gyűjtünk személyes adatot (egyelőre)

A 0-3. hónapban **csak statikus weboldal** vagyunk:
- Nincs regisztráció
- Nincs komment szekció
- Nincs hírlevél (csak később)
- Csak **Google Analytics** (anonim forgalmi adatok)

### Ha LESZ regisztráció / hírlevél (4+. hónap):

Akkor szükséges lesz:
- **Privacy Policy** oldal (mit gyűjtünk, miért, meddig)
- **Cookie consent banner** (EU+AU szabály)
- **Double opt-in** email feliratkozásnál (Spam Act)
- **Unsubscribe link** minden emailben (kötelező!)
- **Adattörlési kérés** lehetősége

### **Most még NEM kell ezzel foglalkozni**, csak amikor odaérünk.

---

## 9. AI hallucináció — A LEGNAGYOBB kockázat!

### Mi a hallucináció?
Az AI **magabiztosan kitalál** dolgokat — pl. nem létező idézetet, hamis számot, nem létező papírt idéz.

### Ez Ausztráliában **megtévesztő tartalom** = ACL megszegése!

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
- [ ] Ausztrál angol használva?

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
