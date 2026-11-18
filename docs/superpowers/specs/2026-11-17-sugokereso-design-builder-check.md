# Súgókereső — kivitelező-ellenőrzés eredménye (2026-11-17 este)

A független ellenőrző 3 nyitott kérdést talált (fontossági sorrendben). Holnap (11-18) ezekkel kezdünk.

1. **A domain-őr kizárása kiüti a saját esetünket.** A 6.1 szerint ott nincs felfedezés, ahol a regisztrálható domainen már van
   ENGEDELY-előtag. Ezért kiesik a MiniMax (platform.minimax.io/docs/ már engedett → minimax.io kizárt, pedig a súgó az
   agent.minimax.io-n van), és a Kimi is, amint kézzel felvesszük. Így a felfedező csak ChatGPT-n, Claude-on, Grokon és Duck.ai-n
   futna, ahol már van teljes lista. KÉRDÉS: pontos host/előtag szerinti kizárás (agent.minimax.io ≠ platform.minimax.io), vagy a
   MiniMax is kézi felvétel, és a felfedező csak a jövőbeli új cégeknek készül?
2. **Meddig érvényes egy felfedezett forrás?** Az `engedelyezett()` sok helyen fut (sugoForrasok, sugoSzoveg/sugoTarIr, elakadas.js,
   elakadas-html.js, GUIDE_UI_NOT_IN_HELP), napokkal később is. Ha a 7 napos memóriához kötjük, a már horgonyzott útmutató forrása
   elévül, és az író vagy az ellenőrző elveszti a mércéjét. KÉRDÉS: a tartós azonosító a témán tárolt
   `official_sources[…].felfedezett === true` + URL legyen, vagy a memória-fájl? Kell-e pontos URL-egyezés?
3. **Marad-e „részleges” a Kimi és a MiniMax szintje?** Részleges szinten az útmutató nem nevez meg gombot vagy menüt. Felhasználói
   súgóból viszont gombnevekkel is írhatnánk. KÉRDÉS: felmenjenek-e teljesre (core/forras-szint.js + tesztek)?

## Döntések (2026-11-18, user jóváhagyta: „Igen, csináld” + push-feltétel „0 téves + indokolt kudarcok”)
1. **Domain-őr = PONTOS HOST.** A felfedező KIZÁRÓLAG a tool-links.json `tools[<eszköz>]` címének pontos hostján fut
   (agent.minimax.io, lumo.proton.me, duck.ai, gemini.google.com, www.kimi.com …), és csak e host URL-jeit fogadja el
   jelöltnek (a sitemapban más hostra mutató URL kimarad). A regisztrálható domain www-jére NINCS visszaesés (különben pl. a
   www.proton.me/support megkerülné a LUMO-szűkítést). Ha a pontos hoston (www-vel/nélkül) MÁR van ENGEDELY-előtag → nincs
   felfedezés (pl. brave.com). → A 6.1 „regisztrálható domain” kizárása és a 6.2 „regisztrálható domain www-je” lépése ezzel CSERÉLVE.
2. **Tartós azonosító = a témán.** `official_sources[i].felfedezett === true` + a pontos URL; a közös „felfedezett forrás-e”
   ellenőrzés (EGY helyen) minden használatkor újra futtatja a domain-őrt (pontos host = az eszköz tool-links hostja) és az
   útvonal-szűrőt (súgó-jellegű, kizárt szakaszok). A memory/sugo-felfedezes.json CSAK gyorsítótár (7 nap), NEM jogosultság.
   Pontos URL-egyezés: igen (a témán tárolt URL-t fogadja el, előtagot nem).
3. **Kimi/MiniMax szint MARAD „részleges”** ebben a körben (gombnév nélkül); a mérés után külön user-döntés.
4. **Push-feltétel (user):** 0 téves párosítás + minden kudarc „valódi hiány” vagy indokolt ellenőrző-döntés kategóriában.
