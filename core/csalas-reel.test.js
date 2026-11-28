// Csalás-Reel (13. rész, 2026-11-28) — szkript a VALÓDI csalás-hírből (core/fixtures), sor-döntés, leírás,
// a motor „csalas” elrendezése, és a bekötés (reel-post / reel-queue / Facebook-poszter). Ingyenes, hálózat nélkül.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  csalasReelSzkript, kovetkezoCsalasReel, kuldendoCsalasReel, maiCsalasVideok, csalasReelCaption,
  csalasFotoPosztHelyettReel, rovidMagyarazat, elsoVedekezes, CSALAS_REEL_FRISS_NAP, eletbenTartandoCsalasVideok,
} from './csalas-reel.js';
import { kimondottDb, becsultHossz, kockaSvg, idovonal, becsultSzavak, SZOVEG_ELRENDEZES, CSALAS_KARTYA, SABLONOK } from './motion-reel.js';
import { csalasKartyaSvg, KARTYA_SZEL } from './csalas-kep.js';
import { videoCsatornaMai } from './reel-queue.js';
import { peldaBiztonsag } from './csalas-sablon.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };
console.log('\n🧪 csalas-reel (csalás-hírből Reel)');

const VALODI = JSON.parse(readFileSync(join(ROOT, 'core', 'fixtures', 'csalas-ic3-valasztas.json'), 'utf8'));
const MD = `---\ntitle: "Scammers Are Using the 2026 Midterm Elections to Run Fake Campaign Schemes"\n---\n\n${VALODI.en}`;
const MOST = Date.parse('2026-11-28T12:00:00Z');
const ora = h => new Date(MOST - h * 3600e3).toISOString();

t('🎬 szkript a valódi csalás-hírből: horog + 3 jel + teendő + webcím, címkékkel', () => {
  const { szegmensek, reason, pelda } = csalasReelSzkript(MD);
  assert.equal(reason, '');
  assert.ok(pelda);
  assert.deepEqual(szegmensek.map(s => s.cimke), ['SCAM ALERT', 'WARNING SIGN 1 / 3', 'WARNING SIGN 2 / 3', 'WARNING SIGN 3 / 3', 'WHAT TO DO', 'FULL DETAILS']);
  assert.equal(szegmensek[0].kep, 'Scammers Are Using the 2026 Midterm Elections to Run Fake Campaign Schemes');
  assert.deepEqual(szegmensek.slice(1, 4).map(s => s.kep), ['Odd sender', 'Pressure to hurry', 'Fake registration link']);
  assert.equal(szegmensek[1].mond, 'Odd sender. The address is not from an official voter-registration source.');
  assert.equal(szegmensek[4].kep, 'Treat unexpected contact with caution');
  assert.match(szegmensek[5].kep, /aiworldhq\.com\/scams$/);
});

t('🗣️ a képen látszó szavak a kimondott szöveg részei (a szinkron felirat nem csúszik el)', () => {
  const { szegmensek } = csalasReelSzkript(MD);
  const norm = w => w.toLowerCase().replace(/[^a-z0-9-]/g, '');
  for (const s of szegmensek.filter(x => x.cimke !== 'FULL DETAILS')) {
    const mond = s.mond.split(/\s+/).map(norm);
    const kep = s.kep.split(/\s+/).map(norm);
    assert.deepEqual(mond.slice(s.elotag, s.elotag + kep.length), kep, `${s.cimke}: „${s.kep}” ≠ „${s.mond}”`);
    assert.ok(kimondottDb(s.mond) >= kep.length);
  }
});

t('⏱️ a becsült hossz rövid Reel (≤ 26 mp), és semmi nem mond ki nyers jelölést', () => {
  const { szegmensek } = csalasReelSzkript(MD);
  const mp = becsultHossz(szegmensek);
  assert.ok(mp >= 12 && mp <= 26, `becsült hossz: ${mp.toFixed(1)} mp`);
  for (const s of szegmensek) assert.ok(!/\[\[|\*\*|\]\]/.test(s.mond + s.kep), `nyers jelölés: ${s.mond}`);
});

t('✂️ rövid magyarázat: első tagmondat, túl hosszúnál üres; védekezés: a 3. fejezet első félkövér pontja', () => {
  assert.equal(rovidMagyarazat('the message warns you that you could lose your chance if you wait, so you do not stop to check.'), '');
  assert.equal(rovidMagyarazat("so you don't have time to think."), "so you don't have time to think");
  assert.equal(rovidMagyarazat('a real delivery company does not text like this.'), 'a real delivery company does not text like this');
  assert.equal(elsoVedekezes(VALODI.en), 'Treat unexpected contact with caution');
  assert.equal(elsoVedekezes('# T\n\n## A\n\n1. **x**\n\n## B\n\n1. **y**\n'), '');
  for (const l of ['hu', 'es']) assert.ok(elsoVedekezes(VALODI[l]), `${l}: pozíció szerint (fordított fejléccel) is megtalálja`);
});

t('🚫 nem sablonos szövegből nincs csalás-Reel (példa / 3 jel / cím nélkül)', () => {
  assert.equal(csalasReelSzkript('').szegmensek, null);
  assert.equal(csalasReelSzkript('---\ntitle: "X"\n---\n\n# X\n\n## A\n\ntext').szegmensek, null);
  assert.equal(csalasReelSzkript(VALODI.en).reason, 'nincs cím');
});

const C = (o = {}) => ({ type: 'news', csalas: true, slug: 'csalas-a', published_at: ora(5), csalas_video_at: '', csalas_reel_at: '', ...o });

t('📋 sor: kapcsoló KI → soha; friss csalás-hír → igen; sima hír / régi / kész → nem', () => {
  assert.equal(kovetkezoCsalasReel([C()], MOST, { be: false }), null, 'kapcsoló KI');
  assert.equal(kovetkezoCsalasReel([C()], MOST, { be: true }).slug, 'csalas-a');
  assert.equal(kovetkezoCsalasReel([C({ csalas: false })], MOST, { be: true }), null);
  assert.equal(kovetkezoCsalasReel([C({ published_at: ora(CSALAS_REEL_FRISS_NAP * 24 + 1) })], MOST, { be: true }), null, 'túl régi');
  assert.equal(kovetkezoCsalasReel([C({ csalas_reel_at: ora(30) })], MOST, { be: true }), null, 'már ment');
  assert.equal(kovetkezoCsalasReel([C({ csalas_video_at: ora(30) })], MOST, { be: true }), null, 'tegnap már készült videó');
  assert.equal(kovetkezoCsalasReel([C()], MOST, { be: true, alkalmas: () => false }), null);
});

t('📋 sor: naponta legfeljebb 1; a régebbi friss hír előbb', () => {
  const ma = C({ slug: 'mai', csalas_video_at: ora(1) });
  assert.equal(kovetkezoCsalasReel([ma, C({ slug: 'masik' })], MOST, { be: true }), null, 'ma már készült');
  const r = kovetkezoCsalasReel([C({ slug: 'ujabb', published_at: ora(2) }), C({ slug: 'regebbi', published_at: ora(20) })], MOST, { be: true });
  assert.equal(r.slug, 'regebbi');
  assert.deepEqual(maiCsalasVideok([ma, C({ slug: 'x', csalas_video_at: ora(30) })], MOST).map(c => c.slug), ['mai']);
});

t('📤 küldés: legyártott, még ki nem ment videó ≤ 2 napig (az este gyártott másnap is mehet); KI → semmi', () => {
  assert.equal(kuldendoCsalasReel([C({ csalas_video_at: ora(2) })], MOST, { be: true }).slug, 'csalas-a');
  assert.equal(kuldendoCsalasReel([C({ csalas_video_at: ora(2), csalas_reel_at: ora(1) })], MOST, { be: true }), null);
  assert.equal(kuldendoCsalasReel([C({ csalas_video_at: ora(30) })], MOST, { be: true }).slug, 'csalas-a', 'tegnap este gyártva, még nem ment');
  assert.equal(kuldendoCsalasReel([C({ csalas_video_at: ora(49) })], MOST, { be: true }), null, '2 napnál régebbi');
  assert.equal(kuldendoCsalasReel([C({ csalas_video_at: ora(2) })], MOST, { be: false }), null);
  // életben tartás: a ma gyártott (TikTok) + a még nem küldött; a tegnapi, már kiment nem
  const lista = eletbenTartandoCsalasVideok([
    C({ slug: 'ma-kiment', csalas_video_at: ora(3), csalas_reel_at: ora(2) }),
    C({ slug: 'tegnapi-var', csalas_video_at: ora(30) }),
    C({ slug: 'tegnapi-kiment', csalas_video_at: ora(30), csalas_reel_at: ora(26) }),
  ], MOST, { be: true }).map(c => c.slug);
  assert.deepEqual(lista.sort(), ['ma-kiment', 'tegnapi-var']);
  assert.deepEqual(eletbenTartandoCsalasVideok([C({ csalas_video_at: ora(3) })], MOST, { be: false }), []);
});

t('🖼️ FB-képes poszt helyett Reel: csak ha a videó elkészült / kiment (különben a képes poszt a tartalék)', () => {
  const meta = o => ({ csalas: { csatorna: 'web', forras_id: 'ic3-psa' }, ...o });
  assert.equal(csalasFotoPosztHelyettReel(meta({ csalas_video_at: ora(1) }), { be: true }), true);
  assert.equal(csalasFotoPosztHelyettReel(meta({ csalas_reel_at: ora(1) }), { be: true }), true);
  assert.equal(csalasFotoPosztHelyettReel(meta({}), { be: true }), false, 'videó nélkül a képes poszt megy');
  assert.equal(csalasFotoPosztHelyettReel(meta({ csalas_video_at: ora(1) }), { be: false }), false, 'kapcsoló KI');
  assert.equal(csalasFotoPosztHelyettReel({ csalas_video_at: ora(1) }, { be: true }), false, 'nem csalás-hír');
});

t('📝 leírás: első sor a teljes leírás linkje, 3 jel, „kitalált példa”, MI-jelölés; like/megosztás kérése nincs', () => {
  const { pelda } = csalasReelSzkript(MD);
  const c = csalasReelCaption({ slug: VALODI.slug, title: 'Scammers Are Using the 2026 Midterm Elections', subtitle: 'Learn how it works.', jelek: pelda.magyarazat });
  const sorok = c.split('\n');
  assert.equal(sorok[0], `🛡️ Full details and how to protect yourself: https://aiworldhq.com/scams/${VALODI.slug}`);
  assert.ok(sorok[0].length <= 125 + VALODI.slug.length, 'a link a mobil vágása elé fér');
  assert.ok(c.includes('1️⃣ Odd sender') && c.includes('3️⃣ Fake registration link'));
  assert.ok(c.includes('made-up example'));
  assert.ok(c.includes('Written by AI'));
  assert.ok(!/\b(like|share|follow|subscribe)\b/i.test(c), 'like/megosztás/követés kérése');
  assert.equal(csalasReelCaption({ slug: '', title: 'x' }), '');
});

t('🎨 motor: „csalas” elrendezés (kártya fent, felirat alatta), saját címke, NEM a forgó sablonok közt', () => {
  assert.ok(!SABLONOK.includes('csalas'), 'az útmutató-Reelek forgásába nem kerülhet');
  const e = SZOVEG_ELRENDEZES.csalas;
  assert.ok(CSALAS_KARTYA.y + CSALAS_KARTYA.h < e.kozepY - e.maxMag / 2 - 34 - 30, 'a címke a kártyába lógna');
  assert.ok(e.kozepY + e.lepesMaxMag / 2 + 70 + 11 <= 1290, 'a pöttysor a leírás-sávba lógna');
  const { szegmensek } = csalasReelSzkript(MD);
  const iv = idovonal(szegmensek, szegmensek.map(s => becsultSzavak(s.mond)));
  const svg0 = kockaSvg(iv, 0.1, 'csalas').toString();
  assert.ok(svg0.includes('SCAM ALERT') && !svg0.includes('QUICK STEPS'));
  const t2 = iv.szegmensek[2].kezd + 0.3;
  assert.ok(kockaSvg(iv, t2, 'csalas').toString().includes('WARNING SIGN 2 / 3'));
});

t('🃏 üzenet-kártya: a valódi példa kirajzolható, vízjeles, a kép-őrön átmegy', () => {
  const { pelda } = csalasReelSzkript(MD);
  assert.deepEqual(peldaBiztonsag(pelda), []);
  const k = csalasKartyaSvg(pelda, { maxMag: 640 });
  assert.equal(k.w, KARTYA_SZEL);
  assert.ok(k.h > 200 && k.h <= 680);
  assert.ok(/EXAMPLE/.test(k.svg), 'nincs vízjel');
  assert.ok(!/<rect width="\d+" height="\d+" fill="#f4efe6"/.test(k.svg), 'a háttér átlátszó legyen');
});

t('📱 TikTok: a mai csalás-videó a videós csatorna listájába kerül (saját poszt-szöveggel)', () => {
  const cikkek = [{ slug: 'csalas-a', type: 'news', csalas: true, csalas_video_at: new Date().toISOString() }];
  const ki = videoCsatornaMai(cikkek, s => (s === 'csalas-a' ? { text: 'x' } : null), 'posted_tiktok');
  assert.deepEqual(ki.map(x => x.slug), ['csalas-a']);
  const kint = videoCsatornaMai(cikkek, () => ({ text: 'x', posted_tiktok: '2026-11-28' }), 'posted_tiktok');
  assert.equal(kint.length, 0);
});

t('🔌 bekötés: reel-post gyárt + küld (független ág), a buffer-poszter látja, a FB-poszter kihagyja a képes posztot', () => {
  const rp = readFileSync(join(ROOT, 'core', 'reel-post.js'), 'utf8');
  assert.match(rp, /prepareCsalasReel\(ROOT, join\)/, 'a prepare nem hívja');
  assert.match(rp, /sendCsalasReel\(ROOT, join, dry\)/, 'a send nem hívja');
  assert.match(rp, /csalas_video_at: m\.csalas_video_at/, 'a cikkek betöltése nem viszi a jelölést');
  const bp = readFileSync(join(ROOT, 'agents', 'social', 'buffer-poster.js'), 'utf8');
  assert.match(bp, /csalas_video_at: data\?\._meta\?\.csalas_video_at/, 'a buffer-poszter nem látja a csalás-videót');
  const po = readFileSync(join(ROOT, 'core', 'social-published.js'), 'utf8');   // a FB-poszter innen kapja a „reel” jelzőt
  assert.match(po, /csalasFotoPosztHelyettReel\(/, 'a FB-poszter nem hagyja ki a képes posztot');
});

if (hiba) { console.log(`\n❌ csalas-reel: ${hiba} hiba`); process.exit(1); }
console.log('✅ csalas-reel: minden eset zöld');
