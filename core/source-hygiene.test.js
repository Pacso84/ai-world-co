// ===================================================================
// FORRÁS-HIGIÉNIA TESZT — futtatás: node core/source-hygiene.test.js
//
// MIÉRT VAN EZ (2026-08-04, a user szúrta ki a kész oldalon):
// A cikkekben a szövegbeli útmutató-linkek után "doboz + F4D8" jelent meg.
// A HTML hibátlan volt — a CSS rontotta el:
//
//   .guide-link::after { content: " <0x01>F4D8"; }   ← rossz
//   .guide-link::after { content: " 📘"; }            ← jó
//
// A szándék a CSS-escape volt (U+1F4D8 = 📘), de a szerkesztő-lánc a
// backslash-1-et OKTÁLIS escape-ként értelmezte, és valódi 0x01 bájtot írt
// a fájlba — utána maradt a szó szerinti "F4D8" szöveg. A böngésző a
// 0x01-re dobozt rajzol, mellé kiírja a szöveget.
//
// EZ SZEMRE LÁTHATATLAN: a 0x01 semmiként jelenik meg a szerkesztőben, a
// kódátnézés átsiklik rajta. 21 órán át élt kint, a cikkek ~40%-án.
// A projekt memóriája ezt a csapdát KÉTSZER is rögzíti már (a heredoc eszi
// a backslash-t; a szerkesztő-eszköz a nulla-escape-et valódi nulla-bájttá
// írja) — ezért nem prompt-szintű figyelmeztetés kell rá, hanem gépi kapu.
//
// MELLESLEG, ÉS EZ A LÉNYEG: ez a teszt az ELSŐ futásán SAJÁT MAGÁT fogta
// meg. A fenti bekezdés eredetileg kiírta a nulla-escape-et, és a
// szerkesztő-eszköz valódi nulla-bájtot írt a kommentbe. Ezért ebben a
// fájlban SEHOL nincs escape-szekvencia, és a próbakaraktert is KÓDBÓL
// állítjuk elő (fromCharCode) — így a teszt önmagát is átvizsgálhatja.
//
// A SZABÁLY: szövegfájlban csak tab, soremelés és kocsivissza jogos.
// Bármi más vezérlőkarakter elrontott escape nyoma.
// ===================================================================
import { strict as assert } from 'assert';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// A generált/behozott könyvtárak kimaradnak: ott nem MI írjuk a bájtokat.
const SKIP = new Set(['node_modules', '.git', 'public', 'content', 'memory', 'logs', 'vendor']);
const EXT = /\.(css|js|mjs|json|md|html|yml|yaml|txt)$/i;

// Tiltott: 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F. Engedett: tab(09), LF(0A), CR(0D).
const isControl = ch => {
  const c = ch.charCodeAt(0);
  return (c <= 8) || c === 11 || c === 12 || (c >= 14 && c <= 31);
};
const hasControl = s => [...String(s)].some(isControl);

function scan(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e) || e.startsWith('.')) continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { scan(p, out); continue; }
    if (!EXT.test(e)) continue;
    let txt; try { txt = readFileSync(p, 'utf-8'); } catch { continue; }
    if (!hasControl(txt)) continue;
    txt.split(/\r?\n/).forEach((line, i) => {
      if (!hasControl(line)) return;
      const codes = [...new Set([...line].filter(isControl)
        .map(c => 'U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')))];
      const shown = [...line].map(c => isControl(c) ? '<CTRL>' : c).join('').trim().slice(0, 80);
      out.push(relative(ROOT, p).replace(/\\/g, '/') + ':' + (i + 1) + ' [' + codes.join(',') + '] ' + shown);
    });
  }
  return out;
}

// ── 1) A MŰSZER HITELESÍTÉSE ─────────────────────────────────────────
// "0 találat" csak akkor bizonyíték, ha az eszköz egy ISMERT hibát megfog.
// A próbakarakter kódból készül, hogy a FÁJLBA ne kerüljön vezérlőbájt.
{
  const SOH = String.fromCharCode(1);   // ez rontotta el a CSS-t
  const NUL = String.fromCharCode(0);
  assert.ok(hasControl('content: " ' + SOH + 'F4D8";'), 'az ISMERT hibás sort megfogja');
  assert.ok(hasControl('bármi' + NUL + 'szöveg'), 'a nulla-bájtot is megfogja');
  assert.ok(!hasControl('content: " 📘";'), 'a JAVÍTOTT sort NEM jelzi');
  assert.ok(!hasControl('sor\ttab' + String.fromCharCode(13, 10) + 'sor'), 'tab/CR/LF jogos');
  assert.ok(!hasControl('ékezetes: űáéöüó — és emoji: 📘📰💬'), 'az UTF-8 szöveg tiszta');
}

// ── 2) A VALÓDI FORRÁSFA (ez a fájl is benne van) ────────────────────
{
  const hits = scan(ROOT);
  assert.equal(hits.length, 0,
    'vezérlőkarakter a forrásban (elrontott escape?):\n   ' + hits.join('\n   '));
}

console.log('✅ source-hygiene.test: nincs vezérlőkarakter a forrásban');
