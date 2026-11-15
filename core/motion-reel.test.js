// TESZT — a motion design Reel (core/motion-reel.js), 2026-11-15
// Ingyenes, hálózat és ffmpeg nélküli: a szkriptet, az idővonalat, a tördelést és a képkocka-réteget nézi.
// A szövegek VALÓDI útmutatókból jönnek (content/articles) — a 10-17-i lecke: kitalált bemenet mellé néz.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  trukkSzkript, lepesRovid, becsultHossz, becsultSzavak, idovonal, illesztes, kockaSvg, allapot, sablonValaszt,
  kimondottDb, nyers, vagasHatarok, sablonCikkhez, motionLepesDb, MOTION_REEL_BE, CEL_MIN_MP, CEL_MAX_MP, HUROK_MP, LEPES_DB, SABLONOK, SZOVEG_SZELES,
  SZOVEG_ELRENDEZES, ABLAK_TETO, ABLAK_MAG, SOR_TAV
} from './motion-reel.js';
import { horogSzeles, SAV_FELSO } from './short-video.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + e.message); } };

// A legfrissebb valódi, legalább 3 lépéses útmutatók (a CI-ban is ugyanezek a fájlok vannak).
function valodiUtmutatok(db = 12) {
  const D = join(ROOT, 'content', 'articles');
  if (!existsSync(D)) return [];
  const ki = [];
  for (const f of readdirSync(D)) {
    if (!f.endsWith('.json')) continue;
    try {
      const a = JSON.parse(readFileSync(join(D, f), 'utf-8'));
      const md = a.article_markdown || '';
      if ((md.match(/^##\s*Step\s*\d+/gim) || []).length >= 3) ki.push({ slug: a._meta?.slug || f, md, d: String(a._meta?.published_at || '') });
    } catch { /* hibás fájl: nem ennek a tesztnek a dolga */ }
  }
  return ki.sort((x, y) => y.d.localeCompare(x.d)).slice(0, db);
}
const MINTAK = valodiUtmutatok();

console.log('\n🧪 motion-reel.test');

t('✅ a kapcsoló BE (user-döntés 11-15, az előnézet után); visszaállítás: false', () => {
  assert.equal(MOTION_REEL_BE, true);
});

t('van valódi mintánk (legalább 5 friss útmutató)', () => assert.ok(MINTAK.length >= 5, 'csak ' + MINTAK.length));

t('a szkript: horog + 3 lépés + webcím; a lépés sorszáma se kimondva, se a szövegben (csak a „STEP n / 3” címke)', () => {
  for (const m of MINTAK) {
    const { szegmensek, reason } = trukkSzkript(m.md);
    assert.ok(szegmensek, m.slug + ': ' + reason);
    assert.deepEqual(szegmensek.map(s => s.tipus), ['horog', 'lepes', 'lepes', 'lepes', 'vege'], m.slug);
    assert.equal(szegmensek.filter(s => s.tipus === 'lepes').length, LEPES_DB);
    for (const s of szegmensek.filter(s => s.tipus === 'lepes')) {
      assert.ok(!/^(One|Two|Three)\. /.test(s.mond), m.slug + ': kimondott sorszám (utána holt idő jön)');
      assert.equal(s.mond, s.kep + '.', m.slug);
    }
    assert.match(szegmensek.at(-1).mond, /aiworldhq dot com/);
  }
});

t('a hossz a 12–18 mp-es célon belül (becslés, valódi útmutatókon)', () => {
  for (const m of MINTAK) {
    const { szegmensek } = trukkSzkript(m.md);
    const h = becsultHossz(szegmensek);
    assert.ok(h >= CEL_MIN_MP - 1 && h <= CEL_MAX_MP + 1.5, `${m.slug}: ${h.toFixed(1)} mp`);
  }
});

t('a hosszú lépés az első tagmondatig rövidül, és nem lóg a végén névelő/elöljáró', () => {
  assert.equal(lepesRovid('Open a new chat and check for an image option'), 'Open a new chat');
  assert.equal(lepesRovid('Gather three ingredients and make a test copy'), 'Gather three ingredients');
  assert.equal(lepesRovid('Attach your selfie'), 'Attach your selfie');
  assert.equal(lepesRovid('Ask for the likely cause of the error'), 'Ask for the likely cause');
  assert.equal(lepesRovid('Run Check Accessibility — the built-in tool'), 'Run Check Accessibility');
  for (const m of MINTAK) for (const s of trukkSzkript(m.md).szegmensek.filter(s => s.tipus === 'lepes')) {
    // kivétel: igei szerkezet a végén („Sign in”, „Turn on”) — az nem lógó elöljáró
    const igei = /^(sign|log|turn|switch|opt|plug|check|set|zoom)\s(in|on|out|up)$/i.test(s.kep.split(' ').slice(-2).join(' '));
    assert.ok(igei || !/\s(a|an|the|and|or|for|to|of|in|on|with|by|from|your|any)$/i.test(s.kep), m.slug + ': „' + s.kep + '”');
  }
});

// Valósághű felolvasó-adat: a kimondott szavak száma pont annyi, amennyit vártunk (1:1 eset).
const hangokBecsult = sz => sz.map(s => becsultSzavak(s.mond));

t('idővonal: a szegmensek hézag nélkül követik egymást, a vég után a hurok jön', () => {
  const { szegmensek } = trukkSzkript(MINTAK[0].md);
  const iv = idovonal(szegmensek, hangokBecsult(szegmensek));
  for (let i = 1; i < iv.szegmensek.length; i++) assert.equal(iv.szegmensek[i].kezd, iv.szegmensek[i - 1].veg);
  assert.ok(Math.abs(iv.osszes - iv.hangVege - HUROK_MP) < 1e-9);
  // a képen látszó szavak sorrendben indulnak, a saját szegmensükön belül
  for (const s of iv.szegmensek) {
    for (let j = 1; j < s.szavak.length; j++) assert.ok(s.szavak[j].t >= s.szavak[j - 1].t);
    for (const w of s.szavak) assert.ok(w.t >= s.kezd && w.t < s.veg, `${w.w} ${w.t} ∉ [${s.kezd}, ${s.veg})`);
  }
});

t('idővonal: 1:1 megfeleltetés a felolvasó szóidőzítésével; eltérő szószámnál arányos (nem omlik össze)', () => {
  const sz = [{ tipus: 'lepes', szam: 1, db: 3, kep: 'Attach your selfie', elotag: 1, mond: 'One. Attach your selfie.' }];
  const pontos = idovonal(sz, [{ hossz: 2, szavak: [{ t: 0.1 }, { t: 0.5 }, { t: 1.0 }, { t: 1.3 }] }]);
  assert.deepEqual(pontos.szegmensek[0].szavak.map(w => w.t), [0.5, 1.0, 1.3]);   // a „One” nem látszik
  const elcsuszott = idovonal(sz, [{ hossz: 2, szavak: [{ t: 0.1 }, { t: 0.9 }] }]);
  assert.equal(elcsuszott.szegmensek[0].szavak.length, 3);
  assert.ok(elcsuszott.szegmensek[0].szavak.every(w => Number.isFinite(w.t)));
  const ures = idovonal(sz, [{ hossz: 2, szavak: [] }]);
  assert.ok(ures.szegmensek[0].szavak.every(w => Number.isFinite(w.t)));
});

t('az ELSŐ képkockán már a teljes horog látszik (nincs beúszás), és ki van emelve az első szó', () => {
  const { szegmensek } = trukkSzkript(MINTAK[0].md);
  const iv = idovonal(szegmensek, hangokBecsult(szegmensek));
  for (const sab of SABLONOK) {
    const svg = kockaSvg(iv, 0, sab).toString();
    for (const w of szegmensek[0].kep.split(' ')) assert.ok(svg.includes('>' + w.replace(/&/g, '&amp;') + '<'), `${sab}: „${w}” hiányzik az első kockáról`);
  }
});

t('HUROK: az utolsó képkocka réteg-azonos az elsővel (varrat nélküli újrakezdés)', () => {
  for (const m of MINTAK.slice(0, 4)) {
    const { szegmensek } = trukkSzkript(m.md);
    const iv = idovonal(szegmensek, hangokBecsult(szegmensek));
    for (const sab of SABLONOK) assert.equal(kockaSvg(iv, iv.osszes - 0.01, sab).toString(), kockaSvg(iv, 0, sab).toString(), m.slug + ' ' + sab);
    assert.equal(allapot(iv, iv.osszes - 0.01).hurok, true);
  }
});

t('lépésben a szó akkor jelenik meg, amikor elhangzik (karaoke), előtte nem', () => {
  const { szegmensek } = trukkSzkript(MINTAK[0].md);
  const iv = idovonal(szegmensek, hangokBecsult(szegmensek));
  const lepes = iv.szegmensek[1], utolso = lepes.szavak.at(-1);
  const elotte = kockaSvg(iv, utolso.t - 0.2, 'tinta').toString(), utana = kockaSvg(iv, utolso.t + 0.1, 'tinta').toString();
  const jel = '>' + utolso.w.replace(/&/g, '&amp;') + '<';
  assert.ok(!elotte.includes(jel) || lepes.szavak.filter(w => w.w === utolso.w).length > 1, 'a szó a kimondása előtt látszik');
  assert.ok(utana.includes(jel));
});

t('MI-jelölés (EU AI Act) és márka MINDEN sablon minden szakaszán', () => {
  const { szegmensek } = trukkSzkript(MINTAK[1].md);
  const iv = idovonal(szegmensek, hangokBecsult(szegmensek));
  for (const sab of SABLONOK) for (const s of iv.szegmensek) {
    const svg = kockaSvg(iv, s.kezd + 0.3, sab).toString();
    assert.match(svg, />AI<\/text>/, sab + ' ' + s.tipus);
    assert.match(svg, /AI WORLD HQ/);
  }
});

t('a szöveg kifér: szélesség ≤ a sáv, magasság ≤ az elrendezés; ablakos sablonnál a képablak és a leírás-sáv közt marad', () => {
  for (const m of MINTAK) for (const s of trukkSzkript(m.md).szegmensek) {
    for (const [nev, elr] of Object.entries(SZOVEG_ELRENDEZES)) {
      const ws = s.kep.split(' ');
      const keret = s.tipus === 'lepes' ? elr.lepesMaxMag : elr.maxMag;
      const { meret, sorok } = illesztes(ws, { maxMag: keret });
      const mag = sorok.length * meret * SOR_TAV;
      assert.ok(mag <= keret + 1, `${m.slug} ${nev}: ${mag} > ${keret} („${s.kep}”)`);
      for (const w of ws) assert.ok(horogSzeles(w, meret) <= SZOVEG_SZELES, `${m.slug}: túl széles szó „${w}”`);
      if (nev === 'ablakos') {
        assert.ok(elr.kozepY - mag / 2 - 80 >= ABLAK_TETO + ABLAK_MAG, `${m.slug}: a szöveg/címke rálóg a képablakra`);
        assert.ok(elr.kozepY + mag / 2 + (s.tipus === 'lepes' ? 90 : 0) <= 1290, `${m.slug}: a szöveg/pöttysor a leírás-sávba lóg („${s.kep}”)`);
      }
    }
  }
  assert.ok(ABLAK_TETO >= SAV_FELSO + 100);
});

t('sablon-forgatás: egymás utáni Reelek és napok más sablont kapnak', () => {
  assert.notEqual(sablonValaszt('2026-11-16', 0), sablonValaszt('2026-11-16', 1));
  assert.notEqual(sablonValaszt('2026-11-16', 0), sablonValaszt('2026-11-17', 0));
  assert.ok(SABLONOK.includes(sablonValaszt('2026-11-16', 5)));
});

t('raw-adat továbbadása: csak méret és csatorna (a premultiplied jelzés kiégette a színeket)', () => {
  assert.deepEqual(nyers({ width: 2, height: 3, channels: 3, premultiplied: true, size: 18, format: 'raw' }), { width: 2, height: 3, channels: 3 });
  const src = readFileSync(join(ROOT, 'core', 'motion-reel.js'), 'utf-8');
  assert.ok(!/\{\s*raw:\s*\w+\.info\s*\}/.test(src), 'van még nyers .info-továbbadás');
});

t('csendvágás: az első szó előtt 0,04, az utolsó után 0,12 mp marad; szóidőzítés nélkül nincs vágás', () => {
  assert.deepEqual(vagasHatarok([{ t: 0.3, d: 0.2 }, { t: 1.0, d: 0.4 }], 2.5), { tol: 0.26, ig: 1.52 });
  assert.deepEqual(vagasHatarok([], 2.5), { tol: 0, ig: 2.5 });
  assert.deepEqual(vagasHatarok([{ t: 0.01, d: 2.6 }], 2.5), { tol: 0, ig: 2.5 });
});

t('őr: a concat-hanglista csak fájlnevet kap (a CI-ban a relatív út duplázódott → 0 videó, 11-15)', () => {
  const src = readFileSync(join(ROOT, 'core', 'motion-reel.js'), 'utf-8');
  assert.match(src, /darabok\.push\(`p\$\{i\}\.wav`\)/);
});

t('kimondottDb: az írásjel nem szó', () => {
  assert.equal(kimondottDb('One. Attach your selfie — now.'), 5);
});

t('sablon cikkenként: ugyanarra a cikkre mindig ugyanaz; a nap útmutatói különbözőt kapnak; a hír nem számít', () => {
  const cikkek = [
    { slug: 'a', type: 'guide', published_at: '2026-11-16T04:01:00Z' },
    { slug: 'b', type: 'guide', published_at: '2026-11-16T04:02:00Z' },
    { slug: 'c', type: 'guide', published_at: '2026-11-16T12:30:00Z' },
    { slug: 'h', type: 'news', published_at: '2026-11-16T04:00:00Z' },
    { slug: 'x', type: 'guide', published_at: '2026-11-17T04:01:00Z' }
  ];
  const sa = sablonCikkhez(cikkek[0], cikkek), sb = sablonCikkhez(cikkek[1], cikkek), sc = sablonCikkhez(cikkek[2], cikkek);
  assert.equal(new Set([sa, sb, sc]).size, 3, 'a nap 3 útmutatója nem 3 különböző sablont kapott');
  assert.equal(sablonCikkhez(cikkek[0], cikkek), sa);
  // egy később megjelenő útmutató nem változtatja meg a korábbiak sablonját (a nap közbeni újragyártás ugyanazt adja)
  assert.equal(sablonCikkhez(cikkek[0], cikkek.slice(0, 2)), sa);
  assert.equal(sablonCikkhez(cikkek[1], cikkek.slice(0, 2)), sb);
  assert.notEqual(sablonCikkhez(cikkek[4], cikkek), sablonCikkhez({ ...cikkek[4], published_at: '2026-11-18T04:01:00Z' }, cikkek));
});

t('a leírás lépésszáma: motion Reelnél 3 (a videó ennyit mutat)', () => {
  assert.equal(motionLepesDb(MINTAK[0].md), LEPES_DB);
  assert.equal(motionLepesDb('---\ntitle: "X"\n---\n## Step 1 — a\n'), null);
});

// A VÁLTÓ (core/reel-post.js utmutatoRenderelo) — hamis renderelőkkel, ffmpeg nélkül.
const { utmutatoRenderelo, videoLepesDb } = await import('./reel-post.js');
const motionMod = await import('./motion-reel.js');
const cikkMinta = { slug: MINTAK[0].slug, type: 'guide', published_at: '2026-11-16T04:00:00Z', md: MINTAK[0].md };
const hivas = [];
const regiRender = async (cards, o) => { hivas.push(['regi', o.out]); return { file: o.out, seconds: 30, betu: { ok: true } }; };
const hamisMotion = (extra = {}) => ({
  ...motionMod,
  renderMotionReel: async (sz, o) => { hivas.push(['motion', o.out, o.sablon]); return { file: o.out, seconds: 14, betu: { ok: true }, sablon: o.sablon }; },
  ...extra
});
const nemaNaplo = () => {};
try {
  hivas.length = 0;
  const r = await utmutatoRenderelo({ cikkek: [cikkMinta], regi: regiRender, motion: hamisMotion(), naplo: nemaNaplo })([], { out: 'x\\shorts\\' + cikkMinta.slug + '.mp4', workDir: 'w', kepUt: 'k.jpg' });
  assert.equal(hivas[0][0], 'motion', 'útmutató-videóra nem a motion Reel készült (Windows-útvonal)');
  assert.ok(SABLONOK.includes(r.sablon));
  hivas.length = 0;
  const bukik = hamisMotion({ renderMotionReel: async () => { throw new Error('Edge 403'); } });
  const r2 = await utmutatoRenderelo({ cikkek: [cikkMinta], regi: regiRender, motion: bukik, naplo: nemaNaplo })([], { out: '/x/' + cikkMinta.slug + '.mp4' });
  assert.deepEqual(hivas.map(h => h[0]), ['regi'], 'motion-hibánál nem a régi Reel készült');
  assert.equal(r2.seconds, 30);
  hivas.length = 0;
  await utmutatoRenderelo({ cikkek: [cikkMinta], regi: regiRender, motion: hamisMotion(), naplo: nemaNaplo })([], { out: '/x/packs-promo.mp4', kepUtak: ['a', 'b'] });
  await utmutatoRenderelo({ cikkek: [cikkMinta], regi: regiRender, motion: hamisMotion(), naplo: nemaNaplo })([], { out: '/x/ismeretlen.mp4' });
  await utmutatoRenderelo({ cikkek: [cikkMinta], regi: regiRender, motion: hamisMotion({ MOTION_REEL_BE: false }), naplo: nemaNaplo })([], { out: '/x/' + cikkMinta.slug + '.mp4' });
  await utmutatoRenderelo({ cikkek: [{ ...cikkMinta, md: '---\ntitle: "X"\n---\n' }], regi: regiRender, motion: hamisMotion(), naplo: nemaNaplo })([], { out: '/x/' + cikkMinta.slug + '.mp4' });
  assert.deepEqual(hivas.map(h => h[0]), ['regi', 'regi', 'regi', 'regi'], 'reklám / ismeretlen / KI-kapcsoló / nem videózható → régi');
  assert.equal(await videoLepesDb(MINTAK[0].md, { cards: [1, 2, 3, 4, 5, 6] }), LEPES_DB);
  console.log('  ✅ váltó: útmutató → motion; hiba → régi; reklám / ismeretlen / KI / nem videózható → régi');
} catch (e) { hiba++; console.log('  ❌ váltó\n     ' + e.message); }

t('őr: a reel-post.js mindkét gyártó fázisa a váltón át renderel, a küldés rögzíti a sablont', () => {
  const rp = readFileSync(join(ROOT, 'core', 'reel-post.js'), 'utf-8');
  assert.equal((rp.match(/const renderVideo = utmutatoRenderelo\(/g) || []).length, 2, 'prepareReel + prepareTiktokExtra');
  assert.equal((rp.match(/videoSteps: await videoLepesDb\(/g) || []).length, 2, 'send + sendTiktokExtraFb');
  assert.match(rp, /cikk\._meta\.video_sablon = /);
});

console.log(`\n${hiba === 0 ? '✅' : '❌'} motion-reel.test: ${hiba} bukott`);
if (hiba) process.exit(1);
