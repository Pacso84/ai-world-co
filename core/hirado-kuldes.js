// ===================================================================
// MI-HÍRADÓ KÜLDÉSE — Facebook Reel + TikTok + Threads (2026-10-11)
// ===================================================================
// User (10-11, a mini-híradó megnézése után): „nagyon jó! mehet ki mindenhova most!"
//
// A híradó (a beszélő kabala + oldalt a cikk borítója) egy KÉSZ, álló videó a
// website/assets/video/shorts/<video_slug>.mp4 helyen — a build kimásolja, a
// deploy kiteszi. Ez a modul csak KIKÜLDI, a meglévő, élesben bizonyított
// csövekkel: Facebook Reel → Make (sendReel, HEAD-ellenőrzéssel), TikTok és
// Threads → Buffer (createPost). A leírás a cikkre mutat (content/hirado/<nap>.json).
//
// JELÖLÉS: a json `posted_fb` / `posted_tiktok` / `posted_threads` mezői — a
// workflow visszacommitolja, így ugyanaz a híradó egy csatornára SOSEM megy
// ki kétszer. A TikTok napi plafonja (config) itt is él, a Buffertől lekérdezve.
//
// Futtatás: CSAK a .github/workflows/hirado-kuldes.yml (a Make-webhook titok ott él).
//   node core/hirado-kuldes.js [--datum 2026-10-11] [--dry]
// ===================================================================
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sendReel, reelVideoUrl, reelArticleUrl, MOBIL_VAGAS } from './reel-post.js';
import { composePost, followCta, trimToWords, AI_JELOLES } from './social-text.js';
import { lekerSzervezet, lekerCsatornak, lekerPosztok, createPost } from './buffer-api.js';
import { capFor, allowedNow, countSentToday } from './channel-cap.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const HIRADO_DIR = join(ROOT, 'content', 'hirado');
// A Buffer szolgáltatás-neve → a jelölő mező.
export const BUFFER_MEZO = { tiktok: 'posted_tiktok', threads: 'posted_threads' };

/** A Facebook Reel leírása: az első sor a mobil vágása elé fér, aztán a link, követés, MI-jelölés. */
export function fbFelirat(h) {
  const elso = trimToWords(String(h.szoveg || ''), MOBIL_VAGAS);
  const cta = followCta(h.cikk_slug);
  return `${elso}\n\n👉 ${reelArticleUrl(h.cikk_slug)}${cta ? `\n\n${cta}` : ''}\n\n${AI_JELOLES}`;
}

/** A Buffer-csatorna szövege (TikTokon begépelhető domain, Threadsen link) — vagy '' ha nem fér ki. */
export function bufferSzoveg(h, csatorna) {
  const p = composePost({ text: h.szoveg, url: reelArticleUrl(h.cikk_slug), channel: csatorna });
  return p ? p.body : '';
}

/** Mely csatornákra kell még kimennie? (a jelölés alapján) */
export function hatravan(h) {
  return ['posted_fb', 'posted_tiktok', 'posted_threads'].filter(m => !h[m]);
}

/** Az automata kiküldés legfeljebb ennyi napos heti híradót küld (a deploy-késés + hétfői pótlás belefér). */
export const AUTOMATA_NAP = 4;

/**
 * AUTOMATA KIKÜLDÉS (2026-10-19, user: „mehet ki automatikusan!"): az auto.yml a deploy UTÁN
 * hívja. Csak friss (≤ AUTOMATA_NAP), HETI híradót (this-week-in-ai-…) küld, és csak amíg
 * van csatorna, ahová még nem ment ki — a jelölések miatt semmi nem megy ki kétszer.
 */
export function automataMehet(h, ma = Date.now()) {
  if (!h || !h.datum || !h.video_slug) return { mehet: false, ok: 'nincs híradó' };
  if (!/^this-week-in-ai-/.test(h.video_slug)) return { mehet: false, ok: 'nem heti híradó — csak kézzel' };
  if (!hatravan(h).length) return { mehet: false, ok: 'mindenhová kiment' };
  const kor = (ma - Date.parse(h.datum + 'T00:00:00Z')) / 864e5;
  if (!(kor <= AUTOMATA_NAP)) return { mehet: false, ok: `túl régi (${Math.round(kor)} nap)` };
  return { mehet: true, ok: 'mehet' };
}

function betolt(datum) {
  if (!existsSync(HIRADO_DIR)) return null;
  const fajlok = readdirSync(HIRADO_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const f = datum ? `${datum}.json` : fajlok.at(-1);
  if (!f || !fajlok.includes(f)) return null;
  const ut = join(HIRADO_DIR, f);
  return { ut, h: JSON.parse(readFileSync(ut, 'utf-8')) };
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const di = args.indexOf('--datum');
  const b = betolt(di >= 0 ? args[di + 1] : '');
  if (!b) { console.log('💤 Nincs ilyen híradó (content/hirado/).'); return; }
  const { ut, h } = b;
  const video = reelVideoUrl(h.video_slug);
  if (args.includes('--auto')) {
    const d = automataMehet(h);
    if (!d.mehet) { console.log(`💤 Heti híradó automata: ${h.datum} — ${d.ok}`); return; }
    // A videónak már élnie kell a honlapon (a Buffer és a Make is URL-ről tölti le).
    const fej = await fetch(video, { method: 'HEAD' }).catch(() => null);
    if (!fej || fej.status !== 200) { console.log(`⏳ Heti híradó automata: a videó még nincs kint (${fej ? fej.status : 'hiba'}) — a következő futás próbálja.`); return; }
  }
  const ment = () => { if (!dry) writeFileSync(ut, JSON.stringify(h, null, 2) + '\n', 'utf-8'); };
  console.log(`📺 MI-HÍRADÓ ${h.datum}${dry ? '  🧪 PRÓBA' : ''}\n   videó: ${video}\n   cikk : ${reelArticleUrl(h.cikk_slug)}`);
  let hiba = 0;

  // ── FACEBOOK REEL (Make) ──
  if (h.posted_fb) console.log('\n📘 Facebook: már kiment — kihagyom.');
  else {
    const caption = fbFelirat(h);
    console.log('\n📘 Facebook Reel — leírás:\n' + caption.replace(/^/gm, '   │ '));
    const r = await sendReel({ video, caption, hook: (process.env.MAKE_REEL_WEBHOOK_URL || '').trim(), dry });
    if (r.ok && r.dry) console.log('   🧪 próba — a videó címe él, nem küldtem el.');
    else if (r.ok || r.sent === 'unknown') {
      h.posted_fb = new Date().toISOString(); ment();
      console.log(r.ok ? `   ✅ Átvette a Make (HTTP ${r.status})` : '   ⚠️ bizonytalan kimenetel — megjelöltem, hogy ne menjen ki kétszer');
    } else { hiba++; console.log('   ❌ ' + r.reason); }
  }

  // ── TIKTOK + THREADS (Buffer) ──
  const token = (process.env.BUFFER_ACCESS_TOKEN || '').trim();
  const api = { token };
  if (!token) { console.log('\n⏭️  Nincs BUFFER_ACCESS_TOKEN — TikTok/Threads kimarad.'); }
  else {
    const org = await lekerSzervezet(api);
    const cs = org.error ? { error: org.error } : await lekerCsatornak(org.id, api);
    if (cs.error) { hiba++; console.log('\n❌ Buffer-csatornák: ' + cs.error); }
    else {
      const config = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf-8'));
      for (const c of cs.csatornak.filter(c => !c.isDisconnected && !c.isLocked)) {
        const kulcs = String(c.service).toLowerCase();
        const mezo = BUFFER_MEZO[kulcs];
        if (!mezo) continue;
        if (h[mezo]) { console.log(`\n🎵 ${kulcs}: már kiment — kihagyom.`); continue; }
        const plafon = capFor(config, kulcs);
        if (plafon !== null) {
          const p = await lekerPosztok({ organizationId: org.id, channelId: c.id }, api);
          const maiDb = p.error ? null : countSentToday(p.nodes);
          const mehet = allowedNow({ sentToday: maiDb, dailyCap: plafon, runLimit: 1 });
          console.log(`\n📊 ${kulcs}: napi plafon ${plafon} · ma eddig ${maiDb === null ? '?' : maiDb} → ${mehet > 0 ? 'mehet' : 'NEM mehet'}`);
          if (mehet <= 0 && !dry) continue;
        }
        const text = bufferSzoveg(h, kulcs);
        if (!text) { console.log(`   ⏭️ ${kulcs}: a szöveg nem fér ki`); continue; }
        console.log(`\n🎵 ${kulcs} — szöveg:\n` + text.replace(/^/gm, '   │ '));
        if (dry) { console.log('   🧪 próba — nem küldtem el.'); continue; }
        const r = await createPost({ channelId: c.id, channelKey: kulcs, text, video }, api);
        if (r.error) { hiba++; console.log('   ❌ ' + r.error); continue; }
        h[mezo] = new Date().toISOString(); ment();
        console.log('   ✅ kiküldve');
      }
    }
  }
  console.log(`\n➡️  Hátravan: ${hatravan(h).join(', ') || 'semmi — mindenhová kiment'}`);
  if (hiba) process.exit(1);
}

const kozvetlen = process.argv[1] && process.argv[1].endsWith('hirado-kuldes.js');
if (kozvetlen) main().catch(e => { console.error('💥 hirado-kuldes:', e.message); process.exit(1); });
