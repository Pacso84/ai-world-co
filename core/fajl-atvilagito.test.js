// 🔎 Fájl-átvilágító — a felismerő mag tesztjei (2026-11-07; terv: docs/superpowers/specs/2026-11-06-fajl-atvilagito-design.md).
// Minden minta KÉZZEL összerakott, ártalmatlan bájtsor (valódi kártevő SOHA nincs a repóban).
// Ingyenes, hálózat nélküli.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { fajlMag } from './fajl-atvilagito.js';

const M = fajlMag();
let hiba = 0;
const t = (nev, fn) => { try { fn(); console.log('  ✅ ' + nev); } catch (e) { hiba++; console.log('  ❌ ' + nev + '\n     ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n     ')); } };
console.log('\n🧪 fajl-atvilagito (felismerő mag)');

// ---------- minta-készítők ----------
const B = (...r) => {
  const a = [];
  for (const x of r) {
    if (typeof x === 'string') for (const c of x) a.push(c.charCodeAt(0) & 255);
    else if (x instanceof Uint8Array || Array.isArray(x)) for (let i = 0; i < x.length; i++) a.push(x[i]);
    else a.push(x);
  }
  return new Uint8Array(a);
};
const u8 = s => new Uint8Array(Buffer.from(s, 'utf8'));
const le16 = n => [n & 255, (n >> 8) & 255];
const le32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const be32 = n => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const nulla = n => new Uint8Array(n);
const vizsgal = (nev, b, extra) => M.vizsgal({ nev, meret: b.length, eleje: b, ...(extra || {}) });
const idk = e => e.jelek.map(j => j.id);
const van = (e, id) => assert.ok(idk(e).includes(id), `hiányzik a(z) ${id} jel — kaptam: ${idk(e).join(', ') || '(nincs jel)'} · szint: ${e.szint} · típus: ${e.tipus && e.tipus.id}`);
const nincs = (e, id) => assert.ok(!idk(e).includes(id), `fölösleges ${id} jel — ${idk(e).join(', ')}`);

const JPEG = B(0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'JFIF', 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
  0xFF, 0xDA, 0x00, 0x08, 1, 1, 0, 0, 0x3F, 0, 0x12, 0xFF, 0x00, 0x34, 0xFF, 0xD0, 0x56, 0xFF, 0xD9);
const PNG = B(0x89, 'PNG', 0x0D, 0x0A, 0x1A, 0x0A, be32(13), 'IHDR', be32(1), be32(1), 8, 6, 0, 0, 0, 0, 0, 0, 0, be32(0), 'IEND', 0xAE, 0x42, 0x60, 0x82);
const PE = (() => { const b = nulla(0x80); b.set(B('MZ'), 0); b.set(le32(0x40), 0x3C); b.set(B('PE', 0, 0), 0x40); return b; })();
const MP4 = B(be32(24), 'ftyp', 'mp42', be32(0), 'isom', 'mp42', be32(8), 'free');

function zip(bejegyzesek, { elotag = new Uint8Array(0) } = {}) {
  const helyi = [], kp = [];
  let off = elotag.length;
  for (const e of bejegyzesek) {
    const nev = u8(e.nev), nyers = typeof e.adat === 'string' ? u8(e.adat) : (e.adat || new Uint8Array(0));
    const adat = e.modszer === 8 ? new Uint8Array(zlib.deflateRawSync(nyers)) : nyers;
    const flags = (e.titkos ? 1 : 0) | 0x800;
    const lh = B('PK', 3, 4, le16(20), le16(flags), le16(e.modszer || 0), le16(0), le16(0), le32(0), le32(adat.length), le32(nyers.length), le16(nev.length), le16(0), nev, adat);
    kp.push(B('PK', 1, 2, le16(20), le16(20), le16(flags), le16(e.modszer || 0), le16(0), le16(0), le32(0), le32(adat.length), le32(nyers.length), le16(nev.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(off - elotag.length), nev));
    helyi.push(lh); off += lh.length;
  }
  const cd = B(...kp), cdOff = off - elotag.length;
  return B(elotag, ...helyi, cd, 'PK', 5, 6, le16(0), le16(0), le16(kp.length), le16(kp.length), le32(cd.length), le32(cdOff), le16(0));
}
const CT = '<?xml version="1.0"?><Types xmlns="x"><Default Extension="xml" ContentType="application/xml"/></Types>';
const docx = (extra = []) => zip([{ nev: '[Content_Types].xml', adat: CT, modszer: 8 }, { nev: 'word/document.xml', adat: '<w:document/>', modszer: 8 }, ...extra]);
const rels = (...r) => '<?xml version="1.0"?><Relationships xmlns="x">' + r.join('') + '</Relationships>';

const pdf = test => B('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R ' + test + ' >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

function id3(frames, ver = 3) {
  const fb = B(...frames.map(([id, adat]) => { const d = typeof adat === 'string' ? B(adat) : adat; return B(id, be32(d.length), 0, 0, d); }));
  const s = fb.length;
  return B('ID3', ver, 0, 0, (s >> 21) & 127, (s >> 14) & 127, (s >> 7) & 127, s & 127, fb, 0xFF, 0xFB, 0x90, 0x00, nulla(64));
}
function rar4(fajlok, { fejlecTitkos = false } = {}) {
  const r = [B('Rar!', 0x1A, 0x07, 0x00), B(0, 0, 0x73, le16(fejlecTitkos ? 0x0080 : 0), le16(13), nulla(6))];
  for (const f of fajlok) {
    const nev = B(f.nev), adat = B(f.adat || 'x');
    r.push(B(0, 0, 0x74, le16(0x8000 | (f.titkos ? 4 : 0)), le16(32 + nev.length), le32(adat.length), le32(adat.length), 2, le32(0), le32(0), 29, 0x30, le16(nev.length), le32(0x20), nev), adat);
  }
  r.push(B(0, 0, 0x7B, le16(0x4000), le16(7)));
  return B(...r);
}
const vintB = n => { const a = []; do { let c = n & 0x7F; n = Math.floor(n / 128); if (n) c |= 0x80; a.push(c); } while (n); return a; };
function rar5(fajlok) {
  const r = [B('Rar!', 0x1A, 0x07, 0x01, 0x00)];
  for (const f of fajlok) {
    const nev = u8(f.nev), adat = B('xyz');
    const extraArea = f.titkos ? B(vintB(2), vintB(1), 0) : B();     // rekord: méret=2 (típus + 1 bájt), típus=1 (titkosítás)
    const fl = 2 | (f.titkos ? 1 : 0);
    const body = B(vintB(2), vintB(fl), f.titkos ? vintB(extraArea.length) : [], vintB(adat.length), vintB(0), vintB(3), vintB(0x20), vintB(0), vintB(0), vintB(nev.length), nev, extraArea);
    r.push(B(le32(0), vintB(body.length), body), adat);
  }
  r.push(B(le32(0), vintB(3), vintB(5), vintB(0), vintB(0)));
  return B(...r);
}
function tar(fajlok) {
  const r = [];
  for (const f of fajlok) {
    const h = nulla(512), adat = u8(f.adat || '');
    h.set(u8(f.nev), 0);
    h.set(B(adat.length.toString(8).padStart(11, '0')), 124);
    h.set(B('ustar'), 257);
    r.push(h, adat, nulla((512 - adat.length % 512) % 512));
  }
  r.push(nulla(1024));
  return B(...r);
}
const gzip = (adat, nev) => B(0x1F, 0x8B, 8, nev ? 8 : 0, le32(0), 0, 3, nev ? B(nev, 0) : [], new Uint8Array(zlib.deflateRawSync(adat)), le32(0), le32(adat.length));
function ole({ msi = false, szoveg = '' } = {}) {
  const b = nulla(4096);
  b.set([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1], 0);
  b.set(le16(9), 0x1E); b.set(le32(0), 0x30);
  b.set(B(...[...'Root Entry'].flatMap(c => [c.charCodeAt(0), 0])), 512);
  if (msi) b.set([0x84, 0x10, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46], 512 + 0x50);
  if (szoveg) b.set(B(...[...szoveg].flatMap(c => [c.charCodeAt(0), 0])), 640);
  return b;
}

// ---------- típusfelismerés ----------
t('🧬 típusfelismerés: kép, hang, videó, dokumentum, archívum, program (pozitív minták)', () => {
  const esetek = [
    ['jpeg', JPEG], ['png', PNG], ['gif', B('GIF89a', nulla(10))], ['webp', B('RIFF', le32(20), 'WEBPVP8 ', nulla(8))],
    ['heic', B(be32(24), 'ftyp', 'heic', nulla(12))], ['avif', B(be32(24), 'ftyp', 'avif', nulla(12))], ['bmp', B('BM', nulla(12), le32(40), nulla(30))],
    ['tiff', B('II*', 0, nulla(10))], ['ico', B(0, 0, 1, 0, 1, 0, 16, 16, 0, 0, nulla(12))],
    ['mp3', id3([])], ['mp3', B(0xFF, 0xFB, 0x90, 0x00, nulla(60))], ['aac', B(0xFF, 0xF1, 0x50, 0x80, nulla(20))],
    ['m4a', B(be32(24), 'ftyp', 'M4A ', nulla(12))], ['mp4', MP4], ['mov', B(be32(20), 'ftyp', 'qt  ', nulla(8))],
    ['wav', B('RIFF', le32(36), 'WAVEfmt ', nulla(20))], ['ogg', B('OggS', nulla(20))], ['flac', B('fLaC', nulla(20))], ['mkv', B(0x1A, 0x45, 0xDF, 0xA3, nulla(8))],
    ['pdf', pdf('')], ['zip', zip([{ nev: 'a.txt', adat: 'hi' }])], ['rar', rar4([{ nev: 'a.txt' }])], ['7z', B(0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C, nulla(20))],
    ['gzip', gzip(u8('hi'), '')], ['ole', ole()], ['rtf', B('{\\rtf1\\ansi hello}')], ['exe', PE], ['elf', B(0x7F, 'ELF', 2, 1, 1, nulla(20))],
    ['macho', B(0xCF, 0xFA, 0xED, 0xFE, nulla(20))], ['macho', B(0xCA, 0xFE, 0xBA, 0xBE, be32(2), nulla(20))], ['java', B(0xCA, 0xFE, 0xBA, 0xBE, 0, 0, 0, 52, nulla(20))],
    ['lnk', B(0x4C, 0, 0, 0, 0x01, 0x14, 0x02, 0x00, nulla(70))], ['iso', (() => { const b = nulla(0x8010); b.set(B('CD001'), 0x8001); return b; })()],
    ['svg', u8('<?xml version="1.0"?>\n<svg xmlns="x" width="10"><rect/></svg>')], ['html', u8('<!DOCTYPE html><html><body>hi</body></html>')],
    ['szoveg', u8('Szia! Ez egy sima jegyzet, ékezetekkel: árvíztűrő tükörfúrógép.\n')], ['xml', u8('<?xml version="1.0"?><a/>')],
    ['szkript', u8('Set s = CreateObject("WScript.Shell")\ns.Run "calc"\n')], ['hta', u8('<html><head><hta:application id="x"/></head></html>')]
  ];
  for (const [id, b] of esetek) {
    const tp = M._.tipusFelismer(b);
    assert.equal(tp && tp.id, id, `${id} helyett: ${tp && tp.id}`);
  }
});

t('🧬 negatív: véletlen bináris bájtok → ismeretlen (null), nem kép/program', () => {
  const b = new Uint8Array(512); for (let i = 0; i < b.length; i++) b[i] = (i * 73 + 11) & 255; b[0] = 0x13; b[1] = 0x00;
  assert.equal(M._.tipusFelismer(b), null);
});

// ---------- 🟢 családi fájlok: nincs riadalom ----------
t('🟢 családi fotók, zenék, dokumentumok → zöld (élő fotó, HEIC, PNG .jpg néven, MP3 ID3-mal, ékezetes név)', () => {
  for (const [nev, b] of [['Nyaralás képei.jpg', JPEG], ['IMG_0001.HEIC', B(be32(24), 'ftyp', 'heic', nulla(12))], ['képernyőkép.png', PNG],
    ['letoltott.jpg', PNG], ['dal.mp3', id3([['TIT2', B(0, 'Dal')]])], ['hang.m4a', B(be32(24), 'ftyp', 'M4A ', nulla(12))],
    ['video.mp4', MP4], ['jegyzet.txt', u8('Bevásárlólista: tej, kenyér')], ['ures.txt', new Uint8Array(0)], ['level.docx', docx()],
    ['konyv.epub', zip([{ nev: 'mimetype', adat: 'application/epub+zip' }, { nev: 'META-INF/container.xml', adat: '<c/>' }])],
    ['logo.svg', u8('<svg xmlns="x"><circle r="4"/></svg>')], ['szamla.pdf', pdf('/OpenAction [2 0 R /Fit]')],
    ['fotok.zip', zip([{ nev: 'a.jpg', adat: JPEG }, { nev: 'b.png', adat: PNG, modszer: 8 }])], ['archiv.rar', rar4([{ nev: 'kep.jpg' }])]]) {
    const e = vizsgal(nev, b);
    assert.equal(e.szint, 'zold', `${nev}: ${e.szint} (${idk(e).join(', ')})`);
  }
  const elo = vizsgal('IMG_20261107.jpg', B(JPEG, MP4));
  assert.equal(elo.szint, 'zold'); van(elo, 'elo_foto');
  const samsung = vizsgal('20261107.jpg', B(JPEG, 'MotionPhoto_Data', MP4));
  assert.equal(samsung.szint, 'zold'); van(samsung, 'elo_foto');
  const mpo = vizsgal('kep.jpg', B(JPEG, JPEG));
  assert.equal(mpo.szint, 'zold', 'két kép egymás után (MPO) nem jel');
  const kisMaradek = vizsgal('kep.jpg', B(JPEG, nulla(100), 'garbage'));
  assert.equal(kisMaradek.szint, 'zold', 'kis, nem futtatható maradék a kép végén nem jel');
});

// ---------- 🔴 fájlnév ----------
t('🔴 dupla kiterjesztés (.jpg.exe, nagybetűvel, sok szóközzel, .pdf.html) — és NEM duplázza a program-jelet', () => {
  const e = vizsgal('nyaralas.jpg.exe', PE);
  assert.equal(e.szint, 'piros'); van(e, 'dupla_kiterjesztes'); nincs(e, 'program'); nincs(e, 'alcazott_program');
  van(vizsgal('FOTO.JPG.EXE', PE), 'dupla_kiterjesztes');
  const sz = vizsgal('foto.jpg                    .exe', PE);
  van(sz, 'dupla_kiterjesztes'); assert.equal(sz.jelek.find(j => j.id === 'dupla_kiterjesztes').adat.valodi, 'exe');
  van(vizsgal('szamla.pdf.html', u8('<html><body>Szia</body></html>')), 'dupla_kiterjesztes');
  van(vizsgal('dal.mp3.scr', PE), 'dupla_kiterjesztes');
  van(vizsgal('kep.exe.', PE), 'program');            // a záró pontot a Windows levágja
  nincs(vizsgal('Jelentés 2026.11.07.pdf', pdf('')), 'dupla_kiterjesztes');
  nincs(vizsgal('archiv.tar.gz', gzip(tar([{ nev: 'a.txt', adat: 'x' }]), '')), 'dupla_kiterjesztes');
});

t('🔴 megfordított írásirány (U+202E): „kep‮gpj.exe” „kepexe.jpg”-nek látszik', () => {
  const e = vizsgal('kep\u202Egpj.exe', PE);
  assert.equal(e.szint, 'piros'); van(e, 'iranyvalto');
  assert.equal(e.jelek.find(j => j.id === 'iranyvalto').adat.latszo, 'kepexe.jpg');
  assert.equal(e.nev.ext, 'exe');
  nincs(vizsgal('sima név.jpg', JPEG), 'iranyvalto');
});

t('🔴 program önmagában (.exe, .apk, .js szövegként, .lnk, .iso) és ismeretlen néven', () => {
  for (const [nev, b] of [['setup.exe', PE], ['app.apk', zip([{ nev: 'AndroidManifest.xml', adat: 'x' }, { nev: 'classes.dex', adat: 'x' }])],
    ['run.js', u8('console.log(1)')], ['parancs.bat', u8('echo hi')], ['link.lnk', B(0x4C, 0, 0, 0, 0x01, 0x14, 0x02, 0x00, nulla(70))],
    ['lemez.iso', (() => { const b = nulla(0x8010); b.set(B('CD001'), 0x8001); return b; })()], ['valami', B(0x7F, 'ELF', nulla(30))], ['telepito.msi', ole({ msi: true })]]) {
    const e = vizsgal(nev, b);
    assert.equal(e.szint, 'piros', nev + ': ' + e.szint); van(e, 'program');
  }
});

t('🔴 álcázott program: a neve kép/zene/dokumentum, a belseje program (exe, APK, VBS, MSI, ISO)', () => {
  for (const [nev, b, valodi] of [['nyaralas.jpg', PE, 'exe'], ['dal.mp3', PE, 'exe'], ['foto.jpg', zip([{ nev: 'AndroidManifest.xml', adat: 'x' }, { nev: 'classes.dex', adat: 'x' }]), 'apk'],
    ['kep.jpg', u8('Set s = CreateObject("WScript.Shell")\n'), 'szkript'], ['szamla.pdf', ole({ msi: true }), 'msi'], ['fotok.zip', zip([{ nev: 'META-INF/MANIFEST.MF', adat: 'x' }, { nev: 'a/B.class', adat: 'x' }]), 'jar']]) {
    const e = vizsgal(nev, b);
    assert.equal(e.szint, 'piros', nev); van(e, 'alcazott_program');
    assert.equal(e.jelek.find(j => j.id === 'alcazott_program').adat.valodi, valodi);
  }
  // a .txt-ben lévő szkript-szöveg csak szöveg (Jegyzettömb nyitja) → nem jel
  assert.equal(vizsgal('jegyzet.txt', u8('powershell -enc AAAA')).szint, 'zold');
});

// ---------- 🔴 tartalom ----------
t('🔴 SVG rejtett kóddal (script, onload, javascript:, foreignObject, külső link); a sima SVG zöld', () => {
  for (const [s, mi] of [['<svg xmlns="x"><script>alert(1)</script></svg>', 'script'], ['<svg xmlns="x" onload="alert(1)"/>', 'esemeny'],
    ['<svg xmlns="x"><a href="javascript:alert(1)"><rect/></a></svg>', 'javascript'], ['<svg xmlns="x"><foreignObject><div/></foreignObject></svg>', 'foreignobject'],
    ['<svg xmlns="x"><a href="https://example.com/login"><rect/></a></svg>', 'kulso_link'], ['<svg xmlns="x"><iframe src="x"/></svg>', 'beagyazas']]) {
    const e = vizsgal('kep.svg', u8(s));
    assert.equal(e.szint, 'piros', s); van(e, 'svg_kod');
    assert.ok(e.jelek.find(j => j.id === 'svg_kod').adat.mi.includes(mi), s + ' → ' + mi);
  }
  assert.equal(vizsgal('kep.svg', u8('<svg xmlns="x"><image href="https://example.com/a.png"/></svg>')).szint, 'zold', 'külső KÉP nem link');
});

t('🔴 adathalász HTML (jelszómező, űrlap, átirányítás, rejtett kód); a sima HTML 🟡', () => {
  for (const [s, mi] of [['<html><form action="x"><input type="password"></form></html>', 'jelszo'], ['<html><body><input type="email" name="u"></body></html>', 'urlap'],
    ['<html><head><meta http-equiv="refresh" content="0;url=https://example.com"></head></html>', 'atiranyitas'], ['<html><script>window.location.href = "x"</script></html>', 'atiranyitas'],
    ['<html><script>document.write(atob("PGgxPg=="))</script></html>', 'rejtett_kod']]) {
    const e = vizsgal('szamla.html', u8(s));
    assert.equal(e.szint, 'piros', s); van(e, 'html_adathalasz');
    assert.ok(e.jelek.find(j => j.id === 'html_adathalasz').adat.mi.includes(mi), s + ' → ' + mi);
  }
  const sima = vizsgal('oldal.html', u8('<!DOCTYPE html><html><body><p>Szia</p></body></html>'));
  assert.equal(sima.szint, 'sarga'); van(sima, 'html');
});

t('🔴 archívum programmal (ZIP, RAR4, RAR5, gzip-név, tar.gz) — a sima archívum zöld', () => {
  for (const [nev, b] of [['szamla.zip', zip([{ nev: 'docs/szamla.pdf.exe', adat: PE, modszer: 8 }])], ['a.zip', zip([{ nev: 'kep\u202Egpj.scr', adat: 'x' }])],
    ['a.rar', rar4([{ nev: 'readme.txt' }, { nev: 'setup.exe' }])], ['a.rar', rar5([{ nev: 'foto.jpg.exe' }])],
    ['a.gz', gzip(u8('MZ'), 'setup.exe')], ['a.tar.gz', gzip(tar([{ nev: 'readme.txt', adat: 'hi' }, { nev: 'bin/evil.exe', adat: 'MZ' }]), '')]]) {
    const e = vizsgal(nev, b);
    assert.equal(e.szint, 'piros', nev + ' ' + idk(e)); van(e, 'archiv_program');
  }
  assert.equal(vizsgal('a.rar', rar5([{ nev: 'kep.jpg' }])).szint, 'zold');
  assert.equal(vizsgal('a.tar.gz', gzip(tar([{ nev: 'readme.txt', adat: 'hi' }]), '')).szint, 'zold');
});

t('🔴 Office-makró (docm/xlsm vbaProject, Excel 4.0 makrólap, régi .doc VBA); makrós formátum makró nélkül 🟡', () => {
  const e = vizsgal('level.docm', docx([{ nev: 'word/vbaProject.bin', adat: 'x' }]));
  assert.equal(e.szint, 'piros'); van(e, 'makro');
  van(vizsgal('tabla.xlsx', zip([{ nev: '[Content_Types].xml', adat: CT }, { nev: 'xl/workbook.xml', adat: 'x' }, { nev: 'xl/macrosheets/sheet1.xml', adat: 'x' }])), 'makro');
  van(vizsgal('regi.doc', ole({ szoveg: '_VBA_PROJECT' })), 'makro');
  const f = vizsgal('tabla.xlsm', zip([{ nev: '[Content_Types].xml', adat: CT }, { nev: 'xl/workbook.xml', adat: 'x' }]));
  assert.equal(f.szint, 'sarga'); van(f, 'makro_formatum');
  const ct = vizsgal('tabla.xlsx', zip([{ nev: '[Content_Types].xml', adat: CT.replace('application/xml', 'application/vnd.ms-excel.sheet.macroEnabled.main+xml'), modszer: 8 }, { nev: 'xl/workbook.xml', adat: 'x' }]));
  van(ct, 'makro_formatum');
});

t('🔴 PDF: automatikusan induló kód (OpenAction, #-kódolt név, objektum-folyamban), /Launch, csatolt program', () => {
  van(vizsgal('a.pdf', pdf('/OpenAction << /S /JavaScript /JS (app.alert(1)) >>')), 'pdf_kod_auto');
  van(vizsgal('a.pdf', pdf('/OpenAction << /S /J#61vaScript /J#53 (app.alert(1)) >>')), 'pdf_kod_auto');
  van(vizsgal('a.pdf', pdf('/Names << /JavaScript 5 0 R >>')), 'pdf_kod_auto');
  van(vizsgal('a.pdf', pdf('/OpenAction << /S /Launch /F (cmd.exe) >>')), 'pdf_inditas');
  van(vizsgal('a.pdf', pdf('/Names << /EmbeddedFiles 3 0 R >> 3 0 obj << /Type /Filespec /F (payload.exe) /EF << /F 4 0 R >> >>')), 'pdf_csatolt_program');
  // objektum-folyam (ObjStm, tömörítve): az OpenAction a 7-es objektumra mutat, ami a folyamban van
  const belso = '<< /S /JavaScript /JS (app.alert(1)) >>';
  const fej = '7 0 ';
  const folyam = new Uint8Array(zlib.deflateSync(Buffer.from(fej + belso, 'latin1')));
  const b = B('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /OpenAction 7 0 R >>\nendobj\n3 0 obj\n<< /Type /ObjStm /N 1 /First ' + fej.length + ' /Filter /FlateDecode /Length ' + folyam.length + ' >>\nstream\n', folyam, '\nendstream\nendobj\n%%EOF\n');
  const e = vizsgal('objstm.pdf', b);
  assert.equal(e.szint, 'piros', idk(e).join()); van(e, 'pdf_kod_auto');
});

t('🟡 PDF: űrlapmező-kód (nem indul magától), megnyitáskor induló nem-kód művelet, ismeretlen csatolmány; ℹ️ e-számla XML, linkek', () => {
  const urlap = vizsgal('urlap.pdf', pdf('/AcroForm 3 0 R 3 0 obj << /Fields [] /AA << /K << /S /JavaScript /JS (AFNumber_Keystroke) >> >> >>'));
  assert.equal(urlap.szint, 'sarga', idk(urlap).join()); van(urlap, 'pdf_kod');
  van(vizsgal('a.pdf', pdf('/OpenAction << /S /URI /URI (https://example.com) >>')), 'pdf_muvelet');
  van(vizsgal('a.pdf', pdf('/Names << /EmbeddedFiles 3 0 R >> /F (adat.bin)')), 'pdf_csatolt');
  const ex = vizsgal('szamla.pdf', pdf('/Names << /EmbeddedFiles 3 0 R >> /F (factur-x.xml)'));
  assert.equal(ex.szint, 'zold'); van(ex, 'pdf_csatolmanyok');
  const l = vizsgal('a.pdf', pdf('/Annots [<< /A << /S /URI /URI (https://example.com/a) >> >> << /A << /S /URI /URI (https://www.example.org/b) >> >>]'));
  assert.equal(l.szint, 'zold'); van(l, 'pdf_linkek');
  assert.deepEqual(l.jelek.find(j => j.id === 'pdf_linkek').adat.domainek, ['example.com', 'www.example.org']);
});

t('🔴 kép végéhez fűzött program / archívum (JPEG + PE, JPEG + ZIP, PNG + ZIP, MP3 + ZIP)', () => {
  const a = vizsgal('kep.jpg', B(JPEG, PE));
  assert.equal(a.szint, 'piros'); van(a, 'hozzafuzott'); assert.equal(a.jelek.find(j => j.id === 'hozzafuzott').adat.mi, 'program');
  const z = zip([{ nev: 'run.vbs', adat: 'x' }]);
  van(vizsgal('kep.jpg', B(JPEG, z)), 'hozzafuzott');
  van(vizsgal('kep.png', B(PNG, z)), 'hozzafuzott');
  const m = vizsgal('dal.mp3', zip([{ nev: 'run.vbs', adat: 'x' }], { elotag: id3([]) }));
  van(m, 'hozzafuzott'); assert.deepEqual(m.jelek.find(j => j.id === 'hozzafuzott').adat.nevek, ['run.vbs']);
});

// ---------- 🟡 ----------
t('🟡 a név és a tartalom nem egyezik (nem program): .jpg ami PDF / ZIP; ismeretlen tartalom kép-néven', () => {
  const e = vizsgal('foto.jpg', pdf(''));
  assert.equal(e.szint, 'sarga'); van(e, 'nev_nem_egyezik');
  van(vizsgal('foto.jpg', zip([{ nev: 'a.txt', adat: 'x' }])), 'nev_nem_egyezik');
  van(vizsgal('foto.jpg', u8('csak szöveg')), 'nev_nem_egyezik');
  const ism = vizsgal('foto.jpg', B(0x13, 0, 0x55, 0x99, nulla(40)));
  assert.equal(ism.szint, 'sarga'); van(ism, 'ismeretlen_nev_mas');
  nincs(vizsgal('regi.doc', B('{\\rtf1 hello}')), 'nev_nem_egyezik');   // a Word az RTF-et .doc-ként is menti
});

t('🟡 jelszavas archívum (ZIP, RAR4 fájl- és fejléc-titkosítás, RAR5), jelszavas Office; 7z/CAB: nem látunk bele', () => {
  van(vizsgal('a.zip', zip([{ nev: 'kep.jpg', adat: 'x', titkos: true }])), 'jelszavas_archiv');
  van(vizsgal('a.rar', rar4([{ nev: 'kep.jpg', titkos: true }])), 'jelszavas_archiv');
  van(vizsgal('a.rar', rar4([], { fejlecTitkos: true })), 'jelszavas_archiv');
  van(vizsgal('a.rar', rar5([{ nev: 'kep.jpg', titkos: true }])), 'jelszavas_archiv');
  const z = vizsgal('a.zip', zip([{ nev: 'setup.exe', adat: 'x', titkos: true }]));
  assert.equal(z.szint, 'piros', 'a program neve titkosított ZIP-ben is látszik'); van(z, 'archiv_program'); van(z, 'jelszavas_archiv');
  const o = vizsgal('level.docx', ole({ szoveg: 'EncryptedPackage' }));
  assert.equal(o.szint, 'sarga'); van(o, 'jelszavas_dokumentum'); nincs(o, 'nev_nem_egyezik');
  van(vizsgal('a.7z', B(0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C, nulla(30))), 'archiv_zart');
});

t('🟡 Office külső sablonra / OLE-objektumra mutat; beágyazott objektum; a sima hiperhivatkozás csak ℹ️', () => {
  const kulso = docx([{ nev: 'word/_rels/settings.xml.rels', modszer: 8, adat: rels('<Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="https://evil.example.com/t.dotm" TargetMode="External"/>') }]);
  const e = vizsgal('level.docx', kulso);
  assert.equal(e.szint, 'sarga'); van(e, 'office_kulso');
  assert.deepEqual(e.jelek.find(j => j.id === 'office_kulso').adat.celok, ['evil.example.com']);
  const unc = docx([{ nev: 'word/_rels/document.xml.rels', adat: rels('<Relationship TargetMode="External" Target="\\\\192.0.2.1\\share\\x" Type="x/oleObject" Id="r2"/>') }]);
  van(vizsgal('level.docx', unc), 'office_kulso');
  const link = docx([{ nev: 'word/_rels/document.xml.rels', modszer: 8, adat: rels('<Relationship Id="r3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/x" TargetMode="External"/>') }]);
  const l = vizsgal('level.docx', link);
  assert.equal(l.szint, 'zold'); van(l, 'office_linkek');
  van(vizsgal('level.docx', docx([{ nev: 'word/embeddings/oleObject1.bin', adat: 'x' }])), 'beagyazott_objektum');
});

t('🟡 régi Office (OLE) és RTF; ⚪ ismeretlen típus semleges néven', () => {
  const r = vizsgal('regi.doc', ole());
  assert.equal(r.szint, 'sarga'); van(r, 'regi_office');
  const rtf = vizsgal('level.rtf', B('{\\rtf1 {\\object\\objemb {\\objdata 0105}}}'));
  assert.equal(rtf.szint, 'sarga'); van(rtf, 'rtf'); assert.equal(rtf.jelek.find(j => j.id === 'rtf').adat.objektum, true);
  for (const nev of ['adat.xyz', 'fajl_kiterjesztes_nelkul']) {
    const s = vizsgal(nev, B(0x13, 0, 0x55, 0x99, nulla(40)));
    assert.equal(s.szint, 'semleges', nev);
  }
  assert.equal(vizsgal('valami.xyz', B(0x13, 0, 0x55, 0x99, nulla(40)), {}).tipus, null);
});

t('ℹ️ MP3-címke linkje (WXXX, WOAR) — nem rontja az összesítést', () => {
  const e = vizsgal('dal.mp3', id3([['WXXX', B(0, 'leiras', 0, 'https://example.com/dal')], ['WOAR', 'https://artist.example.net/']]));
  assert.equal(e.szint, 'zold'); van(e, 'id3_link');
  assert.deepEqual(e.jelek.find(j => j.id === 'id3_link').adat.domainek, ['example.com', 'artist.example.net']);
});

// ---------- nagy fájl: csak az eleje és a vége ----------
t('📏 olvasási terv + nagy fájl részleges átvilágítása (a ZIP tartalomjegyzéke a végéről)', () => {
  assert.deepEqual(M.olvasasiTerv(1000), { teljes: true, eleje: 1000, vege: 0 });
  const nagy = M.olvasasiTerv(100 * 1024 * 1024);
  assert.equal(nagy.teljes, false); assert.ok(nagy.eleje > 0 && nagy.vege > 0);
  const z = zip([{ nev: 'nagy.bin', adat: nulla(300000) }, { nev: 'setup.exe', adat: 'MZ' }]);
  const e = M.vizsgal({ nev: 'csomag.zip', meret: z.length, eleje: z.subarray(0, 4096), vege: z.subarray(z.length - 4096) });
  assert.equal(e.teljes, false); assert.equal(e.szint, 'piros'); van(e, 'archiv_program');
  const k = M.vizsgal({ nev: 'film.mp4', meret: 50e6, eleje: MP4, vege: nulla(64) });
  assert.equal(k.szint, 'zold'); van(k, 'reszleges');
});

// ---------- kibontó ----------
t('🗜️ a saját kibontó (inflate) bájtra pontosan visszaadja a zlib-tömörítést (tárolt, fix, dinamikus, zlib-fejléc, korlát)', () => {
  const szoveg = Buffer.from('Az MI-híradó: ' + 'árvíztűrő tükörfúrógép, '.repeat(300) + [...Array(2000)].map((_, i) => (i * 7919) % 251).join(','), 'utf8');
  const rnd = Buffer.alloc(70000); for (let i = 0; i < rnd.length; i++) rnd[i] = (i * 2654435761 >>> 13) & 255;
  for (const [nev, nyers, opt] of [['dinamikus', szoveg, {}], ['tárolt', szoveg, { level: 0 }], ['fix (rövid)', Buffer.from('abcabcabc'), {}], ['zajos', rnd, {}], ['üres', Buffer.alloc(0), {}]]) {
    const ki = M._.kibont(new Uint8Array(zlib.deflateRawSync(nyers, opt)), 0, 1 << 24, false);
    assert.ok(Buffer.from(ki).equals(nyers), nev);
  }
  const zl = M._.kibont(new Uint8Array(zlib.deflateSync(szoveg)), 0, 1 << 24, true);
  assert.ok(Buffer.from(zl).equals(szoveg), 'zlib');
  assert.equal(M._.kibont(new Uint8Array(zlib.deflateRawSync(szoveg)), 0, 100, false).length, 100, 'korlát');
  assert.doesNotThrow(() => M._.kibont(new Uint8Array([0xFF, 0xFF, 0xFF]), 0, 1000, false), 'hibás adatnál nem dob kivételt');
});

// ---------- a mag a böngészőben is ugyanígy fut ----------
t('🧠 a mag friss környezetben (vm, Node-globálisok nélkül) ugyanazt adja (toString-másolat → böngésző)', () => {
  const Mb = vm.runInNewContext('(' + fajlMag.toString() + ')()', { Uint8Array, Uint16Array });
  for (const [nev, b] of [['nyaralas.jpg.exe', PE], ['level.docx', docx([{ nev: 'word/_rels/settings.xml.rels', modszer: 8, adat: rels('<Relationship Type="x/attachedTemplate" Target="https://evil.example.com/t" TargetMode="External"/>') }])],
    ['a.pdf', pdf('/OpenAction << /S /JavaScript /JS (x) >>')], ['IMG.jpg', B(JPEG, MP4)]]) {
    assert.deepEqual(JSON.parse(JSON.stringify(Mb.vizsgal({ nev, meret: b.length, eleje: b }))), JSON.parse(JSON.stringify(vizsgal(nev, b))), nev);
  }
});

t('🧱 a mag forrása: nincs lookbehind, nincs ES2015+ szintaxis, nincs hálózat/külső hivatkozás, nincs Node-/böngésző-globális', () => {
  const src = fajlMag.toString();
  assert.equal(/\(\?<[=!]/.test(src), false, 'lookbehind a magban (régi iOS: szintaxishiba)');
  assert.equal(/=>|`|\blet\s|\bconst\s|\bclass\s|\.\.\.[A-Za-z_[]|\?\.|\?\?/.test(src), false, 'ES2015+ szintaxis a magban');
  assert.equal(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|https?:\/\/|\bimport\s*\(|require\s*\(/.test(src), false, 'hálózati hívás / külső hivatkozás a magban');
  const kod = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/(?:\\.|[^/\n\\])+\/[gimsuy]*/g, '').replace(/'(?:\\.|[^'\\])*'/g, '');   // megjegyzés, regex, szöveg nélkül
  assert.equal(/\b(?:TextDecoder|Buffer|crypto|window|document|navigator|process)\b/.test(kod), false, 'környezetfüggő globális a magban');
});

if (hiba) { console.log(`\n❌ fajl-atvilagito.test: ${hiba} hiba`); process.exit(1); }
console.log('✅ fajl-atvilagito.test: mind rendben');
