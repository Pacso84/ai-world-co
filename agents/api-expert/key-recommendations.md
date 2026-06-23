# API-kulcs ajánlások — az API-szakértő agenttől

*Generálva: 2026-06-23T19:21:29.211Z · ELV: ingyen-először (csak akkor fizetünk, ha ingyen nem megoldható).*

**Bekötött gyártók:** google (free), groq (free), cerebras (free)
**Költség-állapot:** 12 agent ingyenes modellen — minden agent INGYENES modellen fut ✅.

### 🧩 Le NEM fedett képességek (ezekhez kéne kulcs)
- **Webes kutatás forrásmegjelöléssel** — legjobb: perplexity. Javaslat: **perplexity**. Ingyenes opció: perplexity (korlátozott ingyenes kredit)
- **Képszerkesztés (feltöltött kép)** — legjobb: openai, google. Javaslat: **google**. Ingyenes opció: korlátozott; tisztán ingyenes natív szerkesztés ma gyenge
- **Hang (TTS/átirat)** — legjobb: openai, google. Javaslat: **google**. Ingyenes opció: google korlátozottan

### 🔑 Beköthető kulcsok (ingyen-először)
- **mistral** _(free, Van ingyenes tier (la Plateforme).)_ — erre jó: chat, cheap, eu-privacy. EU-s, adatvédelem-barát; jó redundancia.
- **cloudflare** _(free, Workers AI ingyenes napi kvóta (Flux képgenerálás).)_ — erre jó: image-generate. Már HASZNÁLJUK a Designerben (fejlécképek) — ingyenes képgenerálás.
- **openrouter** _(freemium, Néhány modell ingyen (:free), a többi pay-per-use.)_ — erre jó: variety, fallback. Sok modellhez egy kulcs — jó meta-fallback.
- **perplexity** _(freemium, Korlátozott ingyenes kredit; Sonar modellek.)_ — erre jó: research-web, citations. WEBES kutatás FORRÁSMEGJELÖLÉSSEL — erre nincs jelenleg bekötött gyártónk.
- **deepseek** _(cheap)_ — erre jó: reasoning, code, cheap. Nagyon olcsó; erős reasoning/kód.
- **anthropic** _(paid)_ — erre jó: quality, reasoning, long-form, writing, review. FIZETŐS. A legjobb minőség íráshoz/ellenőrzéshez — csak ha az ingyenes nem elég jó.
- **openai** _(paid)_ — erre jó: image-generate, image-edit, voice, chat. FIZETŐS. Natív képgenerálás/szerkesztés és hang. A képgenerálást ingyen a Cloudflare Flux is megoldja.

> Az agent SOSEM köt be kulcsot magától — te döntesz. A kulcsot a `.env`-be tedd, majd futtasd: `node agents/api-expert/agent.js`.