# Cég-hierarchia újraépítése: visszaadási lánc + közös tanulság-könyv + Főnök-döntnök

Dátum: 2026-07-13 · Állapot: user által jóváhagyva (chat) · Elv: TELJES automatizálás —
a tulajdonos csak fejlesztéssel foglalkozik, a cég minden elakadást maga old meg.

## Miért

- Az Író↔Ellenőrző visszaadás már működik (REJECTED_ + rework_attempts), de a
  többi munkatárs hibája zsákutca: a Fordító csendben bukik (failed++), a heti
  összefoglaló "marad jövő hétre", a social némán elhal.
- A tanulságokat ma csak az Író látja (LESSONS FROM PAST REJECTIONS) — a user
  kérése: "tudjanak egymás hibáiból tanulni".
- Nincs döntnök: ami kétszer elbukik vagy senki nem veszi fel, az örökre beragad.
  User: "ha nem jutnak dűlőre, a főnök szóljon bele" + "ne kelljen beleszólnom".

## Szervezeti rend (config.json → company.hierarchy)

```
CEO-döntnök (agents/ceo — beragadt ügyek asztala, mindig MAGA dönt)
 └─ Ellenőrző (minőség-kapu)
     ├─ Író          ← visszaadást kap: Ellenőrzőtől (él), Fordítótól (ÚJ)
     ├─ Fordító      → visszaad az Írónak (hibás forrás-cikk)
     ├─ Tervező, Social, Digest, Compare, Videó, Párosító  → tanulság + önújrázás
     └─ Minőség-önjavító + őrszem (gépi QA — 2026-07-13 óta él)
```

A configban: `company.hierarchy = { agent: { reports_to, may_handback_to: [] } }` —
a postás CSAK az engedélyezett élek mentén kézbesít (elgépelt cél = hangos hiba).

## Komponensek

### 1. core/handback.js — visszaadó-iroda + postás
- `handBack({from, to, ref, reason, hint})` → memory/handbacks.json
  (`{id, from, to, ref, reason, hint, attempts, status: open|resolved|escalated, created_at}`).
  Duplavédelem: azonos (to, ref) nyitott tétel → attempts++ (nem új tétel).
- `deliver()` (postás, pipeline-lépés az ügynökök ELŐTT): a nyitott tételeket a
  meglévő, bevált csatornákra fordítja — Írónak szóló cikk-visszaadás =
  áthelyezés content/rejected/-be REJECTED_ prefixszel + ok a _meta-ba (az Író
  meglévő rework-köre veszi fel; rework_attempts számláló ÉL tovább). Kézbesítés
  után status: resolved (a kézbesítés ténye), a munka sorsát a rework-kör viszi.
- Korlátok: max 2 visszaadási kör ugyanarra a ref-re → status: escalated (a
  Főnök asztalára kerül). A körszámláló a ref TELJES életére számol (a már
  resolved tételeket is beleértve), különben a kézbesítés nullázná. 7 napnál
  idősebb nyitott tétel → escalated.

### 2. core/lessons.js — közös tanulság-könyv
- memory/lessons.json: `{ global: [..], <agent>: [..] }`, bejegyzés:
  `{date, from, text}` — max 12/lista, legfrissebb elöl, szöveg-dedup.
- `learnLesson({from, scope, text})` — scope: 'global' vagy cél-agent neve.
  A tanulság-szöveg MINDIG meglévő hibaszövegből jön (elutasítási ok, bukás-ok,
  önjavító-javítás) → $0 többlet AI-hívás.
- KÖZPONTI INJEKTÁLÁS: core/ai-router.js `ask()` az agentName alapján a
  systemPrompt elé fűzi: "A cég közös tanulságai" (global, max 6) + "A te
  korábbi hibáid" (agent, max 6). Token-sapka ~600. Így MINDEN munkatárs
  automatikusan tanul, agent-kód módosítása nélkül.
- Az Író meglévő lecke-mechanizmusa (REJECTED-okokból) átköltözik ide —
  egyetlen könyv, nincs párhuzamos rendszer.

### 3. Bekötések (hibából tanulság + visszaadás)
- Ellenőrző elutasítás → learnLesson(scope:'iro', ok-szöveg)  [a meglévő
  message() mellé].
- Fordító: ha ugyanaz a cikk 2 futásban is bukik ÉS az ok forrás-hiba
  (nincs H1 / üres törzs / szétesett frontmatter) → handBack(to:'iro') +
  learnLesson(scope:'translator'). Modell-hiba (429/timeout) NEM visszaadás —
  az magától rendeződik.
- Digest/Compare selfCheck-bukás (retry után is) → learnLesson(scope: saját) +
  bukás-számláló a saját state-fájlban (memory/digest-state.json ill.
  compare-state.json, `consecutive_failures` mező); 2-nél → a Főnök asztalára.
- Minőség-önjavító javításai → learnLesson(scope:'global') (chip-szabály minta).
- Social/Tervező parse-hiba → learnLesson(scope: saját).

### 4. agents/ceo — Főnök-döntnök ("beragadt ügyek asztala")
- Pipeline-lépés minden futásban (olcsó: üres asztal = 0 AI-hívás).
- Bemenet: handbacks.json escalated tételei + kimerült rework-cikkek
  (rework_attempts >= MAX a rejected-ben) + 2× bukott heti feladatok.
- Döntés MINDIG automatikus (user: teljes automatizálás): szabály-alapú
  triázs, ha tartalmi ítélet kell → EGY ingyenes-először AI-hívás. Kimenetek:
  a) még egy kör MÁS megközelítéssel (konkrét utasítás a hint-ben),
  b) VÉGLEGES elvetés + tanulság (mit tanuljon a cég belőle),
  c) publikálás kis javítással (ha csak formai gond volt).
- Minden döntés: learnLesson(scope:'global', "Főnöki döntés: … mert …") +
  bejegyzés a napi jelentésbe. A Telegram INFORMÁL, sosem kérdez-blokkol.

### 5. Láthatóság (napi Telegram-jelentés, core/daily-report.js)
- "↩️ Visszaadott munkák: N nyitott / M kézbesítve"
- "👔 Főnöki döntés: K (pl. …)"
- "📖 Új tanulság ma: L (pl. …)"

## Hibakezelés
- handbacks.json/lessons.json sérült → üresként indul újra (try/catch), a
  pipeline SOSEM áll meg miattuk; minden új modul lépése `|| true` a workflow-ban.
- A postás ismeretlen/nem engedélyezett él esetén hangosan logol + tanulság.
- Önvédelem hurok ellen: ugyanarra a ref-re a Főnök után új visszaadás már
  nem nyitható (lezárt ügy — csak tanulság maradhat belőle).

## Tesztelés (negatív tesztek, a 07-13-i önjavító-teszt mintájára)
1. Kamu hibás cikk + fordító-bukás szimuláció → handBack keletkezik → postás
   REJECTED-be teszi → (szimulált) 2. kör után escalated → Főnök dönt → lesson.
2. lessons.json injektálás: ask() hívásnál a prompt tartalmazza a blokkot
   (mock-agent névvel, AI-hívás nélkül ellenőrizve).
3. Sapkák: 12 lesson/lista, dedup, 2 kör, 7 nap — határérték-tesztek.

## Nem célok (YAGNI)
- Nincs főszerkesztő-kapu minden kiadás előtt (user elvetette — drága).
- Nincs valós idejű agent-agent üzengetés — a 8 órás futás-ritmus a
  kézbesítési ütem; ami sürgősebb, az a meglévő retry-körökben él.
- Nincs Telegram-kérdés a userhez döntéshez — csak beszámoló.

## Költség
Új AI-hívás CSAK a Főnök tartalmi ítéleteinél (ritka, ingyenes-először).
A tanulság-injektálás ~pár száz token/hívás többlet — a havi keretben elhanyagolható.
