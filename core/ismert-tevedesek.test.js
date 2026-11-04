// ===================================================================
// TESZT — ismert (hivatalos forrással CÁFOLT) tévedések, core/ismert-tevedesek.js (2026-11-01)
// Ingyenes, hálózat nélküli. Három rész:
//   (a) egységtesztek: minden tévedésre pozitív ÉS negatív (helyes megfogalmazású) példa;
//   (b) memória-szűrő: a téves lecke nem menthető, és a meglévő sem jön vissza keresésből / promptból —
//       SAJÁT ideiglenes táron (MEMORY_STORE_PATH), az éles memory/store.json-hoz NEM nyúl;
//   (c) KORPUSZ: az élő cikkek (content/articles) és fordításaik (content/translations hu/es) szövegében
//       0 találat az elvárt. Bukáskor a fájl, a nyelv, a tévedés és a mondat a kimenetben.
// ===================================================================
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEVEDESEK, NYELVEK, mondatokra, tevedesekASzovegben, tevesLecke, ujTevedesek, tevedesJelzes } from './ismert-tevedesek.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, bukott = 0;
const t = async (nev, fn) => {
  try { await fn(); pass++; console.log('  ✅ ' + nev); }
  catch (e) {
    bukott++;
    // a korpusz-bukásnál a TELJES lista kell (fájl + mondat), nem csak az első sor
    const sorok = String(e && e.message).split('\n');
    console.log('  ❌ ' + nev + '\n     ' + sorok.slice(0, 80).join('\n     ') + (sorok.length > 80 ? `\n     … és még ${sorok.length - 80} sor` : ''));
  }
};
console.log('🧪 Ismert tévedések\n');

// ── (a) EGYSÉGTESZTEK ───────────────────────────────────────────────
const lefedett = new Set();
const van = (id, s, ny) => {
  const ids = tevedesekASzovegben(s, ny).map(x => x.id);
  assert.ok(ids.includes(id), `${id} [${ny}] nem fogta: ${s}`);
  lefedett.add(id);
};
const nincs = (s, ny) => assert.deepEqual(tevedesekASzovegben(s, ny).map(x => x.id), [], `[${ny}] tévesen fogta: ${s}`);

await t('📋 a lista ép: egyedi azonosító, magyar leírás forrással, csak ismert nyelvkulcs', () => {
  const ids = TEVEDESEK.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length, 'ismétlődő azonosító');
  for (const x of TEVEDESEK) {
    assert.match(x.id, /^[a-z0-9-]+$/);
    assert.ok(x.leiras && /[áéíóöőúüű]/.test(x.leiras), x.id + ': nincs magyar leírás');
    assert.match(x.leiras, /\.(com|ai)\b/, x.id + ': a leírásból hiányzik a cáfoló hivatalos forrás');
    for (const k of Object.keys(x.nyelvek)) assert.ok(k === '*' || NYELVEK.includes(k), x.id + ': ismeretlen nyelv ' + k);
  }
});

await t('💳 Alexa+ „fizetős” a Prime említése nélkül — fogja; Prime-mal vagy Alexa+ nélkül nem', () => {
  van('alexa-plus-fizetos', 'Alexa+ is a paid subscription tier that adds conversational features.', 'en');
  van('alexa-plus-fizetos', "Some features require Alexa+ (Amazon's paid subscription).", 'en');
  van('alexa-plus-fizetos', 'Alexa+ is a paid add-on for Echo owners.', 'en');
  van('alexa-plus-fizetos', 'Az Alexa+ egy fizetős előfizetéses csomag, amely több funkciót ad.', 'hu');
  van('alexa-plus-fizetos', 'Az Alexa+ az Amazon fizetős szolgáltatása.', 'hu');
  van('alexa-plus-fizetos', 'Alexa+ es un nivel de suscripción de pago.', 'es');
  // a spanyol „Primero” NEM a Prime (élő korpusz-eset): a tévedést ettől még fogni kell
  van('alexa-plus-fizetos', 'Primero, ten en cuenta que Alexa+ es un servicio de pago.', 'es');
  nincs('Alexa+ is included with Prime; without Prime it is a paid subscription at $19.99 a month.', 'en');
  nincs('Alexa+ is free with Amazon Prime and costs $19.99 a month without it.', 'en');
  nincs('Your Echo needs a paid music service such as Spotify Premium.', 'en');
  nincs('Az Alexa+ a Prime-előfizetés része; Prime nélkül fizetős szolgáltatás.', 'hu');
  nincs('Egyes zenei funkciókhoz fizetős előfizetés kell (például Spotify Premium).', 'hu');
  nincs('Alexa+ está incluido con Prime; sin Prime es un servicio de pago.', 'es');
});

await t('📦 Alexa+ „nincs széles körben kint” — fogja; a széles körű elérhetőséget nem', () => {
  van('alexa-plus-nincs-kint', 'Alexa+ has not been widely released yet, so most users cannot try it.', 'en');
  nincs('Alexa+ is now widely available in the US.', 'en');
});

await t('🏷️ kitalált nevek: „Mistral Chat”, „NVIDIA Chat”, „Apple Intelligence+” — a valódi nevek (Vibe, ChatRTX, Chat with RTX) nem', () => {
  van('mistral-chat-nev', 'Open Mistral Chat and paste your list.', 'en');
  van('mistral-chat-nev', 'Nyisd meg a Mistral Chat alkalmazást.', 'hu');
  van('mistral-chat-nev', 'Abre Mistral Chat y pega tu lista.', 'es');
  nincs("Mistral's assistant is called Vibe (formerly Le Chat).", 'en');
  van('nvidia-chat-nev', 'Download NVIDIA Chat from the website.', 'en');
  van('nvidia-chat-nev', 'Telepítsd az NVIDIA Chat alkalmazást.', 'hu');
  nincs('Download NVIDIA ChatRTX from nvidia.com.', 'en');
  nincs('Nvidia ChatRTX runs locally on your RTX GPU.', 'en');
  nincs('NVIDIA Chat with RTX was renamed ChatRTX in 2024.', 'en');
  van('apple-intelligence-plusz', 'Apple Intelligence+ adds extra features for subscribers.', 'en');
  nincs('Apple Intelligence + Siri: what changed in iOS 18', 'en');
  nincs('Apple Intelligence is free on supported iPhones.', 'en');
});

await t('🆕 11-04-i leletek: régi ChatGPT-/Qwen-cím, ChatGPT „Team”, Apple Intelligence + „iOS 18” / „nem Pro iPhone” — fogja; a helyeset nem', () => {
  // régi címek — a 11-04-én élőben javított mondatokból
  van('chatgpt-regi-cim', 'Go to **chat.openai.com** in your browser, or open the ChatGPT app.', 'en');
  van('chatgpt-regi-cim', '💬 Példa: Látogasd meg a `https://chat.openai.com` oldalt.', 'hu');
  van('chatgpt-regi-cim', 'Una cuenta gratuita de ChatGPT (regístrate en chat.openai.com).', 'es');
  nincs('Go to **chatgpt.com** in your browser, or open the ChatGPT app.', 'en');
  van('qwen-regi-cim', 'Open tongyi.aliyun.com and sign in.', 'en');
  nincs('Open chat.qwen.ai and sign in.', 'en');
  // ChatGPT Team → Business
  van('chatgpt-team-csomag', 'Paid plans (Plus, Pro, Team) still get priority access in ChatGPT.', 'en');
  van('chatgpt-team-csomag', 'Creating one usually needs a paid ChatGPT plan (Plus, Team, or Enterprise).', 'en');
  van('chatgpt-team-csomag', 'If you use ChatGPT at work through a Team, Business, or Enterprise plan, the admin side changed.', 'en');
  van('chatgpt-team-csomag', 'A fizetős előfizetők – mindenki, aki ChatGPT Plus, Pro, Team vagy Enterprise csomagot használ – nem látják.', 'hu');
  van('chatgpt-team-csomag', 'Los suscriptores de ChatGPT Plus, Pro, Team o Enterprise no los verán.', 'es');
  nincs('Paid plans (Plus, Pro, Business) still get priority access in ChatGPT.', 'en');
  nincs('ChatGPT Team was renamed ChatGPT Business in August 2025.', 'en');
  nincs('To use it you need a paid Claude Pro, Max, Team or Enterprise plan. ChatGPT is different.', 'en');
  nincs('Your team plans its week in ChatGPT.', 'en');
  // Apple Intelligence + „iOS 18” (feltételként)
  van('apple-intelligence-ios-18', "You'll need an iPhone running iOS 18 to use Apple Intelligence.", 'en');
  van('apple-intelligence-ios-18', 'Az Apple Intelligence-hez iOS 18 kell.', 'hu');
  van('apple-intelligence-ios-18', 'Para Apple Intelligence necesitas iOS 18 en tu iPhone.', 'es');
  nincs("You'll need an iPhone running iOS 18.1 to use Apple Intelligence.", 'en');
  nincs('Apple Intelligence + Siri: what changed in iOS 18', 'en');
  nincs('You need iOS 18 for the new Photos layout.', 'en');
  // „nem Pro iPhone”
  van('apple-intelligence-nem-pro-iphone', '**Using a non-Pro iPhone model:** Apple Intelligence only works on iPhone 15 Pro and newer models.', 'en');
  van('apple-intelligence-nem-pro-iphone', 'Nem Pro iPhone-modellt használsz: az Apple Intelligence csak az iPhone 15 Pro-n működik.', 'hu');
  van('apple-intelligence-nem-pro-iphone', 'Usar un modelo de iPhone que no sea Pro: Apple Intelligence solo funciona en el iPhone 15 Pro.', 'es');
  nincs("**Using an iPhone that doesn't support Apple Intelligence:** Apple Intelligence only works on iPhone 15 Pro and newer.", 'en');
});

await t('🚦 tevedesJelzes(): az ellenőrzőnek KNOWN_FALSE_CLAIM + angol javítási útmutatás; tiszta szövegre null', () => {
  const j = tevedesJelzes('# Title\n\nGo to chat.openai.com and sign in.', 'en');
  assert.match(j, /^KNOWN_FALSE_CLAIM: 1 /);
  assert.match(j, /chatgpt\.com/, 'a javítási útmutatás hiányzik');
  assert.equal(tevedesJelzes('# Title\n\nGo to chatgpt.com and sign in.', 'en'), null);
  assert.equal(tevedesJelzes('', 'en'), null);
  for (const x of TEVEDESEK.filter(e => /^(chatgpt|qwen|apple-intelligence-(ios|nem))/.test(e.id))) assert.ok(x.javitas, x.id + ': nincs angol javitas');
});

await t('🔌 az ellenőrző ELUTASÍT ismert tévedésnél: importálja és meghívja a kaput, a kód blokkoló', async () => {
  const src = readFileSync(join(ROOT, 'agents', 'ellenorzo', 'agent.js'), 'utf-8');
  assert.ok(src.includes("import { tevedesJelzes } from '../../core/ismert-tevedesek.js';"), 'az ellenőrző nem importálja a kaput');
  assert.match(src, /const tev = tevedesJelzes\(articleMarkdown, 'en'\);\s*if \(tev\) issues\.push\(tev\);/, 'az ellenőrző nem hívja meg a kaput');
  const { isBlocking } = await import('./auto-check-codes.js');
  assert.ok(isBlocking(tevedesJelzes('Go to chat.openai.com.', 'en')), 'a KNOWN_FALSE_CLAIM nem blokkol');
});

await t('📱 „iOS 19” — fogja; a 18→26 számozás-váltást magyarázó mondat és az iOS 18.1 nem', () => {
  van('ios-19', 'Update your iPhone to iOS 19 first.', 'en');
  van('ios-19', 'Először frissíts iOS 19-re.', 'hu');
  van('ios-19', 'Actualiza a iOS 19 antes de empezar.', 'es');
  nincs('Apple went from iOS 18 straight to iOS 26, so there is no iOS 19.', 'en');
  nincs('Requires iOS 18.1 or later.', 'en');
  nincs('Works on iOS 190 devices.', 'en');
});

await t('🪦 „megszűnt”: Le Chat / GPT Store / OpenAI Playground — fogja mindhárom nyelven; a használati mondatot és az átnevezést nem', () => {
  van('le-chat-megszunt', 'Mistral discontinued Le Chat earlier this year.', 'en');
  van('le-chat-megszunt', 'A Le Chat megszűnt, ezért mást használj.', 'hu');
  van('le-chat-megszunt', 'Le Chat fue descontinuado, así que usa otra herramienta.', 'es');
  nincs('Le Chat was renamed Vibe; the app was not discontinued.', 'en');
  nincs('Open Le Chat and start a new conversation.', 'en');
  nincs('Abre Le Chat y empieza una conversación.', 'es');
  van('gpt-store-megszunt', 'OpenAI shut down the GPT Store in 2025.', 'en');
  van('gpt-store-megszunt', 'A GPT Store bezárt.', 'hu');
  van('gpt-store-megszunt', 'La GPT Store cerró en 2025.', 'es');
  nincs('Browse the GPT Store to find a custom GPT.', 'en');
  nincs('A GPT Store-ban keress egy egyedi GPT-t.', 'hu');
  van('openai-playground-megszunt', 'OpenAI retired the Playground, so use the API directly.', 'en');
  van('openai-playground-megszunt', 'Az OpenAI megszüntette a Playgroundot.', 'hu');
  van('openai-playground-megszunt', 'El Playground de OpenAI ya no existe.', 'es');
  // a „Playground” önmagában a Picsart AI Playground is lehet
  nincs('Picsart AI Playground was discontinued in some regions.', 'en');
  nincs('Open the OpenAI Playground at platform.openai.com/playground.', 'en');
});

await t('🍎 Apple Intelligence „csak angolul (US)” — fogja (a lépés-mondatot is); a Google-funkció igaz „csak angol” mondatát nem', () => {
  van('apple-intelligence-csak-angol', 'Apple Intelligence only works when your device language is set to English (US).', 'en');
  van('apple-intelligence-csak-angol', 'Turn on Apple Intelligence in Settings.\nTap iPhone Language and select English (US).', 'en');
  van('apple-intelligence-csak-angol', '## Step 2 — Set language to English (US)\nApple Intelligence needs it.', 'en');
  van('apple-intelligence-csak-angol', 'Az Apple Intelligence csak akkor működik, ha a készülék nyelve angol (amerikai).', 'hu');
  van('apple-intelligence-csak-angol', 'Apple Intelligence requiere que el idioma del dispositivo esté configurado en inglés (EE. UU.).', 'es');
  // Apple Intelligence nélküli szöveg: a Gmail „Help me write” valóban csak angolul indult (10-31-i hír)
  nincs('To use Help me write in Gmail, set your language to English (US).', 'en');
  nincs("Google Slides' new feature is only available in English for now.", 'en');
  nincs('A Google Diák új funkciója egyelőre csak angolul érhető el.', 'hu');
  nincs('Apple Intelligence works in many languages, including Hungarian and Spanish.', 'en');
  nincs('Az Apple Intelligence magyarul is elérhető.', 'hu');
});

await t('🧾 minden tévedésnek van legalább egy pozitív példája ebben a tesztben', () => {
  const hiany = TEVEDESEK.map(x => x.id).filter(id => !lefedett.has(id));
  assert.deepEqual(hiany, [], 'pozitív példa nélküli tévedés: ' + hiany.join(', '));
});

await t('✂️ mondatbontás: az „EE. UU.” és a „U.S.” nem vág; a záró idézőjel utáni mondat külön; a ** kiemelés kimarad', () => {
  assert.deepEqual(mondatokra('Configura el idioma en inglés (EE. UU.). Ve a Ajustes ahora.'),
    ['Configura el idioma en inglés (EE. UU.).', 'Ve a Ajustes ahora.']);
  assert.deepEqual(mondatokra('Say "Alexa, good morning." Alexa+ is a paid subscription tier.'),
    ['Say "Alexa, good morning."', 'Alexa+ is a paid subscription tier.']);
  assert.deepEqual(mondatokra('Set your device language to **English (US)**.\n\nNext line.'),
    ['Set your device language to English (US).', 'Next line.']);
  assert.equal(mondatokra('It works in the U.S. Today it is free.').length, 1, 'a U.S. rövidítés után nem vágunk (kis kár: két mondat egyben)');
  assert.deepEqual(mondatokra(''), []);
  assert.deepEqual(mondatokra(null), []);
});

await t('🛡️ ujTevedesek: csak az ÚJ tévedés állítja meg a javítást (a meglévő, változatlan vagy eltávolított nem)', () => {
  const eredeti = 'Open Le Chat and paste your notes.\nIt summarizes them in seconds.';
  const rossz = 'Mistral discontinued Le Chat, so use another assistant.\nIt summarizes them in seconds.';
  const uj = ujTevedesek(eredeti, rossz, 'en');
  assert.equal(uj.length, 1);
  assert.equal(uj[0].id, 'le-chat-megszunt');
  assert.match(uj[0].mondat, /discontinued Le Chat/);
  // a már meglévő tévedést a javítás nem rontja → mehet (a javítás nem felel a régi hibáért)
  const regiHiba = 'Download NVIDIA Chat from the website.\nIt runs locally.';
  assert.deepEqual(ujTevedesek(regiHiba, regiHiba + '\nIt needs an RTX GPU.', 'en'), []);
  // a javítás KIVESZI a tévedést → mehet
  assert.deepEqual(ujTevedesek(regiHiba, 'Download NVIDIA ChatRTX from the website.\nIt runs locally.', 'en'), []);
  assert.deepEqual(ujTevedesek('', '', 'en'), []);
});

await t('🧠 tevesLecke: a cáfolt állítást hordozó és a megerősítetten élő terméket tiltó lecke téves; a többi nem', () => {
  for (const s of [
    'Avoid stating (may be removed/false): Le Chat also has mobile apps; either path works fine',
    'Avoid stating (may be removed/false): ChatRTX application (entire tool name - rebranded)',
    'Avoid stating (may be removed/false): "Le Chat" as a listed example of available AI assistants',
    "Avoid stating (may be removed/false): The guide treats 'Alexa+' as a free feature, but Alexa+ is actually Amazon's paid subscription service (roughly $19.99/month).",
    'Mistral discontinued Le Chat in 2025, so do not recommend it.',
    'Do not claim this exists (may be removed): the GPT Store, which OpenAI shut down.'
  ]) assert.equal(tevesLecke(s), true, 'átengedte: ' + s.slice(0, 70));
  for (const s of [
    // az ember által megerősített „nem létezik” leckék (2026-10-29) MARADNAK
    "Do not claim this exists (may be removed): Apple Calendar does not have an AI summarization feature with a 'Summarize' button.",
    'Do not claim this exists (may be removed): The entire guide describes a feature that does not exist. Apple Intelligence is not integrated into the Home app.',
    'Use US spelling: color, organize, center.',
    'Le Chat was renamed Vibe; mention both names the first time.',
    // 2026-11-02 (kód-átnézés): a kitalált név ELLENI figyelmeztetés helyes lecke — eddig kiesett
    'Never write "Mistral Chat" — the assistant is Vibe (formerly Le Chat).',
    "Don't call it NVIDIA Chat: the app is ChatRTX.",
    'Ne írd, hogy Mistral Chat — a neve Vibe.',
    '', null
  ]) assert.equal(tevesLecke(s), false, 'kiszűrte: ' + String(s).slice(0, 70));
  // …de a tiltás-forma NEM menti a nem-név tévedést, és az „Avoid stating” sem a kitalált nevet
  assert.equal(tevesLecke('Le Chat was discontinued — do not use it.'), true);
  assert.equal(tevesLecke('Avoid stating: Mistral Chat is the app name.'), true);
  assert.equal(tevesLecke('Use Mistral Chat for drafts.'), true);
});

await t('🅿️ Prime-kivétel: a SZOMSZÉD mondatban és kisbetűvel is számít; a „primero” nem Prime (kód-átnézés 11-02)', () => {
  nincs('Alexa+ is a paid subscription. It is included with Prime at no extra cost.', 'en');
  nincs('Alexa+ is included with Prime. Without it, Alexa+ is a paid subscription.', 'en');
  nincs('Az Alexa+ fizetős szolgáltatás, prime-tagoknak ingyenes.', 'hu');
  van('alexa-plus-fizetos', 'Alexa+ is a paid subscription.', 'en');
  van('alexa-plus-fizetos', 'Usa el primero. Alexa+ es una suscripción de pago.', 'es');
  van('alexa-plus-fizetos', 'Alexa+ is a paid subscription.\nIt has new voices.\nIt is included with Prime.', 'en');
});

// ── (b) MEMÓRIA-SZŰRŐ — saját ideiglenes táron ────────────────────
// ⚠️ A környezeti változókat a DINAMIKUS import ELŐTT kell beállítani: a tár útvonala a modul betöltésekor dől el
// (lásd core/lessons-block.test.js — ott az első változat épp emiatt írt az éles tárba).
const MUNKA = join(tmpdir(), 'aiworld-ismert-tevedesek-teszt-' + process.pid);
mkdirSync(MUNKA, { recursive: true });
process.env.MEMORY_STORE_PATH = join(MUNKA, 'store.json');
process.env.MEMORY_EMBED_CACHE_PATH = join(MUNKA, 'memory-embeddings.json');
process.env.SEMANTIC_GUARD_PATH = join(MUNKA, 'semantic-guard.json');
const JELOLO = 'ZZTESZT-ismert-tevedes';
const most = new Date().toISOString();
const elem = (id, scope, text) => ({ id, scope, text, tags: [], created: most, lastAccessed: most, accessCount: 0, salience: 1, tier: 'hot' });
// a régi (szűrő előtti) tár: benne egy téves és egy jó lecke ugyanabban a scope-ban
writeFileSync(process.env.MEMORY_STORE_PATH, JSON.stringify({ _meta: {}, items: [
  elem('m1', 'zzteszt-agent', `Avoid stating (may be removed/false): Le Chat also has mobile apps (${JELOLO}-regi)`),
  elem('m2', 'zzteszt-agent', `Le Chat chat tip: paste the article text when the link does not load (${JELOLO}-jo)`),
  elem('m3', 'shared', `Mistral discontinued Le Chat, avoid it (${JELOLO}-shared)`)
] }, null, 2));

try {
  const mm = await import('./memory-manager.js');

  await t('💾 remember(): a téves leckét nem menti, a jót igen', () => {
    mm.remember('zzteszt-agent', `Avoid stating (may be removed/false): ChatRTX application (${JELOLO}-uj)`);
    mm.remember('zzteszt-agent', `Alexa+ is a paid subscription service (${JELOLO}-uj2)`);
    mm.remember('zzteszt-agent', `Use the official product name from the source (${JELOLO}-uj-jo)`);
    const items = JSON.parse(readFileSync(process.env.MEMORY_STORE_PATH, 'utf-8')).items.map(i => i.text);
    assert.ok(!items.some(x => x.includes(JELOLO + '-uj)') || x.includes(JELOLO + '-uj2')), 'a téves lecke bekerült a tárba');
    assert.ok(items.some(x => x.includes(JELOLO + '-uj-jo')), 'a jó lecke nem került be');
  });

  await t('🔎 recall() / list() / lessonsBlock(): a tárban már bent lévő téves lecke sem jön vissza', () => {
    const r = mm.recall('Le Chat mobile apps article', { scope: 'zzteszt-agent' }).map(x => x.text);
    assert.ok(r.some(x => x.includes(JELOLO + '-jo')), 'a jó lecke sem jött vissza (rossz a teszt)');
    assert.ok(!r.some(x => x.includes(JELOLO + '-regi')), 'recall() visszaadta a téves leckét');
    const l = mm.list({ scope: 'zzteszt-agent', limit: 50 }).map(x => x.text);
    assert.ok(!l.some(x => x.includes(JELOLO + '-regi')), 'list() visszaadta a téves leckét');
    assert.ok(!mm.list({ scope: 'shared', limit: 50 }).some(x => x.text.includes(JELOLO + '-shared')), 'list(shared) visszaadta a téves leckét');
    const blokk = mm.lessonsBlock('zzteszt-agent');
    assert.ok(blokk.includes(JELOLO + '-jo'), 'a jó lecke hiányzik a prompt-blokkból (rossz a teszt)');
    assert.ok(!blokk.includes(JELOLO + '-regi') && !blokk.includes(JELOLO + '-shared'), 'a téves lecke bekerült a promptba');
  });

  await t('🧭 recallSemantic(): a téves lecke a szemantikus keresésből sem jön vissza (ál-beágyazóval, hálózat nélkül)', async () => {
    const KULCSOK = ['le chat', 'mobile', 'article', 'link', 'product', 'name'];
    const embedFn = async s => { const x = String(s || '').toLowerCase(); const v = KULCSOK.map(k => (x.includes(k) ? 1 : 0)); v.push(0.01); return v; };
    const r = (await mm.recallSemantic('Le Chat mobile article link', { scope: 'zzteszt-agent', embedFn, provider: 'teszt' })).map(x => x.text);
    assert.ok(r.some(x => x.includes(JELOLO + '-jo')), 'a jó lecke sem jött vissza (rossz a teszt)');
    assert.ok(!r.some(x => x.includes(JELOLO + '-regi')), 'recallSemantic() visszaadta a téves leckét');
  });

  await t('🔌 a memory-manager minden úton szűr (mentés, kulcsszavas és szemantikus keresés, lista) — a név-tagadó szűrő mellett', () => {
    const src = readFileSync(join(ROOT, 'core', 'memory-manager.js'), 'utf-8');
    assert.match(src, /import \{ tevesLecke \} from '\.\/ismert-tevedesek\.js'/);
    assert.match(src, /if \(tevesLecke\(norm\)\) return;/, 'a mentés nem szűr');
    assert.ok((src.match(/!tevesLecke\(it\.text\)/g) || []).length >= 3, 'recall / recallSemantic / list közül valamelyik nem szűr');
    // a régi szűrő (core/lesson-filter.test.js) érintetlen
    assert.match(src, /if \(nevTagadoLecke\(norm\)\) return;/);
    assert.ok((src.match(/!nevTagadoLecke\(it\.text\)/g) || []).length >= 3);
  });
} finally {
  try { rmSync(MUNKA, { recursive: true, force: true }); } catch { /* takarítás nem kritikus */ }
}

await t('🔒 az éles memória érintetlen: a teszt jelölője nincs az éles tárban', () => {
  const eles = join(ROOT, 'memory', 'store.json');
  if (!existsSync(eles)) return;
  // bájt-összevetés helyett jelölő: a koordinátor / a CI közben jogosan írhatja az éles tárat
  assert.ok(!readFileSync(eles, 'utf-8').includes(JELOLO), '🔴 A TESZT AZ ÉLES memory/store.json-BA ÍRT!');
});

// ── (c) KORPUSZ: az élő cikkekben és fordításaikban 0 ismert tévedés ──
await t('📚 KORPUSZ: az élő cikkekben és fordításaikban (en/hu/es) nincs ismert tévedés', () => {
  const ADIR = join(ROOT, 'content', 'articles'), TDIR = join(ROOT, 'content', 'translations');
  const talalat = [];
  let cikk = 0;
  for (const f of readdirSync(ADIR).filter(x => x.endsWith('.json')).sort()) {
    const a = JSON.parse(readFileSync(join(ADIR, f), 'utf-8'));
    cikk++;
    // a _meta nem élő szöveg; minden más szöveges mező angol (article_markdown, original_title)
    const darabok = Object.entries(a).filter(([k, v]) => k !== '_meta' && typeof v === 'string').map(([, v]) => ['en', v]);
    if (existsSync(join(TDIR, f))) {
      const tr = JSON.parse(readFileSync(join(TDIR, f), 'utf-8'));
      for (const ny of ['hu', 'es']) if (typeof tr[ny] === 'string') darabok.push([ny, tr[ny]]);
    }
    for (const [ny, s] of darabok) for (const x of tevedesekASzovegben(s, ny)) talalat.push(`${f} [${ny}] ${x.id}: „${x.mondat.slice(0, 160)}”`);
  }
  assert.ok(cikk > 100, 'gyanúsan kevés cikk: ' + cikk);
  assert.equal(talalat.length, 0, `${talalat.length} ismert tévedés az élő szövegben:\n` + talalat.join('\n'));
});

console.log(`\n${bukott ? '❌' : '✅'} ismert-tevedesek.test: ${pass} sikeres, ${bukott} bukott`);
process.exit(bukott ? 1 : 0);
