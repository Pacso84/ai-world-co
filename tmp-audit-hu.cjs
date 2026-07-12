// TELJES HU-oldal audit: minden látható szöveg-elem átvizsgálása angol maradványra.
// Márkanevek/termékek fehérlistán. Kimenet: oldal + elem-osztály + gyanús szöveg.
const fs = require('fs');

const PAGES = ['index.html', 'tools.html', 'guides.html', 'start.html', 'glossary.html', 'wizard.html', 'about.html', 'archive.html', 'support.html'];
const WHITELIST = new RegExp('^(' + [
  'ChatGPT', 'Claude', 'Gemini', 'Copilot', 'GitHub Copilot', 'Grok', 'Le Chat', 'Meta AI', 'Alexa\\+?',
  'Apple Intelligence', 'Hugging Face', 'DeepSeek', 'Perplexity', 'Qwen( Chat)?', 'NotebookLM', 'NVIDIA ChatRTX',
  'Mistral AI', 'Alibaba Cloud', 'Cohere', 'SkillOpt', 'Suno(\\.ai)?', 'Project Genie', 'GPT-[\\d.]+',
  'AI WORLD HQ', 'AI World HQ', 'OpenAI', 'Google', 'Microsoft', 'Meta', 'Anthropic', 'NVIDIA', 'IBM', 'Amazon', 'Apple', 'xAI', 'GitHub', 'Snowflake', 'SAP', 'Pinecone', 'AWS', 'Salesforce', 'Databricks', 'RSS', 'Magyar', 'English', 'Español', 'Deutsch', 'Français'
].join('|') + ')[.!]?$', 'i');

// angol-gyanú: tipikus angol szavak VAGY ékezet nélküli hosszú mondat angol mintákkal
const EN_WORDS = /\b(the|and|your|with|for|from|how|what|this|that|you|are|is|of|to|in|on|using|learn|guide|step|read|more|new|now|get|make|use|all|our|week|stories|matter)\b/gi;
function suspicious(text) {
  const t = text.trim();
  if (t.length < 8) return false;
  if (WHITELIST.test(t)) return false;
  if (/[áéíóöőúüű]/i.test(t)) {
    // magyar szöveg — csak akkor gyanús, ha FELTŰNŐEN sok angol szó van benne
    const hits = (t.match(EN_WORDS) || []).length;
    return hits >= 4;
  }
  // nincs magyar ékezet: gyanús, ha van benne angol stopszó VAGY 3+ szó
  const hits = (t.match(EN_WORDS) || []).length;
  const words = t.split(/\s+/).length;
  return hits >= 1 || (words >= 3 && /^[A-Za-z0-9 ,.'’\-–—:()!?&+]+$/.test(t));
}

let total = 0;
for (const page of PAGES) {
  const p = 'website/public/hu/' + page;
  if (!fs.existsSync(p)) continue;
  let h = fs.readFileSync(p, 'utf-8');
  h = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  // elem-osztály + szöveg párok
  const rx = /<(?:span|h1|h2|h3|p|a|div|summary|button|option|label|th|td)\b[^>]*class="([^"]*)"[^>]*>([^<]{4,})</g;
  const seen = new Set();
  let m;
  while ((m = rx.exec(h))) {
    const [, cls, raw] = m;
    const text = raw.replace(/\s+/g, ' ').trim();
    const key = cls + '|' + text;
    if (seen.has(key)) continue;
    seen.add(key);
    if (suspicious(text)) { console.log(`[${page}] .${cls.split(' ')[0]} → "${text.slice(0, 90)}"`); total++; }
  }
}
console.log('─'.repeat(60));
console.log('GYANÚS ELEMEK ÖSSZESEN:', total);
