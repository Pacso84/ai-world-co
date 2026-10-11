// core/hirado-kuldes.js — az MI-híradó kiküldésének szövegei és jelölései. Hálózat nélkül.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'fs';
import { fbFelirat, bufferSzoveg, hatravan, BUFFER_MEZO, HIRADO_DIR } from './hirado-kuldes.js';
import { BIO_LINE, AI_JELOLES } from './social-text.js';

let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 hirado-kuldes');

const H = { datum: '2026-10-11', video_slug: 'today-in-ai-2026-10-11', cikk_slug: 'google-vids-new-point-in-time-editing-explained',
  szoveg: 'Today in AI, October 11: Google Vids now shows only what\'s on screen at each moment, so editing videos with captions and logos feels calmer. Our AI news host has the story.' };

t('Facebook: első sor a mobil vágása elé fér, utána a CIKK linkje és az MI-jelölés', () => {
  const f = fbFelirat(H);
  const elso = f.split('\n')[0];
  assert.ok(elso.length <= 125, 'az első sor hosszabb 125-nél: ' + elso.length);
  assert.match(f, /👉 https:\/\/aiworldhq\.com\/article\/google-vids-new-point-in-time-editing-explained/);
  assert.ok(f.endsWith(AI_JELOLES), '🔴 MI-jelölés nélkül menne ki (EU AI Act)');
});

t('TikTok: begépelhető domain (nincs kattintható link), Threads: a cikk linkje', () => {
  const tt = bufferSzoveg(H, 'tiktok');
  assert.ok(tt.includes(BIO_LINE), 'a TikTok-szövegből hiányzik a begépelhető domain');
  assert.ok(!tt.includes('https://'), 'a TikTokra nyers URL menne (nem kattintható)');
  assert.ok(tt.includes(AI_JELOLES));
  assert.match(bufferSzoveg(H, 'threads'), /https:\/\/aiworldhq\.com\/article\/google-vids/);
});

t('jelölés: ami kiment, az nincs a hátralévők között; csak tiktok/threads a Bufferen', () => {
  assert.deepEqual(hatravan(H), ['posted_fb', 'posted_tiktok', 'posted_threads']);
  assert.deepEqual(hatravan({ ...H, posted_fb: 'x', posted_tiktok: 'y' }), ['posted_threads']);
  assert.deepEqual(Object.keys(BUFFER_MEZO).sort(), ['threads', 'tiktok']);
});

t('📁 minden content/hirado/*.json teljes: dátum, videó, VALÓDI cikk, szöveg', () => {
  const cikkSlugok = new Set(readdirSync(new URL('../content/articles/', import.meta.url))
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(readFileSync(new URL('../content/articles/' + f, import.meta.url), 'utf-8'))._meta?.slug; } catch { return null; } }));
  for (const f of readdirSync(HIRADO_DIR).filter(x => x.endsWith('.json'))) {
    const h = JSON.parse(readFileSync(new URL('../content/hirado/' + f, import.meta.url), 'utf-8'));
    assert.equal(f, h.datum + '.json', f + ': a fájlnév nem a dátum');
    assert.match(h.video_slug, /^[a-z0-9-]+$/, f + ': hibás video_slug');
    assert.ok(cikkSlugok.has(h.cikk_slug), f + ': 🔴 a cikk nem létezik — halott link menne ki: ' + h.cikk_slug);
    assert.ok(String(h.szoveg || '').length > 20, f + ': nincs szöveg');
  }
});

if (hiba) { console.log(`\n❌ hirado-kuldes.test: ${hiba} hiba`); process.exit(1); }
console.log('\n✅ hirado-kuldes.test: mind rendben');
