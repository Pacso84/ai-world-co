// core/sugo-index.js — a hivatalos súgók cikklistája a „🔧 Ha elakadsz” dobozhoz (2026-10-24). Ingyenes, hálózat nélküli.
//
// A MÉRCE IRÁNYA: a veszély az, hogy (1) nem jóváhagyott oldal kerül forrásnak (pl. egy
// help.openai.com.evil.example), (2) rossz súgó jut egy eszközhöz, (3) egy letöltési hiba
// megállítja a futást.
import assert from 'node:assert/strict';
import { engedelyezett, szolgaltatok, sitemapCikkek, linkCikkek, listaCikkek, slugCim, indexLetolt, ENGEDELY, FORRASOK } from './sugo-index.js';

// 1) engedélylista — csak a user által jóváhagyott 7 szolgáltató (10-23), pontos előtaggal
for (const u of ['https://help.openai.com/en/articles/8555545-uploading-files', 'https://support.claude.com/en/articles/1-x',
  'https://support.google.com/gemini/answer/13594961', 'https://support.google.com/photos/answer/1',
  'https://support.microsoft.com/en-us/microsoft-copilot/x', 'https://help.mistral.ai/en/articles/1-x',
  'https://www.perplexity.ai/help-center/en/x'])   // 11-12: a Perplexity jóváhagyva (spec 4.1)
  assert.ok(engedelyezett(u), 'el kellett volna fogadni: ' + u);
for (const u of ['https://help.openai.com.evil.example/en/articles/1', 'http://help.openai.com/en/articles/1',
  'https://support.google.com/youtube/answer/1', 'https://example.com/help.openai.com/', '', null])
  assert.ok(!engedelyezett(u), 'nem lett volna szabad elfogadni: ' + u);
assert.ok(ENGEDELY.every(p => p.startsWith('https://') && p.endsWith('/')));

// új előtagok (spec 4.1, user 11-12)
for (const u of ['https://www.perplexity.ai/help-center/en/articles/1-x', 'https://docs.x.ai/grok/x', 'https://docs.x.ai/x-subscription/x',
  'https://docs.github.com/en/copilot/get-started', 'https://huggingface.co/docs/hub', 'https://docs.cohere.com/docs/x',
  'https://duckduckgo.com/duckduckgo-help-pages/ai-features/x', 'https://proton.me/support/lumo-x', 'https://docs.z.ai/guides/x',
  'https://elevenlabs.io/docs/overview/x', 'https://api-docs.deepseek.com/news/x', 'https://platform.kimi.ai/docs/x',
  'https://platform.minimax.io/docs/x', 'https://brave.com/leo/'])
  assert.ok(engedelyezett(u), 'új jóváhagyott előtag: ' + u);
for (const u of ['https://docs.x.ai/developers/x', 'https://docs.x.ai/console/x', 'https://docs.github.com/en/actions/x', 'https://brave.com/search/'])
  assert.ok(!engedelyezett(u), 'jóváhagyáson kívüli rész: ' + u);

// lista-forrás (GitHub pagelist: soronként egy útvonal)
assert.deepEqual(listaCikkek('/en/copilot/get-started\n/en/actions/x\n/en/copilot/how-tos/chat\n', 'https://docs.github.com', /^\/en\/copilot\//).map(c => c.url),
  ['https://docs.github.com/en/copilot/get-started', 'https://docs.github.com/en/copilot/how-tos/chat']);
// kizáró minta minden forrásfajtánál
assert.equal(sitemapCikkek('<loc>https://docs.z.ai/api-reference/a</loc><loc>https://docs.z.ai/guides/b</loc>', /docs\.z\.ai\//, /\/api-reference\//).length, 1);
assert.equal(linkCikkek('<a href="/docs/_mintlify/x">Assets x</a><a href="/docs/guide/chat">Chat guide</a>', 'https://platform.kimi.ai', /^\/docs\//, /\/_mintlify\//).length, 1);
assert.equal(listaCikkek('/en/copilot/a\n/en/copilot/api/b\n', 'https://docs.github.com', /^\/en\/copilot\//, /\/api\//).length, 1);
// 200-as HTML-hibalap sitemap helyett → 0 cikk, nincs kivétel
const hibalap = async () => ({ ok: true, text: async () => '<html><title>Just a moment...</title></html>' });
assert.deepEqual(await indexLetolt('perplexity', hibalap), []);
// egy-lapos forrás: letöltés nélkül az egy cikk
let hivas = 0;
assert.deepEqual(await indexLetolt('braveleo', async () => { hivas++; throw new Error('nem kéne'); }), [{ url: 'https://brave.com/leo/', cim: 'Brave Leo' }]);
assert.equal(hivas, 0);
// minden FORRASOK-elem forrás-URL-je https, és minden elem mintája RegExp
for (const [k, lista] of Object.entries(FORRASOK)) for (const f of lista) {
  assert.ok(String(f.sitemap || f.lap || f.lista || f.egy).startsWith('https://'), k);
  assert.ok(f.minta instanceof RegExp, k);
  if (f.egy) assert.ok(engedelyezett(f.egy), k + ': az egy-lapos forrás URL-je nincs az engedélylistán: ' + f.egy);   // 11-14
}
// mind a 13 új kulcs megvan (a letöltési cím egy index-lap, nem cikk → az engedélylistát a cikk-URL-ek tesztelik)
for (const k of ['perplexity', 'grok', 'githubcopilot', 'huggingface', 'cohere', 'duckai', 'lumo', 'zai', 'elevenlabs', 'deepseek', 'kimi', 'minimax', 'braveleo'])
  assert.ok(Array.isArray(FORRASOK[k]) && FORRASOK[k].length, 'hiányzó új forrás: ' + k);

// 2) eszköz → súgó
assert.deepEqual(szolgaltatok('ChatGPT', 'OpenAI'), ['openai']);
assert.deepEqual(szolgaltatok('Claude', 'Anthropic'), ['claude']);
assert.deepEqual(szolgaltatok('Gemini', 'Google'), ['gemini']);
assert.deepEqual(szolgaltatok('Google Photos', 'Google'), ['photos']);
assert.deepEqual(szolgaltatok('Copilot', 'Microsoft'), ['microsoft']);
assert.deepEqual(szolgaltatok('Microsoft 365 Copilot', 'Microsoft'), ['microsoft']);
assert.deepEqual(szolgaltatok('Le Chat', 'Mistral'), ['mistral']);
assert.deepEqual(szolgaltatok('', ''), ['openai', 'gemini', 'claude'], 'eszköz nélküli útmutató: a nagy asszisztensek súgója');
assert.deepEqual(szolgaltatok('Perplexity', 'Perplexity'), [], 'a doboz-bővítés egy későbbi rész feladata → most nincs doboz');
assert.deepEqual(szolgaltatok('GitHub Copilot', 'GitHub'), [], 'a GitHub Copilot NEM a Microsoft-súgó (jóváhagyás kell)');
assert.deepEqual(szolgaltatok('Qwen', 'Alibaba'), []);

// 3) slug → olvasható cím
assert.equal(slugCim('https://help.openai.com/en/articles/8555545-uploading-files-and-audio-to-chatgpt'), 'Uploading files and audio to chatgpt');
assert.equal(slugCim('https://support.microsoft.com/en-us/microsoft-copilot/conversation-history-in-microsoft-copilot'), 'Conversation history in microsoft copilot');

// 4) sitemap-elemző: csak a mintára illő, egyedi, engedélyezett cím
{
  const xml = `<urlset><url><loc>https://support.claude.com/en/articles/123-how-to-upload-files</loc></url>
    <url><loc>https://support.claude.com/fr/articles/123-televerser</loc></url>
    <url><loc>https://support.claude.com/en/articles/123-how-to-upload-files</loc></url>
    <url><loc>https://evil.example/en/articles/9-x</loc></url></urlset>`;
  assert.deepEqual(sitemapCikkek(xml, /\/en\/articles\//), [{ url: 'https://support.claude.com/en/articles/123-how-to-upload-files', cim: 'How to upload files' }]);
}

// 5) link-elemző: relatív → abszolút, a link szövege a cím, külső link és duplikátum nincs
{
  const html = `<a href="/gemini/answer/13594961?hl=en">Upload files to Gemini</a> <a href="/gemini/answer/13594961?hl=en&co=x">dup</a>
    <a href="https://other.example/gemini/answer/1">külső</a> <a href="/gemini/answer/15000000"><span>Fix   problems</span> with Gems</a>`;
  assert.deepEqual(linkCikkek(html, 'https://support.google.com', /^\/gemini\/answer\/\d+/), [
    { url: 'https://support.google.com/gemini/answer/13594961', cim: 'Upload files to Gemini' },
    { url: 'https://support.google.com/gemini/answer/15000000', cim: 'Fix problems with Gems' }
  ]);
}

// 5b) CÍMEK (független átnézés 10-24): az OpenAI-gyűjtőlap linkje „Cím + Leírás” → a jelölt-pontozás a leírás
// szavaira is illett (pl. CarPlay-cikk a „resume” szóra). Csak a cím kell.
{
  const A = 'https://help.openai.com', M = /^\/en\/articles\/\d+/;
  // blokkelemes horgony: az első címsor (h1–h6) a cím
  assert.deepEqual(linkCikkek('<a href="/en/articles/8555545-uploading-files"><div><h3>Uploading files and audio to ChatGPT</h3><p>Upload documents, spreadsheets, presentations</p></div></a>', A, M),
    [{ url: 'https://help.openai.com/en/articles/8555545-uploading-files', cim: 'Uploading files and audio to ChatGPT' }]);
  // címsor nélkül: az első (belső) blokk
  assert.equal(linkCikkek('<a href="/en/articles/1-x"><div><div>Chat and file retention</div><div>Understand how chats are kept</div></div></a>', A, M)[0].cim, 'Chat and file retention');
  // sima szöveg >80 karakter: vágás az első mondatkezdő nagybetűs szónál (≥3 szó után)
  const vag = t => linkCikkek(`<a href="/en/articles/2-x">${t}</a>`, A, M)[0].cim;
  assert.equal(vag('Uploading files and audio to ChatGPT Upload documents, spreadsheets, presentations and more to ChatGPT'), 'Uploading files and audio to ChatGPT');
  assert.equal(vag('ChatGPT capabilities overview Learn about ChatGPT&#8217;s tools for working with files, images and more'), 'ChatGPT capabilities overview');
  assert.equal(vag('Using ChatGPT in CarPlay Use ChatGPT in Apple CarPlay to start or resume conversations hands-free'), 'Using ChatGPT in CarPlay');
  assert.equal(vag('Using ChatGPT with Apple Music Learn how to connect your Apple Music account and build playlists'), 'Using ChatGPT with Apple Music',
    'két nagybetűs szó egymás után (Apple Music) = név, nem mondatkezdés');
  assert.equal(vag('Use Gemini Apps with Google Workspace'), 'Use Gemini Apps with Google Workspace', '80 karakter alatt nincs vágás');
  // általános első linkszöveg („Learn more”) → a később jövő valódi cím felülírja (a sorrend marad)
  const G = 'https://support.google.com', GM = /^\/gemini\/answer\/\d+$/;
  assert.deepEqual(linkCikkek('<a href="/gemini/answer/123?hl=en">Learn more</a><a href="/gemini/answer/9">Use Gems</a>' +
    '<a href="/gemini/answer/123">Generate &amp; edit images &quot;fast&quot;</a><a href="/gemini/answer/9">Read more</a>', G, GM), [
    { url: 'https://support.google.com/gemini/answer/123', cim: 'Generate & edit images "fast"' },
    { url: 'https://support.google.com/gemini/answer/9', cim: 'Use Gems' }
  ]);
  for (const g of ['Read more', 'Here', 'Learn more about this'])
    assert.equal(linkCikkek(`<a href="/gemini/answer/5">${g}</a><a href="/gemini/answer/5">Manage your Gemini activity</a>`, G, GM)[0].cim, 'Manage your Gemini activity', g);
  // HTML-entitások
  assert.equal(vag('Gemini&#8217;s &rsquo;new&rsquo; tools&nbsp;for &#x27;you&#39; &amp; me'), 'Gemini’s ’new’ tools for \'you\' & me');
}
// slugCim: a Microsoft-cikkek végén álló GUID nem a cím része
assert.equal(slugCim('https://support.microsoft.com/en-us/office/use-copilot-in-word-2c3e4f5a-1b2c-3d4e-5f6a-7b8c9d0e1f2a'), 'Use copilot in word');
assert.equal(slugCim('https://support.microsoft.com/en-us/topic/copilot-faq-2C3E4F5A-1B2C-4D5E-8F90-1234567890AB'), 'Copilot faq');
// engedélylista: normalizált URL (független átnézés 10-24) — a „..” szakasz kiléphetne az engedélyezett előtagból
for (const u of ['https://support.google.com/gemini/../accounts/x', 'https://support.google.com/gemini/x/../answer/1', 'https://support.google.com/gemini/%2e%2e/accounts/x',
  'https://help.openai.com:8443/en/articles/1', 'https://user@help.openai.com/en/articles/1'])
  assert.ok(!engedelyezett(u), 'nem lett volna szabad elfogadni: ' + u);

// 6) letöltési hiba → üres lista, nem kivétel
{
  const rossz = async () => { throw new Error('hálózat'); };
  assert.deepEqual(await indexLetolt('openai', rossz), []);
  assert.deepEqual(await indexLetolt('ismeretlen', rossz), []);
  const ures = async () => ({ ok: false, status: 403, text: async () => '' });
  assert.deepEqual(await indexLetolt('claude', ures), []);
}

// 11-05: MINDEN szolgáltatónak, amit a szolgaltatok() visszaadhat, LEGYEN letöltési forrása. A 'notebooklm' be volt
// kötve, forrása nem volt → üres lista, a „Ha elakadsz” doboz minden NotebookLM-útmutatónál némán kimaradt
// (a riport naponta „kimaradt: index ×3”-at írt, ami letöltési hibának látszott).
{
  const { FORRASOK } = await import('./sugo-index.js');
  const eszkozok = [['', ''], ['ChatGPT', 'OpenAI'], ['Claude', 'Anthropic'], ['Gemini', 'Google'], ['NotebookLM', 'Google'],
    ['Gemini Notebook', 'Google'], ['Google Photos', 'Google'], ['Copilot', 'Microsoft'], ['Le Chat', 'Mistral']];
  for (const [t, c] of eszkozok) for (const s of szolgaltatok(t, c)) {
    assert.ok(Array.isArray(FORRASOK[s]) && FORRASOK[s].length, `🔴 a(z) „${s}” súgónak nincs letöltési forrása (${t || 'üres'})`);
    for (const f of FORRASOK[s]) assert.ok(engedelyezett(f.sitemap || f.lap), `🔴 a(z) „${s}” forrása nincs az engedélylistán: ${f.sitemap || f.lap}`);
  }
  // a Gemini Notebook (volt NotebookLM, 2026-07-16) súgója — a régi cím ide irányít
  assert.deepEqual(szolgaltatok('Gemini Notebook', 'Google'), ['notebooklm']);
  assert.ok(engedelyezett('https://support.google.com/gemininotebook/answer/16206563'));
  const lap = '<a href="/gemininotebook/answer/16206563?hl=en&amp;ref_topic=1">Create a notebook in Gemini Notebook</a>';
  assert.deepEqual(linkCikkek(lap, 'https://support.google.com', FORRASOK.notebooklm[0].minta),
    [{ url: 'https://support.google.com/gemininotebook/answer/16206563', cim: 'Create a notebook in Gemini Notebook' }]);
}

// 11-14 (tényközpont 1a, Task 4): indexLetolt végponttól végpontig egy `lista` forrásra (githubcopilot) — hamis letöltéssel.
// A darabszám és az URL-ek pontosan: a nem-copilot sor és a duplikátum kiesik, a lekérdezés-rész levágva.
{
  const kert = [];
  const fetchFn = async url => {
    kert.push(url);
    return { ok: true, text: async () => ['/en/copilot/get-started', '/en/actions/workflows', '/en/copilot/how-tos/chat',
      '/en/copilot/get-started', '/en/copilot/concepts/agents?tool=vscode', 'nem-utvonal', ''].join('\n') };
  };
  const ki = await indexLetolt('githubcopilot', fetchFn);
  assert.deepEqual(kert, [FORRASOK.githubcopilot[0].lista], 'egyetlen letöltés: a pagelist');
  assert.deepEqual(ki.map(c => c.url), ['https://docs.github.com/en/copilot/get-started', 'https://docs.github.com/en/copilot/how-tos/chat',
    'https://docs.github.com/en/copilot/concepts/agents']);
  assert.equal(ki.length, 3);
  assert.equal(ki[1].cim, 'Chat');
}

// 11-14 (Task 4): a Duck.ai index CSAK AI-témájú cikkeket ad (a böngésző/VPN/adatvédelem egyéb cikkei nem).
// A fixtúra a DuckDuckGo-súgó sitemapjának valódi URL-alakjai (csak címek, szöveg nincs).
{
  const D = 'https://duckduckgo.com/duckduckgo-help-pages/';
  const ai = ['ai-features/opting-out-of-ai', 'ai-features/about-noaiduckduckgocom', 'duckai', 'duckai/chat-models', 'duckai/usage-limits',
    'privacy-pro/duckai', 'privacy-pro/duck-ai/does-duckai-support-file-uploads', 'choosing-the-best-model-for-my-duckai-chat', 'optional-ai',
    'what-information-does-duckai-share-with-model-providers', 'how-does-duckduckgo-run-duckai-experiments-while-protecting-my-privacy',
    'results/ai-assisted-answers'];
  const nemAi = ['privacy-pro/vpn/how-to-set-up-vpn', 'privacy-pro/personal-information-removal/what-is-pir', 'email-protection/duck-addresses/x',
    'sync-and-backup/enable-sync-and-backup', 'results/duckassistbot', 'results/syntax', 'web-browsing-privacy/', 'settings/save', 'threat-protection/scam-blocker'];
  const xml = '<urlset>' + [...ai, ...nemAi].map(u => `<url><loc>${D}${u}</loc></url>`).join('') + '</urlset>';
  const fetchFn = async () => ({ ok: true, text: async () => xml });
  const ki = (await indexLetolt('duckai', fetchFn)).map(c => c.url);
  assert.deepEqual(ki, ai.map(u => D + u), 'a Duck.ai-index pontosan az AI-témájú cikkek');
}

// 11-14 (Task 4): a Lumo index a proton.me/support sitemapból csak a Lumo-cikkeket (angol útvonal, nincs más Proton-termék, nincs nyelvi változat).
{
  const P = 'https://proton.me/';
  const lumo = ['support/lumo', 'support/lumo-getting-started', 'support/lumo-memory', 'support/custom-lumos', 'support/apertus-lumo', 'support/connect-slack-lumo'];
  const mas = ['support/mail/addresses-identities', 'support/drive/albums', 'support/account/manage-account/data-recovery', 'support/vpn-setup-linux',
    'de/support/lumo', 'ja/support/lumo-memory', 'support/account/lumo-nem-cikk/valami', 'lumo/pricing', 'blog/lumo-security-model'];
  const xml = '<urlset>' + [...lumo, ...mas].map(u => `<url><loc>${P}${u}</loc><lastmod>2026-10-09T01:58:19.000Z</lastmod></url>`).join('') + '</urlset>';
  const fetchFn = async () => ({ ok: true, text: async () => xml });
  assert.deepEqual((await indexLetolt('lumo', fetchFn)).map(c => c.url), lumo.map(u => P + u), 'a Lumo-index pontosan a Lumo-cikkek');
}

// 11-14 (záró átnézés, I-3): a proton.me/support/ előtag nem hagyja jóvá az egész Proton-súgót — csak a Lumo-cikkeket
// (a spec 4.1 csak a Lumót engedte). Nem Lumo Proton-cikk, nyelvi változat, részszó („columbus”) nem mehet át.
{
  for (const ut of ['support/lumo', 'support/lumo-getting-started', 'support/custom-lumos', 'support/apertus-lumo', 'support/connect-slack-lumo', 'support/lumo-memory'])
    assert.ok(engedelyezett('https://proton.me/' + ut), 'Lumo-cikk: ' + ut);
  for (const ut of ['support/pass-getting-started', 'support/vpn-setup-linux', 'support/mail/x', 'support/mail/lumo-x', 'de/support/lumo', 'support/columbus-day',
    'support/lumos-x/y', 'support/xlumo', 'support/lumox', 'support/', 'support', 'support/sitemap.xml', 'lumo/pricing', 'support/pass-lumo/x'])
    assert.ok(!engedelyezett('https://proton.me/' + ut), 'nem Lumo-cikk, nem mehet át: ' + ut);
  assert.ok(!engedelyezett('https://proton.me/support/lumo/../pass-x'), '„..” szakasz');
  // a Lumo-index mintája ugyanaz a szabály (DRY): a FORRASOK.lumo.minta és az engedélyezett() egyet mond
  for (const ut of ['support/lumo-x', 'support/custom-lumos', 'support/columbus-day', 'support/xlumo', 'support/pass-x'])
    assert.equal(FORRASOK.lumo[0].minta.test('https://proton.me/' + ut), engedelyezett('https://proton.me/' + ut), 'minta ≠ engedélyezett: ' + ut);
  // a sitemap-URL (forrás, nem cikk) nem megy át az engedelyezett()-en — az indexLetolt nem is hívja rá
  assert.ok(!engedelyezett(FORRASOK.lumo[0].sitemap));
}

console.log('✅ sugo-index: rendben');
