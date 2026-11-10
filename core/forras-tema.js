// ===================================================================
// FORRÁS ↔ TÉMA ŐR (2026-11-10, user: „szeretném, hogy többször ne forduljanak elő ezek a hibák!”)
//
// MI TÖRTÉNT: a tény-ellenőrző 11-09-én jelezte, hogy az „aws-ml … Jamf” HÍR élő szövege valójában egy
// ChatGPT-hangmód ÚTMUTATÓ. A korai író (2026-06/07) hat céges hírből a forrástól FÜGGETLEN „How to…”
// cikket írt (Jamf/Amazon Bedrock → ChatGPT-hangmód; Amazon Nova → szkennelt iratok; OpenAI befektetési
// útmutató → Zapier-automatizálás…). A lap alján a hivatalos forráslink állt, a szövegnek viszont SEMMI
// köze nem volt hozzá — vagyis forrás nélküli, ellenőrizhetetlen állítások mentek ki „hivatalos forrásból”.
// Mind a hatot 11-10-én 301-gyel levettük.
//
// A GÁT: a HÍR nem szólhat olyan ESZKÖZRŐL, amit a hivatalos forrása meg sem említ.
//   (A) a cikk CÍMÉBEN megnevezett ismert eszköz SEHOL nem szerepel a forrásban, VAGY
//   (B) a cikk TÖRZSE legalább MIN_TORZS_EMLITES-szer említ olyan ismert eszközt, ami a forrásban sehol
//       nincs (a levett útmutatók a forrás terméke helyett ChatGPT-t, Canvát, Zapiert tanítottak).
// Bármelyik → SOURCE_TOPIC_MISMATCH, ami ELUTASÍT (core/auto-check-codes.js BLOCKING_CODES).
//
// ⚠️ MIÉRT NEM SZÓEGYEZÉS: az első változat a cím és a forrás közös szavait mérte. Valódi, letöltött
// forrásokon (11-10, 25 cikk) ez 3 jó „mit jelent ez neked” magyarázót megfogott, a hat rosszból viszont
// csak egyet — az általános szavak (documents, images, photos) minden céges forrásban ott vannak. Az
// eszköznév viszont pontos jel. (A Midjourney-útmutató a Midjourney saját frissítéséből ugyanarról a
// termékről szól → ezt az őr nem fogja; a forrásban nem szereplő LÉPÉSEKET a hitelesség-kapu és a
// SCREEN_TEXT_QUOTED / UI_CLAIMS_UNSOURCED jelzések nézik.)
//
// ⚠️ CSAK TELJES FORRÁSSZÖVEGGEL ÍTÉL (≥ MIN_FORRAS_SZOVEG karakter): a rövid kivonatból nem derül ki, mit
// említ a forrás (10-17: a Google Vids-hír forrása említi a ChatGPT-t, a kivonata nem). A tár hiánya
// SOHA ne állítson meg semmit — JOGTISZTA FORRÁSOK alapelv.
// ===================================================================

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { utmutatoE } from './guide-kind.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Ennél rövidebb forrásszöveg csak KIVONAT (≤3000 kar.) → abból nem ítélünk. */
export const MIN_FORRAS_SZOVEG = 3200;
/** (B): ennyi említéstől számít a törzsben egy eszköz a cikk TÉMÁJÁNAK (egy-két futó említés nem az). */
export const MIN_TORZS_EMLITES = 3;
/**
 * A tool-links.json-on TÚLI hétköznapi eszközök, amikre a korai író a forrás helyett útmutatót épített.
 * (Nem hivatalos-link lista — csak a téma-eltérés felismeréséhez kell.)
 */
export const EGYEB_ESZKOZOK = Object.freeze(['Canva', 'Adobe', 'Photoshop', 'Zapier', 'IFTTT', 'Google Lens',
  'Google Drive', 'Microsoft Designer', 'Notion', 'Grammarly', 'DALL-E', 'DALL·E', 'Siri']);

// Átnevezett / kétnevű eszközök: ha a cikk az egyiket írja, a forrásban a másik is elég.
const ALIAS = Object.freeze({
  'gemini notebook': ['notebooklm'],
  'le chat': ['vibe', 'mistral'],
  'alexa+': ['alexa'],
  'mistral ai': ['mistral'],
  'suno.ai': ['suno'],
  'gpt-5.6': ['gpt'],
  'chatgpt': ['gpt-', 'gpt‑'],
  'google photos': ['photos'],
  'apple intelligence': ['siri', 'genmoji'],
  'siri': ['apple intelligence'],
  'minimax code': ['minimax'],
  'brave leo': ['leo'],
  'alibaba cloud': ['alibaba', 'qwen'],
  'hugging face': ['huggingface'],
  'dall-e': ['dall·e', 'dall‑e'],
  'dall·e': ['dall-e', 'dall‑e'],
  'adobe': ['firefly', 'photoshop'],
  'photoshop': ['adobe']
});

let _nevek = null;
/** Az ismert eszköznevek: website/tool-links.json `tools` kulcsai + a fenti hétköznapi eszközök. */
export function eszkozNevek() {
  if (_nevek) return _nevek;
  let t = [];
  try { t = Object.keys(JSON.parse(readFileSync(join(ROOT, 'website', 'tool-links.json'), 'utf-8')).tools || {}); }
  catch { t = []; }
  _nevek = [...new Set([...t, ...EGYEB_ESZKOZOK])];
  return _nevek;
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const minta = nev => new RegExp('(^|[^a-z0-9])' + esc(nev.toLowerCase()) + '(?![a-z0-9])', 'g');
const hanyszor = (szoveg, nev) => (szoveg.match(minta(nev)) || []).length;

/** A cikk frontmatter-címe (ennek híján az első H1). */
export function cikkCime(markdown) {
  const md = String(markdown || '');
  const fm = md.match(/^title:\s*["']?(.+?)["']?\s*$/m);
  if (fm) return fm[1];
  return (md.match(/^#\s+(.+)$/m) || [])[1] || '';
}

/**
 * Eltér-e a HÍR témája a forrásétól?
 *
 * @param {object} p
 * @param {string} p.markdown       a cikk teljes markdownja (frontmatterrel)
 * @param {string} p.forrasCim      a forrás eredeti címe (`original_title`)
 * @param {string} [p.forrasSzoveg] a forrás TELJES szövege (kivonat / üres → nem ítélünk)
 * @param {string[]} [p.nevek]      ismert eszköznevek (teszthez; alap: eszkozNevek())
 * @returns {{elteres: boolean, ok: string, hianyzoNevek: string[]}}
 */
export function forrasTemaElteres({ markdown, forrasCim, forrasSzoveg = '', nevek } = {}) {
  const nincs = { elteres: false, ok: '', hianyzoNevek: [] };
  const md = String(markdown || '');
  const cim = cikkCime(md);
  const fsz = String(forrasSzoveg || '');
  if (!cim || fsz.trim().length < MIN_FORRAS_SZOVEG) return nincs;

  const forrasMind = (String(forrasCim || '') + ' ' + fsz).toLowerCase();
  const aForrasban = n => {
    const kis = n.toLowerCase();
    return [kis, ...(ALIAS[kis] || [])].some(v => forrasMind.includes(v));
  };
  const lista = nevek || eszkozNevek();
  // a hosszabb név „lefedi” a benne lévő rövidebbet (GitHub Copilot ⊃ Copilot)
  const onallo = talalt => talalt.filter(n => !talalt.some(m => m !== n && m.toLowerCase().includes(n.toLowerCase())));

  // (A) a CÍMBEN megnevezett eszköz nincs a forrásban
  const cimKis = cim.toLowerCase();
  const cimHianyzo = onallo(lista.filter(n => hanyszor(cimKis, n) > 0)).filter(n => !aForrasban(n));
  if (cimHianyzo.length) {
    return { elteres: true, hianyzoNevek: cimHianyzo, ok: `a cím „${cimHianyzo.join(', ')}”-t nevez meg, de a hivatalos forrás sehol nem említi` };
  }

  // (B) a TÖRZS egy, a forrásban nem szereplő eszközről szól
  const torzs = md.replace(/^---[\s\S]*?^---\s*$/m, '').toLowerCase();
  const torzsHianyzo = onallo(lista.filter(n => hanyszor(torzs, n) >= MIN_TORZS_EMLITES)).filter(n => !aForrasban(n));
  if (torzsHianyzo.length) {
    return { elteres: true, hianyzoNevek: torzsHianyzo, ok: `a szöveg „${torzsHianyzo.join(', ')}” használatát tanítja, de a hivatalos forrás sehol nem említi` };
  }
  return nincs;
}

// Teljes szövegű forrásrész (core/tenyellenorzo-forras.js TELJES_VIA) — a 'kivonat' NEM az.
const TELJES_VIA = new Set(['html', 'rss', 'hirfolyam']);

/**
 * Az Ellenőrző jelzése egy vázlatra — vagy null, ha nincs eltérés / nem ítélhető meg.
 * NEM ítélünk: útmutató · saját szerkesztőségi cikk (heti összefoglaló: nincs külső forrása) ·
 * ha bármelyik forrásrész csak kivonatként van meg (a hiányzó részből jövő név „idegennek” látszana).
 *
 * @param {object} writerData  a vázlat (article_markdown, original_title, _meta)
 * @param {string} forrasSzoveg a forrás(ok) TELJES szövege a tárból (core/forras-cache.js cikkForrasSzovege)
 * @returns {string|null} "SOURCE_TOPIC_MISMATCH: …" vagy null
 */
export function forrasTemaJelzes(writerData, forrasSzoveg) {
  const m = writerData?._meta || {};
  // „útmutató-e?” → a közös szabály (core/guide-kind.js), nem saját másolat
  if (utmutatoE('', writerData) || m.source_id === 'aiworld-editorial') return null;
  if (Array.isArray(m.source_text_via) && !m.source_text_via.every(v => TELJES_VIA.has(v))) return null;
  const e = forrasTemaElteres({
    markdown: writerData?.article_markdown, forrasCim: writerData?.original_title, forrasSzoveg
  });
  return e.elteres ? 'SOURCE_TOPIC_MISMATCH: A cikk másról szól, mint a forrása — ' + e.ok + '.' : null;
}

export default { forrasTemaElteres, forrasTemaJelzes, cikkCime, eszkozNevek };
