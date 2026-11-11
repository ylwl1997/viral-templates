import { generateKeyPairSync, createSign } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ensureUser, getCredits } from '../functions/_lib/account-db.js';
import { CREDIT_PACKS } from '../functions/_lib/packs.js';
import { onRequestPost as onCheckout } from '../functions/api/payments/checkout.js';
import { onRequestGet as onStatus } from '../functions/api/payments/status.js';
import { onRequestPost as onWebhook } from '../functions/api/payments/waffo/webhook.js';
import { onRequestPost as onPhone } from '../functions/api/uploads/phone.js';
import { onRequestPost as onPhoneFile } from '../functions/api/uploads/phone/file.js';
import { onRequestGet as onPhoneRead } from '../functions/api/uploads/phone.js';
import { createCheckout, handleWaffoNotification, signBody } from '../functions/_lib/waffo.js';
import { issueSessionCookie } from '../functions/_lib/session.js';
import { probeImage } from '../functions/_lib/image-precheck.js';

function assert(cond, message) {
  if (!cond) throw new Error(message || 'assertion failed');
}

function wrap(sqlite) {
  function prepared(sql, params = []) {
    return {
      bind(...next) {
        return prepared(sql, next);
      },
      async run() {
        const info = sqlite.prepare(sql).run(...params);
        return { meta: { changes: info.changes } };
      },
      async first() {
        return sqlite.prepare(sql).get(...params) ?? null;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...params) };
      },
    };
  }
  return {
    prepare(sql) {
      return prepared(sql);
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const out = [];
        for (const stmt of statements) out.push(await stmt.run());
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
const envKeys = {
  WAFFO_API_KEY: 'waffo-test-api-key',
  WAFFO_MERCHANT_ID: 'M000001',
  WAFFO_PRIVATE_KEY: privatePem,
  WAFFO_PUBLIC_KEY: publicPem,
  WAFFO_API_BASE: 'https://api-sandbox.waffo.com',
  WAFFO_CURRENCY: 'USD',
};

const sqlite = new DatabaseSync(':memory:');
const db = wrap(sqlite);
const user = { user_id: 'u_alice', email: 'alice@example.com', name: 'Alice' };
await ensureUser(db, user);

const closed = await onStatus({ request: new Request('https://viral-templates.pages.dev/api/payments/status'), env: {} });
const closedBody = await closed.json();
assert(closedBody.available === false, 'checkout available without keys');
assert(!JSON.stringify(closedBody).includes('5.99'), 'hidden price leaked');
assert(!JSON.stringify(closedBody).includes('waffo'), 'provider name leaked');
const debug = await onStatus({
  request: new Request('https://viral-templates.pages.dev/api/payments/status?debug=1'),
  env: {},
});
const debugBody = await debug.json();
assert(debugBody.debug && debugBody.debug.provider === 'waffo', 'debug hint');

const cookie = (await issueSessionCookie(new Request('https://viral-templates.pages.dev/api/payments/checkout'), { AUTH_SECRET: 'auth-secret-value-1' }, user)).split(';')[0];
const denied = await onCheckout({
  request: new Request('https://viral-templates.pages.dev/api/payments/checkout', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ pack: 'starter' }),
  }),
  env: { DB: db, AUTH_SECRET: 'auth-secret-value-1' },
});
const deniedBody = await denied.json();
assert(denied.status === 503 && deniedBody.error === 'checkout_unavailable', JSON.stringify(deniedBody));
assert((await getCredits(db, user)).balance === 0, 'unavailable checkout credited');

let posted = null;
const checkout = await createCheckout({
  db,
  env: envKeys,
  user,
  packId: 'starter',
  origin: 'https://viral-templates.pages.dev',
  fetchImpl: async (url, init) => {
    posted = { url, init };
    return new Response(
      JSON.stringify({
        data: {
          orderStatus: 'AUTHORIZATION_REQUIRED',
          orderAction: { webUrl: 'https://checkout.example.test/pay/1' },
          acquiringOrderId: 'A001',
        },
      }),
      { status: 200 },
    );
  },
});
assert(checkout.url === 'https://checkout.example.test/pay/1', checkout.url);
assert(String(posted.url).endsWith('/api/v1/order/create'), posted.url);
const signedBody = posted.init.body;
const signature = posted.init.headers['X-SIGNATURE'];
assert(await signBody(privatePem, signedBody) === signature, 'request signature');
const order = sqlite.prepare(`SELECT status, credits, amount_cents, currency FROM payment_orders WHERE id = ?`).get(checkout.order_id);
assert(order.status === 'pending' && order.credits === 60 && order.amount_cents === 599 && order.currency === 'USD', JSON.stringify(order));
assert((await getCredits(db, user)).balance === 0, 'create credited before payment');

const notice = {
  eventType: 'PAYMENT_NOTIFICATION',
  result: {
    merchantOrderId: checkout.order_id,
    acquiringOrderId: 'A001',
    orderStatus: 'PAY_SUCCESS',
    orderAmount: '5.99',
    orderCurrency: 'USD',
  },
};
const raw = JSON.stringify(notice);
const goodSig = await signBody(privatePem, raw);
const paid = await handleWaffoNotification({ db, env: envKeys, rawBody: raw, signature: goodSig });
assert(paid.body.message === 'success', JSON.stringify(paid));
assert((await getCredits(db, user)).balance === 60, 'paid balance');
const replay = await handleWaffoNotification({ db, env: envKeys, rawBody: raw, signature: goodSig });
assert(replay.body.message === 'success', 'replay');
assert((await getCredits(db, user)).balance === 60, 'replay credited again');
assert(sqlite.prepare(`SELECT COUNT(*) AS n FROM credit_ledger WHERE kind = 'topup'`).get().n === 1, 'two topups');

const nodeSig = createSign('RSA-SHA256').update(raw).end().sign(privateKey).toString('base64');
const nodeCheck = await handleWaffoNotification({ db, env: envKeys, rawBody: raw, signature: nodeSig });
assert(nodeCheck.body.message === 'success' && (await getCredits(db, user)).balance === 60, 'node signature');

const tampered = raw.replace('5.99', '5.98');
const badAmount = await handleWaffoNotification({
  db,
  env: envKeys,
  rawBody: tampered,
  signature: await signBody(privatePem, tampered),
});
assert(badAmount.body.message === 'failed', 'amount mismatch credited');
assert((await getCredits(db, user)).balance === 60, 'mismatch balance');

const forged = await handleWaffoNotification({ db, env: envKeys, rawBody: raw, signature: 'bm90LWEgc2ln' });
assert(forged.body.message === 'failed', 'bad signature accepted');

const other = { ...notice, result: { ...notice.result, merchantOrderId: 'pay_' + 'ab'.repeat(16), orderStatus: 'PAY_SUCCESS' } };
const missing = await handleWaffoNotification({
  db,
  env: envKeys,
  rawBody: JSON.stringify(other),
  signature: await signBody(privatePem, JSON.stringify(other)),
});
assert(missing.body.message === 'unknown', JSON.stringify(missing));

const httpPaid = await onWebhook({
  request: new Request('https://viral-templates.pages.dev/api/payments/waffo/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': goodSig },
    body: raw,
  }),
  env: { ...envKeys, DB: db },
});
assert(httpPaid.status === 200 && (await httpPaid.json()).message === 'success', 'http webhook');
assert((await getCredits(db, user)).balance === 60, 'http replay');

const closedNote = {
  eventType: 'PAYMENT_NOTIFICATION',
  result: { ...notice.result, merchantOrderId: checkout.order_id, orderStatus: 'ORDER_CLOSE' },
};
await handleWaffoNotification({
  db,
  env: envKeys,
  rawBody: JSON.stringify(closedNote),
  signature: await signBody(privatePem, JSON.stringify(closedNote)),
});
assert(sqlite.prepare(`SELECT status FROM payment_orders WHERE id = ?`).get(checkout.order_id).status === 'paid', 'close undid a payment');

assert(CREDIT_PACKS.map((pack) => pack.credits).join() === '60,180,600', 'pack credits');
const site = fsSite();
for (const pack of CREDIT_PACKS) {
  assert(site.includes(String(pack.cents)), `site missing ${pack.cents}`);
  assert(site.includes(`credits: ${pack.credits}`), `site missing ${pack.credits}`);
}

const bucket = mockBucket();
const phoneEnv = { DB: db, MEDIA: bucket, AUTH_SECRET: 'auth-secret-value-1' };
const linkRes = await onPhone({
  request: new Request('https://viral-templates.pages.dev/api/uploads/phone', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ template_slug: 'bby-wow', slot: 0 }),
  }),
  env: phoneEnv,
});
const link = await linkRes.json();
assert(linkRes.status === 200 && link.url.includes('/phone/?t='), JSON.stringify(link));
const form = new FormData();
form.set('token', link.token);
form.set('photo', new Blob([probeImage('jpeg', 720, 1280)], { type: 'image/jpeg' }), 'a.jpg');
const uploaded = await onPhoneFile({
  request: new Request('https://viral-templates.pages.dev/api/uploads/phone/file', { method: 'POST', body: form }),
  env: phoneEnv,
});
assert(uploaded.status === 200, `phone upload ${uploaded.status}`);
const read = await onPhoneRead({
  request: new Request(`https://viral-templates.pages.dev/api/uploads/phone?token=${link.token}`, { headers: { cookie } }),
  env: phoneEnv,
});
const photo = await read.json();
assert(photo.status === 'ready' && photo.photo.startsWith('data:image/jpeg'), 'desktop read');
const stranger = { user_id: 'u_bob', email: 'bob@example.com', name: 'Bob' };
const strangerCookie = (
  await issueSessionCookie(new Request('https://viral-templates.pages.dev/api/uploads/phone'), phoneEnv, stranger)
).split(';')[0];
const hidden = await onPhoneRead({
  request: new Request(`https://viral-templates.pages.dev/api/uploads/phone?token=${link.token}`, {
    headers: { cookie: strangerCookie },
  }),
  env: phoneEnv,
});
assert(hidden.status === 403, `stranger ${hidden.status}`);
const tiny = new FormData();
tiny.set('token', link.token);
tiny.set('photo', new Blob([probeImage('jpeg', 120, 120)], { type: 'image/jpeg' }), 'tiny.jpg');
const rejected = await onPhoneFile({
  request: new Request('https://viral-templates.pages.dev/api/uploads/phone/file', { method: 'POST', body: tiny }),
  env: phoneEnv,
});
assert(rejected.status === 400 && (await rejected.json()).error === 'photo_too_small', 'phone precheck');

function fsSite() {
  return readFileSync(new URL('../src/lib/site.ts', import.meta.url), 'utf8');
}
import { readFileSync } from 'node:fs';

function mockBucket() {
  const objects = new Map();
  return {
    async put(key, value, opts) {
      objects.set(key, { bytes: value instanceof Uint8Array ? value : new Uint8Array(value), opts });
    },
    async get(key) {
      const row = objects.get(key);
      if (!row) return null;
      return { arrayBuffer: async () => row.bytes.buffer.slice(row.bytes.byteOffset, row.bytes.byteOffset + row.bytes.byteLength) };
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

console.log('checkout webhook tests passed');
