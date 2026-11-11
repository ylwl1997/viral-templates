/**
 * Waffo Pancake checkout for credit packs (@waffo/pancake-ts).
 * Missing merchant id, store id, or private key leaves Buy closed and writes nothing.
 * Credits are added only after a verified order.completed whose price matches the stored order.
 * A browser return is not a payment. A refund notice does not remove credits.
 */

import { WaffoPancake, verifyWebhook } from '@waffo/pancake-ts';
import { appendLedger, ensureSchema, ensureUser, fail, newId } from './account-db.js';
import { CREDIT_PACKS, formatCents, packById, publicPack } from './packs.js';

const SHORT_ID = /^[A-Z]{2,5}_[0-9A-Za-z]{22}$/;
const ORDER_ID = /^pay_[a-f0-9]{32}$/;
const PRODUCT_QUERY = `query ($storeId: String!) {
  onetimeProducts(storeId: $storeId, limit: 50) {
    id
    name
    status
    metadata
    prices { currency priceInfo { amount taxCategory } }
  }
}`;

function pancakeEnvironment(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value || value === 'test') return 'test';
  if (value === 'prod' || value === 'live') return 'prod';
  return '';
}

function shortId(value, prefix) {
  const text = String(value || '').trim();
  return SHORT_ID.test(text) && text.startsWith(`${prefix}_`) ? text : '';
}

function moneyCents(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value !== 'string') return null;
  const textValue = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(textValue)) return null;
  const [whole, frac = ''] = textValue.split('.');
  return Number(whole) * 100 + Number((`${frac}00`).slice(0, 2));
}

function sameMoney(left, right) {
  const a = moneyCents(typeof left === 'number' ? left : String(left ?? ''));
  const b = moneyCents(typeof right === 'number' ? right : String(right ?? ''));
  return a != null && a === b;
}

function readMeta(metadata) {
  let meta = metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      return {};
    }
  }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  return meta;
}

function priceAmount(prices, currency) {
  if (!prices) return '';
  if (Array.isArray(prices)) {
    const row = prices.find((item) => item && String(item.currency || '').toUpperCase() === currency);
    const info = row && (row.priceInfo || row);
    return info && info.amount != null ? String(info.amount) : '';
  }
  const info = prices[currency] || prices[currency.toLowerCase()];
  return info && info.amount != null ? String(info.amount) : '';
}

function productMatches(product, pack, currency, amount) {
  if (!product || product.status !== 'active') return false;
  if (!shortId(product.id, 'PROD')) return false;
  const meta = readMeta(product.metadata);
  const tagged = String(meta.pack || '') === pack.id;
  const named = product.name === `${pack.credits} credits`;
  if (!tagged && !named) return false;
  if (tagged && meta.credits != null && String(meta.credits) !== String(pack.credits)) return false;
  return sameMoney(priceAmount(product.prices, currency), amount);
}

function webhookKeys(source) {
  const test = String(source.WAFFO_WEBHOOK_TEST_PUBLIC_KEY || '').trim();
  const prod = String(source.WAFFO_WEBHOOK_PROD_PUBLIC_KEY || '').trim();
  const shared = String(source.WAFFO_WEBHOOK_PUBLIC_KEY || '').trim();
  if (!test && !prod && shared) return shared;
  const keys = {};
  if (test) keys.test = test;
  if (prod) keys.prod = prod;
  return Object.keys(keys).length ? keys : undefined;
}

function keyMaterialOk(cfg) {
  try {
    const client = new WaffoPancake({
      merchantId: cfg.merchantId,
      privateKey: cfg.privateKey,
      environment: cfg.environment,
    });
    return Boolean(client);
  } catch {
    return false;
  }
}

export function pancakeConfig(env) {
  const source = env || {};
  const merchantId = shortId(source.WAFFO_MERCHANT_ID, 'MER');
  const storeId = shortId(source.WAFFO_PANCAKE_STORE_ID, 'STO');
  const privateKey = String(source.WAFFO_PRIVATE_KEY || '').trim();
  const environment = pancakeEnvironment(source.WAFFO_PANCAKE_ENVIRONMENT);
  const currency = String(source.WAFFO_CURRENCY || 'USD').trim().toUpperCase() || 'USD';
  const currencyOk = /^[A-Z]{3}$/.test(currency);
  const shapeOk = Boolean(merchantId && storeId && privateKey.length >= 40 && environment && currencyOk);
  const available = shapeOk && keyMaterialOk({ merchantId, privateKey, environment });
  return {
    available,
    merchantId,
    storeId,
    privateKey,
    environment,
    currency: currencyOk ? currency : '',
    merchantRaw: String(source.WAFFO_MERCHANT_ID || '').trim(),
    storeRaw: String(source.WAFFO_PANCAKE_STORE_ID || '').trim(),
    environmentRaw: String(source.WAFFO_PANCAKE_ENVIRONMENT ?? '').trim(),
    webhookPublicKey: webhookKeys(source),
  };
}

export function checkoutStatus(env, options = {}) {
  const cfg = pancakeConfig(env);
  const body = {
    ok: true,
    available: cfg.available,
    packs: CREDIT_PACKS.map((pack) => publicPack(pack, cfg.available)),
  };
  if (cfg.available) body.currency = cfg.currency;
  if (options.debug && !cfg.available) {
    body.debug = {
      provider: 'pancake',
      missing: [
        cfg.merchantId ? null : 'WAFFO_MERCHANT_ID',
        cfg.storeId ? null : 'WAFFO_PANCAKE_STORE_ID',
        cfg.privateKey.length >= 40 ? null : 'WAFFO_PRIVATE_KEY',
        cfg.environment ? null : 'WAFFO_PANCAKE_ENVIRONMENT',
        cfg.currency ? null : 'WAFFO_CURRENCY',
      ].filter(Boolean),
    };
    if (cfg.merchantId && cfg.storeId && cfg.environment && cfg.currency && cfg.privateKey.length >= 40 && !cfg.available) {
      body.debug.missing = ['WAFFO_PRIVATE_KEY'];
    }
  }
  return body;
}

function makeClient(cfg, fetchImpl) {
  return new WaffoPancake({
    merchantId: cfg.merchantId,
    privateKey: cfg.privateKey,
    environment: cfg.environment,
    fetch: (url, init = {}) => {
      const next = { ...init };
      if (!next.signal) next.signal = AbortSignal.timeout(20_000);
      return fetchImpl(url, next);
    },
  });
}

async function ensurePackProduct(client, cfg, pack) {
  const amount = formatCents(pack.cents);
  const listed = await client.graphql.query({
    query: PRODUCT_QUERY,
    variables: { storeId: cfg.storeId },
  });
  if (listed && Array.isArray(listed.errors) && listed.errors.length && !(listed.data && Array.isArray(listed.data.onetimeProducts))) {
    throw fail('checkout_failed');
  }
  const products = listed && listed.data && Array.isArray(listed.data.onetimeProducts) ? listed.data.onetimeProducts : [];
  const found = products.find((product) => productMatches(product, pack, cfg.currency, amount));
  if (found) return found.id;
  const created = await client.onetimeProducts.create(
    {
      storeId: cfg.storeId,
      name: `${pack.credits} credits`,
      description: `${pack.credits} credits`,
      prices: {
        [cfg.currency]: { amount, taxCategory: 'digital_goods' },
      },
      metadata: { pack: pack.id, credits: String(pack.credits) },
    },
    { idempotencyKey: `pack_${pack.id}_${cfg.currency}_${amount.replace('.', '_')}` },
  );
  const product = created && (created.product || created);
  const id = product && shortId(product.id, 'PROD');
  if (!id) throw fail('checkout_failed');
  return id;
}

function hostedCheckoutUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return '';
    return url.href;
  } catch {
    return '';
  }
}

async function closeOrder(db, id) {
  await db
    .prepare(`UPDATE payment_orders SET status = 'closed', updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(new Date().toISOString(), id)
    .run();
}

export async function createCheckout({ db, env, user, packId, origin, fetchImpl = fetch }) {
  const cfg = pancakeConfig(env);
  if (!cfg.available) throw fail('checkout_unavailable');
  const pack = packById(packId);
  if (!pack) throw fail('bad_pack');
  let page;
  try {
    page = new URL(origin);
  } catch {
    throw fail('checkout_unavailable');
  }
  if (page.protocol !== 'https:' && page.hostname !== 'localhost' && page.hostname !== '127.0.0.1') {
    throw fail('checkout_unavailable');
  }
  const client = makeClient(cfg, fetchImpl);
  let productId;
  try {
    productId = await ensurePackProduct(client, cfg, pack);
  } catch (err) {
    console.error('checkout_failed', err && err.status ? err.status : 'product');
    throw fail('checkout_failed');
  }
  const row = await ensureUser(db, user);
  await ensureSchema(db);
  const id = `pay_${newId('x').slice(2)}`;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO payment_orders (
         id, user_id, pack_id, credits, amount_cents, currency, status,
         payment_request_id, acquiring_order_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?)`,
    )
    .bind(id, row.user_id, pack.id, pack.credits, pack.cents, cfg.currency, id.slice(4), now, now)
    .run();
  const sessionParams = {
    productId,
    currency: cfg.currency,
    buyerIdentity: row.user_id,
    allowPromotionCodes: false,
    expiresInSeconds: 3600,
    orderMerchantExternalId: id,
    metadata: { pack: pack.id, credits: String(pack.credits) },
  };
  if (row.email) sessionParams.buyerEmail = row.email;
  if (page.protocol === 'https:') sessionParams.successUrl = `${page.origin}/account/credits/?checkout=return`;
  let session;
  try {
    session = await client.checkout.authenticated.create(sessionParams);
  } catch (err) {
    console.error('checkout_failed', err && err.status ? err.status : 'session');
    await closeOrder(db, id);
    throw fail('checkout_failed');
  }
  const url = hostedCheckoutUrl(session && session.checkoutUrl);
  const sessionId = session && typeof session.sessionId === 'string' ? session.sessionId.slice(0, 80) : '';
  if (!url) {
    await closeOrder(db, id);
    throw fail('checkout_failed');
  }
  await db
    .prepare(`UPDATE payment_orders SET acquiring_order_id = ?, updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(sessionId || null, new Date().toISOString(), id)
    .run();
  return { ok: true, url, order_id: id };
}

function cleanOrderId(value) {
  if (typeof value !== 'string') return '';
  const textValue = value.trim();
  return ORDER_ID.test(textValue) ? textValue : '';
}

function discountCents(data) {
  const list = data && data.listPrice;
  if (!list || list.discountAmount == null || list.discountAmount === '') return 0;
  return moneyCents(typeof list.discountAmount === 'number' ? list.discountAmount : String(list.discountAmount));
}

function paymentMatches(data, order) {
  if (!data || typeof data !== 'object') return false;
  const currency = typeof data.currency === 'string' ? data.currency.trim().toUpperCase() : '';
  if (currency !== String(order.currency)) return false;
  if (data.orderStatus && data.orderStatus !== 'completed') return false;
  if (data.paymentStatus && data.paymentStatus !== 'succeeded') return false;
  const meta = readMeta(data.orderMetadata);
  if (meta.pack && String(meta.pack) !== String(order.pack_id)) return false;
  const discount = discountCents(data);
  if (discount == null || discount > 0) return false;
  const cents = Number(order.amount_cents);
  const charged =
    data.chargedAmount == null || data.chargedAmount === ''
      ? null
      : moneyCents(typeof data.chargedAmount === 'number' ? data.chargedAmount : String(data.chargedAmount));
  if (charged != null && charged < cents) return false;
  const list = data.listPrice || {};
  const candidates = [list.subtotal, list.total, list.listTotal, data.amount, data.chargedAmount];
  return candidates.some((value) => {
    if (value == null || value === '') return false;
    const got = moneyCents(typeof value === 'number' ? value : String(value));
    return got === cents;
  });
}

async function applyPaidOrder(db, event) {
  const data = event && event.data;
  const id = cleanOrderId(data && data.orderMerchantExternalId);
  if (!id) return 'missing';
  await ensureSchema(db);
  const order = await db
    .prepare(
      `SELECT id, user_id, pack_id, credits, amount_cents, currency, status
       FROM payment_orders WHERE id = ?`,
    )
    .bind(id)
    .first();
  if (!order) return 'missing';
  if (!paymentMatches(data, order)) return 'mismatch';
  if (order.status === 'paid') return 'ok';
  const person = await db.prepare(`SELECT user_id, email, name FROM users WHERE user_id = ?`).bind(order.user_id).first();
  if (!person) return 'missing';
  const pack = packById(order.pack_id);
  const labelEn = pack ? `${pack.label} credits` : 'Credits';
  const labelZh = pack ? `${pack.labelZh}积分` : '积分';
  await appendLedger(db, person, {
    id: `topup_${order.id}`,
    delta: Number(order.credits),
    kind: 'topup',
    label_en: labelEn,
    label_zh: labelZh,
    job_id: null,
  });
  const now = new Date().toISOString();
  const acquiring = data && typeof data.orderId === 'string' ? data.orderId.slice(0, 80) : '';
  await db
    .prepare(
      `UPDATE payment_orders
       SET status = 'paid', acquiring_order_id = COALESCE(?, acquiring_order_id), updated_at = ?
       WHERE id = ?`,
    )
    .bind(acquiring || null, now, id)
    .run();
  return 'ok';
}

export async function handlePancakeNotification({ db, env, rawBody, signature }) {
  const cfg = pancakeConfig(env);
  if (!cfg.environment) return { http: 503, body: 'failed' };
  if (typeof rawBody !== 'string' || !rawBody || typeof signature !== 'string' || !signature.trim()) {
    return { http: 401, body: 'Invalid signature' };
  }
  let event;
  try {
    event = verifyWebhook(rawBody, signature, {
      environment: cfg.environment,
      publicKeys: cfg.webhookPublicKey,
    });
  } catch {
    return { http: 401, body: 'Invalid signature' };
  }
  if (!cfg.available) return { http: 503, body: 'failed' };
  if (!event || event.mode !== cfg.environment || event.storeId !== cfg.storeId) {
    return { http: 200, body: 'OK' };
  }
  if (!event.eventType || event.eventType !== 'order.completed') {
    return { http: 200, body: 'OK' };
  }
  const applied = await applyPaidOrder(db, event);
  if (applied === 'mismatch') return { http: 200, body: 'OK' };
  return { http: 200, body: 'OK' };
}
