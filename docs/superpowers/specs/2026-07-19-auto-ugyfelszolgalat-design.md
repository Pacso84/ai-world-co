# Automata ügyfélszolgálat — chat + űrlap + email, $0 költséggel

**Dátum:** 2026-07-19 · **Kérte:** user („most kéne ügyfélszolgálatot csinálni ami autómata") · **Döntések:** csatorna = „mindet" (chat+űrlap+email); hatókör = honlap + AI-témák a saját útmutatóinkból; megközelítés = „A) Minden ingyen" (Workers AI). Terv-bemutatás → „Igen, mehet".

## Cél
A látogató kérdezhet és gyors, őszinte választ kap — emberi beavatkozás nélkül a gyakori esetekben, Telegram-jelzéssel a ritkán szükséges emberi esetekre. Költség: **$0** (Cloudflare ingyenes rétegei), a havi $40-os keretet NEM érinti.

## Architektúra — egy motor, három csatorna

```
látogató ──► 💬 chat-doboz ──┐
látogató ──► 📝 /contact ────┤            ┌─► válasz (látogató nyelvén, guide-linkekkel)
email ─────► 📧 support@ ────┴─► WORKER ──┤
                                (motor)   └─► Telegram a tulajdonosnak (eszkaláció/másolat)
```

Minden a MEGLÉVŐ telegram-workerben (aiworld-telegram): ott van már KV (FEEDBACK), CORS, tg() küldő — új route-ok + email-handler + AI-binding kerül mellé.

## 1. Válasz-motor (worker, közös)
- **Modell:** Cloudflare Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` — a Worker natív `env.AI` bindingján, API-kulcs nélkül, a napi ingyen-keretből. Ha a keret kifogy vagy hiba van → NEM válaszol félrevezetőt: „írj emailt" üzenet (degradáció, nem összeomlás).
- **Tudáscsomag (`kb.json`):** a build állítja elő a `public/kb.json`-ba: guide-onként {cím, 1 mondatos összefoglaló, URL, cégnév/tagek} + honlap-GYIK (mi ez az oldal, hírlevél, hibajelzés, támogatás, RSS) + kisszótár-fogalmak. ~50 KB. A Worker 6 óránként frissíti KV-cache-be.
- **Keresés:** kulcsszó-átfedéses pontozás (cím+tag+összefoglaló), top 4 találat kerül a promptba. NINCS embedding — egyszerű, $0, offline tesztelhető tiszta modul (`kb-retrieval`).
- **Prompt-szabályok:** (1) csak honlap- és AI-eszköz témák, minden más udvarias elhárítás; (2) a látogató nyelvén válaszol (en/hu/es/de/fr — más nyelvre en); (3) **linket CSAK a kb.json-ból adhat** — kitalált URL tilos (cég-alapszabály); (4) árat/funkciót nem talál ki — ha nem tudja a tudáscsomagból, ezt mondja ki és az űrlapra terel; (5) tömör: max ~150 szó; (6) megszólítás-norma nyelvenként (hu=tegezés, de=du, es=tú, fr=vous — meglévő norma).

## 2. Chat-doboz (💬 minden oldalon)
- Saját, könnyű vanilla JS+CSS a buildből — **0 külső hivatkozás** (elv), lusta betöltés: költség/kód csak kattintásra.
- Első üzenet előtt **Turnstile** (láthatatlan, ingyenes robot-szűrő) → a Worker ellenőrzi (TURNSTILE_SECRET worker-secret), siker esetén munkamenet KV-ban (TTL 1 óra, üzenet-számláló).
- Válaszban kattintható guide-linkek. „Emberi segítséget kérek" gomb → űrlap.
- UI-szövegek az 5 nyelven a buildből; sötét témát követi.

## 3. Kapcsolat-űrlap (📝)
- Helye: a chat fallback gombja + a Rólunk oldal alja. Mezők: email (kötelező), üzenet, név (opcionális) + honeypot `web` mező (mint a hírlevélnél) + Turnstile.
- `POST /contact` → KV `msg:<ts>` (TTL 30 nap) + **azonnali Telegram-üzenet** a tulajdonosnak (feladó, nyelv, üzenet eleje). Válasz kézzel, emailben — az automata itt csak triázs.
- Az űrlapon 1 mondatos adatkezelési megjegyzés (email csak a válaszhoz, 30 nap után törlődik).

## 4. Email (📧 support@aiworldhq.com)
- **Cloudflare Email Routing** (ingyen; MX-rekord ma NINCS a domainen — ütközésmentes): route `support@` → a worker `email` handlere.
- Feldolgozás: MIME-ből tárgy+szöveg (postal-mime, bundle-olva — futásidőben nincs külső hívás) → közös motor → **automatikus válasz** a `message.reply()`-jal (mimetext), lábjegyzet: „automata válasz; ha nem segített, válaszolj és a csapat megnézi".
- Minden bejövőről Telegram-másolat a tulajdonosnak. Ha a motor hatókörön kívülinek/megválaszolhatatlannak jelzi → „továbbítottuk a csapatnak" válasz megy (a motor eszkalációs jelzése alapján).
- **Hurok-védelem:** nincs auto-válasz, ha Auto-Submitted/auto-reply fejléc van, ha a feladó mi vagyunk, vagy ha a feladó aznap már kapott 2 auto-választ (KV-számláló).

## 5. Védelem + költség-plafon (kétszintű, mint a $40-os vész-stop)
- Per-látogató: 10 üzenet/nap (hashelt IP, KV) és munkamenetenként 10.
- Globális: 300 AI-hívás/nap (KV) — fölötte a chat/email „írj emailt / a csapat válaszol" üzenetre vált.
- Üzenethossz max 500 karakter; Turnstile + honeypot; a KV-kulcsokban IP csak hashelve.

## 6. Figyelés + kill-switch
- KV-számlálók (`cs:chat:<nap>`, `cs:mail:<nap>`, `cs:esc:<nap>`) → a meglévő `/feedback-export` bővül velük → a napi riport új **💬 sora**: beszélgetés/email/eszkaláció darabszám.
- Kill-switch: `config.customer_service.enabled` — false esetén a build nem teszi ki a widgetet/űrlapot, a Worker-végpontok 503-at adnak (a videó-agent kill-switch mintája).

## Teszt
1. `kb-retrieval` tiszta modul: offline node-teszt (pontozás, top-N, üres találat).
2. kb.json generálás: build után létezik, valid JSON, minden URL élő oldalra mutat (a truth-gate link-vadász elve).
3. Worker: `wrangler dev` helyi füst (chat happy path, limit-túllépés, honeypot, Turnstile-bukás), majd éles curl-füst deploy után.
4. Email: valódi teszt-levél küldése → auto-válasz + Telegram-másolat ellenőrzése; auto-reply fejlécű levél → nincs válasz (hurok-teszt).

## Kézi lépések (a user-rel közösen, végigvezetve)
1. Cloudflare felület: Email Routing bekapcsolása + `support@` route a workerre (~2 perc).
2. Cloudflare felület: Turnstile widget létrehozása (site key publikus, secret → worker-secret).

## Nem-célok
- Nincs beszélgetés-előzmény munkamenetek között; nincs élő emberi chat; nincs CRM/ticket-rendszer.
- Chat-átiratokat NEM tárolunk (csak számlálók) — adatvédelem + egyszerűség.
- A hírlevél- és feedback-útvonalak változatlanok.
