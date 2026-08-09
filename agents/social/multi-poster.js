// ===================================================================
// TÖBBCSATORNÁS POSZTER — Threads és X (Make webhook)
// ===================================================================
//
// Ugyanazt a content/social/<slug>.json sort küldi ki, mint a Facebook-
// poszter, csak más csatornára és más karakterkorláttal.
//
// MIÉRT KÜLÖN FÁJL, ÉS MIÉRT NEM NYÚLUNK A poster.js-HEZ:
// a Facebook a forgalmunk ~90%-át adja. Egy közös refaktor kockáztatná azt,
// ami működik, cserébe a kódismétlés megszüntetéséért. Ez rossz csere. Ez a
// fájl a KÉT ÚJ csatorna közös kódja — köztük nincs ismétlés.
//
// MIÉRT ÉPP EZ A KÉT CSATORNA (2026-08-09, mérve):
// A Pinterest 189 pinből 0 látogatót hozott. A tanulság: egy 0 követős fiók
// csak ott hoz forgalmat, ahol a platform IDEGENEKNEK is megmutatja a
// tartalmat. A Facebook azért működik nálunk (3 követő mellett napi ~26
// látogató!), mert a Meta ajánlómotorja kiteszi a posztjainkat. A Threads
// UGYANAZT a motort használja — ez a legjobb fogadásunk. Az X gyengébb
// (a külső linkes posztot visszafogja), de olcsó kipróbálni.
//
// SZABÁLYOK (ugyanaz, mint a Facebook-poszterben — szándékosan):
//   - HÍR csak 7 napon belül, ÚTMUTATÓ örökzöld (nem évül el)
//   - a rögzített _meta.slug a kulcs (a címből visszafejtés kártékony volt)
//   - ha a cikk nem található, KIHAGYJUK a kört — nem dobjuk el némán
//   - futásonként legfeljebb --limit poszt, a helyek fele az örökzöldé
//   - a webhook URL env-ből jön, SOHA nem kerül a repóba
//   - webhook nélkül a poszter alszik (nem hibázik)
//
// FUTTATÁS:
//   node agents/social/multi-poster.js --channel threads [--limit 2] [--dry]
//   node agents/social/multi-poster.js --channel x       [--limit 2] [--dry]
// ===================================================================

import 'dotenv/config';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { selectSocialBatch } from '../../core/social-queue.js';
import { composePost, CHANNELS } from '../../core/social-text.js';
import { scenarioVerdict } from '../../core/scenario-guard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SOCIAL_DIR = join(ROOT, 'content', 'social');
const ARTICLES_DIR = join(ROOT, 'content', 'articles');
const FRESH_DAYS = 7;

// Csatornánkénti beállítás. A kép-sorrend eltér, mert a felületek másképp
// vágnak: a Threads mobil-első, függőleges hírfolyam (4:5 tölti ki), az X
// idővonala viszont fekvő képekre van szabva — ott az 1,91:1 néz ki jobban.
const CHANNEL_CFG = {
  threads: {
    envHook: 'THREADS_MAKE_WEBHOOK_URL', envScenario: 'THREADS_MAKE_SCENARIO_ID',
    pkg: 'threads', icon: '🧵', imgOrder: ['fb', 'share', 'images']
  },
  x: {
    envHook: 'X_MAKE_WEBHOOK_URL', envScenario: 'X_MAKE_SCENARIO_ID',
    pkg: 'twitter', icon: '𝕏', imgOrder: ['share', 'fb', 'images']
  }
};

// ELŐ-ELLENŐRZÉS: tényleg kijut-e a poszt? (core/scenario-guard.js)
// A Make webhookja MINDIG "Accepted" 200-at ad, ha a cím létezik — akkor is,
// ha a forgatókönyv nincs elmentve, ki van kapcsolva, vagy nincs benne
// kimeneti modul. 2026-08-09-én élesben pont ezt láttuk: friss webhook-cím,
// "Accepted", és a fiókban EGYETLEN forgatókönyv sem volt mögötte.
// Enélkül a poszter sikernek venné, `posted_*: true` jelölést írna, és a
// cikk soha többé nem kerülne sorra. Így veszett el 38 pin júliusban.
async function checkScenario(cfg) {
  const id = (process.env[cfg.envScenario] || '').trim();
  const token = (process.env.MAKE_API_TOKEN || '').trim();
  let scenario = null, apiFailed = false;
  if (id && token) {
    try {
      const r = await fetch(`https://eu1.make.com/api/v2/scenarios/${id}`, {
        headers: { Authorization: 'Token ' + token }, signal: AbortSignal.timeout(15000)
      });
      if (r.ok) scenario = (await r.json()).scenario || null;
      else apiFailed = true;
    } catch { apiFailed = true; }
  }
  return scenarioVerdict({
    scenario, requiredPackage: cfg.pkg, hasId: !!id, apiFailed, noToken: !token
  });
}

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const ci = args.indexOf('--channel');
const CHANNEL = ci !== -1 && args[ci + 1] ? String(args[ci + 1]).toLowerCase() : '';
const li = args.indexOf('--limit');
const LIMIT = li !== -1 && args[li + 1] ? parseInt(args[li + 1], 10) || 2 : 2;

function slugify(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
}

// slug → { published_at, guide }. A RÖGZÍTETT _meta.slug a kulcs; a címből
// képzett változat csak tartalék a régi social-fájlokhoz. (2026-08-02-i
// tanulság: a visszafejtés miatt 210 fájl nem talált cikket, és 18 friss
// poszt némán elveszett.)
function publishedMap() {
  const map = {};
  if (!existsSync(ARTICLES_DIR)) return map;
  for (const f of readdirSync(ARTICLES_DIR).filter(x => x.startsWith('ARTICLE_') && x.endsWith('.json'))) {
    try {
      const d = JSON.parse(readFileSync(join(ARTICLES_DIR, f), 'utf-8'));
      const isGuide = d._meta?.type === 'guide' || f.startsWith('ARTICLE_GUIDE');
      const rec = { at: d._meta?.published_at || '', guide: isGuide };
      if (d._meta?.slug) map[d._meta.slug] = rec;
      const m = (d.article_markdown || '').match(/^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m);
      const legacy = slugify((m && m[1]) || d.original_title || f);
      if (legacy && !map[legacy]) map[legacy] = rec;
    } catch { /* kihagyjuk */ }
  }
  return map;
}

function realSlug(post) {
  const fromUrl = String(post.url || '').split('/article/')[1];
  return (fromUrl || post.slug || '').replace(/\.html$/, '').replace(/[?#].*$/, '');
}

// Az első LÉTEZŐ kép a csatorna sorrendje szerint. HEAD-del ellenőrizzük,
// mert a 7 napnál régebbi cikkhez már nincs friss share-kép.
async function pickImage(site, slug, order) {
  for (const dir of order) {
    const cand = `${site}/assets/${dir}/${slug}.jpg`;
    try {
      const h = await fetch(cand, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
      if (h.ok) return cand;
    } catch { /* következő jelölt */ }
  }
  return `${site}/assets/og-default.jpg`;
}

async function main() {
  const cfg = CHANNEL_CFG[CHANNEL];
  const rules = CHANNELS[CHANNEL];
  if (!cfg || !rules) {
    console.log(`⚠️  Ismeretlen csatorna: "${CHANNEL}". Használható: ${Object.keys(CHANNEL_CFG).join(', ')}`);
    return;
  }
  console.log(`${cfg.icon} ${rules.label.toUpperCase()} POSZTER INDUL (korlát: ${rules.limit} karakter)`);
  console.log('─'.repeat(60));

  const hook = (process.env[cfg.envHook] || '').trim();
  if (!hook) { console.log(`   ⏭️  Nincs ${cfg.envHook} — alszom (állítsd be a .env-ben / GitHub Secrets-ben).`); return; }
  if (!existsSync(SOCIAL_DIR)) { console.log('   💤 Nincs social mappa.'); return; }

  const verdict = await checkScenario(cfg);
  if (!verdict.send) {
    console.log(`   ⛔ NEM KÜLDÖK: ${verdict.reason}`);
    console.log('      A sor ÉRINTETLEN marad — semmi nem vész el, javítás után magától továbbmegy.\n');
    return;
  }

  const pub = publishedMap();
  const now = Date.now();
  const queue = [];

  for (const f of readdirSync(SOCIAL_DIR).filter(x => x.endsWith('.json'))) {
    const path = join(SOCIAL_DIR, f);
    let post;
    try { post = JSON.parse(readFileSync(path, 'utf-8')); } catch { continue; }
    if (post[rules.field]) continue;                  // erre a csatornára már lezárva
    if (!post.facebook || !post.url) continue;        // a szöveg forrása közös

    const rec = pub[realSlug(post)] || pub[post.slug];
    if (!rec) continue;                               // inkább várunk, mint hogy némán eldobjuk
    const pubAt = rec.at || '';
    const isGuide = !!rec.guide;
    if (!isGuide) {
      const age = pubAt ? (now - new Date(pubAt).getTime()) : Infinity;
      if (age > FRESH_DAYS * 24 * 3600e3) {
        post[rules.field] = 'skipped-stale';
        if (!DRY) writeFileSync(path, JSON.stringify(post, null, 2), 'utf-8');
        continue;
      }
    }
    queue.push({ path, post, pubAt, isGuide });
  }

  if (!queue.length) { console.log('   💤 Nincs kiküldendő poszt.'); return; }

  // A helyek fele az örökzöld útmutatóé (core/social-queue.js) — enélkül a
  // friss sor sosem fogy el, és az útmutatók örökre a sor végén maradnak.
  const freshCut = now - FRESH_DAYS * 24 * 3600e3;
  for (const x of queue) x.isFresh = !!(x.pubAt && new Date(x.pubAt).getTime() >= freshCut);
  const batch = selectSocialBatch(queue, LIMIT);
  const nEver = batch.filter(x => !x.isFresh).length;
  console.log(`   📋 Sorban: ${queue.length} | most: ${batch.length} (${batch.length - nEver} friss + ${nEver} örökzöld)${DRY ? ' (PRÓBA — nem küldöm)' : ''}\n`);

  let sent = 0, failed = 0, truncated = 0;
  for (const { path, post } of batch) {
    const composed = composePost({ text: post.facebook, url: post.url, channel: CHANNEL });
    if (!composed) { console.log(`   ⏭️  ${String(post.title).slice(0, 40)} — nem állítható össze, kihagyom`); continue; }
    if (composed.truncated) truncated++;

    const site = post.url.replace(/(https?:\/\/[^/]+).*/, '$1');
    const image = await pickImage(site, post.slug, cfg.imgOrder);

    console.log(`${cfg.icon} ${String(post.title).slice(0, 50)}...`);
    console.log(`   ${composed.weight}/${rules.limit} karakter${composed.truncated ? ' (csonkítva)' : ''}`);
    if (DRY) { console.log(`   (próba) ${composed.body.slice(0, 80).replace(/\n/g, ' ')}…`); continue; }

    try {
      const r = await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: composed.body, link: post.url, title: post.title || '', image }),
        signal: AbortSignal.timeout(20000)
      });
      if (r.ok) {
        post[rules.field] = true;
        post[rules.field + '_at'] = new Date().toISOString();
        writeFileSync(path, JSON.stringify(post, null, 2), 'utf-8');
        sent++;
        console.log(`   ✅ Kiküldve a Make-nek (→ ${rules.label})`);
      } else {
        failed++;
        console.log(`   ❌ Webhook HTTP ${r.status} — marad a sorban`);
      }
    } catch (e) {
      failed++;
      console.log(`   ❌ ${e.message.slice(0, 60)} — marad a sorban`);
    }
  }

  console.log('─'.repeat(60));
  console.log(`📊 ${rules.label}: ${sent} kiküldve, ${failed} sikertelen, ${truncated} csonkítva, sorban maradt: ${queue.length - batch.length}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('💥 MULTI-POSTER HIBA:', e); process.exit(1); });
