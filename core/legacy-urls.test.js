// ===================================================================
// TESZT — régi címek: melyik fájlnév lehetett valaha nyilvános URL?
// ===================================================================
// INGYENES, hálózat nélküli. Fut: node core/run-tests.js
//
// MIÉRT (2026-08-15, hibakeresés közben mérve): a _redirects 1755 sornál járt
// a Cloudflare 2100-as plafonjából, és NAPI 22 SORRAL nőtt — a build saját
// vágásáig 11 nap volt hátra. A növekedést az okozta, hogy MINDEN fájlnév-slug
// eltérésre 301-et gyártottunk, holott az útmutatók fájlneve téma-azonosító,
// nem régi cím. Az útmutató örökzöld, tehát ez a lista sosem apadt.
// ===================================================================

import assert from 'assert/strict';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { slugify, couldHaveBeenPublicUrl, legacyRedirect } from './legacy-urls.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✅ ' + name); };

console.log('🧪 régi címek (legacy-urls)\n');

// ÉLES ESET (Search Console-ból ismert, a build.js kommentje is hivatkozik rá):
// a fájlnév az EREDETI címből készült, a cikket azóta átcímezték.
const ELES = {
  bornSlug: 'automate-basic-email-replies-in-outlook-with-meta-ai',
  slug: 'turn-a-short-note-into-a-polished-email-reply-with-meta-ai-in-outlook',
  originalTitle: 'Automate basic email replies in Outlook with Meta AI'
};

t('az EREDETI cím slugjával egyező fájlnév kap 301-et', () => {
  const r = legacyRedirect(ELES);
  assert.equal(r.from, ELES.bornSlug);
  assert.equal(r.to, ELES.slug);
});

t('⚠️ a MOSTANI cím NEM használható forrásként', () => {
  // EZT A HIBÁT ELKÖVETTEM (2026-08-15): a build.js `meta.title`-t adott át,
  // ami a minőségi körök által ÁTÍRT cím. Azzal mérve 0 találat jön ki, és
  // mind a 18 valódi 301-et kidobtuk volna — köztük ezt a GSC-ből ismertet.
  // A teszt azt őrzi, hogy a mostani cím ne tudjon visszacsempésződni.
  assert.equal(legacyRedirect({
    bornSlug: ELES.bornSlug,
    slug: ELES.slug,
    originalTitle: 'Turn a short note into a polished email reply with Meta AI in Outlook'
  }), null, 'a mostani címmel NEM szabad találatot adni');
});

t('a TÉMA-AZONOSÍTÓ nem kap 301-et', () => {
  // `ai-cover-letter` a guide_topic_id, sosem volt nyilvános cím. 265 eltérő
  // párból 221 ilyen — ez volt a lista fő tömege.
  assert.equal(legacyRedirect({
    bornSlug: 'ai-cover-letter',
    slug: 'how-to-write-a-standout-cover-letter-with-ai',
    originalTitle: 'How to write a standout cover letter with AI'
  }), null);
});

t('a CSONKOLT fájlnév nem kap 301-et', () => {
  // A slugify leszedi a záró kötőjelet, tehát lógó kötőjelű alakot elő sem
  // tud állítani — ez KIZÁRÁS, nem valószínűsítés.
  assert.equal(legacyRedirect({
    bornSlug: 'add-an-ai-chatbot-to-your-small-business-site-using-alibaba-',
    slug: 'how-to-add-an-alibaba-cloud-ai-chatbot-to-your-wordpress-site',
    originalTitle: 'Add an AI chatbot to your small business site using Alibaba Cloud'
  }), null);
});

t('ha nincs eltérés, nincs átirányítás', () => {
  assert.equal(legacyRedirect({ bornSlug: 'ugyanaz', slug: 'ugyanaz', originalTitle: 'Ugyanaz' }), null);
});

t('cím nélkül NEM állítunk igent', () => {
  // Óvatosság: amit nem tudunk eldönteni, arra nem gyártunk szabályt —
  // a plafon szűkös, és egy alaptalan sor valódi 301 elől veszi el a helyet.
  assert.equal(legacyRedirect({ bornSlug: 'valami-regi', slug: 'valami-uj', originalTitle: '' }), null);
  assert.equal(couldHaveBeenPublicUrl('valami', undefined), false);
});

t('rossz bemenetre nem esik szét', () => {
  assert.equal(legacyRedirect(), null);
  assert.equal(legacyRedirect({}), null);
  assert.equal(couldHaveBeenPublicUrl('', 'cím'), false);
  assert.equal(couldHaveBeenPublicUrl('Nagy Betűs', 'Nagy Betűs'), false, 'nem slug-alakú');
  assert.equal(couldHaveBeenPublicUrl('ekezetes-cím', 'x'), false, 'nem slug-alakú');
});

t('a slugify a 70. karakternél vág, és nincs lógó kötőjel', () => {
  const hosszu = 'a'.repeat(80);
  assert.equal(slugify(hosszu).length, 70);
  assert.ok(!/-$/.test(slugify('Vége kötőjellel —')), 'a záró kötőjel lekerül');
  assert.equal(slugify(null), '');
});

t('a slugify UGYANÚGY VISELKEDIK, mint a build.js-é', () => {
  // ⚠️ Ez egy MÁSOLAT. Ha a build.js slugify-ja megváltozik és ez nem, akkor
  // némán rossz címekre adnánk (vagy nem adnánk) 301-et.
  // A build.js-t nem lehet importálni (futtatásnak indulna), ezért a FORRÁSÁBÓL
  // építem fel a függvényt, és a VISELKEDÉST hasonlítom — nem a szöveget.
  // (Szöveg-összehasonlítás egy ártatlan átformázásra is elhasalna.)
  const build = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'website', 'build.js'), 'utf-8');
  const m = build.match(/function slugify\s*\([\s\S]*?\n\}/);
  assert.ok(m, 'megvan a build.js slugify-ja');
  const eredeti = new Function(`${m[0]}; return slugify;`)();

  const minta = [
    'How to write a standout cover letter with AI',
    'Add an AI chatbot to your small business site using Alibaba Cloud',
    'Ékezetes cím — árvíztűrő tükörfúrógép',
    'Trailing punctuation!!!',
    '  vezető és záró szóköz  ',
    'a'.repeat(90),
    'Több   szóköz\tés\ttabulátor',
    '123 456',
    ''
  ];
  for (const s of minta) {
    assert.equal(slugify(s), eredeti(s), `eltér erre: "${String(s).slice(0, 40)}"`);
  }
});

console.log('\n✅ legacy-urls.test: mind a ' + pass + ' eset rendben');
