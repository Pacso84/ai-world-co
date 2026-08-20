// ===================================================================
// MAGYAR + ANGOL SZÓTÁR — a hunspell betöltése
// ===================================================================
//
// MIÉRT hunspell-asm és NEM nspell (2026-08-20, mérve): az `nspell` a magyar
// szótárat mohón kibontja, és **12 GB heap-pel is elhasalt** — a magyar
// ragozás kombinatorikája megfojtja. Az igazi hunspell lustán illeszt:
// ugyanez a szótár **288 ms alatt, 8 MB-ból** betölt.
//
// MIÉRT KELL AZ ANGOL SZÓTÁR IS: a cikkeink tele vannak idézett angol
// szakszóval (workflows, datasets, backend). Ezek helyesek a magyar szövegben,
// de a magyar szótár nem ismeri őket — nélküle a zaj harmada ebből jönne.
//
// ⚠️ A magyar szótár NEM tökéletes: mérve a helyes „szöveget", „nekünk",
// „refaktorálás" alakokat is elutasítja. EZÉRT NEM DÖNT EZ A LÉPCSŐ — csak
// jelöltet ad; a döntés a core/hu-proofread.js bírójáé.
//
// A szótárak npm-függőségek (dictionary-hu: MPL/LGPL, dictionary-en: MIT,
// hunspell-asm: MIT). A node_modules-ban élnek — a repóba és a KIADOTT
// weboldalra semmi nem kerül belőlük.
// ===================================================================

let gyorsitotar = null;

/**
 * @returns {Promise<{isKnownWord: (w:string)=>boolean}>}
 *   Ismeri-e a szót a magyar VAGY az angol szótár?
 */
export async function loadHuChecker() {
  if (gyorsitotar) return gyorsitotar;
  const { loadModule } = await import('hunspell-asm');
  const hu = (await import('dictionary-hu')).default;
  const en = (await import('dictionary-en')).default;
  const hf = await loadModule();
  const magyar = hf.create(hf.mountBuffer(hu.aff, 'hu.aff'), hf.mountBuffer(hu.dic, 'hu.dic'));
  const angol = hf.create(hf.mountBuffer(en.aff, 'en.aff'), hf.mountBuffer(en.dic, 'en.dic'));
  gyorsitotar = {
    isKnownWord(w) {
      const s = String(w == null ? '' : w);
      if (!s) return true;                       // üresre nem szólunk
      try { return magyar.spell(s) || angol.spell(s); } catch { return true; }
    }
  };
  return gyorsitotar;
}

export default { loadHuChecker };
