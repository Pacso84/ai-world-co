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
