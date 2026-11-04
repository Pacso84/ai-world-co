# Cég-hierarchia: visszaadási lánc + közös tanulás + Főnök-döntnök — implementációs terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cégszintű munka-visszaadás (Fordító→Író), közös tanulság-memória minden ügynöknek, és Főnök-döntnök, aki minden futásban azonnal dönt a beragadt munkákról — "mentsd, ne dobd" elvvel, teljes automatizálással.

**Architecture:** A meglévő infrastruktúrára építünk (NEM párhuzamos rendszer): a tanulság-könyv = core/memory-manager.js (`remember`/`list`, 'shared' scope a cégszintű leckéknek); a Főnök-asztal az escalate-guides.js mintájára készül HÍREKRE + általános beragadásokra (agents/ceo/desk.js); a postás és az asztal a CEO-orchestrator (agents/ceo/agent.js) main() elejére kerül, így a kézbesített munkát az Író MÉG UGYANABBAN a futásban felveszi.

**Tech Stack:** Node v24 ESM, sima node teszt-szkriptek (nincs teszt-framework — a core/ai-router.test.js mintája), GitHub Actions pipeline.

## Global Constraints

- Kulcsok SOHA a repóba; nincs új secret.
- Új AI-hívás CSAK a Főnök tartalmi ítéleteinél (ingyenes-először, agentName: 'ceo').
- Sérült JSON-state sosem állítja meg a pipeline-t (try/catch, üresként újraindul).
- Minden komment/log magyarul, a meglévő stílusban; a fájl-formátum JSON.stringify(x, null, 2).
- A meglévő Író↔Ellenőrző kör VISELKEDÉSE nem változik (MAX_REWORK_ATTEMPTS=2 marad).
- Elvetés csak: duplikátum / okafogyott / 2 főnöki kör után is menthetetlen ("mentsd, ne dobd").
- A tulajdonost soha nem kérdezzük döntésért — Telegram csak informál.
- Futtatás mindig a projekt gyökeréből: `cd "/c/AI work/ai-world-co"`.

---

### Task 1: core/handback.js — visszaadó-iroda + hierarchia a configban

**Files:**
- Create: `core/handback.js`
- Create: `core/handback.test.js`
- Modify: `config.json` (company blokk után új kulcs)

**Interfaces:**
- Produces: `fileHandback({from,to,ref,reason,hint}) → {ok,id|error}`, `openFor(to) → item[]`, `roundsFor(ref) → number`, `markDelivered(id)`, `escalateStale() → item[]` (előző futásból nyitva maradtak), `listEscalated() → item[]`, `closeCase(ref)` (több visszaadás nem nyitható rá), `sourceDefect(md) → string|null` (hibás forrás-cikk felismerés a Fordítónak).
- State: `memory/handbacks.json` = `{ items: [{id, from, to, ref, reason, hint, status: 'open'|'delivered'|'escalated'|'closed', created_at, updated_at}] }`.

- [ ] **Step 1: config.json — company.hierarchy kulcs** (a `company` objektumon belül, a meglévő kulcsok után):

```json
"hierarchy": {
  "_comment": "Cégrend (2026-07-13): ki kinek jelent + ki kinek adhat vissza munkát. A postás CSAK e mentén kézbesít.",
  "ceo":        { "reports_to": null,        "may_handback_to": ["iro", "guide", "translator", "designer", "social"] },
  "ellenorzo":  { "reports_to": "ceo",       "may_handback_to": ["iro", "guide"] },
  "iro":        { "reports_to": "ellenorzo", "may_handback_to": [] },
  "guide":      { "reports_to": "ellenorzo", "may_handback_to": [] },
  "translator": { "reports_to": "ellenorzo", "may_handback_to": ["iro"] },
  "designer":   { "reports_to": "ceo",       "may_handback_to": [] },
  "social":     { "reports_to": "ceo",       "may_handback_to": [] },
  "digest":     { "reports_to": "ceo",       "may_handback_to": [] },
  "compare":    { "reports_to": "ceo",       "may_handback_to": [] },
  "pairing":    { "reports_to": "ceo",       "may_handback_to": [] },
  "video":      { "reports_to": "ceo",       "may_handback_to": [] }
}
```

- [ ] **Step 2: Bukó teszt megírása** — `core/handback.test.js` (sima node assert; a state-fájlt tesztvégén visszaállítja):

```js
// Visszaadó-iroda tesztek — futtatás: node core/handback.test.js
import { strict as assert } from 'assert';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fileHandback, openFor, roundsFor, markDelivered, escalateStale, listEscalated, closeCase, sourceDefect } from './handback.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE = join(__dirname, '..', 'memory', 'handbacks.json');
const backup = existsSync(STATE) ? readFileSync(STATE, 'utf-8') : null;

try {
  // tiszta lappal indulunk
  writeFileSync(STATE, JSON.stringify({ items: [] }, null, 2), 'utf-8');

  // 1) engedélyezett él: translator→iro
  const r1 = fileHandback({ from: 'translator', to: 'iro', ref: 'ARTICLE_zz-teszt.json', reason: 'nincs H1' });
  assert.equal(r1.ok, true);
  assert.equal(openFor('iro').length, 1);

  // 2) tiltott él: social→translator → hangos hiba, nem jön létre
  const r2 = fileHandback({ from: 'social', to: 'translator', ref: 'x.json', reason: 'x' });
  assert.equal(r2.ok, false);
  assert.equal(openFor('translator').length, 0);

  // 3) dupla nyitás ugyanarra: nem új tétel, kör-számláló nő
  fileHandback({ from: 'translator', to: 'iro', ref: 'ARTICLE_zz-teszt.json', reason: 'még mindig nincs H1' });
  assert.equal(openFor('iro').length, 1);
  assert.equal(roundsFor('ARTICLE_zz-teszt.json'), 2);

  // 4) kézbesítés → delivered; a kör-számláló NEM nullázódik (teljes életútra számol)
  markDelivered(openFor('iro')[0].id);
  assert.equal(openFor('iro').length, 0);
  assert.equal(roundsFor('ARTICLE_zz-teszt.json'), 2);

  // 5) 3. kör → escalated (max 2 kör)
  const r3 = fileHandback({ from: 'translator', to: 'iro', ref: 'ARTICLE_zz-teszt.json', reason: 'harmadszor is' });
  assert.equal(r3.ok, true);
  assert.equal(listEscalated().length, 1);

  // 6) lezárt ügyre nem nyitható új
  closeCase('ARTICLE_zz-teszt.json');
  const r4 = fileHandback({ from: 'translator', to: 'iro', ref: 'ARTICLE_zz-teszt.json', reason: 'megint' });
  assert.equal(r4.ok, false);

  // 7) escalateStale: nyitott tétel előző futásból → escalated
  writeFileSync(STATE, JSON.stringify({ items: [{ id: 'h1', from: 'translator', to: 'iro', ref: 'ARTICLE_regi.json', reason: 'r', status: 'open', created_at: new Date(Date.now() - 9 * 3600e3).toISOString(), updated_at: new Date(Date.now() - 9 * 3600e3).toISOString() }] }, null, 2), 'utf-8');
  const esc = escalateStale();
  assert.equal(esc.length, 1);
  assert.equal(listEscalated().length, 1);

  // 8) sourceDefect: hibás forrás felismerése
  assert.ok(sourceDefect('nincs cím, csak szöveg'));                    // nincs H1
  assert.equal(sourceDefect('---\ntitle: "x"\n---\n\n# Cím\n' + 'törzs '.repeat(120)), null); // egészséges
  console.log('✅ handback.test: minden átment');
} finally {
  if (backup === null) { if (existsSync(STATE)) unlinkSync(STATE); }
  else writeFileSync(STATE, backup, 'utf-8');
}
```

- [ ] **Step 3: Futtatás — bukjon**: `node core/handback.test.js` → Expected: `ERR_MODULE_NOT_FOUND` (handback.js még nincs).

- [ ] **Step 4: core/handback.js megírása**:

```js
// ===================================================================
// VISSZAADÓ-IRODA (2026-07-13) — spec: docs/superpowers/specs/
// 2026-07-13-ceg-hierarchia-visszaadas-tanulas-design.md
// Munka-visszaadás ügynökök közt a config.company.hierarchy élei mentén.
// A postás (agents/ceo/agent.js) kézbesíti; a beragadtakat a Főnök-asztal
// (agents/ceo/desk.js) dönti el. Sérült state → üresként indul újra.
// ===================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE_PATH = join(ROOT, 'memory', 'handbacks.json');
const MAX_ROUNDS = 2;                 // ennyi kör után a Főnök asztalára kerül
const STALE_MS = 7 * 3600e3;          // ~1 futásnyi türelem (8h cron, kis ráhagyással)

function loadState() {
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf-8')); } catch { return { items: [] }; }
}
function saveState(s) {
  const dir = join(ROOT, 'memory');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2), 'utf-8');
}
function hierarchy() {
  try { return JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8')).company?.hierarchy || {}; } catch { return {}; }
}

// Visszaadás nyitása. Ugyanarra a (to, ref) párra nyitott tétel → kör-jelzés
// (reason frissül), NEM új tétel. Kör-limit felett → escalated.
export function fileHandback({ from, to, ref, reason, hint = '' }) {
  const h = hierarchy();
  const allowed = h[from]?.may_handback_to || [];
  if (!allowed.includes(to)) {
    console.log(`🚫 postás: ${from} → ${to} visszaadás NEM engedélyezett él (config.company.hierarchy) — eldobva: ${ref}`);
    return { ok: false, error: 'edge-not-allowed' };
  }
  const s = loadState();
  if (s.items.some(it => it.ref === ref && it.status === 'closed')) {
    console.log(`🔒 postás: "${ref}" ügye már lezárt (Főnök döntött) — új visszaadás nem nyitható.`);
    return { ok: false, error: 'case-closed' };
  }
  const now = new Date().toISOString();
  const open = s.items.find(it => it.ref === ref && it.to === to && it.status === 'open');
  if (open) {
    open.reason = reason; open.hint = hint || open.hint; open.updated_at = now;
  } else {
    s.items.push({ id: 'hb' + Date.now() + Math.floor(Math.random() * 1000), from, to, ref, reason, hint, status: 'open', created_at: now, updated_at: now });
  }
  // Kör-limit a ref TELJES életútjára (delivered tételek is számítanak)
  const rounds = s.items.filter(it => it.ref === ref && it.status !== 'closed').length;
  const item = s.items.find(it => it.ref === ref && (it.status === 'open' || it.status === 'escalated'));
  if (rounds > MAX_ROUNDS && item) { item.status = 'escalated'; item.updated_at = now; }
  saveState(s);
  return { ok: true, id: (open || s.items[s.items.length - 1]).id };
}

export function openFor(to) { return loadState().items.filter(it => it.to === to && it.status === 'open'); }
export function roundsFor(ref) { return loadState().items.filter(it => it.ref === ref && it.status !== 'closed').length; }

export function markDelivered(id) {
  const s = loadState();
  const it = s.items.find(x => x.id === id);
  if (it) { it.status = 'delivered'; it.updated_at = new Date().toISOString(); saveState(s); }
}

// Előző futásból nyitva maradt tételek → a Főnök asztalára (nincs néma rothadás)
export function escalateStale() {
  const s = loadState();
  const stale = s.items.filter(it => it.status === 'open' && Date.now() - new Date(it.created_at).getTime() > STALE_MS);
  for (const it of stale) { it.status = 'escalated'; it.updated_at = new Date().toISOString(); }
  if (stale.length) saveState(s);
  return stale;
}

export function listEscalated() { return loadState().items.filter(it => it.status === 'escalated'); }

export function closeCase(ref) {
  const s = loadState();
  for (const it of s.items.filter(x => x.ref === ref)) { it.status = 'closed'; it.updated_at = new Date().toISOString(); }
  saveState(s);
}

// Napi jelentésnek: mai forgalom
export function handbackStats() {
  const day = new Date().toISOString().slice(0, 10);
  const items = loadState().items;
  return {
    open: items.filter(it => it.status === 'open').length,
    deliveredToday: items.filter(it => it.status === 'delivered' && (it.updated_at || '').startsWith(day)).length,
    escalated: items.filter(it => it.status === 'escalated').length
  };
}

// Hibás forrás-cikk felismerése (a Fordító használja: EZ visszaadás-ok, a
// modell-hiba nem). Vissza: hiba-szöveg vagy null.
export function sourceDefect(md) {
  const t = String(md || '');
  if (!/^#\s+.+$/m.test(t)) return 'hiányzó H1 főcím';
  if (t.replace(/---[\s\S]*?---/, '').trim().length < 400) return 'gyanúsan rövid törzs (<400 karakter)';
  return null;
}
```

- [ ] **Step 5: Teszt fusson át**: `node core/handback.test.js` → Expected: `✅ handback.test: minden átment`

- [ ] **Step 6: Commit**: `git add core/handback.js core/handback.test.js config.json && git commit -m "feat(hierarchia): visszaadó-iroda (core/handback.js) + cégrend a configban — engedélyezett élek, 2 kör limit, 1-futásnyi türelem, lezárt ügy védelem"`

---

### Task 2: Közös tanulság-blokk minden ügynök promptjába (ai-router)

**Files:**
- Modify: `core/memory-manager.js` (új export a fájl végére)
- Modify: `core/ai-router.js:461-465` (ask() eleje)
- Create: `core/lessons-block.test.js`

**Interfaces:**
- Consumes: `list({scope, limit})` a memory-managerből (már létezik).
- Produces: `lessonsBlock(agentName) → string` ('' ha nincs tanulság). Az ask() automatikusan befűzi — MINDEN agent tanul, agent-kód módosítása nélkül.

- [ ] **Step 1: Bukó teszt** — `core/lessons-block.test.js`:

```js
// Tanulság-blokk teszt — futtatás: node core/lessons-block.test.js
import { strict as assert } from 'assert';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { remember, lessonsBlock } from './memory-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE = join(__dirname, '..', 'memory', 'store.json');
const backup = readFileSync(STORE, 'utf-8');
try {
  remember('shared', 'ZZTESZT-közös: a csempe mindig a legrövidebb hivatalos terméknév');
  remember('zzteszt-agent', 'ZZTESZT-saját: a fordításban a title sosem tükörfordítás');
  const block = lessonsBlock('zzteszt-agent');
  assert.ok(block.includes('ZZTESZT-közös'), 'közös (shared) lecke benne van');
  assert.ok(block.includes('ZZTESZT-saját'), 'saját scope lecke benne van');
  assert.ok(block.length < 1600, 'token-sapka tartva');
  // iro/guide: a saját leckéiket maguk töltik (szemantikus) — ott csak a shared megy
  const iroBlock = lessonsBlock('iro');
  assert.ok(!iroBlock.includes('ZZTESZT-saját'), 'iro nem kapja más agent leckéit');
  assert.equal(lessonsBlock(''), '', 'agentName nélkül üres');
  console.log('✅ lessons-block.test: minden átment');
} finally { writeFileSync(STORE, backup, 'utf-8'); }
```

- [ ] **Step 2: Futtatás — bukjon**: `node core/lessons-block.test.js` → Expected: `lessonsBlock` nincs exportálva → SyntaxError/undefined.

- [ ] **Step 3: lessonsBlock a memory-manager végére**:

```js
// ---------- TANULSÁG-BLOKK (2026-07-13, cég-hierarchia) ----------
// Minden AI-hívás promptja elé kerül (core/ai-router.ask): a cég KÖZÖS
// tanulságai ('shared' scope) + az agent SAJÁT leckéi. Kivétel: az iro és a
// guide a saját scope-ját maga tölti szemantikusan (loadLessons) — nekik itt
// csak a shared jár, hogy ne duplázzunk. Determinisztikus és $0 (nincs API).
const SELF_LOADING = new Set(['iro', 'guide']);
export function lessonsBlock(agentName) {
  if (!agentName) return '';
  try {
    const shared = list({ scope: 'shared', limit: 4 });
    const own = SELF_LOADING.has(agentName) ? [] : list({ scope: agentName, limit: 4 });
    if (!shared.length && !own.length) return '';
    const lines = [
      ...shared.map(x => `- [cég] ${x.text}`),
      ...own.map(x => `- [saját] ${x.text}`)
    ].slice(0, 8);
    return `\n\nCOMPANY LESSONS (learned from past mistakes — apply them):\n${lines.join('\n')}`.slice(0, 1500);
  } catch { return ''; }
}
```

- [ ] **Step 4: ask() befűzés** — `core/ai-router.js`, a 462. sor (destrukturálás) után:

```js
  // KÖZPONTI TANULÁS (2026-07-13): a cég közös tanulságai minden hívásba —
  // "tudjanak egymás hibáiból tanulni". Determinisztikus, $0.
  let sysWithLessons = systemPrompt;
  try {
    const { lessonsBlock } = await import('./memory-manager.js');
    const lb = lessonsBlock(agentName);
    if (lb) sysWithLessons = (systemPrompt || 'You are a helpful assistant.') + lb;
  } catch { /* tanulság nélkül is megy */ }
```

és az 523. sor caller-hívásában `systemPrompt` → `systemPrompt: sysWithLessons`.

- [ ] **Step 5: Teszt fusson át**: `node core/lessons-block.test.js` → Expected: `✅`. Plusz gyors füst-teszt, hogy a router betölt: `node -e "import('./core/ai-router.js').then(()=>console.log('router OK'))"` (a projekt gyökeréből).

- [ ] **Step 6: Commit**: `git add core/memory-manager.js core/ai-router.js core/lessons-block.test.js && git commit -m "feat(tanulás): közös tanulság-blokk minden agent promptjába a routeren át — shared scope mindenkinek, saját scope a nem-önbetöltőknek"`

---

### Task 3: Fordító — bukás-számláló, visszaadás hibás forrásnál, tanulság

**Files:**
- Modify: `agents/translator/agent.js` (importok + a fő ciklus else-ága, ~157-163. sor)
- State: `memory/translation-failures.json` = `{ "<file>|<lang>": count }`

**Interfaces:**
- Consumes: `fileHandback`, `sourceDefect` (Task 1), `remember` (memory-manager).
- Produces: 2 bukás után hibás forrásnál handback to:'iro'; a számláló sikernél törlődik.

- [ ] **Step 1: Importok** a meglévő importok után:

```js
import { fileHandback, sourceDefect } from '../../core/handback.js';
import { remember } from '../../core/memory-manager.js';
```

- [ ] **Step 2: Számláló-segédek** a loadCache közelébe:

```js
// Bukás-számláló (2026-07-13): ne próbálkozzunk némán a végtelenségig —
// 2 bukás UGYANARRA a (cikk, nyelv) párra ÉS hibás forrás → visszaadás az Írónak.
const FAILS_PATH = join(PROJECT_ROOT, 'memory', 'translation-failures.json');
function loadFails() { try { return JSON.parse(readFileSync(FAILS_PATH, 'utf-8')); } catch { return {}; } }
function saveFails(f) { writeFileSync(FAILS_PATH, JSON.stringify(f, null, 2), 'utf-8'); }
```

- [ ] **Step 3: A fő ciklus módosítása** — a sikeres ágba (cache mentés után) és a bukó ágba:

```js
      if (res && looksValid(res.text)) {
        cache[code] = res.text.trim();
        saveCache(file, cache);
        cost += res.cost; done++;
        const fails = loadFails();
        if (fails[`${file}|${code}`]) { delete fails[`${file}|${code}`]; saveFails(fails); }
        console.log(`✅ ($${res.cost.toFixed(4)})`);
      } else {
        failed++;
        const fails = loadFails();
        const key = `${file}|${code}`;
        fails[key] = (fails[key] || 0) + 1;
        saveFails(fails);
        const defect = sourceDefect(md);
        if (fails[key] >= 2 && defect) {
          // Hibás FORRÁS: nem a modell hibája — visszaadás az Írónak, hogy ne
          // égessünk pénzt a reménytelen újrapróbákra. (Modell-hiba: marad retry.)
          const r = fileHandback({ from: 'translator', to: 'iro', ref: file, reason: `fordítás 2x bukott (${code}) — forrás-hiba: ${defect}`, hint: 'Javítsd a cikk szerkezetét (H1 + teljes törzs), a tartalmi mondanivalót őrizd meg.' });
          if (r.ok) {
            remember('translator', `Ha a forrás-cikk hibás (${defect}), NEM újrapróbálni kell, hanem visszaadni az Írónak.`);
            delete fails[key]; saveFails(fails);
            console.log(`↩️  visszaadva az Írónak (${defect})`);
          } else { console.log('❌ (sikertelen / érvénytelen)'); }
        } else {
          console.log('❌ (sikertelen / érvénytelen)');
        }
      }
```

- [ ] **Step 4: Füst-teszt** (nem hív API-t): `node -e "import('./core/handback.js').then(m=>console.log(m.sourceDefect('se cím se semmi')))"` → Expected: `hiányzó H1 főcím`. Továbbá `node agents/translator/agent.js --limit 0` lefut hibátlanul (0 fordítással).

- [ ] **Step 5: Commit**: `git add agents/translator/agent.js && git commit -m "feat(fordító): bukás-számláló + hibás forrásnál visszaadás az Írónak (2 bukás után) + tanulság — nincs több néma pénzégetés"`

---

### Task 4: Postás + Főnök-asztal (agents/ceo/desk.js) + bekötés az orchestratorba

**Files:**
- Create: `agents/ceo/desk.js`
- Modify: `agents/ceo/agent.js` (main() eleje, a 4. PIPELINE szakasz előtt, ~383. sor)
- Modify: `agents/iro/agent.js` `collectFeedback` (~384. sor): ceo_hint felvétele
- State: `memory/ceo-desk-log.json` = `{ "<YYYY-MM-DD>": ["döntés-szöveg", ...] }`

**Interfaces:**
- Consumes: `openFor('iro')`, `markDelivered`, `escalateStale`, `listEscalated`, `closeCase`, `roundsFor` (Task 1); `remember` (memory-manager); `ask` (ai-router, agentName 'ceo'); `message` (ops).
- Produces: `node agents/ceo/desk.js` önállóan futtatható; `--test-verdict '<json>'` flaggel AI-hívás nélkül tesztelhető. A kézbesítés: ARTICLE_/WRITER_ áthelyezés `content/rejected/REJECTED_*`-ba (az Író meglévő rework-köre veszi fel).

- [ ] **Step 1: desk.js megírása**:

```js
// ===================================================================
// FŐNÖK-ASZTAL (2026-07-13) — "beragadt ügyek": MINDEN futásban AZONNAL
// döntés születik, nem határidő. Elv: MENTSD, NE DOBD (olvasó-védelem).
// Spec: docs/superpowers/specs/2026-07-13-ceg-hierarchia-visszaadas-tanulas-design.md
// Bemenet: eszkalált visszaadások + kimerült/lejárt bukott hírek + 2x bukott
// heti feladatok. Kimenet (sorrendben): kiadás kis javítással → újraírás más
// szögből (régi hírnél "mit jelent ez neked" magyarázó) → elvetés (CSAK
// duplikátum/okafogyott/2 főnöki kör után). Minden döntés tanulság + napló.
// Futtatás: node agents/ceo/desk.js [--test-verdict '<json>']
// ===================================================================
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, renameSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';
import { remember } from '../../core/memory-manager.js';
import { message } from '../../core/ops.js';
import { escalateStale, listEscalated, closeCase } from '../../core/handback.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const REJECTED_DIR = join(ROOT, 'content', 'rejected');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const DESK_LOG = join(ROOT, 'memory', 'ceo-desk-log.json');
const MAX_REWORK_ATTEMPTS = 2;      // az Íróéval azonos (agents/iro/agent.js)
const MAX_CEO_ROUNDS = 2;           // ennyi főnöki újraindítás után: végleges döntés

const testVerdictArg = process.argv.indexOf('--test-verdict');
const TEST_VERDICT = testVerdictArg >= 0 ? JSON.parse(process.argv[testVerdictArg + 1]) : null;

function deskLog(text) {
  let log = {}; try { log = JSON.parse(readFileSync(DESK_LOG, 'utf-8')); } catch { /* első futás */ }
  const day = new Date().toISOString().slice(0, 10);
  log[day] = [...(log[day] || []), text];
  const keep = Object.keys(log).sort().slice(-14);
  writeFileSync(DESK_LOG, JSON.stringify(Object.fromEntries(keep.map(k => [k, log[k]])), null, 2), 'utf-8');
  console.log('👔 ' + text);
}

// A beragadt bukott HÍREK: kimerült körök VAGY lejárt 72 órás ablak,
// amikről még nem született főnöki döntés.
function stuckNews() {
  if (!existsSync(REJECTED_DIR)) return [];
  return readdirSync(REJECTED_DIR)
    .filter(f => f.startsWith('REJECTED_') && f.endsWith('.json'))
    .map(f => { try { return { f, d: JSON.parse(readFileSync(join(REJECTED_DIR, f), 'utf-8')) }; } catch { return null; } })
    .filter(x => x && x.d._meta?.type !== 'guide' && x.d._meta?.can_retry !== false)
    .filter(x => {
      const m = x.d._meta;
      const age = Date.now() - new Date(m.rejected_at || m.written_at || 0).getTime();
      const exhausted = (m.rework_attempts || 0) >= MAX_REWORK_ATTEMPTS;
      const expired = age > 72 * 3600e3;
      return (exhausted || expired) && (m.ceo_rounds || 0) < MAX_CEO_ROUNDS + 1;
    });
}

function isDuplicate(d) {
  // Már van publikált cikkünk ugyanarról? (azonos source_link vagy cím-egyezés)
  if (!existsSync(ARTICLES_DIR)) return false;
  const link = d._meta?.source_link || '';
  const title = (d.original_title || '').toLowerCase();
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.endsWith('.json'))) {
    try {
      const a = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      if (link && a._meta?.source_link === link) return true;
      if (title && (a.original_title || '').toLowerCase() === title) return true;
    } catch { /* skip */ }
  }
  return false;
}

async function verdictFor(d, context) {
  if (TEST_VERDICT) return TEST_VERDICT;   // negatív teszthez: nincs AI-hívás
  const issues = [...(d._meta?.auto_check?.issues || []), ...(d._meta?.ai_review?.issues || [])].slice(0, 6);
  const prompt = `You are the CEO of a small AI-news company. A news article is STUCK (${context}).
Title: ${d.original_title || '(unknown)'}
Known issues: ${issues.join('; ') || 'none recorded'}
Article start: ${String(d.article_markdown || '').slice(0, 1200)}

Our rule: SAVE, DON'T DROP — readers should read this story on OUR site.
Reply ONLY JSON: {"action":"fix-only"|"rewrite-explainer"|"drop","hint":"<one concrete instruction to the writer>","lesson":"<one generalisable lesson for the company>"}
"drop" is allowed ONLY if the story is factually dead or unsalvageable.`;
  const r = await ask(prompt, { agentName: 'ceo', maxTokens: 300, jsonMode: true });
  try {
    const t = r.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
  } catch { return { action: 'rewrite-explainer', hint: 'Rewrite as a clear explainer: what happened and what it means for everyday readers.', lesson: '' }; }
}

async function decideNews(x) {
  const { f, d } = x;
  const m = d._meta;
  const rounds = m.ceo_rounds || 0;

  if (isDuplicate(d)) {
    m.can_retry = false; m.ceo_decision = 'duplicate';
    writeFileSync(join(REJECTED_DIR, f), JSON.stringify(d, null, 2), 'utf-8');
    closeCase(f.replace(/^REJECTED_/, 'ARTICLE_'));
    remember('shared', 'Főnöki döntés: duplikált témát nem írunk újra — előbb ellenőrizzük, van-e már cikkünk róla.');
    deskLog(`Duplikátum lezárva: "${(d.original_title || f).slice(0, 60)}"`);
    return;
  }
  if (rounds >= MAX_CEO_ROUNDS) {
    m.can_retry = false; m.ceo_decision = 'unsalvageable';
    writeFileSync(join(REJECTED_DIR, f), JSON.stringify(d, null, 2), 'utf-8');
    remember('shared', `Főnöki döntés: "${(d.original_title || '').slice(0, 50)}" ${MAX_CEO_ROUNDS} főnöki kör után sem ment át — az ilyen témát korábban kell jobb forrásra cserélni.`);
    deskLog(`Menthetetlen (2 főnöki kör után), lezárva: "${(d.original_title || f).slice(0, 60)}"`);
    return;
  }

  const age = Date.now() - new Date(m.rejected_at || m.written_at || 0).getTime();
  const context = age > 72 * 3600e3 ? 'older than 72h, the normal rework window expired' : 'rework attempts exhausted';
  const v = await verdictFor(d, context);

  if (v.action === 'drop') {
    m.can_retry = false; m.ceo_decision = 'dropped';
    writeFileSync(join(REJECTED_DIR, f), JSON.stringify(d, null, 2), 'utf-8');
    remember('shared', v.lesson || `Főnöki döntés: "${(d.original_title || '').slice(0, 50)}" okafogyott — elvetve.`);
    deskLog(`Elvetve (okafogyott): "${(d.original_title || f).slice(0, 60)}"`);
    return;
  }
  // MENTSD: újraindítás friss ablakkal + konkrét főnöki utasítással
  m.rework_attempts = 0;
  m.rejected_at = new Date().toISOString();
  m.ceo_rounds = rounds + 1;
  m.ceo_hint = v.action === 'fix-only'
    ? `CEO instruction (fix ONLY the flaws, keep everything else): ${v.hint}`
    : `CEO instruction (REWRITE as explainer — "what happened and what it means for you", the news is a few days old): ${v.hint}`;
  writeFileSync(join(REJECTED_DIR, f), JSON.stringify(d, null, 2), 'utf-8');
  if (v.lesson) remember('shared', `Főnöki döntés tanulsága: ${v.lesson}`);
  message('ceo', 'iro', 'problem', `Főnöki újraindítás: "${(d.original_title || '').slice(0, 60)}" — ${v.action}`, { ref: f.replace(/^REJECTED_/, '') });
  deskLog(`Újraindítva (${v.action}, ${m.ceo_rounds}. főnöki kör): "${(d.original_title || f).slice(0, 60)}"`);
}

// 2x bukott heti feladatok (digest/compare) — riasztás + tanulság (maguktól
// újrapróbálnak jövő héten; itt a láthatóság a cél, ne haljon el némán)
function checkWeekly() {
  for (const name of ['digest', 'compare']) {
    try {
      const st = JSON.parse(readFileSync(join(ROOT, 'memory', `${name}-state.json`), 'utf-8'));
      if ((st.consecutive_failures || 0) >= 2) {
        deskLog(`Figyelem: a heti ${name} ${st.consecutive_failures}x egymás után bukott — a következő futás kiemelten figyelendő.`);
        remember(name, `A heti feladat ${st.consecutive_failures}x bukott egymás után — az önellenőrzés okait (H1, szerkezet) az íráskor előre kell kezelni.`);
      }
    } catch { /* nincs state — nem baj */ }
  }
}

async function main() {
  console.log('👔 FŐNÖK-ASZTAL — beragadt ügyek');
  console.log('─'.repeat(60));
  const stale = escalateStale();
  if (stale.length) deskLog(`${stale.length} kézbesítetlen visszaadás az előző futásból az asztalra került.`);
  // Eszkalált visszaadások: a hivatkozott cikk sorsáról a stuckNews-döntés
  // gondoskodik (ugyanaz a REJECTED-fájl) — itt lezárjuk a tételt, hogy ne pörögjön.
  for (const it of listEscalated()) {
    deskLog(`Eszkalált visszaadás lezárva (${it.from}→${it.to}): ${it.ref} — a cikk sorsa a hír-asztalon dől el.`);
    closeCase(it.ref);
  }
  const stuck = stuckNews();
  if (!stuck.length) console.log('✓ Nincs beragadt hír az asztalon.');
  for (const x of stuck) await decideNews(x);
  checkWeekly();
  console.log('👔 Asztal üres, döntések meghozva.');
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 FŐNÖK-ASZTAL HIBA:', e); process.exit(0); });   // sosem dönti be a pipeline-t
```

- [ ] **Step 2: Postás + asztal hívása az orchestratorban** — `agents/ceo/agent.js` main(), a "4. PIPELINE FUTTATÁS" komment után, a scraper lépés ELÉ:

```js
  // 4/0a. POSTÁS (2026-07-13): visszaadott munkák kézbesítése a javító-körbe —
  // az Író MÉG EBBEN a futásban felveszi (friss hír nem marad le az oldalról).
  try {
    const { openFor, markDelivered } = await import('../../core/handback.js');
    for (const hb of openFor('iro')) {
      const src = join(ARTICLES_DIR, hb.ref);
      if (existsSync(src)) {
        const d = JSON.parse(readFileSync(src, 'utf-8'));
        d._meta = { ...(d._meta || {}), status: 'rejected', rejected_at: new Date().toISOString(), reason: hb.reason, ceo_hint: hb.hint || '', handback_from: hb.from };
        const dest = join(REJECTED_DIR, hb.ref.replace(/^ARTICLE_/, 'REJECTED_'));
        if (!existsSync(REJECTED_DIR)) mkdirSync(REJECTED_DIR, { recursive: true });
        writeFileSync(dest, JSON.stringify(d, null, 2), 'utf-8');
        unlinkSync(src);
        console.log(`📮 postás: ${hb.from} → iro kézbesítve: ${hb.ref} (${hb.reason.slice(0, 60)})`);
      } else {
        console.log(`📮 postás: a hivatkozott fájl már nincs meg (${hb.ref}) — tétel lezárva.`);
      }
      markDelivered(hb.id);
    }
  } catch (e) { console.log('⚠️ postás-hiba (megy tovább): ' + e.message.slice(0, 80)); }

  // 4/0b. FŐNÖK-ASZTAL: azonnali döntés minden beragadt ügyről (spec 2026-07-13)
  await runAgent('agents/ceo/desk.js');
```

Megjegyzés: az `unlinkSync` a ceo/agent.js importjaiban még nem szerepel — az import-sorba felveendő (`unlinkSync` az fs-ből).

- [ ] **Step 3: Az Író értse a főnöki utasítást** — `agents/iro/agent.js` `collectFeedback` (384. sor) bővítése:

```js
function collectFeedback(meta) {
  const points = [];
  if (meta?.ceo_hint) points.push(meta.ceo_hint);          // a Főnök utasítása ELÖL
  if (meta?.auto_check?.issues?.length) points.push(...meta.auto_check.issues);
  if (meta?.ai_review?.issues?.length) points.push(...meta.ai_review.issues);
  if (meta?.ai_review?.verdict) points.push(`Reviewer verdict: ${meta.ai_review.verdict}`);
  if (meta?.reason && points.length === 0) points.push(meta.reason);
  return [...new Set(points)];
}
```

- [ ] **Step 4: Füst-teszt** (AI-hívás nélkül): üres asztallal `node agents/ceo/desk.js` → Expected: `✓ Nincs beragadt hír az asztalon.` és exit 0.

- [ ] **Step 5: Commit**: `git add agents/ceo/desk.js agents/ceo/agent.js agents/iro/agent.js && git commit -m "feat(főnök): Főnök-asztal — azonnali döntés minden beragadt hírről (mentsd-ne-dobd: kis javítás → magyarázó újraírás → elvetés csak végső esetben) + postás az orchestratorban + ceo_hint az Író javító-körében"`

---

### Task 5: Heti feladatok bukás-számlálója (digest + compare)

**Files:**
- Modify: `agents/digest/agent.js` (~137-143. sor, a selfCheck-bukás ágai)
- Modify: `agents/compare/agent.js` (azonos minta a saját selfCheck körül)

**Interfaces:**
- Produces: `memory/digest-state.json` / `compare-state.json` `consecutive_failures` mező; sikeres futásnál 0. A Task 4 `checkWeekly()` már olvassa.

- [ ] **Step 1: digest — bukás-ág** (a `if (!response || !selfCheck(response.text))` ágban, a `return` ELŐTT; a state-írás mintája a fájlban már megvan):

```js
  if (!response || !selfCheck(response.text)) {
    console.log('💥 Nem sikerült jó összefoglalót írni — marad jövő hétre.');
    try {
      const st = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
      st.consecutive_failures = (st.consecutive_failures || 0) + 1;
      writeFileSync(STATE_PATH, JSON.stringify(st, null, 2), 'utf-8');
    } catch { writeFileSync(STATE_PATH, JSON.stringify({ consecutive_failures: 1 }, null, 2), 'utf-8'); }
    const { remember } = await import('../../core/memory-manager.js');
    remember('digest', 'A heti összefoglaló önellenőrzésen bukott — a H1-et és a kötelező szekciókat már az első vázlatban ki kell kényszeríteni.');
    return;
  }
```

és a SIKERES publikálás után (ahol a state-be a heti dedup kerül): `st.consecutive_failures = 0;` ugyanabba a mentésbe.

- [ ] **Step 2: compare — ugyanez a minta** a compare-state.json-nal és 'compare' scope-pal (a fájl saját STATE_PATH nevét használva; a lesson-szöveg: 'Az összehasonlító cikk önellenőrzésen bukott — táblázat + H1 az első vázlatban legyen kész.').

- [ ] **Step 3: Füst-teszt**: `node -e "const s=require('./memory/digest-state.json'); console.log('state olvasható', Object.keys(s))"` — a mező csak bukáskor jön létre, a state-fájl épsége a lényeg.

- [ ] **Step 4: Commit**: `git add agents/digest/agent.js agents/compare/agent.js && git commit -m "feat(heti): bukás-számláló a digest/compare state-ben + tanulság — 2 egymást követő bukás a Főnök-asztalra kerül"`

---

### Task 6: Önjavító → közös tanulság + napi jelentés új sorai

**Files:**
- Modify: `core/quality-guard.js` `applyQualityFixes()` vége
- Modify: `core/daily-report.js` (a meglévő 🔧 Önjavító-sor blokkja után)

**Interfaces:**
- Consumes: `handbackStats()` (Task 1), `memory/ceo-desk-log.json` (Task 4), `list` (memory-manager).

- [ ] **Step 1: quality-guard — tanulság javításkor** (`applyQualityFixes` végén, a `logFixes(fixes);` előtt):

```js
  if (fixes.length) {
    try {
      const { remember } = await import('./memory-manager.js');
      remember('shared', `Csempe-szabály emlékeztető: a tool mindig a legrövidebb hivatalos terméknév (ma ${fixes.length} javítás kellett, pl. ${fixes[0].slice(0, 60)}).`);
    } catch { /* tanulság nélkül is megy */ }
  }
```

Ehhez az `applyQualityFixes` legyen `export async function` — az egyetlen hívó (check-i18n a `--fix` CLI-n át) már await-kompatibilis; a CLI-blokkban `const fixes = await applyQualityFixes();`.

- [ ] **Step 2: daily-report — új sorok** (a meglévő 🔧 Önjavító-blokk után):

```js
  // Hierarchia-műszerfal (2026-07-13): visszaadások + főnöki döntések + tanulságok
  try {
    const { handbackStats } = await import('./handback.js');
    const hb = handbackStats();
    if (hb.open + hb.deliveredToday + hb.escalated > 0)
      lines.push(`↩️ Visszaadott munkák: ${hb.deliveredToday} kézbesítve ma · ${hb.open} nyitott · ${hb.escalated} a Főnök asztalán`);
  } catch { /* iroda nélkül is megy */ }
  try {
    const dlog = JSON.parse(readFileSync(join(ROOT, 'memory', 'ceo-desk-log.json'), 'utf-8'));
    const td = dlog[today()] || [];
    if (td.length) lines.push(`👔 Főnöki döntés ma: ${td.length} (pl. ${td[0].slice(0, 70)}…)`);
  } catch { /* még nincs asztal-napló */ }
  try {
    const { list } = await import('./memory-manager.js');
    const fresh = list({ scope: 'shared', limit: 12 }).filter(x => true).length;   // összkép
    const store = JSON.parse(readFileSync(join(ROOT, 'memory', 'store.json'), 'utf-8'));
    const todays = (store.items || []).filter(it => (it.created || '').startsWith(today())).length;
    if (todays) lines.push(`📖 Új tanulság ma: ${todays}`);
  } catch { /* könyv nélkül is megy */ }
```

- [ ] **Step 3: Füst-teszt**: `node core/quality-guard.js --fix` → Expected: `✅ önjavító: nincs javítanivaló` (és nem dob hibát az async váltás után); `node -e "import('./core/daily-report.js')"` jellegű betöltés-teszt helyett: a jelentés modult a pipeline futtatja — szintaxis-ellenőrzés: `node --check core/daily-report.js`.

- [ ] **Step 4: Commit**: `git add core/quality-guard.js core/daily-report.js && git commit -m "feat(műszerfal): önjavító-tanulság a közös könyvbe + napi jelentésben visszaadások/főnöki döntések/új tanulságok"`

---

### Task 7: E2E negatív teszt + dokumentálás + push

**Files:**
- Create: `tmp-e2e-hierarchia.mjs` (futás után törlendő)
- Modify: `agents/README.md` (hierarchia-ábra frissítése, ha van ilyen szakasz)

- [ ] **Step 1: E2E teszt** — szimulált beragadt hír + eszkalált visszaadás, a desk `--test-verdict`-tel (AI-hívás nélkül); ellenőrzi: (a) kimerült REJECTED hírt a desk újraindítja (rework_attempts=0, ceo_hint beírva, ceo_rounds=1), (b) tanulság született a 'shared' scope-ban, (c) desk-log mai bejegyzés, (d) takarítás után minden state visszaáll. A teszt a Task 1 teszt backup-mintáját követi (handbacks.json + store.json + ceo-desk-log.json + a kamu REJECTED-fájl visszaállítása/törlése).

```js
// E2E: kamu kimerült hír → desk --test-verdict → újraindítás-ellenőrzés → takarítás
import { strict as assert } from 'assert';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';

const REJ = 'content/rejected/REJECTED_zz-e2e-teszt-hir.json';
const backups = {};
for (const p of ['memory/handbacks.json', 'memory/store.json', 'memory/ceo-desk-log.json'])
  backups[p] = existsSync(p) ? readFileSync(p, 'utf-8') : null;

try {
  writeFileSync(REJ, JSON.stringify({
    original_title: 'ZZ E2E teszt hír',
    article_markdown: '---\ntitle: "t"\n---\n\n# ZZ E2E teszt hír\n\ntörzs',
    _meta: { type: 'news', status: 'rejected', can_retry: true, rework_attempts: 2, rejected_at: new Date(Date.now() - 80 * 3600e3).toISOString(), ai_review: { issues: ['too shallow'] } }
  }, null, 2), 'utf-8');

  execSync(`node agents/ceo/desk.js --test-verdict "{\\"action\\":\\"rewrite-explainer\\",\\"hint\\":\\"explain simply\\",\\"lesson\\":\\"ZZ-E2E tanulság\\"}"`, { encoding: 'utf-8', stdio: 'pipe' });

  const d = JSON.parse(readFileSync(REJ, 'utf-8'));
  assert.equal(d._meta.rework_attempts, 0, 'újraindítva');
  assert.equal(d._meta.ceo_rounds, 1, 'főnöki kör számolva');
  assert.ok(d._meta.ceo_hint.includes('explain simply'), 'főnöki utasítás beírva');
  const store = JSON.parse(readFileSync('memory/store.json', 'utf-8'));
  assert.ok(store.items.some(it => it.scope === 'shared' && it.text.includes('ZZ-E2E')), 'tanulság a közös könyvben');
  const dlog = JSON.parse(readFileSync('memory/ceo-desk-log.json', 'utf-8'));
  assert.ok((dlog[new Date().toISOString().slice(0, 10)] || []).length >= 1, 'asztal-napló írva');
  console.log('✅ E2E hierarchia-teszt: ÁTMENT');
} finally {
  if (existsSync(REJ)) unlinkSync(REJ);
  for (const [p, b] of Object.entries(backups)) { if (b === null) { if (existsSync(p)) unlinkSync(p); } else writeFileSync(p, b, 'utf-8'); }
}
```

- [ ] **Step 2: Futtatás**: `node tmp-e2e-hierarchia.mjs` → Expected: `✅ E2E hierarchia-teszt: ÁTMENT`; utána `rm tmp-e2e-hierarchia.mjs`.

- [ ] **Step 3: Minden teszt újra**: `node core/handback.test.js && node core/lessons-block.test.js && node core/quality-guard.js --fix` → mind zöld.

- [ ] **Step 4: Push + ellenőrzés**: `git push` majd `git fetch && git status -sb` (a pipe-os ellenőrzés TILOS — recept).

---

## Self-review jegyzet

- Spec-lefedettség: hierarchia-config (T1), visszaadó-iroda+postás (T1+T4), közös tanulság minden agentnek (T2), Fordító-bekötés (T3), Főnök-asztal azonnali döntéssel + mentsd-ne-dobd (T4), heti bukás-számláló (T5), önjavító-tanulság + műszerfal (T6), negatív tesztek (T1, T2, T7). A spec "lessons.json" komponense a MEGLÉVŐ memory-manager 'shared' scope-jára képződik le (DRY — a spec célja a viselkedés, nem a fájlnév).
- A postás az orchestrator ELEJÉN fut → friss hír még aznap újraírásra kerül (user-követelmény).
- Elvetés-korlát: desk-ben a drop csak LLM-ítélettel + duplikátum-szabállyal + 2 főnöki kör után kényszerből — a "mentsd, ne dobd" sorrend érvényes.
