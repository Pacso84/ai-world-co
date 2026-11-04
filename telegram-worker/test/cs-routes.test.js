// node telegram-worker/test/cs-routes.test.js — offline: fake env + globális fetch-csere
import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { handleChat, handleContact, csCounters, csExport, LIMIT_MSG, markUnsent, uzenetAzonosito, bumpCs, dayKey } from '../src/cs-routes.js';

function fakeKv() {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, String(v)); },
    // A Workers KV `list`-je: {keys:[{name}], list_complete, cursor}. Az export
    // ezen az úton számolja a kézbesítetlen üzeneteket — ha a teszt-utánzatban
    // nem lenne `list`, a mérőeszköz nem azt mérné, ami élesben fut.
    async list({ prefix = '', cursor } = {}) {
      const nevek = [...store.keys()].filter(k => k.startsWith(prefix)).sort();
      const tol = cursor ? nevek.indexOf(cursor) + 1 : 0;
      return { keys: nevek.slice(tol).map(name => ({ name })), list_complete: true, cursor: null };
    },
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
  if (String(url).includes('api.telegram.org')) {
    globalThis.__tgSent = (globalThis.__tgSent || 0) + 1;
    // A Telegram háromféleképp végződhet — a teszt állítja be, melyikkel.
    if (globalThis.__tgMode === 'http500') return { ok: false, status: 500, json: async () => ({ ok: false, description: 'Internal Server Error' }) };
    if (globalThis.__tgMode === 'jsonfalse') return { ok: true, status: 200, json: async () => ({ ok: false, description: 'Forbidden: bot was blocked by the user' }) };
    if (globalThis.__tgMode === 'dob') throw new Error('halott hálózat');
    return { ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 1 } }) };
  }
  throw new Error('váratlan fetch: ' + url);
};
globalThis.__tgMode = 'ok';

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
  // 8) I2: /contact SAJÁT napi IP-limit (CONTACT_DAILY_MAX=5, független a chat keretétől) — 5×200, 6. 429
  {
    const env = baseEnv();
    globalThis.__tgSent = 0;
    let last;
    for (let i = 0; i < 5; i++) {
      last = await handleContact(req('/contact', { email: 'a@b.hu', message: 'm' + i, lang: 'hu', web: '', token: 'good-token' }), env);
      assert.equal(last.status, 200, `${i + 1}. contact még 200`);
    }
    last = await handleContact(req('/contact', { email: 'a@b.hu', message: 'm5', lang: 'hu', web: '', token: 'good-token' }), env);
    assert.equal(last.status, 429, '6. contact ugyanarról az IP-ről = 429 (CONTACT_DAILY_MAX)');
  }
  // 9) I3: limit-429 után a visszaadott sessionId LÉTEZIK — retry nem kér Turnstile-t (nem 403)
  {
    const env = baseEnv();
    const day = new Date().toISOString().slice(0, 10);
    await env.FEEDBACK.put(`cs:global:${day}`, '300');
    const r1 = await handleChat(req('/chat', { message: 'hello', lang: 'en', token: 'good-token' }), env);
    assert.equal(r1.status, 429);
    const { sessionId } = await r1.json();
    assert.ok(sessionId, 'kapott sessionId-t a 429-en');
    // retry UGYANAZZAL a sessionId-vel, token NÉLKÜL → NEM 403 (a session létezik), marad 429
    const r2 = await handleChat(req('/chat', { message: 'again', lang: 'en', sessionId }), env);
    assert.notEqual(r2.status, 403, 'a perzisztált session miatt nincs Turnstile-403');
    assert.equal(r2.status, 429, 'globális limit miatt marad 429');
  }
  // 10) KV-HIBA (2026-07-22 audit): eddig kezeletlenül szállt el → nyers worker-hiba
  //     CORS-fejléc nélkül. Most szabályos 503 + eszkaláció (a látogató az űrlapra kerül).
  {
    const env = baseEnv();
    env.FEEDBACK.get = async () => { throw new Error('KV down'); };
    const r = await handleChat(req('/chat', { message: 'hello', lang: 'hu', token: 'good-token' }), env);
    assert.equal(r.status, 503, 'KV-hiba → 503 (nem összeomlás)');
    assert.ok(r.headers.get('Access-Control-Allow-Origin'), 'CORS-fejléc megvan (a böngésző értelmezni tudja)');
    const j = await r.json();
    assert.equal(j.escalate, true, 'eszkalál → a widget felkínálja az űrlapot');
    assert.ok(j.answer && j.answer.length > 0, 'kap érthető üzenetet, nem üres hibát');
  }
  // 11) /contact is túléli a KV-hibát
  {
    const env = baseEnv();
    env.FEEDBACK.get = async () => { throw new Error('KV down'); };
    const r = await handleContact(req('/contact', { email: 'a@b.hu', message: 'x', lang: 'hu', web: '', token: 'good-token' }), env);
    assert.equal(r.status, 503);
    assert.ok(r.headers.get('Access-Control-Allow-Origin'), 'CORS-fejléc megvan');
  }

  // ═════════════════════════════════════════════════════════════════
  // 2026-08-30 — A KAPCSOLAT-ŰRLAP ÜZENETE NÉMÁN ELVESZHETETT
  // ═════════════════════════════════════════════════════════════════
  // A `tg()` elnyelte a Telegram hibáit, a `contactFlow` pedig nem is nézte
  // az eredményt: a látogató {ok:true}-t kapott ("válaszolni fogunk"), a
  // tulajdonos viszont SOHA nem értesült az üzenetről. A `cs:msg:*` kulcsokat
  // a repóban SENKI nem olvassa — a mentés önmagában nem értesítés.
  const contact = (env, over = {}) => handleContact(
    req('/contact', { email: 'a@b.hu', message: 'Segítsetek!', lang: 'hu', web: '', token: 'good-token', ...over }), env);
  const unsentKeys = env => [...env.FEEDBACK._store.keys()].filter(k => k.startsWith('cs:unsent:'));

  // 12) Telegram HTTP-hiba → a látogató felé változatlan, DE marad NYOM
  {
    const env = baseEnv();
    globalThis.__tgMode = 'http500';
    const r = await contact(env);
    globalThis.__tgMode = 'ok';
    assert.equal(r.status, 200, 'a látogató viselkedése nem változhat');
    assert.equal((await r.json()).ok, true);
    const k = unsentKeys(env);
    assert.equal(k.length, 1, 'a kézbesítetlen üzenetnek nem maradt nyoma (HTTP-hiba)');
    const rec = JSON.parse(env.FEEDBACK._store.get(k[0]));
    assert.equal(rec.email, 'a@b.hu', 'a nyomban nincs benne a feladó');
    assert.equal(rec.message, 'Segítsetek!', 'a nyomban nincs benne az ÜZENET — így nem lehet megválaszolni');
    assert.ok(!JSON.stringify(rec).includes('bt'), 'nem szivároghat ki a BOT_TOKEN');
  }
  // 13) Telegram {ok:false} JSON (HTTP 200!) → ugyanúgy kézbesítetlen
  {
    const env = baseEnv();
    globalThis.__tgMode = 'jsonfalse';
    const r = await contact(env);
    globalThis.__tgMode = 'ok';
    assert.equal(r.status, 200);
    assert.equal(unsentKeys(env).length, 1, 'a törzsbeli {ok:false} átcsúszott sikerként');
  }
  // 14) siker → NINCS fölösleges nyom (különben a riport hamisan riogatna)
  {
    const env = baseEnv();
    const r = await contact(env);
    assert.equal(r.status, 200);
    assert.equal(unsentKeys(env).length, 0, 'sikeres küldésnél is kézbesítetlennek jelölte');
    const ex = await csExport(env);
    assert.equal(ex.unsent, 0, 'sikernél sem 0 a kézbesítetlenek száma');
    assert.equal(ex.unsentLast, null);
  }
  // 15) 📮 AZ EXPORTBAN MEGJELENIK — ez a lánc VÉGE: eddig jut el a tulajdonoshoz
  {
    const env = baseEnv();
    globalThis.__tgMode = 'http500';
    await contact(env, { message: 'első' });
    await contact(env, { message: 'második' });
    globalThis.__tgMode = 'ok';
    const ex = await csExport(env);
    assert.equal(ex.unsent, 2, 'az export nem látja a kézbesítetlen üzeneteket: ' + JSON.stringify(ex));
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(String(ex.unsentLast)), 'nincs (ISO) időbélyeg: ' + ex.unsentLast);
    assert.equal(ex.esc, 2, 'a meglévő számlálók eltűntek az exportból');
    assert.ok(!('unsentError' in ex), 'hibát jelzett, pedig a listázás ment');
  }
  // 16) ha a NYOM írása IS elbukik, a látogató NE kapjon hamis ígéretet
  {
    const env = baseEnv();
    const eredetiPut = env.FEEDBACK.put.bind(env.FEEDBACK);
    env.FEEDBACK.put = async (k, v, o) => {
      if (k.startsWith('cs:unsent:')) throw new Error('KV down');
      return eredetiPut(k, v, o);
    };
    globalThis.__tgMode = 'dob';
    const r = await contact(env);
    globalThis.__tgMode = 'ok';
    assert.equal(r.status, 503, 'se Telegram, se nyom — mégis {ok:true}-t ígért a látogatónak');
    assert.ok(r.headers.get('Access-Control-Allow-Origin'), 'CORS-fejléc megvan');
  }
  // 17) a listázás hibája NE vigye magával a napi számlálókat — és ne
  //     látsszon "0 kézbesítetlen"-nek ("elromlott" ≠ "nem volt dolga")
  {
    const env = baseEnv();
    await contact(env);
    env.FEEDBACK.list = async () => { throw new Error('KV list down'); };
    const ex = await csExport(env);
    assert.equal(ex.esc, 1, 'a list-hiba elvitte a számlálókat is');
    assert.equal(ex.unsentError, true, 'a sikertelen listázás "0 kézbesítetlen"-nek látszik');
    assert.ok(!('unsent' in ex) || ex.unsent === null, 'hamis nullát írt ki');
  }

  // 19) ⏱️ UGYANABBAN AZ EZREDMÁSODPERCBEN érkező két üzenet NEM írja felül
  //     egymást — sem a mentés, sem a kézbesítetlen-nyom.
  //     Ez a 15) esetben előbb VÉLETLENSZERŰEN bukó tesztként jelentkezett:
  //     a `Date.now()` önmagában nem egyedi kulcs. Itt már nem a szerencsén
  //     múlik — az órát kikötjük.
  {
    const env = baseEnv();
    const eredetiNow = Date.now;
    Date.now = () => 1756500000000;
    globalThis.__tgMode = 'http500';
    try {
      await contact(env, { message: 'egyszerre-A' });
      await contact(env, { message: 'egyszerre-B' });
    } finally {
      Date.now = eredetiNow;
      globalThis.__tgMode = 'ok';
    }
    assert.equal([...env.FEEDBACK._store.keys()].filter(k => k.startsWith('cs:msg:')).length, 2,
      'két egyidejű üzenetből csak egy maradt meg (cs:msg: kulcs-ütközés)');
    assert.equal(unsentKeys(env).length, 2, 'két egyidejű kézbesítetlenből csak egy maradt meg');
    const ex = await csExport(env);
    assert.equal(ex.unsent, 2, 'az export csak egyet lát a kettőből');
    assert.equal(ex.unsentLast, new Date(1756500000000).toISOString(), 'az időbélyeg nem olvasható ki a kulcsból: ' + ex.unsentLast);
  }

  // 18) 🔌 A HUZAL IS LEGYEN BEKÖTVE. A `worker.js` node alatt NEM
  //     importálható (`cloudflare:email`), ezért szövegként nézzük meg, hogy
  //     a /feedback-export tényleg a bővített összeállítót használja. Ez a
  //     lánc utolsó szeme: enélkül a `csExport` zölden állhatna használatlanul.
  {
    const src = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf-8');
    assert.ok(/out\.__cs\s*=\s*await\s+csExport\(env\)/.test(src), 'a /feedback-export nem a csExport()-ot adja ki');
    assert.ok(/import\s*\{[^}]*csExport[^}]*\}\s*from\s*'\.\/cs-routes\.js'/.test(src), 'a worker.js nem importálja a csExport-ot');
  }

  // ===================================================================
  // 19) 📧 AZ EMAIL-ÁG IS VÉDVE (2026-09-08)
  // ===================================================================
  // MI TÖRTÉNT: a `cs-email.js` elküldte a Telegram-másolatot, és a `tg()`
  // visszatérési értékét ELDOBTA. A `tg()` SOHA nem dob — hiba esetén
  // `{ok:false}`-t ad —, tehát a bukott küldés pontosan úgy nézett ki, mint a
  // sikeres. És az email-ág SEMMIT nem mentett a KV-be, tehát a levél
  // nyomtalanul elveszett volna. Ugyanaz a hiba, amit 08-29-én az ŰRLAPON
  // már megjavítottunk — csak a másik ágon maradt bent.
  //
  // ⚠️ A `cs-email.js` node alatt NEM importálható (`cloudflare:email`),
  // ezért a megosztott részt viselkedésben, a bekötést forrásból nézzük.
  {
    // a) Az azonosító alakja SZERZŐDÉS a `csUnsent()` olvasójával: az
    //    időbélyeg a kulcs ELSŐ szakasza, érték-olvasás nélkül.
    const id = uzenetAzonosito(1756500000000);
    assert.match(id, /^1756500000000-[0-9a-f]{8}$/, 'elromlott az azonosító alakja: ' + id);
    assert.notEqual(uzenetAzonosito(1756500000000), uzenetAzonosito(1756500000000),
      'ugyanarra az ezredmásodpercre AZONOS azonosítót ad — a második üzenet felülírná az elsőt');

    // b) A `markUnsent` exportálva van, és az export TÉNYLEG meglátja.
    const env = baseEnv();
    const rec = { kind: 'email', email: 't@trykrea.ai', subject: 'Krea for your article', message: 'Hey', ts: 1756500000000 };
    await markUnsent(env, uzenetAzonosito(rec.ts), rec, 'Forbidden: bot was blocked by the user');
    const ex = await csExport(env);
    assert.equal(ex.unsent, 1, 'az email-ág nyoma nem jut el az exportig');
    assert.equal(ex.unsentLast, new Date(1756500000000).toISOString());
    // A LEVÉL TARTALMA is legyen visszakereshető — ez a lényeg: ne vesszen el.
    const mentett = JSON.parse(env.FEEDBACK._store.get(unsentKeys(env)[0]));
    assert.equal(mentett.email, 't@trykrea.ai');
    assert.equal(mentett.subject, 'Krea for your article');
    assert.equal(mentett.delivered, false);
    assert.match(mentett.reason, /blocked/, 'az OK nem került be: ' + mentett.reason);
  }

  // ===================================================================
  // 20) ✉️ A BUKOTT AUTO-VÁLASZ LÁTHATÓ (2026-09-08)
  // ===================================================================
  // A `message.reply()` hibáját eddig `console.log` nyelte el — az sehova nem
  // jut el. Élesben megtörtént, és KIZÁRÓLAG abból derült ki, hogy egy
  // KV-kulcs HIÁNYZOTT (amit a sikeres ág írt volna). Most számlálóba megy.
  {
    const env = baseEnv();
    const nulla = await csCounters(env);
    assert.equal(nulla.replyfail, 0, 'alapból 0, nem undefined — különben a riport sosem szólalna meg');
    assert.equal(nulla.replyfailWhy, null, 'ok nélkül ne találjunk ki okot');

    await bumpCs(env, 'replyfail');
    await env.FEEDBACK.put(`cs:replyfailwhy:${dayKey()}`, 'could not send email: invalid recipient');
    const c = await csCounters(env);
    assert.equal(c.replyfail, 1);
    assert.match(c.replyfailWhy, /invalid recipient/, 'az OK nem megy ki — egy szám önmagában nem javítható hiba');

    // A lánc VÉGE: az exportba is bele kell kerülnie.
    const ex = await csExport(env);
    assert.equal(ex.replyfail, 1, 'a replyfail nem jut el a /feedback-export-ig');
  }

  // ===================================================================
  // 20/b) 🔕 A „NEM VÁLASZOLHATÓ" KÜLÖN SZÁMÍT — nem riasztás (2026-09-08)
  // ===================================================================
  // A Cloudflare nem enged válaszolni ÉRVÉNYES DMARC nélküli levélre
  // (`original email is not repliable`). Ez a KÜLDŐ domainjének a hibája,
  // a mi oldalunkon nincs mit tenni vele — tipikusan hanyag tömeges küldő.
  // Ha ezt is „kudarcnak" vennénk, a napi riport minden marketing-levélre
  // riasztana, és a hamis riasztás zajában a VALÓDI kudarc veszne el.
  {
    const env = baseEnv();
    await bumpCs(env, 'noreply');
    const c = await csCounters(env);
    assert.equal(c.noreply, 1, 'a „nem válaszolható" nincs külön számolva');
    assert.equal(c.replyfail, 0, '⚠️ a nem válaszolható levél KUDARCNAK számít — hamis riasztás lesz belőle');
    assert.equal((await csExport(env)).noreply, 1, 'a noreply nem jut el az exportig');
  }

  // ===================================================================
  // 21) 🔌 BEKÖTÉS-ŐR — a cs-email.js tényleg MEGNÉZI a küldés eredményét
  // ===================================================================
  // ⚠️ A KOMMENTEKET LEVÁGJUK. Ma (2026-09-08) élesben megtörtént, hogy egy
  // ilyen forrás-alapú őr egy KOMMENTRE illeszkedett, és a kivágott hívást
  // zölden átengedte. A fejléc itt is leírja a függvények nevét.
  {
    const nyers = readFileSync(new URL('../src/cs-email.js', import.meta.url), 'utf-8');
    const src = nyers.split('\n').filter(s => !s.trim().startsWith('//')).join('\n');
    assert.ok(nyers.includes('// '), 'nincs komment a forrásban — a szűrő nem azt méri, amit hisz');

    assert.ok(/const\s+kuldes\s*=\s*await\s+tg\s*\(/.test(src),
      '⚠️ a cs-email.js megint ELDOBJA a tg() visszatérési értékét');
    assert.ok(/if\s*\(\s*!kuldes\?\.ok\s*\)/.test(src), 'nincs ellenőrizve a küldés eredménye');
    assert.ok(/markUnsent\s*\(/.test(src), 'a markUnsent() nincs HÍVVA az email-ágon');
    assert.ok(/bumpCs\s*\(\s*env\s*,\s*nemValaszolhato\s*\?\s*'noreply'\s*:\s*'replyfail'\s*\)/.test(src),
      'a bukott auto-válasz megint némán vész el, vagy nincs szétválasztva a „nem válaszolható" eset');
    assert.ok(/not repliable/i.test(src),
      '⚠️ a DMARC-hiány miatti eset nincs megkülönböztetve — minden marketing-levélre riasztanánk');

    // Az AI-motor hívása LEGYEN védve: kivétele visszapattintaná a levelet.
    assert.ok(/try\s*\{[\s\S]{0,200}?await\s+answer\s*\(/.test(src),
      '⚠️ az answer() megint védtelen — egy AI-kiesés bounce-olná a valódi olvasó levelét');
    // ⚠️ A `try` MEGLÉTE NEM ELÉG, ÉS EZT MUTÁCIÓVAL TANULTAM MEG: egy
    // `catch { throw e; }` ugyanúgy átmegy a fenti mintán, közben pontosan azt
    // a bounce-ot okozza, ami ellen a védelem szól. Ezért azt kötjük ki, hogy
    // a handler SEMMILYEN kivételt ne dobjon tovább: a levél feldolgozása
    // fusson végig, akkor is, ha az AI kiesett.
    assert.ok(!/\bthrow\b/.test(src),
      '⚠️ a cs-email.js dob egy kivételt — az Email Routing visszapattintja a levelet: '
      + (src.match(/[^\n]*\bthrow\b[^\n]*/) || [''])[0].trim());

    // SORREND: a nyom a válasz-küldés ELŐTT kell — nem ígérhetünk emberi
    // választ egy levélre, amit épp elvesztettünk.
    const nyomNal = src.indexOf('markUnsent(');
    const valaszNal = src.indexOf('message.reply(');
    assert.ok(nyomNal > 0 && valaszNal > 0, 'nem találom a két hívást — a teszt elavult');
    assert.ok(nyomNal < valaszNal, 'a kézbesítetlen-nyom a válasz UTÁN van');
  }

  // ===================================================================
  // 22) 🔌 A NAPI RIPORT KIÍRJA (a lánc utolsó szeme)
  // ===================================================================
  {
    // A `core/daily-report.js` importálása Telegram-üzenetet küldene
    // (feltétel nélküli `main()`), ezért forrásból nézzük.
    const rep = readFileSync(new URL('../../core/daily-report.js', import.meta.url), 'utf-8')
      .split('\n').filter(s => !s.trim().startsWith('//')).join('\n');
    assert.ok(/cs\.replyfail\s*>\s*0/.test(rep),
      '⚠️ a bukott auto-válasz nem jut el a napi riportig — a lelet a CI-naplóig ér, senkihez');
    assert.ok(/replyfailWhy/.test(rep), 'a riport nem írja ki, MIÉRT bukott a válasz');
  }

  console.log('✅ cs-routes.test: minden átment');
} finally {
  globalThis.fetch = realFetch;
}
