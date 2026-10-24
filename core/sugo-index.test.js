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

// 6) letöltési hiba → üres lista, nem kivétel
{
  const rossz = async () => { throw new Error('hálózat'); };
  assert.deepEqual(await indexLetolt('openai', rossz), []);
  assert.deepEqual(await indexLetolt('ismeretlen', rossz), []);
  const ures = async () => ({ ok: false, status: 403, text: async () => '' });
  assert.deepEqual(await indexLetolt('claude', ures), []);
}

console.log('✅ sugo-index: rendben');
