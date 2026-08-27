// ===================================================================
// NAPI JELENTÉS — MIKOR MEHET KI? (2026-08-27)
// ===================================================================
// MI TÖRTÉNT: 2026-08-27-én NEM MENT KI napi jelentés. Nem hiba miatt —
// a gépezet dolgozott (9 hír + 5 útmutató jelent meg, a Reel kiment) —,
// hanem mert a nap MIND A NÉGY futása a régi 07-15 UTC sávon kívülre
// esett: 04:20, 05:37, 16:07, 18:29.
//
// A GitHub ütemezője aznap órákat csúszott, és a 08:00-s slot — ami az
// elmúlt héten MINDIG a jelentést küldte (08:26, 08:29, 08:41, 08:51,
// 08:56) — teljesen kimaradt. A pipeline-őrkutya 16:07-kor pótolta a
// futást, de a jelentésnek SAJÁT, MÁSODIK kapuja van, amin a pótfutás
// nem fért át.
//
// ⚠️ A TANULSÁG: az őrkutya a MUNKÁT mentette meg, az ÉRTESÍTÉST nem.
// Ha mentőmechanizmust építesz, végig kell nézni, HÁNY további kapu van
// a mentendő dolog és a felhasználó között.
//
// A JAVÍTÁS IRÁNYA: a felső határ FÖLÖSLEGES volt. A napi egyszeri
// küldést nem az időablak biztosítja, hanem a `lastSent` dedup — az
// ablak egyetlen valódi feladata, hogy ne ébresszen hajnalban. Ahhoz
// csak az ALSÓ határ kell.
//
// ⚠️ A DÖNTÉS ITT ÉL, NEM A daily-report.js-BEN: az a modul feltétel
// nélkül hívja a `main()`-t, tehát importálni sem lehet — a logikája
// eddig SEHOGY nem volt tesztelhető. Ugyanaz a szétválasztás, mint a
// pipeline-őrkutyánál.
// ===================================================================

/** Ennél korábban NEM szólunk: 07 UTC ≈ 09:00 magyar idő. */
export const KEZDES_ORA = 7;

/**
 * Ennél később sem. A 20-as óra még átmegy, tehát a legkésőbbi pillanat
 * 20:59 UTC = 22:59 magyar nyári idő — épp bent marad az estében.
 * (21-gyel 23:59 lenne: az óra-alapú összehasonlítás miatt a felső határ
 * a MEGENGEDETT óra, nem a záró időpont. Egy órával mindig többet enged,
 * mint amit elsőre gondol az ember.)
 *
 * A régi felső határ 15 volt (17:59 magyar idő) — indokolatlanul szűk:
 * a nap három futásából csak egy fért bele, és ha AZ maradt ki, a
 * jelentés is elmaradt. 20-szal a 16:00-s slot is befér, akkor is, ha a
 * GitHub több órát késik vele (08-27-én 2,5 órát késett).
 */
export const VEGE_ORA = 20;

/** A hét napjai a naplóhoz (0 = vasárnap, ahogy a `getUTCDay()` adja). */
const NAPOK = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];

/**
 * Mehet-e most a jelentés?
 *
 * IDŐSZAK-KULCCSAL dolgozik, nem konkrét dátummal — így ugyanez a kapu
 * szolgálja ki a NAPI jelentést (kulcs: `2026-08-27`) és a HETI
 * kereső-riportot (kulcs: `2026-W35`) is. A `core/search-report.js`-ben
 * szó szerint ugyanez a két sor élt, ugyanazzal a hibával.
 *
 * @param {object} p
 * @param {number} p.hour            az aktuális UTC-óra (0-23)
 * @param {string|null} [p.lastSent] melyik időszakra ment utoljára
 * @param {string} p.today           az aktuális időszak kulcsa
 * @param {boolean} [p.force]        `--force`: minden kaput megkerül
 * @param {string} [p.periodNev]     a napló-szöveghez („ma" / „ezen a héten")
 * @param {number|null} [p.onlyOnDay] csak ezen a napon mehet (0 = vasárnap)
 * @param {number|null} [p.day]      az aktuális UTC-nap (`getUTCDay()`)
 * @returns {{send: boolean, reason: string}}
 */
export function shouldSendReport({
  hour, lastSent = null, today, force = false, periodNev = 'ma',
  onlyOnDay = null, day = null
} = {}) {
  if (force) return { send: true, reason: '--force' };

  // A NAP-KAPU is ide került (a heti kereső-riport csak vasárnap mehet),
  // hogy a `--force` sorrendje TESZTELHETŐ legyen: a search-report.js-t
  // nem lehet importálni (feltétel nélkül hívja a main()-t), tehát ott a
  // kézzel írt `if (FORCE)` sorrendjét semmi nem őrizte volna meg.
  if (onlyOnDay !== null && day !== onlyOnDay) {
    return { send: false, reason: 'nem ' + (NAPOK[onlyOnDay] || onlyOnDay) + ' van' };
  }

  // ELŐSZÖR a dedup: ez a legbiztosabb tény, és a naplóban is ez a
  // beszédesebb indok. (A régi sorrend a nap harmadik futásánál is
  // „sávon kívül"-t írt, holott a valódi ok az volt, hogy már ment.)
  if (today && lastSent && lastSent === today) {
    return { send: false, reason: periodNev + ' már ment (' + lastSent + ')' };
  }

  // ⚠️ ITT A "NEM TUDOM" — SZÁNDÉKOSAN — "IGEN".
  // A pipeline-őrkutyánál fordítva döntöttünk, és ez nem következetlenség,
  // hanem a KÖLTSÉGEK aszimmetriája: ott a vak cselekvés egy fölösleges,
  // FIZETŐS pipeline-futás, itt viszont egyetlen Telegram-üzenet, amit a
  // dedup amúgy is naponta egyre fog. A rossz küldés ára pár másodperc
  // figyelem; a rossz hallgatásé az, amit ma elszenvedtünk.
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { send: true, reason: 'ISMERETLEN óra (' + hour + ') — inkább küldök' };
  }

  if (hour < KEZDES_ORA) {
    return { send: false, reason: hour + 'h UTC — hajnal, nem ébresztek (' + KEZDES_ORA + '-' + VEGE_ORA + ')' };
  }
  if (hour > VEGE_ORA) {
    return { send: false, reason: hour + 'h UTC — késő este, holnap megy (' + KEZDES_ORA + '-' + VEGE_ORA + ')' };
  }

  return { send: true, reason: hour + 'h UTC — mehet' };
}

/**
 * BE SZABAD-E JEGYEZNI, hogy „ez az időszak megvolt"?
 *
 * ⚠️ CSAK SIKERES KÜLDÉS UTÁN. A `core/telegram.js` `sendMessage()`-e SOHA
 * nem dob: hiányzó tokenre `{ok:false,skipped:true}`, Telegram-hibára és
 * hálózati hibára `{ok:false}` jön vissza. 2026-08-27-ig mindkét riport
 * FELTÉTEL NÉLKÜL írta be a dedup-kulcsot, tehát egy SIKERTELEN KÜLDÉS is
 * „ma már ment"-nek számított, és a jelentés némán elveszett — ugyanaz a
 * kár, mint a szűk időablaké, csak másik ajtón. (Független átnézés találta.)
 *
 * A szabály két hívónál él (napi + heti), ezért van SAJÁT NEVE: a két
 * helyre kimásolt szabály előbb-utóbb szétcsúszik.
 *
 * @param {{ok?: boolean}|null|undefined} kuldesEredmeny a sendMessage() válasza
 */
export function sikeresKuldes(kuldesEredmeny) {
  return kuldesEredmeny?.ok === true;
}
