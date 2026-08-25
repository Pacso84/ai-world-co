// ===================================================================
// ORBIT VIDEÓ-AGENT — heti összefoglaló videó szkript + hang (1. fele)
// ===================================================================
//
// Terv: docs/superpowers/specs/2026-07-11-orbit-weekly-video-design.md
// Vasárnap fut (heti dedup). A publikált heti összefoglaló cikkből
// ~150 szavas BESZÉLT szkriptet ír Orbit (AI-bemondó) hangján, majd
// ingyenes Microsoft-felolvasóval (en-AU Natasha, ausztrál akcentus)
// legyártja az mp3-at + a SZÓ-időzítéseket (szinkron-feliratokhoz).
//
// KIMENET (commitolva, ~1 MB): website/assets/video/weekly.json + weekly.mp3
// A videót magát a core/video-compose.js rakja össze minden build után.
//
// FUTTATÁS:  node agents/video/agent.js [--force]
//   --force: nem-vasárnap is fut; ha nincs heti digest-cikk, a legfrissebb
//            5 hírből dolgozik (teszt-üzem).
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ask } from '../../core/ai-router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const OUT_DIR = join(ROOT, 'website', 'assets', 'video');
const STATE_PATH = join(ROOT, 'memory', 'video-state.json');
const AGENT_NAME = 'video';
const VOICE = 'en-AU-NatashaNeural';   // ausztrál akcentus — a célközönségünk hangja

const FORCE = process.argv.includes('--force');

function slugify(t) { return (t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70); }

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + String(Math.ceil((((t - y) / 86400000) + 1) / 7)).padStart(2, '0');
}

function guard() {
  // KILL-SWITCH: amíg a config agents.video.enabled false, élesben NEM fut
  // (user 2026-07-11: "ezen még dolgozunk, nem menjen élesbe"). --force = helyi teszt.
  try {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
    if (cfg.agents?.video?.enabled === false && !FORCE) { console.log('⏸️  Orbit-videó: KIKAPCSOLVA (fejlesztés alatt) — kihagyom.'); return false; }
  } catch { /* config-hiba esetén óvatosan: futunk tovább a többi őrrel */ }
  if (FORCE) return true;
  if (new Date().getUTCDay() !== 0) { console.log('⏭️  Orbit-videó: nem vasárnap van — kihagyom.'); return false; }
  try {
    const s = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    if (s.last_week === isoWeek()) { console.log('⏭️  Orbit-videó: ezen a héten már készült.'); return false; }
  } catch { /* első futás */ }
  return true;
}

// A heti digest-cikk megkeresése (tags: weekly-digest, ezen a héten publikálva)
function findDigest() {
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      const md = d.article_markdown || '';
      if (!/weekly-digest/.test(md.slice(0, 600))) continue;
      if (isoWeek(new Date(d._meta?.published_at || 0)) !== isoWeek()) continue;
      const title = (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1] || d.original_title || '';
      return { title, slug: slugify(title), markdown: md };
    } catch { /* skip */ }
  }
  return null;
}

// Tartalék (--force teszthez): az 5 legfrissebb hír
function newestNews() {
  const items = [];
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      if (d._meta?.type === 'guide') continue;
      const md = d.article_markdown || '';
      const title = (md.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1];
      const subtitle = (md.match(/^subtitle:\s*["']?(.+?)["']?\s*$/m) || [])[1] || '';
      if (title) items.push({ title, subtitle, pub: d._meta?.published_at || '' });
    } catch { /* skip */ }
  }
  return items.sort((a, b) => b.pub.localeCompare(a.pub)).slice(0, 5);
}

const SYSTEM_PROMPT = `You are Orbit, the friendly robot news anchor of AI World HQ (aiworldhq.com) — a site that explains AI news for everyday people. You openly say you are an AI. Warm, clear, a little playful, US-friendly tone. Plain spoken English — a 12-year-old should follow easily.`;

function buildPrompt(source) {
  return `Write the SPOKEN script for this week's 60-90 second video news summary.

SOURCE (this week's stories):
${source}

RULES:
- 130-170 words TOTAL. Plain text only: NO markdown, NO emojis, NO headings, NO quotes around the whole thing. It will be read aloud by a text-to-speech voice.
- Start: "G'day! I'm Orbit, your A I news anchor at A I World HQ." (write "A I" with a space so it is pronounced as letters)
- Then the top stories, one or two friendly sentences each — what happened and why a normal person should care.
- End with: "That's your week in A I. Read the full stories on aiworldhq dot com. See you next Sunday!"
- Never invent facts beyond the source. No prices, no version numbers.`;
}

function selfCheck(text) {
  if (!text) return false;
  const words = text.trim().split(/\s+/).length;
  return words >= 90 && words <= 220 && !/[#*_\[\]`]/.test(text);
}

async function main() {
  console.log('🎬 ORBIT VIDEÓ-AGENT INDUL');
  console.log('─'.repeat(60));
  if (!guard()) return;

  const digest = findDigest();
  let source, slug = null, title = 'This Week in AI';
  if (digest) {
    source = digest.markdown.replace(/^---[\s\S]*?---/, '').slice(0, 5000);
    slug = digest.slug; title = digest.title;
    console.log(`   📰 Forrás: a heti összefoglaló cikk ("${title.slice(0, 50)}…")`);
  } else if (FORCE) {
    const items = newestNews();
    if (items.length < 3) { console.log('⏭️  Nincs elég hír a teszthez sem.'); return; }
    source = items.map((it, i) => `${i + 1}. ${it.title} — ${it.subtitle}`).join('\n');
    console.log(`   🧪 TESZT-ÜZEM: nincs heti digest — az ${items.length} legfrissebb hírből dolgozom.`);
  } else {
    console.log('⏭️  Még nincs e heti digest-cikk publikálva — a következő futás elkapja.');
    return;
  }

  // 1) Szkript-írás (free-first)
  let r = await ask(buildPrompt(source), { agentName: AGENT_NAME, systemPrompt: SYSTEM_PROMPT, maxTokens: 800 });
  if (r && !selfCheck(r.text)) {
    const retry = await ask(buildPrompt(source) + '\n\n⚠️ CRITICAL: 130-170 words, PLAIN TEXT ONLY (no markdown symbols at all). Rewrite completely.',
      { agentName: AGENT_NAME, systemPrompt: SYSTEM_PROMPT, maxTokens: 800 });
    if (retry && selfCheck(retry.text)) { retry.costUsd += r.costUsd; r = retry; }
  }
  if (!r || !selfCheck(r.text)) { console.log('💥 Nem sikerült jó szkriptet írni — marad jövő hétre.'); return; }
  const script = r.text.trim().replace(/\s+/g, ' ');
  console.log(`   ✍️  Szkript kész (${script.split(' ').length} szó) | $${r.costUsd.toFixed(4)}`);

  // 2) TTS + szó-időzítések (Microsoft Edge felolvasó — ingyenes)
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  mkdirSync(OUT_DIR, { recursive: true });
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true });
  const { audioFilePath, metadataFilePath } = await tts.toFile(OUT_DIR, script);
  tts.close();

  // A könyvtár saját nevű fájlokat ír — átnevezzük a fix nevekre
  const mp3Path = join(OUT_DIR, 'weekly.mp3');
  if (existsSync(mp3Path)) unlinkSync(mp3Path);
  renameSync(audioFilePath, mp3Path);

  // Szó-időzítések kinyerése (offset/duration: 100 ns-os "tick"-ekben).
  // A fájl EGYETLEN JSON dokumentum: { Metadata: [ {Type:'WordBoundary', Data:{...}} ] }
  let words = [];
  if (metadataFilePath && existsSync(metadataFilePath)) {
    try {
      const j = JSON.parse(readFileSync(metadataFilePath, 'utf-8'));
      for (const m of (j.Metadata || [])) {
        if (m?.Type === 'WordBoundary' && m.Data?.text?.Text) {
          words.push({ w: m.Data.text.Text, s: Math.round(m.Data.Offset / 10000), d: Math.round(m.Data.Duration / 10000) });
        }
      }
    } catch (e) { console.log('⚠️ Metadata-parse hiba: ' + e.message.slice(0, 60)); }
    unlinkSync(metadataFilePath);
  }
  console.log(`   🔊 Hang kész: weekly.mp3 | szó-időzítés: ${words.length} szó`);

  // 3) MONDAT-időzítések (a többnyelvű felirathoz): a szkriptet mondatokra
  // bontjuk, és a szó-időzítések kurzorával megkapjuk a kezdet/vég időket.
  const sentTexts = script.match(/[^.!?]+[.!?]+/g) || [script];
  const sentences = [];
  let cur = 0;
  for (const st of sentTexts) {
    const n = st.trim().split(/\s+/).length;
    const from = Math.min(cur, words.length - 1);
    const to = Math.min(cur + n - 1, words.length - 1);
    if (words.length) sentences.push({ text: st.trim(), s: words[from].s, e: words[to].s + words[to].d });
    cur += n;
  }

  // 4) Felirat-FORDÍTÁSOK (hu/es/de/fr) — user-kérés 2026-07-11: aki nem tud
  // angolul, olvashassa. Számozott sorokként fordíttatjuk (1:1 megfeleltetés).
  const LANG_NAMES = { hu: 'Hungarian', es: 'Spanish' };
  for (const [lang, langName] of Object.entries(LANG_NAMES)) {
    try {
      const numbered = sentences.map((x, i) => `${i + 1}. ${x.text}`).join('\n');
      const tr = await ask(
        `Translate these numbered subtitle lines into natural, spoken-style ${langName}. Return EXACTLY ${sentences.length} numbered lines, nothing else. Keep names (Orbit, AI World HQ, aiworldhq.com, company and product names) unchanged.\n\n${numbered}`,
        { agentName: AGENT_NAME, systemPrompt: `You are a professional subtitle translator. Output only the numbered translated lines.`, maxTokens: 1500 });
      if (!tr?.text) continue;
      const lines = tr.text.split('\n').map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
      if (lines.length === sentences.length) {
        sentences.forEach((x, i) => { x[lang] = lines[i]; });
        console.log(`   🌍 Felirat kész: ${lang}`);
      } else console.log(`   ⚠️ Felirat kihagyva (${lang}): ${lines.length}/${sentences.length} sor`);
    } catch (e) { console.log(`   ⚠️ Felirat-hiba (${lang}): ${e.message.slice(0, 50)}`); }
  }

  // 5) Meta mentése (a compose + a build ebből dolgozik)
  writeFileSync(join(OUT_DIR, 'weekly.json'), JSON.stringify({
    week: isoWeek(), slug, title, script, voice: VOICE, words, sentences,
    created_at: new Date().toISOString(), test_mode: !digest
  }, null, 2), 'utf-8');

  try { writeFileSync(STATE_PATH, JSON.stringify({ last_week: isoWeek() }, null, 2), 'utf-8'); } catch { /* ok */ }
  console.log('✅ Orbit hang+szkript kész → website/assets/video/ (a videót a compose rakja össze)');
}

main().then(() => process.exit(0)).catch(async (e) => {
  console.error('💥 ORBIT-AGENT HIBA:', e.message);
  // A cikk attól még él — de szólunk Telegramon, hogy a videó kimaradt
  try { const { sendMessage } = await import('../../core/telegram.js'); await sendMessage(`⚠️ Az e heti Orbit-videó nem készült el (${e.message.slice(0, 80)}). A cikk természetesen él.`); } catch { /* nincs token */ }
  process.exit(1);
});
