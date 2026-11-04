// node telegram-worker/test/cs-email.test.js — a hurok-védelem és a válasz-sablon tesztje (offline)
// FIGYELEM: a rules-fájlt importáljuk, NEM a cs-email.js-t (abban cloudflare:email import van)!
import { strict as assert } from 'assert';
import { shouldAutoReply, replyText } from '../src/cs-email-rules.js';

// auto-reply fejléc → tilos
assert.deepEqual(shouldAutoReply({ autoSubmitted: 'auto-replied', from: 'x@y.hu', todayCount: 0 }).ok, false);
// saját magunknak → tilos (visszapattanó/hurok)
assert.equal(shouldAutoReply({ autoSubmitted: '', from: 'support@aiworldhq.com', todayCount: 0 }).ok, false);
assert.equal(shouldAutoReply({ autoSubmitted: '', from: 'news@aiworldhq.com', todayCount: 0 }).ok, false);
// napi 2 válasz után → tilos
assert.equal(shouldAutoReply({ autoSubmitted: '', from: 'x@y.hu', todayCount: 2 }).ok, false);
// normál eset → mehet
assert.equal(shouldAutoReply({ autoSubmitted: '', from: 'x@y.hu', todayCount: 1 }).ok, true);

// válasz-sablon: AI-szöveg + lábjegyzet; eszkalációnál "továbbítottuk" sablon
const okBody = replyText({ text: 'Here is the guide.', escalate: false, links: [] }, 'en');
assert.ok(okBody.includes('Here is the guide.'));
assert.ok(okBody.includes('written by AI'), 'lábjegyzet kimondja, hogy MI írta (EU AI Act, 09-27)');
const escBody = replyText({ text: '', escalate: true, links: [] }, 'en');
assert.ok(/passed on to the site owner/i.test(escBody), 'eszkalációnál továbbítás-sablon');
// Nem ígérünk „csapatot" és „ember válaszol" határidőt (09-27): egy ember van, és
// érvényes DMARC nélküli levélre a Cloudflare nem is enged válaszolni.
for (const ny of ['en', 'hu', 'es']) {
  const b = replyText({ text: '', escalate: true, links: [] }, ny) + replyText({ text: 'x', escalate: false, links: [] }, ny);
  assert.ok(!/the team|a csapatnak|hamarosan ember|a human will reply/i.test(b), ny + ': túlígérő sablon');
}
assert.ok(/respuesta la ha escrito una IA/.test(replyText({ text: 'x', escalate: false, links: [] }, 'es')), 'nincs spanyol lábjegyzet');
console.log('✅ cs-email.test: minden átment');
