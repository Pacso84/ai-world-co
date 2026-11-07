// ===================================================================
// 🔎 FÁJL-ÁTVILÁGÍTÓ — a felismerő mag (2026-11-07; terv: docs/superpowers/specs/2026-11-06-fajl-atvilagito-design.md)
// ===================================================================
// User (11-06): „pontosan ezt! ezen induljunk el!”; a terv jóváhagyva 11-07.
//
// A LÁTOGATÓ BÖNGÉSZŐJÉBEN fut: a fájl nem hagyja el a készüléket, nincs feltöltés, nincs MI,
// nincs külső könyvtár. A `fajlMag()` FORRÁSA kerül az oldalba (toString), mint az `eszkozMag()`-é
// (core/ingyenes-eszkozok.js) → a Node-teszt és a böngésző UGYANAZT futtatja. Ezért a magban:
//   • nincs külső hivatkozás és hálózati hívás, nincs Node-/böngésző-függő globális (TextDecoder,
//     Buffer, crypto) — csak Uint8Array;
//   • ES5-szerű szintaxis, lookbehind NINCS (régi iOS-es Facebook-böngésző: szintaxishiba → leállna).
//
// NEM vírusirtó: álcázási trükköket ismer fel (program fotónak nevezve, dupla kiterjesztés, kódos
// SVG, adathalász HTML, programot rejtő ZIP, makró, automatikusan futó PDF-kód…). A szövegeket
// (mit jelent, mit tegyél) NEM ez a fájl adja — itt csak a jelek azonosítója és adatai vannak.
//
// Használat: var M = fajlMag();
//   var terv = M.olvasasiTerv(file.size)      → mennyit olvasson be a böngésző (eleje / vége)
//   var e = M.vizsgal({ nev, meret, eleje: Uint8Array, vege: Uint8Array|null })
//   e.szint: 'piros' | 'sarga' | 'zold' | 'semleges' · e.tipus: { id, csoport } | null · e.jelek: [{ id, szint, adat }]
// Teszt: core/fajl-atvilagito.test.js
// ===================================================================

export function fajlMag() {
  'use strict';

  // ---------- olvasási korlátok ----------
  var TELJES_KORLAT = 32 * 1024 * 1024;   // eddig a méretig a teljes fájlt átnézzük
  var DARAB = 2 * 1024 * 1024;            // nagyobb fájlnál az elejéből és a végéből ennyit
  var KIBONT_KORLAT = 4 * 1024 * 1024;    // egy tömörített részből legfeljebb ennyit bontunk ki
  var KIBONT_OSSZES = 16 * 1024 * 1024;   // egy fájlon belül összesen

  function olvasasiTerv(meret) {
    if (meret <= TELJES_KORLAT) return { teljes: true, eleje: meret, vege: 0 };
    return { teljes: false, eleje: DARAB, vege: DARAB };
  }

  // ---------- bájt-olvasó (a fájl eleje + vége, abszolút pozícióval) ----------
  function olvaso(a) {
    var e = a.eleje || new Uint8Array(0);
    var meret = typeof a.meret === 'number' ? a.meret : e.length;
    var teljes = e.length >= meret;
    var v = teljes ? e : (a.vege || new Uint8Array(0));
    var vs = teljes ? 0 : meret - v.length;
    function at(p) {
      if (p < 0 || p >= meret) return -1;
      if (p < e.length) return e[p];
      if (p >= vs && p - vs < v.length) return v[p - vs];
      return -1;
    }
    function resz(k, z) {
      if (k < 0 || z > meret || k > z) return null;
      if (z <= e.length) return e.subarray(k, z);
      if (k >= vs && z - vs <= v.length) return v.subarray(k - vs, z - vs);
      return null;
    }
    return { meret: meret, teljes: teljes, e: e, v: v, vs: vs, at: at, resz: resz };
  }
  function u16(R, p) { var a = R.at(p), b = R.at(p + 1); return (a < 0 || b < 0) ? -1 : a + b * 256; }
  function u32(R, p) { var a = u16(R, p), b = u16(R, p + 2); return (a < 0 || b < 0) ? -1 : a + b * 65536; }
  function u16be(R, p) { var a = R.at(p), b = R.at(p + 1); return (a < 0 || b < 0) ? -1 : a * 256 + b; }
  function u32be(R, p) { var a = u16be(R, p), b = u16be(R, p + 2); return (a < 0 || b < 0) ? -1 : a * 65536 + b; }
  function van(R, p, s) {
    for (var i = 0; i < s.length; i++) {
      var c = typeof s === 'string' ? s.charCodeAt(i) : s[i];
      if (R.at(p + i) !== c) return false;
    }
    return true;
  }
  function keres(b, k, z, minta) {   // minta: bájttömb; az első találat helye vagy -1
    var n = minta.length, c0 = minta[0];
    for (var i = k; i <= z - n; i++) {
      if (b[i] !== c0) continue;
      var j = 1;
      while (j < n && b[i + j] === minta[j]) j++;
      if (j === n) return i;
    }
    return -1;
  }
  function bajtok(s) { var a = []; for (var i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 255); return a; }
  function utf16le(s) { var a = []; for (var i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 255, 0); return a; }

  // ---------- szöveggé alakítás (TextDecoder nélkül) ----------
  function lat(b, k, z) {
    k = k || 0; z = (z === undefined || z === null) ? b.length : z;
    var s = '';
    for (var i = k; i < z; i += 8192) {
      var d = b.subarray(i, Math.min(z, i + 8192));
      try { s += String.fromCharCode.apply(null, d); } catch (x) { s += String.fromCharCode.apply(null, Array.prototype.slice.call(d)); }
    }
    return s;
  }
  function utf8(b, k, z) {
    var s = '', i = k, c, d, cp, n, j, ok;
    while (i < z) {
      c = b[i++];
      if (c < 0x80) { s += String.fromCharCode(c); continue; }
      n = c >= 0xF0 && c < 0xF5 ? 3 : c >= 0xE0 && c < 0xF0 ? 2 : c >= 0xC2 && c < 0xE0 ? 1 : -1;
      if (n < 0 || i + n > z) { s += '�'; continue; }
      cp = c & (0x3F >> n); ok = true;
      for (j = 0; j < n; j++) { d = b[i + j]; if ((d & 0xC0) !== 0x80) { ok = false; break; } cp = cp * 64 + (d & 0x3F); }
      if (!ok) { s += '�'; continue; }
      i += n;
      if (cp > 0xFFFF) { cp -= 0x10000; s += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF)); }
      else s += String.fromCharCode(cp);
    }
    return s;
  }
  function ervenyesUtf8(b, k, z) {
    var i = k, c, n, j;
    while (i < z) {
      c = b[i];
      if (c < 0x80) { i++; continue; }
      n = c >= 0xF0 && c < 0xF5 ? 3 : c >= 0xE0 && c < 0xF0 ? 2 : c >= 0xC2 && c < 0xE0 ? 1 : -1;
      if (n < 0) return false;
      if (i + n >= z) return true;             // a minta vége félbevágott karakter lehet
      for (j = 1; j <= n; j++) if ((b[i + j] & 0xC0) !== 0x80) return false;
      i += n + 1;
    }
    return true;
  }

  // ---------- kibontó (DEFLATE, RFC 1951) — a Word-fájlok kapcsolat-listáihoz és a PDF objektum-folyamaihoz ----------
  var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  function fa(len, n) {
    var c = new Uint16Array(16), s = new Uint16Array(n), off = new Uint16Array(16), i;
    for (i = 0; i < n; i++) c[len[i]]++;
    c[0] = 0;
    for (i = 1; i < 16; i++) off[i] = off[i - 1] + c[i - 1];
    for (i = 0; i < n; i++) if (len[i]) s[off[len[i]]++] = i;
    return { c: c, s: s };
  }
  var FIX_L = null, FIX_D = null;
  /** Kibontás; zlib = true → a 2 bájtos zlib-fejlécet is átlépi. Hibánál/korlátnál a már kibontott részt adja. */
  function kibont(src, k, max, zlib) {
    var st = { p: k, z: src.length, b: 0, n: 0 };
    var out = new Uint8Array(Math.min(max, Math.max(1024, (src.length - k) * 4))), o = 0;
    var HIBA = { hiba: true };
    function put(c) {
      if (o >= out.length) {
        if (out.length >= max) throw HIBA;
        var u = new Uint8Array(Math.min(max, out.length * 2)); u.set(out); out = u;
      }
      out[o++] = c;
    }
    function bit() {
      if (!st.n) { if (st.p >= st.z) throw HIBA; st.b = src[st.p++]; st.n = 8; }
      var r = st.b & 1; st.b >>= 1; st.n--; return r;
    }
    function bits(n) { var v = 0; for (var i = 0; i < n; i++) v |= bit() << i; return v; }
    function dek(t) {
      var sum = 0, cur = 0, len = 0;
      do { cur = 2 * cur + bit(); len++; if (len > 15) throw HIBA; sum += t.c[len]; cur -= t.c[len]; } while (cur >= 0);
      return t.s[sum + cur];
    }
    function blokk(lt, dt) {
      for (;;) {
        var sym = dek(lt), i;
        if (sym < 256) put(sym);
        else if (sym === 256) return;
        else {
          sym -= 257; if (sym >= 29) throw HIBA;
          var hossz = LBASE[sym] + bits(LEXT[sym]), ds = dek(dt);
          if (ds >= 30) throw HIBA;
          var tav = DBASE[ds] + bits(DEXT[ds]);
          if (tav > o) throw HIBA;
          for (i = 0; i < hossz; i++) put(out[o - tav]);
        }
      }
    }
    function dinamikus() {
      var hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4, i;
      var cl = new Uint8Array(19);
      for (i = 0; i < hclen; i++) cl[CLORD[i]] = bits(3);
      var ct = fa(cl, 19), len = new Uint8Array(hlit + hdist), n = 0;
      while (n < hlit + hdist) {
        var sym = dek(ct);
        if (sym < 16) { len[n++] = sym; continue; }
        var ism, prev = 0;
        if (sym === 16) { if (!n) throw HIBA; prev = len[n - 1]; ism = 3 + bits(2); }
        else if (sym === 17) ism = 3 + bits(3);
        else ism = 11 + bits(7);
        if (n + ism > hlit + hdist) throw HIBA;
        while (ism--) len[n++] = prev;
      }
      return [fa(len.subarray(0, hlit), hlit), fa(len.subarray(hlit), hdist)];
    }
    if (!FIX_L) {
      var l = new Uint8Array(288), d = new Uint8Array(30), i;
      for (i = 0; i < 288; i++) l[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
      for (i = 0; i < 30; i++) d[i] = 5;
      FIX_L = fa(l, 288); FIX_D = fa(d, 30);
    }
    try {
      if (zlib) { if (st.z - st.p < 2 || (src[st.p] & 0x0F) !== 8) return out.subarray(0, 0); st.p += 2; }
      var utolso;
      do {
        utolso = bit();
        var tip = bits(2);
        if (tip === 0) {
          st.n = 0;
          if (st.p + 4 > st.z) throw HIBA;
          var L = src[st.p] | (src[st.p + 1] << 8); st.p += 4;
          for (var j = 0; j < L; j++) { if (st.p >= st.z) throw HIBA; put(src[st.p++]); }
        } else if (tip === 1) blokk(FIX_L, FIX_D);
        else if (tip === 2) { var t = dinamikus(); blokk(t[0], t[1]); }
        else throw HIBA;
      } while (!utolso);
    } catch (x) { /* hibás vagy csonka adat / korlát: a már kibontott rész is használható */ }
    return out.subarray(0, o);
  }

  // ---------- fájlnév ----------
  var IRANYVALTO_RE = /[‪-‮⁦-⁩]/;
  var LATHATATLAN_RE = /[‪-‮⁦-⁩​-‏؜﻿]/g;
  function halmaz(s) { var o = {}, a = s.split(' '); for (var i = 0; i < a.length; i++) o[a[i]] = true; return o; }
  // önmagukban is veszélyes (indítható / telepíthető / csatolható) kiterjesztések
  var VESZELYES = halmaz('exe scr com cpl dll pif sys ocx msi msp mst vbs vbe js jse wsf wsh hta ps1 psm1 bat cmd lnk scf reg msc ' +
    'apk xapk apks jar iso img vhd vhdx dmg pkg app command gadget appx appxbundle msix msixbundle application xll');
  // dupla kiterjesztésnél a „megtévesztő” vég: a veszélyesek + weboldal/SVG (szamla.pdf.html)
  var MEGTEVESZTO_VEG = (function () { var o = halmaz('html htm shtml xhtml svg'); for (var k in VESZELYES) o[k] = true; return o; })();

  // kiterjesztés → milyen valódi típusok illenek hozzá ('@csoport' = a csoport bármely típusa; '*' = bármi)
  var KIT = {};
  function kit(exts, ok) { var a = exts.split(' '), b = ok.split(' '); for (var i = 0; i < a.length; i++) KIT[a[i]] = b; }
  kit('jpg jpeg jpe jfif png gif webp heic heif avif bmp dib tif tiff ico', '@kep');
  kit('mp3 m4a m4b aac wav ogg oga opus flac amr', '@hang @video');
  kit('mp4 m4v mov qt 3gp 3g2 avi mkv webm ogv', '@video @hang');
  kit('pdf', 'pdf');
  kit('docx docm dotx dotm xlsx xlsm xltx xltm xlam pptx pptm potx potm ppsx ppsm ppam', 'docx xlsx pptx ooxml ole zip');
  kit('doc dot xls xlt xla ppt pps pot msg', 'ole rtf html szoveg xml docx xlsx pptx ooxml');
  kit('odt ods odp odg ott ots otp', 'odf zip');
  kit('rtf', 'rtf');
  kit('epub', 'epub zip');
  kit('zip', 'zip docx xlsx pptx ooxml odf epub');
  kit('rar', 'rar'); kit('7z', '7z'); kit('gz tgz', 'gzip'); kit('cab', 'cab');
  kit('txt text csv tsv log md json xml vcf ics ini cfg yaml yml srt vtt', 'szoveg xml html svg szkript hta ures');
  kit('html htm shtml xhtml', 'html szoveg xml svg');
  kit('svg', 'svg xml');
  kit('apk xapk apks', 'apk zip'); kit('jar', 'jar zip java');
  kit('exe scr com cpl dll pif sys ocx', 'exe');
  kit('msi msp mst', 'msi ole');
  kit('lnk', 'lnk');
  kit('iso', 'iso *'); kit('img vhd vhdx', '*'); kit('dmg', 'dmg *');
  kit('js jse vbs vbe wsf wsh ps1 psm1 bat cmd command hta', 'szoveg szkript hta xml html ures');

  var CSOPORT = {
    jpeg: 'kep', png: 'kep', gif: 'kep', webp: 'kep', heic: 'kep', avif: 'kep', bmp: 'kep', tiff: 'kep', ico: 'kep',
    mp3: 'hang', aac: 'hang', m4a: 'hang', wav: 'hang', ogg: 'hang', flac: 'hang', amr: 'hang',
    mp4: 'video', mov: 'video', avi: 'video', mkv: 'video',
    pdf: 'dokumentum', docx: 'dokumentum', xlsx: 'dokumentum', pptx: 'dokumentum', ooxml: 'dokumentum', odf: 'dokumentum',
    ole: 'dokumentum', rtf: 'dokumentum', epub: 'dokumentum',
    zip: 'archivum', rar: 'archivum', '7z': 'archivum', gzip: 'archivum', cab: 'archivum',
    exe: 'program', msi: 'program', elf: 'program', macho: 'program', java: 'program', lnk: 'program', apk: 'program',
    jar: 'program', hta: 'program', szkript: 'program',
    iso: 'lemezkep', dmg: 'lemezkep',
    html: 'weboldal', svg: 'svg', szoveg: 'szoveg', xml: 'szoveg', ures: 'ures'
  };
  function T(id) { return { id: id, csoport: CSOPORT[id] || 'egyeb' }; }
  function illik(ext, tipus) {
    var ok = KIT[ext];
    if (!ok || !tipus) return true;
    for (var i = 0; i < ok.length; i++) {
      if (ok[i] === '*' || ok[i] === tipus.id || (ok[i].charAt(0) === '@' && ok[i].slice(1) === tipus.csoport)) return true;
    }
    return false;
  }

  function latszoNev(nev) {
    var i = nev.indexOf('‮');
    if (i < 0) return nev.replace(LATHATATLAN_RE, '');
    var rest = nev.slice(i + 1), j = rest.indexOf('‬');
    var fordit = (j >= 0 ? rest.slice(0, j) : rest).split('').reverse().join('');
    return (nev.slice(0, i) + fordit + (j >= 0 ? rest.slice(j + 1) : '')).replace(LATHATATLAN_RE, '');
  }
  function nevElemez(nev) {
    nev = String(nev || '');
    var logikai = nev.replace(LATHATATLAN_RE, '');
    var alap = logikai.replace(/^.*[\/\\]/, '');
    var tiszta = alap.replace(/[\s.]+$/, '');          // Windows a záró pontot/szóközt levágja: „kep.exe.” = kep.exe
    var reszek = tiszta.split('.'), kits = [], i;
    if (reszek.length > 1 && !(reszek.length === 2 && reszek[0] === '')) {
      for (i = 1; i < reszek.length; i++) kits.push(reszek[i].replace(/^\s+|\s+$/g, '').toLowerCase());
    }
    return {
      nev: alap,
      latszo: latszoNev(nev.replace(/^.*[\/\\]/, '')),
      ext: kits.length ? kits[kits.length - 1] : '',
      elozo: kits.length > 1 ? kits[kits.length - 2] : '',
      iranyvalto: IRANYVALTO_RE.test(nev),
      szokoz: /\s{4,}\.[^.]*$/.test(tiszta)
    };
  }
  function csali(ext) { return !!KIT[ext] && !VESZELYES[ext] && !MEGTEVESZTO_VEG[ext]; }
  function megtevesztoNev(n) {   // dupla kiterjesztés vagy sok szóköz + veszélyes vég
    return !!MEGTEVESZTO_VEG[n.ext] && (csali(n.elozo) || (n.szokoz && !!VESZELYES[n.ext]));
  }

  // ---------- típusfelismerés az első bájtokból ----------
  function szovegMinta(R) {
    var b = R.e, z = Math.min(b.length, 65536), k = 0, i, ctrl = 0;
    if (z === 0) return null;
    if (b[0] === 0xFF && b[1] === 0xFE || b[0] === 0xFE && b[1] === 0xFF) {    // UTF-16 BOM
      var le = b[0] === 0xFF, s = '';
      for (i = 2; i + 1 < z; i += 2) s += String.fromCharCode(le ? b[i] + b[i + 1] * 256 : b[i] * 256 + b[i + 1]);
      return /[\u0000-\u0008\u000E-\u001A]/.test(s) ? null : s;
    }
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) k = 3;
    for (i = k; i < z; i++) {
      var c = b[i];
      if (c === 0) return null;
      if (c < 0x20 && c !== 9 && c !== 10 && c !== 12 && c !== 13 && c !== 0x1B) ctrl++;
    }
    if (ctrl > (z - k) * 0.01) return null;
    return ervenyesUtf8(b, k, z) ? utf8(b, k, z) : lat(b, k, z);
  }
  var SZKRIPT_RE = /^\s*@echo\s+off|WScript\.(?:Shell|CreateObject|Sleep|Echo)|CreateObject\s*\(\s*["'](?:WScript|Shell|Scripting|MSXML2|ADODB)|Shell\.Application|ActiveXObject\s*\(|powershell(?:\.exe)?\s+-|Invoke-Expression|\bIEX\s*\(|FromBase64String\s*\(|Start-Process\s|cmd(?:\.exe)?\s+\/c\s/i;
  function szovegTipus(s) {
    var eleje = s.slice(0, 4096).replace(/^\s+/, '');
    if (/<hta:application/i.test(s.slice(0, 65536))) return 'hta';
    if (/^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i.test(eleje)) return 'svg';
    if (/<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|<form[\s>]|<script[\s>]|<iframe[\s>]|<meta\s/i.test(eleje)) return 'html';
    if (/<svg[\s>]/i.test(eleje) && !/<html/i.test(eleje)) return 'svg';
    if (SZKRIPT_RE.test(s.slice(0, 65536))) return 'szkript';
    if (/^<\?xml/.test(eleje)) return 'xml';
    return 'szoveg';
  }
  function tipusFelismer(R) {
    if (R.meret === 0) return T('ures');
    var a0 = R.at(0), a1 = R.at(1);
    if (van(R, 0, [0xFF, 0xD8, 0xFF])) return T('jpeg');
    if (van(R, 0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return T('png');
    if (van(R, 0, 'GIF87a') || van(R, 0, 'GIF89a')) return T('gif');
    if (van(R, 0, 'RIFF')) {
      if (van(R, 8, 'WEBP')) return T('webp');
      if (van(R, 8, 'WAVE')) return T('wav');
      if (van(R, 8, 'AVI ')) return T('avi');
    }
    if (van(R, 4, 'ftyp')) {
      var brand = String.fromCharCode(R.at(8), R.at(9), R.at(10), R.at(11)).toLowerCase();
      if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return T('heic');
      if (/^avi[fs]$/.test(brand)) return T('avif');
      if (/^m4[abp] $/.test(brand)) return T('m4a');
      if (brand === 'qt  ') return T('mov');
      return T('mp4');
    }
    if (van(R, 0, [0x1A, 0x45, 0xDF, 0xA3])) return T('mkv');
    if (van(R, 0, 'MZ')) return T('exe');
    if (van(R, 0, [0x7F, 0x45, 0x4C, 0x46])) return T('elf');
    if (van(R, 0, [0xFE, 0xED, 0xFA, 0xCE]) || van(R, 0, [0xFE, 0xED, 0xFA, 0xCF]) ||
        van(R, 0, [0xCE, 0xFA, 0xED, 0xFE]) || van(R, 0, [0xCF, 0xFA, 0xED, 0xFE])) return T('macho');
    if (van(R, 0, [0xCA, 0xFE, 0xBA, 0xBE])) return u32be(R, 4) < 40 ? T('macho') : T('java');
    if (van(R, 0, [0x4C, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00])) return T('lnk');
    for (var p = 0; p < 1024; p++) { if (R.at(p) < 0) break; if (van(R, p, '%PDF-')) return T('pdf'); }
    if (van(R, 0, 'PK\x03\x04') || van(R, 0, 'PK\x05\x06') || van(R, 0, 'PK\x07\x08')) return T('zip');
    if (van(R, 0, 'Rar!\x1A\x07')) return T('rar');
    if (van(R, 0, [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])) return T('7z');
    if (van(R, 0, [0x1F, 0x8B])) return T('gzip');
    if (van(R, 0, 'MSCF\x00\x00\x00\x00')) return T('cab');
    if (van(R, 0, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) return T('ole');
    if (van(R, 0, '{\\rtf')) return T('rtf');
    if (van(R, 0, 'OggS')) return T('ogg');
    if (van(R, 0, 'fLaC')) return T('flac');
    if (van(R, 0, '#!AMR')) return T('amr');
    if (van(R, 0, 'ID3')) return T('mp3');
    if (van(R, 0, 'II*\x00') || van(R, 0, 'MM\x00*')) return T('tiff');
    if (van(R, 0, 'BM') && [12, 40, 52, 56, 64, 108, 124].indexOf(u32(R, 14)) >= 0) return T('bmp');
    if (van(R, 0, [0, 0, 1, 0]) && u16(R, 4) > 0 && u16(R, 4) < 64 && R.at(9) === 0) return T('ico');
    if (van(R, 0x8001, 'CD001') || van(R, 0x8801, 'CD001') || van(R, 0x9001, 'CD001')) return T('iso');
    if (R.meret > 512 && van(R, R.meret - 512, 'koly')) return T('dmg');
    if (a0 === 0xFF && a1 >= 0 && (a1 & 0xF6) === 0xF0) return T('aac');
    if (a0 === 0xFF && a1 >= 0 && (a1 & 0xE0) === 0xE0 && ((a1 >> 1) & 3) !== 0) return T('mp3');
    var s = szovegMinta(R);
    if (s !== null) return T(szovegTipus(s));
    return null;
  }

  // ---------- ZIP ----------
  function zipNev(R, k, n, utf) {
    var b = R.resz(k, k + n);
    if (!b) return '';
    return utf || ervenyesUtf8(b, 0, b.length) ? utf8(b, 0, b.length) : lat(b, 0, b.length);
  }
  function zipKonyvtar(R) {
    var min = Math.max(0, R.meret - 65557), p;
    for (p = R.meret - 22; p >= min; p--) if (R.at(p) === 0x50 && van(R, p, 'PK\x05\x06')) break;
    if (p < min || R.at(p) < 0) return null;
    var ossz = u16(R, p + 10), cdMeret = u32(R, p + 12), cdHely = u32(R, p + 16);
    if (cdHely === 0xFFFFFFFF || ossz === 0xFFFF || cdMeret === 0xFFFFFFFF) {   // ZIP64
      var lok = p - 20;
      if (van(R, lok, 'PK\x06\x07')) {
        var z64 = u32(R, lok + 8) + u32(R, lok + 12) * 4294967296;
        if (van(R, z64, 'PK\x06\x06')) { ossz = u32(R, z64 + 32); cdMeret = u32(R, z64 + 40); cdHely = u32(R, z64 + 48); }
      }
    }
    if (ossz < 0 || cdMeret < 0 || cdHely < 0) return null;
    var eltolas = p - (cdHely + cdMeret);              // a ZIP előtt más adat van (pl. képhez fűzve)
    if (eltolas < 0) eltolas = 0;
    var q = cdHely + eltolas, lista = [], reszleges = false;
    for (var i = 0; i < ossz && i < 5000; i++) {
      if (!van(R, q, 'PK\x01\x02')) { reszleges = R.at(q) < 0; break; }
      var flags = u16(R, q + 8), nl = u16(R, q + 28), xl = u16(R, q + 30), cl = u16(R, q + 32);
      lista.push({ nev: zipNev(R, q + 46, nl, flags & 0x800), titkos: !!(flags & 1), modszer: u16(R, q + 10),
        tom: u32(R, q + 20), lho: u32(R, q + 42) + eltolas });
      q += 46 + nl + xl + cl;
    }
    return { lista: lista, eltolas: eltolas, reszleges: reszleges };
  }
  function zipHelyi(R) {                // tartalomjegyzék nélkül (csonka / csak az eleje van meg): a helyi fejlécek sorban
    var p = 0, lista = [];
    while (lista.length < 5000 && van(R, p, 'PK\x03\x04')) {
      var flags = u16(R, p + 6), tom = u32(R, p + 18), nl = u16(R, p + 26), xl = u16(R, p + 28);
      lista.push({ nev: zipNev(R, p + 30, nl, flags & 0x800), titkos: !!(flags & 1), modszer: u16(R, p + 8), tom: tom, lho: p });
      if ((flags & 8) && !tom) break;
      p += 30 + nl + xl + tom;
    }
    return lista.length ? { lista: lista, eltolas: 0, reszleges: true } : null;
  }
  var kibontva = 0;
  function zipAdat(R, e, max) {
    if (e.titkos || !van(R, e.lho, 'PK\x03\x04')) return null;
    var k = e.lho + 30 + u16(R, e.lho + 26) + u16(R, e.lho + 28), b = R.resz(k, k + e.tom);
    if (!b) return null;
    if (e.modszer === 0) return b.subarray(0, Math.min(b.length, max));
    if (e.modszer === 8 && kibontva < KIBONT_OSSZES) { var o = kibont(b, 0, max, false); kibontva += o.length; return o; }
    return null;
  }
  function zipAltipus(R, kv) {
    var nevek = [], i;
    for (i = 0; i < kv.lista.length; i++) nevek.push(kv.lista[i].nev);
    function van2(re) { for (var j = 0; j < nevek.length; j++) if (re.test(nevek[j])) return true; return false; }
    if (van2(/^\[Content_Types\]\.xml$/i)) return van2(/^word\//) ? 'docx' : van2(/^xl\//) ? 'xlsx' : van2(/^ppt\//) ? 'pptx' : 'ooxml';
    if (van2(/^AndroidManifest\.xml$/) && van2(/^classes\d*\.dex$/)) return 'apk';
    if (van2(/^META-INF\/MANIFEST\.MF$/i) && van2(/\.class$/)) return 'jar';
    for (i = 0; i < kv.lista.length; i++) {
      if (kv.lista[i].nev !== 'mimetype') continue;
      var d = zipAdat(R, kv.lista[i], 200), mt = d ? lat(d, 0, d.length) : '';
      if (mt === 'application/epub+zip') return 'epub';
      if (mt.indexOf('application/vnd.oasis.opendocument') === 0) return 'odf';
    }
    return 'zip';
  }
  function archivProgramok(nevek) {     // a bejegyzések közül a veszélyesek (max. 5 név)
    var ki = [];
    for (var i = 0; i < nevek.length && ki.length < 5; i++) {
      var alap = nevek[i].replace(/^.*\//, '');
      if (!alap) continue;
      var n = nevElemez(alap);
      if (VESZELYES[n.ext] || megtevesztoNev(n) || n.iranyvalto) ki.push(n.latszo);
    }
    return ki;
  }

  // ---------- domainek (linkek) ----------
  function domain(u) {
    u = String(u || '');
    var m = /^\s*[a-z][a-z0-9+.\-]*:\/\/(?:[^@\/?#\s]*@)?([^\/?#:\s\\]+)/i.exec(u) || /^\s*\\\\([^\\\/\s]+)/.exec(u) || /^\s*(www\.[^\/?#:\s]+)/i.exec(u);
    return m ? m[1].toLowerCase() : null;
  }
  function domainLista(urlek) {
    var o = [], l = {};
    for (var i = 0; i < urlek.length; i++) { var d = domain(urlek[i]); if (d && !l[d]) { l[d] = true; o.push(d); } }
    return o;
  }

  // ---------- Office (OOXML / ODF) ----------
  var MAKROS_KIT = halmaz('docm dotm xlsm xltm xlam pptm potm ppsm ppam');
  function officeVizsgal(R, kv, n, jelek) {
    var lista = kv.lista, makro = false, beagy = false, i;
    for (i = 0; i < lista.length; i++) {
      var nv = lista[i].nev;
      if (/(^|\/)vbaProject\.bin$/i.test(nv) || /^xl\/macrosheets\//i.test(nv) || /^Basic\/.+/.test(nv)) makro = true;
      if (/\/embeddings\/oleObject\d*\.bin$/i.test(nv) || /\/activeX\/activeX\d*\.bin$/i.test(nv)) beagy = true;
    }
    var kulso = [], linkek = [], db = 0, makroTipus = false;
    for (i = 0; i < lista.length && db < 60; i++) {
      var e = lista[i];
      if (e.nev === '[Content_Types].xml') {
        var ct = zipAdat(R, e, 1024 * 1024);
        if (ct && /macroEnabled/i.test(utf8(ct, 0, ct.length))) makroTipus = true;
      }
      if (!/\.rels$/i.test(e.nev)) continue;
      db++;
      var d = zipAdat(R, e, 1024 * 1024);
      if (!d) continue;
      var s = utf8(d, 0, d.length), re = /<Relationship\b[^>]*>/gi, m;
      while ((m = re.exec(s))) {
        var tag = m[0];
        if (!/TargetMode\s*=\s*["']External["']/i.test(tag)) continue;
        var tipus = (/\bType\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || '';
        var cel = (/\bTarget\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || '';
        if (/\/(attachedTemplate|oleObject|frame|subDocument)$/i.test(tipus)) kulso.push(domain(cel) || cel.slice(0, 80));
        else if (/\/hyperlink$/i.test(tipus)) linkek.push(cel);
      }
    }
    if (makro) jelek.push(J('makro', 'piros'));
    else if (MAKROS_KIT[n.ext] || makroTipus) jelek.push(J('makro_formatum', 'sarga'));
    if (kulso.length) jelek.push(J('office_kulso', 'sarga', { celok: kulso.slice(0, 5) }));
    if (beagy) jelek.push(J('beagyazott_objektum', 'sarga'));
    var dl = domainLista(linkek);
    if (dl.length) jelek.push(J('office_linkek', 'info', { domainek: dl.slice(0, 10), db: dl.length }));
  }

  // ---------- régi Office / MSI (OLE) ----------
  var MSI_CLSID_VEG = [0x00, 0x00, 0x00, 0x00, 0x00, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46];
  function oleVizsgal(R) {
    var ss = u16(R, 0x1E), dir = u32(R, 0x30), msi = false;
    if (ss >= 9 && ss <= 12 && dir >= 0 && dir < 0xFFFFFFF0) {
      var gyoker = (dir + 1) * Math.pow(2, ss), c = gyoker + 0x50;
      if (R.at(c) >= 0 && [0x82, 0x84, 0x86].indexOf(R.at(c)) >= 0 && R.at(c + 1) === 0x10 && R.at(c + 2) === 0x0C) msi = van(R, c + 3, MSI_CLSID_VEG);
    }
    var b = R.e;
    return {
      msi: msi,
      vba: keres(b, 0, b.length, utf16le('_VBA_PROJECT')) >= 0,
      titkos: keres(b, 0, b.length, utf16le('EncryptedPackage')) >= 0,
      objektum: keres(b, 0, b.length, utf16le('Ole10Native')) >= 0
    };
  }

  // ---------- RAR ----------
  function vint(R, p) {          // RAR5 változó hosszú szám: { v, h }
    var v = 0, m = 1, i = 0, c;
    do { c = R.at(p + i); if (c < 0 || i > 9) return null; v += (c & 0x7F) * m; m *= 128; i++; } while (c & 0x80);
    return { v: v, h: i };
  }
  function rarVizsgal(R) {
    var nevek = [], titkos = false, fejlecTitkos = false, p, i, x;
    if (van(R, 0, 'Rar!\x1A\x07\x00')) {
      p = 7;
      for (i = 0; i < 3000; i++) {
        var tip = R.at(p + 2), fl = u16(R, p + 3), meret = u16(R, p + 5);
        if (tip < 0 || meret < 7) break;
        var plusz = (fl & 0x8000) ? u32(R, p + 7) : 0;
        if (tip === 0x73 && (fl & 0x0080)) { fejlecTitkos = true; break; }
        if (tip === 0x74) {
          plusz = u32(R, p + 7);
          var nl = u16(R, p + 26), nk = p + 32 + ((fl & 0x100) ? 8 : 0), nb = R.resz(nk, nk + nl);
          if (nb) { var z = 0; while (z < nb.length && nb[z]) z++; nevek.push(utf8(nb, 0, z)); }
          if (fl & 0x04) titkos = true;
        }
        if (tip === 0x7B || plusz < 0) break;
        p += meret + plusz;
      }
      return { nevek: nevek, titkos: titkos || fejlecTitkos, latszik: !fejlecTitkos && (nevek.length > 0) };
    }
    if (van(R, 0, 'Rar!\x1A\x07\x01\x00')) {
      p = 8;
      for (i = 0; i < 3000; i++) {
        var hs = vint(R, p + 4);
        if (!hs) break;
        var k = p + 4 + hs.h, q = k, t = vint(R, q); if (!t) break; q += t.h;
        var hf = vint(R, q); if (!hf) break; q += hf.h;
        var extra = 0, adat = 0;
        if (hf.v & 1) { x = vint(R, q); if (!x) break; extra = x.v; q += x.h; }
        if (hf.v & 2) { x = vint(R, q); if (!x) break; adat = x.v; q += x.h; }
        if (t.v === 4) { fejlecTitkos = true; break; }
        if (t.v === 2) {
          var ff = vint(R, q); if (!ff) break; q += ff.h;
          x = vint(R, q); if (!x) break; q += x.h;          // kicsomagolt méret
          x = vint(R, q); if (!x) break; q += x.h;          // attribútumok
          if (ff.v & 2) q += 4;
          if (ff.v & 4) q += 4;
          x = vint(R, q); if (!x) break; q += x.h;          // tömörítés
          x = vint(R, q); if (!x) break; q += x.h;          // OS
          var nh = vint(R, q); if (!nh) break; q += nh.h;
          var nb5 = R.resz(q, q + nh.v); if (nb5) nevek.push(utf8(nb5, 0, nb5.length));
          var ek = k + hs.v - extra, ev = k + hs.v;           // extra terület: titkosítási rekord (1)?
          while (extra && ek < ev) {
            var rm = vint(R, ek); if (!rm || !rm.v) break;
            var rt = vint(R, ek + rm.h); if (!rt) break;
            if (rt.v === 1) titkos = true;
            ek += rm.h + rm.v;
          }
        }
        if (t.v === 5) break;
        p = k + hs.v + adat;
      }
      return { nevek: nevek, titkos: titkos || fejlecTitkos, latszik: !fejlecTitkos && (nevek.length > 0) };
    }
    return { nevek: [], titkos: false, latszik: false };
  }

  // ---------- GZIP (+ benne TAR) ----------
  function gzipVizsgal(R) {
    var fl = R.at(3), p = 10, nev = '';
    if (fl < 0) return { nevek: [] };
    if (fl & 4) p += 2 + u16(R, 10);
    if (fl & 8) { var k = p; while (R.at(p) > 0 && p - k < 1024) p++; var nb = R.resz(k, p); nev = nb ? lat(nb, 0, nb.length) : ''; p++; }
    if (fl & 16) { while (R.at(p) > 0) p++; p++; }
    if (fl & 2) p += 2;
    var nevek = nev ? [nev] : [];
    if (R.teljes && kibontva < KIBONT_OSSZES) {
      var d = kibont(R.e, p, KIBONT_KORLAT, false);
      kibontva += d.length;
      if (d.length >= 512 && lat(d, 257, 262) === 'ustar') {
        nevek = [];
        for (var q = 0; q + 512 <= d.length && nevek.length < 2000;) {
          var nz = q; while (nz < q + 100 && d[nz]) nz++;
          if (nz === q) break;
          var elo = lat(d, q + 345, q + 500).replace(/\u0000[\s\S]*$/, '');
          nevek.push((elo ? elo + '/' : '') + utf8(d, q, nz));
          var meret = parseInt(lat(d, q + 124, q + 136).replace(/[^0-7]/g, '') || '0', 8);
          q += 512 + Math.ceil(meret / 512) * 512;
        }
      }
    }
    return { nevek: nevek };
  }

  // ---------- PDF ----------
  function pdfVizsgal(R, jelek) {
    var nyers = R.teljes ? lat(R.e, 0, R.e.length) : lat(R.e, 0, R.e.length) + '\n' + lat(R.v, 0, R.v.length);
    var reszek = [nyers], objStm = {}, re = /\/Type\s*\/ObjStm\b/g, m, db = 0;
    if (R.teljes) {
      while ((m = re.exec(nyers)) && db < 300 && kibontva < KIBONT_OSSZES) {
        db++;
        var objK = nyers.lastIndexOf('obj', m.index), sk = nyers.indexOf('stream', m.index);
        if (sk < 0 || sk - m.index > 4000) continue;
        var dict = nyers.slice(objK < 0 ? Math.max(0, m.index - 500) : objK, sk);
        var k = sk + 6;
        if (nyers.charAt(k) === '\r') k++;
        if (nyers.charAt(k) === '\n') k++;
        var z = nyers.indexOf('endstream', k);
        if (z < 0) continue;
        if (!/\/FlateDecode\b/.test(dict) || /\/DecodeParms/.test(dict)) continue;
        var ki = kibont(R.e.subarray(k, z), 0, KIBONT_KORLAT, true);
        kibontva += ki.length;
        if (!ki.length) continue;
        var s = lat(ki, 0, ki.length), elso = +((/\/First\s+(\d+)/.exec(dict) || [])[1] || 0), N = +((/\/N\s+(\d+)/.exec(dict) || [])[1] || 0);
        reszek.push(s);
        var fej = s.slice(0, elso).match(/\d+/g) || [];
        for (var i = 0; i + 1 < fej.length && i / 2 < N; i += 2) {
          var vegpont = i + 3 < fej.length ? +fej[i + 3] : s.length - elso;
          objStm[fej[i]] = s.slice(elso + (+fej[i + 1]), elso + vegpont);
        }
      }
    }
    // a nevekben a #xx kódolás feloldása (/J#61vaScript = /JavaScript)
    var szoveg = reszek.join('\n').replace(/\/[^\s\/<>\[\]()%{}]*#[0-9A-Fa-f]{2}[^\s\/<>\[\]()%{}]*/g, function (t) {
      return t.replace(/#([0-9A-Fa-f]{2})/g, function (x, h) { return String.fromCharCode(parseInt(h, 16)); });
    });
    var objIndex = {}, ro = /(\d+)\s+(\d+)\s+obj\b/g;
    while ((m = ro.exec(nyers))) objIndex[m[1]] = m.index + m[0].length;
    function objektum(num) {
      if (objStm[num] !== undefined) return objStm[num];
      if (objIndex[num] !== undefined) { var v = nyers.indexOf('endobj', objIndex[num]); return nyers.slice(objIndex[num], v < 0 ? objIndex[num] + 4000 : Math.min(v, objIndex[num] + 20000)); }
      return '';
    }
    function ertek(s, i) {          // a kulcs utáni érték: szótár szövege, hivatkozott objektum, vagy tömb
      var r = s.slice(i, i + 40).replace(/^\s+/, ''), j;
      var ref = /^(\d+)\s+\d+\s+R/.exec(r);
      if (ref) return objektum(ref[1]);
      j = s.indexOf('<<', i);
      if (j < 0 || s.slice(i, j).replace(/\s+/g, '') !== '') return '';
      var mely = 0, q = j;
      while (q < s.length - 1 && q - j < 20000) {
        if (s.charAt(q) === '<' && s.charAt(q + 1) === '<') { mely++; q += 2; continue; }
        if (s.charAt(q) === '>' && s.charAt(q + 1) === '>') { mely--; q += 2; if (!mely) break; continue; }
        q++;
      }
      return s.slice(j, q);
    }
    var JS_RE = /\/(?:JavaScript|JS)(?![A-Za-z0-9])/;
    var vanJS = JS_RE.test(szoveg), auto = false, muvelet = false, rk;
    var oa = /\/OpenAction(?![A-Za-z0-9])/g;
    while ((rk = oa.exec(szoveg))) {
      var ov = ertek(szoveg, rk.index + rk[0].length);
      if (JS_RE.test(ov)) auto = true;
      else if (/\/S\s*\/(?:URI|Launch|SubmitForm|ImportData|GoToR|GoToE|Rendition|Sound|Movie)\b/.test(ov)) muvelet = true;
    }
    var aa = /\/AA(?![A-Za-z0-9])/g;
    while ((rk = aa.exec(szoveg))) {
      var av = ertek(szoveg, rk.index + rk[0].length);
      if (/\/(?:O|PO|PV)\s*(?:<<|\d+\s+\d+\s+R)/.test(av)) { if (JS_RE.test(av) || vanJS) auto = true; else muvelet = true; }
    }
    if (/\/Names\s*<<(?:(?!>>)[\s\S]){0,2000}?\/JavaScript(?![A-Za-z0-9])/.test(szoveg)) auto = true;
    var inditas = /\/Launch(?![A-Za-z0-9])/.test(szoveg);
    var csatolt = /\/EmbeddedFiles?(?![A-Za-z0-9])/.test(szoveg);
    if (inditas) jelek.push(J('pdf_inditas', 'piros'));
    if (vanJS && auto) jelek.push(J('pdf_kod_auto', 'piros'));
    else if (vanJS) jelek.push(J('pdf_kod', 'sarga'));
    else if (muvelet) jelek.push(J('pdf_muvelet', 'sarga'));
    if (csatolt) {
      var cn = [], rc = /\/(?:UF|F)\s*\(((?:\\.|[^\\)]){1,300})\)/g, c, veszely = [], ismeretlen = 0;
      while ((c = rc.exec(szoveg)) && cn.length < 20) {
        var nv = c[1].replace(/\\(.)/g, '$1');
        if (nv.charCodeAt(0) === 0xFE && nv.charCodeAt(1) === 0xFF) { var u = ''; for (var q2 = 2; q2 + 1 < nv.length; q2 += 2) u += String.fromCharCode(nv.charCodeAt(q2) * 256 + nv.charCodeAt(q2 + 1)); nv = u; }
        if (cn.indexOf(nv) < 0) cn.push(nv);
      }
      for (var ci = 0; ci < cn.length; ci++) {
        var ne = nevElemez(cn[ci]);
        if (VESZELYES[ne.ext] || megtevesztoNev(ne)) veszely.push(ne.latszo);
        else if (!/^(xml|pdf|txt|csv|json|jpg|jpeg|png|gif)$/.test(ne.ext)) ismeretlen++;
      }
      if (veszely.length) jelek.push(J('pdf_csatolt_program', 'piros', { nevek: veszely.slice(0, 5) }));
      else if (ismeretlen || !cn.length) jelek.push(J('pdf_csatolt', 'sarga', { nevek: cn.slice(0, 5) }));
      else jelek.push(J('pdf_csatolmanyok', 'info', { nevek: cn.slice(0, 5) }));
    }
    var urlek = [], ru = /\/URI\s*\(((?:\\.|[^\\)]){1,2000})\)/g, uh = /\/URI\s*<([0-9A-Fa-f\s]{2,4000})>/g, x;
    while ((x = ru.exec(szoveg)) && urlek.length < 500) urlek.push(x[1].replace(/\\(.)/g, '$1'));
    while ((x = uh.exec(szoveg)) && urlek.length < 500) {
      var hx = x[1].replace(/\s+/g, ''), su = '';
      for (var hi = 0; hi + 1 < hx.length; hi += 2) su += String.fromCharCode(parseInt(hx.substr(hi, 2), 16));
      urlek.push(su);
    }
    var dl = domainLista(urlek);
    if (dl.length) jelek.push(J('pdf_linkek', 'info', { domainek: dl.slice(0, 10), db: dl.length }));
  }

  // ---------- SVG / HTML ----------
  function teljesSzoveg(R) {
    var b = R.e;
    return ervenyesUtf8(b, 0, b.length) ? utf8(b, 0, b.length) : lat(b, 0, b.length);
  }
  function svgVizsgal(s, jelek) {
    var mi = [];
    if (/<script[\s>\/]/i.test(s)) mi.push('script');
    if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(s)) mi.push('esemeny');
    if (/(?:href|src|action)\s*=\s*["']?\s*(?:javascript|data:text\/html)/i.test(s) || /javascript\s*:/i.test(s)) mi.push('javascript');
    if (/<foreignObject[\s>]/i.test(s)) mi.push('foreignobject');
    if (/<(?:iframe|embed|object)[\s>]/i.test(s)) mi.push('beagyazas');
    if (/<a\s[^>]*href\s*=\s*["']?\s*https?:/i.test(s)) mi.push('kulso_link');
    if (/http-equiv\s*=\s*["']?refresh/i.test(s) || /(?:window|document|top|self)\.location\b|location\.(?:href|replace|assign)\b/i.test(s)) mi.push('atiranyitas');
    if (mi.length) jelek.push(J('svg_kod', 'piros', { mi: mi }));
  }
  function htmlVizsgal(s, jelek) {
    var mi = [];
    if (/<input[^>]*type\s*=\s*["']?password/i.test(s)) mi.push('jelszo');
    if (/<form[\s>]/i.test(s) || /<input[^>]*type\s*=\s*["']?email/i.test(s)) mi.push('urlap');
    if (/http-equiv\s*=\s*["']?refresh/i.test(s) || /(?:window|document|top|self)\.location(?:\.href)?\s*=|location\.(?:replace|assign)\s*\(|location\.href\s*=/i.test(s)) mi.push('atiranyitas');
    if (/\b(?:atob|unescape|decodeURIComponent|fromCharCode)\s*\(/i.test(s) && /document\.write\s*\(|\.innerHTML\s*=|\beval\s*\(|new\s+Function\s*\(/i.test(s)) mi.push('rejtett_kod');
    if (mi.length) jelek.push(J('html_adathalasz', 'piros', { mi: mi }));
    else jelek.push(J('html', 'sarga'));
  }

  // ---------- kép végére fűzött adat ----------
  function jpegVeg(b, n) {
    var p = 2, m, len, c;
    while (p + 1 < n) {
      if (b[p] !== 0xFF) return -1;
      while (p < n && b[p] === 0xFF) p++;
      if (p >= n) return -1;
      m = b[p++];
      if (m === 0xD9) return p;
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)) continue;
      if (p + 1 >= n) return -1;
      len = b[p] * 256 + b[p + 1];
      if (len < 2) return -1;
      p += len;
      if (m === 0xDA) {
        while (p + 1 < n) {
          if (b[p] === 0xFF) { c = b[p + 1]; if (c === 0 || (c >= 0xD0 && c <= 0xD7)) { p += 2; continue; } if (c === 0xFF) { p++; continue; } break; }
          p++;
        }
      }
    }
    return -1;
  }
  function pngVeg(b, n) {
    var p = 8;
    while (p + 12 <= n) {
      var len = b[p] * 16777216 + b[p + 1] * 65536 + b[p + 2] * 256 + b[p + 3];
      var t = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
      p += 12 + len;
      if (t === 'IEND') return p;
    }
    return -1;
  }
  function peProgram(R, p) {
    if (!van(R, p, 'MZ')) return false;
    var e = u32(R, p + 0x3C);
    if (e > 0 && e < 0x10000 && van(R, p + e, 'PE\x00\x00')) return true;
    var b = R.resz(p, Math.min(R.meret, p + 512));
    return !!b && /This program cannot be run|This program must be run/.test(lat(b, 0, b.length));
  }
  function hozzafuzott(R, veg, jelek) {
    if (veg < 0 || veg >= R.meret) return false;
    var p = veg, lim = Math.min(R.meret, veg + 16), b = R.e;
    while (p < lim && (b[p] === 0 || b[p] === 0x0A || b[p] === 0x0D || b[p] === 0x20)) p++;
    var minta = lat(b, veg, Math.min(R.meret, veg + 256));
    if (minta.slice(0, 64).indexOf('ftyp') >= 0 || minta.indexOf('MotionPhoto') >= 0) { jelek.push(J('elo_foto', 'info')); return true; }
    if (peProgram(R, p) || van(R, p, [0x7F, 0x45, 0x4C, 0x46])) { jelek.push(J('hozzafuzott', 'piros', { mi: 'program' })); return true; }
    if (van(R, p, 'PK\x03\x04') || van(R, p, 'Rar!\x1A\x07') || van(R, p, [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])) { jelek.push(J('hozzafuzott', 'piros', { mi: 'archivum' })); return true; }
    return false;
  }

  // ---------- MP3: link az ID3-címkében ----------
  function id3Linkek(R) {
    if (!van(R, 0, 'ID3')) return [];
    var ver = R.at(3), meret = (R.at(6) & 127) * 2097152 + (R.at(7) & 127) * 16384 + (R.at(8) & 127) * 128 + (R.at(9) & 127);
    var p = 10, veg = Math.min(R.meret, 10 + meret), urlek = [];
    if (ver === 2) {
      while (p + 6 <= veg && urlek.length < 20) {
        var id2 = String.fromCharCode(R.at(p), R.at(p + 1), R.at(p + 2)), m2 = R.at(p + 3) * 65536 + R.at(p + 4) * 256 + R.at(p + 5);
        if (!/^[A-Z0-9]{3}$/.test(id2) || m2 <= 0) break;
        if (id2.charAt(0) === 'W') { var b2 = R.resz(p + 6, Math.min(veg, p + 6 + m2)); if (b2) urlek.push(lat(b2, 0, b2.length)); }
        p += 6 + m2;
      }
      return domainLista(urlek);
    }
    if ((R.at(5) & 0x40) && ver === 3) p += 4 + u32be(R, 10);
    else if ((R.at(5) & 0x40) && ver === 4) p += (R.at(10) & 127) * 2097152 + (R.at(11) & 127) * 16384 + (R.at(12) & 127) * 128 + (R.at(13) & 127);
    while (p + 10 <= veg && urlek.length < 20) {
      var id = String.fromCharCode(R.at(p), R.at(p + 1), R.at(p + 2), R.at(p + 3));
      var m = ver === 4 ? (R.at(p + 4) & 127) * 2097152 + (R.at(p + 5) & 127) * 16384 + (R.at(p + 6) & 127) * 128 + (R.at(p + 7) & 127) : u32be(R, p + 4);
      if (!/^[A-Z0-9]{4}$/.test(id) || m <= 0) break;
      if (id.charAt(0) === 'W') {
        var b = R.resz(p + 10, Math.min(veg, p + 10 + m));
        if (b) urlek.push(id === 'WXXX' ? lat(b, 0, b.length).replace(/^[\s\S]*?(?=[a-z][a-z0-9+.\-]*:\/\/|www\.)/i, '') : lat(b, 0, b.length));
      }
      p += 10 + m;
    }
    return domainLista(urlek);
  }

  // ---------- összesítés ----------
  function J(id, szint, adat) { return { id: id, szint: szint, adat: adat || {} }; }
  var RANG = { piros: 0, sarga: 1, info: 2 };

  /** A fő függvény: { nev, meret, eleje: Uint8Array, vege?: Uint8Array } → eredmény. */
  function vizsgal(a) {
    a = a || {};
    kibontva = 0;
    var R = olvaso(a), n = nevElemez(a.nev), jelek = [], tipus = tipusFelismer(R), i;
    var cs = tipus ? tipus.csoport : '';

    // 1–4. fájlnév + program
    if (n.iranyvalto) jelek.push(J('iranyvalto', 'piros', { latszo: n.latszo }));
    var dupla = megtevesztoNev(n);
    if (dupla) jelek.push(J('dupla_kiterjesztes', 'piros', { latszo: n.latszo, valodi: n.ext, szokoz: n.szokoz }));

    // ZIP-család: altípus a tartalomjegyzékből
    var kv = null;
    if (tipus && tipus.id === 'zip') {
      kv = zipKonyvtar(R) || zipHelyi(R);
      if (kv && kv.lista.length) tipus = T(zipAltipus(R, kv));
      cs = tipus.csoport;
    }
    var ole = null;
    if (tipus && tipus.id === 'ole') { ole = oleVizsgal(R); if (ole.msi) { tipus = T('msi'); cs = 'program'; } }

    // program a tartalom — kivéve, ha a kiterjesztés szerint csak szövegként nyílik meg (jegyzet.txt-ben szkript-szöveg)
    var program = (cs === 'program' || cs === 'lemezkep') && !(n.ext && !VESZELYES[n.ext] && KIT[n.ext] && illik(n.ext, tipus));
    if (program && n.ext && csali(n.ext) && !dupla) jelek.push(J('alcazott_program', 'piros', { latszo: n.ext, valodi: tipus.id }));
    else if (!dupla && (program || VESZELYES[n.ext])) jelek.push(J('program', 'piros', { kiterjesztes: n.ext, tipus: tipus ? tipus.id : '' }));

    // 5–10. tartalom
    if (kv && kv.lista.length) {
      var nevek = [];
      for (i = 0; i < kv.lista.length; i++) nevek.push(kv.lista[i].nev);
      if (tipus.id !== 'apk' && tipus.id !== 'jar') {
        var pr = archivProgramok(nevek);
        if (pr.length) jelek.push(J('archiv_program', 'piros', { nevek: pr }));
      }
      for (i = 0; i < kv.lista.length; i++) if (kv.lista[i].titkos) { jelek.push(J('jelszavas_archiv', 'sarga')); break; }
      if (/^(docx|xlsx|pptx|ooxml|odf)$/.test(tipus.id)) officeVizsgal(R, kv, n, jelek);
      if (kv.reszleges && !R.teljes) jelek.push(J('reszleges', 'info'));
    }
    if (tipus && tipus.id === 'rar') {
      var rv = rarVizsgal(R), rp = archivProgramok(rv.nevek);
      if (rp.length) jelek.push(J('archiv_program', 'piros', { nevek: rp }));
      if (rv.titkos) jelek.push(J('jelszavas_archiv', 'sarga'));
      else if (!rv.latszik) jelek.push(J('archiv_zart', 'sarga'));
    }
    if (tipus && (tipus.id === '7z' || tipus.id === 'cab')) jelek.push(J('archiv_zart', 'sarga'));
    if (tipus && tipus.id === 'gzip') {
      var gp = archivProgramok(gzipVizsgal(R).nevek);
      if (gp.length) jelek.push(J('archiv_program', 'piros', { nevek: gp }));
    }
    if (ole && !ole.msi) {
      if (ole.vba) jelek.push(J('makro', 'piros'));
      if (ole.titkos) jelek.push(J('jelszavas_dokumentum', 'sarga'));
      if (ole.objektum) jelek.push(J('beagyazott_objektum', 'sarga'));
      if (!ole.vba && !ole.titkos) jelek.push(J('regi_office', 'sarga'));
    }
    if (tipus && tipus.id === 'rtf') {
      var rb = R.e.subarray(0, Math.min(R.e.length, 4 * 1024 * 1024));
      jelek.push(J('rtf', 'sarga', { objektum: /\\obj(?:data|ocx|emb|link|autlink)\b/.test(lat(rb, 0, rb.length)) }));
    }
    if (tipus && tipus.id === 'pdf') pdfVizsgal(R, jelek);
    if (tipus && (tipus.id === 'svg' || tipus.id === 'html' || (tipus.id === 'xml' && /^(svg|html?|xhtml)$/.test(n.ext)))) {
      var szov = teljesSzoveg(R);
      if (tipus.id === 'svg' || (tipus.id === 'xml' && n.ext === 'svg')) svgVizsgal(szov, jelek);
      else htmlVizsgal(szov, jelek);
    }
    if (cs === 'kep' || cs === 'hang' || cs === 'video') {
      var fuzott = false;
      if (R.teljes && tipus.id === 'jpeg') fuzott = hozzafuzott(R, jpegVeg(R.e, R.e.length), jelek);
      if (R.teljes && tipus.id === 'png') fuzott = hozzafuzott(R, pngVeg(R.e, R.e.length), jelek);
      if (!fuzott) {                     // ZIP a fájl végén (bármelyik képhez/hanghoz fűzve)
        var zk = zipKonyvtar(R);
        if (zk && zk.lista.length && zk.eltolas > 0) {
          var zn = []; for (i = 0; i < zk.lista.length; i++) zn.push(zk.lista[i].nev);
          jelek.push(J('hozzafuzott', 'piros', { mi: 'archivum', nevek: archivProgramok(zn) }));
        }
      }
      if (tipus.id === 'mp3') { var il = id3Linkek(R); if (il.length) jelek.push(J('id3_link', 'info', { domainek: il.slice(0, 10) })); }
    }

    // 11. + 15. a név és a tartalom
    var vanPiros = false;
    for (i = 0; i < jelek.length; i++) if (jelek[i].szint === 'piros' && /^(alcazott_program|dupla_kiterjesztes|program)$/.test(jelek[i].id)) vanPiros = true;
    if (n.ext && KIT[n.ext] && !VESZELYES[n.ext] && !vanPiros) {
      if (!tipus) jelek.push(J('ismeretlen_nev_mas', 'sarga', { latszo: n.ext }));
      else if (!illik(n.ext, tipus)) jelek.push(J('nev_nem_egyezik', 'sarga', { latszo: n.ext, valodi: tipus.id }));
    }
    if (!R.teljes && !kv) jelek.push(J('reszleges', 'info'));

    jelek.sort(function (x, y) { return RANG[x.szint] - RANG[y.szint]; });
    var szint = 'zold';
    if (jelek.length && jelek[0].szint === 'piros') szint = 'piros';
    else if (jelek.length && jelek[0].szint === 'sarga') szint = 'sarga';
    else if (!tipus) szint = 'semleges';
    return { szint: szint, tipus: tipus, nev: n, jelek: jelek, teljes: R.teljes };
  }

  return { vizsgal: vizsgal, olvasasiTerv: olvasasiTerv,
    _: { kibont: kibont, nevElemez: nevElemez, tipusFelismer: function (b) { return tipusFelismer(olvaso({ eleje: b, meret: b.length })); },
      jpegVeg: jpegVeg, pngVeg: pngVeg, domain: domain } };
}
