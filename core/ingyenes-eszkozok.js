// ===================================================================
// 🧰 INGYENES ESZKÖZÖK (2026-10-21, user: „Biztonságos bemásolás és a 🧩 Promptépítő, egy új
// »🧰 Ingyenes eszközök« — ezt csináljuk meg, de a saját oldalunkra tervezve!”)
// Saját fejlesztés, külső kód és könyvtár nélkül (2026-10-21).
//
// Mindkét eszköz A LÁTOGATÓ BÖNGÉSZŐJÉBEN fut: semmit nem küldünk el, nincs külső könyvtár, nincs
// letöltés. Az `eszkozMag()` függvény FORRÁSA kerül az oldalba (toString) — így a böngésző és a
// Node-teszt UGYANAZT a kódot futtatja. Ezért a magban NINCS külső hivatkozás, és nincs benne
// lookbehind (régi iOS-es Facebook-böngésző: szintaxishiba → az egész szkript leállna).
// ===================================================================

/** A közös mag: személyes adat keresése, kitakarás, visszaállítás, prompt-összerakás. */
export function eszkozMag() {
  'use strict';
  var BETU = 'A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüűÑñ';
  var NAGY = 'A-ZÁÉÍÓÖŐÚÜŰÑ', KIS = "a-záéíóöőúüűñ'\\-";

  function luhn(d) { var s = 0, alt = false; for (var i = d.length - 1; i >= 0; i--) { var n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; }
  function ibanOk(s) {
    var t = s.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(t)) return false;
    var r = (t.slice(4) + t.slice(0, 4)).replace(/[A-Z]/g, function (c) { return String(c.charCodeAt(0) - 55); });
    var m = 0; for (var i = 0; i < r.length; i++) m = (m * 10 + +r[i]) % 97;
    return m === 1;
  }
  // TAJ: a páratlan helyiértékű számjegyek ×3, a párosak ×7, az összeg mod 10 = a 9. számjegy
  function tajOk(d) { if (d.length !== 9) return false; var s = 0; for (var i = 0; i < 8; i++) s += +d[i] * (i % 2 === 0 ? 3 : 7); return s % 10 === +d[8]; }
  // Adóazonosító jel: 8-cal kezdődik, az első 9 számjegy × helyiérték, összeg mod 11 = a 10.
  function adoOk(d) { if (d.length !== 10 || d[0] !== '8') return false; var s = 0; for (var i = 0; i < 9; i++) s += +d[i] * (i + 1); return s % 11 === +d[9]; }
  function dniOk(s) {
    var t = s.toUpperCase().replace(/[\s-]/g, ''), m = t.match(/^([XYZ]?)(\d{7,8})([A-Z])$/);
    if (!m) return false;
    var num = m[2];
    if (m[1]) num = 'XYZ'.indexOf(m[1]) + num; else if (num.length !== 8) return false;
    return 'TRWAGMYFPDXBNJZSQVHLCKE'[+num % 23] === m[3];
  }
  function ssnOk(s) { return !/^(000|666|9)/.test(s) && !/-00-/.test(s) && !/-0000$/.test(s); }
  function telOk(s) {
    var n = s.replace(/\D/g, '').length, t = s.trim();
    return n >= 9 && n <= 15 && (/^[+(0]/.test(t) || /\d[\s.-]\d/.test(t));
  }

  var HONAP = /^(January|February|March|April|May|June|July|August|September|October|November|December|Január|Február|Március|Április|Május|Június|Július|Augusztus|Szeptember|Október|Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)$/i;
  var SZABALYOK = [
    // ── 2026-10-23 BŐVÍTÉS (user: „jó lenne bővíteni!”) — a zajos fajták CSAK a kulcsszó / sor eleje mellett ──
    // privát link: belépési kulcsot / azonosítót hordozó URL
    { tipus: 'link', rx: /https?:\/\/[^\s<>"']+[?&](?:token|access_token|key|api_key|apikey|session|sessionid|sid|auth|sig|signature|code|otp|id|uid|invite|reset)=[^\s<>"']+/gi },
    { tipus: 'ip', rx: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
    { tipus: 'ip', rx: /\b[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,7}\b/gi, ok: function (s) { var k = s.split(':').length - 1; return k >= 3 && (/[a-f]/i.test(s) || k >= 5); } },
    { tipus: 'rendszam', elotte: /rendszám|forgalmi|plate|matrícula|placa/i, rx: /\b(?:[A-Z]{2}[ -]?[A-Z]{2}[ -]?\d{3}|[A-Z]{3}[ -]?\d{3}|\d{4}[ -]?[B-DF-HJ-NP-TV-Z]{3}|[A-Z0-9]{2,4}[ -]?[A-Z0-9]{3,4})\b/g, ok: function (s) { return /\d/.test(s) && /[A-Z]/.test(s); } },
    { tipus: 'azonosito', elotte: /útlevél|passport|pasaporte|személyi|igazolvány|ID card|identity card|jogosítvány|driver'?s? licen[cs]e|licencia|carnet|permiso de conducir/i, rx: /\b[A-Z0-9]{1,3}[ -]?\d{5,9}[A-Z0-9]{0,2}\b/g },
    { tipus: 'azonosito', rx: /\b\d{6}[A-Z]{2}\b/g },
    // irányítószám + település: sor elején vagy vessző / kettőspont után (HU 4 jegy, ES 5 jegy); US: állam + ZIP
    { tipus: 'cim', elotte: /(^|[\n,:;])\s*$/, rx: new RegExp('\\b\\d{4,5}[ \\t]+[' + NAGY + '][' + BETU + '-]{2,}(?:[ \\t]+[' + NAGY + '][' + BETU + '-]+)?(?=[ \\t]*(?:[,\\n]|$))', 'g'), ok: function (s) { return !HONAP.test(s.split(/\s+/)[1] || ''); } },
    { tipus: 'cim', rx: /\b(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s\d{5}(?:-\d{4})?\b/g },
    { tipus: 'email', rx: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
    { tipus: 'iban', rx: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g, ok: ibanOk },
    { tipus: 'kartya', rx: /\b\d(?:[ -]?\d){12,18}\b/g, ok: function (s) { return luhn(s.replace(/\D/g, '')); } },
    { tipus: 'szamla', rx: /\b\d{8}-\d{8}(?:-\d{8})?\b/g },
    { tipus: 'azonosito', rx: /\b\d{3}-\d{2}-\d{4}\b/g, ok: ssnOk },
    // TAJ: egy véletlen 9 jegyű szám ~10%-a átmegy az ellenőrzőn → csak a „TAJ” szó közelében
    { tipus: 'azonosito', elotte: /TAJ/i, rx: /\b\d{3}[ -]?\d{3}[ -]?\d{3}\b/g, ok: function (s) { return tajOk(s.replace(/\D/g, '')); } },
    { tipus: 'azonosito', rx: /\b8\d{9}\b/g, ok: adoOk },
    { tipus: 'azonosito', rx: /\b[XYZxyz]?[ -]?\d{7,8}[ -]?[A-Za-z]\b/g, ok: dniOk },
    { tipus: 'szuletes', ertekCsoport: 1, rx: new RegExp('(?:born(?: on)?|date of birth|DOB|birthday|születtem|született|szül\\.|születési dátum|születésnap|fecha de nacimiento|nacido el|nacida el|nací el)\\s*:?\\s*(\\d{1,4}[.\\/-]\\s?\\d{1,2}[.\\/-]\\s?\\d{1,4}\\.?|[A-Z][a-z]+ \\d{1,2},? \\d{4}|\\d{1,2} (?:de )?[a-záéíóúñ]+ (?:de )?\\d{4}|\\d{4}\\. ?[a-záéíóöőúüű]+ \\d{1,2}\\.?)', 'gi') },
    { tipus: 'cim', rx: new RegExp('\\b\\d{1,5}\\s+(?:[' + NAGY + '][\\w\'.-]*\\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl)\\b\\.?', 'g') },
    { tipus: 'cim', rx: new RegExp('(?:[' + NAGY + '][' + BETU + '.-]+\\s){1,3}(?:utca|u\\.|út|útja|tér|körút|krt\\.|köz|sor|sétány|fasor|lakótelep)\\s\\d{1,4}(?:\\/[A-Za-z0-9]+)?\\.?', 'g') },
    { tipus: 'cim', rx: new RegExp('(?:Calle|C\\/|Avenida|Avda\\.|Av\\.|Plaza|Pza\\.|Paseo|Camino|Carrer)\\s(?:(?:de |del |la |los |las )?[' + NAGY + '][' + BETU + '.-]*\\s?){1,4},?\\s?(?:n\\.?º\\s?)?\\d{1,4}', 'g') },
    { tipus: 'telefon', rx: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{1,4}(?:[\s.-]?\d{2,4}){2,4}/g, ok: telOk }
  ];

  // NEVEK: megszólításból, aláírásból, bemutatkozásból. A gyakori, NEM név szavak kimaradnak.
  var NEM_NEV = /^(Ügyfelünk|Ügyfél|Kolléga|Kollégák|Kollégám|Uram|Hölgyem|Mindenki|Barátaim|Szülők|Csapat|Team|Customer|Customers|Sir|Madam|Friends|All|Everyone|There|Folks|Cliente|Clientes|Señor|Señora|Equipo|Todos|Amigos|Partner|Partners|Support|Hello|Hi|Thanks|The|This|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/;
  var NEVSZO = '[' + NAGY + '][' + KIS.replace("'\\-", '') + "a-z'-]+";
  var NEV = NEVSZO + '(?:\\s+' + NEVSZO + '){0,2}';
  var NEV_FORRAS = [
    new RegExp('\\b(?:Dear|Hi|Hello|Hey|Kedves|Tisztelt|Szia|Sziasztok|Helló|Hola|Estimado|Estimada|Querido|Querida)\\s+(?:(?:Mr|Mrs|Ms|Dr|Sr|Sra|Srta|Dra)\\.?\\s+)?(' + NEV + ')', 'g'),
    new RegExp('(?:Regards|Best regards|Kind regards|Best|Thanks|Thank you|Cheers|Sincerely|Üdvözlettel|Tisztelettel|Köszönettel|Köszönöm|Üdv|Saludos|Un saludo|Atentamente|Gracias|Cordialmente)[,!.:]?[ \\t]*\\r?\\n+[ \\t]*(' + NEV + ')', 'g'),
    new RegExp('\\b(?:my name is|I am|I\'m|a nevem|nevem|me llamo|mi nombre es)\\s+(' + NEV + ')', 'g')
  ];

  function atfed(lista, a, b) { for (var i = 0; i < lista.length; i++) if (a < lista[i].end && b > lista[i].start) return true; return false; }
  function szoHatar(sz, a, b) {
    var re = new RegExp('[' + BETU + '0-9_]');
    return !(a > 0 && re.test(sz[a - 1])) && !(b < sz.length && re.test(sz[b]));
  }

  /**
   * A szövegben talált személyes adatok, pozíció szerint, átfedés nélkül.
   * @param {string} sz  a beillesztett szöveg
   * @param {{sajat?: string[], kihagy?: string[]}} [o]  saját elrejtendő kifejezések; visszaengedett értékek
   */
  function keres(sz, o) {
    sz = String(sz || ''); o = o || {};
    var kihagy = {}; (o.kihagy || []).forEach(function (v) { kihagy[String(v).toLowerCase()] = 1; });
    var ki = [];
    SZABALYOK.forEach(function (r) {
      r.rx.lastIndex = 0; var m;
      while ((m = r.rx.exec(sz))) {
        var ertek = r.ertekCsoport ? m[r.ertekCsoport] : m[0];
        if (!ertek) continue;
        var start = m.index + m[0].indexOf(ertek), end = start + ertek.length;
        var elol = ertek.length - ertek.replace(/^\s+/, '').length;
        if (elol) { start += elol; ertek = ertek.slice(elol); }
        // a teljes egyezés előtt ne álljon szám/betű/+ (nincs lookbehind → kézzel)
        if (start > 0 && /[0-9A-Za-z+]/.test(sz[start - 1]) && r.tipus !== 'szuletes') continue;
        ertek = ertek.replace(/[\s.,]+$/, ''); end = start + ertek.length;
        if (r.ok && !r.ok(ertek)) continue;
        if (r.elotte && !r.elotte.test(sz.slice(Math.max(0, start - 40), start))) continue;
        if (atfed(ki, start, end)) continue;
        ki.push({ start: start, end: end, ertek: ertek, tipus: r.tipus });
      }
    });
    // nevek: előbb kigyűjtjük, aztán MINDEN előfordulásukat elrejtjük (a hosszabb előre)
    var nevek = [];
    NEV_FORRAS.forEach(function (rx) {
      rx.lastIndex = 0; var m;
      while ((m = rx.exec(sz))) {
        var szavak = m[1].split(/\s+/);
        while (szavak.length && NEM_NEV.test(szavak[szavak.length - 1])) szavak.pop();
        if (!szavak.length || NEM_NEV.test(szavak[0])) continue;
        var nev = szavak.join(' ');
        if (nevek.indexOf(nev) < 0) nevek.push(nev);
        if (szavak.length > 1) szavak.forEach(function (w) { if (w.length >= 3 && nevek.indexOf(w) < 0) nevek.push(w); });
      }
    });
    var keresendo = nevek.map(function (n) { return { s: n, tipus: 'nev' }; })
      .concat((o.sajat || []).map(function (s) { return { s: String(s).trim(), tipus: 'sajat' }; }).filter(function (x) { return x.s.length >= 2; }))
      .concat((o.nevek || []).map(function (s) { return { s: String(s).trim(), tipus: 'nev' }; }).filter(function (x) { return x.s.length >= 2; }))   // elfogadott „Lehet, hogy név?” (10-23)
      .sort(function (a, b) { return b.s.length - a.s.length; });
    var kis = sz.toLowerCase();
    keresendo.forEach(function (k) {
      var t = k.s.toLowerCase(), i = kis.indexOf(t);
      while (i >= 0) {
        var e = i + t.length;
        if (szoHatar(sz, i, e) && !atfed(ki, i, e)) ki.push({ start: i, end: e, ertek: sz.slice(i, e), tipus: k.tipus });
        i = kis.indexOf(t, e);
      }
    });
    return ki.filter(function (x) { return !kihagy[x.ertek.toLowerCase()]; }).sort(function (a, b) { return a.start - b.start; });
  }

  // „LEHET, HOGY NÉV?” (2026-10-23): a mondat KÖZEPÉN álló két egymás utáni nagybetűs szó. NEM rejtjük el
  // magától (sok a cég-, termék- és helynév) — csak felajánljuk; a látogató egy koppintással rejti el.
  var NEM_NEV_JAV = /^(ChatGPT|OpenAI|Google|Gemini|Claude|Anthropic|Microsoft|Copilot|Apple|Amazon|Alexa|Meta|Facebook|Instagram|WhatsApp|YouTube|TikTok|Threads|Netflix|Windows|Android|iPhone|Excel|Word|Gmail|Outlook|Zoom|Slack|Notion|Canva|Perplexity|AI|MI|IA|GPT|New|North|South|East|West|San|Los|Las|The|A|An|El|La|Los|Las|De|Del|Hello|Hi|Dear|Kedves)$/;
  function javaslatok(sz, talalatok) {
    sz = String(sz || '');
    var mar = {}; (talalatok || []).forEach(function (t) { mar[t.ertek.toLowerCase()] = 1; });
    var rx = new RegExp('[a-záéíóöőúüűñ,;]\\s+(' + NEVSZO + '\\s+' + NEVSZO + ')', 'g');
    var ki = [], m;
    while ((m = rx.exec(sz))) {
      var n = m[1], szavak = n.split(/\s+/);
      rx.lastIndex = m.index + m[0].length - szavak[1].length;   // átfedő párok is („Anna Kovács Péter”)
      if (szavak.some(function (w) { return NEM_NEV.test(w) || NEM_NEV_JAV.test(w) || HONAP.test(w); })) continue;
      if (mar[n.toLowerCase()] || ki.indexOf(n) >= 0) continue;
      ki.push(n);
    }
    return ki.slice(0, 8);
  }

  /**
   * Kitakarás: minden találat helyére [CÍMKE n]. Ugyanaz az érték mindig ugyanazt a jelet kapja.
   * @returns {{szoveg: string, terkep: {jel: string, ertek: string, tipus: string}[]}}
   */
  function kitakar(sz, talalatok, cimkek) {
    sz = String(sz || '');
    var szam = {}, jelOf = {}, terkep = [], ki = '', poz = 0;
    talalatok.forEach(function (t) {
      var kulcs = t.tipus + '|' + t.ertek.toLowerCase();
      if (!jelOf[kulcs]) {
        szam[t.tipus] = (szam[t.tipus] || 0) + 1;
        jelOf[kulcs] = '[' + (cimkek[t.tipus] || t.tipus.toUpperCase()) + ' ' + szam[t.tipus] + ']';
        terkep.push({ jel: jelOf[kulcs], ertek: t.ertek, tipus: t.tipus });
      }
      ki += sz.slice(poz, t.start) + jelOf[kulcs]; poz = t.end;
    });
    return { szoveg: ki + sz.slice(poz), terkep: terkep };
  }

  /** Az MI válaszában a [CÍMKE n] jelek visszacserélése a valódi értékre (kis/nagybetű, szóköz, _ mindegy). */
  function visszaallit(valasz, terkep) {
    var ki = String(valasz || ''), db = 0;
    terkep.forEach(function (t) {
      var m = t.jel.match(/^\[(.+) (\d+)\]$/);
      if (!m) return;
      var cimke = m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s_-]*');
      var rx = new RegExp('\\[\\s*' + cimke + '[\\s_-]*' + m[2] + '\\s*\\]', 'gi');
      ki = ki.replace(rx, function () { db++; return t.ertek; });
    });
    return { szoveg: ki, db: db };
  }

  /**
   * Promptépítő: a kitöltött mezőkből egy jól felépített prompt, a megjelenítés nyelvén.
   * @param {{feladat?: string, hatter?: string, kinek?: string, hangnem?: string, formatum?: string, hossz?: string, kerdezz?: boolean}} a
   * @param {{hatter: string, kinek: string, hangnem: string, formatum: string, kerdezz: string}} c  a sorok címkéi
   */
  function promptEpit(a, c) {
    a = a || {};
    var tiszta = function (s) { return String(s || '').trim(); };
    var sorok = [], f = tiszta(a.feladat);
    if (f) sorok.push(/[.!?:)\]]$/.test(f) ? f : f + '.');
    var reszlet = [];
    if (tiszta(a.hatter)) reszlet.push(c.hatter + ': ' + tiszta(a.hatter));
    if (tiszta(a.kinek)) reszlet.push(c.kinek + ': ' + tiszta(a.kinek));
    if (tiszta(a.hangnem)) reszlet.push(c.hangnem + ': ' + tiszta(a.hangnem));
    var form = [tiszta(a.formatum), tiszta(a.hossz)].filter(Boolean).join(', ');
    if (form) reszlet.push(c.formatum + ': ' + form);
    if (reszlet.length) sorok.push(reszlet.join('\n'));
    if (a.kerdezz && sorok.length) sorok.push(c.kerdezz);
    return sorok.join('\n\n');
  }

  /** Mely „hozzávalók” vannak meg: feladat, háttér, közönség/hangnem, formátum/hossz. */
  function hozzavalok(a) {
    a = a || {}; var v = function (s) { return !!String(s || '').trim(); };
    return { feladat: v(a.feladat), hatter: v(a.hatter), kinek: v(a.kinek) || v(a.hangnem), formatum: v(a.formatum) || v(a.hossz) };
  }

  return { keres: keres, javaslatok: javaslatok, kitakar: kitakar, visszaallit: visszaallit, promptEpit: promptEpit, hozzavalok: hozzavalok,
    _: { luhn: luhn, ibanOk: ibanOk, tajOk: tajOk, adoOk: adoOk, dniOk: dniOk } };
}

// ===================================================================
// OLDALAK (a pageShell <main>-jébe). Statikus HTML + egy kis szkript, ami a fenti magot használja.
// ===================================================================
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// <script>-be ágyazott JSON: a „</” nem zárhatja le idő előtt a szkriptet
const jsonBe = o => JSON.stringify(o).replace(/</g, '\\u003c');
export const ESZKOZ_UTAK = { sp: 'safe-paste', pb: 'prompt-builder' };   // a gyűjtő = a Prompt-tár (/prompts)
const ATADAS_KULCS = 'aiw-safe-paste';   // Promptépítő → Biztonságos bemásolás (sessionStorage, NEM URL)
const MASOL_IKON = '<svg class="fx-btn-i" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

// Közös szkript-darabok: kiírás, másolás (a Facebook-böngészőben a clipboard API hiányozhat → tartalék)
const KOZOS_JS = `
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function masol(text, btn, ok){
    var cimke = btn.getAttribute('data-l');
    function kesz(){ btn.querySelector('.fx-btn-l').textContent = ok; btn.classList.add('fx-btn--ok');
      setTimeout(function(){ btn.querySelector('.fx-btn-l').textContent = cimke; btn.classList.remove('fx-btn--ok'); }, 1800); }
    function tartalek(){ var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', '');
      t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); kesz(); } catch (e) {} document.body.removeChild(t); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(kesz, tartalek); else tartalek();
  }`;

const gomb = (id, cimke, extra = '') => `<button type="button" class="fx-btn${extra}" id="${id}" data-l="${esc(cimke)}">${MASOL_IKON}<span class="fx-btn-l">${esc(cimke)}</span></button>`;
const PAJZS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>';

// 2026-10-21 (user: „ezek elég gagyik! jobb dizájn kéne!”): az eszköz azt MUTATJA, amit csinál.
// Biztonságos bemásolás = „kitakart akta” (fekete kitakaró csík a személyes adat helyén);
// Promptépítő = „csevegőablak” (a promptod a te üzeneted) + prompt-erő mérő.

/** A kitakart akta mintája: a valódi adat → fekete csík a címkével. `anim`: egyszeri, betöltéskori kitakarás. */
function akta(sz, { anim = false, osztaly = '' } = {}) {
  const d = sz.sp.demo;
  const sorok = d.sorok.map(([elotte, tipus, utana], i) =>
    `<p class="fx-akta-sor">${esc(elotte)}<span class="fx-x" style="--d:${(0.5 + i * 0.55).toFixed(2)}s"><span class="fx-x-v">${esc(d.ertek[tipus])}</span><b class="fx-x-c">${esc(sz.labels[tipus])} 1</b></span>${esc(utana)}</p>`).join('');
  return `<div class="fx-akta${anim ? ' fx-akta--anim' : ''}${osztaly}" aria-hidden="true">
      <span class="fx-akta-fej"><span class="fx-akta-ai">AI</span>${esc(sz.sp.s2)}</span>
      ${sorok}
      <span class="fx-stamp fx-stamp--demo">${esc(sz.sp.stamp.replace('{n}', d.sorok.length))}</span>
    </div>`;
}

/** A csevegőablak mintája (gyűjtőoldal): a te üzeneted = a prompt, alatta az AI „gépel”. */
function csevegoMinta(sz) {
  const g = sz.pb.goals[0];
  return `<div class="fx-chat fx-chat--minta" aria-hidden="true">
      <div class="fx-chat-fej"><i></i><i></i><i></i><span>${esc(sz.pb.chatH)}</span></div>
      <div class="fx-chat-test">
        <div class="fx-msg fx-msg--te"><div class="fx-msg-b"><p class="fx-text">${esc(g.feladat).replace(/\[([^\]]+)\]/g, '<span class="fx-fill">[$1]</span>')}\n\n${esc(sz.pb.rows.hangnem)}: ${esc(g.hangnem || '')}</p></div><span class="fx-avatar">${esc(sz.pb.te)}</span></div>
        <div class="fx-msg fx-msg--ai"><span class="fx-avatar fx-avatar--ai">AI</span><span class="fx-typing"><i></i><i></i><i></i></span></div>
      </div>
    </div>`;
}

/**
 * 🧰 Eszközsáv a PROMPT-TÁR tetején (2026-10-21, user: „a prompttárral vond össze! akkor minden egy helyen
 * lenne — az eszközök felül, a promptok alul”). Két kártya, mindegyiken az eszköz saját kis mintája.
 */
export function eszkozSavHtml(sz, { lp = '' } = {}) {
  const kartya = (ut, e, minta) => `<a class="fx-mini" href="${lp}/${ut}">
      <div class="fx-mini-t"><span class="fx-show-i" aria-hidden="true">${e.emoji}</span><div><h3 class="fx-mini-h">${esc(e.name)}</h3><p class="fx-mini-p">${esc(e.card)}</p></div></div>
      ${minta}
      <span class="fx-cta">${esc(sz.open)}</span>
    </a>`;
  return `<section class="fx-page fx-sav" aria-labelledby="fxSavH">
    <h2 class="pl-h" id="fxSavH"><span class="pl-h-i" aria-hidden="true">🧰</span>${esc(sz.nav)}</h2>
    <p class="fx-sav-local"><span aria-hidden="true">🔒</span> ${esc(sz.local)} <span class="fx-beta">🧪 ${esc(sz.beta)}</span></p>
    <div class="fx-sav-racs">
      ${kartya(ESZKOZ_UTAK.sp, sz.sp, akta(sz))}
      ${kartya(ESZKOZ_UTAK.pb, sz.pb, csevegoMinta(sz))}
    </div>
  </section>`;
}

/** 🛡️ Biztonságos bemásolás: a te lapod → pajzs → az AI lapja (kitakarva) → visszaállítás. */
export function biztonsagosHtml(sz, { lp = '', hirdetes = '' } = {}) {
  const s = sz.sp;
  const adat = { labels: sz.labels, sp: { found: s.found, unhide: s.unhide, none: s.none, empty2: s.empty2, copied: s.copied, restored: s.restored, sample: s.sample, stamp: s.stamp, stampNone: s.stampNone, javaslatH: s.javaslatH, javaslatTip: s.javaslatTip }, kulcs: ATADAS_KULCS };
  return `<div class="fx-page fx-sp">
  <a class="fx-vissza-link" href="${lp}/prompts">← ${esc(sz.vissza)}</a>
  <section class="fx-top">
    <div class="fx-top-t">
      <p class="fx-badges"><span class="fx-badge"><span aria-hidden="true">${s.emoji}</span> ${esc(sz.local)}</span><span class="fx-beta">🧪 ${esc(sz.beta)}</span></p>
      <h1 class="fx-h1">${esc(s.h1)}</h1>
      <p class="fx-lead">${esc(s.lead)}</p>
    </div>
    ${akta(sz, { anim: true })}
  </section>
  <ol class="fx-lepesek">${s.lepesek.map((l, i) => `<li><span class="fx-num">${i + 1}</span>${esc(l)}</li>`).join('')}</ol>
  <section class="fx-pad" aria-label="${esc(s.name)}">
    <div class="fx-lap fx-lap--te">
      <div class="fx-lap-fej">
        <h2 class="fx-lap-h"><span class="fx-num">1</span>${esc(s.s1)}</h2>
        <span class="fx-lap-akc"><button type="button" class="fx-link" id="spEx">${esc(s.example)}</button><button type="button" class="fx-link" id="spClr">${esc(s.clear)}</button></span>
      </div>
      <textarea id="spIn" class="fx-irolap" rows="10" placeholder="${esc(s.s1ph)}" spellcheck="false" aria-label="${esc(s.s1)}"></textarea>
      <details class="fx-sajat"><summary>${esc(s.custom)}</summary>
        <input id="spCustom" class="fx-input" type="text" placeholder="${esc(s.customPh)}" autocomplete="off" aria-label="${esc(s.custom)}">
      </details>
    </div>
    <div class="fx-pajzs" aria-hidden="true">${PAJZS}</div>
    <div class="fx-lap fx-lap--ai">
      <div class="fx-lap-fej"><h2 class="fx-lap-h"><span class="fx-num">2</span>${esc(s.s2)}</h2></div>
      <div class="fx-dok" id="spOut" aria-live="polite"><p class="fx-empty">${esc(s.empty2)}</p></div>
      <span class="fx-stamp" id="spStamp" hidden></span>
      <div class="fx-row">${gomb('spCopy', s.copy)}</div>
    </div>
  </section>
  <div class="fx-found" id="spFound" aria-live="polite"></div>
  <p class="fx-warn"><span aria-hidden="true">⚠️</span> ${esc(s.warn)} ${esc(sz.betaTip)}</p>
  <section class="fx-valasz" aria-labelledby="spS3">
    <h2 class="fx-lap-h" id="spS3"><span class="fx-num">3</span>${esc(s.s3)}</h2>
    <p class="fx-sub">${esc(s.s3lead)}</p>
    <div class="fx-valasz-racs">
      <div>
        <textarea id="spAns" class="fx-area" rows="6" placeholder="${esc(s.s3ph)}" spellcheck="false" aria-label="${esc(s.s3ph)}"></textarea>
        <div class="fx-row"><button type="button" class="fx-btn fx-btn--masod" id="spRestore"><span class="fx-btn-l">${esc(s.restore)}</span></button><span class="fx-note" id="spResNote" aria-live="polite"></span></div>
      </div>
      <div>
        <div class="fx-dok fx-dok--vissza" id="spRes"></div>
        <div class="fx-row">${gomb('spResCopy', s.copyRes)}</div>
      </div>
    </div>
  </section>
  <p class="fx-priv"><span aria-hidden="true">🔒</span> ${esc(s.priv)}</p>
  ${hirdetes}
  <p class="fx-more"><a href="${lp}/${ESZKOZ_UTAK.pb}">${sz.pb.emoji} ${esc(sz.pb.name)}</a> · <a href="${lp}/prompts">📋 ${esc(sz.pb.library)}</a></p>
</div>
<script>
(function(){
  var M = (${eszkozMag.toString()})();
  var S = ${jsonBe(adat)};${KOZOS_JS}
  var inp = $('spIn'), cust = $('spCustom'), found = $('spFound'), out = $('spOut'), copyB = $('spCopy'), stamp = $('spStamp');
  var ans = $('spAns'), res = $('spRes'), resNote = $('spResNote'), resCopy = $('spResCopy');
  var lathato = {}, utolso = { szoveg: '', terkep: [] }, visszaSz = '', elfogadott = [];
  function sajat(){ return cust.value.split(',').map(function(x){ return x.trim(); }).filter(Boolean); }
  function frissit(){
    var sz = inp.value, mind = M.keres(sz, { sajat: sajat(), nevek: elfogadott });
    var rejt = mind.filter(function(t){ return !lathato[t.ertek.toLowerCase()]; });
    utolso = M.kitakar(sz, rejt, S.labels);
    var jel = {}; utolso.terkep.forEach(function(t){ jel[t.tipus + '|' + t.ertek.toLowerCase()] = t.jel; });
    if (!sz.trim()) { out.innerHTML = '<p class="fx-empty">' + esc(S.sp.empty2) + '</p>'; copyB.disabled = true; stamp.hidden = true; }
    else {
      var h = '', poz = 0;
      rejt.forEach(function(t){ h += esc(sz.slice(poz, t.start)) + '<mark class="fx-tag">' + esc(jel[t.tipus + '|' + t.ertek.toLowerCase()].replace(/^\\[|\\]$/g, '')) + '</mark>'; poz = t.end; });
      out.innerHTML = '<p class="fx-text">' + h + esc(sz.slice(poz)) + '</p>'; copyB.disabled = false;
      var n = utolso.terkep.length; stamp.hidden = false;
      stamp.textContent = n ? S.sp.stamp.replace('{n}', n) : S.sp.stampNone; stamp.className = 'fx-stamp' + (n ? '' : ' fx-stamp--ures');
    }
    var volt = {}, chips = '', db = 0;
    mind.forEach(function(t){
      var k = t.ertek.toLowerCase(); if (volt[k]) return; volt[k] = 1;
      var rejtve = !lathato[k]; if (rejtve) db++;
      chips += '<button type="button" class="fx-chip' + (rejtve ? '' : ' fx-chip--ki') + '" data-v="' + esc(k) + '" aria-pressed="' + rejtve + '">'
        + '<span class="fx-chip-t">' + esc(S.labels[t.tipus] || t.tipus) + '</span>' + esc(t.ertek) + '</button>';
    });
    found.innerHTML = mind.length
      ? '<p class="fx-found-h"><strong>' + esc(S.sp.found) + ': ' + db + '</strong> <span>' + esc(S.sp.unhide) + '</span></p><div class="fx-chips">' + chips + '</div>'
      : (sz.trim() ? '<p class="fx-found-none">' + esc(S.sp.none) + '</p>' : '');
    // „Lehet, hogy név?” (10-23): a mondat közepén álló nevek — csak felajánlva, koppintásra rejtjük
    var jav = M.javaslatok(sz, mind);
    if (jav.length) found.innerHTML += '<p class="fx-found-h fx-jav-h"><strong>' + esc(S.sp.javaslatH) + '</strong> <span>' + esc(S.sp.javaslatTip) + '</span></p><div class="fx-chips">'
      + jav.map(function(n){ return '<button type="button" class="fx-chip fx-chip--jav" data-jav="' + esc(n) + '"><span class="fx-chip-t">?</span>' + esc(n) + '</button>'; }).join('') + '</div>';
  }
  inp.addEventListener('input', frissit); cust.addEventListener('input', frissit);
  found.addEventListener('click', function(e){
    var b = e.target.closest ? e.target.closest('.fx-chip') : null; if (!b) return;
    var j = b.getAttribute('data-jav'); if (j) { if (elfogadott.indexOf(j) < 0) elfogadott.push(j); frissit(); return; }
    var v = b.getAttribute('data-v'); if (lathato[v]) delete lathato[v]; else lathato[v] = 1; frissit();
  });
  $('spEx').addEventListener('click', function(){ inp.value = S.sp.sample; lathato = {}; elfogadott = []; frissit(); });
  $('spClr').addEventListener('click', function(){ inp.value = ''; cust.value = ''; lathato = {}; elfogadott = []; frissit(); inp.focus(); });
  copyB.addEventListener('click', function(){ masol(utolso.szoveg, copyB, S.sp.copied); });
  $('spRestore').addEventListener('click', function(){
    var r = M.visszaallit(ans.value, utolso.terkep); visszaSz = r.szoveg;
    res.innerHTML = r.szoveg.trim() ? '<p class="fx-text">' + esc(r.szoveg) + '</p>' : '';
    resNote.textContent = ans.value.trim() ? S.sp.restored.replace('{n}', r.db) : ''; resCopy.disabled = !r.szoveg.trim();
  });
  resCopy.addEventListener('click', function(){ masol(visszaSz, resCopy, S.sp.copied); });
  resCopy.disabled = true;
  // a Promptépítőből átadott szöveg (sessionStorage — URL-be személyes adat SOHA nem kerül)
  try { var at = sessionStorage.getItem(S.kulcs); if (at) { sessionStorage.removeItem(S.kulcs); inp.value = at; } } catch (e) {}
  frissit();
})();
</script>`;
}

/** 🧩 Promptépítő: cél-csempék → kérdések → csevegőablak a promptoddal + prompt-erő mérő. */
export function promptEpitoHtml(sz, { lp = '', hirdetes = '' } = {}) {
  const p = sz.pb;
  const opciok = (lista, any) => `<option value="">${esc(any)}</option>` + lista.map(v => `<option>${esc(v)}</option>`).join('');
  const adat = { labels: sz.labels, pb: { rows: p.rows, empty: p.empty, copied: p.copied, pii: p.pii, goals: p.goals, eroSzint: p.eroSzint }, kulcs: ATADAS_KULCS, spUrl: `${lp}/${ESZKOZ_UTAK.sp}` };
  const mezoje = { feladat: 'pbFeladat', hatter: 'pbHatter', kinek: 'pbKinek', formatum: 'pbFormatum' };
  const ing = ['feladat', 'hatter', 'kinek', 'formatum'].map(k => `<li><button type="button" class="fx-ing" id="pbIng-${k}" data-mezo="${mezoje[k]}"><span class="fx-ing-d" aria-hidden="true"></span>${esc(p.ing[k])}</button></li>`).join('');
  return `<div class="fx-page fx-pb">
  <a class="fx-vissza-link" href="${lp}/prompts">← ${esc(sz.vissza)}</a>
  <section class="fx-hero">
    <p class="fx-badges"><span class="fx-badge"><span aria-hidden="true">${p.emoji}</span> ${esc(sz.local)}</span><span class="fx-beta">🧪 ${esc(sz.beta)}</span></p>
    <h1 class="fx-h1">${esc(p.h1)}</h1>
    <p class="fx-lead">${esc(p.lead)}</p>
  </section>
  <p class="fx-goals-h" id="pbGoalsH">${esc(p.goalsH)}</p>
  <div class="fx-goals" role="group" aria-labelledby="pbGoalsH">
    ${p.goals.map(g => `<button type="button" class="fx-goal" data-goal="${g.id}" aria-pressed="false"><span class="fx-goal-i" aria-hidden="true">${esc(g.label.split(' ')[0])}</span><span class="fx-goal-l">${esc(g.label.split(' ').slice(1).join(' '))}</span><span class="fx-goal-d">${esc(g.desc)}</span></button>`).join('\n    ')}
  </div>
  <section class="fx-pad fx-pad--pb">
    <div class="fx-lap fx-kerdesek">
      <div class="fx-mezo"><label class="fx-label" for="pbFeladat"><span class="fx-ing-d" data-ing="feladat" aria-hidden="true"></span>${esc(p.feladat)}</label>
        <textarea id="pbFeladat" class="fx-area" rows="3" placeholder="${esc(p.feladatPh)}"></textarea></div>
      <div class="fx-mezo"><label class="fx-label" for="pbHatter"><span class="fx-ing-d" data-ing="hatter" aria-hidden="true"></span>${esc(p.hatter)} <span class="fx-opt">(${esc(p.opt)})</span></label>
        <textarea id="pbHatter" class="fx-area" rows="2" placeholder="${esc(p.hatterPh)}"></textarea></div>
      <div class="fx-mezo"><label class="fx-label" for="pbKinek"><span class="fx-ing-d" data-ing="kinek" aria-hidden="true"></span>${esc(p.kinek)} <span class="fx-opt">(${esc(p.opt)})</span></label>
        <input id="pbKinek" class="fx-input" type="text" placeholder="${esc(p.kinekPh)}" autocomplete="off"></div>
      <div class="fx-selects">
        <div><label class="fx-label" for="pbHangnem"><span class="fx-ing-d" data-ing="kinek" aria-hidden="true"></span>${esc(p.hangnem)}</label><select id="pbHangnem" class="fx-select">${opciok(p.tones, p.any)}</select></div>
        <div><label class="fx-label" for="pbFormatum"><span class="fx-ing-d" data-ing="formatum" aria-hidden="true"></span>${esc(p.formatum)}</label><select id="pbFormatum" class="fx-select">${opciok(p.formats, p.any)}</select></div>
        <div><label class="fx-label" for="pbHossz">${esc(p.hossz)}</label><select id="pbHossz" class="fx-select">${opciok(p.lengths, p.any)}</select></div>
      </div>
      <label class="fx-check"><input type="checkbox" id="pbKerdezz" checked> ${esc(p.kerdezz)}</label>
    </div>
    <div class="fx-chat" aria-labelledby="pbChatH">
      <div class="fx-chat-fej"><i></i><i></i><i></i><span id="pbChatH">${esc(p.chatH)}</span></div>
      <div class="fx-ero" aria-live="polite">
        <span class="fx-ero-l">${esc(p.ero)}</span>
        <span class="fx-ero-sav" id="pbEro" data-n="0" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <strong class="fx-ero-szo" id="pbEroSzo">${esc(p.eroSzint[0])}</strong>
      </div>
      <div class="fx-tippek"><span>${esc(p.hianyzik)}</span><ul class="fx-ings">${ing}</ul></div>
      <div class="fx-chat-test">
        <div class="fx-msg fx-msg--te"><div class="fx-msg-b" id="pbOut" aria-live="polite"><p class="fx-empty">${esc(p.empty)}</p></div><span class="fx-avatar">${esc(p.te)}</span></div>
        <div class="fx-msg fx-msg--ai"><span class="fx-avatar fx-avatar--ai">AI</span><span class="fx-typing"><i></i><i></i><i></i></span></div>
      </div>
      <div class="fx-chat-lab">
        ${gomb('pbCopy', p.copy)}
        <p class="fx-tip" id="pbTip" hidden>✏️ ${esc(p.tipFill)}</p>
        <div class="fx-pii" id="pbPii" hidden><p id="pbPiiT"></p><button type="button" class="fx-btn fx-btn--masod" id="pbPiiB"><span class="fx-btn-l">🛡️ ${esc(p.piiBtn)}</span></button></div>
      </div>
    </div>
  </section>
  ${hirdetes}
  <p class="fx-more"><a href="${lp}/${ESZKOZ_UTAK.sp}">${sz.sp.emoji} ${esc(sz.sp.name)}</a> · <a href="${lp}/prompts">📋 ${esc(p.library)}</a></p>
</div>
<script>
(function(){
  var M = (${eszkozMag.toString()})();
  var S = ${jsonBe(adat)};${KOZOS_JS}
  var f = { feladat: $('pbFeladat'), hatter: $('pbHatter'), kinek: $('pbKinek'), hangnem: $('pbHangnem'), formatum: $('pbFormatum'), hossz: $('pbHossz'), kerdezz: $('pbKerdezz') };
  var out = $('pbOut'), copyB = $('pbCopy'), tip = $('pbTip'), pii = $('pbPii'), ero = $('pbEro'), eroSzo = $('pbEroSzo'), utolso = '';
  function adat(){ return { feladat: f.feladat.value, hatter: f.hatter.value, kinek: f.kinek.value, hangnem: f.hangnem.value, formatum: f.formatum.value, hossz: f.hossz.value, kerdezz: f.kerdezz.checked }; }
  function frissit(){
    var a = adat(), p = M.promptEpit(a, S.pb.rows), h = M.hozzavalok(a), n = 0; utolso = p;
    ['feladat', 'hatter', 'kinek', 'formatum'].forEach(function(k){
      if (h[k]) n++;
      var li = $('pbIng-' + k); li.parentNode.hidden = !!h[k];
      Array.prototype.forEach.call(document.querySelectorAll('[data-ing="' + k + '"]'), function(pont){ pont.className = 'fx-ing-d' + (h[k] ? ' fx-ing-d--van' : ''); });
    });
    ero.setAttribute('data-n', n); eroSzo.textContent = S.pb.eroSzint[n];
    var tolt = /\\[[^\\]\\n]{1,60}\\]/;
    if (!p) { out.innerHTML = '<p class="fx-empty">' + esc(S.pb.empty) + '</p>'; copyB.disabled = true; tip.hidden = true; }
    else { out.innerHTML = '<p class="fx-text">' + esc(p).replace(/\\[([^\\]\\n]{1,60})\\]/g, '<span class="fx-fill">[$1]</span>') + '</p>'; copyB.disabled = false; tip.hidden = !tolt.test(p); }
    var talalt = M.keres(p).filter(function(t){ return t.tipus !== 'sajat'; }), nevek = [];
    talalt.forEach(function(t){ var nv = (S.labels[t.tipus] || t.tipus).toLowerCase(); if (nevek.indexOf(nv) < 0) nevek.push(nv); });
    pii.hidden = !talalt.length; if (talalt.length) $('pbPiiT').textContent = S.pb.pii.replace('{list}', nevek.join(', '));
  }
  function valaszt(sel, v){ if (!v) { sel.value = ''; return; } var van = false; for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === v) van = true;
    if (!van) { var o = document.createElement('option'); o.textContent = v; sel.appendChild(o); } sel.value = v; }
  document.querySelector('.fx-goals').addEventListener('click', function(e){
    var b = e.target.closest ? e.target.closest('.fx-goal') : null; if (!b) return;
    var g = S.pb.goals.filter(function(x){ return x.id === b.getAttribute('data-goal'); })[0]; if (!g) return;
    Array.prototype.forEach.call(document.querySelectorAll('.fx-goal'), function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    f.feladat.value = g.feladat; f.kinek.value = g.kinek || '';
    valaszt(f.hangnem, g.hangnem); valaszt(f.formatum, g.formatum); valaszt(f.hossz, g.hossz);
    frissit();
    // az első [kitöltendő] részt kijelöljük — azonnal át lehet írni
    var i = g.feladat.indexOf('['), j = g.feladat.indexOf(']', i);
    f.feladat.focus(); if (i >= 0 && j > i && f.feladat.setSelectionRange) f.feladat.setSelectionRange(i, j + 1);
  });
  // a hiányzó hozzávalóra kattintva a mezőjére ugrunk
  document.querySelector('.fx-tippek').addEventListener('click', function(e){
    var b = e.target.closest ? e.target.closest('.fx-ing') : null; if (!b) return;
    var m = $(b.getAttribute('data-mezo')); if (m) { m.focus(); if (m.scrollIntoView) m.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  });
  ['feladat', 'hatter', 'kinek'].forEach(function(k){ f[k].addEventListener('input', frissit); });
  ['hangnem', 'formatum', 'hossz', 'kerdezz'].forEach(function(k){ f[k].addEventListener('change', frissit); });
  copyB.addEventListener('click', function(){ masol(utolso, copyB, S.pb.copied); });
  $('pbPiiB').addEventListener('click', function(){ try { sessionStorage.setItem(S.kulcs, utolso); } catch (e) {} location.href = S.spUrl; });
  frissit();
})();
</script>`;
}
