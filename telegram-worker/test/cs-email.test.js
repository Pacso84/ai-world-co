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
assert.ok(okBody.includes('automated'), 'lábjegyzet jelzi, hogy automata');
const escBody = replyText({ text: '', escalate: true, links: [] }, 'en');
assert.ok(escBody.toLowerCase().includes('forwarded'), 'eszkalációnál továbbítás-sablon');
console.log('✅ cs-email.test: minden átment');
