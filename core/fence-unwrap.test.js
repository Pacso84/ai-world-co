// ===================================================================
// KÜLSŐ KÓD-KERÍTÉS TESZT — futtatás: node core/fence-unwrap.test.js
// Éles hibából (2026-07-21): a MiniMax M3 az egész választ ```markdown
// kerítésbe csomagolta → a fordító elutasította → néma gyártás-leállás.
// ===================================================================
import { strict as assert } from 'assert';
import { unwrapOuterFence } from './ai-router.js';

// 1) A VALÓDI eset: teljes cikk ```markdown kerítésben
const wrapped = '```markdown\n---\ntitle: "Teszt"\n---\n\n# Cím\n\nSzöveg.\n```';
const un = unwrapOuterFence(wrapped);
assert.ok(un.trimStart().startsWith('---'), 'a frontmatter a szöveg elejére kerül');
assert.ok(!un.includes('```markdown'), 'a külső kerítés eltűnt');
assert.ok(un.includes('# Cím') && un.includes('Szöveg.'), 'a tartalom megmarad');

// 2) JSON-kerítés is lehámlik
assert.equal(unwrapOuterFence('```json\n{"a":1}\n```'), '{"a":1}');

// 3) Nyelvjelölő nélküli kerítés
assert.equal(unwrapOuterFence('```\nsima szoveg\n```'), 'sima szoveg');

// 4) NEM bántjuk a normál választ (nincs kerítés)
const plain = '---\ntitle: "X"\n---\n\n# Cím';
assert.equal(unwrapOuterFence(plain), plain, 'kerítés nélküli szöveg változatlan');

// 5) NEM bántjuk a szövegen BELÜLI kódblokkot (a válasz nem kerítéssel kezdődik)
const inner = 'Írd be ezt:\n\n```bash\nnpm install\n```\n\nKész.';
assert.equal(unwrapOuterFence(inner), inner, 'belső kódblokk érintetlen');

// 6) Több különálló kódblokk esetén NEM hámozunk (nem "egy külső burok")
const multi = '```bash\na\n```\n\nszöveg\n\n```bash\nb\n```';
assert.equal(unwrapOuterFence(multi), multi, 'két külön blokknál nincs hámozás');

// 7) Nem-string bemenet nem dob hibát
assert.equal(unwrapOuterFence(null), null);
assert.equal(unwrapOuterFence(undefined), undefined);

console.log('✅ fence-unwrap.test: minden átment');
