# Telegram → Főnök parancscsatorna — terv (spec)

**Dátum:** 2026-06-28 · **Állapot:** jóváhagyva, építés alatt

## Cél
A felhasználó a Telegramon **utasítja a főnököt (CEO)**, aki szétosztja a munkát és
a te parancsodra **a rendszer BÁRMELY részét módosíthatja** (tartalom, dizájn,
ütemezés, források, skillek, agentek, build, CSS — bármi), mindig biztonsági hálón át.

## Architektúra (transport)
```
Te (Telegram) → Cloudflare Worker → GitHub Actions (repository_dispatch) → Főnök (instruct.js) → ✅ Telegram-válasz
```
- **Cloudflare Worker** (`telegram-worker/`): webhook fogadó. Ellenőrzi a chat-ID-t
  (csak a tulaj parancsolhat), azonnal nyugtáz, és `repository_dispatch`-csel átadja a
  parancsot a GitHubnak. Egyszerű kérésre (help/ping) azonnal válaszol.
- **GitHub Action** (`.github/workflows/telegram-command.yml`): `repository_dispatch`
  [`telegram-command`] eseményre fut; meghívja az `instruct.js`-t a parancs szövegével;
  deployol, ha kell; a végén Telegramra ír.
- **Főnök értelmező** (`agents/ceo/instruct.js`): a szabad szöveget LLM-mel
  szándékká alakítja, a megfelelő agentre/akcióra osztja, végrehajt, válaszol.
- **Telegram helper** (`core/telegram.js`): `sendMessage(chatId, text)` a bot API-n.

## Parancs-típusok (útválasztás kockázat szerint)
| Típus | Példa | Végrehajtás | Kockázat |
|---|---|---|---|
| Tartalom | „írj útmutatót X-ről" | guide/iro agent | alacsony |
| Dizájn | „nagyobb kártyák" | web-designer `--rule` | alacsony |
| Ütemezés | „4 óránként keress hírt" | cron szerkesztés | alacsony |
| Források | „kövesd a Cohere-t" | rss-feeds.json | alacsony |
| Skill / új agent | „csinálj agentet, ami…" | kódgenerálás + háló | magas |
| **Bármi más** | „írd át a build-logikát / CSS-t" | általános fájl-szerkesztés + háló | magas |
| Futás/állapot/undo | „fuss most", „mi a helyzet?", „vond vissza" | pipeline / git | — |

## Biztonsági háló (magas kockázatú változásoknál)
Minden változás git-commit. Deploy előtt:
1. **Teszt:** `node --check` (érintett .js) + `node website/build.js` (épül-e).
2. **OK** → deploy + „✅ Kész" válasz.
3. **Hiba** → automatikus visszavonás (git reset/checkout), nincs deploy, „⚠️ visszavontam: <hiba>".
4. **„vond vissza az utolsót"** → git revert + újra-deploy.

## Biztonság (a zár, amit a bot nem feszíthet fel)
- A **chat-ID allowlist** és minden **kulcs** a repón KÍVÜL van (GitHub/Cloudflare secret),
  nem szerkeszthető repo-fájlban → a bot „bármit" átírhat, de a saját hozzáférési
  korlátját nem tudja meggyengíteni, és nem szivárogtathat kulcsot.
- Secret-ek: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`, `DISPATCH_GH_TOKEN` (szűk jogú PAT a Workernek), a meglévő AI/Cloudflare kulcsok.

## Építési fázisok
1. **Csatorna + tartalom-parancsok** — bot ↔ Worker ↔ GitHub ↔ főnök; útmutató/hír kérés, „fuss most", „mi a helyzet?". *(Önállóan használható.)*
2. **Beállítás-parancsok** — dizájn, ütemezés, források szóban.
3. **Kód-parancsok + biztonsági háló** — skill/agent/bármi módosítás, „vond vissza".

## Nyitott prerequisite-ek (felhasználótól)
- Telegram bot létrehozása @BotFather-rel → **bot-token**.
- Engedély szűk jogú **GitHub PAT** létrehozására (a Worker dispatch-hez).
