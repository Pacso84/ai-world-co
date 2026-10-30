// ✉️ HETI HÍRLEVÉL (2026-10-30, user: „csináljuk”). Ingyenes Brevo-csomag (napi 300 levél), hivatalos API:
//   POST /v3/emailCampaigns (vázlat) → POST /v3/emailCampaigns/{id}/sendNow
//   (developers.brevo.com/reference/create-email-campaign, …/send-email-campaign-now).
// Tartalom: a vasárnapi heti összefoglaló (this-week-in-ai-…, core/heti-hirado.js hetiOsszefoglalo/focimek) —
// a cím, a „Röviden” mondat, az 5 hír címe, link a teljes cikkre (?src=nl) + a hét 2 legújabb útmutatója.
// CSAK ANGOLUL (a közönség US/nemzetközi). MI-jelölés a levélben is (EU AI Act); leiratkozás: a Brevo {{ unsubscribe }}.
//
// KILL-SWITCH (memória: a config `enabled` önmagában nem kapcsol ki semmit → itt, a core/ oldalon dől el):
// küldés CSAK ha config.newsletter.enabled === true ÉS van lista-azonosító + érvényes feladó ÉS van BREVO_API_KEY.
// Egy heti cikket CSAK EGYSZER küld ki (content/hirlevel-naplo.json, slug szerint).
//
//   node core/hirlevel.js --preview <fájl.html>   → helyi előnézet, hálózat nélkül
//   node core/hirlevel.js --send                  → a CI hívja; ha nincs mit / nincs bekapcsolva, csendben kilép
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hetiOsszefoglalo, focimek } from './heti-hirado.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const NAPLO_UT = join(ROOT, 'content', 'hirlevel-naplo.json');
export const SITE = 'https://aiworldhq.com';
export const SRC = 'src=nl';   // jelölt link → a napi riportban mérhető, mint a Threads ?src=th
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A config.json `newsletter` blokkjából. Bármi hiányzik/hibás → be: false. */
export function hirlevelBeallitas(cfg, env = {}) {
  const n = (cfg && cfg.newsletter) || {};
  // 10-30: a FŐ szolgáltató a Kit (ingyenes csomag, 10 000 feliratkozóig; a levél aljára a Kit SAJÁT postacíme kerülhet —
  // a user lakcímet nem ad meg; help.kit.com/en/articles/2502494). A Brevo-ág megmarad tartaléknak.
  const szolg = n.provider === 'brevo' ? 'brevo' : 'kit';
  if (szolg === 'kit') {
    const kulcs = String(env.KIT_API_KEY || '').trim();
    const be = n.enabled === true && kulcs.length > 10;
    return { be, szolg, kulcs: be ? kulcs : '' };
  }
  const lista = Number(n.list_id);
  const felado = { name: String(n.sender_name || 'AI World HQ').trim(), email: String(n.sender_email || '').trim() };
  const kulcs = String(env.BREVO_API_KEY || '').trim();
  const be = n.enabled === true && Number.isInteger(lista) && lista > 0 && EMAIL.test(felado.email) && kulcs.length > 10;
  return { be, szolg, lista, felado, kulcs: be ? kulcs : '' };
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fm = (md, k) => ((String(md).match(new RegExp(`^${k}:\\s*["']?(.+?)["']?\\s*$`, 'm')) || [])[1]) || '';
const roviden = md => ((String(md).match(/^> \*\*In short:\*\*\s*(.+)$/m) || [])[1] || '').replace(/\*\*/g, '').trim();
const link = slug => `${SITE}/article/${slug}?${SRC}`;

/** A levél tárgya + HTML + sima szöveg. `heti`: {slug, md, cim}; `utmutatok`: [{slug, cim}] (max 2). */
export function hirlevelTartalom(heti, utmutatok = []) {
  const cim = heti.cim || fm(heti.md, 'title');
  const hirek = focimek(heti.md, 5);
  const rov = roviden(heti.md);
  const ut = utmutatok.slice(0, 2);
  const targy = cim.replace(/\s*\((?:[A-Z][a-z]+ \d{1,2}, \d{4})\)\s*$/, '') || 'This Week in AI';
  const torzs = leiratkozas => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;font-family:Helvetica,Arial,sans-serif;color:#1f1d18;background:#fffdf8;border:1px solid #d9d1c0;border-radius:8px">
<tr><td style="padding:28px 28px 8px"><p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#4d7563">AI WORLD HQ · weekly</p>
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25">${esc(cim)}</h1>
${rov ? `<p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#4a463d">${esc(rov)}</p>` : ''}</td></tr>
<tr><td style="padding:0 28px"><p style="margin:0 0 8px;font-size:14px;font-weight:700">This week's stories</p>
<ol style="margin:0 0 20px;padding-left:20px;font-size:16px;line-height:1.6">${hirek.map(h => `<li>${esc(h)}</li>`).join('')}</ol>
<p style="margin:0 0 24px"><a href="${link(heti.slug)}" style="display:inline-block;background:#4d7563;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:6px">Read the full roundup</a></p></td></tr>
${ut.length ? `<tr><td style="padding:0 28px 8px;border-top:1px solid #e6dfcf"><p style="margin:18px 0 8px;font-size:14px;font-weight:700">New step-by-step guides</p>
${ut.map(u => `<p style="margin:0 0 10px;font-size:16px;line-height:1.5"><a href="${link(u.slug)}" style="color:#3b5e4f">${esc(u.cim)}</a></p>`).join('')}</td></tr>` : ''}
<tr><td style="padding:16px 28px 26px;border-top:1px solid #e6dfcf;font-size:12px;line-height:1.5;color:#7a7466">
This newsletter is put together from articles written by AI. They pass automated fact and quality checks, and our editor spot-checks published articles every day.${leiratkozas ? `<br>
You get this email because you subscribed at aiworldhq.com. <a href="{{ unsubscribe }}" style="color:#7a7466">Unsubscribe</a>` : ''}</td></tr>
</table>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(cim)}</title></head>
<body style="margin:0;background:#f3efe6"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">${torzs(true)}</td></tr></table></body></html>`;
  const szoveg = [cim, '', rov, '', "This week's stories:", ...hirek.map((h, i) => `${i + 1}. ${h}`), '', `Read the full roundup: ${link(heti.slug)}`,
    ...(ut.length ? ['', 'New step-by-step guides:', ...ut.map(u => `- ${u.cim}: ${link(u.slug)}`)] : []), '',
    'This newsletter is put together from articles written by AI; our editor spot-checks published articles every day.', 'Unsubscribe: {{ unsubscribe }}'].join('\n');
  return { targy, html, kitHtml: torzs(false), elonezet: rov.slice(0, 140), szoveg, hirDb: hirek.length };
}

/** Mit kell kiküldeni? A friss (≤3 napos) heti cikk, ha még nincs a naplóban; különben null. */
export function kuldendo(cikkek, naplo = {}, ma = new Date().toISOString()) {
  const heti = hetiOsszefoglalo(cikkek, ma);
  if (!heti || (naplo.kuldve || {})[heti.slug]) return null;
  const het = Date.parse(ma) - 7 * 864e5;
  const utmutatok = cikkek.filter(c => c.guide && Date.parse(c.published_at) >= het && Date.parse(c.published_at) <= Date.parse(ma))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)).slice(0, 2);
  return { heti, utmutatok };
}

/** Brevo: vázlat-kampány a listára, majd azonnali küldés. `fetchFn` cserélhető (teszt). */
export async function brevoKuldes(b, t, { fetchFn = fetch, nev } = {}) {
  const fej = { 'api-key': b.kulcs, 'content-type': 'application/json', accept: 'application/json' };
  const r = await fetchFn('https://api.brevo.com/v3/emailCampaigns', { method: 'POST', headers: fej, body: JSON.stringify({
    name: nev || t.targy, subject: t.targy, sender: b.felado, htmlContent: t.html, recipients: { listIds: [b.lista] } }) });
  if (!r.ok) throw new Error(`Brevo kampány-létrehozás: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const { id } = await r.json();
  const s = await fetchFn(`https://api.brevo.com/v3/emailCampaigns/${id}/sendNow`, { method: 'POST', headers: fej });
  if (!s.ok) throw new Error(`Brevo küldés (kampány ${id}): HTTP ${s.status} ${(await s.text()).slice(0, 200)}`);
  return id;
}

/** Kit (API v4): broadcast azonnali küldési idővel, minden feliratkozónak (developers.kit.com/api-reference/broadcasts). */
export async function kitKuldes(b, t, { fetchFn = fetch, nev, most = new Date().toISOString() } = {}) {
  const r = await fetchFn('https://api.kit.com/v4/broadcasts', { method: 'POST',
    headers: { 'X-Kit-Api-Key': b.kulcs, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ subject: t.targy, preview_text: t.elonezet || t.targy, content: t.kitHtml, description: nev || t.targy,
      public: false, published_at: most, send_at: most }) });
  if (!r.ok) throw new Error(`Kit broadcast: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j?.broadcast?.id ?? j?.id ?? '?';
}

function cikkekBetolt() {
  const dir = join(ROOT, 'content', 'articles'); const ki = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try { const j = JSON.parse(readFileSync(join(dir, f), 'utf-8')); const m = j._meta || {}; const md = j.article_markdown || '';
      ki.push({ slug: m.slug, md, cim: fm(md, 'title') || m.slug, published_at: m.published_at, guide: f.includes('_GUIDE_') }); } catch { /* sérült fájl */ }
  }
  return ki;
}
const naploBe = () => { try { return JSON.parse(readFileSync(NAPLO_UT, 'utf-8')); } catch { return { kuldve: {} }; } };

const kozvetlen = process.argv[1] && process.argv[1].endsWith('hirlevel.js');
if (kozvetlen) {
  const arg = process.argv.slice(2);
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
  if (arg[0] === '--preview') {
    const cikkek = cikkekBetolt();
    const heti = cikkek.filter(c => /^this-week-in-ai-/.test(c.slug || '')).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0];
    const k = kuldendo(cikkek, {}, heti ? new Date(Date.parse(heti.published_at) + 36e5).toISOString() : undefined);
    if (!k) { console.log('nincs heti cikk'); process.exit(0); }
    const t = hirlevelTartalom(k.heti, k.utmutatok);
    writeFileSync(arg[1] || 'hirlevel-elonezet.html', t.html); console.log(`✉️ előnézet: ${arg[1]} — tárgy: ${t.targy} · ${t.hirDb} hír · ${k.utmutatok.length} útmutató`);
  } else if (arg[0] === '--send') {
    const b = hirlevelBeallitas(cfg, process.env);
    if (!b.be) { console.log('✉️ hírlevél: nincs bekapcsolva (config.newsletter / KIT_API_KEY) — kihagyom'); process.exit(0); }
    const naplo = naploBe(); const k = kuldendo(cikkekBetolt(), naplo);
    if (!k) { console.log('✉️ hírlevél: nincs új heti összefoglaló — kihagyom'); process.exit(0); }
    const t = hirlevelTartalom(k.heti, k.utmutatok);
    if (t.hirDb < 3) { console.log(`⚠️ hírlevél: a heti cikkben csak ${t.hirDb} hír-alcím — nem küldöm`); process.exit(0); }
    try {
      const nev = `Weekly ${k.heti.published_at.slice(0, 10)}`;
      const id = b.szolg === 'kit' ? await kitKuldes(b, t, { nev }) : await brevoKuldes(b, t, { nev });
      naplo.kuldve = { ...(naplo.kuldve || {}), [k.heti.slug]: { at: new Date().toISOString(), kampany: id } };
      writeFileSync(NAPLO_UT, JSON.stringify(naplo, null, 2) + '\n');
      console.log(`✉️ hírlevél KIMENT: „${t.targy}” (${b.szolg} ${id})`);
    } catch (e) { console.log('⚠️ hírlevél-küldés hiba: ' + e.message); process.exit(0); }
  }
}
