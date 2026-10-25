// core/sugo-index.js — a hivatalos súgók cikklistája a „🔧 Ha elakadsz” dobozhoz (2026-10-24). Ingyenes, hálózat nélküli.
//
// A MÉRCE IRÁNYA: a veszély az, hogy (1) nem jóváhagyott oldal kerül forrásnak (pl. egy
// help.openai.com.evil.example), (2) rossz súgó jut egy eszközhöz, (3) egy letöltési hiba
// megállítja a futást.
import assert from 'node:assert/strict';
import { engedelyezett, szolgaltatok, sitemapCikkek, linkCikkek, slugCim, indexLetolt, ENGEDELY } from './sugo-index.js';

// 1) engedélylista — csak a user által jóváhagyott 7 szolgáltató (10-23), pontos előtaggal
for (const u of ['https://help.openai.com/en/articles/8555545-uploading-files', 'https://support.claude.com/en/articles/1-x',
  'https://support.google.com/gemini/answer/13594961', 'https://support.google.com/photos/answer/1',
  'https://support.microsoft.com/en-us/microsoft-copilot/x', 'https://help.mistral.ai/en/articles/1-x'])
  assert.ok(engedelyezett(u), 'el kellett volna fogadni: ' + u);
for (const u of ['https://help.openai.com.evil.example/en/articles/1', 'http://help.openai.com/en/articles/1',
  'https://support.google.com/youtube/answer/1', 'https://www.perplexity.ai/help-center/en/x', 'https://example.com/help.openai.com/', '', null])
  assert.ok(!engedelyezett(u), 'nem lett volna szabad elfogadni: ' + u);
assert.ok(ENGEDELY.every(p => p.startsWith('https://') && p.endsWith('/')));

// 2) eszköz → súgó
assert.deepEqual(szolgaltatok('ChatGPT', 'OpenAI'), ['openai']);
assert.deepEqual(szolgaltatok('Claude', 'Anthropic'), ['claude']);
assert.deepEqual(szolgaltatok('Gemini', 'Google'), ['gemini']);
assert.deepEqual(szolgaltatok('Google Photos', 'Google'), ['photos']);
assert.deepEqual(szolgaltatok('Copilot', 'Microsoft'), ['microsoft']);
assert.deepEqual(szolgaltatok('Microsoft 365 Copilot', 'Microsoft'), ['microsoft']);
assert.deepEqual(szolgaltatok('Le Chat', 'Mistral'), ['mistral']);
assert.deepEqual(szolgaltatok('', ''), ['openai', 'gemini', 'claude'], 'eszköz nélküli útmutató: a nagy asszisztensek súgója');
assert.deepEqual(szolgaltatok('Perplexity', 'Perplexity'), [], 'a Perplexity 403-at ad → nincs doboz');
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

console.log('✅ sugo-index: rendben');
