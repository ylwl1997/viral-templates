import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ensureUser, getCredits } from '../functions/_lib/account-db.js';
import { CREDIT_PACKS } from '../functions/_lib/packs.js';
import { onRequestPost as onCheckout } from '../functions/api/payments/checkout.js';
import { onRequestGet as onStatus } from '../functions/api/payments/status.js';
import { onRequestPost as onWebhook } from '../functions/api/payments/webhook.js';
import { onRequestPost as onPhone } from '../functions/api/uploads/phone.js';
import { onRequestPost as onPhoneFile } from '../functions/api/uploads/phone/file.js';
import { onRequestGet as onPhoneRead } from '../functions/api/uploads/phone.js';
import { createCheckout, handlePancakeNotification } from '../functions/_lib/pancake.js';
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

function shortId(prefix, seed) {
  const body = seed.repeat(22).slice(0, 22);
  return `${prefix}_${body}`;
}

function signWebhook(privateKey, payload) {
  const t = String(Date.now());
  const v1 = createSign('RSA-SHA256').update(`${t}.${payload}`).end().sign(privateKey).toString('base64');
  return `t=${t},v1=${v1}`;
}

function expectedRequestSig(privateKey, method, path, timestamp, body) {
  const bodyHash = createHash('sha256').update(body).digest('base64');
  const canonical = `${method}\n${path}\n${timestamp}\n${bodyHash}`;
  return createSign('RSA-SHA256').update(canonical).end().sign(privateKey).toString('base64');
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
const merchantId = shortId('MER', 'm');
const storeId = shortId('STO', 's');
const productId = shortId('PROD', 'p');
const envKeys = {
  WAFFO_MERCHANT_ID: merchantId,
  WAFFO_PRIVATE_KEY: privatePem,
  WAFFO_PANCAKE_STORE_ID: storeId,
  WAFFO_PANCAKE_ENVIRONMENT: 'test',
  WAFFO_WEBHOOK_TEST_PUBLIC_KEY: publicPem,
  WAFFO_CURRENCY: 'USD',
};

const product = {
  id: productId,
  name: '60 credits',
  status: 'active',
  metadata: { pack: 'starter', credits: '60' },
  prices: [{ currency: 'USD', priceInfo: { amount: '5.99', taxCategory: 'digital_goods' } }],
};

function pancakeFetch(calls, catalog) {
  return async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ url: String(url), path, init });
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (path === '/v1/graphql') {
      return json({ data: { onetimeProducts: catalog.products } });
    }
    if (path === '/v1/actions/onetime-product/create-product') {
      catalog.products.push({ ...product, id: productId });
      return json({ data: { product: { id: productId, status: 'active' } } });
    }
    if (path === '/v1/actions/auth/issue-session-token') {
      return json({ data: { token: 'session-token', expiresAt: '2026-11-12T00:00:00.000Z' } });
    }
    if (path === '/v1/actions/checkout/create-session') {
      return json({
        data: {
          sessionId: 'cs_550e8400-e29b-41d4-a716-446655440000',
          checkoutUrl: 'https://pancake.waffo.ai/store/demo/checkout/cs_550e8400-e29b-41d4-a716-446655440000',
          expiresAt: '2026-11-12T00:00:00.000Z',
        },
      });
    }
    return json({ errors: [{ message: 'unexpected', layer: 'sdk' }] }, 404);
  };
}

const sqlite = new DatabaseSync(':memory:');
const db = wrap(sqlite);
const user = { user_id: 'u_alice', email: 'alice@example.com', name: 'Alice' };
await ensureUser(db, user);

const closed = await onStatus({ request: new Request('https://viral-templates.pages.dev/api/payments/status'), env: {} });
const closedBody = await closed.json();
assert(closedBody.available === false, 'checkout available without keys');
assert(!JSON.stringify(closedBody).includes('5.99'), 'hidden price leaked');
assert(!/waffo|pancake/i.test(JSON.stringify(closedBody)), 'provider name leaked');
const debug = await onStatus({
  request: new Request('https://viral-templates.pages.dev/api/payments/status?debug=1'),
  env: {},
});
const debugBody = await debug.json();
assert(debugBody.debug && debugBody.debug.provider === 'pancake', 'debug hint');
assert(debugBody.debug.missing.includes('WAFFO_MERCHANT_ID'), 'debug merchant');
assert(debugBody.debug.missing.includes('WAFFO_PANCAKE_STORE_ID'), 'debug store');
assert(debugBody.debug.missing.includes('WAFFO_PRIVATE_KEY'), 'debug key');
assert(!debugBody.debug.missing.includes('WAFFO_PANCAKE_ENVIRONMENT'), 'test is the default environment');
const { WAFFO_PANCAKE_ENVIRONMENT: _ignoredEnv, ...envWithoutMode } = envKeys;
const defaultMode = await onStatus({
  request: new Request('https://viral-templates.pages.dev/api/payments/status'),
  env: envWithoutMode,
});
assert((await defaultMode.json()).available === true, 'unset environment stayed closed');
const sandbox = await onStatus({
  request: new Request('https://viral-templates.pages.dev/api/payments/status?debug=1'),
  env: { ...envKeys, WAFFO_PANCAKE_ENVIRONMENT: 'sandbox' },
});
const sandboxBody = await sandbox.json();
assert(sandboxBody.available === false && sandboxBody.debug.missing.includes('WAFFO_PANCAKE_ENVIRONMENT'), JSON.stringify(sandboxBody.debug));

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
assert(sqlite.prepare(`SELECT COUNT(*) AS n FROM payment_orders`).get().n === 0, 'unavailable checkout wrote an order');

const calls = [];
const catalog = { products: [] };
const checkout = await createCheckout({
  db,
  env: envKeys,
  user,
  packId: 'starter',
  origin: 'https://viral-templates.pages.dev',
  fetchImpl: pancakeFetch(calls, catalog),
});
assert(checkout.url.startsWith('https://pancake.waffo.ai/store/demo/checkout/'), checkout.url);
assert(checkout.url.includes('#token=session-token'), checkout.url);
assert(!calls.some((call) => /waffo\.com|\/api\/v1\/order\/create/.test(call.url)), 'psp host');
const created = calls.find((call) => call.path === '/v1/actions/onetime-product/create-product');
assert(created, 'product was not created');
const createdBody = JSON.parse(created.init.body);
assert(createdBody.storeId === storeId, 'create store');
assert(createdBody.prices.USD.amount === '5.99' && createdBody.prices.USD.taxCategory === 'digital_goods', JSON.stringify(createdBody.prices));
assert(createdBody.metadata.pack === 'starter', 'product metadata');
assert(created.init.headers['X-Idempotency-Key'] === 'pack_starter_USD_5_99', created.init.headers['X-Idempotency-Key']);
const sessionCall = calls.find((call) => call.path === '/v1/actions/checkout/create-session');
const tokenCall = calls.find((call) => call.path === '/v1/actions/auth/issue-session-token');
assert(sessionCall && tokenCall, 'checkout calls');
assert(sessionCall.url === 'https://api.waffo.ai/v1/actions/checkout/create-session', sessionCall.url);
for (const call of [sessionCall, tokenCall, created]) {
  assert(call.init.headers['X-Merchant-Id'] === merchantId, 'merchant header');
  assert(!call.init.headers['X-API-KEY'] && !call.init.headers['X-Environment'], 'psp header');
  const sig = expectedRequestSig(privateKey, 'POST', call.path, call.init.headers['X-Timestamp'], call.init.body);
  assert(sig === call.init.headers['X-Signature'], `signature ${call.path}`);
}
const sessionBody = JSON.parse(sessionCall.init.body);
assert(sessionBody.productId === productId, 'product id');
assert(sessionBody.currency === 'USD', 'currency');
assert(sessionBody.orderMerchantExternalId === checkout.order_id, 'external id');
assert(sessionBody.buyerEmail === 'alice@example.com', 'buyer email');
assert(sessionBody.allowPromotionCodes === false, 'promotion codes');
assert(sessionBody.successUrl === 'https://viral-templates.pages.dev/account/credits/?checkout=return', sessionBody.successUrl);
assert(!('buyerIdentity' in sessionBody), 'identity leaked onto the session');
assert(!sessionBody.notifyUrl && !sessionBody.merchantInfo && !sessionBody.orderAmount, 'psp body');
const tokenBody = JSON.parse(tokenCall.init.body);
assert(tokenBody.buyerIdentity === 'u_alice' && tokenBody.productId === productId, JSON.stringify(tokenBody));
const order = sqlite.prepare(`SELECT status, credits, amount_cents, currency, acquiring_order_id FROM payment_orders WHERE id = ?`).get(checkout.order_id);
assert(order.status === 'pending' && order.credits === 60 && order.amount_cents === 599 && order.currency === 'USD', JSON.stringify(order));
assert(order.acquiring_order_id === 'cs_550e8400-e29b-41d4-a716-446655440000', order.acquiring_order_id);
assert((await getCredits(db, user)).balance === 0, 'create credited before payment');

const reuseCalls = [];
const reuse = await createCheckout({
  db,
  env: envKeys,
  user,
  packId: 'starter',
  origin: 'https://viral-templates.pages.dev',
  fetchImpl: pancakeFetch(reuseCalls, catalog),
});
assert(reuse.order_id !== checkout.order_id, 'reused order id');
assert(!reuseCalls.some((call) => call.path === '/v1/actions/onetime-product/create-product'), 'created a second product');

const notice = {
  id: 'evt_1',
  timestamp: new Date().toISOString(),
  eventType: 'order.completed',
  eventId: 'PAY_6eYCunG3IMmIgcQOnaXdoA',
  storeId,
  mode: 'test',
  data: {
    orderId: 'ORD_5dXBtmF2HLlHfbPNm0Wcnz',
    orderStatus: 'completed',
    paymentStatus: 'succeeded',
    orderMerchantExternalId: checkout.order_id,
    currency: 'USD',
    amount: '5.99',
    chargedAmount: '5.99',
    listPrice: { subtotal: '5.99', total: '5.99', listTotal: '5.99', discountAmount: '0.00' },
    orderMetadata: { pack: 'starter', credits: '60' },
  },
};
const raw = JSON.stringify(notice);
const goodSig = signWebhook(privateKey, raw);
const paid = await handlePancakeNotification({ db, env: envKeys, rawBody: raw, signature: goodSig });
assert(paid.http === 200 && paid.body === 'OK', JSON.stringify(paid));
assert((await getCredits(db, user)).balance === 60, 'paid balance');
const replay = await handlePancakeNotification({ db, env: envKeys, rawBody: raw, signature: goodSig });
assert(replay.body === 'OK', 'replay');
assert((await getCredits(db, user)).balance === 60, 'replay credited again');
assert(sqlite.prepare(`SELECT COUNT(*) AS n FROM credit_ledger WHERE kind = 'topup'`).get().n === 1, 'two topups');
assert(sqlite.prepare(`SELECT acquiring_order_id, status FROM payment_orders WHERE id = ?`).get(checkout.order_id).status === 'paid', 'not paid');

const tampered = raw.replace('5.99', '1.00');
const badAmount = await handlePancakeNotification({
  db,
  env: envKeys,
  rawBody: tampered,
  signature: signWebhook(privateKey, tampered),
});
assert(badAmount.http === 200 && badAmount.body === 'OK', 'amount mismatch rejected as unsigned');
assert((await getCredits(db, user)).balance === 60, 'mismatch balance');

const forged = await handlePancakeNotification({ db, env: envKeys, rawBody: raw, signature: 't=1,v1=bm90LWEgc2ln' });
assert(forged.http === 401 && forged.body === 'Invalid signature', 'bad signature accepted');

const embedded = { ...envKeys };
delete embedded.WAFFO_WEBHOOK_TEST_PUBLIC_KEY;
const builtinReject = await handlePancakeNotification({ db, env: embedded, rawBody: raw, signature: goodSig });
assert(builtinReject.http === 401, 'custom signature accepted by the built-in key');

const other = {
  ...notice,
  data: { ...notice.data, orderMerchantExternalId: `pay_${'ab'.repeat(16)}` },
};
const missing = await handlePancakeNotification({
  db,
  env: envKeys,
  rawBody: JSON.stringify(other),
  signature: signWebhook(privateKey, JSON.stringify(other)),
});
assert(missing.http === 200 && missing.body === 'OK', JSON.stringify(missing));
assert((await getCredits(db, user)).balance === 60, 'unknown order credited');

const wrongStore = { ...notice, storeId: shortId('STO', 'z') };
const storeMiss = await handlePancakeNotification({
  db,
  env: envKeys,
  rawBody: JSON.stringify(wrongStore),
  signature: signWebhook(privateKey, JSON.stringify(wrongStore)),
});
assert(storeMiss.body === 'OK' && (await getCredits(db, user)).balance === 60, 'other store credited');

const liveEnv = { ...envKeys, WAFFO_PANCAKE_ENVIRONMENT: 'live' };
const liveRejected = await handlePancakeNotification({ db, env: liveEnv, rawBody: raw, signature: goodSig });
assert(liveRejected.http === 401, 'test signature accepted for live');
assert((await getCredits(db, user)).balance === 60, 'live mismatch credited');

const httpPaid = await onWebhook({
  request: new Request('https://viral-templates.pages.dev/api/payments/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-waffo-signature': goodSig },
    body: raw,
  }),
  env: { ...envKeys, DB: db },
});
assert(httpPaid.status === 200 && (await httpPaid.text()) === 'OK', 'http webhook');
assert((await getCredits(db, user)).balance === 60, 'http replay');

const refund = {
  ...notice,
  eventType: 'refund.succeeded',
  data: { ...notice.data, amount: '5.99', chargedAmount: undefined, refundedAmount: '5.99' },
};
await handlePancakeNotification({
  db,
  env: envKeys,
  rawBody: JSON.stringify(refund),
  signature: signWebhook(privateKey, JSON.stringify(refund)),
});
assert(sqlite.prepare(`SELECT status FROM payment_orders WHERE id = ?`).get(checkout.order_id).status === 'paid', 'refund undid a payment');
assert((await getCredits(db, user)).balance === 60, 'refund removed credits');

const largeProduct = {
  id: shortId('PROD', 'l'),
  name: '600 credits',
  status: 'active',
  metadata: { pack: 'large', credits: '600' },
  prices: { USD: { amount: '39.99', taxCategory: 'digital_goods' } },
};
const largeCalls = [];
const large = await createCheckout({
  db,
  env: envKeys,
  user,
  packId: 'large',
  origin: 'https://viral-templates.pages.dev',
  fetchImpl: pancakeFetch(largeCalls, { products: [largeProduct] }),
});
assert(!largeCalls.some((call) => call.path === '/v1/actions/onetime-product/create-product'), 'priced product was recreated');
const under = {
  ...notice,
  id: 'evt_under',
  data: {
    ...notice.data,
    orderMerchantExternalId: large.order_id,
    amount: '39.99',
    chargedAmount: '10.00',
    listPrice: { subtotal: '39.99', total: '39.99', listTotal: '39.99', discountAmount: '0.00' },
    orderMetadata: { pack: 'large', credits: '600' },
  },
};
await handlePancakeNotification({
  db,
  env: envKeys,
  rawBody: JSON.stringify(under),
  signature: signWebhook(privateKey, JSON.stringify(under)),
});
assert(sqlite.prepare(`SELECT status FROM payment_orders WHERE id = ?`).get(large.order_id).status === 'pending', 'underpay marked paid');
assert((await getCredits(db, user)).balance === 60, 'underpay credited');
const taxed = {
  ...notice,
  id: 'evt_tax',
  data: {
    ...notice.data,
    orderMerchantExternalId: large.order_id,
    amount: '43.19',
    chargedAmount: '43.19',
    listPrice: { subtotal: '39.99', total: '43.19', listTotal: '43.19', discountAmount: '0.00' },
    orderMetadata: { pack: 'large', credits: '600' },
  },
};
const taxedRaw = JSON.stringify(taxed);
const taxedPaid = await handlePancakeNotification({
  db,
  env: envKeys,
  rawBody: taxedRaw,
  signature: signWebhook(privateKey, taxedRaw),
});
assert(taxedPaid.body === 'OK' && (await getCredits(db, user)).balance === 660, 'tax-inclusive charge was not credited');

const failedCalls = [];
let failedOrder;
try {
  await createCheckout({
    db,
    env: envKeys,
    user,
    packId: 'mid',
    origin: 'https://viral-templates.pages.dev',
    fetchImpl: async (url, init) => {
      failedCalls.push({ url: String(url), init });
      const path = new URL(url).pathname;
      if (path === '/v1/graphql') {
        return new Response(JSON.stringify({ data: { onetimeProducts: [] } }), { status: 200 });
      }
      return new Response(JSON.stringify({ errors: [{ message: 'nope', layer: 'product' }] }), { status: 400 });
    },
  });
  failedOrder = 'opened';
} catch (err) {
  failedOrder = err && err.code;
}
assert(failedOrder === 'checkout_failed', failedOrder);
assert((await getCredits(db, user)).balance === 660, 'failed create credited');
assert(sqlite.prepare(`SELECT COUNT(*) AS n FROM payment_orders WHERE pack_id = 'mid'`).get().n === 0, 'failed product wrote an order');

assert(CREDIT_PACKS.map((pack) => pack.credits).join() === '60,180,600', 'pack credits');
const site = readFileSync(new URL('../src/lib/site.ts', import.meta.url), 'utf8');
assert(!/waffo/i.test(site), 'provider name in site config');
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
