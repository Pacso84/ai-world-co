# Automata ügyfélszolgálat — megvalósítási terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat-doboz + kapcsolat-űrlap + support@aiworldhq.com email — közös, $0 költségű Workers AI válasz-motorral a meglévő telegram-workerben, a spec szerint: `docs/superpowers/specs/2026-07-19-auto-ugyfelszolgalat-design.md`.

**Architecture:** A build nyelvenkénti `kb.json` tudáscsomagot ír a site mellé (guide-ok + GYIK + kisszótár). A Worker új moduljai (kulcsszavas keresés → prompt → `env.AI` Llama 3.3) szolgálják ki a `/chat` és `/contact` route-okat és az `email` handlert; védelem: Turnstile + honeypot + KV-limitek (10/nap/IP, 300/nap globális). Telegram-jelzés a meglévő `tg()`-vel; számlálók a meglévő `/feedback-export`-on át a napi riportba.

**Tech Stack:** Node v24 ESM · Cloudflare Worker (wrangler, OAuth deploy) · Workers AI `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (env.AI binding) · KV (meglévő FEEDBACK namespace) · postal-mime + mimetext (bundle-elt npm) · Turnstile · vanilla JS widget.

## Global Constraints

- Kulcsok SOHA a repóba: TURNSTILE_SECRET → CSAK `wrangler secret put`; a Turnstile **site key publikus by design** (config.json-ba mehet).
- Kitalált URL TILOS: a motor linket CSAK a kb.json-ból adhat — a promptban kötelező tiltás.
- 0 külső hivatkozás elv: kivétel CSAK Cloudflare-saját szkript (precedens: CF beacon). A Turnstile `challenges.cloudflare.com/turnstile/v0/api.js` megengedett, lustán töltve.
- Megszólítás-norma: hu=tegezés, de=du, es=tú, fr=vous — a chat-promptban és minden UI-szövegben.
- DEPLOY-RECEPT (site): build UTÁN `node core/share-images.js` KÖTELEZŐ (a build üríti a public/-ot), majd `npx wrangler pages deploy website/public --project-name=aiworldco --commit-dirty=true`.
- Worker deploy: `cd telegram-worker && npx wrangler deploy` (OAuth már be van jelentkezve).
- Git Bash környezet, a projektútvonalban szóköz van: mindig idézőjelezett `"/c/AI work/ai-world-co"`.
- Minden commit-üzenet magyarul, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` lábbal.
- A meglévő route-ok (/feedback, /subscribe, /feedback-export, Telegram-webhook) viselkedése NEM változhat.
- Kill-switch: `config.customer_service.enabled` (site-oldal, build) + `CS_ENABLED` var a wrangler.toml-ban (worker-oldal, 503).

---

### Task 1: kb-retrieval — kulcsszavas kereső tiszta modul (TDD)

**Files:**
- Create: `telegram-worker/src/kb-retrieval.js`
- Test: `telegram-worker/test/kb-retrieval.test.js`

**Interfaces:**
- Produces: `tokenize(str) → string[]` és `searchKb(query, kb, topN=4) → [{t,s,u,c?,kind,score}]`, ahol a `kb` alakja `{site:[{q,a,u}], guides:[{t,s,u,c}], terms:[{t,d,u}]}`. A Task 4 (cs-engine) ezt hívja.

- [ ] **Step 1: Bukó teszt megírása**

`telegram-worker/test/kb-retrieval.test.js`:
```js
// node telegram-worker/test/kb-retrieval.test.js — offline, függőség nélkül
import { strict as assert } from 'assert';
import { tokenize, searchKb } from '../src/kb-retrieval.js';

// tokenize: kisbetű, ékezet-normalizálás, 3+ karakter, egyediség
assert.deepEqual(tokenize('Írás és ÍRÁS, az AI-val!'), ['iras', 'val']);
assert.deepEqual(tokenize(''), []);

const kb = {
  site: [
    { q: 'How do I subscribe to the newsletter?', a: 'Use the box at the bottom of any page.', u: 'https://aiworldhq.com/#newsletter' },
    { q: 'How do I report a mistake?', a: 'Use the thumbs buttons or the contact form.', u: 'https://aiworldhq.com/about.html' }
  ],
  guides: [
    { t: 'Getting started with ChatGPT for everyday writing', s: 'A beginner guide to writing with AI.', u: 'https://aiworldhq.com/article/chatgpt-writing', c: 'OpenAI' },
    { t: 'Master Apple Intelligence writing tools', s: 'Writing tools on iPhone.', u: 'https://aiworldhq.com/article/apple-writing', c: 'Apple' },
    { t: 'Managing AI spend with Snowflake FinOps', s: 'Cost dashboards for teams.', u: 'https://aiworldhq.com/article/snowflake-finops', c: 'Snowflake' }
  ],
  terms: [{ t: 'prompt', d: 'The instruction you give an AI.', u: 'https://aiworldhq.com/glossary.html' }]
};

// címtalálat előrébb, mint az összefoglaló-találat; irreleváns kimarad
const hits = searchKb('how to start writing with chatgpt', kb, 4);
assert.ok(hits.length >= 1, 'van találat');
assert.equal(hits[0].u, 'https://aiworldhq.com/article/chatgpt-writing', 'a cím+összefoglaló találat az első');
assert.ok(!hits.some(h => h.u.includes('snowflake')), 'irreleváns guide nem kerül be');

// GYIK-találat: kind==='site'
const nlHits = searchKb('newsletter subscribe', kb, 4);
assert.equal(nlHits[0].kind, 'site');

// üres/zaj kérdés → üres lista (nem hasraütés)
assert.deepEqual(searchKb('¤¤ !!', kb, 4), []);

// topN tartva
assert.ok(searchKb('writing AI guide tools', kb, 2).length <= 2);

console.log('✅ kb-retrieval.test: minden átment');
```

- [ ] **Step 2: Futtatás — bukjon**

Futtatás: `cd "/c/AI work/ai-world-co" && node telegram-worker/test/kb-retrieval.test.js`
Elvárt: `ERR_MODULE_NOT_FOUND` (a src/kb-retrieval.js még nincs).

- [ ] **Step 3: Implementáció**

`telegram-worker/src/kb-retrieval.js`:
```js
// ===================================================================
// KB-RETRIEVAL — kulcsszavas keresés a kb.json tudáscsomagban (tiszta modul)
// NINCS embedding, NINCS függőség — offline tesztelhető (spec: 2026-07-19).
// ===================================================================

// Kisbetű + ékezet-levágás (é→e, ű→u…), 3+ karakteres egyedi szavak.
export function tokenize(str) {
  return [...new Set(
    String(str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 3)
  )];
}

// Egy kb-elem pontszáma a kérdés tokenjeihez képest.
// Cím/kérdés-találat 3 pontot ér, törzs-találat 1-et — a cím a legerősebb jel.
function scoreItem(qTokens, titleTokens, bodyTokens) {
  let s = 0;
  for (const t of qTokens) {
    if (titleTokens.includes(t)) s += 3;
    else if (bodyTokens.includes(t)) s += 1;
  }
  return s;
}

// kb = {site:[{q,a,u}], guides:[{t,s,u,c}], terms:[{t,d,u}]} → top-N releváns elem.
export function searchKb(query, kb, topN = 4) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];
  const scored = [];
  for (const it of kb.site || []) {
    const s = scoreItem(qTokens, tokenize(it.q), tokenize(it.a));
    if (s >= 2) scored.push({ t: it.q, s: it.a, u: it.u, kind: 'site', score: s });
  }
  for (const it of kb.guides || []) {
    const s = scoreItem(qTokens, tokenize(it.t + ' ' + (it.c || '')), tokenize(it.s));
    if (s >= 2) scored.push({ t: it.t, s: it.s, u: it.u, c: it.c, kind: 'guide', score: s });
  }
  for (const it of kb.terms || []) {
    const s = scoreItem(qTokens, tokenize(it.t), tokenize(it.d));
    if (s >= 3) scored.push({ t: it.t, s: it.d, u: it.u, kind: 'term', score: s });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, topN);
}
```

- [ ] **Step 4: Teszt fusson át**

Futtatás: `node telegram-worker/test/kb-retrieval.test.js`
Elvárt: `✅ kb-retrieval.test: minden átment`

- [ ] **Step 5: Commit**

```bash
cd "/c/AI work/ai-world-co" && git add telegram-worker/src/kb-retrieval.js telegram-worker/test/kb-retrieval.test.js && git commit -m "feat(ügyfélszolgálat 1/9): kb-kereső tiszta modul + offline teszt

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: kb.json — tudáscsomag a buildből (nyelvenként)

**Files:**
- Modify: `website/build.js` (2 pont: GYIK-szövegtábla a UI-blokkok után ~264. sor környéke; kb.json kiírás a search.json mellé, ~2246. sor)
- Test: kézi validáló egysoros (lent)

**Interfaces:**
- Produces: `website/public/<langdir>/kb.json` alakja `{v:1, lang, site:[{q,a,u}], guides:[{t,s,u,c}], terms:[{t,d,u}]}` — a Worker (Task 4) ezt tölti le. Guide-URL: `${SITE.url}${LP}/article/${slug}` (minden cikk/guide az /article/ alatt él).

- [ ] **Step 1: GYIK-tábla beszúrása a build.js-be**

A `for (const l of SITE_LANGS) Object.assign(UI[l], UI_SUPPORT[l] || {});` sor (≈264) UTÁN:

```js
// ===================================================================
// ÜGYFÉLSZOLGÁLAT GYIK (2026-07-20) — a kb.json „site” szekciója.
// A chat-motor CSAK innen + a guide-listából adhat linket (kitalált URL tilos).
// ===================================================================
const CS_FAQ = {
  en: [
    { q: 'What is AI World HQ?', a: 'An automated, independent news + guides site that helps everyday people use AI. Content is produced by an AI newsroom with honesty checks, in 5 languages.', p: '/about.html' },
    { q: 'How do I subscribe to the newsletter?', a: 'Use the newsletter box at the bottom of any page — you will get a confirmation email first.', p: '/' },
    { q: 'How do I report a mistake in an article?', a: 'Use the 👍/👎 buttons under the article, or send us a message — genuine errors get corrected and republished.', p: '/about.html' },
    { q: 'Is the site free? How can I support it?', a: 'Everything is free. If you want, you can leave a voluntary tip on the Support page.', p: '/support.html' },
    { q: 'Where do I find beginner guides?', a: 'The Start page lists the first 5 guides to read, and the Guides page has all of them by topic.', p: '/start.html' },
    { q: 'What do AI words like prompt or token mean?', a: 'Our AI glossary explains the most common terms in plain language.', p: '/glossary.html' },
    { q: 'Is there an RSS feed?', a: 'Yes — every language has its own feed.', p: '/feed.xml' }
  ],
  hu: [
    { q: 'Mi az AI World HQ?', a: 'Automata, független hír- és útmutató-oldal, ami a hétköznapi AI-használatban segít. A tartalmat AI-szerkesztőség készíti őszinteség-ellenőrzéssel, 5 nyelven.', p: '/about.html' },
    { q: 'Hogyan iratkozom fel a hírlevélre?', a: 'Bármelyik oldal alján a hírlevél-dobozzal — először megerősítő emailt kapsz.', p: '/' },
    { q: 'Hogyan jelezhetek hibát egy cikkben?', a: 'A cikk alatti 👍/👎 gombokkal, vagy írj nekünk — a valódi hibákat javítjuk és újra kiadjuk.', p: '/about.html' },
    { q: 'Ingyenes az oldal? Hogyan támogathatom?', a: 'Minden ingyenes. Ha szeretnéd, a Támogatás oldalon önkéntes borravalót adhatsz.', p: '/support.html' },
    { q: 'Hol találom a kezdő útmutatókat?', a: 'A Kezdés oldal az első 5 ajánlott útmutatót mutatja, az Útmutatók oldalon pedig az összes megvan téma szerint.', p: '/start.html' },
    { q: 'Mit jelentenek az AI-szavak, pl. prompt vagy token?', a: 'Az AI-kisszótárunk közérthetően elmagyarázza a leggyakoribb fogalmakat.', p: '/glossary.html' },
    { q: 'Van RSS?', a: 'Igen — minden nyelvnek saját feedje van.', p: '/feed.xml' }
  ],
  es: [
    { q: '¿Qué es AI World HQ?', a: 'Un sitio automático e independiente de noticias y guías que te ayuda a usar la IA en el día a día. El contenido lo produce una redacción de IA con controles de honestidad, en 5 idiomas.', p: '/about.html' },
    { q: '¿Cómo me suscribo al boletín?', a: 'Con la caja de boletín al final de cualquier página — primero recibirás un correo de confirmación.', p: '/' },
    { q: '¿Cómo aviso de un error en un artículo?', a: 'Con los botones 👍/👎 bajo el artículo, o escríbenos — los errores reales se corrigen y se vuelven a publicar.', p: '/about.html' },
    { q: '¿El sitio es gratis? ¿Cómo puedo apoyarlo?', a: 'Todo es gratis. Si quieres, puedes dejar una propina voluntaria en la página de Apoyo.', p: '/support.html' },
    { q: '¿Dónde están las guías para principiantes?', a: 'La página Empezar muestra las 5 primeras guías recomendadas, y en Guías están todas por tema.', p: '/start.html' },
    { q: '¿Qué significan palabras como prompt o token?', a: 'Nuestro pequeño glosario de IA explica los términos más comunes en lenguaje claro.', p: '/glossary.html' },
    { q: '¿Hay RSS?', a: 'Sí — cada idioma tiene su propio feed.', p: '/feed.xml' }
  ],
  de: [
    { q: 'Was ist AI World HQ?', a: 'Eine automatische, unabhängige News- und Anleitungsseite, die dir hilft, KI im Alltag zu nutzen. Die Inhalte erstellt eine KI-Redaktion mit Ehrlichkeits-Checks, in 5 Sprachen.', p: '/about.html' },
    { q: 'Wie abonniere ich den Newsletter?', a: 'Über die Newsletter-Box unten auf jeder Seite — du bekommst zuerst eine Bestätigungs-E-Mail.', p: '/' },
    { q: 'Wie melde ich einen Fehler in einem Artikel?', a: 'Mit den 👍/👎-Buttons unter dem Artikel, oder schreib uns — echte Fehler werden korrigiert und neu veröffentlicht.', p: '/about.html' },
    { q: 'Ist die Seite kostenlos? Wie kann ich sie unterstützen?', a: 'Alles ist kostenlos. Wenn du magst, kannst du auf der Unterstützen-Seite ein freiwilliges Trinkgeld geben.', p: '/support.html' },
    { q: 'Wo finde ich Anleitungen für Einsteiger?', a: 'Die Start-Seite zeigt die ersten 5 empfohlenen Anleitungen, auf der Anleitungen-Seite findest du alle nach Thema.', p: '/start.html' },
    { q: 'Was bedeuten KI-Wörter wie Prompt oder Token?', a: 'Unser kleines KI-Glossar erklärt die häufigsten Begriffe verständlich.', p: '/glossary.html' },
    { q: 'Gibt es RSS?', a: 'Ja — jede Sprache hat ihren eigenen Feed.', p: '/feed.xml' }
  ],
  fr: [
    { q: 'Qu’est-ce que AI World HQ ?', a: 'Un site automatique et indépendant d’actus et de guides qui vous aide à utiliser l’IA au quotidien. Le contenu est produit par une rédaction IA avec des contrôles d’honnêteté, en 5 langues.', p: '/about.html' },
    { q: 'Comment s’abonner à la newsletter ?', a: 'Avec la boîte newsletter en bas de chaque page — vous recevrez d’abord un e-mail de confirmation.', p: '/' },
    { q: 'Comment signaler une erreur dans un article ?', a: 'Avec les boutons 👍/👎 sous l’article, ou écrivez-nous — les vraies erreurs sont corrigées et republiées.', p: '/about.html' },
    { q: 'Le site est-il gratuit ? Comment le soutenir ?', a: 'Tout est gratuit. Si vous le souhaitez, vous pouvez laisser un pourboire volontaire sur la page Soutenir.', p: '/support.html' },
    { q: 'Où trouver les guides pour débutants ?', a: 'La page Commencer présente les 5 premiers guides recommandés, et la page Guides les regroupe tous par thème.', p: '/start.html' },
    { q: 'Que signifient les mots comme prompt ou token ?', a: 'Notre petit glossaire IA explique les termes les plus courants en langage clair.', p: '/glossary.html' },
    { q: 'Y a-t-il un flux RSS ?', a: 'Oui — chaque langue a son propre flux.', p: '/feed.xml' }
  ]
};
```

- [ ] **Step 2: kb.json kiírása a search.json mellé**

A `writeFileSync(join(outBase, 'search.json'), ...)` sor (≈2246) UTÁN közvetlenül:

```js
    // ÜGYFÉLSZOLGÁLAT kb.json (2026-07-20): guide-ok + GYIK + kisszótár — a
    // Worker chat-motorja ebből keres és CSAK ebből linkel (kitalált URL tilos).
    const kbGuides = loc.filter(a => a.isGuide).map(a => ({
      t: a.title, s: a.subtitle || '', u: `${SITE.url}${LP}/article/${a.slug}`, c: a.company || ''
    }));
    const kbSite = (CS_FAQ[lang] || CS_FAQ.en).map(f => ({
      q: f.q, a: f.a, u: `${SITE.url}${f.p === '/' ? (LP || '/') : LP + f.p}`
    }));
    const kbTerms = GLOSSARY.terms.map(t => ({
      t: (t[lang] || t.en).term, d: (t[lang] || t.en).def, u: `${SITE.url}${LP}/glossary.html`
    }));
    writeFileSync(join(outBase, 'kb.json'),
      JSON.stringify({ v: 1, lang, site: kbSite, guides: kbGuides, terms: kbTerms }), 'utf-8');
```

FIGYELEM: ellenőrizd a build.js-ben a kisszótár betöltésének változónevét (a `buildGlossaryPage()` környékén, grep: `glossary-data`). Ha nem `GLOSSARY`, használd az ottani nevet. Ha a betöltés a függvényen BELÜL történik, emeld ki modul-szintre: `const GLOSSARY = JSON.parse(readFileSync(join(__dirname, 'glossary-data.json'), 'utf-8'));` és a régi helyen is ezt használd.

- [ ] **Step 3: Build + validálás**

```bash
cd "/c/AI work/ai-world-co" && node website/build.js && node -e "
const fs=require('fs');
for (const p of ['website/public/kb.json','website/public/hu/kb.json','website/public/fr/kb.json']) {
  const kb=JSON.parse(fs.readFileSync(p,'utf-8'));
  if (!kb.guides.length || !kb.site.length || !kb.terms.length) throw new Error(p+': üres szekció');
  for (const g of kb.guides.slice(0,5)) {
    const local='website/public'+g.u.replace('https://aiworldhq.com','')+'.html';
    if (!fs.existsSync(local)) throw new Error('halott kb-link: '+g.u);
  }
  console.log('✅', p, kb.guides.length+' guide,', kb.site.length+' GYIK,', kb.terms.length+' fogalom,', (fs.statSync(p).size/1024).toFixed(0)+' KB');
}"
```
Elvárt: 3 ✅ sor, fájlonként ~150+ guide, 7 GYIK, 19 fogalom, <80 KB.

- [ ] **Step 4: Commit**

```bash
cd "/c/AI work/ai-world-co" && git add website/build.js && git commit -m "feat(ügyfélszolgálat 2/9): kb.json tudáscsomag a buildből (guide+GYIK+kisszótár, 5 nyelven)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: config + wrangler — kapcsolók és AI-binding

**Files:**
- Modify: `config.json` (top-level új blokk az `infrastructure` után)
- Modify: `telegram-worker/wrangler.toml`

**Interfaces:**
- Produces: `config.customer_service = {enabled, worker_base, turnstile_site_key}` — a build (Task 7) olvassa. Worker-oldalon: `env.CS_ENABLED` ('true'/'false' string), `env.AI` binding, `env.TURNSTILE_SECRET` secret (később).

- [ ] **Step 1: config.json blokk**

Az `infrastructure` blokk UTÁN (vesszővel), a `limits` ELÉ:

```json
  "customer_service": {
    "_comment": "Automata ügyfélszolgálat (2026-07-20, spec: 2026-07-19-auto-ugyfelszolgalat-design.md). enabled=false → a build NEM teszi ki a chat-dobozt/űrlapot. A worker-oldali kill-switch KÜLÖN van: telegram-worker/wrangler.toml [vars] CS_ENABLED. turnstile_site_key PUBLIKUS by design (a secret párja CSAK wrangler secret!). Az itteni kulcs a Cloudflare TESZT-kulcs (mindig átenged) — élesítéskor a valódira cserélendő.",
    "enabled": false,
    "worker_base": "https://aiworld-telegram.pacsi84.workers.dev",
    "turnstile_site_key": "1x00000000000000000000AA"
  },
```

- [ ] **Step 2: wrangler.toml — AI-binding + kill-switch var**

A `[vars]` blokk bővítése és a fájl vége:

```toml
[vars]
GH_REPO = "Pacso84/ai-world-co"
# Ügyfélszolgálat worker-oldali kill-switch (2026-07-20): "false" → /chat,/contact,email 503/eldob
CS_ENABLED = "true"

# Workers AI — az ügyfélszolgálat ingyenes válasz-motorja (env.AI)
[ai]
binding = "AI"
```

- [ ] **Step 3: Ellenőrzés**

```bash
cd "/c/AI work/ai-world-co" && node -e "const c=require('./config.json'); if (c.customer_service.enabled !== false) throw 1; console.log('✅ config OK:', JSON.stringify(c.customer_service.worker_base))" && cd telegram-worker && npx wrangler deploy --dry-run 2>&1 | tail -5
```
Elvárt: `✅ config OK` + a dry-run felsorolja a bindingokat (AI + FEEDBACK KV), hiba nélkül.

- [ ] **Step 4: Commit**

```bash
cd "/c/AI work/ai-world-co" && git add config.json telegram-worker/wrangler.toml && git commit -m "feat(ügyfélszolgálat 3/9): kapcsolók (config+wrangler) és Workers AI binding

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: cs-engine — a közös válasz-motor (TDD, fake env-vel)

**Files:**
- Create: `telegram-worker/src/cs-engine.js`
- Test: `telegram-worker/test/cs-engine.test.js`

**Interfaces:**
- Consumes: `searchKb` (Task 1); `env.AI.run(model, {messages, max_tokens})`; `env.FEEDBACK` KV (get/put); globális `fetch` (kb.json letöltés — tesztben injektált).
- Produces: `answer(env, {message, lang, fetchFn?}) → {text, escalate, links:[{t,u}]}` — a Task 5 (routes) és Task 6 (email) hívja. `lang` = 'en'|'hu'|'es'|'de'|'fr'|'auto' (auto = email-ág, EN kb + „a feladó nyelvén válaszolj”). Export még: `MODEL`, `loadKb(env, lang, fetchFn)`.

- [ ] **Step 1: Bukó teszt**

`telegram-worker/test/cs-engine.test.js`:
```js
// node telegram-worker/test/cs-engine.test.js — offline: fake KV + fake AI + fake fetch
import { strict as assert } from 'assert';
import { answer, loadKb, MODEL } from '../src/cs-engine.js';

function fakeKv() {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); },
    _store: store
  };
}
const KB = { v: 1, lang: 'en', site: [{ q: 'How do I subscribe to the newsletter?', a: 'Box at the bottom.', u: 'https://aiworldhq.com/#nl' }], guides: [{ t: 'Getting started with ChatGPT writing', s: 'Beginner writing guide.', u: 'https://aiworldhq.com/article/chatgpt-writing', c: 'OpenAI' }], terms: [] };
let fetchCount = 0;
const fakeFetch = async (url) => { fetchCount++; assert.ok(url.includes('/kb.json'), 'kb URL-t kér'); return { ok: true, json: async () => KB }; };

// 1) loadKb: első hívás fetch-el, második KV-cache-ből (nincs új fetch)
{
  const env = { FEEDBACK: fakeKv() };
  const kb1 = await loadKb(env, 'en', fakeFetch);
  assert.equal(kb1.guides.length, 1);
  const before = fetchCount;
  await loadKb(env, 'en', fakeFetch);
  assert.equal(fetchCount, before, 'másodszor cache-ből jön');
}

// 2) answer: releváns kérdés → AI-válasz + a kb-ból származó link
{
  const env = {
    FEEDBACK: fakeKv(),
    AI: { async run(model, opts) {
      assert.equal(model, MODEL);
      const sys = opts.messages[0].content;
      assert.ok(sys.includes('chatgpt-writing'), 'a releváns kb-találat a promptban van');
      assert.ok(sys.includes('NEVER invent'), 'link-tiltás a promptban');
      return { response: 'Start with our ChatGPT writing guide: https://aiworldhq.com/article/chatgpt-writing' };
    } }
  };
  const r = await answer(env, { message: 'how do I start writing with chatgpt?', lang: 'en', fetchFn: fakeFetch });
  assert.equal(r.escalate, false);
  assert.ok(r.text.includes('guide'));
  assert.deepEqual(r.links.map(l => l.u), ['https://aiworldhq.com/article/chatgpt-writing']);
}

// 3) [ESCALATE] szentinel → escalate:true, a jelölő letisztítva
{
  const env = { FEEDBACK: fakeKv(), AI: { async run() { return { response: '[ESCALATE] I cannot help with that here.' }; } } };
  const r = await answer(env, { message: 'refund my bank transfer please', lang: 'en', fetchFn: fakeFetch });
  assert.equal(r.escalate, true);
  assert.ok(!r.text.includes('[ESCALATE]'));
}

// 4) AI-hiba → escalate:true, üres text (a hívó ad fallback-szöveget)
{
  const env = { FEEDBACK: fakeKv(), AI: { async run() { throw new Error('capacity'); } } };
  const r = await answer(env, { message: 'hello', lang: 'hu', fetchFn: fakeFetch });
  assert.equal(r.escalate, true);
  assert.equal(r.text, '');
}

console.log('✅ cs-engine.test: minden átment');
```

- [ ] **Step 2: Futtatás — bukjon**

Futtatás: `node telegram-worker/test/cs-engine.test.js` → Elvárt: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implementáció**

`telegram-worker/src/cs-engine.js`:
```js
// ===================================================================
// CS-ENGINE — az automata ügyfélszolgálat közös válasz-motorja.
// kb.json (site-ról, KV-cache 6h) → kulcsszavas találatok → Workers AI.
// Szabályok a promptban: hatókör, nyelv, LINK CSAK A KB-BÓL, [ESCALATE].
// Spec: docs/superpowers/specs/2026-07-19-auto-ugyfelszolgalat-design.md
// ===================================================================
import { searchKb } from './kb-retrieval.js';

export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const SITE = 'https://aiworldhq.com';
const KB_TTL = 21600; // 6 óra

export async function loadKb(env, lang, fetchFn = fetch) {
  const l = ['en', 'hu', 'es', 'de', 'fr'].includes(lang) ? lang : 'en';
  const key = `cs:kb:${l}`;
  const cached = await env.FEEDBACK.get(key);
  if (cached) { try { return JSON.parse(cached); } catch { /* újratöltés */ } }
  const url = l === 'en' ? `${SITE}/kb.json` : `${SITE}/${l}/kb.json`;
  const r = await fetchFn(url);
  if (!r.ok) throw new Error('kb fetch ' + r.status);
  const kb = await r.json();
  await env.FEEDBACK.put(key, JSON.stringify(kb), { expirationTtl: KB_TTL });
  return kb;
}

// A megszólítás-norma (2026-07-14) a promptban: hu=tegezés, de=du, es=tú, fr=vous.
const LANG_RULE = {
  en: 'Reply in English.',
  hu: 'Válaszolj magyarul, tegeződve (te).',
  es: 'Responde en español, tuteando (tú).',
  de: 'Antworte auf Deutsch, in der Du-Form.',
  fr: 'Répondez en français, en vouvoyant (vous).',
  auto: 'Reply in the same language the visitor wrote in.'
};

function systemPrompt(lang, hits) {
  const kbBlock = hits.length
    ? hits.map(h => `- ${h.t}: ${h.s} [${h.u}]`).join('\n')
    : '(no matching knowledge items)';
  return `You are the friendly automated support assistant of AI World HQ (${SITE}), a free news+guides site that helps everyday people use AI.

SCOPE — you may ONLY discuss: (a) this website (content, newsletter, error reports, support page), (b) practical AI-tool questions covered by our guides. For ANYTHING else (personal data, payments, legal/medical advice, coding help, homework, politics, other companies' support), start your reply with the exact marker [ESCALATE] and add one polite sentence suggesting the contact form.

HONESTY — answer ONLY from the KNOWLEDGE list below. NEVER invent tools, features, prices or URLs. Every link you give MUST be copied verbatim from the KNOWLEDGE list. If the list has no answer, start with [ESCALATE] and say honestly that you are not sure.

STYLE — ${LANG_RULE[lang] || LANG_RULE.en} Max ~120 words. Plain, warm, beginner-friendly. When a guide is relevant, recommend it with its link.

KNOWLEDGE:
${kbBlock}`;
}

// Fő belépő: {message, lang, fetchFn?} → {text, escalate, links}
export async function answer(env, { message, lang, fetchFn = fetch }) {
  try {
    const kb = await loadKb(env, lang === 'auto' ? 'en' : lang, fetchFn);
    const hits = searchKb(message, kb, 4);
    const res = await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: systemPrompt(lang, hits) },
        { role: 'user', content: String(message).slice(0, 500) }
      ],
      max_tokens: 600
    });
    let text = String(res.response || '').trim();
    const escalate = text.startsWith('[ESCALATE]');
    text = text.replace(/^\[ESCALATE\]\s*/, '').trim();
    // Csak a kb-találatokban szereplő linkeket adjuk vissza kattinthatóként —
    // ha a modell mást írna, az a szövegben marad, de a UI-ban nem lesz gomb.
    const links = hits.filter(h => text.includes(h.u)).map(h => ({ t: h.t, u: h.u }));
    return { text, escalate, links };
  } catch (e) {
    console.log('cs-engine hiba', e && e.message);
    return { text: '', escalate: true, links: [] };
  }
}
```

- [ ] **Step 4: Teszt fusson át**

Futtatás: `node telegram-worker/test/cs-engine.test.js` → Elvárt: `✅ cs-engine.test: minden átment`
Utána Task 1 tesztje is: `node telegram-worker/test/kb-retrieval.test.js` → továbbra is ✅.

- [ ] **Step 5: Commit**

```bash
cd "/c/AI work/ai-world-co" && git add telegram-worker/src/cs-engine.js telegram-worker/test/cs-engine.test.js && git commit -m "feat(ügyfélszolgálat 4/9): közös válasz-motor (Workers AI + kb-kereső + eszkaláció)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: /chat + /contact route-ok, limitek, Turnstile, számlálók

**Files:**
- Create: `telegram-worker/src/tg.js` (a tg() kiemelése — a worker.js és a Task 6 email is használja)
- Create: `telegram-worker/src/cs-routes.js`
- Modify: `telegram-worker/src/worker.js` (route-bekötés + tg-import + export-bővítés)
- Test: `telegram-worker/test/cs-routes.test.js`

**Interfaces:**
- Consumes: `answer` (Task 4).
- Produces: `handleChat(request, env)`, `handleContact(request, env)`, `csCounters(env) → {chat, mail, esc}` (a feedback-exporthoz), `bumpCs(env, kind)` ('chat'|'mail'|'esc' — Task 6 is hívja), `globalLimitReached(env)`, `LIMIT_MSG[lang]`. `tg(env, chatId, text)` a `./tg.js`-ből.
- API: `POST /chat {message, lang, sessionId?, token?}` → 200 `{answer, links, escalate, sessionId}` | 403 (turnstile) | 429 `{limit:true, answer}` | 503 (kill-switch). `POST /contact {email, message, name?, lang, web, token}` → 200 'ok' | 400 | 403 | 503.

- [ ] **Step 1: tg() kiemelése**

`telegram-worker/src/tg.js`:
```js
// Telegram-üzenetküldő — közös modul (worker fetch-ág + ügyfélszolgálat email-ág).
export async function tg(env, chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch (e) {
    console.log('Telegram küldés hiba', e);
  }
}
```

`worker.js`-ben: a fájl tetejére `import { tg } from './tg.js';`, és a fájl alján a teljes `async function tg(...) {...}` definíció TÖRLENDŐ (a hívási helyek változatlanok).

- [ ] **Step 2: Bukó teszt**

`telegram-worker/test/cs-routes.test.js`:
```js
// node telegram-worker/test/cs-routes.test.js — offline: fake env + globális fetch-csere
import { strict as assert } from 'assert';
import { handleChat, handleContact, csCounters, LIMIT_MSG } from '../src/cs-routes.js';

function fakeKv() {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, String(v)); },
    _store: store
  };
}
const KB = { v: 1, lang: 'en', site: [], guides: [{ t: 'ChatGPT writing', s: 'guide', u: 'https://aiworldhq.com/article/x', c: 'OpenAI' }], terms: [] };
function baseEnv(over = {}) {
  return {
    CS_ENABLED: 'true', TURNSTILE_SECRET: 'ts-secret', OWNER_CHAT_ID: '42', BOT_TOKEN: 'bt',
    FEEDBACK: fakeKv(),
    AI: { async run() { return { response: 'Here you go.' }; } },
    ...over
  };
}
const realFetch = globalThis.fetch;
// Turnstile-verify + kb-fetch + Telegram — mind hálózat: stub.
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('turnstile')) {
    const body = String(opts.body);
    return { ok: true, json: async () => ({ success: body.includes('good-token') }) };
  }
  if (String(url).includes('kb.json')) return { ok: true, json: async () => KB };
  if (String(url).includes('api.telegram.org')) { globalThis.__tgSent = (globalThis.__tgSent || 0) + 1; return { ok: true, json: async () => ({}) }; }
  throw new Error('váratlan fetch: ' + url);
};

function req(path, body, ip = '1.2.3.4') {
  return new Request('https://w.dev' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, Origin: 'https://aiworldhq.com' },
    body: JSON.stringify(body)
  });
}

try {
  // 1) kill-switch: CS_ENABLED!=='true' → 503
  {
    const r = await handleChat(req('/chat', { message: 'hi', lang: 'en', token: 'good-token' }), baseEnv({ CS_ENABLED: 'false' }));
    assert.equal(r.status, 503);
  }
  // 2) nincs/rossz turnstile-token első üzenetnél → 403
  {
    const r = await handleChat(req('/chat', { message: 'hi', lang: 'en', token: 'bad' }), baseEnv());
    assert.equal(r.status, 403);
  }
  // 3) happy path: jó token → 200, sessionId, válasz; a sessionId-vel a 2. üzenethez már nem kell token
  {
    const env = baseEnv();
    const r1 = await handleChat(req('/chat', { message: 'chatgpt writing help', lang: 'en', token: 'good-token' }), env);
    assert.equal(r1.status, 200);
    const j1 = await r1.json();
    assert.ok(j1.sessionId && j1.answer.length > 0);
    const r2 = await handleChat(req('/chat', { message: 'thanks', lang: 'en', sessionId: j1.sessionId }), env);
    assert.equal(r2.status, 200);
    const c = await csCounters(env);
    assert.equal(c.chat, 2, 'két chat-válasz számolva');
  }
  // 4) munkamenet-limit: 10 üzenet után 429 + limit-üzenet
  {
    const env = baseEnv();
    const r1 = await handleChat(req('/chat', { message: 'hello', lang: 'hu', token: 'good-token' }), env);
    const { sessionId } = await r1.json();
    let last;
    for (let i = 0; i < 10; i++) last = await handleChat(req('/chat', { message: 'm' + i, lang: 'hu', sessionId }), env);
    assert.equal(last.status, 429);
    assert.equal((await last.json()).answer, LIMIT_MSG.hu);
  }
  // 5) globális napi limit → 429 AI-hívás nélkül
  {
    const env = baseEnv({ AI: { async run() { throw new Error('NEM szabadna AI-t hívni'); } } });
    const day = new Date().toISOString().slice(0, 10);
    await env.FEEDBACK.put(`cs:global:${day}`, '300');
    const r = await handleChat(req('/chat', { message: 'hi', lang: 'en', token: 'good-token' }), env);
    assert.equal(r.status, 429);
  }
  // 6) contact happy path: KV-mentés + Telegram + esc-számláló; honeypot csendes ok
  {
    const env = baseEnv();
    globalThis.__tgSent = 0;
    const r = await handleContact(req('/contact', { email: 'a@b.hu', message: 'Segítsetek!', lang: 'hu', web: '', token: 'good-token' }), env);
    assert.equal(r.status, 200);
    assert.equal(globalThis.__tgSent, 1, 'Telegram-jelzés kiment');
    assert.ok([...env.FEEDBACK._store.keys()].some(k => k.startsWith('cs:msg:')), 'üzenet elmentve');
    assert.equal((await csCounters(env)).esc, 1);
    const hp = await handleContact(req('/contact', { email: 'x@y.z', message: 'spam', lang: 'en', web: 'bot-filled', token: 'good-token' }), env);
    assert.equal(hp.status, 200);
    assert.equal(globalThis.__tgSent, 1, 'honeypotnál NINCS Telegram');
  }
  // 7) rossz email a contactban → 400
  {
    const r = await handleContact(req('/contact', { email: 'nem-email', message: 'x', lang: 'en', web: '', token: 'good-token' }), baseEnv());
    assert.equal(r.status, 400);
  }
  console.log('✅ cs-routes.test: minden átment');
} finally {
  globalThis.fetch = realFetch;
}
```

- [ ] **Step 3: Futtatás — bukjon**

Futtatás: `node telegram-worker/test/cs-routes.test.js` → Elvárt: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Implementáció**

`telegram-worker/src/cs-routes.js`:
```js
// ===================================================================
// CS-ROUTES — /chat és /contact végpontok + védelem (2026-07-20).
// Kétszintű limit (10/nap/IP+munkamenet, 300/nap globális) — mint a havi
// vész-stop elve: degradáció (emailre terelés), nem összeomlás.
// IP-t CSAK hashelve tárolunk (adatvédelem). Kill-switch: env.CS_ENABLED.
// ===================================================================
import { answer } from './cs-engine.js';
import { tg } from './tg.js';

const ORIGINS = ['https://aiworldhq.com', 'https://www.aiworldhq.com'];
const LANGS = ['en', 'hu', 'es', 'de', 'fr'];
const SESSION_MAX = 10;      // üzenet / munkamenet
const IP_DAILY_MAX = 10;     // üzenet / nap / látogató
const GLOBAL_DAILY_MAX = 300; // AI-hívás / nap összesen (chat+email)

export const LIMIT_MSG = {
  en: 'I have reached today’s free answer limit. Please use the contact form below — a human will get back to you by email. 💛',
  hu: 'Mára elfogyott az ingyenes válasz-keretem. Kérlek, használd a lenti űrlapot — emailben válaszolunk. 💛',
  es: 'He alcanzado el límite de respuestas gratuitas de hoy. Usa el formulario de contacto — te responderemos por correo. 💛',
  de: 'Mein kostenloses Antwort-Kontingent für heute ist aufgebraucht. Nutze bitte das Kontaktformular — wir antworten per E-Mail. 💛',
  fr: 'J’ai atteint ma limite de réponses gratuites pour aujourd’hui. Utilisez le formulaire de contact — nous vous répondrons par e-mail. 💛'
};
export const ESC_FALLBACK = {
  en: 'I’m not able to help with that here — please use the contact form and a human will reply by email.',
  hu: 'Ebben itt nem tudok segíteni — kérlek, használd az űrlapot, és emailben válaszolunk.',
  es: 'No puedo ayudarte con eso aquí — usa el formulario y te responderemos por correo.',
  de: 'Dabei kann ich hier nicht helfen — nutze bitte das Formular, wir antworten per E-Mail.',
  fr: 'Je ne peux pas vous aider ici — utilisez le formulaire et nous vous répondrons par e-mail.'
};

function cors(request) {
  const o = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}
const j = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: h });

export function dayKey() { return new Date().toISOString().slice(0, 10); }

async function hashIp(ip) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cs-salt:' + ip));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function bump(env, key, ttl) {
  const n = parseInt(await env.FEEDBACK.get(key) || '0', 10) + 1;
  await env.FEEDBACK.put(key, String(n), { expirationTtl: ttl });
  return n;
}

// Napi riport-számlálók: chat-válasz / email-válasz / emberi kézbe adva
export async function bumpCs(env, kind) {
  await bump(env, `cs:${kind}:${dayKey()}`, 172800);
}
export async function csCounters(env) {
  const d = dayKey();
  const out = {};
  for (const k of ['chat', 'mail', 'esc']) {
    out[k] = parseInt(await env.FEEDBACK.get(`cs:${k}:${d}`) || '0', 10);
  }
  return out;
}
export async function globalLimitReached(env) {
  return parseInt(await env.FEEDBACK.get(`cs:global:${dayKey()}`) || '0', 10) >= GLOBAL_DAILY_MAX;
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return false; // nincs beállítva → zárva (mint a MailerLite-minta)
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token || ''), remoteip: ip })
    });
    return (await r.json()).success === true;
  } catch { return false; }
}

export async function handleChat(request, env) {
  const h = cors(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (request.method !== 'POST') return j({ error: 'method' }, 405, h);
  if (env.CS_ENABLED !== 'true') return j({ error: 'off' }, 503, h);
  let body;
  try { body = await request.json(); } catch { return j({ error: 'bad json' }, 400, h); }
  const lang = LANGS.includes(body.lang) ? body.lang : 'en';
  const message = String(body.message || '').trim().slice(0, 500);
  if (!message) return j({ error: 'empty' }, 400, h);
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const iph = await hashIp(ip);

  // Munkamenet: első üzenetnél Turnstile, utána sessionId (KV, 1h)
  let sessionId = String(body.sessionId || '');
  let sess = sessionId ? await env.FEEDBACK.get(`cs:sess:${sessionId}`) : null;
  if (!sess) {
    if (!(await verifyTurnstile(env, body.token, ip))) return j({ error: 'turnstile' }, 403, h);
    sessionId = crypto.randomUUID();
    sess = '0';
  }
  const sessCount = parseInt(sess, 10);
  if (sessCount >= SESSION_MAX) return j({ limit: true, answer: LIMIT_MSG[lang], links: [], escalate: true, sessionId }, 429, h);
  const ipCount = parseInt(await env.FEEDBACK.get(`cs:ip:${iph}:${dayKey()}`) || '0', 10);
  if (ipCount >= IP_DAILY_MAX) return j({ limit: true, answer: LIMIT_MSG[lang], links: [], escalate: true, sessionId }, 429, h);
  if (await globalLimitReached(env)) return j({ limit: true, answer: LIMIT_MSG[lang], links: [], escalate: true, sessionId }, 429, h);

  const r = await answer(env, { message, lang });
  await env.FEEDBACK.put(`cs:sess:${sessionId}`, String(sessCount + 1), { expirationTtl: 3600 });
  await bump(env, `cs:ip:${iph}:${dayKey()}`, 172800);
  await bump(env, `cs:global:${dayKey()}`, 172800);
  await bumpCs(env, 'chat');
  if (r.escalate) await bumpCs(env, 'esc');
  const text = r.text || ESC_FALLBACK[lang];
  return j({ answer: text, links: r.links, escalate: r.escalate, sessionId }, 200, h);
}

export async function handleContact(request, env) {
  const h = cors(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (request.method !== 'POST') return j({ error: 'method' }, 405, h);
  if (env.CS_ENABLED !== 'true') return j({ error: 'off' }, 503, h);
  let body;
  try { body = await request.json(); } catch { return j({ error: 'bad json' }, 400, h); }
  if (body.web) return j({ ok: true }, 200, h); // honeypot: bot volt, csendes eldobás
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return j({ error: 'bad email' }, 400, h);
  const message = String(body.message || '').trim().slice(0, 2000);
  if (!message) return j({ error: 'empty' }, 400, h);
  const lang = LANGS.includes(body.lang) ? body.lang : 'en';
  const name = String(body.name || '').trim().slice(0, 80);
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  if (!(await verifyTurnstile(env, body.token, ip))) return j({ error: 'turnstile' }, 403, h);

  const ts = Date.now();
  await env.FEEDBACK.put(`cs:msg:${ts}`, JSON.stringify({ email, name, message, lang, ts }), { expirationTtl: 2592000 }); // 30 nap
  await bumpCs(env, 'esc');
  await tg(env, env.OWNER_CHAT_ID, `📝 ÚJ ÜGYFÉL-ÜZENET (űrlap, ${lang})\nFeladó: ${name ? name + ' — ' : ''}${email}\n\n${message.slice(0, 600)}\n\n(Válasz: sima email a feladónak.)`);
  return j({ ok: true }, 200, h);
}
```

`worker.js` módosítások (3 pont):
1. Fájl teteje: `import { tg } from './tg.js';` és `import { handleChat, handleContact, csCounters } from './cs-routes.js';`
2. A route-elágazásba a `/subscribe` sor UTÁN:
```js
    if (path === '/chat') return handleChat(request, env);
    if (path === '/contact') return handleContact(request, env);
```
3. A `handleFeedbackExport`-ban a `__nl_signups` sor UTÁN:
```js
  // Ügyfélszolgálat napi számlálói a riportoknak (2026-07-20)
  try { out.__cs = await csCounters(env); } catch { /* skip */ }
```
4. A fájl aljáról a lokális `tg()` definíció törlése (Step 1).

- [ ] **Step 5: Tesztek fussanak**

```bash
node telegram-worker/test/cs-routes.test.js && node telegram-worker/test/cs-engine.test.js && node telegram-worker/test/kb-retrieval.test.js
```
Elvárt: 3× ✅.

- [ ] **Step 6: Commit**

```bash
cd "/c/AI work/ai-world-co" && git add telegram-worker/src && git add telegram-worker/test/cs-routes.test.js && git commit -m "feat(ügyfélszolgálat 5/9): /chat+/contact route-ok, Turnstile, kétszintű limit, számlálók

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Email-ág — support@ fogadás, auto-válasz, hurok-védelem

**Files:**
- Create: `telegram-worker/package.json`
- Create: `telegram-worker/src/cs-email-rules.js` (tiszta, függőség NÉLKÜLI szabályok — node-tesztelhető)
- Create: `telegram-worker/src/cs-email.js` (CF-specifikus rész — a `cloudflare:email` importot node NEM tudja betölteni, EZÉRT van a kettéválasztás)
- Modify: `telegram-worker/src/worker.js` (email handler export)
- Test: `telegram-worker/test/cs-email.test.js` (CSAK a rules-fájlt importálja!)

**Interfaces:**
- Consumes: `answer` (Task 4), `tg` (Task 5), `bumpCs`/`globalLimitReached`/`dayKey` (Task 5), npm: `postal-mime`, `mimetext`, CF: `cloudflare:email` EmailMessage.
- Produces: `cs-email-rules.js`: `shouldAutoReply({autoSubmitted, from, todayCount}) → {ok, reason}`, `replyText(engineResult, lang) → string`. `cs-email.js`: `handleEmail(message, env)` (worker `email` export).

- [ ] **Step 1: package.json a workerhez**

`telegram-worker/package.json`:
```json
{
  "name": "aiworld-telegram-worker",
  "private": true,
  "type": "module",
  "dependencies": {
    "mimetext": "^3.0.24",
    "postal-mime": "^2.2.7"
  }
}
```
Futtatás: `cd "/c/AI work/ai-world-co/telegram-worker" && npm install` → Elvárt: 2 csomag felmegy, `node_modules` létrejön (a repo-gyökér .gitignore már kizárja a node_modules-t — ellenőrizd: `grep node_modules ../.gitignore`; ha nincs, vedd fel `telegram-worker/node_modules/` sorral).

- [ ] **Step 2: Bukó teszt (a tiszta részekre)**

`telegram-worker/test/cs-email.test.js`:
```js
// node telegram-worker/test/cs-email.test.js — a hurok-védelem és a válasz-sablon tesztje (offline)
// FIGYELEM: a rules-fájlt importáljuk, NEM a cs-email.js-t (abban cloudflare:email import van)!
import { strict as assert } from 'assert';
import { shouldAutoReply, replyText } from '../src/cs-email-rules.js';

// auto-reply fejléc → tilos
assert.deepEqual(shouldAutoReply({ autoSubmitted: 'auto-replied', from: 'x@y.hu', todayCount: 0 }).ok, false);
// saját magunknak → tilos (visszapattanó/hurok)
assert.equal(shouldAutoReply({ autoSubmitted: '', from: 'support@aiworldhq.com', todayCount: 0 }).ok, false);
assert.equal(shouldAutoReply({ autoSubmitted: '', from: 'news@aiworldhq.com', todayCount: 0 }).ok, false);
// napi 2 válasz után → tilos
assert.equal(shouldAutoReply({ autoSubmitted: '', from: 'x@y.hu', todayCount: 2 }).ok, false);
// normál eset → mehet
assert.equal(shouldAutoReply({ autoSubmitted: '', from: 'x@y.hu', todayCount: 1 }).ok, true);

// válasz-sablon: AI-szöveg + lábjegyzet; eszkalációnál "továbbítottuk" sablon
const okBody = replyText({ text: 'Here is the guide.', escalate: false, links: [] }, 'en');
assert.ok(okBody.includes('Here is the guide.'));
assert.ok(okBody.includes('automated'), 'lábjegyzet jelzi, hogy automata');
const escBody = replyText({ text: '', escalate: true, links: [] }, 'en');
assert.ok(escBody.toLowerCase().includes('forwarded'), 'eszkalációnál továbbítás-sablon');
console.log('✅ cs-email.test: minden átment');
```

- [ ] **Step 3: Futtatás — bukjon**

`node telegram-worker/test/cs-email.test.js` → Elvárt: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Implementáció**

`telegram-worker/src/cs-email-rules.js` (tiszta szabályok, NULLA import — node-tesztelhető):
```js
// ===================================================================
// CS-EMAIL-RULES — az email-ág tiszta, függőség nélküli szabályai.
// KÜLÖN fájlban, mert a cs-email.js 'cloudflare:email' importját a
// node-teszt nem tudja betölteni — ezt a fájlt viszont igen.
// ===================================================================
export const SUPPORT_ADDR = 'support@aiworldhq.com';
const OWN_ADDRS = [SUPPORT_ADDR, 'news@aiworldhq.com'];

// Hurok-védelem döntése: szabad-e automatikusan válaszolni?
export function shouldAutoReply({ autoSubmitted, from, todayCount }) {
  if (autoSubmitted && autoSubmitted.toLowerCase() !== 'no') return { ok: false, reason: 'auto-submitted' };
  const f = String(from || '').toLowerCase();
  if (OWN_ADDRS.some(a => f.includes(a)) || f.endsWith('@aiworldhq.com')) return { ok: false, reason: 'own-address' };
  if (todayCount >= 2) return { ok: false, reason: 'daily-cap' };
  return { ok: true, reason: '' };
}

const FOOT = {
  en: '\n\n—\nThis is an automated reply from AI World HQ support. If it did not help, just reply to this email and a human will read it.',
  hu: '\n\n—\nEz az AI World HQ automata válasza. Ha nem segített, válaszolj erre a levélre, és egy ember is elolvassa.'
};
const FORWARDED = {
  en: 'Thanks for writing to AI World HQ! Your message has been forwarded to the team — a human will reply as soon as possible.',
  hu: 'Köszönjük a leveledet! Az üzenetedet továbbítottuk a csapatnak — hamarosan ember válaszol rá.'
};

// Motor-eredmény → levél-szöveg (eszkalációnál „továbbítottuk” sablon).
export function replyText(engineResult, lang) {
  const foot = FOOT[lang] || FOOT.en;
  if (engineResult.escalate || !engineResult.text) return (FORWARDED[lang] || FORWARDED.en) + foot;
  return engineResult.text + foot;
}
```

`telegram-worker/src/cs-email.js` (CF-specifikus rész):
```js
// ===================================================================
// CS-EMAIL — support@aiworldhq.com automata válasz (2026-07-20).
// Cloudflare Email Routing → email handler → közös motor → message.reply().
// HUROK-VÉDELEM: cs-email-rules.js (Auto-Submitted / saját cím / 2/nap/feladó).
// Minden bejövőről Telegram-másolat a tulajdonosnak.
// ===================================================================
import PostalMime from 'postal-mime';
import { createMimeMessage } from 'mimetext';
import { EmailMessage } from 'cloudflare:email';
import { answer } from './cs-engine.js';
import { tg } from './tg.js';
import { bumpCs, globalLimitReached, dayKey } from './cs-routes.js';
import { SUPPORT_ADDR, shouldAutoReply, replyText } from './cs-email-rules.js';

async function senderHash(from) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cs-mail:' + from.toLowerCase()));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export async function handleEmail(message, env) {
  if (env.CS_ENABLED !== 'true') return; // kill-switch: csendben eldob (a CF Routing naplózza)
  const from = message.from || '';
  let subject = '', text = '';
  try {
    const parsed = await PostalMime.parse(message.raw);
    subject = parsed.subject || '(no subject)';
    text = (parsed.text || '').trim() || (parsed.html || '').replace(/<[^>]+>/g, ' ').trim();
  } catch (e) {
    console.log('email parse hiba', e && e.message);
  }
  // Telegram-másolat MINDIG (ez a biztonsági háló, ha az auto-válasz nem megy ki)
  await tg(env, env.OWNER_CHAT_ID, `📧 ÚJ SUPPORT-EMAIL\nFeladó: ${from}\nTárgy: ${subject}\n\n${text.slice(0, 600)}`);

  const sh = await senderHash(from);
  const countKey = `cs:mailrl:${sh}:${dayKey()}`;
  const todayCount = parseInt(await env.FEEDBACK.get(countKey) || '0', 10);
  const gate = shouldAutoReply({ autoSubmitted: message.headers.get('Auto-Submitted') || '', from, todayCount });
  if (!gate.ok) { console.log('nincs auto-válasz:', gate.reason); return; }

  let engineResult = { text: '', escalate: true, links: [] };
  if (!(await globalLimitReached(env))) {
    engineResult = await answer(env, { message: `${subject}\n\n${text}`.slice(0, 1500), lang: 'auto' });
    await bumpCs(env, 'mail');
    if (engineResult.escalate) await bumpCs(env, 'esc');
  } else {
    await bumpCs(env, 'esc');
  }

  const msg = createMimeMessage();
  msg.setSender({ name: 'AI World HQ Support', addr: SUPPORT_ADDR });
  msg.setRecipient(from);
  msg.setSubject('Re: ' + subject);
  const inReplyTo = message.headers.get('Message-ID');
  if (inReplyTo) msg.setHeader('In-Reply-To', inReplyTo);
  msg.setHeader('Auto-Submitted', 'auto-replied'); // más robotok ne válaszolgassanak nekünk
  msg.addMessage({ contentType: 'text/plain', data: replyText(engineResult, 'en') });
  try {
    await message.reply(new EmailMessage(SUPPORT_ADDR, from, msg.asRaw()));
    await env.FEEDBACK.put(countKey, String(todayCount + 1), { expirationTtl: 172800 });
  } catch (e) {
    console.log('email reply hiba', e && e.message);
  }
}
```

`worker.js`: az `export default { async fetch(...) {...} }` blokk bővítése email handlerrel:
```js
import { handleEmail } from './cs-email.js';
// ... a default export végén, a fetch mellé:
export default {
  async fetch(request, env) { /* ... változatlan ... */ },
  async email(message, env) { return handleEmail(message, env); }
};
```

MEGJEGYZÉS: a kettéválasztás (rules vs. CF-rész) SZÁNDÉKOS és kötelező — a node-teszt csak a rules-fájlt importálhatja, a `cloudflare:email` sémát a node nem tudja betölteni.

- [ ] **Step 5: Teszt fusson + dry-run**

```bash
node telegram-worker/test/cs-email.test.js && cd "/c/AI work/ai-world-co/telegram-worker" && npx wrangler deploy --dry-run 2>&1 | tail -5
```
Elvárt: ✅ + a dry-run bundle-hiba nélkül lefut (postal-mime/mimetext be-bundle-ölve).

- [ ] **Step 6: Commit**

```bash
cd "/c/AI work/ai-world-co" && git add telegram-worker/package.json telegram-worker/package-lock.json telegram-worker/src telegram-worker/test/cs-email.test.js && git commit -m "feat(ügyfélszolgálat 6/9): support@ email-ág — auto-válasz, hurok-védelem, Telegram-másolat

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Honlap — chat-doboz, űrlap, UI-szövegek 5 nyelven

**Files:**
- Create: `website/assets/chat.js`
- Modify: `website/build.js` (UI_CHAT tábla + CS-config beolvasás + pageShell widget + about-oldal űrlap)
- Modify: `website/assets/style.css` (widget-stílusok a fájl végére)

**Interfaces:**
- Consumes: `config.customer_service` (Task 3), Worker API (Task 5).
- Produces: a widget `window.__csCfg = {base, key, lang, ui:{...}}` globálból konfigurálódik (a pageShell írja ki); a chat.js a `#cs-fab` gombot és az opcionális `#cs-form` űrlapot köti be.

- [ ] **Step 1: UI_CHAT tábla a build.js-be**

A CS_FAQ blokk (Task 2) UTÁN:

```js
// Chat-doboz + űrlap UI-szövegei (megszólítás-norma: hu=te, de=du, es=tú, fr=vous)
const UI_CHAT = {
  en: { csOpen: 'Questions? Chat with us', csTitle: 'AI World HQ assistant', csHello: 'Hi! Ask me about the site or any of our AI guides. 😊', csPlaceholder: 'Type your question…', csSend: 'Send', csHuman: 'I need a human', csFormT: 'Message the team', csName: 'Name (optional)', csEmail: 'Your email', csMsg: 'Your message', csSubmit: 'Send message', csOk: 'Thanks! We got your message and will reply by email.', csErr: 'Something went wrong — please try again or email support@aiworldhq.com.', csPrivacy: 'We only use your email to reply; messages are deleted after 30 days.', csThinking: 'Thinking…' },
  hu: { csOpen: 'Kérdésed van? Írj nekünk', csTitle: 'AI World HQ asszisztens', csHello: 'Szia! Kérdezz az oldalról vagy bármelyik AI-útmutatónkról. 😊', csPlaceholder: 'Írd ide a kérdésed…', csSend: 'Küldés', csHuman: 'Emberi segítséget kérek', csFormT: 'Üzenet a csapatnak', csName: 'Név (nem kötelező)', csEmail: 'Email-címed', csMsg: 'Üzeneted', csSubmit: 'Üzenet küldése', csOk: 'Köszönjük! Megkaptuk az üzeneted, emailben válaszolunk.', csErr: 'Valami hiba történt — próbáld újra, vagy írj a support@aiworldhq.com címre.', csPrivacy: 'Az email-címedet csak a válaszhoz használjuk; az üzenetek 30 nap után törlődnek.', csThinking: 'Gondolkodom…' },
  es: { csOpen: '¿Preguntas? Chatea con nosotros', csTitle: 'Asistente de AI World HQ', csHello: '¡Hola! Pregúntame sobre el sitio o cualquiera de nuestras guías de IA. 😊', csPlaceholder: 'Escribe tu pregunta…', csSend: 'Enviar', csHuman: 'Quiero hablar con una persona', csFormT: 'Mensaje al equipo', csName: 'Nombre (opcional)', csEmail: 'Tu correo', csMsg: 'Tu mensaje', csSubmit: 'Enviar mensaje', csOk: '¡Gracias! Recibimos tu mensaje y te responderemos por correo.', csErr: 'Algo salió mal — inténtalo de nuevo o escribe a support@aiworldhq.com.', csPrivacy: 'Solo usamos tu correo para responderte; los mensajes se borran a los 30 días.', csThinking: 'Pensando…' },
  de: { csOpen: 'Fragen? Schreib uns', csTitle: 'AI World HQ Assistent', csHello: 'Hallo! Frag mich zur Seite oder zu unseren KI-Anleitungen. 😊', csPlaceholder: 'Deine Frage…', csSend: 'Senden', csHuman: 'Ich möchte einen Menschen', csFormT: 'Nachricht ans Team', csName: 'Name (optional)', csEmail: 'Deine E-Mail', csMsg: 'Deine Nachricht', csSubmit: 'Nachricht senden', csOk: 'Danke! Wir haben deine Nachricht und antworten per E-Mail.', csErr: 'Etwas ist schiefgelaufen — versuch es erneut oder schreib an support@aiworldhq.com.', csPrivacy: 'Deine E-Mail nutzen wir nur für die Antwort; Nachrichten werden nach 30 Tagen gelöscht.', csThinking: 'Denke nach…' },
  fr: { csOpen: 'Des questions ? Écrivez-nous', csTitle: 'Assistant AI World HQ', csHello: 'Bonjour ! Posez-moi vos questions sur le site ou nos guides IA. 😊', csPlaceholder: 'Votre question…', csSend: 'Envoyer', csHuman: 'Je veux parler à un humain', csFormT: 'Message à l’équipe', csName: 'Nom (facultatif)', csEmail: 'Votre e-mail', csMsg: 'Votre message', csSubmit: 'Envoyer le message', csOk: 'Merci ! Nous avons bien reçu votre message et répondrons par e-mail.', csErr: 'Une erreur est survenue — réessayez ou écrivez à support@aiworldhq.com.', csPrivacy: 'Votre e-mail sert uniquement à vous répondre ; les messages sont supprimés après 30 jours.', csThinking: 'Je réfléchis…' }
};
for (const l of SITE_LANGS) Object.assign(UI[l], UI_CHAT[l] || {});
```

CS-config beolvasás a SUPPORT-minta mellé (build.js ~45. sor környéke, ahol a `company`-ból olvasunk — a CONFIG objektum ott már létezik):
```js
const CS = (() => {
  const c = CONFIG.customer_service || {};
  return { enabled: c.enabled === true && !!c.turnstile_site_key, base: (c.worker_base || '').replace(/\/$/, ''), key: c.turnstile_site_key || '' };
})();
```
FIGYELEM: a config-objektum változóneve a build.js-ben lehet más (grep: `support_enabled` — ugyanabból az objektumból jön); használd az ottanit.

- [ ] **Step 2: Widget a pageShell-be**

A pageShell-ben a `<script src="/assets/vendor/aos.js...` sor ELÉ:

```js
  ${CS.enabled ? `<button id="cs-fab" class="cs-fab" aria-label="${escapeHtml(tr('csOpen'))}">💬<span class="cs-fab__t">${escapeHtml(tr('csOpen'))}</span></button>
  <script>window.__csCfg={base:'${CS.base}',key:'${CS.key}',lang:'${lang}',ui:${JSON.stringify({ title: tr('csTitle'), hello: tr('csHello'), ph: tr('csPlaceholder'), send: tr('csSend'), human: tr('csHuman'), formT: tr('csFormT'), name: tr('csName'), email: tr('csEmail'), msg: tr('csMsg'), submit: tr('csSubmit'), ok: tr('csOk'), err: tr('csErr'), privacy: tr('csPrivacy'), thinking: tr('csThinking') })}};</script>
  <script defer src="/assets/chat.js?v=${ASSET_V}"></script>` : ''}
```
FIGYELEM: a pageShell-ben a nyelv változó elérhetőségét ellenőrizd (a fájlban globális `let lang`/`LANG` vagy a `LP`-ből származik — grep: `const LP` és nézd meg, mi adja a nyelvkódot; azt használd a `lang:'${...}'` helyén).

- [ ] **Step 3: Az about-oldal űrlapja**

A `buildAboutPage()` body-jának végére (a záró `</article>` vagy utolsó szekció elé), CSAK ha CS.enabled:

```js
  const csFormHtml = !CS.enabled ? '' : `
  <section class="cs-formbox" id="contact">
    <h2>${escapeHtml(tr('csFormT'))}</h2>
    <form id="cs-form" autocomplete="off">
      <input type="text" name="name" placeholder="${escapeHtml(tr('csName'))}" maxlength="80">
      <input type="email" name="email" placeholder="${escapeHtml(tr('csEmail'))}" required maxlength="120">
      <textarea name="message" placeholder="${escapeHtml(tr('csMsg'))}" required maxlength="2000" rows="4"></textarea>
      <input type="text" name="web" class="cs-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="cs-ts" id="cs-form-ts"></div>
      <button type="submit">${escapeHtml(tr('csSubmit'))}</button>
      <p class="cs-note">${escapeHtml(tr('csPrivacy'))}</p>
      <p class="cs-status" aria-live="polite"></p>
    </form>
  </section>`;
```
…és fűzd a meglévő body-sablonba. (A `web` mező a honeypot — CSS-ben rejtve, mint a hírlevélnél.)

- [ ] **Step 4: chat.js**

`website/assets/chat.js` (teljes fájl):
```js
/* AI World HQ — ügyfélszolgálati chat-doboz + űrlap (2026-07-20).
   Vanilla JS, lusta init: a panel + a Turnstile CSAK az első kattintásra épül.
   Külső szkript KIZÁRÓLAG a Cloudflare Turnstile (challenges.cloudflare.com). */
(function () {
  'use strict';
  var cfg = window.__csCfg; if (!cfg) return;
  var fab = document.getElementById('cs-fab');
  var panel = null, log = null, sessionId = sessionStorage.getItem('csSess') || '', tsToken = '', tsReady = false;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

  function loadTurnstile(cb) {
    if (window.turnstile) return cb();
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.onload = cb;
    document.head.appendChild(s);
  }
  function renderTs(container, cb) {
    loadTurnstile(function () {
      window.turnstile.render(container, {
        sitekey: cfg.key, appearance: 'interaction-only',
        callback: function (t) { tsToken = t; tsReady = true; cb && cb(); }
      });
    });
  }

  function addMsg(cls, text) {
    var m = el('div', 'cs-msg ' + cls); m.textContent = text;
    log.appendChild(m); log.scrollTop = log.scrollHeight; return m;
  }
  function addLinks(links) {
    if (!links || !links.length) return;
    var box = el('div', 'cs-links');
    links.forEach(function (l) {
      var a = el('a', 'cs-link', '📖 ' + l.t); a.href = l.u; box.appendChild(a);
    });
    log.appendChild(box); log.scrollTop = log.scrollHeight;
  }

  function showForm() {
    var f = panel.querySelector('.cs-panel__form'); if (f) { f.hidden = false; return; }
    f = el('div', 'cs-panel__form');
    f.innerHTML = '<input type="email" placeholder="' + cfg.ui.email + '" maxlength="120">' +
      '<textarea placeholder="' + cfg.ui.msg + '" maxlength="2000" rows="3"></textarea>' +
      '<button type="button">' + cfg.ui.submit + '</button><p class="cs-status" aria-live="polite"></p>';
    panel.appendChild(f);
    f.querySelector('button').addEventListener('click', function () {
      var email = f.querySelector('input').value.trim(), msg = f.querySelector('textarea').value.trim();
      var st = f.querySelector('.cs-status');
      if (!email || !msg) return;
      fetch(cfg.base + '/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, message: msg, lang: cfg.lang, web: '', token: tsToken })
      }).then(function (r) { st.textContent = r.ok ? cfg.ui.ok : cfg.ui.err; if (r.ok) { f.querySelector('textarea').value = ''; } })
        .catch(function () { st.textContent = cfg.ui.err; });
    });
  }

  function send(input) {
    var text = input.value.trim(); if (!text) return;
    input.value = '';
    addMsg('cs-msg--me', text);
    var wait = addMsg('cs-msg--bot cs-msg--wait', cfg.ui.thinking);
    fetch(cfg.base + '/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, lang: cfg.lang, sessionId: sessionId, token: tsToken })
    }).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (o) {
        wait.remove();
        if (o.j.sessionId) { sessionId = o.j.sessionId; sessionStorage.setItem('csSess', sessionId); }
        addMsg('cs-msg--bot', o.j.answer || cfg.ui.err);
        addLinks(o.j.links);
        if (o.j.escalate) showForm();
      })
      .catch(function () { wait.remove(); addMsg('cs-msg--bot', cfg.ui.err); });
  }

  function openPanel() {
    if (panel) { panel.hidden = !panel.hidden; return; }
    panel = el('div', 'cs-panel');
    var head = el('div', 'cs-panel__head', cfg.ui.title);
    var x = el('button', 'cs-panel__x', '×'); x.setAttribute('aria-label', 'close');
    x.addEventListener('click', function () { panel.hidden = true; });
    head.appendChild(x);
    log = el('div', 'cs-panel__log');
    var row = el('div', 'cs-panel__row');
    var input = el('input', 'cs-panel__in'); input.placeholder = cfg.ui.ph; input.maxLength = 500;
    var btn = el('button', 'cs-panel__send', cfg.ui.send);
    var human = el('button', 'cs-panel__human', cfg.ui.human);
    var tsBox = el('div', 'cs-ts');
    row.appendChild(input); row.appendChild(btn);
    panel.appendChild(head); panel.appendChild(log); panel.appendChild(row); panel.appendChild(human); panel.appendChild(tsBox);
    document.body.appendChild(panel);
    addMsg('cs-msg--bot', cfg.ui.hello);
    renderTs(tsBox);
    btn.addEventListener('click', function () { send(input); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(input); });
    human.addEventListener('click', showForm);
  }
  fab && fab.addEventListener('click', openPanel);

  // Az about-oldal beépített űrlapja (ha van az oldalon)
  var pf = document.getElementById('cs-form');
  if (pf) {
    renderTs(document.getElementById('cs-form-ts'));
    pf.addEventListener('submit', function (e) {
      e.preventDefault();
      var st = pf.querySelector('.cs-status');
      fetch(cfg.base + '/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pf.name.value.trim(), email: pf.email.value.trim(),
          message: pf.message.value.trim(), lang: cfg.lang, web: pf.web.value, token: tsToken
        })
      }).then(function (r) { st.textContent = r.ok ? cfg.ui.ok : cfg.ui.err; if (r.ok) pf.reset(); })
        .catch(function () { st.textContent = cfg.ui.err; });
    });
  }
})();
```

- [ ] **Step 5: CSS a style.css végére**

```css
/* ===== Ügyfélszolgálati chat-doboz + űrlap (2026-07-20) ===== */
.cs-fab{position:fixed;right:18px;bottom:18px;z-index:60;display:flex;align-items:center;gap:8px;padding:12px 16px;border:none;border-radius:999px;background:var(--accent,#4f7a86);color:#fff;font-size:1rem;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.25)}
.cs-fab__t{font-size:.9rem}
@media (max-width:640px){.cs-fab__t{display:none}}
.cs-panel{position:fixed;right:18px;bottom:76px;z-index:61;width:min(360px,calc(100vw - 24px));max-height:min(540px,75vh);display:flex;flex-direction:column;background:var(--card-bg,#fff);color:inherit;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.3);overflow:hidden}
.cs-panel__head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--accent,#4f7a86);color:#fff;font-weight:600}
.cs-panel__x{background:none;border:none;color:#fff;font-size:1.3rem;cursor:pointer;line-height:1}
.cs-panel__log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;min-height:160px}
.cs-msg{max-width:85%;padding:8px 12px;border-radius:12px;font-size:.92rem;line-height:1.4;white-space:pre-wrap}
.cs-msg--me{align-self:flex-end;background:var(--accent,#4f7a86);color:#fff}
.cs-msg--bot{align-self:flex-start;background:rgba(127,127,127,.14)}
.cs-msg--wait{opacity:.6;font-style:italic}
.cs-links{display:flex;flex-direction:column;gap:4px}
.cs-link{font-size:.88rem;text-decoration:underline}
.cs-panel__row{display:flex;gap:6px;padding:10px}
.cs-panel__in{flex:1;padding:9px 12px;border:1px solid rgba(127,127,127,.35);border-radius:8px;font:inherit;background:transparent;color:inherit}
.cs-panel__send{padding:9px 14px;border:none;border-radius:8px;background:var(--accent,#4f7a86);color:#fff;cursor:pointer}
.cs-panel__human{margin:0 10px 10px;padding:7px;border:1px dashed rgba(127,127,127,.4);border-radius:8px;background:none;color:inherit;font-size:.85rem;cursor:pointer}
.cs-panel__form,.cs-formbox form{display:flex;flex-direction:column;gap:8px;padding:10px}
.cs-panel__form input,.cs-panel__form textarea,.cs-formbox input,.cs-formbox textarea{padding:9px 12px;border:1px solid rgba(127,127,127,.35);border-radius:8px;font:inherit;background:transparent;color:inherit}
.cs-panel__form button,.cs-formbox button[type=submit]{padding:10px;border:none;border-radius:8px;background:var(--accent,#4f7a86);color:#fff;cursor:pointer}
.cs-formbox{margin-top:32px}
.cs-hp{position:absolute;left:-9999px;opacity:0;height:0;width:0}
.cs-note{font-size:.8rem;opacity:.7}
.cs-status{font-size:.9rem;min-height:1.2em}
```
FIGYELEM: a `--accent`/`--card-bg` változónevek a design szerintiek legyenek — nézd meg a style.css elejét (`:root{`) és a meglévő gomb-osztályokat; a site meglévő accent-változóját használd a `var(...)`-okban.

- [ ] **Step 6: Build + helyi füst (teszt-kulcsokkal)**

```bash
cd "/c/AI work/ai-world-co" && node -e "
const fs=require('fs'); const c=JSON.parse(fs.readFileSync('config.json','utf-8'));
c.customer_service.enabled=true; fs.writeFileSync('config.json', JSON.stringify(c,null,2));" && node website/build.js && grep -c "cs-fab" website/public/index.html website/public/hu/index.html && node tmp-preview-server.cjs &
```
Elvárt: mindkét index 1-1 `cs-fab` találat; a http://localhost:8123 oldalon a 💬 gomb megjelenik, kattintásra panel nyílik (a /chat hívás a Workerig még nem él éles kulcs nélkül — a UI-viselkedés a füst tárgya). Füst után a preview-szervert állítsd le, és a `customer_service.enabled`-et állítsd VISSZA false-ra (élesítés a Task 9-ben):
```bash
node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('config.json','utf-8')); c.customer_service.enabled=false; fs.writeFileSync('config.json', JSON.stringify(c,null,2));"
```

- [ ] **Step 7: Commit**

```bash
cd "/c/AI work/ai-world-co" && git add website/build.js website/assets/chat.js website/assets/style.css config.json && git commit -m "feat(ügyfélszolgálat 7/9): chat-doboz + kapcsolat-űrlap a honlapon, 5 nyelven

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Napi riport — 💬 sor

**Files:**
- Modify: `core/daily-report.js` (a Make-őrszem blokk után, ~210. sor)

**Interfaces:**
- Consumes: Worker `/feedback-export` `__cs = {chat, mail, esc}` (Task 5), `process.env.FEEDBACK_EXPORT_KEY` (GitHub Secretként már létezik — a search-report használja).

- [ ] **Step 1: Blokk beszúrása**

A Make-őrszem `try/catch` blokkja UTÁN:

```js
  // ÜGYFÉLSZOLGÁLAT (2026-07-20): napi darabszámok a Workerből (💬 sor).
  // Csak akkor szól, ha volt forgalom — csendes, ha 0.
  try {
    if (process.env.FEEDBACK_EXPORT_KEY) {
      const cr = await fetch('https://aiworld-telegram.pacsi84.workers.dev/feedback-export',
        { headers: { 'X-Export-Key': process.env.FEEDBACK_EXPORT_KEY }, signal: AbortSignal.timeout(15000) });
      if (cr.ok) {
        const cs = (await cr.json()).__cs || {};
        const total = (cs.chat || 0) + (cs.mail || 0);
        if (total > 0) lines.push(`💬 Ügyfélszolgálat ma: ${cs.chat || 0} chat-válasz · ${cs.mail || 0} email · ${cs.esc || 0} emberi kézbe adva`);
      }
    }
  } catch { /* a riport ettől még kimegy */ }
```
FIGYELEM: ha a fájlban a feedback-export URL-t már máshol is hívnánk, emeld konstansba; ha a riport több helyen fetch-eli ugyanazt, egy hívásból olvasd ki mindkét adatot.

- [ ] **Step 2: Helyi próba (kulcs nélkül csendes)**

```bash
cd "/c/AI work/ai-world-co" && node -e "delete process.env.FEEDBACK_EXPORT_KEY" && node core/daily-report.js --dry-run 2>/dev/null || node core/daily-report.js --help 2>/dev/null || echo "OK: a riport-szkript kapcsolóit nézd meg (grep dry) — cél: hibamentes futás kulcs nélkül"
```
Elvárt: a szkript kulcs nélkül nem dob hibát (a blokk csendben kimarad). Ha nincs dry-run kapcsoló, elég egy `node --check core/daily-report.js` szintaxis-ellenőrzés.

- [ ] **Step 3: Commit**

```bash
cd "/c/AI work/ai-world-co" && git add core/daily-report.js && git commit -m "feat(ügyfélszolgálat 8/9): 💬 sor a napi riportban (chat/email/eszkaláció darabszám)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Élesítés — deploy, kézi lépések a userrel, éles füst, zárás

**Files:**
- Modify: `config.json` (enabled:true + valódi Turnstile site key)
- Worker + site deploy; MEMORY.md + napló frissítés

- [ ] **Step 1: Worker deploy + előzetes füst (teszt-kulcsokkal)**

```bash
cd "/c/AI work/ai-world-co/telegram-worker" && npx wrangler secret put TURNSTILE_SECRET
# Ide először a Cloudflare TESZT-secret megy: 1x0000000000000000000000000000000AA
npx wrangler deploy
```
Füst (a Turnstile teszt-kulcs minden tokent elfogad):
```bash
curl -s -X POST https://aiworld-telegram.pacsi84.workers.dev/chat -H "Content-Type: application/json" -H "Origin: https://aiworldhq.com" -d '{"message":"How do I subscribe to the newsletter?","lang":"en","token":"smoke"}'
```
Elvárt: 200, JSON `answer` értelmes szöveggel + `sessionId`. Majd magyar füst (`"lang":"hu"`, kérdés: `"Hogyan jelezhetek hibát egy cikkben?"`) → magyar, tegeződő válasz. Ellenőrizd a 429-et is: 11 gyors hívás ugyanarról az IP-ről → az utolsó `limit:true`.

- [ ] **Step 2: KÉZI LÉPÉSEK a userrel (AskUserQuestion-nel végigvezetve, egyenként)**

1. **Turnstile**: Cloudflare dash → Turnstile → Add widget → domain: aiworldhq.com, mód: Managed. A **site key**-t a user beírja a chatbe → én a config.json-ba teszem; a **secret**-et a user átadja → `npx wrangler secret put TURNSTILE_SECRET` (ÚJRA, a valódival — a repóba SOHA).
2. **Email Routing**: Cloudflare dash → aiworldhq.com zóna → Email → Email Routing → Enable (MX-rekordokat a CF maga veszi fel; ütközés nincs, MX ma üres) → Routing rules: `support@aiworldhq.com` → Send to Worker: `aiworld-telegram`. (A catch-all maradjon ki.)

- [ ] **Step 3: Élesítés + site deploy (DEPLOY-RECEPT!)**

```bash
cd "/c/AI work/ai-world-co" && node -e "
const fs=require('fs'); const c=JSON.parse(fs.readFileSync('config.json','utf-8'));
c.customer_service.enabled=true; c.customer_service.turnstile_site_key='<A-VALÓDI-SITE-KEY>';
fs.writeFileSync('config.json', JSON.stringify(c,null,2));" && node website/build.js && node core/share-images.js && npx wrangler pages deploy website/public --project-name=aiworldco --commit-dirty=true
```
FIGYELEM: a share-images szkript pontos neve/útvonala a naplóban — ellenőrizd (`ls core | grep -i share`), és a configban az indentálás maradjon a meglévő stílusú.

- [ ] **Step 4: Éles füst**

1. Böngésző: aiworldhq.com → 💬 gomb → kérdés angolul és magyarul → válasz + guide-link kattintható.
2. Hatókör-teszt: „write my homework essay” → eszkaláció (űrlap jelenik meg).
3. Űrlap: teszt-üzenet → Telegramon megjön a 📝 értesítés.
4. Email: levél a support@aiworldhq.com-ra → auto-válasz megérkezik + 📧 Telegram-másolat; a válaszra VÁLASZOLVA (Auto-Submitted nélkül, de 2. körben) még válaszol, 3.-ra már nem (napi 2 sapka).
5. `curl -s "https://aiworldhq.com/kb.json" | head -c 200` → valid JSON.

- [ ] **Step 5: Zárás**

```bash
cd "/c/AI work/ai-world-co" && git add config.json && git commit -m "feat(ügyfélszolgálat 9/9): élesítés — valódi Turnstile-kulcs, enabled:true

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" && git push
```
Majd: napló-bejegyzés (`project_aiworld_naplo.md`) + MEMORY.md frissítés (recept: Turnstile/Email Routing beállítás, kulcs-szabályok, limitek), a napi riportban másnap ellenőrizni a 💬 sort.

---

## Ellenőrző lista a terv végére

- Minden route-változás után a MEGLÉVŐ végpontok füstje: `curl -s https://aiworld-telegram.pacsi84.workers.dev/` → „AI World Telegram worker — OK”; egy 👍 leadása a weben → /feedback 200.
- A worker-tesztek (Task 1/4/5/6) egyetlen paranccsal: `for t in telegram-worker/test/*.test.js; do node "$t" || exit 1; done`
- Költség-őr: a Workers AI hívás SEMMILYEN esetben nem történhet limit-ellenőrzés előtt (chat: 3 kapu előbb; email: globalLimitReached előbb).
