# AI World Co. — Stílus útmutató

> **Ez a fájl az Író-Agent "nyelvi szabálykönyve".** Konkrét HOGYAN írunk.
> A `company-info.md` mondja MIT írunk, ez mondja HOGYAN írjuk.

---

## 1. Nyelv és helyesírás

### Ausztrál angol (NEM amerikai!)

- ✅ **colour**, behaviour, favour, neighbour (-our végződés)
- ✅ **organisation**, realise, analyse (-ise végződés)
- ✅ **centre**, theatre, metre (-re végződés)
- ✅ **defence**, licence (főnév), license (ige)
- ✅ **travelled**, cancelled (-ll- duplázás)
- ❌ NEM: color, organization, center, defense, traveled

### Helyi szavak (ahol releváns)
- "**Aussie**" inkább pozitív kontextusban, óvatosan
- "**mate**" csak nagyon laza cikkekben, normál esetben ne
- "**arvo**" (afternoon), "**brekkie**" (breakfast) — kerüld, túl szleng
- Cégnevek mindig **eredeti írásmóddal** (OpenAI, ChatGPT, Anthropic)

---

## 2. Cikk struktúra

### Rövid cikk (300-600 szó) — alap formátum

```
┌─────────────────────────────────────────┐
│ HEADLINE (cím)                          │  ← 60-80 karakter
│ Subhead (alcím — 1 mondat összefoglaló) │  ← 100-150 karakter
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
