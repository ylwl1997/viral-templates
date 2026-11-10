/**
 * Waffo one-time checkout for credit packs.
 * Missing keys leave checkout unavailable. A webhook credits a pack only
 * after a signature-checked PAY_SUCCESS whose amount matches the stored order.
 * A browser return is not a payment.
 */

import { appendLedger, ensureSchema, ensureUser, fail, newId } from './account-db.js';
import { CREDIT_PACKS, formatCents, packById, publicPack } from './packs.js';

const text = new TextEncoder();

function pemBody(value) {
  return String(value || '')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
}

function decodeDer(value) {
  const body = pemBody(value);
  if (!body || body.length % 4 === 1) throw fail('checkout_unavailable');
  let bin;
  try {
    bin = atob(body);
  } catch {
    throw fail('checkout_unavailable');
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function concatBytes(parts) {
  const len = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function derWrap(tag, content) {
  const len = content.length;
  let header;
  if (len < 128) header = Uint8Array.of(tag, len);
  else if (len < 256) header = Uint8Array.of(tag, 0x81, len);
  else if (len < 65536) header = Uint8Array.of(tag, 0x82, (len >> 8) & 0xff, len & 0xff);
  else throw fail('checkout_unavailable');
  return concatBytes([header, content]);
}

const RSA_ALGO = Uint8Array.from([
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
]);

function pkcs1PrivateToPkcs8(pkcs1) {
  return derWrap(0x30, concatBytes([Uint8Array.of(0x02, 0x01, 0x00), RSA_ALGO, derWrap(0x04, pkcs1)]));
}

function pkcs1PublicToSpki(pkcs1) {
  const bit = derWrap(0x03, concatBytes([Uint8Array.of(0x00), pkcs1]));
  return derWrap(0x30, concatBytes([RSA_ALGO, bit]));
}

function keyMaterial(raw, role) {
  const source = String(raw || '').trim();
  if (!source) throw fail('checkout_unavailable');
  const der = decodeDer(source);
  if (/BEGIN RSA PRIVATE KEY/.test(source)) return pkcs1PrivateToPkcs8(der);
  if (/BEGIN RSA PUBLIC KEY/.test(source)) return pkcs1PublicToSpki(der);
  if (role === 'private' && der[0] !== 0x30) return pkcs1PrivateToPkcs8(der);
  return der;
}

async function importPrivate(raw) {
  return crypto.subtle.importKey(
    'pkcs8',
    keyMaterial(raw, 'private'),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function importPublic(raw) {
  return crypto.subtle.importKey('spki', keyMaterial(raw, 'public'), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
    'verify',
  ]);
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const bin = atob(value.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export async function signBody(privateKey, body) {
  const key = await importPrivate(privateKey);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, text.encode(body));
  return bytesToBase64(new Uint8Array(sig));
}

export async function verifyBody(publicKey, body, signature) {
  const bytes = base64ToBytes(signature);
  if (!bytes) return false;
  try {
    const key = await importPublic(publicKey);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes, text.encode(String(body)));
  } catch {
    return false;
  }
}

export function waffoConfig(env) {
  const source = env || {};
  const apiKey = String(source.WAFFO_API_KEY || '').trim();
  const merchantId = String(source.WAFFO_MERCHANT_ID || '').trim();
  const privateKey = String(source.WAFFO_PRIVATE_KEY || '').trim();
  const publicKey = String(source.WAFFO_PUBLIC_KEY || '').trim();
  const base = String(source.WAFFO_API_BASE || 'https://api-sandbox.waffo.com').replace(/\/$/, '');
  const currency = String(source.WAFFO_CURRENCY || 'USD').trim().toUpperCase() || 'USD';
  let baseOk = false;
  try {
    const url = new URL(base);
    baseOk = url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    baseOk = false;
  }
  const available =
    baseOk &&
    apiKey.length >= 8 &&
    merchantId.length >= 2 &&
    merchantId.length <= 64 &&
    privateKey.length >= 40 &&
    publicKey.length >= 40 &&
    /^[A-Z]{3}$/.test(currency);
  return { available, apiKey, merchantId, privateKey, publicKey, base, currency };
}

export function checkoutStatus(env, options = {}) {
  const cfg = waffoConfig(env);
  const body = {
    ok: true,
    available: cfg.available,
    packs: CREDIT_PACKS.map((pack) => publicPack(pack, cfg.available)),
  };
  if (cfg.available) body.currency = cfg.currency;
  if (options.debug && !cfg.available) {
    body.debug = {
      provider: 'waffo',
      missing: [
        cfg.apiKey.length >= 8 ? null : 'WAFFO_API_KEY',
        cfg.merchantId.length >= 2 ? null : 'WAFFO_MERCHANT_ID',
        cfg.privateKey.length >= 40 ? null : 'WAFFO_PRIVATE_KEY',
        cfg.publicKey.length >= 40 ? null : 'WAFFO_PUBLIC_KEY',
      ].filter(Boolean),
    };
  }
  return body;
}

function moneyCents(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value !== 'string') return null;
  const textValue = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(textValue)) return null;
  const [whole, frac = ''] = textValue.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

function redirectFrom(payload) {
  const data = (payload && (payload.data || payload.result)) || payload || {};
  let action = data.orderAction || data.webUrl || data.redirectUrl || null;
  if (typeof action === 'string') {
    const trimmed = action.trim();
    if (/^https:\/\//i.test(trimmed)) return trimmed;
    try {
      action = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!action || typeof action !== 'object') return null;
  const url = action.webUrl || action.url || action.redirectUrl || action.paymentUrl;
  if (typeof url !== 'string' || !/^https:\/\//i.test(url.trim())) return null;
  return url.trim();
}

function cleanOrderId(value) {
  if (typeof value !== 'string') return '';
  const textValue = value.trim();
  if (!/^pay_[a-f0-9]{32}$/.test(textValue)) return '';
  return textValue;
}

export async function createCheckout({ db, env, user, packId, origin, fetchImpl = fetch }) {
  const cfg = waffoConfig(env);
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
  const row = await ensureUser(db, user);
  await ensureSchema(db);
  const id = `pay_${newId('x').slice(2)}`;
  const paymentRequestId = id.slice(4);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO payment_orders (
         id, user_id, pack_id, credits, amount_cents, currency, status,
         payment_request_id, acquiring_order_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?)`,
    )
    .bind(id, row.user_id, pack.id, pack.credits, pack.cents, cfg.currency, paymentRequestId, now, now)
    .run();
  const returnBase = `${page.origin}/account/credits/`;
  const body = {
    paymentRequestId,
    merchantOrderId: id,
    orderCurrency: cfg.currency,
    orderAmount: formatCents(pack.cents),
    orderDescription: `${pack.credits} credits`,
    orderRequestedAt: now,
    notifyUrl: `${page.origin}/api/payments/waffo/webhook`,
    successRedirectUrl: `${returnBase}?checkout=return`,
    failedRedirectUrl: `${returnBase}?checkout=cancel`,
    cancelRedirectUrl: `${returnBase}?checkout=cancel`,
    merchantInfo: { merchantId: cfg.merchantId },
    userInfo: {
      userId: row.user_id,
      userEmail: row.email || 'buyer@example.com',
      userTerminal: 'WEB',
    },
    paymentInfo: { productName: 'ONE_TIME_PAYMENT' },
    goodsInfo: {
      goodsName: `${pack.label} credits`,
      goodsUrl: page.origin,
    },
  };
  const raw = JSON.stringify(body);
  let signature;
  try {
    signature = await signBody(cfg.privateKey, raw);
  } catch {
    await closeOrder(db, id);
    throw fail('checkout_unavailable');
  }
  let response;
  try {
    response = await fetchImpl(`${cfg.base}/api/v1/order/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-API-KEY': cfg.apiKey,
        'X-SIGNATURE': signature,
        'X-API-VERSION': '1.0.0',
      },
      body: raw,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    await closeOrder(db, id);
    throw fail('checkout_failed');
  }
  const responseText = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(responseText);
  } catch {
    payload = null;
  }
  const url = redirectFrom(payload);
  if (!response.ok || !url) {
    await closeOrder(db, id);
    throw fail('checkout_failed');
  }
  const data = (payload && (payload.data || payload.result)) || {};
  const acquiring = typeof data.acquiringOrderId === 'string' ? data.acquiringOrderId.slice(0, 80) : '';
  await db
    .prepare(`UPDATE payment_orders SET acquiring_order_id = ?, updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(acquiring || null, new Date().toISOString(), id)
    .run();
  return { ok: true, url, order_id: id };
}

async function closeOrder(db, id) {
  await db
    .prepare(`UPDATE payment_orders SET status = 'closed', updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(new Date().toISOString(), id)
    .run();
}

async function applyPaidOrder(db, result) {
  const id = cleanOrderId(result && result.merchantOrderId);
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
  const cents = moneyCents(result.orderAmount);
  const currency = typeof result.orderCurrency === 'string' ? result.orderCurrency.trim().toUpperCase() : '';
  if (cents == null || cents !== Number(order.amount_cents) || currency !== String(order.currency)) return 'mismatch';
  if (order.status === 'paid') return 'ok';
  const person = await db
    .prepare(`SELECT user_id, email, name FROM users WHERE user_id = ?`)
    .bind(order.user_id)
    .first();
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
  const acquiring = typeof result.acquiringOrderId === 'string' ? result.acquiringOrderId.slice(0, 80) : '';
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

export async function handleWaffoNotification({ db, env, rawBody, signature }) {
  const cfg = waffoConfig(env);
  if (!cfg.available) return { http: 503, body: { message: 'failed' } };
  if (typeof rawBody !== 'string' || !rawBody) return { http: 200, body: { message: 'failed' } };
  const valid = await verifyBody(cfg.publicKey, rawBody, signature);
  if (!valid) return { http: 200, body: { message: 'failed' } };
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { http: 200, body: { message: 'failed' } };
  }
  if (!payload || payload.eventType !== 'PAYMENT_NOTIFICATION' || !payload.result) {
    return { http: 200, body: { message: 'success' } };
  }
  const result = payload.result;
  const status = result.orderStatus;
  if (status === 'ORDER_CLOSE') {
    const id = cleanOrderId(result.merchantOrderId);
    if (id) await closeOrder(db, id);
    return { http: 200, body: { message: 'success' } };
  }
  if (status !== 'PAY_SUCCESS') return { http: 200, body: { message: 'success' } };
  const applied = await applyPaidOrder(db, result);
  if (applied === 'missing') return { http: 200, body: { message: 'unknown' } };
  if (applied === 'mismatch') return { http: 200, body: { message: 'failed' } };
  return { http: 200, body: { message: 'success' } };
}
