/**
 * Short-lived phone handoff for a signed-in Create draft.
 * The token in the link can upload one photo. Only the owner's session can read it.
 * Bytes stay in the private MEDIA bucket under handoff/.
 */

import qrcode from './qrcode.mjs';
import { ensureSchema, ensureUser, fail, newId } from './account-db.js';
import { assertReferenceImage } from './image-precheck.js';
import { getTemplate } from './templates.js';
import { deleteMedia, getMedia, mediaConfigured, putMedia, sniffImage } from './r2-media.js';

export const PHONE_TTL_SEC = 15 * 60;

function cleanToken(value) {
  if (typeof value !== 'string') return '';
  const token = value.trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(token)) return '';
  return token;
}

export function handoffObjectKey(userId, token, ext) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(userId)) throw fail('storage_error');
  if (!/^[a-f0-9]{32}$/.test(token)) throw fail('storage_error');
  if (ext !== 'jpg' && ext !== 'png' && ext !== 'webp') throw fail('bad_photo');
  return `handoff/${userId}/${token}.${ext}`;
}

function expired(row, nowMs = Date.now()) {
  const at = Date.parse(String(row && row.expires_at || ''));
  return !Number.isFinite(at) || at <= nowMs;
}

export async function createPhoneLink({ db, env, request, user, templateSlug, slot }) {
  if (!mediaConfigured(env)) throw fail('upload_unavailable');
  const template = getTemplate(templateSlug);
  if (!template || !template.referenceVideo) throw fail('bad_template');
  const index = Number(slot);
  if (!Number.isInteger(index) || index < 0 || index >= template.photoCount) throw fail('bad_photo');
  const row = await ensureUser(db, user);
  await ensureSchema(db);
  const token = newId('p').slice(2);
  const now = new Date();
  const expires = new Date(now.getTime() + PHONE_TTL_SEC * 1000).toISOString();
  await db
    .prepare(
      `INSERT INTO phone_uploads (
         token, user_id, template_slug, slot, status, content_type, byte_length, object_key, expires_at, created_at
       ) VALUES (?, ?, ?, ?, 'open', NULL, NULL, NULL, ?, ?)`,
    )
    .bind(token, row.user_id, template.slug, index, expires, now.toISOString())
    .run();
  const page = new URL(request.url);
  const url = `${page.origin}/phone/?t=${token}`;
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 2 });
  return { token, url, svg, expires_at: expires, slot: index };
}

async function loadOpen(db, token) {
  const id = cleanToken(token);
  if (!id) throw fail('not_found');
  await ensureSchema(db);
  const row = await db.prepare(`SELECT * FROM phone_uploads WHERE token = ?`).bind(id).first();
  if (!row) throw fail('not_found');
  if (expired(row)) throw fail('upload_expired');
  return row;
}

export async function savePhonePhoto({ db, env, token, bytes }) {
  if (!mediaConfigured(env)) throw fail('upload_unavailable');
  const row = await loadOpen(db, token);
  const checked = assertReferenceImage(bytes);
  const key = handoffObjectKey(row.user_id, row.token, checked.ext);
  const previous = row.object_key;
  await putMedia(env.MEDIA, key, bytes, {
    contentType: checked.contentType,
    customMetadata: {
      kind: 'handoff',
      user_id: row.user_id,
      expires_at: row.expires_at,
    },
  });
  await db
    .prepare(
      `UPDATE phone_uploads
       SET status = 'ready', content_type = ?, byte_length = ?, object_key = ?
       WHERE token = ?`,
    )
    .bind(checked.contentType, bytes.byteLength, key, row.token)
    .run();
  if (previous && previous !== key) {
    try {
      await deleteMedia(env.MEDIA, previous);
    } catch {
      /* the new object is the one the desktop reads */
    }
  }
  return { ok: true, status: 'ready' };
}

export async function readPhonePhoto({ db, env, user, token }) {
  const row = await loadOpen(db, token);
  const owner = await ensureUser(db, user);
  if (row.user_id !== owner.user_id) throw fail('forbidden');
  if (row.status !== 'ready' || !row.object_key) return { status: 'open', slot: Number(row.slot) };
  const obj = await getMedia(env.MEDIA, row.object_key);
  if (!obj) return { status: 'open', slot: Number(row.slot) };
  let bytes = null;
  if (typeof obj.arrayBuffer === 'function') bytes = new Uint8Array(await obj.arrayBuffer());
  else if (obj.body) bytes = new Uint8Array(await new Response(obj.body).arrayBuffer());
  const sniffed = sniffImage(bytes);
  if (!sniffed) throw fail('bad_photo');
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return {
    status: 'ready',
    slot: Number(row.slot),
    content_type: sniffed.contentType,
    photo: `data:${sniffed.contentType};base64,${btoa(bin)}`,
  };
}

export async function phoneStatus({ db, token }) {
  const row = await loadOpen(db, token);
  return { status: row.status === 'ready' ? 'ready' : 'open' };
}
