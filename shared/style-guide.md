# AI World Co. — Stílus útmutató

> **Ez a fájl az Író-Agent "nyelvi szabálykönyve".** Konkrét HOGYAN írunk.
> A `company-info.md` mondja MIT írunk, ez mondja HOGYAN írjuk.

---

## 1. Nyelv és helyesírás

### Amerikai angol (NEM brit/ausztrál!)

2026-08-02-ig ausztrál angolt írtunk elő. A mérés viszont mást mondott: 30 nap
alatt US 300, HU 110, SE 60, IE 20 latogato — **Ausztráliából nulla**. Ausztrál
híroldalt írtunk amerikaiaknak. A user döntése: igazodjunk azokhoz, akik
tényleg olvasnak minket.

- ✅ **color**, behavior, favor, neighbor (-or végződés)
- ✅ **organization**, realize, analyze (-ize végződés)
- ✅ **center**, theater, meter (-er végződés)
- ✅ **defense**, license (főnév és ige is)
- ✅ **traveled**, canceled (egy -l-)
- ❌ NEM: colour, organisation, centre, defence, travelled

### Vállalati zsargon → hétköznapi szó

A hír-forrásaink sajtóközleményt írnak, és az író átveszi a hangjukat. Mérve
(2026-08-02, 585 cikk): a vállalati/technikai forrásoknál 32-80% az érintett
cikk (aws-ml, databricks, alibaba-qwen, deepmind), a fogyasztóiaknál 14%.
Nem tiltás — ha nincs jobb szó, maradhat. De alapból a jobb oldalt írd:

| Kerüld | Írd inkább |
|---|---|
| seamless, seamlessly | smooth, simple, without extra steps |
| streamline | simplify, speed up |
| unlock (a feature) | open up, let you, give you |
| harness, leverage | use |
| delve into, dive into | look at, go through |
| landscape (the AI landscape) | world, field |
| journey (your AI journey) | *rendszerint törölhető* |
| embrace, foster | start using, help |
| tapestry, testament, pinnacle | *soha* |

(A szólista alapja: nanxstats/llm-cliches, MIT. FONTOS: a lista sok szava
— "ensure", "crucial", "discover" — teljesen normális angol; a mérésünk
szerint ezek nálunk nem jelentenek gondot, ne kerüld őket mesterségesen.)

### Nemzeti utalások
- A szöveg SOHA ne szólítsa meg az olvasót nemzetiség szerint ("Aussies",
  "Americans"), és ne mondja, hogy "here in <ország>". Az olvasóink fele nem
  onnan van, ahonnan hisszük — ez pont most derült ki.
- Ország-specifikus példa (kormányzati űrlap, helyi szolgáltatás) csak akkor,
  ha a téma tényleg arról szól; egyébként válassz semleges példát.
- Cégnevek mindig **eredeti írásmóddal** (OpenAI, ChatGPT, Anthropic)

### 💵 ÁR: az útmutató SOHA ne mondjon összeget (2026-08-17, user-döntés)

**A szabály:** útmutatóban tilos konkrét termékárat leírni ("$10/hó", "20 dollár
havonta"). Nevezd meg a csomagot, és küldd az olvasót a hivatalos árlapra:

> ❌ „A legolcsóbb, Basic csomag nagyjából 10 dollár/hónap."
> ✅ „A legolcsóbb csomag neve Basic — az aktuális árat a hivatalos árlapon nézd meg."

**Miért:** az útmutató **örökzöld**, az ár **romlandó**. A hírnél nincs baj — az
90 nap múlva törlődik, tehát az ára együtt évül el vele. Az útmutatóban viszont
ugyanaz a mondat évekig ott marad, változatlanul, és senki nem jön vissza
kijavítani. Két valódi bukásunk volt ebből: az egyik útmutató olyan ingyenes
próbát ígért, ami **2023 óta nem létezik**, a másik egy olyan termék
megvásárlását ajánlotta (Copilot Pro), amit **közben kivezettek**.

**Ami MARADHAT:** az olvasó SAJÁT példaszámai — ajándék-keret, albérleti díj,
adósság, bevásárlólista. Azok nem évülnek el, mert nem állítanak semmit a
világról. A tiltás csak a MEGNEVEZETT TERMÉK árára vonatkozik.

Kapu: `PRICE_CLAIM_UNSOURCED` (tanácsadó — leckét ír, nem utasít el).

---

## 1c. EMBERI HANG — amitől nem gépnek hangzik (2026-07-30)

A user kérése: *"próbáljon emberibb cikkeket írni"*. Ez nem stílus-ízlés:
ha az olvasó két mondat után megérzi, hogy gép írta, továbbáll — és a Google
is egyre jobban méri, meddig marad ott.

**A LEGFONTOSABB SZABÁLY: SABLON-CÍMKE SOHA nem kerül a szövegbe.**
Ne írd le, hogy „Hook:", „Intro:", „Body:", „Conclusion:", „CTA:". Ezek NEKED
szólnak, nem az olvasónak. *(2026-07-30-ig 137 megjelent cikk kezdődött szó
szerint úgy, hogy „**Hook:** You've probably heard…" — kint volt az élő
oldalon. Az ellenőrző ezt ma már azonnal elutasítja.)*

### Amit kerülj — MÉRVE a saját cikkeinken

| Fordulat | Előfordulás | Helyette |
|---|---|---|
| unlock / empower / leverage / harness | 101× | „megnyit", „segít", „használ" |
| seamless / robust / cutting-edge | 44× | mondd meg konkrétan, MITŐL jó |
| „not just X, but Y" | 39× | csak mondd meg, mi az |
| „whether you're X or Y" | 31× | válaszd ki, kihez beszélsz |
| „Imagine…" nyitás | 48 cikk | konkrét helyzet, ne felszólítás |

### Amitől emberi lesz

1. **KONKRÉT a általános helyett.** „Sok időt spórolsz" → „A háromoldalas
   jelentésből 20 másodperc alatt lesz öt mondat."
2. **VÁLTOZÓ mondathossz.** Rövid mondat. Aztán egy hosszabb, ami végigvezet
   egy gondolaton, és csak a végén ér célba. *(Mérés: a mi szórásunk 8,6 —
   az emberi írás jellemzően 8-12. Van hova javulni.)*
3. **VÁLLALD A KORLÁTOT.** „Ez a funkció csak fizetős csomagban van." „Androidon
   máshol találod, és nem tudom pontosan, hol." Az őszinte bizonytalanság
   emberi; a mindenttudás gépi. *(A hitelesség-kapu is ezt várja.)*
4. **LEGYEN VÉLEMÉNYED.** „Ez a kettő közül a második a jobb kezdés" — ne
   „vannak, akik ezt szeretik, mások azt".
5. **NE minden cikk induljon ugyanúgy.** Néha kérdés, néha egy tény, néha egy
   apró jelenet. Ha az elmúlt cikkek „Imagine"-nel kezdtek, kezdj másképp.

### Amit NE csinálj a hitelesség rovására

Az emberi hang nem jelent kitalálást. Nem írunk kitalált személyes élményt
(„múlt héten kipróbáltam"), mert nincs mögötte ember. A konkrétság a
TÉNYEKBŐL jön, nem a fikcióból.

## 2. Cikk struktúra

### 2a. RÖVIDEN-DOBOZ — a cikk ELSŐ eleme, kötelező (2026-07-29)

Minden cikk a főcím után **azonnal** egy rövid, egyenes válasszal kezdődik,
és csak UTÁNA jön a figyelemfelkeltő felütés:

```markdown
# A cikk címe

> **In short:** Egy-két mondat, ami a CÍMBEN feltett kérdésre válaszol:
> mi történt / mit csinál a dolog, és mit jelent ez az olvasónak.
> Semmi felvezetés, semmi „ebben a cikkben megnézzük".

[utána jön a szokásos felütés…]
```

**Miért kell:** két különböző olvasó jön az oldalra.

1. **Az ember**, aki elolvassa a történetet — neki a felütés szól, az marad.
2. **A gép** — a ChatGPT, a Perplexity és a Google kivonat-doboza. Ezek a
   cikk ELEJÉT nézik, és ha ott csak hangulatkeltés van („Ott ültél egy
   megbeszélésen…"), akkor nem minket idéznek, hanem valaki mást.
   Márpedig az AI-asszisztensekből érkező forgalom gyorsan nő, és ingyen van.

**Szabályok:**
- Idézet-blokk (`>`), közvetlenül a `#` főcím után, üres sorral elválasztva.
- 1-2 mondat, **legfeljebb 45 szó**. Ha hosszabb, már nem „röviden".
- A CÍM kérdésére válaszol, nem a cikk témáját ismétli meg.
- Konkrét: névvel, számmal, ténnyel. „Sok újdonság érkezik" → semmit nem ér.
- Kitalált tényt itt sem írunk (a hitelesség-kapu erre is vonatkozik).

**Rossz:** `> **In short:** In this article we look at Google Meet's new features.`
**Jó:** `> **In short:** Google Meet's AI notetaker will soon paste screenshots
of shared screens straight into your notes, so you no longer have to guess what
was on a slide. It's part of "Take notes for me", and no date has been given yet.`

### Rövid cikk (300-600 szó) — alap formátum

```
┌─────────────────────────────────────────┐
│ HEADLINE (cím)                          │  ← 60-80 karakter
│ Subhead (alcím — 1 mondat összefoglaló) │  ← 100-150 karakter
├─────────────────────────────────────────┤
│ RÖVIDEN-doboz (> **In short:** …)       │  ← KÖTELEZŐ, lásd 2a
│ A cím kérdésére EGYENES válasz          │
├─────────────────────────────────────────┤
│ HOOK (1. bekezdés — figyelemfelkeltő)   │  ← 2-3 mondat
│ Megválaszolja: MI történt? MIÉRT fontos?│
├─────────────────────────────────────────┤
│ FŐ TARTALOM (2-4 bekezdés)              │
│ - Részletek                              │
│ - Példák                                 │
│ - Magyarázat (mit jelent ez nekünk?)     │
├─────────────────────────────────────────┤
│ "Mit jelent ez számodra?" szekció        │  ← KÖTELEZŐ!
│ Gyakorlati alkalmazás 2-3 pontban        │
├─────────────────────────────────────────┤
│ ZÁRÁS (1 bekezdés)                       │
│ Összefoglalás + következő lépés          │
└─────────────────────────────────────────┘
```

### Mély elemzés (1500+ szó) — vasárnap reggel

```
- Headline + Subhead
- TL;DR doboz (3-5 bullet pont)
- Bevezető (mi a téma, miért most fontos)
- Háttér / kontextus (mit kell tudni hozzá)
- Részletes elemzés (több H2 szekció)
- Gyakorlati alkalmazás (hogyan használd)
- Példák / esettanulmányok
- Korlátok / amit nem tud
- Konklúzió + következő lépés
```

---

## 3. Címek (Headlines)

### ✅ JÓ címek:

- **Konkrét, leíró**: *"Google's New Gemini 3 Can Now Read Your Emails — Here's How to Use It Safely"*
- **Kérdés-alapú**: *"What Does OpenAI's New Sora 2 Mean for Aussie Content Creators?"*
- **Számokkal**: *"5 Practical Ways Aussies Are Already Using Claude at Work"*
- **"How to"**: *"How to Get Started with Anthropic's New Code Assistant in 10 Minutes"*

### ❌ ROSSZ címek:

- ❌ **Click-bait**: *"You Won't BELIEVE What This AI Just Did!"*
- ❌ **Vague**: *"AI News Today"*
- ❌ **Túl szakmai**: *"GPT-5 Implements Mixture-of-Experts Architecture"*
- ❌ **Negatív/ítélkező**: *"OpenAI's GPT-5 is Worse Than Expected"*

### Cím hossz
- **Optimális**: 50-70 karakter (jól mutat Google-ben és social media-n)
- **Maximum**: 100 karakter

---

## 3b. ÍGÉRET-FEDEZET — amit a cím ígér, azt a szöveg adja meg

**Ez a szabály MINDEN cikkre vonatkozik, bármelyik agent írja** (hír, magyarázó,
útmutató — mindegy). Nem a cikk *típusához* mérünk, hanem ahhoz, amit az
olvasónak **ígértünk**: az olvasó nem a belső kategóriánkat látja, hanem a címet.

*(Bekerült 2026-07-27-én, user-lelet nyomán: az „Így próbáld ki az AI-videó-
avatárt a telefonodon öt perc alatt" cikk hírként íródott, ezért a részletes
útmutató-szabályok nem vonatkoztak rá — 657 szó, egyetlen összevont bekezdés,
nulla másolható példa. Akkor 76 ilyen cikkünk volt kint.)*

### Mikor lép életbe

Ha a cím vagy a felvezető azt ígéri, hogy az olvasó **meg tud csinálni** valamit:
„Hogyan…", „Így…", „Öt perc alatt…", „Állítsd be…", „Az első…", „lépésről lépésre".

### Ilyenkor KÖTELEZŐ

1. **4-6 külön, számozott lépés-szakasz** (`## Step 1 — …`) — NEM egyetlen
   összevont „lépésről lépésre" bekezdés.
2. **Lépésenként 60-140 szó**, önmagában érthetően: mit kell megnyomni és **hol
   találja**, mit fog **LÁTNI** utána, és egy konkrét, **másolható 💬 példa**
   (prompt, beállítás-név, menü-útvonal), ahol értelmes.
3. **Sikerellenőrzés** a lépés végén: „Akkor sikerült, ha…" — hogy az olvasó
   tudja, jó úton jár-e, mielőtt továbbmegy.
4. **Előfeltételek az ELSŐ lépés előtt** (fiók, alkalmazás, fizetős csomag,
   telefon-verzió) — soha ne a 4. lépésnél derüljön ki, hogy nem tud továbbmenni.
5. **„Common mistakes" szakasz**: legalább 3 tétel, mindegyik megnevezi a hibát
   **ÉS a megoldást**.
6. **Hossz: 1000-1400 szó** (≈5-7 perc olvasás). A hír/magyarázó 400-700 szavas
   kerete ilyenkor nem érvényes — az ígéret többet kíván.
   *A szám EGY helyen él: `core/article-length.js`. Ide NE írj konkrét értéket,
   mert szétcsúszik — 2026-08-16-ig tíz helyen szerepelt, két különböző
   értékkel (700-1100 és 700-1200), és a rendszer egyiket sem tartotta.*

### Ha nem tudsz valódi lépéseket írni

**Akkor ne ígérd.** Kitalált menünév, gomb-felirat vagy képernyő **TILOS** — ez a
cég alapszabálya (a hitelesség-kapu is ezt védi). Ilyenkor írd meg őszintén
magyarázónak, és **adj olyan címet, amit a szöveg fedez** (pl. „Mi az X, és
kinek való?"). Ez nem kudarc, hanem a helyes döntés.

### Az ellenőrző automatikusan méri

Az Ellenőrző AI nélkül, ingyen buktatja a fedezetlen ígéretet:
`HOWTO_TOO_THIN` (600 szó alatt) és `HOWTO_NO_STEPS` (3-nál kevesebb számozott
lépés-szakasz). Ha ezt látod a visszajelzésben, nem stilisztikai megjegyzés —
az ígéret nincs fedezve.

---

## 4. Mondatszerkezet

### Hossz változatosság
- **Rövid mondatok kezdéskor**. Figyelemkeltés.
- Aztán hosszabb, kifejtő mondatok következhetnek, amik részletesen leírják miről van szó.
- Majd újra rövid. Lendület.

### Aktív hangnem (NEM passzív)
- ✅ *"OpenAI bejelentette a GPT-5-öt."* (aktív)
- ❌ *"A GPT-5 az OpenAI által lett bejelentve."* (passzív)

### Bekezdés hossz
- **Maximum 3-4 mondat** egy bekezdésben
- Online olvashatóság: **rövid bekezdések**, sok fehér tér
- Egy gondolat = egy bekezdés

---

## 5. Szakszavak kezelése — KÖTELEZŐ MAGYARÁZAT

### Minden szakszó **első előfordulásakor** azonnal magyarázva:

#### ✅ Formátum 1 — Zárójeles magyarázat
> *"The new model uses an **LLM (large language model — like the engine behind ChatGPT)** to process your requests."*

#### ✅ Formátum 2 — Mondat utáni magyarázat
> *"This works through an **API**. In simple terms, an API is just a way for two programs to talk to each other."*

#### ✅ Formátum 3 — Analógia
> *"Think of **fine-tuning** like personalizing your phone — you're not changing how the phone works, just how it responds to you."*

### Gyakori AI szakszavak + magyarázatok (kötelező sablon):

| Szakszó | Magyarázat (angolul, ahogy cikkbe kerül) |
|---|---|
| **LLM** | large language model — like the engine behind ChatGPT |
| **API** | a way for programs to talk to each other |
| **Prompt** | the instruction you give to an AI |
| **Token** | a small piece of text (roughly 4 characters) the AI reads |
| **Fine-tuning** | personalizing an AI for a specific task |
| **RAG** | giving the AI access to documents it can look up |
| **Hallucination** | when an AI confidently makes something up |
| **Multimodal** | can handle text, images, audio together |
| **Agent** | an AI that can use tools and take actions |
| **MCP** | a way to give AI access to apps like Gmail or Slack |
| **Context window** | how much text the AI can "remember" in one conversation |
| **Inference** | when the AI actually processes your request |

### Soha NEM hagyott magyarázat nélkül
- ❌ TILOS: *"The transformer architecture enables better attention mechanisms."*
- ✅ KELL: *"The model uses a **transformer** — think of it as the AI's internal structure for paying attention to important words in your message."*

---

## 6. Számok és mértékegységek

### Számok írása
- 1-tól 9-ig **betűvel**: *"There are **five** main differences..."*
- 10-től felfelé **számjeggyel**: *"This affects **10 million** users..."*
- Kivétel: mondat elején mindig betűvel (*"Five new features..."*)

### Pénzek
- **AUD (ausztrál dollár)** elsődleges: *"$50 AUD per month"*
- Ha forrás USD: jelöljük: *"$50 USD (about $75 AUD)"*
- Európai cégeknél eurót is: *"€20 (around $32 AUD)"*

### Mértékegységek
- **Metric**: km, kg, °C (nem mérföld, font, Fahrenheit)
- Idő: 24-órás formátum cikkekben (*"15:30"*), 12-órás közvetlen beszédben (*"3:30pm"*)
- Dátum: **DD Month YYYY** (*"5 June 2026"*) — NEM amerikai (06/05/2026)

---

## 7. Idézetek és források

### Hivatalos forrás idézése
> According to **OpenAI's official announcement**, the new model "performs 40% better on coding tasks."

### Link a forrásra
- Minden tényállítás mögött **link a forrásra**
- Format: *"according to [Anthropic's blog](https://anthropic.com/news/...)"*
- **NEM forrás nélkül** mondunk konkrét számot vagy tényt

### Több forrás
- Ha 2+ helyről jött az infó, **mindkettőt** linkeljük
- Ha ellentmondás van, **megemlítjük** ("Anthropic says X, but TechCrunch reports Y")

---

## 8. Képek és vizuálok

### Mikor használunk képet?
- **Minden cikkhez kötelező** egy borító kép (header image)
- Mély elemzéseknél: 2-3 illusztráció
- Tutorialoknál: screenshot-ok (ha lehet)

### Kép alt szöveg (accessibility)
- Minden kép kap **alt text-et** (vakok számára)
- Format: rövid, leíró
- Pl. *"A laptop screen showing the new Claude interface with the chat panel open"*

### Generált képek jelölése
- AI által generált kép esetén jelöljük: *"Image generated by [tool name]"*
- Forrás kép esetén: *"Source: OpenAI"*

---

## 9. Belső linkek (internal linking)

### Mikor linkelünk más cikkünkre?
- Ha **kapcsolódó téma** van — pl. cikkben említünk egy modellt amiről írtunk
- Format: *"As we covered in our [guide to Claude 4.6](https://aiworld.co/...), this approach is..."*

### Cél
- Olvasó tovább olvasson (engagement)
- SEO előny (Google szereti)
- Hasznos kontextust ad

---

## 10. Disclaimer-ek (kötelező jelölések)

### Affiliate link
A cikk **első előfordulásakor**, vagy ha cikkben sok van akkor egyszer az elején:
> *"This article contains affiliate links — if you buy through them, we earn a small commission at no extra cost to you."*

### Szponzorált cikk
A cikk **legtetején**, **félkövéren**:
> **Sponsored** — *This article is brought to you in partnership with [Company]. All views and analysis are our own.*

### AI által írt
A cikk **alján**, kis betűkkel:
> *Written and edited by AI World Co.'s autonomous AI agents. Reviewed for accuracy by our editorial system.*

---

## 11. Olvashatóság — gyakorlati tippek

### Tördelés
- **Bullet point-ok** (•) hosszabb felsorolásnál
- **Számozott listák** (1, 2, 3) lépéseknél
- **Bold** a kulcsmondatokra (mértékkel!)
- *Italic* idézeteknél és gyenge kiemelésnél
- > **Blokk-idézet** fontos idézetnél vagy CTA-nál

### "Mit jelent ez számodra?" szekció — KÖTELEZŐ!
Minden cikk végén (rövideknél is!):
```
## What this means for you

- If you're a [casual user]: [practical advice]
- If you work in [field]: [specific use case]
- If you're worried about [common concern]: [reassurance + facts]
```

### Olvasási idő
- Cikk tetején: *"5 min read"* vagy *"10 min read"*
- Segít az olvasónak eldönteni belevág-e

---

## 12. Hibák amit KERÜLNI kell

### ❌ Top 10 tiltott fordulat:

1. ❌ *"In today's fast-paced world..."* (üres bevezető)
2. ❌ *"Are you ready to..."* (motivációs gurus stílus)
3. ❌ *"This will change everything!"* (túlzás)
4. ❌ *"Game changer"* (klisé, túlhasznált)
5. ❌ *"It's no secret that..."* (üres kifejezés)
6. ❌ *"In conclusion..."* (a végén már látszik hogy konklúzió)
7. ❌ *"As an AI..."* (ne magunkat magyarázzuk a cikkben)
8. ❌ *"Disrupt"*, *"revolutionary"*, *"unprecedented"* (túlhasznált)
9. ❌ *"Furthermore", "Moreover", "Henceforth"* (nehézkes)
10. ❌ *"It is important to note that..."* (csak töltelék)

### Ellenőrző kérdések minden cikkre (Író-Agent használja!):
- ✅ Megválaszolja a "**Mit jelent ez számomra?**" kérdést?
- ✅ Minden szakszó magyarázva?
- ✅ Van forrás minden tényállítás mögött?
- ✅ Ausztrál angol (nem amerikai)?
- ✅ Aktív hangnem (nem passzív)?
- ✅ Bekezdések max 3-4 mondat?
- ✅ Cím 50-70 karakter, nem click-bait?
- ✅ Disclaimer ahol kell (affiliate, sponsored, AI)?
- ✅ "Mit jelent ez számodra?" szekció megvan?

---

*Készült: 2026-06-04, pacsi84 + Claude.*
*Az Író-Agent és Ellenőrző-Agent ehhez a fájlhoz nézzen minden cikknél.*
