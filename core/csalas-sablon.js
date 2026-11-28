// Csalás-sablon + példablokk (2026-11-23; terv: docs/superpowers/plans/2026-11-21-csalas-figyelo.md 2. rész,
// spec: docs/superpowers/specs/2026-11-21-csalas-figyelo-design.md 8.3 és 8.5).
//
// A csalás-hír kötelező fejezetei, és a „## Warning signs” alatti KITALÁLT példaüzenet blokkja. A kép adatai ebben
// a fordítható markdown-blokkban élnek a cikk törzsében (a fordító a frontmattert NEM fordítja), a képrajzoló
// (4. rész) és a build (8. rész) innen olvassa. Tiszta logika, hálózat nélkül.
//
// A blokk formátuma (az író ezt írja, a fordító ugyanígy adja vissza):
//
//   > 🧪 [sms]                                   ← csatorna, MINDIG angolul (core/csalas-figyelo.js CSATORNAK)
//   > 👤 [[1|+1 (555) 555-0199]]                 ← feladó
//   > 📌 Action needed                           ← tárgy (opcionális, e-mailnél)
//   > Your package is on hold…                   ← üzenet, 2–5 sor
//   > [[2|It will be deleted in 24 hours!]]
//   > Confirm here: [[3|parcel-track.example.com]]
//
//   1. **Unknown number** — …                    ← pontosan 3 magyarázat, a ①②③ jel sorrendjében
//   2. **Pressure** — …
//   3. **Odd link** — …
//
// [[1|…]], [[2|…]], [[3|…]] pontosan egyszer-egyszer. A feladó és a sorok a jelölést MEGTARTJÁK (a képrajzoló
// ebből emeli ki a szövegrészt); a `jelek` mező a jelölt szövegrészeket adja külön.
//
// KÉP-ŐR (kód, nem prompt): link CSAK example.com / *.example.com; telefonszám CSAK a hivatalosan kitalált
// 555-0100…555-0199 tartomány; valódi márka-, cég- vagy hivatalnév SOHA (tool-links.json + MARKA_TILTOTT).

import { readFileSync } from 'fs';
import { CSATORNAK } from './csalas-figyelo.js';
import { ORSZAGFUGGETLEN, PENZ_VISSZA, vedekezesCsatornara, BEJELENTES } from './csalas-vedekezes.js';

export const CSALAS_FEJEZETEK = ["What's happening", 'Warning signs', 'How to protect yourself', 'If it already happened', 'What this means for you'];

// A kép vízjele és a „nem valódi” jelölés a cikk nyelvén (nem angol oldalon nincs angol mondat).
export const PELDA_VIZJEL = { en: 'EXAMPLE – SCAM', hu: 'PÉLDA – CSALÁS', es: 'EJEMPLO – ESTAFA' };
export const PELDA_JELOLES = { en: 'Example — not a real message', hu: 'Példa — nem valódi üzenet', es: 'Ejemplo — no es un mensaje real' };

// Az igazság-kapu ezt a sort látja a példablokk helyén: a kitalált üzenet nem forrásállítás.
export const PELDA_HELYETTES = '> (Illustrative example message — fictional, clearly labeled; not a factual claim.)';

// Alap márkalista (futárcég, bank, fizetés, webshop, platform, hivatal). Szóhatáros, kisbetű-érzéketlen.
export const MARKA_TILTOTT = [
  'Amazon', 'UPS', 'FedEx', 'USPS', 'DHL', 'PayPal', 'Venmo', 'Zelle', 'Cash App', 'Chase', 'Wells Fargo',
  'Bank of America', 'Citi', 'Capital One', 'Apple', 'Google', 'Microsoft', 'Meta', 'Facebook', 'Instagram',
  'WhatsApp', 'Netflix', 'Walmart', 'Target', 'eBay', 'Coinbase', 'IRS', 'Social Security', 'SSA', 'Medicare',
  'FBI', 'FTC',
];

let nevCache = null;
export function tiltottNevek() {
  if (nevCache) return nevCache;
  let tl = {};
  try { tl = JSON.parse(readFileSync(new URL('../website/tool-links.json', import.meta.url), 'utf-8')); } catch { /* csak az alaplista */ }
  const osszes = [...MARKA_TILTOTT, ...Object.keys(tl.tools || {}), ...Object.keys(tl.companies || {})];
  const latott = new Set();
  nevCache = osszes.filter(n => {
    const k = n.toLowerCase();
    if (!n.trim() || latott.has(k)) return false;
    latott.add(k);
    return true;
  });
  return nevCache;
}

const JEL_RE = /\[\[([1-9])\|(.+?)\]\]/g;
const BLOKK_ELEJE_RE = /^>\s*🧪\s*\[([^\]]*)\]\s*$/u;
const LISTA_RE = /^\s*(\d+)[.)]\s+(.*\S)\s*$/;
const H2_RE = /^##\s+(.+?)\s*#*\s*$/;

const jelNelkul = s => String(s ?? '').replace(JEL_RE, '$2');

// A blokk értelmezése + a sorindexek (a cseréhez). Nincs `> 🧪 [` sor → null.
function elemez(md) {
  const sorok = String(md ?? '').split('\n');
  const kezdet = sorok.findIndex(s => BLOKK_ELEJE_RE.test(s.trimEnd()));
  if (kezdet < 0) return null;
  const csatorna = sorok[kezdet].trimEnd().match(BLOKK_ELEJE_RE)[1].trim().toLowerCase();

  let felado = null, targy = null;
  const uzenet = [];
  let j = kezdet + 1;
  for (; j < sorok.length && /^\s*>/.test(sorok[j]); j++) {
    const s = sorok[j].replace(/^\s*>\s?/, '').trim();
    if (!s) continue;
    if (s.startsWith('👤')) felado = s.slice('👤'.length).trim();
    else if (s.startsWith('📌')) targy = s.slice('📌'.length).trim();
    else uzenet.push(s);
  }

  // A blokk utáni számozott lista (üres sorok közte megengedettek; címsor vagy más szöveg megállítja).
  const magyarazat = [];
  let veg = j;
  for (let k = j; k < sorok.length; k++) {
    if (!sorok[k].trim()) continue;
    const m = sorok[k].match(LISTA_RE);
    if (!m) break;
    const b = m[2].match(/^\*\*(.+?)\*\*\s*(?:[—–:-]\s*)?(.*)$/);
    magyarazat.push(b ? { cimke: b[1].trim(), szoveg: b[2].trim() } : { cimke: '', szoveg: m[2].trim() });
    veg = k + 1;
  }

  const jelDb = {};
  const jelek = {};
  for (const s of [felado, targy, ...uzenet]) {
    for (const m of String(s ?? '').matchAll(JEL_RE)) {
      jelDb[m[1]] = (jelDb[m[1]] || 0) + 1;
      jelek[m[1]] = m[2];
    }
  }
  const jelOk = Object.keys(jelDb).sort().join(',') === '1,2,3' && Object.values(jelDb).every(n => n === 1);

  // A blokk előtti legközelebbi H2.
  let fejezet = null;
  for (let k = kezdet - 1; k >= 0; k--) {
    const m = sorok[k].match(H2_RE);
    if (m) { fejezet = m[1]; break; }
  }

  return {
    sorok, kezdet, veg, jelOk, fejezet,
    pelda: { csatorna, felado, targy, sorok: uzenet, jelek, magyarazat },
  };
}

export function peldaBlokk(md) {
  return elemez(md)?.pelda ?? null;
}

const fejNorm = s => String(s).trim().replace(/[?:.!]+$/, '').toLowerCase();

export function csalasSzerkezetHiba(md) {
  const hibak = [];
  const h2 = String(md ?? '').split('\n').map(s => s.match(H2_RE)).filter(Boolean).map(m => fejNorm(m[1]));
  for (const f of CSALAS_FEJEZETEK) if (!h2.includes(fejNorm(f))) hibak.push(`hiányzó fejezet: ${f}`);

  const e = elemez(md);
  if (!e) { hibak.push('nincs példablokk'); return hibak; }
  const p = e.pelda;
  if (!CSATORNAK.includes(p.csatorna)) hibak.push('ismeretlen csatorna');
  if (!p.felado) hibak.push('nincs feladó');
  if (p.sorok.length < 2 || p.sorok.length > 5) hibak.push('nem 2–5 üzenetsor');
  if (!e.jelOk) hibak.push('nem 3 jel');
  if (p.magyarazat.length !== 3) hibak.push('nem 3 magyarázat');
  if (fejNorm(e.fejezet ?? '') !== fejNorm('Warning signs')) hibak.push('a példablokk nem a „Warning signs” alatt van');
  return hibak;
}

// ── kép-őr ──────────────────────────────────────────────────────────────────
const DOMAIN_RE = /(?<![\w.@-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?![\w-])|(?<=@)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?![\w-])/gi;
// Minden 7–15 számjegyes sor telefonszámnak számít (óvatosság: egy rendelésszám is lehet valódi szám).
const TEL_RE = /\+?\(?\d[\d\s().-]{5,}\d/g;

const domainek = s => [...jelNelkul(s).matchAll(DOMAIN_RE)].map(m => m[0]);
const telefonok = s => [...jelNelkul(s).matchAll(TEL_RE)].map(m => m[0].trim()).filter(x => {
  const n = x.replace(/\D/g, '').length;
  return n >= 7 && n <= 15;
});

function kitaltDomain(d) {
  const h = d.toLowerCase();
  return h === 'example.com' || h.endsWith('.example.com');
}

// A hivatalosan kitalált amerikai tartomány: (NPA) 555-0100…555-0199, vagy körzetszám nélkül 555-01xx.
function kitaltTelefon(t) {
  let d = t.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length === 10) return d.slice(3, 8) === '55501';
  if (d.length === 7) return d.slice(0, 5) === '55501';
  return false;
}

const nevRe = n => new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu');

function peldaSzovegek(p) {
  return [p.felado, p.targy, ...(p.sorok || []), ...Object.values(p.jelek || {}),
    ...(p.magyarazat || []).flatMap(x => [x.cimke, x.szoveg])].filter(Boolean).map(jelNelkul);
}

export function peldaBiztonsag(pelda) {
  if (!pelda) return ['nincs példablokk'];
  const hibak = new Set();
  const szovegek = peldaSzovegek(pelda);
  for (const s of szovegek) {
    for (const d of domainek(s)) if (!kitaltDomain(d)) hibak.add(`nem example.com domain: ${d}`);
    for (const t of telefonok(s)) if (!kitaltTelefon(t)) hibak.add(`nem kitalált (555-01xx) telefonszám: ${t}`);
  }
  const egyben = szovegek.join('\n');
  for (const n of tiltottNevek()) if (nevRe(n).test(egyben)) hibak.add(`tiltott név: ${n}`);
  return [...hibak];
}

// ── fordítás-egyezés ────────────────────────────────────────────────────────
const tokenek = s => [...domainek(s), ...telefonok(s)].sort();
const uzenetTokenek = p => tokenek([p.felado, p.targy, ...p.sorok].filter(Boolean).join('\n'));
const csupaszSzoveg = arr => arr.filter(Boolean).map(jelNelkul).join(' ')
  .replace(DOMAIN_RE, ' ').replace(TEL_RE, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

export function forditasEgyezik(enMd, trMd) {
  const en = elemez(enMd);
  if (!en) return true;
  const tr = elemez(trMd);
  if (!tr) return false;
  const pe = en.pelda, pt = tr.pelda;
  if (pt.csatorna !== pe.csatorna) return false;
  if (!tr.jelOk || pt.magyarazat.length !== 3) return false;
  for (const k of ['1', '2', '3']) {
    if (tokenek(pt.jelek[k]).join('|') !== tokenek(pe.jelek[k]).join('|')) return false;
  }
  if (uzenetTokenek(pt).join('|') !== uzenetTokenek(pe).join('|')) return false;
  // Angolul hagyott blokk: az üzenet vagy a magyarázat szövege betűre az angol.
  const enUz = csupaszSzoveg(pe.sorok), trUz = csupaszSzoveg(pt.sorok);
  if (enUz && enUz === trUz) return false;
  const enMa = csupaszSzoveg(pe.magyarazat.map(x => `${x.cimke} ${x.szoveg}`));
  const trMa = csupaszSzoveg(pt.magyarazat.map(x => `${x.cimke} ${x.szoveg}`));
  if (enMa && enMa === trMa) return false;
  return true;
}

// ── csere ───────────────────────────────────────────────────────────────────
function cserel(md, mire) {
  const e = elemez(md);
  if (!e) return md;
  return [...e.sorok.slice(0, e.kezdet), mire, ...e.sorok.slice(e.veg)].join('\n');
}

export function peldaBlokkNelkul(md) {
  return cserel(md, PELDA_HELYETTES);
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const kiemel = s => esc(s).replace(JEL_RE, (_, n, x) => `<mark class="csalas-jel" data-jel="${n}">${x}<sup>${n}</sup></mark>`);
const magyarazatLista = p => '<ol class="csalas-pelda__jelek">'
  + p.magyarazat.map(x => `<li>${x.cimke ? `<strong>${esc(x.cimke)}</strong> — ` : ''}${esc(x.szoveg)}</li>`).join('')
  + '</ol>';

// A blokk + lista helyére HTML-blokk (a `marked` átengedi; üres sor nincs benne, különben szétszedné).
// kepUt üres → szöveges, jelölt változat a cikk nyelvén.
export function peldaBlokkCsere(md, { kepUt = '', alt = '', nyelv = 'en' } = {}) {
  const e = elemez(md);
  if (!e) return md;
  const p = e.pelda;
  const jeloles = PELDA_JELOLES[nyelv] || PELDA_JELOLES.en;
  const csat = esc(p.csatorna);
  let html;
  if (kepUt) {
    html = [
      '<figure class="csalas-pelda">',
      `<img src="${esc(kepUt)}" alt="${esc(alt || jeloles)}" width="1080" height="1350" loading="lazy">`,
      `<figcaption><p class="csalas-pelda__jeloles">${esc(jeloles)}</p>${magyarazatLista(p)}</figcaption>`,
      '</figure>',
    ].join('\n');
  } else {
    html = [
      `<div class="csalas-pelda csalas-pelda--szoveg" data-csatorna="${csat}">`,
      `<p class="csalas-pelda__jeloles">${esc(jeloles)}</p>`,
      '<div class="csalas-pelda__uzenet">',
      ...(p.felado ? [`<p class="csalas-pelda__felado">${kiemel(p.felado)}</p>`] : []),
      ...(p.targy ? [`<p class="csalas-pelda__targy">${kiemel(p.targy)}</p>`] : []),
      ...p.sorok.map(s => `<p>${kiemel(s)}</p>`),
      '</div>',
      magyarazatLista(p),
      '</div>',
    ].join('\n');
  }
  return cserel(md, html);
}

// ── 6. rész (2026-11-24): az író csalás-utasítása ───────────────────────────────────────────────────────
// Az író rendes userPrompt-jához fűzött ANGOL utasítás. A benne mutatott váz MAGA is átmegy a
// csalasSzerkezetHiba-n és a peldaBiztonsag-on (teszt) — az író sosem kap hibás mintát.

// Csatornánkénti FORMAMINTA (a 4. rész képtesztjével egyező, biztonságos példák). social → chat-, web → email-alak.
const MINTA_BLOKK = {
  sms: ['👤 [[1|+1 (555) 555-0199]]', 'Your package is on hold because the address is incomplete.', '[[2|It will be deleted in 24 hours!]]', 'Confirm here: [[3|parcel-track.example.com]]'],
  email: ['👤 [[1|Account Team <security@account-alerts.example.com>]]', '📌 Unusual sign-in detected', 'We noticed a sign-in to your account from a new location.', '[[2|Verify within 2 hours or your account will be locked.]]', 'Review activity: [[3|secure-login.example.com/verify]]'],
  chat: ['👤 [[1|Mom (new number)]]', "Hi, it's me. I dropped my phone and this is my new number.", "[[2|Can you send me the money right now? I'll pay you back tomorrow.]]", "[[3|Please don't call, I can't talk right now.]]"],
  call: ['👤 [[1|Unknown caller · +1 (555) 555-0142]]', "This is your bank's fraud department.", '[[2|Someone is using your card right now.]]', '[[3|Read me the code we just texted you so we can stop it.]]'],
};
MINTA_BLOKK.social = MINTA_BLOKK.chat;
MINTA_BLOKK.web = MINTA_BLOKK.email;
const MINTA_MAGYARAZAT = {
  sms: ['**Unknown number** — a real delivery company does not text like this.', "**Pressure** — so you don't have time to think.", "**Odd link** — it's not the company's own address."],
  email: ["**Odd sender** — the address isn't the company's own.", '**Deadline** — a threat to make you hurry.', '**Fake login page** — the link leads somewhere else.'],
  chat: ['**New number** — a family member suddenly writes from an unknown number.', '**Money, fast** — an urgent request to send money.', "**No calls** — they avoid a call so you can't check."],
  call: ['**Unexpected call** — they called you, not the other way around.', '**Alarm** — a scare so you act before thinking.', '**Asks for a code** — no real bank asks for this code.'],
};
MINTA_MAGYARAZAT.social = MINTA_MAGYARAZAT.chat;
MINTA_MAGYARAZAT.web = MINTA_MAGYARAZAT.email;

export function csalasIroUtasitas({ csatorna, vedekezes, bejelentes, orszagfuggetlen = ORSZAGFUGGETLEN, penzVissza = PENZ_VISSZA } = {}) {
  if (!CSATORNAK.includes(csatorna)) throw new Error(`ismeretlen csatorna: ${csatorna}`);
  const lepesek = (vedekezes || []).filter(x => x && x.lepes);
  if (!lepesek.length) throw new Error(`nincs védekezés-lépés a(z) ${csatorna} csatornához — csalás-hír nem készülhet`);
  const helyek = (bejelentes || []).filter(b => b && b.url);
  const tobbi = [penzVissza?.lepes, orszagfuggetlen].filter(Boolean);
  const [h1, h2, h3, h4, h5] = CSALAS_FEJEZETEK;

  const vaz = [
    `## ${h1}`,
    '(2–3 short paragraphs from the official source: who the scammers pretend to be, how they reach people, what they ask for.)',
    '',
    `## ${h2}`,
    '',
    `> 🧪 [${csatorna}]`,
    ...MINTA_BLOKK[csatorna].map(s => `> ${s}`),
    '',
    ...MINTA_MAGYARAZAT[csatorna].map((s, i) => `${i + 1}. ${s}`),
    '',
    `## ${h3}`,
    '(numbered steps, chosen from the list below)',
    '',
    `## ${h4}`,
    '(where to report it, how to try to get the money back)',
    '',
    `## ${h5}`,
    '(two or three sentences: who is most likely to be targeted, and the one habit that protects them)',
  ].join('\n');

  return `
SCAM ALERT TEMPLATE — this article is a consumer warning about a scam described in the official source above.
Follow this template instead of the usual article shape.

STRUCTURE (exact H2 headings, in this order; keep the usual H1 title and the "In short" line before the first H2):
${CSALAS_FEJEZETEK.map((f, i) => `${i + 1}. ## ${f}`).join('\n')}

THE EXAMPLE MESSAGE BLOCK — put it directly under "## ${h2}", in exactly this format:
- first line: > 🧪 [${csatorna}]   (the channel tag stays exactly like this, in English)
- then > 👤 [[1|sender]]  (for an email, also one > 📌 subject line)
- then 2–5 short message lines starting with > (each under ~80 characters — the whole message must fit a phone screen)
- mark exactly 3 warning signs inside the message: [[1|…]], [[2|…]], [[3|…]] — each number exactly once
- right after the block: a numbered list of exactly 3 explanations, "1. **Label** — explanation", in the same order as the marks
- mark only warning signs that the official source itself names or clearly describes — never invent a new trick
- the message is FICTIONAL and clearly an example: links only example.com addresses (like parcel-track.example.com),
  phone numbers only +1 (555) 555-0100 to 555-0199; never a real company, brand, bank, app, store or government agency name
  (so no FBI, FTC, IRS, Social Security, USPS, Medicare or any other real agency — not even in the sender line)
- if the scammer pretends to be an official agency, use a made-up generic sender instead, like "Election Help Desk",
  "Benefits Office" or "Federal Case Unit", and keep every link and number fictional as above
- write your OWN message that matches the scam in the source — the sample below only shows the format

FORMAT SAMPLE (do not copy its wording):
${vaz}

"## ${h3}": use ONLY steps from the official source above or from this list of checked official advice
(you may shorten or rephrase them faithfully; do not add other advice):
${lepesek.map((x, i) => `${i + 1}. ${x.lepes}`).join('\n')}

"## ${h4}": tell readers where to report it, with these exact names and links:
${helyek.map(b => `- ${b.nev}: ${b.url}`).join('\n')}
${tobbi.map(s => `Also say: "${s}"`).join('\n')}

OTHER RULES:
- In the article text (not in the example message) a US agency may be named (for example the FBI or the FTC), but explain the trick and the defense so they help anyone, anywhere.
- Loss amounts or statistics only if the official source states them — quote them exactly. No prices of any product or service.
- Calm, helpful tone. The title names the scam plainly — no alarm words, no ALL CAPS, no "urgent" or "warning!!" style.
- Never ask readers to like, share or forward the article.
`;
}

// A szerkezet-őr és a kép-őr (magyar) hibái angolul — az író újrapróba-kérése angol prompt.
const HIBA_ANGOL = [
  [/^hiányzó fejezet: (.+)$/, (_, f) => `missing section: "## ${f}"`],
  [/^nincs példablokk$/, () => 'there is no example message block (starting with "> 🧪 [channel]") under "## Warning signs"'],
  [/^ismeretlen csatorna$/, () => 'the channel tag must be one of sms|email|chat|call|social|web, exactly as given'],
  [/^nincs feladó$/, () => 'the block has no sender line ("> 👤 [[1|…]]")'],
  [/^nem 2–5 üzenetsor$/, () => 'the example message must have 2 to 5 lines'],
  [/^nem 3 jel$/, () => 'mark exactly 3 warning signs in the message: [[1|…]], [[2|…]], [[3|…]], each number exactly once'],
  [/^nem 3 magyarázat$/, () => 'right after the block, give exactly 3 numbered explanations ("1. **Label** — …")'],
  [/^a példablokk nem a „Warning signs” alatt van$/, () => 'the example block must be directly under "## Warning signs"'],
  [/^nem example\.com domain: (.+)$/, (_, d) => `not allowed in the example (use only example.com addresses): ${d}`],
  [/^nem kitalált \(555-01xx\) telefonszám: (.+)$/, (_, t) => `phone number not allowed in the example (use only +1 (555) 555-0100 to 555-0199): ${t}`],
  [/^tiltott név: (.+)$/, (_, n) => `real company, brand or agency name not allowed in the example: ${n} — use a made-up generic sender instead (for example "Benefits Office"), and no other real name either`],
];

export function csalasHibaAngolul(hibak) {
  return (hibak || []).map(h => {
    const s = String(h);
    for (const [re, fn] of HIBA_ANGOL) { const m = s.match(re); if (m) return fn(...m); }
    return `template problem: ${s}`;
  });
}

// ── 7. rész (2026-11-24): az AI-bíró kiegészítése csalás-hírnél ─────────────────────────────────────────
// A bíró a példablokk HELYETT a PELDA_HELYETTES sort látja (peldaBlokkNelkul) — a kitalált üzenet nem tényállítás.
// A 3 figyelmeztető jelet és a védekezési lépéseket viszont a forráshoz és a kézzel ellenőrzött tárhoz méri.
// A kézzel ellenőrzött tény-tár szövege (védekezési lépések + bejelentő helyek, forrás-URL-lel) — az igazság-kapu a
// forrásszöveg MELLÉ kapja (core/truth-gate.js), az AI-bíró a kiegészítésben (lent).
export function csalasTenyTar(csatorna) {
  const lista = vedekezesCsatornara(csatorna);
  const sorok = [];
  if (lista.length) sorok.push(`Checked official advice for this channel (${csatorna}):`, ...lista.map((x, i) => `${i + 1}. ${x.lepes} (${x.forras})`));
  sorok.push('Checked official reporting places and follow-up steps:',
    ...BEJELENTES.map(b => `- ${b.nev}: ${b.url}`),
    `- ${PENZ_VISSZA.lepes} (${PENZ_VISSZA.forras})`,
    `- ${ORSZAGFUGGETLEN}`);
  return sorok.join('\n');
}

export function csalasBiroKiegeszites(csatorna) {
  const vanLista = vedekezesCsatornara(csatorna).length > 0;
  return `

SCAM ALERT CHECK (this article is a consumer scam warning):
- The example message itself was replaced by a placeholder line: it is a fictional, clearly labeled illustration, not a factual claim — do not judge it as one.
- The 3 numbered warning signs right under "## Warning signs" must be signs the official source names or clearly describes. A warning sign that is not in the source = FAIL.
- Every step under "## How to protect yourself" must come from the official source or from the checked list below (faithful rewording is fine). A step that is not in the source and not in the list = FAIL.
- The reporting places and follow-up steps listed below are checked official guidance — they are allowed even if the source does not mention them.
- Loss amounts or statistics must appear in the source. Any product or service price = FAIL.
${vanLista ? '' : '(No checked advice list for this channel: protection steps must come from the source.)\n'}${csalasTenyTar(csatorna)}
`;
}
