// „🔧 HA ELAKADSZ” — MÉRÉS (2026-10-24) — helyben, kézzel futtatva: node core/elakadas-meres.mjs <slug>...
// Útmutatónként: súgó-index → jelölt cikkek → a cikkek szövege → EGY modellhívás (OpenRouter, usage.include
// a valódi költségért) → ellenőrzés (core/elakadas.js) → eredmény a scratchpadba. A core/ai-router.js-t
// SZÁNDÉKOSAN nem hívja (állapotfájlt írna a repóba); a CI-bekötés (2b) már a routeren megy majd.
// NEM teszt (nem .test.js): fizetős hívást végez. Kulcsot nem ír ki.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { szolgaltatok, indexLetolt } from './sugo-index.js';
import { ELAKADAS_BE, jeloltCikkek, promptEpit, valaszErtelmez, dobozKeszit } from './elakadas.js';
import { utmutatoAdat, cikkSzoveg } from './elakadas-gen.js';   // közös a CI-generátorral (10-26): egy megvalósítás

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KI = process.env.ELAKADAS_KI || join(ROOT, 'elakadas-meres.json');
const MODELL = 'anthropic/claude-haiku-5.5';
const env = readFileSync(join(ROOT, '.env'), 'utf-8');
const KULCS = ((env.match(/^OPENROUTER_API_KEY\s*=\s*(.*)$/m) || [])[1] || '').trim().replace(/^['"]|['"]$/g, '');

/** A slug-hoz tartozó útmutató — a feldolgozás a közös utmutatoAdat() (core/elakadas-gen.js). */
function utmutatoSlugra(slug) {
  const d = join(ROOT, 'content', 'articles');
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    const j = JSON.parse(readFileSync(join(d, f), 'utf-8'));
    if (j._meta?.slug === slug) return utmutatoAdat(j);
  }
  throw new Error('nincs ilyen útmutató: ' + slug);
}

async function modell(rendszer, felhasznalo) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + KULCS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELL, messages: [{ role: 'system', content: rendszer }, { role: 'user', content: felhasznalo }], max_tokens: 8000, temperature: 0.2, reasoning: { effort: 'low' }, usage: { include: true } }),   // 10-24 mérés: 1500-nál a gondolkodás elvitte a keretet (üres / félbevágott válasz) — a router is 8000-es padlót ad
    signal: AbortSignal.timeout(180000)
  });
  const j = await r.json();
  if (!r.ok) throw new Error('OpenRouter ' + r.status + ': ' + JSON.stringify(j).slice(0, 200));
  return { veg: j.choices?.[0]?.finish_reason, szoveg: j.choices?.[0]?.message?.content || '', koltseg: Number(j.usage?.cost) || 0, be: j.usage?.prompt_tokens, ki: j.usage?.completion_tokens };
}

const indexek = {};
const eredmeny = [];
let osszKoltseg = 0;
for (const slug of process.argv.slice(2)) {
  const utm = utmutatoSlugra(slug);
  const szolg = szolgaltatok(utm.tool, utm.company);
  const index = [];
  for (const s of szolg) index.push(...(indexek[s] ||= await indexLetolt(s)));
  const jeloltek = jeloltCikkek(utm, index, 4);
  const cikkek = [];
  for (const c of jeloltek) { const t = await cikkSzoveg(c.url); if (t?.szoveg?.length > 400) cikkek.push({ url: c.url, cim: t.cim || c.cim, szoveg: t.szoveg }); }
  const sor = { slug, cim: utm.cim, eszkoz: utm.tool || '(általános)', szolgaltatok: szolg, indexMeret: index.length, jeloltek: jeloltek.map(c => c.cim.slice(0, 70)), letoltve: cikkek.length };
  if (cikkek.length) {
    const { rendszer, felhasznalo } = promptEpit(utm, cikkek);
    const v = await modell(rendszer, felhasznalo);
    osszKoltseg += v.koltseg;
    const tetelek = valaszErtelmez(v.szoveg, cikkek);
    const doboz = dobozKeszit(tetelek, Object.fromEntries(cikkek.map(c => [c.url, c.szoveg])), utm.hibak, ELAKADAS_BE, utm);   // utm: eszköz nélküli útmutatónál „In ChatGPT|Gemini|Claude:” kötelező (független átnézés 10-24)
    Object.assign(sor, { veg: v.veg, koltseg: v.koltseg, tokenBe: v.be, tokenKi: v.ki, modellTetel: tetelek.length, doboz, cikkCimek: Object.fromEntries(cikkek.map(c => [c.url, c.cim])), nyers: v.szoveg.slice(0, 3000) });
  }
  eredmeny.push(sor);
  console.log(`${slug}: index ${sor.indexMeret} · jelölt ${jeloltek.length} · letöltve ${sor.letoltve} · modell-tétel ${sor.modellTetel ?? '-'} · DOBOZ ${sor.doboz ? sor.doboz.items.length + ' tétel' : 'nincs'} · $${(sor.koltseg || 0).toFixed(5)}`);
}
writeFileSync(KI, JSON.stringify({ at: new Date().toISOString(), modell: MODELL, osszKoltseg, eredmeny }, null, 2));
console.log(`összesen: $${osszKoltseg.toFixed(5)} → ${KI}`);
